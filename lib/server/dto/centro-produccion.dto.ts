import { z } from 'zod';

export const CrearCentroSchema = z.object({
  nombre:    z.string().trim().min(2).max(120),
  direccion: z.string().trim().max(200).optional(),
});
export type CrearCentroInput = z.infer<typeof CrearCentroSchema>;

export const EditarCentroSchema = z.object({
  nombre:    z.string().trim().min(2).max(120).optional(),
  direccion: z.string().trim().max(200).optional(),
  activo:    z.boolean().optional(),
});
export type EditarCentroInput = z.infer<typeof EditarCentroSchema>;

// ── Insumo bruto del centro ────────────────────────────────────────
export const UnidadMedidaCentroSchema = z.enum(['KG', 'GR', 'UNIDAD', 'LT', 'ML']);

export const AltaInsumoCentroSchema = z.object({
  nombre:         z.string().trim().min(1),
  unidad_medida:  UnidadMedidaCentroSchema.default('UNIDAD'),
  stock_inicial:  z.number().min(0).default(0),
  costo_unitario: z.number().min(0).default(0),
  stock_minimo:   z.number().min(0).default(0),
  punto_critico:  z.number().min(0).default(0),
});
export type AltaInsumoCentroInput = z.infer<typeof AltaInsumoCentroSchema>;

export const RegistrarCompraCentroSchema = z.object({
  centro_id:      z.number().int().positive(),
  insumo_id:      z.number().int().positive(),
  cantidad:       z.number().positive(),
  costo_unitario: z.number().positive(),
  nota:           z.string().optional(),
});
export type RegistrarCompraCentroInput = z.infer<typeof RegistrarCompraCentroSchema>;

export const RegistrarMermaCentroSchema = z.object({
  centro_id:   z.number().int().positive(),
  insumo_id:   z.number().int().positive(),
  cantidad:    z.number().positive(),
  descripcion: z.string().min(1),
});
export type RegistrarMermaCentroInput = z.infer<typeof RegistrarMermaCentroSchema>;

export const ConteoFisicoCentroSchema = z.object({
  centro_id:   z.number().int().positive(),
  insumo_id:   z.number().int().positive(),
  nuevo_stock: z.number().min(0),
  descripcion: z.string().optional(),
});
export type ConteoFisicoCentroInput = z.infer<typeof ConteoFisicoCentroSchema>;

export const RegistrarBajaCentroSchema = z.object({
  centro_id: z.number().int().positive(),
  insumo_id: z.number().int().positive(),
  motivo:    z.string().min(1),
});
export type RegistrarBajaCentroInput = z.infer<typeof RegistrarBajaCentroSchema>;

export const ReactivarInsumoCentroSchema = z.object({
  centro_id: z.number().int().positive(),
  insumo_id: z.number().int().positive(),
});
export type ReactivarInsumoCentroInput = z.infer<typeof ReactivarInsumoCentroSchema>;

export const EditarUmbralesCentroSchema = z.object({
  centro_id:     z.number().int().positive(),
  insumo_id:     z.number().int().positive(),
  stock_minimo:  z.number().min(0),
  punto_critico: z.number().min(0),
});
export type EditarUmbralesCentroInput = z.infer<typeof EditarUmbralesCentroSchema>;
