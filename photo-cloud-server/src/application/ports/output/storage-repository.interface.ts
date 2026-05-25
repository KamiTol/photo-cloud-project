export interface IStorageRepository {
  guardarMedia(id: string, archivoBuffer: Buffer, mimetype: string): Promise<void>;
  eliminarMedia(id: string): Promise<void>;
  existeMedia(id: string): Promise<boolean>;
  obtenerMedia(id: string): Promise<Buffer>; // 👈 NUEVO MÉTODO
}