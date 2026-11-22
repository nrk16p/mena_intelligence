"use client"

import { useCallback, useEffect, useState } from "react"

/** Per-browser menu preferences (pins, open sections). Storage can be blocked: every access is guarded. */
const PINS_KEY = "intel.nav.pins"
const PINS_EVENT = "intel:pins-changed"
export const OPEN_PALETTE_EVENT = "intel:open-palette"

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode / blocked storage: keep in memory only */
  }
}

/** A value kept in localStorage; starts at `fallback` on the server and first render. */
export function useStoredState<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback)
  useEffect(() => {
    setValue(read(key, fallback))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const set = useCallback((v: T) => {
    setValue(v)
    write(key, v)
  }, [key])
  return [value, set]
}

/** Pinned page hrefs, shared live between the sidebar and the home page. */
export function usePins(): { pins: string[]; toggle: (href: string) => void; isPinned: (href: string) => boolean } {
  const [pins, setPins] = useState<string[]>([])
  useEffect(() => {
    const load = () => setPins(read<string[]>(PINS_KEY, []))
    load()
    window.addEventListener(PINS_EVENT, load)
    window.addEventListener("storage", load)
    return () => {
      window.removeEventListener(PINS_EVENT, load)
      window.removeEventListener("storage", load)
    }
  }, [])
  const toggle = useCallback((href: string) => {
    const cur = read<string[]>(PINS_KEY, [])
    const next = cur.includes(href) ? cur.filter((h) => h !== href) : [...cur, href]
    write(PINS_KEY, next)
    setPins(next)
    window.dispatchEvent(new Event(PINS_EVENT))
  }, [])
  return { pins, toggle, isPinned: (href) => pins.includes(href) }
}

export function openPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))
}
