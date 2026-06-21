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

    // 2. Verificamos integridad (Self-healing DESACTIVADO — solo loguea, no borra)
    // El borrado automático estaba eliminando registros válidos cuando MinIO
    // devolvía errores de credenciales o conectividad. Se reactivará cuando
    // se confirme que MinIO funciona correctamente.
    try {
      const existeFisicamente = await this.storageRepository.existeMedia(id);
      if (!existeFisicamente) {
        console.warn(`[Self-healing] Archivo ${id} no encontrado en MinIO (solo advertencia, no se borra).`);
      }
    } catch (checkError: any) {
      console.warn(`[Self-healing] Error verificando ${id} en MinIO:`, checkError.message);
    }

    return media;
  }
}