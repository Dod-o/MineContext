import React from 'react'
import { Button, Modal, Slider, TimePicker, Radio, Form, Checkbox, Spin, Switch, Input } from '@arco-design/web-react'
import clsx from 'clsx'
import { Application } from './application'
import screenIcon from '@renderer/assets/icons/screen.svg'
import { useLocalizedText } from '@renderer/hooks/use-app-language'
import type {
  AdaptiveCaptureRuleSetting,
  AdaptiveCaptureSettings,
  ApplyToDays,
  CaptureTargetMode
} from '@renderer/store/setting'

interface SettingsModalProps {
  visible: boolean
  form: any
  sources: any
  screenAllSources: any[]
  appAllSources: any[]
  applicationVisible: boolean
  tempRecordInterval: number
  tempCaptureTargetMode: CaptureTargetMode
  tempEnableRecordingHours: boolean
  tempRecordingHours: [string, string]
  tempApplyToDays: string
  tempManualCaptureShortcutEnabled: boolean
  tempManualCaptureShortcut: string
  tempExcludedAppPatterns: string[]
  tempAdaptiveCapture: AdaptiveCaptureSettings
  onCancel: () => void
  onSave: () => void
  onSetApplicationVisible: (visible: boolean) => void
  onSetTempRecordInterval: (value: number) => void
  onSetTempCaptureTargetMode: (value: CaptureTargetMode) => void
  onSetTempEnableRecordingHours: (value: boolean) => void
  onSetTempRecordingHours: (value: [string, string]) => void
  onSetTempApplyToDays: (value: ApplyToDays) => void
  onSetTempManualCaptureShortcutEnabled: (value: boolean) => void
  onSetTempManualCaptureShortcut: (value: string) => void
  onSetTempExcludedAppPatterns: (value: string[]) => void
  onSetTempAdaptiveCapture: (value: AdaptiveCaptureSettings) => void
}

interface AdaptiveRuleControlProps {
  label: string
  description: string
  value: AdaptiveCaptureRuleSetting
  onChange: (value: AdaptiveCaptureRuleSetting) => void
}

const AdaptiveRuleControl: React.FC<AdaptiveRuleControlProps> = ({ label, description, value, onChange }) => {
  return (
    <div className="rounded-[8px] border border-[var(--mc-border,#E5E6EB)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[13px] leading-[20px] text-[var(--mc-text-primary,#0b0b0f)]">{label}</div>
          <div className="text-[11px] leading-[16px] text-[var(--mc-text-secondary,#6e718c)]">{description}</div>
        </div>
        <Switch checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} />
      </div>
      <Slider
        value={value.delaySeconds}
        disabled={!value.enabled}
        onChange={(nextValue) => onChange({ ...value, delaySeconds: nextValue as number })}
        min={1}
        max={30}
        marks={{
          1: '1s',
          30: '30s'
        }}
        formatTooltip={(nextValue) => `${nextValue}s`}
      />
    </div>
  )
}

