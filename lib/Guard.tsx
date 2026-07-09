'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth, homeForRole } from '@/hooks/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
  /** Roles permitidos. Si se omite, basta con estar autenticado. */
  roles?: string[];
}

export function ProtectedRoute({ children, redirectTo = '/login', roles }: ProtectedRouteProps) {
  const [status, setStatus] = useState<'loading' | 'allowed' | 'denied' | 'wrong-role'>('loading');
  const [target, setTarget] = useState(redirectTo);
  const router = useRouter();

  useEffect(() => {
    // La sesión vive en una cookie httpOnly: no es visible desde JS,
    // así que la única forma de verificarla es preguntarle al servidor.
    useAuth.me()
      .then((data) => {
        if (!data?.rol) { setStatus('denied'); setTarget(redirectTo); return; }
        if (roles && !roles.includes(data.rol)) {
          setStatus('wrong-role'); setTarget(homeForRole(data.rol)); return;
        }
        setStatus('allowed');
      })
      .catch(() => { setStatus('denied'); setTarget(redirectTo); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectTo]);

  useEffect(() => {
    if (status === 'denied' || status === 'wrong-role') router.replace(target);
  }, [status, target, router]);

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a' }}>
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(255,92,25,0.2)', borderTopColor: '#ff5c19', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ margin: 0, fontSize: 14 }}>Verificando sesión...</p>
        </div>
      </div>
    );
  }

  if (status === 'denied' || status === 'wrong-role') return null;
  return <>{children}</>;
}
