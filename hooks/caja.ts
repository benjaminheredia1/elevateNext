import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

type MetodoPago = 'EFECTIVO' | 'QR' | 'TARJETA';

export interface AperturaCajaInput {
  apertura_efectivo: number;
  apertura_qr: number;
  observaciones?: string;
}

export interface MovimientoManualInput {
  concepto: string;
  monto: number;
  metodo_pago: MetodoPago;
  categoria?: string;
}

export interface VentaFisicaInput {
  items: { producto_id: number; cantidad: number }[];
  metodo_pago: MetodoPago;
  es_cortesia?: boolean;
  cliente_nombre?: string;
}

export interface CierreCajaInput {
  real_efectivo: number;
  real_qr: number;
  observaciones?: string;
}

const cajaKey = ['caja'] as const;

export function useTurnoActivo() {
  return useQuery({
    queryKey: [...cajaKey, 'turno-activo'],
    queryFn: async () => {
      const res = await apiClient.get('/api/caja/turno-activo');
      return res.data;
    },
  });
}

export function useMovimientos() {
  return useQuery({
    queryKey: [...cajaKey, 'movimientos'],
    queryFn: async () => {
      const res = await apiClient.get('/api/caja/movimientos');
      return res.data;
    },
  });
}

export function useHistorial() {
  return useQuery({
    queryKey: [...cajaKey, 'historial'],
    queryFn: async () => {
      const res = await apiClient.get('/api/caja/historial');
      return res.data;
    },
  });
}

function useCajaMutation<TInput>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) => {
      const res = await apiClient.post(path, input);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cajaKey });
    },
  });
}

export function useAbrirCaja() {
  return useCajaMutation<AperturaCajaInput>('/api/caja/apertura');
}

export function useRegistrarIngreso() {
  return useCajaMutation<MovimientoManualInput>('/api/caja/ingreso');
}

export function useRegistrarGasto() {
  return useCajaMutation<MovimientoManualInput>('/api/caja/gasto');
}

export function useRegistrarVenta() {
  return useCajaMutation<VentaFisicaInput>('/api/caja/venta');
}

export function useCerrarCaja() {
  return useCajaMutation<CierreCajaInput>('/api/caja/cierre');
}
