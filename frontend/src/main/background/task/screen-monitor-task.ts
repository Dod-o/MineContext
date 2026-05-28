import { normalizeScreenSettings, type ScreenSettings } from '@shared/screen-settings'
import { CaptureSource } from '@interface/common/source'
import { IpcServerPushChannel } from '@shared/ipc-server-push-channel'
import { BrowserWindow, globalShortcut, ipcMain, powerMonitor } from 'electron'
import { get, pick, uniqBy } from 'lodash'
import screenshotService from '../../services/ScreenshotService'
import { AutoRefreshCache } from './cache-value'
import { getLogger } from '@shared/logger/main'
import PQueue from 'p-queue'
import axios from 'axios'
import { getBackendPort } from '@main/backend'
import dayjs, { Dayjs } from 'dayjs'
import { IpcChannel } from '@shared/IpcChannel'
import { powerWatcher } from '../os/Power'
import isBetween from 'dayjs/plugin/isBetween'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import { ScheduleNextTask } from './schedule-next-task'

dayjs.extend(isBetween)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)
const queue = new PQueue({ concurrency: 3 })

const logger = getLogger('ScreenMonitorTask')
const IDLE_CAPTURE_SKIP_THRESHOLD_SECONDS = 5 * 60
const ADAPTIVE_CAPTURE_POLL_INTERVAL_MS = 1000

type CaptureMode = 'scheduled' | 'manual' | 'shortcut' | 'adaptive'
type AdaptiveCaptureReason = 'window-switch' | 'active-stable' | 'idle-resume'

class ScreenMonitorTask extends ScheduleNextTask {
  static globalStatus: 'running' | 'stopped' = 'stopped'
  private status: 'running' | 'stopped' = 'stopped'
  private appInfo: CaptureSource[] = []
  private configCache: AutoRefreshCache<CaptureSource[]> | null = null
  private modelConfig: Partial<ScreenSettings> = {}
  private registeredManualShortcut: string | null = null
  private adaptiveCaptureMonitorTimer: NodeJS.Timeout | null = null
  private adaptiveCaptureTimers = new Map<AdaptiveCaptureReason, NodeJS.Timeout>()
  private lastAdaptiveSourceSignature = ''
  private stableSourceSignature = ''
  private stableSourceSince = 0
  private lastStableCaptureSignature = ''
  private wasIdle = false

