import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

// Extendemos el tipo Request de Express para incluir el usuario autenticado
export interface RequestConUsuario extends Request {
  usuario?: { id: string; email: string; nombre: string };
}

export function authMiddleware(req: RequestConUsuario, res: Response, next: NextFunction) {
  // El token llega en el header: Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

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
