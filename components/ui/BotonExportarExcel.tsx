'use client';

import { useState } from 'react';
import apiClient from '@/hooks/api';

/**
 * Botón de descarga de un reporte en Excel.
 *
 * El archivo lo arma el servidor: así respeta el alcance por sucursal y el
 * navegador no tiene que bajarse todos los datos para construirlo. Acá solo se
 * pide, se convierte en blob y se dispara la descarga.
 */
export default function BotonExportarExcel({ url, etiqueta = 'Descargar Excel', className = 'admin-btn secondary' }: {
  /** Ruta del endpoint de export, con los filtros ya puestos en el query string. */
  url: string;
  etiqueta?: string;
  className?: string;
}) {
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descargar = async () => {
    setBajando(true);
    setError(null);
    try {
      const res = await apiClient.get(url, { responseType: 'blob' });

      // El nombre lo decide el servidor (Content-Disposition); si no viene, se
      // arma uno para que el archivo no quede como "download" sin extensión.
      const disposicion = String(res.headers['content-disposition'] ?? '');
      const nombre = /filename="?([^"]+)"?/.exec(disposicion)?.[1]
        ?? `elevate-reporte-${new Date().toISOString().slice(0, 10)}.xlsx`;

      const enlace = document.createElement('a');
      const objectUrl = URL.createObjectURL(res.data as Blob);
      enlace.href = objectUrl;
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // El cuerpo del error llega como blob por `responseType`, así que no se
      // puede leer el mensaje del servidor sin parsearlo; con el genérico alcanza.
      setError('No se pudo generar el archivo.');
    } finally {
      setBajando(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={descargar} disabled={bajando}>
        {bajando ? 'Generando...' : etiqueta}
      </button>
      {error && <span className="form-hint" style={{ color: 'var(--danger)' }}>{error}</span>}
    </>
  );
}
