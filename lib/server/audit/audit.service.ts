import prisma from '@/lib/prisma';
import type { Prisma, Rol, AccionAuditoria } from '@prisma/client';

export interface AuditInput {
  usuarioId: number;
  rol: Rol;
  accion: AccionAuditoria;
  entidad: string;
  entidadId?: string | number | null;
  detalle: string;
  monto?: number | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Registra una acción en la auditoría (append-only).
 * Pasar `tx` para incluirlo en una transacción existente (consistencia).
 */
export async function logAudit(input: AuditInput, tx: Prisma.TransactionClient = prisma) {
  await tx.registroAuditoria.create({
    data: {
      usuario_id: input.usuarioId,
      rol: input.rol,
      accion: input.accion,
      entidad: input.entidad,
      entidad_id: input.entidadId != null ? String(input.entidadId) : null,
      detalle: input.detalle,
      monto: input.monto ?? null,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
    },
  });
}
