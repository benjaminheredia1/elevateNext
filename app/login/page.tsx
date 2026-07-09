'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth, homeForRole } from '@/hooks/auth';
import { useRouter } from 'next/navigation';
import AlertPopup from '@/components/AlertPopup';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [btnHovered, setBtnHovered] = useState(false);
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState('');
  const [titlePop, setTitlePop] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Si ya hay sesión (cookie httpOnly válida), redirigir a su área.
    useAuth.me()
      .then((data) => { if (data?.rol) router.replace(homeForRole(data.rol)); })
      .catch(() => { /* sin sesión: quedarse en el login */ });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await useAuth.login(identifier, password);
      router.push(homeForRole(data?.user?.rol));
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string; title?: string } } };
      setErrorMessage(err?.response?.data?.message ?? 'Error al iniciar sesión');
      setTitlePop(err?.response?.data?.title ?? 'Error');
      setIsOpen(true);
    }
  };

  return (
    <div style={{ minHeight: '100vh', width: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#0a0a0a', fontFamily: 'Inter, sans-serif' }}>
      <AlertPopup description={errorMessage} title={titlePop} type="error" visible={isOpen} onClose={() => setIsOpen(false)} />
      {/* Background glow orbs */}
      <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: '50vw', height: '50vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,92,25,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-15%', right: '-10%', width: '45vw', height: '45vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(224,77,16,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '70vw', height: '70vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,122,66,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />

      <motion.div initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 440, padding: '0 24px' }}>
        <div style={{ background: 'rgba(22,22,22,0.7)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 28, padding: '48px 40px 40px', boxShadow: '0 25px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)' }} />

          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.2, type: 'spring', stiffness: 220, damping: 15 }} style={{ width: 64, height: 64, margin: '0 auto 20px', background: 'linear-gradient(135deg, #ff5c19, #e04d10)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(255,92,25,0.5), 0 8px 20px rgba(0,0,0,0.3)' }}>
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </motion.div>
            <h1 style={{ color: '#fff', fontSize: 30, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.03em' }}>Elevate</h1>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, margin: 0 }}>Beyond Performance</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label htmlFor="email" style={{ display: 'block', color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 600, marginBottom: 8, letterSpacing: '0.01em' }}>Correo o usuario</label>
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.45, flexShrink: 0 }} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <input id="email" type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="tu@correo.com o usuario" required style={{ width: '100%', padding: '13px 16px 13px 42px', borderRadius: 12, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.25s' }} onFocus={(e) => (e.target.style.borderColor = 'rgba(255,92,25,0.7)')} onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
              </div>
            </div>

            <div>
              <div style={{ marginBottom: 8 }}>
                <label htmlFor="password" style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 600, letterSpacing: '0.01em' }}>Contraseña</label>
              </div>
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.45 }} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required style={{ width: '100%', padding: '13px 16px 13px 42px', borderRadius: 12, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.25s' }} onFocus={(e) => (e.target.style.borderColor = 'rgba(255,92,25,0.7)')} onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
              </div>
            </div>

            <motion.button type="submit" onHoverStart={() => setBtnHovered(true)} onHoverEnd={() => setBtnHovered(false)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} style={{ marginTop: 8, width: '100%', padding: '15px 24px', background: 'linear-gradient(135deg, #ff5c19, #e04d10)', color: '#fff', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 0 30px rgba(255,92,25,0.4), 0 4px 16px rgba(0,0,0,0.3)', letterSpacing: '-0.01em' }}>
              Ingresar
              <motion.svg animate={{ x: btnHovered ? 5 : 0 }} transition={{ type: 'spring', stiffness: 300 }} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </motion.svg>
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
