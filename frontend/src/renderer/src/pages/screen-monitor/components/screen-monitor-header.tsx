import React from 'react'
import { Button, Space, Typography, Popover, Tag, Tooltip } from '@arco-design/web-react'
import {
  IconCamera,
  IconPlayArrow,
  IconSettings,
  IconRecordStop,
  IconVideoCamera,
  IconVoice
} from '@arco-design/web-react/icon'
import { useLocalizedText } from '@renderer/hooks/use-app-language'

const { Title } = Typography

interface ScreenMonitorHeaderProps {
  hasPermission: boolean
  isMonitoring: boolean
  isToday: boolean
  apiConnectionStatus: 'unknown' | 'checking' | 'connected' | 'error'
  apiConnectionMessage: string
  screenAllSources: any[]
  appAllSources: any[]
  onOpenSettings: () => void
  onCheckApiConnection: () => void
  onCaptureNow: () => void
  captureNowLoading: boolean
  audioRecording: boolean
  audioSaving: boolean
  onStartAudioRecording: () => void
  onStopAudioRecording: () => void
  videoRecording: boolean
  videoSaving: boolean
  onStartVideoRecording: () => void
  onStopVideoRecording: () => void
  onStartMonitoring: () => void
  onStopMonitoring: () => void
  onRequestPermission: () => void
}

