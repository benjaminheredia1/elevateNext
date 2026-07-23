'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import apiClient from '@/hooks/api';
import { foodCostColor } from './inventoryData';

type Period = 'hoy' | '7d' | '30d';

interface DashboardData {
  rango: string;
  kpis: {
    ventas: number;
    pedidos: number;
    cancelados: number;
    ticket_promedio: number;
    utilidad: number;
    margen_bruto_pct: number;
    food_cost_pct: number;
    por_cobrar: number;
    pedidos_pendientes: number;
  };
  contabilidad: {
    ingresos: number;
    cmv: number;
    gastos_operativos: number;
    gastos_fijos_prorrateados: number;
    utilidad: number;
  };
  serie: { fecha: string; ventas: number; pedidos: number }[];
  mas_vendidos: { producto_id: number; nombre: string; cantidad: number; total: number }[];
  alertas_inventario: InsumoAlerta[];
  turno_activo: {
    id: number;
    estado: string;
    fecha_apertura: string;
    cajero?: { nombre: string | null; email: string };
    sucursal?: { nombre: string };
  } | null;
  pedidos_recientes: PedidoReciente[];
}

interface PedidoReciente {
  id: number;
  cliente_nombre: string | null;
  total: number;
  estado: string;
  created_at: string;
  transaccionesDetalles_id: { producto: { nombre: string } }[];
}

interface InsumoAlerta {
  id: number;
  nombre: string;
  stock_actual: number;
  stock_minimo: number;
  unidad_medida: string;
  nivel: 'critico' | 'advertencia' | 'ok';
  porcentaje: number;
}

const PERIOD_LABELS: Record<Period, string> = {
  hoy: 'Hoy',
  '7d': 'Semana',
  '30d': 'Mes',
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; activity: string }> = {
  PENDIENTE: { label: 'Pendiente', color: 'var(--amber)', bg: 'rgba(232,163,23,.14)', activity: 'order' },
  EN_PREPARACION: { label: 'Preparando', color: 'var(--info)', bg: 'rgba(59,130,196,.14)', activity: 'prep' },
  EN_CAMINO: { label: 'En camino', color: 'var(--kale)', bg: 'rgba(20,52,42,.12)', activity: 'driver' },
  ENTREGADO: { label: 'Entregado', color: 'var(--fresh)', bg: 'rgba(31,169,113,.14)', activity: 'done' },
  PAGADO: { label: 'Pagado', color: 'var(--fresh)', bg: 'rgba(31,169,113,.14)', activity: 'done' },
  CANCELADO: { label: 'Cancelado', color: 'var(--danger)', bg: 'rgba(229,72,77,.14)', activity: 'alert' },
};

function money(value: number) {
  return `Bs ${new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)}`;
}

function percent(value: number) {
  return `${new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }).format(value || 0)}%`;
}

