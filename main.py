#!/usr/bin/env python3
"""
Web App Launcher - Local Dashboard for self-hosted web apps.

Run with: python main.py
Access at: http://localhost:8000
"""

import json
import uuid
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel


app = FastAPI(title="Web App Launcher")

# Path to apps registry
APPS_FILE = Path(__file__).parent / "apps.json"
STATIC_DIR = Path(__file__).parent / "static"


class RuntimeInfo(BaseModel):
    type: str  # python, node, static, docker
    command: str
    venv: Optional[str] = None


class AppCreate(BaseModel):
    name: str
    port: int
    description: str
    color: str
    path: str
    runtime: RuntimeInfo


class AppUpdate(BaseModel):
    name: Optional[str] = None
    port: Optional[int] = None
    description: Optional[str] = None
    color: Optional[str] = None
    path: Optional[str] = None
    runtime: Optional[RuntimeInfo] = None


def load_apps() -> list[dict]:
    """Load apps from JSON file."""
    if not APPS_FILE.exists():
        return []
    try:
        return json.loads(APPS_FILE.read_text())
    except json.JSONDecodeError:
        return []


def save_apps(apps: list[dict]) -> None:
    """Save apps to JSON file."""
    APPS_FILE.write_text(json.dumps(apps, indent=2))


def get_used_ports(apps: list[dict], exclude_id: Optional[str] = None) -> set[int]:
    """Get set of ports currently in use."""
    return {a["port"] for a in apps if a["id"] != exclude_id}


def find_available_port(apps: list[dict], preferred: int, exclude_id: Optional[str] = None) -> int:
    """Find an available port, starting from preferred."""
    used = get_used_ports(apps, exclude_id)
    # Reserve port 8000 for the launcher itself
    used.add(8000)
    
    if preferred not in used:
        return preferred
    
    # Find next available port
    port = max(used) + 1
    return port


# API Routes

@app.get("/")
async def dashboard():
    """Serve the dashboard HTML."""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/apps")
async def list_apps():
    """List all registered apps."""
    return load_apps()


@app.get("/api/apps/{app_id}")
async def get_app(app_id: str):
    """Get a specific app by ID."""
    apps = load_apps()
    for app in apps:
        if app["id"] == app_id:
            return app
    raise HTTPException(status_code=404, detail="App not found")


@app.post("/api/apps")
async def add_app(app_data: AppCreate):
    """Add a new app. Auto-assigns port if there's a conflict."""
    apps = load_apps()
    
    # Generate unique ID
    app_id = str(uuid.uuid4())[:8]
    
    # Auto-assign port if conflict
    port = find_available_port(apps, app_data.port)
    
    new_app = {
        "id": app_id,
        "name": app_data.name,
        "port": port,
        "description": app_data.description,
        "color": app_data.color,
        "path": app_data.path,
        "runtime": app_data.runtime.model_dump()
    }
    
    apps.append(new_app)
    save_apps(apps)
    
    return new_app


@app.put("/api/apps/{app_id}")
async def update_app(app_id: str, app_data: AppUpdate):
    """Update an existing app."""
    apps = load_apps()
    
    for i, app in enumerate(apps):
        if app["id"] == app_id:
            # Update fields if provided
            if app_data.name is not None:
                app["name"] = app_data.name
            if app_data.port is not None:
                # Check for port conflict
                app["port"] = find_available_port(apps, app_data.port, exclude_id=app_id)
            if app_data.description is not None:
                app["description"] = app_data.description
            if app_data.color is not None:
                app["color"] = app_data.color
            if app_data.path is not None:
                app["path"] = app_data.path
            if app_data.runtime is not None:
                app["runtime"] = app_data.runtime.model_dump()
            
            apps[i] = app
            save_apps(apps)
            return app
    
    raise HTTPException(status_code=404, detail="App not found")


@app.delete("/api/apps/{app_id}")
async def delete_app(app_id: str):
    """Delete an app."""
    apps = load_apps()
    original_count = len(apps)
    apps = [a for a in apps if a["id"] != app_id]
    
    if len(apps) == original_count:
        raise HTTPException(status_code=404, detail="App not found")
    
    save_apps(apps)
    return {"success": True, "message": f"App {app_id} deleted"}


# Mount static files (after API routes to avoid conflicts)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


if __name__ == "__main__":
    print("=" * 50)
    print("  Web App Launcher")
    print("=" * 50)
    print(f"  Dashboard: http://localhost:8000")
    print(f"  Apps file: {APPS_FILE}")
    print("=" * 50)
    print()
    uvicorn.run(app, host="127.0.0.1", port=8000)
