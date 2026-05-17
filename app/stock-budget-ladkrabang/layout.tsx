import { PasswordGate } from "@/components/password-gate"

export default function StockBudgetLayout({ children }: { children: React.ReactNode }) {
  return <PasswordGate>{children}</PasswordGate>
}
