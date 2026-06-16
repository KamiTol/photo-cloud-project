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

// Casos de uso - Permisos
import { CompartirArchivoUseCase } from './application/usecases/compartir-archivo.usecase';

// Controladores y middleware
import { MediaController } from './infrastructure/adapters/input/http/media.controller';
import { AuthController } from './infrastructure/adapters/input/http/auth.controller';
import { PermisosController } from './infrastructure/adapters/input/http/permisos.controller';
import { authMiddleware, RequestConUsuario } from './infrastructure/adapters/input/http/auth.middleware';

// Repositorio de permisos
import { PostgresPermisosRepository } from './infrastructure/adapters/output/database/postgres-permisos.repository';

// 🎥 Módulo de Streaming
import { ListarVideosUseCase } from './application/usecases/listar-videos.usecase';
import { StreamVideoUseCase } from './application/usecases/stream-video.usecase';
import { StreamingController } from './infrastructure/adapters/input/http/streaming.controller';

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// ── Inyeccion de dependencias ─────────────────────────────────────────────────

const mediaRepository    = new PostgresMediaRepository(dbPool);
const usuarioRepository  = new PostgresUsuarioRepository(dbPool);
const storageRepository  = new MinioStorageRepository();
const permisosRepository = new PostgresPermisosRepository(dbPool);

const subirMediaUseCase     = new SubirMediaUseCase(mediaRepository, storageRepository, usuarioRepository);
const consultarMediaUseCase = new ConsultarMediaUseCase(mediaRepository, storageRepository);
const obtenerMediaUseCase   = new ObtenerMediaUseCase(mediaRepository, storageRepository);
const borrarMediaUseCase    = new BorrarMediaUseCase(mediaRepository, storageRepository, usuarioRepository);
const listarMediaUseCase    = new ListarMediaUseCase(mediaRepository, permisosRepository);
const compartirUseCase      = new CompartirArchivoUseCase(mediaRepository, usuarioRepository, permisosRepository);

const registrarUseCase = new RegistrarUsuarioUseCase(usuarioRepository);
const loginUseCase     = new LoginUsuarioUseCase(usuarioRepository);

const mediaController    = new MediaController(
  subirMediaUseCase,
  consultarMediaUseCase,
  obtenerMediaUseCase,
  borrarMediaUseCase,
  listarMediaUseCase,
  storageRepository,
);
const authController     = new AuthController(registrarUseCase, loginUseCase);
const permisosController = new PermisosController(compartirUseCase);

// 🎥 Módulo de Streaming — inyeccion de dependencias
const listarVideosUseCase = new ListarVideosUseCase(mediaRepository);
const streamVideoUseCase  = new StreamVideoUseCase(mediaRepository, storageRepository);
const streamingController = new StreamingController(listarVideosUseCase, streamVideoUseCase);

// ── Rutas publicas ────────────────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => authController.register(req, res));
app.post('/api/auth/login',    (req, res) => authController.login(req, res));

// ── Rutas protegidas ──────────────────────────────────────────────────────────
app.use('/api/media',    authMiddleware);
app.use('/api/usuarios', authMiddleware);

app.get('/api/media',              (req, res) => mediaController.listar(req, res));
app.post('/api/media/upload', upload.single('archivo'), (req, res) => mediaController.subir(req, res));
app.get('/api/media/thumb/:id',    (req, res) => mediaController.thumbnail(req, res));
app.get('/api/media/:id/download', (req, res) => mediaController.descargar(req, res));
app.get('/api/media/:id',          (req, res) => mediaController.consultar(req, res));
app.delete('/api/media/:id',       (req, res) => mediaController.borrar(req, res));

// Permisos Unix: compartir / revocar / listar
app.post('/api/media/:id/compartir',                (req, res) => permisosController.compartir(req as any, res));
app.delete('/api/media/:id/compartir/:usuarioId',   (req, res) => permisosController.revocar(req as any, res));
app.get('/api/media/:id/compartidos',               (req, res) => permisosController.listar(req as any, res));

// Perfil y cuota del usuario autenticado
app.get('/api/usuarios/me', async (req: RequestConUsuario, res) => {
  try {
    const cuota = await usuarioRepository.obtenerCuota(req.usuario!.id);
    res.json({ ...req.usuario, cuota });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 🎥 Módulo de Streaming — rutas (publicas, fuera de authMiddleware)
app.get('/api/streaming',          (req, res) => streamingController.listar(req, res));
app.get('/api/streaming/:id/info', (req, res) => streamingController.info(req, res));
app.get('/api/streaming/:id',      (req, res) => streamingController.stream(req, res));

// ── Arranque ──────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, async () => {
  try {
    await dbPool.query('SELECT 1');
    console.log(`Servidor API corriendo en http://localhost:${PORT}`);
    console.log('Rutas publicas:   POST /api/auth/register | POST /api/auth/login');
    console.log('Rutas protegidas: /api/media/* | GET /api/usuarios/me');
  } catch (error) {
    console.error('Error al conectar con la base de datos:', (error as Error).message);
    process.exit(1);
  }
});
