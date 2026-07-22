import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const { allowedGroups } = await getUserPermissions(session.user?.email)
  if (!allowedGroups.includes("procurement")) redirect("/unauthorized")
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@600;700;900&family=DM+Sans:wght@400;500;700&family=Fira+Code:wght@400;600&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  )
}
