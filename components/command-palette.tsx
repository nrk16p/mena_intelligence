"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { CornerDownLeft, Search } from "lucide-react"
import { TypeTag } from "./type-tag"
import { OPEN_PALETTE_EVENT } from "./nav-prefs"
import { searchPages, sectionOf, visibleSections } from "@/lib/nav"

/** ⌘K / Ctrl+K: jump to any page the user may open, by Thai name, old English name or path. */
export function CommandPalette({ allowedGroups }: { allowedGroups: string[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const pages = useMemo(() => visibleSections(allowedGroups).flatMap((s) => s.pages), [allowedGroups])
  const results = useMemo(() => searchPages(query, pages).slice(0, 12), [query, pages])

  useEffect(() => {
    const show = () => { setQuery(""); setIndex(0); setOpen(true) }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        if (dialogRef.current?.open) setOpen(false)
        else show()
      }
    }
    const onOpen = () => show()
    window.addEventListener("keydown", onKey)
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
    }
  }, [])

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    if (!open && d.open) d.close()
  }, [open])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === "Enter" && results[index]) { e.preventDefault(); go(results[index].href) }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="ค้นหาหน้า"
      onClose={() => setOpen(false)}
      onClick={(e) => { if (e.target === dialogRef.current) setOpen(false) }}
      className="m-0 mx-auto mt-[12vh] w-[min(600px,calc(100vw-32px))] rounded-2xl border border-gray-200 bg-white p-0 shadow-2xl
        backdrop:bg-black/40 dark:border-white/10 dark:bg-[#14161f]"
    >
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 dark:border-white/8">
        <Search size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIndex(0) }}
          onKeyDown={onInputKey}
          placeholder="พิมพ์ชื่อหน้า เช่น ซ่อมซ้ำ, ราคากลาง, GPS"
          aria-label="ค้นหาหน้า"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={results[index] ? `palette-${index}` : undefined}
          className="h-12 flex-1 bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
        />
        <kbd className="rounded border border-gray-200 px-1.5 text-[11px] text-gray-500 dark:border-white/10">Esc</kbd>
      </div>
      <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
        {results.length === 0 && (
          <li className="px-3 py-6 text-center text-[13px] text-gray-500">ไม่พบหน้าที่ตรงกับ “{query}” หรือคุณยังไม่มีสิทธิ์</li>
        )}
        {results.map((p, i) => (
          <li
            key={p.href}
            id={`palette-${i}`}
            role="option"
            aria-selected={i === index}
            onMouseEnter={() => setIndex(i)}
            onClick={() => go(p.href)}
            className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ${i === index ? "bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-800/50" : ""}`}
          >
            <TypeTag type={p.type} />
            <span className="flex-1 truncate text-[14px] text-gray-900 dark:text-gray-100">{p.label}</span>
            <span className="shrink-0 text-[12px] text-gray-500 dark:text-gray-400">{sectionOf(p.href)?.label}</span>
            {i === index && <CornerDownLeft size={13} className="shrink-0 text-gray-400" aria-hidden="true" />}
          </li>
        ))}
      </ul>
    </dialog>
  )
}
