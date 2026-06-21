# UPB-CIENTÍFICA — Photo Cloud

Sistema distribuido de almacenamiento y compartición de archivos para el Centro de Computación Avanzada (CCA) de la UPB Seccional Bucaramanga.

---

## Arquitectura general

```
[Browser]  ──HTTP/REST──►  [Node.js API :3000]
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              [PostgreSQL]  [MinIO :9000]  (próximamente)
               metadatos    archivos       Go/gRPC · PHP/SOAP · Java/RMI
```

---

## Requisitos previos

| Software | Versión mínima | Descarga |
|---|---|---|
| Node.js | 18 LTS | https://nodejs.org |
| PostgreSQL | 15+ | https://www.postgresql.org/download/windows/ |
| MinIO | cualquiera | se descarga automáticamente con el script |
| Git | cualquiera | https://git-scm.com |

> **Windows**: todos los scripts son PowerShell (`.ps1`).  
> **Linux/Mac**: hay equivalentes `.sh` en la misma carpeta `scripts/`.

---

## Instalación paso a paso

### 1. Clonar el repositorio

```bash
git clone <URL-del-repo>
cd photo-cloud-project
```

### 2. Configurar variables de entorno

El `.env` está en el `.gitignore` y **no se sube al repositorio**. Debes crearlo manualmente.

Crea el archivo `photo-cloud-server/.env` (donde arranca el servidor) con el siguiente contenido:

```powershell
New-Item -Path "photo-cloud-server\.env" -ItemType File -Force
notepad "photo-cloud-server\.env"
```

Pega esto y guarda:

> Los valores por defecto funcionan sin cambios para desarrollo local:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=photo_cloud_db
DB_USER=admin_fotos
DB_PASSWORD=12345678

MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=admin_storage
MINIO_SECRET_KEY=12345678
MINIO_BUCKET=fotos-originales

PORT=3000
JWT_SECRET=mi_secreto_super_seguro_cambiar_en_produccion
JWT_EXPIRES_IN=8h
```

### 3. Instalar infraestructura (PostgreSQL + MinIO)

Abre **PowerShell como Administrador** y ejecuta:

```powershell
.\scripts\setup-all.ps1
```

Este script:
- Verifica que PostgreSQL esté instalado (lo instala con `winget` si no está)
- Inicia el servicio de PostgreSQL
- Crea el usuario `admin_fotos` y la base de datos `photo_cloud_db`
- Aplica el esquema inicial (`database/01-init-schema.sql`)
- Descarga `minio.exe` en `C:\minio\`
- Registra MinIO como tarea programada de Windows (arranca con el sistema)
- Crea el bucket `fotos-originales`

> **Solo se ejecuta una vez.** En sesiones posteriores MinIO arranca automáticamente.

### 4. Aplicar migraciones de base de datos

Abre PowerShell normal (no hace falta ser administrador) y ejecuta cada migración en orden:

```powershell
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

# Usuarios y aislamiento por usuario
& $psql -U postgres -d photo_cloud_db -f database/02-usuarios.sql

# Cuotas de almacenamiento
& $psql -U postgres -d photo_cloud_db -f database/03-cuotas.sql

# Permisos Unix para compartir archivos
& $psql -U postgres -d photo_cloud_db -f database/04-permisos.sql
```

> Si tu PostgreSQL está en una versión diferente a la 18, ajusta la ruta.  
> Puedes verificar con: `Get-ChildItem "C:\Program Files\PostgreSQL\"`

### 5. Instalar dependencias Node.js

**Servidor (backend):**
```powershell
cd photo-cloud-server
npm install
cd ..
```

**Cliente (frontend):**
```powershell
cd photo-cloud-client
npm install
cd ..
```

---

## Ejecutar el proyecto

Necesitas **tres terminales** abiertas simultáneamente:

### Terminal 1 — MinIO

> Si el script de setup ya lo registró como tarea programada, MinIO debería estar corriendo.  
> Si no, inícialo manualmente:

```powershell
$env:MINIO_ROOT_USER="admin_storage"
$env:MINIO_ROOT_PASSWORD="12345678"
& "C:\minio\minio.exe" server "C:\minio\data" --console-address ":9001"
```

Verifica que esté corriendo en: http://localhost:9000

### Terminal 2 — Servidor API (Node.js)

```powershell
cd photo-cloud-server
npm run dev
```

El servidor queda escuchando en http://localhost:3000  
Verás en la consola:
```
Servidor API corriendo en http://localhost:3000
Rutas publicas:   POST /api/auth/register | POST /api/auth/login
Rutas protegidas: /api/media/* | GET /api/usuarios/me
```

### Terminal 3 — Frontend (React + Vite)

```powershell
cd photo-cloud-client
npm run dev
```

Abre en el navegador: http://localhost:5173

---

## Verificar que todo funciona

1. Abre http://localhost:5173
2. Registra una cuenta nueva con tu email
3. Inicia sesión
4. Sube una imagen — debe aparecer en la galería con tu cuota actualizada
5. Crea una segunda cuenta desde otra pestaña/navegador
6. Desde la primera cuenta, haz clic en el ícono de compartir en la foto y comparte con el email de la segunda cuenta
7. Desde la segunda cuenta, la foto debe aparecer con badge morado "Compartido por [nombre]"

### Verificar la BD directamente

