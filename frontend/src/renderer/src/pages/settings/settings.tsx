// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { FC, useMemo, useEffect, useState } from 'react'
import { Form, Button, Select, Input, Typography, Spin, Message, Switch, Radio, InputNumber } from '@arco-design/web-react'
import { IconFolder, IconPoweroff, IconRefresh, IconSave } from '@arco-design/web-react/icon'
import { find, get, isEmpty, pick } from 'lodash'
import type { ThemeMode } from '@shared/theme'
import { IpcChannel } from '@shared/IpcChannel'
import {
  defaultAppRuntimeSettings,
  MAX_BACKEND_START_PORT,
  MIN_BACKEND_START_PORT,
  type AppRuntimeSettings
} from '@shared/app-runtime-settings'

import ModelRadio from './components/modelRadio/model-radio'
import { ModelTypeList, BaseUrl, embeddingModels, ModelInfoList } from './constants'
import {
  deleteModelProfileAPI,
  getModelInfo,
  getModelProfilesAPI,
  ModelConfigProps,
  ModelProfileProps,
  updateModelSettingsAPI
} from '../../services/Settings'
import { useMemoizedFn, useMount, useRequest } from 'ahooks'

const FormItem = Form.Item
const { Text } = Typography

interface SettingsProps {
  closeSetting?: () => void
  init?: boolean
}
export interface InputPrefixProps {
  label: string
}
const InputPrefix: FC<InputPrefixProps> = (props) => {
  const { label } = props
  return <div className="flex w-[73px] items-center">{label}</div>
}
export interface CustomFormItemsProps {
  prefix: string
}
const CustomFormItems: FC<CustomFormItemsProps> = (props) => {
  const { prefix } = props
  return (
    <>
      <div className="flex flex-col gap-6 mb-6">
        <div className="flex flex-col gap-[8px]">
          <span className="text-[var(--mc-text-primary)] font-roboto text-base font-normal leading-[22px] ">
            Vision language model
          </span>
          <FormItem
            field={`${prefix}-modelId`}
            className="!mb-0"
            rules={[{ required: true, message: 'Cannot be empty' }]}
            requiredSymbol={false}>
            <Input
              addBefore={<InputPrefix label="Model name" />}
              placeholder="A VLM model with visual understanding capabilities is required."
              allowClear
              className="[&_.arco-input-inner-wrapper]: !w-[574px]"
            />
          </FormItem>
          <FormItem
            field={`${prefix}-baseUrl`}
            className="!mb-0"
            rules={[{ required: true, message: 'Cannot be empty' }]}
            requiredSymbol={false}>
            <Input
              addBefore={<InputPrefix label="Base URL" />}
              placeholder="Enter your base URL"
              allowClear
              className="[&_.arco-input-inner-wrapper]: !w-[574px]"
            />
          </FormItem>
          <FormItem
            field={`${prefix}-apiKey`}
            className="!mb-0"
            requiredSymbol={false}>
            <Input.Password
              addBefore={<InputPrefix label="API Key" />}
              placeholder="Enter your API Key"
              allowClear
              className="!w-[574px]"
              defaultVisibility={false}
            />
          </FormItem>
        </div>
        <div className="flex flex-col gap-[8px]">
          <span className="text-[var(--mc-text-primary)] font-roboto text-base font-normal leading-[22px]">
            Embedding model
          </span>
          <FormItem field={`${prefix}-embeddingModelPlatform`} className="!mb-0" requiredSymbol={false}>
            <Select
              placeholder="Select embedding provider"
              className="!w-[574px]"
              options={[
                { label: 'OpenAI compatible', value: 'custom' },
                { label: 'OpenAI', value: 'openai' },
                { label: 'Doubao', value: 'doubao' },
                { label: 'Aliyun DashScope', value: 'aliyun' }
              ]}
            />
          </FormItem>
          <FormItem
            field={`${prefix}-embeddingModelId`}
            className="!mb-0"
            rules={[{ required: true, message: 'Cannot be empty' }]}
            requiredSymbol={false}>
            <Input
              addBefore={<InputPrefix label="Model name" />}
              placeholder="Enter your embedding model name"
              allowClear
              className="!w-[574px]"
            />
          </FormItem>
          <FormItem
            field={`${prefix}-embeddingBaseUrl`}
            className="!mb-0"
            rules={[{ required: true, message: 'Cannot be empty' }]}
            requiredSymbol={false}>
            <Input
              addBefore={<InputPrefix label="Base URL" />}
              placeholder="Enter your base URL"
              allowClear
              className="!w-[574px]"
            />
          </FormItem>
          <FormItem
            field={`${prefix}-embeddingApiKey`}
            className="!mb-0"
            requiredSymbol={false}>
            <Input.Password
              addBefore={<InputPrefix label="API Key" />}
              placeholder="Enter your API Key"
              allowClear
              className="!w-[574px]"
              defaultVisibility={false}
            />
          </FormItem>
        </div>
      </div>
    </>
  )
}
export interface StandardFormItemsProps {
  modelPlatform: ModelTypeList
  prefix: string
}
const StandardFormItems: FC<StandardFormItemsProps> = (props) => {
  const { modelPlatform, prefix } = props
  const option = useMemo(() => {
    const foundItem = find(ModelInfoList, (item) => item.value === modelPlatform)
    return foundItem ? foundItem.option : []
  }, [modelPlatform])

  return (
    <>
      <FormItem
        label="Select AI model"
        field={`${prefix}-modelId`}
        requiredSymbol={false}
        rules={[
          {
            validator(value, callback) {
              if (!value) {
                callback('Please select AI model')
              } else {
                callback()
              }
            }
          }
        ]}>
        <Select allowCreate placeholder="please select" options={option} className="!w-[574px]" />
      </FormItem>
      <FormItem
        requiredSymbol={false}
        label="API Key"
        field={`${prefix}-apiKey`}
        extra={
          <div className="flex items-center text-[var(--mc-text-secondary)] text-[14px] ">
            You can get the API Key Here:
            <Button
              onClick={() => {
                const url =
                  modelPlatform === ModelTypeList.Doubao
                    ? 'https://www.volcengine.com/docs/82379/1541594'
                    : 'https://platform.openai.com/settings/organization/api-keys'
                window.open(`${url}`)
              }}
              type="text">
              {modelPlatform === ModelTypeList.Doubao ? 'Get Doubao API Key' : 'Get OpenAI API Key'}
            </Button>
          </div>
        }
        rules={[
          {
            validator(value, callback) {
              if (!value) {
                callback('Please enter your API key')
              } else {
                callback()
              }
            }
          }
        ]}>
        <Input.Password
          autoFocus
          placeholder="Enter your API key"
          allowClear
          className="!w-[574px]"
          defaultVisibility={false}
        />
      </FormItem>
    </>
  )
}

