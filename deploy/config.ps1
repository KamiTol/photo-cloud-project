# =============================================================================
# config.ps1 — Configuración central de despliegue (Windows)
# Edita este archivo ANTES de ejecutar cualquier script de VM.
# =============================================================================

# ── IPs de las máquinas virtuales ──────────────────────────────────────────
$VM1_IP  = "192.168.1.10"   # Repository: PostgreSQL + MinIO
$VM2_IP  = "192.168.1.11"   # App Server: Node.js + PHP SOAP + Nginx
$VM3_IP  = "192.168.1.12"   # gRPC Sync:  Go sync-server

# ── Repositorio Git ────────────────────────────────────────────────────────
$GIT_REPO = "https://github.com/TU_USUARIO/photo-cloud-project.git"

# ── Base de datos ──────────────────────────────────────────────────────────
$DB_NAME     = "photo_cloud_db"
$DB_USER     = "admin_fotos"
$DB_PASSWORD = "12345678"

# ── MinIO ──────────────────────────────────────────────────────────────────
$MINIO_USER     = "minioadmin"
$MINIO_PASSWORD = "minioadmin"
$MINIO_BUCKET   = "fotos-originales"
$MINIO_DATA_DIR = "C:\minio\data"

# ── JWT ────────────────────────────────────────────────────────────────────
$JWT_SECRET  = "upb_cientifica_jwt_secret_cambiar_en_produccion"
$JWT_EXPIRES = "8h"

# ── Puertos ────────────────────────────────────────────────────────────────
$API_PORT  = 3000
$SOAP_PORT = 8080
$GRPC_PORT = 50051

# ── Rutas de instalación ───────────────────────────────────────────────────
$REPO_DIR  = "C:\photo-cloud"
$NSSM_DIR  = "C:\nssm"
$NGINX_DIR = "C:\nginx"
$PHP_DIR   = "C:\php"
$MINIO_DIR = "C:\minio"
$GO_DIR    = "C:\Go"