```powershell
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

# Ver usuarios registrados y su cuota
& $psql -U postgres -d photo_cloud_db -c "SELECT email, uso_bytes, cuota_maxima_bytes FROM usuarios;"

# Ver archivos subidos
& $psql -U postgres -d photo_cloud_db -c "SELECT nombre_original, tamano_bytes, usuario_id FROM medios;"

# Ver permisos de compartir
& $psql -U postgres -d photo_cloud_db -c "SELECT * FROM compartidos;"
```

---

## Estructura del proyecto

```
photo-cloud-project/
├── database/                   # Migraciones SQL (ejecutar en orden)
│   ├── 01-init-schema.sql      # Tabla medios + índices
│   ├── 02-usuarios.sql         # Tabla usuarios + aislamiento por usuario
│   ├── 03-cuotas.sql           # Cuota máxima y uso por usuario
│   └── 04-permisos.sql         # Permisos Unix para compartir archivos
│
├── scripts/                    # Scripts de instalación de infraestructura
│   ├── setup-all.ps1           # Script maestro (Windows)
│   ├── setup-postgres.ps1      # Solo PostgreSQL (Windows)
│   ├── setup-minio.ps1         # Solo MinIO (Windows)
│   ├── setup-all.sh            # Script maestro (Linux/Mac)
│   ├── setup-postgres.sh       # Solo PostgreSQL (Linux/Mac)
│   └── setup-minio.sh          # Solo MinIO (Linux/Mac)
│
├── photo-cloud-server/         # Backend Node.js + TypeScript
│   ├── src/
│   │   ├── domain/             # Modelos de dominio (Media, Usuario)
│   │   ├── application/        # Casos de uso y puertos (interfaces)
│   │   └── infrastructure/     # Adaptadores: HTTP, PostgreSQL, MinIO
│   ├── .env                    # Variables de entorno (no subir a git)
│   └── package.json
│
├── photo-cloud-client/         # Frontend React + Vite + TypeScript
│   ├── src/
│   │   └── App.tsx             # Toda la UI (auth + galería + compartir)
│   └── package.json
│
├── .env.example                # Plantilla de variables de entorno
└── README.md                   # Este archivo
```

---

## API Reference

### Autenticación (pública)

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| POST | `/api/auth/register` | `{ nombre, email, password }` | Registrar usuario |
| POST | `/api/auth/login` | `{ email, password }` | Login → devuelve `{ token, usuario }` |

### Archivos (requieren `Authorization: Bearer <token>`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/media` | Listar mis archivos + archivos compartidos conmigo |
| POST | `/api/media/upload` | Subir archivo (form-data, campo `archivo`) |
| GET | `/api/media/:id` | Metadatos de un archivo |
| GET | `/api/media/thumb/:id` | Thumbnail (200px) |
| GET | `/api/media/:id/download` | Descargar archivo original |
| DELETE | `/api/media/:id` | Eliminar archivo |

### Permisos Unix

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| POST | `/api/media/:id/compartir` | `{ email, leer, escribir, ejecutar }` | Compartir archivo con un usuario |
| DELETE | `/api/media/:id/compartir/:usuarioId` | — | Revocar acceso |
| GET | `/api/media/:id/compartidos` | — | Listar quién tiene acceso |

### Perfil y cuota

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/usuarios/me` | Perfil del usuario autenticado + info de cuota |

---

## Solución de problemas comunes

**`psql` no se reconoce como comando**  
Usa la ruta completa: `& "C:\Program Files\PostgreSQL\18\bin\psql.exe"`

**Error ECONNREFUSED en puerto 9000 (MinIO)**  
MinIO no está corriendo. Ejecútalo manualmente con el comando de la Terminal 1.

**Error de credenciales MinIO (invalid credentials)**  
MinIO fue iniciado con contraseñas diferentes. Detén el proceso e inícialo de nuevo con las variables de entorno correctas.

**Error `permission denied for table medios`**  
Ejecuta como superusuario postgres:
```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO admin_fotos;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO admin_fotos;
```

**Las imágenes aparecen como ícono genérico**  
Normalmente es porque MinIO no está corriendo o las credenciales no coinciden con el `.env`.

**El refresh cierra la sesión**  
Asegúrate de tener la última versión del cliente. La sesión se guarda en `sessionStorage` y sobrevive el refresh (pero no el cierre de la pestaña, que es el comportamiento esperado).

---

## Tecnologías utilizadas

| Componente | Tecnología |
|---|---|
| Backend API | Node.js + Express + TypeScript |
| Frontend | React 19 + Vite + TypeScript |
| Base de datos | PostgreSQL 15+ |
| Almacenamiento de objetos | MinIO (S3-compatible) |
| Autenticación | JWT (jsonwebtoken) + bcryptjs |
| Thumbnails | sharp |
| Arquitectura | Hexagonal (puertos y adaptadores) |

---

## Estado del proyecto

| Paso | Descripción | Estado |
|---|---|---|
| 2 | Infraestructura nativa (sin Docker) | ✅ Completo |
| 3 | Autenticación JWT + registro de usuarios | ✅ Completo |
| 4 | Shared File: cuotas + permisos Unix + Photo Album | ✅ Completo |
| 5 | Streaming de video | 🔄 Pendiente |
| 6 | File Sync (Go + gRPC) | 🔄 Pendiente |
| 7 | Gestión de usuarios SOAP (PHP) | 🔄 Pendiente |
| 8 | Cluster HPC (Java + RMI) | 🔄 Pendiente |
| 9 | Seguridad (GPG + análisis de vulnerabilidades) | 🔄 Pendiente |
| 1 | Diagrama de arquitectura final | 🔄 Pendiente |
