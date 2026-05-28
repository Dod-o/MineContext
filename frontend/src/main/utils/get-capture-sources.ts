// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { app, desktopCapturer, DesktopCapturerSource, systemPreferences } from 'electron'
import screenshot from 'screenshot-desktop'
import { exec, execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { getLogger } from '@shared/logger/main'
import { FinalWindowInfo, getAllWindows } from './mac-window-manager'
import { NativeCaptureHelper } from './native-capture-helper'
import path from 'node:path'
const logger = getLogger('ScreenshotService')

interface WindowBounds {
  X: number
  Y: number
  Width: number
  Height: number
}

interface NativeWindowInfo extends FinalWindowInfo {
  processId?: number
  isMinimized?: boolean
  area?: number
}

interface VirtualWindowIdentity {
  windowId?: number
  appName: string
  windowTitle?: string
}

const WINDOWS_SYSTEM_APPS = new Set([
  'dwm',
  'electron',
  'minecontext',
  'searchhost',
  'shellexperiencehost',
  'startmenuexperiencehost',
  'tabtip',
  'textinputhost',
  'widgets'
])

const WINDOWS_SYSTEM_WINDOW_TITLES = new Set([
  'popuphost',
  'program manager',
  'shell handwriting canvas',
  'task switching',
  'windows input experience'
])

const WINDOWS_WINDOW_ENUM_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class MineContextWindowLister {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@

$windows = New-Object System.Collections.Generic.List[object]
$callback = [MineContextWindowLister+EnumWindowsProc] {
  param([IntPtr]$hwnd, [IntPtr]$lparam)

  $length = [MineContextWindowLister]::GetWindowTextLength($hwnd)
  if ($length -le 0) { return $true }

  $builder = New-Object System.Text.StringBuilder ($length + 1)
  [void][MineContextWindowLister]::GetWindowText($hwnd, $builder, $builder.Capacity)
  $title = $builder.ToString().Trim()
  if ([string]::IsNullOrWhiteSpace($title)) { return $true }

  $rect = New-Object MineContextWindowLister+RECT
  [void][MineContextWindowLister]::GetWindowRect($hwnd, [ref]$rect)
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -lt 50 -or $height -lt 50) { return $true }

  $windowProcessId = [UInt32]0
  [void][MineContextWindowLister]::GetWindowThreadProcessId($hwnd, [ref]$windowProcessId)
  $processName = ''
  try {
    $processName = (Get-Process -Id $windowProcessId -ErrorAction Stop).ProcessName
  } catch {}

  $windows.Add([pscustomobject]@{
    windowId = $hwnd.ToInt64()
    processId = [int64]$windowProcessId
    appName = $processName
    windowTitle = $title
    isOnScreen = ([MineContextWindowLister]::IsWindowVisible($hwnd) -and -not [MineContextWindowLister]::IsIconic($hwnd))
    isMinimized = [MineContextWindowLister]::IsIconic($hwnd)
    bounds = @{
      X = $rect.Left
      Y = $rect.Top
      Width = $width
      Height = $height
    }
    area = $width * $height
  }) | Out-Null

  return $true
}

[void][MineContextWindowLister]::EnumWindows($callback, [IntPtr]::Zero)
$windows | ConvertTo-Json -Depth 5 -Compress
`

const execFileAsync = promisify(execFile)

function createVirtualWindowId(windowId: number | undefined, appName: string, windowTitle?: string) {
  const stableWindowId = windowId || 0
  return `virtual-window:${stableWindowId}:${encodeURIComponent(appName)}:${encodeURIComponent(windowTitle || '')}`
}

function parseVirtualWindowId(sourceId: string): VirtualWindowIdentity | null {
  const currentMatch = sourceId.match(/^virtual-window:(\d+):([^:]*):?(.*)$/)
  if (currentMatch) {
    return {
      windowId: Number(currentMatch[1]),
      appName: decodeURIComponent(currentMatch[2] || ''),
      windowTitle: currentMatch[3] ? decodeURIComponent(currentMatch[3]) : undefined
    }
  }

  const legacyMatch = sourceId.match(/^virtual-window:(\d+)-(.+)$/)
  if (legacyMatch) {
    return {
      windowId: Number(legacyMatch[1]),
      appName: decodeURIComponent(legacyMatch[2] || '')
    }
  }

  return null
}

function normalizeCaptureText(value?: string | null) {
  return (value || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim()
}

function findMatchingDesktopWindowSource<T extends { name: string }>(
  sources: T[],
  appName?: string,
  windowTitle?: string
): T | undefined {
  const app = normalizeCaptureText(appName)
  const title = normalizeCaptureText(windowTitle)

  if (title) {
    const byTitle = sources.find((source) => {
      const sourceName = normalizeCaptureText(source.name)
      return sourceName === title || sourceName.includes(title) || title.includes(sourceName)
    })
    if (byTitle) {
      return byTitle
    }
  }

  if (!app) {
    return undefined
  }

  return sources.find((source) => normalizeCaptureText(source.name).includes(app))
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function createWindowPlaceholder(appName: string, detail: string, stateLabel: string) {
  const svg = `
    <svg width="256" height="144" xmlns="http://www.w3.org/2000/svg">
      <rect width="256" height="144" fill="#3f4652"/>
      <text x="128" y="62" font-family="Arial, sans-serif" font-size="16" text-anchor="middle" fill="white">${escapeSvgText(appName)}</text>
      <text x="128" y="86" font-family="Arial, sans-serif" font-size="11" text-anchor="middle" fill="#d9dde5">${escapeSvgText(detail)}</text>
      <text x="128" y="108" font-family="Arial, sans-serif" font-size="10" text-anchor="middle" fill="#aeb6c4">${escapeSvgText(stateLabel)}</text>
    </svg>
  `
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

async function getWindowsWithRealIds(): Promise<NativeWindowInfo[]> {
  if (process.platform !== 'win32') {
    return []
  }

  try {
    const powershellPath = process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe'
    const { stdout } = await execFileAsync(
      powershellPath,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_WINDOW_ENUM_SCRIPT],
      {
        timeout: 5000,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    )
    const output = String(stdout || '').trim()
    if (!output) {
      return []
    }

    const parsed = JSON.parse(output)
    const windows = Array.isArray(parsed) ? parsed : [parsed]

    return windows
      .map((window: any): NativeWindowInfo => {
        const appName = String(window.appName || '').trim()
        const windowTitle = String(window.windowTitle || '').trim()
        const bounds = window.bounds as WindowBounds | undefined
        return {
          windowId: Number(window.windowId),
          appName,
          windowTitle,
          isOnScreen: Boolean(window.isOnScreen),
          isImportantApp: false,
          processId: Number(window.processId) || undefined,
          isMinimized: Boolean(window.isMinimized),
          bounds,
          area: Number(window.area) || (bounds ? bounds.Width * bounds.Height : 0)
        }
      })
      .filter((window) => {
        if (!window.windowId || !window.windowTitle) {
          return false
        }

        const appName = normalizeCaptureText(window.appName)
        if (WINDOWS_SYSTEM_APPS.has(appName)) {
          return false
        }

        const windowTitle = normalizeCaptureText(window.windowTitle)
        return !WINDOWS_SYSTEM_WINDOW_TITLES.has(windowTitle)
      })
      .sort((a, b) => a.appName.localeCompare(b.appName) || a.windowTitle.localeCompare(b.windowTitle))
  } catch (error: any) {
    logger.warn(`Windows window enumeration failed: ${error.message}`)
    return []
  }
}

/**
 * @interface CaptureSource
 * @description The final, unified structure for a capture source sent to the frontend.
 */
export interface CaptureSource {
  id: string
  name: string
  type: 'screen' | 'window'
  thumbnail: string | null
  appIcon: string | null
  isVisible: boolean
  // Optional properties for windows added from the native module
  isVirtual?: boolean
  appName?: string
  windowTitle?: string
  windowId?: number
}

class CaptureSourcesTools {
  private nativeCaptureHelper: NativeCaptureHelper | null = null
  constructor() {
    if (process.platform === 'darwin') {
      try {
        this.nativeCaptureHelper = new NativeCaptureHelper()
        this.nativeCaptureHelper.initialize()
        logger.info('✅ Native capture helper initialized')
      } catch (error: any) {
        logger.warn(`⚠️ Native capture helper failed to initialize: ${error.message}`)
        this.nativeCaptureHelper = null // Clear the helper so fallback logic works
      }
    }
  }

  async getCaptureSourcesTools() {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 256, height: 144 },
        fetchWindowIcons: true
      })

      const formattedSources: CaptureSource[] = sources.map((source) => {
        let displayName = source.name

        return {
          id: source.id,
          name: displayName,
          type: source.display_id ? 'screen' : 'window',
          thumbnail: source.thumbnail.toDataURL(),
          appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
          isVisible: true // desktopCapturer only returns visible windows
        }
      })

      if (process.platform === 'win32') {
        const windows = await getWindowsWithRealIds()

        if (windows.length > 0) {
          const screenSources = formattedSources.filter((source) => source.type === 'screen')
          const desktopWindowSources = formattedSources.filter((source) => source.type === 'window')
          const matchedDesktopSourceIds = new Set<string>()

          const virtualWindowSources = windows.map((window) => {
            const matchingDesktopSource = findMatchingDesktopWindowSource(
              desktopWindowSources.filter((source) => !matchedDesktopSourceIds.has(source.id)),
              window.appName,
              window.windowTitle
            )

            if (matchingDesktopSource) {
              matchedDesktopSourceIds.add(matchingDesktopSource.id)
            }

            const isVisible = Boolean(matchingDesktopSource) && window.isOnScreen
            return {
              id: createVirtualWindowId(window.windowId, window.appName || 'Window', window.windowTitle),
              name: window.appName ? `${window.appName} - ${window.windowTitle}` : window.windowTitle,
              type: 'window',
              thumbnail:
                matchingDesktopSource?.thumbnail ||
                createWindowPlaceholder(window.appName || 'Window', window.windowTitle, isVisible ? 'Visible' : 'Hidden'),
              appIcon: matchingDesktopSource?.appIcon || null,
              isVisible,
              isVirtual: true,
              appName: window.appName,
              windowTitle: window.windowTitle,
              windowId: window.windowId
            } as CaptureSource
          })

          const unmatchedDesktopWindowSources = desktopWindowSources.filter(
            (source) => !matchedDesktopSourceIds.has(source.id)
          )

          return {
            success: true,
            sources: [...screenSources, ...virtualWindowSources, ...unmatchedDesktopWindowSources]
          }
        }
      }

      if (process.platform === 'darwin') {
        try {
          let allWindows: FinalWindowInfo[] = []

          logger.info('Using macWindowManager for cross-space window detection')
          allWindows = await getAllWindows()

          const windowsByApp = new Map()

          const realAppNames = new Map()

          for (const macWindow of allWindows) {
            const macTitle = macWindow.windowTitle.toLowerCase()
            const macApp = macWindow.appName

            const matchingDesktopSource = formattedSources.find((source) => {
              if (source.type === 'screen') return false
              const sourceTitle = source.name.toLowerCase()

              if (sourceTitle === macTitle) return true

              if (macApp === 'Cursor' && sourceTitle.includes('—') && macTitle.includes('—')) {
                return sourceTitle === macTitle
              }

              if (sourceTitle.includes(macTitle) || macTitle.includes(sourceTitle)) {
                return true
              }

              return false
            })

            if (matchingDesktopSource) {
              realAppNames.set(matchingDesktopSource.name, macApp)
              logger.info(`🔗 Matched: "${matchingDesktopSource.name}" -> App: ${macApp}`)
            }
          }

          // Second pass: add all desktopCapturer windows to the map with correct app names
          formattedSources
            .filter((s) => s.type === 'window')
            .forEach((source) => {
              // Use real app name if available, otherwise fall back to parsing window title
              const realApp = realAppNames.get(source.name)
              let appName = realApp || source.name.split(' - ')[0]

              // Apply Cursor-specific formatting if we know it's actually Cursor
              let displayName = source.name
              if (realApp === 'Cursor') {
                if (source.name.includes(' — ')) {
                  const parts = source.name.split(' — ')
                  if (parts.length >= 2) {
                    const lastPart = parts[parts.length - 1]
                    if (!lastPart.includes('.') && lastPart.length < 30) {
                      displayName = `Cursor - ${lastPart}`
                    }
                  }
                }
              }

              if (!windowsByApp.has(appName)) {
                windowsByApp.set(appName, [])
              }
              windowsByApp.get(appName).push({
                ...source,
                name: displayName, // Use the corrected display name
                appName: appName, // Store the real app name
                fromDesktopCapturer: true
              })
            })

          // Process windows from native API
          for (const window of allWindows) {
            const appName = window.appName

            // Skip Electron's own windows
            if (appName === 'MineContext' || appName === 'Electron') continue

            // Check if we already have windows from this app
            const existingWindows = windowsByApp.get(appName) || []

            // For important apps, always include minimized windows
            const importantApps = [
              'Zoom',
              'zoom.us',
              'Slack',
              'Microsoft Teams',
              'MSTeams',
              'Teams',
              'Discord',
              'Skype',
              'Microsoft PowerPoint',
              'PowerPoint',
              'Keynote',
              'Presentation',
              'Notion',
              'Obsidian',
              'Roam Research',
              'Logseq',
              'Visual Studio Code',
              'Code',
              'Xcode',
              'IntelliJ IDEA',
              'PyCharm',
              'Google Chrome',
              'Safari',
              'Firefox',
              'Microsoft Edge',
              'Figma',
              'Sketch',
              'Adobe Photoshop',
              'Adobe Illustrator',
              'Finder',
              'System Preferences',
              'Activity Monitor'
            ]
            const isImportantApp = window.isImportantApp || importantApps.includes(appName)

            // Check if this specific window already exists
            const windowExists = existingWindows.some((existing) => {
              const existingTitle = existing.name.toLowerCase()
              const currentTitle = `${appName} - ${window.windowTitle}`.toLowerCase()
              return existingTitle === currentTitle
            })

            // Add the window if it doesn't exist or if it's an important app that might be minimized
            if (!windowExists || (isImportantApp && !window.isOnScreen)) {
              // Debug logging for Teams
              if (window.appName.includes('Teams')) {
                logger.info(
                  `🔍 Teams window detection: ${window.appName} - ${window.windowTitle}, isOnScreen: ${window.isOnScreen}, windowExists: ${windowExists}, isImportantApp: ${isImportantApp}`
                )
              }

              // Check if this window was already found by desktopCapturer (meaning it's visible)
              const foundByDesktopCapturer = formattedSources.some((source) => {
                const sourceName = source.name.toLowerCase()
                const windowName = window.appName.toLowerCase()
                return sourceName.includes(windowName) || sourceName.includes('teams')
              })

              // Create a virtual source for this window
              const virtualSource = {
                id: `virtual-window:${window.windowId || Date.now()}-${encodeURIComponent(window.appName)}`,
                name: `${window.appName} - ${window.windowTitle}`,
                type: 'window',
                thumbnail: null, // Will be captured when selected
                appIcon: null,
                isVisible: foundByDesktopCapturer || window.isOnScreen || false,
                isVirtual: true,
                appName: window.appName,
                windowTitle: window.windowTitle,
                windowId: window.windowId
              } as CaptureSource

              // Try to get a real thumbnail using desktopCapturer
              try {
                const electronSources = await desktopCapturer.getSources({
                  types: ['window'],
                  thumbnailSize: { width: 512, height: 288 },
                  fetchWindowIcons: true
                })

                // Try multiple matching strategies to find the window
                let matchingSource: DesktopCapturerSource | undefined = undefined

                // Strategy 1: Exact app name match
                matchingSource = electronSources.find((source) =>
                  source.name.toLowerCase().includes(window.appName.toLowerCase())
                )

                // Strategy 2: Partial match
                if (!matchingSource) {
                  matchingSource = electronSources.find(
                    (source) =>
                      window.appName.toLowerCase().includes(source.name.toLowerCase().split(' ')[0]) ||
                      source.name.toLowerCase().split(' ')[0].includes(window.appName.toLowerCase())
                  )
                }

                // Strategy 3: For specific known apps, try common variations
                if (!matchingSource && window.appName.includes('zoom')) {
                  matchingSource = electronSources.find((source) => source.name.toLowerCase().includes('zoom'))
                }

                if (matchingSource && matchingSource.thumbnail) {
                  virtualSource.thumbnail = matchingSource.thumbnail.toDataURL()
                  virtualSource.appIcon = matchingSource.appIcon ? matchingSource.appIcon.toDataURL() : null
                  logger.info(`Successfully got thumbnail from desktopCapturer for ${window.appName}`)
                } else {
                  logger.info(`No matching desktopCapturer source for ${window.appName}`)
                }
              } catch (captureError: any) {
                logger.error(`desktopCapturer failed for ${window.appName}: ${captureError.message}`)
              }

              if (!virtualSource.thumbnail) {
                // Choose color and icon based on app name
                let bgColor = '#4a4a4a'
                let appIcon = '📱'

                if (window.appName.toLowerCase().includes('zoom')) {
                  bgColor = '#2D8CFF'
                  appIcon = '📹'
                } else if (window.appName.toLowerCase().includes('powerpoint')) {
                  bgColor = '#D24726'
                  appIcon = '📊'
                } else if (window.appName.toLowerCase().includes('notion')) {
                  bgColor = '#000000'
                  appIcon = '📝'
                } else if (window.appName.toLowerCase().includes('slack')) {
                  bgColor = '#4A154B'
                  appIcon = '💬'
                } else if (window.appName.toLowerCase().includes('teams')) {
                  bgColor = '#6264A7'
                  appIcon = '👥'
                } else if (window.appName.toLowerCase().includes('chrome')) {
                  bgColor = '#4285F4'
                  appIcon = '🌐'
                } else if (window.appName.toLowerCase().includes('word')) {
                  bgColor = '#2B579A'
                  appIcon = '📄'
                } else if (window.appName.toLowerCase().includes('excel')) {
                  bgColor = '#217346'
                  appIcon = '📊'
                } else if (window.appName.toLowerCase().includes('wechat')) {
                  bgColor = '#07C160'
                  appIcon = '💬'
                }

                // Create SVG placeholder
                const svg = `
                <svg width="256" height="144" xmlns="http://www.w3.org/2000/svg">
                  <rect width="256" height="144" fill="${bgColor}"/>
                  <text x="128" y="60" font-family="Arial, sans-serif" font-size="32" text-anchor="middle" fill="white">${appIcon}</text>
                  <text x="128" y="85" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="white">${window.appName}</text>
                  <text x="128" y="100" font-family="Arial, sans-serif" font-size="10" text-anchor="middle" fill="#cccccc">Hidden</text>
                </svg>
              `

                virtualSource.thumbnail = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
              }

              formattedSources.push(virtualSource)
            }
          }
        } catch (macError: any) {
          logger.error('Error getting additional windows from macOS:', macError)
          // Continue with just the desktopCapturer sources
        }
      }

      return {
        success: true,
        sources: formattedSources
      }
    } catch (error: any) {
      logger.error('Failed to get capture sources:', error)
      return {
        success: false,
        error: error.message,
        sources: [] as CaptureSource[]
      }
    }
  }
  async takeSourceScreenshotTools(sourceId: string) {
    try {
      // Check permissions on macOS
      if (process.platform === 'darwin') {
        const hasScreenPermission = systemPreferences.getMediaAccessStatus('screen')
        if (hasScreenPermission !== 'granted') {
          const permissionGranted = await systemPreferences.askForMediaAccess('camera')
          if (!permissionGranted) {
            throw new Error(
              'Screen recording permission not granted. Please grant screen recording permissions in System Preferences > Security & Privacy > Screen Recording and restart the application.'
            )
          }
        }
      }

      // Handle virtual windows (minimized or on other spaces)
      if (sourceId.startsWith('virtual-window:')) {
        const virtualWindow = parseVirtualWindowId(sourceId)
        const appName = virtualWindow?.appName || null
        const windowTitle = virtualWindow?.windowTitle

        // Declare matchingSource in the correct scope
        let matchingSource: DesktopCapturerSource | undefined = undefined

        // First, quickly check if the app might be visible on current desktop
        const quickSources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 256, height: 144 }, // Small size for quick check
          fetchWindowIcons: false
        })

        // Quick check if app is likely on current desktop
        const quickMatch = findMatchingDesktopWindowSource(quickSources, appName || undefined, windowTitle)

        if (quickMatch) {
          // Disabled to reduce log spam during frequent captures
          // safeLog.log(`✅ ${appName} found on current desktop, getting high-quality thumbnail`);

          // Get high-quality capture since we know it's visible
          try {
            const sources = await desktopCapturer.getSources({
              types: ['window'],
              thumbnailSize: { width: 1920, height: 1080 },
              fetchWindowIcons: true
            })

            // Find the matching source again with better quality
            matchingSource = sources.find((s) => s.id === quickMatch.id)

            if (matchingSource) {
              return {
                success: true,
                source: matchingSource
              }
            }
          } catch (highQualityError: any) {
            logger.error(`Failed to get high-quality capture: ${highQualityError.message}`)
          }
        } else {
          // App not on current desktop
        }

        if (process.platform !== 'darwin') {
          return {
            success: false,
            error: `Window is not currently capturable: ${[appName, windowTitle].filter(Boolean).join(' - ') || sourceId}`
          }
        }

        // Check variable state

        // Try Python-free native capture helper for screen capture
        if (this.nativeCaptureHelper && this.nativeCaptureHelper.isRunning && appName) {
          logger.info(`Attempting Python-free screen capture for ${appName}`)
          try {
            const captureResult = await this.nativeCaptureHelper.captureScreen(0)
            logger.log(`[Python Capture] captureResult: ${captureResult.success}, data: ${captureResult.data?.length}`)
            logger.log(Buffer.from(captureResult.data as any, 'binary'))
            if (captureResult.success && captureResult.data) {
              return {
                success: true,
                source: {
                  id: `python-free-screen-capture:${appName}`,
                  name: `${appName} (Screen Capture - Python Free)`,
                  thumbnail: {
                    toPNG: () => captureResult.data,
                    isEmpty: () => false
                  }
                },
                sourceName: `${appName} (Screen Capture - Python Free)`,
                captureMethod: 'python_free_screen'
              }
            } else {
              logger.error(`❌ Python-free screen capture failed for ${appName}: ${captureResult.error}`)
            }
          } catch (nativeError: any) {
            const message = nativeError instanceof Error ? nativeError.message : 'An unknown error occurred.'
            logger.error(`❌ Python-free capture error for ${appName}: ${message}`)
          }
        }

        // Fallback: Try advanced macOS capture methods for cross-desktop window capture
        if (appName && process.platform === 'darwin') {
          try {
            const allWindows = await getAllWindows()
            const targetWindow = allWindows.find(
              (w) =>
                w.appName.toLowerCase() === appName.toLowerCase() ||
                w.appName.toLowerCase().includes(appName.toLowerCase()) ||
                appName.toLowerCase().includes(w.appName.toLowerCase())
            )

            if (targetWindow && targetWindow.windowId) {
              logger.log(`[Python Capture] Capturing window ${targetWindow.windowId} for app ${appName}`)
              try {
                const captureResult = await new Promise(async (resolve, reject) => {
                  const basePath = app.isPackaged
                    ? path.join(process.resourcesPath, 'bin', 'window_capture')
                    : path.join(__dirname, '../..', 'externals/python/window_capture/dist', 'window_capture')
                  const exePath = path.join(basePath, 'window_capture')
                  const py = spawn(exePath, [
                    JSON.stringify({
                      appName: 'Notion',
                      windowId: 67890
                    })
                  ])

                  let output = ''
                  let error = ''

                  py.stdout.on('data', (data) => (output += data.toString()))
                  py.stderr.on('data', (data) => (error += data.toString()))

                  py.on('close', (code) => {
                    if (code === 0 && output.trim() && !output.startsWith('ERROR:')) {
                      try {
                        const base64Data = output.trim()
                        logger.log(`[Python Capture] Raw base64 data length: ${base64Data}`)
                        const imageBuffer = Buffer.from(base64Data, 'binary')
                        resolve(imageBuffer)
                      } catch (parseError: any) {
                        reject(new Error(`Failed to parse image data: ${parseError.message}`))
                      }
                    } else {
                      reject(new Error(`Python capture failed: ${error || output}`))
                    }
                  })

                  py.on('error', reject)
                })

                if (captureResult && (captureResult as Buffer).length > 1000) {
                  return {
                    success: true,
                    source: { thumbnail: { captureResult, toPNG: () => captureResult, isEmpty: () => false } },
                    sourceName: appName,
                    isCGWindowCapture: true
                  }
                }
              } catch (cgWindowError: any) {
                logger.error(`❌ Python fallback capture failed for ${appName}: ${cgWindowError.message}`)
              }
            }
          } catch (outerError: any) {
            logger.error(`❌ Cross-desktop capture failed for ${appName}: ${outerError.message}`)
          }
        }

        // Fallback: Create a more informative placeholder image for failed capture
        logger.info(`Creating placeholder for virtual window: ${appName}`)

        // Convert SVG to PNG using a minimal PNG fallback for now
        const minimalPng = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'binary'
        )

        return {
          success: true,
          source: { thumbnail: { minimalPng, toPNG: () => minimalPng, isEmpty: () => false } },
          sourceName: appName || 'Virtual Window',
          isPlaceholder: true,
          placeholderReason: 'Window not accessible - may be minimized or on another desktop'
        }
      } else if (sourceId.startsWith('window:')) {
        const sources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 1920, height: 1080 },
          fetchWindowIcons: true
        })

        const source = sources.find((s) => s.id === sourceId)
        if (!source) {
          throw new Error(`Window with ID ${sourceId} not found`)
        }

        return {
          success: true,
          source,
          sourceName: source.name
        }
      } else {
        // For screens, use the regular approach
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1920, height: 1080 }
        })

        const source = sources.find((s) => s.id === sourceId)
        if (!source) {
          throw new Error(`Screen with ID ${sourceId} not found`)
        }

        return {
          success: true,
          source,
          sourceName: source.name
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  }
  async listDisplays() {
    try {
      const displays = await screenshot.listDisplays()
      return {
        success: true,
        displays: displays.map((display, index) => ({
          id: display.id,
          index: index,
          name: display.name || `Display ${index + 1}`,
          bounds: display.bounds
        }))
      }
    } catch (error: any) {
      logger.error('Failed to list displays:', error)
      return {
        success: false,
        error: error.message,
        displays: []
      }
    }
  }
  async takeScreenshotOfDisplay(displayId = 0) {
    try {
      const displays = await screenshot.listDisplays()
      if (displayId >= displays.length) {
        throw new Error(`Display ${displayId} not found. Available displays: ${displays.length}`)
      }

      const imgBuffer = await screenshot({ screen: displays[displayId].id })

      return {
        success: true,
        source: imgBuffer,
        size: imgBuffer.length,
        displayId: displayId
      }
    } catch (error: any) {
      logger.error('Failed to take screenshot of display:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }
  async takeScreenshotTools() {
    try {
      // Try to take screenshot with better error handling
      try {
        const imgBuffer = await screenshot()
        return {
          success: true,
          source: imgBuffer,
          size: imgBuffer.length
        }
      } catch (screenshotError: any) {
        logger.error('Screenshot capture failed:', screenshotError)
        return {
          success: false,
          error: screenshotError.message
        }
      }
    } catch (error: any) {
      logger.error('Failed to take screenshot:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }
  async getVisibleSourcesTools(sourceIds?: string[]) {
    try {
      if (sourceIds && sourceIds.length > 0) {
        logger.info('Checking active/focused apps for source IDs:', sourceIds)

        // Enhanced multi-space/multi-screen visibility detection
        let activeAppsOnAllSpaces: string[] = []
        if (process.platform === 'darwin') {
          try {
            const execAsync = promisify(exec)

            // Get apps that have visible windows on ANY space (not just current)
            const { stdout: visibleAppsStdout } = await execAsync(`osascript -e '
            tell application "System Events"
              set visibleApps to {}
              repeat with p in (every application process)
                try
                  -- Check if app has any windows
                  if (count of windows of p) > 0 then
                    set end of visibleApps to (name of p as string)
                  end if
                end try
              end repeat
              return my list_to_string(visibleApps, ",")
            end tell
            
            on list_to_string(lst, delim)
              set AppleScript's text item delimiters to delim
              set str to lst as string
              set AppleScript's text item delimiters to ""
              return str
            end list_to_string
          '`)

            if (visibleAppsStdout && visibleAppsStdout.trim()) {
              activeAppsOnAllSpaces = visibleAppsStdout
                .trim()
                .toLowerCase()
                .split(',')
                .map((app) => app.trim())
              logger.info(`Apps with windows on all spaces: [${activeAppsOnAllSpaces.join(', ')}]`)
            }

            // Also get the frontmost app on current space for additional context
            const { stdout: frontmostStdout } = await execAsync(
              `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`
            )
            const frontmostApp = frontmostStdout.trim().toLowerCase()
            logger.info(`Frontmost app on current space: "${frontmostApp}"`)
          } catch (error: any) {
            logger.error('Could not get apps with windows:', error.message)
            // Fallback to assume all apps are visible
            activeAppsOnAllSpaces = []
          }
        }

        // Also get visible sources for fallback
        const visibleSources = await desktopCapturer.getSources({
          types: ['window', 'screen'],
          thumbnailSize: { width: 1, height: 1 },
          fetchWindowIcons: false
        })

        const results = sourceIds.map((id) => {
          let isVisible = false
          let name = 'Unknown'

          if (id.startsWith('virtual-window:')) {
            const virtualWindow = parseVirtualWindowId(id)
            if (virtualWindow) {
              name = [virtualWindow.appName, virtualWindow.windowTitle].filter(Boolean).join(' - ')
              const visibleDesktopSource = findMatchingDesktopWindowSource(
                visibleSources,
                virtualWindow.appName,
                virtualWindow.windowTitle
              )

              if (visibleDesktopSource) {
                isVisible = true
                name = visibleDesktopSource.name
                logger.info(`Virtual window found capturable: ${id} -> ${name}`)
              } else if (process.platform !== 'darwin') {
                logger.info(`Virtual window NOT capturable: ${id} -> ${name}`)

                return { id, isVisible, name }
              }

              // Enhanced visibility check: app is visible if it has windows on ANY space
              if (activeAppsOnAllSpaces.length > 0) {
                const appNameLower = virtualWindow.appName.toLowerCase()
                const hasWindowsOnAnySpace = activeAppsOnAllSpaces.some((activeApp) => {
                  return (
                    activeApp.includes(appNameLower) ||
                    appNameLower.includes(activeApp) ||
                    (appNameLower === 'msteams' && activeApp.includes('teams')) ||
                    (appNameLower === 'microsoft teams' && activeApp.includes('teams')) ||
                    (appNameLower === 'wechat' && (activeApp.includes('wechat') || activeApp.includes('weixin'))) ||
                    (appNameLower === 'google chrome' && activeApp.includes('chrome')) ||
                    (appNameLower === 'visual studio code' &&
                      (activeApp.includes('code') || activeApp.includes('visual studio'))) ||
                    (appNameLower === 'microsoft powerpoint' &&
                      (activeApp.includes('powerpoint') || activeApp.includes('microsoft powerpoint'))) ||
                    (appNameLower === 'microsoft word' &&
                      (activeApp.includes('word') || activeApp.includes('microsoft word'))) ||
                    (appNameLower === 'microsoft excel' &&
                      (activeApp.includes('excel') || activeApp.includes('microsoft excel')))
                  )
                })

                if (hasWindowsOnAnySpace) {
                  isVisible = true
                  logger.info(`Virtual window has windows on some space: ${id} -> ${name}`)
                } else {
                  logger.info(`Virtual window has no windows on any space: ${id} -> ${name}`)
                }
              } else {
                // Fallback: if we can't detect apps with windows, assume visible
                isVisible = true
                logger.info(`Virtual window assumed visible (no space detection): ${id} -> ${name}`)
              }
            }
          } else {
            // For regular window IDs, check if they're actually visible
            const visibleSource = visibleSources.find((s) => s.id === id)
            if (visibleSource) {
              isVisible = true
              name = visibleSource.name
              logger.info(`Regular window found visible: ${id} -> ${name}`)
            } else {
              logger.info(`Regular window NOT visible: ${id}`)
            }
          }

          return { id, isVisible, name }
        })

        return { success: true, sources: results }
      } else {
        const visibleSources = await desktopCapturer.getSources({
          types: ['window', 'screen'],
          thumbnailSize: { width: 1, height: 1 },
          fetchWindowIcons: false
        })

        const allVisible = visibleSources.map((s) => ({
          id: s.id,
          name: s.name,
          isVisible: true
        }))

        return { success: true, sources: allVisible }
      }
    } catch (error: any) {
      logger.error('Error checking source visibility:', error)
      return { success: false, error: error.message }
    }
  }
}

export { CaptureSourcesTools }
