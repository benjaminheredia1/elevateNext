'use client';

import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/hooks/api';

type Tab = 'productos' | 'insumos';

interface ProductoBaja {
  id: number;
  nombre: string;
  motivo_baja: string | null;
  fecha_baja: string | null;
}

interface InsumoBaja {
  id: number;
  nombre: string;
  unidad_medida: string;
  motivo_baja: string | null;
  fecha_baja: string | null;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-BO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function errorMsg(err: unknown) {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error ?? 'Ocurrió un error inesperado.';
}

export default function AdminBajas() {
  const [tab, setTab] = useState<Tab>('productos');
  const [productos, setProductos] = useState<ProductoBaja[]>([]);
  const [insumos, setInsumos] = useState<InsumoBaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageMsg, setPageMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/admin/bajas');
      setProductos(res.data?.data?.productos ?? []);
      setInsumos(res.data?.data?.insumos ?? []);
    } catch (err) {
      console.error(err);
      setProductos([]);
      setInsumos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reactivarProducto = async (id: number) => {
    setPageMsg(null);
    try {
      await apiClient.patch(`/api/admin/productos/${id}`, { estado_publicacion: 'BORRADOR' });
      setPageMsg({ type: 'ok', text: 'Producto reactivado.' });
      await load();
    } catch (err) {
      setPageMsg({ type: 'error', text: errorMsg(err) });
    }
  };

  const reactivarInsumo = async (id: number) => {
    setPageMsg(null);
    try {
      await apiClient.post('/api/admin/insumos/reactivar', { insumo_id: id });
      setPageMsg({ type: 'ok', text: 'Insumo reactivado.' });
      await load();
    } catch (err) {
      setPageMsg({ type: 'error', text: errorMsg(err) });
    }
  };

  return (
    <div className="admin-bajas">
      <div className="admin-page-header">
        <div>
          <h1>Bajas</h1>
          <p>Productos e insumos retirados del catálogo e inventario</p>
        </div>
        <button className="admin-btn secondary" onClick={load} type="button">Actualizar</button>
      </div>

      {pageMsg && (
        <div
          className="gate-warning"
          style={pageMsg.type === 'ok'
            ? { background: 'rgba(31,169,113,.12)', borderColor: 'rgba(31,169,113,.35)', color: 'var(--fresh)', marginBottom: 14 }
            : { marginBottom: 14 }}
          onClick={() => setPageMsg(null)}
        >
          {pageMsg.text}
        </div>
      )}

      <div className="inv-tabs">
        {[
          ['productos', `Productos (${productos.length})`],
          ['insumos', `Insumos (${insumos.length})`],
        ].map(([key, label]) => (
          <button key={key} className={`inv-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key as Tab)} type="button">
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state"><h4>Cargando bajas</h4><p>Consultando registros.</p></div>
      ) : tab === 'productos' ? (
        productos.length === 0 ? (
          <div className="empty-state"><h4>Sin productos dados de baja</h4><p>Los productos que retires del catálogo aparecerán aquí.</p></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Producto</th><th>Motivo</th><th>Fecha de baja</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {productos.map(p => (
                  <tr key={p.id}>
                    <td>{p.nombre}</td>
                    <td>{p.motivo_baja || '—'}</td>
                    <td>{formatDate(p.fecha_baja)}</td>
                    <td>
                      <div className="action-btns">
                        <button className="admin-btn secondary" onClick={() => reactivarProducto(p.id)} type="button">Reactivar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        insumos.length === 0 ? (
          <div className="empty-state"><h4>Sin insumos dados de baja</h4><p>Los insumos que retires del inventario aparecerán aquí.</p></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Insumo</th><th>Motivo</th><th>Fecha de baja</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {insumos.map(i => (
                  <tr key={i.id}>
                    <td>{i.nombre}</td>
                    <td>{i.motivo_baja || '—'}</td>
                    <td>{formatDate(i.fecha_baja)}</td>
                    <td>
                      <div className="action-btns">
                        <button className="admin-btn secondary" onClick={() => reactivarInsumo(i.id)} type="button">Reactivar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
