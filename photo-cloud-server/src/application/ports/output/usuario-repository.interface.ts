import { Usuario } from '../../../domain/models/usuario';

// Puerto de salida: contrato que debe cumplir cualquier repositorio de usuarios
export interface IUsuarioRepository {
  guardar(usuario: Usuario): Promise<void>;
  buscarPorEmail(email: string): Promise<Usuario | null>;
  buscarPorId(id: string): Promise<Usuario | null>;
}
