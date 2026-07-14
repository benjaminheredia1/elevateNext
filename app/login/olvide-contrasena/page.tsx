'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/auth';
import AlertPopup from '@/components/AlertPopup';

export default function OlvideContrasenaPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await useAuth.forgotPassword(email.trim());
      setSent(true);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; code?: string; message?: string };
      if (err?.code === 'ECONNABORTED') {
        setErrorMessage('La solicitud tardó demasiado. Intenta de nuevo.');
      } else {
        setErrorMessage(err?.response?.data?.message ?? err?.message ?? 'No se pudo enviar el correo');
      }
      setIsOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', width: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#0a0a0a', fontFamily: 'Inter, sans-serif' }}>
      <AlertPopup description={errorMessage} title="Error" type="error" visible={isOpen} onClose={() => setIsOpen(false)} />
      <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: '50vw', height: '50vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,92,25,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-15%', right: '-10%', width: '45vw', height: '45vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(224,77,16,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <motion.div initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 440, padding: '0 24px' }}>
        <div style={{ background: 'rgba(22,22,22,0.7)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 28, padding: '48px 40px 40px', boxShadow: '0 25px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800, margin: '0 0 8px' }}>¿Olvidaste tu contraseña?</h1>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, margin: 0, lineHeight: 1.5 }}>
              {sent
                ? 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.'
                : 'Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.'}
            </p>
          </div>

          {!sent ? (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label htmlFor="email" style={{ display: 'block', color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Correo electrónico</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  required
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
                {loading ? 'Enviando...' : 'Enviar enlace'}
              </motion.button>
            </form>
          ) : (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6 }}>
              Revisa tu bandeja de entrada y la carpeta de spam.
            </div>
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
