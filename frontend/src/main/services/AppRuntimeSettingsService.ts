// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs'
import path from 'node:path'

import {
  type AppRuntimeSettings,
  normalizeAppRuntimeSettings
} from '@shared/app-runtime-settings'
import { resolveDefaultScreenshotActivityRoot } from '@main/utils/data-path'

import { localStoreService } from './LocalStoreService'

const APP_RUNTIME_SETTINGS_KEY = 'app-runtime-settings'

class AppRuntimeSettingsService {
  public getSettings(): AppRuntimeSettings {
    return normalizeAppRuntimeSettings(
      localStoreService.getSetting(APP_RUNTIME_SETTINGS_KEY) as Partial<AppRuntimeSettings> | undefined
    )
  }

  public async setSettings(settings: Partial<AppRuntimeSettings>): Promise<AppRuntimeSettings> {
    const nextSettings = normalizeAppRuntimeSettings({
      ...this.getSettings(),
      ...settings
    })

    if (nextSettings.screenshotDirectory) {
      await this.ensureWritableDirectory(nextSettings.screenshotDirectory)
      nextSettings.screenshotDirectory = path.resolve(nextSettings.screenshotDirectory)
    }

    localStoreService.setSetting(APP_RUNTIME_SETTINGS_KEY, nextSettings)
    return nextSettings
  }

  public resolveScreenshotActivityRoot(): string {
    const { screenshotDirectory } = this.getSettings()
    return screenshotDirectory ? path.resolve(screenshotDirectory) : resolveDefaultScreenshotActivityRoot()
  }

  public getBackendStartPort(): number {
    return this.getSettings().backendStartPort
  }

  private async ensureWritableDirectory(directory: string) {
    const resolvedDirectory = path.resolve(directory)
    await fs.promises.mkdir(resolvedDirectory, { recursive: true })

    const writeTestPath = path.join(resolvedDirectory, `.minecontext-write-test-${process.pid}-${Date.now()}`)
    await fs.promises.writeFile(writeTestPath, '')
    await fs.promises.unlink(writeTestPath).catch(() => undefined)
  }
}

export const appRuntimeSettingsService = new AppRuntimeSettingsService()
