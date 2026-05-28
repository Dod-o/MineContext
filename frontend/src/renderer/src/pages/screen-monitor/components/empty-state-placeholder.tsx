import React from 'react'
import { Typography, Button } from '@arco-design/web-react'
import Stopped from '@renderer/assets/images/screen-monitor/stopped.png'
import NeedPermission from '@renderer/assets/images/screen-monitor/need-permission.svg'
import screenMonitorEmpty from '@renderer/assets/images/screen-monitor/screen-monitor-empty.svg'
import { SCREEN_INTERVAL_TIME } from '../constant'
import { useLocalizedText } from '@renderer/hooks/use-app-language'

const { Text } = Typography

interface EmptyStatePlaceholderProps {
  hasPermission: boolean
  isToday: boolean
  onGrantPermission: () => void
}

const EmptyStatePlaceholder: React.FC<EmptyStatePlaceholderProps> = ({ hasPermission, isToday, onGrantPermission }) => {
  const t = useLocalizedText()

  return (
    <div className="flex items-center justify-center flex-1 min-h-[300px]">
      <div className="text-center flex flex-col items-center justify-center">
        {hasPermission ? (
          isToday ? (
            <>
              <img src={Stopped} alt="Screen recording" style={{ width: 66, height: 78 }} />
              <Text style={{ marginTop: 16, width: 270, color: '#6C7191', fontSize: 12 }}>
                {t(
                  'Start screen recording, and then it will take screenshots and summarize your work records every ',
                  '开始屏幕记录后，它会每 '
                )}
                {SCREEN_INTERVAL_TIME}
                {t(' minutes', ' 分钟')}
                {t('', ' 截图并总结一次工作记录')}
              </Text>
            </>
          ) : (
            <>
              <img src={screenMonitorEmpty} alt="Screen recording" style={{ width: 66, height: 78 }} />
              <Text style={{ marginTop: 16, width: 270, color: '#6C7191', fontSize: 12 }}>
                {t('No data available', '暂无数据')}
              </Text>
            </>
          )
        ) : (
          <>
            <img src={NeedPermission} alt="Need permission" style={{ width: 286, height: 168, marginLeft: 67 }} />
            <Text style={{ marginTop: 16, width: 440, color: '#6C7191', fontSize: 12 }}>
              {t('Enable screen recording permission, summary with AI every ', '开启屏幕记录权限，AI 会每 ')}
              {SCREEN_INTERVAL_TIME}
              {t(' minutes', ' 分钟')}
              {t('', ' 总结一次')}
            </Text>
            <Button
              type="primary"
              size="large"
              onClick={onGrantPermission}
              className="[&_.arco-btn-primary]: !mt-6 [&_.arco-btn-primary]: !font-medium [&_.arco-btn-primary]: !bg-black">
              {t('Enable Permission', '开启权限')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export default EmptyStatePlaceholder
