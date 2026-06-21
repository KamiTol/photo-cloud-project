# programar-sync.ps1 — Registra una tarea en Windows Task Scheduler
# que ejecuta sync-client.exe de manera automática.
#
# Uso con email/contraseña (recomendado — el token se renueva solo):
#   .\scripts\programar-sync.ps1 -Dir "C:\MisFotos" -Email "tu@email.com" -Password "secreto" -Hora "02:00"
#
# Uso con token manual (expira en 8h):
#   .\scripts\programar-sync.ps1 -Dir "C:\MisFotos" -Token "eyJ..." -Hora "02:00"

param(
    [Parameter(Mandatory=$true)]
    [string]$Dir,

    [string]$Email    = "",
    [string]$Password = "",
    [string]$Token    = "",

    [string]$Hora       = "02:00",
    [string]$Servidor   = "localhost:50051",
    [string]$ApiURL     = "http://localhost:3000/api",
    [string]$NombreTarea = "PhotoCloud-Sync"
)

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir    = Split-Path -Parent $ScriptDir

# Buscar el cliente en GOPATH\bin (ruta permitida por AppLocker)
$GoPath     = (go env GOPATH 2>$null) -replace '"', ''
$ClienteExe = "$GoPath\bin\sync-client.exe"

if (-Not (Test-Path $ClienteExe)) {
    Write-Error "sync-client.exe no encontrado en $ClienteExe`nEjecuta primero:`n  go build -o `"$ClienteExe`" ./client/main.go"
    exit 1
}

# Construir argumentos según qué credenciales se proveyeron
if ($Email -ne "" -and $Password -ne "") {
    $Argumentos = "--dir=`"$Dir`" --server=`"$Servidor`" --api=`"$ApiURL`" --email=`"$Email`" --password=`"$Password`""
} elseif ($Token -ne "") {
    $Argumentos = "--dir=`"$Dir`" --server=`"$Servidor`" --token=`"$Token`""
} else {
    Write-Error "Debes proporcionar -Email y -Password, o un -Token."
    exit 1
}

# Acción: ejecutar sync-client.exe con los parámetros
$Accion = New-ScheduledTaskAction `
    -Execute $ClienteExe `
    -Argument $Argumentos `
    -WorkingDirectory $RootDir

# Disparador: diariamente a la hora indicada
$Disparador = New-ScheduledTaskTrigger -Daily -At $Hora

# Configuración: ejecutar aunque el usuario no esté logueado, reintentar si falla
$Configuracion = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5)

# Registrar (o actualizar si ya existe)
$Principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Highest

try {
    Unregister-ScheduledTask -TaskName $NombreTarea -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask `
        -TaskName $NombreTarea `
        -Action $Accion `
        -Trigger $Disparador `
        -Settings $Configuracion `
        -Principal $Principal `
        -Description "Sincroniza $Dir con el servidor photo-cloud (gRPC)" | Out-Null

    Write-Host @"

✓ Tarea '$NombreTarea' registrada correctamente.
  Directorio : $Dir
  Servidor   : $Servidor
  Horario    : Todos los días a las $Hora

Para ejecutar manualmente ahora mismo:
  Start-ScheduledTask -TaskName '$NombreTarea'

Para ver el historial:
  Get-ScheduledTaskInfo -TaskName '$NombreTarea'

Para eliminar la tarea:
  Unregister-ScheduledTask -TaskName '$NombreTarea' -Confirm:`$false
"@ -ForegroundColor Cyan

} catch {
    Write-Error "Error registrando tarea: $_"
    exit 1
}
