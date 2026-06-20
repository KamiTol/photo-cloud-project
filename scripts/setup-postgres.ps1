# =============================================
# setup-postgres.ps1
# Instala y configura PostgreSQL en Windows
# Ejecutar en PowerShell como Administrador:
#   .\scripts\setup-postgres.ps1
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

$DB_NAME     = if ($env:DB_NAME)     { $env:DB_NAME }     else { "photo_cloud_db" }
$DB_USER     = if ($env:DB_USER)     { $env:DB_USER }     else { "admin_fotos" }
$DB_PASSWORD = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { "cambia_esta_contrasena" }

Write-Host "============================================="
Write-Host "  Instalacion de PostgreSQL en Windows"
Write-Host "============================================="

# 1. Verificar si PostgreSQL ya esta instalado
$pgExists = Get-Command psql -ErrorAction SilentlyContinue
if (-not $pgExists) {
  Write-Host "[1/4] Instalando PostgreSQL con winget..."

  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id PostgreSQL.PostgreSQL --accept-source-agreements --accept-package-agreements
  } else {
    Write-Host "      winget no disponible."
    Write-Host "      Descarga e instala PostgreSQL manualmente desde:"
    Write-Host "      https://www.postgresql.org/download/windows/"
    Write-Host "      Luego vuelve a ejecutar este script."
    exit 1
  }

  # Agregar psql al PATH de la sesion actual
  $pgBin = "C:\Program Files\PostgreSQL\17\bin"
  if (-not (Test-Path $pgBin)) {
    $pgBin = (Get-ChildItem "C:\Program Files\PostgreSQL" | Sort-Object Name -Descending | Select-Object -First 1).FullName + "\bin"
  }
  $env:PATH += ";$pgBin"
} else {
  Write-Host "[1/4] PostgreSQL ya instalado: $(psql --version)"
}

# 2. Iniciar el servicio de Windows
Write-Host "[2/4] Iniciando servicio postgresql..."
$svc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($svc) {
  Start-Service $svc.Name
  Set-Service $svc.Name -StartupType Automatic
  Write-Host "      Servicio '$($svc.Name)' iniciado."
} else {
  Write-Host "      No se encontro el servicio de PostgreSQL. Verifica la instalacion."
  exit 1
}

# 3. Crear usuario y base de datos
Write-Host "[3/4] Creando usuario '$DB_USER' y base de datos '$DB_NAME'..."

$sqlSetup = @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE USER "$DB_USER" WITH PASSWORD '$DB_PASSWORD';
    RAISE NOTICE 'Usuario $DB_USER creado.';
  END IF;
END
`$`$;
SELECT 'CREATE DATABASE "$DB_NAME" OWNER "$DB_USER"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')
\gexec
GRANT ALL PRIVILEGES ON DATABASE "$DB_NAME" TO "$DB_USER";
"@

$sqlSetup | & psql -U postgres

# 4. Aplicar esquema SQL inicial
Write-Host "[4/4] Aplicando esquema inicial..."
$sqlFile = Join-Path $PSScriptRoot "..\database\01-init-schema.sql"
& psql -U postgres -d $DB_NAME -f $sqlFile

Write-Host ""
Write-Host "PostgreSQL configurado correctamente."
Write-Host "  Host:          localhost:5432"
Write-Host "  Base de datos: $DB_NAME"
Write-Host "  Usuario:       $DB_USER"
