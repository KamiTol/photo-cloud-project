import { Response } from 'express';
import { Readable } from 'stream';
import { ListarVideosUseCase } from '../../../../application/usecases/listar-videos.usecase';
import { StreamVideoUseCase } from '../../../../application/usecases/stream-video.usecase';
import { RequestConUsuario } from './auth.middleware';

export class StreamingController {
  constructor(
    private readonly listarVideosUseCase: ListarVideosUseCase,
    private readonly streamVideoUseCase: StreamVideoUseCase
  ) {}

  // Devuelve los videos del usuario autenticado (propios + compartidos)
  async listar(req: RequestConUsuario, res: Response) {
    try {
      const videos = await this.listarVideosUseCase.ejecutar(req.usuario!.id);
      res.json(videos);
    } catch (error: any) {
      console.error('DETALLE DEL ERROR (listar videos):', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Devuelve metadatos basicos del video sin transmitir el contenido binario
  async info(req: RequestConUsuario, res: Response) {
    try {
      const id = req.params['id'] as string;
      const resultado = await this.streamVideoUseCase.ejecutar(id);
      (resultado.stream as Readable).destroy();
      res.json({
        id,
        mimetype: resultado.mimetype,
        nombreOriginal: resultado.nombreOriginal,
        tamanioTotal: resultado.tamanioTotal
      });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  // Transmite el video soportando HTTP Range requests (reproduccion progresiva)
  async stream(req: RequestConUsuario, res: Response) {
    try {
      const id = req.params['id'] as string;
      const rangoRaw = req.headers['range'];
      const rangoHeader = Array.isArray(rangoRaw) ? rangoRaw[0] : rangoRaw;
      const resultado = await this.streamVideoUseCase.ejecutar(id, rangoHeader);

      if (rangoHeader) {
        res.status(206);
        res.setHeader('Content-Range', 'bytes ' + resultado.inicio + '-' + resultado.fin + '/' + resultado.tamanioTotal);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', resultado.tamanioRango.toString());
        res.setHeader('Content-Type', resultado.mimetype);
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.status(200);
        res.setHeader('Content-Length', resultado.tamanioTotal.toString());
        res.setHeader('Content-Type', resultado.mimetype);
        res.setHeader('Accept-Ranges', 'bytes');
      }

      resultado.stream.pipe(res);
    } catch (error: any) {
      const mensaje: string = error.message ?? '';
      if (mensaje.includes('no es un video')) {
        res.status(415).json({ error: mensaje });
      } else if (mensaje.includes('no existe')) {
        res.status(404).json({ error: mensaje });
      } else {
        res.status(500).json({ error: mensaje });
      }
    }
  }
}
