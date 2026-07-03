'use client';

import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  isLoading?: boolean;
  loadingLabel?: string;
  variant?: 'danger' | 'confirm';
}

const TrashIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const CheckIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const WarningIcon = () => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
  </svg>
);

/**
 * Confirmation dialog for destructive actions (delete, etc.)
 *
 * Usage:
 * ```tsx
 * <ConfirmDialog
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onConfirm={handleDelete}
 *   title="Eliminar Categoría"
 *   description="Esta acción no se puede deshacer. ¿Deseas continuar?"
 *   isLoading={isDeleting}
 * />
 * ```
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description = 'Esta acción no se puede deshacer. ¿Estás seguro de que deseas continuar?',
  confirmLabel = 'Eliminar',
  isLoading = false,
  loadingLabel,
  variant = 'danger',
}: ConfirmDialogProps) {
  const isDanger = variant === 'danger';
  const accentColor = isDanger ? '#f87171' : '#fb923c';
  const buttonGradient = isDanger
    ? 'linear-gradient(135deg, #ef4444, #dc2626)'
    : 'linear-gradient(135deg, #fb923c, #ea580c)';
  const buttonShadow = isDanger ? '0 0 20px rgba(239,68,68,0.3)' : '0 0 20px rgba(251,146,60,0.3)';
  const defaultLoadingLabel = isDanger ? 'Eliminando...' : 'Procesando...';
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="confirm-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={!isLoading ? onClose : undefined}
            className={clsx('fixed!', 'inset-0!', 'bg-black/75!', 'backdrop-blur-sm!', 'z-[110]!')}
          />

          {/* Dialog */}
          <motion.div
            key="confirm-dialog"
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={clsx('fixed!', 'inset-0!', 'z-[111]!', 'flex!', 'items-center!', 'justify-center!', 'p-4!', 'pointer-events-none!')}
          >
            <div className={clsx('w-full!', 'max-w-sm!', 'pointer-events-auto!')}>
              <div
                className={clsx('relative!', 'rounded-2xl!', 'overflow-hidden!')}
                style={{
                  background: 'rgba(20,20,20,0.97)',
                  backdropFilter: 'blur(24px)',
                  border: `1px solid ${isDanger ? 'rgba(248,113,113,0.15)' : 'rgba(251,146,60,0.15)'}`,
                  boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)',
                }}
              >
                {/* Top accent line */}
                <div
                  className={clsx('absolute!', 'top-0!', 'left-0!', 'right-0!', 'h-px!')}
                  style={{ background: `linear-gradient(90deg, transparent, ${accentColor}80, transparent)` }}
                />

                <div className={clsx('p-6!')}>
                  {/* Icon */}
                  <div className={clsx('flex!', 'justify-center!', 'mb-5!')}>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1, type: 'spring', stiffness: 250 }}
                      className={clsx('w-14!', 'h-14!', 'rounded-2xl!', 'flex!', 'items-center!', 'justify-center!')}
                      style={{ background: isDanger ? 'rgba(248,113,113,0.12)' : 'rgba(251,146,60,0.12)', color: accentColor }}
                    >
                      {isDanger ? <TrashIcon /> : <CheckIcon />}
                    </motion.div>
                  </div>

                  {/* Text */}
                  <div className={clsx('text-center!', 'mb-6!')}>
                    <h3 className={clsx('text-white!', 'font-bold!', 'text-lg!', 'm-0!', 'mb-2!')}>{title}</h3>
                    <p className={clsx('text-sm!', 'm-0!', 'leading-relaxed!')} style={{ color: '#64748b' }}>
                      {description}
                    </p>
                  </div>

                  {/* Warning badge */}
                  <div
                    className={clsx('flex!', 'items-center!', 'gap-2!', 'rounded-xl!', 'px-3!', 'py-2.5!', 'mb-5!', 'text-xs!', 'font-medium!')}
                    style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)', color: '#fbbf24' }}
                  >
                    <WarningIcon />
                    <span>Esta acción es permanente y no puede revertirse.</span>
                  </div>

                  {/* Actions */}
                  <div className={clsx('flex!', 'gap-3!')}>
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isLoading}
                      className={clsx('flex-1!', 'py-2.5!', 'rounded-xl!', 'text-sm!', 'font-semibold!', 'transition-all!', 'duration-150!', 'cursor-pointer!', 'disabled:opacity-40!', 'active:scale-95!')}
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#94a3b8',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={onConfirm}
                      disabled={isLoading}
                      className={clsx('flex-1!', 'py-2.5!', 'rounded-xl!', 'text-sm!', 'font-bold!', 'text-white!', 'transition-all!', 'duration-150!', 'cursor-pointer!', 'disabled:opacity-60!', 'flex!', 'items-center!', 'justify-center!', 'gap-2!', 'active:scale-95!')}
                      style={{
                        background: buttonGradient,
                        border: 'none',
                        boxShadow: buttonShadow,
                      }}
                    >
                      {isLoading ? (
                        <>
                          <div className={clsx('w-4!', 'h-4!', 'rounded-full!', 'border-2!', 'border-white/30!', 'border-t-white!', 'animate-spin!')} />
                          {loadingLabel ?? defaultLoadingLabel}
                        </>
                      ) : (
                        <>
                          {isDanger ? <TrashIcon /> : <CheckIcon />}
                          {confirmLabel}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
