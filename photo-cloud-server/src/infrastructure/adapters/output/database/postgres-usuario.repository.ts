import { Pool } from 'pg';
import { IUsuarioRepository } from '../../../../application/ports/output/usuario-repository.interface';
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
      `SELECT id, nombre, email, password_hash, creado_en FROM usuarios WHERE email = $1`,
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
}
