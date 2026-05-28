// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import axiosInstance from '@renderer/services/axiosConfig'
import { get } from 'lodash'

// Model configuration interface
export interface ModelConfigProps {
  modelPlatform: string // Model platform, e.g., doubao, openai, custom
  modelId: string // VLM model ID
  baseUrl: string // API base URL
  embeddingModelId: string // Embedding model ID
  apiKey: string // API key
  embeddingBaseUrl?: string // Optional separate embedding base URL
  embeddingApiKey?: string // Optional separate embedding API key
  embeddingModelPlatform?: string // Optional separate embedding platform
}

// API response data structure
export interface ModelInfoResponseData {
  config: ModelConfigProps
}

export interface ModelProfileProps {
  name: string
  config: ModelConfigProps
  updated_at?: string
}

export interface FeatureModelAssignmentsProps {
  features: Record<string, string>
}

export interface PromptModelAssignmentsProps {
  prompts: Record<string, string>
}

export type PromptsConfigProps = Record<string, unknown>
export type PromptLanguage = 'en' | 'zh'
export type TodoApprovalMode = 'review' | 'auto_add'

export interface ContentGenerationIntervalConfigProps {
  enabled?: boolean
  interval?: number
  approval_mode?: TodoApprovalMode
}

export interface ContentGenerationReportConfigProps {
  enabled?: boolean
  time?: string
}

export interface ContentGenerationConfigProps {
  debug?: Record<string, unknown>
  activity?: ContentGenerationIntervalConfigProps
  tips?: ContentGenerationIntervalConfigProps
  todos?: ContentGenerationIntervalConfigProps
  report?: ContentGenerationReportConfigProps
  [key: string]: unknown
}

export interface GeneralSettingsProps {
  capture?: Record<string, unknown>
  processing?: Record<string, unknown>
  logging?: Record<string, unknown>
  content_generation?: ContentGenerationConfigProps
}

export interface UploadMediaContextParams {
  mediaType: 'audio' | 'video'
  file: File | Blob
  filename: string
  title?: string
  summary?: string
  transcript?: string
  startedAt?: string
  endedAt?: string
}

// Complete API response structure
export interface ApiResponse<T> {
  code: number
  status: number
  message: string
  data: T
}

// Get model settings information
export const getModelInfo = async (): Promise<ModelInfoResponseData | undefined> => {
  const res = await axiosInstance.get<ModelInfoResponseData>('/api/model_settings/get')
  return get(res, 'data.data')
}

export const getModelProfilesAPI = async (): Promise<ModelProfileProps[]> => {
  const res = await axiosInstance.get('/api/model_settings/profiles')
  return get(res, 'data.data.profiles') || []
}

export const deleteModelProfileAPI = async (name: string): Promise<void> => {
  await axiosInstance.post('/api/model_settings/profiles/delete', { name })
}

export const getFeatureModelAssignmentsAPI = async (): Promise<FeatureModelAssignmentsProps> => {
  const res = await axiosInstance.get('/api/model_settings/feature_assignments')
  return get(res, 'data.data.assignments') || { features: {} }
}

export const updateFeatureModelAssignmentsAPI = async (
  assignments: FeatureModelAssignmentsProps
): Promise<void> => {
  await axiosInstance.post('/api/model_settings/feature_assignments', { assignments })
}

export const getPromptModelAssignmentsAPI = async (): Promise<PromptModelAssignmentsProps> => {
  const res = await axiosInstance.get('/api/model_settings/prompt_assignments')
  return get(res, 'data.data.assignments') || { prompts: {} }
}

export const updatePromptModelAssignmentsAPI = async (
  assignments: PromptModelAssignmentsProps
): Promise<void> => {
  await axiosInstance.post('/api/model_settings/prompt_assignments', { assignments })
}

// Update model settings information
// Update model settings information response data structure
export interface UpdateModelSettingsResponseData {
  success: boolean
  message: string
}

export const updateModelSettingsAPI = async (
  params: ModelConfigProps
): Promise<UpdateModelSettingsResponseData | undefined> => {
  const res = await axiosInstance.post<UpdateModelSettingsResponseData>('/api/model_settings/update', {
    config: {
      ...params
    }
  })
  return get(res, 'data.data')
}

export const validateModelSettingsAPI = async (params: ModelConfigProps): Promise<string> => {
  const res = await axiosInstance.post('/api/model_settings/validate', {
    config: {
      ...params
    }
  })
  return get(res, 'data.message') || 'Model API connection is available'
}

export const getPromptsAPI = async (): Promise<PromptsConfigProps> => {
  const res = await axiosInstance.get<ApiResponse<{ prompts: PromptsConfigProps }>>('/api/settings/prompts')
  return get(res, 'data.data.prompts') || {}
}

export const getPromptLanguageAPI = async (): Promise<PromptLanguage> => {
  const res = await axiosInstance.get<ApiResponse<{ language: PromptLanguage }>>('/api/settings/prompts/language')
  const language = get(res, 'data.data.language')
  return language === 'zh' ? 'zh' : 'en'
}

export const updatePromptLanguageAPI = async (language: PromptLanguage): Promise<void> => {
  await axiosInstance.post('/api/settings/prompts/language', { language })
}

export const updatePromptsAPI = async (prompts: PromptsConfigProps): Promise<void> => {
  await axiosInstance.post('/api/settings/prompts', { prompts })
}

export const getGeneralSettingsAPI = async (): Promise<GeneralSettingsProps> => {
  const res = await axiosInstance.get<ApiResponse<GeneralSettingsProps>>('/api/settings/general')
  return get(res, 'data.data') || {}
}

export const updateGeneralSettingsAPI = async (settings: Partial<GeneralSettingsProps>): Promise<void> => {
  await axiosInstance.post('/api/settings/general', settings)
}

export const uploadMediaContextAPI = async (params: UploadMediaContextParams): Promise<string | undefined> => {
  const formData = new FormData()
  formData.append('media_type', params.mediaType)
  formData.append('file', params.file, params.filename)
  if (params.title) formData.append('title', params.title)
  if (params.summary) formData.append('summary', params.summary)
  if (params.transcript) formData.append('transcript', params.transcript)
  if (params.startedAt) formData.append('started_at', params.startedAt)
  if (params.endedAt) formData.append('ended_at', params.endedAt)

  const res = await axiosInstance.post('/api/media_context/upload', formData)
  return get(res, 'data.data.file_path')
}
