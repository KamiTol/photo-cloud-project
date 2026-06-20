#!/bin/bash
# =============================================
# setup-all.sh
# Script maestro: instala toda la infraestructura nativa
# Ejecutar como root o con sudo: sudo bash scripts/setup-all.sh
# =============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."

echo "============================================="
echo "  UPB-CIENTÍFICA - Setup de infraestructura"
echo "============================================="
echo ""

# Verificar que existe el archivo .env
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "⚠️  No se encontró el archivo .env"
  echo "   Creando desde .env.example con valores por defecto..."
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
  echo "   ⚡ IMPORTANTE: Edita $PROJECT_DIR/.env y cambia las contraseñas antes de continuar."
  echo "   Presiona ENTER para continuar con los valores por defecto, o Ctrl+C para cancelar."
  read -r
fi

echo "--- Paso 1: PostgreSQL ---"
bash "$SCRIPT_DIR/setup-postgres.sh"
echo ""

echo "--- Paso 2: MinIO ---"
bash "$SCRIPT_DIR/setup-minio.sh"
echo ""

echo "============================================="
echo "✅ Infraestructura lista."
echo ""
echo "Próximos pasos:"
echo "  1. cd photo-cloud-server && npm install"
echo "  2. npm run dev"
echo "============================================="
