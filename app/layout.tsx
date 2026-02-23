import "./globals.css"
import { Sidebar } from "../components/sidebar"
export const metadata = {
  title: "Mena Intelligence",
  description: "Fleet Analytics & Allocation Platform",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-muted/40">
        <Sidebar />
        <main className="flex-1 p-8">{children}</main>
      </body>
    </html>
  )
}