#!/bin/bash
# =============================================
# setup-minio.sh
# Instala y configura MinIO de forma nativa en Ubuntu/Debian
# Ejecutar como root o con sudo: sudo bash scripts/setup-minio.sh
# =============================================
set -e

# Cargar variables de entorno si existe .env
if [ -f "$(dirname "$0")/../.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-admin_storage}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-cambia_esta_contrasena}"
MINIO_BUCKET="${MINIO_BUCKET:-fotos-originales}"
MINIO_DATA_DIR="/opt/minio/data"
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001

echo "============================================="
echo "  Instalación nativa de MinIO"
echo "============================================="

# 1. Descargar binario de MinIO
if [ ! -f /usr/local/bin/minio ]; then
  echo "[1/5] Descargando MinIO..."
  wget -q https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/local/bin/minio
  chmod +x /usr/local/bin/minio
else
  echo "[1/5] Binario MinIO ya existe en /usr/local/bin/minio"
fi

# 2. Crear usuario de sistema y directorio de datos
echo "[2/5] Configurando usuario y directorios..."
id -u minio-user &>/dev/null || useradd -r -s /sbin/nologin minio-user
mkdir -p "$MINIO_DATA_DIR"
chown -R minio-user:minio-user "$MINIO_DATA_DIR"

# 3. Crear archivo de configuración de entorno para MinIO
echo "[3/5] Escribiendo /etc/minio/minio.env..."
mkdir -p /etc/minio
cat > /etc/minio/minio.env <<EOF
MINIO_ROOT_USER=$MINIO_ACCESS_KEY
MINIO_ROOT_PASSWORD=$MINIO_SECRET_KEY
MINIO_VOLUMES=$MINIO_DATA_DIR
MINIO_OPTS="--console-address :$MINIO_CONSOLE_PORT"
EOF
chmod 600 /etc/minio/minio.env

# 4. Crear servicio systemd para que MinIO arranque con el sistema
echo "[4/5] Registrando servicio systemd minio.service..."
cat > /etc/systemd/system/minio.service <<EOF
[Unit]
Description=MinIO Object Storage
After=network-online.target
Wants=network-online.target

[Service]
User=minio-user
Group=minio-user
EnvironmentFile=/etc/minio/minio.env
ExecStart=/usr/local/bin/minio server \$MINIO_VOLUMES \$MINIO_OPTS --address ":$MINIO_PORT"
Restart=always
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable minio
systemctl start minio

# 5. Crear el bucket inicial usando el cliente mc (MinIO Client)
echo "[5/5] Creando bucket '$MINIO_BUCKET'..."
if [ ! -f /usr/local/bin/mc ]; then
  wget -q https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc
  chmod +x /usr/local/bin/mc
fi

sleep 3  # Esperar que MinIO arranque
/usr/local/bin/mc alias set local "http://localhost:$MINIO_PORT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" --quiet
/usr/local/bin/mc mb --ignore-existing "local/$MINIO_BUCKET"

echo ""
echo "✅ MinIO configurado correctamente."
echo "   API:     http://localhost:$MINIO_PORT"
echo "   Consola: http://localhost:$MINIO_CONSOLE_PORT"
echo "   Bucket:  $MINIO_BUCKET"
echo "   Usuario: $MINIO_ACCESS_KEY"
