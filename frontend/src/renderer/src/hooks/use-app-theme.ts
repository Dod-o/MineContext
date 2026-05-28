// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react'
import type { ThemeState } from '@shared/theme'

function getFallbackTheme(): ThemeState {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  const prefersDark = media?.matches
  return {
    mode: 'system',
    resolved: prefersDark ? 'dark' : 'light'
  }
}

export function applyAppTheme(theme: ThemeState) {
  const isDark = theme.resolved === 'dark'
  document.body.setAttribute('arco-theme', isDark ? 'dark' : 'light')
  document.documentElement.dataset.theme = theme.resolved
  document.documentElement.dataset.themeMode = theme.mode
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = theme.resolved
}

export function useAppTheme() {
  const [theme, setTheme] = useState<ThemeState>(() => getFallbackTheme())

  useEffect(() => {
    let disposed = false

    const applyTheme = (nextTheme: ThemeState) => {
      if (disposed) return
      applyAppTheme(nextTheme)
      setTheme(nextTheme)
    }

    window.api
      .getTheme()
      .then(applyTheme)
      .catch(() => applyTheme(getFallbackTheme()))

    const unsubscribe = window.api.onThemeUpdated(applyTheme)

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  return theme
}
