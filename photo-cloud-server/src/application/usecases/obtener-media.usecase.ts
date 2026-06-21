import { IMediaRepository } from '../ports/output/media-repository.interface';
import { IStorageRepository } from '../ports/output/storage-repository.interface';
import sharp from 'sharp';
import { ExifTool } from 'exiftool-vendored';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

export interface MediaDescargaDTO {
  nombreOriginal: string;
  mimetype: string;
  buffer: Buffer;
  fechaOriginal: Date;
}

export class ObtenerMediaUseCase {
  constructor(
    private readonly mediaRepository: IMediaRepository,
    private readonly storageRepository: IStorageRepository
  ) {}

  async ejecutar(id: string): Promise<MediaDescargaDTO> {
    // 1. Obtener metadatos desde Postgres
    const metadatosMedia = await this.mediaRepository.buscarPorId(id);
    if (!metadatosMedia) {
      throw new Error(`El archivo con ID ${id} no existe en la base de datos.`);
    }

    // 2. Verificar consistencia física en MinIO (self-healing desactivado — solo loguea)
    try {
      const existeFisicamente = await this.storageRepository.existeMedia(id);
      if (!existeFisicamente) {
        console.warn(`[Self-healing] Archivo ${id} no encontrado en MinIO (solo advertencia).`);
      }
    } catch (checkError: any) {
      console.warn(`[Self-healing] Error verificando ${id}:`, checkError.message);
    }

    // 3. Descargar bytes desde MinIO
    const bufferArchivo = await this.storageRepository.obtenerMedia(id);
    const formatoOriginal = metadatosMedia.mimetype;

    // 4. 🛡️ PIPELINE DE INYECCIÓN DE METADATOS HISTÓRICOS
    // Intenta inyectar fecha de captura original manteniendo integridad del formato
    try {
      const resultado = await this.inyectarMetadatos(bufferArchivo, formatoOriginal, metadatosMedia.creadoEn, id);
      return {
        nombreOriginal: metadatosMedia.nombreOriginal,
        mimetype: resultado.mimetype,
        buffer: resultado.buffer,
        fechaOriginal: metadatosMedia.creadoEn
      };
    } catch (error) {
      // Resiliencia: Si la inyección falla, devolver el archivo original sin modificar
      console.warn(`⚠️ Error inyectando metadatos para ${id}. Devolviendo buffer original:`, (error as Error).message);
      return {
        nombreOriginal: metadatosMedia.nombreOriginal,
        mimetype: formatoOriginal,
        buffer: bufferArchivo,
        fechaOriginal: metadatosMedia.creadoEn
      };
    }
  }

  /**
   * Inyecta metadatos de fecha original en el buffer manteniendo formato
   * Redundancia: EXIF, XMP, IPTC para máxima compatibilidad
   */
  private async inyectarMetadatos(
    bufferOriginal: Buffer,
    mimeType: string,
    fechaOriginal: Date,
    id: string
  ): Promise<{ buffer: Buffer; mimetype: string }> {
    const exiftool = new ExifTool();
    let tmpPath: string | null = null;

    try {
      // Determinar formato de salida
      let formatoSalida = mimeType;
      let bufferProcesado = bufferOriginal;

      // Preparar tags redundantes para máxima compatibilidad
      const exifDate = this.formatExifDate(fechaOriginal);
      const isoDate = fechaOriginal.toISOString();

      const tags: any = {
        // EXIF standard (compatible JPEG)
        DateTimeOriginal: exifDate,
        CreateDate: exifDate,
        ModifyDate: exifDate,
        // XMP (compatible PNG, JPEG, HEIC, etc.)
        'XMP:CreateDate': isoDate,
        'XMP:DateCreated': isoDate,
        'XMP:MetadataDate': isoDate,
        // IPTC (compatible JPEG)
        'IPTC:DateCreated': isoDate
      };

      // Obtener extensión
      const ext = this.obtenerExtension(mimeType);
      tmpPath = path.join(os.tmpdir(), `media-exif-${crypto.randomUUID()}.${ext}`);

      // Escribir buffer temporal
      await fs.writeFile(tmpPath, bufferProcesado);

      // Intentar escribir tags
      await exiftool.write(tmpPath, tags);

      // Leer buffer modificado
      bufferProcesado = await fs.readFile(tmpPath);

      // Validación: verificar que los metadatos se escribieron
      const validation = await exiftool.read(tmpPath);
      console.info(`✓ Metadatos inyectados para ${id}:`, {
        DateTimeOriginal: validation.DateTimeOriginal,
        'XMP:CreateDate': validation['XMP:CreateDate'],
        'IPTC:DateCreated': validation['IPTC:DateCreated']
      });

      return {
        buffer: bufferProcesado,
        mimetype: formatoSalida
      };
    } finally {
      // Limpiar archivo temporal
      if (tmpPath) {
        try {
          await fs.unlink(tmpPath);
        } catch {
          /* no-op */
        }
      }

      // Cerrar exiftool
      try {
        await exiftool.end();
      } catch {
        /* no-op */
      }
    }
  }

  /**
   * Formatea fecha en formato EXIF (YYYY:MM:DD HH:MM:SS)
   */
  private formatExifDate(d: Date): string {
    const YYYY = d.getFullYear().toString().padStart(4, '0');
    const MM = (d.getMonth() + 1).toString().padStart(2, '0');
    const DD = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    return `${YYYY}:${MM}:${DD} ${hh}:${mm}:${ss}`;
  }

  /**
   * Obtiene extensión de archivo según MIME type
   */
  private obtenerExtension(mimetype: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'video/x-matroska': 'mkv',
    };
    return mimeToExt[mimetype] || 'bin';
  }
}