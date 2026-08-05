'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import apiClient from '@/hooks/api';

/**
 * Menús (cartas) de la web. Un menú agrupa productos y se publica en
 * /menu/<slug>; la landing arma una sección por cada menú publicado.
 *
 * Regla del rubro que se respeta acá: una carta se ARCHIVA, no se borra. El
 * histórico de ventas cuelga de sus productos, así que borrar una carta con
 * productos adentro rompería la analítica. El servidor lo frena con un 409 y
 * esta pantalla ofrece archivar en su lugar.
 */

type Estado = 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO';

interface Menu {
  id: number;
  key: string;
  slug: string;
  nombre: string;
  estado: Estado;
  orden: number;
  color: string | null;
  eyebrow: string | null;
  kicker: string | null;
  titulo: string;
  tagline: string | null;
  descripcion: string | null;
  bullets: string[];
  cta_texto: string;
  icono: string | null;
  imagen_url: string | null;
  productos: number;
}

interface MenuForm {
  id?: number;
  nombre: string;
  slug: string;
  estado: Estado;
  color: string;
  icono: string;
  eyebrow: string;
  kicker: string;
  titulo: string;
  tagline: string;
  descripcion: string;
  bullets: string;
  cta_texto: string;
  imagen_url: string;
}

const EMPTY_FORM: MenuForm = {
  nombre: '', slug: '', estado: 'BORRADOR', color: '#22c55e', icono: 'bowl',
  eyebrow: '', kicker: '', titulo: '', tagline: '', descripcion: '',
  bullets: '', cta_texto: '', imagen_url: '',
};

/** Íconos disponibles en components/shop/icons que tienen sentido para una carta. */
const ICONOS = ['bowl', 'cup', 'wrap', 'salad', 'nut', 'berry', 'dumbbell', 'flame', 'egg', 'leaf', 'wheat', 'chefHat', 'heart', 'zap', 'target'];

const ESTADO_META: Record<Estado, { label: string; color: string; hint: string }> = {
  BORRADOR:  { label: 'Borrador',  color: 'var(--slate)',  hint: 'No se ve en la web. Armala y publicala cuando esté lista.' },
  PUBLICADO: { label: 'Publicado', color: 'var(--fresh)',  hint: 'Visible en la landing y en su URL pública.' },
  ARCHIVADO: { label: 'Archivado', color: 'var(--danger)', hint: 'Fuera de la web. El histórico de ventas queda intacto.' },
};

const EditIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const TrashIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;

/** Mensaje que mandó el servidor, que es el que explica por qué no se pudo. */
function mensajeDeError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  return data?.error ?? data?.message ?? fallback;
}

