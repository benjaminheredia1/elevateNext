import { z } from 'zod';

export const privilegioSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  descripcion: z.string().trim().max(300).optional(),
  porcentaje: z.coerce.number().min(0).max(100),
  activo: z.boolean().optional(),
});

export const privilegioUpdateSchema = privilegioSchema.partial().extend({
  id: z.coerce.number().int().positive(),
});

export const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type PrivilegioInput = z.infer<typeof privilegioSchema>;
export type PrivilegioUpdateInput = z.infer<typeof privilegioUpdateSchema>;
