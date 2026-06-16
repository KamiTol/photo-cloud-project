import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { IStorageRepository } from '../../../../application/ports/output/storage-repository.interface';
import 'dotenv/config';

export class MinioStorageRepository implements IStorageRepository {
  private readonly s3Client: S3Client;
  private readonly nombreBucket: string;

  constructor() {
    this.nombreBucket = process.env.MINIO_BUCKET || 'fotos-originales';

    this.s3Client = new S3Client({
      region: 'us-east-1',
      endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
      credentials: {
        accessKeyId:     process.env.MINIO_ACCESS_KEY || '',
        secretAccessKey: process.env.MINIO_SECRET_KEY || '',
      },
      forcePathStyle: true,
    });
  }

  async guardarMedia(id: string, archivoBuffer: Buffer, mimetype: string): Promise<void> {
    const comando = new PutObjectCommand({
      Bucket: this.nombreBucket,
      Key: id,
      Body: archivoBuffer,
      ContentType: mimetype
    });
    await this.s3Client.send(comando);
  }

  async eliminarMedia(id: string): Promise<void> {
    const comando = new DeleteObjectCommand({
      Bucket: this.nombreBucket,
      Key: id
    });
    await this.s3Client.send(comando);
  }

  // 🔍 Verifica rápido si el objeto existe físicamente en MinIO (solo lee metadatos)
  async existeMedia(id: string): Promise<boolean> {
    try {
      const comando = new HeadObjectCommand({
        Bucket: this.nombreBucket,
        Key: id
      });
      await this.s3Client.send(comando);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  // 📥 NUEVO MÉTODO: Trae los bytes puros de un objeto desde MinIO y los transforma en Buffer
  async obtenerMedia(id: string): Promise<Buffer> {
    try {
      const comando = new GetObjectCommand({
        Bucket: this.nombreBucket,
        Key: id
      });

      const respuesta = await this.s3Client.send(comando);
      
      // El Body que nos devuelve el SDK v3 de AWS es un stream (Readable)
      const stream = respuesta.Body as Readable;

      // Recomponemos los fragmentos (chunks) binarios en un único Buffer
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
    } catch (error: any) {
      throw new Error(`Error al leer objeto de MinIO: ${error.message}`);
    }
  }

  // 📏 NUEVO MÉTODO: Devuelve el tamaño en bytes del objeto sin descargarlo (HeadObject)
  async obtenerTamanioMedia(id: string): Promise<number> {
    const comando = new HeadObjectCommand({
      Bucket: this.nombreBucket,
      Key: id
    });
    const respuesta = await this.s3Client.send(comando);
    return respuesta.ContentLength ?? 0;
  }

  // 🎬 NUEVO MÉTODO: Devuelve un stream parcial (HTTP Range) para reproducir video sin descargar todo el archivo
  async obtenerMediaStream(
    id: string,
    inicio: number,
    fin: number
  ): Promise<{ stream: NodeJS.ReadableStream; tamanioTotal: number; tamanioRango: number }> {
    // Validamos que el rango solicitado tenga sentido antes de pedirlo a MinIO
    if (inicio < 0 || fin < inicio) {
      throw new Error('Rango de bytes inválido');
    }

    const comando = new GetObjectCommand({
      Bucket: this.nombreBucket,
      Key: id,
      Range: `bytes=${inicio}-${fin}`
    });

    const respuesta = await this.s3Client.send(comando);

    // El Body devuelto por el SDK v3 de AWS es un stream (Readable)
    const stream = respuesta.Body as Readable;

    // El tamaño total del objeto viene en ContentRange (ej: "bytes 0-99/2048")
    const tamanioTotal = respuesta.ContentRange
      ? Number(respuesta.ContentRange.split('/')[1])
      : respuesta.ContentLength ?? 0;

    const tamanioRango = fin - inicio + 1;

    return { stream, tamanioTotal, tamanioRango };
  }
}