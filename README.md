# UPB-CIENTÍFICA — Photo Cloud

Sistema distribuido de almacenamiento y compartición de archivos multimedia para el Centro de Computación Avanzada (CCA) de la UPB Seccional Bucaramanga. Implementado como proyecto de aula de Sistemas Distribuidos.

---

## Arquitectura general

```
[Navegador Web]  ──HTTP/REST──►  [Node.js API :3000]
                                        │
                  ┌─────────────────────┼──────────────────────┐
                  ▼                     ▼                       ▼
           [PostgreSQL]           [MinIO :9000]          [PHP SOAP :8080]
            metadatos +           archivos +              registro +
            cuotas +              thumbnails              autenticación
            permisos                                       de usuarios

[Cliente gRPC]   ──gRPC──►  [Go Sync Server :50051]
(sync-client.exe)                  │           │
                              PostgreSQL    MinIO
                             (misma BD)  (mismo bucket)
```

> `soap-server/` y `go-sync/` comparten la misma base de datos PostgreSQL y el mismo bucket MinIO que `photo-cloud-server`. No son réplicas: cada uno es un servicio independiente con su propio protocolo (SOAP, gRPC) sobre el mismo estado persistido.

---

## Servicios del sistema

| Servicio | Tecnología | Puerto | Descripción |
|---|---|---|---|
| **API REST** | Node.js + Express + TypeScript | 3000 | Backend principal: media, permisos, cuotas, streaming |
| **Frontend** | React 19 + Vite + TypeScript | 5173 | Interfaz web: galería, streaming, sync automático |
| **SOAP Users** | PHP 8.1 | 8080 | Gestión de identidad de usuarios (registro, auth) |
| **gRPC Sync** | Go 1.22 | 50051 | Sincronización de directorios vía gRPC |
| **MinIO** | MinIO (S3-compatible) | 9000 / 9001 | Almacenamiento de objetos |
| **PostgreSQL** | PostgreSQL 15+ | 5432 | Base de datos relacional compartida |

---

## Requisitos previos

| Software | Versión mínima | Uso |
|---|---|---|
| Node.js | 18 LTS | Backend API + Frontend |
| PostgreSQL | 15+ | Base de datos |
| MinIO | cualquiera | Almacenamiento de objetos |
| PHP | 8.1+ con `ext-soap` y `ext-pdo_pgsql` | Servidor SOAP de usuarios |
| Go | 1.22+ | Servicio gRPC de sincronización |
| Git | cualquiera | Control de versiones |

> **Windows**: todos los scripts de setup son PowerShell (`.ps1`).  
> **Linux/Mac**: hay equivalentes `.sh` en `scripts/`.

---

## Instalación paso a paso

### 1. Clonar el repositorio

```bash
git clone <URL-del-repo>
cd photo-cloud-project
```

### 2. Configurar variables de entorno

Crea `photo-cloud-server/.env` con el siguiente contenido:

```env
# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=photo_cloud_db
DB_USER=admin_fotos
DB_PASSWORD=12345678

# MinIO
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=fotos-originales

# Servidor
PORT=3000
JWT_SECRET=mi_secreto_super_seguro_cambiar_en_produccion
JWT_EXPIRES_IN=8h

# Servicio SOAP de gestión de usuarios (debe estar corriendo)
SOAP_WSDL_URL=http://localhost:8080/usuarios.wsdl
# SOAP_ENDPOINT_URL=http://localhost:8080/server.php  # solo si el WSDL apunta a otra dirección
```

