// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

export type ApplyToDays = 'weekday' | 'everyday'
export type CaptureTargetMode = 'selected' | 'active-screen'

export interface AdaptiveCaptureRuleSetting {
  enabled: boolean
  delaySeconds: number
}

export interface AdaptiveCaptureSettings {
  enabled: boolean
  windowSwitch: AdaptiveCaptureRuleSetting
  activeAppStable: AdaptiveCaptureRuleSetting
  idleResume: AdaptiveCaptureRuleSetting
}

export interface ScreenSettings {
  recordInterval: number
  captureTargetMode: CaptureTargetMode
  enableRecordingHours: boolean
  recordingHours: [string, string]
  applyToDays: ApplyToDays
  excludedAppPatterns: string[]
  manualCaptureShortcutEnabled: boolean
  manualCaptureShortcut: string
  adaptiveCapture: AdaptiveCaptureSettings
}

export type PartialAdaptiveCaptureSettings = Partial<{
  enabled: boolean
  windowSwitch: Partial<AdaptiveCaptureRuleSetting>
  activeAppStable: Partial<AdaptiveCaptureRuleSetting>
  idleResume: Partial<AdaptiveCaptureRuleSetting>
}>

export type PartialScreenSettings = Partial<Omit<ScreenSettings, 'adaptiveCapture'>> & {
  adaptiveCapture?: PartialAdaptiveCaptureSettings
}

export const defaultAdaptiveCaptureSettings: AdaptiveCaptureSettings = {
  enabled: false,
  windowSwitch: {
    enabled: true,
    delaySeconds: 3
  },
  activeAppStable: {
    enabled: false,
    delaySeconds: 8
  },
  idleResume: {
    enabled: true,
    delaySeconds: 5
  }
}

export const defaultScreenSettings: ScreenSettings = {
  recordInterval: 15,
  captureTargetMode: 'selected',
  enableRecordingHours: false,
  recordingHours: ['08:00:00', '20:00:00'],
  applyToDays: 'weekday',
  excludedAppPatterns: [],
  manualCaptureShortcutEnabled: true,
  manualCaptureShortcut: 'CommandOrControl+Shift+S',
  adaptiveCapture: defaultAdaptiveCaptureSettings
}

export function normalizeAdaptiveCaptureSettings(
  settings?: PartialAdaptiveCaptureSettings
): AdaptiveCaptureSettings {
  return {
    ...defaultAdaptiveCaptureSettings,
    ...(settings || {}),
    windowSwitch: {
      ...defaultAdaptiveCaptureSettings.windowSwitch,
      ...(settings?.windowSwitch || {})
    },
    activeAppStable: {
      ...defaultAdaptiveCaptureSettings.activeAppStable,
      ...(settings?.activeAppStable || {})
    },
    idleResume: {
      ...defaultAdaptiveCaptureSettings.idleResume,
      ...(settings?.idleResume || {})
    }
  }
}

export function normalizeScreenSettings(settings?: PartialScreenSettings): ScreenSettings {
  const captureTargetMode = settings?.captureTargetMode === 'active-screen' ? 'active-screen' : 'selected'

  return {
    ...defaultScreenSettings,
    ...(settings || {}),
    captureTargetMode,
    excludedAppPatterns: Array.isArray(settings?.excludedAppPatterns)
      ? settings.excludedAppPatterns
          .map((pattern) => (typeof pattern === 'string' ? pattern.trim() : ''))
          .filter(Boolean)
      : defaultScreenSettings.excludedAppPatterns,
    adaptiveCapture: normalizeAdaptiveCaptureSettings(settings?.adaptiveCapture)
  }
}
