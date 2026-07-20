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
  metodo_pago: MetodoPago | 'MIXTO';
  /** Obligatorio cuando metodo_pago = MIXTO; debe sumar exactamente el total. */
  pago_mixto?: { efectivo: number; qr: number };
  /** Abono a la deuda del cliente cobrado junto con la venta (Bs). */
  abono_deuda?: number;
  /** Privilegio (descuento) elegido por el cajero para esta venta: uno solo. */
  privilegio_id?: number;
  es_cortesia?: boolean;
  es_fiado?: boolean;
  fiado_vencimiento?: string | null;
  cliente_id?: number;
  cliente_nombre?: string;
  cliente_telefono?: string;
  cliente_email?: string;
  cliente_nit?: string;
  cliente_anonimo?: boolean;
}

export interface CierreCajaInput {
  real_efectivo: number;
  real_qr: number;
  observaciones?: string;
}

export interface PrivilegioResumen {
  id: number;
  nombre: string;
  porcentaje: number;
  descripcion?: string | null;
}

export interface ClienteResultado {
  id: number;
  nombre: string;
  telefono: string | null;
  nit: string | null;
  email: string | null;
  /** Saldo total de fiados pendientes (Bs). */
  deuda_saldo?: number;
}

/** Directorio de clientes para la página Clientes de caja (navega sin búsqueda). */
export function useClientesDirectorio(q: string) {
  return useQuery({
    queryKey: ['caja', 'clientes-directorio', q],
    queryFn: async () => {
      const res = await apiClient.get(`/api/caja/clientes?browse=1&q=${encodeURIComponent(q)}`);
      return res.data.data as ClienteResultado[];
    },
  });
}

/** Privilegios activos: catálogo para aplicar descuento por venta en el POS. */
export function usePrivilegiosCaja() {
  return useQuery({
    queryKey: ['caja', 'privilegios'],
    queryFn: async () => (await apiClient.get('/api/caja/privilegios')).data.data as PrivilegioResumen[],
  });
}

export interface EditarClienteInput {
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  nit?: string | null;
}

export function useEditarCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clienteId, datos }: { clienteId: number; datos: EditarClienteInput }) =>
      (await apiClient.put(`/api/caja/clientes/${clienteId}`, datos)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja', 'clientes-directorio'] });
      qc.invalidateQueries({ queryKey: ['caja', 'clientes'] });
    },
  });
}

export interface CrearClienteCajaInput {
  nombre: string;
  telefono?: string;
  email?: string;
  nit?: string;
}

/** Alta de cliente desde caja (sin venta). */
export function useCrearClienteCaja() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (datos: CrearClienteCajaInput) =>
      (await apiClient.post('/api/caja/clientes', datos)).data.data as ClienteResultado,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja', 'clientes-directorio'] });
      qc.invalidateQueries({ queryKey: ['caja', 'clientes'] });
    },
  });
}

/** Cobro de deuda sin compra (FIFO sobre los fiados del cliente). */
export function useAbonarDeuda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clienteId, pagos, cuenta_ids }: {
      clienteId: number;
      pagos: { metodo_pago: 'EFECTIVO' | 'QR' | 'TARJETA'; monto: number }[];
      cuenta_ids?: number[];
    }) =>
      (await apiClient.post(`/api/caja/clientes/${clienteId}/abono`, { pagos, cuenta_ids })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja'] });
    },
  });
}

export function useBuscarClientes(q: string, browse = false) {
  const conQuery = q.trim().length >= 2;
  return useQuery({
    queryKey: ['caja', 'clientes', conQuery ? q : (browse ? '*' : '')],
    queryFn: async () => {
      const params = conQuery ? `q=${encodeURIComponent(q)}` : 'browse=1';
      const res = await apiClient.get(`/api/caja/clientes?${params}`);
      return res.data.data as ClienteResultado[];
    },
    enabled: conQuery || browse,
  });
}

export function useDeudores(enabled = true) {
  return useQuery({
    queryKey: ['caja', 'deudores'],
    queryFn: async () => (await apiClient.get('/api/caja/deudores')).data,
    enabled,
  });
}

export function useAplicarDescuentoDeuda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, privilegio_id }: { id: number; privilegio_id: number }) =>
      (await apiClient.post(`/api/caja/deudores/${id}/descuento`, { privilegio_id })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja', 'deudores'] });
      qc.invalidateQueries({ queryKey: ['admin', 'cuentas-corrientes'] });
    },
  });
}

export function useCobrarDeuda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pagos }: { id: number; pagos: { metodo_pago: 'EFECTIVO' | 'QR' | 'TARJETA'; monto: number }[] }) =>
      (await apiClient.post(`/api/caja/deudores/${id}/pago`, { pagos })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja', 'deudores'] });
      qc.invalidateQueries({ queryKey: ['caja', 'turno-activo'] });
    },
  });
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

export function useResumenRepartidores() {
  return useQuery({
    queryKey: [...cajaKey, 'repartidores'],
    queryFn: async () => {
      const res = await apiClient.get('/api/caja/repartidores');
      return res.data?.data as {
        turno: { id: number; fecha_apertura: string } | null;
        repartidores: { repartidor: string; pedidos: number; en_curso: number; entregados: number; efectivo_adelantado: number; total: number }[];
      };
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

export function useTurnoDetalle(turnoId: number | null) {
  return useQuery({
    queryKey: [...cajaKey, 'historial', turnoId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/caja/historial/${turnoId}`);
      return res.data;
    },
    enabled: turnoId != null,
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
