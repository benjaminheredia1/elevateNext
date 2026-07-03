import { z } from 'zod';

export const metodoPagoSchema = z.enum(['EFECTIVO', 'QR', 'TARJETA']);

export const AperturaCajaDTO = z.object({
  apertura_efectivo: z.number().min(0),
  apertura_qr: z.number().min(0),
  observaciones: z.string().trim().max(500).optional(),
});

export const MovimientoManualDTO = z.object({
  concepto: z.string().trim().min(1).max(200),
  monto: z.number().positive(),
  metodo_pago: metodoPagoSchema,
  categoria: z.string().trim().max(100).optional(),
});

export const CierreCajaDTO = z.object({
  real_efectivo: z.number().min(0),
  real_qr: z.number().min(0),
  observaciones: z.string().trim().max(500).optional(),
});

export const VentaFisicaDTO = z.object({
  items: z.array(z.object({
    producto_id: z.number().int().positive(),
    cantidad: z.number().positive(),
  })).min(1),
  metodo_pago: metodoPagoSchema,
  es_cortesia: z.boolean().optional().default(false),
  es_fiado: z.boolean().optional().default(false),
  fiado_vencimiento: z.coerce.date().optional().nullable(),
  cliente_id: z.coerce.number().int().positive().optional(),
  cliente_nombre: z.string().trim().max(120).optional(),
  cliente_telefono: z.string().trim().max(30).optional(),
  cliente_email: z.string().trim().max(120).optional(),
  cliente_nit: z.string().trim().max(30).optional(),
  cliente_anonimo: z.boolean().optional().default(false),
});

export type AperturaCajaInput = z.infer<typeof AperturaCajaDTO>;
export type MovimientoManualInput = z.infer<typeof MovimientoManualDTO>;
export type CierreCajaInput = z.infer<typeof CierreCajaDTO>;
export type VentaFisicaInput = z.infer<typeof VentaFisicaDTO>;
