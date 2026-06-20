import { IMediaRepository } from '../ports/output/media-repository.interface';
import { Media } from '../../domain/models/media';

export class ListarMediaUseCase {
  constructor(private readonly mediaRepository: IMediaRepository) {}

  async ejecutar(usuarioId: string): Promise<Media[]> {
    return await this.mediaRepository.listarPorUsuario(usuarioId);
  }
}