  constructor() {
    super()
  }
  public async init() {
    this.listenToScreenMonitorEvents()
    this.configCache = new AutoRefreshCache<CaptureSource[]>({
      fetchFn: async () => {
        return await this.getVisibleSourcesUseCache()
      },
      interval: 3,
      immediate: true
    })
    logger.info('ScreenMonitorTask initialized')
  }
  private listenToScreenMonitorEvents() {
    ipcMain.handle(IpcChannel.Task_Update_Current_Record_App, (_, appInfo: CaptureSource[]) => {
      logger.info(
        'ScreenMonitorTask updateCurrentRecordApp -->',
        appInfo.map((v) => pick(v, ['name', 'type']))
      )
      this.appInfo = uniqBy(appInfo, 'id')
      this.configCache?.triggerUpdate(true)
    })
    ipcMain.handle(IpcChannel.Task_Update_Model_Config, (_, config: ScreenSettings) => {
      this.modelConfig = config
      const settings = this.getEffectiveSettings()
      this.updateInterval(settings.recordInterval * 1000)
      if (this.status === 'running') {
        this.registerManualCaptureShortcut()
        this.startAdaptiveCaptureMonitor()
      }
    })
    ipcMain.handle(IpcChannel.Task_Start, () => {
      logger.info('render notify ScreenMonitorTask start')
      ScreenMonitorTask.globalStatus = 'running'
      this.startTask()
    })
    ipcMain.handle(IpcChannel.Task_Stop, () => {
      logger.info('render notify ScreenMonitorTask stop')
      ScreenMonitorTask.globalStatus = 'stopped'
      this.stopTask()
    })
    ipcMain.handle(IpcChannel.Task_Capture_Now, async () => {
      logger.info('render notify ScreenMonitorTask capture now')
      return this.captureNow()
    })
    ipcMain.handle(IpcChannel.Task_Check_Can_Record, () => {
      return {
        canRecord: this.checkCanRecord(),
        status: this.status
      }
    })
    powerWatcher.registerResumeCallback(() => {
      logger.info('ScreenMonitorTask resume')
      if (ScreenMonitorTask.globalStatus === 'running') {
        this.startTask()
        this.scheduleIdleResumeAdaptiveCapture()
      }
    })
    powerWatcher.registerSuspendCallback(() => {
      logger.info('ScreenMonitorTask suspend')
      this.stopTask()
    })
    powerWatcher.registerLockScreenCallback(() => {
      logger.info('ScreenMonitorTask lock-screen', ScreenMonitorTask.globalStatus)
      this.stopTask()
    })
    powerWatcher.registerUnlockScreenCallback(() => {
      logger.info('ScreenMonitorTask unlock-screen', ScreenMonitorTask.globalStatus)
      if (ScreenMonitorTask.globalStatus === 'running') {
        this.startTask()
        this.scheduleIdleResumeAdaptiveCapture()
      }
    })
  }
  private async startTask() {
    if (this.status === 'running') {
      return
    }

    logger.info('ScreenMonitorTask startTask', this.configCache)
    this.status = 'running'
    this.registerManualCaptureShortcut()
    this.startAdaptiveCaptureMonitor()
    this.configCache?.start()
    this.scheduleNextTask(true, this.startScreenMonitor.bind(this))
    this.broadcastStatus()
  }
  private stopTask() {
    if (this.status === 'stopped') {
      return
    }
    logger.info('ScreenMonitorTask stopTask')
    this.unregisterManualCaptureShortcut()
    this.stopAdaptiveCaptureMonitor()
    this.configCache?.stop()
    this.stopScheduleNextTask()
    this.status = 'stopped'
    this.broadcastStatus()
    // clear queue
    queue.clear()
  }

