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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
      <body className="flex h-screen overflow-hidden bg-[#f5f5f7] dark:bg-[#0a0a10]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto px-8 py-7">{children}</main>
      </body>
    </html>
  )
}
