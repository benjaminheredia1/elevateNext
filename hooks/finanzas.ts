import { useQuery } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export type RangoKey = 'hoy' | '7d' | 'mes' | 'custom';

export interface RangoState {
  rango: RangoKey;
  desde?: string;
  hasta?: string;
  sucursal?: string;
}

function queryString(input: RangoState = { rango: 'mes' }) {
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

export function useTurnos(rango: RangoState) {
  return useQuery({
    queryKey: ['admin-finanzas', 'turnos', rango],
    queryFn: async () => {
      const res = await apiClient.get(`/api/admin/caja/turnos?${queryString(rango)}`);
      return res.data;
    },
  });
}
