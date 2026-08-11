import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export const CATEGORIAS_ACTIVO = [
  'Refrigeración',
  'Mobiliario',
  'Tecnología',
  'Vehículos',
  'Equipos de cocina',
  'Otros',
] as const;

export type CategoriaActivo = (typeof CATEGORIAS_ACTIVO)[number];

export type MetodoPagoActivo = 'EFECTIVO' | 'QR';

export interface ActivoFijoPayload {
  id?: number;
  nombre: string;
  categoria: CategoriaActivo;
  fecha_compra: string;
  valor_original: number;
  /** Lo calcula el backend por depreciacion; el formulario ya no lo pide. */
  valor_actual?: number;
  depreciacion_pct?: number | null;
  /** Vida util cuando la depreciacion se cargo por anios en vez de por %. */
  vida_util_anios?: number | null;
  metodo_pago: MetodoPagoActivo;
  notas?: string | null;
}

export function useActivosFijos(incluirInactivos = false) {
  return useQuery({
    queryKey: ['admin', 'activos-fijos', incluirInactivos],
    queryFn: async () =>
      (await apiClient.get(`/api/admin/activos-fijos?incluirInactivos=${incluirInactivos}`)).data,
  });
}

export function useGuardarActivoFijo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ActivoFijoPayload) => {
      if (payload.id) return (await apiClient.put('/api/admin/activos-fijos', payload)).data;
      return (await apiClient.post('/api/admin/activos-fijos', payload)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'activos-fijos'] }),
  });
}

export function useEliminarActivoFijo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await apiClient.delete(`/api/admin/activos-fijos?id=${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'activos-fijos'] }),
  });
}
