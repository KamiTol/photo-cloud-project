import { Pool } from 'pg';

// Configuramos el Pool de conexiones apuntando al Postgres real de su Docker
export const dbPool = new Pool({
  user: 'admin_fotos',
  password: 'SuperPasswordSeguro123',
  host: 'localhost',
  database: 'photo_cloud_db', // La base de datos que leímos en su compose
  port: 5432,
  max: 20, // Máximo de conexiones simultáneas
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

dbPool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err);
});