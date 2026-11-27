// BI preview: new budget-control views are shown only to these users until they are opened to everyone.
// Match on the part of the e-mail before "@", so the domain does not matter.
export const BI_USERS = ["narongkorn.a"]

export function isBiUser(email: string | null | undefined): boolean {
  const local = String(email ?? "").trim().toLowerCase().split("@")[0]
  return !!local && BI_USERS.includes(local)
}
