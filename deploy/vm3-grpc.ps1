# =============================================================================
# vm3-grpc.ps1 — Setup de VM3: Go gRPC Sync Server  (Windows)
# Ejecutar en VM3 como Administrador:
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\deploy\vm3-grpc.ps1
# =============================================================================
#Requires -RunAsAdministrator
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\config.ps1"

function Write-Step { param($msg) Write-Host "`n══ $msg ══" -ForegroundColor Yellow }
function Write-Ok   { param($msg) Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "⚠ $msg" -ForegroundColor Yellow }

# ── 1. NSSM ───────────────────────────────────────────────────────────────
Write-Step "Instalando NSSM"
New-Item -ItemType Directory -Force -Path $NSSM_DIR | Out-Null
if (-not (Test-Path "$NSSM_DIR\nssm.exe")) {
    $nssmZip = "$env:TEMP\nssm.zip"
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" `
        -OutFile $nssmZip -UseBasicParsing
    Expand-Archive -Path $nssmZip -DestinationPath "$env:TEMP\nssm-extract" -Force
    Copy-Item "$env:TEMP\nssm-extract\nssm-2.24\win64\nssm.exe" "$NSSM_DIR\nssm.exe"
    Remove-Item $nssmZip -Force
}
$nssm = "$NSSM_DIR\nssm.exe"
Write-Ok "NSSM listo"

# ── 2. Go ─────────────────────────────────────────────────────────────────
Write-Step "Instalando Go 1.22"
if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    winget install --id GoLang.Go --silent --accept-package-agreements --accept-source-agreements
    # Refrescar PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + `
                [System.Environment]::GetEnvironmentVariable("PATH","User")
    Write-Ok "Go instalado"
} else {
    Write-Warn "Go ya instalado: $(go version)"
}

# ── 3. Clonar repositorio ─────────────────────────────────────────────────
Write-Step "Clonando repositorio"
if (Test-Path "$REPO_DIR\.git") {
    Write-Warn "Repo ya existe — actualizando"
    git -C $REPO_DIR pull --quiet
} else {
    git clone $GIT_REPO $REPO_DIR
    Write-Ok "Repositorio clonado en $REPO_DIR"
}

# ── 4. .env del gRPC ──────────────────────────────────────────────────────
Write-Step "Generando .env del servidor gRPC"
@"
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${VM1_IP}:5432/${DB_NAME}
MINIO_ENDPOINT=${VM1_IP}:9000
MINIO_ACCESS_KEY=$MINIO_USER
MINIO_SECRET_KEY=$MINIO_PASSWORD
MINIO_BUCKET=$MINIO_BUCKET
JWT_SECRET=$JWT_SECRET
GRPC_PORT=$GRPC_PORT
"@ | Set-Content "$REPO_DIR\go-sync\.env" -Encoding UTF8
Write-Ok ".env generado"

# ── 5. Compilar sync-server ───────────────────────────────────────────────
Write-Step "Compilando sync-server.exe"
Push-Location "$REPO_DIR\go-sync"
# El código protoc ya está en gen/filesync/ — no se necesita protoc
go mod download
go build -o sync-server.exe .\server\...
go build -o sync-client.exe .\client\...
Pop-Location
Write-Ok "sync-server.exe y sync-client.exe compilados"

# ── 6. Registrar como servicio Windows ────────────────────────────────────
Write-Step "Registrando gRPC sync como servicio Windows"
$svcGrpc = "PhotoCloudGRPC"
if (Get-Service $svcGrpc -ErrorAction SilentlyContinue) {
    Stop-Service $svcGrpc -Force
    & $nssm remove $svcGrpc confirm
}
& $nssm install  $svcGrpc "$REPO_DIR\go-sync\sync-server.exe"
& $nssm set      $svcGrpc AppDirectory "$REPO_DIR\go-sync"
& $nssm set      $svcGrpc AppEnvironmentExtra `
    "DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${VM1_IP}:5432/${DB_NAME}" `
    "MINIO_ENDPOINT=${VM1_IP}:9000" `
    "MINIO_ACCESS_KEY=$MINIO_USER" `
    "MINIO_SECRET_KEY=$MINIO_PASSWORD" `
    "MINIO_BUCKET=$MINIO_BUCKET" `
    "JWT_SECRET=$JWT_SECRET" `
    "GRPC_PORT=$GRPC_PORT"
& $nssm set      $svcGrpc Start SERVICE_AUTO_START
New-Item -ItemType Directory -Force -Path "$REPO_DIR\logs" | Out-Null
& $nssm set      $svcGrpc AppStdout "$REPO_DIR\logs\grpc-stdout.log"
& $nssm set      $svcGrpc AppStderr "$REPO_DIR\logs\grpc-stderr.log"
Start-Service $svcGrpc
Write-Ok "Servicio PhotoCloudGRPC activo en :$GRPC_PORT"

# ── 7. Firewall ───────────────────────────────────────────────────────────
Write-Step "Configurando reglas de firewall"
if (-not (Get-NetFirewallRule -DisplayName "gRPC Sync" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "gRPC Sync" -Direction Inbound `
        -Protocol TCP -LocalPort $GRPC_PORT -Action Allow | Out-Null
}
Write-Ok "Puerto $GRPC_PORT abierto"

# ── Verificación ──────────────────────────────────────────────────────────
Write-Step "Verificando servicio"
Start-Sleep -Seconds 4
$s = Get-Service $svcGrpc -ErrorAction SilentlyContinue
if ($s -and $s.Status -eq "Running") {
    Write-Ok "$svcGrpc : Running"
} else {
    Write-Warn "$svcGrpc no está corriendo — revisa $REPO_DIR\logs\grpc-stderr.log"
}

# ── Resumen ───────────────────────────────────────────────────────────────
$myIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notmatch "Loopback"} | Select-Object -First 1).IPAddress
Write-Host "`n════════════════════════════════════════" -ForegroundColor Green
Write-Host "  VM3 lista ✓" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Green
Write-Host "  gRPC Sync   -> $myIP`:$GRPC_PORT"
Write-Host ""
Write-Host "  Logs: $REPO_DIR\logs\grpc-stderr.log" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Uso del cliente:"
Write-Host "  cd $REPO_DIR\go-sync"
Write-Host "  .\sync-client.exe ``"
Write-Host "    --server ${myIP}:$GRPC_PORT ``"
Write-Host "    --api    http://${VM2_IP}/api ``"
Write-Host "    --email  tu@email.com ``"
Write-Host "    --password tu_contrasena ``"
Write-Host "    --dir    C:\MisCarpeta"
Write-Host ""
