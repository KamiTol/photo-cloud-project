import { Response } from 'express';
import { RequestConUsuario } from './auth.middleware';
import { CompartirArchivoUseCase } from '../../../../application/usecases/compartir-archivo.usecase';

export class PermisosController {
  constructor(private readonly compartirUseCase: CompartirArchivoUseCase) {}

  async compartir(req: RequestConUsuario, res: Response) {
    try {
      const { id: archivoId } = req.params;
      const { email, leer = true, escribir = false, ejecutar = false } = req.body;

      if (!email) return res.status(400).json({ error: 'El campo email es requerido.' });

      const permiso = await this.compartirUseCase.compartir(
        archivoId,
        req.usuario!.id,
        email,
        { leer, escribir, ejecutar },
      );

      return res.status(201).json(permiso);
    } catch (error: any) {
      const status = error.message.includes('no encontrado') || error.message.includes('No existe') ? 404 : 403;
      return res.status(status).json({ error: error.message });
    }
  }

  async revocar(req: RequestConUsuario, res: Response) {
    try {
      const { id: archivoId, usuarioId: destinatarioId } = req.params;
      await this.compartirUseCase.revocar(archivoId, req.usuario!.id, destinatarioId);
      return res.json({ message: 'Acceso revocado.' });
    } catch (error: any) {
      return res.status(403).json({ error: error.message });
    }
  }

  async listar(req: RequestConUsuario, res: Response) {
    try {
      const { id: archivoId } = req.params;
      const permisos = await this.compartirUseCase.listarPermisos(archivoId, req.usuario!.id);
      return res.json(permisos);
    } catch (error: any) {
      return res.status(403).json({ error: error.message });
    }
  }
}
