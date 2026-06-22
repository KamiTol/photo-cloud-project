# =============================================================================
# vm2-appserver.ps1 — Setup de VM2: Node.js API + PHP SOAP + Nginx  (Windows)
# Ejecutar en VM2 como Administrador:
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\deploy\vm2-appserver.ps1
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

# ── 2. Clonar repositorio ─────────────────────────────────────────────────
Write-Step "Clonando repositorio"
if (Test-Path "$REPO_DIR\.git") {
    Write-Warn "Repo ya existe — actualizando"
    git -C $REPO_DIR pull --quiet
} else {
    git clone $GIT_REPO $REPO_DIR
    Write-Ok "Repositorio clonado en $REPO_DIR"
}

# ── 3. Node.js 18 ─────────────────────────────────────────────────────────
Write-Step "Instalando Node.js 18"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    # Refrescar PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + `
                [System.Environment]::GetEnvironmentVariable("PATH","User")
    Write-Ok "Node.js instalado"
} else {
    Write-Warn "Node.js ya instalado: $(node --version)"
}

# ── 4. .env del backend ───────────────────────────────────────────────────
Write-Step "Generando .env del backend"
@"
DB_HOST=$VM1_IP
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

MINIO_ENDPOINT=http://${VM1_IP}:9000
MINIO_ACCESS_KEY=$MINIO_USER
MINIO_SECRET_KEY=$MINIO_PASSWORD
MINIO_BUCKET=$MINIO_BUCKET

PORT=$API_PORT
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=$JWT_EXPIRES

SOAP_WSDL_URL=http://localhost:${SOAP_PORT}/usuarios.wsdl
"@ | Set-Content "$REPO_DIR\photo-cloud-server\.env" -Encoding UTF8
Write-Ok ".env del backend generado"

# ── 5. Instalar dependencias y compilar backend ───────────────────────────
Write-Step "Compilando backend Node.js"
Push-Location "$REPO_DIR\photo-cloud-server"
npm install --silent
npm run build
Pop-Location
Write-Ok "Backend compilado en dist\"

# ── 6. Registrar API como servicio Windows ────────────────────────────────
Write-Step "Registrando API como servicio Windows"
$svcApi = "PhotoCloudAPI"
if (Get-Service $svcApi -ErrorAction SilentlyContinue) {
    Stop-Service $svcApi -Force
    & $nssm remove $svcApi confirm
}
$nodeExe = (Get-Command node).Source
& $nssm install  $svcApi $nodeExe
& $nssm set      $svcApi AppParameters "dist\index.js"
& $nssm set      $svcApi AppDirectory  "$REPO_DIR\photo-cloud-server"
& $nssm set      $svcApi AppEnvironmentExtra `
    "DB_HOST=$VM1_IP" `
    "DB_PORT=5432" `
    "DB_NAME=$DB_NAME" `
    "DB_USER=$DB_USER" `
    "DB_PASSWORD=$DB_PASSWORD" `
    "MINIO_ENDPOINT=http://${VM1_IP}:9000" `
    "MINIO_ACCESS_KEY=$MINIO_USER" `
    "MINIO_SECRET_KEY=$MINIO_PASSWORD" `
    "MINIO_BUCKET=$MINIO_BUCKET" `
    "PORT=$API_PORT" `
    "JWT_SECRET=$JWT_SECRET" `
    "JWT_EXPIRES_IN=$JWT_EXPIRES" `
    "SOAP_WSDL_URL=http://localhost:${SOAP_PORT}/usuarios.wsdl"
& $nssm set      $svcApi Start SERVICE_AUTO_START
& $nssm set      $svcApi AppStdout "$REPO_DIR\logs\api-stdout.log"
& $nssm set      $svcApi AppStderr "$REPO_DIR\logs\api-stderr.log"
New-Item -ItemType Directory -Force -Path "$REPO_DIR\logs" | Out-Null
Start-Service $svcApi
Write-Ok "Servicio PhotoCloudAPI activo"

# ── 7. PHP 8.1 ───────────────────────────────────────────────────────────
Write-Step "Instalando PHP 8.1"
New-Item -ItemType Directory -Force -Path $PHP_DIR | Out-Null
if (-not (Test-Path "$PHP_DIR\php.exe")) {
    # PHP Thread Safe para Apache/IIS, NTS para CGI — usamos NTS para php -S
    $phpZip = "$env:TEMP\php.zip"
    Invoke-WebRequest -Uri "https://windows.php.net/downloads/releases/php-8.1.32-nts-Win32-vs16-x64.zip" `
        -OutFile $phpZip -UseBasicParsing
    Expand-Archive -Path $phpZip -DestinationPath $PHP_DIR -Force
    Remove-Item $phpZip -Force
    Write-Ok "PHP 8.1 descomprimido en $PHP_DIR"
}

