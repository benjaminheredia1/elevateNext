import type { ReactNode } from 'react';
import EmptyState from '@/components/ui/EmptyState';

interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyTitle?: string;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  /**
   * Qué filas son realmente clickeables. Sin esto, una tabla donde solo algunas
   * filas abren detalle mostraría el cursor de mano en todas y el click no haría
   * nada. Por defecto, si hay onRowClick, lo son todas.
   */
  isRowClickable?: (row: T) => boolean;
}

export default function DataTable<T>({
  columns, data, emptyTitle = 'Sin datos', rowKey, onRowClick, isRowClickable,
}: DataTableProps<T>) {
  if (data.length === 0) return <EmptyState title={emptyTitle} />;

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map(column => <th key={column.key} className={column.className}>{column.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map(row => {
            const clickable = !!onRowClick && (isRowClickable ? isRowClickable(row) : true);
            return (
              <tr
                key={rowKey(row)}
                className={clickable ? 'admin-table-row-clickable' : undefined}
                onClick={clickable ? () => onRowClick!(row) : undefined}
              >
                {columns.map(column => <td key={column.key} className={column.className}>{column.render(row)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
