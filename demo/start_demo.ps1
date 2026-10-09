# Starts the DEMO backend (port 8010, demo/data/sql_app.db) and a second frontend (port 3010)
# that talks to it. The normal dev servers (8000 / 3000) and the real database are untouched.
#
#   powershell -ExecutionPolicy Bypass -File demo\start_demo.ps1
#
# Open http://localhost:3010 and sign in with the demo admin (see demo\README.md).

$demo = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $demo
$data = Join-Path $demo "data"

if (-not (Test-Path (Join-Path $data "sql_app.db"))) {
    Write-Host "No demo database yet - building it first..."
    Push-Location $demo
    python seed_demo.py
    Pop-Location
}

# Backend: the working directory decides which sql_app.db the app opens.
$env:PYTHONPATH = $root
Start-Process -FilePath python -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8010" -WorkingDirectory $data -WindowStyle Minimized

# Frontend: BACKEND_URL is read per request by the /api proxy route.
$env:BACKEND_URL = "http://127.0.0.1:8010"
Start-Process -FilePath npx.cmd -ArgumentList "next", "dev", "-p", "3010" -WorkingDirectory (Join-Path $root "frontend") -WindowStyle Minimized

Write-Host "Demo backend  : http://127.0.0.1:8010"
Write-Host "Demo frontend : http://localhost:3010"
