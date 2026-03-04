"use client"

interface Props {
  data: any[]
}

export function FuelTable({ data }: Props) {

  if (data.length === 0) return null

  return (
    <div className="border rounded-lg overflow-auto">

      <table className="w-full text-sm">

        <thead className="bg-muted">
          <tr>
            {Object.keys(data[0]).map((key) => (
              <th key={key} className="p-2 text-left border-b">
                {key}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b">
              {Object.values(row).map((val, j) => (
                <td key={j} className="p-2">
                  {String(val)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>

      </table>

    </div>
  )
}