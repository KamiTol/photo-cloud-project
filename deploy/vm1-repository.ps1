# =============================================================================
# vm1-repository.ps1 — Setup de VM1: PostgreSQL + MinIO  (Windows)
# Ejecutar en VM1 como Administrador:
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\deploy\vm1-repository.ps1
# =============================================================================
#Requires -RunAsAdministrator
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Cargar configuración
. "$PSScriptRoot\config.ps1"

function Write-Step  { param($msg) Write-Host "`n══ $msg ══" -ForegroundColor Yellow }
function Write-Ok    { param($msg) Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "⚠ $msg" -ForegroundColor Yellow }

# ── 1. Clonar repositorio ─────────────────────────────────────────────────
Write-Step "Clonando repositorio"
if (Test-Path "$REPO_DIR\.git") {
    Write-Warn "Repo ya existe — actualizando"
    git -C $REPO_DIR pull --quiet
} else {
    git clone $GIT_REPO $REPO_DIR
    Write-Ok "Repositorio clonado en $REPO_DIR"
}

# ── 2. PostgreSQL ─────────────────────────────────────────────────────────
Write-Step "Instalando PostgreSQL"
$pgBin = "C:\Program Files\PostgreSQL\16\bin"
if (-not (Test-Path "$pgBin\psql.exe")) {
    winget install --id PostgreSQL.PostgreSQL.16 --silent --accept-package-agreements --accept-source-agreements
    Write-Ok "PostgreSQL instalado"
} else {
    Write-Warn "PostgreSQL ya instalado"
}

$env:PATH += ";$pgBin"
$env:PGPASSWORD = "postgres"   # contraseña del superusuario (la que pusiste al instalar)

Write-Step "Configurando base de datos"

# Crear usuario
$userCheck = & "$pgBin\psql.exe" -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>$null
if ($userCheck -ne "1") {
    & "$pgBin\psql.exe" -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
    Write-Ok "Usuario '$DB_USER' creado"
}

# Crear base de datos
$dbCheck = & "$pgBin\psql.exe" -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>$null
if ($dbCheck -ne "1") {
    & "$pgBin\psql.exe" -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    Write-Ok "Base de datos '$DB_NAME' creada"
}

& "$pgBin\psql.exe" -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# Aplicar migraciones
Write-Step "Aplicando migraciones SQL"
$env:PGPASSWORD = $DB_PASSWORD
foreach ($f in @("01-init-schema.sql","02-usuarios.sql","03-cuotas.sql","04-permisos.sql")) {
    $path = "$REPO_DIR\database\$f"
    if (Test-Path $path) {
        & "$pgBin\psql.exe" -h localhost -U $DB_USER -d $DB_NAME -f $path
        Write-Ok "$f aplicada"
    }
}

# Permisos en schema public
$env:PGPASSWORD = "postgres"
& "$pgBin\psql.exe" -U postgres -d $DB_NAME -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;" 2>$null
& "$pgBin\psql.exe" -U postgres -d $DB_NAME -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;" 2>$null

# Permitir conexiones remotas — editar pg_hba.conf
Write-Step "Configurando acceso remoto a PostgreSQL"
$pgData    = "C:\Program Files\PostgreSQL\16\data"
$pgHba     = "$pgData\pg_hba.conf"
$pgConf    = "$pgData\postgresql.conf"

# listen_addresses = '*'
(Get-Content $pgConf) -replace "#listen_addresses = 'localhost'", "listen_addresses = '*'" |
    Set-Content $pgConf
(Get-Content $pgConf) -replace "listen_addresses = 'localhost'", "listen_addresses = '*'" |
    Set-Content $pgConf

# Agregar regla de red interna si no existe
$hbaContent = Get-Content $pgHba
if (-not ($hbaContent -match "192\.168\.1\.0/24")) {
    Add-Content $pgHba "`nhost  all  all  192.168.1.0/24  md5"
    Write-Ok "Regla de red interna añadida a pg_hba.conf"
}

Restart-Service -Name "postgresql-x64-16"
Write-Ok "PostgreSQL reiniciado con acceso remoto"

