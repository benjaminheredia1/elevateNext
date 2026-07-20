'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import AdminPanel from '@/components/admin/AdminPanel';
import apiClient from '@/hooks/api';
import { foodCostColor, menuClassMeta, type MenuClass } from '@/components/admin/inventoryData';

type Rango = '7d' | '30d' | '90d';

interface MenuItem {
  producto_id: number;
  nombre: string;
  ventas: number;
  total_vendido: number;
  precio: number;
  costo: number;
  food_cost_pct: number;
  margen: number;
  categoria: MenuClass;
}

interface AnaliticaData {
  ventasPorDia: { fecha: string; total: number; cantidad: number }[];
  foodCostTotal: number;
  cmvTotal: number;
  margenBruto: number;
  ingenieriaMeniu: MenuItem[];
  mixCategoria: { nombre: string; total: number; pct: number }[];
  mixMarca: { nombre: string; total: number; pct: number }[];
  totalVentas: number;
  totalTransacciones: number;
  ticketPromedio: number;
}

interface EstadoResultados {
  utilidad_neta: number;
  gastos_operativos: number;
}

const RANGOS: { key: Rango; label: string; dias: number }[] = [
  { key: '7d', label: '7 días', dias: 7 },
  { key: '30d', label: '30 días', dias: 30 },
  { key: '90d', label: '90 días', dias: 90 },
];

const PALETTE = ['#FF5C19', '#1FA971', '#14342A', '#3B82C4', '#E8A317', '#E5484D'];
const CLASS_COLORS: Record<MenuClass, string> = {
  Estrella: '#1FA971',
  Caballo: '#3B82C4',
  Puzzle: '#E8A317',
  Perro: '#E5484D',
};

function money(value: number) {
  return `Bs ${new Intl.NumberFormat('es-BO', {
    maximumFractionDigits: 0,
  }).format(Math.round(value || 0))}`;
}

