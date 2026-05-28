// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { isLinux, isPortable, isWin } from '@main/constant'
import { app } from 'electron'
import { execFileSync, execSync } from 'node:child_process'

// Please don't import any other modules which is not node/electron built-in modules

const APP_NAME = 'MineContext'
const WINDOWS_REGISTRY_KEY = 'HKCU\\Software\\MineContext'
const USER_DATA_MARKERS = [
  path.join('persist', 'sqlite', 'app.db'),
  path.join('persist', 'chromadb'),
  'Data',
  'screenshots',
  'documents'
]

function hasWritePermission(dirPath: string) {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK)
    return true
  } catch (error) {
    return false
  }
}

function getConfigDir() {
  return path.join(os.homedir(), '.vikingdb', 'config')
}

function getDataDirFromRegistry() {
  if (!isWin) return null

  try {
    // Read data directory from Windows Registry with timeout protection
    const result = execSync(`reg query "${WINDOWS_REGISTRY_KEY}" /v DataDirectory`, {
      encoding: 'utf8',
      timeout: 3000, // 3 second timeout to prevent hanging
      windowsHide: true
    })

    // Parse the registry output
    // Format: "DataDirectory    REG_SZ    C:\Users\...\AppData\Local\MineContext"
    const match = result.match(/DataDirectory\s+REG_SZ\s+(.+)/)
    if (match && match[1]) {
      const dataDir = match[1].trim()
      if (fs.existsSync(dataDir) && hasWritePermission(dataDir)) {
        return recoverWindowsLegacyDataDir(dataDir)
      }
    }
  } catch (error) {
    // Registry key doesn't exist, timeout, or other error - ignore and use default
    console.warn('Failed to read data directory from registry:', error)
  }

  return null
}

function getWindowsElectronDefaultDataDir() {
  if (!isWin) return null

  const appDataDir = process.env.APPDATA || app.getPath('appData')
  return appDataDir ? path.join(appDataDir, APP_NAME) : null
}

function getWindowsInstallerDefaultDataDir() {
  if (!isWin) return null

  const localAppDataDir = process.env.LOCALAPPDATA
  return localAppDataDir ? path.join(localAppDataDir, APP_NAME) : null
}

function isSamePath(left: string | null, right: string | null) {
  if (!left || !right) return false
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
}

function hasUserData(dirPath: string | null) {
  if (!dirPath || !fs.existsSync(dirPath)) return false

  for (const marker of USER_DATA_MARKERS) {
    const markerPath = path.join(dirPath, marker)
    try {
      if (!fs.existsSync(markerPath)) continue

      const stats = fs.statSync(markerPath)
      if (stats.isFile() && stats.size > 0) {
        return true
      }

      if (stats.isDirectory() && fs.readdirSync(markerPath).length > 0) {
        return true
      }
    } catch (error) {
      // Ignore unreadable markers and keep checking other data locations.
    }
  }

  return false
}

function isUsableDataDir(dirPath: unknown, requireUserData = false) {
  if (typeof dirPath !== 'string') return false
  if (!fs.existsSync(dirPath) || !hasWritePermission(dirPath)) return false
  return !requireUserData || hasUserData(dirPath)
}

function findReusableConfiguredDataDir(entries: unknown): string | null {
  if (!Array.isArray(entries)) return null

  for (const entry of entries) {
    const dataPath = (entry as { dataPath?: unknown })?.dataPath
    if (isUsableDataDir(dataPath, true)) {
      return dataPath as string
    }
  }

  for (const entry of entries) {
    const dataPath = (entry as { dataPath?: unknown })?.dataPath
    if (isUsableDataDir(dataPath)) {
      return dataPath as string
    }
  }

  return null
}

function updateWindowsDataDirRegistry(dataDir: string) {
  if (!isWin) return

  try {
    execFileSync('reg', ['add', WINDOWS_REGISTRY_KEY, '/v', 'DataDirectory', '/t', 'REG_SZ', '/d', dataDir, '/f'], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true
    })
  } catch (error) {
    console.warn('Failed to update data directory registry:', error)
  }
}

