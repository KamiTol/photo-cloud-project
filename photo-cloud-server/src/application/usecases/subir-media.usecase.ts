import { Media, MetadatosMedia, TipoMedia } from '../../domain/models/media';
import { IMediaRepository } from '../ports/output/media-repository.interface';
import { IStorageRepository } from '../ports/output/storage-repository.interface';
import crypto from 'crypto';
import sharp from 'sharp';

export interface SubirMediaDTO {
  nombreOriginal: string;
  mimetype: string;
  buffer: Buffer;
  metadatosExtraidos?: MetadatosMedia;
  fechaOriginal?: Date;
}

export class SubirMediaUseCase {
  constructor(
    private readonly mediaRepository: IMediaRepository,
    private readonly storageRepository: IStorageRepository
  ) {}

  async ejecutar(dto: SubirMediaDTO): Promise<Media> {
    console.info('DEBUG SubirMediaUseCase: fechaOriginal DTO:', dto.fechaOriginal);
    console.info('DEBUG SubirMediaUseCase: metadatosExtraidos:', dto.metadatosExtraidos);
    const hash = crypto.createHash('sha256').update(dto.buffer).digest('hex');

    // 1. Buscar si el hash ya existe
    const mediaExistente = await this.mediaRepository.buscarPorHash(hash);
    
    if (mediaExistente) {
      const existeFisicamente = await this.storageRepository.existeMedia(mediaExistente.id);

      if (existeFisicamente) {
        throw new Error(`Integridad: El archivo ya existe completamente en el sistema (ID: ${mediaExistente.id}).`);
      } else {
        console.log(`⚠️ Descalce detectado para [${dto.nombreOriginal}]. Limpiando registro huérfano...`);
        await this.mediaRepository.eliminar(mediaExistente.id);
      }
    }

    // 2. Preparar entidad
    let tipo: TipoMedia = TipoMedia.IMAGEN;
    if (dto.mimetype.startsWith('video/')) {
      tipo = TipoMedia.VIDEO;
    }

    const id = crypto.randomUUID();
    const tamanoBytes = dto.buffer.length;
    const creadoEn = dto.fechaOriginal instanceof Date ? dto.fechaOriginal : new Date();

    const nuevaMedia = new Media(
      id,
      dto.nombreOriginal,
      dto.mimetype,
      tipo,
      tamanoBytes,
      hash,
      dto.metadatosExtraidos ?? {},
      creadoEn
    );

    // 3. Guardar archivo original en MinIO (Primero el original)
    await this.storageRepository.guardarMedia(id, dto.buffer, dto.mimetype);

    // 4. Generación de Thumbnail (Segura: no bloquea si falla)
    if (tipo === TipoMedia.IMAGEN) {
      try {
        const thumbnailBuffer = await sharp(dto.buffer)
          .resize(200)
          .toBuffer();
        await this.storageRepository.guardarMedia(`thumb_${id}`, thumbnailBuffer, dto.mimetype);
      } catch (thumbError) {
        console.error(`⚠️ Error al generar thumbnail para ${id}:`, thumbError);
      }
    }

    // 5. Persistir en base de datos
    try {
      await this.mediaRepository.guardar(nuevaMedia);
    } catch (error) {
      // Rollback si la DB falla
      await this.storageRepository.eliminarMedia(id);
      await this.storageRepository.eliminarMedia(`thumb_${id}`).catch(() => {});
      throw new Error(`Falla en persistencia de metadatos: ${(error as Error).message}`);
    }

    return nuevaMedia;
  }
}