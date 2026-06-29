"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import {
  BarChart3,
  Calculator,
  Fuel,
  Truck,
  Trophy,
  PackageSearch,
  ClipboardList,
  ArrowUpRight,
  Wrench,
} from "lucide-react"

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

// ── Module definitions ─────────────────────────────────────────
type Mod = {
  href: string
  label: string
  description: string
  icon: React.ElementType
  status: "active" | "soon"
}

type Group = {
  key: string
  label: string
  color: string        // Tailwind color name for accent
  borderColor: string
  iconBg: string
  iconColor: string
  tagBg: string
  mods: Mod[]
}

const GROUPS: Group[] = [
  {
    key: "vehicle",
    label: "Vehicle",
    color: "blue",
    borderColor: "border-blue-500",
    iconBg: "bg-blue-50 dark:bg-blue-950/50",
    iconColor: "text-blue-600 dark:text-blue-400",
    tagBg: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
    mods: [
      { href: "/truck-distance", label: "Truck Distance", description: "Distance trends per truck, utilization & performance.", icon: Truck, status: "active" },
    ],
  },
  {
    key: "fuel",
    label: "Fuel",
    color: "orange",
    borderColor: "border-orange-500",
    iconBg: "bg-orange-50 dark:bg-orange-950/50",
    iconColor: "text-orange-600 dark:text-orange-400",
    tagBg: "bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400",
    mods: [
      { href: "/fuel", label: "Fuel Management", description: "Track consumption, cost, and efficiency across the fleet.", icon: Fuel, status: "active" },
    ],
  },
  {
    key: "ops",
    label: "Ops",
    color: "emerald",
    borderColor: "border-emerald-500",
    iconBg: "bg-emerald-50 dark:bg-emerald-950/50",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    tagBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    mods: [
      { href: "/repair-cost", label: "Repair Cost", description: "Allocate repair expenses with fleet balancing logic.", icon: Calculator, status: "active" },
    ],
  },
  {
    key: "mixer",
    label: "Mixer",
    color: "amber",
    borderColor: "border-amber-500",
    iconBg: "bg-amber-50 dark:bg-amber-950/50",
    iconColor: "text-amber-600 dark:text-amber-400",
    tagBg: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    mods: [
      { href: "/asia-incentive", label: "Asia Incentive", description: "Driver incentives — trips, working days & cubic meters.", icon: Trophy, status: "active" },
    ],
  },
  {
    key: "procurement",
    label: "Procurement",
    color: "violet",
    borderColor: "border-violet-500",
    iconBg: "bg-violet-50 dark:bg-violet-950/50",
    iconColor: "text-violet-600 dark:text-violet-400",
    tagBg: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
    mods: [
      { href: "/stock-budget-ladkrabang", label: "Stock Budget", description: "Budget vs actual cost for Ladkrabang warehouse.", icon: PackageSearch, status: "active" },
      { href: "/stock-result-summary", label: "Stock Summary", description: "Variance reporting and cost breakdowns.", icon: ClipboardList, status: "active" },
      { href: "#", label: "Fleet Analytics", description: "Cost-per-km, anomaly detection & optimization.", icon: BarChart3, status: "soon" },
    ],
  },
  {
    key: "maintenance",
    label: "Maintenance",
    color: "rose",
    borderColor: "border-rose-500",
    iconBg: "bg-rose-50 dark:bg-rose-950/50",
    iconColor: "text-rose-600 dark:text-rose-400",
    tagBg: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400",
    mods: [
      { href: "/repair-daily", label: "Repair Daily Log", description: "Daily maintenance records for VS and Garage teams.", icon: Wrench, status: "active" },
    ],
  },
]

