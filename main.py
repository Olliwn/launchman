#!/usr/bin/env python3
"""
Launchman - Local web app launcher with process management.

Run with: python main.py
Access at: http://localhost:8000
"""

import json
import uuid
import subprocess
import signal
import os
import socket
from pathlib import Path
from typing import Optional
from contextlib import closing

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel


app = FastAPI(title="Launchman")

# Paths
APPS_FILE = Path(__file__).parent / "apps.json"
STATIC_DIR = Path(__file__).parent / "static"

# Track running processes: {app_id: subprocess.Popen}
running_processes: dict[str, subprocess.Popen] = {}


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
    used.add(8000)  # Reserve for launcher
    
    if preferred not in used:
        return preferred
    
    port = max(used) + 1
    return port


def is_port_in_use(port: int) -> bool:
    """Check if a port is currently in use."""
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        return sock.connect_ex(('127.0.0.1', port)) == 0


def kill_by_port(port: int) -> bool:
    """Kill process listening on a port. Returns True if killed, False otherwise."""
    if port <= 0:
        return False  # Skip CLI-only apps with port=0
    
    try:
        import subprocess as sp
        # Use lsof to find process on port
        result = sp.run(
            f"lsof -ti :{port}",
            shell=True,
            capture_output=True,
            text=True,
            timeout=2
        )
        
        pids = result.stdout.strip().split('\n')
        if not pids or not pids[0]:
            return False
        
        # Kill each PID
        for pid_str in pids:
            if pid_str:
                pid = int(pid_str)
                try:
                    # Try SIGTERM first
                    os.kill(pid, signal.SIGTERM)
                except:
                    pass
        
        return True
    except Exception:
        return False


def is_app_running(app_id: str, port: int) -> bool:
    """Check if an app is running (process alive or port in use)."""
    # Check if we have a tracked process
    if app_id in running_processes:
        proc = running_processes[app_id]
        if proc.poll() is None:  # Process still running
            return True
        else:
            # Process ended, clean up
            del running_processes[app_id]
    
    # Also check if port is in use (app might be running externally)
    return is_port_in_use(port)


def start_app_process(app: dict) -> bool:
    """Start an app's process."""
    app_id = app["id"]
    port = app["port"]
    path = app["path"]
    runtime = app.get("runtime", {})
    command = runtime.get("command", "")
    runtime_type = runtime.get("type", "static")
    venv = runtime.get("venv")
    
    if not command or not path:
        return False
    
    # Check if already running
    if is_app_running(app_id, port):
        return True
    
    # Build the command
    if runtime_type == "python" and venv:
        # Activate venv
        venv_path = Path(venv) if Path(venv).is_absolute() else Path(path) / venv
        python_bin = venv_path / "bin" / "python"
        if python_bin.exists():
            # Replace 'python' with venv python
            command = command.replace("python ", f"{python_bin} ", 1)
    
    # For static sites, inject the port and set working directory
    if runtime_type == "static" and "http.server" in command:
        # Command already has port, just run it
        pass
    
    try:
        # Start process in background
        proc = subprocess.Popen(
            command,
            shell=True,
            cwd=path,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setsid  # Create new process group
        )
        running_processes[app_id] = proc
        return True
    except Exception as e:
        print(f"Failed to start {app['name']}: {e}")
        return False


def stop_app_process(app_id: str, port: int = 0) -> bool:
    """Stop an app's process. Try tracked PID first, then by port."""
    # Try tracked process first
    if app_id in running_processes:
        proc = running_processes[app_id]
        try:
            # Kill process group
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            proc.wait(timeout=5)
        except Exception:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except Exception:
                pass
        
        if app_id in running_processes:
            del running_processes[app_id]
        
        return True
    
    # Fallback: try killing by port (for apps started externally or before launcher restart)
    if port > 0 and kill_by_port(port):
        return True
    
    return False


# API Routes

@app.get("/")
async def dashboard():
    """Serve the dashboard HTML."""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/apps")
async def list_apps():
    """List all registered apps with running status."""
    apps = load_apps()
    # Add running status to each app
    for app in apps:
        app["running"] = is_app_running(app["id"], app["port"])
    return apps


@app.get("/api/apps/{app_id}")
async def get_app(app_id: str):
    """Get a specific app by ID."""
    apps = load_apps()
    for app in apps:
        if app["id"] == app_id:
            app["running"] = is_app_running(app["id"], app["port"])
            return app
    raise HTTPException(status_code=404, detail="App not found")


@app.post("/api/apps")
async def add_app(app_data: AppCreate):
    """Add a new app. Auto-assigns port if there's a conflict."""
    apps = load_apps()
    
    app_id = str(uuid.uuid4())[:8]
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
    
    new_app["running"] = False
    return new_app


@app.put("/api/apps/{app_id}")
async def update_app(app_id: str, app_data: AppUpdate):
    """Update an existing app."""
    apps = load_apps()
    
    for i, app in enumerate(apps):
        if app["id"] == app_id:
            if app_data.name is not None:
                app["name"] = app_data.name
            if app_data.port is not None:
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
            app["running"] = is_app_running(app_id, app["port"])
            return app
    
    raise HTTPException(status_code=404, detail="App not found")


@app.delete("/api/apps/{app_id}")
async def delete_app(app_id: str):
    """Delete an app (stops it first if running)."""
    apps = load_apps()
    app = next((a for a in apps if a["id"] == app_id), None)
    
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    # Stop if running
    stop_app_process(app_id, app["port"])
    
    # Remove from config
    apps = [a for a in apps if a["id"] != app_id]
    save_apps(apps)
    
    return {"success": True, "message": f"App {app_id} deleted"}


@app.post("/api/apps/{app_id}/start")
async def start_app(app_id: str):
    """Start an app."""
    apps = load_apps()
    app = next((a for a in apps if a["id"] == app_id), None)
    
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    if is_app_running(app_id, app["port"]):
        return {"success": True, "message": "Already running", "running": True}
    
    success = start_app_process(app)
    
    if success:
        # Give it a moment to start
        import time
        time.sleep(0.5)
        running = is_app_running(app_id, app["port"])
        return {"success": True, "message": "Started", "running": running}
    else:
        raise HTTPException(status_code=500, detail="Failed to start app")


@app.post("/api/apps/{app_id}/stop")
async def stop_app(app_id: str):
    """Stop an app."""
    apps = load_apps()
    app = next((a for a in apps if a["id"] == app_id), None)
    
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    stop_app_process(app_id, app["port"])
    
    return {"success": True, "message": "Stopped", "running": False}


@app.get("/api/apps/{app_id}/status")
async def app_status(app_id: str):
    """Check if an app is running."""
    apps = load_apps()
    app = next((a for a in apps if a["id"] == app_id), None)
    
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    running = is_app_running(app_id, app["port"])
    return {"running": running}


# Cleanup on shutdown
@app.on_event("shutdown")
def shutdown_event():
    """Stop all running processes on shutdown."""
    for app_id in list(running_processes.keys()):
        stop_app_process(app_id)


# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


if __name__ == "__main__":
    print("=" * 50)
    print("  Launchman")
    print("=" * 50)
    print(f"  Dashboard: http://localhost:8000")
    print(f"  Apps file: {APPS_FILE}")
    print("=" * 50)
    print()
    uvicorn.run(app, host="127.0.0.1", port=8000)
