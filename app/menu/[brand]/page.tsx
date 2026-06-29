'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Icons } from '@/components/shop/icons';
import { useShop, ShopOverlays } from '@/components/shop/order';
import { TiltCard } from '@/components/shop/interactions';
import { AnimatedChars, AnimatedWords, staggerContainer, staggerItem } from '@/components/shop/motion';
import { BRANDS, type BrandKey } from '@/data/menus';

export default function MenuPage() {
  const params = useParams();
  const brand = params?.brand as string;
  const router = useRouter();
  const shop = useShop();
  const [activeCat, setActiveCat] = useState('Todos');
  const [dbProducts, setDbProducts] = useState<any[]>([]);

  useEffect(() => {
    const brandKey = (brand === 'fitbull' || brand === 'elevate' ? brand : null);
    if (!brandKey) return;

    setDbProducts([]);
    setActiveCat('Todos');

    fetch(`/api/productos?marca=${brandKey}`)
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
          return {
            id: p.id,
            name: p.nombre,
            description: p.descripcion,
            price: p.precio,
            category: catName,
            tag: null,
            icon: Icons[iconName as keyof typeof Icons] || Icons.bowl,
            calories: p.calorias ?? null,
            protein: p.proteina ?? null,
            imageUrl: p.imagen_url,
          };
        });
        setDbProducts(mapped);
      })
      .catch(console.error);
  }, [brand]);

  const brandKey = (brand === 'fitbull' || brand === 'elevate' ? brand : null) as BrandKey | null;
  const data = brandKey ? BRANDS[brandKey] : null;

  const isUsingStaticData = dbProducts.length === 0;

  const categories = useMemo(() => {
    if (isUsingStaticData) return data?.categories || ['Todos'];
    const cats = Array.from(new Set(dbProducts.map(p => p.category)));
    return ['Todos', ...cats];
  }, [dbProducts, data, isUsingStaticData]);

  const filtered = useMemo(() => {
    const dataSource = isUsingStaticData ? (data?.products || []) : dbProducts;
    if (activeCat === 'Todos') return dataSource;
    return dataSource.filter((p: any) => p.category === activeCat);
  }, [data, dbProducts, activeCat, isUsingStaticData]);

  if (!data) {
    return (
      <div className="menu-page">
        <div className="menu-notfound">
          <h1>Menú no encontrado</h1>
          <p>El menú que buscas no existe.</p>
          <Link href="/" className="menu-back-link">{Icons.arrowLeft} Volver al inicio</Link>
        </div>
      </div>
    );
  }

  const isFitbull = data.key === 'fitbull';

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
            <Link href={`/menu/${isFitbull ? 'elevate' : 'fitbull'}`} className="menu-switch-link">
              {isFitbull ? 'Ver menú Elevate' : 'Ver menú Fitbull'}
            </Link>
            <button className="menu-cart-btn" onClick={shop.openCart}>
              {Icons.shoppingCart}
              {shop.cartCount > 0 && <span className="menu-cart-count">{shop.cartCount}</span>}
            </button>
          </div>
        </div>
      </nav>

      {/* ===== MENU HERO ===== */}
      <header className={`menu-hero ${isFitbull ? 'menu-hero-fitbull' : 'menu-hero-elevate'}`}>
        <div className="menu-hero-glow" />
        <div className="container">
          <motion.span className="menu-hero-eyebrow" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {data.eyebrow}
          </motion.span>
          <h1 className="menu-hero-title">
            <AnimatedChars text={data.title} delay={0.15} staggerDelay={0.04} />
          </h1>
          <motion.p className="menu-hero-tagline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }}>
            <AnimatedWords text={data.tagline} delay={0.7} animationType="blur" />
          </motion.p>
          <motion.div className="menu-hero-meta" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.5 }}>
            <span>{Icons.clock} 30-45 min</span>
            <span className="menu-hero-dot" />
            <span>{Icons.truck} Delivery gratis</span>
            <span className="menu-hero-dot" />
            <span>{Icons.star} 4.9</span>
          </motion.div>
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
          {isUsingStaticData && (
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
                    <div className="product-price"><span className="currency">Bs. </span>{product.price}</div>
                    <motion.button
                      className={`product-add-btn ${shop.addedProductId === product.id ? 'added' : ''}`}
                      whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}
                      animate={shop.addedProductId === product.id ? { scale: [1, 1.3, 1], rotate: [0, 15, 0], transition: { duration: 0.4, ease: 'easeInOut' } } : {}}
                      transition={{ type: 'spring', stiffness: 400 }}
                      onClick={() => shop.addToCart(product)} title="Agregar al carrito"
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
          {filtered.length === 0 && <p className="menu-empty-cat">No hay productos en esta categoría.</p>}
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
