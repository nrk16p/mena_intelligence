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
  Boxes,
  Activity,
  Layers,
} from "lucide-react"

type Weather = { temp: number; code: number; humidity: number; wind: number }

function weatherIcon(code: number): string {
  if (code === 0)  return "☀️"
  if (code <= 2)   return "⛅"
  if (code === 3)  return "☁️"
  if (code <= 48)  return "🌫️"
  if (code <= 67)  return "🌧️"
  if (code <= 77)  return "❄️"
  if (code <= 82)  return "🌦️"
  if (code <= 99)  return "⛈️"
  return "🌤️"
}

function weatherDesc(code: number): string {
  if (code === 0)  return "แดดจัด"
  if (code <= 2)   return "มีเมฆบางส่วน"
  if (code === 3)  return "มืดครึ้ม"
  if (code <= 48)  return "หมอก"
  if (code <= 55)  return "ฝนปรอยๆ"
  if (code <= 67)  return "ฝนตก"
  if (code <= 77)  return "หิมะ"
  if (code <= 82)  return "ฝนตกหนัก"
  if (code <= 99)  return "พายุฝนฟ้าคะนอง"
  return "สภาพอากาศไม่แน่นอน"
}

function greeting(hour: number): string {
  if (hour < 12) return "อรุณสวัสดิ์"
  if (hour < 17) return "สวัสดีตอนบ่าย"
  if (hour < 21) return "สวัสดีตอนเย็น"
  return "ราตรีสวัสดิ์"
}

function WelcomeCard() {
  const { data: session } = useSession()
  const [now, setNow] = useState(new Date())
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

  const firstName = session?.user?.name?.split(" ")[0] ?? "คุณ"
  const hour = now.getHours()
  const dateStr = now.toLocaleDateString("th-TH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
  const timeStr = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#161b27] px-6 py-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{dateStr}</p>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {greeting(hour)}, <span className="text-emerald-500">{firstName}</span> 👋
        </h2>
        <p className="text-2xl font-mono font-semibold text-gray-700 dark:text-gray-300 mt-1 tracking-tight">
          {timeStr}
        </p>
      </div>
      {weather ? (
        <div className="flex items-center gap-4 rounded-xl border border-gray-100 dark:border-white/6 bg-gray-50 dark:bg-white/3 px-5 py-3">
          <span className="text-4xl">{weatherIcon(weather.code)}</span>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{weather.temp}°C</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{weatherDesc(weather.code)}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-1">
              💧 {weather.humidity}% &nbsp;·&nbsp; 💨 {weather.wind} km/h &nbsp;·&nbsp; กรุงเทพฯ
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 dark:border-white/6 bg-gray-50 dark:bg-white/3 px-5 py-3 w-40 h-16 animate-pulse" />
      )}
    </div>
  )
}

type Module = {
  href: string
  label: string
  description: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  tag: string
  tagColor: string
  status: "active" | "coming-soon"
}

type ModuleGroup = {
  group: string
  accent: string
  modules: Module[]
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    group: "Vehicle",
    accent: "bg-blue-500",
    modules: [
      {
        href: "/truck-distance",
        label: "Truck Distance",
        description: "Analyze distance trends per truck, monitor utilization and performance over time.",
        icon: Truck,
        iconBg: "bg-blue-50 dark:bg-blue-950/40",
        iconColor: "text-blue-600 dark:text-blue-400",
        tag: "Analytics",
        tagColor: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
        status: "active",
      },
    ],
  },
  {
    group: "Fuel",
    accent: "bg-orange-500",
    modules: [
      {
        href: "/fuel",
        label: "Fuel Management",
        description: "Track fuel consumption, costs, and efficiency across the entire fleet.",
        icon: Fuel,
        iconBg: "bg-orange-50 dark:bg-orange-950/40",
        iconColor: "text-orange-600 dark:text-orange-400",
        tag: "Monitoring",
        tagColor: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
        status: "active",
      },
    ],
  },
  {
    group: "Ops",
    accent: "bg-emerald-500",
    modules: [
      {
        href: "/repair-cost",
        label: "Repair Cost",
        description: "Upload LDT & GPM files to allocate repair expenses with fleet balancing logic.",
        icon: Calculator,
        iconBg: "bg-emerald-50 dark:bg-emerald-950/40",
        iconColor: "text-emerald-600 dark:text-emerald-400",
        tag: "Allocation",
        tagColor: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
        status: "active",
      },
    ],
  },
  {
    group: "Mixer",
    accent: "bg-amber-500",
    modules: [
      {
        href: "/asia-incentive",
        label: "Asia Incentive",
        description: "Track driver incentives — working days, trips, and cubic meters for KA Asia fleet.",
        icon: Trophy,
        iconBg: "bg-amber-50 dark:bg-amber-950/40",
        iconColor: "text-amber-600 dark:text-amber-400",
        tag: "KA Asia",
        tagColor: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
        status: "active",
      },
    ],
  },
  {
    group: "Procurement",
    accent: "bg-violet-500",
    modules: [
      {
        href: "/stock-budget-ladkrabang",
        label: "Stock Budget",
        description: "Monitor and compare stock budget vs actual cost for Ladkrabang warehouse.",
        icon: PackageSearch,
        iconBg: "bg-violet-50 dark:bg-violet-950/40",
        iconColor: "text-violet-600 dark:text-violet-400",
        tag: "Budget Control",
        tagColor: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
        status: "active",
      },
      {
        href: "/stock-result-summary",
        label: "Stock Summary",
        description: "Summarize stock movement results, variance reporting, and cost breakdowns.",
        icon: ClipboardList,
        iconBg: "bg-pink-50 dark:bg-pink-950/40",
        iconColor: "text-pink-600 dark:text-pink-400",
        tag: "Reporting",
        tagColor: "bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400",
        status: "active",
      },
      {
        href: "#",
        label: "Fleet Analytics",
        description: "Advanced cost-per-km, anomaly detection and fleet optimization insights.",
        icon: BarChart3,
        iconBg: "bg-gray-100 dark:bg-white/5",
        iconColor: "text-gray-400",
        tag: "Soon",
        tagColor: "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-500",
        status: "coming-soon",
      },
    ],
  },
]

