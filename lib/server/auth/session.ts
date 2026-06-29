import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import type { Rol } from '@prisma/client';

export interface Session {
  id: number;
  email: string;
  rol: Rol;
  sucursal_id: number | null;
  nombre: string;
}

export class AuthError extends Error { status = 401; }
export class ForbiddenError extends Error { status = 403; }

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return req.cookies.get('token')?.value ?? null;
}

/** Verifica el JWT, carga el usuario activo y devuelve la sesión. 401 si falla. */
export async function requireAuth(req: NextRequest): Promise<Session> {
  const token = extractToken(req);
  if (!token) throw new AuthError('No autenticado');
  const payload = verifyToken(token);
  if (!payload) throw new AuthError('Token inválido');
  const user = await prisma.usuario.findUnique({ where: { id: Number(payload.sub) } });
  if (!user || !user.activo) throw new AuthError('Usuario no válido');
  return { id: user.id, email: user.email, rol: user.rol, sucursal_id: user.sucursal_id, nombre: user.nombre };
}

/** Lanza ForbiddenError (403) si el rol de la sesión no está permitido. */
export function requireRole(session: Session, roles: Rol[]): void {
  if (!roles.includes(session.rol)) throw new ForbiddenError('No autorizado');
}

export function getClientIp(req: NextRequest): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}
