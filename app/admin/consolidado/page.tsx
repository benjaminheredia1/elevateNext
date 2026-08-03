'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AdminPanel from '@/components/admin/AdminPanel';
import apiClient from '@/hooks/api';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import RangeFilter from '@/components/ui/RangeFilter';
import type { RangoState } from '@/hooks/finanzas';

const PALETTE = ['#FF5C19', '#1FA971', '#3B82C4', '#E8A317', '#14342A', '#E5484D'];

interface FilaSucursal {
  sucursal_id: number;
  sucursal: string;
  ventas: number;
  pedidos: number;
  ticket_promedio: number;
  cmv: number;
  gastos: number;
  utilidad: number;
  margen_bruto_pct: number;
  food_cost_pct: number;
  participacion_pct: number;
}

interface Consolidado {
  totales: {
    ventas: number; pedidos: number; cmv: number; gastos: number;
    utilidad: number; margen_bruto_pct: number; food_cost_pct: number;
  };
  sucursales: FilaSucursal[];
  productos: {
    producto_id: number;
    nombre: string;
    total: number;
    por_sucursal: { sucursal_id: number; sucursal: string; cantidad: number; total: number }[];
  }[];
}

function queryString(rango: RangoState) {
  const params = new URLSearchParams();
  params.set('rango', rango.rango);
  if (rango.desde) params.set('desde', rango.desde);
  if (rango.hasta) params.set('hasta', rango.hasta);
  return params.toString();
}

export default function ConsolidadoPage() {
  const [rango, setRango] = useState<RangoState>({ rango: 'mes' });
  const [data, setData] = useState<Consolidado | null>(null);
  const [error, setError] = useState('');
  const [expandido, setExpandido] = useState<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    setData(null);
    setError('');
    apiClient.get(`/api/admin/consolidado?${queryString(rango)}`)
      .then(res => { if (!cancelado) setData(res.data); })
      .catch(() => { if (!cancelado) setError('No se pudo cargar el consolidado.'); });
    return () => { cancelado = true; };
  }, [rango.rango, rango.desde, rango.hasta]);

  const grafico = useMemo(
    () => (data?.sucursales ?? []).map(s => ({
      name: s.sucursal,
      Ventas: s.ventas,
      Utilidad: s.utilidad,
    })),
    [data],
  );

  const topProductos = (data?.productos ?? []).slice(0, 15);

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Consolidado</h1>
          <p>El negocio completo, con el desglose y el peso de cada sucursal.</p>
        </div>
        <RangeFilter value={rango} onChange={setRango} />
      </div>

      {error && <div className="gate-warning" style={{ marginBottom: 12 }}>{error}</div>}

      {!data ? <EmptyState title="Cargando consolidado…" /> : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Ventas totales" value={<MoneyText value={data.totales.ventas} />} highlight />
            <KpiCard label="Utilidad" value={<MoneyText value={data.totales.utilidad} signed />} accent="var(--fresh)" />
            <KpiCard label="Pedidos" value={data.totales.pedidos} />
            <KpiCard label="Food cost" value={`${data.totales.food_cost_pct.toFixed(1)}%`} accent="var(--amber)" />
            <KpiCard label="Margen bruto" value={`${data.totales.margen_bruto_pct.toFixed(1)}%`} />
          </div>

          <div className="dash-card span-12" style={{ marginBottom: 18 }}>
            <div className="dash-card-header">
              <h3>Ventas y utilidad por sucursal</h3>
              <span className="dash-card-sub">del periodo seleccionado</span>
            </div>
            {grafico.length === 0 ? <div className="alert-empty">Sin datos en el periodo.</div> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={grafico} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE5" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#5C6B63', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#5C6B63', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #E4EAE5', borderRadius: 10, fontSize: 12 }}
                    formatter={(value) => `Bs ${Number(value ?? 0).toLocaleString('es-BO')}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Ventas" fill="#FF5C19" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Utilidad" fill="#1FA971" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="finance-panel span-12" style={{ marginBottom: 18 }}>
            <DataTable
              data={data.sucursales}
              emptyTitle="Sin sucursales con actividad"
              rowKey={(row: FilaSucursal) => row.sucursal_id}
              columns={[
                { key: 'sucursal', header: 'Sucursal', render: (row: FilaSucursal) => (
                  <div className="admin-cell-title">{row.sucursal}</div>
                )},
                { key: 'ventas', header: 'Ventas', className: 'num', render: (row: FilaSucursal) => <MoneyText value={row.ventas} /> },
                { key: 'part', header: '% del total', className: 'num', render: (row: FilaSucursal) => `${row.participacion_pct.toFixed(1)}%` },
                { key: 'pedidos', header: 'Pedidos', className: 'num', render: (row: FilaSucursal) => row.pedidos },
                { key: 'ticket', header: 'Ticket prom.', className: 'num', render: (row: FilaSucursal) => <MoneyText value={row.ticket_promedio} /> },
                { key: 'cmv', header: 'CMV', className: 'num', render: (row: FilaSucursal) => <MoneyText value={row.cmv} /> },
                { key: 'gastos', header: 'Gastos', className: 'num', render: (row: FilaSucursal) => <MoneyText value={row.gastos} /> },
                { key: 'utilidad', header: 'Utilidad', className: 'num', render: (row: FilaSucursal) => <MoneyText value={row.utilidad} signed /> },
                { key: 'fc', header: 'Food cost', className: 'num', render: (row: FilaSucursal) => `${row.food_cost_pct.toFixed(1)}%` },
              ]}
            />
          </div>

          <div className="dash-card span-12">
            <div className="dash-card-header">
              <h3>Mismo producto en cada sucursal</h3>
              <span className="dash-card-sub">clic para ver el desglose</span>
            </div>
            {topProductos.length === 0 ? <div className="alert-empty">Sin ventas en el periodo.</div> : (
              <ul className="top-clientes-list" style={{ maxHeight: 460 }}>
                {topProductos.map((p, i) => {
                  const abierto = expandido === p.producto_id;
                  return (
                    <li key={p.producto_id} style={{ display: 'block' }}>
                      <div
                        className="top-cliente-item"
                        onClick={() => setExpandido(abierto ? null : p.producto_id)}
                      >
                        <span className={`top-cliente-rank ${i < 3 ? 'is-podio' : ''}`}>{i + 1}</span>
                        <div className="top-cliente-body">
                          <div className="top-cliente-name">{p.nombre}</div>
                          <div className="top-cliente-sub">
                            {p.por_sucursal.length} {p.por_sucursal.length === 1 ? 'sucursal' : 'sucursales'} · {abierto ? 'ocultar' : 'ver desglose'}
                          </div>
                        </div>
                        <strong className="top-cliente-total"><MoneyText value={p.total} /></strong>
                      </div>
                      {abierto && (
                        <ul className="donut-otros-detail">
                          <li className="donut-otros-item donut-otros-head">
                            <span className="donut-otros-name">Sucursal</span>
                            <span className="donut-otros-value">Bs</span>
                            <span className="donut-otros-pct">% del prod.</span>
                          </li>
                          {p.por_sucursal.map(s => (
                            <li key={s.sucursal_id} className="donut-otros-item">
                              <span className="donut-otros-name">{s.sucursal} · {s.cantidad} un.</span>
                              <span className="donut-otros-value"><MoneyText value={s.total} /></span>
                              <span className="donut-otros-pct">
                                {p.total > 0 ? ((s.total / p.total) * 100).toFixed(1) : '0.0'}%
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </AdminPanel>
  );
}