Crea `soap-server/.env` (mismo host/credenciales de la BD):

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=photo_cloud_db
DB_USER=admin_fotos
DB_PASSWORD=12345678
```

Crea `go-sync/.env`:

```env
DATABASE_URL=postgresql://admin_fotos:12345678@localhost:5432/photo_cloud_db
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=fotos-originales
JWT_SECRET=mi_secreto_super_seguro_cambiar_en_produccion
GRPC_PORT=50051
```

### 3. Instalar infraestructura (PostgreSQL + MinIO)

```powershell
# PowerShell como Administrador
.\scripts\setup-all.ps1
```

Este script instala PostgreSQL (con winget si no está), crea el usuario y la base de datos, descarga y registra MinIO como tarea programada de Windows, y crea el bucket.

### 4. Aplicar migraciones de base de datos

```powershell
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
& $psql -U postgres -d photo_cloud_db -f database/01-init-schema.sql
& $psql -U postgres -d photo_cloud_db -f database/02-usuarios.sql
& $psql -U postgres -d photo_cloud_db -f database/03-cuotas.sql
& $psql -U postgres -d photo_cloud_db -f database/04-permisos.sql
```

### 5. Instalar dependencias

```powershell
cd photo-cloud-server && npm install && cd ..
cd photo-cloud-client && npm install && cd ..
```

---

## Ejecutar el sistema

Se necesitan **cinco terminales** simultáneas:

### Terminal 1 — MinIO

> Si el script de setup lo registró como tarea programada, ya está corriendo.  
> Si no, inícialo manualmente:

```powershell
$env:MINIO_ROOT_USER="minioadmin"
$env:MINIO_ROOT_PASSWORD="minioadmin"
& "C:\minio\minio.exe" server "C:\minio\data" --console-address ":9001"
```

Consola web: http://localhost:9001

### Terminal 2 — Servidor SOAP de usuarios (PHP)

```powershell
cd soap-server
php -S localhost:8080 -t public
```

**Debe estar corriendo antes que el backend Node.js**, ya que `POST /api/auth/register` y `POST /api/auth/login` delegan aquí la gestión de credenciales.

- WSDL: http://localhost:8080/usuarios.wsdl  
- Endpoint: http://localhost:8080/server.php

### Terminal 3 — Backend API (Node.js)

```powershell
cd photo-cloud-server
npm run dev
```

Servidor en: http://localhost:3000

### Terminal 4 — Frontend (React + Vite)

```powershell
cd photo-cloud-client
npm run dev
```

Abre en el navegador: http://localhost:5173

### Terminal 5 — Servidor gRPC de sincronización (Go) — *opcional*

Solo necesario si vas a usar el cliente gRPC de escritorio:

```powershell
cd go-sync
.\sync-server.exe
# → Servidor gRPC escuchando en :50051
```

---

## Funcionalidades del cliente web

### Pestaña: Fotos

- Galería organizada por mes
- Subida de imágenes (individual o múltiple)
- Thumbnails automáticos (200px) generados con `sharp`
- Deduplicación por hash SHA-256: no se re-sube si el archivo no cambió
- Lightbox con navegación por teclado (←/→/Esc)
- Descarga de archivos originales
- Compartir con otro usuario por email, con permisos `r--` o `rw-`
- Badge "Compartido por [nombre]" en archivos recibidos de otros
- Descarga en ZIP de selección múltiple
- Solo el propietario (o alguien con permiso `w`) puede eliminar

### Pestaña: Streaming

- Galería de videos organizada por mes
- Subida de videos
- Reproducción progresiva con soporte de HTTP Range requests
- Descarga de video original
- Compartir video con otro usuario (permisos `r--` o `rw-`)
- Badge "Compartido por [nombre]" en videos recibidos
- Solo el propietario (o alguien con permiso `w`) puede eliminar

### Pestaña: Sync Automático

Sincronización de carpetas directamente desde el navegador, sin instalar nada:

- **Seleccionar carpeta** vía File System Access API (`showDirectoryPicker`)
- **Sync manual**: sube todos los archivos nuevos de la carpeta al servidor
- **Scheduler diario**: ejecuta el sync automáticamente a una hora configurada (formato HH:MM)
- **Deduplicación client-side**: calcula SHA-256 en el navegador con Web Crypto API; los archivos sin cambios no se vuelven a subir
- **Persistencia entre refreshes**: la carpeta seleccionada se guarda en IndexedDB; la hora y estado de auto-sync en `localStorage`. Al reabrir la app todo se restaura automáticamente
- Formatos soportados: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.tiff`, `.heic`, `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`, `.m4v`, `.3gp`

---

## Sincronización gRPC (cliente de escritorio)

Alternativa al sync del navegador para entornos de línea de comandos o tareas programadas.

### Compilar

```powershell
cd go-sync
go build -o "$((go env GOPATH))\bin\sync-client.exe" ./client/main.go
go build -o sync-server.exe ./server/main.go
```

### Uso manual

```powershell
sync-client.exe `
  --dir    "C:\MisFotos" `
  --server "localhost:50051" `
  --email  "usuario@upb.edu.co" `
  --password "micontraseña"
```

Flags disponibles:

