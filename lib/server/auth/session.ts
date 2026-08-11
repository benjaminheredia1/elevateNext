import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import type { Rol } from '@prisma/client';

export interface Session {
  id: number;
  email: string;
  rol: Rol;
  /** Sucursal principal: la del cajero y la que se elige por defecto. */
  sucursal_id: number | null;
  /**
   * Alcance completo del usuario. Un ADMIN puede administrar varios locales;
   * el DUENO va con lista vacía porque su alcance es todo el negocio, por rol.
   */
  sucursales: number[];
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
  // Las sucursales viajan en la sesión, no en el JWT: se resuelven acá en cada
  // request, así quitarle un local a un admin surte efecto de inmediato y sin
  // invalidar su token.
  const user = await prisma.usuario.findUnique({
    where: { id: Number(payload.sub) },
    include: { sucursales_asignadas: { select: { sucursal_id: true } } },
  });
  if (!user || !user.activo) throw new AuthError('Usuario no válido');
  const asignadas = user.sucursales_asignadas.map(s => s.sucursal_id);
  // La principal cuenta como alcance aunque falte su fila (usuario creado antes
  // de la tabla puente, o alta que solo escribió `sucursal_id`).
  if (user.sucursal_id != null && !asignadas.includes(user.sucursal_id)) {
    asignadas.push(user.sucursal_id);
  }
  return {
    id: user.id, email: user.email, rol: user.rol,
    sucursal_id: user.sucursal_id, sucursales: asignadas, nombre: user.nombre,
  };
}

/** Lanza ForbiddenError (403) si el rol de la sesión no está permitido. */
export function requireRole(session: Session, roles: Rol[]): void {
  if (!roles.includes(session.rol)) throw new ForbiddenError('No autorizado');
}

export function getClientIp(req: NextRequest): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}
