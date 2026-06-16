import { Request, Response } from 'express';
import { Readable } from 'stream';
import { ListarVideosUseCase } from '../../../../application/usecases/listar-videos.usecase';
import { StreamVideoUseCase } from '../../../../application/usecases/stream-video.usecase';

export class StreamingController {
  constructor(
    private readonly listarVideosUseCase: ListarVideosUseCase,
    private readonly streamVideoUseCase: StreamVideoUseCase
  ) {}

  // Devuelve la lista de todos los medios de tipo VIDEO
  async listar(req: Request, res: Response) {
    try {
      const videos = await this.listarVideosUseCase.ejecutar();
      res.json(videos);
    } catch (error: any) {
      console.error('DETALLE DEL ERROR (listar videos):', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Devuelve metadatos básicos del video sin transmitir el contenido binario
  async info(req: Request, res: Response) {
    try {
      const id = req.params.id;
      // Pedimos el rango completo (sin rangoHeader) solo para obtener los metadatos
      const resultado = await this.streamVideoUseCase.ejecutar(id);

      // Cerramos el stream de inmediato para no dejar la conexión con MinIO abierta
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

  // Transmite el video soportando HTTP Range requests (reproducción progresiva)
  async stream(req: Request, res: Response) {
    try {
      const id = req.params.id;
      // El navegador envía el rango solicitado en la cabecera Range (ej: "bytes=0-")
      const rangoHeader = req.headers.range;

      const resultado = await this.streamVideoUseCase.ejecutar(id, rangoHeader);

      if (rangoHeader) {
        // Respuesta parcial: usamos inicio/fin calculados por el caso de uso
        res.status(206);
        res.setHeader('Content-Range', `bytes ${resultado.inicio}-${resultado.fin}/${resultado.tamanioTotal}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', resultado.tamanioRango.toString());
        res.setHeader('Content-Type', resultado.mimetype);
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        // Respuesta completa: se entrega el archivo entero
        res.status(200);
        res.setHeader('Content-Length', resultado.tamanioTotal.toString());
        res.setHeader('Content-Type', resultado.mimetype);
        res.setHeader('Accept-Ranges', 'bytes');
      }

      // Conectamos el stream de MinIO directamente con la respuesta HTTP
      resultado.stream.pipe(res);
    } catch (error: any) {
      // Mapeamos el mensaje de error del dominio al código HTTP correspondiente
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
