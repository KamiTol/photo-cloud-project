# =============================================
# setup-minio.ps1
# Descarga y configura MinIO en Windows
# Ejecutar en PowerShell como Administrador:
#   .\scripts\setup-minio.ps1
# =============================================
#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

# Cargar variables desde .env si existe
$envFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envFile) {
  Get-Content $envFile | Where-Object { $_ -match "^\s*[^#]" } | ForEach-Object {
    $parts = $_ -split "=", 2
    if ($parts.Count -eq 2) {
      [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
    }
  }
}

$MINIO_ACCESS_KEY   = if ($env:MINIO_ACCESS_KEY)  { $env:MINIO_ACCESS_KEY }  else { "admin_storage" }
$MINIO_SECRET_KEY   = if ($env:MINIO_SECRET_KEY)  { $env:MINIO_SECRET_KEY }  else { "cambia_esta_contrasena" }
$MINIO_BUCKET       = if ($env:MINIO_BUCKET)       { $env:MINIO_BUCKET }      else { "fotos-originales" }
$MINIO_PORT         = 9000
$MINIO_CONSOLE_PORT = 9001
$MINIO_DIR          = "C:\minio"
$MINIO_DATA_DIR     = "$MINIO_DIR\data"
$MINIO_BIN          = "$MINIO_DIR\minio.exe"
$MC_BIN             = "$MINIO_DIR\mc.exe"

Write-Host "============================================="
Write-Host "  Instalacion de MinIO en Windows"
Write-Host "============================================="

# 1. Crear directorio de instalacion
Write-Host "[1/4] Creando directorio $MINIO_DIR..."
New-Item -ItemType Directory -Force -Path $MINIO_DIR      | Out-Null
New-Item -ItemType Directory -Force -Path $MINIO_DATA_DIR | Out-Null

# 2. Descargar binarios si no existen
if (-not (Test-Path $MINIO_BIN)) {
  Write-Host "[2/4] Descargando minio.exe..."
  Invoke-WebRequest -Uri "https://dl.min.io/server/minio/release/windows-amd64/minio.exe" `
                    -OutFile $MINIO_BIN -UseBasicParsing
} else {
  Write-Host "[2/4] minio.exe ya existe, saltando descarga."
}

if (-not (Test-Path $MC_BIN)) {
  Write-Host "      Descargando mc.exe (cliente MinIO)..."
  Invoke-WebRequest -Uri "https://dl.min.io/client/mc/release/windows-amd64/mc.exe" `
                    -OutFile $MC_BIN -UseBasicParsing
}

# 3. Registrar MinIO como tarea programada de Windows (equivalente a systemd)
Write-Host "[3/4] Registrando MinIO como tarea programada de Windows..."

$startScript = @"
`$env:MINIO_ROOT_USER     = '$MINIO_ACCESS_KEY'
`$env:MINIO_ROOT_PASSWORD = '$MINIO_SECRET_KEY'
& '$MINIO_BIN' server '$MINIO_DATA_DIR' --address ':$MINIO_PORT' --console-address ':$MINIO_CONSOLE_PORT'
"@
$startScriptPath = "$MINIO_DIR\start-minio.ps1"
Set-Content -Path $startScriptPath -Value $startScript -Encoding UTF8

$action   = New-ScheduledTaskAction -Execute "powershell.exe" `
              -Argument "-NonInteractive -WindowStyle Hidden -File `"$startScriptPath`""
$trigger  = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName "MinIO-PhotoCloud" `
  -Action $action -Trigger $trigger -Settings $settings `
  -RunLevel Highest -Force | Out-Null

# Arrancar MinIO ahora mismo en background
Write-Host "      Iniciando MinIO..."
$env:MINIO_ROOT_USER     = $MINIO_ACCESS_KEY
$env:MINIO_ROOT_PASSWORD = $MINIO_SECRET_KEY
Start-Process -FilePath $MINIO_BIN `
  -ArgumentList "server `"$MINIO_DATA_DIR`" --address :$MINIO_PORT --console-address :$MINIO_CONSOLE_PORT" `
  -WindowStyle Minimized

Start-Sleep -Seconds 3

# 4. Crear el bucket inicial con mc.exe
Write-Host "[4/4] Creando bucket '$MINIO_BUCKET'..."
& $MC_BIN alias set local "http://localhost:$MINIO_PORT" $MINIO_ACCESS_KEY $MINIO_SECRET_KEY --quiet
& $MC_BIN mb --ignore-existing "local/$MINIO_BUCKET"

Write-Host ""
Write-Host "MinIO configurado correctamente."
Write-Host "  API:     http://localhost:$MINIO_PORT"
Write-Host "  Consola: http://localhost:$MINIO_CONSOLE_PORT"
Write-Host "  Bucket:  $MINIO_BUCKET"
Write-Host "  Usuario: $MINIO_ACCESS_KEY"
Write-Host ""
Write-Host "MinIO arranca automaticamente con Windows (Tarea: MinIO-PhotoCloud)"
