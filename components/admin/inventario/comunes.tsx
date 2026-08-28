'use client';

/**
 * Piezas que comparten el núcleo de inventario y el marco de cada pantalla:
 * los tipos de la fila de stock, los formatos de presentación y los dos campos
 * de formulario (unidad y ayuda de costo) que aparecen tanto en la ficha del
 * insumo como en el modal de compra.
 *
 * Están acá y no dentro del núcleo porque el marco también las usa: dejarlas
 * en el componente obligaría a importar el núcleo solo para formatear un número.
 */

import { useEffect, useState } from 'react';
import { convertir, unidadesEntrada } from '@/lib/unidades';

export type EstadoStock = 'ok' | 'bajo' | 'critico' | 'agotado';

export interface Insumo {
  id: number;
  nombre: string;
  stock_actual: number;
  stock_minimo: number;
  punto_critico: number;
  unidad_medida: 'KG' | 'GR' | 'UNIDAD' | 'LT' | 'ML' | string;
  costo_promedio: number;
  es_mixto: boolean;
  uso_diario_promedio: number | null;
  categoria_insumo: string | null;
  proveedor: string | null;
  equivalencia_unidad: string | null;
  equivalencia_cantidad: number | null;
  activo: boolean;
  fecha_baja: string | null;
  motivo_baja: string | null;
}

export interface Movimiento {
  id: number;
  tipo_movimiento: string;
  cantidad: number;
  descripcion: string;
  costo_unitario: number | null;
  responsable?: string | null;
  created_at: string;
  insumo: { nombre: string; unidad_medida: string };
}

export interface UnidadMedidaRow {
  id: number;
  nombre: string;
  activo: boolean;
}

export const STOCK_META: Record<EstadoStock, { label: string; className: string; color: string }> = {
  ok: { label: 'OK', className: 'publicado', color: 'var(--fresh)' },
  bajo: { label: 'Bajo', className: 'borrador', color: 'var(--amber)' },
  critico: { label: 'Crítico', className: 'archivado', color: 'var(--danger)' },
  agotado: { label: 'Agotado', className: 'archivado', color: 'var(--danger)' },
};

export const MOVEMENT_META: Record<string, { label: string; color: string }> = {
  INGRESO: { label: 'Ingreso', color: 'var(--fresh)' },
  EGRESO: { label: 'Egreso', color: 'var(--amber)' },
  PRODUCCION: { label: 'Producción', color: 'var(--info)' },
  VENTA: { label: 'Venta', color: 'var(--info)' },
  MERMA: { label: 'Merma', color: 'var(--danger)' },
  AJUSTE: { label: 'Ajuste', color: 'var(--kale)' },
  BAJA: { label: 'Baja', color: 'var(--danger)' },
};

export const UNIDADES_MEDIDA = ['ML', 'LT', 'GR', 'KG'];

export const UNIDAD_LABELS: Record<string, { label: string; sufijo: string }> = {
  ML: { label: 'mililitros', sufijo: 'ml' },
  LT: { label: 'litros', sufijo: 'L' },
  GR: { label: 'gramos', sufijo: 'g' },
  KG: { label: 'kilogramos', sufijo: 'kg' },
  UNIDAD: { label: 'unidades', sufijo: 'u.' },
};

export function medidaInfo(u: string) {
  return UNIDAD_LABELS[u.toUpperCase()] ?? { label: u.toLowerCase(), sufijo: u.toLowerCase() };
}

export function stockState(insumo: Insumo): EstadoStock {
  if (insumo.stock_actual <= 0) return 'agotado';
  const critico = insumo.punto_critico > 0 ? insumo.punto_critico : insumo.stock_minimo;
  if (insumo.stock_actual <= critico) return 'critico';
  if (insumo.stock_actual <= insumo.stock_minimo) return 'bajo';
  return 'ok';
}

export function money(value: number) {
  return `Bs ${Number(value || 0).toFixed(2)}`;
}

