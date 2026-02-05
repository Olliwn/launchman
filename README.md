# Launchman

A compact macOS-style launcher for local web apps. Register your dev servers, static sites, and containers in one place.

![Python](https://img.shields.io/badge/python-3.10+-blue)
![FastAPI](https://img.shields.io/badge/fastapi-0.109+-green)

## Features

- Compact dark UI designed for macOS dock apps
- Register apps with port, runtime type, and start command
- Auto-assigns ports when conflicts detected
- Tracks runtime info (Python venv, Node, static, Docker)
- Double-click to launch in browser

## Quick Start

```bash
# Clone
git clone https://github.com/Olliwn/launchman.git
cd launchman

# Install dependencies
pip install -r requirements.txt

# Create your apps registry
cp apps.json.example apps.json

# Run
python main.py
```

Open **http://localhost:8000**

## App Registry Format

Each app in `apps.json`:

```json
{
  "id": "my-app",
  "name": "My App",
  "port": 3000,
  "description": "Description here",
  "color": "#0a84ff",
  "path": "/path/to/project",
  "runtime": {
    "type": "python",
    "command": "python main.py",
    "venv": ".venv"
  }
}
```

**Runtime types:** `python`, `node`, `static`, `docker`

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard UI |
| `/api/apps` | GET | List all apps |
| `/api/apps` | POST | Add app |
| `/api/apps/{id}` | PUT | Update app |
| `/api/apps/{id}` | DELETE | Remove app |

## License

MIT
