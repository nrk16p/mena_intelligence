const COLLECTION_LABELS: Record<string, string> = {
  distance:   "ระยะทาง",
  drivinglog: "ระยะทาง",
}

export function labelFor(name: string) {
  return COLLECTION_LABELS[name.toLowerCase()] ?? name
}

/** สีป้ายประจำผู้ให้บริการ GPS — ใช้ร่วมกันทุกหน้าที่โชว์ชื่อ vendor */
export const SOURCE_COLOR: Record<string, string> = {
  terminus:     "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  cartrack:     "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  songdee:      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  nostra:       "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  thaitracking: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  hino:         "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  dtc:          "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  besttech:     "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
}

export function sourceColor(source: string) {
  return SOURCE_COLOR[source] ?? "bg-gray-100 text-gray-600 dark:bg-white/8 dark:text-gray-300"
}
