import { ExifTool } from 'exiftool-vendored';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { MetadatosMedia, MetadatosImagen, MetadatosVideo } from '../../../domain/models/media';

/**
 * Utilidad para extraer metadatos EXIF/IPTC/XMP de archivos multimedia
 * Preserva la integridad histórica extrayendo la fecha de captura original
 */
export class ExifExtractor {
  private exiftool: ExifTool;

  constructor() {
    this.exiftool = new ExifTool();
  }

  /**
   * Extrae metadatos de un buffer de imagen/video
   * @param buffer - Contenido binario del archivo
   * @param mimetype - Tipo MIME del archivo
   * @returns Metadatos extraídos o vacío si hay error
   */
  async extraerMetadatos(buffer: Buffer, mimetype: string): Promise<MetadatosMedia> {
    let tmpFilePath: string | null = null;

    try {
      // Determinar extensión según mimetype
      const ext = this.obtenerExtension(mimetype);
      tmpFilePath = path.join(os.tmpdir(), `exif-extract-${crypto.randomUUID()}.${ext}`);

      // Escribir buffer a archivo temporal
      await fs.writeFile(tmpFilePath, buffer);

      // Leer metadatos
      const exifData = await this.exiftool.read(tmpFilePath);
      // DEBUG: mostrar campos relevantes devueltos por ExifTool
      try {
        console.info('DEBUG ExifExtractor.extraerMetadatos: campos relevantes:', {
          DateTimeOriginal: exifData.DateTimeOriginal,
          CreateDate: exifData.CreateDate,
          "XMP:CreateDate": exifData['XMP:CreateDate'],
          FileModifyDate: exifData.FileModifyDate,
          ImageWidth: exifData.ImageWidth,
          ImageHeight: exifData.ImageHeight,
        });
      } catch {
        /* no-op */
      }

      // Parsear según tipo de archivo
      if (mimetype.startsWith('image/')) {
        return this.parsearImagenMetadatos(exifData);
      } else if (mimetype.startsWith('video/')) {
        return this.parsearVideoMetadatos(exifData);
      }

      return {};
    } catch (error) {
      console.warn(`⚠️ Error extrayendo EXIF: ${(error as Error).message}`);
      return {}; // Retornar vacío si falla, no bloquear
    } finally {
      // Limpiar archivo temporal
      if (tmpFilePath) {
        try {
          await fs.unlink(tmpFilePath);
        } catch {
          /* no-op */
        }
      }
    }
  }

  /**
   * Extrae la fecha de captura original del archivo
   * @param buffer - Contenido binario del archivo
   * @param mimetype - Tipo MIME del archivo
   * @returns Fecha de captura o null si no se encontró
   */
  async extraerFechaOriginal(buffer: Buffer, mimetype: string): Promise<Date | null> {
    let tmpFilePath: string | null = null;

    try {
      const ext = this.obtenerExtension(mimetype);
      tmpFilePath = path.join(os.tmpdir(), `exif-date-${crypto.randomUUID()}.${ext}`);

      await fs.writeFile(tmpFilePath, buffer);
      const exifData = await this.exiftool.read(tmpFilePath);
      // DEBUG: mostrar campos crudos para diagnóstico
      try {
        console.info('DEBUG ExifExtractor.extraerFechaOriginal: raw fields', Object.keys(exifData));
      } catch {
        /* no-op */
      }

      // Buscar fecha en orden de preferencia y convertir strings EXIF a Date si es necesario
      const candidatos = [
        exifData.DateTimeOriginal, // EXIF: Fecha original de captura
        exifData['XMP:CreateDate'], // XMP: Fecha de creación
        exifData.CreateDate, // EXIF: Fecha de creación
        exifData.FileModifyDate, // Fecha de modificación del archivo
      ];

      for (const candidato of candidatos) {
        const fecha = this.parsearFechaExif(candidato);
        if (fecha) {
          console.info(`✓ Fecha original extraída: ${fecha.toISOString()}`);
          return fecha;
        }
      }

      console.info('ℹ️ No se encontró fecha EXIF válida, usaremos fecha de sistema');
      return null;
    } catch (error) {
      console.warn(`⚠️ Error extrayendo fecha: ${(error as Error).message}`);
      return null; // No bloquear si falla
    } finally {
      if (tmpFilePath) {
        try {
          await fs.unlink(tmpFilePath);
        } catch {
          /* no-op */
        }
      }
      // NOTA: No cerramos la instancia de ExifTool aquí para evitar
      // condiciones de carrera cuando se realizan múltiples lecturas
      // concurrentes. La vida del proceso exiftool la administra quien
      // instancia este extractor.
    }
  }

