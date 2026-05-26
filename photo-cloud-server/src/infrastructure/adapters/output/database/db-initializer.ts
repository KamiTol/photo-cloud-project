import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';

/**
 * Inicializa la base de datos ejecutando scripts SQL
 * Se ejecuta automáticamente al iniciar la aplicación
 */
export async function inicializarBaseDatos(dbPool: Pool): Promise<void> {
  try {
    console.log('🔧 Inicializando esquema de base de datos...');

    // Leer script SQL de inicialización
    // __dirname = src/infrastructure/adapters/output/database
    // Necesitamos: ../../../../database/01-init-schema.sql
    const scriptPath = path.join(__dirname, '../../../../database/01-init-schema.sql');
    const script = await fs.readFile(scriptPath, 'utf-8');

    // Ejecutar script
    await dbPool.query(script);

    console.log('✓ Esquema de base de datos inicializado correctamente');

    // Verificar que la tabla existe
    const resultado = await dbPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'medios'
      );
    `);

    if (resultado.rows[0].exists) {
      console.log('✓ Tabla "medios" verificada');
    } else {
      throw new Error('La tabla "medios" no fue creada');
    }

    // Verificar que el bucket de MinIO existe (opcional)
    console.log('✓ Base de datos lista para operaciones');
  } catch (error) {
    console.error(
      '❌ Error inicializando base de datos:',
      (error as Error).message
    );
    throw error;
  }
}