| Flag | Descripción | Default |
|---|---|---|
| `--dir` | Directorio a sincronizar | `.` |
| `--server` | Dirección del servidor gRPC | `localhost:50051` |
| `--api` | URL base de la API REST (para autenticación) | `http://localhost:3000/api` |
| `--email` | Email para autenticación automática | — |
| `--password` | Contraseña para autenticación automática | — |
| `--token` | JWT manual (tiene prioridad sobre email/password) | — |
| `--delete` | Borrar del servidor archivos que no existen localmente | `false` |

Prioridad del JWT: `--token` > variable de entorno `PHOTO_CLOUD_TOKEN` > `--email`/`--password`

### Programar sync automático (Windows Task Scheduler)

```powershell
cd go-sync\scripts
.\programar-sync.ps1 `
  -Dir   "C:\MisFotos" `
  -Email "usuario@upb.edu.co" `
  -Password "micontraseña" `
  -Hora  "02:00"
```

Crea una tarea en el Programador de Tareas de Windows que ejecuta el sync todos los días a la hora indicada.

---

## Servidor SOAP de usuarios

Implementa el componente **"SOAP Server PHP Users"** del diagrama de arquitectura. Opera sobre la misma tabla `usuarios` de PostgreSQL que el backend Node.js; un usuario creado por SOAP puede iniciar sesión en el cliente web y viceversa.

### Operaciones WSDL

| Operación | Parámetros | Retorna |
|---|---|---|
| `registrarUsuario` | nombre, email, password | Usuario |
| `autenticarUsuario` | email, password | Usuario |
| `obtenerUsuarioPorEmail` | email | Usuario |
| `obtenerUsuarioPorId` | id | Usuario |
| `listarUsuarios` | — | ArrayOfUsuario |
| `actualizarCuota` | id, cuotaMaximaBytes | boolean |
| `eliminarUsuario` | id | boolean |
| `existeEmail` | email | boolean |

### Integración con Node.js

`POST /api/auth/register` y `POST /api/auth/login` no gestionan `password_hash` directamente. Delegan en `SoapUsuarioClient` (TypeScript), que llama por red al servicio SOAP. Node.js solo emite el JWT tras recibir la confirmación.

Si el servidor SOAP está en otra máquina del CCA, configura en `photo-cloud-server/.env`:

```env
SOAP_WSDL_URL=http://IP-DEL-SERVIDOR-SOAP:8080/usuarios.wsdl
SOAP_ENDPOINT_URL=http://IP-DEL-SERVIDOR-SOAP:8080/server.php
```

### Probar el SOAP independientemente

```powershell
cd soap-server
php client_test.php
```

---

## API Reference

### Autenticación (pública)

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| POST | `/api/auth/register` | `{ nombre, email, password }` | Registra usuario (delega credenciales al SOAP server) |
| POST | `/api/auth/login` | `{ email, password }` | Autentica y devuelve JWT |

### Archivos de medios (requieren `Authorization: Bearer <token>`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/media` | Listar archivos propios + compartidos conmigo |
| GET | `/api/media/hashes` | Listar hashes SHA-256 del usuario (para deduplicación) |
| POST | `/api/media/upload` | Subir archivo (form-data, campo `archivo`) |
| GET | `/api/media/thumb/:id` | Thumbnail 200px |
| GET | `/api/media/:id/download` | Descargar archivo original |
| GET | `/api/media/:id` | Metadatos de un archivo |
| DELETE | `/api/media/:id` | Eliminar (solo propietario o permiso `w`) |

### Streaming de video

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/streaming` | Listar videos propios + compartidos conmigo |
| GET | `/api/streaming/:id` | Stream con soporte de Range requests |
| GET | `/api/streaming/:id/info` | Metadatos del video |

El token puede enviarse como header `Authorization: Bearer <token>` o como query param `?token=<token>` (necesario para el atributo `src` del elemento `<video>`).

### Permisos Unix

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| POST | `/api/media/:id/compartir` | `{ email, leer, escribir, ejecutar }` | Compartir con un usuario |
| DELETE | `/api/media/:id/compartir/:usuarioId` | — | Revocar acceso |
| GET | `/api/media/:id/compartidos` | — | Listar quién tiene acceso |

### Perfil y cuota

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/usuarios/me` | Perfil del usuario autenticado + cuota |

---

## Estructura del proyecto