# Configurar php.ini
$phpIni = "$PHP_DIR\php.ini"
if (-not (Test-Path $phpIni)) {
    Copy-Item "$PHP_DIR\php.ini-production" $phpIni
}
# Habilitar extensiones necesarias
foreach ($ext in @("extension=soap", "extension=pdo_pgsql", "extension=pdo", "extension=mbstring", "extension=openssl")) {
    $content = Get-Content $phpIni
    # Descomentarlo si está comentado, o añadirlo si no existe
    if ($content -match ";$ext") {
        (Get-Content $phpIni) -replace ";$ext", $ext | Set-Content $phpIni
    } elseif (-not ($content -match "^$ext")) {
        Add-Content $phpIni "`n$ext"
    }
}
# extension_dir correcto para Windows
(Get-Content $phpIni) -replace '; extension_dir = "ext"', 'extension_dir = "ext"' |
    Set-Content $phpIni
(Get-Content $phpIni) -replace 'extension_dir = "./"', 'extension_dir = "ext"' |
    Set-Content $phpIni

$env:PATH += ";$PHP_DIR"
Write-Ok "PHP configurado con extensiones soap y pdo_pgsql"

# .env de soap-server
@"
DB_HOST=$VM1_IP
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
"@ | Set-Content "$REPO_DIR\soap-server\.env" -Encoding UTF8

# Registrar PHP SOAP como servicio (php -S)
Write-Step "Registrando SOAP server como servicio Windows"
$svcSoap = "PhotoCloudSOAP"
if (Get-Service $svcSoap -ErrorAction SilentlyContinue) {
    Stop-Service $svcSoap -Force
    & $nssm remove $svcSoap confirm
}
& $nssm install  $svcSoap "$PHP_DIR\php.exe"
& $nssm set      $svcSoap AppParameters "-S localhost:$SOAP_PORT -t public"
& $nssm set      $svcSoap AppDirectory  "$REPO_DIR\soap-server"
& $nssm set      $svcSoap Start SERVICE_AUTO_START
& $nssm set      $svcSoap AppStdout "$REPO_DIR\logs\soap-stdout.log"
& $nssm set      $svcSoap AppStderr "$REPO_DIR\logs\soap-stderr.log"
Start-Service $svcSoap
Write-Ok "Servicio PhotoCloudSOAP activo en :$SOAP_PORT"

# ── 8. Build del frontend React ───────────────────────────────────────────
Write-Step "Compilando frontend React"
Push-Location "$REPO_DIR\photo-cloud-client"
npm install --silent
# Sin VITE_API_BASE_URL → usa '/api' → Nginx hace proxy
npm run build
Pop-Location
Write-Ok "Frontend compilado en dist\"

