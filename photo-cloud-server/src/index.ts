import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import ExifParser from 'exif-parser';
import { dbPool } from './infrastructure/adapters/output/database/postgres-pool';
import { PostgresMediaRepository } from './infrastructure/adapters/output/database/postgres-media.repository';
import { MinioStorageRepository } from './infrastructure/adapters/output/storage/minio-storage.repository';
import { SubirMediaUseCase } from './application/usecases/subir-media.usecase';
import { ObtenerMediaUseCase } from './application/usecases/obtener-media.usecase'; // 👈 Importamos el nuevo caso de uso

async function cicloCompletoMedias() {
  console.log('🚀 --- INICIANDO LABORATORIO: INGESTA Y DESCARGA --- 🚀\n');

  const mediaRepository = new PostgresMediaRepository(dbPool);
  const storageRepository = new MinioStorageRepository();
  
  const casoSubir = new SubirMediaUseCase(mediaRepository, storageRepository);
  const casoDescargar = new ObtenerMediaUseCase(mediaRepository, storageRepository);

  const rutaAssets = path.join(__dirname, 'test', 'assets');
  const rutaDescargas = path.join(__dirname, 'test', 'descargas');

  // Asegurar que exista la carpeta de descargas local para la prueba
  if (!fs.existsSync(rutaDescargas)) {
    fs.mkdirSync(rutaDescargas, { recursive: true });
  }

  try {
    const archivos = fs.readdirSync(rutaAssets);
    if (archivos.length === 0) {
      console.warn('⚠️ La carpeta assets está vacía.');
      await dbPool.end();
      return;
    }

    let ultimoIdRegistrado = '';

    // --- BLOQUE 1: INGESTA AUTOMÁTICA ---
    for (const nombreArchivo of archivos) {
      const rutaCompleta = path.join(rutaAssets, nombreArchivo);
      if (fs.statSync(rutaCompleta).isDirectory()) continue;

      const bufferArchivo = fs.readFileSync(rutaCompleta);
      const mimetypeDetectado = mime.lookup(rutaCompleta) || 'application/octet-stream';
      const estadisticasFisicas = fs.statSync(rutaCompleta);
      let fechaFinalOrigen = estadisticasFisicas.mtime;
      let metadatosInyectados: any = {};

      if (mimetypeDetectado === 'image/jpeg' || mimetypeDetectado === 'image/jpg') {
        try {
          const parser = ExifParser.create(bufferArchivo);
          const resultadoExif = parser.parse();
          if (resultadoExif.tags.CreateDate) {
            fechaFinalOrigen = new Date(resultadoExif.tags.CreateDate * 1000);
          }
        } catch (e) {}
      }

      try {
        const mediaProcesada = await casoSubir.ejecutar({
          nombreOriginal: nombreArchivo,
          mimetype: mimetypeDetectado,
          buffer: bufferArchivo,
          fechaOriginal: fechaFinalOrigen,
          metadatosExtraidos: metadatosInyectados
        });
        console.log(`✅ Registrado: ${nombreArchivo} (ID: ${mediaProcesada.id})`);
        ultimoIdRegistrado = mediaProcesada.id; // Guardamos el último ID para probar la descarga
      } catch (error: any) {
        // Si ya existe por integridad, intentamos recuperar su ID desde Postgres para la prueba de descarga
        console.log(`ℹ️ ${error.message}`);
        const hash = require('crypto').createHash('sha256').update(bufferArchivo).digest('hex');
        const existente = await mediaRepository.buscarPorHash(hash);
        if (existente) ultimoIdRegistrado = existente.id;
      }
    }

// --- BLOQUE 2: PRUEBA DE DESCARGA DESDE MINIO ---
    if (ultimoIdRegistrado) {
      console.log(`\n📡 --- SIMULANDO DESCARGA DEL ID: ${ultimoIdRegistrado} ---`);
      
      // 1. Ejecutamos la lógica limpia del caso de uso
      const archivoDescargado = await casoDescargar.ejecutar(ultimoIdRegistrado);

      // 2. Reconstruimos el archivo físico en la carpeta de descargas
      const rutaDestinoFinal = path.join(rutaDescargas, `descargado_${archivoDescargado.nombreOriginal}`);
      fs.writeFileSync(rutaDestinoFinal, archivoDescargado.buffer);

      // 🛠️ 3. LA MAGIA: Forzar a Windows a aplicar las fechas históricas guardadas en Postgres
      // utimesSync requiere: (ruta, fecha_ultimo_acceso, fecha_ultima_modificacion)
      const fechaHistorica = archivoDescargado.fechaOriginal;
      fs.utimesSync(rutaDestinoFinal, new Date(), fechaHistorica);

      console.log(`📥 ¡ARCHIVO DESCARGADO CON ÉXITO DESDE MINIO!`);
      console.log(`   - Nombre restaurado: ${archivoDescargado.nombreOriginal}`);
      console.log(`   - Formato MIME:      ${archivoDescargado.mimetype}`);
      console.log(`   - Fecha Restaurada:  ${fechaHistorica.toLocaleString()}`);
      console.log(`   - Guardado local en:  ${rutaDestinoFinal}\n`);
    }

  } catch (error: any) {
    console.error(`❌ Error crítico en el laboratorio: ${error.message}`);
  } {
    await dbPool.end();
    console.log('🎉 Laboratorio cerrado.');
  }
}

cicloCompletoMedias();