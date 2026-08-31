'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/hooks/api';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import MoneyText from '@/components/ui/MoneyText';
import KpiCard from '@/components/ui/KpiCard';
import AdminProductWizard, { type WizardInitial } from '@/components/admin/AdminProductWizard';
import ComprarEnCentro from '@/components/admin/ComprarEnCentro';
import {
  useRindeCentro, useDefinirRecetaCentro, useRegistrarProduccion, useInventarioCentro,
  type RindeProducto, type ItemStockCentro,
} from '@/hooks/centro-produccion';

/**
 * Producto en blanco para el alta desde el Centro. Nace ELABORADO y en
 * borrador: lo que lo hace producible es la receta, y publicarlo es una
 * decisión aparte que se toma desde el catálogo.
 */
const PRODUCTO_NUEVO: WizardInitial = {
  nombre: '', descripcion: '', precio: 0, calorias: null, proteina: null,
  tipo: 'ELABORADO', estado_publicacion: 'BORRADOR', imagen_url: null,
  categorias: [], marcas: [], receta: [], insumo_reventa_id: null,
};

interface ProductoBase { id: number; nombre: string }

function mensajeError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error ?? fallback;
}

/** Productos del catálogo, para elegir cuál se produce en el centro. */
function useProductos() {
  return useQuery({
    queryKey: ['admin', 'productos', 'para-produccion'],
    queryFn: async (): Promise<ProductoBase[]> => {
      // El endpoint responde { data: [...] }; se contemplan también las otras
      // dos formas que usan endpoints vecinos ({ items } y arreglo pelado) para
      // que el selector no quede vacío en silencio si alguno cambia.
      const cuerpo = (await apiClient.get('/api/admin/productos')).data;
      const items: ProductoBase[] = Array.isArray(cuerpo)
        ? cuerpo
        : cuerpo?.data ?? cuerpo?.items ?? [];
      return items.map((p) => ({ id: p.id, nombre: p.nombre }));
    },
  });
}