```
photo-cloud-project/
├── database/                    # Migraciones SQL (ejecutar en orden numérico)
│   ├── 01-init-schema.sql       # Tabla medios, ENUM tipo_media, índices
│   ├── 02-usuarios.sql          # Tabla usuarios, cuota por usuario
│   ├── 03-cuotas.sql            # Extensiones de cuota
│   └── 04-permisos.sql          # Tabla compartidos (permisos Unix rwx)
│
├── scripts/                     # Scripts de instalación de infraestructura
│   ├── setup-all.ps1 / .sh      # Script maestro
│   ├── setup-postgres.ps1 / .sh
│   └── setup-minio.ps1 / .sh
│
├── photo-cloud-server/          # Backend Node.js + TypeScript (arquitectura hexagonal)
│   ├── src/
│   │   ├── domain/              # Modelos de dominio: Media, Usuario
│   │   ├── application/         # Casos de uso + interfaces de puertos
│   │   └── infrastructure/      # Adaptadores: HTTP, PostgreSQL, MinIO, SOAP
│   │       └── adapters/output/soap/soap-usuario.client.ts
│   └── package.json
│
├── photo-cloud-client/          # Frontend React 19 + Vite + TypeScript
│   ├── src/
│   │   ├── App.tsx              # UI principal: auth + fotos + streaming + sync
│   │   ├── api.ts               # Cliente axios con interceptor JWT
│   │   └── components/
│   │       ├── VideoGallery.tsx # Galería de videos con upload/stream/share/delete
│   │       └── VideoPlayer.tsx  # Reproductor modal con Range requests
│   └── package.json
│
├── soap-server/                 # Servidor SOAP PHP — gestión de usuarios
│   ├── public/
│   │   ├── server.php           # Endpoint SOAP (punto de entrada)
│   │   └── usuarios.wsdl        # Contrato WSDL
│   ├── src/
│   │   ├── UsuarioService.php   # Lógica: registro, auth, cuotas, listado
│   │   ├── Database.php         # Conexión PDO a PostgreSQL
│   │   ├── Env.php              # Carga de variables de entorno
│   │   └── UsuarioFault.php     # SoapFaults tipadas
│   ├── client_test.php          # Cliente de prueba SOAP
│   └── .env.example
│
├── go-sync/                     # Servicio gRPC de sincronización — Go
│   ├── proto/filesync.proto     # Contrato gRPC (SubirArchivo, ListarArchivos, VerificarHash)
│   ├── gen/filesync/            # Código generado por protoc (no editar)
│   ├── server/                  # Servidor gRPC: main.go, server.go, auth.go
│   ├── client/main.go           # CLI de sincronización con auto-auth
│   └── scripts/
│       ├── generate.ps1         # Genera código Go desde el proto
│       └── programar-sync.ps1   # Registra tarea en Task Scheduler de Windows
│
└── README.md
```

---

## Esquema de base de datos

```sql
-- Tabla principal de archivos multimedia
medios (id UUID, nombre_original, mimetype, tipo tipo_media, tamano_bytes,
        hash CHAR(64), metadatos JSONB, creado_en, usuario_id FK)

-- Usuarios (gestionados por el servicio SOAP)
usuarios (id UUID, nombre, email UNIQUE, password_hash, cuota_maxima_bytes,
          uso_bytes, creado_en)

-- Permisos Unix para compartir archivos
compartidos (id, archivo_id FK, propietario_id FK, destinatario_id FK,
             puede_leer, puede_escribir, puede_ejecutar, creado_en)
```

---

## Verificar que todo funciona

```powershell
# Verificar usuarios y cuotas
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
& $psql -U postgres -d photo_cloud_db -c "SELECT email, uso_bytes, cuota_maxima_bytes FROM usuarios;"

# Verificar archivos subidos
& $psql -U postgres -d photo_cloud_db -c "SELECT nombre_original, tipo, tamano_bytes, usuario_id FROM medios;"

# Verificar permisos de compartir
& $psql -U postgres -d photo_cloud_db -c "SELECT archivo_id, puede_leer, puede_escribir FROM compartidos;"
```

**Flujo de verificación completo:**

