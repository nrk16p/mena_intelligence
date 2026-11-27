import { describe, expect, it } from "vitest"
import { isBiUser } from "./bi"

describe("isBiUser", () => {
  it("lets narongkorn.a in on any domain, nobody else", () => {
    expect(isBiUser("narongkorn.a@menatransport.co.th")).toBe(true)
    expect(isBiUser("Narongkorn.A@example.com")).toBe(true)
    expect(isBiUser("narongkorn.b@menatransport.co.th")).toBe(false)
    expect(isBiUser("someone@menatransport.co.th")).toBe(false)
    expect(isBiUser("")).toBe(false)
    expect(isBiUser(null)).toBe(false)
  })
})
