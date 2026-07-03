import { z } from 'zod';

export const gastoOperativoSchema = z.object({
  concepto: z.string().trim().min(2),
  categoria: z.string().trim().min(2),
  monto: z.coerce.number().positive(),
  metodo_pago: z.enum(['EFECTIVO', 'QR']),
  fecha: z.coerce.date(),
  notas: z.string().trim().max(500).optional(),
});

export const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type GastoOperativoInput = z.infer<typeof gastoOperativoSchema>;
