'use client';

/**
 * Par de fechas para rangos personalizados de reportes.
 * Garantiza que la fecha de fin nunca sea menor a la de inicio (igual sí se
 * permite): limita el calendario con min/max y, si alguien escribe la fecha a
 * mano, la ajusta al límite en lugar de aceptar un rango inválido.
 */

const TZ = 'America/La_Paz';

/** 'YYYY-MM-DD' de hoy en hora de Bolivia (el negocio opera ahí). */
export function hoyLocalISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

interface CustomDateRangeProps {
  desde?: string;
  hasta?: string;
  onChange: (rango: { desde: string; hasta: string }) => void;
}

export default function CustomDateRange({ desde, hasta, onChange }: CustomDateRangeProps) {
  const hoy = hoyLocalISO();
  const desdeValor = desde || hoy;
  const hastaValor = hasta || hoy;

  const cambiarDesde = (valor: string) => {
    if (!valor) return;
    // Si el nuevo inicio pasa al fin, se arrastra el fin para no invertir el rango.
    onChange({ desde: valor, hasta: hastaValor < valor ? valor : hastaValor });
  };

  const cambiarHasta = (valor: string) => {
    if (!valor) return;
    onChange({ desde: desdeValor, hasta: valor < desdeValor ? desdeValor : valor });
  };

  return (
    <div className="custom-date-range">
      <label>
        <span>Desde</span>
        <input type="date" value={desdeValor} max={hastaValor} onChange={e => cambiarDesde(e.target.value)} />
      </label>
      <label>
        <span>Hasta</span>
        <input type="date" value={hastaValor} min={desdeValor} max={hoy} onChange={e => cambiarHasta(e.target.value)} />
      </label>
    </div>
  );
}
