import { useQuery } from '@tanstack/react-query';
import apiClient from '@/hooks/api';
import type { VentaCaja } from '@/hooks/caja';

/** `todo` = sin filtro de fechas: desde el primer registro del negocio hasta hoy. */
export type RangoKey = 'hoy' | '7d' | 'mes' | 'todo' | 'custom';

export interface RangoState {
  rango: RangoKey;
  desde?: string;
  hasta?: string;
  sucursal?: string;
}

/** Query string del filtro de período y sucursal, compartido con los exports. */
export function queryString(input: RangoState = { rango: 'mes' }) {
  const params = new URLSearchParams();
  params.set('rango', input.rango);
  if (input.desde) params.set('desde', input.desde);
  if (input.hasta) params.set('hasta', input.hasta);
  if (input.sucursal) params.set('sucursal', input.sucursal);
  return params.toString();
}

export function useEstadoResultados(rango: RangoState) {
  return useQuery({
    queryKey: ['admin-finanzas', 'estado-resultados', rango],
    queryFn: async () => {
      const res = await apiClient.get(`/api/admin/contabilidad/estado-resultados?${queryString(rango)}`);
      return res.data;
    },
  });
}

export function useBalance(sucursal?: string) {
  return useQuery({
    queryKey: ['admin-finanzas', 'balance', sucursal ?? 'all'],
    queryFn: async () => {
      const params = sucursal ? `?sucursal=${encodeURIComponent(sucursal)}` : '';
      const res = await apiClient.get(`/api/admin/contabilidad/balance${params}`);
      return res.data;
    },
  });
}

export function useFlujoCaja(rango: RangoState) {
  return useQuery({
    queryKey: ['admin-finanzas', 'flujo-caja', rango],
    queryFn: async () => {
      const res = await apiClient.get(`/api/admin/flujo-caja?${queryString(rango)}`);
      return res.data;
    },
  });
}

/** Ventas del período con su detalle: las mismas que ve la caja, por sucursal. */
export function useVentasAdmin(rango: RangoState) {
  return useQuery({
    queryKey: ['admin-finanzas', 'ventas', rango],
    queryFn: async () => {
      const res = await apiClient.get(`/api/admin/ventas?${queryString(rango)}`);
      return res.data as VentasAdmin;
    },
  });
}

export interface VentasAdmin {
  desde: string;
  hasta: string;
  total: number;
  /** Hay más ventas en el período de las que se devolvieron. */
  truncado: boolean;
  ventas: VentaCaja[];
}

export function useTurnos(rango: RangoState) {
  return useQuery({
    queryKey: ['admin-finanzas', 'turnos', rango],
    queryFn: async () => {
      const res = await apiClient.get(`/api/admin/caja/turnos?${queryString(rango)}`);
      return res.data;
    },
  });
}

export function useTurnoDetalleAdmin(turnoId: number | null) {
  return useQuery({
    queryKey: ['admin-finanzas', 'turno-detalle', turnoId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/admin/caja/turnos/${turnoId}`);
      return res.data;
    },
    enabled: turnoId != null,
  });
}