1. Abrir http://localhost:5173
2. Registrar cuenta A → subir foto → verificar galería y cuota
3. Registrar cuenta B → compartir foto de A con B (permiso `r--`)
4. Iniciar sesión con B → la foto aparece con badge morado "Compartido por [A]"
5. Verificar que B no puede eliminar la foto de A (solo lectura)
6. Compartir otra foto de A con B (permiso `rw-`) → B sí puede eliminarla
7. Subir video → pestaña Streaming → reproducir, descargar, compartir
8. Pestaña Sync → seleccionar carpeta → Sincronizar ahora → activar sync automático a una hora → refrescar la página → verificar que la configuración persiste

---

## Solución de problemas comunes

**`php -S` da error "soap extension not loaded"**  
Edita `php.ini` (ubicar con `php --ini`) y descomenta `extension=soap` y `extension=pdo_pgsql`. Reinicia la terminal.

**`/api/auth/register` responde "El servicio de gestión de usuarios (SOAP) no está disponible"**  
El servidor SOAP no está corriendo. Ejecuta `php -S localhost:8080 -t public` desde `soap-server/`.

**Error ECONNREFUSED en puerto 9000 (MinIO)**  
MinIO no está corriendo. Inícialo manualmente con las variables de entorno correctas.

**Error de credenciales MinIO (InvalidAccessKeyId)**  
MinIO fue iniciado con credenciales distintas a las del `.env`. Detén el proceso e inícialo de nuevo con `minioadmin`/`minioadmin`.

**`permission denied for table medios` en PostgreSQL**  
```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO admin_fotos;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO admin_fotos;
```

**AppLocker bloquea `sync-client.exe`**  
Compila en un directorio permitido por AppLocker:
```powershell
go build -o "$((go env GOPATH))\bin\sync-client.exe" ./client/main.go
```

**El sync automático del navegador no recuerda la carpeta tras reiniciar Chrome**  
Al reiniciar el navegador, Chrome revoca el permiso de acceso a la carpeta por seguridad. Al reabrir la app aparece el botón naranja **"🔓 Reautorizar acceso"** — un clic restablece el permiso y el scheduler se reactiva.

**Las variables del `.env` no toman efecto (Postgres o JWT)**  
El proyecto usa `dotenv.config({ override: true })` en `src/env.ts` para que el `.env` siempre pise variables del sistema. Si el problema persiste, verifica con `[Environment]::GetEnvironmentVariable("DB_PASSWORD","Machine")` en PowerShell.

---

## Tecnologías utilizadas

| Componente | Tecnología |
|---|---|
| Backend API | Node.js 18 + Express 4 + TypeScript |
| Frontend | React 19 + Vite + TypeScript |
| Gestión de usuarios | PHP 8.1 + SOAP nativo + PDO/PostgreSQL |
| Cliente SOAP (Node) | npm `soap` — `SoapUsuarioClient` |
| Sincronización gRPC | Go 1.22 + gRPC + Protocol Buffers |
| Base de datos | PostgreSQL 15+ |
| Almacenamiento de objetos | MinIO (API S3-compatible) |
| Autenticación | JWT (jsonwebtoken) — credenciales delegadas al SOAP server |
| Hashing de passwords | bcrypt (PHP `password_hash` / Node `bcryptjs` — compatibles) |
| Thumbnails | sharp |
| Sincronización en navegador | File System Access API + Web Crypto API (SHA-256) + IndexedDB |
| Arquitectura backend | Hexagonal (puertos y adaptadores) |
| Streaming de video | HTTP Range requests |

---

## Estado del proyecto

| Paso | Descripción | Estado |
|---|---|---|
| 2 | Infraestructura nativa (sin Docker) — PostgreSQL + MinIO | ✅ Completo |
| 3 | Autenticación JWT + registro de usuarios | ✅ Completo |
| 4 | Shared File: cuotas + permisos Unix (rwx) + Photo Album | ✅ Completo |
| 5 | Streaming de video (HTTP Range + galería + compartir) | ✅ Completo |
| 6 | File Sync — gRPC (Go) + Sync panel en navegador | ✅ Completo |
| 7 | Gestión de usuarios SOAP (PHP), consumido por Node en `/api/auth/*` | ✅ Completo |
| 8 | Cluster HPC (Java RMI/MPI) — procesamiento distribuido de imágenes | 🔄 Pendiente |
| 9 | Seguridad (GPG para backups, análisis OWASP, documentación de riesgos) | 🔄 Pendiente |
| 1 | Diagrama de arquitectura final | 🔄 Pendiente (al completar todo) |
