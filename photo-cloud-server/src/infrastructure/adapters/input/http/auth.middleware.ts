import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

// Extendemos el tipo Request de Express para incluir el usuario autenticado
export interface RequestConUsuario extends Request {
  usuario?: { id: string; email: string; nombre: string };
}

export function authMiddleware(req: RequestConUsuario, res: Response, next: NextFunction) {
  // El token puede llegar como header Bearer (API normal) o como query param ?token=
  // El query param es necesario para <video src="...?token=xxx"> ya que el navegador
  // no puede enviar headers personalizados en solicitudes de recursos multimedia.
  const authHeader = req.headers['authorization'];
  const tokenDeHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenDeQuery  = typeof req.query.token === 'string' ? req.query.token : null;
  const token = tokenDeHeader ?? tokenDeQuery;

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Se requiere autenticacion.' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Configuracion de servidor incorrecta.' });
  }

  try {
    const payload = jwt.verify(token, secret) as { sub: string; email: string; nombre: string };
    req.usuario = { id: payload.sub, email: payload.email, nombre: payload.nombre };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalido o expirado.' });
  }
}
