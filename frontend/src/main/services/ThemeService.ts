// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { BrowserWindow, nativeTheme } from 'electron'
import { IpcChannel } from '@shared/IpcChannel'
import { DEFAULT_THEME_MODE, isThemeMode, type ThemeMode, type ThemeState } from '@shared/theme'

import { localStoreService } from './LocalStoreService'

const THEME_SETTING_KEY = 'appearance.theme'

class ThemeService {
  private initialized = false

  public init() {
    nativeTheme.themeSource = this.getStoredMode()

    if (!this.initialized) {
      nativeTheme.on('updated', () => this.broadcastTheme())
      this.initialized = true
    }
  }

  public getTheme(): ThemeState {
    return {
      mode: this.getStoredMode(),
      resolved: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    }
  }

  public setTheme(mode: ThemeMode): ThemeState {
    const normalizedMode = isThemeMode(mode) ? mode : DEFAULT_THEME_MODE
    localStoreService.setSetting(THEME_SETTING_KEY, normalizedMode)
    nativeTheme.themeSource = normalizedMode

    const state = this.getTheme()
    this.broadcastTheme(state)
    return state
  }

  private getStoredMode(): ThemeMode {
    const storedMode = localStoreService.getSetting(THEME_SETTING_KEY)
    return isThemeMode(storedMode) ? storedMode : DEFAULT_THEME_MODE
  }

  private broadcastTheme = (state: ThemeState = this.getTheme()) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IpcChannel.ThemeUpdated, state)
      }
    })
  }
}

export const themeService = new ThemeService()
