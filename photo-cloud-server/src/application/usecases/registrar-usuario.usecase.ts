import { IUsuarioIdentidadServicio } from '../ports/output/usuario-identidad-servicio.interface';

export interface RegistrarUsuarioDTO {
  nombre: string;
  email: string;
  password: string;
}

/**
 * El registro de usuarios se delega al servicio SOAP de gestion de usuarios
 * (soap-server/, PHP) en lugar de escribirse directamente en la base de
 * datos desde Node. El SOAP server es quien hashea la password y persiste
 * la fila en la tabla compartida `usuarios`.
 */
export class RegistrarUsuarioUseCase {
  constructor(private readonly identidadServicio: IUsuarioIdentidadServicio) {}

  async ejecutar(dto: RegistrarUsuarioDTO): Promise<{ id: string; email: string }> {
    if (dto.password.length < 8) {
      throw new Error('La contrasena debe tener al menos 8 caracteres.');
    }

    const usuario = await this.identidadServicio.registrar(
      dto.nombre.trim(),
      dto.email.toLowerCase().trim(),
      dto.password,
    );

    return { id: usuario.id, email: usuario.email };
  }
}
