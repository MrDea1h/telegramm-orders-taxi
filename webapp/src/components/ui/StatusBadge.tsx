import { statusMeta } from '../../data/statusMeta'
import type { OrderStatus } from '../../data/types'

export function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = statusMeta[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium dark:brightness-125"
      style={{ color: meta.color, background: meta.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  )
}
