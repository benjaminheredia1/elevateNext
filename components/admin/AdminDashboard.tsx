'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import apiClient from '@/hooks/api';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import StatusBadge from '@/components/ui/StatusBadge';

/* ===== Types ===== */
interface Stats {
  kpis: {
    ganancia_hoy: number;
    ventas: number;
    pedidos: number;
    ticket_promedio: number;
    pedidos_pendientes: number;
  };
  contabilidad_hoy: {
    ingresos: number;
    cmv: number;
    otros_gastos: number;
    utilidad: number;
  };
  mas_vendidos: { producto_id: number; nombre: string; cantidad: number; total: number }[];
  alertas_inventario: InsumoAlerta[];
  turno_activo: {
    id: number;
    estado: string;
    fecha_apertura: string;
    cajero?: { nombre: string | null; email: string };
    sucursal?: { nombre: string };
  } | null;
  pedidos_por_hora: { hora: string; pedidos: number }[];
  pedidos_recientes: {
    id: number;
    cliente_nombre: string | null;
    total: number;
    estado: string;
    created_at: string;
    transaccionesDetalles_id: { producto: { nombre: string } }[];
  }[];
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

const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE: '#f59e0b',
  EN_PREPARACION: '#3b82f6',
  EN_CAMINO: '#8b5cf6',
  ENTREGADO: '#10b981',
  CANCELADO: '#ef4444',
  PAGADO: '#10b981',
};

