import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export type TipoCuenta = 'POR_COBRAR' | 'POR_PAGAR';
export type EstadoCuenta = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'TODAS';

export interface CuentaPayload {
  tipo: TipoCuenta;
  contraparte: string;
  concepto: string;
  monto: number;
  vencimiento?: string | null;
  cliente_id?: number | null;
  transaccion_id?: number | null;
}

export interface FiadoPayload {
  transaccion_id: number;
  concepto?: string;
  vencimiento?: string | null;
}

export function useCuentas(tipo?: TipoCuenta, estado?: EstadoCuenta) {
  return useQuery({
    queryKey: ['admin', 'cuentas-corrientes', tipo, estado],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tipo) params.set('tipo', tipo);
      if (estado && estado !== 'TODAS') params.set('estado', estado);
      return (await apiClient.get(`/api/admin/cuentas-corrientes?${params}`)).data;
    },
  });
}

export function useCrearCuenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CuentaPayload) =>
      (await apiClient.post('/api/admin/cuentas-corrientes', payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'cuentas-corrientes'] }),
  });
}

export function useCrearFiado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FiadoPayload) =>
      (await apiClient.post('/api/admin/cuentas-corrientes/fiado', payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'cuentas-corrientes'] }),
  });
}

export function useRegistrarPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, monto }: { id: number; monto: number }) =>
      (await apiClient.put(`/api/admin/cuentas-corrientes/${id}/pago`, { monto })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'cuentas-corrientes'] }),
  });
}

export function useDeudasVencidas() {
  return useQuery({
    queryKey: ['admin', 'deudas-vencidas'],
    queryFn: async () =>
      (await apiClient.get('/api/admin/alertas/deudas-vencidas')).data,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useEnviarAlertaDeudas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await apiClient.post('/api/admin/alertas/deudas-vencidas', {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'deudas-vencidas'] }),
  });
}
