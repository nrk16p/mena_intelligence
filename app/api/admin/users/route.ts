import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { ObjectId } from "mongodb"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"

async function getAdminSession() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email ?? null
  const perms = await getUserPermissions(email)
  return perms.isAdmin ? email : null
}

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const client = await clientPromise
  const db = client.db("atms")
  const users = await db
    .collection("app_users")
    .find({})
    .sort({ group_id: 1, last_seen: -1 })
    .toArray()

  return NextResponse.json({ success: true, data: users })
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const { email, group_id } = (await req.json()) as {
      email: string
      group_id: string | null
    }

    const client = await clientPromise
    const db = client.db("atms")

    if (!group_id) {
      await db.collection("app_users").updateOne(
        { email },
        { $set: { group_id: null, group_name: null } }
      )
      return NextResponse.json({ success: true })
    }

    const group = await db
      .collection("permission_groups")
      .findOne({ _id: new ObjectId(group_id) })
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })

    await db.collection("app_users").updateOne(
      { email },
      { $set: { group_id: new ObjectId(group_id), group_name: group.name as string } }
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof Error && (e.name === "BSONError" || e.constructor.name === "BSONError")) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