const ESTADO_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PREPARACION: 'Preparando',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
  PAGADO: 'Pagado',
};

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flex: 1,
        minWidth: 180,
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: `${color}20`, border: `1px solid ${color}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>{label}</div>
        <div style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>{value}</div>
        {sub && <div style={{ color: color, fontSize: 12, marginTop: 2 }}>{sub}</div>}
      </div>
    </motion.div>
  );
}

function MiniBar({ porcentaje, nivel }: { porcentaje: number; nivel: string }) {
  const color = nivel === 'critico' ? '#ef4444' : nivel === 'advertencia' ? '#f59e0b' : '#10b981';
  return (
    <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, porcentaje)}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{ height: '100%', background: color, borderRadius: 3 }}
      />
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const statsRes = await apiClient.get('/api/admin/dashboard');
        setStats(statsRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          style={{ width: 32, height: 32, border: '3px solid #ff5c19', borderTopColor: 'transparent', borderRadius: '50%' }}
        />
      </div>
    );
  }

  const alertas = stats?.alertas_inventario ?? [];
  const maxPedidos = Math.max(...(stats?.pedidos_por_hora.map(p => p.pedidos) ?? [1]), 1);

  return (
    <div style={{ padding: '0 4px' }}>
      <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 20 }}>
        Dashboard
        <span style={{ color: '#ff5c19', marginLeft: 8, fontSize: 14, fontWeight: 400 }}>
          {new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </h1>

      {/* ===== KPI CARDS ===== */}
      <div className="kpi-grid">
        <KpiCard label="Ganancia hoy" value={<MoneyText value={stats?.kpis.ganancia_hoy ?? 0} signed />} highlight />
        <KpiCard label="Ventas" value={<MoneyText value={stats?.kpis.ventas ?? 0} />} accent="var(--fresh)" />
        <KpiCard label="Pedidos" value={stats?.kpis.pedidos ?? 0} />
        <KpiCard label="Ticket promedio" value={<MoneyText value={stats?.kpis.ticket_promedio ?? 0} />} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* ===== HOURLY CHART ===== */}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '20px 24px',
        }}>
          <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
            Pedidos por hora
          </h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
            {stats?.pedidos_por_hora.map((item, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: maxPedidos === 0 ? 4 : `${(item.pedidos / maxPedidos) * 80}px` }}
                  transition={{ duration: 0.6, delay: i * 0.04 }}
                  style={{
                    width: '100%', borderRadius: 4,
                    background: item.pedidos > 0
                      ? 'linear-gradient(180deg, #ff5c19 0%, #ff7a42 100%)'
                      : 'rgba(255,255,255,0.08)',
                    minHeight: 4,
                  }}
                  title={`${item.hora}: ${item.pedidos} pedidos`}
                />
                {i % 3 === 0 && (
                  <span style={{ color: '#555', fontSize: 9, whiteSpace: 'nowrap' }}>{item.hora}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '20px 24px',
        }}>
          <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Contabilidad de hoy</h3>
          <div className="finance-list">
            <div className="finance-row"><span>Ingresos</span><strong><MoneyText value={stats?.contabilidad_hoy.ingresos ?? 0} /></strong></div>
            <div className="finance-row"><span>CMV</span><strong><MoneyText value={stats?.contabilidad_hoy.cmv ?? 0} /></strong></div>
            <div className="finance-row"><span>Otros gastos</span><strong><MoneyText value={stats?.contabilidad_hoy.otros_gastos ?? 0} /></strong></div>
            <div className="finance-row"><span>Utilidad</span><strong><MoneyText value={stats?.contabilidad_hoy.utilidad ?? 0} signed /></strong></div>
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '20px 24px',
        }}>
          <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Más vendidos hoy</h3>
          {!stats?.mas_vendidos?.length ? (
            <p style={{ color: '#666', fontSize: 13 }}>Sin ventas registradas hoy.</p>
          ) : (
            <div className="finance-list">
              {stats.mas_vendidos.map(item => (
                <div key={item.producto_id} className="finance-row">
                  <span>{item.nombre} x{item.cantidad}</span>
                  <strong><MoneyText value={item.total} /></strong>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== INSUMO ALERTS ===== */}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '20px 24px',
        }}>
          <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Alertas de Insumos
            {alertas.length > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11 }}>
                {alertas.length}
              </span>
            )}
          </h3>

          {alertas.length === 0 ? (
            <div style={{ color: '#10b981', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              Todos los insumos con stock suficiente
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 160, overflowY: 'auto' }}>
              {alertas.map(insumo => (
                <div key={insumo.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#ddd', fontSize: 12, fontWeight: 500 }}>{insumo.nombre}</span>
                    <span style={{
                      fontSize: 11, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                      background: insumo.nivel === 'critico' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                      color: insumo.nivel === 'critico' ? '#ef4444' : '#f59e0b',
                    }}>
                      {insumo.stock_actual} / {insumo.stock_minimo} {insumo.unidad_medida}
                    </span>
                  </div>
                  <MiniBar porcentaje={insumo.porcentaje} nivel={insumo.nivel} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: '16px 24px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Turno de caja</h3>
          <p style={{ color: '#888', margin: 0, fontSize: 13 }}>
            {stats?.turno_activo ? `${stats.turno_activo.sucursal?.nombre ?? 'Sucursal'} · ${stats.turno_activo.cajero?.nombre ?? stats.turno_activo.cajero?.email ?? 'Cajero'}` : 'No hay turno abierto'}
          </p>
        </div>
        <StatusBadge status={stats?.turno_activo ? 'abierto' : 'cerrado'} label={stats?.turno_activo ? 'Abierto' : 'Cerrado'} />
      </div>

      {/* ===== RECENT ORDERS ===== */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: '20px 24px',
      }}>
        <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Pedidos Recientes</h3>
        {!stats?.pedidos_recientes?.length ? (
          <p style={{ color: '#666', fontSize: 13 }}>No hay pedidos aún.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {stats.pedidos_recientes.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 0',
                  borderBottom: i < stats.pedidos_recientes.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(255,92,25,0.15)', border: '1px solid rgba(255,92,25,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#ff5c19', fontWeight: 700, fontSize: 13, flexShrink: 0,
                }}>
                  #{p.id}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
                    {p.cliente_nombre ?? 'Cliente'}
                  </div>
                  <div style={{ color: '#666', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.transaccionesDetalles_id.map(d => d.producto.nombre).join(', ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Bs. {p.total}</div>
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                    background: `${ESTADO_COLORS[p.estado] ?? '#888'}20`,
                    color: ESTADO_COLORS[p.estado] ?? '#888',
                    fontWeight: 600,
                  }}>
                    {ESTADO_LABELS[p.estado] ?? p.estado}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