const STATS = [
  { icon: Layers, label: "Modules", value: "6" },
  { icon: Boxes, label: "Stock Records", value: "435K+" },
  { icon: Activity, label: "Data Status", value: "Live" },
]

export default function HomeClient() {
  return (
    <div className="min-h-full max-w-5xl mx-auto space-y-8 pb-16">
      <WelcomeCard />

      <div className="pt-4 space-y-6">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Internal Platform · Mena Transport
          </span>
          <h1 className="text-[2.5rem] font-bold tracking-tight leading-[1.15] text-gray-950 dark:text-white">
            Operational<br />
            <span className="text-gray-400 dark:text-gray-500">Intelligence</span>
          </h1>
          <p className="text-[15px] text-gray-500 dark:text-gray-400 max-w-lg leading-relaxed">
            Fleet analytics, driver incentives, and stock control — all in one place for Mena Transport operations.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {STATS.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 px-4 py-2.5"
            >
              <Icon size={14} className="text-gray-400 dark:text-gray-500" />
              <span className="text-[13px] font-semibold text-gray-900 dark:text-white">{value}</span>
              <span className="text-[12px] text-gray-400 dark:text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-10">
        {MODULE_GROUPS.map(({ group, accent, modules }) => (
          <section key={group}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-2.5 w-2.5 rounded-full ${accent}`} />
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                {group}
              </h2>
              <div className="flex-1 h-px bg-gray-100 dark:bg-white/6" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((mod) => {
                const Icon = mod.icon
                const isComingSoon = mod.status === "coming-soon"
                const card = (
                  <div
                    className={`
                      group relative flex flex-col rounded-2xl border p-5 transition-all duration-200
                      ${isComingSoon
                        ? "border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/2 opacity-60 cursor-default"
                        : "border-gray-200 dark:border-white/8 bg-white dark:bg-[#161b27] hover:border-gray-300 dark:hover:border-white/15 hover:shadow-lg hover:shadow-gray-100 dark:hover:shadow-black/30 hover:-translate-y-0.5 cursor-pointer"
                      }
                    `}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${mod.iconBg}`}>
                        <Icon size={18} className={mod.iconColor} />
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${mod.tagColor}`}>
                        {mod.tag}
                      </span>
                    </div>
                    <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white mb-1.5">{mod.label}</h3>
                    <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed flex-1">{mod.description}</p>
                    {!isComingSoon && (
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">Live</span>
                        </div>
                        <div className="flex items-center gap-1 text-[12px] font-medium text-gray-400 dark:text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                          Open
                          <ArrowUpRight size={13} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </div>
                      </div>
                    )}
                    {isComingSoon && (
                      <div className="mt-4">
                        <span className="text-[11px] text-gray-400 dark:text-gray-600">Coming soon</span>
                      </div>
                    )}
                  </div>
                )
                return isComingSoon ? (
                  <div key={mod.label}>{card}</div>
                ) : (
                  <Link key={mod.href} href={mod.href} className="block">{card}</Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
