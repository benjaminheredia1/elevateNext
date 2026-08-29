'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export type EstadoTraslado = 'EN_TRANSITO' | 'RECIBIDO' | 'ANULADO';

export interface TrasladoDetalle {
  id: number;
  insumo_id: number;
  cantidad_enviada: number;
  cantidad_recibida: number | null;
  costo_unitario: number;
  insumo: { nombre: string; unidad_medida: string };
  /**
   * Primera vez que este local recibe este producto. Recibirlo no es reponer
   * stock: es sumarlo al catálogo del local, y quien confirma tiene que saberlo.
   */
  nuevo_en_sucursal: boolean;
}

export interface Traslado {
  id: number;
  numero: number;
  estado: EstadoTraslado;
  centro_id: number;
  sucursal_id: number;
  fecha_envio: string;
  fecha_recepcion: string | null;
  observaciones: string | null;
  detalles: TrasladoDetalle[];
  sucursal: { id: number; nombre: string };
  centro: { id: number; nombre: string };
}

interface RespuestaTraslados {
  items: Traslado[];
  /** Valor de lo despachado que todavía no se recibió. */
  valor_en_transito: number;
}

export function useTraslados(filtros: { centroId?: number | null; estado?: EstadoTraslado } = {}) {
  const params = new URLSearchParams();
  if (filtros.centroId != null) params.set('centro_id', String(filtros.centroId));
  if (filtros.estado) params.set('estado', filtros.estado);

  return useQuery({
    queryKey: ['traslados', filtros.centroId ?? null, filtros.estado ?? null],
    queryFn: async (): Promise<RespuestaTraslados> =>
      (await apiClient.get(`/api/admin/traslados?${params.toString()}`)).data,
  });
}

export function useCrearEnvio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      centro_id: number;
      sucursal_id: number;
      lineas: { insumo_id: number; cantidad: number }[];
      observaciones?: string;
      idempotency_key?: string;
    }) => {
      const { idempotency_key, ...body } = input;
      return (await apiClient.post('/api/admin/traslados', body, {
        headers: idempotency_key ? { 'Idempotency-Key': idempotency_key } : undefined,
      })).data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['traslados'] });
      // Despachar descuenta del centro: el inventario que se está mirando
      // quedó viejo en el mismo instante.
      qc.invalidateQueries({ queryKey: ['centro-produccion', 'inventario', variables.centro_id] });
    },
  });
}

export function useRecibirTraslado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      traslado_id: number;
      recibido: { insumo_id: number; cantidad_recibida: number }[];
    }) => (await apiClient.post('/api/admin/traslados/recibir', input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['traslados'] });
      // La mercadería entró al inventario del local.
      qc.invalidateQueries({ queryKey: ['insumos'] });
    },
  });
}

export function useAnularTraslado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { traslado_id: number; motivo: string }) =>
      (await apiClient.post('/api/admin/traslados/anular', input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['traslados'] });
      qc.invalidateQueries({ queryKey: ['centro-produccion'] });
    },
  });
}
