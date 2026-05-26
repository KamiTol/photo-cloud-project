import { PostgresMediaRepository } from '../../infrastructure/adapters/output/database/postgres-media.repository';
import { MinioStorageRepository } from '../../infrastructure/adapters/output/storage/minio-storage.repository';

export class ConsultarMediaUseCase {
  constructor(
    private readonly mediaRepository: PostgresMediaRepository,
    private readonly storageRepository: MinioStorageRepository
  ) {}

  async ejecutar(id: string) {
    // 1. Buscamos en BD
    const media = await this.mediaRepository.buscarPorId(id);
    if (!media) {
      throw new Error(`Archivo con ID ${id} no encontrado en la base de datos.`);
    }

    // 2. Verificamos integridad (Self-healing)
    const existeFisicamente = await this.storageRepository.existeMedia(id);
    if (!existeFisicamente) {
      console.warn(`Inconsistencia: Archivo ${id} existe en BD pero no en MinIO. Autocorrigiendo...`);
      await this.mediaRepository.eliminar(id);
      throw new Error(`El archivo ${id} no estaba disponible en el almacenamiento y ha sido eliminado del sistema.`);
    }

    return media;
  }
}