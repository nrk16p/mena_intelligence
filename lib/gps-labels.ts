const COLLECTION_LABELS: Record<string, string> = {
  distance:   "ระยะทาง",
  drivinglog: "ระยะทาง",
}

export function labelFor(name: string) {
  return COLLECTION_LABELS[name.toLowerCase()] ?? name
}