# ── 3. MinIO ──────────────────────────────────────────────────────────────
Write-Step "Instalando MinIO"
New-Item -ItemType Directory -Force -Path $MINIO_DIR     | Out-Null
New-Item -ItemType Directory -Force -Path $MINIO_DATA_DIR | Out-Null

if (-not (Test-Path "$MINIO_DIR\minio.exe")) {
    Invoke-WebRequest -Uri "https://dl.min.io/server/minio/release/windows-amd64/minio.exe" `
        -OutFile "$MINIO_DIR\minio.exe" -UseBasicParsing
    Write-Ok "MinIO descargado"
}

# NSSM para registrar MinIO como servicio Windows
Write-Step "Instalando NSSM (gestor de servicios)"
New-Item -ItemType Directory -Force -Path $NSSM_DIR | Out-Null
if (-not (Test-Path "$NSSM_DIR\nssm.exe")) {
    $nssmZip = "$env:TEMP\nssm.zip"
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" `
        -OutFile $nssmZip -UseBasicParsing
    Expand-Archive -Path $nssmZip -DestinationPath "$env:TEMP\nssm-extract" -Force
    Copy-Item "$env:TEMP\nssm-extract\nssm-2.24\win64\nssm.exe" "$NSSM_DIR\nssm.exe"
    Remove-Item $nssmZip -Force
    Write-Ok "NSSM instalado en $NSSM_DIR"
}
$nssm = "$NSSM_DIR\nssm.exe"

# Registrar MinIO como servicio
Write-Step "Registrando MinIO como servicio Windows"
$svcName = "MinIO"
if (-not (Get-Service $svcName -ErrorAction SilentlyContinue)) {
    & $nssm install $svcName "$MINIO_DIR\minio.exe"
    & $nssm set $svcName AppParameters "server $MINIO_DATA_DIR --console-address :9001"
    & $nssm set $svcName AppEnvironmentExtra "MINIO_ROOT_USER=$MINIO_USER" "MINIO_ROOT_PASSWORD=$MINIO_PASSWORD"
    & $nssm set $svcName Start SERVICE_AUTO_START
    Write-Ok "Servicio MinIO registrado"
}
Start-Service $svcName
Write-Ok "MinIO iniciado"

# Crear bucket con mc.exe
Write-Step "Creando bucket '$MINIO_BUCKET'"
$mcExe = "$MINIO_DIR\mc.exe"
if (-not (Test-Path $mcExe)) {
    Invoke-WebRequest -Uri "https://dl.min.io/client/mc/release/windows-amd64/mc.exe" `
        -OutFile $mcExe -UseBasicParsing
}
Start-Sleep -Seconds 4
& $mcExe alias set local "http://localhost:9000" $MINIO_USER $MINIO_PASSWORD --quiet
& $mcExe mb "local/$MINIO_BUCKET" 2>$null
Write-Ok "Bucket '$MINIO_BUCKET' listo"

# ── 4. Firewall ───────────────────────────────────────────────────────────
Write-Step "Configurando reglas de firewall"
$rules = @(
    @{Name="PG-Remote";   Port=5432; Desc="PostgreSQL remoto"},
    @{Name="MinIO-API";   Port=9000; Desc="MinIO API"},
    @{Name="MinIO-UI";    Port=9001; Desc="MinIO Console"}
)
foreach ($r in $rules) {
    if (-not (Get-NetFirewallRule -DisplayName $r.Desc -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $r.Desc -Direction Inbound `
            -Protocol TCP -LocalPort $r.Port -Action Allow | Out-Null
    }
}
Write-Ok "Reglas de firewall aplicadas"

# ── Resumen ───────────────────────────────────────────────────────────────
$myIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notmatch "Loopback"} | Select-Object -First 1).IPAddress
Write-Host "`n════════════════════════════════════════" -ForegroundColor Green
Write-Host "  VM1 lista ✓" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Green
Write-Host "  PostgreSQL  → localhost:5432  (BD: $DB_NAME)"
Write-Host "  MinIO API   → http://${myIP}:9000"
Write-Host "  MinIO UI    → http://${myIP}:9001"
Write-Host ""
Write-Host "  Credenciales MinIO: $MINIO_USER / $MINIO_PASSWORD" -ForegroundColor Yellow
Write-Host ""
