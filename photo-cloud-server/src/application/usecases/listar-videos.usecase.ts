import { IMediaRepository } from '../ports/output/media-repository.interface';
import { Media, TipoMedia } from '../../domain/models/media';

export class ListarVideosUseCase {
  constructor(private readonly mediaRepository: IMediaRepository) {}

  async ejecutar(): Promise<Media[]> {
    // Lista únicamente los medios de tipo VIDEO
    return await this.mediaRepository.listarPorTipo(TipoMedia.VIDEO);
  }
}
