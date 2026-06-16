import { Pool } from 'pg';
import { Media, MetadatosMedia, TipoMedia } from '../../../../domain/models/media';
import { IMediaRepository } from '../../../../application/ports/output/media-repository.interface';

export class PostgresMediaRepository implements IMediaRepository {
  constructor(private readonly dbPool: Pool) {}

  async guardar(media: Media, usuarioId: string): Promise<void> {
    const query = `
      INSERT INTO medios (id, nombre_original, mimetype, tipo, tamano_bytes, hash, metadatos, creado_en, usuario_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `;
    const valores = [
      media.id, media.nombreOriginal, media.mimetype, media.tipo,
      media.tamanoBytes, media.hash, JSON.stringify(media.metadatos), media.creadoEn, usuarioId
    ];

    // DEBUG: confirmar la fecha que se insertará en la base de datos
    try {
      console.info('DEBUG PostgresMediaRepository.guardar: insert creado_en =', media.creadoEn instanceof Date ? media.creadoEn.toISOString() : media.creadoEn);
    } catch {
      /* no-op */
    }

    await this.dbPool.query(query, valores);
    // DEBUG: verificar lo que quedó realmente en la base de datos
    try {
      const res = await this.dbPool.query('SELECT creado_en FROM medios WHERE id = $1', [media.id]);
      if (res.rows && res.rows[0]) {
        console.info('DEBUG PostgresMediaRepository.guardar: creado_en en DB =', res.rows[0].creado_en);
      }
    } catch (err) {
      console.warn('DEBUG PostgresMediaRepository.guardar: no se pudo verificar creado_en en DB', (err as Error).message);
    }
  }

  async buscarPorId(id: string): Promise<Media | null> {
    const query = `SELECT * FROM medios WHERE id = $1;`;
    const resultado = await this.dbPool.query(query, [id]);
    return resultado.rows.length === 0 ? null : this.mapearAMediaEntidad(resultado.rows[0]);
  }

  async buscarPorHash(hash: string, usuarioId: string): Promise<Media | null> {
    const resultado = await this.dbPool.query(
      `SELECT * FROM medios WHERE hash = $1 AND usuario_id = $2;`,
      [hash, usuarioId],
    );
    return resultado.rows.length === 0 ? null : this.mapearAMediaEntidad(resultado.rows[0]);
  }

  async eliminar(id: string): Promise<void> {
    await this.dbPool.query(`DELETE FROM medios WHERE id = $1;`, [id]);
  }

  async listarTodos(): Promise<Media[]> {
    const resultado = await this.dbPool.query(`SELECT * FROM medios ORDER BY creado_en DESC;`);
    return resultado.rows.map(fila => this.mapearAMediaEntidad(fila));
  }

  async listarPorUsuario(usuarioId: string): Promise<Media[]> {
    const resultado = await this.dbPool.query(
      `SELECT * FROM medios WHERE usuario_id = $1 ORDER BY creado_en DESC;`,
      [usuarioId],
    );
    return resultado.rows.map(fila => this.mapearAMediaEntidad(fila));
  }

  // Lista únicamente los medios de un tipo concreto (IMAGEN o VIDEO), del más reciente al más antiguo
  async listarPorTipo(tipo: TipoMedia): Promise<Media[]> {
    const query = `SELECT * FROM medios WHERE tipo = $1 ORDER BY creado_en DESC;`;
    const resultado = await this.dbPool.query(query, [tipo]);
    return resultado.rows.map(fila => this.mapearAMediaEntidad(fila));
  }

  private mapearAMediaEntidad(fila: any): Media {
    return new Media(
      fila.id, fila.nombre_original, fila.mimetype, fila.tipo as TipoMedia,
      Number(fila.tamano_bytes), fila.hash, fila.metadatos as MetadatosMedia,
      new Date(fila.creado_en)
    );
  }
}