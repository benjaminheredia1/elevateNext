import { z } from 'zod';

export const usuarioCreateSchema = z.object({
  nombre: z.string().trim().min(2),
  apellido_paterno: z.string().trim().min(2),
  apellido_materno: z.string().trim().min(2),
  email: z.string().email(),
  username: z.string().trim().min(3).optional().nullable(),
  password: z.string().min(6),
  rol: z.enum(['DUENO', 'ADMIN', 'CAJERO', 'CLIENTE']),
  sucursal_id: z.coerce.number().int().positive().optional().nullable(),
});

export const usuarioUpdateSchema = z.object({
  id: z.coerce.number().int().positive(),
  nombre: z.string().trim().min(2).optional(),
  apellido_paterno: z.string().trim().min(2).optional(),
  apellido_materno: z.string().trim().min(2).optional(),
  email: z.string().email().optional(),
  username: z.string().trim().min(3).optional().nullable(),
  password: z.string().min(6).optional(),
  rol: z.enum(['DUENO', 'ADMIN', 'CAJERO', 'CLIENTE']).optional(),
  activo: z.boolean().optional(),
  sucursal_id: z.coerce.number().int().positive().optional().nullable(),
});

export const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type UsuarioCreateInput = z.infer<typeof usuarioCreateSchema>;
export type UsuarioUpdateInput = z.infer<typeof usuarioUpdateSchema>;
