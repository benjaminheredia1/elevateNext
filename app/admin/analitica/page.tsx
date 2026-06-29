'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, ScatterChart, Scatter, ZAxis,
} from 'recharts';
import AdminPanel from '@/components/admin/AdminPanel';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import EmptyState from '@/components/ui/EmptyState';
import apiClient from '@/hooks/api';

type Rango = '7d' | '30d' | '90d';

const RANGOS: { key: Rango; label: string }[] = [
  { key: '7d',  label: '7 días'  },
  { key: '30d', label: '30 días' },
  { key: '90d', label: '90 días' },
];

const CATEGORIA_COLORS = ['#ff5c19', '#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'];

const MATRIX_COLORS = {
  Estrella: '#f59e0b',
  Caballo:  '#3b82f6',
  Puzzle:   '#a855f7',
  Perro:    '#6b7280',
};

function useAnalitica(rango: Rango) {
  return useQuery({
    queryKey: ['analitica', rango],
    queryFn: async () => (await apiClient.get(`/api/admin/analitica?rango=${rango}`)).data,
    staleTime: 60_000,
  });
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 24px', marginBottom: 20 }}>
      <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 700, marginBottom: 18 }}>{title}</h3>
      {children}
    </div>
  );
}

export default function AnaliticaPage() {
  const [rango, setRango] = useState<Rango>('30d');
  const { data: resp, isLoading, isError } = useAnalitica(rango);
  const data = resp?.data;

  const ticketProm = data && data.totalTransacciones > 0
    ? data.totalVentas / data.totalTransacciones : 0;

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Analítica & KPIs</h1>
          <p>Tendencias de ventas, food cost e ingeniería de menú.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {RANGOS.map(r => (
            <button key={r.key} onClick={() => setRango(r.key)}
              className={`admin-btn ${rango === r.key ? 'primary' : 'ghost'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <EmptyState title="Cargando analítica…" />
      ) : isError ? (
        <EmptyState title="Error al cargar datos" />
      ) : !data ? null : (
        <>
          {/* KPIs */}
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <KpiCard label="Ventas totales" value={<MoneyText value={data.totalVentas} />} highlight />
            <KpiCard label="Transacciones" value={data.totalTransacciones} />
            <KpiCard label="Ticket promedio" value={<MoneyText value={ticketProm} />} />
            <KpiCard label="Food cost %" value={`${data.foodCostTotal.toFixed(1)}%`} />
          </div>

          {/* Tendencia de ventas */}
          <SectionCard title="📈 Tendencia de Ventas">
            {data.ventasPorDia.length === 0 ? (
              <p style={{ color: '#666', fontSize: 13 }}>Sin datos en este rango.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.ventasPorDia} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="fecha" tick={{ fill: '#666', fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fill: '#666', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                    formatter={(v) => [`Bs ${typeof v === 'number' ? v.toFixed(2) : v}`, 'Ventas']}
                  />
                  <Line type="monotone" dataKey="total" stroke="#ff5c19" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          {/* Mix categoría + marca */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {[
              { title: '🍽️ Mix por Categoría', items: data.mixCategoria },
              { title: '🏷️ Mix por Marca',     items: data.mixMarca     },
            ].map(({ title, items }) => (
              <SectionCard key={title} title={title}>
                {items.length === 0 ? (
                  <p style={{ color: '#666', fontSize: 13 }}>Sin datos.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={items} dataKey="total" nameKey="nombre" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                        {items.map((_: unknown, idx: number) => (
                          <Cell key={idx} fill={CATEGORIA_COLORS[idx % CATEGORIA_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                      formatter={(v, _name, props: any) => [`Bs ${typeof v === 'number' ? v.toFixed(2) : v} (${props.payload.pct}%)`, props.payload.nombre]} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#888' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </SectionCard>
            ))}
          </div>

          {/* Ingeniería de menú */}
          <SectionCard title="⭐ Ingeniería de Menú (Boston Matrix)">
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              {(Object.entries(MATRIX_COLORS) as [string, string][]).map(([cat, color]) => {
                const count = data.ingenieriaMeniu.filter((p: any) => p.categoria === cat).length;
                return (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                    <span style={{ color: '#888' }}>{cat}</span>
                    <span style={{ color: '#fff', fontWeight: 700 }}>{count}</span>
                  </div>
                );
              })}
            </div>
            {data.ingenieriaMeniu.length === 0 ? (
              <p style={{ color: '#666', fontSize: 13 }}>Sin datos de productos.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="ventas" name="Ventas" tick={{ fill: '#666', fontSize: 11 }} label={{ value: 'Ventas', position: 'insideBottom', fill: '#666', fontSize: 11 }} />
                  <YAxis dataKey="margen" name="Margen %" tick={{ fill: '#666', fontSize: 11 }} label={{ value: 'Margen %', angle: -90, position: 'insideLeft', fill: '#666', fontSize: 11 }} />
                  <ZAxis range={[60, 60]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                    content={({ payload }) => {
                      if (!payload?.length) return null;
                      const p = payload[0].payload;
                      return (
                        <div style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px' }}>
                          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>{p.nombre}</div>
                          <div style={{ color: '#888', fontSize: 11 }}>Ventas: {p.ventas}</div>
                          <div style={{ color: '#888', fontSize: 11 }}>Margen: {p.margen.toFixed(1)}%</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: MATRIX_COLORS[p.categoria as keyof typeof MATRIX_COLORS] }}>{p.categoria}</div>
                        </div>
                      );
                    }}
                  />
                  {(Object.entries(MATRIX_COLORS) as [string, string][]).map(([cat, color]) => (
                    <Scatter
                      key={cat}
                      name={cat}
                      data={data.ingenieriaMeniu.filter((p: any) => p.categoria === cat)}
                      fill={color}
                      opacity={0.85}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          {/* Heatmap horas pico (tabla simplificada) */}
          <SectionCard title="🕐 Horas Pico">
            {data.heatmap.length === 0 ? (
              <p style={{ color: '#666', fontSize: 13 }}>Sin datos de horas.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ color: '#666', padding: '4px 8px', textAlign: 'left' }}>Hora</th>
                      {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
                        <th key={d} style={{ color: '#666', padding: '4px 8px', textAlign: 'center' }}>{d}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 16 }, (_, h) => h + 7).map(hora => {
                      const maxVal = Math.max(...data.heatmap.map((c: any) => c.ventas));
                      return (
                        <tr key={hora}>
                          <td style={{ color: '#888', padding: '3px 8px' }}>{hora}:00</td>
                          {[0, 1, 2, 3, 4, 5, 6].map(dia => {
                            const cell = data.heatmap.find((c: any) => c.hora === hora && c.diaSemana === dia);
                            const intensity = cell ? (cell.ventas / maxVal) : 0;
                            return (
                              <td key={dia} title={cell ? `Bs ${cell.ventas.toFixed(0)}` : '—'}
                                style={{ padding: '3px 8px', textAlign: 'center', borderRadius: 4,
                                  background: intensity > 0 ? `rgba(255,92,25,${intensity * 0.8})` : 'transparent',
                                  color: intensity > 0.5 ? '#fff' : '#555', fontSize: 10, cursor: 'default' }}>
                                {cell ? `${cell.ventas.toFixed(0)}` : ''}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </AdminPanel>
  );
}
