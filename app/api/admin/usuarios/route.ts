import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError } from '@/lib/server/errors';
import { ForbiddenError } from '@/lib/server/auth/session';
import { ConflictError, ValidationError } from '@/lib/server/errors';
import { usuarioCreateSchema, usuarioUpdateSchema, idSchema } from '@/lib/server/dto/usuarios.dto';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import type { Rol } from '@prisma/client';

/** Roles que solo DUENO puede asignar */
const ROLES_SOLO_DUENO: Rol[] = ['DUENO', 'ADMIN'];

function canAssignRole(actorRol: Rol, targetRol: Rol) {
  if (ROLES_SOLO_DUENO.includes(targetRol) && actorRol !== 'DUENO') return false;
  if (actorRol === 'ADMIN' && !['CAJERO'].includes(targetRol)) return false;
  return true;
}

/**
 * Valida las sucursales pedidas y devuelve el alcance a guardar. Un id que no
 * existe se rechaza en vez de ignorarse: un admin que crea tener tres locales y
 * solo ve dos es peor que un error al guardar.
 */
async function normalizarAlcance(sucursalIds: number[] | undefined, principal: number | null | undefined) {
  const ids = [...new Set(sucursalIds ?? [])];
  if (ids.length > 0) {
    const existentes = await prisma.sucursal.count({ where: { id: { in: ids } } });
    if (existentes !== ids.length) throw new ValidationError('Alguna sucursal indicada no existe');
  }
  // La principal siempre forma parte del alcance; si no se indico, es la primera.
  const nuevaPrincipal = principal ?? (ids.length > 0 ? ids[0] : null);
  if (nuevaPrincipal != null && !ids.includes(nuevaPrincipal)) ids.push(nuevaPrincipal);
  return { ids, principal: nuevaPrincipal };
}

