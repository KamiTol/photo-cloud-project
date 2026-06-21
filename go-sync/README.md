# go-sync — Servicio de sincronización gRPC

Servicio independiente en Go que permite sincronizar un directorio local con el servidor photo-cloud mediante gRPC.
Usa la misma base de datos PostgreSQL y el mismo bucket MinIO que el servidor Node.js.

## Arquitectura

```
[Cliente desktop]              [Servidor CCA]
  sync-client.exe  ──gRPC──►  sync-server.exe
  (go-sync/client)   :50051   (go-sync/server)
                                    │
                              ┌─────┴──────┐
                           PostgreSQL    MinIO
                           (misma BD)  (mismo bucket)
```

## Requisitos

- Go 1.22 o superior (`go version`)
- El servidor Node.js y MinIO ya deben estar corriendo
- La misma base de datos PostgreSQL ya inicializada

## Setup (ejecutar una sola vez)

```powershell
# 1. Desde la carpeta go-sync:
cd photo-cloud-project\go-sync

# 2. Generar código Go desde el proto (descarga protoc automáticamente):
.\scripts\generate.ps1

# 3. Compilar servidor y cliente:
.\scripts\build.ps1
```

Esto crea `sync-server.exe` y `sync-client.exe` en la carpeta `go-sync\`.

## Variables de entorno

El servidor gRPC lee el mismo archivo `.env` del proyecto raíz.
Asegúrate de que tenga estas variables (ya deberían estar si montaste el servidor Node.js):

```
DATABASE_URL=postgresql://admin_fotos:admin_fotos@localhost:5432/photo_cloud
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=admin
MINIO_SECRET_KEY=password123
MINIO_BUCKET=fotos-originales
JWT_SECRET=tu_secreto_aqui
GRPC_PORT=50051          # opcional, default 50051
```

## Uso

### 1. Iniciar el servidor gRPC

```powershell
# Terminal 4 (además de PostgreSQL, MinIO y Node.js)
cd photo-cloud-project\go-sync
.\sync-server.exe
# → 🚀 Servidor gRPC escuchando en :50051
```

### 2. Sincronizar un directorio

```powershell
# Obtén el JWT haciendo login en http://localhost:3000
# (o cópialo del sessionStorage del navegador)

.\sync-client.exe `
  --dir "C:\MisFotos" `
  --server "localhost:50051" `
  --token "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

Salida de ejemplo:
```
Conectando a localhost:50051...
Sincronizando directorio: C:\MisFotos

  Procesando: verano\foto1.jpg → ya sincronizado
  Procesando: verano\foto2.jpg → subiendo (2.3 MB)... ✓
  Procesando: navidad\video.mp4 → subiendo (45.1 MB)... ✓
  Procesando: thumbs.db → (extensión no soportada, saltando)

────────────────────────────────────
Sincronización completada en 3.2s
  Subidos:  2 archivo(s) (47.4 MB)
  Saltados: 1 (sin cambios)
```

### 3. Programar sincronización automática (Task Scheduler)

```powershell
.\scripts\programar-sync.ps1 `
  -Dir "C:\MisFotos" `
  -Token "eyJ..." `
  -Hora "02:00"
  # Corre todos los días a las 2:00 AM
```

Para ver/administrar la tarea:
```powershell
Get-ScheduledTask -TaskName "PhotoCloud-Sync"
Start-ScheduledTask  -TaskName "PhotoCloud-Sync"   # ejecutar ahora
Stop-ScheduledTask   -TaskName "PhotoCloud-Sync"   # detener
Unregister-ScheduledTask -TaskName "PhotoCloud-Sync" -Confirm:$false  # eliminar
```

### Linux / macOS (cron)

```bash
# Construir
cd go-sync && go run ./scripts/generate_unix.go  # (si aplica)
go build -o sync-client ./client/...
go build -o sync-server ./server/...

# Crontab (todos los días a las 2 AM)
crontab -e
0 2 * * * PHOTO_CLOUD_TOKEN="eyJ..." /ruta/go-sync/sync-client --dir /home/usuario/fotos --server localhost:50051
```

## Extensiones de archivo soportadas

Imágenes: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.tiff`, `.heic`

Videos: `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`, `.m4v`, `.3gp`

## Deduplicación

El cliente calcula SHA-256 de cada archivo y pregunta al servidor si ya existe antes de subir.
Los archivos sin cambios **no se vuelven a subir**, aunque el nombre sea diferente.

## Estructura de archivos

```
go-sync/
├── proto/
│   └── filesync.proto          # Definición del protocolo gRPC
├── gen/filesync/               # Generado por protoc (no editar)
│   ├── filesync.pb.go
│   └── filesync_grpc.pb.go
├── server/
│   ├── main.go                 # Entry point del servidor
│   ├── server.go               # Implementación de los RPCs
│   └── auth.go                 # Interceptor JWT para gRPC
├── client/
│   └── main.go                 # CLI de sincronización
├── scripts/
│   ├── generate.ps1            # Descarga protoc y genera código Go
│   ├── build.ps1               # Compila server y client
│   └── programar-sync.ps1      # Registra tarea en Task Scheduler
├── go.mod
└── README.md
```
