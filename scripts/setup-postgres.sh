#!/bin/bash
# =============================================
# setup-postgres.sh
# Instala y configura PostgreSQL de forma nativa en Ubuntu/Debian
# Ejecutar como root o con sudo: sudo bash scripts/setup-postgres.sh
# =============================================
set -e  # Detener si cualquier comando falla

# Cargar variables de entorno si existe .env
if [ -f "$(dirname "$0")/../.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

DB_NAME="${DB_NAME:-photo_cloud_db}"
DB_USER="${DB_USER:-admin_fotos}"
DB_PASSWORD="${DB_PASSWORD:-cambia_esta_contrasena}"

echo "============================================="
echo "  Instalación nativa de PostgreSQL"
echo "============================================="

# 1. Instalar PostgreSQL si no está instalado
if ! command -v psql &>/dev/null; then
  echo "[1/4] Instalando PostgreSQL..."
  apt-get update -qq
  apt-get install -y postgresql postgresql-contrib
else
  echo "[1/4] PostgreSQL ya está instalado ($(psql --version))"
fi

# 2. Asegurar que el servicio esté activo
echo "[2/4] Iniciando servicio PostgreSQL..."
systemctl enable postgresql
systemctl start postgresql

# 3. Crear usuario y base de datos
echo "[3/4] Creando usuario '$DB_USER' y base de datos '$DB_NAME'..."
sudo -u postgres psql <<EOF
-- Crear usuario si no existe
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE USER "$DB_USER" WITH PASSWORD '$DB_PASSWORD';
    RAISE NOTICE 'Usuario $DB_USER creado.';
  ELSE
    RAISE NOTICE 'Usuario $DB_USER ya existe.';
  END IF;
END
\$\$;

-- Crear base de datos si no existe
SELECT 'CREATE DATABASE "$DB_NAME" OWNER "$DB_USER"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')
\gexec

-- Otorgar todos los privilegios
GRANT ALL PRIVILEGES ON DATABASE "$DB_NAME" TO "$DB_USER";
EOF

# 4. Aplicar el esquema inicial
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SQL_FILE="$SCRIPT_DIR/../database/01-init-schema.sql"

echo "[4/4] Aplicando esquema inicial desde $SQL_FILE..."
sudo -u postgres psql -d "$DB_NAME" -f "$SQL_FILE"

echo ""
echo "✅ PostgreSQL configurado correctamente."
echo "   Host:     localhost:5432"
echo "   Base de datos: $DB_NAME"
echo "   Usuario:  $DB_USER"
echo ""
echo "Para conectarte manualmente:"
echo "   psql -U $DB_USER -d $DB_NAME -h localhost"
