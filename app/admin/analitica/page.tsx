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
import { classifyMenu, foodCostColor, menuClassMeta, type MenuClass } from '@/components/admin/inventoryData';

type Rango = '7d' | '30d' | '90d';

interface ContabilidadData {
  total_ventas: number;
  total_pedidos: number;
  ticket_promedio: number;
  cmv: number;
  total_gastos: number;
  utilidad_bruta: number;
  utilidad_neta: number;
  margen_bruto: number;
  margen_neto: number;
  ventas_lista: { id: number; descripcion: string; monto: number; fecha: string; tipo: string }[];
  compras: { id: number; descripcion: string; monto: number; fecha: string; tipo: string }[];
  gastos: { id: number; descripcion: string; monto: number; fecha: string; tipo: string }[];
}

interface ApiProducto {
  id: number;
  nombre: string;
  precio: number;
  ventas_acumuladas: number;
  costo_calculado: number;
  food_cost_pct: number;
  categoria_id: { categoria: { nombre: string } }[];
  marcas: { marca: { nombre: string } }[];
}

interface TrendRow {
  fecha: string;
  ventas: number;
  utilidad: number;
}

const RANGOS: { key: Rango; label: string }[] = [
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: '90d', label: '90 días' },
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

function rangeQuery(rango: Rango) {
  if (rango === '7d') return 'rango=7dias';
  if (rango === '30d') return 'rango=mes';
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(hasta.getDate() - 90);
  return `rango=rango&desde=${desde.toISOString()}&hasta=${hasta.toISOString()}`;
}

