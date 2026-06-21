import { IMediaRepository } from '../ports/output/media-repository.interface';
import { IStorageRepository } from '../ports/output/storage-repository.interface';
import { IUsuarioRepository } from '../ports/output/usuario-repository.interface';
import { IPermisosRepository } from '../ports/output/permisos-repository.interface';

export class BorrarMediaUseCase {
  constructor(
    private readonly mediaRepository: IMediaRepository,
    private readonly storageRepository: IStorageRepository,
    private readonly usuarioRepository: IUsuarioRepository,
    private readonly permisosRepository: IPermisosRepository,
  ) {}

  async ejecutar(id: string, usuarioId: string): Promise<void> {
    const media = await this.mediaRepository.buscarPorId(id);
    if (!media) throw new Error('No se puede borrar: El archivo con ID ' + id + ' no existe.');

    const esPropietario = await this.mediaRepository.verificarPropietario(id, usuarioId);
    let propietarioId = usuarioId;

    if (!esPropietario) {
      // Verificar si tiene permiso de escritura
      const permiso = await this.permisosRepository.buscarPermiso(id, usuarioId);
      if (!permiso || !permiso.puedeEscribir) {
        throw new Error('No tienes permiso para eliminar este archivo.');
      }
      // Usar el ID del propietario real para actualizar su cuota
      propietarioId = await this.mediaRepository.buscarPropietarioId(id) ?? usuarioId;
    }

    const tamanoBytes = media.tamanoBytes;

    try {
      await this.storageRepository.eliminarMedia(id);
      await this.storageRepository.eliminarMedia('thumb_' + id).catch(() => {});
    } catch {
      console.warn('No se pudo borrar el archivo fisico ' + id + ' en MinIO.');
    }

    await this.mediaRepository.eliminar(id);
    await this.usuarioRepository.actualizarUso(propietarioId, -tamanoBytes);
  }
}
