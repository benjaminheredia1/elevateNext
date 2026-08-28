'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export interface CentroProduccion {
  id: number;
  nombre: string;
  direccion: string | null;
  activo: boolean;
  created_at: string;
}

export interface ItemStockCentro {
  insumo_id: number;
  centro_id: number;
  nombre: string;
  unidad_medida: string;
  categoria_insumo: string | null;
  proveedor: string | null;
  stock_actual: number;
  costo_promedio: number;
  stock_minimo: number;
  punto_critico: number;
  activo: boolean;
  nivel: 'ok' | 'bajo' | 'critico' | 'baja';
}

export function useCentrosProduccion() {
  return useQuery({
    queryKey: ['centros-produccion'],
    queryFn: async (): Promise<CentroProduccion[]> =>
      (await apiClient.get('/api/admin/centros-produccion')).data?.items ?? [],
  });
}

export function useCrearCentro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nombre: string; direccion?: string }) =>
      (await apiClient.post('/api/admin/centros-produccion', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['centros-produccion'] }),
  });
}

export function useInventarioCentro(centroId: number | null) {
  return useQuery({
    queryKey: ['centro-produccion', 'inventario', centroId],
    enabled: centroId != null,
    queryFn: async (): Promise<ItemStockCentro[]> =>
      (await apiClient.get(`/api/admin/centros-produccion/${centroId}/insumos`)).data?.items ?? [],
  });
}

export function useAltaInsumoCentro(centroId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      nombre: string; unidad_medida: string; stock_inicial: number;
      costo_unitario: number; stock_minimo: number; punto_critico: number;
    }) => (await apiClient.post(`/api/admin/centros-produccion/${centroId}/insumos`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['centro-produccion', 'inventario', centroId] }),
  });
}

interface AccionCentroBase {
  centro_id: number;
  insumo_id: number;
  /**
   * Clave de idempotencia. Viaja como cabecera `Idempotency-Key`, no en el
   * cuerpo. La genera la pantalla al ABRIR el formulario y no al enviarlo: si
   * se generara al enviar, cada reintento traería una clave distinta, el
   * servidor vería dos operaciones diferentes y la protección no existiría.
   */
  idempotency_key?: string;
}

function useAccionCentro<T extends AccionCentroBase>(url: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => {
      const { idempotency_key, ...body } = input;
      return (await apiClient.post(url, body, {
        headers: idempotency_key ? { 'Idempotency-Key': idempotency_key } : undefined,
      })).data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['centro-produccion', 'inventario', variables.centro_id] });
    },
  });
}

export function useCompraCentro() {
  return useAccionCentro<AccionCentroBase & { cantidad: number; costo_unitario: number; nota?: string }>(
    '/api/admin/centros-produccion/compra',
  );
}

export function useMermaCentro() {
  return useAccionCentro<AccionCentroBase & { cantidad: number; descripcion: string }>(
    '/api/admin/centros-produccion/merma',
  );
}

export function useConteoCentro() {
  return useAccionCentro<AccionCentroBase & { nuevo_stock: number; descripcion?: string }>(
    '/api/admin/centros-produccion/conteo',
  );
}

export function useBajaInsumoCentro() {
  return useAccionCentro<AccionCentroBase & { motivo: string }>(
    '/api/admin/centros-produccion/baja',
  );
}

export function useReactivarInsumoCentro() {
  return useAccionCentro<AccionCentroBase>(
    '/api/admin/centros-produccion/reactivar',
  );
}

export function useEditarUmbralesCentro() {
  return useAccionCentro<AccionCentroBase & { stock_minimo: number; punto_critico: number }>(
    '/api/admin/centros-produccion/umbrales',
  );
}
