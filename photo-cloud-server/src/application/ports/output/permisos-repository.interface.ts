export interface PermisoArchivo {
  id: string;
  archivoId: string;
  propietarioId: string;
  destinatarioId: string;
  puedeeLeer: boolean;
  puedeEscribir: boolean;
  puedeEjecutar: boolean;
  creadoEn: Date;
}

export interface IPermisosRepository {
  compartir(
    archivoId: string,
    propietarioId: string,
    destinatarioId: string,
    permisos: { leer: boolean; escribir: boolean; ejecutar: boolean },
  ): Promise<PermisoArchivo>;

  revocar(archivoId: string, destinatarioId: string): Promise<void>;

  listarPorArchivo(archivoId: string): Promise<(PermisoArchivo & { emailDestinatario: string; nombreDestinatario: string })[]>;

  buscarPermiso(archivoId: string, usuarioId: string): Promise<PermisoArchivo | null>;

  /** Archivos que otro usuario compartio conmigo con al menos lectura */
  archivosCompartidosConmigo(usuarioId: string): Promise<{
    archivoId: string;
    propietarioEmail: string;
    propietarioNombre: string;
    puedeEscribir: boolean;
  }[]>;
}