function dateKey(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function buildTrend(data?: ContabilidadData): TrendRow[] {
  if (!data) return [];
  const map = new Map<string, TrendRow>();
  for (const venta of data.ventas_lista ?? []) {
    const key = dateKey(venta.fecha);
    const row = map.get(key) ?? { fecha: key, ventas: 0, utilidad: 0 };
    row.ventas += Number(venta.monto || 0);
    row.utilidad += Number(venta.monto || 0);
    map.set(key, row);
  }
  for (const egreso of [...(data.compras ?? []), ...(data.gastos ?? [])]) {
    const key = dateKey(egreso.fecha);
    const row = map.get(key) ?? { fecha: key, ventas: 0, utilidad: 0 };
    row.utilidad -= Number(egreso.monto || 0);
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function mixBy(products: ApiProducto[], getKeys: (product: ApiProducto) => string[]) {
  const map = new Map<string, number>();
  for (const product of products) {
    const value = Number(product.precio || 0) * Number(product.ventas_acumuladas || 0);
    for (const key of getKeys(product)) {
      map.set(key, (map.get(key) ?? 0) + value);
    }
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

export default function AnaliticaPage() {
  const [rango, setRango] = useState<Rango>('30d');
  const [contabilidad, setContabilidad] = useState<ContabilidadData | null>(null);
  const [productos, setProductos] = useState<ApiProducto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [contaRes, productsRes] = await Promise.all([
          apiClient.get(`/api/contabilidad?${rangeQuery(rango)}`),
          apiClient.get('/api/admin/productos'),
        ]);
        if (cancelled) return;
        setContabilidad(contaRes.data?.data ?? null);
        setProductos(productsRes.data?.data ?? []);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setContabilidad(null);
          setProductos([]);
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

  const trend = useMemo(() => buildTrend(contabilidad ?? undefined), [contabilidad]);
  const categoryMix = useMemo(() => mixBy(productos, product => product.categoria_id.map(c => c.categoria.nombre)), [productos]);
  const brandMix = useMemo(() => mixBy(productos, product => product.marcas.map(m => m.marca.nombre)), [productos]);

  const rows = useMemo(() => productos.map(product => {
    const costo = Number(product.costo_calculado || 0);
    const margen = Number(product.precio || 0) - costo;
    return {
      ...product,
      costo,
      margen,
      fc: product.precio > 0 ? (costo / product.precio) * 100 : Number(product.food_cost_pct || 0),
    };
  }), [productos]);

  const avgSales = rows.reduce((sum, row) => sum + Number(row.ventas_acumuladas || 0), 0) / (rows.length || 1);
  const avgMargin = rows.reduce((sum, row) => sum + Number(row.margen || 0), 0) / (rows.length || 1);
  const matrixData = rows.map(row => {
    const clazz = classifyMenu(row.ventas_acumuladas || 0, row.margen, avgSales, avgMargin);
    return {
      x: row.ventas_acumuladas || 0,
      y: Number(row.margen.toFixed(2)),
      name: row.nombre,
      clazz,
      color: CLASS_COLORS[clazz],
    };
  });

  const hasFinancialData = !!contabilidad && (contabilidad.total_ventas > 0 || contabilidad.total_gastos > 0 || contabilidad.cmv > 0);

  return (
    <AdminPanel>
      <div className="admin-analytics">
        <div className="admin-page-header">
          <div>
            <h1>Analítica & Finanzas</h1>
            <p>Rentabilidad, tendencias e ingeniería de menú</p>
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
          <div className="empty-state"><h4>Cargando analítica</h4><p>Consultando ventas, gastos y productos.</p></div>
        ) : (
          <>
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-label">Ventas</div><div className="kpi-value" style={{ color: 'var(--orange)' }}>{money(contabilidad?.total_ventas ?? 0)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Utilidad neta</div><div className="kpi-value" style={{ color: (contabilidad?.utilidad_neta ?? 0) >= 0 ? 'var(--fresh)' : 'var(--danger)' }}>{money(contabilidad?.utilidad_neta ?? 0)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Ticket promedio</div><div className="kpi-value">{money(contabilidad?.ticket_promedio ?? 0)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Food Cost</div><div className="kpi-value" style={{ color: foodCostColor(contabilidad?.total_ventas ? ((contabilidad.cmv / contabilidad.total_ventas) * 100) : 0) }}>{Math.round(contabilidad?.total_ventas ? ((contabilidad.cmv / contabilidad.total_ventas) * 100) : 0)}%</div></div>
              <div className="kpi-card"><div className="kpi-label">Margen bruto</div><div className="kpi-value" style={{ color: 'var(--fresh)' }}>{Math.round(contabilidad?.margen_bruto ?? 0)}%</div></div>
            </div>

            {!hasFinancialData && productos.length === 0 ? (
              <div className="empty-state"><h4>Sin datos del periodo</h4><p>Cuando existan ventas y productos, los indicadores aparecerán aquí.</p></div>
            ) : (
              <div className="dashboard-grid">
                <div className="dash-card span-8">
                  <div className="dash-card-header"><h3>Tendencia de ventas y utilidad</h3><span className="dash-card-sub">Periodo seleccionado</span></div>
                  {trend.length === 0 ? (
                    <div className="alert-empty">Sin movimientos en el periodo.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <defs>
                          <linearGradient id="analytics-sales" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FF5C19" stopOpacity={0.24} /><stop offset="100%" stopColor="#FF5C19" stopOpacity={0} /></linearGradient>
                          <linearGradient id="analytics-profit" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1FA971" stopOpacity={0.2} /><stop offset="100%" stopColor="#1FA971" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E4EAE5" vertical={false} />
                        <XAxis dataKey="fecha" tick={{ fill: '#5C6B63', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value: string) => value.slice(5)} />
                        <YAxis tick={{ fill: '#5C6B63', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E4EAE5', borderRadius: 10, fontSize: 12 }} formatter={(value, name) => [money(Number(value ?? 0)), name === 'ventas' ? 'Ventas' : 'Utilidad']} />
                        <Area type="monotone" dataKey="ventas" stroke="#FF5C19" strokeWidth={2.5} fill="url(#analytics-sales)" />
                        <Area type="monotone" dataKey="utilidad" stroke="#1FA971" strokeWidth={2.5} fill="url(#analytics-profit)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <DonutCard title="Mix por categoría" data={categoryMix} />
                <DonutCard title="Mix por marca" data={brandMix} />

                <div className="dash-card span-8">
                  <div className="dash-card-header">
                    <h3>Ingeniería de menú</h3>
                    <span className="dash-card-sub">Ventas x margen</span>
                  </div>
                  {matrixData.length === 0 ? (
                    <div className="alert-empty">Sin productos para clasificar.</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={320}>
                        <ScatterChart margin={{ top: 16, right: 24, left: 0, bottom: 16 }}>
                          <CartesianGrid stroke="#E4EAE5" />
                          <XAxis type="number" dataKey="x" name="Ventas" tick={{ fill: '#5C6B63', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis type="number" dataKey="y" name="Margen" tick={{ fill: '#5C6B63', fontSize: 11 }} axisLine={false} tickLine={false} />
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
                  <div className="dash-card-header"><h3>Rentabilidad por plato</h3><span className="dash-card-sub">{rows.length} productos</span></div>
                  {rows.length === 0 ? (
                    <div className="alert-empty">Sin productos registrados.</div>
                  ) : (
                    <div className="admin-table-wrap" style={{ boxShadow: 'none' }}>
                      <table className="admin-table">
                        <thead><tr><th>Plato</th><th className="num">Ventas</th><th className="num">Precio</th><th className="num">Costo</th><th className="num">Food Cost</th><th>Clase</th></tr></thead>
                        <tbody>
                          {rows.sort((a, b) => b.margen - a.margen).map(row => {
                            const clazz = classifyMenu(row.ventas_acumuladas || 0, row.margen, avgSales, avgMargin);
                            return (
                              <tr key={row.id}>
                                <td><strong>{row.nombre}</strong></td>
                                <td className="num">{row.ventas_acumuladas || 0}</td>
                                <td className="num">{money(row.precio)}</td>
                                <td className="num">{money(row.costo)}</td>
                                <td className="num"><span className="margin-badge" style={{ color: foodCostColor(row.fc), background: 'var(--canvas)' }}>{Math.round(row.fc)}%</span></td>
                                <td><span className="menu-class-badge">{menuClassMeta[clazz].icon} {clazz}</span></td>
                              </tr>
                            );
                          })}
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