  private async getVisibleSourcesUseCache() {
    try {
      const res = await screenshotService.getVisibleSources()
      logger.info('getVisibleSourcesUseCache', res)
      if (res.sources) {
        return res.sources
      } else {
        return []
      }
    } catch (error) {
      logger.error('getVisibleSourcesUseCache error', error)
      return []
    }
  }
  private async handleScreenshotTask(source: CaptureSource, createTime: Dayjs, captureMode: CaptureMode = 'scheduled') {
    const res = await screenshotService.takeScreenshot(source.id, createTime)

    if (res.success) {
      logger.info(`Screenshot taken successfully for source ${source.id}`)
      const url = get(res, 'screenshotInfo.url') || ''
      if (url) {
        const uploaded = await this.uploadImage(url, source.type, createTime, captureMode)
        if (!uploaded) {
          throw new Error('Screenshot upload failed')
        }
      }
    } else {
      throw new Error(res.error || 'Unknown error')
    }
  }
  private resolveSourcesForCapture(visibleSources: CaptureSource[]) {
    const visible = visibleSources.filter((source) => source.isVisible)
    const visibleById = new Map(visible.map((source) => [source.id, source]))
    const visibleByName = new Map(
      visible.filter((source) => source.name).map((source) => [source.name.toLowerCase(), source])
    )

    const resolvedSources = this.appInfo
      .map((source) => {
        const refreshedSource = visibleById.get(source.id) || visibleByName.get(source.name.toLowerCase())
        if (!refreshedSource) {
          return null
        }

        return {
          ...source,
          id: refreshedSource.id,
          name: refreshedSource.name || source.name,
          isVisible: refreshedSource.isVisible ?? source.isVisible
        }
      })
      .filter(Boolean) as CaptureSource[]

    if (resolvedSources.length === 0) {
      const selectedScreens = this.appInfo.filter((source) => source.type === 'screen')
      if (selectedScreens.length > 0) {
        logger.warn('No selected screens matched visible sources; retrying selected screen sources directly')
        return uniqBy(selectedScreens, 'id')
      }
    }

    return uniqBy(resolvedSources, 'id')
  }
  private async resolveSelectedSourcesForCapture(visibleSources: CaptureSource[]) {
    const resolvedSources = this.resolveSourcesForCapture(visibleSources)
    if (this.appInfo.length === 0) {
      return resolvedSources
    }

    const resolvedIds = new Set(resolvedSources.map((source) => source.id))
    const unresolvedSources = this.appInfo.filter((source) => !resolvedIds.has(source.id))
    if (unresolvedSources.length === 0) {
      return resolvedSources
    }

    try {
      const result = await screenshotService.getVisibleSources(unresolvedSources.map((source) => source.id))
      if (!result.success || !result.sources) {
        return resolvedSources
      }

      const visibilityById = new Map(result.sources.map((source) => [source.id, source]))
      const recoveredSources = unresolvedSources
        .map((source) => {
          const visibility = visibilityById.get(source.id)
          if (!visibility?.isVisible) {
            return null
          }

          return {
            ...source,
            name: visibility.name && visibility.name !== 'Unknown' ? visibility.name : source.name,
            isVisible: true
          }
        })
        .filter(Boolean) as CaptureSource[]

      return uniqBy([...resolvedSources, ...recoveredSources], 'id')
    } catch (error) {
      logger.error('Failed to resolve selected capture sources', error)
      return resolvedSources
    }
  }
  private shouldSkipCaptureForIdleState() {
    const idleState = powerMonitor.getSystemIdleState(IDLE_CAPTURE_SKIP_THRESHOLD_SECONDS)
    if (idleState === 'idle' || idleState === 'locked') {
      logger.info(`Skipping screen capture while system is ${idleState}`)
      return true
    }
    return false
  }
  private getEffectiveSettings(): ScreenSettings {
    return normalizeScreenSettings(this.modelConfig)
  }

  private getExcludedAppPatterns(): string[] {
    return this.getEffectiveSettings().excludedAppPatterns.map((pattern) => pattern.toLowerCase())
  }