function compactTime(value: string) {
  return new Intl.DateTimeFormat('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function dayLabel(fechaISO: string) {
  // 'YYYY-MM-DD' → etiqueta corta del día (sin correr el día por UTC)
  return new Date(`${fechaISO}T12:00:00`).toLocaleDateString('es-BO', { weekday: 'short' });
}

function EmptyMini({ children }: { children: React.ReactNode }) {
  return <div className="alert-empty">{children}</div>;
}

export default function AdminDashboard() {
  const [period, setPeriod] = useState<Period>('hoy');
  const [liveTime, setLiveTime] = useState(new Date());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setLiveTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchPeriod() {
      setError(null);

      try {
        const res = await apiClient.get<DashboardData>(`/api/admin/dashboard?rango=${period}`);
        if (cancelled) return;
        setData(res.data ?? null);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setData(null);
          setError('No se pudo cargar el dashboard.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    fetchPeriod();
    const interval = window.setInterval(fetchPeriod, period === 'hoy' ? 30000 : 120000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [period]);

  const trend = useMemo(
    () => (data?.serie ?? []).map(punto => ({
      day: dayLabel(punto.fecha),
      date: punto.fecha,
      revenue: punto.ventas,
      orders: punto.pedidos,
    })),
    [data],
  );

  const kpis = data?.kpis;
  const alertas = data?.alertas_inventario ?? [];
  const topProducts = data?.mas_vendidos ?? [];
  const recentOrders = data?.pedidos_recientes ?? [];

  const maxTopSales = Math.max(...topProducts.map(item => item.cantidad), 1);
  const hasTrend = trend.some(point => point.revenue > 0 || point.orders > 0);
  const activity = [
    ...recentOrders.slice(0, 4).map(order => {
      const meta = STATUS_META[order.estado] ?? STATUS_META.PENDIENTE;
      return {
        key: `order-${order.id}`,
        type: meta.activity,
        text: `Pedido #${order.id} · ${meta.label}`,
        time: compactTime(order.created_at),
      };
    }),
    ...alertas.slice(0, 1).map(alerta => ({
      key: `alert-${alerta.id}`,
      type: 'alert',
      text: `Stock bajo: ${alerta.nombre}`,
      time: liveTime.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }),
    })),
  ];

  return (
    <div className="admin-dashboard">
      <div className="admin-page-header">
        <div>
          <h1>Dashboard</h1>
          <p>¿Cómo va el negocio?</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="period-selector" aria-label="Periodo del dashboard">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(option => (
              <button
                key={option}
                className={`period-btn ${period === option ? 'active' : ''}`}
                onClick={() => setPeriod(option)}
                type="button"
              >
                {PERIOD_LABELS[option]}
              </button>
            ))}
          </div>
          <div className="admin-live-clock">
            <span className="live-dot" />
            {liveTime.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {error && (
        <div className="empty-state" style={{ marginBottom: 18 }}>
          <h4>{error}</h4>
          <p>Revisa tu sesión o intenta nuevamente en unos segundos.</p>
        </div>
      )}

      {loading || !kpis ? (
        <div className="empty-state">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            style={{
              width: 32,
              height: 32,
              border: '3px solid var(--orange)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              margin: '0 auto 12px',
            }}
          />
          <h4>Cargando dashboard</h4>
          <p>Consultando ventas, pedidos e inventario.</p>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-label">Ventas {PERIOD_LABELS[period].toLowerCase()}</span>
              </div>
              <div className="kpi-value" style={{ color: 'var(--orange)' }}>{money(kpis.ventas)}</div>
              <div className="kpi-spark">
                <ResponsiveContainer width="100%" height={36}>
                  <AreaChart data={trend} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dash-sales-spark" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF5C19" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#FF5C19" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="revenue" stroke="#FF5C19" strokeWidth={2} fill="url(#dash-sales-spark)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-label">Ganancia {PERIOD_LABELS[period].toLowerCase()}</span>
              </div>
              <div className="kpi-value" style={{ color: kpis.utilidad >= 0 ? 'var(--fresh)' : 'var(--danger)' }}>{money(kpis.utilidad)}</div>
              <div className="kpi-bar"><div className="kpi-bar-fill" style={{ width: kpis.ventas > 0 ? `${Math.min(100, Math.max(0, (kpis.utilidad / kpis.ventas) * 100))}%` : '0%', background: 'var(--fresh)' }} /></div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-label">Pedidos {PERIOD_LABELS[period].toLowerCase()}</span>
                {kpis.cancelados > 0 && <span className="kpi-change down">{kpis.cancelados} cancelados</span>}
              </div>
              <div className="kpi-value" style={{ color: 'var(--info)' }}>{kpis.pedidos}</div>
              <div className="kpi-bar"><div className="kpi-bar-fill" style={{ width: `${Math.min(100, kpis.pedidos * 6)}%`, background: 'var(--info)' }} /></div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-label">Ticket promedio</span>
              </div>
              <div className="kpi-value" style={{ color: 'var(--kale)' }}>{money(kpis.ticket_promedio)}</div>
              <div className="kpi-bar"><div className="kpi-bar-fill" style={{ width: kpis.ticket_promedio > 0 ? '68%' : '0%', background: 'var(--kale)' }} /></div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-label">Food Cost</span>
              </div>
              <div className="kpi-value" style={{ color: foodCostColor(kpis.food_cost_pct) }}>{percent(kpis.food_cost_pct)}</div>
              <div className="kpi-bar"><div className="kpi-bar-fill" style={{ width: `${Math.min(100, kpis.food_cost_pct)}%`, background: foodCostColor(kpis.food_cost_pct) }} /></div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-label">Insumos críticos</span>
                {alertas.length > 0 && <span className="kpi-change down">{alertas.length}</span>}
              </div>
              <div className="kpi-value" style={{ color: alertas.length ? 'var(--danger)' : 'var(--fresh)' }}>{alertas.length}</div>
              <div className="kpi-bar"><div className="kpi-bar-fill" style={{ width: `${Math.min(100, alertas.length * 20)}%`, background: alertas.length ? 'var(--danger)' : 'var(--fresh)' }} /></div>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="dash-card span-8">
              <div className="dash-card-header">
                <h3>Ventas — tendencia</h3>
                <span className="dash-card-sub">{period === 'hoy' ? 'Hoy' : period === '7d' ? 'Últimos 7 días' : 'Últimos 30 días'}</span>
              </div>
              {hasTrend ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dash-sales-trend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF5C19" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#FF5C19" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE5" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: '#5C6B63', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#5C6B63', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: '1px solid #E4EAE5',
                        borderRadius: 10,
                        fontSize: 12,
                        fontFamily: 'Inter, sans-serif',
                        boxShadow: '0 4px 16px rgba(20,52,42,.1)',
                      }}
                      formatter={(value, name) => {
                        const numeric = Array.isArray(value) ? Number(value[0] ?? 0) : Number(value ?? 0);
                        return [name === 'revenue' ? money(numeric) : numeric, name === 'revenue' ? 'Ventas' : 'Pedidos'];
                      }}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                    />
                    <Area type="monotone" dataKey="revenue" name="Ventas" stroke="#FF5C19" strokeWidth={2.5} fill="url(#dash-sales-trend)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyMini>Aún no hay ventas en este periodo.</EmptyMini>
              )}
            </div>

            <div className="dash-card span-4">
              <div className="dash-card-header">
                <h3>Alertas de inventario</h3>
                <Link className="dash-card-link" href="/admin/insumos">Ver →</Link>
              </div>
              {alertas.length === 0 ? (
                <EmptyMini>Sin alertas. Todo en stock.</EmptyMini>
              ) : (
                <div className="alert-card-list">
                  {alertas.slice(0, 5).map(insumo => (
                    <div key={insumo.id} className="alert-row">
                      <span
                        className="alert-row-dot"
                        style={{ background: insumo.nivel === 'critico' ? 'var(--danger)' : 'var(--amber)' }}
                      />
                      <span className="alert-row-name">{insumo.nombre}</span>
                      <span className="alert-row-qty">{insumo.stock_actual} {insumo.unidad_medida}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dash-card span-6">
              <div className="dash-card-header">
                <h3>Más vendidos</h3>
                <span className="dash-card-sub">por unidades</span>
              </div>
              {topProducts.length === 0 ? (
                <EmptyMini>Aún no hay ventas registradas.</EmptyMini>
              ) : (
                <div className="top-products">
                  {topProducts.map((item, index) => (
                    <div key={item.producto_id} className="top-product-row">
                      <span className="top-rank">#{index + 1}</span>
                      <div className="top-product-info">
                        <span className="top-product-name">{item.nombre}</span>
                        <span className="top-product-cat">{money(item.total)}</span>
                      </div>
                      <div className="top-product-bar-wrap">
                        <div className="top-product-bar" style={{ width: `${(item.cantidad / maxTopSales) * 100}%` }} />
                      </div>
                      <span className="top-product-sales">{item.cantidad}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dash-card span-6">
              <div className="dash-card-header">
                <h3>Actividad</h3>
                <span className="dash-card-sub">tiempo real</span>
              </div>
              {activity.length === 0 ? (
                <EmptyMini>Sin actividad reciente.</EmptyMini>
              ) : (
                <div className="activity-feed">
                  {activity.map(item => (
                    <div key={item.key} className="activity-item">
                      <div className={`activity-dot ${item.type}`} />
                      <div className="activity-content">
                        <span className="activity-text">{item.text}</span>
                        <span className="activity-time">{item.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dash-card orders-card">
              <div className="dash-card-header">
                <h3>Pedidos recientes</h3>
                <Link href="/admin/orders" className="dash-card-link">Ver todos →</Link>
              </div>
              {recentOrders.length === 0 ? (
                <EmptyMini>Sin pedidos recientes.</EmptyMini>
              ) : (
                <div className="recent-orders-table">
                  <div className="rot-header">
                    <span>Pedido</span>
                    <span>Cliente</span>
                    <span>Total</span>
                    <span>Estado</span>
                  </div>
                  {recentOrders.map(order => {
                    const meta = STATUS_META[order.estado] ?? {
                      label: order.estado,
                      color: 'var(--slate)',
                      bg: 'var(--canvas)',
                    };
                    return (
                      <div key={order.id} className="rot-row">
                        <span className="rot-id">#{order.id}</span>
                        <span className="rot-customer">{order.cliente_nombre ?? 'Cliente'}</span>
                        <span className="rot-total">{money(order.total)}</span>
                        <span className="rot-status" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
