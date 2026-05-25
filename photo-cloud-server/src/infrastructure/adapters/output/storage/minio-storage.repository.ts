import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream'; // Importación nativa de Node.js para manejar el flujo de datos
import { IStorageRepository } from '../../../../application/ports/output/storage-repository.interface';

export class MinioStorageRepository implements IStorageRepository {
  private readonly s3Client: S3Client;
  private readonly nombreBucket = 'fotos-originales';

  constructor() {
    this.s3Client = new S3Client({
      region: 'us-east-1',
      endpoint: 'http://localhost:9000',
      credentials: {
        accessKeyId: 'admin_storage',
        secretAccessKey: 'StoragePassword123'
      },
      forcePathStyle: true
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
}