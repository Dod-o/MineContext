// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

export const DEFAULT_BACKEND_START_PORT = 1733
export const MIN_BACKEND_START_PORT = 1024
export const MAX_BACKEND_START_PORT = 65535

export interface AppRuntimeSettings {
  screenshotDirectory: string
  backendStartPort: number
  retainScreenshotImages: boolean
}

export const defaultAppRuntimeSettings: AppRuntimeSettings = {
  screenshotDirectory: '',
  backendStartPort: DEFAULT_BACKEND_START_PORT,
  retainScreenshotImages: true
}

export function normalizeBackendStartPort(value: unknown): number {
  const port = Number(value)
  if (!Number.isInteger(port)) {
    return DEFAULT_BACKEND_START_PORT
  }

  if (port < MIN_BACKEND_START_PORT || port > MAX_BACKEND_START_PORT) {
    return DEFAULT_BACKEND_START_PORT
  }

  return port
}

export function normalizeAppRuntimeSettings(settings?: Partial<AppRuntimeSettings> | null): AppRuntimeSettings {
  return {
    screenshotDirectory: typeof settings?.screenshotDirectory === 'string' ? settings.screenshotDirectory.trim() : '',
    backendStartPort: normalizeBackendStartPort(settings?.backendStartPort),
    retainScreenshotImages: settings?.retainScreenshotImages !== false
  }
}
