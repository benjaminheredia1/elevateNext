'use client';

import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';

import { Icons } from '@/components/shop/icons';
import { useShop, ShopOverlays } from '@/components/shop/order';
import { TiltCard, ScrollProgress } from '@/components/shop/interactions';
import {
  AnimatedChars,
  AnimatedWords,
  TextReveal,
  AnimatedCounter,
  GlowText,
  fadeUp,
  fadeIn,
  scaleIn,
  staggerContainer,
  staggerItem,
  slideFromLeft,
} from '@/components/shop/motion';
import { BRANDS } from '@/data/menus';

/* ===== Landing-only data ===== */
const benefits = [
  { icon: Icons.leaf, title: 'Ingredientes Naturales', description: 'Seleccionamos los mejores ingredientes orgánicos y locales de Bolivia para cada preparación.' },
  { icon: Icons.zap, title: 'Alto en Proteína', description: 'Cada comida está diseñada para maximizar tu aporte proteico y energético del día.' },
  { icon: Icons.target, title: 'Personalizado', description: 'Adaptamos nuestros menús a tus objetivos: pérdida de peso, ganancia muscular o bienestar.' },
  { icon: Icons.truck, title: 'Delivery Rápido', description: 'Entrega en menos de 45 minutos a cualquier punto de Santa Cruz de la Sierra.' },
  { icon: Icons.barChart, title: 'Info Nutricional', description: 'Cada plato incluye información detallada de macros y calorías para tu control.' },
  { icon: Icons.recycle, title: 'Eco-Friendly', description: 'Empaques biodegradables y prácticas sustentables para cuidar nuestro medio ambiente.' },
];

const testimonials = [
  { name: 'María Fernanda L.', role: 'Fitness Coach', text: '"Elevate cambió mi rutina alimenticia. La calidad y frescura de cada bowl es increíble. ¡Lo recomiendo a todos mis clientes!"', initials: 'MF' },
  { name: 'Carlos Gutiérrez', role: 'Empresario', text: '"Perfecto para quienes trabajamos todo el día. Comida saludable que llega rápido y con un sabor espectacular."', initials: 'CG' },
  { name: 'Ana Sofía R.', role: 'Nutricionista', text: '"Como profesional de la nutrición, valoro mucho la transparencia en los ingredientes. Elevate cumple con los más altos estándares."', initials: 'AS' },
];

const collaborations = [
  {
    brand: BRANDS.fitbull,
    imageSide: 'left' as const,
    kicker: 'Colaboración oficial',
    heading: 'Elevate × Fitbull',
    body: 'Nos aliamos con Fitbull, el gimnasio que entrena a la comunidad fitness de Santa Cruz, para crear un menú pensado para tu rendimiento. Pre-entreno, recovery y alto en proteína: cada plato apoya tus objetivos dentro y fuera del gym.',
    bullets: ['Recetas aprobadas por entrenadores', 'Macros calculados por porción', 'Ideal pre y post entreno'],
    cta: 'Menú Elevate × Fitbull',
    visualIcon: Icons.dumbbell,
  },
  {
    brand: BRANDS.elevate,
    imageSide: 'right' as const,
    kicker: 'Nuestra casa',
    heading: 'Gathering Elevate',
    body: 'El corazón de Elevate: nuestro gathering de comida saludable. Bowls, ensaladas, wraps y bebidas frescas preparadas cada día con ingredientes locales. Comida que disfrutas sin culpa, para cualquier momento del día.',
    bullets: ['Hecho fresco cada día', 'Ingredientes locales bolivianos', 'Opciones para todos los gustos'],
    cta: 'Menú Elevate',
    visualIcon: Icons.bowl,
  },
];

const heroParticles = [
  { left: '7%', size: 4, dur: 9, delay: 0 },
  { left: '14%', size: 3, dur: 12, delay: 2.5 },
  { left: '20%', size: 5, dur: 8, delay: 5 },
  { left: '78%', size: 4, dur: 11, delay: 1 },
  { left: '86%', size: 3, dur: 10, delay: 3.5 },
  { left: '93%', size: 5, dur: 7, delay: 6 },
  { left: '4%', size: 3, dur: 14, delay: 4 },
  { left: '96%', size: 3, dur: 9, delay: 2 },
];

