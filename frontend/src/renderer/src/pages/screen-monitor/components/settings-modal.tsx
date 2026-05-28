import React from 'react'
import { Button, Modal, Slider, TimePicker, Radio, Form, Checkbox, Spin, Switch, Input } from '@arco-design/web-react'
import clsx from 'clsx'
import { Application } from './application'
import screenIcon from '@renderer/assets/icons/screen.svg'
import type {
  AdaptiveCaptureRuleSetting,
  AdaptiveCaptureSettings,
  ApplyToDays
} from '@renderer/store/setting'

interface SettingsModalProps {
  visible: boolean
  form: any
  sources: any
  screenAllSources: any[]
  appAllSources: any[]
  applicationVisible: boolean
  tempRecordInterval: number
  tempEnableRecordingHours: boolean
  tempRecordingHours: [string, string]
  tempApplyToDays: string
  tempManualCaptureShortcutEnabled: boolean
  tempManualCaptureShortcut: string
  tempAdaptiveCapture: AdaptiveCaptureSettings
  onCancel: () => void
  onSave: () => void
  onSetApplicationVisible: (visible: boolean) => void
  onSetTempRecordInterval: (value: number) => void
  onSetTempEnableRecordingHours: (value: boolean) => void
  onSetTempRecordingHours: (value: [string, string]) => void
  onSetTempApplyToDays: (value: ApplyToDays) => void
  onSetTempManualCaptureShortcutEnabled: (value: boolean) => void
  onSetTempManualCaptureShortcut: (value: string) => void
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

const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  form,
  sources,
  screenAllSources,
  appAllSources,
  applicationVisible,
  tempRecordInterval,
  tempEnableRecordingHours,
  tempRecordingHours,
  tempApplyToDays,
  tempManualCaptureShortcutEnabled,
  tempManualCaptureShortcut,
  tempAdaptiveCapture,
  onCancel,
  onSave,
  onSetApplicationVisible,
  onSetTempRecordInterval,
  onSetTempEnableRecordingHours,
  onSetTempRecordingHours,
  onSetTempApplyToDays,
  onSetTempManualCaptureShortcutEnabled,
  onSetTempManualCaptureShortcut,
  onSetTempAdaptiveCapture
}) => {
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
      title="Settings"
      visible={visible}
      autoFocus={false}
      focusLock
      onCancel={onCancel}
      className="text-[#AEAFC2]"
      unmountOnExit
      footer={
        <>
          <Button onClick={onCancel} className="[&_.arco-btn]: !text-xs">
            Cancel
          </Button>
          <Button type="primary" onClick={onSave} className="[&_.arco-btn-primary]: !bg-black">
            Save
          </Button>
        </>
      }
      style={{ width: 682 }}>
      <div className="max-h-[72vh] overflow-y-auto pr-1">
        <Form layout="vertical" form={form}>
        <div className="flex w-full flex-1 mt-5">
          <div className="flex flex-col flex-1 pr-[24px]">
            <Form.Item label="Record Interval" className="[&_.arco-form-item-label]:!text-xs">
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
            <Form.Item label="Manual capture shortcut" className="[&_.arco-form-item-label]:!text-xs">
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
            <Form.Item label="Adaptive capture rules" className="[&_.arco-form-item-label]:!text-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary,#6e718c)]">
                  Capture after meaningful workflow changes.
                </div>
                <Switch
                  checked={tempAdaptiveCapture.enabled}
                  onChange={(enabled) => onSetTempAdaptiveCapture({ ...tempAdaptiveCapture, enabled })}
                />
              </div>
              {tempAdaptiveCapture.enabled && (
                <div className="mt-3 flex flex-col gap-3">
                  <AdaptiveRuleControl
                    label="Window switch"
                    description="Capture after the selected active source changes."
                    value={tempAdaptiveCapture.windowSwitch}
                    onChange={(value) => updateAdaptiveRule('windowSwitch', value)}
                  />
                  <AdaptiveRuleControl
                    label="Active app stable"
                    description="Capture once after the same source stays active."
                    value={tempAdaptiveCapture.activeAppStable}
                    onChange={(value) => updateAdaptiveRule('activeAppStable', value)}
                  />
                  <AdaptiveRuleControl
                    label="Return from idle"
                    description="Capture after the system becomes active again."
                    value={tempAdaptiveCapture.idleResume}
                    onChange={(value) => updateAdaptiveRule('idleResume', value)}
                  />
                </div>
              )}
            </Form.Item>
            <Form.Item label="Choose what to record" shouldUpdate>
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
            <Form.Item label="Enable recording hours" className="[&_.arco-form-item-label]:!text-xs !mb-0">
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
                <Form.Item label="Set recording hours" className="[&_.arco-form-item-label]:!text-xs">
                  <TimePicker.RangePicker
                    format="HH:mm"
                    value={tempRecordingHours}
                    onChange={(value) => onSetTempRecordingHours(value as [string, string])}
                  />
                </Form.Item>
                <Form.Item label="Apply to days" className="[&_.arco-form-item-label]: !text-xs">
                  <Radio.Group value={tempApplyToDays} onChange={onSetTempApplyToDays}>
                    <Radio value="weekday" className="[&_.arco-radio-mask]: !border-[#d7daea]">
                      Only weekday
                    </Radio>
                    <Radio value="everyday" className="[&_.arco-radio-mask]: !border-[#d7daea]">
                      Everyday
                    </Radio>
                  </Radio.Group>
                </Form.Item>
              </div>
            )}
          </div>
          <div
            className={clsx(
              'flex flex-col flex-1 border-l border-[#efeff4] max-h-[360px] h-[360px] overflow-x-hidden overflow-y-auto px-[16px]  [&_.arco-checkbox-checked_.arco-checkbox-mask]:!bg-[#000000] [&_.arco-checkbox-checked_.arco-checkbox-mask]:!border-[#000000]',
              { hidden: !applicationVisible }
            )}>
            <div className="text-[15px] leading-[18px] text-[#42464e] mb-[12px] font-medium">Choose what to record</div>
            <div className="[&_.arco-checkbox]:!flex [&_.arco-checkbox]:!items-center">
              <div className="text-[14px] leading-[20px] text-[#42464e] mb-[4px]">Screen</div>
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
              <div className="text-[14px] leading-[20px] text-[#42464e] mb-[4px]">Window</div>
              <div className="text-[10px] leading-[12px] text-[#737a87] mb-[4px]">
                Only opened applications can be selected
              </div>
              <Form.Item field="windowSources">
                <Checkbox.Group className="flex flex-col space-y-4">
                  {appAllSources.map((source) => (
                    <Checkbox key={source.id} value={source.id}>
                      <div className="flex items-center space-x-[4px]">
                        <img
                          src={source.appIcon || source.thumbnail || ''}
                          alt=""
                          className="w-[14px] h-[14px] inline-block object-cover"
                        />
                        <div className="text-[13px] leading-[22px] text-[#0b0b0f] !ml-[4px] line-clamp-1">
                          {source.name}
                        </div>
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