// 1. Add showCheckIcon state
export interface SettingsFormBase {
  modelPlatform: string
}

type ModelConfigField =
  | 'modelId'
  | 'apiKey'
  | 'baseUrl'
  | 'embeddingModelId'
  | 'embeddingBaseUrl'
  | 'embeddingApiKey'
  | 'embeddingModelPlatform'

export type SettingsFormProps = SettingsFormBase &
  Partial<Record<`${ModelTypeList}-${ModelConfigField}`, string>>

const Settings: FC<SettingsProps> = (props) => {
  const { closeSetting, init } = props

  const [form] = Form.useForm<SettingsFormProps>()
  const [launchOnBoot, setLaunchOnBoot] = useState(false)
  const [launchOnBootLoading, setLaunchOnBootLoading] = useState(false)
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [themeLoading, setThemeLoading] = useState(false)
  const [runtimeSettings, setRuntimeSettings] = useState<AppRuntimeSettings>(defaultAppRuntimeSettings)
  const [runtimeSettingsSaving, setRuntimeSettingsSaving] = useState(false)
  const [currentBackendPort, setCurrentBackendPort] = useState<number>()
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateDownloading, setUpdateDownloading] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [availableUpdateVersion, setAvailableUpdateVersion] = useState<string>()
  const [modelProfiles, setModelProfiles] = useState<ModelProfileProps[]>([])
  const [selectedProfileName, setSelectedProfileName] = useState<string>()
  const { run: getInfo, loading: getInfoLoading, data: modelInfo } = useRequest(getModelInfo, { manual: true })
  const { run: getProfiles } = useRequest(getModelProfilesAPI, {
    manual: true,
    onSuccess(data) {
      setModelProfiles(data || [])
    }
  })

  const { run: updateModelSettings, loading: updateLoading } = useRequest(updateModelSettingsAPI, {
    manual: true,
    onSuccess() {
      Message.success('Your API key saved successfully')
      getInfo()
      getProfiles()
      if (init) {
        closeSetting?.()
      }
    },
    onError(e: Error) {
      const errMsg = get(e, 'response.data.message') || get(e, 'message') || 'Failed to save settings'
      Message.error(errMsg)
    }
  })
  const getValidationMessage = (error: any) => {
    if (!error) {
      return 'Please complete the required model settings'
    }
    if (typeof error === 'string') {
      return error
    }
    if (error.message) {
      return error.message
    }

    const firstFieldError = Object.values(error)[0] as any
    if (Array.isArray(firstFieldError)) {
      return firstFieldError[0]?.message || firstFieldError[0] || 'Please complete the required model settings'
    }
    return firstFieldError?.message || 'Please complete the required model settings'
  }

  const setFormFromConfig = useMemoizedFn((config: ModelConfigProps) => {
    if (!config?.modelPlatform) return

    const prefix = config.modelPlatform as ModelTypeList
    form.setFieldsValue({
      modelPlatform: prefix,
      [`${prefix}-modelId`]: config.modelId,
      [`${prefix}-apiKey`]: config.apiKey,
      [`${prefix}-baseUrl`]: config.baseUrl,
      [`${prefix}-embeddingModelId`]: config.embeddingModelId,
      [`${prefix}-embeddingBaseUrl`]: config.embeddingBaseUrl,
      [`${prefix}-embeddingApiKey`]: config.embeddingApiKey,
      [`${prefix}-embeddingModelPlatform`]: config.embeddingModelPlatform || ModelTypeList.Custom
    } as SettingsFormProps)
  })

  const switchModelProfile = useMemoizedFn((profileName: string) => {
    setSelectedProfileName(profileName)
    const profile = modelProfiles.find((item) => item.name === profileName)
    if (!profile) return
    setFormFromConfig(profile.config)
    updateModelSettings(profile.config)
  })

  const deleteSelectedProfile = useMemoizedFn(async () => {
    if (!selectedProfileName) return
    if (!window.confirm(`Delete saved model profile "${selectedProfileName}"?`)) return

    try {
      await deleteModelProfileAPI(selectedProfileName)
      Message.success('Model profile deleted')
      setSelectedProfileName(undefined)
      getProfiles()
    } catch (error: any) {
      Message.error(get(error, 'response.data.message') || get(error, 'message') || 'Failed to delete profile')
    }
  })

  const submit = useMemoizedFn(async () => {
    try {
      await form.validate()
      const values = form.getFieldsValue()
      const isCustom = values.modelPlatform === ModelTypeList.Custom
      if (!values.modelPlatform) {
        Message.error('Please select Model Platform')
        return
      }
      const commonKey = [
        'modelPlatform',
        `${values.modelPlatform}-modelId`,
        `${values.modelPlatform}-apiKey`,
        `${values.modelPlatform}-baseUrl`,
        `${values.modelPlatform}-embeddingModelId`,
        `${values.modelPlatform}-embeddingBaseUrl`,
        `${values.modelPlatform}-embeddingApiKey`
      ]
      const data = pick(values, commonKey)
      const formatData = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key.replace(`${values.modelPlatform}-`, ''), value])
      )
      const params = isCustom
        ? formatData
        : {
            ...formatData,
            baseUrl: values.modelPlatform === ModelTypeList.Doubao ? BaseUrl.DoubaoUrl : BaseUrl.OpenAIUrl,
            embeddingModelId:
              values.modelPlatform === ModelTypeList.Doubao
                ? embeddingModels.DoubaoEmbeddingModelId
                : embeddingModels.OpenAIEmbeddingModelId
          }

      updateModelSettings(params as unknown as ModelConfigProps)
    } catch (error: any) {
      Message.error(getValidationMessage(error))
    }
  })

  useMount(() => {
    getInfo()
    getProfiles()
    ;(async () => {
      try {
        const enabled = await window.api.getLaunchOnBoot()
        setLaunchOnBoot(Boolean(enabled))
        const theme = await window.api.getTheme()
        setThemeMode(theme.mode)
        const settings = await window.api.getRuntimeSettings()
        setRuntimeSettings(settings)
        const backendStatus = await window.api.getBackendStatus()
        setCurrentBackendPort(backendStatus.port)
      } catch (error) {
        console.error('Failed to load app settings', error)
      }
    })()
  })

  useEffect(() => {
    if (!window.electron?.ipcRenderer) {
      return
    }

    const ipcRenderer = window.electron.ipcRenderer
    const removeUpdateAvailableListener = ipcRenderer.on(IpcChannel.UpdateAvailable, (_event, info) => {
      setAvailableUpdateVersion(info?.version)
      setUpdateDownloaded(false)
      setUpdateDownloading(true)
    })
    const removeUpdateNotAvailableListener = ipcRenderer.on(IpcChannel.UpdateNotAvailable, () => {
      setAvailableUpdateVersion(undefined)
      setUpdateDownloaded(false)
      setUpdateDownloading(false)
    })
    const removeUpdateDownloadedListener = ipcRenderer.on(IpcChannel.UpdateDownloaded, (_event, info) => {
      setAvailableUpdateVersion(info?.version)
      setUpdateDownloaded(true)
      setUpdateDownloading(false)
      Message.success(`Update ${info?.version || ''} downloaded. Restart to install.`)
    })
    const removeUpdateErrorListener = ipcRenderer.on(IpcChannel.UpdateError, (_event, error) => {
      setUpdateDownloading(false)
      Message.error(get(error, 'message') || 'Failed to check for updates')
    })

    return () => {
      removeUpdateAvailableListener()
      removeUpdateNotAvailableListener()
      removeUpdateDownloadedListener()
      removeUpdateErrorListener()
    }
  }, [])

  const handleLaunchOnBootChange = useMemoizedFn(async (checked: boolean) => {
    setLaunchOnBootLoading(true)
    try {
      await window.api.setLaunchOnBoot(checked)
      setLaunchOnBoot(checked)
    } catch (error) {
      Message.error('Failed to update launch on boot setting')
    } finally {
      setLaunchOnBootLoading(false)
    }
  })

  const handleThemeModeChange = useMemoizedFn(async (mode: ThemeMode) => {
    setThemeLoading(true)
    try {
      const theme = await window.api.setTheme(mode)
      setThemeMode(theme.mode)
    } catch (error) {
      Message.error('Failed to update theme setting')
    } finally {
      setThemeLoading(false)
    }
  })

  const handleCheckForUpdates = useMemoizedFn(async () => {
    setUpdateChecking(true)
    setUpdateDownloaded(false)
    try {
      const result = await window.api.checkForUpdate()
      const nextUpdateVersion = result?.updateInfo?.version
      if (result?.error) {
        Message.error(result.error)
        return
      }

      if (nextUpdateVersion) {
        setAvailableUpdateVersion(nextUpdateVersion)
        setUpdateDownloading(true)
        Message.info(`Update ${nextUpdateVersion} found. Downloading...`)
      } else {
        setAvailableUpdateVersion(undefined)
        setUpdateDownloading(false)
        Message.success(`MineContext is up to date (${result?.currentVersion || 'current version'})`)
      }
    } catch (error: any) {
      Message.error(get(error, 'message') || 'Failed to check for updates')
    } finally {
      setUpdateChecking(false)
    }
  })

  const handleInstallUpdate = useMemoizedFn(() => {
    window.api.quitAndInstall()
  })

  const handleSelectScreenshotDirectory = useMemoizedFn(async () => {
    const selectedDirectory = await window.api.selectPath({
      title: 'Select screenshot directory',
      properties: ['openDirectory', 'createDirectory']
    })
    if (selectedDirectory) {
      setRuntimeSettings((settings) => ({
        ...settings,
        screenshotDirectory: selectedDirectory
      }))
    }
  })

  const handleSaveRuntimeSettings = useMemoizedFn(async () => {
    setRuntimeSettingsSaving(true)
    try {
      const nextSettings = await window.api.setRuntimeSettings(runtimeSettings)
      setRuntimeSettings(nextSettings)
      Message.success('Local storage settings saved')
      if (currentBackendPort && nextSettings.backendStartPort !== currentBackendPort) {
        Message.info(`Backend port changes take effect after app restart. Current port: ${currentBackendPort}`)
      }
    } catch (error: any) {
      Message.error(get(error, 'message') || 'Failed to save local storage settings')
    } finally {
      setRuntimeSettingsSaving(false)
    }
  })

  useEffect(() => {
    const config = get(modelInfo, 'config')
    if (!getInfoLoading && !isEmpty(config) && !init) {
      setFormFromConfig(config)
    }
  }, [modelInfo, getInfoLoading, setFormFromConfig])

  return (
    <Spin loading={getInfoLoading} block className="[&_.arco-spin-children]:!h-full !h-full">
      <div className="top-0 left-0 flex flex-col h-full overflow-y-hidden py-2 pr-2 relative">
        <div className="bg-[var(--mc-surface)] rounded-[16px] pl-6 flex flex-col h-full overflow-y-auto overflow-x-hidden scrollbar-hide pb-2">
          <div className="mb-[12px]">
            <div className="mt-[26px] mb-[10px] text-[24px] font-bold text-[var(--mc-text-primary)]">
              Select a AI model to start
            </div>
            <Text type="secondary" className="text-[13px]">
              Configure AI model and API Key, then you can start MineContext’s intelligent context capability
            </Text>
          </div>

          <div>
            {!init && (
              <div className="mb-6 flex w-[574px] items-center justify-between border-b border-[var(--mc-border)] pb-4">
                <div>
                  <div className="text-[14px] leading-[20px] text-[var(--mc-text-primary)]">Launch at login</div>
                  <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                    Start MineContext automatically when you sign in.
                  </div>
                </div>
                <Switch checked={launchOnBoot} loading={launchOnBootLoading} onChange={handleLaunchOnBootChange} />
              </div>
            )}
            {!init && (
              <div className="mb-6 flex w-[574px] items-center justify-between border-b border-[var(--mc-border)] pb-4">
                <div>
                  <div className="text-[14px] leading-[20px] text-[var(--mc-text-primary)]">Appearance</div>
                  <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                    Follow the OS theme or choose a fixed app theme.
                  </div>
                </div>
                <Spin loading={themeLoading}>
                  <Radio.Group
                    type="button"
                    value={themeMode}
                    onChange={(value) => handleThemeModeChange(value as ThemeMode)}>
                    <Radio value="system">System</Radio>
                    <Radio value="light">Light</Radio>
                    <Radio value="dark">Dark</Radio>
                  </Radio.Group>
                </Spin>
              </div>
            )}
            {!init && (
              <div className="mb-6 flex w-[574px] items-center justify-between border-b border-[var(--mc-border)] pb-4">
                <div>
                  <div className="text-[14px] leading-[20px] text-[var(--mc-text-primary)]">App updates</div>
                  <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                    {availableUpdateVersion
                      ? updateDownloaded
                        ? `Version ${availableUpdateVersion} is ready to install.`
                        : `Version ${availableUpdateVersion} is downloading.`
                      : 'Check for the latest MineContext release.'}
                  </div>
                </div>
                {updateDownloaded ? (
                  <Button type="primary" icon={<IconPoweroff />} onClick={handleInstallUpdate}>
                    Restart
                  </Button>
                ) : (
                  <Button
                    icon={<IconRefresh />}
                    loading={updateChecking || updateDownloading}
                    disabled={updateDownloading}
                    onClick={handleCheckForUpdates}>
                    {updateDownloading ? 'Downloading' : 'Check'}
                  </Button>
                )}
              </div>
            )}
            {!init && (
              <div className="mb-6 w-[574px] border-b border-[var(--mc-border)] pb-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[14px] leading-[20px] text-[var(--mc-text-primary)]">Local storage</div>
                    <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                      Choose where screenshots are saved and which backend port MineContext tries first.
                    </div>
                  </div>
                  <Button
                    size="small"
                    type="primary"
                    icon={<IconSave />}
                    loading={runtimeSettingsSaving}
                    onClick={handleSaveRuntimeSettings}>
                    Save
                  </Button>
                </div>
                <div className="mb-3 flex items-center gap-2">
                  <Input
                    value={runtimeSettings.screenshotDirectory}
                    placeholder="Default screenshot directory"
                    allowClear
                    onChange={(value) =>
                      setRuntimeSettings((settings) => ({
                        ...settings,
                        screenshotDirectory: value
                      }))
                    }
                    className="flex-1"
                  />
                  <Button icon={<IconFolder />} onClick={handleSelectScreenshotDirectory}>
                    Browse
                  </Button>
                  <Button
                    icon={<IconRefresh />}
                    onClick={() =>
                      setRuntimeSettings((settings) => ({
                        ...settings,
                        screenshotDirectory: ''
                      }))
                    }>
                    Default
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[13px] leading-[18px] text-[var(--mc-text-primary)]">Backend start port</div>
                    <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                      MineContext will use this port first, then scan upward if it is occupied.
                    </div>
                  </div>
                  <InputNumber
                    min={MIN_BACKEND_START_PORT}
                    max={MAX_BACKEND_START_PORT}
                    precision={0}
                    value={runtimeSettings.backendStartPort}
                    onChange={(value) =>
                      setRuntimeSettings((settings) => ({
                        ...settings,
                        backendStartPort: Number(value) || defaultAppRuntimeSettings.backendStartPort
                      }))
                    }
                    className="!w-[140px]"
                  />
                </div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[13px] leading-[18px] text-[var(--mc-text-primary)]">
                      Keep raw screenshot files
                    </div>
                    <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                      Turn off to keep only semantic summaries and vectors after processing.
                    </div>
                  </div>
                  <Switch
                    checked={runtimeSettings.retainScreenshotImages}
                    onChange={(checked) =>
                      setRuntimeSettings((settings) => ({
                        ...settings,
                        retainScreenshotImages: checked
                      }))
                    }
                  />
                </div>
                {currentBackendPort && runtimeSettings.backendStartPort !== currentBackendPort && (
                  <div className="mt-2 text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                    Current backend port: {currentBackendPort}. Port changes apply after app restart.
                  </div>
                )}
                {!runtimeSettings.retainScreenshotImages && (
                  <div className="mt-2 text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                    Raw screenshot retention changes apply after app restart.
                  </div>
                )}
              </div>
            )}
            {!init && modelProfiles.length > 0 && (
              <div className="mb-6 w-[574px] border-b border-[var(--mc-border)] pb-4">
                <div className="mb-2 text-[14px] leading-[20px] text-[var(--mc-text-primary)]">
                  Saved model profiles
                </div>
                <div className="flex gap-2">
                  <Select
                    placeholder="Switch to a previously saved model"
                    value={selectedProfileName}
                    options={modelProfiles.map((profile) => ({
                      value: profile.name,
                      label: profile.name
                    }))}
                    onChange={(value) => switchModelProfile(value as string)}
                    className="flex-1"
                  />
                  <Button disabled={!selectedProfileName} onClick={deleteSelectedProfile}>
                    Delete
                  </Button>
                </div>
              </div>
            )}
            <Form
              autoComplete="off"
              layout={'vertical'}
              form={form}
              initialValues={{
                modelPlatform: ModelTypeList.Doubao,
                [`${ModelTypeList.Doubao}-modelId`]: 'doubao-seed-1-6-flash-250828',
                [`${ModelTypeList.OpenAI}-modelId`]: 'gpt-5-nano'
              }}>
              <FormItem label="Model platform" field={'modelPlatform'} requiredSymbol={false}>
                <ModelRadio />
              </FormItem>
              <FormItem
                shouldUpdate={(prevValues, currentValues) => prevValues.modelPlatform !== currentValues.modelPlatform}
                noStyle>
                {(values) => {
                  const modelPlatform = values.modelPlatform
                  if (modelPlatform === ModelTypeList.Custom) {
                    return <CustomFormItems prefix={ModelTypeList.Custom} />
                  } else if (modelPlatform === ModelTypeList.Doubao) {
                    return <StandardFormItems modelPlatform={modelPlatform} prefix={ModelTypeList.Doubao} />
                  } else if (modelPlatform === ModelTypeList.OpenAI) {
                    return <StandardFormItems modelPlatform={modelPlatform} prefix={ModelTypeList.OpenAI} />
                  } else {
                    return null
                  }
                }}
              </FormItem>
            </Form>
            <Spin loading={updateLoading}>
              <Button
                type="primary"
                onClick={submit}
                disabled={updateLoading}
                className="!bg-[var(--mc-primary-button-bg)] !text-[var(--mc-primary-button-text)]">
                {init ? 'Get started' : 'Save'}
              </Button>
            </Spin>
          </div>
        </div>
      </div>
    </Spin>
  )
}

export default Settings
