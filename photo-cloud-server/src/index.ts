import express from 'express';
import multer from 'multer';
import cors from 'cors'; // 1. IMPORTA CORS
import { dbPool } from './infrastructure/adapters/output/database/postgres-pool';
import { PostgresMediaRepository } from './infrastructure/adapters/output/database/postgres-media.repository';
import { MinioStorageRepository } from './infrastructure/adapters/output/storage/minio-storage.repository';
import { SubirMediaUseCase } from './application/usecases/subir-media.usecase';
import { ConsultarMediaUseCase } from './application/usecases/consultar-media.usecase';
import { ObtenerMediaUseCase } from './application/usecases/obtener-media.usecase';
import { BorrarMediaUseCase } from './application/usecases/borrar-media.usecase';
import { ListarMediaUseCase } from './application/usecases/listar-media.usecase';
import { MediaController } from './infrastructure/adapters/input/http/media.controller';

const app = express();

// 2. CONFIGURA CORS (Permite que tu frontend acceda al backend)
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Inyección de Dependencias
const mediaRepository = new PostgresMediaRepository(dbPool);
const storageRepository = new MinioStorageRepository();

const subirMediaUseCase = new SubirMediaUseCase(mediaRepository, storageRepository);
const consultarMediaUseCase = new ConsultarMediaUseCase(mediaRepository, storageRepository);
const obtenerMediaUseCase = new ObtenerMediaUseCase(mediaRepository, storageRepository);
const borrarMediaUseCase = new BorrarMediaUseCase(mediaRepository, storageRepository);
const listarMediaUseCase = new ListarMediaUseCase(mediaRepository);

const mediaController = new MediaController(
  subirMediaUseCase, 
  consultarMediaUseCase, 
  obtenerMediaUseCase,
  borrarMediaUseCase,
  listarMediaUseCase
);

// 3. RUTAS (Ordenadas para evitar conflictos)
app.get('/api/media', (req, res) => mediaController.listar(req, res));
app.post('/api/media/upload', upload.single('archivo'), (req, res) => mediaController.subir(req, res));

// Las rutas con parámetros (:id) van al final para no interferir con las rutas estáticas
app.get('/api/media/:id/download', (req, res) => mediaController.descargar(req, res));
app.get('/api/media/:id', (req, res) => mediaController.consultar(req, res));
app.delete('/api/media/:id', (req, res) => mediaController.borrar(req, res));

// 🚀 Inicialización
app.listen(3000, async () => {
  try {
    await dbPool.query('SELECT 1');
    console.log('✓ Servidor API corriendo en http://localhost:3000');
  } catch (error) {
    console.error('❌ Error al conectar con la base de datos:', (error as Error).message);
    process.exit(1);
  }
});