# ── 9. Nginx para Windows ─────────────────────────────────────────────────
Write-Step "Instalando Nginx"
New-Item -ItemType Directory -Force -Path $NGINX_DIR | Out-Null
if (-not (Test-Path "$NGINX_DIR\nginx.exe")) {
    $nginxZip = "$env:TEMP\nginx.zip"
    Invoke-WebRequest -Uri "https://nginx.org/download/nginx-1.26.2.zip" `
        -OutFile $nginxZip -UseBasicParsing
    Expand-Archive -Path $nginxZip -DestinationPath "$env:TEMP\nginx-extract" -Force
    $extracted = Get-ChildItem "$env:TEMP\nginx-extract" | Select-Object -First 1
    Copy-Item "$($extracted.FullName)\*" $NGINX_DIR -Recurse -Force
    Remove-Item $nginxZip, "$env:TEMP\nginx-extract" -Recurse -Force
    Write-Ok "Nginx descomprimido en $NGINX_DIR"
}

# Generar nginx.conf
$frontendDist = "$REPO_DIR\photo-cloud-client\dist"
# Nginx en Windows necesita paths con /
$nginxFrontend = $frontendDist -replace '\\', '/'
@"
worker_processes 1;

events { worker_connections 1024; }

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;

    server {
        listen 80;
        server_name _;

        # Frontend React (SPA)
        root $nginxFrontend;
        index index.html;

        location / {
            try_files `$uri `$uri/ /index.html;
        }

        # Proxy a la API Node.js
        location /api/ {
            proxy_pass         http://localhost:$API_PORT;
            proxy_http_version 1.1;
            proxy_set_header   Host `$host;
            proxy_set_header   X-Real-IP `$remote_addr;
            proxy_read_timeout 300s;
            proxy_send_timeout 300s;
        }

        client_max_body_size 2048m;
    }
}
"@ | Set-Content "$NGINX_DIR\conf\nginx.conf" -Encoding UTF8

# Registrar Nginx como servicio
$svcNginx = "PhotoCloudNginx"
if (Get-Service $svcNginx -ErrorAction SilentlyContinue) {
    Stop-Service $svcNginx -Force
    & $nssm remove $svcNginx confirm
}
& $nssm install $svcNginx "$NGINX_DIR\nginx.exe"
& $nssm set     $svcNginx AppDirectory $NGINX_DIR
& $nssm set     $svcNginx Start SERVICE_AUTO_START
Start-Service $svcNginx
Write-Ok "Nginx activo en :80"

# ── 10. Firewall ──────────────────────────────────────────────────────────
Write-Step "Configurando reglas de firewall"
@(
    @{Name="PhotoCloud-HTTP";  Port=80;        Desc="Frontend + API proxy"},
    @{Name="PhotoCloud-SOAP";  Port=$SOAP_PORT; Desc="PHP SOAP Server"},
    @{Name="PhotoCloud-API";   Port=$API_PORT;  Desc="Node.js API"}
) | ForEach-Object {
    if (-not (Get-NetFirewallRule -DisplayName $_.Desc -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $_.Desc -Direction Inbound `
            -Protocol TCP -LocalPort $_.Port -Action Allow | Out-Null
    }
}
Write-Ok "Reglas de firewall aplicadas"

# ── Verificación ──────────────────────────────────────────────────────────
Write-Step "Verificando servicios"
Start-Sleep -Seconds 5
foreach ($svc in @($svcApi, $svcSoap, $svcNginx)) {
    $s = Get-Service $svc -ErrorAction SilentlyContinue
    if ($s -and $s.Status -eq "Running") {
        Write-Ok "$svc : Running"
    } else {
        Write-Warn "$svc : no está corriendo — revisa $REPO_DIR\logs\"
    }
}

# ── Resumen ───────────────────────────────────────────────────────────────
$myIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notmatch "Loopback"} | Select-Object -First 1).IPAddress
Write-Host "`n════════════════════════════════════════" -ForegroundColor Green
Write-Host "  VM2 lista ✓" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Frontend    -> http://$myIP"
Write-Host "  API REST    -> http://$myIP/api  (via Nginx)"
Write-Host "  SOAP PHP    -> http://$myIP`:$SOAP_PORT/server.php"
Write-Host "  SOAP WSDL   -> http://$myIP`:$SOAP_PORT/usuarios.wsdl"
Write-Host ""
Write-Host "  Logs API:  $REPO_DIR\logs\api-stderr.log" -ForegroundColor Yellow
Write-Host "  Logs SOAP: $REPO_DIR\logs\soap-stderr.log" -ForegroundColor Yellow
Write-Host ""
