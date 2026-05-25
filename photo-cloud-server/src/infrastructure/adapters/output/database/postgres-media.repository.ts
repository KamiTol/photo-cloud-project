import { Pool } from 'pg';
import { Media, MetadatosMedia, TipoMedia } from '../../../../domain/models/media';
import { IMediaRepository } from '../../../../application/ports/output/media-repository.interface';

export class PostgresMediaRepository implements IMediaRepository {
  constructor(private readonly dbPool: Pool) {}

  async guardar(media: Media): Promise<void> {
    const query = `
      INSERT INTO medios (id, nombre_original, mimetype, tipo, tamano_bytes, hash, metadatos, creado_en)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
    `;

    const valores = [
      media.id,
      media.nombreOriginal,
      media.mimetype,
      media.tipo,
      media.tamanoBytes,
      media.hash,
      JSON.stringify(media.metadatos), // Mapeo dinámico a JSONB (Soporta fotos o videos)
      media.creadoEn
    ];

    await this.dbPool.query(query, valores);
  }

  async buscarPorId(id: string): Promise<Media | null> {
    const query = `SELECT * FROM medios WHERE id = $1;`;
    const resultado = await this.dbPool.query(query, [id]);

    if (resultado.rows.length === 0) return null;
    return this.mapearAMediaEntidad(resultado.rows[0]);
  }

  async buscarPorHash(hash: string): Promise<Media | null> {
    const query = `SELECT * FROM medios WHERE hash = $1;`;
    const resultado = await this.dbPool.query(query, [hash]);

    if (resultado.rows.length === 0) return null;
    return this.mapearAMediaEntidad(resultado.rows[0]);
  }

  // 🛠️ NUEVO MÉTODO: Limpia el registro físico de Postgres en caso de descalce con MinIO
  async eliminar(id: string): Promise<void> {
    const query = `DELETE FROM medios WHERE id = $1;`;
    await this.dbPool.query(query, [id]);
  }

  private mapearAMediaEntidad(fila: any): Media {
    return new Media(
      fila.id,
      fila.nombre_original,
      fila.mimetype,
      fila.tipo as TipoMedia,
      Number(fila.tamano_bytes),
      fila.hash,
      fila.metadatos as MetadatosMedia,
      new Date(fila.creado_en)
    );
  }
}