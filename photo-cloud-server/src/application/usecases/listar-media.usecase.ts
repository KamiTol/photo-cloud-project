import { IMediaRepository } from '../ports/output/media-repository.interface';
import { IPermisosRepository } from '../ports/output/permisos-repository.interface';
import { Media } from '../../domain/models/media';

export interface MediaConMeta extends Media {
  esPropietario: boolean;
  propietarioEmail?: string;
  propietarioNombre?: string;
}

export class ListarMediaUseCase {
  constructor(
    private readonly mediaRepository: IMediaRepository,
    private readonly permisosRepository: IPermisosRepository,
  ) {}

  async ejecutar(usuarioId: string): Promise<MediaConMeta[]> {
    // Mis propios archivos
    const propios = await this.mediaRepository.listarPorUsuario(usuarioId);
    const propiosMeta: MediaConMeta[] = propios.map(m => ({ ...m, esPropietario: true }));

    // Archivos que otros compartieron conmigo con permiso de lectura
    const compartidos = await this.permisosRepository.archivosCompartidosConmigo(usuarioId);
    const compartidosMeta: MediaConMeta[] = [];

    for (const { archivoId, propietarioEmail, propietarioNombre } of compartidos) {
      const archivo = await this.mediaRepository.buscarPorId(archivoId);
      if (archivo) {
        compartidosMeta.push({
          ...archivo,
          esPropietario: false,
          propietarioEmail,
          propietarioNombre,
        });
      }
    }

    // Mis archivos primero, luego los compartidos
    return [...propiosMeta, ...compartidosMeta];
  }
}
