import { IMediaRepository } from '../ports/output/media-repository.interface';
import { IStorageRepository } from '../ports/output/storage-repository.interface';

export interface MediaDescargaDTO {
  nombreOriginal: string;
  mimetype: string;
  buffer: Buffer;
  fechaOriginal: Date; // 📅 Nueva propiedad para transportar el tiempo real de Postgres
}

export class ObtenerMediaUseCase {
  constructor(
    private readonly mediaRepository: IMediaRepository,
    private readonly storageRepository: IStorageRepository
  ) {}

  async ejecutar(id: string): Promise<MediaDescargaDTO> {
    // 1. Ir a Postgres por los metadatos reales (Saber cómo se llamaba la foto y su fecha)
    const metadatosMedia = await this.mediaRepository.buscarPorId(id);
    if (!metadatosMedia) {
      throw new Error(`El archivo con ID ${id} no existe en la base de datos.`);
    }

    // 2. Verificar consistencia física en MinIO
    const existeFisicamente = await this.storageRepository.existeMedia(id);
    if (!existeFisicamente) {
      throw new Error(`Inconsistencia: Los metadatos existen pero el archivo físico fue borrado de MinIO.`);
    }

    // 3. Descargar los bytes desde la nube de objetos
    const bufferArchivo = await this.storageRepository.obtenerMedia(id);

    // 4. Retornar el paquete listo para el cliente con la verdad histórica
    return {
      nombreOriginal: metadatosMedia.nombreOriginal,
      mimetype: metadatosMedia.mimetype,
      buffer: bufferArchivo,
      fechaOriginal: metadatosMedia.creadoEn // 👈 Mapeamos el campo timestamp de la BD
    };
  }
}