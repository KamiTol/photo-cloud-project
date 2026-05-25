import { Media, MetadatosMedia, TipoMedia } from '../../domain/models/media';
import { IMediaRepository } from '../ports/output/media-repository.interface';
import { IStorageRepository } from '../ports/output/storage-repository.interface';
import crypto from 'crypto';

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
    const hash = crypto.createHash('sha256').update(dto.buffer).digest('hex');

    // 1. Buscar si el hash ya existe en la base de datos
    const mediaExistente = await this.mediaRepository.buscarPorHash(hash);
    
    if (mediaExistente) {
      // 🛠️ VERIFICACIÓN DE INTEGRIDAD CRUZADA
      const existeFisicamente = await this.storageRepository.existeMedia(mediaExistente.id);

      if (existeFisicamente) {
        // Si existe en ambos lados, es un duplicado real. Lo bloqueamos.
        throw new Error(`Integridad: El archivo ya existe completamente en el sistema (ID: ${mediaExistente.id}).`);
      } else {
        // 🚨 DESCALCE DETECTADO: Está en la BD pero alguien lo borró de MinIO.
        console.log(`⚠️ Descalce detectado para [${dto.nombreOriginal}]. Limpiando registro huérfano de la BD...`);
        await this.mediaRepository.eliminar(mediaExistente.id);
        // Continuamos el flujo para que se vuelva a crear correctamente en ambos lados
      }
    }

    // Código de subida estándar (se ejecuta si el archivo es nuevo o si reparamos el descalce)
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

    // Guardar en MinIO primero
    await this.storageRepository.guardarMedia(id, dto.buffer, dto.mimetype);

    try {
      // Guardar en Postgres
      await this.mediaRepository.guardar(nuevaMedia);
    } catch (error) {
      // Rollback si la base de datos falla
      await this.storageRepository.eliminarMedia(id);
      throw new Error(`Falla en persistencia de metadatos: ${(error as Error).message}`);
    }

    return nuevaMedia;
  }
}