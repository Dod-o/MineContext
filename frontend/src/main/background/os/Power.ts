// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { POWER_MONITOR_KEY } from '@shared/constant/power-monitor'
import { IpcServerPushChannel } from '@shared/ipc-server-push-channel'
import { getLogger } from '@shared/logger/main'
import { monitor } from '@shared/logger/performance'
import { getBackendPort } from '@main/backend'
import { app, BrowserWindow, powerMonitor, powerSaveBlocker } from 'electron'
import axios from 'axios'
const logger = getLogger('Power')
class Power {
  private blockerId?: number
  private suspendCallbacks: ((...params: any[]) => void)[] = []
  private resumeCallbacks: ((...params: any[]) => void)[] = []
  private lockScreenCallbacks: ((...params: any[]) => void)[] = []
  private unlockScreenCallbacks: ((...params: any[]) => void)[] = []
  public registerSuspendCallback(callback: (...params: any[]) => void) {
    this.suspendCallbacks.push(callback)
  }
  public registerResumeCallback(callback: (...params: any[]) => void) {
    this.resumeCallbacks.push(callback)
  }
  public registerLockScreenCallback(callback: (...params: any[]) => void) {
    this.lockScreenCallbacks.push(callback)
  }
  public registerUnlockScreenCallback(callback: (...params: any[]) => void) {
    this.unlockScreenCallbacks.push(callback)
  }
  private notifyContentGenerationScheduler(action: 'pause' | 'resume', reason: string) {
    axios
      .post(`http://127.0.0.1:${getBackendPort()}/api/content_generation/scheduler/${action}`, { reason })
      .catch((error) => {
        logger.warn(`Failed to ${action} content generation scheduler for ${reason}: ${error.message}`)
      })
  }
  run() {
    this.blockerId = powerSaveBlocker.start('prevent-app-suspension')
    app.on('window-all-closed', () => {
      if (this.blockerId && powerSaveBlocker.isStarted(this.blockerId)) {
        powerSaveBlocker.stop(this.blockerId)
        logger.info('🛑 powerSaveBlocker stopped')
      }
    })

    // Listen for macOS power events
    powerMonitor.on('suspend', () => {
      logger.info('💤 System is about to sleep')
      this.notifyContentGenerationScheduler('pause', 'suspend')
      this.suspendCallbacks.forEach((callback) => callback())
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send(IpcServerPushChannel.PushPowerMonitor, { eventKey: POWER_MONITOR_KEY.Suspend })
      })
    })

    powerMonitor.on('resume', () => {
      logger.info('🌞 System has woken up')
      this.notifyContentGenerationScheduler('resume', 'suspend')
      this.resumeCallbacks.forEach((callback) => callback())
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send(IpcServerPushChannel.PushPowerMonitor, { eventKey: POWER_MONITOR_KEY.Resume })
      })
    })

    powerMonitor.on('lock-screen', () => {
      logger.info('🔒 Screen is locked')
      this.notifyContentGenerationScheduler('pause', 'lock-screen')
      this.lockScreenCallbacks.forEach((callback) => callback())
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send(IpcServerPushChannel.PushPowerMonitor, { eventKey: POWER_MONITOR_KEY.LockScreen })
      })
    })

    powerMonitor.on('unlock-screen', () => {
      logger.info('🔓 Screen is unlocked')
      this.notifyContentGenerationScheduler('resume', 'lock-screen')
      this.unlockScreenCallbacks.forEach((callback) => callback())
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send(IpcServerPushChannel.PushPowerMonitor, { eventKey: POWER_MONITOR_KEY.UnlockScreen })
      })
    })

    powerMonitor.on('speed-limit-change', (e) => {
      monitor.info(`🔋 Power speed limit changed to ${e.limit}`)
    })
    powerMonitor.on('thermal-state-change', (e) => {
      monitor.info(`🔋 Power thermal state changed to ${e.state}`)
    })
  }
  unregister() {
    if (this.blockerId && powerSaveBlocker.isStarted(this.blockerId)) {
      powerSaveBlocker.stop(this.blockerId)
      logger.info('🛑 powerSaveBlocker stopped')
    }
    powerMonitor.removeAllListeners()
  }
}
const powerWatcher = new Power()
export { powerWatcher, Power }
