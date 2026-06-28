'use client';

import { useState, useEffect, useRef } from 'react'
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  animate,
  type Variants
} from 'framer-motion'

/* ===== Animated Text Components ===== */
export function AnimatedChars({
  text,
  className = '',
  delay = 0,
  staggerDelay = 0.03,
  once = true
}: {
  text: string
  className?: string
  delay?: number
  staggerDelay?: number
  once?: boolean
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once, amount: 0.5 })

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: staggerDelay, delayChildren: delay }
    }
  }

  const charVariants: Variants = {
    hidden: { opacity: 0, y: 50, rotateX: -90 },
    visible: {
      opacity: 1,
      y: 0,
      rotateX: 0,
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }
    }
  }

  return (
    <motion.span
      ref={ref}
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      aria-label={text}
      style={{ display: 'inline-block' }}
    >
      {text.split('').map((char, i) => (
        <motion.span
          key={i}
          variants={charVariants}
          style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : 'normal' }}
        >
          {char === ' ' ? ' ' : char}
        </motion.span>
      ))}
    </motion.span>
  )
}

export function AnimatedWords({
  text,
  className = '',
  delay = 0,
  once = true,
  animationType = 'wave'
}: {
  text: string
  className?: string
  delay?: number
  once?: boolean
  animationType?: 'wave' | 'slide' | 'blur' | 'bounce'
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once, amount: 0.3 })

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.08, delayChildren: delay }
    }
  }

  const wordVariantMap: Record<string, Variants> = {
    wave: {
      hidden: { opacity: 0, y: 30, rotateZ: -3 },
      visible: {
        opacity: 1,
        y: 0,
        rotateZ: 0,
        transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const }
      }
    },
    slide: {
      hidden: { opacity: 0, x: -30, filter: 'blur(8px)' },
      visible: {
        opacity: 1,
        x: 0,
        filter: 'blur(0px)',
        transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const }
      }
    },
    blur: {
      hidden: { opacity: 0, filter: 'blur(12px)', scale: 0.95 },
      visible: {
        opacity: 1,
        filter: 'blur(0px)',
        scale: 1,
        transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const }
      }
    },
    bounce: {
      hidden: { opacity: 0, y: 60 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring', stiffness: 200, damping: 15 }
      }
    }
  }

  const wordVariants = wordVariantMap[animationType]

  return (
    <motion.span
      ref={ref}
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      style={{ display: 'inline' }}
    >
      {text.split(' ').map((word, i) => (
        <motion.span
          key={i}
          variants={wordVariants}
          style={{ display: 'inline-block', marginRight: '0.3em' }}
        >
          {word}
        </motion.span>
      ))}
    </motion.span>
  )
}

export function TextReveal({
  children,
  className = '',
  delay = 0,
  once = true,
  direction = 'up'
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  once?: boolean
  direction?: 'up' | 'left' | 'right'
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once, amount: 0.5 })

  const clipMap = {
    up: { hidden: 'inset(100% 0 0 0)', visible: 'inset(0% 0 0 0)' },
    left: { hidden: 'inset(0 100% 0 0)', visible: 'inset(0 0% 0 0)' },
    right: { hidden: 'inset(0 0 0 100%)', visible: 'inset(0 0 0 0%)' }
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ clipPath: clipMap[direction].hidden, opacity: 0 }}
      animate={isInView ? { clipPath: clipMap[direction].visible, opacity: 1 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.65, 0, 0.35, 1] as const }}
    >
      {children}
    </motion.div>
  )
}

export function AnimatedCounter({
  target,
  suffix = '',
  prefix = '',
  duration = 2,
  className = ''
}: {
  target: number
  suffix?: string
  prefix?: string
  duration?: number
  className?: string
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 })
  const motionVal = useMotionValue(0)
  const springVal = useSpring(motionVal, { duration: duration * 1000 })
  const [display, setDisplay] = useState('0')

  useEffect(() => {
    if (isInView) {
      animate(motionVal, target, { duration, ease: [0.16, 1, 0.3, 1] as const })
    }
  }, [isInView, motionVal, target, duration])

  useEffect(() => {
    const unsubscribe = springVal.on('change', (latest) => {
      if (target >= 100) {
        setDisplay(Math.floor(latest).toLocaleString())
      } else if (target >= 10) {
        setDisplay(Math.floor(latest).toString())
      } else {
        setDisplay(latest.toFixed(1))
      }
    })
    return unsubscribe
  }, [springVal, target])

  return (
    <span ref={ref} className={className}>
      {prefix}{display}{suffix}
    </span>
  )
}

export function GlowText({
  children,
  className = ''
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.span
      className={`glow-text ${className}`}
      animate={{
        textShadow: [
          '0 0 8px rgba(255, 92, 25, 0.3)',
          '0 0 20px rgba(255, 92, 25, 0.6)',
          '0 0 8px rgba(255, 92, 25, 0.3)'
        ]
      }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' as const }}
      style={{ display: 'inline-block' }}
    >
      {children}
    </motion.span>
  )
}

export function Typewriter({
  text,
  className = '',
  delay = 0,
  speed = 0.05
}: {
  text: string
  className?: string
  delay?: number
  speed?: number
}) {
  const [displayedText, setDisplayedText] = useState('')
  const [started, setStarted] = useState(false)
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 })

  useEffect(() => {
    if (isInView && !started) {
      const timeout = setTimeout(() => setStarted(true), delay * 1000)
      return () => clearTimeout(timeout)
    }
  }, [isInView, delay, started])

  useEffect(() => {
    if (!started) return
    let i = 0
    const interval = setInterval(() => {
      if (i <= text.length) {
        setDisplayedText(text.slice(0, i))
        i++
      } else {
        clearInterval(interval)
      }
    }, speed * 1000)
    return () => clearInterval(interval)
  }, [started, text, speed])

  return (
    <span ref={ref} className={className}>
      {displayedText}
      {started && displayedText.length < text.length && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          style={{ display: 'inline-block', width: '2px', height: '1em', background: 'var(--orange)', marginLeft: '2px', verticalAlign: 'text-bottom' }}
        />
      )}
    </span>
  )
}

/* ===== Animation Variants ===== */
export const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const }
  })
}

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    transition: { duration: 0.6, delay }
  })
}

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const }
  })
}

export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 }
  }
}

export const staggerItem = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }
  }
}

export const slideFromLeft = {
  hidden: { opacity: 0, x: -60 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const }
  })
}
