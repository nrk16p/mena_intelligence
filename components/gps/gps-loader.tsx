"use client"

// Loader ของหน้า GPS — โครงร่างหน้าเดียวกับผลลัพธ์จริง ผู้ใช้จึงเห็นว่ากำลังจะได้อะไร
// แทนที่จะเห็นหน้าว่างระหว่างรอ

const CARD = "rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27]"

export function Skel({
  className = "",
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return <div className={`gps-skel ${className}`} style={style} />
}

export function GpsSpinner({ size = 12 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-[-1px]"
      style={{ width: size, height: size }}
    />
  )
}

/** แถบ chip ตัวกรอง ระหว่างรอ options */
export function ChipRowSkeleton({ label }: { label: string }) {
  // ความกว้างไม่เท่ากันเพื่อให้ดูเหมือนรายชื่อจริง ไม่ใช่บล็อกซ้ำ ๆ
  const widths = [52, 78, 64, 92, 58, 70, 84]
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-white/8">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      {widths.map((w, i) => (
        <Skel key={i} className="h-5 rounded-full" style={{ width: w }} />
      ))}
      <span className="sr-only">กำลังโหลดตัวกรอง {label}</span>
    </div>
  )
}

/** KPI + สรุป fleet + ตาราง — โครงเดียวกับผลลัพธ์จริง */
export function ResultsSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="gps-fade-in flex flex-col gap-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">กำลังโหลดข้อมูลระยะทาง GPS…</span>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`${CARD} px-4 py-3`}>
            <Skel className="h-2.5 w-20" />
            <Skel className="mt-2.5 h-6 w-24" />
          </div>
        ))}
      </div>

      {/* Fleet breakdown */}
      <div className={CARD}>
        <div className="border-b border-gray-100 px-5 py-3.5 dark:border-white/8">
          <Skel className="h-3.5 w-28" />
          <Skel className="mt-2 h-2.5 w-56" />
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 p-4 xl:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skel className="h-3 w-28 shrink-0" />
              <div className="hidden h-5 flex-1 sm:block">
                <Skel
                  className="h-full rounded-md"
                  // แต่ละแถวยาวไม่เท่ากัน ให้ดูเหมือนกราฟจริงมากกว่าบล็อกเรียงกัน
                  style={{ width: `${92 - i * 9}%` }}
                />
              </div>
              <Skel className="ml-auto h-3 w-20 shrink-0" />
              <Skel className="h-3 w-12 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* Datatable */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5 dark:border-white/8">
          <div className="flex items-center gap-2.5">
            <Skel className="h-7 w-7 rounded-xl" />
            <div>
              <Skel className="h-3.5 w-16" />
              <Skel className="mt-2 h-2.5 w-32" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skel className="h-7 w-50 rounded-xl" />
            <Skel className="h-7 w-12 rounded-xl" />
          </div>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-[#12151d]">
              {Array.from({ length: 10 }).map((_, i) => (
                <th key={i} className="border-b border-gray-100 px-3 py-2.5 dark:border-white/8">
                  <Skel className={`h-2.5 ${i === 0 ? "w-4" : "w-full"}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r} className="border-t border-gray-50 dark:border-white/5">
                {Array.from({ length: 10 }).map((_, c) => (
                  <td key={c} className="px-3 py-2.5">
                    <Skel className={`h-3 ${c === 0 ? "w-4" : c === 9 ? "w-24" : "w-full"}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3 dark:border-white/8 dark:bg-white/3">
          <Skel className="h-3 w-24" />
          <Skel className="h-3 w-28" />
        </div>
      </div>
    </div>
  )
}
