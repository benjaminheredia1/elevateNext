import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, NotFoundError, ValidationError } from '@/lib/server/errors';
import { logAudit } from '@/lib/server/audit/audit.service';
import prisma from '@/lib/prisma';

const MergeSchema = z.object({
  keepId: z.number().int().positive(),
  mergeId: z.number().int().positive(),
});

/**
 * Fusiona dos clientes duplicados: reasigna las transacciones del cliente
 * `mergeId` al `keepId`, completa los datos faltantes y elimina el duplicado.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const { keepId, mergeId } = MergeSchema.parse(await req.json());
    if (keepId === mergeId) throw new ValidationError('Selecciona dos clientes distintos.');

    const resultado = await prisma.$transaction(async (tx) => {
      const keep = await tx.cliente.findUnique({ where: { id: keepId } });
      const merge = await tx.cliente.findUnique({ where: { id: mergeId } });
      if (!keep || !merge) throw new NotFoundError('Cliente no encontrado.');

      // Reasignar las transacciones del duplicado al cliente que se conserva
      const reasignadas = await tx.transaccion.updateMany({
        where: { cliente_id: mergeId },
        data: { cliente_id: keepId },
      });

      // Liberar el teléfono del duplicado ANTES de copiarlo, para no chocar con el índice único
      await tx.cliente.update({ where: { id: mergeId }, data: { telefono: null } });

      // Completar datos faltantes del cliente que se conserva (usando los datos ya cargados del duplicado)
      await tx.cliente.update({
        where: { id: keepId },
        data: {
          nombre: keep.nombre || merge.nombre,
          telefono: keep.telefono ?? merge.telefono,
          email: keep.email ?? merge.email,
          nit: keep.nit ?? merge.nit,
          direccion: keep.direccion ?? merge.direccion,
        },
      });

      await tx.cliente.delete({ where: { id: mergeId } });

      await logAudit({
        usuarioId: session.id,
        rol: session.rol,
        accion: 'MODIFICO',
        entidad: 'Cliente',
        entidadId: keepId,
        detalle: `Fusionó cliente #${mergeId} (${merge.nombre}) en #${keepId} (${keep.nombre}); ${reasignadas.count} pedidos reasignados`,
      }, tx);

      return { reasignadas: reasignadas.count };
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    return handleApiError(e);
  }
}
