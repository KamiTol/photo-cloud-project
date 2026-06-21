import { IMediaRepository } from '../ports/output/media-repository.interface';
import { IPermisosRepository } from '../ports/output/permisos-repository.interface';
import { TipoMedia } from '../../domain/models/media';
import { MediaConMeta } from './listar-media.usecase';

export class ListarVideosUseCase {
  constructor(
    private readonly mediaRepository: IMediaRepository,
    private readonly permisosRepository: IPermisosRepository,
  ) {}

  async ejecutar(usuarioId: string): Promise<MediaConMeta[]> {
    // Mis propios videos
    const propios = (await this.mediaRepository.listarPorUsuario(usuarioId))
      .filter(m => m.tipo === TipoMedia.VIDEO);
    const propiosMeta: MediaConMeta[] = propios.map(m => ({ ...m, esPropietario: true }));

    // Videos que otros compartieron conmigo
    const compartidos = await this.permisosRepository.archivosCompartidosConmigo(usuarioId);
    const compartidosMeta: MediaConMeta[] = [];

    for (const { archivoId, propietarioEmail, propietarioNombre, puedeEscribir } of compartidos) {
      const archivo = await this.mediaRepository.buscarPorId(archivoId);
      if (archivo && archivo.tipo === TipoMedia.VIDEO) {
        compartidosMeta.push({
          ...archivo,
          esPropietario: false,
          puedeEscribir,
          propietarioEmail,
          propietarioNombre,
        });
      }
    }

    return [...propiosMeta, ...compartidosMeta];
  }
}
