'use client';

import { type ReactElement } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type AlertType = 'error' | 'warning' | 'success' | 'info';

interface AlertPopupProps {
  title: string;
  description: string;
  type?: AlertType;
  visible: boolean;
  onClose?: () => void;
}

const icons: Record<AlertType, ReactElement> = {
  error: (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  warning: (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  success: (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  ),
  info: (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const palette: Record<AlertType, { accent: string; bg: string; border: string; iconBg: string }> = {
  error: { accent: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', iconBg: 'rgba(239,68,68,0.15)' },
  warning: { accent: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', iconBg: 'rgba(245,158,11,0.15)' },
  success: { accent: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)', iconBg: 'rgba(34,197,94,0.15)' },
  info: { accent: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', iconBg: 'rgba(59,130,246,0.15)' },
};

export default function AlertPopup({ title, description, type = 'error', visible, onClose }: AlertPopupProps) {
  const colors = palette[type];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="alert-popup"
          initial={{ opacity: 0, y: -16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.95 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'fixed',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            width: '100%',
            maxWidth: 440,
            padding: '0 16px',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: `linear-gradient(135deg, rgba(22,22,22,0.95), rgba(15,15,15,0.95))`,
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: `1px solid ${colors.border}`,
              borderRadius: 18,
              padding: '18px 20px',
              boxShadow: `0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)`,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              pointerEvents: 'all',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Accent left bar */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: colors.accent, borderRadius: '18px 0 0 18px' }} />

            {/* Icon */}
            <div style={{
              width: 42, height: 42, borderRadius: 12, flexShrink: 0,
              background: colors.iconBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: colors.accent,
            }}>
              {icons[type]}
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
              <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
                {title}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                {description}
              </p>
            </div>

            {/* Close button */}
            {onClose && (
              <button
                onClick={onClose}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: 'none', flexShrink: 0,
                  background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s, color 0.2s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)';
                }}
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