function isoLocal(date: Date) {
  // Fecha local del navegador (el negocio opera en Bolivia): nunca toISOString().
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Query del estado de resultados para el mismo período que la analítica. */
function erQuery(rango: Rango) {
  if (rango === '7d') return 'rango=7d';
  const dias = RANGOS.find(r => r.key === rango)!.dias;
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(hasta.getDate() - (dias - 1));
  return `rango=custom&desde=${isoLocal(desde)}&hasta=${isoLocal(hasta)}`;
}

export default function AnaliticaPage() {
  const [rango, setRango] = useState<Rango>('30d');
  const [analitica, setAnalitica] = useState<AnaliticaData | null>(null);
  const [estado, setEstado] = useState<EstadoResultados | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [analiticaRes, erRes] = await Promise.all([
          apiClient.get(`/api/admin/analitica?rango=${rango}`),
          apiClient.get(`/api/admin/contabilidad/estado-resultados?${erQuery(rango)}`),
        ]);
        if (cancelled) return;
        setAnalitica(analiticaRes.data?.data ?? null);
        setEstado(erRes.data ?? null);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setAnalitica(null);
          setEstado(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [rango]);

  const categoryMix = useMemo(
    () => (analitica?.mixCategoria ?? []).slice(0, 6).map(item => ({ name: item.nombre, value: item.total })),
    [analitica],
  );
  const brandMix = useMemo(
    () => (analitica?.mixMarca ?? []).slice(0, 6).map(item => ({ name: item.nombre, value: item.total })),
    [analitica],
  );

  const rows = useMemo(
    () => [...(analitica?.ingenieriaMeniu ?? [])].sort((a, b) => b.margen - a.margen),
    [analitica],
  );

  const matrixData = useMemo(
    () => (analitica?.ingenieriaMeniu ?? []).map(item => ({
      x: item.ventas,
      y: item.margen,
      name: item.nombre,
      clazz: item.categoria,
      color: CLASS_COLORS[item.categoria],
    })),
    [analitica],
  );

  const hasData = !!analitica && (analitica.totalVentas > 0 || analitica.ingenieriaMeniu.length > 0);

  return (
    <AdminPanel>
      <div className="admin-analytics">
        <div className="admin-page-header">
          <div>
            <h1>Analítica & Finanzas</h1>
            <p>Rentabilidad, tendencias e ingeniería de menú del periodo</p>
          </div>
          <div className="period-selector">
            {RANGOS.map(option => (
              <button
                key={option.key}
                className={`period-btn ${rango === option.key ? 'active' : ''}`}
                onClick={() => setRango(option.key)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><h4>Cargando analítica</h4><p>Consultando ventas, costos y productos.</p></div>
        ) : (
          <>
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-label">Ventas</div><div className="kpi-value" style={{ color: 'var(--orange)' }}>{money(analitica?.totalVentas ?? 0)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Utilidad neta</div><div className="kpi-value" style={{ color: (estado?.utilidad_neta ?? 0) >= 0 ? 'var(--fresh)' : 'var(--danger)' }}>{money(estado?.utilidad_neta ?? 0)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Ticket promedio</div><div className="kpi-value">{money(analitica?.ticketPromedio ?? 0)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Food Cost</div><div className="kpi-value" style={{ color: foodCostColor(analitica?.foodCostTotal ?? 0) }}>{Math.round(analitica?.foodCostTotal ?? 0)}%</div></div>
              <div className="kpi-card"><div className="kpi-label">Margen bruto</div><div className="kpi-value" style={{ color: 'var(--fresh)' }}>{Math.round(analitica?.margenBruto ?? 0)}%</div></div>
            </div>

            {!hasData ? (
              <div className="empty-state"><h4>Sin datos del periodo</h4><p>Cuando existan ventas en el rango seleccionado, los indicadores aparecerán aquí.</p></div>
            ) : (
              <div className="dashboard-grid">
                <div className="dash-card span-8">
                  <div className="dash-card-header"><h3>Tendencia de ventas</h3><span className="dash-card-sub">Por día de negocio</span></div>
                  {(analitica?.ventasPorDia ?? []).length === 0 ? (
                    <div className="alert-empty">Sin ventas en el periodo.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={analitica!.ventasPorDia} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <defs>
                          <linearGradient id="analytics-sales" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FF5C19" stopOpacity={0.24} /><stop offset="100%" stopColor="#FF5C19" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE5" vertical={false} />
                        <XAxis dataKey="fecha" tick={{ fill: '#5C6B63', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value: string) => value.slice(5)} />
                        <YAxis tick={{ fill: '#5C6B63', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: '#fff', border: '1px solid #E4EAE5', borderRadius: 10, fontSize: 12 }}
                          formatter={(value, name) => (name === 'total' ? [money(Number(value ?? 0)), 'Ventas'] : [Number(value ?? 0), 'Pedidos'])}
                        />
                        <Area type="monotone" dataKey="total" stroke="#FF5C19" strokeWidth={2.5} fill="url(#analytics-sales)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <DonutCard title="Mix por categoría" data={categoryMix} />
                <DonutCard title="Mix por marca" data={brandMix} />

                <div className="dash-card span-8">
                  <div className="dash-card-header">
                    <h3>Ingeniería de menú</h3>
                    <span className="dash-card-sub">Unidades vendidas × margen % (periodo)</span>
                  </div>
                  {matrixData.length === 0 ? (
                    <div className="alert-empty">Sin ventas para clasificar en el periodo.</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={320}>
                        <ScatterChart margin={{ top: 16, right: 24, left: 0, bottom: 16 }}>
                          <CartesianGrid stroke="#E4EAE5" />
                          <XAxis type="number" dataKey="x" name="Ventas" tick={{ fill: '#5C6B63', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis type="number" dataKey="y" name="Margen %" tick={{ fill: '#5C6B63', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <ZAxis range={[100, 100]} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#fff', border: '1px solid #E4EAE5', borderRadius: 10, fontSize: 12 }} />
                          {(Object.keys(CLASS_COLORS) as MenuClass[]).map(clazz => (
                            <Scatter key={clazz} name={clazz} data={matrixData.filter(item => item.clazz === clazz)} fill={CLASS_COLORS[clazz]} />
                          ))}
                        </ScatterChart>
                      </ResponsiveContainer>
                      <div className="admin-cat-filters">
                        {(Object.keys(menuClassMeta) as MenuClass[]).map(clazz => (
                          <span key={clazz} className="menu-class-badge">{menuClassMeta[clazz].icon} {clazz}</span>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="dash-card span-12">
                  <div className="dash-card-header"><h3>Rentabilidad por plato</h3><span className="dash-card-sub">{rows.length} productos vendidos en el periodo</span></div>
                  {rows.length === 0 ? (
                    <div className="alert-empty">Sin ventas en el periodo.</div>
                  ) : (
                    <div className="admin-table-wrap" style={{ boxShadow: 'none' }}>
                      <table className="admin-table">
                        <thead><tr><th>Plato</th><th className="num">Unidades</th><th className="num">Vendido</th><th className="num">Precio</th><th className="num">Costo</th><th className="num">Food Cost</th><th>Clase</th></tr></thead>
                        <tbody>
                          {rows.map(row => (
                            <tr key={row.producto_id}>
                              <td><strong>{row.nombre}</strong></td>
                              <td className="num">{row.ventas}</td>
                              <td className="num">{money(row.total_vendido)}</td>
                              <td className="num">{money(row.precio)}</td>
                              <td className="num">{money(row.costo)}</td>
                              <td className="num"><span className="margin-badge" style={{ color: foodCostColor(row.food_cost_pct), background: 'var(--canvas)' }}>{Math.round(row.food_cost_pct)}%</span></td>
                              <td><span className="menu-class-badge">{menuClassMeta[row.categoria].icon} {row.categoria}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminPanel>
  );
}

function DonutCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div className="dash-card span-4">
      <div className="dash-card-header"><h3>{title}</h3></div>
      {data.length === 0 ? (
        <div className="alert-empty">Sin datos del periodo.</div>
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="84%" paddingAngle={2}>
              {data.map((_, index) => <Cell key={index} fill={PALETTE[index % PALETTE.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E4EAE5', borderRadius: 10, fontSize: 12 }} formatter={(value) => money(Number(value ?? 0))} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
