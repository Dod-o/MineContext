// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { TODOActivity } from '@interface/db/todo'
import { TaskUrgency } from '@renderer/constant/feed'
import { useMount, useRequest } from 'ahooks'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { resolveAppLanguage } from '@shared/app-runtime-settings'

type SupportedLanguage = 'en' | 'zh'

const INITIAL_TODO_TEXT: Record<number, Record<SupportedLanguage, string>> = {
  [-3]: {
    en: 'Click 【Start with Tutorial】 in the 【Creation】 to jump into the tutorial and master the features and usage of MineContext.',
    zh: '点击【创作】中的【从教程开始】，进入教程并掌握 MineContext 的功能和使用方法。'
  },
  [-2]: {
    en: 'Enter the 【Settings】 in 【Screen Monitor】 to set your screen sharing area, and click 【Start Recording】 to begin.',
    zh: '进入【屏幕记录】中的【设置】，选择要共享的屏幕区域，然后点击【开始记录】。'
  },
  [-4]: {
    en: 'Click 【Chat with AI】 in the upper right corner of the screen to experience the AI partner Q&A.',
    zh: '点击屏幕右上角的【与 AI 聊天】，体验 AI 伙伴问答。'
  }
}

async function getRuntimeLanguage(): Promise<SupportedLanguage> {
  try {
    const settings = await window.api.getRuntimeSettings()
    return resolveAppLanguage(settings.language, navigator.language)
  } catch {
    return resolveAppLanguage('system', navigator.language)
  }
}

function buildInitialTodoList(language: SupportedLanguage): TODOActivity[] {
  const now = dayjs()
  const createdAt = now.format('YYYY-MM-DD HH:mm:ss')
  const endTime = now.format('YYYY-MM-DD 23:59:59')

  return [
    {
      id: -3,
      content: INITIAL_TODO_TEXT[-3][language],
      created_at: createdAt,
      urgency: TaskUrgency.High,
      start_time: createdAt,
      end_time: endTime,
      assignee: 'system',
      status: 0
    },
    {
      id: -2,
      content: INITIAL_TODO_TEXT[-2][language],
      created_at: createdAt,
      urgency: TaskUrgency.High,
      start_time: createdAt,
      end_time: endTime,
      assignee: 'system',
      status: 0
    },
    {
      id: -4,
      content: INITIAL_TODO_TEXT[-4][language],
      created_at: createdAt,
      urgency: TaskUrgency.High,
      start_time: createdAt,
      end_time: endTime,
      assignee: 'system',
      status: 0
    }
  ]
}

function localizeInitialTodoList(todoList: TODOActivity[], language: SupportedLanguage): TODOActivity[] {
  return todoList.map((item) => {
    const text = INITIAL_TODO_TEXT[item.id]
    if (!text || item.assignee !== 'system') {
      return item
    }
    if (item.content !== text.en && item.content !== text.zh) {
      return item
    }
    return {
      ...item,
      content: text[language]
    }
  })
}

const useInitPrepareData = () => {
  const [todoList, setTodoList] = useState<TODOActivity[]>([])
  const { run, loading, data } = useRequest<TODOActivity[], any>(
    async () => {
      // await window.screenMonitorAPI.clearSettings('todoList-finished')

      const isFinished = await window.screenMonitorAPI.getSettings<boolean>('todoList-finished')
      if (isFinished) {
        return []
      }
      // await window.screenMonitorAPI.clearSettings('todoList')

      const res = await window.screenMonitorAPI.getSettings<TODOActivity[]>('todoList')
      const language = await getRuntimeLanguage()
      if (!res || !Array.isArray(res)) {
        const initialTodoList = buildInitialTodoList(language)
        await window.screenMonitorAPI.setSettings('todoList', initialTodoList)
        return initialTodoList
      }
      const localizedTodoList = localizeInitialTodoList(res, language)
      if (JSON.stringify(localizedTodoList) !== JSON.stringify(res)) {
        await window.screenMonitorAPI.setSettings('todoList', localizedTodoList)
      }
      return localizedTodoList
    },
    { manual: true }
  )
  const { runAsync: deleteTodoList, data: resetData } = useRequest(
    async (idOrIds: number | number[]) => {
      const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds]
      const idSet = new Set(ids)
      const res = await window.screenMonitorAPI.getSettings<TODOActivity[]>('todoList')
      if (res && Array.isArray(res)) {
        const filteredList = res.filter((item) => !idSet.has(item.id))
        await window.screenMonitorAPI.setSettings('todoList', filteredList)
        if (filteredList.length <= 0) {
          await window.screenMonitorAPI.setSettings('todoList-finished', true)
        }
        return filteredList
      }
      return []
    },
    { manual: true }
  )
  const { run: editTodoList } = useRequest(
    async (activity: TODOActivity) => {
      const res = await window.screenMonitorAPI.getSettings<TODOActivity[]>('todoList')
      if (res && Array.isArray(res)) {
        const updatedList = res.map((item) => (item.id === activity.id ? activity : item))
        await window.screenMonitorAPI.setSettings('todoList', updatedList)
        return updatedList
      }
      return []
    },
    { manual: true }
  )
  useMount(() => {
    run()
  })

  useEffect(() => {
    if (data) {
      setTodoList(data)
    }
  }, [data])
  useEffect(() => {
    if (resetData) {
      setTodoList(resetData)
    }
  }, [resetData])

  return { loading, data: todoList, deleteTodoList, editTodoList }
}
export { useInitPrepareData }