  /**
   * Parsear metadatos específicos de imagen
   */
  private parsearImagenMetadatos(exifData: any): MetadatosMedia {
    // Preferir la fecha original en este orden: DateTimeOriginal, XMP:CreateDate, CreateDate, FileModifyDate
    const fecha =
      this.parsearFechaExif(exifData.DateTimeOriginal) ||
      this.parsearFechaExif(exifData['XMP:CreateDate']) ||
      this.parsearFechaExif(exifData.CreateDate) ||
      this.parsearFechaExif(exifData.FileModifyDate) ||
      undefined;

    const imagen: MetadatosImagen = {
      ancho: exifData.ImageWidth,
      alto: exifData.ImageHeight,
      camara: exifData.Model,
      fechaCaptura: fecha,
    };

    return { imagen };
  }

  /**
   * Parsear metadatos específicos de video
   */
  private parsearVideoMetadatos(exifData: any): MetadatosMedia {
    const fecha =
      this.parsearFechaExif(exifData.DateTimeOriginal) ||
      this.parsearFechaExif(exifData['XMP:CreateDate']) ||
      this.parsearFechaExif(exifData.CreateDate) ||
      this.parsearFechaExif(exifData.FileModifyDate) ||
      undefined;

    const video: MetadatosVideo = {
      ancho: exifData.ImageWidth,
      alto: exifData.ImageHeight,
      duracionSegundos: exifData.Duration,
      fps: exifData.FrameRate,
      codec: exifData.VideoCodec,
      fechaCaptura: fecha,
    };

    return { video };
  }

  /**
   * Obtener extensión de archivo según mimetype
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

  /**
   * Intenta convertir diferentes representaciones de fecha EXIF a `Date`.
   * Soporta objetos Date ya parseados y cadenas en formatos comunes.
   */
  private parsearFechaExif(value: any): Date | null {
    if (!value) return null;

    // Si ya es Date válido
    if (value instanceof Date && !isNaN(value.getTime())) return value;

    // Si ExifTool devuelve un objeto con componentes (ExifDateTime), construir UTC
    if (typeof value === 'object' && typeof value.year === 'number') {
      try {
        const y = Number(value.year);
        const mo = Number(value.month) || 1;
        const d = Number(value.day) || 1;
        const hh = Number(value.hour) || 0;
        const mm = Number(value.minute) || 0;
        const ss = Number(value.second) || 0;
        const dateUtc = new Date(Date.UTC(y, mo - 1, d, hh, mm, ss));
        if (!isNaN(dateUtc.getTime())) return dateUtc;
      } catch {
        // fallthrough
      }
    }

    // Si viene como string, intentar parsear formatos comunes
    if (typeof value === 'string') {
      // EXIF típico: "YYYY:MM:DD HH:MM:SS" o con sufijo Z/offset
      const exifLike = /^(\d{4}:\d{2}:\d{2})\s+(\d{2}:\d{2}:\d{2})(.*)$/;
      const m = value.match(exifLike);
      if (m) {
        const datePart = m[1];
        const timePart = m[2];
        const suffix = (m[3] || '').trim();
        const iso = datePart.replace(/:/g, '-') + 'T' + timePart + (suffix || '');
        const d = new Date(iso);
        if (!isNaN(d.getTime())) return d;
      }

      // Otros formatos que ExifTool podría entregar (ISO u otros), confiar en Date constructor
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    return null;
  }
}
