import { z } from 'zod';

export const gastoFijoSchema = z.object({
  concepto: z.string().trim().min(2),
  categoria: z.string().trim().min(2),
  monto: z.coerce.number().positive(),
  frecuencia: z.enum(['MENSUAL', 'QUINCENAL', 'SEMANAL', 'ANUAL']).default('MENSUAL'),
  activo: z.boolean().optional(),
});

export const gastoFijoUpdateSchema = gastoFijoSchema.partial().extend({
  id: z.coerce.number().int().positive(),
});

export const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type GastoFijoInput = z.infer<typeof gastoFijoSchema>;
export type GastoFijoUpdateInput = z.infer<typeof gastoFijoUpdateSchema>;
