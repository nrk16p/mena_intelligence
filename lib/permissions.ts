import { ObjectId } from "mongodb"
import clientPromise from "@/lib/mongo"

export type UserPermissions = {
  isAdmin: boolean
  allowedGroups: string[]
}

const ALL_GROUPS = ["vehicle", "fuel", "ops", "mixer", "procurement", "maintenance", "admin"]

export async function getUserPermissions(
  email: string | null | undefined
): Promise<UserPermissions> {
  if (!email) return { isAdmin: false, allowedGroups: [] }

  try {
    const client = await clientPromise
    const db = client.db("atms")

    const user = await db.collection("app_users").findOne({ email })
    if (!user || !user.group_id) return { isAdmin: false, allowedGroups: [] }

    const group = await db
      .collection("permission_groups")
      .findOne({ _id: new ObjectId(String(user.group_id)) })
    if (!group) return { isAdmin: false, allowedGroups: [] }

    if (group.is_admin) {
      return { isAdmin: true, allowedGroups: ALL_GROUPS }
    }

    return { isAdmin: false, allowedGroups: (group.access as string[]) ?? [] }
  } catch {
    return { isAdmin: false, allowedGroups: [] }
  }
}