  private isSourceExcluded(source: CaptureSource): boolean {
    if (source.type !== 'window') {
      return false
    }

    const patterns = this.getExcludedAppPatterns()
    if (patterns.length === 0) {
      return false
    }

    const sourceText = [
      source.name,
      get(source, 'appName'),
      get(source, 'sourceName'),
      get(source, 'title')
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return patterns.some((pattern) => sourceText.includes(pattern))
  }

  private filterExcludedSources(sources: CaptureSource[]): CaptureSource[] {
    const filteredSources = sources.filter((source) => !this.isSourceExcluded(source))
    const excludedCount = sources.length - filteredSources.length
    if (excludedCount > 0) {
      logger.debug(`Skipped ${excludedCount} source(s) by excluded application settings`)
    }
    return filteredSources
  }

  private registerManualCaptureShortcut() {
    this.unregisterManualCaptureShortcut()

    const settings = this.getEffectiveSettings()
    const shortcut = settings.manualCaptureShortcut?.trim()
    if (!settings.manualCaptureShortcutEnabled || !shortcut) {
      return
    }

    try {
      const registered = globalShortcut.register(shortcut, async () => {
        if (this.status !== 'running') {
          return
        }
        logger.info(`Manual capture shortcut triggered: ${shortcut}`)
        await this.captureNow('shortcut')
      })

      if (registered) {
        this.registeredManualShortcut = shortcut
        logger.info(`Manual capture shortcut registered: ${shortcut}`)
      } else {
        logger.warn(`Manual capture shortcut could not be registered: ${shortcut}`)
      }
    } catch (error) {
      logger.error(`Manual capture shortcut registration failed: ${shortcut}`, error)
    }
  }

  private unregisterManualCaptureShortcut() {
    if (!this.registeredManualShortcut) {
      return
    }

    try {
      globalShortcut.unregister(this.registeredManualShortcut)
      logger.info(`Manual capture shortcut unregistered: ${this.registeredManualShortcut}`)
    } catch (error) {
      logger.error(`Manual capture shortcut unregister failed: ${this.registeredManualShortcut}`, error)
    } finally {
      this.registeredManualShortcut = null
    }
  }

  private startAdaptiveCaptureMonitor() {
    this.stopAdaptiveCaptureMonitor()
    const settings = this.getEffectiveSettings()
    if (!settings.adaptiveCapture.enabled) {
      return
    }

    this.resetAdaptiveCaptureState()
    this.adaptiveCaptureMonitorTimer = setInterval(() => {
      this.evaluateAdaptiveCaptureRules().catch((error) => {
        logger.error('Adaptive capture evaluation failed', error)
      })
    }, ADAPTIVE_CAPTURE_POLL_INTERVAL_MS)
    this.evaluateAdaptiveCaptureRules().catch((error) => {
      logger.error('Adaptive capture initial evaluation failed', error)
    })
  }

  private stopAdaptiveCaptureMonitor() {
    if (this.adaptiveCaptureMonitorTimer) {
      clearInterval(this.adaptiveCaptureMonitorTimer)
      this.adaptiveCaptureMonitorTimer = null
    }
    this.adaptiveCaptureTimers.forEach((timer) => clearTimeout(timer))
    this.adaptiveCaptureTimers.clear()
    this.resetAdaptiveCaptureState()
  }

  private resetAdaptiveCaptureState() {
    this.lastAdaptiveSourceSignature = ''
    this.stableSourceSignature = ''
    this.stableSourceSince = 0
    this.lastStableCaptureSignature = ''
    this.wasIdle = false
  }

  private getAdaptiveCaptureSignature(visibleSources: CaptureSource[]) {
    const selectedIds = new Set(this.appInfo.map((source) => source.id))
    const selectedNames = new Set(this.appInfo.map((source) => source.name?.toLowerCase()).filter(Boolean))
    const hasSelection = selectedIds.size > 0 || selectedNames.size > 0
    const candidates = visibleSources.filter((source) => {
      if (!source.isVisible) {
        return false
      }
      if (this.isSourceExcluded(source)) {
        return false
      }
      if (!hasSelection) {
        return true
      }
      return selectedIds.has(source.id) || selectedNames.has(source.name?.toLowerCase())
    })
    const source = candidates.find((item) => item.type === 'window') || candidates.find((item) => item.type === 'screen')
    return source ? `${source.type}:${source.id}:${source.name || ''}` : ''
  }

  private scheduleAdaptiveCapture(reason: AdaptiveCaptureReason, delaySeconds: number) {
    const existingTimer = this.adaptiveCaptureTimers.get(reason)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const delayMs = Math.max(0, delaySeconds) * 1000
    const timer = setTimeout(async () => {
      this.adaptiveCaptureTimers.delete(reason)
      if (this.status !== 'running' || !this.checkCanRecord() || this.shouldSkipCaptureForIdleState()) {
        return
      }
      logger.info(`Adaptive capture triggered: ${reason}`)
      const result = await this.captureNow('adaptive')
      logger.info(`Adaptive capture completed: ${reason}`, result)
    }, delayMs)
    this.adaptiveCaptureTimers.set(reason, timer)
  }

  private scheduleIdleResumeAdaptiveCapture() {
    const settings = this.getEffectiveSettings()
    const idleResume = settings.adaptiveCapture.idleResume
    if (settings.adaptiveCapture.enabled && idleResume.enabled) {
      this.scheduleAdaptiveCapture('idle-resume', idleResume.delaySeconds)
    }
  }

  private async evaluateAdaptiveCaptureRules() {
    if (this.status !== 'running' || !this.checkCanRecord()) {
      return
    }

    const settings = this.getEffectiveSettings()
    const rules = settings.adaptiveCapture
    if (!rules.enabled) {
      return
    }

    const idleState = powerMonitor.getSystemIdleState(IDLE_CAPTURE_SKIP_THRESHOLD_SECONDS)
    const isIdle = idleState === 'idle' || idleState === 'locked'
    if (this.wasIdle && !isIdle && rules.idleResume.enabled) {
      this.scheduleAdaptiveCapture('idle-resume', rules.idleResume.delaySeconds)
    }
    this.wasIdle = isIdle
    if (isIdle) {
      return
    }

    let visibleSources = this.configCache?.get()
    if (!visibleSources || visibleSources.length === 0) {
      visibleSources = await this.getVisibleSourcesUseCache()
    }

    const sourceSignature = this.getAdaptiveCaptureSignature(visibleSources)
    if (!sourceSignature) {
      return
    }

    if (
      rules.windowSwitch.enabled &&
      this.lastAdaptiveSourceSignature &&
      sourceSignature !== this.lastAdaptiveSourceSignature
    ) {
      this.scheduleAdaptiveCapture('window-switch', rules.windowSwitch.delaySeconds)
    }
    this.lastAdaptiveSourceSignature = sourceSignature

    if (sourceSignature !== this.stableSourceSignature) {
      this.stableSourceSignature = sourceSignature
      this.stableSourceSince = Date.now()
      this.lastStableCaptureSignature = ''
      return
    }

    const stableDelayMs = Math.max(1, rules.activeAppStable.delaySeconds) * 1000
    if (
      rules.activeAppStable.enabled &&
      this.lastStableCaptureSignature !== sourceSignature &&
      Date.now() - this.stableSourceSince >= stableDelayMs
    ) {
      this.lastStableCaptureSignature = sourceSignature
      this.scheduleAdaptiveCapture('active-stable', 0)
    }
  }

  private async startScreenMonitor() {
    try {
      if (this.shouldSkipCaptureForIdleState()) {
        return
      }
      let visibleSources = this.configCache?.get()
      if (!visibleSources || visibleSources.length === 0) {
        visibleSources = await this.getVisibleSourcesUseCache()
      }
      logger.debug(
        'visibleSources',
        visibleSources?.map((item) => pick(item, ['name', 'type', 'isVisible']))
      )
      const capturableVisibleSources = this.filterExcludedSources(visibleSources || [])
      const ids = capturableVisibleSources?.map((item) => (item.isVisible ? item.id : '')).filter(Boolean) || []
      if ((!visibleSources || ids.length === 0) && this.appInfo.length === 0) {
        logger.warn('screen monitor visibleSources is empty')
        return
      }
      if (!this.checkCanRecord()) {
        logger.warn('screen monitor not in record time')
        return
      }

      const sources = await this.resolveSelectedSourcesForCapture(capturableVisibleSources)
      if (sources.length === 0) {
        logger.warn('screen monitor selected sources are not currently capturable')
        return
      }
      logger.debug(
        'sources',
        sources.map((v) => pick(v, ['name', 'type']))
      )
      const createTime = dayjs()
      sources.forEach((source) => {
        queue.add(() => this.handleScreenshotTask(source, createTime)).catch((error) => {
          logger.error(`Screenshot task failed for source ${source.id}; recording will continue`, error)
        })
      })
      logger.debug(`Queue has ${queue.size} tasks. Waiting for idle...`)
      // await queue.onIdle()
      // logger.info('All screenshot tasks have completed.')
    } catch (error) {
      logger.error('startScreenMonitor error; recording will retry on the next interval', error)
    }
  }
  public async captureNow(captureMode: Exclude<CaptureMode, 'scheduled'> = 'manual') {
    try {
      let visibleSources = this.configCache?.get()
      if (!visibleSources || visibleSources.length === 0) {
        visibleSources = await this.getVisibleSourcesUseCache()
      }

      const capturableVisibleSources = this.filterExcludedSources(visibleSources || [])
      const configuredSources = await this.resolveSelectedSourcesForCapture(capturableVisibleSources)
      const fallbackSources =
        this.appInfo.length === 0
          ? capturableVisibleSources.filter((source) => source.isVisible && source.type === 'screen').slice(0, 1)
          : []
      const sources = configuredSources.length > 0 ? configuredSources : fallbackSources
      if (sources.length === 0) {
        return { success: false, capturedCount: 0, failedCount: 0, error: 'No capturable screen or window found' }
      }

      const createTime = dayjs()
      const results = await Promise.allSettled(
        sources.map((source) => this.handleScreenshotTask(source, createTime, captureMode))
      )
      const capturedCount = results.filter((result) => result.status === 'fulfilled').length
      const failedCount = results.length - capturedCount
      return {
        success: capturedCount > 0,
        capturedCount,
        failedCount,
        error: capturedCount > 0 ? undefined : 'Manual screenshot failed'
      }
    } catch (error: any) {
      logger.error('captureNow error', error)
      return { success: false, capturedCount: 0, failedCount: 0, error: error.message }
    }
  }
  private broadcastStatus() {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(IpcServerPushChannel.PushScreenMonitorStatus, this.status)
    })
  }

  public unregister() {
    queue.clear()
    this.configCache?.destroy()
    this.status = 'stopped'
    this.stopScheduleNextTask()
    this.unregisterManualCaptureShortcut()
    this.stopAdaptiveCaptureMonitor()

    ipcMain.removeHandler(IpcChannel.Task_Update_Model_Config)
    ipcMain.removeHandler(IpcChannel.Task_Start)
    ipcMain.removeHandler(IpcChannel.Task_Stop)
    ipcMain.removeHandler(IpcChannel.Task_Capture_Now)
    ipcMain.removeHandler(IpcChannel.Task_Update_Current_Record_App)
  }

  private async uploadImage(
    url: string,
    type: CaptureSource['type'],
    createTime: Dayjs,
    captureMode: CaptureMode
  ): Promise<boolean> {
    try {
      const data = {
        path: url,
        window: type === 'screen' ? 'screen' : '',
        create_time: createTime.format('YYYY-MM-DD HH:mm:ss'),
        source: captureMode === 'scheduled' ? type : `${captureMode}-${type}`
      }
      const res = await axios.post(`http://127.0.0.1:${getBackendPort()}/api/add_screenshot`, data)
      if (res.status === 200) {
        logger.info('Screenshot uploaded successfully')
        return true
      } else {
        logger.error('Screenshot upload failed', res.status)
        return false
      }
    } catch (error) {
      logger.error('Failed to upload screenshot:', error)
      return false
    }
  }

  private checkCanRecord = () => {
    const { enableRecordingHours, applyToDays, recordingHours } = this.modelConfig

    if (!enableRecordingHours) {
      return true
    }

    const now = dayjs()

    if (applyToDays === 'weekday') {
      const currentDay = now.day()
      if (currentDay === 0 || currentDay === 6) {
        return false
      }
    }

    if (recordingHours && Array.isArray(recordingHours) && recordingHours.length === 2) {
      const [startTimeStr, endTimeStr] = recordingHours as [string, string] // e.g., ["09:00", "18:00"]

      const start = dayjs(startTimeStr, 'HH:mm')
      const end = dayjs(endTimeStr, 'HH:mm')

      if (!start.isValid() || !end.isValid()) {
        logger.warn(`invalid record time format: ${startTimeStr}-${endTimeStr}。skip check`)
        return true
      }

      if (start.isAfter(end)) {
        return now.isSameOrAfter(start) || now.isSameOrBefore(end)
      } else {
        return now.isBetween(start, end, null, '[]')
      }
    }
    return true
  }
}
export { ScreenMonitorTask }
