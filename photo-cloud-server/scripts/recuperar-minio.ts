/**
 * recuperar-minio.ts
 * Reconstruye los registros de PostgreSQL para archivos huérfanos en MinIO.
 * Uso: npx ts-node scripts/recuperar-minio.ts
 */
import { S3Client, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Pool } from 'pg';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import 'dotenv/config';

// ── Configuración ──────────────────────────────────────────────────────────────
const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  credentials: {
    accessKeyId:     process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true,
});

const bucket = process.env.MINIO_BUCKET || 'fotos-originales';

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME     || 'photo_cloud_db',
  user:     process.env.DB_USER     || 'admin_fotos',
  password: process.env.DB_PASSWORD || '12345678',
});

// ── Helpers ────────────────────────────────────────────────────────────────────
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function detectarTipo(mimetype: string): 'IMAGEN' | 'VIDEO' {
  return mimetype?.startsWith('video/') ? 'VIDEO' : 'IMAGEN';
}

function extraerExtension(mimetype: string): string {
  const mapa: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/heic': 'heic', 'image/bmp': 'bmp',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-msvideo': 'avi',
    'video/x-matroska': 'mkv', 'video/webm': 'webm',
  };
  return mapa[mimetype] || 'bin';
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Recuperación de archivos desde MinIO ===\n');

  // 1. Obtener el primer usuario de la BD para asignar los archivos huérfanos
  const usuariosRes = await pool.query('SELECT id, email FROM usuarios ORDER BY creado_en ASC LIMIT 10');
  if (usuariosRes.rows.length === 0) {
    console.error('No hay usuarios en la BD. Regístra uno primero desde la app web.');
    process.exit(1);
  }

  console.log('Usuarios disponibles:');
  usuariosRes.rows.forEach((u, i) => console.log(`  [${i}] ${u.email} (${u.id})`));
  const usuario = usuariosRes.rows[0];
  console.log(`\nAsignando archivos al usuario: ${usuario.email}\n`);

  // 2. Listar objetos en MinIO (excluir thumbnails)
  const listRes = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
  const objetos = (listRes.Contents || []).filter(o => o.Key && !o.Key.startsWith('thumb_'));

  console.log(`Objetos en MinIO (sin thumbnails): ${objetos.length}\n`);

  let recuperados = 0;
  let saltados    = 0;
  let errores     = 0;

  for (const obj of objetos) {
    const id = obj.Key!;
    process.stdout.write(`  Procesando ${id.substring(0, 8)}...`);

    // 3. Verificar si ya existe en la BD
    const existe = await pool.query('SELECT id FROM medios WHERE id = $1', [id]);
    if (existe.rows.length > 0) {
      console.log(' ya existe en BD, saltando');
      saltados++;
      continue;
    }

    try {
      // 4. Obtener metadatos (mimetype) de MinIO
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: id }));
      const mimetype = head.ContentType || 'application/octet-stream';
      const tamano   = head.ContentLength || 0;

      // 5. Descargar para calcular hash SHA-256
      const getRes = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: id }));
      const buffer = await streamToBuffer(getRes.Body as Readable);
      const hash   = crypto.createHash('sha256').update(buffer).digest('hex');

      // 6. Nombre original: usamos el ID con extensión inferida
      const nombreOriginal = `recuperado_${id}.${extraerExtension(mimetype)}`;
      const tipo           = detectarTipo(mimetype);

      // 7. Insertar en PostgreSQL
      await pool.query(`
        INSERT INTO medios (id, nombre_original, mimetype, tipo, tamano_bytes, hash, metadatos, creado_en, usuario_id)
        VALUES ($1, $2, $3, $4::tipo_media, $5, $6, '{}', NOW(), $7)
        ON CONFLICT (id) DO NOTHING
      `, [id, nombreOriginal, mimetype, tipo, tamano, hash, usuario.id]);

      console.log(` ✓ (${mimetype}, ${(tamano / 1024).toFixed(1)} KiB)`);
      recuperados++;
    } catch (err: any) {
      console.log(` ✗ ${err.message}`);
      errores++;
    }
  }

  console.log(`\n────────────────────────────────────`);
  console.log(`Recuperados: ${recuperados}`);
  console.log(`Ya existían: ${saltados}`);
  if (errores > 0) console.log(`Errores:     ${errores}`);

  await pool.end();
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