function HeroAmbience() {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <div className="hero-ambience" aria-hidden="true">
      <div className="hero-orb-cluster hero-orb-cluster-left">
        <motion.div className="orb-ring orb-ring-outer" animate={{ rotate: 360 }} transition={{ duration: 42, repeat: Infinity, ease: 'linear' }} />
        <motion.div className="orb-ring orb-ring-inner" animate={{ rotate: -360 }} transition={{ duration: 26, repeat: Infinity, ease: 'linear' }} />
        <motion.div className="orb-dot od-orange od-lg" style={{ top: '28%', left: '68%' }} animate={{ y: [0, -16, 0], opacity: [0.7, 1, 0.7] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="orb-dot od-white od-sm" style={{ top: '64%', left: '24%' }} animate={{ y: [0, 12, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }} />
        <motion.div className="orb-dot od-orange od-xs" style={{ top: '76%', left: '80%' }} animate={{ y: [0, -8, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }} />
      </div>
      <div className="hero-orb-cluster hero-orb-cluster-right">
        <motion.div className="orb-ring orb-ring-mid" animate={{ rotate: -360 }} transition={{ duration: 34, repeat: Infinity, ease: 'linear' }} />
        <motion.div className="orb-dot od-teal od-lg" style={{ top: '33%', left: '38%' }} animate={{ y: [0, 18, 0], opacity: [0.5, 0.9, 0.5] }} transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }} />
        <motion.div className="orb-dot od-orange od-sm" style={{ top: '68%', left: '62%' }} animate={{ y: [0, -12, 0] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2 }} />
        <motion.div className="orb-dot od-white od-xs" style={{ top: '55%', left: '20%' }} animate={{ y: [0, 10, 0] }} transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 3 }} />
      </div>
      {heroParticles.map((p, i) => (
        <div key={i} className="rise-particle" style={{ left: p.left, width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }} />
      ))}
    </div>
  );
}

const heroStats = [
  { target: 2000, suffix: '+', duration: 2.5, label: 'Clientes felices', icon: Icons.heart, delay: '1.8s' },
  { target: 50, suffix: '+', duration: 2, label: 'Opciones de menú', icon: Icons.bowl, delay: '2.0s' },
  { target: 4.9, suffix: '', duration: 1.5, label: 'Calificación promedio', icon: Icons.star, delay: '2.2s' },
];

function HeroWordmark() {
  const reduced = useReducedMotion();
  return (
    <motion.h1
      className="hero-wordmark-wrap"
      aria-label="Elevate"
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={`hero-logo-glitch${reduced ? ' no-glitch' : ''}`}>
        <img src="/elevate-logo-light.png" alt="Elevate" className="hero-logo hero-logo-base" />
        <img src="/elevate-logo-light.png" className="hero-logo hero-logo-r" aria-hidden="true" />
        <img src="/elevate-logo-light.png" className="hero-logo hero-logo-b" aria-hidden="true" />
      </div>
    </motion.h1>
  );
}

