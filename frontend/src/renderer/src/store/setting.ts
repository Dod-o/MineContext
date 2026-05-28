// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { defaultScreenSettings, normalizeScreenSettings, type PartialScreenSettings } from '@shared/screen-settings'

export {
  defaultAdaptiveCaptureSettings,
  defaultScreenSettings,
  normalizeAdaptiveCaptureSettings,
  normalizeScreenSettings
} from '@shared/screen-settings'
export type {
  AdaptiveCaptureRuleSetting,
  AdaptiveCaptureSettings,
  ApplyToDays,
  CaptureTargetMode,
  PartialAdaptiveCaptureSettings,
  PartialScreenSettings,
  ScreenSettings
} from '@shared/screen-settings'

const initialState = {
  screenSettings: defaultScreenSettings
  // other settings...
}

const settingSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setScreenSettings(state, action: PayloadAction<PartialScreenSettings>) {
      const currentSettings = normalizeScreenSettings(state.screenSettings)
      state.screenSettings = normalizeScreenSettings({
        ...currentSettings,
        ...action.payload,
        adaptiveCapture: {
          ...currentSettings.adaptiveCapture,
          ...action.payload.adaptiveCapture,
          windowSwitch: {
            ...currentSettings.adaptiveCapture.windowSwitch,
            ...action.payload.adaptiveCapture?.windowSwitch
          },
          activeAppStable: {
            ...currentSettings.adaptiveCapture.activeAppStable,
            ...action.payload.adaptiveCapture?.activeAppStable
          },
          idleResume: {
            ...currentSettings.adaptiveCapture.idleResume,
            ...action.payload.adaptiveCapture?.idleResume
          }
        }
      })
    }
  }
})

export const { setScreenSettings } = settingSlice.actions

export default settingSlice.reducer
