# =============================================
# setup-all.ps1
# Script maestro: instala toda la infraestructura en Windows
# Ejecutar en PowerShell como Administrador:
#   .\scripts\setup-all.ps1
# =============================================
#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

$projectRoot = Join-Path $PSScriptRoot ".."
$envFile     = Join-Path $projectRoot ".env"
$envExample  = Join-Path $projectRoot ".env.example"

Write-Host "============================================="
Write-Host "  UPB-CIENTIFICA - Setup de infraestructura"
Write-Host "============================================="
Write-Host ""

# Verificar que existe el archivo .env
if (-not (Test-Path $envFile)) {
  Write-Host "No se encontro .env - copiando desde .env.example..."
  Copy-Item $envExample $envFile
  Write-Host ""
  Write-Host "  IMPORTANTE: Edita el archivo .env y cambia las contrasenas."
  Write-Host "  Ruta: $envFile"
  Write-Host ""
  Read-Host "Presiona ENTER para continuar con los valores por defecto, o Ctrl+C para cancelar"
}

Write-Host "--- Paso 1: PostgreSQL ---"
& "$PSScriptRoot\setup-postgres.ps1"
Write-Host ""

Write-Host "--- Paso 2: MinIO ---"
& "$PSScriptRoot\setup-minio.ps1"
Write-Host ""

Write-Host "============================================="
Write-Host "Infraestructura lista."
Write-Host ""
Write-Host "Proximos pasos:"
Write-Host "  1. cd photo-cloud-server"
Write-Host "  2. npm install"
Write-Host "  3. npm run dev"
Write-Host "============================================="
