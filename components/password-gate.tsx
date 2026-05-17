"use client"

import { useState, useEffect } from "react"
import { Lock, Eye, EyeOff } from "lucide-react"

const STORAGE_KEY = "stock_auth"
const CORRECT_PASSWORD = "mena1000mb"

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false)
  const [input, setInput] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored === "1") setUnlocked(true)
    setChecking(false)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (input === CORRECT_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "1")
      setUnlocked(true)
      setError(false)
    } else {
      setError(true)
      setInput("")
    }
  }

  if (checking) return null

  if (unlocked) return <>{children}</>

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border bg-white p-8 shadow-sm">

          {/* Icon */}
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <Lock className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Stock Access</h1>
              <p className="mt-1 text-sm text-gray-500">Enter password to continue</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(false) }}
                placeholder="Password"
                autoFocus
                className={`
                  w-full rounded-xl border px-4 py-3 pr-10 text-sm outline-none transition
                  focus:ring-2 focus:ring-black focus:border-black
                  ${error ? "border-red-400 ring-2 ring-red-200" : "border-gray-200"}
                `}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <p className="text-xs text-red-500 text-center">Incorrect password. Try again.</p>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-black py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
            >
              Unlock
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}
