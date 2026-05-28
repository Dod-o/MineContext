// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

export const DEFAULT_BACKEND_START_PORT = 1733
export const MIN_BACKEND_START_PORT = 1024
export const MAX_BACKEND_START_PORT = 65535
export const DEFAULT_PROXY_BYPASS_RULES = 'localhost,127.0.0.1,::1'

export type AppProxyMode = 'system' | 'direct' | 'custom'

export interface AppRuntimeSettings {
  screenshotDirectory: string
  backendStartPort: number
  retainScreenshotImages: boolean
  proxyMode: AppProxyMode
  proxyUrl: string
  proxyBypassRules: string
}

export const defaultAppRuntimeSettings: AppRuntimeSettings = {
  screenshotDirectory: '',
  backendStartPort: DEFAULT_BACKEND_START_PORT,
  retainScreenshotImages: true,
  proxyMode: 'system',
  proxyUrl: '',
  proxyBypassRules: DEFAULT_PROXY_BYPASS_RULES
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

export function normalizeProxyMode(value: unknown): AppProxyMode {
  if (value === 'direct' || value === 'custom') {
    return value
  }
  return 'system'
}

export function normalizeProxyUrl(value: unknown): string {
  const proxyUrl = typeof value === 'string' ? value.trim() : ''
  if (!proxyUrl) {
    return ''
  }

  try {
    const url = new URL(proxyUrl)
    if (
      url.protocol === 'http:' ||
      url.protocol === 'https:' ||
      url.protocol === 'socks4:' ||
      url.protocol === 'socks5:'
    ) {
      return proxyUrl
    }
  } catch {
    return ''
  }

  return ''
}

export function normalizeAppRuntimeSettings(settings?: Partial<AppRuntimeSettings> | null): AppRuntimeSettings {
  return {
    screenshotDirectory: typeof settings?.screenshotDirectory === 'string' ? settings.screenshotDirectory.trim() : '',
    backendStartPort: normalizeBackendStartPort(settings?.backendStartPort),
    retainScreenshotImages: settings?.retainScreenshotImages !== false,
    proxyMode: normalizeProxyMode(settings?.proxyMode),
    proxyUrl: normalizeProxyUrl(settings?.proxyUrl),
    proxyBypassRules:
      typeof settings?.proxyBypassRules === 'string' && settings.proxyBypassRules.trim()
        ? settings.proxyBypassRules.trim()
        : DEFAULT_PROXY_BYPASS_RULES
  }
}
