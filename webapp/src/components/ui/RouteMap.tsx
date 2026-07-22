import { motion } from 'framer-motion'

// Stylized abstract map placeholder — the real app renders Yandex Maps JS API /
// MapLibre GL here. Kept dependency-free so the design prototype has no API-key
// requirement and works fully offline.
export function RouteMap({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-[18px] bg-[linear-gradient(160deg,#efeaff_0%,#e3f0ff_100%)] dark:bg-[linear-gradient(160deg,#211f36_0%,#182238_100%)] ${compact ? 'h-28' : 'h-44'}`}
    >
      <svg className="absolute inset-0 h-full w-full opacity-40" preserveAspectRatio="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={`${(i + 1) * 15}%`} x2="100%" y2={`${(i + 1) * 15}%`} stroke="currentColor" className="text-primary/20" strokeWidth="1" />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={`v${i}`} x1={`${(i + 1) * 12}%`} y1="0" x2={`${(i + 1) * 12}%`} y2="100%" stroke="currentColor" className="text-secondary/20" strokeWidth="1" />
        ))}
      </svg>

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 300 140" preserveAspectRatio="none">
        <motion.path
          d="M 30 110 C 90 110, 90 40, 150 60 S 240 30, 270 30"
          fill="none"
          stroke="url(#routeGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="1 10"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
        <defs>
          <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute" style={{ left: '10%', bottom: '18%' }}>
        <div className="h-3 w-3 rounded-full bg-primary ring-4 ring-primary/20" />
      </div>
      <div className="absolute" style={{ right: '10%', top: '18%' }}>
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-white shadow-md">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 2l7 19-7-4-7 4 7-19z" fill="currentColor" />
          </svg>
        </div>
      </div>
    </div>
  )
}
