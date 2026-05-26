import { PostgresMediaRepository } from '../../infrastructure/adapters/output/database/postgres-media.repository';
import { MinioStorageRepository } from '../../infrastructure/adapters/output/storage/minio-storage.repository';

export class BorrarMediaUseCase {
  constructor(
    private readonly mediaRepository: PostgresMediaRepository,
    private readonly storageRepository: MinioStorageRepository
  ) {}

  async ejecutar(id: string): Promise<void> {
    // 1. Verificamos que el registro exista en la BD
    const media = await this.mediaRepository.buscarPorId(id);
    if (!media) {
      throw new Error(`No se puede borrar: El archivo con ID ${id} no existe.`);
    }

    // 2. Intentamos borrar del storage. 
    // Si el archivo ya no existe en MinIO, no queremos que eso impida borrar el registro en BD.
    try {
      await this.storageRepository.eliminarMedia(id);
    } catch (error) {
      console.warn(`Advertencia: No se pudo borrar el archivo físico ${id} en MinIO. Continuando con la limpieza de la base de datos.`);
    }

    // 3. Borramos el registro en Postgres, independientemente de si el archivo existía o no
    await this.mediaRepository.eliminar(id);
  }
}