export default function Home() {
  const [scrolled, setScrolled] = useState(false);
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const shop = useShop();
  const router = useRouter();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);

    // Fetch from both brands in parallel, interleave up to 3 from each
    Promise.all([
      fetch('/api/productos?marca=elevate').then(r => r.json()),
      fetch('/api/productos?marca=fitbull').then(r => r.json()),
    ])
      .then(([elevateRes, fitbullRes]) => {
        const elevateItems: any[] = elevateRes.data ?? [];
        const fitbullItems: any[] = fitbullRes.data ?? [];

        const combined: any[] = [];
        for (let i = 0; i < 3; i++) {
          if (elevateItems[i]) combined.push(elevateItems[i]);
          if (fitbullItems[i]) combined.push(fitbullItems[i]);
        }

        const mapProduct = (p: any) => {
          const catName = p.categoria_id?.[0]?.categoria?.nombre || 'General';
          let iconName = 'bowl';
          const catLower = catName.toLowerCase();
          if (catLower.includes('wrap')) iconName = 'wrap';
          else if (catLower.includes('bebida') || catLower.includes('batido') || catLower.includes('smoothie')) iconName = 'cup';
          else if (catLower.includes('ensalada')) iconName = 'salad';
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
          };
        };
        setFeaturedProducts(combined.slice(0, 6).map(mapProduct));
      })
      .catch(console.error);

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="app">
      <ScrollProgress />

      {/* ===== NAVBAR ===== */}
      <motion.nav
        className={`navbar ${scrolled ? 'scrolled' : ''}`}
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] as const }}
      >
        <div className="navbar-inner">
          <motion.a href="#inicio" className="navbar-logo" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
            <motion.img
              src="/elevate.png"
              alt="Elevate"
              className="navbar-logo-img"
              initial={{ rotate: -8, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            />
          </motion.a>
          <div className="navbar-links">
            {['Inicio', 'Menús', 'Nosotros', 'Beneficios', 'Testimonios'].map((link, i) => (
              <motion.a
                key={link}
                href={`#${link.toLowerCase().replace('ú', 'u')}`}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 + i * 0.08 }}
              >
                {link}
              </motion.a>
            ))}
            <motion.button
              className="navbar-cta"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.9 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => scrollTo('menus')}
            >
              Ordenar Ahora
            </motion.button>
          </div>
          <div className="navbar-mobile-toggle"><span /><span /><span /></div>
        </div>
      </motion.nav>

      <ShopOverlays shop={shop} />

      {/* ===== HERO ===== */}
      <section className="hero hero-centered" id="inicio">
        <HeroAmbience />
        <div className="container hero-centered-inner">
          <motion.p className="hero-eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
            Beyond Performance<span className="hero-eyebrow-sep">·</span>Santa Cruz, Bolivia
          </motion.p>

          <HeroWordmark />

          <motion.p className="hero-subhead" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 1.15 }}>
            Alimentación que <GlowText>eleva</GlowText> tu rendimiento
          </motion.p>

          <motion.p className="hero-description" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 1.35 }}>
            Un gathering de comida saludable con dos menús: fresco, alto en proteína y hecho cada día en Santa Cruz.
          </motion.p>

          <motion.div className="hero-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 1.55 }}>
            <motion.button className="btn-primary" whileHover={{ scale: 1.04, boxShadow: '0 16px 40px rgba(255, 92, 25, 0.35)' }} whileTap={{ scale: 0.96 }} onClick={() => scrollTo('menus')}>
              Ver menús
              <motion.span style={{ display: 'inline-flex' }} animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const }}>
                {Icons.arrowRight}
              </motion.span>
            </motion.button>
            <button className="hero-link" onClick={() => scrollTo('nosotros')}>Conoce la historia</button>
          </motion.div>

          <motion.div className="hero-stats" initial="hidden" animate="visible" variants={staggerContainer}>
            {heroStats.map((s, i) => (
              <motion.div key={i} className="hero-stat" style={{ '--stat-delay': s.delay } as React.CSSProperties} variants={staggerItem} whileHover={{ scale: 1.06, y: -5 }} transition={{ type: 'spring', stiffness: 320, damping: 20 }}>
                <div className="hero-stat-icon">{s.icon}</div>
                <div className="hero-stat-value"><AnimatedCounter target={s.target} suffix={s.suffix} duration={s.duration} /></div>
                <div className="hero-stat-label">{s.label}</div>
                <span className="hero-stat-live" />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== MENUS / COLLABORATIONS ===== */}
      <section className="menus" id="menus">
        <div className="container">
          <motion.div className="menus-header" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.5 }}>
            <TextReveal delay={0} direction="left"><span className="section-label">Nuestros menús</span></TextReveal>
            <motion.h2 className="section-title" variants={fadeUp} custom={0.1}>
              <AnimatedWords text="Dos experiencias, un mismo estándar" delay={0.2} animationType="wave" />
            </motion.h2>
          </motion.div>

          {collaborations.map((collab) => (
            <motion.div key={collab.brand.key} className={`collab collab-${collab.imageSide}`} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }}>
              <TiltCard
                className={`collab-visual collab-visual-${collab.brand.key}`}
                lift={-6}
                variants={collab.imageSide === 'left' ? slideFromLeft : { hidden: { opacity: 0, x: 60 }, visible: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } } }}
              >
                <div className="collab-visual-glow" />
                <motion.div className="collab-visual-icon" animate={{ y: [0, -14, 0], rotate: [0, 4, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
                  {collab.visualIcon}
                </motion.div>
                <span className="collab-visual-tag">{collab.brand.title}</span>
                <span className="collab-visual-hint">{Icons.camera} Imagen {collab.heading}</span>
              </TiltCard>

              <motion.div className="collab-content" variants={staggerContainer}>
                <motion.span className="collab-kicker" variants={staggerItem}>{collab.kicker}</motion.span>
                <motion.h3 className="collab-heading" variants={staggerItem}>
                  {collab.heading.includes('×') ? (<>Elevate <span className="collab-x">×</span> Fitbull</>) : collab.heading}
                </motion.h3>
                <motion.p className="collab-body" variants={staggerItem}>{collab.body}</motion.p>
                <motion.ul className="collab-bullets" variants={staggerItem}>
                  {collab.bullets.map((b) => (
                    <li key={b}><span className="collab-bullet-check">{Icons.checkCircle}</span>{b}</li>
                  ))}
                </motion.ul>
                <motion.button
                  className="collab-btn"
                  variants={staggerItem}
                  whileHover={{ scale: 1.04, boxShadow: '0 16px 40px rgba(255, 92, 25, 0.3)' }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => router.push(`/menu/${collab.brand.slug}`)}
                >
                  {collab.cta}
                  <motion.span style={{ display: 'inline-flex' }} animate={{ x: [0, 5, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const }}>
                    {Icons.arrowRight}
                  </motion.span>
                </motion.button>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== FEATURED PRODUCTS ===== */}
      <section className="products" id="productos">
        <div className="container">
          <motion.div className="products-header" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.5 }}>
            <div className="products-header-left">
              <TextReveal delay={0} direction="left"><span className="section-label">Los más pedidos</span></TextReveal>
              <motion.h2 className="section-title" variants={fadeUp} custom={0.1}>
                <AnimatedWords text="Un adelanto de lo que te espera" delay={0.2} animationType="wave" />
              </motion.h2>
              <motion.p className="section-subtitle" variants={fadeUp} custom={0.2}>
                <AnimatedWords text="Favoritos de ambos menús. Agrégalos al carrito o entra a un menú completo." delay={0.4} animationType="blur" />
              </motion.p>
            </div>
            <motion.button className="btn-secondary" variants={fadeIn} custom={0.3} style={{ whiteSpace: 'nowrap' }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => scrollTo('menus')}>
              Ver menús completos
              <motion.span style={{ display: 'inline-flex' }} animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const }}>
                {Icons.arrowRightSmall}
              </motion.span>
            </motion.button>
          </motion.div>

          {featuredProducts.length === 0 && (
            <motion.p variants={fadeUp} style={{ textAlign: 'center', color: '#aaa', padding: '2rem 0' }}>
              Próximamente nuestros productos destacados estarán disponibles aquí.
            </motion.p>
          )}
          <motion.div className="products-grid" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={staggerContainer}>
            {featuredProducts.map((product) => (
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
                    <motion.span className="product-tag" initial={{ opacity: 0, scale: 0 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.3, type: 'spring', stiffness: 400, damping: 15 }}>
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
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      animate={shop.addedProductId === product.id ? { scale: [1, 1.3, 1], rotate: [0, 15, 0], transition: { duration: 0.4, ease: 'easeInOut' } } : {}}
                      transition={{ type: 'spring', stiffness: 400 }}
                      onClick={() => shop.addToCart(product)}
                      title="Agregar al carrito"
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
        </div>
      </section>

      {/* ===== ABOUT ===== */}
      <section className="about" id="nosotros">
        <div className="container">
          <div className="about-grid">
            <motion.div className="about-image-container" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }}>
              <motion.div className="about-image-placeholder" variants={scaleIn} custom={0}>
                <div className="placeholder-icon" style={{ opacity: 0.5 }}>{Icons.camera}</div>
                <div className="placeholder-text" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', textTransform: 'uppercase' }}>Imagen Nosotros</div>
              </motion.div>
              <motion.div className="about-accent-box" variants={fadeUp} custom={0.3}>
                <div className="accent-icon">{Icons.award}</div>
                <div className="accent-text">Tu mejor opción para comer saludable</div>
              </motion.div>
            </motion.div>

            <motion.div className="about-content" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }}>
              <TextReveal delay={0} direction="left"><span className="section-label">Sobre Nosotros</span></TextReveal>
              <motion.h2 className="section-title" variants={slideFromLeft} custom={0.1}>
                <AnimatedWords text="Nutrición que transforma vidas en Santa Cruz" delay={0.2} animationType="slide" />
              </motion.h2>
              <motion.div variants={fadeUp} custom={0.3}>
                <p className="section-subtitle">
                  <AnimatedWords text="En Elevate creemos que la alimentación saludable debe ser accesible, deliciosa y conveniente. Nacimos en Santa Cruz de la Sierra con la misión de elevar el estándar de la comida saludable en Bolivia." delay={0.4} animationType="blur" />
                </p>
              </motion.div>
              <motion.div className="about-features" variants={staggerContainer}>
                {[
                  { icon: Icons.wheat, title: 'Ingredientes Locales', desc: 'Trabajamos directamente con productores bolivianos para obtener los ingredientes más frescos.' },
                  { icon: Icons.chefHat, title: 'Chefs Especializados', desc: 'Nuestro equipo de cocina está especializado en nutrición deportiva y alimentación funcional.' },
                  { icon: Icons.heart, title: 'Hecho con Amor', desc: 'Cada plato se prepara con dedicación, cuidando cada detalle para tu bienestar.' },
                ].map((f) => (
                  <motion.div key={f.title} className="about-feature" variants={staggerItem} whileHover={{ x: 8 }}>
                    <motion.div className="about-feature-icon" whileHover={{ rotate: 15, scale: 1.15 }} transition={{ type: 'spring', stiffness: 300 }}>{f.icon}</motion.div>
                    <div><h4>{f.title}</h4><p>{f.desc}</p></div>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== BENEFITS ===== */}
      <section className="benefits" id="beneficios">
        <div className="container">
          <motion.div className="benefits-header" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.5 }}>
            <TextReveal delay={0} direction="left"><span className="section-label">¿Por qué elegirnos?</span></TextReveal>
            <motion.h2 className="section-title" variants={fadeUp} custom={0.1}>
              <AnimatedWords text="Beneficios que marcan la diferencia" delay={0.2} animationType="bounce" />
            </motion.h2>
            <motion.p className="section-subtitle" variants={fadeUp} custom={0.2}>
              <AnimatedWords text="Cada detalle cuenta cuando se trata de tu salud. Por eso nos esforzamos en ofrecer una experiencia completa." delay={0.5} animationType="blur" />
            </motion.p>
          </motion.div>
          <motion.div className="benefits-grid" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={staggerContainer}>
            {benefits.map((benefit, i) => (
              <TiltCard key={i} className="benefit-card" variants={staggerItem}>
                <motion.div className="benefit-icon" whileHover={{ scale: 1.2, rotate: [0, -10, 10, 0] }} transition={{ duration: 0.5 }}>
                  {benefit.icon}
                </motion.div>
                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </TiltCard>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="testimonials" id="testimonios">
        <div className="container">
          <motion.div className="testimonials-header" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.5 }}>
            <TextReveal delay={0} direction="left"><span className="section-label">Testimonios</span></TextReveal>
            <motion.h2 className="section-title" variants={fadeUp} custom={0.1}>
              <AnimatedWords text="Lo que dicen nuestros clientes" delay={0.2} animationType="wave" />
            </motion.h2>
            <motion.p className="section-subtitle" variants={fadeUp} custom={0.2}>
              <AnimatedWords text="La satisfacción de nuestros clientes es nuestra mayor motivación." delay={0.4} animationType="blur" />
            </motion.p>
          </motion.div>
          <motion.div className="testimonials-grid" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={staggerContainer}>
            {testimonials.map((testimonial, i) => (
              <TiltCard key={i} className="testimonial-card" variants={staggerItem} lift={-4}>
                <div className="testimonial-stars">
                  {[...Array(5)].map((_, j) => (
                    <motion.span key={j} initial={{ opacity: 0, scale: 0, rotate: -180 }} whileInView={{ opacity: 1, scale: 1, rotate: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 + j * 0.1, type: 'spring', stiffness: 300 }} style={{ display: 'inline-flex' }}>
                      {Icons.star}
                    </motion.span>
                  ))}
                </div>
                <p className="testimonial-text">{testimonial.text}</p>
                <div className="testimonial-author">
                  <motion.div className="testimonial-avatar" whileHover={{ scale: 1.15 }} transition={{ type: 'spring', stiffness: 400 }}>{testimonial.initials}</motion.div>
                  <div className="testimonial-author-info"><h4>{testimonial.name}</h4><p>{testimonial.role}</p></div>
                </div>
              </TiltCard>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="cta-section">
        <div className="container">
          <motion.div className="cta-box" initial={{ opacity: 0, scale: 0.9, y: 40 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] as const }}>
            <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
              <AnimatedChars text="¿Listo para elevar tu alimentación?" delay={0.3} staggerDelay={0.025} />
            </motion.h2>
            <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
              <AnimatedWords text="Elige tu menú y recibe tu comida saludable en la puerta de tu casa en Santa Cruz de la Sierra." delay={1.2} animationType="blur" />
            </motion.p>
            <motion.button className="cta-btn" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 2.0, duration: 0.6 }} whileHover={{ scale: 1.08, boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)' }} whileTap={{ scale: 0.95 }} onClick={() => scrollTo('menus')}>
              Ver los menús
              <motion.span style={{ display: 'inline-flex' }} animate={{ x: [0, 5, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const }}>
                {Icons.arrowRight}
              </motion.span>
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="footer">
        <div className="container">
          <motion.div className="footer-grid" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={staggerContainer}>
            <motion.div className="footer-brand" variants={staggerItem}>
              <img src="/elevate.png" alt="Elevate" className="footer-logo-img" />
              <p>Comida saludable premium en Santa Cruz de la Sierra, Bolivia. Elevamos tu rendimiento con nutrición de alta calidad.</p>
              <div className="footer-socials">
                {[{ label: 'Instagram', icon: Icons.instagram }, { label: 'Facebook', icon: Icons.facebook }, { label: 'WhatsApp', icon: Icons.whatsapp }].map((social, i) => (
                  <motion.a key={social.label} href="#" className="footer-social-btn" aria-label={social.label} whileHover={{ scale: 1.2, rotate: 5 }} whileTap={{ scale: 0.9 }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.1 }}>
                    {social.icon}
                  </motion.a>
                ))}
              </div>
            </motion.div>
            {[
              { title: 'Menús', links: ['Elevate × Fitbull', 'Gathering Elevate', 'Bowls', 'Ensaladas', 'Smoothies'] },
              { title: 'Empresa', links: ['Sobre nosotros', 'Nuestro equipo', 'Blog', 'Trabaja con nosotros'] },
              { title: 'Contacto', links: ['Santa Cruz, Bolivia', 'info@elevate.bo', '+591 XXX XXX XX', 'Lun - Sáb: 7am - 9pm'] },
            ].map((column) => (
              <motion.div key={column.title} className="footer-column" variants={staggerItem}>
                <h4>{column.title}</h4>
                {column.links.map((link) => (
                  <motion.a key={link} href="#" whileHover={{ x: 6, color: '#ff5c19' }} transition={{ duration: 0.2 }}>{link}</motion.a>
                ))}
              </motion.div>
            ))}
          </motion.div>
          <motion.div className="footer-bottom" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.5, duration: 0.6 }}>
            <p>© 2026 Elevate. Beyond Performance. Todos los derechos reservados.</p>
            <div className="footer-bottom-links">
              {['Privacidad', 'Términos', 'Cookies'].map((link) => (
                <motion.a key={link} href="#" whileHover={{ color: '#ff5c19' }}>{link}</motion.a>
              ))}
            </div>
          </motion.div>
        </div>
      </footer>
    </div>
  );
}
