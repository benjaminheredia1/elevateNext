import { z } from 'zod';

export const cuentaCorrienteSchema = z.object({
  tipo: z.enum(['POR_COBRAR', 'POR_PAGAR']),
  contraparte: z.string().trim().min(2),
  concepto: z.string().trim().min(2),
  monto: z.coerce.number().positive(),
  vencimiento: z.coerce.date().optional().nullable(),
  cliente_id: z.coerce.number().int().positive().optional().nullable(),
  transaccion_id: z.coerce.number().int().positive().optional().nullable(),
});

// Schema para crear un "fiado" a partir de un pedido existente
export const fiadoSchema = z.object({
  transaccion_id: z.coerce.number().int().positive(),
  concepto: z.string().trim().min(2).optional(),
  vencimiento: z.coerce.date().optional().nullable(),
});

export const pagoSchema = z.object({
  monto: z.coerce.number().positive(),
  metodo_pago: z.enum(['EFECTIVO', 'QR', 'TARJETA', 'BANCO']).optional(),
});

export const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CuentaCorrienteInput = z.infer<typeof cuentaCorrienteSchema>;
export type FiadoInput = z.infer<typeof fiadoSchema>;
export type PagoInput = z.infer<typeof pagoSchema>;