function parseExcludedAppPatterns(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((pattern) => pattern.trim())
    .filter(Boolean)
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  form,
  sources,
  screenAllSources,
  appAllSources,
  applicationVisible,
  tempRecordInterval,
  tempCaptureTargetMode,
  tempEnableRecordingHours,
  tempRecordingHours,
  tempApplyToDays,
  tempManualCaptureShortcutEnabled,
  tempManualCaptureShortcut,
  tempExcludedAppPatterns,
  tempAdaptiveCapture,
  onCancel,
  onSave,
  onSetApplicationVisible,
  onSetTempRecordInterval,
  onSetTempCaptureTargetMode,
  onSetTempEnableRecordingHours,
  onSetTempRecordingHours,
  onSetTempApplyToDays,
  onSetTempManualCaptureShortcutEnabled,
  onSetTempManualCaptureShortcut,
  onSetTempExcludedAppPatterns,
  onSetTempAdaptiveCapture
}) => {
  const t = useLocalizedText()
  const updateAdaptiveRule = (
    key: 'windowSwitch' | 'activeAppStable' | 'idleResume',
    value: AdaptiveCaptureRuleSetting
  ) => {
    onSetTempAdaptiveCapture({
      ...tempAdaptiveCapture,
      [key]: value
    })
  }

  return (
    <Modal
      title={t('Settings', '设置')}
      visible={visible}
      autoFocus={false}
      focusLock
      onCancel={onCancel}
      className="text-[#AEAFC2]"
      unmountOnExit
      footer={
        <>
          <Button onClick={onCancel} className="[&_.arco-btn]: !text-xs">
            {t('Cancel', '取消')}
          </Button>
          <Button type="primary" onClick={onSave} className="[&_.arco-btn-primary]: !bg-black">
            {t('Save', '保存')}
          </Button>
        </>
      }
      style={{ width: 682 }}>
      <div className="max-h-[72vh] overflow-y-auto pr-1">
        <Form layout="vertical" form={form}>
        <div className="flex w-full flex-1 mt-5">
          <div className="flex flex-col flex-1 pr-[24px]">
            <Form.Item label={t('Record Interval', '记录间隔')} className="[&_.arco-form-item-label]:!text-xs">
              <Slider
                value={tempRecordInterval}
                onChange={(value) => onSetTempRecordInterval(value as number)}
                min={5}
                max={300}
                marks={{
                  5: '5s',
                  300: '5min'
                }}
                className="!mt-4"
                formatTooltip={(value) => `${value}s`}
              />
            </Form.Item>
            <Form.Item label={t('Capture target', '捕捉目标')} className="[&_.arco-form-item-label]:!text-xs">
              <Radio.Group value={tempCaptureTargetMode} onChange={onSetTempCaptureTargetMode}>
                <Radio value="selected" className="[&_.arco-radio-mask]: !border-[#d7daea]">
                  {t('Selected sources', '已选来源')}
                </Radio>
                <Radio value="active-screen" className="[&_.arco-radio-mask]: !border-[#d7daea]">
                  {t('Active screen', '当前屏幕')}
                </Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item label={t('Manual capture shortcut', '手动捕捉快捷键')} className="[&_.arco-form-item-label]:!text-xs">
              <div className="flex items-center gap-3">
                <Switch
                  checked={tempManualCaptureShortcutEnabled}
                  onChange={onSetTempManualCaptureShortcutEnabled}
                />
                <Input
                  value={tempManualCaptureShortcut}
                  disabled={!tempManualCaptureShortcutEnabled}
                  onChange={onSetTempManualCaptureShortcut}
                  placeholder="CommandOrControl+Shift+S"
                />
              </div>
            </Form.Item>
            <Form.Item label={t('Adaptive capture rules', '自适应捕捉规则')} className="[&_.arco-form-item-label]:!text-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary,#6e718c)]">
                  {t('Capture after meaningful workflow changes.', '在有意义的工作流变化后自动捕捉。')}
                </div>
                <Switch
                  checked={tempAdaptiveCapture.enabled}
                  onChange={(enabled) => onSetTempAdaptiveCapture({ ...tempAdaptiveCapture, enabled })}
                />
              </div>
              {tempAdaptiveCapture.enabled && (
                <div className="mt-3 flex flex-col gap-3">
                  <AdaptiveRuleControl
                    label={t('Window switch', '窗口切换')}
                    description={t('Capture after the selected active source changes.', '所选活动来源变化后捕捉。')}
                    value={tempAdaptiveCapture.windowSwitch}
                    onChange={(value) => updateAdaptiveRule('windowSwitch', value)}
                  />
                  <AdaptiveRuleControl
                    label={t('Active app stable', '应用稳定后')}
                    description={t('Capture once after the same source stays active.', '同一来源保持活动后捕捉一次。')}
                    value={tempAdaptiveCapture.activeAppStable}
                    onChange={(value) => updateAdaptiveRule('activeAppStable', value)}
                  />
                  <AdaptiveRuleControl
                    label={t('Return from idle', '空闲后返回')}
                    description={t('Capture after the system becomes active again.', '系统重新变为活动状态后捕捉。')}
                    value={tempAdaptiveCapture.idleResume}
                    onChange={(value) => updateAdaptiveRule('idleResume', value)}
                  />
                </div>
              )}
            </Form.Item>
            <Form.Item label={t('Excluded applications', '排除的应用')} className="[&_.arco-form-item-label]:!text-xs">
              <Input.TextArea
                value={tempExcludedAppPatterns.join('\n')}
                onChange={(value) => onSetTempExcludedAppPatterns(parseExcludedAppPatterns(value))}
                placeholder={t('Window names to skip, one per line', '要跳过的窗口名称，每行一个')}
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
              <div className="mt-1 text-[11px] leading-[16px] text-[var(--mc-text-secondary,#6e718c)]">
                {t('Matching window captures are skipped before upload.', '匹配的窗口会在上传前跳过。')}
              </div>
            </Form.Item>
            {tempCaptureTargetMode === 'selected' && (
              <Form.Item label={t('Choose what to record', '选择记录内容')} shouldUpdate>
                {(values) => {
                  const { screenSources = [], windowSources = [] } = values || {}
                  const screenList = screenAllSources?.filter((source) => screenSources.includes(source.id)) || []
                  const windowList = appAllSources?.filter((source) => windowSources.includes(source.id)) || []
                  return (
                    <Spin loading={sources.state === 'loading'} block>
                      <Application
                        value={[...screenList, ...windowList]}
                        onCancel={() => onSetApplicationVisible(false)}
                        visible={applicationVisible}
                        onOk={() => onSetApplicationVisible(true)}
                      />
                    </Spin>
                  )
                }}
              </Form.Item>
            )}
            <Form.Item label={t('Enable recording hours', '启用记录时段')} className="[&_.arco-form-item-label]:!text-xs !mb-0">
              <Switch
                checked={tempEnableRecordingHours}
                onChange={onSetTempEnableRecordingHours}
                className={
                  !tempEnableRecordingHours ? '[&_.arco-switch]: !bg-[#e2e3ef]' : '[&_.arco-switch]: !bg-black'
                }
              />
            </Form.Item>
            {tempEnableRecordingHours && (
              <div className="!mt-3">
                <Form.Item label={t('Set recording hours', '设置记录时段')} className="[&_.arco-form-item-label]:!text-xs">
                  <TimePicker.RangePicker
                    format="HH:mm"
                    value={tempRecordingHours}
                    onChange={(value) => onSetTempRecordingHours(value as [string, string])}
                  />
                </Form.Item>
                <Form.Item label={t('Apply to days', '应用到日期')} className="[&_.arco-form-item-label]: !text-xs">
                  <Radio.Group value={tempApplyToDays} onChange={onSetTempApplyToDays}>
                    <Radio value="weekday" className="[&_.arco-radio-mask]: !border-[#d7daea]">
                      {t('Only weekday', '仅工作日')}
                    </Radio>
                    <Radio value="everyday" className="[&_.arco-radio-mask]: !border-[#d7daea]">
                      {t('Everyday', '每天')}
                    </Radio>
                  </Radio.Group>
                </Form.Item>
              </div>
            )}
          </div>
          <div
            className={clsx(
              'flex flex-col flex-1 border-l border-[#efeff4] max-h-[360px] h-[360px] overflow-x-hidden overflow-y-auto px-[16px]  [&_.arco-checkbox-checked_.arco-checkbox-mask]:!bg-[#000000] [&_.arco-checkbox-checked_.arco-checkbox-mask]:!border-[#000000]',
              { hidden: !applicationVisible || tempCaptureTargetMode !== 'selected' }
            )}>
            <div className="text-[15px] leading-[18px] text-[#42464e] mb-[12px] font-medium">
              {t('Choose what to record', '选择记录内容')}
            </div>
            <div className="[&_.arco-checkbox]:!flex [&_.arco-checkbox]:!items-center">
              <div className="text-[14px] leading-[20px] text-[#42464e] mb-[4px]">{t('Screen', '屏幕')}</div>
              <Form.Item field="screenSources">
                <Checkbox.Group className="!grid grid-cols-3 gap-4 relative [&_label]:!mr-0 [&_.arco-checkbox-text]:!ml-0">
                  {screenAllSources.map((source) => (
                    <Checkbox key={source.id} value={source.id}>
                      {({ checked }) => {
                        return (
                          <div className="flex flex-col items-center gap-[4px]">
                            <div
                              className={clsx(
                                'w-[94px] h-[60px] min-w-[94px] min-h-[60px] rounded-[8px] overflow-hidden border relative',
                                checked ? 'border-black' : 'border-transparent'
                              )}>
                              <img
                                src={source.thumbnail || ''}
                                alt="thumbnail"
                                className="w-[94px] h-[60px] inline-block object-cover"
                              />
                              <Checkbox checked={checked} className="!absolute !top-[4px] !right-[4px]" />
                            </div>
                            <div className="flex items-center space-x-[4px]">
                              {source.appIcon ? (
                                <img
                                  src={source.appIcon || ''}
                                  alt=""
                                  className="w-[14px] h-[14px] inline-block object-cover"
                                />
                              ) : (
                                <img src={screenIcon} alt="" className="w-[14px] h-[14px] inline-block object-cover" />
                              )}
                              <div className="text-[13px] leading-[22px] text-[#0b0b0f] !ml-[4px] line-clamp-1">
                                {source.name}
                              </div>
                            </div>
                          </div>
                        )
                      }}
                    </Checkbox>
                  ))}
                </Checkbox.Group>
              </Form.Item>
            </div>
            <div className="[&_.arco-checkbox]:!flex [&_.arco-checkbox]:!items-center">
              <div className="text-[14px] leading-[20px] text-[#42464e] mb-[4px]">{t('Window', '窗口')}</div>
              <div className="text-[10px] leading-[12px] text-[#737a87] mb-[4px]">
                {t('Running applications stay selectable', '运行中的应用会保持可选')}
              </div>
              <Form.Item field="windowSources">
                <Checkbox.Group className="flex flex-col space-y-4">
                  {appAllSources.map((source) => (
                    <Checkbox key={source.id} value={source.id}>
                      <div className={clsx('flex items-center space-x-[4px]', !source.isVisible && 'opacity-60')}>
                        <img
                          src={source.appIcon || source.thumbnail || ''}
                          alt=""
                          className="w-[14px] h-[14px] inline-block object-cover"
                        />
                        <div className="text-[13px] leading-[22px] text-[#0b0b0f] !ml-[4px] line-clamp-1">
                          {source.name}
                        </div>
                        {!source.isVisible && (
                          <span className="text-[10px] leading-[14px] text-[#737a87]">{t('Hidden', '隐藏')}</span>
                        )}
                      </div>
                    </Checkbox>
                  ))}
                </Checkbox.Group>
              </Form.Item>
            </div>
          </div>
        </div>
        </Form>
      </div>
    </Modal>
  )
}

export default SettingsModal
