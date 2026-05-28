// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { app, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
// import os from 'os'
import { spawn } from 'child_process'
import http from 'http'
import net from 'net'
import { isPackaged, actuallyDev, serverRunInFrontend, getResourcesPath } from './utils/env'
import { IpcChannel } from '@shared/IpcChannel'
import { is } from '@electron-toolkit/utils'
import { IpcServerPushChannel } from '@shared/ipc-server-push-channel'
import { resolveAppDataRoot } from './utils/data-path'
import { DEFAULT_BACKEND_START_PORT } from '@shared/app-runtime-settings'
import { appRuntimeSettingsService } from './services/AppRuntimeSettingsService'

let backendLogFile: string | null = null
let backendProcess: any = null
let backendOwnedByThisProcess = false
let backendPort = DEFAULT_BACKEND_START_PORT // Dynamic port, starting from the configured preference
let backendStatus: 'starting' | 'running' | 'stopped' | 'error' = 'stopped' // Backend service status
let ensureBackendRunningPromise: Promise<void> | null = null

interface HealthCheckOptions {
  port?: number
  maxRetries?: number
  retryDelayMs?: number
  requestTimeoutMs?: number
}

const safeLog = {
  log: (...args) => {
    if (actuallyDev) {
      console.log(...args)
    }
  },
  error: (...args) => {
    if (actuallyDev) {
      console.error(...args)
    }
  },
  warn: (...args) => {
    if (actuallyDev) {
      console.warn(...args)
    }
  }
}

// Check if the port is available
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', (err: any) => {
      // Port is occupied or other errors
      if (err.code === 'EADDRINUSE') {
        logToBackendFile(`Port ${port} is already occupied; checking whether it is an existing MineContext backend`)
      } else {
        logToBackendFile(`Port ${port} check error: ${err.code} - ${err.message}`)
      }
      resolve(false)
    })

    server.once('listening', () => {
      // Port is available, close the test server
      server.close(() => {
        resolve(true)
      })
    })

    // Explicitly listen on 127.0.0.1 to ensure consistency with the backend service listening address
    server.listen(port, '127.0.0.1')
  })
}

// Find an available port
async function findAvailablePort(startPort: number = 1733, maxAttempts: number = 100): Promise<number> {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const available = await isPortAvailable(port)
    if (available) {
      logToBackendFile(`Found available port: ${port}`)
      return port
    } else {
      logToBackendFile(`Port ${port} is already in use, trying next port...`)
    }
  }

  logToBackendFile(
    `Could not find a preferred port after ${maxAttempts} attempts starting from ${startPort}; asking the OS for an available loopback port`
  )
  return findOsAssignedPort()
}

function findOsAssignedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()

    server.once('error', (err: any) => {
      reject(new Error(`Could not get an OS-assigned loopback port: ${err.code} - ${err.message}`))
    })

    server.once('listening', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not read OS-assigned loopback port')))
        return
      }

      const port = address.port
      server.close(() => {
        logToBackendFile(`Using OS-assigned backend port: ${port}`)
        resolve(port)
      })
    })

    server.listen(0, '127.0.0.1')
  })
}

// The backend service supports health checks
// @ts-expect-error Ignore type error
async function checkBackendHealth(options: HealthCheckOptions = {}) {
  const {
    port = backendPort,
    maxRetries = 20,
    retryDelayMs = 1000,
    requestTimeoutMs = 5000
  } = options

  for (let i = 0; i < maxRetries; i++) {
    try {
      logToBackendFile(`Health check attempt ${i + 1}/${maxRetries} - checking http://127.0.0.1:${port}/api/health`)

      const healthCheckResult = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: requestTimeoutMs }, (res) => {
          let data = ''

          res.on('data', (chunk) => {
            data += chunk
          })

          res.on('end', () => {
            if (res.statusCode === 200) {
              logToBackendFile(`Health check response: ${data}`)
              resolve(data)
            } else {
              reject(new Error(`Health check failed with status: ${res.statusCode}, response: ${data}`))
            }
          })
        })

        req.on('error', (error) => {
          logToBackendFile(`Health check request error: ${error.message}`)
          reject(error)
        })

        req.setTimeout(requestTimeoutMs, () => {
          req.destroy()
          reject(new Error(`Health check timeout after ${requestTimeoutMs}ms`))
        })
      })

      logToBackendFile('✅ Backend health check passed')
      return healthCheckResult
    } catch (error: any) {
      logToBackendFile(`❌ Health check attempt ${i + 1} failed: ${error.message} (code: ${error.code})`)

      if (i < maxRetries - 1 && retryDelayMs > 0) {
        logToBackendFile(`Retrying in ${retryDelayMs}ms...`)
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      } else {
        logToBackendFile(`All health check attempts failed. Final error: ${error.message}`)
        throw error
      }
    }
  }
}

