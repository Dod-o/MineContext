// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process'
import path from 'node:path'

function isMacScreenSaverActive(): boolean {
  try {
    execFileSync('/usr/bin/pgrep', ['-x', 'ScreenSaverEngine'], {
      stdio: 'ignore',
      timeout: 1000
    })
    return true
  } catch {
    return false
  }
}

function isWindowsScreenSaverActive(): boolean {
  const powershellPath = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'

  try {
    const output = execFileSync(
      powershellPath,
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "$process = Get-Process | Where-Object { ($_.Path -and $_.Path.ToLowerInvariant().EndsWith('.scr')) -or $_.ProcessName.ToLowerInvariant().EndsWith('.scr') } | Select-Object -First 1; if ($process) { '1' }"
      ],
      {
        encoding: 'utf8',
        timeout: 1000,
        windowsHide: true
      }
    )
    return output.trim() === '1'
  } catch {
    return false
  }
}

export function isScreenSaverActive(): boolean {
  if (process.platform === 'darwin') {
    return isMacScreenSaverActive()
  }

  if (process.platform === 'win32') {
    return isWindowsScreenSaverActive()
  }

  return false
}
