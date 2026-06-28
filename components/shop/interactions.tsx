'use client';

import {
  motion,
  useSpring,
  useScroll,
  useReducedMotion,
  type Variants,
} from 'framer-motion'

/* ===================================================================
   TiltCard — subtle "lift toward the screen" pop on hover (no pointer
   tracking): the card scales up slightly and rises with a soft spring.
   =================================================================== */
export function TiltCard({
  children,
  className = '',
  lift = -6,
  variants,
}: {
  children: React.ReactNode
  className?: string
  lift?: number
  variants?: Variants
}) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      variants={variants}
      whileHover={reduced ? undefined : { scale: 1.035, y: lift }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      style={{ willChange: 'transform' }}
    >
      {children}
    </motion.div>
  )
}

/* ===================================================================
   ScrollProgress — thin top bar tracking page scroll
   =================================================================== */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24, restDelta: 0.001 })
  return <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />
}
