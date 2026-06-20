import { IMediaRepository } from '../ports/output/media-repository.interface';
import { IUsuarioRepository } from '../ports/output/usuario-repository.interface';
import { IPermisosRepository } from '../ports/output/permisos-repository.interface';

export class CompartirArchivoUseCase {
  constructor(
    private readonly mediaRepository: IMediaRepository,
    private readonly usuarioRepository: IUsuarioRepository,
    private readonly permisosRepository: IPermisosRepository,
  ) {}

  async compartir(
    archivoId: string,
    propietarioId: string,
    emailDestinatario: string,
    permisos: { leer: boolean; escribir: boolean; ejecutar: boolean },
  ) {
    // Verificar que el archivo existe y pertenece al propietario
    const archivo = await this.mediaRepository.buscarPorId(archivoId);
    if (!archivo) throw new Error('Archivo no encontrado.');

    const archivosDelPropietario = await this.mediaRepository.listarPorUsuario(propietarioId);
    const esDelPropietario = archivosDelPropietario.some(a => a.id === archivoId);
    if (!esDelPropietario) throw new Error('No tienes permiso para compartir este archivo.');

    // Buscar al destinatario por email
    const destinatario = await this.usuarioRepository.buscarPorEmail(emailDestinatario);
    if (!destinatario) throw new Error(`No existe un usuario con email ${emailDestinatario}.`);

    if (destinatario.id === propietarioId) throw new Error('No puedes compartir un archivo contigo mismo.');

    return this.permisosRepository.compartir(archivoId, propietarioId, destinatario.id, permisos);
  }

  async revocar(archivoId: string, propietarioId: string, destinatarioId: string) {
    const archivosDelPropietario = await this.mediaRepository.listarPorUsuario(propietarioId);
    const esDelPropietario = archivosDelPropietario.some(a => a.id === archivoId);
    if (!esDelPropietario) throw new Error('No tienes permiso para modificar este archivo.');

    await this.permisosRepository.revocar(archivoId, destinatarioId);
  }

  async listarPermisos(archivoId: string, propietarioId: string) {
    const archivosDelPropietario = await this.mediaRepository.listarPorUsuario(propietarioId);
    const esDelPropietario = archivosDelPropietario.some(a => a.id === archivoId);
    if (!esDelPropietario) throw new Error('No tienes permiso para ver los permisos de este archivo.');

    return this.permisosRepository.listarPorArchivo(archivoId);
  }
}
