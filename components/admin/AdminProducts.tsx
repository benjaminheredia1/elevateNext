'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '@/hooks/api';
import {
  foodCostColor, classifyMenu, menuClassMeta, buildablePortions,
} from './inventoryData';
import AdminProductWizard, { type WizardInitial, type CampoHeredable } from './AdminProductWizard';
import ProductoSucursalesModal from './ProductoSucursalesModal';
import BotonExportarExcel from '@/components/ui/BotonExportarExcel';
import SucursalSelector from '@/components/ui/SucursalSelector';
import CopiarProductosModal from '@/components/admin/CopiarProductosModal';
import { useSucursales } from '@/hooks/sucursales';
import { useQueryClient } from '@tanstack/react-query';
import { useSucursalAdmin } from '@/hooks/sucursal-admin';
import { useInventarioCentro, useRindeCentro } from '@/hooks/centro-produccion';
import { etiquetaTipo } from './etiqueta-tipo';

type Tipo = 'ELABORADO' | 'REVENTA' | 'TERCIADO';

type Estado = 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO' | 'BAJA';

interface ApiProducto {
  id: number;
  nombre: string;
  descripcion: string;
  precio: number;
  imagen_url: string | null;
  disponible: boolean;
  tipo: Tipo;
  estado_publicacion: Estado;
  insumo_reventa_id: number | null;
  /** Insumo espejo con su stock en la sucursal consultada. */
  insumo_reventa?: { stocks?: { stock_actual: number }[] } | null;
  ventas_acumuladas: number;
  calorias: number | null;
  proteina: string | null;
  motivo_baja: string | null;
  /** Estado en la sucursal consultada. `null` si no está habilitado ahí. */
  sucursal_estado?: { disponible: boolean; motivo_baja: string | null; fecha_baja: string | null } | null;
  fecha_baja: string | null;
  en_revision: boolean;
  revision_desde: string | null;
  motivo_revision: string | null;
  insumo_causa_revision_id: number | null;
  categoria_id: { categoria: { id: number; nombre: string } }[];
  marcas: { marca: { id: number; nombre: string } }[];
  /** Qué campos toma del catálogo en la sucursal consultada. */
  heredado?: Partial<Record<CampoHeredable, boolean>>;
  recetaProducto_id: {
    insumo_id: number;
    cantidad_utilizada: number;
    // `stocks` viene filtrado por la sucursal consultada.
    insumo?: { stock_actual: number; costo_promedio: number; unidad_medida: string; nombre: string; stocks?: { stock_actual: number }[] };
  }[];
  costo_calculado: number;
  food_cost_pct: number;
}

const PUB_FILTERS = ['todos', 'PUBLICADO', 'BORRADOR', 'ARCHIVADO'] as const;
const pubLabel: Record<string, string> = { todos: 'Todos', PUBLICADO: 'Publicado', BORRADOR: 'Borrador', ARCHIVADO: 'Archivado' };
const pubBadgeClass: Record<Estado, string> = { PUBLICADO: 'publicado', BORRADOR: 'borrador', ARCHIVADO: 'archivado', BAJA: 'archivado' };

const EditIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const TrashIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;
const BajaIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>;

/**
 * Catálogo de productos. La misma pantalla sirve a la sucursal y al Centro,
 * porque el catálogo es uno solo; lo que cambia es qué necesita ver cada uno.
 *
 * En el CENTRO se muestra la naturaleza real del producto —Elaborado si lo
 * fabrica, Reventa si lo compra—, que es lo que decide cómo abastecerlo. En la
 * SUCURSAL todo se rotula Terciado: le llega hecho y no le cambia nada saber si
 * allá lo hornearon o lo compraron.
 *
 * La clase de menú (Estrella, Caballo, Puzzle, Perro) NO se muestra en el
 * Centro: se calcula con las ventas acumuladas contra el promedio, y vender es
 * cosa de la sucursal. En el Centro solo se produce y se despacha, así que ahí
 * "Estrella" no significaría nada.
 */
/**
 * Producto en blanco para el alta desde el Centro. Nace ELABORADO y en borrador:
 * lo que lo hace producible es la receta, y publicarlo es una decisión aparte.
 */
