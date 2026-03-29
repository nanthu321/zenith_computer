import { useEffect, useRef } from 'react'

/**
 * MouseGlow — Simple, elegant background animation for Zenith
 *
 * Three layers (all rendered inline — no portals, no stacking hacks):
 *   1. Soft floating gradient orbs (pure CSS animation) — Zenith logo colors
 *   2. Autonomous floating glow (randomly drifts around the viewport)
 *   3. Tiny floating dots that drift upward (lightweight canvas, ~50-80 dots)
 *      Each dot randomly picks one of the 4 Zenith logo colors
 */

/* ── Zenith Brand Colors ── */
const ZENITH_COLORS = [
  { r: 228, g: 37,  b: 39  },  // #E42527 — Red
  { r: 249, g: 178, b: 28  },  // #F9B21C — Gold
  { r: 10,  g: 153, b: 73  },  // #0A9949 — Green
  { r: 34,  g: 109, b: 180 },  // #226DB4 — Blue
]

export default function MouseGlow() {
  const glowRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const particlesRef = useRef([])

  /* ── Random glow drift state ── */
  const glowStateRef = useRef({
    x: 0, y: 0,         // current position (%)
    targetX: 0, targetY: 0, // where it's drifting toward (%)
    timer: 0,            // countdown to pick new target
  })

  useEffect(() => {
    const glow = glowRef.current
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const isDark = () =>
      document.documentElement.getAttribute('data-theme') !== 'light'

    /* ── Resize canvas ── */
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    /* ── Create floating dots — each gets a random Zenith color ── */
    const createParticles = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const count = Math.min(Math.floor((w * h) / 25000), 80)
      const arr = []
      for (let i = 0; i < count; i++) {
        const color = ZENITH_COLORS[Math.floor(Math.random() * ZENITH_COLORS.length)]
        arr.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: 1 + Math.random() * 2,
          speedY: -(0.15 + Math.random() * 0.35),
          speedX: (Math.random() - 0.5) * 0.3,
          opacity: 0.15 + Math.random() * 0.35,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: 0.005 + Math.random() * 0.015,
          color,
        })
      }
      particlesRef.current = arr
    }
    createParticles()

    /* ── Initialize glow at a random position ── */
    const gs = glowStateRef.current
    gs.x = 20 + Math.random() * 60       // start 20-80% across
    gs.y = 20 + Math.random() * 60       // start 20-80% down
    gs.targetX = 15 + Math.random() * 70
    gs.targetY = 15 + Math.random() * 70
    gs.timer = 0

    /* ── Pick a new random target for the glow ── */
    const pickNewTarget = () => {
      gs.targetX = 10 + Math.random() * 80   // 10% to 90% of viewport
      gs.targetY = 10 + Math.random() * 80
      gs.timer = 180 + Math.floor(Math.random() * 240)  // 3-7 seconds at 60fps
    }
    pickNewTarget()

    /* ── Animation loop ── */
    const animate = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const dark = isDark()

      /* ── Update floating glow position ── */
      gs.timer--
      if (gs.timer <= 0) pickNewTarget()

      // Smooth easing toward target (lerp factor 0.008 = very smooth/slow drift)
      gs.x += (gs.targetX - gs.x) * 0.008
      gs.y += (gs.targetY - gs.y) * 0.008

      if (glow) {
        glow.style.left = gs.x + '%'
        glow.style.top = gs.y + '%'
      }

      /* ── Canvas particles ── */
      ctx.clearRect(0, 0, w, h)

      const particles = particlesRef.current

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        p.x += p.speedX
        p.y += p.speedY
        p.pulse += p.pulseSpeed

        /* Wrap around edges */
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w }
        if (p.x < -10) p.x = w + 10
        if (p.x > w + 10) p.x = -10

        /* Pulsing alpha */
        const baseAlpha = dark ? p.opacity : p.opacity * 0.9
        const alpha = baseAlpha * (0.6 + 0.4 * Math.sin(p.pulse))

        /* Draw with the particle's Zenith color */
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${alpha})`
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)

    /* ── Listeners (resize only — no mouse tracking) ── */
    let resizeTimer
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => { resize(); createParticles() }, 150)
    }
    window.addEventListener('resize', onResize, { passive: true })

    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <>
      {/* Layer 1: Soft floating gradient orbs (pure CSS) — Zenith colors */}
      <div className="bg-animation" aria-hidden="true">
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-orb bg-orb-3" />
        <div className="bg-orb bg-orb-4" />
        <div className="bg-grid-overlay" />
      </div>

      {/* Layer 2: Autonomous floating glow (drifts randomly) */}
      <div
        ref={glowRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          width: 200,
          height: 200,
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: 0,
          opacity: 0.7,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(circle, var(--brand-glow) 0%, transparent 70%)',
          transition: 'opacity 0.4s ease',
          willChange: 'left, top',
        }}
      />

      {/* Layer 3: Floating particle dots (lightweight canvas) — Zenith 4 colors */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
    </>
  )
}
