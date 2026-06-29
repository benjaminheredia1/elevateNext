import { z } from 'zod';

export const cuentaCorrienteSchema = z.object({
  tipo: z.enum(['POR_COBRAR', 'POR_PAGAR']),
  contraparte: z.string().trim().min(2),
  concepto: z.string().trim().min(2),
  monto: z.coerce.number().positive(),
  vencimiento: z.coerce.date().optional().nullable(),
});

export const pagoSchema = z.object({
  monto: z.coerce.number().positive(),
});

export const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CuentaCorrienteInput = z.infer<typeof cuentaCorrienteSchema>;
export type PagoInput = z.infer<typeof pagoSchema>;
