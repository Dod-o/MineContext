// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from 'react'
import { resolveAppLanguage, type AppLanguage } from '@shared/app-runtime-settings'

export type ResolvedAppLanguage = 'en' | 'zh'

function resolveRendererLanguage(language: AppLanguage): ResolvedAppLanguage {
  return resolveAppLanguage(language, navigator.language)
}

export function useAppLanguage(): ResolvedAppLanguage {
  const [language, setLanguage] = useState<ResolvedAppLanguage>(() => resolveRendererLanguage('system'))

  useEffect(() => {
    let cancelled = false

    const loadLanguage = async () => {
      try {
        const settings = await window.api.getRuntimeSettings()
        if (!cancelled) {
          setLanguage(resolveRendererLanguage(settings.language))
        }
      } catch {
        if (!cancelled) {
          setLanguage(resolveRendererLanguage('system'))
        }
      }
    }

    loadLanguage()

    const handleLanguageUpdate = (event: Event) => {
      const nextLanguage = (event as CustomEvent<AppLanguage>).detail
      setLanguage(resolveRendererLanguage(nextLanguage))
    }
    window.addEventListener('app-language-updated', handleLanguageUpdate)

    return () => {
      cancelled = true
      window.removeEventListener('app-language-updated', handleLanguageUpdate)
    }
  }, [])

  return language
}

export function useLocalizedText() {
  const language = useAppLanguage()
  return useCallback((english: string, chinese: string) => (language === 'zh' ? chinese : english), [language])
}