function sanitize(u: { password: string; [k: string]: unknown }) {
  const { password: _p, ...rest } = u;
  return rest;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true, nombre: true, apellido_paterno: true, apellido_materno: true,
        email: true, username: true, rol: true, activo: true,
        ultimo_acceso: true, sucursal_id: true, created_at: true,
        sucursal: { select: { nombre: true } },
        sucursales_asignadas: { select: { sucursal: { select: { id: true, nombre: true } } } },
      },
      orderBy: [{ activo: 'desc' }, { rol: 'asc' }, { nombre: 'asc' }],
    });
    // Se aplana la tabla puente para que el front reciba una lista de sucursales.
    return NextResponse.json({
      items: usuarios.map(u => ({ ...u, sucursales: u.sucursales_asignadas.map(a => a.sucursal) })),
    });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = usuarioCreateSchema.parse(await req.json());

    if (!canAssignRole(session.rol, input.rol)) {
      throw new ForbiddenError(`No tienes permiso para asignar el rol ${input.rol}`);
    }

    const exists = await prisma.usuario.findFirst({ where: { OR: [{ email: input.email }, ...(input.username ? [{ username: input.username }] : [])] } });
    if (exists) throw new ConflictError('Email o username ya en uso');

    const hash = await bcrypt.hash(input.password, 10);
    const alcance = await normalizarAlcance(input.sucursal_ids, input.sucursal_id);
    const usuario = await prisma.usuario.create({
      data: {
        nombre: input.nombre,
        apellido_paterno: input.apellido_paterno,
        apellido_materno: input.apellido_materno,
        email: input.email,
        username: input.username ?? null,
        password: hash,
        token: crypto.randomUUID(),
        rol: input.rol,
        activo: true,
        sucursal_id: alcance.principal,
        sucursales_asignadas: { create: alcance.ids.map(sucursal_id => ({ sucursal_id })) },
      },
    });
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'CREO',
      entidad: 'Usuario',
      entidadId: usuario.id,
      detalle: `Creó usuario ${usuario.email} con rol ${usuario.rol}${alcance.ids.length ? ` — sucursales: ${alcance.ids.join(', ')}` : ''}`,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(sanitize(usuario), { status: 201 });
  } catch (e) { return handleApiError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = usuarioUpdateSchema.parse(await req.json());

    if (input.rol && !canAssignRole(session.rol, input.rol)) {
      throw new ForbiddenError(`No tienes permiso para asignar el rol ${input.rol}`);
    }

    const current = await prisma.usuario.findUnique({ where: { id: input.id } });
    if (!current) throw new Error('Usuario no encontrado');

    const data: Record<string, unknown> = {};
    if (input.nombre !== undefined) data.nombre = input.nombre;
    if (input.apellido_paterno !== undefined) data.apellido_paterno = input.apellido_paterno;
    if (input.apellido_materno !== undefined) data.apellido_materno = input.apellido_materno;
    if (input.email !== undefined) data.email = input.email;
    if (input.username !== undefined) data.username = input.username;
    if (input.rol !== undefined) data.rol = input.rol;
    if (input.activo !== undefined) data.activo = input.activo;
    if (input.password) data.password = await bcrypt.hash(input.password, 10);

    // El alcance se reemplaza entero, no se acumula: destildar una sucursal en el
    // formulario tiene que quitarla de verdad. Va en la misma transaccion que el
    // resto para que nadie quede a medio asignar.
    const tocaAlcance = input.sucursal_ids !== undefined || input.sucursal_id !== undefined;
    const alcance = tocaAlcance
      ? await normalizarAlcance(
          input.sucursal_ids
            ?? (await prisma.usuarioSucursal.findMany({
                 where: { usuario_id: input.id }, select: { sucursal_id: true },
               })).map(a => a.sucursal_id),
          // Si le quitaron la sucursal que tenía como principal, la principal
          // pasa a ser la primera de las nuevas: dejarla apuntando a un local
          // que ya no administra le devolvería el acceso por la puerta de atrás.
          input.sucursal_id !== undefined
            ? input.sucursal_id
            : (input.sucursal_ids?.includes(current.sucursal_id ?? -1) ?? true)
              ? current.sucursal_id
              : null,
        )
      : null;
    if (alcance) data.sucursal_id = alcance.principal;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.usuario.update({ where: { id: input.id }, data });
      if (alcance) {
        await tx.usuarioSucursal.deleteMany({ where: { usuario_id: input.id } });
        if (alcance.ids.length > 0) {
          await tx.usuarioSucursal.createMany({
            data: alcance.ids.map(sucursal_id => ({ usuario_id: input.id, sucursal_id })),
          });
        }
      }
      return u;
    });

    const cambios: string[] = [];
    if (input.rol && input.rol !== current.rol) cambios.push(`rol: ${current.rol}→${input.rol}`);
    if (input.activo !== undefined && input.activo !== current.activo) cambios.push(`activo: ${input.activo}`);
    if (alcance) cambios.push(`sucursales: ${alcance.ids.length ? alcance.ids.join(', ') : 'ninguna'}`);

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'Usuario',
      entidadId: updated.id,
      detalle: `Modificó usuario ${updated.email}${cambios.length ? ` (${cambios.join(', ')})` : ''}`,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(sanitize(updated));
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const { id } = idSchema.parse({ id: searchParams.get('id') ?? (await req.json().catch(() => ({}))).id });

    const target = await prisma.usuario.findUnique({ where: { id }, select: { id: true, email: true, rol: true } });
    if (!target) throw new Error('Usuario no encontrado');
    if (!canAssignRole(session.rol, target.rol)) {
      throw new ForbiddenError('No tienes permiso para desactivar este usuario');
    }

    await prisma.usuario.update({ where: { id }, data: { activo: false } });
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'ELIMINO',
      entidad: 'Usuario',
      entidadId: id,
      detalle: `Desactivó usuario ${target.email}`,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleApiError(e); }
}
