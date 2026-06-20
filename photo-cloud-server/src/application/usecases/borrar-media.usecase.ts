import { IMediaRepository } from '../ports/output/media-repository.interface';
import { IStorageRepository } from '../ports/output/storage-repository.interface';
import { IUsuarioRepository } from '../ports/output/usuario-repository.interface';

export class BorrarMediaUseCase {
  constructor(
    private readonly mediaRepository: IMediaRepository,
    private readonly storageRepository: IStorageRepository,
    private readonly usuarioRepository: IUsuarioRepository,
  ) {}

  async ejecutar(id: string, usuarioId: string): Promise<void> {
    const media = await this.mediaRepository.buscarPorId(id);
    if (!media) throw new Error(`No se puede borrar: El archivo con ID ${id} no existe.`);

    const tamanoBytes = media.tamanoBytes;

    try {
      await this.storageRepository.eliminarMedia(id);
      await this.storageRepository.eliminarMedia(`thumb_${id}`).catch(() => {});
    } catch {
      console.warn(`No se pudo borrar el archivo fisico ${id} en MinIO.`);
    }

    await this.mediaRepository.eliminar(id);

    // Liberar el espacio de la cuota del usuario
    await this.usuarioRepository.actualizarUso(usuarioId, -tamanoBytes);
  }
}
