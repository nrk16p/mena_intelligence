import { PasswordGate } from "@/components/password-gate"

export default function StockSummaryLayout({ children }: { children: React.ReactNode }) {
  return <PasswordGate>{children}</PasswordGate>
}
