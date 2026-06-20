import { Response } from 'express';
import { SubirMediaUseCase } from '../../../../application/usecases/subir-media.usecase';
import { ConsultarMediaUseCase } from '../../../../application/usecases/consultar-media.usecase';
import { ObtenerMediaUseCase } from '../../../../application/usecases/obtener-media.usecase';
import { BorrarMediaUseCase } from '../../../../application/usecases/borrar-media.usecase';
import { ListarMediaUseCase } from '../../../../application/usecases/listar-media.usecase';
import { ExifExtractor } from '../../output/exif-extractor';
import { IStorageRepository } from '../../../../application/ports/output/storage-repository.interface';
import { RequestConUsuario } from './auth.middleware';

export class MediaController {
  private readonly exifExtractor: ExifExtractor;

  constructor(
    private readonly subirMediaUseCase: SubirMediaUseCase,
    private readonly consultarMediaUseCase: ConsultarMediaUseCase,
    private readonly obtenerMediaUseCase: ObtenerMediaUseCase,
    private readonly borrarMediaUseCase: BorrarMediaUseCase,
    private readonly listarMediaUseCase: ListarMediaUseCase, // 👈 Inyección añadida
    private readonly storageRepository: IStorageRepository
  ) {
    this.exifExtractor = new ExifExtractor();
  }

  async subir(req: RequestConUsuario, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No se envió ningún archivo.' });
      }

      const [metadatosExtraidos, fechaOriginal] = await Promise.all([
        this.exifExtractor.extraerMetadatos(req.file.buffer, req.file.mimetype),
        this.exifExtractor.extraerFechaOriginal(req.file.buffer, req.file.mimetype),
      ]);

      // Preferir la fecha extraída directamente; si no existe, intentar leerla de los metadatos
      const fechaDesdeMetadatos =
        (metadatosExtraidos && (metadatosExtraidos.imagen?.fechaCaptura || metadatosExtraidos.video?.fechaCaptura)) ||
        undefined;

      // Campo opcional que el cliente puede enviar con la fecha de modificacion del archivo
      // en su máquina (ms desde epoch o ISO string). Ej: file.lastModified
      let fechaDesdeCliente: Date | undefined = undefined;
      const rawFechaCliente = (req.body && (req.body.fechaArchivo || req.body.fileMtime)) as string | undefined;
      if (rawFechaCliente) {
        const asNumber = Number(rawFechaCliente);
        if (!isNaN(asNumber) && asNumber > 0) {
          fechaDesdeCliente = new Date(asNumber);
        } else {
          const maybeDate = new Date(rawFechaCliente);
          if (!isNaN(maybeDate.getTime())) fechaDesdeCliente = maybeDate;
        }
      }

      // DEBUG: mostrar lo que se obtuvo de EXIF antes de enviar al UseCase
      console.info('DEBUG subir: fechaOriginal devuelta por extraerFechaOriginal:', fechaOriginal);
      console.info('DEBUG subir: metadatosExtraidos.imagen.fechaCaptura:', metadatosExtraidos?.imagen?.fechaCaptura);
      console.info('DEBUG subir: metadatosExtraidos.video.fechaCaptura:', metadatosExtraidos?.video?.fechaCaptura);
      console.info('DEBUG subir: fechaDesdeCliente (campo enviado):', fechaDesdeCliente);

      const resultado = await this.subirMediaUseCase.ejecutar({
        nombreOriginal: req.file.originalname,
        mimetype: req.file.mimetype,
        buffer: req.file.buffer,
        metadatosExtraidos,
        fechaOriginal: fechaDesdeCliente ?? fechaOriginal ?? fechaDesdeMetadatos ?? undefined,
        usuarioId: req.usuario!.id,
      });

      return res.status(201).json({
        message: 'Archivo subido exitosamente',
        id: resultado.id,
        nombre: resultado.nombreOriginal,
        fechaCaptura: resultado.creadoEn,
        metadatos: resultado.metadatos,
      });
    } catch (error: any) {
      console.error('ERROR al subir archivo:', error);
      return res.status(400).json({ error: error.message });
    }
  }

// En tu MediaController.ts
async consultar(req: Request, res: Response) {
  try {
    const id = req.params.id;
    // 1. Buscamos en la base de datos (metadatos)
    const media = await this.consultarMediaUseCase.ejecutar(id);
    
    // 2. Aquí está la magia: Debes llamar al UseCase que obtiene el binario de MinIO
    // Si tu 'consultar' solo devuelve datos, crea un nuevo método o usa 'obtener'
    const archivo = await this.obtenerMediaUseCase.ejecutar(id);

    // 3. Servimos el archivo
    res.setHeader('Content-Type', media.mimetype);
    return res.send(archivo.buffer); // El buffer es la foto real
  } catch (error) {
    res.status(404).json({ error: 'No se pudo cargar la imagen' });
  }
}

  async thumbnail(req: Request, res: Response) {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ error: 'El ID es requerido.' });

      const media = await this.consultarMediaUseCase.ejecutar(id);
      const thumbId = `thumb_${id}`;
      const bufferThumb = await this.storageRepository.obtenerMedia(thumbId);

      res.setHeader('Content-Type', media.mimetype);
      return res.send(bufferThumb);
    } catch (error: any) {
      console.warn(`Miniatura no disponible para ${req.params.id}, sirviendo original:`, error.message);
      try {
        const archivo = await this.obtenerMediaUseCase.ejecutar(req.params.id);
        res.setHeader('Content-Type', archivo.mimetype);
        return res.send(archivo.buffer);
      } catch (innerError: any) {
        return res.status(404).json({ error: innerError.message });
      }
    }
  }

  async descargar(req: Request, res: Response) {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ error: 'El ID es requerido.' });

      const archivo = await this.obtenerMediaUseCase.ejecutar(id);

      res.setHeader('Content-Type', archivo.mimetype);
      res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombreOriginal}"`);
      res.setHeader('Last-Modified', archivo.fechaOriginal.toUTCString());

      return res.send(archivo.buffer);
    } catch (error: any) {
      return res.status(404).json({ error: error.message });
    }
  }

async listar(req: RequestConUsuario, res: Response) {
  try {
    const fotos = await this.listarMediaUseCase.ejecutar(req.usuario!.id);
    res.json(fotos);
  } catch (error: any) {
    console.error('DETALLE DEL ERROR:', error);
    res.status(500).json({ error: error.message });
  }
}

  async borrar(req: RequestConUsuario, res: Response) {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ error: 'El ID es requerido.' });

      await this.borrarMediaUseCase.ejecutar(id, req.usuario!.id);
      
      return res.status(200).json({ 
        message: 'Archivo eliminado correctamente.' 
      });
    } catch (error: any) {
      return res.status(404).json({ error: error.message });
    }
  }
}