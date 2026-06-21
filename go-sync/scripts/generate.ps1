# generate.ps1 — Descarga protoc y genera el código Go desde filesync.proto
# Ejecutar UNA VEZ antes de compilar: .\scripts\generate.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir   = Split-Path -Parent $ScriptDir
$ProtoFile = "$RootDir\proto\filesync.proto"
$OutDir    = "$RootDir\gen\filesync"
$BinDir    = "$RootDir\scripts\bin"

# ── Versiones ─────────────────────────────────────────────────────────────────
$ProtocVersion = "27.1"
$ProtocZip     = "$BinDir\protoc.zip"
$ProtocDir     = "$BinDir\protoc"
$ProtocExe     = "$ProtocDir\bin\protoc.exe"

Write-Host "`n=== Generador de código gRPC para photo-cloud ===" -ForegroundColor Cyan

# ── 1. Crear directorios ──────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $BinDir  | Out-Null
New-Item -ItemType Directory -Force -Path $OutDir  | Out-Null

# ── 2. Descargar protoc si no existe ─────────────────────────────────────────
if (-Not (Test-Path $ProtocExe)) {
    Write-Host "`n[1/3] Descargando protoc v$ProtocVersion..." -ForegroundColor Yellow
    $url = "https://github.com/protocolbuffers/protobuf/releases/download/v$ProtocVersion/protoc-$ProtocVersion-win64.zip"
    Invoke-WebRequest -Uri $url -OutFile $ProtocZip -UseBasicParsing
    Expand-Archive -Path $ProtocZip -DestinationPath $ProtocDir -Force
    Remove-Item $ProtocZip
    Write-Host "    protoc descargado en $ProtocDir" -ForegroundColor Green
} else {
    Write-Host "`n[1/3] protoc ya existe, saltando descarga" -ForegroundColor Green
}

# ── 3. Instalar plugins de Go ─────────────────────────────────────────────────
Write-Host "`n[2/3] Instalando plugins de protoc para Go..." -ForegroundColor Yellow

# Buscar go.exe en las rutas típicas de instalación en Windows
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
    # Último intento: buscar en todo el PATH del sistema (no solo el de esta sesión)
    $GoExe = (Get-Command go -ErrorAction SilentlyContinue).Source
}
if (-Not $GoExe) {
    Write-Host "No se encontró go.exe. Agrega Go al PATH y vuelve a ejecutar." -ForegroundColor Red
    Write-Host "Descarga Go desde: https://go.dev/dl/" -ForegroundColor Yellow
    exit 1
}

# Agregar el directorio de Go al PATH de esta sesión
$GoDir = Split-Path -Parent $GoExe
$env:PATH = "$GoDir;$env:PATH"
Write-Host "    Go encontrado en: $GoExe" -ForegroundColor Green

Push-Location $RootDir
& $GoExe install google.golang.org/protobuf/cmd/protoc-gen-go@latest
& $GoExe install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
Pop-Location

# Agregar GOPATH/bin al PATH para que protoc encuentre los plugins
$GoBin = (& $GoExe env GOPATH) + "\bin"
$env:PATH = "$GoBin;$env:PATH"

Write-Host "    Plugins instalados en $GoBin" -ForegroundColor Green

# ── 4. Generar código Go desde el proto ───────────────────────────────────────
Write-Host "`n[3/3] Generando código Go desde filesync.proto..." -ForegroundColor Yellow

& $ProtocExe `
    --proto_path="$RootDir\proto" `
    --go_out="$RootDir" `
    --go_opt=module=go-sync `
    --go-grpc_out="$RootDir" `
    --go-grpc_opt=module=go-sync `
    "$ProtoFile"

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n✗ protoc falló. Revisa el error arriba." -ForegroundColor Red
    exit 1
}

Write-Host "    Código generado en $OutDir" -ForegroundColor Green

Write-Host "`n[OK] Listo! Ahora ejecuta: .\scripts\build.ps1`n" -ForegroundColor Cyan
