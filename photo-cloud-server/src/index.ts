import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cors from 'cors';

// Infraestructura
import { dbPool } from './infrastructure/adapters/output/database/postgres-pool';
import { PostgresMediaRepository } from './infrastructure/adapters/output/database/postgres-media.repository';
import { PostgresUsuarioRepository } from './infrastructure/adapters/output/database/postgres-usuario.repository';
import { MinioStorageRepository } from './infrastructure/adapters/output/storage/minio-storage.repository';

// Casos de uso - Media
import { SubirMediaUseCase } from './application/usecases/subir-media.usecase';
import { ConsultarMediaUseCase } from './application/usecases/consultar-media.usecase';
import { ObtenerMediaUseCase } from './application/usecases/obtener-media.usecase';
import { BorrarMediaUseCase } from './application/usecases/borrar-media.usecase';
import { ListarMediaUseCase } from './application/usecases/listar-media.usecase';

// Casos de uso - Auth
import { RegistrarUsuarioUseCase } from './application/usecases/registrar-usuario.usecase';
import { LoginUsuarioUseCase } from './application/usecases/login-usuario.usecase';

// Controladores y middleware
import { MediaController } from './infrastructure/adapters/input/http/media.controller';
import { AuthController } from './infrastructure/adapters/input/http/auth.controller';
import { authMiddleware } from './infrastructure/adapters/input/http/auth.middleware';

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// ── Inyeccion de dependencias ────────────────────────────────────────────────

const mediaRepository   = new PostgresMediaRepository(dbPool);
const usuarioRepository = new PostgresUsuarioRepository(dbPool);
const storageRepository = new MinioStorageRepository();

const subirMediaUseCase    = new SubirMediaUseCase(mediaRepository, storageRepository);
const consultarMediaUseCase = new ConsultarMediaUseCase(mediaRepository, storageRepository);
const obtenerMediaUseCase  = new ObtenerMediaUseCase(mediaRepository, storageRepository);
const borrarMediaUseCase   = new BorrarMediaUseCase(mediaRepository, storageRepository);
const listarMediaUseCase   = new ListarMediaUseCase(mediaRepository);

const registrarUseCase = new RegistrarUsuarioUseCase(usuarioRepository);
const loginUseCase     = new LoginUsuarioUseCase(usuarioRepository);

const mediaController = new MediaController(
  subirMediaUseCase,
  consultarMediaUseCase,
  obtenerMediaUseCase,
  borrarMediaUseCase,
  listarMediaUseCase,
  storageRepository,
);

const authController = new AuthController(registrarUseCase, loginUseCase);

// ── Rutas publicas (sin autenticacion) ──────────────────────────────────────
app.post('/api/auth/register', (req, res) => authController.register(req, res));
app.post('/api/auth/login',    (req, res) => authController.login(req, res));

// ── Rutas protegidas (requieren JWT valido) ──────────────────────────────────
app.use('/api/media', authMiddleware);

app.get('/api/media',               (req, res) => mediaController.listar(req, res));
app.post('/api/media/upload', upload.single('archivo'), (req, res) => mediaController.subir(req, res));
app.get('/api/media/thumb/:id',     (req, res) => mediaController.thumbnail(req, res));
app.get('/api/media/:id/download',  (req, res) => mediaController.descargar(req, res));
app.get('/api/media/:id',           (req, res) => mediaController.consultar(req, res));
app.delete('/api/media/:id',        (req, res) => mediaController.borrar(req, res));

// ── Arranque ─────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, async () => {
  try {
    await dbPool.query('SELECT 1');
    console.log(`Servidor API corriendo en http://localhost:${PORT}`);
    console.log('Rutas publicas:   POST /api/auth/register | POST /api/auth/login');
    console.log('Rutas protegidas: /api/media/* (requieren Bearer token)');
  } catch (error) {
    console.error('Error al conectar con la base de datos:', (error as Error).message);
    process.exit(1);
  }
});
