# MineContext

## Project Setup

### Build Backend

#### for macos

```bash
uv sync
source .venv/bin/activate
./build.sh
```

#### for linux

```bash
uv sync
source .venv/bin/activate
./build.sh
```

#### for windows

not support yet

### Install

```bash
cd frontend
pnpm install
```

### Development

```bash
pnpm dev
```

### Build APP

```bash
# For macOS
pnpm build:mac

# For Linux (AppImage, snap, deb)
pnpm build:linux

# Data Path
# ～/Library/Application\ Support/MineContext
```

Run `pnpm build:linux` instead of invoking `electron-builder --linux` directly. The package script copies the pre-built backend into `frontend/backend` before packaging; without that step, the Linux app can launch the UI but stay on the loading screen because the backend executable is missing.

### Data Path

～/Library/Application\ Support/MineContext
