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
}

export default function DataTable<T>({ columns, data, emptyTitle = 'Sin datos', rowKey }: DataTableProps<T>) {
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
          {data.map(row => (
            <tr key={rowKey(row)}>
              {columns.map(column => <td key={column.key} className={column.className}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
