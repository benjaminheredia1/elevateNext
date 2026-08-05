'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Icons } from '@/components/shop/icons';
import { useShop, ShopOverlays } from '@/components/shop/order';
import { TiltCard } from '@/components/shop/interactions';
import { AnimatedChars, AnimatedWords, staggerContainer, staggerItem } from '@/components/shop/motion';
import type { Menu } from '@/lib/menus';
import SucursalPicker from '@/components/shop/SucursalPicker';
import { useSucursalTienda } from '@/hooks/sucursal-tienda';

export default function MenuPage() {
  const params = useParams();
  // El segmento se llama [brand] por historia; hoy es el slug del menú.
  const slug = params?.brand as string;
  const router = useRouter();
  const shop = useShop();
  const [activeCat, setActiveCat] = useState('Todos');
  const { sucursalId, cargando: cargandoSucursal } = useSucursalTienda();
  const [dbProducts, setDbProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /** Los menús publicados: uno es esta carta y el resto van al selector de arriba. */
  const [menus, setMenus] = useState<Menu[] | null>(null);

  useEffect(() => {
    fetch('/api/menus')
      .then(r => r.json())
      .then(res => setMenus(Array.isArray(res.data) ? res.data : []))
      .catch(() => setMenus([]));
  }, []);

  // `key` además de `slug` para que los enlaces viejos (/menu/fitbull) sigan
  // funcionando aunque el dueño le cambie la dirección a la carta.
  const data = useMemo(
    () => menus?.find(m => m.slug === slug || m.key === slug) ?? null,
    [menus, slug],
  );

  useEffect(() => {
    if (!data) return;
    // El menú y los precios son los del local elegido.
    if (cargandoSucursal) return;

    setDbProducts([]);
    setActiveCat('Todos');
    setLoading(true);

    fetch(`/api/productos?marca=${encodeURIComponent(data.key)}${sucursalId ? `&sucursal=${sucursalId}` : ''}`)
      .then(r => r.json())
      .then(res => {
        const items: any[] = res.data ?? [];
        const mapped = items.map((p: any) => {
          const catName = p.categoria_id?.[0]?.categoria?.nombre || 'General';
          let iconName = 'bowl';
          const catLower = catName.toLowerCase();
          if (catLower.includes('wrap')) iconName = 'wrap';
          else if (catLower.includes('bebida') || catLower.includes('batido')) iconName = 'cup';
          else if (catLower.includes('ensalada')) iconName = 'salad';
          else if (catLower.includes('batido') || catLower.includes('shake') || catLower.includes('smoothie')) iconName = 'cup';
          else if (catLower.includes('snack')) iconName = 'nut';
          const tieneDescuento = p.descuentoAplicado != null && p.descuentoAplicado > 0;
          const pctDescuento = tieneDescuento && p.precio_original > 0
            ? Math.round((p.descuentoAplicado / p.precio_original) * 100)
            : 0;
          return {
            id: p.id,
            name: p.nombre,
            description: p.descripcion,
            price: p.precio,
            precio_original: p.precio_original ?? p.precio,
            descuentoAplicado: p.descuentoAplicado ?? 0,
            tieneDescuento,
            pctDescuento,
            category: catName,
            tag: tieneDescuento ? `${pctDescuento}% OFF` : null,
            icon: Icons[iconName as keyof typeof Icons] || Icons.bowl,
            calories: p.calorias ?? null,
            protein: p.proteina ?? null,
            imageUrl: p.imagen_url,
          };
        });
        setDbProducts(mapped);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [data, sucursalId, cargandoSucursal]);

  const isEmpty = !loading && dbProducts.length === 0;

  const categories = useMemo(() => {
    const cats = Array.from(new Set(dbProducts.map(p => p.category)));
    return ['Todos', ...cats];
  }, [dbProducts]);

  const filtered = useMemo(() => {
    if (activeCat === 'Todos') return dbProducts;
    return dbProducts.filter((p: any) => p.category === activeCat);
  }, [dbProducts, activeCat]);

  // Hasta que se sepa qué menús hay, no se puede decir que este no existe.
  if (menus === null) {
    return <div className="menu-page" />;
  }

  if (!data) {
    return (
      <div className="menu-page">
        <div className="menu-notfound">
          <h1>Menú no encontrado</h1>
          <p>El menú que buscas no existe o ya no está publicado.</p>
          <Link href="/" className="menu-back-link">{Icons.arrowLeft} Volver al inicio</Link>
        </div>
      </div>
    );
  }

  /** Las otras cartas publicadas, para poder saltar entre menús. */
  const otrosMenus = menus.filter(m => m.id !== data.id);

  return (
    <div className={`menu-page brand-${data.key}`}>
      <ShopOverlays shop={shop} />

      {/* ===== MENU NAVBAR ===== */}
      <nav className="menu-navbar">
        <div className="menu-navbar-inner">
          <button className="menu-back-btn" onClick={() => router.push('/')}>
            {Icons.arrowLeft}<span>Inicio</span>
          </button>
          <Link href="/" className="menu-navbar-logo">
            <img src="/elevate.png" alt="Elevate" />
          </Link>
          <div className="menu-navbar-actions">
            {otrosMenus.map(m => (
              <Link key={m.id} href={`/menu/${m.slug}`} className="menu-switch-link">
                Ver menú {m.nombre}
              </Link>
            ))}
            <button className="menu-cart-btn" onClick={shop.openCart}>
              {Icons.shoppingCart}
              {shop.cartCount > 0 && <span className="menu-cart-count">{shop.cartCount}</span>}
            </button>
          </div>
        </div>
      </nav>

      {/* ===== MENU HERO ===== */}
      {/* El color del menú alimenta el glow; las dos cartas históricas tienen
          además su propia regla en menu.css, que sigue mandando. */}
      <header
        className={`menu-hero menu-hero-${data.key}`}
        style={data.color ? ({ '--menu-color': data.color } as CSSProperties) : undefined}
      >
        <div className="menu-hero-glow" />
        <div className="container">
          {data.eyebrow && (
            <motion.span className="menu-hero-eyebrow" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              {data.eyebrow}
            </motion.span>
          )}
          <h1 className="menu-hero-title">
            <AnimatedChars text={data.titulo} delay={0.15} staggerDelay={0.04} />
          </h1>
          {data.tagline && (
            <motion.p className="menu-hero-tagline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }}>
              <AnimatedWords text={data.tagline} delay={0.7} animationType="blur" />
            </motion.p>
          )}
          <motion.div className="menu-hero-meta" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.5 }}>
            <span>{Icons.clock} 30-45 min</span>
            <span className="menu-hero-dot" />
            <span>{Icons.truck} Delivery gratis</span>
            <span className="menu-hero-dot" />
            <span>{Icons.star} 4.9</span>
          </motion.div>
          <SucursalPicker />
        </div>
      </header>

      <div className="menu-filter">
        <div className="container menu-filter-inner">
          {categories.map(cat => (
            <button key={cat} className={`menu-chip ${activeCat === cat ? 'active' : ''}`} onClick={() => setActiveCat(cat)}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ===== PRODUCTS GRID ===== */}
      <section className="menu-products">
        <div className="container">
          {isEmpty && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'rgba(255,92,25,0.08)',
                border: '1px solid rgba(255,92,25,0.2)',
                borderRadius: 12,
                padding: '12px 18px',
                marginBottom: 24,
                fontSize: 13,
                color: '#aaa',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 18 }}>✨</span>
              <span>
                Próximamente en este menú. Estamos preparando productos frescos para ti —
                <strong style={{ color: '#ff5c19' }}> vuelve pronto</strong>.
              </span>
            </motion.div>
          )}
          <motion.div className="products-grid" key={activeCat} initial="hidden" animate="visible" variants={staggerContainer}>
            {filtered.map(product => (
              <TiltCard key={product.id} className="product-card" variants={staggerItem}>
                <div className="product-image-container">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div className="product-image-placeholder">
                      <motion.div className="placeholder-icon product-placeholder-icon" whileHover={{ scale: 1.3, rotate: 15 }} transition={{ type: 'spring', stiffness: 300 }}>
                        {product.icon}
                      </motion.div>
                      <div className="placeholder-text">Imagen producto</div>
                    </div>
                  )}
                  {/* Ya no se muestra "Agotado": el cliente puede pedirlo, y un
                      cartel de agotado sobre algo que se puede comprar espanta
                      la venta. La etiqueta vuelve a ser la del descuento. */}
                  {product.tag && (
                    <motion.span className="product-tag" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, type: 'spring', stiffness: 400, damping: 15 }}>
                      {product.tag}
                    </motion.span>
                  )}
                </div>
                <div className="product-info">
                  <div className="product-category">{product.category}</div>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  {(product.calories || product.protein) && (
                    <div className="product-macros">
                      {product.calories && <span className="macro-badge">{product.calories} kcal</span>}
                      {product.protein && <span className="macro-badge protein">{product.protein} proteína</span>}
                    </div>
                  )}
                  <div className="product-footer">
                    <div className="product-price">
                      {product.tieneDescuento && (
                        <span style={{ display: 'block', textDecoration: 'line-through', color: '#666', fontSize: '0.78em', lineHeight: 1 }}>
                          Bs. {product.precio_original}
                        </span>
                      )}
                      <span className="currency">Bs. </span>{product.price}
                    </div>
                    {/* El botón está siempre: sin stock se pide igual, como en
                        la caja. El inventario no siempre está al día y bloquear
                        por existencias hacía perder pedidos de cosas que sí
                        había. */}
                    <motion.button
                      className={`product-add-btn ${shop.addedProductId === product.id ? 'added' : ''}`}
                      whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}
                      animate={shop.addedProductId === product.id ? { scale: [1, 1.3, 1], rotate: [0, 15, 0], transition: { duration: 0.4, ease: 'easeInOut' } } : {}}
                      transition={{ type: 'spring', stiffness: 400 }}
                      onClick={() => shop.addToCart({ id: product.id, name: product.name, price: product.price, precio_original: product.precio_original, descuentoAplicado: product.descuentoAplicado, icon: product.icon, category: product.category })} title="Agregar al carrito"
                    >
                      {shop.addedProductId === product.id ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : Icons.plus}
                    </motion.button>
                  </div>
                </div>
              </TiltCard>
            ))}
          </motion.div>
          {!loading && !isEmpty && filtered.length === 0 && <p className="menu-empty-cat">No hay productos en esta categoría.</p>}
        </div>
      </section>

      {/* ===== STICKY CHECKOUT BAR ===== */}
      {shop.cartCount > 0 && (
        <motion.div className="menu-checkout-bar" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <div className="container menu-checkout-bar-inner">
            <div className="menu-checkout-bar-info">
              <span className="menu-checkout-bar-count">{shop.cartCount} {shop.cartCount === 1 ? 'producto' : 'productos'}</span>
              <span className="menu-checkout-bar-total">Bs. {shop.cart.reduce((a, i) => a + i.price * i.quantity, 0)}</span>
            </div>
            <button className="menu-checkout-bar-btn" onClick={shop.openCart}>Ver carrito {Icons.arrowRight}</button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
