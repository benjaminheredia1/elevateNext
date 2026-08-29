'use client';

import { useState } from 'react';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import StatusBadge from '@/components/ui/StatusBadge';
import { RecibirModal } from '@/components/admin/EnviosCentro';
import { useTraslados, type Traslado } from '@/hooks/traslados';

/**
 * Recepción de mercadería en el local.
 *
 * El listado ya viene acotado por el servidor a la sucursal del cajero: un
 * envío que va a otro local no es asunto suyo. Hasta que alguien confirme acá,
 * la mercadería no existe en el inventario de la sucursal, así que esta
 * pantalla es la que hace que el stock del local cuadre con lo que hay en el
 * mostrador.
 */
export default function RecepcionesPage() {
  const { data, isLoading, isError } = useTraslados();
  const [recibiendo, setRecibiendo] = useState<Traslado | null>(null);

  const traslados = data?.items ?? [];
  const pendientes = traslados.filter(t => t.estado === 'EN_TRANSITO');

  const valorDe = (t: Traslado) =>
    t.detalles.reduce((acc, d) => acc + (d.cantidad_recibida ?? d.cantidad_enviada) * d.costo_unitario, 0);

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1>Recepciones</h1>
          <p>Mercadería que el Centro de Producción despachó a esta sucursal.</p>
        </div>
      </div>

      {recibiendo && <RecibirModal traslado={recibiendo} onClose={() => setRecibiendo(null)} />}

      <div className="kpi-grid">
        <KpiCard label="Envíos por recibir" value={String(pendientes.length)} highlight />
        <KpiCard label="Valor en camino" value={<MoneyText value={data?.valor_en_transito ?? 0} />} />
      </div>

      {isLoading ? (
        <EmptyState title="Cargando envíos…" />
      ) : isError ? (
        <EmptyState title="No se pudieron cargar los envíos" />
      ) : traslados.length === 0 ? (
        <EmptyState
          title="No hay envíos para esta sucursal"
          hint="Cuando el Centro despache mercadería para acá, va a aparecer en esta lista."
        />
      ) : (
        <DataTable
          data={traslados}
          rowKey={(row: Traslado) => row.id}
          columns={[
            { key: 'numero', header: 'Envío', render: (row: Traslado) => (
              <div>
                <div className="admin-cell-title">#{row.numero} — {row.centro.nombre}</div>
                <div className="admin-cell-sub">
                  {row.detalles.map(d => `${d.insumo.nombre} ×${d.cantidad_enviada}`).join(' · ')}
                </div>
                {/* Se avisa desde el listado y no solo dentro del modal: quien
                    recibe decide si abre el envío mirando esta fila. */}
                {row.estado === 'EN_TRANSITO' && row.detalles.some(d => d.nuevo_en_sucursal) && (
                  <span className="cat-badge" style={{ marginTop: 4, background: 'var(--amber)', color: 'white' }}>
                    Trae productos nuevos para este local
                  </span>
                )}
              </div>
            )},
            { key: 'estado', header: 'Estado', render: (row: Traslado) => (
              row.estado === 'EN_TRANSITO'
                ? <StatusBadge status="sobrante" label="Por recibir" />
                : row.estado === 'RECIBIDO'
                  ? <StatusBadge status="abierto" label="Recibido" />
                  : <StatusBadge status="cerrado" label="Anulado" />
            )},
            { key: 'fecha', header: 'Despachado', render: (row: Traslado) =>
              new Date(row.fecha_envio).toLocaleDateString('es-BO') },
            { key: 'valor', header: 'Valor', className: 'num',
              render: (row: Traslado) => <MoneyText value={valorDe(row)} /> },
            { key: 'acciones', header: '', render: (row: Traslado) => (
              row.estado === 'EN_TRANSITO' ? (
                <button className="admin-btn primary sm" onClick={() => setRecibiendo(row)}>
                  Recibir
                </button>
              ) : null
            )},
          ]}
        />
      )}
    </div>
  );
}