function RecetaModal({ centroId, inicial, onClose }: {
  centroId: number;
  inicial: RindeProducto | null;
  onClose: () => void;
}) {
  const { data: productos = [] } = useProductos();
  const { data: inventario = [] } = useInventarioCentro(centroId);
  const definir = useDefinirRecetaCentro(centroId);

  const [productoId, setProductoId] = useState(inicial ? String(inicial.producto_id) : '');
  const [lineas, setLineas] = useState<{ insumo_id: string; cantidad: string }[]>(
    inicial
      ? inicial.insumos.map(i => ({ insumo_id: String(i.insumo_id), cantidad: String(i.cantidad_utilizada) }))
      : [{ insumo_id: '', cantidad: '' }],
  );
  const [error, setError] = useState('');

  // Solo el insumo bruto activo puede ser ingrediente. El insumo espejo de un
  // producto también vive en StockCentro, pero ponerlo dentro de su propia
  // receta sería una receta que se consume a sí misma.
  const disponibles = inventario.filter((i: ItemStockCentro) => i.activo);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!productoId) { setError('Elegí el producto que se va a producir.'); return; }

    const limpias = lineas
      .filter(l => l.insumo_id && Number(l.cantidad) > 0)
      .map(l => ({ insumo_id: Number(l.insumo_id), cantidad_utilizada: Number(l.cantidad) }));
    if (limpias.length === 0) { setError('Cargá al menos un insumo con su cantidad.'); return; }
    if (new Set(limpias.map(l => l.insumo_id)).size !== limpias.length) {
      setError('Hay un insumo repetido en la receta.'); return;
    }

    try {
      await definir.mutateAsync({ producto_id: Number(productoId), lineas: limpias });
      onClose();
    } catch (err: unknown) {
      setError(mensajeError(err, 'No se pudo guardar la receta.'));
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h3>{inicial ? `Receta de ${inicial.nombre}` : 'Nueva receta de producción'}</h3>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <p className="form-hint" style={{ marginBottom: 14 }}>
            Cuánto insumo bruto lleva <strong>una unidad</strong> del producto. La receta se
            reemplaza entera cada vez que se guarda.
          </p>

          <div className="form-group">
            <label>Producto</label>
            <select value={productoId} onChange={e => setProductoId(e.target.value)} disabled={Boolean(inicial)}>
              <option value="">Elegí un producto…</option>
              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          {lineas.map((linea, idx) => (
            <div className="form-grid" key={idx} style={{ alignItems: 'end' }}>
              <div className="form-group">
                <label>Insumo</label>
                <select
                  value={linea.insumo_id}
                  onChange={e => setLineas(ls => ls.map((l, i) => i === idx ? { ...l, insumo_id: e.target.value } : l))}
                >
                  <option value="">Elegí…</option>
                  {disponibles.map(i => (
                    <option key={i.insumo_id} value={i.insumo_id}>
                      {i.nombre} ({i.unidad_medida}) — hay {i.stock_actual}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Cantidad por unidad</label>
                <input
                  type="number" step="0.0001" min="0" value={linea.cantidad}
                  onChange={e => setLineas(ls => ls.map((l, i) => i === idx ? { ...l, cantidad: e.target.value } : l))}
                />
              </div>
              <button
                type="button" className="admin-btn ghost sm"
                onClick={() => setLineas(ls => ls.length === 1 ? ls : ls.filter((_, i) => i !== idx))}
              >
                Quitar
              </button>
            </div>
          ))}

          <button
            type="button" className="admin-btn ghost sm" style={{ marginTop: 6 }}
            onClick={() => setLineas(ls => [...ls, { insumo_id: '', cantidad: '' }])}
          >
            + Agregar insumo
          </button>

          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={definir.isPending}>
            {definir.isPending ? 'Guardando…' : 'Guardar receta'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ProducirModal({ centroId, producto, onClose }: {
  centroId: number; producto: RindeProducto; onClose: () => void;
}) {
  const producir = useRegistrarProduccion(centroId);
  // Una clave por apertura del modal: el reintento manda la misma y el
  // servidor lo rechaza en vez de producir dos veces.
  const [claveIdempotencia] = useState(() => crypto.randomUUID());
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');

  const n = Number(cantidad || 0);
  const costoTotal = useMemo(() => n * producto.costo_unitario, [n, producto.costo_unitario]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!Number.isInteger(n) || n <= 0) { setError('La cantidad debe ser un número entero mayor a cero.'); return; }
    if (n > producto.unidades_posibles) {
      setError(`Con el insumo que hay solo alcanza para ${producto.unidades_posibles}.`); return;
    }
    try {
      await producir.mutateAsync({
        producto_id: producto.producto_id, cantidad: n,
        nota: nota || undefined, idempotency_key: claveIdempotencia,
      });
      onClose();
    } catch (err: unknown) {
      setError(mensajeError(err, 'No se pudo registrar la producción.'));
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h3>Producir — {producto.nombre}</h3>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <p className="form-hint" style={{ marginBottom: 14 }}>
            Alcanza para <strong>{producto.unidades_posibles}</strong> unidades con el insumo
            que hay hoy, a <MoneyText value={producto.costo_unitario} /> cada una.
          </p>

          <div className="form-group">
            <label>Unidades a producir</label>
            <input type="number" step="1" min="1" value={cantidad} onChange={e => setCantidad(e.target.value)} />
          </div>

          {n > 0 && (
            <p className="form-hint">
              Se va a consumir insumo por <MoneyText value={costoTotal} /> y acreditar {n} unidades
              al inventario del centro.
            </p>
          )}

          <div className="form-group">
            <label>Nota (opcional)</label>
            <input value={nota} onChange={e => setNota(e.target.value)} />
          </div>

          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={producir.isPending}>
            {producir.isPending ? 'Produciendo…' : 'Producir'}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Fila de la pantalla: un producto del Centro, lo fabrique o lo compre.
 *
 * Antes esta lista salía solo del rinde, o sea solo de los que tienen receta.
 * Los de reventa no aparecían en ningún lado, y son justamente los que hay que
 * mirar para saber cuánto se puede despachar sin producir nada.
 */
interface FilaProduccion {
  producto_id: number;
  /** El insumo espejo: sobre él se compra y se despacha. */
  espejoId: number;
  nombre: string;
  /** ELABORADO lo produce el Centro; el resto lo compra. */
  tipo: string;
  /** Unidades hechas o compradas, listas para despachar. */
  enStock: number;
  /** Cuántas MÁS podría fabricar con el bruto de hoy. Solo el elaborado. */
  rinde: RindeProducto | null;
  costoUnitario: number;
}

export default function ProduccionCentro({ centroId }: { centroId: number }) {
  const { data: productos = [], isLoading, refetch } = useRindeCentro(centroId);
  const { data: inventario = [], isLoading: cargandoInventario } = useInventarioCentro(centroId);
  const [filtro, setFiltro] = useState<'todos' | 'ELABORADO' | 'REVENTA'>('todos');

  const filas = useMemo<FilaProduccion[]>(() => {
    const rindePorProducto = new Map(productos.map(r => [r.producto_id, r]));
    // La lista base es el inventario de terminados del Centro: ahí está TODO lo
    // que puede despachar. El rinde se le engancha al que tenga receta.
    return inventario
      .filter((i: ItemStockCentro) => i.es_producto && i.producto_id != null)
      .map((i: ItemStockCentro) => {
        const rinde = rindePorProducto.get(i.producto_id!) ?? null;
        return {
          producto_id: i.producto_id!,
          espejoId: i.insumo_id,
          nombre: i.nombre,
          tipo: i.producto_tipo ?? 'REVENTA',
          enStock: i.stock_actual,
          rinde,
          // El costo del elaborado sale de su receta; el del comprado, de lo
          // que se pagó por él (el promedio ponderado de su stock).
          costoUnitario: rinde?.costo_unitario ?? i.costo_promedio,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [inventario, productos]);

  const visibles = filtro === 'todos'
    ? filas
    : filas.filter(f => (filtro === 'ELABORADO' ? f.tipo === 'ELABORADO' : f.tipo !== 'ELABORADO'));

  // Los totales son de lo que se está mirando: es la pregunta que responde la
  // pantalla —cuánto puedo producir y cuánto puedo enviar sin producir nada—.
  const totalEnStock = visibles.reduce((acc, f) => acc + f.enStock, 0);
  const totalProducible = visibles.reduce((acc, f) => acc + (f.rinde?.unidades_posibles ?? 0), 0);
  const [recetaAbierta, setRecetaAbierta] = useState<{ inicial: RindeProducto | null } | null>(null);
  const [produciendo, setProduciendo] = useState<RindeProducto | null>(null);
  const [comprando, setComprando] = useState<FilaProduccion | null>(null);
  const [creandoProducto, setCreandoProducto] = useState(false);

  return (
    <>
      <div className="admin-toolbar" style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
        {/* Dos caminos distintos a propósito: "Nueva receta" le pone receta a un
            producto que ya está en el catálogo; "Nuevo producto" crea el
            producto Y su receta de una sola vez, para no obligar a ir al
            catálogo y volver. */}
        <button className="admin-btn primary" onClick={() => setCreandoProducto(true)}>
          + Nuevo producto
        </button>
        <button className="admin-btn ghost" onClick={() => setRecetaAbierta({ inicial: null })}>
          Nueva receta
        </button>
      </div>

      {creandoProducto && (
        <AdminProductWizard
          initial={PRODUCTO_NUEVO}
          avgSales={0}
          avgMargin={0}
          centroId={centroId}
          onClose={() => setCreandoProducto(false)}
          onSaved={() => { setCreandoProducto(false); refetch(); }}
        />
      )}
      {recetaAbierta && (
        <RecetaModal centroId={centroId} inicial={recetaAbierta.inicial} onClose={() => setRecetaAbierta(null)} />
      )}
      {produciendo && (
        <ProducirModal centroId={centroId} producto={produciendo} onClose={() => setProduciendo(null)} />
      )}
      {comprando && (
        <ComprarEnCentro
          centroId={centroId}
          espejoId={comprando.espejoId}
          nombre={comprando.nombre}
          onClose={() => setComprando(null)}
        />
      )}

      <div className="admin-cat-filters" style={{ marginBottom: 12 }}>
        {([['todos', 'Todos'], ['ELABORADO', 'Elaborados'], ['REVENTA', 'Reventa']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`cat-filter-btn ${filtro === id ? 'active' : ''}`}
            onClick={() => setFiltro(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard label="Productos" value={visibles.length} />
        <KpiCard label="Unidades listas para enviar" value={totalEnStock} highlight />
        <KpiCard label="Unidades que puede producir" value={totalProducible} accent="var(--fresh)" />
      </div>

      {isLoading || cargandoInventario ? (
        <EmptyState title="Cargando…" />
      ) : visibles.length === 0 ? (
        <EmptyState
          title={filtro === 'todos' ? 'Este centro todavía no tiene productos' : 'Nada en este filtro'}
          hint={filtro === 'ELABORADO'
            ? 'Definí la receta de un producto para poder fabricarlo acá.'
            : 'Los productos que el Centro compra aparecen acá con su stock.'}
        />
      ) : (
        <DataTable
          data={visibles}
          rowKey={(row: FilaProduccion) => row.producto_id}
          columns={[
            { key: 'nombre', header: 'Producto', render: (row: FilaProduccion) => (
              <div>
                <div className="admin-cell-title">{row.nombre}</div>
                <div className="admin-cell-sub">
                  {row.rinde
                    ? row.rinde.insumos.map(i => `${i.nombre} ${i.cantidad_utilizada} ${i.unidad_medida}`).join(' · ')
                    : 'Se compra hecho'}
                </div>
              </div>
            )},
            { key: 'tipo', header: 'Cómo se abastece', render: (row: FilaProduccion) => (
              <span className="cat-badge">{row.tipo === 'ELABORADO' ? 'Se produce' : 'Se compra'}</span>
            )},
            { key: 'stock', header: 'Listas para enviar', className: 'num',
              render: (row: FilaProduccion) => `${row.enStock} u.` },
            // Solo el elaborado tiene rinde: de lo que se compra no hay nada que
            // fabricar, y poner un 0 ahí se leería como "no queda", que es otra
            // cosa.
            { key: 'rinde', header: 'Puede producir', className: 'num',
              render: (row: FilaProduccion) => row.rinde ? `${row.rinde.unidades_posibles} u.` : '—' },
            { key: 'costo', header: 'Costo por unidad', className: 'num',
              render: (row: FilaProduccion) => <MoneyText value={row.costoUnitario} /> },
            { key: 'acciones', header: '', render: (row: FilaProduccion) => (
              <div style={{ display: 'flex', gap: 6 }}>
                {row.rinde ? (
                  <>
                    <button
                      className="admin-btn ghost sm"
                      onClick={() => setProduciendo(row.rinde!)}
                      disabled={row.rinde.unidades_posibles === 0}
                    >
                      Producir
                    </button>
                    <button className="admin-btn ghost sm" onClick={() => setRecetaAbierta({ inicial: row.rinde })}>
                      Receta
                    </button>
                  </>
                ) : (
                  <>
                    {/* Lo que el Centro compra se repone comprándolo: es la
                        unica forma de que estos productos vuelvan a tener stock
                        para despachar. */}
                    <button className="admin-btn ghost sm" onClick={() => setComprando(row)}>
                      Comprar
                    </button>
                    {/* Y si algún día se decide fabricarlo, se le define receta. */}
                    <button className="admin-btn ghost sm" onClick={() => setRecetaAbierta({ inicial: null })}>
                      Definir receta
                    </button>
                  </>
                )}
              </div>
            )},
          ]}
        />
      )}
    </>
  );
}
