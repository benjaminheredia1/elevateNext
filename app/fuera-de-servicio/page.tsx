import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fuera de servicio — Elevate',
  robots: { index: false, follow: false },
};

// Sin datos ni llamadas a la API: el proxy bloquea todo lo demás.
export default function FueraDeServicioPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
        background: '#111',
        color: '#f5f5f5',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 32, margin: 0, color: '#ff7a42' }}>Fuera de servicio</h1>
      <p style={{ fontSize: 16, margin: 0, opacity: 0.8 }}>
        Este sistema ya no está disponible.
      </p>
    </main>
  );
}