const ScreenMonitorHeader: React.FC<ScreenMonitorHeaderProps> = ({
  hasPermission,
  isMonitoring,
  isToday,
  apiConnectionStatus,
  apiConnectionMessage,
  screenAllSources,
  appAllSources,
  onOpenSettings,
  onCheckApiConnection,
  onCaptureNow,
  captureNowLoading,
  audioRecording,
  audioSaving,
  onStartAudioRecording,
  onStopAudioRecording,
  videoRecording,
  videoSaving,
  onStartVideoRecording,
  onStopVideoRecording,
  onStartMonitoring,
  onStopMonitoring
}) => {
  const t = useLocalizedText()
  const description = t(
    'Screen Monitor captures anything on your screen and transforms it into intelligent, connected Contexts. All data stays local with full privacy protection',
    '屏幕记录会捕捉屏幕内容，并转化为智能、互相关联的上下文。所有数据都保存在本地，保护你的隐私'
  )
  const apiStatusConfig = {
    unknown: { color: 'gray', label: t('API unknown', 'API 状态未知') },
    checking: { color: 'blue', label: t('API checking', '正在检查 API') },
    connected: { color: 'green', label: t('API connected', 'API 已连接') },
    error: { color: 'red', label: t('API unavailable', 'API 不可用') }
  }[apiConnectionStatus]

  return (
    <div className="flex items-start justify-between gap-4 mb-3 flex-col md:flex-row">
      <div className="min-w-0 flex-1">
        <Title
          heading={3}
          className="[&_.arco-typography]: !mt-1 [&_.arco-typography]: !font-bold [&_.arco-typography]: !text-[24px] [&_.arco-typography]: !text-black">
          {t('Screen Monitor', '屏幕记录')}
        </Title>
        <p
          className="m-0 max-w-[820px] text-[13px] leading-[20px] text-[#6E718C]"
          style={{
            letterSpacing: 0,
            wordSpacing: 0,
            whiteSpace: 'normal',
            wordBreak: 'normal',
            overflowWrap: 'normal',
            hyphens: 'none'
          }}>
          {description}
        </p>
      </div>
      <div className="flex shrink-0 items-center justify-end">
        {hasPermission ? (
          <Space>
            <Tooltip content={apiConnectionMessage || t('Click to check model API connection.', '点击检查模型 API 连接。')}>
              <Tag
                color={apiStatusConfig.color}
                className="cursor-pointer select-none"
                onClick={onCheckApiConnection}>
                {apiStatusConfig.label}
              </Tag>
            </Tooltip>
            <Popover content={t('Settings can only be adjusted after Stop Recording.', '停止记录后才能调整设置。')} disabled={!isMonitoring}>
              <Button
                type="outline"
                icon={<IconSettings />}
                size="large"
                disabled={isMonitoring}
                onClick={onOpenSettings}
                className="[&_.arco-btn]: !bg-white [&_.arco-btn]: !border-gray-300 [&_.arco-btn]: !text-black [&_.arco-btn:hover]: !bg-gray-50">
                {t('Settings', '设置')}
              </Button>
            </Popover>
            <Tooltip content={t('Capture selected screen or window immediately.', '立即捕捉选中的屏幕或窗口。')}>
              <Button
                type="outline"
                icon={<IconCamera />}
                size="large"
                loading={captureNowLoading}
                disabled={!isToday}
                onClick={onCaptureNow}
                className="[&_.arco-btn]: !bg-white [&_.arco-btn]: !border-gray-300 [&_.arco-btn]: !text-black [&_.arco-btn:hover]: !bg-gray-50">
                {t('Capture Now', '立即捕捉')}
              </Button>
            </Tooltip>
            <Tooltip
              content={
                audioRecording
                  ? t('Stop microphone recording and save it as context.', '停止麦克风录音并保存为上下文。')
                  : t('Record meeting audio from the microphone.', '从麦克风录制会议音频。')
              }>
              <Button
                type={audioRecording ? 'primary' : 'outline'}
                status={audioRecording ? 'danger' : undefined}
                icon={audioRecording ? <IconRecordStop /> : <IconVoice />}
                size="large"
                loading={audioSaving}
                disabled={!isToday || audioSaving}
                onClick={audioRecording ? onStopAudioRecording : onStartAudioRecording}
                className={
                  audioRecording
                    ? '[&_.arco-btn-primary]: !bg-red-500 [&_.arco-btn-primary:hover]: !bg-red-600'
                    : '[&_.arco-btn]: !bg-white [&_.arco-btn]: !border-gray-300 [&_.arco-btn]: !text-black [&_.arco-btn:hover]: !bg-gray-50'
                }>
                {audioRecording ? t('Stop Audio', '停止音频') : t('Record Audio', '录制音频')}
              </Button>
            </Tooltip>
            <Tooltip
              content={
                videoRecording
                  ? t('Stop screen video recording and save it as context.', '停止屏幕视频录制并保存为上下文。')
                  : t('Record a screen video for later context review.', '录制屏幕视频，方便之后回顾上下文。')
              }>
              <Button
                type={videoRecording ? 'primary' : 'outline'}
                status={videoRecording ? 'danger' : undefined}
                icon={videoRecording ? <IconRecordStop /> : <IconVideoCamera />}
                size="large"
                loading={videoSaving}
                disabled={!isToday || videoSaving}
                onClick={videoRecording ? onStopVideoRecording : onStartVideoRecording}
                className={
                  videoRecording
                    ? '[&_.arco-btn-primary]: !bg-red-500 [&_.arco-btn-primary:hover]: !bg-red-600'
                    : '[&_.arco-btn]: !bg-white [&_.arco-btn]: !border-gray-300 [&_.arco-btn]: !text-black [&_.arco-btn:hover]: !bg-gray-50'
                }>
                {videoRecording ? t('Stop Video', '停止视频') : t('Record Video', '录制视频')}
              </Button>
            </Tooltip>
            {!isMonitoring ? (
              <Popover
                content={t(
                  'Please click the settings button and select your monitoring window or screen.',
                  '请点击设置按钮，选择要记录的窗口或屏幕。'
                )}
                disabled={!(screenAllSources.length === 0 && appAllSources.length === 0)}>
                <Button
                  type="primary"
                  icon={<IconPlayArrow />}
                  size="large"
                  onClick={onStartMonitoring}
                  disabled={isMonitoring || !isToday}
                  style={{
                    background: '#000'
                  }}>
                  {t('Start Recording', '开始记录')}
                </Button>
              </Popover>
            ) : (
              <Button
                type="primary"
                status="danger"
                icon={<IconRecordStop />}
                size="large"
                onClick={onStopMonitoring}
                className="[&_.arco-btn-primary]: !bg-red-500 [&_.arco-btn-primary:hover]: !bg-red-600">
                {t('Stop Recording', '停止记录')}
              </Button>
            )}
          </Space>
        ) : null}
      </div>
    </div>
  )
}

export default ScreenMonitorHeader
