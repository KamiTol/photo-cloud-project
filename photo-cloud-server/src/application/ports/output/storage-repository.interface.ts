export interface IStorageRepository {
  guardarMedia(id: string, archivoBuffer: Buffer, mimetype: string): Promise<void>;
  eliminarMedia(id: string): Promise<void>;
  existeMedia(id: string): Promise<boolean>;
  obtenerMedia(id: string): Promise<Buffer>; // 👈 NUEVO MÉTODO

  // Devuelve un stream parcial del media para soportar HTTP Range requests (streaming de video)
  obtenerMediaStream(id: string, inicio: number, fin: number): Promise<{ stream: NodeJS.ReadableStream; tamanioTotal: number; tamanioRango: number }>;

  // Devuelve el tamaño en bytes del objeto en MinIO sin descargarlo (HeadObject)
  obtenerTamanioMedia(id: string): Promise<number>;
}