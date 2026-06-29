import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import HomeClient from "@/components/home-client"

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (session?.user?.email) {
    const { isAdmin, allowedGroups } = await getUserPermissions(session.user.email)
    if (!isAdmin && allowedGroups.length === 0) {
      redirect("/pending-access")
    }
  }
  return <HomeClient />
}
