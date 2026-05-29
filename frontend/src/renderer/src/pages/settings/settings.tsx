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
  type AppProxyMode,
  type AppRuntimeSettings
} from '@shared/app-runtime-settings'

import ModelRadio from './components/modelRadio/model-radio'
import { ModelTypeList, BaseUrl, embeddingModels, ModelInfoList } from './constants'
import {
  ContentGenerationConfigProps,
  ContentGenerationIntervalConfigProps,
  deleteModelProfileAPI,
  getFeatureModelAssignmentsAPI,
  getGeneralSettingsAPI,
  getModelInfo,
  getModelProfilesAPI,
  getPromptModelAssignmentsAPI,
  getPromptLanguageAPI,
  getPromptsAPI,
  ModelConfigProps,
  ModelProfileProps,
  PromptLanguage,
  PromptsConfigProps,
  TodoApprovalMode,
  updateGeneralSettingsAPI,
  updateFeatureModelAssignmentsAPI,
  updatePromptModelAssignmentsAPI,
  updatePromptLanguageAPI,
  updatePromptsAPI,
  updateModelSettingsAPI
} from '../../services/Settings'
import { useMemoizedFn, useMount, useRequest } from 'ahooks'
import { useLocalizedText } from '@renderer/hooks/use-app-language'

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
  const t = useLocalizedText()
  return (
    <>
      <div className="flex flex-col gap-6 mb-6">
        <div className="flex flex-col gap-[8px]">
          <span className="text-[var(--mc-text-primary)] font-roboto text-base font-normal leading-[22px] ">
            {t('Vision language model', '视觉语言模型')}
          </span>
          <FormItem
            field={`${prefix}-modelId`}
            className="!mb-0"
            rules={[{ required: true, message: t('Cannot be empty', '不能为空') }]}
            requiredSymbol={false}>
            <Input
              addBefore={<InputPrefix label={t('Model name', '模型名称')} />}
              placeholder={t(
                'A VLM model with visual understanding capabilities is required.',
                '需要一个具备视觉理解能力的 VLM 模型。'
              )}
              allowClear
              className="[&_.arco-input-inner-wrapper]: !w-[574px]"
            />
          </FormItem>
          <FormItem
            field={`${prefix}-baseUrl`}
            className="!mb-0"
            rules={[{ required: true, message: t('Cannot be empty', '不能为空') }]}
            requiredSymbol={false}>
            <Input
              addBefore={<InputPrefix label={t('Base URL', '接口地址')} />}
              placeholder={t('Enter your base URL', '请输入接口地址')}
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
              placeholder={t('Enter your API Key', '请输入 API Key')}
              allowClear
              className="!w-[574px]"
              defaultVisibility={false}
            />
          </FormItem>
        </div>
        <div className="flex flex-col gap-[8px]">
          <span className="text-[var(--mc-text-primary)] font-roboto text-base font-normal leading-[22px]">
            {t('Embedding model', 'Embedding 模型')}
          </span>
          <FormItem field={`${prefix}-embeddingModelPlatform`} className="!mb-0" requiredSymbol={false}>
            <Select
              placeholder={t('Select embedding provider', '选择 Embedding 服务商')}
              className="!w-[574px]"
              options={[
                { label: t('OpenAI compatible', 'OpenAI 兼容'), value: 'custom' },
                { label: 'OpenAI', value: 'openai' },
                { label: t('Doubao', '豆包'), value: 'doubao' },
                { label: t('Aliyun DashScope', '阿里云 DashScope'), value: 'aliyun' }
              ]}
            />
          </FormItem>
          <FormItem
            field={`${prefix}-embeddingModelId`}
            className="!mb-0"
            rules={[{ required: true, message: t('Cannot be empty', '不能为空') }]}
            requiredSymbol={false}>
            <Input
              addBefore={<InputPrefix label={t('Model name', '模型名称')} />}
              placeholder={t('Enter your embedding model name', '请输入 Embedding 模型名称')}
              allowClear
              className="!w-[574px]"
            />
          </FormItem>
          <FormItem
            field={`${prefix}-embeddingBaseUrl`}
            className="!mb-0"
            rules={[{ required: true, message: t('Cannot be empty', '不能为空') }]}
            requiredSymbol={false}>
            <Input
              addBefore={<InputPrefix label={t('Base URL', '接口地址')} />}
              placeholder={t('Enter your base URL', '请输入接口地址')}
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
              placeholder={t('Enter your API Key', '请输入 API Key')}
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
  const t = useLocalizedText()
  const option = useMemo(() => {
    const foundItem = find(ModelInfoList, (item) => item.value === modelPlatform)
    return foundItem ? foundItem.option : []
  }, [modelPlatform])

  return (
    <>
      <FormItem
        label={t('Select AI model', '选择 AI 模型')}
        field={`${prefix}-modelId`}
        requiredSymbol={false}
        rules={[
          {
            validator(value, callback) {
              if (!value) {
                callback(t('Please select AI model', '请选择 AI 模型'))
              } else {
                callback()
              }
            }
          }
        ]}>
        <Select allowCreate placeholder={t('please select', '请选择')} options={option} className="!w-[574px]" />
      </FormItem>
      <FormItem
        requiredSymbol={false}
        label="API Key"
        field={`${prefix}-apiKey`}
        extra={
          <div className="flex items-center text-[var(--mc-text-secondary)] text-[14px] ">
            {t('You can get the API Key Here:', '你可以在这里获取 API Key：')}
            <Button
              onClick={() => {
                const url =
                  modelPlatform === ModelTypeList.Doubao
                    ? 'https://www.volcengine.com/docs/82379/1541594'
                    : modelPlatform === ModelTypeList.Zhipu
                      ? 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys'
                      : 'https://platform.openai.com/settings/organization/api-keys'
                window.open(`${url}`)
              }}
              type="text">
              {modelPlatform === ModelTypeList.Doubao
                ? t('Get Doubao API Key', '获取豆包 API Key')
                : modelPlatform === ModelTypeList.Zhipu
                  ? t('Get Zhipu API Key', '获取智谱 API Key')
                  : t('Get OpenAI API Key', '获取 OpenAI API Key')}
            </Button>
          </div>
        }
        rules={[
          {
            validator(value, callback) {
              if (!value) {
                callback(t('Please enter your API key', '请输入 API Key'))
              } else {
                callback()
              }
            }
          }
        ]}>
        <Input.Password
          autoFocus
          placeholder={t('Enter your API key', '请输入 API Key')}
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

interface PromptPair {
  system: string
  user: string
}

interface PromptCategoryOption {
  label: string
  zhLabel: string
  value: string
  description: string
  zhDescription: string
}

const PROMPT_CATEGORY_OPTIONS: PromptCategoryOption[] = [
  {
    label: 'Todo extraction',
    zhLabel: '待办提取',
    value: 'generation.todo_extraction',
    description: 'Control task scope, language, detail level, priority rules, and output structure.',
    zhDescription: '控制任务范围、语言、细节级别、优先级规则和输出结构。'
  },
  {
    label: 'Smart tips',
    zhLabel: '智能提醒',
    value: 'generation.smart_tip_generation',
    description: 'Control suggestion style, planning focus, and reminder strictness.',
    zhDescription: '控制建议风格、规划重点和提醒严格度。'
  },
  {
    label: 'Daily report',
    zhLabel: '每日报告',
    value: 'generation.generation_report',
    description: 'Control report scope, summarization granularity, and future-task handling.',
    zhDescription: '控制报告范围、摘要粒度和未来任务处理。'
  },
  {
    label: 'Daily report merge',
    zhLabel: '每日报告合并',
    value: 'generation.merge_hourly_reports',
    description: 'Control how hourly summaries are combined into the final daily report.',
    zhDescription: '控制每小时摘要如何合并为最终日报。'
  },
  {
    label: 'Activity monitor',
    zhLabel: '活动监控',
    value: 'generation.realtime_activity_monitor',
    description: 'Control real-time activity title and summary style.',
    zhDescription: '控制实时活动标题和摘要风格。'
  }
]

type GenerationIntervalKey = 'activity' | 'tips' | 'todos'
type FeatureModelAssignmentKey = GenerationIntervalKey | 'report'

interface GenerationIntervalOption {
  key: GenerationIntervalKey
  label: string
  zhLabel: string
  description: string
  zhDescription: string
  fallbackInterval: number
  minInterval: number
}

type NormalizedGenerationIntervalConfig = ContentGenerationIntervalConfigProps & {
  enabled: boolean
  interval: number
}

const GENERATION_INTERVAL_OPTIONS: GenerationIntervalOption[] = [
  {
    key: 'activity',
    label: 'Activity summaries',
    zhLabel: '活动摘要',
    description: 'Generate concise activity records from recent screen context.',
    zhDescription: '根据最近的屏幕上下文生成简洁的活动记录。',
    fallbackInterval: 900,
    minInterval: 600
  },
  {
    key: 'tips',
    label: 'Smart tips',
    zhLabel: '智能提醒',
    description: 'Generate planning suggestions and reminders.',
    zhDescription: '生成规划建议和提醒。',
    fallbackInterval: 3600,
    minInterval: 1800
  },
  {
    key: 'todos',
    label: 'Todos',
    zhLabel: '待办',
    description: 'Extract suggested tasks from recent activity.',
    zhDescription: '从最近活动中提取建议任务。',
    fallbackInterval: 1800,
    minInterval: 1800
  }
]

const DEFAULT_CONTENT_GENERATION_SETTINGS: ContentGenerationConfigProps = {
  activity: {
    enabled: true,
    interval: 900
  },
  tips: {
    enabled: true,
    interval: 3600
  },
  todos: {
    enabled: true,
    interval: 1800,
    approval_mode: 'review'
  },
  report: {
    enabled: true,
    time: '08:00'
  }
}

const getFeatureModelAssignmentKey = (key: FeatureModelAssignmentKey): string => {
  return `content_generation.${key}`
}

const NON_PROMPT_TOP_LEVEL_KEYS = new Set([
  'api_auth',
  'capture',
  'completion',
  'consumption',
  'content_generation',
  'embedding_model',
  'logging',
  'storage',
  'vlm_model',
  'web'
])

const stripNonPromptTopLevelKeys = (prompts: PromptsConfigProps): PromptsConfigProps => {
  return Object.fromEntries(
    Object.entries(prompts || {}).filter(([key]) => !NON_PROMPT_TOP_LEVEL_KEYS.has(key))
  ) as PromptsConfigProps
}

const clonePrompts = (prompts: PromptsConfigProps): PromptsConfigProps => {
  return JSON.parse(JSON.stringify(stripNonPromptTopLevelKeys(prompts)))
}

const getPromptPair = (prompts: PromptsConfigProps, path: string): PromptPair => {
  const target = path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[key]
  }, prompts)

  if (!target || typeof target !== 'object') {
    return { system: '', user: '' }
  }

  const prompt = target as Record<string, unknown>
  return {
    system: typeof prompt.system === 'string' ? prompt.system : '',
    user: typeof prompt.user === 'string' ? prompt.user : ''
  }
}

