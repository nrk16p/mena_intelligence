// Plate normalization shared by client and server code. Kept dependency-free
// (no import of lib/mongo) so client components can import normPlate — via
// lib/fleets.ts — without pulling the mongodb driver into the browser bundle.
// The Mongo-backed plate/flag lookups live in lib/plate-partner-server.ts.
export function normPlate(s: string): string {
  return String(s).replace(/\s+/g, "").trim()
}
