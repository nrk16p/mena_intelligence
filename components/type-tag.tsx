import type { PageType } from "@/lib/nav"
import { TYPE_HINT } from "@/lib/nav"

const STYLE: Record<PageType, string> = {
  ติดตาม: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  KPI: "bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
  สาเหตุ: "bg-violet-50 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
  ค้นหา: "bg-gray-100 text-gray-700 dark:bg-white/8 dark:text-gray-300",
  เครื่องมือ: "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
}

/** Small label naming a page's analysis type; the hint shows on hover. */
export function TypeTag({ type, className = "" }: { type: PageType; className?: string }) {
  return (
    <span
      title={TYPE_HINT[type]}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-1.5 py-px text-[11px] font-semibold ${STYLE[type]} ${className}`}
    >
      {type}
    </span>
  )
}
