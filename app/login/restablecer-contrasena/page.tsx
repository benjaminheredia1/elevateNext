'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/auth';
import AlertPopup from '@/components/AlertPopup';

function RestablecerContrasenaForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [popupType, setPopupType] = useState<'error' | 'success'>('error');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setErrorMessage('El enlace no es válido. Solicita uno nuevo.');
      setPopupType('error');
      setIsOpen(true);
      return;
    }
    if (password.length < 6) {
      setErrorMessage('La contraseña debe tener al menos 6 caracteres');
      setPopupType('error');
      setIsOpen(true);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden');
      setPopupType('error');
      setIsOpen(true);
      return;
    }

    setLoading(true);
    try {
      const data = await useAuth.resetPassword(token, password);
      setSuccessMessage(data.message);
      setPopupType('success');
      setIsOpen(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setErrorMessage(err?.response?.data?.message ?? 'No se pudo restablecer la contraseña');
      setPopupType('error');
      setIsOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', width: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#0a0a0a', fontFamily: 'Inter, sans-serif' }}>
      <AlertPopup
        description={popupType === 'success' ? successMessage : errorMessage}
        title={popupType === 'success' ? 'Listo' : 'Error'}
        type={popupType}
        visible={isOpen}
        onClose={() => setIsOpen(false)}
      />
      <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: '50vw', height: '50vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,92,25,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <motion.div initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 440, padding: '0 24px' }}>
        <div style={{ background: 'rgba(22,22,22,0.7)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 28, padding: '48px 40px 40px', boxShadow: '0 25px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800, margin: '0 0 8px' }}>Nueva contraseña</h1>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, margin: 0 }}>Elige una contraseña segura para tu cuenta</p>
          </div>

          {!token ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6 }}>
              Este enlace no es válido o expiró.
              <p style={{ marginTop: 20 }}>
                <Link href="/login/olvide-contrasena" style={{ color: '#ff7a42', textDecoration: 'none', fontWeight: 600 }}>
                  Solicitar un nuevo enlace
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label htmlFor="password" style={{ display: 'block', color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Nueva contraseña</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  style={{ width: '100%', padding: '13px 16px', borderRadius: 12, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" style={{ display: 'block', color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Confirmar contraseña</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite tu contraseña"
                  required
                  minLength={6}
                  style={{ width: '100%', padding: '13px 16px', borderRadius: 12, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.02 }}
                whileTap={{ scale: loading ? 1 : 0.97 }}
                style={{ marginTop: 8, width: '100%', padding: '15px 24px', background: 'linear-gradient(135deg, #ff5c19, #e04d10)', color: '#fff', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Guardando...' : 'Restablecer contraseña'}
              </motion.button>
            </form>
          )}

          <p style={{ marginTop: 28, textAlign: 'center', fontSize: 14 }}>
            <Link href="/login" style={{ color: '#ff7a42', textDecoration: 'none', fontWeight: 600 }}>
              ← Volver al inicio de sesión
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default function RestablecerContrasenaPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0a' }} />}>
      <RestablecerContrasenaForm />
    </Suspense>
  );
}
