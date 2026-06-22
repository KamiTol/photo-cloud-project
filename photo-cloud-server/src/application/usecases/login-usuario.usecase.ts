import jwt from 'jsonwebtoken';
import '../../env';
import { IUsuarioIdentidadServicio } from '../ports/output/usuario-identidad-servicio.interface';

export interface LoginDTO {
  email: string;
  password: string;
}

export interface LoginResultado {
  token: string;
  usuario: { id: string; nombre: string; email: string };
}

/**
 * Las credenciales se verifican contra el servicio SOAP de usuarios
 * (soap-server/). Node solo emite el JWT de sesion tras una autenticacion
 * exitosa; no compara passwords ni toca password_hash directamente.
 */
export class LoginUsuarioUseCase {
  constructor(private readonly identidadServicio: IUsuarioIdentidadServicio) {}

  async ejecutar(dto: LoginDTO): Promise<LoginResultado> {
    let usuario;
    try {
      usuario = await this.identidadServicio.autenticar(dto.email.toLowerCase().trim(), dto.password);
    } catch (error: any) {
      // Una caida del servicio SOAP no es lo mismo que credenciales malas:
      // ocultar la primera como "credenciales invalidas" rompe la
      // observabilidad de una falla de infraestructura real.
      if (error?.message?.includes('no esta disponible')) throw error;

      // Mismo mensaje generico para credenciales invalidas o usuario
      // inexistente (evita revelar si un email esta registrado o no).
      throw new Error('Credenciales invalidas.');
    }

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