function recoverWindowsLegacyDataDir(registryDataDir: string) {
  if (!isWin || isPortable) return registryDataDir

  const legacyDataDir = getWindowsElectronDefaultDataDir()
  const installerDefaultDataDir = getWindowsInstallerDefaultDataDir()

  if (!legacyDataDir || !installerDefaultDataDir) return registryDataDir
  if (isSamePath(registryDataDir, legacyDataDir)) return registryDataDir
  if (!isSamePath(registryDataDir, installerDefaultDataDir)) return registryDataDir
  if (!hasUserData(legacyDataDir) || !hasWritePermission(legacyDataDir)) return registryDataDir

  updateWindowsDataDirRegistry(legacyDataDir)
  return legacyDataDir
}

export function initAppDataDir() {
  const appDataPath = getAppDataPathFromConfig()
  if (appDataPath) {
    app.setPath('userData', appDataPath)
    return
  }

  if (isPortable) {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
    app.setPath('userData', path.join(portableDir || app.getPath('exe'), 'data'))
    return
  }

  // For Windows installer version, check registry for custom data directory
  if (isWin && !isPortable) {
    // Try to get data directory from registry (set by installer)
    const registryDataDir = getDataDirFromRegistry()
    if (registryDataDir) {
      app.setPath('userData', registryDataDir)
      return
    }

    const legacyDataDir = getWindowsElectronDefaultDataDir()
    if (hasUserData(legacyDataDir) && legacyDataDir && hasWritePermission(legacyDataDir)) {
      updateWindowsDataDirRegistry(legacyDataDir)
      app.setPath('userData', legacyDataDir)
      return
    }

    // If no registry setting exists, keep Electron's default userData location
    // (e.g. %APPDATA%\MineContext on Windows).
  }
}

function getAppDataPathFromConfig() {
  try {
    const configPath = path.join(getConfigDir(), 'config.json')
    if (!fs.existsSync(configPath)) {
      return null
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

    if (!config.appDataPath) {
      return null
    }

    let executablePath = app.getPath('exe')
    if (isLinux && process.env.APPIMAGE) {
      // 如果是 AppImage 打包的应用，直接使用 APPIMAGE 环境变量
      // 这样可以确保获取到正确的可执行文件路径
      executablePath = path.join(path.dirname(process.env.APPIMAGE), 'vikingdb.appimage')
    }

    if (isWin && isPortable) {
      executablePath = path.join(process.env.PORTABLE_EXECUTABLE_DIR || '', 'vikingdb-portable.exe')
    }

    let appDataPath: string | null = null
    // 兼容旧版本
    if (config.appDataPath && typeof config.appDataPath === 'string') {
      appDataPath = config.appDataPath
      // 将旧版本数据迁移到新版本
      appDataPath && updateAppDataConfig(appDataPath)
    } else {
      const appDataEntries = Array.isArray(config.appDataPath) ? config.appDataPath : []
      appDataPath = appDataEntries.find(
        (item: { executablePath: string }) => item.executablePath === executablePath
      )?.dataPath

      if (!appDataPath) {
        appDataPath = findReusableConfiguredDataDir(appDataEntries)
        appDataPath && updateAppDataConfig(appDataPath)
      }
    }

    if (isUsableDataDir(appDataPath)) {
      return appDataPath
    }

    return null
  } catch (error) {
    return null
  }
}

export function updateAppDataConfig(appDataPath: string) {
  const configDir = getConfigDir()
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }

  // config.json
  // appDataPath: [{ executablePath: string, dataPath: string }]
  const configPath = path.join(configDir, 'config.json')
  let executablePath = app.getPath('exe')
  if (isLinux && process.env.APPIMAGE) {
    executablePath = path.join(path.dirname(process.env.APPIMAGE), 'vikingdb.appimage')
  }

  // If it is a Windows portable version, use the PORTABLE_EXECUTABLE_FILE environment variable
  if (isWin && isPortable) {
    executablePath = path.join(process.env.PORTABLE_EXECUTABLE_DIR || '', 'vikingdb-portable.exe')
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ appDataPath: [{ executablePath, dataPath: appDataPath }] }, null, 2))
    return
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  if (!config.appDataPath || (config.appDataPath && typeof config.appDataPath !== 'object')) {
    config.appDataPath = []
  }

  const existingPath = config.appDataPath.find(
    (item: { executablePath: string }) => item.executablePath === executablePath
  )

  if (existingPath) {
    existingPath.dataPath = appDataPath
  } else {
    config.appDataPath.push({ executablePath, dataPath: appDataPath })
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}
