export interface CoordenadasGPS {
  readonly latitud: number;
  readonly longitud: number;
}

export interface MetadatosImagen {
  readonly ancho?: number;
  readonly alto?: number;
  readonly camara?: string;
  readonly fechaCaptura?: Date;
}

export interface MetadatosVideo {
  readonly ancho?: number;
  readonly alto?: number;
  readonly duracionSegundos?: number; // 🎥 Exclusivo de video
  readonly fps?: number;              // Cuadros por segundo
  readonly codec?: string;           // Ej: h264, hevc
  readonly fechaCaptura?: Date;
}

export interface MetadatosMedia {
  readonly imagen?: MetadatosImagen;
  readonly video?: MetadatosVideo;
  readonly gps?: CoordenadasGPS; // Común para ambos si tienen geolocalización
}

// Usamos un ENUM estricto para clasificar el tipo de archivo
export enum TipoMedia {
  IMAGEN = 'IMAGEN',
  VIDEO = 'VIDEO'
}

export class Media {
  public readonly id: string;
  public readonly nombreOriginal: string;
  public readonly mimetype: string;       
  public readonly tipo: TipoMedia;        // 🛡️ Define si es IMAGEN o VIDEO
  public readonly tamanoBytes: number;     
  public readonly hash: string;            // SHA-256 único del binario
  public readonly metadatos: MetadatosMedia;
  public readonly creadoEn: Date;          

  constructor(
    id: string,
    nombreOriginal: string,
    mimetype: string,
    tipo: TipoMedia,
    tamanoBytes: number,
    hash: string,
    metadatos: MetadatosMedia,
    creadoEn: Date
  ) {
    // Guardas de Integridad
    if (!id || id.trim() === '') throw new Error('El ID debe ser un identificador válido.');
    if (!nombreOriginal || nombreOriginal.trim() === '') throw new Error('El nombre original no puede estar vacío.');
    if (!mimetype || !mimetype.includes('/')) throw new Error('El MimeType debe tener un formato estándar.');
    if (tamanoBytes <= 0) throw new Error('El tamaño del archivo debe ser mayor a 0 bytes.');
    if (!hash || hash.length !== 64) throw new Error('El hash debe ser un SHA-256 de 64 caracteres.');
    if (!(creadoEn instanceof Date) || isNaN(creadoEn.getTime())) throw new Error('La fecha debe ser un Date válido.');

    this.id = id;
    this.nombreOriginal = nombreOriginal;
    this.mimetype = mimetype;
    this.tipo = tipo;
    this.tamanoBytes = tamanoBytes;
    this.hash = hash;
    this.metadatos = metadatos;
    this.creadoEn = creadoEn;
  }
}