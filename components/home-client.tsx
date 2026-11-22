"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { ArrowUpRight, Pin, Search } from "lucide-react"
import { TypeTag } from "./type-tag"
import { openPalette, usePins } from "./nav-prefs"
import { ALL_PAGES, PAGE_TYPES, visibleSections, type NavPage } from "@/lib/nav"

// ── Weather ────────────────────────────────────────────────────
type Weather = { temp: number; code: number; humidity: number; wind: number }

function weatherIcon(code: number) {
  if (code === 0) return "☀️"
  if (code <= 2)  return "⛅"
  if (code === 3) return "☁️"
  if (code <= 48) return "🌫️"
  if (code <= 67) return "🌧️"
  if (code <= 77) return "❄️"
  if (code <= 82) return "🌦️"
  if (code <= 99) return "⛈️"
  return "🌤️"
}

function weatherDesc(code: number) {
  if (code === 0) return "แดดจัด"
  if (code <= 2)  return "มีเมฆบางส่วน"
  if (code === 3) return "มืดครึ้ม"
  if (code <= 48) return "หมอก"
  if (code <= 55) return "ฝนปรอยๆ"
  if (code <= 67) return "ฝนตก"
  if (code <= 77) return "หิมะ"
  if (code <= 82) return "ฝนตกหนัก"
  if (code <= 99) return "พายุฝนฟ้าคะนอง"
  return "สภาพอากาศไม่แน่นอน"
}

function greeting(h: number) {
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  if (h < 21) return "Good evening"
  return "Good night"
}

// ── Top bar ────────────────────────────────────────────────────
function TopBar() {
  const { data: session } = useSession()
  const [now, setNow]         = useState(new Date())
  const [weather, setWeather] = useState<Weather | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=13.7563&longitude=100.5018&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&timezone=Asia%2FBangkok")
      .then(r => r.json())
      .then(d => setWeather({
        temp:     Math.round(d.current.temperature_2m),
        code:     d.current.weather_code,
        humidity: d.current.relative_humidity_2m,
        wind:     Math.round(d.current.wind_speed_10m),
      }))
      .catch(() => {})
  }, [])

  const name = session?.user?.name?.split(" ")[0] ?? "there"
  const h    = now.getHours()
  const time = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
  const date = now.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="text-[13px] text-gray-400 dark:text-gray-500">{greeting(h)}, <span className="text-gray-700 dark:text-gray-300 font-medium">{name}</span></p>
        <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-0.5">{date} · {time}</p>
      </div>
      {weather && (
        <div className="flex items-center gap-2 rounded-full border border-gray-200 dark:border-white/8 bg-white dark:bg-white/4 px-3.5 py-1.5">
          <span className="text-base leading-none">{weatherIcon(weather.code)}</span>
          <span className="text-[13px] font-semibold text-gray-800 dark:text-white">{weather.temp}°C</span>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">{weatherDesc(weather.code)}</span>
          <span className="text-[11px] text-gray-300 dark:text-gray-600">·</span>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">💧{weather.humidity}%</span>
        </div>
      )}
    </div>
  )
}

// ── Pages this user may open, by department ───────────────────

function PageCard({ page, pinned, onTogglePin }: { page: NavPage; pinned: boolean; onTogglePin: (h: string) => void }) {
  const Icon = page.icon
  return (
    <div className="group relative">
      <Link
        href={page.href}
        className="flex h-full min-h-[64px] items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 pr-11
          transition-colors hover:border-emerald-300 dark:border-white/8 dark:bg-[#0d0f18] dark:hover:border-emerald-700"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500 dark:bg-white/5 dark:text-gray-400">
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-snug text-gray-900 dark:text-white">{page.label}</span>
          <TypeTag type={page.type} className="mt-1" />
        </span>
        <ArrowUpRight size={14} aria-hidden="true" className="shrink-0 text-gray-300 transition-colors group-hover:text-gray-700 dark:text-gray-600 dark:group-hover:text-white" />
      </Link>
      <button
        type="button"
        onClick={() => onTogglePin(page.href)}
        aria-label={pinned ? `เลิกปักหมุด ${page.label}` : `ปักหมุด ${page.label}`}
        title={pinned ? "เลิกปักหมุด" : "ปักหมุดไว้บนเมนู"}
        className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md transition-opacity
          hover:bg-gray-100 dark:hover:bg-white/10 focus-visible:opacity-100
          ${pinned ? "text-emerald-600 opacity-100 dark:text-emerald-400" : "text-gray-400 opacity-0 group-hover:opacity-100"}`}
      >
        <Pin size={13} />
      </button>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function HomeClient({ allowedGroups }: { allowedGroups: string[] }) {
  const sections = useMemo(() => visibleSections(allowedGroups), [allowedGroups])
  const { pins, toggle, isPinned } = usePins()
  const allowed = new Set(sections.flatMap((s) => s.pages.map((p) => p.href)))
  const pinned = pins.map((h) => ALL_PAGES.find((p) => p.href === h)).filter((p): p is NavPage => !!p && allowed.has(p.href))
  const total = allowed.size

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-20">
      <TopBar />

      <button
        type="button"
        onClick={openPalette}
        className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 text-left text-[14px] text-gray-500
          hover:border-gray-300 dark:border-white/10 dark:bg-[#0d0f18] dark:text-gray-400"
      >
        <Search size={16} aria-hidden="true" />
        <span className="flex-1">ค้นหาหน้า · {total} หน้าที่คุณเข้าได้</span>
        <kbd className="rounded border border-gray-200 px-1.5 text-[12px] dark:border-white/10">⌘K</kbd>
      </button>

      {pinned.length > 0 && (
        <section aria-labelledby="pinned-h" className="space-y-3">
          <h2 id="pinned-h" className="text-[15px] font-semibold text-gray-900 dark:text-white">ปักหมุด</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pinned.map((p) => <PageCard key={p.href} page={p} pinned onTogglePin={toggle} />)}
          </div>
        </section>
      )}

      {sections.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-[14px] text-gray-600 dark:border-white/15 dark:text-gray-400">
          ยังไม่มีหน้าที่คุณเข้าได้ แจ้งผู้ดูแลระบบให้เพิ่มสิทธิ์
        </p>
      )}

      {sections.map((s) => {
        const Icon = s.icon
        const ordered = PAGE_TYPES.flatMap((t) => s.pages.filter((p) => p.type === t))
        return (
          <section key={s.key} aria-labelledby={`sec-${s.key}`} className="space-y-3">
            <div className="flex items-center gap-2.5">
              <Icon size={16} aria-hidden="true" className="text-gray-500 dark:text-gray-400" />
              <h2 id={`sec-${s.key}`} className="text-[15px] font-semibold text-gray-900 dark:text-white">{s.label}</h2>
              <span className="text-[13px] text-gray-500 dark:text-gray-400">{s.pages.length} หน้า</span>
              <div className="h-px flex-1 bg-gray-200 dark:bg-white/8" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ordered.map((p) => <PageCard key={p.href} page={p} pinned={isPinned(p.href)} onTogglePin={toggle} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}
