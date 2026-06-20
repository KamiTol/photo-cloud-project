import { Request, Response } from 'express';
import { RegistrarUsuarioUseCase } from '../../../../application/usecases/registrar-usuario.usecase';
import { LoginUsuarioUseCase } from '../../../../application/usecases/login-usuario.usecase';

export class AuthController {
  constructor(
    private readonly registrarUseCase: RegistrarUsuarioUseCase,
    private readonly loginUseCase: LoginUsuarioUseCase,
  ) {}

  async register(req: Request, res: Response) {
    try {
      const { nombre, email, password } = req.body;
      if (!nombre || !email || !password) {
        return res.status(400).json({ error: 'nombre, email y password son obligatorios.' });
      }
      const resultado = await this.registrarUseCase.ejecutar({ nombre, email, password });
      return res.status(201).json({ message: 'Usuario registrado correctamente.', ...resultado });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'email y password son obligatorios.' });
      }
      const resultado = await this.loginUseCase.ejecutar({ email, password });
      return res.status(200).json(resultado);
    } catch (error: any) {
      return res.status(401).json({ error: error.message });
    }
  }
}
