import { Usuario } from '../../../domain/models/usuario';

export interface CuotaInfo {
  usoByte: number;
  cuotaMaximaBytes: number;
  disponibleBytes: number;
  porcentajeUso: number;
}

export interface IUsuarioRepository {
  guardar(usuario: Usuario): Promise<void>;
  buscarPorEmail(email: string): Promise<Usuario | null>;
  buscarPorId(id: string): Promise<Usuario | null>;
  obtenerCuota(usuarioId: string): Promise<CuotaInfo>;
  actualizarUso(usuarioId: string, deltaBytes: number): Promise<void>;
}
