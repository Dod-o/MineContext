import React from 'react'
import { Button, Space, Typography, Popover, Tag, Tooltip } from '@arco-design/web-react'
import { IconCamera, IconPlayArrow, IconSettings, IconRecordStop } from '@arco-design/web-react/icon'

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
  onStartMonitoring,
  onStopMonitoring
}) => {
  const description =
    'Screen Monitor captures anything on your screen and transforms it into intelligent, connected Contexts. All data stays local with full privacy protection'
  const apiStatusConfig = {
    unknown: { color: 'gray', label: 'API unknown' },
    checking: { color: 'blue', label: 'API checking' },
    connected: { color: 'green', label: 'API connected' },
    error: { color: 'red', label: 'API unavailable' }
  }[apiConnectionStatus]

  return (
    <div className="flex items-start justify-between gap-4 mb-3 flex-col md:flex-row">
      <div className="min-w-0 flex-1">
        <Title
          heading={3}
          className="[&_.arco-typography]: !mt-1 [&_.arco-typography]: !font-bold [&_.arco-typography]: !text-[24px] [&_.arco-typography]: !text-black">
          Screen Monitor
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
            <Tooltip content={apiConnectionMessage || 'Click to check model API connection.'}>
              <Tag
                color={apiStatusConfig.color}
                className="cursor-pointer select-none"
                onClick={onCheckApiConnection}>
                {apiStatusConfig.label}
              </Tag>
            </Tooltip>
            <Popover content="Settings can only be adjusted after Stop Recording." disabled={!isMonitoring}>
              <Button
                type="outline"
                icon={<IconSettings />}
                size="large"
                disabled={isMonitoring}
                onClick={onOpenSettings}
                className="[&_.arco-btn]: !bg-white [&_.arco-btn]: !border-gray-300 [&_.arco-btn]: !text-black [&_.arco-btn:hover]: !bg-gray-50">
                Settings
              </Button>
            </Popover>
            <Tooltip content="Capture selected screen or window immediately.">
              <Button
                type="outline"
                icon={<IconCamera />}
                size="large"
                loading={captureNowLoading}
                disabled={!isToday}
                onClick={onCaptureNow}
                className="[&_.arco-btn]: !bg-white [&_.arco-btn]: !border-gray-300 [&_.arco-btn]: !text-black [&_.arco-btn:hover]: !bg-gray-50">
                Capture Now
              </Button>
            </Tooltip>
            {!isMonitoring ? (
              <Popover
                content="Please click the settings button and select your monitoring window or screen."
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
                  Start Recording
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
                Stop Recording
              </Button>
            )}
          </Space>
        ) : null}
      </div>
    </div>
  )
}

export default ScreenMonitorHeader
