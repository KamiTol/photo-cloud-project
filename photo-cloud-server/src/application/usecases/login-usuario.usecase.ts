import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { IUsuarioRepository } from '../ports/output/usuario-repository.interface';

export interface LoginDTO {
  email: string;
  password: string;
}

export interface LoginResultado {
  token: string;
  usuario: { id: string; nombre: string; email: string };
}

export class LoginUsuarioUseCase {
  constructor(private readonly usuarioRepository: IUsuarioRepository) {}

  async ejecutar(dto: LoginDTO): Promise<LoginResultado> {
    const usuario = await this.usuarioRepository.buscarPorEmail(dto.email.toLowerCase().trim());

    // Misma respuesta si el usuario no existe o la contrasena es incorrecta
    // (evita revelar si un email esta registrado o no)
    const MENSAJE_ERROR = 'Credenciales invalidas.';

    if (!usuario) throw new Error(MENSAJE_ERROR);

    const passwordValida = await bcrypt.compare(dto.password, usuario.passwordHash);
    if (!passwordValida) throw new Error(MENSAJE_ERROR);

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET no configurado en el servidor.');

    const token = jwt.sign(
      { sub: usuario.id, email: usuario.email, nombre: usuario.nombre },
      secret,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as any },
    );

    return {
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email },
    };
  }
}