const setPromptPair = (prompts: PromptsConfigProps, path: string, pair: PromptPair): PromptsConfigProps => {
  const nextPrompts = clonePrompts(prompts)
  const pathParts = path.split('.')
  let target = nextPrompts as Record<string, unknown>

  pathParts.slice(0, -1).forEach((part) => {
    if (!target[part] || typeof target[part] !== 'object') {
      target[part] = {}
    }
    target = target[part] as Record<string, unknown>
  })

  target[pathParts[pathParts.length - 1]] = {
    system: pair.system,
    user: pair.user
  }
  return nextPrompts
}

const normalizeIntervalConfig = (
  config: ContentGenerationIntervalConfigProps | undefined,
  fallbackInterval: number
): NormalizedGenerationIntervalConfig => {
  const interval = Number(config?.interval)
  return {
    ...(config || {}),
    enabled: config?.enabled !== false,
    interval: Number.isFinite(interval) && interval > 0 ? interval : fallbackInterval
  }
}

const normalizeTodoApprovalMode = (mode: unknown): TodoApprovalMode => {
  return mode === 'auto_add' ? 'auto_add' : 'review'
}

const normalizeReportTime = (time: unknown): string => {
  return typeof time === 'string' && /^\d{2}:\d{2}$/.test(time) ? time : '08:00'
}

