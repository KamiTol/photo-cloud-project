import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { IUsuarioRepository } from '../ports/output/usuario-repository.interface';
import { Usuario } from '../../domain/models/usuario';

export interface RegistrarUsuarioDTO {
  nombre: string;
  email: string;
  password: string;
}

export class RegistrarUsuarioUseCase {
  constructor(private readonly usuarioRepository: IUsuarioRepository) {}

  async ejecutar(dto: RegistrarUsuarioDTO): Promise<{ id: string; email: string }> {
    // Verificar que el email no este ya registrado
    const existente = await this.usuarioRepository.buscarPorEmail(dto.email);
    if (existente) throw new Error('El email ya esta registrado.');

    // Validar que la password tenga al menos 8 caracteres
    if (dto.password.length < 8) throw new Error('La contrasena debe tener al menos 8 caracteres.');

    // Hashear la contrasena con bcrypt (10 rounds = balance seguridad/velocidad)
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const usuario = new Usuario(
      randomUUID(),
      dto.nombre.trim(),
      dto.email.toLowerCase().trim(),
      passwordHash,
      new Date(),
    );

    await this.usuarioRepository.guardar(usuario);
    return { id: usuario.id, email: usuario.email };
  }
}