// ── Module card ────────────────────────────────────────────────
function ModCard({ mod, group }: { mod: Mod; group: Group }) {
  const Icon = mod.icon
  const isSoon = mod.status === "soon"

  const inner = (
    <div className={`
      group relative flex flex-col h-full rounded-2xl border bg-white dark:bg-[#13151f]
      overflow-hidden transition-all duration-200
      ${isSoon
        ? "border-gray-100 dark:border-white/5 opacity-50 cursor-default"
        : `border-gray-200 dark:border-white/8 hover:border-gray-300 dark:hover:border-white/16
           hover:shadow-xl hover:shadow-gray-200/60 dark:hover:shadow-black/40 hover:-translate-y-1 cursor-pointer`
      }
    `}>
      {/* Color accent top bar */}
      <div className={`h-0.5 w-full bg-gradient-to-r ${
        group.color === "blue"    ? "from-blue-400 to-blue-600" :
        group.color === "orange"  ? "from-orange-400 to-orange-600" :
        group.color === "emerald" ? "from-emerald-400 to-emerald-600" :
        group.color === "amber"   ? "from-amber-400 to-amber-600" :
        group.color === "violet"  ? "from-violet-400 to-violet-600" :
        group.color === "rose"    ? "from-rose-400 to-rose-600" :
        "from-gray-300 to-gray-400"
      }`} />

      <div className="flex flex-col flex-1 p-5">
        {/* Icon + status */}
        <div className="flex items-start justify-between mb-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${group.iconBg}`}>
            <Icon size={18} className={group.iconColor} />
          </div>
          {isSoon ? (
            <span className="rounded-full bg-gray-100 dark:bg-white/6 px-2.5 py-0.5 text-[10px] font-medium text-gray-400">
              Soon
            </span>
          ) : (
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${group.tagBg}`}>
              {group.label}
            </span>
          )}
        </div>

        <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white mb-1.5 leading-snug">
          {mod.label}
        </h3>
        <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed flex-1">
          {mod.description}
        </p>

        {!isSoon && (
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] text-gray-400 dark:text-gray-500">Live</span>
            </div>
            <span className="flex items-center gap-0.5 text-[12px] font-medium text-gray-300 dark:text-gray-600 group-hover:text-gray-800 dark:group-hover:text-white transition-colors">
              Open <ArrowUpRight size={12} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </div>
        )}
      </div>
    </div>
  )

  return isSoon ? <div>{inner}</div> : <Link href={mod.href} className="flex">{inner}</Link>
}

// ── Page ───────────────────────────────────────────────────────
export default function HomeClient() {
  return (
    <div className="max-w-5xl mx-auto pb-20 space-y-10">

      {/* Top bar */}
      <TopBar />

      {/* Hero */}
      <div className="relative rounded-3xl overflow-hidden border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0d0f18] px-8 py-10">
        {/* Decorative gradient blob */}
        <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-emerald-400/10 dark:bg-emerald-500/8 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-blue-400/8 dark:bg-blue-500/6 blur-3xl" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/4 px-3.5 py-1.5 mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide">
              Internal Platform · Mena Transport
            </span>
          </div>

          <h1 className="text-5xl font-bold tracking-tight leading-[1.1] text-gray-950 dark:text-white mb-4">
            Operational
            <br />
            <span className="bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent">
              Intelligence
            </span>
          </h1>

          <p className="text-[15px] text-gray-500 dark:text-gray-400 max-w-md leading-relaxed mb-8">
            Fleet analytics, driver incentives, procurement, and maintenance — unified for Mena Transport operations.
          </p>

          {/* Stats */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Modules", value: "6" },
              { label: "Stock Records", value: "435K+" },
              { label: "Data", value: "Live" },
            ].map(s => (
              <div key={s.label} className="flex items-baseline gap-2 rounded-xl border border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-white/3 px-4 py-2">
                <span className="text-[15px] font-bold text-gray-900 dark:text-white">{s.value}</span>
                <span className="text-[12px] text-gray-400 dark:text-gray-500">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Module groups */}
      <div className="space-y-8">
        {GROUPS.map(group => (
          <section key={group.key}>
            {/* Group header */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-3 w-3 rounded-full border-2 ${group.borderColor}`} />
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                {group.label}
              </span>
              <div className="flex-1 h-px bg-gray-100 dark:bg-white/6" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.mods.map(mod => (
                <ModCard key={mod.href} mod={mod} group={group} />
              ))}
            </div>
          </section>
        ))}
      </div>

    </div>
  )
}
