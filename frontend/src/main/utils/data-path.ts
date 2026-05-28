// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { is } from '@electron-toolkit/utils'
import { app } from 'electron'
import path from 'path'

export function resolveAppDataRoot(): string {
  if (app.isPackaged || !is.dev) {
    return path.resolve(app.getPath('userData'))
  }

  const cwd = process.cwd()
  const frontendRoot = path.basename(cwd) === 'frontend' ? cwd : path.join(cwd, 'frontend')
  return path.resolve(frontendRoot, 'backend')
}

export function resolveSqliteDbPath(dbName = 'app.db'): string {
  return path.join(resolveAppDataRoot(), 'persist', 'sqlite', dbName)
}