export default function AdminMenus() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<MenuForm>(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  /**
   * Sube la imagen al mismo endpoint que usa el wizard de productos: en
   * producción va a Vercel Blob y en local a public/uploads, y en los dos casos
   * devuelve la URL ya servible que se guarda en el menú.
   */
  const subirImagen = async (file: File) => {
    setUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await apiClient.post('/api/admin/upload', fd, { headers: { 'Content-Type': undefined } });
      setForm(p => ({ ...p, imagen_url: r.data.url as string }));
    } catch (err) {
      setUploadError(mensajeDeError(err, 'No se pudo subir la imagen.'));
    } finally {
      setUploading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/admin/marcas');
      setMenus(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar los menús.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const publicados = useMemo(() => menus.filter(m => m.estado === 'PUBLICADO').length, [menus]);

  const openCreate = () => {
    setError('');
    setUploadError('');
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (m: Menu) => {
    setError('');
    setUploadError('');
    setForm({
      id: m.id,
      nombre: m.nombre,
      slug: m.slug,
      estado: m.estado,
      color: m.color ?? '#22c55e',
      icono: m.icono ?? 'bowl',
      eyebrow: m.eyebrow ?? '',
      kicker: m.kicker ?? '',
      // `titulo` viene con el nombre como fallback; si son iguales el campo va
      // vacío para que se siga viendo como "sin definir" y no se congele.
      titulo: m.titulo === m.nombre ? '' : m.titulo,
      tagline: m.tagline ?? '',
      descripcion: m.descripcion ?? '',
      bullets: m.bullets.join('\n'),
      cta_texto: m.cta_texto === 'Ver menú' ? '' : m.cta_texto,
      imagen_url: m.imagen_url ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        nombre: form.nombre.trim(),
        estado: form.estado,
        color: form.color || null,
        icono: form.icono || null,
        eyebrow: form.eyebrow.trim() || null,
        kicker: form.kicker.trim() || null,
        titulo: form.titulo.trim() || null,
        tagline: form.tagline.trim() || null,
        descripcion: form.descripcion.trim() || null,
        bullets: form.bullets.split('\n').map(b => b.trim()).filter(Boolean),
        cta_texto: form.cta_texto.trim() || null,
        imagen_url: form.imagen_url.trim() || null,
        // Solo se manda si el usuario lo escribió: el servidor lo deriva del
        // nombre al crear, y al editar un slug vacío dejaría la URL sin nada.
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
      };
      if (form.id) await apiClient.put(`/api/admin/marcas/${form.id}`, payload);
      else await apiClient.post('/api/admin/marcas', payload);
      setModalOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el menú.'));
    } finally {
      setSaving(false);
    }
  };

  const cambiarEstado = async (m: Menu, estado: Estado) => {
    setError('');
    try {
      await apiClient.put(`/api/admin/marcas/${m.id}`, { estado });
      await load();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cambiar el estado.'));
    }
  };

  /** Intercambia el orden con el vecino: es lo que el visitante ve como orden de las cartas. */
  const mover = async (index: number, delta: -1 | 1) => {
    const actual = menus[index];
    const vecino = menus[index + delta];
    if (!actual || !vecino) return;
    setError('');
    try {
      // Si nunca se ordenaron, todos están en 0: se usan las posiciones de la
      // lista para que el intercambio dé un orden estable de una.
      const ordenActual = actual.orden === vecino.orden ? index + 1 : actual.orden;
      const ordenVecino = actual.orden === vecino.orden ? index + delta + 1 : vecino.orden;
      await Promise.all([
        apiClient.put(`/api/admin/marcas/${actual.id}`, { orden: ordenVecino }),
        apiClient.put(`/api/admin/marcas/${vecino.id}`, { orden: ordenActual }),
      ]);
      await load();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo reordenar.'));
    }
  };

  const remove = async (m: Menu) => {
    setError('');
    try {
      await apiClient.delete(`/api/admin/marcas/${m.id}`);
      setDeleteConfirm(null);
      await load();
    } catch (err) {
      setDeleteConfirm(null);
      setError(mensajeDeError(err, 'No se pudo eliminar el menú.'));
    }
  };

  return (
    <div className="admin-menus">
      <div className="admin-page-header">
        <div>
          <h1>Menús</h1>
          <p>{menus.length} {menus.length === 1 ? 'carta' : 'cartas'} · {publicados} en la web</p>
        </div>
        <button className="admin-btn primary" onClick={openCreate} type="button">+ Nuevo menú</button>
      </div>

      {error && <div className="gate-warning" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="empty-state">
          <h4>Cargando menús</h4>
          <p>Consultando las cartas publicadas.</p>
        </div>
      ) : menus.length === 0 ? (
        <div className="empty-state">
          <h4>Todavía no hay menús</h4>
          <p>Un menú es una carta de la web: agrupa productos y se publica en su propia dirección.</p>
          <button className="admin-btn primary" onClick={openCreate} type="button">+ Nuevo menú</button>
        </div>
      ) : (
        <div className="menus-grid">
          {menus.map((m, index) => (
            <article key={m.id} className={`menu-admin-card estado-${m.estado.toLowerCase()}`}>
              <div className="menu-admin-top">
                <span className="menu-admin-dot" style={{ background: m.color ?? 'var(--slate)' }} />
                <div className="menu-admin-title">
                  <h3>{m.titulo}</h3>
                  <span className="dim">/menu/{m.slug}</span>
                </div>
                <span className="menu-admin-estado" style={{ color: ESTADO_META[m.estado].color, borderColor: ESTADO_META[m.estado].color }}>
                  {ESTADO_META[m.estado].label}
                </span>
              </div>

              {m.tagline && <p className="menu-admin-tagline">{m.tagline}</p>}

              <div className="menu-admin-meta">
                <span>{m.productos} {m.productos === 1 ? 'producto' : 'productos'}</span>
                <span>·</span>
                <span>orden {index + 1}</span>
                {m.estado === 'PUBLICADO' && (
                  <>
                    <span>·</span>
                    <a href={`/menu/${m.slug}`} target="_blank" rel="noreferrer" className="linklike">ver carta</a>
                  </>
                )}
              </div>

              <div className="menu-admin-actions">
                <div className="menu-admin-orden">
                  <button className="action-btn" onClick={() => mover(index, -1)} disabled={index === 0} title="Subir" type="button">↑</button>
                  <button className="action-btn" onClick={() => mover(index, 1)} disabled={index === menus.length - 1} title="Bajar" type="button">↓</button>
                </div>

                {m.estado === 'PUBLICADO' ? (
                  <button className="admin-btn ghost" onClick={() => cambiarEstado(m, 'ARCHIVADO')} type="button" title="Sacar de la web sin perder el histórico">
                    Archivar
                  </button>
                ) : (
                  <button className="admin-btn secondary" onClick={() => cambiarEstado(m, 'PUBLICADO')} type="button" title="Mostrar en la landing y en su URL">
                    Publicar
                  </button>
                )}

                <button className="action-btn edit" onClick={() => openEdit(m)} title="Editar" type="button">{EditIcon}</button>

                {deleteConfirm === m.id ? (
                  <div className="delete-confirm">
                    <button className="action-btn confirm-yes" onClick={() => remove(m)} type="button">Sí</button>
                    <button className="action-btn confirm-no" onClick={() => setDeleteConfirm(null)} type="button">No</button>
                  </div>
                ) : (
                  <button
                    className="action-btn delete"
                    onClick={() => setDeleteConfirm(m.id)}
                    title={m.productos > 0 ? 'Tiene productos: habrá que archivarlo' : 'Eliminar'}
                    type="button"
                  >
                    {TrashIcon}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="admin-modal-overlay" onMouseDown={() => setModalOpen(false)}>
          <form className="admin-modal" onSubmit={handleSubmit} onMouseDown={event => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>{form.id ? 'Editar menú' : 'Nuevo menú'}</h2>
              <button className="admin-modal-close" onClick={() => setModalOpen(false)} type="button">×</button>
            </div>
            <div className="admin-modal-body">
              {error && <div className="gate-warning" style={{ marginBottom: 16 }}>{error}</div>}

              <div className="form-grid">
                <label className="form-group">
                  <span>Nombre</span>
                  <input
                    value={form.nombre}
                    onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                    placeholder="Fitbull"
                    required
                    autoFocus
                  />
                  <span className="form-hint">Nombre corto, para el admin y la caja.</span>
                </label>

                <label className="form-group">
                  <span>Estado</span>
                  <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value as Estado }))}>
                    <option value="BORRADOR">Borrador</option>
                    <option value="PUBLICADO">Publicado</option>
                    <option value="ARCHIVADO">Archivado</option>
                  </select>
                  <span className="form-hint">{ESTADO_META[form.estado].hint}</span>
                </label>

                <label className="form-group">
                  <span>Dirección web</span>
                  <input
                    value={form.slug}
                    onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
                    placeholder={form.id ? '' : 'se genera del nombre'}
                  />
                  <span className="form-hint">/menu/{form.slug.trim() || '…'}</span>
                </label>

                <label className="form-group">
                  <span>Color</span>
                  <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} />
                  <span className="form-hint">Tiñe el hero de la carta y su tarjeta en la landing.</span>
                </label>

                <label className="form-group">
                  <span>Ícono</span>
                  <select value={form.icono} onChange={e => setForm(p => ({ ...p, icono: e.target.value }))}>
                    {ICONOS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </label>

                <div className="form-group">
                  <span>Imagen de la carta</span>
                  <label
                    className="admin-btn secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: uploading ? 'wait' : 'pointer', width: 'fit-content' }}
                  >
                    {uploading ? 'Subiendo…' : '📁 Subir desde mi equipo'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                      style={{ display: 'none' }}
                      disabled={uploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) subirImagen(f); e.target.value = ''; }}
                    />
                  </label>
                  <span className="form-hint">JPG, PNG, WEBP, GIF o AVIF · máximo 5 MB. Sin imagen se usa el ícono sobre el color.</span>
                  {uploadError && <span className="form-hint" style={{ color: 'var(--orange)' }}>{uploadError}</span>}
                </div>

                <label className="form-group">
                  <span>O pegá una URL de imagen</span>
                  <input
                    value={form.imagen_url}
                    onChange={e => setForm(p => ({ ...p, imagen_url: e.target.value }))}
                    placeholder="https://... o /uploads/..."
                  />
                </label>

                {form.imagen_url && (
                  <div className="form-group full" style={{ position: 'relative' }}>
                    <img src={form.imagen_url} className="photo-preview" alt="Imagen del menú" />
                    <button
                      type="button"
                      className="admin-btn ghost"
                      style={{ width: 'fit-content' }}
                      onClick={() => setForm(p => ({ ...p, imagen_url: '' }))}
                    >
                      Quitar imagen
                    </button>
                  </div>
                )}

                <div className="form-group full">
                  <span className="form-hint" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    Cómo se presenta en la web
                  </span>
                </div>

                <label className="form-group">
                  <span>Título grande</span>
                  <input
                    value={form.titulo}
                    onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                    placeholder={form.nombre || 'Elevate × Fitbull'}
                  />
                  <span className="form-hint">Vacío usa el nombre.</span>
                </label>

                <label className="form-group">
                  <span>Texto del botón</span>
                  <input
                    value={form.cta_texto}
                    onChange={e => setForm(p => ({ ...p, cta_texto: e.target.value }))}
                    placeholder="Ver menú"
                  />
                </label>

                <label className="form-group">
                  <span>Línea sobre el título (carta)</span>
                  <input
                    value={form.eyebrow}
                    onChange={e => setForm(p => ({ ...p, eyebrow: e.target.value }))}
                    placeholder="Colaboración"
                  />
                </label>

                <label className="form-group">
                  <span>Línea sobre el título (landing)</span>
                  <input
                    value={form.kicker}
                    onChange={e => setForm(p => ({ ...p, kicker: e.target.value }))}
                    placeholder="Colaboración oficial"
                  />
                </label>

                <label className="form-group full">
                  <span>Tagline</span>
                  <input
                    value={form.tagline}
                    onChange={e => setForm(p => ({ ...p, tagline: e.target.value }))}
                    placeholder="Nutrición deportiva de alto rendimiento, lista para tu entreno."
                  />
                </label>

                <label className="form-group full">
                  <span>Descripción</span>
                  <textarea
                    value={form.descripcion}
                    onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
                    rows={4}
                    placeholder="El párrafo que se lee en la landing."
                  />
                </label>

                <label className="form-group full">
                  <span>Viñetas</span>
                  <textarea
                    value={form.bullets}
                    onChange={e => setForm(p => ({ ...p, bullets: e.target.value }))}
                    rows={3}
                    placeholder={'Una por línea\nHecho fresco cada día\nIngredientes locales'}
                  />
                  <span className="form-hint">Una por línea, hasta 6.</span>
                </label>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn secondary" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
              <button className="admin-btn primary" disabled={saving || !form.nombre.trim()} type="submit">
                {saving ? 'Guardando...' : 'Guardar menú'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
