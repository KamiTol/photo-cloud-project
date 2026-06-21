# build.ps1 — Compila sync-server.exe y sync-client.exe
# Ejecutar despues de generate.ps1: .\scripts\build.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir   = Split-Path -Parent $ScriptDir
$GenDir    = "$RootDir\gen\filesync"

Write-Host "`n=== Build go-sync ===" -ForegroundColor Cyan

# ── Verificar que el codigo generado existe ───────────────────────────────────
if (-Not (Test-Path "$GenDir\filesync.pb.go")) {
    Write-Host "Codigo generado no encontrado. Ejecuta primero: .\scripts\generate.ps1" -ForegroundColor Red
    exit 1
}

# ── Buscar go.exe ─────────────────────────────────────────────────────────────
$GoExe = $null
$RutasCandidatas = @(
    "C:\Program Files\Go\bin\go.exe",
    "C:\Go\bin\go.exe",
    "$env:USERPROFILE\go\bin\go.exe",
    "$env:LOCALAPPDATA\Programs\Go\bin\go.exe"
)
foreach ($ruta in $RutasCandidatas) {
    if (Test-Path $ruta) { $GoExe = $ruta; break }
}
if (-Not $GoExe) {
    $GoExe = (Get-Command go -ErrorAction SilentlyContinue).Source
}
if (-Not $GoExe) {
    Write-Host "No se encontro go.exe. Agrega Go al PATH." -ForegroundColor Red
    exit 1
}
$GoDir = Split-Path -Parent $GoExe
$env:PATH = "$GoDir;$env:PATH"
Write-Host "    Go: $GoExe" -ForegroundColor Green

# ── Descargar dependencias ────────────────────────────────────────────────────
Write-Host "`n[1/3] Descargando dependencias..." -ForegroundColor Yellow
Push-Location $RootDir
& $GoExe mod tidy
Write-Host "    Dependencias OK" -ForegroundColor Green

# ── Compilar servidor ─────────────────────────────────────────────────────────
Write-Host "`n[2/3] Compilando sync-server..." -ForegroundColor Yellow
& $GoExe build -o "$RootDir\sync-server.exe" "./server/..."
Write-Host "    sync-server.exe generado" -ForegroundColor Green

# ── Compilar cliente ──────────────────────────────────────────────────────────
Write-Host "`n[3/3] Compilando sync-client..." -ForegroundColor Yellow
& $GoExe build -o "$RootDir\sync-client.exe" "./client/..."
Write-Host "    sync-client.exe generado" -ForegroundColor Green

Pop-Location

Write-Host "`n[OK] Build completado!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para iniciar el servidor gRPC:"
Write-Host "    cd go-sync"
Write-Host "    .\sync-server.exe"
Write-Host ""
Write-Host "Para sincronizar un directorio:"
Write-Host "    .\sync-client.exe --dir `"C:\MisCarpeta`" --token `"eyJ...`""
Write-Host ""
