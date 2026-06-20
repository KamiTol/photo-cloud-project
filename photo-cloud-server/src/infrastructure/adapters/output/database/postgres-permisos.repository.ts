import { Pool } from 'pg';
import { IPermisosRepository, PermisoArchivo } from '../../../../application/ports/output/permisos-repository.interface';

export class PostgresPermisosRepository implements IPermisosRepository {
  constructor(private readonly pool: Pool) {}

  async compartir(
    archivoId: string,
    propietarioId: string,
    destinatarioId: string,
    permisos: { leer: boolean; escribir: boolean; ejecutar: boolean },
  ): Promise<PermisoArchivo> {
    const result = await this.pool.query(
      `INSERT INTO compartidos (archivo_id, propietario_id, destinatario_id, puede_leer, puede_escribir, puede_ejecutar)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (archivo_id, destinatario_id)
       DO UPDATE SET puede_leer = $4, puede_escribir = $5, puede_ejecutar = $6
       RETURNING *`,
      [archivoId, propietarioId, destinatarioId, permisos.leer, permisos.escribir, permisos.ejecutar],
    );
    return this.mapear(result.rows[0]);
  }

  async revocar(archivoId: string, destinatarioId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM compartidos WHERE archivo_id = $1 AND destinatario_id = $2`,
      [archivoId, destinatarioId],
    );
  }

  async listarPorArchivo(archivoId: string): Promise<(PermisoArchivo & { emailDestinatario: string; nombreDestinatario: string })[]> {
    const result = await this.pool.query(
      `SELECT c.*, u.email AS email_destinatario, u.nombre AS nombre_destinatario
       FROM compartidos c
       JOIN usuarios u ON u.id = c.destinatario_id
       WHERE c.archivo_id = $1
       ORDER BY c.creado_en DESC`,
      [archivoId],
    );
    return result.rows.map(r => ({
      ...this.mapear(r),
      emailDestinatario: r.email_destinatario,
      nombreDestinatario: r.nombre_destinatario,
    }));
  }

  async buscarPermiso(archivoId: string, usuarioId: string): Promise<PermisoArchivo | null> {
    const result = await this.pool.query(
      `SELECT * FROM compartidos WHERE archivo_id = $1 AND destinatario_id = $2`,
      [archivoId, usuarioId],
    );
    return result.rows.length === 0 ? null : this.mapear(result.rows[0]);
  }

  async archivosCompartidosConmigo(usuarioId: string): Promise<{ archivoId: string; propietarioEmail: string; propietarioNombre: string }[]> {
    const result = await this.pool.query(
      `SELECT c.archivo_id, u.email AS propietario_email, u.nombre AS propietario_nombre
       FROM compartidos c
       JOIN usuarios u ON u.id = c.propietario_id
       WHERE c.destinatario_id = $1 AND c.puede_leer = true`,
      [usuarioId],
    );
    return result.rows.map(r => ({
      archivoId: r.archivo_id,
      propietarioEmail: r.propietario_email,
      propietarioNombre: r.propietario_nombre,
    }));
  }

  private mapear(r: any): PermisoArchivo {
    return {
      id: r.id,
      archivoId: r.archivo_id,
      propietarioId: r.propietario_id,
      destinatarioId: r.destinatario_id,
      puedeeLeer: r.puede_leer,
      puedeEscribir: r.puede_escribir,
      puedeEjecutar: r.puede_ejecutar,
      creadoEn: new Date(r.creado_en),
    };
  }
}