const normalizeContentGenerationSettings = (settings?: ContentGenerationConfigProps): ContentGenerationConfigProps => {
  const source = settings || {}
  return {
    ...source,
    activity: normalizeIntervalConfig(source.activity, 900),
    tips: normalizeIntervalConfig(source.tips, 3600),
    todos: {
      ...normalizeIntervalConfig(source.todos, 1800),
      approval_mode: normalizeTodoApprovalMode(source.todos?.approval_mode)
    },
    report: {
      ...(source.report || {}),
      enabled: source.report?.enabled !== false,
      time: normalizeReportTime(source.report?.time)
    }
  }
}

const getGenerationIntervalConfig = (
  settings: ContentGenerationConfigProps,
  option: GenerationIntervalOption
): NormalizedGenerationIntervalConfig => {
  return normalizeIntervalConfig(
    settings[option.key] as ContentGenerationIntervalConfigProps | undefined,
    option.fallbackInterval
  )
}

const Settings: FC<SettingsProps> = (props) => {
  const { closeSetting, init } = props
  const t = useLocalizedText()

  const [form] = Form.useForm<SettingsFormProps>()
  const [launchOnBoot, setLaunchOnBoot] = useState(false)
  const [launchOnBootLoading, setLaunchOnBootLoading] = useState(false)
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [themeLoading, setThemeLoading] = useState(false)
  const [promptLanguage, setPromptLanguage] = useState<PromptLanguage>('en')
  const [promptLanguageLoading, setPromptLanguageLoading] = useState(false)
  const [runtimeSettings, setRuntimeSettings] = useState<AppRuntimeSettings>(defaultAppRuntimeSettings)
  const [runtimeSettingsSaving, setRuntimeSettingsSaving] = useState(false)
  const [currentBackendPort, setCurrentBackendPort] = useState<number>()
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateDownloading, setUpdateDownloading] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [availableUpdateVersion, setAvailableUpdateVersion] = useState<string>()
  const [modelProfiles, setModelProfiles] = useState<ModelProfileProps[]>([])
  const [selectedProfileName, setSelectedProfileName] = useState<string>()
  const [prompts, setPrompts] = useState<PromptsConfigProps>({})
  const [promptModelAssignments, setPromptModelAssignments] = useState<Record<string, string>>({})
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptSaving, setPromptSaving] = useState(false)
  const [selectedPromptPath, setSelectedPromptPath] = useState(PROMPT_CATEGORY_OPTIONS[0].value)
  const [promptDraft, setPromptDraft] = useState<PromptPair>({ system: '', user: '' })
  const [contentGenerationSettings, setContentGenerationSettings] = useState<ContentGenerationConfigProps>(
    DEFAULT_CONTENT_GENERATION_SETTINGS
  )
  const [featureModelAssignments, setFeatureModelAssignments] = useState<Record<string, string>>({})
  const [contentGenerationLoading, setContentGenerationLoading] = useState(false)
  const [contentGenerationSaving, setContentGenerationSaving] = useState(false)
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
      Message.success(t('Your API key saved successfully', 'API Key 已保存'))
      getInfo()
      getProfiles()
      if (init) {
        closeSetting?.()
      }
    },
    onError(e: Error) {
      const errMsg = get(e, 'response.data.message') || get(e, 'message') || t('Failed to save settings', '保存设置失败')
      Message.error(errMsg)
    }
  })
  const getValidationMessage = (error: any) => {
    if (!error) {
      return t('Please complete the required model settings', '请完成必填模型设置')
    }
    if (typeof error === 'string') {
      return error
    }
    if (error.message) {
      return error.message
    }

    const firstFieldError = Object.values(error)[0] as any
    if (Array.isArray(firstFieldError)) {
      return firstFieldError[0]?.message || firstFieldError[0] || t('Please complete the required model settings', '请完成必填模型设置')
    }
    return firstFieldError?.message || t('Please complete the required model settings', '请完成必填模型设置')
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
    if (!window.confirm(t('Delete saved model profile', '删除已保存的模型配置') + ` "${selectedProfileName}"?`)) return

    try {
      await deleteModelProfileAPI(selectedProfileName)
      Message.success(t('Model profile deleted', '模型配置已删除'))
      setSelectedProfileName(undefined)
      getProfiles()
    } catch (error: any) {
      Message.error(get(error, 'response.data.message') || get(error, 'message') || t('Failed to delete profile', '删除配置失败'))
    }
  })

  const submit = useMemoizedFn(async () => {
    try {
      await form.validate()
      const values = form.getFieldsValue()
      const isManualConfig = values.modelPlatform === ModelTypeList.Custom || values.modelPlatform === ModelTypeList.Zhipu
      if (!values.modelPlatform) {
        Message.error(t('Please select Model Platform', '请选择模型平台'))
        return
      }
      const commonKey = [
        'modelPlatform',
        `${values.modelPlatform}-modelId`,
        `${values.modelPlatform}-apiKey`,
        `${values.modelPlatform}-baseUrl`,
        `${values.modelPlatform}-embeddingModelId`,
        `${values.modelPlatform}-embeddingBaseUrl`,
        `${values.modelPlatform}-embeddingApiKey`,
        `${values.modelPlatform}-embeddingModelPlatform`
      ]
      const data = pick(values, commonKey)
      const formatData = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key.replace(`${values.modelPlatform}-`, ''), value])
      )
      const params = isManualConfig
        ? formatData
        : {
            ...formatData,
            baseUrl: values.modelPlatform === ModelTypeList.Doubao ? BaseUrl.DoubaoUrl : BaseUrl.OpenAIUrl,
            embeddingModelPlatform: values.modelPlatform,
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

  const selectedPromptCategory = useMemo(() => {
    return PROMPT_CATEGORY_OPTIONS.find((option) => option.value === selectedPromptPath) || PROMPT_CATEGORY_OPTIONS[0]
  }, [selectedPromptPath])

  const modelProfileOptions = useMemo(() => {
    return [
      { label: t('Default model', '默认模型'), value: '' },
      ...modelProfiles.map((profile) => ({
        label: profile.name,
        value: profile.name
      }))
    ]
  }, [modelProfiles, t])

  const updateFeatureModelAssignment = useMemoizedFn((key: FeatureModelAssignmentKey, profileName: string) => {
    const assignmentKey = getFeatureModelAssignmentKey(key)
    setFeatureModelAssignments((assignments) => {
      const nextAssignments = { ...assignments }
      if (profileName) {
        nextAssignments[assignmentKey] = profileName
      } else {
        delete nextAssignments[assignmentKey]
      }
      return nextAssignments
    })
  })

  const updatePromptModelAssignment = useMemoizedFn((promptPath: string, profileName: string) => {
    setPromptModelAssignments((assignments) => {
      const nextAssignments = { ...assignments }
      if (profileName) {
        nextAssignments[promptPath] = profileName
      } else {
        delete nextAssignments[promptPath]
      }
      return nextAssignments
    })
  })

  const loadPrompts = useMemoizedFn(async () => {
    setPromptLoading(true)
    try {
      const [loadedPrompts, assignments] = await Promise.all([getPromptsAPI(), getPromptModelAssignmentsAPI()])
      setPrompts(stripNonPromptTopLevelKeys(loadedPrompts))
      setPromptModelAssignments(assignments.prompts || {})
    } catch (error: any) {
      Message.error(
        get(error, 'response.data.message') || get(error, 'message') || t('Failed to load system prompts', '加载系统提示词失败')
      )
    } finally {
      setPromptLoading(false)
    }
  })

  const handleSavePrompt = useMemoizedFn(async () => {
    setPromptSaving(true)
    try {
      const nextPrompts = setPromptPair(prompts, selectedPromptPath, promptDraft)
      const validProfileNames = new Set(modelProfiles.map((profile) => profile.name))
      const nextPromptAssignments = Object.fromEntries(
        Object.entries(promptModelAssignments).filter(([, profileName]) => validProfileNames.has(profileName))
      )
      await updatePromptsAPI(nextPrompts)
      await updatePromptModelAssignmentsAPI({ prompts: nextPromptAssignments })
      setPrompts(nextPrompts)
      setPromptModelAssignments(nextPromptAssignments)
      Message.success(t('System prompt saved', '系统提示词已保存'))
    } catch (error: any) {
      Message.error(
        get(error, 'response.data.message') || get(error, 'message') || t('Failed to save system prompt', '保存系统提示词失败')
      )
    } finally {
      setPromptSaving(false)
    }
  })

  const loadContentGenerationSettings = useMemoizedFn(async () => {
    setContentGenerationLoading(true)
    try {
      const [settings, assignments] = await Promise.all([getGeneralSettingsAPI(), getFeatureModelAssignmentsAPI()])
      setContentGenerationSettings(normalizeContentGenerationSettings(settings.content_generation))
      setFeatureModelAssignments(assignments.features || {})
    } catch (error: any) {
      Message.error(
        get(error, 'response.data.message') || get(error, 'message') || t('Failed to load content generation settings', '加载内容生成设置失败')
      )
    } finally {
      setContentGenerationLoading(false)
    }
  })

  const handleSaveContentGenerationSettings = useMemoizedFn(async () => {
    setContentGenerationSaving(true)
    try {
      const nextSettings = normalizeContentGenerationSettings(contentGenerationSettings)
      const validProfileNames = new Set(modelProfiles.map((profile) => profile.name))
      const nextFeatureAssignments = Object.fromEntries(
        Object.entries(featureModelAssignments).filter(([, profileName]) => validProfileNames.has(profileName))
      )
      await updateGeneralSettingsAPI({ content_generation: nextSettings })
      await updateFeatureModelAssignmentsAPI({ features: nextFeatureAssignments })
      setContentGenerationSettings(nextSettings)
      setFeatureModelAssignments(nextFeatureAssignments)
      Message.success(t('Content generation settings saved', '内容生成设置已保存'))
    } catch (error: any) {
      Message.error(
        get(error, 'response.data.message') || get(error, 'message') || t('Failed to save content generation settings', '保存内容生成设置失败')
      )
    } finally {
      setContentGenerationSaving(false)
    }
  })

  const loadPromptLanguage = useMemoizedFn(async () => {
    setPromptLanguageLoading(true)
    try {
      const language = await getPromptLanguageAPI()
      setPromptLanguage(language)
      await window.api.setLanguage(language)
    } catch (error: any) {
      Message.error(
        get(error, 'response.data.message') || get(error, 'message') || t('Failed to load language setting', '加载语言设置失败')
      )
    } finally {
      setPromptLanguageLoading(false)
    }
  })

  const handlePromptLanguageChange = useMemoizedFn(async (language: PromptLanguage) => {
    if (language === promptLanguage) {
      return
    }

    setPromptLanguageLoading(true)
    try {
      await updatePromptLanguageAPI(language)
      await window.api.setLanguage(language)
      setPromptLanguage(language)
      await loadPrompts()
      Message.success(
        language === 'zh'
          ? t('Language switched to Chinese', '语言已切换为中文')
          : t('Language switched to English', '语言已切换为英文')
      )
    } catch (error: any) {
      Message.error(
        get(error, 'response.data.message') || get(error, 'message') || t('Failed to update language setting', '更新语言设置失败')
      )
    } finally {
      setPromptLanguageLoading(false)
    }
  })

  const updateContentGenerationInterval = useMemoizedFn(
    (key: GenerationIntervalKey, patch: Partial<ContentGenerationIntervalConfigProps>) => {
      const option = GENERATION_INTERVAL_OPTIONS.find((item) => item.key === key)
      setContentGenerationSettings((settings) => {
        const current = normalizeIntervalConfig(
          settings[key] as ContentGenerationIntervalConfigProps | undefined,
          option?.fallbackInterval || 900
        )
        return {
          ...settings,
          [key]: {
            ...current,
            ...patch
          }
        }
      })
    }
  )

  const updateContentGenerationReport = useMemoizedFn(
    (patch: Partial<NonNullable<ContentGenerationConfigProps['report']>>) => {
      setContentGenerationSettings((settings) => {
        const report = settings.report || {}
        return {
          ...settings,
          report: {
            ...report,
            enabled: report.enabled !== false,
            time: normalizeReportTime(report.time),
            ...patch
          }
        }
      })
    }
  )

  useMount(() => {
    getInfo()
    getProfiles()
    if (!init) {
      loadPromptLanguage()
      loadPrompts()
      loadContentGenerationSettings()
    }
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
      Message.success(t('Update downloaded. Restart to install.', '更新已下载，请重启安装。'))
    })
    const removeUpdateErrorListener = ipcRenderer.on(IpcChannel.UpdateError, (_event, error) => {
      setUpdateDownloading(false)
      Message.error(get(error, 'message') || t('Failed to check for updates', '检查更新失败'))
    })

    return () => {
      removeUpdateAvailableListener()
      removeUpdateNotAvailableListener()
      removeUpdateDownloadedListener()
      removeUpdateErrorListener()
    }
  }, [t])

  const handleLaunchOnBootChange = useMemoizedFn(async (checked: boolean) => {
    setLaunchOnBootLoading(true)
    try {
      await window.api.setLaunchOnBoot(checked)
      setLaunchOnBoot(checked)
    } catch (error) {
      Message.error(t('Failed to update launch on boot setting', '更新开机启动设置失败'))
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
      Message.error(t('Failed to update theme setting', '更新主题设置失败'))
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
        Message.info(t('Update found. Downloading...', '发现更新，正在下载...'))
      } else {
        setAvailableUpdateVersion(undefined)
        setUpdateDownloading(false)
        Message.success(t('MineContext is up to date', 'MineContext 已是最新版本'))
      }
    } catch (error: any) {
      Message.error(get(error, 'message') || t('Failed to check for updates', '检查更新失败'))
    } finally {
      setUpdateChecking(false)
    }
  })

  const handleInstallUpdate = useMemoizedFn(() => {
    window.api.quitAndInstall()
  })

  const handleSelectScreenshotDirectory = useMemoizedFn(async () => {
    const selectedDirectory = await window.api.selectPath({
      title: t('Select screenshot directory', '选择截图目录'),
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
    if (runtimeSettings.proxyMode === 'custom' && !runtimeSettings.proxyUrl.trim()) {
      Message.error(t('Enter a proxy server URL', '请输入代理服务器地址'))
      return
    }

    setRuntimeSettingsSaving(true)
    try {
      const nextSettings = await window.api.setRuntimeSettings(runtimeSettings)
      setRuntimeSettings(nextSettings)
      Message.success(t('App settings saved', '应用设置已保存'))
      if (currentBackendPort && nextSettings.backendStartPort !== currentBackendPort) {
        Message.info(
          t('Backend port changes take effect after app restart. Current port:', '后端端口更改会在应用重启后生效。当前端口：') +
            ` ${currentBackendPort}`
        )
      }
    } catch (error: any) {
      Message.error(get(error, 'message') || t('Failed to save local storage settings', '保存本地存储设置失败'))
    } finally {
      setRuntimeSettingsSaving(false)
    }
  })

  useEffect(() => {
    setPromptDraft(getPromptPair(prompts, selectedPromptPath))
  }, [prompts, selectedPromptPath])

  useEffect(() => {
    const config = get(modelInfo, 'config')
    if (!getInfoLoading && !isEmpty(config) && !init) {
      setFormFromConfig(config)
    }
  }, [modelInfo, getInfoLoading, setFormFromConfig])

  const reportGenerationSettings = {
    enabled: contentGenerationSettings.report?.enabled !== false,
    time: normalizeReportTime(contentGenerationSettings.report?.time)
  }

  return (
    <Spin loading={getInfoLoading} block className="[&_.arco-spin-children]:!h-full !h-full">
      <div className="top-0 left-0 flex flex-col h-full overflow-y-hidden py-2 pr-2 relative">
        <div className="bg-[var(--mc-surface)] rounded-[16px] pl-6 flex flex-col h-full overflow-y-auto overflow-x-hidden scrollbar-hide pb-2">
          <div className="mb-[12px]">
            <div className="mt-[26px] mb-[10px] text-[24px] font-bold text-[var(--mc-text-primary)]">
              {t('Select a AI model to start', '选择一个 AI 模型开始')}
            </div>
            <Text type="secondary" className="text-[13px]">
              {t(
                'Configure AI model and API Key, then you can start MineContext’s intelligent context capability',
                '配置 AI 模型和 API Key 后，即可使用 MineContext 的智能上下文能力'
              )}
            </Text>
          </div>

          <div>
            {!init && (
              <div className="mb-6 flex w-[574px] items-center justify-between border-b border-[var(--mc-border)] pb-4">
                <div>
                  <div className="text-[14px] leading-[20px] text-[var(--mc-text-primary)]">
                    {t('Launch at login', '登录时启动')}
                  </div>
                  <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                    {t('Start MineContext automatically when you sign in.', '登录系统时自动启动 MineContext。')}
                  </div>
                </div>
                <Switch checked={launchOnBoot} loading={launchOnBootLoading} onChange={handleLaunchOnBootChange} />
              </div>
            )}
            {!init && (
              <div className="mb-6 flex w-[574px] items-center justify-between border-b border-[var(--mc-border)] pb-4">
                <div>
                  <div className="text-[14px] leading-[20px] text-[var(--mc-text-primary)]">
                    {t('Appearance', '外观')}
                  </div>
                  <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                    {t('Follow the OS theme or choose a fixed app theme.', '跟随系统主题，或选择固定的应用主题。')}
                  </div>
                </div>
                <Spin loading={themeLoading}>
                  <Radio.Group
                    type="button"
                    value={themeMode}
                    onChange={(value) => handleThemeModeChange(value as ThemeMode)}>
                    <Radio value="system">{t('System', '系统')}</Radio>
                    <Radio value="light">{t('Light', '浅色')}</Radio>
                    <Radio value="dark">{t('Dark', '深色')}</Radio>
                  </Radio.Group>
                </Spin>
              </div>
            )}
            {!init && (
              <div className="mb-6 flex w-[574px] items-center justify-between border-b border-[var(--mc-border)] pb-4">
                <div>
                  <div className="text-[14px] leading-[20px] text-[var(--mc-text-primary)]">
                    {t('Language', '语言')}
                  </div>
                  <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                    {t('Keep prompts and the tray menu in the same language.', '保持提示词和托盘菜单使用同一种语言。')}
                  </div>
                </div>
                <Spin loading={promptLanguageLoading}>
                  <Radio.Group
                    type="button"
                    value={promptLanguage}
                    onChange={(value) => handlePromptLanguageChange(value as PromptLanguage)}>
                    <Radio value="en">English</Radio>
                    <Radio value="zh">中文</Radio>
                  </Radio.Group>
                </Spin>
              </div>
            )}
            {!init && (
              <div className="mb-6 flex w-[574px] items-center justify-between border-b border-[var(--mc-border)] pb-4">
                <div>
                  <div className="text-[14px] leading-[20px] text-[var(--mc-text-primary)]">
                    {t('App updates', '应用更新')}
                  </div>
                  <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                    {availableUpdateVersion
                      ? updateDownloaded
                        ? t('Version', '版本') + ` ${availableUpdateVersion} ` + t('is ready to install.', '已准备好安装。')
                        : t('Version', '版本') + ` ${availableUpdateVersion} ` + t('is downloading.', '正在下载。')
                      : t('Check for the latest MineContext release.', '检查最新 MineContext 版本。')}
                  </div>
                </div>
                {updateDownloaded ? (
                  <Button type="primary" icon={<IconPoweroff />} onClick={handleInstallUpdate}>
                    {t('Restart', '重启')}
                  </Button>
                ) : (
                  <Button
                    icon={<IconRefresh />}
                    loading={updateChecking || updateDownloading}
                    disabled={updateDownloading}
                    onClick={handleCheckForUpdates}>
                    {updateDownloading ? t('Downloading', '下载中') : t('Check', '检查')}
                  </Button>
                )}
              </div>
            )}
            {!init && (
              <div className="mb-6 w-[574px] border-b border-[var(--mc-border)] pb-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[14px] leading-[20px] text-[var(--mc-text-primary)]">
                      {t('Network proxy', '网络代理')}
                    </div>
                    <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                      {t(
                        'Choose direct, system, or custom proxy routing for app network requests.',
                        '为应用网络请求选择直连、系统代理或自定义代理。'
                      )}
                    </div>
                  </div>
                  <Button
                    size="small"
                    type="primary"
                    icon={<IconSave />}
                    loading={runtimeSettingsSaving}
                    onClick={handleSaveRuntimeSettings}>
                    {t('Save', '保存')}
                  </Button>
                </div>
                <div className="mb-3">
                  <Radio.Group
                    type="button"
                    value={runtimeSettings.proxyMode}
                    onChange={(value) =>
                      setRuntimeSettings((settings) => ({
                        ...settings,
                        proxyMode: value as AppProxyMode
                      }))
                    }>
                    <Radio value="system">{t('System', '系统')}</Radio>
                    <Radio value="direct">{t('Direct', '直连')}</Radio>
                    <Radio value="custom">{t('Custom', '自定义')}</Radio>
                  </Radio.Group>
                </div>
                {runtimeSettings.proxyMode === 'custom' && (
                  <>
                    <div className="mb-3">
                      <div className="mb-1 text-[13px] leading-[18px] text-[var(--mc-text-primary)]">
                        {t('Proxy server', '代理服务器')}
                      </div>
                      <Input
                        value={runtimeSettings.proxyUrl}
                        placeholder="http://127.0.0.1:7890"
                        allowClear
                        onChange={(value) =>
                          setRuntimeSettings((settings) => ({
                            ...settings,
                            proxyUrl: value
                          }))
                        }
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-[13px] leading-[18px] text-[var(--mc-text-primary)]">
                        {t('Bypass hosts', '绕过主机')}
                      </div>
                      <Input
                        value={runtimeSettings.proxyBypassRules}
                        placeholder={defaultAppRuntimeSettings.proxyBypassRules}
                        allowClear
                        onChange={(value) =>
                          setRuntimeSettings((settings) => ({
                            ...settings,
                            proxyBypassRules: value
                          }))
                        }
                      />
                    </div>
                  </>
                )}
                <div className="mt-2 text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                  {t('Proxy changes apply immediately after saving.', '代理更改会在保存后立即生效。')}
                </div>
              </div>
            )}
            {!init && (
              <div className="mb-6 w-[574px] border-b border-[var(--mc-border)] pb-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[14px] leading-[20px] text-[var(--mc-text-primary)]">
                      {t('Content generation', '内容生成')}
                    </div>
                    <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                      {t('Set generation intervals and the daily report time.', '设置生成间隔和每日报告时间。')}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="small"
                      icon={<IconRefresh />}
                      loading={contentGenerationLoading}
                      onClick={loadContentGenerationSettings}>
                      {t('Reload', '重新加载')}
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      icon={<IconSave />}
                      loading={contentGenerationSaving}
                      disabled={contentGenerationLoading}
                      onClick={handleSaveContentGenerationSettings}>
                      {t('Save', '保存')}
                    </Button>
                  </div>
                </div>
                <Spin loading={contentGenerationLoading} block>
                  <div className="flex flex-col gap-4">
                    {GENERATION_INTERVAL_OPTIONS.map((option) => {
                      const config = getGenerationIntervalConfig(contentGenerationSettings, option)
                      const assignmentKey = getFeatureModelAssignmentKey(option.key)
                      return (
                        <div key={option.key} className="border-b border-[var(--mc-border)] pb-3 last:border-b-0 last:pb-0">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="text-[13px] leading-[18px] text-[var(--mc-text-primary)]">
                                {t(option.label, option.zhLabel)}
                              </div>
                              <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                                {t(option.description, option.zhDescription)}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              {option.key === 'todos' && (
                                <Radio.Group
                                  type="button"
                                  value={normalizeTodoApprovalMode(config.approval_mode)}
                                  onChange={(value) =>
                                    updateContentGenerationInterval('todos', {
                                      approval_mode: value as TodoApprovalMode
                                    })
                                  }>
                                  <Radio value="review">{t('Review', '审核')}</Radio>
                                  <Radio value="auto_add">{t('Auto add', '自动添加')}</Radio>
                                </Radio.Group>
                              )}
                              <Switch
                                checked={config.enabled}
                                onChange={(checked) => updateContentGenerationInterval(option.key, { enabled: checked })}
                              />
                              <InputNumber
                                min={option.minInterval}
                                precision={0}
                                step={60}
                                value={config.interval}
                                onChange={(value) =>
                                  updateContentGenerationInterval(option.key, {
                                    interval: Number(value) || option.fallbackInterval
                                  })
                                }
                                className="!w-[132px]"
                              />
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                              {t('Model', '模型')}
                            </div>
                            <Select
                              value={featureModelAssignments[assignmentKey] || ''}
                              options={modelProfileOptions}
                              onChange={(value) => updateFeatureModelAssignment(option.key, value as string)}
                              className="!w-[360px]"
                            />
                          </div>
                        </div>
                      )
                    })}
                    <div>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-[13px] leading-[18px] text-[var(--mc-text-primary)]">
                            {t('Daily report', '每日报告')}
                          </div>
                          <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                            {t('Generate one summary report at this local time.', '在这个本地时间生成一份摘要报告。')}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <Switch
                            checked={reportGenerationSettings.enabled}
                            onChange={(checked) => updateContentGenerationReport({ enabled: checked })}
                          />
                          <Input
                            type="time"
                            value={reportGenerationSettings.time}
                            onChange={(value) => updateContentGenerationReport({ time: normalizeReportTime(value) })}
                            className="!w-[132px]"
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                          {t('Model', '模型')}
                        </div>
                        <Select
                          value={featureModelAssignments[getFeatureModelAssignmentKey('report')] || ''}
                          options={modelProfileOptions}
                          onChange={(value) => updateFeatureModelAssignment('report', value as string)}
                          className="!w-[360px]"
                        />
                      </div>
                    </div>
                  </div>
                </Spin>
              </div>
            )}
            {!init && (
              <div className="mb-6 w-[574px] border-b border-[var(--mc-border)] pb-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[14px] leading-[20px] text-[var(--mc-text-primary)]">
                      {t('Local storage', '本地存储')}
                    </div>
                    <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                      {t(
                        'Choose where screenshots are saved and which backend port MineContext tries first.',
                        '选择截图保存位置，以及 MineContext 优先尝试的后端端口。'
                      )}
                    </div>
                  </div>
                  <Button
                    size="small"
                    type="primary"
                    icon={<IconSave />}
                    loading={runtimeSettingsSaving}
                    onClick={handleSaveRuntimeSettings}>
                    {t('Save', '保存')}
                  </Button>
                </div>
                <div className="mb-3 flex items-center gap-2">
                  <Input
                    value={runtimeSettings.screenshotDirectory}
                    placeholder={t('Default screenshot directory', '默认截图目录')}
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
                    {t('Browse', '浏览')}
                  </Button>
                  <Button
                    icon={<IconRefresh />}
                    onClick={() =>
                      setRuntimeSettings((settings) => ({
                        ...settings,
                        screenshotDirectory: ''
                      }))
                    }>
                    {t('Default', '默认')}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[13px] leading-[18px] text-[var(--mc-text-primary)]">
                      {t('Backend start port', '后端启动端口')}
                    </div>
                    <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                      {t(
                        'MineContext will use this port first, then scan upward if it is occupied.',
                        'MineContext 会优先使用此端口；若被占用，则向上扫描可用端口。'
                      )}
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
                      {t('Keep raw screenshot files', '保留原始截图文件')}
                    </div>
                    <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                      {t(
                        'Turn off to keep only semantic summaries and vectors after processing.',
                        '关闭后，处理完成只保留语义摘要和向量。'
                      )}
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
                    {t('Current backend port:', '当前后端端口：')} {currentBackendPort}.{' '}
                    {t('Port changes apply after app restart.', '端口更改会在应用重启后生效。')}
                  </div>
                )}
                {!runtimeSettings.retainScreenshotImages && (
                  <div className="mt-2 text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                    {t('Raw screenshot retention changes apply after app restart.', '原始截图保留设置会在应用重启后生效。')}
                  </div>
                )}
              </div>
            )}
            {!init && (
              <div className="mb-6 w-[574px] border-b border-[var(--mc-border)] pb-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[14px] leading-[20px] text-[var(--mc-text-primary)]">
                      {t('System prompts', '系统提示词')}
                    </div>
                    <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                      {t(
                        'Tune generated todos, reminders, reports, and activity summaries.',
                        '调整待办、提醒、报告和活动摘要的生成方式。'
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="small" icon={<IconRefresh />} loading={promptLoading} onClick={loadPrompts}>
                      {t('Reload', '重新加载')}
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      icon={<IconSave />}
                      loading={promptSaving}
                      onClick={handleSavePrompt}>
                      {t('Save', '保存')}
                    </Button>
                  </div>
                </div>
                <Spin loading={promptLoading} block>
                  <div className="mb-3 flex flex-col gap-2">
                    <Select
                      value={selectedPromptPath}
                      options={PROMPT_CATEGORY_OPTIONS.map((option) => ({
                        label: t(option.label, option.zhLabel),
                        value: option.value
                      }))}
                      onChange={(value) => setSelectedPromptPath(value as string)}
                      className="!w-full"
                    />
                    <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                      {t(selectedPromptCategory.description, selectedPromptCategory.zhDescription)}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[12px] leading-[18px] text-[var(--mc-text-secondary)]">
                        {t('Model', '模型')}
                      </div>
                      <Select
                        value={promptModelAssignments[selectedPromptPath] || ''}
                        options={modelProfileOptions}
                        onChange={(value) => updatePromptModelAssignment(selectedPromptPath, value as string)}
                        className="!w-[360px]"
                      />
                    </div>
                  </div>
                  <div className="mb-3">
                    <div className="mb-1 text-[13px] leading-[18px] text-[var(--mc-text-primary)]">
                      {t('System prompt', '系统提示词')}
                    </div>
                    <Input.TextArea
                      value={promptDraft.system}
                      autoSize={{ minRows: 5, maxRows: 12 }}
                      placeholder={t('System prompt', '系统提示词')}
                      onChange={(value) =>
                        setPromptDraft((draft) => ({
                          ...draft,
                          system: value
                        }))
                      }
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[13px] leading-[18px] text-[var(--mc-text-primary)]">
                      {t('User prompt', '用户提示词')}
                    </div>
                    <Input.TextArea
                      value={promptDraft.user}
                      autoSize={{ minRows: 4, maxRows: 10 }}
                      placeholder={t('User prompt', '用户提示词')}
                      onChange={(value) =>
                        setPromptDraft((draft) => ({
                          ...draft,
                          user: value
                        }))
                      }
                    />
                  </div>
                </Spin>
              </div>
            )}
            {!init && modelProfiles.length > 0 && (
              <div className="mb-6 w-[574px] border-b border-[var(--mc-border)] pb-4">
                <div className="mb-2 text-[14px] leading-[20px] text-[var(--mc-text-primary)]">
                  {t('Saved model profiles', '已保存的模型配置')}
                </div>
                <div className="flex gap-2">
                  <Select
                    placeholder={t('Switch to a previously saved model', '切换到已保存的模型')}
                    value={selectedProfileName}
                    options={modelProfiles.map((profile) => ({
                      value: profile.name,
                      label: profile.name
                    }))}
                    onChange={(value) => switchModelProfile(value as string)}
                    className="flex-1"
                  />
                  <Button disabled={!selectedProfileName} onClick={deleteSelectedProfile}>
                    {t('Delete', '删除')}
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
                [`${ModelTypeList.OpenAI}-modelId`]: 'gpt-5-nano',
                [`${ModelTypeList.Zhipu}-modelId`]: 'glm-4.1v-thinking-flash',
                [`${ModelTypeList.Zhipu}-baseUrl`]: BaseUrl.ZhipuUrl,
                [`${ModelTypeList.Zhipu}-embeddingModelPlatform`]: ModelTypeList.Custom
              }}>
              <FormItem label={t('Model platform', '模型平台')} field={'modelPlatform'} requiredSymbol={false}>
                <ModelRadio />
              </FormItem>
              <FormItem
                shouldUpdate={(prevValues, currentValues) => prevValues.modelPlatform !== currentValues.modelPlatform}
                noStyle>
                {(values) => {
                  const modelPlatform = values.modelPlatform
                  if (modelPlatform === ModelTypeList.Custom) {
                    return <CustomFormItems prefix={ModelTypeList.Custom} />
                  } else if (modelPlatform === ModelTypeList.Zhipu) {
                    return <CustomFormItems prefix={ModelTypeList.Zhipu} />
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
                {init ? t('Get started', '开始使用') : t('Save', '保存')}
              </Button>
            </Spin>
          </div>
        </div>
      </div>
    </Spin>
  )
}

export default Settings
