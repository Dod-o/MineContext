import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Modal, Image, Form, Message } from '@arco-design/web-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSetting } from '@renderer/hooks/use-setting'
import { useScreen } from '@renderer/hooks/use-screen'
import dayjs from 'dayjs'

import { useMemoizedFn, useMount } from 'ahooks'
import {
  appStore,
  loadableCaptureSourcesAtom,
  loadableCaptureSourcesFromSettingsAtom,
  refreshCaptureSourcesAtom,
  refreshCaptureSourcesFromSettingsAtom
} from '@renderer/atom/capture.atom'
import { get, uniqBy } from 'lodash'
import { useAtomValue } from 'jotai'
import { useObservableTask } from '@renderer/atom/event-loop.atom'
// Extracted components
import ScreenMonitorHeader from './components/screen-monitor-header'
import DateNavigation from './components/date-navigation'
import RecordingTimeline from './components/recording-timeline'
import EmptyStatePlaceholder from './components/empty-state-placeholder'
import SettingsModal from './components/settings-modal'
import { getLogger } from '@shared/logger/renderer'
import { IpcChannel } from '@shared/IpcChannel'
import type { RecordingStats } from './components/recording-stats-card'
import { CaptureSource } from '@interface/common/source'
import { getModelInfo, uploadMediaContextAPI, validateModelSettingsAPI } from '@renderer/services/Settings'
import { normalizeScreenSettings, type CaptureTargetMode, type ScreenSettings } from '@renderer/store/setting'

const logger = getLogger('ScreenMonitor')
type ApiConnectionStatus = 'unknown' | 'checking' | 'connected' | 'error'

function getSupportedRecordingMimeType(candidates: string[]) {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || ''
}

function getRecordingExtension(mimeType: string, fallback: string) {
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('ogg')) return 'ogg'
  return fallback
}

function normalizeCaptureSourceText(value?: string | null) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim()
}

function sourcesReferToSameWindow(left: CaptureSource, right: CaptureSource) {
  if (left.id === right.id) {
    return true
  }

  const leftTitle = normalizeCaptureSourceText(left.windowTitle || left.name)
  const rightTitle = normalizeCaptureSourceText(right.windowTitle || right.name)
  if (
    leftTitle &&
    rightTitle &&
    (leftTitle === rightTitle || leftTitle.includes(rightTitle) || rightTitle.includes(leftTitle))
  ) {
    return Math.min(leftTitle.length, rightTitle.length) > 6
  }

  const leftName = normalizeCaptureSourceText(left.name)
  const rightName = normalizeCaptureSourceText(right.name)
  return Boolean(leftName && rightName && leftName === rightName)
}

function sourcesReferToSameScreen(left: CaptureSource, right: CaptureSource) {
  if (left.type !== 'screen' || right.type !== 'screen') {
    return false
  }
  if (left.id === right.id) {
    return true
  }
  if (left.displayId && right.displayId && left.displayId === right.displayId) {
    return true
  }

  const leftName = normalizeCaptureSourceText(left.name)
  const rightName = normalizeCaptureSourceText(right.name)
  return Boolean(leftName && rightName && leftName === rightName)
}

function findSelectableSourceForSavedWindow(savedSource: CaptureSource, selectableSources: CaptureSource[]) {
  return selectableSources.find((source) => sourcesReferToSameWindow(savedSource, source)) || savedSource
}

function findSelectableSourceForSavedScreen(savedSource: CaptureSource, selectableSources: CaptureSource[]) {
  return selectableSources.find((source) => sourcesReferToSameScreen(savedSource, source))
}

export interface Activity {
  id: string
  start_time: string
  end_time: string // Add optional end_time field
  resources: Array<{
    type: string
    id: string
    path: string
  }>
  title: string
  content: string
}