function resolvePromptLanguageFromLocale(locale: string | undefined): 'zh' | 'en' {
  return (locale || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function parseHealthCheckResult(result: unknown): any | null {
  if (typeof result === 'string') {
    try {
      return JSON.parse(result)
    } catch (error: any) {
      logToBackendFile(`Failed to parse backend health response: ${error.message}`)
      return null
    }
  }

  return result && typeof result === 'object' ? result : null
}

function getHealthData(healthCheckResult: unknown): any | null {
  const parsed = parseHealthCheckResult(healthCheckResult)
  return parsed?.data ?? parsed
}

function normalizePathForCompare(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function getExpectedContextPath(): string {
  return resolveAppDataRoot()
}

function getPreferredBackendStartPort(): number {
  return appRuntimeSettingsService.getBackendStartPort()
}

function backendUsesExpectedContextPath(healthCheckResult: unknown): boolean {
  const data = getHealthData(healthCheckResult)
  const backendContextPath = data?.context_path

  if (!backendContextPath || typeof backendContextPath !== 'string') {
    logToBackendFile('Existing backend health response does not include context_path; not reusing it')
    return false
  }

  const expectedContextPath = getExpectedContextPath()
  const matches =
    normalizePathForCompare(backendContextPath) === normalizePathForCompare(expectedContextPath)

  if (!matches) {
    logToBackendFile(
      `Existing backend context path mismatch; expected ${expectedContextPath}, got ${backendContextPath}`
    )
  }

  return matches
}

function getBackendPid(healthCheckResult: unknown): number | null {
  const data = getHealthData(healthCheckResult)
  const pid = Number(data?.pid)
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

function terminateDuplicateBackend(pid: number, port: number) {
  if (pid === process.pid) {
    return
  }

  try {
    if (process.platform === 'win32') {
      const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      })
      child.on('error', (error: any) => {
        logToBackendFile(`Failed to terminate duplicate backend ${pid} on port ${port}: ${error.message}`)
      })
    } else {
      process.kill(pid, 'SIGTERM')
    }
    logToBackendFile(`Terminated duplicate backend process ${pid} on port ${port}`)
  } catch (error: any) {
    logToBackendFile(`Failed to terminate duplicate backend ${pid} on port ${port}: ${error.message}`)
  }
}

async function findRunningBackendPort(startPort: number = 1733, maxAttempts: number = 20) {
  const compatibleBackends: Array<{ port: number; healthCheckResult: unknown; pid: number | null }> = []

  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const available = await isPortAvailable(port)
    if (available) {
      continue
    }

    try {
      const healthCheckResult = await checkBackendHealth({
        port,
        maxRetries: 1,
        retryDelayMs: 0,
        requestTimeoutMs: 1200
      })
      if (!backendUsesExpectedContextPath(healthCheckResult)) {
        continue
      }
      logToBackendFile(`Detected healthy backend on existing port ${port}`)
      compatibleBackends.push({
        port,
        healthCheckResult,
        pid: getBackendPid(healthCheckResult)
      })
    } catch (error: any) {
      logToBackendFile(`Port ${port} is occupied but not a healthy MineContext backend: ${error.message}`)
    }
  }

  const [primary, ...duplicates] = compatibleBackends
  for (const duplicate of duplicates) {
    if (duplicate.pid) {
      terminateDuplicateBackend(duplicate.pid, duplicate.port)
    } else {
      logToBackendFile(`Duplicate backend on port ${duplicate.port} has no pid in health response; cannot terminate`)
    }
  }

  return primary
    ? {
        port: primary.port,
        healthCheckResult: primary.healthCheckResult
      }
    : null
}

// Check if backend is running and healthy
async function isBackendHealthy(mainWindow: BrowserWindow) {
  try {
    const res = await checkBackendHealth({
      port: backendPort,
      maxRetries: 2,
      retryDelayMs: 300,
      requestTimeoutMs: 2000
    })
    mainWindow.webContents.send(IpcServerPushChannel.PushGetInitCheckData, res)
    return true
  } catch (error: any) {
    console.log('isBackendHealthy', error.message)
    return false
  }
}

// Create backend log file
function createBackendLogFile() {
  const debugLogDir = path.join(app.getPath('userData'), 'debug')
  if (!fs.existsSync(debugLogDir)) {
    fs.mkdirSync(debugLogDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logFileName = `backend-${timestamp}.log`
  const logFilePath = path.join(debugLogDir, logFileName)

  // Create the log file with initial headers
  const initialLog = `=== VIKINGDB Backend Debug Log ===
Started: ${new Date().toISOString()}
Platform: ${process.platform}
Architecture: ${process.arch}
Node version: ${process.version}
Electron version: ${process.versions.electron}
Process execPath: ${process.execPath}
Process cwd: ${process.cwd()}
__dirname: ${__dirname}
Resources path: ${process.resourcesPath}
Is packaged: ${isPackaged}
Actually dev: ${actuallyDev}
========================================

`

  fs.writeFileSync(logFilePath, initialLog)
  safeLog.log(`Created backend log file: ${logFilePath}`)

  return logFilePath
}

// Helper function to log to backend log file
export function logToBackendFile(message) {
  if (!backendLogFile) {
    backendLogFile = createBackendLogFile()
  }

  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] ${message}`

  safeLog.log(logMessage)

  try {
    fs.appendFileSync(backendLogFile, logMessage + '\n')
  } catch (error) {
    safeLog.error('Failed to write to backend log file:', error)
  }
}

export function stopBackendServer() {
  if (!backendOwnedByThisProcess) {
    logToBackendFile(`Skipping backend stop for reused external service on port ${backendPort}`)
    return
  }

  if (backendProcess) {
    logToBackendFile('Stopping backend server...')
    setBackendStatus('stopped')

    // Step 1: Gracefully terminate the process group
    try {
      // On Unix systems, use a negative PID to kill the entire process group
      if (process.platform !== 'win32') {
        logToBackendFile(`Sending SIGTERM to process group -${backendProcess.pid}`)
        process.kill(-backendProcess.pid, 'SIGTERM')
      } else {
        // Windows system
        logToBackendFile(`Sending SIGTERM to process ${backendProcess.pid}`)
        backendProcess.kill('SIGTERM')
      }

      // Wait for a while for the process to exit gracefully
      setTimeout(() => {
        if (backendProcess && backendProcess.exitCode === null) {
          logToBackendFile('Process did not exit gracefully, forcing termination...')
          forceKillBackendProcess()
        }
      }, 5000)
    } catch (error) {
      logToBackendFile(`Error killing process group: ${error}`)
      forceKillBackendProcess()
    }

    backendProcess = null
    backendOwnedByThisProcess = false
    logToBackendFile('Backend server stop signal sent')
  }

  // Additionally, check and kill any remaining processes on the port
  killProcessByPort(backendPort)
}

// Force kill the backend process
function forceKillBackendProcess() {
  if (backendProcess) {
    try {
      if (process.platform !== 'win32') {
        // Use SIGKILL to force kill the process group
        logToBackendFile(`Force killing process group -${backendProcess.pid} with SIGKILL`)
        process.kill(-backendProcess.pid, 'SIGKILL')
      } else {
        // Force terminate on Windows systems
        logToBackendFile(`Force killing process ${backendProcess.pid}`)
        backendProcess.kill('SIGKILL')
      }
    } catch (killError) {
      logToBackendFile(`Error force killing process: ${killError}`)
    }
  }
}

// Kill process by port
function killProcessByPort(port: number) {
  const { exec } = require('child_process')

  if (process.platform === 'win32') {
    // Windows: use netstat and taskkill
    exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
      if (!error && stdout) {
        const lines = stdout.split('\n')
        const pids = new Set()

        lines.forEach((line) => {
          const match = line.match(/\s+(\d+)\s*$/)
          if (match) {
            pids.add(match[1])
          }
        })

        pids.forEach((pid) => {
          if (pid !== '0') {
            logToBackendFile(`Killing process on port ${port}, PID: ${pid}`)
            exec(`taskkill /PID ${pid} /F`, (killError) => {
              if (killError) {
                logToBackendFile(`Failed to kill PID ${pid}: ${killError.message}`)
              } else {
                logToBackendFile(`Successfully killed PID ${pid}`)
              }
            })
          }
        })
      }
    })
  } else {
    // Unix/Linux/macOS: use lsof and kill
    exec(`lsof -ti:${port}`, (error, stdout) => {
      if (!error && stdout) {
        const pids = stdout
          .trim()
          .split('\n')
          .filter((pid) => pid)
        pids.forEach((pid) => {
          logToBackendFile(`Killing process on port ${port}, PID: ${pid}`)
          try {
            process.kill(parseInt(pid), 'SIGKILL')
            logToBackendFile(`Successfully killed PID ${pid}`)
          } catch (killError) {
            logToBackendFile(`Failed to kill PID ${pid}: ${killError}`)
          }
        })
      } else if (error) {
        logToBackendFile(`No process found on port ${port}: ${error.message}`)
      }
    })
  }
}

// Ensure backend is running (start if not running)
export async function ensureBackendRunning(mainWindow: BrowserWindow) {
  if (ensureBackendRunningPromise) {
    logToBackendFile('Backend startup is already in progress, waiting for existing task...')
    return ensureBackendRunningPromise
  }

  ensureBackendRunningPromise = (async () => {
    if (actuallyDev && !serverRunInFrontend) {
      safeLog.log('Development mode: Backend should be running separately')
      return
    }

    // Check if backend process is still running
    if (backendProcess && backendProcess.exitCode === null) {
      // Process is still running, check if it's healthy
      const isHealthy = await isBackendHealthy(mainWindow)
      if (isHealthy) {
        logToBackendFile('Backend is already running and healthy')
        return
      } else {
        logToBackendFile('Backend process is running but not healthy, restarting...')
        stopBackendServer()
      }
    } else {
      logToBackendFile('Backend process is not running, starting...')
    }

    // Try to reuse already-running backend first (e.g. after abnormal exit or external startup).
    const preferredBackendStartPort = getPreferredBackendStartPort()
    const existingBackend = await findRunningBackendPort(preferredBackendStartPort, 20)
    if (existingBackend) {
      backendPort = existingBackend.port
      backendOwnedByThisProcess = false
      setBackendStatus('running')
      mainWindow.webContents.send(IpcServerPushChannel.PushGetInitCheckData, existingBackend.healthCheckResult)
      logToBackendFile(`Reused existing backend service on port ${backendPort}`)
      return
    }

    // Start backend only when no reusable service is available.
    try {
      await startBackendServer(mainWindow)
      logToBackendFile('Backend started successfully')
    } catch (error: any) {
      logToBackendFile(`Failed to start backend: ${error.message}`)
      throw error
    }
  })()

  try {
    await ensureBackendRunningPromise
  } finally {
    ensureBackendRunningPromise = null
  }
}

async function startBackendServer(mainWindow: BrowserWindow) {
  if (actuallyDev && !serverRunInFrontend) {
    safeLog.log('Development mode: Backend should be running separately')
    setBackendStatus('running') // In development mode, assume the backend is already running
    return Promise.resolve()
  }

  setBackendStatus('starting')

  // First, find an available port
  try {
    const preferredBackendStartPort = getPreferredBackendStartPort()
    backendPort = await findAvailablePort(preferredBackendStartPort)
    logToBackendFile(`Selected backend port: ${backendPort}`)
  } catch (error: any) {
    logToBackendFile(`Failed to find available port: ${error.message}`)
    setBackendStatus('error')
    throw error
  }

  return new Promise((resolve, reject) => {
    try {
      const executableName = process.platform === 'win32' ? 'main.exe' : 'main'

      let actualResourcesPath = getResourcesPath()
      logToBackendFile(`Initial resources path: ${actualResourcesPath}`)

      if (__dirname.indexOf('app.asar') !== -1) {
        const appAsarPath = __dirname.substring(0, __dirname.indexOf('app.asar'))
        actualResourcesPath = appAsarPath
        logToBackendFile(`Adjusted resources path from asar: ${actualResourcesPath}`)
      }

      // Try multiple possible backend paths
      const possiblePaths = [
        path.join(actualResourcesPath, 'backend', executableName),
        path.join(actualResourcesPath, 'backend', 'dist', executableName),
        path.join(actualResourcesPath, 'dist', executableName),
        path.join(actualResourcesPath, 'app', 'backend', executableName),
        path.join(actualResourcesPath, 'app', 'backend', 'dist', executableName),
        path.join(actualResourcesPath, 'Contents', 'Resources', 'backend', executableName),
        path.join(actualResourcesPath, 'Contents', 'Resources', 'backend', 'dist', executableName),
        path.join(actualResourcesPath, 'Contents', 'Resources', 'app', 'backend', executableName),
        path.join(actualResourcesPath, 'Contents', 'Resources', 'app', 'backend', 'dist', executableName),
        path.join(process.resourcesPath, 'backend', executableName),
        path.join(process.resourcesPath, 'backend', 'dist', executableName),
        path.join(process.resourcesPath, 'app', 'backend', executableName),
        path.join(process.resourcesPath, 'app', 'backend', 'dist', executableName)
      ]

      logToBackendFile(`Searching for backend executable in ${possiblePaths.length} locations:`)

      let backendPath: string | null = null
      for (const candidatePath of possiblePaths) {
        logToBackendFile(`  Checking: ${candidatePath}`)
        if (fs.existsSync(candidatePath)) {
          const stats = fs.statSync(candidatePath)
          logToBackendFile(`  ✅ Found! Size: ${stats.size} bytes, Modified: ${stats.mtime}`)
          logToBackendFile(
            `  File mode: ${stats.mode.toString(8)} (executable: ${(stats.mode & parseInt('111', 8)) !== 0})`
          )

          // Make sure it's executable
          if ((stats.mode & parseInt('111', 8)) === 0) {
            try {
              fs.chmodSync(candidatePath, '755')
              logToBackendFile(`  Made executable: ${candidatePath}`)
            } catch (chmodError: any) {
              logToBackendFile(`  Failed to make executable: ${chmodError.message}`)
            }
          }

          backendPath = candidatePath
          break
        } else {
          logToBackendFile(`  ❌ Not found`)
        }
      }

      if (!backendPath) {
        const error = `Backend executable not found in any of the expected locations:\n${possiblePaths.join('\n')}`
        logToBackendFile(error)
        reject(new Error(error))
        return
      }

      logToBackendFile(`Starting backend server on port ${backendPort}: ${backendPath}`)

      // Set working directory to backend executable directory
      const backendDir = path.dirname(backendPath)
      logToBackendFile(`Using working directory: ${backendDir}`)

      // Verify config file exists
      const configPath = path.join(backendDir, 'config', 'config.yaml')
      logToBackendFile(`Config path: ${configPath}`)
      logToBackendFile(`Config exists: ${fs.existsSync(configPath)}`)

      // Prepare environment variables
      const systemLocale = app.getLocale()
      const runtimeSettings = appRuntimeSettingsService.getSettings()
      const customScreenshotDirectory = runtimeSettings.screenshotDirectory
      const env = {
        ...process.env,
        CONTEXT_PATH: resolveAppDataRoot(),
        ...(customScreenshotDirectory
          ? { OPENCONTEXT_SCREENSHOT_DIR: path.resolve(customScreenshotDirectory) }
          : {}),
        OPENCONTEXT_SYSTEM_LOCALE: systemLocale,
        OPENCONTEXT_PROMPT_LANGUAGE:
          process.env.OPENCONTEXT_PROMPT_LANGUAGE || resolvePromptLanguageFromLocale(systemLocale)
      } as Record<string, string>

      // Prepare command line arguments: ./main start --port <port> --config config/config.yaml
      const args = ['start', '--port', backendPort.toString(), '--config', 'config/config.yaml']

      is.dev
        ? console.log(
            `Starting backend with command: ${backendPath} ${args.join(' ')}, Working dir: ${backendDir}, Environment: CONTEXT_PATH=${env.CONTEXT_PATH}, OPENCONTEXT_SCREENSHOT_DIR=${env.OPENCONTEXT_SCREENSHOT_DIR || ''}`
          )
        : logToBackendFile(
            `Starting backend with command: ${backendPath} ${args.join(' ')}, Working dir: ${backendDir}, Environment: CONTEXT_PATH=${env.CONTEXT_PATH}, OPENCONTEXT_SCREENSHOT_DIR=${env.OPENCONTEXT_SCREENSHOT_DIR || ''}`
          )

      // Start backend with SQLite configuration
      backendProcess = spawn(backendPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32', // Set to detached on Unix systems to create a new process group
        cwd: backendDir, // Change to backend directory before executing
        env: env
      })
      backendOwnedByThisProcess = true

      // On Unix systems, create a new process group
      if (process.platform !== 'win32' && backendProcess.pid) {
        try {
          // Make the process the leader of a new session and process group
          process.kill(backendProcess.pid, 0) // First, check if the process exists
          logToBackendFile(`Created new process group for PID: ${backendProcess.pid}`)
        } catch (error) {
          logToBackendFile(`Failed to verify process group creation: ${error}`)
        }
      }

      let healthCheckStarted = false

      const triggerStartupHealthCheck = (source: 'stdout' | 'stderr') => {
        if (healthCheckStarted) {
          return
        }

        healthCheckStarted = true
        logToBackendFile(`Backend server startup detected in ${source}, starting health check...`)

        setTimeout(() => {
          checkBackendHealth({
            port: backendPort,
            maxRetries: 60,
            retryDelayMs: 500,
            requestTimeoutMs: 2000
          })
            .then((res) => {
              logToBackendFile('Backend health check passed, resolving startup')
              setBackendStatus('running')
              mainWindow.webContents.send(IpcServerPushChannel.PushGetInitCheckData, res)
              resolve(res)
            })
            .catch((healthError) => {
              logToBackendFile(`Backend health check failed: ${healthError.message}`)
              setBackendStatus('error')
              reject(healthError)
            })
        }, 500)
      }

      backendProcess.stdout.on('data', (data) => {
        const output = data.toString().trim()
        logToBackendFile(`STDOUT: ${output}`)

        if (
          output.includes('Uvicorn running on') ||
          output.includes('Application startup complete') ||
          output.includes('Started server process')
        ) {
          triggerStartupHealthCheck('stdout')
        }
      })

      backendProcess.stderr.on('data', (data) => {
        const output = data.toString()
        logToBackendFile(`STDERR: ${output}`)

        // Check stderr for startup messages too
        if (
          output.includes('Uvicorn running on') ||
          output.includes('Application startup complete') ||
          output.includes('Started server process')
        ) {
          triggerStartupHealthCheck('stderr')
        }
      })

      backendProcess.on('close', (code) => {
        logToBackendFile(`Backend process exited with code ${code}`)
        setBackendStatus('stopped')
        backendOwnedByThisProcess = false
        if (code !== 0 && !healthCheckStarted) {
          setBackendStatus('error')
          reject(new Error(`Backend process exited with code ${code}`))
        }
      })

      backendProcess.on('error', (error) => {
        logToBackendFile(`Failed to start backend process: ${error.message}`)
        setBackendStatus('error')
        reject(error)
      })

      // Timeout fallback
      setTimeout(() => {
        if (backendProcess && backendProcess.exitCode === null && !healthCheckStarted) {
          logToBackendFile('Backend startup timeout, trying health check...')
          checkBackendHealth({
            port: backendPort,
            maxRetries: 4,
            retryDelayMs: 500,
            requestTimeoutMs: 2000
          })
            .then((res) => {
              logToBackendFile('Health check passed despite timeout')
              setBackendStatus('running')
              mainWindow.webContents.send(IpcServerPushChannel.PushGetInitCheckData, res)
              resolve(res)
            })
            .catch((healthError) => {
              logToBackendFile(`Backend health check failed after timeout: ${healthError.message}`)
              setBackendStatus('error')
              reject(new Error(`Backend startup timeout: ${healthError.message}`))
            })
        }
      }, 30000)

      logToBackendFile('Backend server started')
    } catch (error) {
      safeLog.error('Failed to start backend server:', error)
      setBackendStatus('error')
      reject(error)
    }
  })
}

export async function startBackendInBackground(mainWindow: BrowserWindow) {
  safeLog.log('Starting backend server in background...')

  try {
    logToBackendFile('Initial backend startup...')
    await ensureBackendRunning(mainWindow)
    logToBackendFile('✅ Backend initialization complete')
  } catch (error: any) {
    logToBackendFile(`❌ Backend initialization failed: ${error.message}`)
    logToBackendFile(`Error stack: ${error.stack}`)

    if (!actuallyDev) {
      let errorMessage = error.message || 'Unknown error'

      if (error.message && error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Backend server failed to start - connection refused'
      } else if (error.message && error.message.includes('EADDRINUSE')) {
        errorMessage = 'Backend server failed to start - port already in use'
      } else if (error.message && error.message.includes('Backend process exited')) {
        errorMessage = 'Backend server crashed during startup'
      }

      const fullErrorMessage = `Failed to start the backend server: ${errorMessage}\n\nBackend log saved to: ${backendLogFile}`

      dialog.showErrorBox('Backend Startup Error', fullErrorMessage)
    }

    safeLog.error(`Backend log saved to: ${backendLogFile}`)
  }
}

// 同步停止后端服务器（用于应用退出时）
export function stopBackendServerSync() {
  logToBackendFile('Synchronously stopping backend server...')

  if (!backendOwnedByThisProcess) {
    logToBackendFile(`Skipping sync backend stop for reused external service on port ${backendPort}`)
    return
  }

  if (backendProcess) {
    try {
      // 立即发送终止信号
      if (process.platform !== 'win32') {
        logToBackendFile(`Sending SIGTERM to process group -${backendProcess.pid}`)
        process.kill(-backendProcess.pid, 'SIGTERM')

        // 等待一小段时间，然后强制杀死
        setTimeout(() => {
          if (backendProcess && backendProcess.exitCode === null) {
            logToBackendFile(`Force killing process group -${backendProcess.pid}`)
            try {
              process.kill(-backendProcess.pid, 'SIGKILL')
            } catch (e) {
              logToBackendFile(`Failed to force kill: ${e}`)
            }
          }
        }, 2000)
      } else {
        logToBackendFile(`Sending SIGTERM to process ${backendProcess.pid}`)
        backendProcess.kill('SIGTERM')

        setTimeout(() => {
          if (backendProcess && backendProcess.exitCode === null) {
            logToBackendFile(`Force killing process ${backendProcess.pid}`)
            backendProcess.kill('SIGKILL')
          }
        }, 2000)
      }
    } catch (error) {
      logToBackendFile(`Error in sync stop: ${error}`)
    }

    backendProcess = null
    backendOwnedByThisProcess = false
  }

  // 立即尝试清理端口
  killProcessByPortSync(backendPort)
  logToBackendFile('Synchronous backend stop completed')
}

// 同步方式通过端口杀死进程
function killProcessByPortSync(port: number) {
  const { execSync } = require('child_process')

  try {
    if (process.platform === 'win32') {
      // Windows
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', timeout: 3000 })
      const lines = output.split('\n')
      const pids = new Set()

      lines.forEach((line) => {
        const match = line.match(/\s+(\d+)\s*$/)
        if (match && match[1] !== '0') {
          pids.add(match[1])
        }
      })

      pids.forEach((pid) => {
        try {
          logToBackendFile(`Sync killing process on port ${port}, PID: ${pid}`)
          execSync(`taskkill /PID ${pid} /F`, { timeout: 3000 })
          logToBackendFile(`Successfully killed PID ${pid}`)
        } catch (e) {
          logToBackendFile(`Failed to kill PID ${pid}: ${e}`)
        }
      })
    } else {
      // Unix/Linux/macOS
      const output = execSync(`lsof -ti:${port}`, { encoding: 'utf8', timeout: 3000 })
      const pids = output
        .trim()
        .split('\n')
        .filter((pid) => pid)

      pids.forEach((pid) => {
        try {
          logToBackendFile(`Sync killing process on port ${port}, PID: ${pid}`)
          process.kill(parseInt(pid), 'SIGKILL')
          logToBackendFile(`Successfully killed PID ${pid}`)
        } catch (e) {
          logToBackendFile(`Failed to kill PID ${pid}: ${e}`)
        }
      })
    }
  } catch (error: any) {
    logToBackendFile(`No process found on port ${port} or error: ${error.message}`)
  }
}

// 获取当前后端端口号
export function getBackendPort(): number {
  return backendPort
}

// 获取后端服务状态
export function getBackendStatus(): 'starting' | 'running' | 'stopped' | 'error' {
  return backendStatus
}

// 设置后端服务状态并通知渲染进程
function setBackendStatus(status: 'starting' | 'running' | 'stopped' | 'error') {
  const oldStatus = backendStatus
  backendStatus = status

  logToBackendFile(`Backend status changed from ${oldStatus} to ${status}`)

  // 通知所有窗口状态变化
  const windows = BrowserWindow.getAllWindows()
  windows.forEach((window) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send(IpcChannel.Backend_StatusChanged, {
        status,
        port: backendPort,
        timestamp: new Date().toISOString()
      })
    }
  })
}
