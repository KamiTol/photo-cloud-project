import { Media } from '../../../domain/models/media';

export interface IMediaRepository {
  guardar(media: Media, usuarioId: string): Promise<void>;
  buscarPorId(id: string): Promise<Media | null>;
  buscarPorHash(hash: string, usuarioId: string): Promise<Media | null>;
  eliminar(id: string): Promise<void>;
  listarTodos(): Promise<Media[]>;
  listarPorUsuario(usuarioId: string): Promise<Media[]>;
}