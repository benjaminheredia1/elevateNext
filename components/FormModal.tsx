'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { type FormEvent } from 'react';
import { clsx } from 'clsx';

// Definición de un campo del formulario
export interface FieldConfig {
  label: string;                          // Texto del label
  value: string | number;                 // Valor actual
  onChange: (val: string) => void;        // setState para actualizar el valor
  type?: 'text' | 'number' | 'email' | 'password' | 'textarea' | 'select';
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[]; // Solo para type='select'
}

interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  title: string;
  subtitle?: string;
  mode?: 'create' | 'edit';
  isLoading?: boolean;
  fields: FieldConfig[];                  // ← Arreglo de campos
}

// Estilos base reutilizables para los inputs
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#e2e8f0',
  fontSize: '0.875rem',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
  fontFamily: 'Inter, sans-serif',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#64748b',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const PlusIcon = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

const EditIcon = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const XIcon = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

function Field({ field }: { field: FieldConfig }) {
  const sharedProps = {
    id: field.label,
    value: field.value,
    placeholder: field.placeholder ?? '',
    required: field.required ?? false,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      field.onChange(e.target.value),
    style: inputStyle,
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      e.target.style.borderColor = 'rgba(255,92,25,0.6)';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      e.target.style.borderColor = 'rgba(255,255,255,0.08)';
    },
  };

  return (
    <div>
      <label htmlFor={field.label} style={labelStyle}>
        {field.label}
        {field.required && <span style={{ color: '#ff5c19', marginLeft: 3 }}>*</span>}
      </label>

      {field.type === 'textarea' ? (
        <textarea
          {...sharedProps}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
        />
      ) : field.type === 'select' ? (
        <select
          {...sharedProps}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="" disabled style={{ background: '#1a1a1a' }}>
            {field.placeholder ?? 'Selecciona una opción'}
          </option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ background: '#1a1a1a' }}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...sharedProps}
          type={field.type ?? 'text'}
        />
      )}
    </div>
  );
}

/**
 * Modal genérico de formulario auto-generado a partir de un arreglo de campos.
 *
 * @example
 * ```tsx
 * const [nombre, setNombre] = useState('');
 * const [detalle, setDetalle] = useState('');
 *
 * <FormModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onSubmit={handleSubmit}
 *   title="Crear Categoría"
 *   mode="create"
 *   isLoading={isSaving}
 *   fields={[
 *     { label: 'Nombre', value: nombre, onChange: setNombre, required: true },
 *     { label: 'Descripción', value: detalle, onChange: setDetalle, type: 'textarea' },
 *   ]}
 * />
 * ```
 */
export default function FormModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  subtitle,
  mode = 'create',
  isLoading = false,
  fields,
}: FormModalProps) {
  const isCreate = mode === 'create';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="form-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className={clsx('fixed!', 'inset-0!', 'bg-black/70!', 'backdrop-blur-sm!', 'z-[100]!')}
          />

          {/* Modal */}
          <motion.div
            key="form-modal"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={clsx('fixed!', 'inset-0!', 'z-[101]!', 'flex!', 'items-center!', 'justify-center!', 'p-4!', 'pointer-events-none!')}
          >
            <div className={clsx('w-full!', 'max-w-lg!', 'pointer-events-auto!')}>
              <div
                className={clsx('relative!', 'rounded-2xl!', 'overflow-hidden!')}
                style={{
                  background: 'rgba(22,22,22,0.97)',
                  backdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: '0 24px 60px rgba(0,0,0,0.65)',
                }}
              >
                {/* Top accent line */}
                <div
                  className={clsx('absolute!', 'top-0!', 'left-0!', 'right-0!', 'h-px!')}
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(255,92,25,0.6), transparent)' }}
                />

                {/* Header */}
                <div className={clsx('flex!', 'items-start!', 'justify-between!', 'p-6!', 'pb-4!')}>
                  <div className={clsx('flex !', 'items-center!', 'gap-3!')}>
                    <div
                      className={clsx('w-9!', 'h-9!', 'rounded-xl!', 'flex!', 'items-center!', 'justify-center!', 'flex-shrink-0!')}
                      style={{ background: 'rgba(255,92,25,0.15)', color: '#ff5c19' }}
                    >
                      {isCreate ? <PlusIcon /> : <EditIcon />}
                    </div>
                    <div>
                      <h2 className={clsx('text-white!', 'font-bold!', 'text-lg!', 'm-0!', 'leading-tight!')}>{title}</h2>
                      {subtitle && (
                        <p className={clsx('text-xs!', 'm-0!', 'mt-0.5!')} style={{ color: '#475569' }}>{subtitle}</p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className={clsx('w-8!', 'h-8!', 'rounded-lg!', 'flex!', 'items-center!', 'justify-center!', 'cursor-pointer!', 'transition-colors!', 'duration-150!')}
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b', border: 'none' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                      e.currentTarget.style.color = '#e2e8f0';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                      e.currentTarget.style.color = '#64748b';
                    }}
                  >
                    <XIcon />
                  </button>
                </div>

                {/* Divider */}
                <div className={clsx('mx-6! ', 'mb-5!', 'h-px!')} style={{ background: 'rgba(255,255,255,0.06)' }} />

                {/* Auto-generated fields */}
                <form onSubmit={onSubmit}>
                  <div className={clsx('px-6!', 'flex!', 'flex-col!', 'gap-4!')}>
                    {fields.map((field) => (
                      <Field key={field.label} field={field} />
                    ))}
                  </div>

                  {/* Footer */}
                  <div className={clsx('flex!', 'justify-end!', 'gap-3!', 'p-6!', 'pt-5!')}>
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isLoading}
                      className={clsx('px-4!', 'py-2.5!', 'rounded-xl!', 'text-sm!', 'font-semibold!', 'transition-all!', 'duration-150!', 'cursor-pointer!', 'disabled:opacity-40!', 'active:scale-95!')}
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
                      type="submit"
                      disabled={isLoading}
                      className={clsx('px-5!', 'py-2.5!', 'rounded-xl!', 'text-sm!', 'font-bold!', 'text-white!', 'transition-all!', 'duration-150!', 'cursor-pointer!', 'disabled:opacity-60!', 'flex!', 'items-center!', 'gap-2!', 'active:scale-95!')}
                      style={{
                        background: 'linear-gradient(135deg, #ff5c19, #e04d10)',
                        border: 'none',
                        boxShadow: '0 0 20px rgba(255,92,25,0.3)',
                      }}
                    >
                      {isLoading ? (
                        <>
                          <div className={clsx('w-4', 'h-4', 'rounded-full', 'border-2', 'border-white/30', 'border-t-white', 'animate-spin')} />
                          Guardando...
                        </>
                      ) : (
                        <>
                          {isCreate ? <PlusIcon /> : <EditIcon />}
                          {isCreate ? 'Crear' : 'Guardar cambios'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
