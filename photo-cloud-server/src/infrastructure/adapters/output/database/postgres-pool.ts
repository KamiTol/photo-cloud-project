import { Pool } from 'pg';
import '../../../../env';

// Pool de conexiones usando variables de entorno (sin credenciales hardcodeadas)
export const dbPool = new Pool({
  user:     process.env.DB_USER     || 'admin_fotos',
  password: process.env.DB_PASSWORD || '',
  host:     process.env.DB_HOST     || 'localhost',
  database: process.env.DB_NAME     || 'photo_cloud_db',
  port:     Number(process.env.DB_PORT) || 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

dbPool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err);
});