const PRODUCTO_NUEVO: WizardInitial = {
  nombre: '', descripcion: '', precio: 0, calorias: null, proteina: null,
  tipo: 'ELABORADO', estado_publicacion: 'BORRADOR', imagen_url: null,
  categorias: [], marcas: [], receta: [], insumo_reventa_id: null,
};

export default function AdminProducts(
  { ambito = 'sucursal', centroId }: { ambito?: 'sucursal' | 'centro'; centroId?: number } = {},
) {
  const esCentro = ambito === 'centro';
  // En el Centro conviene separar lo que fabrica de lo que compra: son dos
  // trabajos distintos —producir y reponer— y se miran en momentos distintos.
  const [filtroCentro, setFiltroCentro] = useState<'todos' | 'ELABORADO' | 'REVENTA'>('todos');
  // Cuántas unidades TIENE el Centro de cada producto, listas para despachar.
  // No es el rinde: el rinde dice cuántas podría fabricar con el bruto de hoy,
  // esto dice cuántas ya fabricó o compró y están esperando el envío.
  const { data: inventarioCentro = [] } = useInventarioCentro(esCentro ? centroId ?? null : null);
  // La ficha técnica de un producto del Centro vive en RecetaCentro, no en
  // RecetasProducto —esa es la de sucursal y por diseño está vacía—. Sin esto
  // la pantalla leía el lugar equivocado: mostraba "sin ficha" en productos que
  // sí tienen receta, y al abrir el editor la receta aparecía en blanco.
  const { data: rindeCentro = [] } = useRindeCentro(esCentro ? centroId ?? null : null);
  const qc = useQueryClient();
  /**
   * Los datos del Centro —receta y stock— los trae React Query, y se piden al
   * montar la pantalla. Sin invalidarlos, un producto recién creado no figura en
   * ese caché: al reabrirlo la receta salía vacía, como si no se hubiera
   * guardado, y guardarlo de nuevo la borraba de verdad.
   */
  const refrescarCentro = () => {
    if (esCentro) qc.invalidateQueries({ queryKey: ['centro-produccion'] });
  };
  const recetaDelCentro = useMemo(() => {
    const mapa = new Map<number, { insumo_id: number; cantidad_utilizada: number }[]>();
    for (const r of rindeCentro) {
      mapa.set(r.producto_id, r.insumos.map(i => ({
        insumo_id: i.insumo_id,
        cantidad_utilizada: i.cantidad_utilizada,
      })));
    }
    return mapa;
  }, [rindeCentro]);
  const stockEnCentro = useMemo(() => {
    const mapa = new Map<number, { stock: number; costo: number }>();
    for (const fila of inventarioCentro) {
      mapa.set(fila.insumo_id, { stock: fila.stock_actual, costo: fila.costo_promedio });
    }
    return mapa;
  }, [inventarioCentro]);
  const enCentro = (insumoId: number | null) =>
    insumoId == null ? undefined : stockEnCentro.get(insumoId);
  const [productos, setProductos] = useState<ApiProducto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('Todos');
  const [filterPub, setFilterPub] = useState<string>('todos');
  const [wizard, setWizard] = useState<WizardInitial | null>(null);
  // Local de referencia para el precio, el costo y el rinde de la lista. Sale
  // del store del panel: es la misma que muestra la barra lateral, y tenerla
  // acá evita la copia local que había que sincronizar con un efecto.
  const { sucursal, setSucursal, listo } = useSucursalAdmin();
  const { data: sucursales = [] } = useSucursales();
  // Solo se nombra cuando hay más de un local: con uno solo sería ruido.
  const nombreSucursal = sucursales.length > 1
    ? sucursales.find(s => String(s.id) === sucursal)?.nombre
    : null;
  const [sucursalesDe, setSucursalesDe] = useState<{ id: number; nombre: string; precio: number } | null>(null);
  const [copiarAbierto, setCopiarAbierto] = useState(false);
  const [quitarConfirm, setQuitarConfirm] = useState<number | null>(null);
  const [bajaConfirm, setBajaConfirm] = useState<number | null>(null);
  const [bajaMotivo, setBajaMotivo] = useState('');
  const [dbCategorias, setDbCategorias] = useState<string[]>(['Todos']);
  const [actionError, setActionError] = useState('');
  const [vista, setVista] = useState<'activos' | 'en-revision' | 'eliminados'>('activos');
  const [restoreConfirm, setRestoreConfirm] = useState<number | null>(null);

  /**
   * Número del pedido en curso. Al abrir la pantalla se dispara una carga con
   * la sucursal todavía sin resolver (que devuelve el catálogo completo) y otra
   * apenas el panel dice en qué local estamos. Sin esto, la primera —más pesada
   * porque trae todo— podía llegar después y pisar a la correcta: la pantalla
   * decía "Sucursal Sur" y listaba los productos de Fitbull hasta recargar.
   */
  const pedido = useRef(0);

  const load = () => {
    const mio = ++pedido.current;
    setLoading(true);
    // El Centro pide el catálogo COMPLETO, sin sucursal. Con `?sucursal=` el
    // endpoint devuelve solo lo habilitado en ese local, así que el Centro veía
    // el catálogo de una sucursal en vez del suyo: un producto recién creado
    // —que todavía no llegó a ningún lado— no aparecía en su propia lista.
    apiClient.get(`/api/admin/productos${!esCentro && sucursal ? `?sucursal=${sucursal}` : ''}`)
      .then(res => {
        // Respuesta de una carga vieja: la descarta, ya hay otra más nueva.
        if (mio !== pedido.current) return;
        setProductos(res.data?.data ?? []);
      })
      .catch(() => { if (mio === pedido.current) setProductos([]); })
      .finally(() => { if (mio === pedido.current) setLoading(false); });
  };

  useEffect(() => {
    // Sin la sucursal resuelta no se pide nada: el pedido saldría sin local y
    // traería el catálogo de todo el negocio. En el Centro no aplica —ahí el
    // catálogo completo es justamente lo que se quiere— y esperar a una
    // sucursal que no se usa solo demoraría la pantalla.
    if (!esCentro && !listo) return;
    load();
    apiClient.get('/api/categoria')
      .then(r => {
        const cats: { nombre: string }[] = Array.isArray(r.data) ? r.data : r.data?.data ?? [];
        setDbCategorias(['Todos', ...new Set(cats.map(c => c.nombre))]);
      })
      .catch(() => setDbCategorias(['Todos']));
    // El precio, el costo y el rinde dependen del local: se recarga al cambiarlo.
  }, [sucursal, listo, esCentro]);

  // Los productos en BAJA son la "eliminación lógica": no aparecen entre los activos,
  // ni en la tienda, ni en caja, hasta que se restauren desde la pestaña Eliminados.
  // Con una sucursal elegida, "dado de baja" se lee del estado local; en el
  // consolidado, del estado del catálogo.
  const deBajaAca = (p: ApiProducto) =>
    sucursal ? p.sucursal_estado?.disponible === false : p.estado_publicacion === 'BAJA';
  const activos = useMemo(
    () => productos.filter(p => !deBajaAca(p) && p.estado_publicacion !== 'BAJA' && !p.en_revision),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productos, sucursal],
  );
  const enRevision = useMemo(() => productos.filter(p => p.en_revision), [productos]);
  const eliminados = useMemo(
    () => productos.filter(p => deBajaAca(p) || p.estado_publicacion === 'BAJA'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productos, sucursal],
  );

  const publicados = activos.filter(p => p.estado_publicacion === 'PUBLICADO').length;

  const { avgSales, avgMargin } = useMemo(() => {
    const n = activos.length || 1;
    return {
      avgSales: activos.reduce((s, p) => s + (p.ventas_acumuladas || 0), 0) / n,
      avgMargin: activos.reduce((s, p) => s + (p.precio - (p.costo_calculado || 0)), 0) / n,
    };
  }, [activos]);

  const filtered = activos.filter(p => {
    const ms = p.nombre.toLowerCase().includes(search.toLowerCase());
    const mc = filterCat === 'Todos' || p.categoria_id.some(c => c.categoria?.nombre === filterCat);
    const mp = filterPub === 'todos' || p.estado_publicacion === filterPub;
    // En el Centro se separa lo que fabrica de lo que compra. Un TERCIADO se
    // cuenta con los de reventa: el Centro tampoco lo produce.
    const mt = !esCentro || filtroCentro === 'todos'
      || (filtroCentro === 'ELABORADO' ? p.tipo === 'ELABORADO' : p.tipo !== 'ELABORADO');
    return ms && mc && mp && mt;
  });

  const eliminadosFiltrados = eliminados.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()),
  );

  const setEstado = async (id: number, estado: Estado) => {
    setActionError('');
    try {
      // Con una sucursal elegida, publicar/archivar es DE ESE LOCAL: el menú de
      // las demás sucursales no se toca.
      await apiClient.patch(`/api/admin/productos/${id}`, {
        estado_publicacion: estado,
        ...(sucursal ? { sucursal_id: Number(sucursal) } : {}),
      });
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setActionError(err?.response?.data?.error ?? 'No se pudo cambiar el estado. Verifica nombre, descripcion, precio, menu y receta.');
      setTimeout(() => setActionError(''), 6000);
    }
  };

  /**
   * Da de baja el producto. Con una sucursal elegida la baja es DE ESE LOCAL:
   * sale de su menú con motivo y se puede restaurar, sin tocar a las demás.
   * Sin sucursal (dueño en consolidado) sigue siendo la baja del catálogo.
   */
  const darDeBaja = async (id: number) => {
    if (!bajaMotivo.trim()) return;
    setActionError('');
    try {
      if (sucursal) {
        await apiClient.patch(`/api/admin/productos/${id}/sucursales`, {
          accion: 'BAJA', sucursal_id: Number(sucursal), motivo: bajaMotivo.trim(),
        });
      } else {
        await apiClient.patch(`/api/admin/productos/${id}`, { estado_publicacion: 'BAJA', motivo: bajaMotivo.trim() });
      }
      setBajaConfirm(null);
      setBajaMotivo('');
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setBajaConfirm(null);
      setActionError(err?.response?.data?.error ?? 'No se pudo dar de baja el producto.');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  /**
   * Saca el producto del menú de la sucursal que se está viendo. No lo borra del
   * catálogo: en los otros locales sigue igual, con su precio y su historial.
   */
  const quitarDeSucursal = async (id: number) => {
    if (!sucursal) return;
    setActionError('');
    try {
      const res = await apiClient.delete(`/api/admin/productos/${id}/sucursales`, {
        data: { sucursal_id: Number(sucursal) },
      });
      setQuitarConfirm(null);
      if (res.data?.data?.modo === 'DESHABILITADO') {
        setActionError(`Tiene ${res.data.data.ventas} venta(s) en ${nombreSucursal ?? 'esta sucursal'}, así que no se borra su ficha: quedó marcado como no disponible acá.`);
        setTimeout(() => setActionError(''), 8000);
      }
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setQuitarConfirm(null);
      setActionError(err?.response?.data?.error ?? 'No se pudo quitar el producto de esta sucursal.');
      setTimeout(() => setActionError(''), 6000);
    }
  };

  const resolverRevision = async (id: number) => {
    setActionError('');
    if (!sucursal) {
      setActionError('Elegí una sucursal: la revisión se resuelve en el local donde se abrió.');
      setTimeout(() => setActionError(''), 5000);
      return;
    }
    try {
      await apiClient.patch(`/api/productos/${id}/resolver-revision`, { sucursal_id: Number(sucursal) });
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setActionError(err?.response?.data?.error ?? 'No se pudo marcar como resuelto.');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  const restaurar = async (id: number) => {
    setActionError('');
    try {
      if (sucursal) {
        // Vuelve al menú de este local, sin tocar el estado del catálogo.
        await apiClient.patch(`/api/admin/productos/${id}/sucursales`, {
          accion: 'RESTAURAR', sucursal_id: Number(sucursal),
        });
      } else {
        // Vuelve como BORRADOR: no se muestra en tienda ni en caja hasta publicarse.
        await apiClient.patch(`/api/admin/productos/${id}`, { estado_publicacion: 'BORRADOR' });
      }
      setRestoreConfirm(null);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setRestoreConfirm(null);
      setActionError(err?.response?.data?.error ?? 'No se pudo restaurar el producto.');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  const openEdit = (p: ApiProducto) => setWizard({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion ?? '',
    precio: p.precio,
    calorias: p.calorias,
    proteina: p.proteina,
    tipo: p.tipo,
    estado_publicacion: p.estado_publicacion === 'BAJA' ? 'BORRADOR' : p.estado_publicacion,
    imagen_url: p.imagen_url,
    categorias: p.categoria_id.map(c => c.categoria.id),
    marcas: p.marcas.map(m => m.marca.id),
    // Desde el Centro se edita SU ficha: la de producción. Cargar la local
    // —vacía— hacía que la receta pareciera perdida y que al guardar se mandara
    // en blanco, borrando la que sí existía.
    receta: esCentro
      ? (recetaDelCentro.get(p.id) ?? [])
      : p.recetaProducto_id.map(r => ({ insumo_id: r.insumo_id, cantidad_utilizada: r.cantidad_utilizada })),
    insumo_reventa_id: p.insumo_reventa_id,
    // Qué campos toma del catálogo, para que el wizard lo diga en pantalla.
    heredado: p.heredado,
  });

  return (
    <div className="admin-products">
      <div className="admin-page-header">
        <div>
          <h1>Productos</h1>
          <p>
            {activos.length} productos · {publicados} publicados{enRevision.length > 0 ? ` · ${enRevision.length} en revisión` : ''}{eliminados.length > 0 ? ` · ${eliminados.length} eliminados` : ''}
            {/* Precio, costo y rinde son de este local: decirlo evita leer los
                números de una sucursal creyendo que son de otra. */}
            {!esCentro && nombreSucursal && <> · precios y rinde de <strong>{nombreSucursal}</strong></>}
            {esCentro && <> · costo y stock del <strong>Centro de Producción</strong></>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <BotonExportarExcel url={`/api/admin/productos/export${sucursal ? `?sucursal=${sucursal}` : ''}`} />
          {/* El precio, el costo y el rinde son siempre de UN local: sumarlos
              entre sucursales daría un número que no existe en ninguna. */}
          {/* El Centro no es una sucursal: elegir un local acá no significa nada. */}
          {!esCentro && <SucursalSelector value={sucursal} onChange={setSucursal} permitirTodas={false} />}
          {/* Un local nuevo arranca sin catálogo: este es el camino para llenarlo
              sin duplicar productos con el mismo nombre. Es de sucursal a
              sucursal —copiar la carta de Fitbull a un local nuevo, en cero—.
              En el Centro no significa nada: el Centro no copia cartas de
              nadie, produce y despacha. */}
          {!esCentro && sucursales.length > 1 && sucursal && (
            <button className="admin-btn" onClick={() => setCopiarAbierto(true)}>Agregar de otra sucursal</button>
          )}
          {/* Los productos nacen en el Centro, junto con su receta de producción.
              Desde la SUCURSAL el botón es un enlace: su catálogo administra
              precio, foto y publicación de lo que ya existe, y el servidor
              rechaza el alta sin centro_id igual (422) — el enlace solo evita
              mandar al usuario a un formulario que va a rebotar.

              Estando YA en el Centro, en cambio, ese enlace apuntaba a la misma
              pantalla y no hacía nada: acá el botón abre el alta. */}
          {esCentro ? (
            <button className="admin-btn primary" onClick={() => setWizard(PRODUCTO_NUEVO)}>+ Nuevo Producto</button>
          ) : (
            <a className="admin-btn primary" href="/admin/centro-produccion">+ Nuevo Producto (en el Centro)</a>
          )}
        </div>
      </div>

      <div className="admin-cat-filters" style={{ marginBottom: 16 }}>
        <button className={`cat-filter-btn ${vista === 'activos' ? 'active' : ''}`} onClick={() => setVista('activos')}>
          Activos ({activos.length})
        </button>
        {enRevision.length > 0 && (
          <button className={`cat-filter-btn ${vista === 'en-revision' ? 'active' : ''}`} onClick={() => setVista('en-revision')} style={{ borderColor: 'var(--amber)', color: vista === 'en-revision' ? 'var(--amber)' : 'inherit' }}>
            ⚠️ En Revisión ({enRevision.length})
          </button>
        )}
        <button className={`cat-filter-btn ${vista === 'eliminados' ? 'active' : ''}`} onClick={() => setVista('eliminados')}>
          Eliminados / De baja ({eliminados.length})
        </button>
      </div>

      <div className="admin-filters">
        <div className="admin-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {vista === 'activos' && (
          <div className="admin-cat-filters">
            {PUB_FILTERS.map(f => (
              <button key={f} className={`cat-filter-btn ${filterPub === f ? 'active' : ''}`} onClick={() => setFilterPub(f)}>{pubLabel[f]}</button>
            ))}
          </div>
        )}
        {esCentro && vista === 'activos' && (
          <div className="admin-cat-filters">
            {([['todos', 'Todos'], ['ELABORADO', 'Los que produce'], ['REVENTA', 'Los que compra']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`cat-filter-btn ${filtroCentro === id ? 'active' : ''}`}
                onClick={() => setFiltroCentro(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {vista === 'activos' && (
        <div className="admin-cat-filters" style={{ marginBottom: 20 }}>
          {dbCategorias.map(cat => (
            <button key={cat} className={`cat-filter-btn ${filterCat === cat ? 'active' : ''}`} onClick={() => setFilterCat(cat)}>{cat}</button>
          ))}
        </div>
      )}
      {actionError && (
        <div style={{ background: 'rgba(229,72,77,0.12)', border: '1px solid rgba(229,72,77,0.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 14, color: 'var(--danger)', fontSize: 13 }}>
          ⚠️ {actionError}
        </div>
      )}

      {vista === 'en-revision' ? (
        <>
          <div className="dashboard-grid">
            {enRevision.length === 0 ? (
              <div className="empty-state">
                <h4>Sin productos en revisión</h4>
                <p>Los productos que necesiten ajustes aparecerán aquí.</p>
              </div>
            ) : (
              enRevision.map(p => (
                <div key={p.id} className="dash-card span-4" style={{ borderLeft: '3px solid var(--amber)' }}>
                  <div className="dash-card-header">
                    <h3>{p.nombre}</h3>
                    <span className="dash-card-sub" style={{ color: 'var(--amber)', fontWeight: 600 }}>⚠️ EN REVISIÓN</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                    {p.revision_desde && (
                      <div>
                        <span className="form-hint">Desde:</span>
                        <div style={{ fontSize: 12 }}>
                          {new Date(p.revision_desde).toLocaleDateString('es-BO', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    )}
                    {p.motivo_revision && (
                      <div>
                        <span className="form-hint">Motivo:</span>
                        <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 4 }}>
                          {p.motivo_revision}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="admin-btn primary" style={{ flex: 1 }} onClick={() => openEdit(p)}>
                      ✏ Editar receta
                    </button>
                    <button
                      type="button"
                      className="admin-btn secondary"
                      title="Quitar la marca de revisión sin editar (ej. si el insumo ya fue reactivado)"
                      onClick={() => resolverRevision(p.id)}
                    >
                      ✓ Resuelto
                    </button>
                  </div>
                  <p className="form-hint" style={{ marginTop: 8 }}>
                    Al guardar la receta sin insumos de baja, o al dar de baja el producto, la revisión se resuelve sola.
                  </p>
                </div>
              ))
            )}
          </div>
        </>
      ) : vista === 'eliminados' ? (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Producto</th><th className="num">Precio</th><th>Motivo de baja</th><th>Fecha de baja</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {eliminadosFiltrados.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div className="product-cell">
                        <span className="product-cell-name">{p.nombre}</span>
                        <span className="product-cell-desc">{(p.descripcion ?? '').slice(0, 50)}{(p.descripcion ?? '').length > 50 ? '…' : ''}</span>
                      </div>
                    </td>
                    <td className="num">Bs {p.precio}</td>
                    <td>{p.motivo_baja || '—'}</td>
                    <td>{p.fecha_baja ? new Date(p.fecha_baja).toLocaleDateString() : '—'}</td>
                    <td>
                      <div className="action-btns">
                        {restoreConfirm === p.id ? (
                          <div className="delete-confirm">
                            <button className="action-btn confirm-yes" onClick={() => restaurar(p.id)}>Sí</button>
                            <button className="action-btn confirm-no" onClick={() => setRestoreConfirm(null)}>No</button>
                          </div>
                        ) : (
                          <button className="admin-btn" onClick={() => setRestoreConfirm(p.id)} title="Restaurar como borrador">↩ Restaurar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && eliminadosFiltrados.length === 0 && (
            <div className="empty-state">
              <h4>Sin productos eliminados</h4>
              <p>Los productos dados de baja aparecerán aquí y podrás restaurarlos.</p>
            </div>
          )}
        </>
      ) : (
      <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Producto</th><th>Tipo</th>
              {/* Precio, food cost, clase y rinde son de la SUCURSAL: los
                  calcula la API para el local seleccionado. En el Centro
                  mostrarían números de otro y ya no hay local que elegir. */}
              {!esCentro && <><th className="num">Precio</th><th className="num">Costo</th><th className="num">Food Cost</th><th>Clase</th></>}
              {esCentro && <><th className="num">Costo en el centro</th><th className="num">En el centro</th></>}
              {!esCentro && <th className="num">Rinde</th>}
              <th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const costo = p.costo_calculado ?? 0;
              const fc = p.food_cost_pct ?? 0;
              const margin = p.precio - costo;
              const clazz = classifyMenu(p.ventas_acumuladas || 0, margin, avgSales, avgMargin);
              // En el Centro, "sin ficha" es no tener receta DE PRODUCCIÓN. La
              // local está vacía a propósito y marcaba a todos como sin ficha.
              // Un producto con insumo espejo NO necesita receta local: la
              // sucursal lo vende 1:1 contra ese insumo. Marcarlo "sin ficha"
              // era pedirle algo que desde el corte ya no le corresponde tener.
              const noRecipe = p.tipo === 'ELABORADO' && !p.insumo_reventa_id && (esCentro
                ? (recetaDelCentro.get(p.id)?.length ?? 0) === 0
                : p.recetaProducto_id.length === 0);
              // Ni reventa ni terciado tienen receta local: su rinde no se
              // calcula desde insumos, es el stock del insumo vinculado.
              // Con espejo, lo que la sucursal puede vender son las unidades que
              // tiene de ese insumo: le llegaron hechas del Centro. Sin espejo
              // —producto viejo con receta local— se calcula desde sus insumos.
              // El rinde es siempre el del local seleccionado.
              const rinde = p.insumo_reventa_id
                ? Math.floor(p.insumo_reventa?.stocks?.[0]?.stock_actual ?? 0)
                : buildablePortions(p.recetaProducto_id.map(r => ({ stock: r.insumo?.stocks?.[0]?.stock_actual ?? 0, cantidad: r.cantidad_utilizada })));
              const pub = p.estado_publicacion;
              return (
                <tr key={p.id}>
                  <td>
                    <div className="product-cell">
                      <span className="product-cell-name">
                        {p.nombre}
                        {noRecipe && <span className="pub-badge borrador" style={{ marginLeft: 6 }}>sin ficha</span>}
                      </span>
                      <span className="product-cell-desc">{(p.descripcion ?? '').slice(0, 50)}{(p.descripcion ?? '').length > 50 ? '…' : ''}</span>
                    </div>
                  </td>
                  <td><span className="cat-badge">{etiquetaTipo(p.tipo, ambito)}</span></td>
                  {!esCentro && (
                    <>
                      <td className="num">Bs {p.precio}</td>
                      <td className="num dim">Bs {costo.toFixed(1)}</td>
                      <td className="num"><span className="margin-badge" style={{ color: foodCostColor(fc), background: 'var(--canvas)' }}>{p.precio > 0 ? Math.round(fc) : '—'}%</span></td>
                    </>
                  )}
                  {!esCentro && <td><span className="menu-class-badge">{menuClassMeta[clazz].icon} {clazz}</span></td>}
                  {esCentro && (
                    <>
                      {/* El costo REAL del Centro: lo que le cuesta producirlo o
                          comprarlo, no lo que le cuesta a un local. */}
                      <td className="num dim">
                        {enCentro(p.insumo_reventa_id) ? `Bs ${enCentro(p.insumo_reventa_id)!.costo.toFixed(2)}` : '—'}
                      </td>
                      <td className="num">
                        <span className="stock-val">{enCentro(p.insumo_reventa_id)?.stock ?? 0}</span>
                      </td>
                    </>
                  )}
                  {/* El rinde del Centro —cuántas puede fabricar con su bruto—
                      se calcula distinto y vive en la pestaña Producción. */}
                  {!esCentro && <td className="num"><span className={`stock-val ${rinde === 0 ? 'low' : ''}`}>{rinde}</span></td>}
                  <td><span className={`pub-badge ${pubBadgeClass[pub]}`}>{pub.toLowerCase()}</span></td>
                  <td>
                    <div className="action-btns">
                      <button className="action-btn edit" onClick={() => openEdit(p)} title="Editar">{EditIcon}</button>
                      <button
                        className="action-btn"
                        onClick={() => setSucursalesDe({ id: p.id, nombre: p.nombre, precio: Number(p.precio) })}
                        title="Sucursales: dónde se vende, a qué precio"
                      >
                        🏬
                      </button>
                      {pub === 'PUBLICADO'
                        ? <button className="action-btn" onClick={() => setEstado(p.id, 'ARCHIVADO')} title="Archivar (pausar venta — vuelve al menú cuando quieras)">⏸</button>
                        : <button className="action-btn" onClick={() => setEstado(p.id, 'PUBLICADO')} title="Publicar al menú">▶</button>}
                      {bajaConfirm === p.id ? (
                        <div className="delete-confirm" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Motivo de la baja"
                            value={bajaMotivo}
                            onChange={e => setBajaMotivo(e.target.value)}
                            style={{ width: 120, fontSize: 12 }}
                            autoFocus
                          />
                          <button className="action-btn confirm-yes" onClick={() => darDeBaja(p.id)} disabled={!bajaMotivo.trim()}>Sí</button>
                          <button className="action-btn confirm-no" onClick={() => { setBajaConfirm(null); setBajaMotivo(''); }}>No</button>
                        </div>
                      ) : (
                        <button
                          className="action-btn delete"
                          onClick={() => { setBajaConfirm(p.id); setBajaMotivo(''); }}
                          title={sucursal
                            ? `Dar de baja en ${nombreSucursal ?? 'esta sucursal'} (las demás no se tocan)`
                            : 'Dar de baja en todo el catálogo'}
                        >
                          {BajaIcon}
                        </button>
                      )}
                      {/* La papelera saca el producto del menú de ESTA sucursal y
                          nada más. No se ofrece borrarlo del catálogo completo:
                          cada local administra lo suyo y no puede hacerlo
                          desaparecer de los demás. */}
                      {sucursal && (
                        quitarConfirm === p.id ? (
                          <div className="delete-confirm">
                            <button className="action-btn confirm-yes" onClick={() => quitarDeSucursal(p.id)}>Sí</button>
                            <button className="action-btn confirm-no" onClick={() => setQuitarConfirm(null)}>No</button>
                          </div>
                        ) : (
                          <button
                            className="action-btn delete"
                            onClick={() => setQuitarConfirm(p.id)}
                            title={`Quitar del menú de ${nombreSucursal ?? 'esta sucursal'} (las demás no se tocan)`}
                          >
                            {TrashIcon}
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <h4>Sin productos</h4>
          <p>
            {activos.length > 0
              ? 'Ajusta los filtros o crea un nuevo producto.'
              : nombreSucursal
                ? `${nombreSucursal} todavía no vende ningún producto. Traelos de otra sucursal o creá el primero.`
                : 'Aún no hay productos. Crea el primero.'}
          </p>
        </div>
      )}
      </>
      )}

      {copiarAbierto && sucursal && (
        <CopiarProductosModal
          destino={Number(sucursal)}
          destinoNombre={nombreSucursal ?? 'esta sucursal'}
          onClose={() => setCopiarAbierto(false)}
          onCopiado={(cantidad) => {
            setCopiarAbierto(false);
            setActionError('');
            load();
            if (cantidad === 0) setActionError('No se copió ningún producto.');
          }}
        />
      )}

      {sucursalesDe && (
        <ProductoSucursalesModal
          producto={sucursalesDe}
          onClose={() => { setSucursalesDe(null); load(); }}
        />
      )}

      {/* Desde el Centro se edita el CATÁLOGO, no la ficha de un local: mandar la
          sucursal hacía que editar un producto en el Centro escribiera los
          overrides de Fitbull, y el encabezado lo anunciaba. */}
      {wizard && (
        <AdminProductWizard
          initial={wizard}
          avgSales={avgSales}
          avgMargin={avgMargin}
          sucursalId={esCentro || !sucursal ? undefined : Number(sucursal)}
          sucursalNombre={esCentro || !sucursal ? undefined : nombreSucursal ?? undefined}
          centroId={esCentro ? centroId : undefined}
          onClose={() => setWizard(null)}
          onSaved={() => { setWizard(null); load(); refrescarCentro(); }}
        />
      )}
    </div>
  );
}
