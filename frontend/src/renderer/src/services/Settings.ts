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

export type PromptsConfigProps = Record<string, unknown>

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

export const updatePromptsAPI = async (prompts: PromptsConfigProps): Promise<void> => {
  await axiosInstance.post('/api/settings/prompts', { prompts })
}
