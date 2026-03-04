"use client"

interface Props {
  value: string
  onChange: (value: string) => void
}

export function FuelProviderSelect({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded-md px-3 py-2 text-sm"
    >
      <option value="ppt">PPT</option>
      <option value="bangchak">Bangchak</option>
      <option value="caltex">Caltex</option>
      <option value="saraburi">Saraburi</option>
      <option value="rayong">Rayong</option>
    </select>
  )
}