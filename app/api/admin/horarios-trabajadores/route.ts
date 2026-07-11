import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { horariosBatchSchema } from '@/lib/server/dto/horarios-trabajadores.dto';
import { ROLES_TRABAJADOR, esRolTrabajador, normalizarCelda, normalizarSemana, validarCelda } from '@/lib/server/horarios/reglas';
import prisma from '@/lib/prisma';

/** Negocio de la sucursal (v1: sin relación Usuario/Sucursal -> Marca; valor único por ahora). */
const NEGOCIO_DEFAULT = 'Elevate';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const usuarios = await prisma.usuario.findMany({
      where: { activo: true, rol: { in: ROLES_TRABAJADOR } },
      select: {
        id: true,
        nombre: true,
        apellido_paterno: true,
        apellido_materno: true,
        rol: true,
        sucursal: { select: { id: true, nombre: true } },
        horarios: { select: { dia_semana: true, es_libre: true, hora_entrada: true, hora_salida: true } },
      },
      orderBy: [{ nombre: 'asc' }],
    });

    const trabajadores = usuarios.map(u => ({
      usuario_id: u.id,
      nombre: `${u.nombre} ${u.apellido_paterno}`,
      rol: u.rol,
      sucursal: u.sucursal ? { id: u.sucursal.id, nombre: u.sucursal.nombre } : null,
      negocio: NEGOCIO_DEFAULT,
      dias: normalizarSemana(u.horarios),
    }));

    return NextResponse.json({ trabajadores });
  } catch (e) { return handleApiError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const { cambios: cambiosRaw } = horariosBatchSchema.parse(await req.json());
    const cambios = cambiosRaw.map(c => ({
      ...c,
      hora_entrada: c.hora_entrada ?? null,
      hora_salida: c.hora_salida ?? null,
    }));

    const usuarioIds = [...new Set(cambios.map(c => c.usuario_id))];
    const usuarios = await prisma.usuario.findMany({
      where: { id: { in: usuarioIds } },
      select: { id: true, rol: true, activo: true },
    });
    const usuariosPorId = new Map(usuarios.map(u => [u.id, u]));

    for (const cambio of cambios) {
      const usuario = usuariosPorId.get(cambio.usuario_id);
      if (!usuario || !usuario.activo || !esRolTrabajador(usuario.rol)) {
        throw new ValidationError(`Usuario ${cambio.usuario_id} no es un trabajador activo válido`);
      }
      const errores = validarCelda(cambio);
      if (errores.length > 0) throw new ValidationError(errores.join('; '));
    }

    const celdas = cambios.map(normalizarCelda);

    await prisma.$transaction(
      celdas.map(c =>
        prisma.horarioTrabajador.upsert({
          where: { usuario_id_dia_semana: { usuario_id: c.usuario_id, dia_semana: c.dia_semana } },
          create: {
            usuario_id: c.usuario_id,
            dia_semana: c.dia_semana,
            es_libre: c.es_libre,
            hora_entrada: c.hora_entrada ?? null,
            hora_salida: c.hora_salida ?? null,
          },
          update: {
            es_libre: c.es_libre,
            hora_entrada: c.hora_entrada ?? null,
            hora_salida: c.hora_salida ?? null,
          },
        }),
      ),
    );

    const usuariosAfectados = [...new Set(celdas.map(c => c.usuario_id))];
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'HorarioTrabajador',
      entidadId: usuariosAfectados.join(','),
      detalle: `Actualizó ${celdas.length} celda(s) de horario (usuarios: ${usuariosAfectados.join(', ')})`,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ ok: true, actualizados: celdas.length });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return handleApiError(new ValidationError('Conflicto al guardar horario (celda duplicada)'));
    }
    return handleApiError(e);
  }
}
