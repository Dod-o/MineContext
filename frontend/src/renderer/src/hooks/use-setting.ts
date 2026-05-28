// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { useCallback } from 'react'
import { useSelector } from 'react-redux'
import { RootState, useAppDispatch } from '@renderer/store'
import {
  normalizeScreenSettings,
  setScreenSettings as setScreenSettingsAction,
  type AdaptiveCaptureSettings,
  type ApplyToDays
} from '@renderer/store/setting'

export const useSetting = () => {
  const dispatch = useAppDispatch()
  const storedScreenSettings = useSelector((state: RootState) => state.setting.screenSettings)
  const screenSettings = normalizeScreenSettings(storedScreenSettings)

  const {
    recordInterval,
    recordingHours,
    enableRecordingHours,
    applyToDays,
    excludedAppPatterns,
    manualCaptureShortcutEnabled,
    manualCaptureShortcut,
    adaptiveCapture
  } = screenSettings

  const setRecordInterval = useCallback(
    (interval: number) => {
      dispatch(setScreenSettingsAction({ recordInterval: interval }))
    },
    [dispatch]
  )

  const setEnableRecordingHours = useCallback(
    (enable: boolean) => {
      dispatch(setScreenSettingsAction({ enableRecordingHours: enable }))
    },
    [dispatch]
  )

  const setRecordingHours = useCallback(
    (hours: [string, string]) => {
      dispatch(setScreenSettingsAction({ recordingHours: hours }))
    },
    [dispatch]
  )

  const setApplyToDays = useCallback(
    (days: ApplyToDays) => {
      dispatch(setScreenSettingsAction({ applyToDays: days }))
    },
    [dispatch]
  )

  const setManualCaptureShortcutEnabled = useCallback(
    (enabled: boolean) => {
      dispatch(setScreenSettingsAction({ manualCaptureShortcutEnabled: enabled }))
    },
    [dispatch]
  )

  const setExcludedAppPatterns = useCallback(
    (patterns: string[]) => {
      dispatch(setScreenSettingsAction({ excludedAppPatterns: patterns }))
    },
    [dispatch]
  )

  const setManualCaptureShortcut = useCallback(
    (shortcut: string) => {
      dispatch(setScreenSettingsAction({ manualCaptureShortcut: shortcut }))
    },
    [dispatch]
  )

  const setAdaptiveCapture = useCallback(
    (settings: AdaptiveCaptureSettings) => {
      dispatch(setScreenSettingsAction({ adaptiveCapture: settings }))
    },
    [dispatch]
  )

  return {
    recordInterval,
    recordingHours,
    enableRecordingHours,
    applyToDays,
    excludedAppPatterns,
    manualCaptureShortcutEnabled,
    manualCaptureShortcut,
    adaptiveCapture,
    setRecordInterval,
    setEnableRecordingHours,
    setRecordingHours,
    setApplyToDays,
    setExcludedAppPatterns,
    setManualCaptureShortcutEnabled,
    setManualCaptureShortcut,
    setAdaptiveCapture
  }
}
