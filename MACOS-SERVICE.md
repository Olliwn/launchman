# Launchman - macOS Service Setup

Run Launchman as a persistent macOS service that auto-starts on login and survives sleep/wake cycles.

## Overview

- **Location**: `/Users/ollinarhi/launcher/`
- **URL**: http://localhost:8000
- **Service ID**: `com.launchman.server`

## Installation

### 1. Stop any running instance

```bash
pkill -f "launcher/main.py"
```

### 2. Copy the Launch Agent

```bash
cp /Users/ollinarhi/launcher/com.launchman.plist ~/Library/LaunchAgents/
```

### 3. Load the Service

```bash
launchctl load ~/Library/LaunchAgents/com.launchman.plist
```

The service starts immediately at http://localhost:8000

## Service Management

### Start/Load
```bash
launchctl load ~/Library/LaunchAgents/com.launchman.plist
```

### Stop/Unload
```bash
launchctl unload ~/Library/LaunchAgents/com.launchman.plist
```

### Restart
```bash
launchctl unload ~/Library/LaunchAgents/com.launchman.plist
launchctl load ~/Library/LaunchAgents/com.launchman.plist
```

### Check Status
```bash
launchctl list | grep launchman
```

Output: `PID  Status  Label`
- PID = number → running
- PID = `-` → not running

## Logs

```bash
# Server output
tail -f /Users/ollinarhi/launcher/logs/server.log

# Errors
tail -f /Users/ollinarhi/launcher/logs/server.error.log
```

## Uninstallation

```bash
launchctl unload ~/Library/LaunchAgents/com.launchman.plist
rm ~/Library/LaunchAgents/com.launchman.plist
```

## Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Label | com.launchman.server | Service identifier |
| RunAtLoad | true | Start on login |
| KeepAlive | true | Restart if crashed |
| Port | 8000 | Dashboard URL |

## Troubleshooting

### Port 8000 in use
```bash
lsof -ti :8000 | xargs kill -9
```

### Check error log
```bash
cat /Users/ollinarhi/launcher/logs/server.error.log
```

### Verify Python has dependencies
```bash
/opt/anaconda3/bin/python3 -c "import fastapi, uvicorn; print('OK')"
```
