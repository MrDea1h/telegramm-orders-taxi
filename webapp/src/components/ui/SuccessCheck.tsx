import { motion } from 'framer-motion'

// Placeholder for the Lottie success illustration described in the spec
// (checkmark / car animation). Built as an animated SVG so the prototype
// ships with zero binary assets — swap for a Lottie JSON in production.
export function SuccessCheck({ size = 96 }: { size?: number }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      initial="hidden"
      animate="visible"
    >
      <motion.circle
        cx="50"
        cy="50"
        r="46"
        fill="none"
        stroke="url(#successGrad)"
        strokeWidth="6"
        strokeLinecap="round"
        variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
      <motion.path
        d="M30 52 L44 66 L72 36"
        fill="none"
        stroke="url(#successGrad)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{ hidden: { pathLength: 0, opacity: 0 }, visible: { pathLength: 1, opacity: 1 } }}
        transition={{ duration: 0.4, delay: 0.4, ease: 'easeOut' }}
      />
      <defs>
        <linearGradient id="successGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>
    </motion.svg>
  )
}
