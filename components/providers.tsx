"use client"

import { SessionProvider } from "next-auth/react"
import { AiContextProvider } from "@/lib/ai-context"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AiContextProvider>{children}</AiContextProvider>
    </SessionProvider>
  )
}
