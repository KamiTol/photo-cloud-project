import { Pool } from 'pg';
import { IUsuarioRepository, CuotaInfo } from '../../../../application/ports/output/usuario-repository.interface';
import { Usuario } from '../../../../domain/models/usuario';

export class PostgresUsuarioRepository implements IUsuarioRepository {
  constructor(private readonly pool: Pool) {}

  async guardar(usuario: Usuario): Promise<void> {
    await this.pool.query(
      `INSERT INTO usuarios (id, nombre, email, password_hash, creado_en)
       VALUES ($1, $2, $3, $4, $5)`,
      [usuario.id, usuario.nombre, usuario.email, usuario.passwordHash, usuario.creadoEn],
    );
  }

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const result = await this.pool.query(
      `SELECT id, nombre, email, password_hash, creado_en FROM usuarios WHERE LOWER(email) = LOWER($1)`,
      [email],
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return new Usuario(r.id, r.nombre, r.email, r.password_hash, r.creado_en);
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    const result = await this.pool.query(
      `SELECT id, nombre, email, password_hash, creado_en FROM usuarios WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return new Usuario(r.id, r.nombre, r.email, r.password_hash, r.creado_en);
  }

  async obtenerCuota(usuarioId: string): Promise<CuotaInfo> {
    const result = await this.pool.query(
      `SELECT uso_bytes, cuota_maxima_bytes FROM usuarios WHERE id = $1`,
      [usuarioId],
    );
    if (result.rows.length === 0) throw new Error('Usuario no encontrado.');
    const { uso_bytes, cuota_maxima_bytes } = result.rows[0];
    const uso = Number(uso_bytes);
    const max = Number(cuota_maxima_bytes);
    return {
      usoByte: uso,
      cuotaMaximaBytes: max,
      disponibleBytes: max - uso,
      porcentajeUso: max > 0 ? Math.round((uso / max) * 100) : 0,
    };
  }

  // deltaBytes puede ser positivo (subida) o negativo (borrado)
  async actualizarUso(usuarioId: string, deltaBytes: number): Promise<void> {
    await this.pool.query(
      `UPDATE usuarios
       SET uso_bytes = GREATEST(0, uso_bytes + $1)
       WHERE id = $2`,
      [deltaBytes, usuarioId],
    );
  }
}