const ScreenMonitor: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    recordInterval,
    captureTargetMode,
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
    setAdaptiveCapture,
    setCaptureTargetMode
  } = useSetting()
  const {
    currentSession,
    hasPermission = false,
    grantPermission,
    selectedImage,
    setSelectedImage,
    getNewActivities,
    getActivitiesByDate
  } = useScreen()
  const [isMonitoring, setIsMonitoring] = useState(false)
  useMount(() => {
    window.serverPushAPI.pushScreenMonitorStatus((status) => {
      setIsMonitoring(status === 'running')
    })
  })
  // Get selectable sources
  const sources = useAtomValue(loadableCaptureSourcesAtom, { store: appStore })
  // Used to update whether the optional application list has been read to render the page
  // const [sourcesRead, setSourcesRead] = useState(false)
  const screenAllSources = useMemo(() => {
    return (sources.state === 'hasData' ? sources.data.screenSources : []).filter((v) => v.isVisible)
  }, [sources])
  const appAllSources = useMemo(() => {
    return sources.state === 'hasData' ? sources.data.appSources : []
  }, [sources])

  const [currentDate, setCurrentDate] = useState(dayjs().toDate())
  const isToday = dayjs(currentDate).isSame(dayjs(), 'day')
  const screenshots = currentSession?.screenshots || {}
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [recordingStats, setRecordingStats] = useState<RecordingStats | null>(null)
  const [captureNowLoading, setCaptureNowLoading] = useState(false)
  const [apiConnectionStatus, setApiConnectionStatus] = useState<ApiConnectionStatus>('unknown')
  const [apiConnectionMessage, setApiConnectionMessage] = useState('')
  const [audioRecording, setAudioRecording] = useState(false)
  const [audioSaving, setAudioSaving] = useState(false)
  const [videoRecording, setVideoRecording] = useState(false)
  const [videoSaving, setVideoSaving] = useState(false)
  const activityPollingRef = useRef<NodeJS.Timeout | null>(null)
  const statsPollingRef = useRef<NodeJS.Timeout | null>(null)
  const audioRecorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioStartedAtRef = useRef<Date | null>(null)
  const videoRecorderRef = useRef<MediaRecorder | null>(null)
  const videoStreamRef = useRef<MediaStream | null>(null)
  const videoChunksRef = useRef<Blob[]>([])
  const videoStartedAtRef = useRef<Date | null>(null)
  const settingsFormInitializedRef = useRef(false)
  const lastCheckedTimeRef = useRef<string>(
    activities.length > 0
      ? activities[activities.length - 1].end_time || activities[activities.length - 1].start_time
      : dayjs().toISOString()
  )
  const isScreenLockedRef = useRef(false)

  // Settings form state
  const [tempRecordInterval, setTempRecordInterval] = useState(recordInterval)
  const [tempCaptureTargetMode, setTempCaptureTargetMode] = useState<CaptureTargetMode>(captureTargetMode)
  const [tempEnableRecordingHours, setTempEnableRecordingHours] = useState(enableRecordingHours)
  const [tempRecordingHours, setTempRecordingHours] = useState<[string, string]>(recordingHours as [string, string])
  const [tempApplyToDays, setTempApplyToDays] = useState(applyToDays)
  const [tempManualCaptureShortcutEnabled, setTempManualCaptureShortcutEnabled] = useState(
    manualCaptureShortcutEnabled
  )
  const [tempManualCaptureShortcut, setTempManualCaptureShortcut] = useState(manualCaptureShortcut)
  const [tempExcludedAppPatterns, setTempExcludedAppPatterns] = useState(excludedAppPatterns)
  const [tempAdaptiveCapture, setTempAdaptiveCapture] = useState(adaptiveCapture)
  const screenSettingsRef = useRef<ScreenSettings>(
    normalizeScreenSettings({
      recordInterval,
      captureTargetMode,
      recordingHours,
      enableRecordingHours,
      applyToDays,
      manualCaptureShortcutEnabled,
      manualCaptureShortcut,
      excludedAppPatterns,
      adaptiveCapture
    })
  )

  useEffect(() => {
    screenSettingsRef.current = normalizeScreenSettings({
      recordInterval,
      captureTargetMode,
      recordingHours,
      enableRecordingHours,
      applyToDays,
      manualCaptureShortcutEnabled,
      manualCaptureShortcut,
      excludedAppPatterns,
      adaptiveCapture
    })
  }, [
    recordInterval,
    captureTargetMode,
    recordingHours,
    enableRecordingHours,
    applyToDays,
    manualCaptureShortcutEnabled,
    manualCaptureShortcut,
    excludedAppPatterns,
    adaptiveCapture
  ])

  // Refresh the application list and trigger a re-render
  const refreshSourcesRead = useMemoizedFn(async () => {
    await appStore.set(refreshCaptureSourcesAtom)
  })

  useEffect(() => {
    const initActivities = async () => {
      const date = dayjs(currentDate).startOf('day').toDate()
      const todayActivities = await getActivitiesByDate(date)
      const todayActivitiesParsed: Activity[] = todayActivities.map((item: any) => ({
        ...item,
        resources: JSON.parse(item.resources)
      }))
      const uniqueActivities = Array.from(new Map(todayActivitiesParsed.map((item) => [item.id, item])).values())
      setActivities(uniqueActivities)

      // Reset lastCheckedTimeRef to the time of the last activity of the day
      if (uniqueActivities.length > 0) {
        const latestActivity = uniqueActivities[uniqueActivities.length - 1]
        lastCheckedTimeRef.current = latestActivity.end_time || latestActivity.start_time
      } else {
        // If there are no activities, reset to the start of the day
        lastCheckedTimeRef.current = dayjs(currentDate).startOf('day').toISOString()
      }
    }
    initActivities()
  }, [currentDate, getActivitiesByDate])

  // Manage polling when date or monitoring status changes
  useEffect(() => {
    if (isMonitoring) {
      if (isToday) {
        // If switched to today and monitoring, start polling
        startActivityPolling()
        startStatsPolling()
      } else {
        // If switched to historical date, stop polling
        stopActivityPolling()
        stopStatsPolling()
      }
    } else {
      // If not monitoring, stop all polling
      stopActivityPolling()
      stopStatsPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, isMonitoring, isToday])

  const handlePreviousDay = () => {
    const newDate = dayjs(currentDate).subtract(1, 'day').toDate()
    setCurrentDate(newDate)
  }

  const handleNextDay = () => {
    const newDate = dayjs(currentDate).add(1, 'day').toDate()
    setCurrentDate(newDate)
  }

  const handleDateChange = (_dateString, date) => {
    setCurrentDate(date.toDate())
  }

  const disabledDate = (current) => {
    return current && dayjs(current).isAfter(dayjs(), 'day')
  }

  // Start monitoring session
  const checkApiConnection = useMemoizedFn(async () => {
    setApiConnectionStatus('checking')
    try {
      const modelInfo = await getModelInfo()
      if (!modelInfo?.config) {
        const message = 'Model settings are incomplete.'
        setApiConnectionStatus('error')
        setApiConnectionMessage(message)
        return { ok: false, message }
      }

      const message = await validateModelSettingsAPI(modelInfo.config)
      setApiConnectionStatus('connected')
      setApiConnectionMessage(message)
      return { ok: true, message }
    } catch (error: any) {
      const message =
        get(error, 'response.data.message') || get(error, 'message') || 'Model API connection check failed.'
      setApiConnectionStatus('error')
      setApiConnectionMessage(message)
      return { ok: false, message }
    }
  })

  const startMonitoring = useMemoizedFn(async () => {
    const apiCheck = await checkApiConnection()
    if (!apiCheck.ok) {
      Message.error(apiCheck.message || 'Model API is unavailable. Check Settings before recording.')
      return
    }

    await window.screenMonitorAPI.updateModelConfig(screenSettingsRef.current)
    await window.screenMonitorAPI.startTask()
    // Start polling for new activities
    startActivityPolling()
    // Start polling for recording stats
    startStatsPolling()
  })

  // Stop monitoring
  const stopMonitoring = useMemoizedFn(async () => {
    if (isMonitoring) {
      await window.screenMonitorAPI.stopTask()
      stopActivityPolling()
      stopStatsPolling()
    }
  })

  const pauseMonitoring = useMemoizedFn(() => {
    logger.info('Screen locked, pausing monitoring timers')
    stopActivityPolling()
    stopStatsPolling()
  })

  // Resume monitoring (when screen is unlocked)
  const resumeMonitoring = useMemoizedFn(() => {
    if (isMonitoring && !isScreenLockedRef.current) {
      // Resume activity polling
      startActivityPolling()
      // Resume stats polling
      startStatsPolling()
    }
  })

  // Start polling for new activities
  const startActivityPolling = useMemoizedFn(() => {
    if (activityPollingRef.current) {
      clearInterval(activityPollingRef.current)
    }
    // Immediately execute a check for new activities
    const checkNewActivities = async () => {
      try {
        // Only poll for new activities when viewing today
        if (!isToday) {
          return
        }

        const newActivities = await getNewActivities(lastCheckedTimeRef.current)
        const newActivitiesParsed: Activity[] = newActivities.map((item: any) => ({
          ...item,
          resources: JSON.parse(item.resources)
        }))
        if (newActivitiesParsed && newActivitiesParsed.length > 0) {
          // Filter activities for the current date
          const currentDateStr = dayjs(currentDate).format('YYYY-MM-DD')
          const filteredActivities = newActivitiesParsed.filter((activity) => {
            const activityDateStr = dayjs(activity.start_time).format('YYYY-MM-DD')
            return activityDateStr === currentDateStr
          })

          if (filteredActivities.length > 0) {
            // Update last checked time to the latest activity's start time
            const latestActivity = filteredActivities[filteredActivities.length - 1]
            lastCheckedTimeRef.current = latestActivity.start_time
            // Add new activities to the beginning of the activities array (maintaining time order) and deduplicate
            setActivities((prev) => {
              const existingIds = new Set(prev.map((a) => a.id))
              const uniqueNewActivities = filteredActivities.filter((a) => !existingIds.has(a.id))
              return [...uniqueNewActivities, ...prev]
            })
          }
        }
      } catch (error) {
        logger.error('Failed to check new activity', { error })
      }
    }
    // Execute immediately
    checkNewActivities()
    // Set timer
    activityPollingRef.current = setInterval(checkNewActivities, 5000) // Poll every 5 seconds
  })

  // Stop polling for new activities
  const stopActivityPolling = useMemoizedFn(() => {
    if (activityPollingRef.current) {
      clearInterval(activityPollingRef.current)
      activityPollingRef.current = null
    }
  })

  // Start polling for recording stats
  const startStatsPolling = useMemoizedFn(() => {
    if (statsPollingRef.current) {
      clearInterval(statsPollingRef.current)
    }

    const fetchStats = async () => {
      try {
        if (!isToday || !isMonitoring) {
          return
        }
        const stats = await window.screenMonitorAPI.getRecordingStats()
        if (stats) {
          setRecordingStats(stats)
        }
      } catch (error) {
        logger.error('Failed to fetch recording stats', { error })
      }
    }

    // Execute immediately
    fetchStats()
    // Poll every 5 seconds
    statsPollingRef.current = setInterval(fetchStats, 5000)
  })

  // Stop polling for recording stats
  const stopStatsPolling = useMemoizedFn(() => {
    if (statsPollingRef.current) {
      clearInterval(statsPollingRef.current)
      statsPollingRef.current = null
    }
    setRecordingStats(null)
  })

  // Clean up polling on component unmount
  useEffect(() => {
    return () => {
      stopActivityPolling()
      stopStatsPolling()
    }
  }, [stopActivityPolling, stopStatsPolling])

  useEffect(() => {
    checkApiConnection()
  }, [checkApiConnection])

  // Listen for lock/unlock screen events
  useObservableTask(
    {
      active: () => {
        isScreenLockedRef.current = true
        if (isMonitoring) {
          pauseMonitoring()
        }
      },
      inactive: () => {
        isScreenLockedRef.current = false
        if (isMonitoring) {
          resumeMonitoring()
        }
      }
    },
    'screen-monitor'
  )

  // Listen for tray toggle recording event (from Router.tsx when already on this page)
  useEffect(() => {
    const handleTrayToggleRecording = () => {
      if (isMonitoring) {
        stopMonitoring()
      } else {
        startMonitoring()
      }
    }

    window.addEventListener('tray-toggle-recording', handleTrayToggleRecording)

    return () => {
      window.removeEventListener('tray-toggle-recording', handleTrayToggleRecording)
    }
  }, [isMonitoring, startMonitoring, stopMonitoring])

  // Handle navigation state when coming from tray icon while on a different page
  useEffect(() => {
    const state = location.state as { toggleRecording?: boolean } | null
    if (state?.toggleRecording) {
      // Clear the navigation state first to prevent re-triggering
      navigate(location.pathname, { replace: true, state: {} })

      // Toggle recording based on current state
      if (isMonitoring) {
        stopMonitoring()
      } else {
        startMonitoring()
      }
    }
    // Only depend on location.state to avoid re-triggering when isMonitoring changes
    // startMonitoring and stopMonitoring are memoized so they're stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const openSettings = useMemoizedFn(async () => {
    // Refresh the application list before opening settings
    try {
      setSettingsVisible(true)
      await refreshSourcesRead()
    } catch (error) {
      logger.error('Failed to refresh application list', { error })
    }
  })
  const [applicationVisible, setApplicationVisible] = useState(false)

  useEffect(() => {
    if (settingsVisible) {
      settingsFormInitializedRef.current = false
    }
  }, [settingsVisible])

  useEffect(() => {
    if (!settingsVisible) {
      return
    }

    const interval = setInterval(() => {
      appStore.set(refreshCaptureSourcesAtom).catch((error) => {
        logger.error('Failed to refresh application list', { error })
      })
    }, 3000)

    return () => {
      clearInterval(interval)
    }
  }, [settingsVisible])

  const handleCancelSettings = useMemoizedFn(() => {
    setTempRecordInterval(recordInterval)
    setTempCaptureTargetMode(captureTargetMode)
    setTempEnableRecordingHours(enableRecordingHours)
    setTempRecordingHours(recordingHours as [string, string])
    setTempApplyToDays(applyToDays)
    setTempManualCaptureShortcutEnabled(manualCaptureShortcutEnabled)
    setTempManualCaptureShortcut(manualCaptureShortcut)
    setTempExcludedAppPatterns(excludedAppPatterns)
    setTempAdaptiveCapture(adaptiveCapture)
    setSettingsVisible(false)
    setApplicationVisible(false)
  })

  const handleSaveSettings = useMemoizedFn(async () => {
    const nextSettings = normalizeScreenSettings({
      recordInterval: tempRecordInterval,
      captureTargetMode: tempCaptureTargetMode,
      enableRecordingHours: tempEnableRecordingHours,
      recordingHours: tempRecordingHours,
      applyToDays: tempApplyToDays,
      manualCaptureShortcutEnabled: tempManualCaptureShortcutEnabled,
      manualCaptureShortcut: tempManualCaptureShortcut,
      excludedAppPatterns: tempExcludedAppPatterns,
      adaptiveCapture: tempAdaptiveCapture
    })

    screenSettingsRef.current = nextSettings
    setRecordInterval(nextSettings.recordInterval)
    setCaptureTargetMode(nextSettings.captureTargetMode)
    setEnableRecordingHours(nextSettings.enableRecordingHours)
    setRecordingHours(nextSettings.recordingHours)
    setApplyToDays(nextSettings.applyToDays)
    setManualCaptureShortcutEnabled(nextSettings.manualCaptureShortcutEnabled)
    setManualCaptureShortcut(nextSettings.manualCaptureShortcut)
    setExcludedAppPatterns(nextSettings.excludedAppPatterns)
    setAdaptiveCapture(nextSettings.adaptiveCapture)
    await window.screenMonitorAPI.updateModelConfig(nextSettings)
    setSettingsVisible(false)
  })

  // Check if recording is possible under the current settings
  const [canRecord, setCanRecord] = useState(false)
  const checkCanRecord = useMemoizedFn(async () => {
    const result = await window.screenMonitorAPI.checkCanRecord()
    setCanRecord(result.canRecord)
    setIsMonitoring(result.status === 'running')
    return result
  })

  // Check recording status on component mount
  useEffect(() => {
    checkCanRecord()
  }, [setCanRecord])

  // Periodically check recording status
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    if (isMonitoring && enableRecordingHours) {
      interval = setInterval(() => {
        checkCanRecord()
      }, 60000) // Check every minute
    }
    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [isMonitoring, enableRecordingHours, checkCanRecord])

  // Sync recording status to tray
  useEffect(() => {
    if (isToday) {
      window.electron.ipcRenderer
        .invoke(IpcChannel.Tray_UpdateRecordingStatus, isMonitoring && canRecord)
        .catch((error) => {
          logger.error('Failed to update tray recording status:', error)
        })
    }
  }, [isMonitoring, canRecord, isToday])

  // Get sources
  const settingSources = useAtomValue(loadableCaptureSourcesFromSettingsAtom, { store: appStore })
  const settingScreenSources = useMemo(
    () => (settingSources.state === 'hasData' ? get(settingSources, 'data.screenSources') : ([] as CaptureSource[])),
    [settingSources]
  )
  const settingWindowSources = useMemo(
    () => (settingSources.state === 'hasData' ? get(settingSources, 'data.appSources') : ([] as CaptureSource[])),
    [settingSources]
  )
  const hasSavedCaptureSettings = settingSources.state === 'hasData' ? get(settingSources, 'data.hasSettings') : false
  const selectableWindowSources = useMemo(() => {
    const currentWindowSources = appAllSources || []
    const savedOnlySources = (settingWindowSources || []).filter(
      (savedSource) => !currentWindowSources.some((source) => sourcesReferToSameWindow(savedSource, source))
    )
    return uniqBy([...currentWindowSources, ...savedOnlySources], 'id')
  }, [appAllSources, settingWindowSources])
  const [form] = Form.useForm<{ screenSources?: string[]; windowSources?: string[] }>()
  const entry = useMemoizedFn(async () => {
    const screenList = uniqBy(
      (settingScreenSources || [])
        .map((source) => findSelectableSourceForSavedScreen(source, screenAllSources || []))
        .filter((source): source is CaptureSource => Boolean(source)),
      'id'
    )
    const windowList = uniqBy(
      (settingWindowSources || []).map((source) => findSelectableSourceForSavedWindow(source, selectableWindowSources)),
      'id'
    )
    const defaultScreenList =
      !hasSavedCaptureSettings && screenList.length === 0 && windowList.length === 0
        ? [get(screenAllSources, 0)].filter(Boolean)
        : []
    const selectedScreenList = screenList.length > 0 ? screenList : defaultScreenList
    const screenSources = selectedScreenList.map((source) => source.id)
    form.setFieldsValue({
      screenSources,
      windowSources: windowList.map((source) => source.id)
    })
    await window.screenMonitorAPI.updateCurrentRecordApp([...selectedScreenList, ...windowList])
  })

  const captureNow = useMemoizedFn(async () => {
    if (captureNowLoading) {
      return
    }
    setCaptureNowLoading(true)
    try {
      const result = await window.screenMonitorAPI.captureNow()
      if (result.success) {
        Message.success(`Captured ${result.capturedCount} screenshot${result.capturedCount === 1 ? '' : 's'}`)
        if (isToday) {
          startActivityPolling()
          startStatsPolling()
        }
      } else {
        Message.error(result.error || 'Manual screenshot failed')
      }
    } catch (error: any) {
      Message.error(get(error, 'message') || 'Manual screenshot failed')
    } finally {
      setCaptureNowLoading(false)
    }
  })

  const cleanupAudioRecordingStream = useMemoizedFn(() => {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop())
    audioStreamRef.current = null
    audioRecorderRef.current = null
  })

  const startAudioRecording = useMemoizedFn(async () => {
    if (audioRecording || audioSaving) {
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      Message.error('Audio recording is not supported in this environment.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedRecordingMimeType([
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ])
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      audioChunksRef.current = []
      audioStartedAtRef.current = new Date()
      audioStreamRef.current = stream
      audioRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onerror = (event) => {
        logger.error('Audio recording failed', { event })
        Message.error('Audio recording failed.')
        setAudioRecording(false)
        setAudioSaving(false)
        cleanupAudioRecordingStream()
      }

      recorder.onstop = async () => {
        const endedAt = new Date()
        const chunks = audioChunksRef.current
        const startedAt = audioStartedAtRef.current || endedAt
        cleanupAudioRecordingStream()
        setAudioRecording(false)

        if (!chunks.length) {
          setAudioSaving(false)
          Message.warning('No audio data was recorded.')
          return
        }

        const blobType = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunks, { type: blobType })
        const extension = getRecordingExtension(blobType, 'webm')
        const filename = `audio-recording-${dayjs(startedAt).format('YYYYMMDD-HHmmss')}.${extension}`

        try {
          await uploadMediaContextAPI({
            mediaType: 'audio',
            file: blob,
            filename,
            title: 'Audio recording',
            startedAt: startedAt.toISOString(),
            endedAt: endedAt.toISOString(),
            summary: `Audio recording captured from ${dayjs(startedAt).format('YYYY-MM-DD HH:mm:ss')} to ${dayjs(
              endedAt
            ).format('YYYY-MM-DD HH:mm:ss')}.`
          })
          Message.success('Audio recording saved to context')
        } catch (error: any) {
          Message.error(get(error, 'response.data.message') || get(error, 'message') || 'Failed to save audio recording')
        } finally {
          setAudioSaving(false)
          audioChunksRef.current = []
          audioStartedAtRef.current = null
        }
      }

      recorder.start(1000)
      setAudioRecording(true)
      Message.success('Audio recording started')
    } catch (error: any) {
      cleanupAudioRecordingStream()
      setAudioRecording(false)
      setAudioSaving(false)
      Message.error(get(error, 'message') || 'Failed to start audio recording')
    }
  })

  const stopAudioRecording = useMemoizedFn(() => {
    const recorder = audioRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      cleanupAudioRecordingStream()
      setAudioRecording(false)
      setAudioSaving(false)
      return
    }
    setAudioSaving(true)
    recorder.stop()
  })

  const cleanupVideoRecordingStream = useMemoizedFn(() => {
    videoStreamRef.current?.getTracks().forEach((track) => track.stop())
    videoStreamRef.current = null
    videoRecorderRef.current = null
  })

  const startVideoRecording = useMemoizedFn(async () => {
    if (videoRecording || videoSaving) {
      return
    }
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      Message.error('Video recording is not supported in this environment.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 2, max: 5 }
        },
        audio: true
      })
      const mimeType = getSupportedRecordingMimeType([
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ])
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      videoChunksRef.current = []
      videoStartedAtRef.current = new Date()
      videoStreamRef.current = stream
      videoRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoChunksRef.current.push(event.data)
        }
      }

      recorder.onerror = (event) => {
        logger.error('Video recording failed', { event })
        Message.error('Video recording failed.')
        setVideoRecording(false)
        setVideoSaving(false)
        cleanupVideoRecordingStream()
      }

      recorder.onstop = async () => {
        const endedAt = new Date()
        const chunks = videoChunksRef.current
        const startedAt = videoStartedAtRef.current || endedAt
        cleanupVideoRecordingStream()
        setVideoRecording(false)

        if (!chunks.length) {
          setVideoSaving(false)
          Message.warning('No video data was recorded.')
          return
        }

        const blobType = recorder.mimeType || mimeType || 'video/webm'
        const blob = new Blob(chunks, { type: blobType })
        const extension = getRecordingExtension(blobType, 'webm')
        const filename = `video-recording-${dayjs(startedAt).format('YYYYMMDD-HHmmss')}.${extension}`

        try {
          await uploadMediaContextAPI({
            mediaType: 'video',
            file: blob,
            filename,
            title: 'Video recording',
            startedAt: startedAt.toISOString(),
            endedAt: endedAt.toISOString(),
            summary: `Screen video recording captured from ${dayjs(startedAt).format(
              'YYYY-MM-DD HH:mm:ss'
            )} to ${dayjs(endedAt).format('YYYY-MM-DD HH:mm:ss')}.`
          })
          Message.success('Video recording saved to context')
        } catch (error: any) {
          Message.error(get(error, 'response.data.message') || get(error, 'message') || 'Failed to save video recording')
        } finally {
          setVideoSaving(false)
          videoChunksRef.current = []
          videoStartedAtRef.current = null
        }
      }

      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') {
            setVideoSaving(true)
            videoRecorderRef.current.stop()
          }
        })
      })

      recorder.start(1000)
      setVideoRecording(true)
      Message.success('Video recording started')
    } catch (error: any) {
      cleanupVideoRecordingStream()
      setVideoRecording(false)
      setVideoSaving(false)
      Message.error(get(error, 'message') || 'Failed to start video recording')
    }
  })

  const stopVideoRecording = useMemoizedFn(() => {
    const recorder = videoRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      cleanupVideoRecordingStream()
      setVideoRecording(false)
      setVideoSaving(false)
      return
    }
    setVideoSaving(true)
    recorder.stop()
  })

  // Tips: The biggest problem with using Form for management is that when the user does not select any screen or window, it will cause the save to fail
  const handleSave = useMemoizedFn(async () => {
    const values = form.getFieldsValue()
    if (
      tempCaptureTargetMode === 'selected' &&
      ![...(values.screenSources || []), ...(values.windowSources || [])].length
    ) {
      Message.info('Please select at least one screen or window')
      return
    }
    const screenList = screenAllSources?.filter((source) => values.screenSources?.includes(source.id)) || []
    const rememberedOfflineScreens = (settingScreenSources || []).filter(
      (savedSource) => !screenAllSources.some((source) => sourcesReferToSameScreen(savedSource, source))
    )
    const persistedScreenList = uniqBy([...screenList, ...rememberedOfflineScreens], 'id')
    const windowList = selectableWindowSources?.filter((source) => values.windowSources?.includes(source.id)) || []
    await window.screenMonitorAPI.setSettings('settings', {
      screenList: persistedScreenList,
      windowList
    })
    await window.screenMonitorAPI.updateCurrentRecordApp([...screenList, ...windowList])
    await handleSaveSettings()
    await appStore.set(refreshCaptureSourcesFromSettingsAtom)
  })

  useEffect(() => {
    const shouldSyncSettings = !settingsVisible || !settingsFormInitializedRef.current
    if (settingSources.state === 'hasData' && sources.state === 'hasData' && shouldSyncSettings) {
      entry()
      setTempRecordInterval(recordInterval)
      setTempCaptureTargetMode(captureTargetMode)
      setTempEnableRecordingHours(enableRecordingHours)
      setTempRecordingHours(recordingHours as [string, string])
      setTempApplyToDays(applyToDays)
      setTempManualCaptureShortcutEnabled(manualCaptureShortcutEnabled)
      setTempManualCaptureShortcut(manualCaptureShortcut)
      setTempExcludedAppPatterns(excludedAppPatterns)
      setTempAdaptiveCapture(adaptiveCapture)
      if (settingsVisible) {
        settingsFormInitializedRef.current = true
      }
    }
  }, [settingSources, sources, settingsVisible])

  const handleRequestPermission = useMemoizedFn(async () => {
    await grantPermission()
  })

  return (
    <div className="top-0 left-0 flex flex-col h-screen overflow-y-hidden pr-2 pb-2 pl-0 rounded-[20px] relative">
      <div style={{ height: '8px', appRegion: 'drag' } as React.CSSProperties} />
      <div className="bg-white rounded-[16px] p-6 h-[calc(100%-8px)] flex flex-col overflow-y-auto overflow-x-hidden scrollbar-hide pb-2">
        <ScreenMonitorHeader
          hasPermission={hasPermission}
          isMonitoring={isMonitoring}
          isToday={isToday}
          apiConnectionStatus={apiConnectionStatus}
          apiConnectionMessage={apiConnectionMessage}
          screenAllSources={screenAllSources}
          appAllSources={appAllSources}
          onOpenSettings={openSettings}
          onCheckApiConnection={checkApiConnection}
          onCaptureNow={captureNow}
          captureNowLoading={captureNowLoading}
          audioRecording={audioRecording}
          audioSaving={audioSaving}
          onStartAudioRecording={startAudioRecording}
          onStopAudioRecording={stopAudioRecording}
          videoRecording={videoRecording}
          videoSaving={videoSaving}
          onStartVideoRecording={startVideoRecording}
          onStopVideoRecording={stopVideoRecording}
          onStartMonitoring={startMonitoring}
          onStopMonitoring={stopMonitoring}
          onRequestPermission={handleRequestPermission}
        />

        {/* Recording area */}
        <div className="w-full mb-0 mx-auto flex-1 flex flex-col">
          <div className="border-2 border-dashed border-gray-300 rounded-[12px] p-[30px] bg-gray-50 transition-all duration-300 flex-1 flex flex-col overflow-auto">
            <DateNavigation
              hasPermission={hasPermission}
              currentDate={currentDate}
              isToday={isToday}
              onPreviousDay={handlePreviousDay}
              onNextDay={handleNextDay}
              onDateChange={handleDateChange}
              onSetCurrentDate={setCurrentDate}
              disabledDate={disabledDate}
            />
            {(isMonitoring && isToday) || activities.length > 0 || Object.keys(screenshots).length > 0 ? (
              <RecordingTimeline
                isMonitoring={isMonitoring}
                isToday={isToday}
                canRecord={canRecord}
                activities={activities}
                recordingStats={recordingStats}
              />
            ) : (
              <EmptyStatePlaceholder
                hasPermission={hasPermission}
                isToday={isToday}
                onGrantPermission={grantPermission}
              />
            )}
          </div>
        </div>

        <Modal
          style={{ width: '60%', minHeight: '30%' }}
          title="Display Screenshot"
          visible={!!selectedImage}
          onCancel={() => setSelectedImage(null)}
          footer={null}>
          {selectedImage && (
            <Image src={selectedImage} alt="Display Screenshot" style={{ width: '100%', borderRadius: 8 }} />
          )}
        </Modal>

        <SettingsModal
          visible={settingsVisible}
          form={form}
          sources={sources}
          screenAllSources={screenAllSources}
          appAllSources={selectableWindowSources}
          applicationVisible={applicationVisible}
          tempRecordInterval={tempRecordInterval}
          tempCaptureTargetMode={tempCaptureTargetMode}
          tempEnableRecordingHours={tempEnableRecordingHours}
          tempRecordingHours={tempRecordingHours}
          tempApplyToDays={tempApplyToDays}
          tempManualCaptureShortcutEnabled={tempManualCaptureShortcutEnabled}
          tempManualCaptureShortcut={tempManualCaptureShortcut}
          tempExcludedAppPatterns={tempExcludedAppPatterns}
          tempAdaptiveCapture={tempAdaptiveCapture}
          onCancel={handleCancelSettings}
          onSave={handleSave}
          onSetApplicationVisible={setApplicationVisible}
          onSetTempRecordInterval={setTempRecordInterval}
          onSetTempCaptureTargetMode={setTempCaptureTargetMode}
          onSetTempEnableRecordingHours={setTempEnableRecordingHours}
          onSetTempRecordingHours={setTempRecordingHours}
          onSetTempApplyToDays={setTempApplyToDays}
          onSetTempManualCaptureShortcutEnabled={setTempManualCaptureShortcutEnabled}
          onSetTempManualCaptureShortcut={setTempManualCaptureShortcut}
          onSetTempExcludedAppPatterns={setTempExcludedAppPatterns}
          onSetTempAdaptiveCapture={setTempAdaptiveCapture}
        />
      </div>
    </div>
  )
}

export default ScreenMonitor
