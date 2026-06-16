import { IMediaRepository } from '../ports/output/media-repository.interface';
import { IStorageRepository } from '../ports/output/storage-repository.interface';
import { TipoMedia } from '../../domain/models/media';

export interface StreamVideoResultado {
  stream: NodeJS.ReadableStream;
  tamanioTotal: number;
  tamanioRango: number;
  inicio: number;
  fin: number;
  mimetype: string;
  nombreOriginal: string;
}

export class StreamVideoUseCase {
  constructor(
    private readonly mediaRepository: IMediaRepository,
    private readonly storageRepository: IStorageRepository
  ) {}

  async ejecutar(id: string, rangoHeader?: string): Promise<StreamVideoResultado> {
    // 1. Buscar los metadatos del recurso en la base de datos
    const metadatosMedia = await this.mediaRepository.buscarPorId(id);
    if (!metadatosMedia) {
      throw new Error(`El archivo con ID ${id} no existe en la base de datos.`);
    }

    // 2. Verificar que el recurso sea realmente un video
    if (metadatosMedia.tipo !== TipoMedia.VIDEO) {
      throw new Error('El recurso solicitado no es un video.');
    }

    // 3. Verificar la existencia física del objeto en MinIO
    const existeFisicamente = await this.storageRepository.existeMedia(id);
    if (!existeFisicamente) {
      throw new Error(`El archivo físico del video con ID ${id} no existe en el almacenamiento.`);
    }

    // 4. Obtener el tamaño total del objeto sin descargarlo
    const tamanioTotal = await this.storageRepository.obtenerTamanioMedia(id);

    // 5. Determinar el rango de bytes a partir del header (o usar el archivo completo)
    let inicio: number;
    let fin: number;

    if (rangoHeader) {
      // Formato esperado: "bytes=INICIO-FIN" (FIN puede venir vacío, ej: "bytes=0-")
      const coincidencia = /^bytes=(\d*)-(\d*)$/.exec(rangoHeader.trim());
      if (!coincidencia) {
        throw new Error('El formato del rango de bytes es inválido.');
      }

      inicio = coincidencia[1] === '' ? 0 : parseInt(coincidencia[1], 10);
      fin = coincidencia[2] === '' ? tamanioTotal - 1 : parseInt(coincidencia[2], 10);

      // Validar que el rango sea coherente con el tamaño real del objeto
      if (inicio < 0 || fin >= tamanioTotal || inicio > fin) {
        throw new Error('Rango de bytes solicitado fuera de los límites del archivo.');
      }
    } else {
      // Sin header de rango: se entrega el archivo completo
      inicio = 0;
      fin = tamanioTotal - 1;
    }

    // 6. Solicitar al almacenamiento el stream parcial correspondiente al rango
    const { stream, tamanioRango } = await this.storageRepository.obtenerMediaStream(id, inicio, fin);

    // 7. Retornar el resultado completo del streaming
    return {
      stream,
      tamanioTotal,
      tamanioRango,
      inicio,
      fin,
      mimetype: metadatosMedia.mimetype,
      nombreOriginal: metadatosMedia.nombreOriginal
    };
  }
}