export function number(value: number) {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function coverage(insumo: Insumo) {
  if (!insumo.uso_diario_promedio || insumo.uso_diario_promedio <= 0) return '—';
  return `${Math.floor(insumo.stock_actual / insumo.uso_diario_promedio)} días`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-BO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function errorMsg(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
  if (e?.response?.status === 403) return 'No tienes permiso. Inicia sesión como administrador o dueño.';
  if (e?.response?.status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  return e?.response?.data?.error ?? e?.response?.data?.message ?? 'Ocurrió un error. Intenta de nuevo.';
}

export function UnidadFieldGroup({
  unidadMedida,
  unidadesParaSelect,
  equivalenciaUnidad,
  equivalenciaCantidad,
  onUnidadChange,
  onEquivalenciaUnidadChange,
  onEquivalenciaCantidadChange,
  onNuevaUnidad,
}: {
  unidadMedida: string;
  unidadesParaSelect: UnidadMedidaRow[];
  equivalenciaUnidad: string;
  equivalenciaCantidad: string;
  onUnidadChange: (value: string) => void;
  onEquivalenciaUnidadChange: (value: string) => void;
  onEquivalenciaCantidadChange: (value: string) => void;
  onNuevaUnidad: () => void;
}) {
  // El "contenido por unidad" solo aplica a unidades discretas (UNIDAD, CAJA,
  // BOTELLA...). Para medidas físicas (lt, kg, gr, ml) no se muestra: el stock
  // ya está en esa medida y el campo solo causaba confusión. El tamaño del
  // envase de esos insumos se captura al registrar compras/conteos por envases.
  const unidadEsMedida = UNIDADES_MEDIDA.includes(unidadMedida.trim().toUpperCase());
  const mostrarPanel = unidadMedida.trim() !== '' && !unidadEsMedida;
  const info = equivalenciaUnidad ? medidaInfo(equivalenciaUnidad) : null;

  const cambiarUnidad = (value: string) => {
    onUnidadChange(value);
    // Al cambiar a una medida física el contenido deja de aplicar: se limpia
    // para no guardar valores obsoletos que quedarían ocultos.
    if (UNIDADES_MEDIDA.includes(value.trim().toUpperCase())) {
      onEquivalenciaUnidadChange('');
      onEquivalenciaCantidadChange('');
    }
  };

  const cambiarCantidad = (value: string) => {
    onEquivalenciaCantidadChange(value);
  };

  return (
    <label className="form-group">
      <span>Unidad</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={unidadMedida} onChange={event => cambiarUnidad(event.target.value)} style={{ flex: 1 }}>
          {unidadesParaSelect.map(unidad => <option key={unidad.id} value={unidad.nombre}>{unidad.nombre}</option>)}
        </select>
        <button className="admin-btn secondary" onClick={onNuevaUnidad} type="button">+ Nueva</button>
      </div>
      {mostrarPanel && (
        <div className="unidad-contenido-panel">
          <div className="form-group">
            <span>Contenido de cada {unidadMedida.toLowerCase()} <span className="form-hint">— opcional</span></span>
            <div className="input-suffix">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="1.00"
                value={equivalenciaCantidad}
                onChange={event => cambiarCantidad(event.target.value)}
              />
              <select
                value={equivalenciaUnidad}
                onChange={event => onEquivalenciaUnidadChange(event.target.value)}
                style={{ border: 'none', background: 'transparent', fontSize: 12 }}
              >
                <option value="">med.</option>
                {UNIDADES_MEDIDA.map(u => <option key={u} value={u}>{medidaInfo(u).sufijo}</option>)}
              </select>
            </div>
          </div>
          {equivalenciaCantidad && info && (
            <span className="form-hint">
              1 {unidadMedida} de este insumo = {equivalenciaCantidad} {info.sufijo}. No afecta stock ni recetas.
            </span>
          )}
        </div>
      )}
    </label>
  );
}

/**
 * Ayuda para capturar el costo unitario sin calcular mentalmente: el usuario
 * anota cuánto pagó y por cuánta cantidad (en la unidad que le acomode) y el
 * costo por unidad base se calcula y aplica solo.
 */
export function CostoAyuda({ unidadBase, onCalculado }: { unidadBase: string; onCalculado: (costo: string) => void }) {
  const opciones = unidadesEntrada(unidadBase);
  const [precio, setPrecio] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [unidad, setUnidad] = useState(opciones[0]?.key ?? unidadBase);

  useEffect(() => {
    if (!opciones.some(o => o.key === unidad)) setUnidad(opciones[0]?.key ?? unidadBase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadBase]);

  const recalc = (precioTxt: string, cantTxt: string, uni: string) => {
    setPrecio(precioTxt); setCantidad(cantTxt); setUnidad(uni);
    const pr = parseFloat(precioTxt);
    const ca = parseFloat(cantTxt);
    const enBase = Number.isFinite(ca) && ca > 0 ? convertir(ca, uni, unidadBase) : null;
    if (Number.isFinite(pr) && pr > 0 && enBase && enBase > 0) {
      onCalculado(String(Number((pr / enBase).toFixed(6))));
    }
  };

  return (
    <div className="form-group full">
      <span className="form-hint">¿No sabes el costo por {medidaInfo(unidadBase).sufijo}? Anota tu compra y se calcula solo:</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span className="form-hint">Pagué Bs</span>
        <input type="number" min="0" step="0.01" placeholder="40" value={precio} style={{ width: 90 }}
          onChange={e => recalc(e.target.value, cantidad, unidad)} />
        <span className="form-hint">por</span>
        <input type="number" min="0" step="0.01" placeholder="1" value={cantidad} style={{ width: 90 }}
          onChange={e => recalc(precio, e.target.value, unidad)} />
        {opciones.length > 1 ? (
          <select value={unidad} onChange={e => recalc(precio, cantidad, e.target.value)} style={{ width: 'auto' }}>
            {opciones.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        ) : (
          <span className="form-hint">{medidaInfo(unidadBase).sufijo}</span>
        )}
      </div>
    </div>
  );
}
