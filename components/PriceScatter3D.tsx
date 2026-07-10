"use client"

import createPlotlyComponent from "react-plotly.js/factory"
import Plotly from "plotly.js-dist-min"

const Plot = createPlotlyComponent(Plotly)

const TH_MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
function lbl(ym: string) {
  const [y, m] = ym.split("-")
  return `${TH_MONTHS[Number(m)] ?? m}${String(Number(y) + 543).slice(-2)}`
}

type Pt = { price: number; count: number; supplier: string; outlier: boolean }
type M = { month: string; points: Pt[] }

/**
 * 3D scatter of purchase points: X = เดือน, Y = ซัพพลายเออร์, Z = ราคา.
 * Marker size scales with purchase count; colour matches the 2D legend.
 * Loaded lazily (Plotly is heavy) — see the dynamic import in the page.
 */
export default function PriceScatter3D({ data, suppliers, colorMap, height = 460 }: {
  data: M[]
  suppliers: string[]
  colorMap: Record<string, string>
  height?: number
}) {
  const labels = data.map(d => lbl(d.month))
  let maxCount = 1
  for (const m of data) for (const p of m.points) if (p.count > maxCount) maxCount = p.count

  const traces = suppliers.map(sup => {
    const x: string[] = [], z: number[] = [], size: number[] = [], text: string[] = []
    const symbol: string[] = []
    for (const m of data) {
      for (const p of m.points) {
        if (p.supplier !== sup) continue
        x.push(lbl(m.month))
        z.push(p.price)
        size.push(5 + (p.count / maxCount) * 15)
        symbol.push(p.outlier ? "x" : "circle")
        text.push(`${sup}<br>${lbl(m.month)} · ฿${p.price.toLocaleString()} · ${p.count} ครั้ง${p.outlier ? " · outlier" : ""}`)
      }
    }
    return {
      type: "scatter3d",
      mode: "markers",
      name: sup,
      x,
      y: x.map(() => sup),
      z,
      text,
      hoverinfo: "text",
      marker: { size, symbol, color: colorMap[sup] ?? "#6B7280", opacity: 0.85, line: { width: 0 } },
    }
  }).filter(t => t.x.length > 0)

  const layout = {
    autosize: true,
    height,
    margin: { l: 0, r: 0, t: 8, b: 0 },
    showlegend: false,
    font: { family: "'DM Sans', sans-serif", size: 11, color: "#374151" },
    paper_bgcolor: "rgba(0,0,0,0)",
    scene: {
      xaxis: { title: { text: "เดือน" }, type: "category", categoryorder: "array", categoryarray: labels, tickfont: { size: 10 } },
      yaxis: { title: { text: "ซัพพลายเออร์" }, type: "category", categoryorder: "array", categoryarray: suppliers, tickfont: { size: 9 }, automargin: true },
      zaxis: { title: { text: "ราคา (฿)" }, tickfont: { size: 10 }, rangemode: "tozero" },
      camera: { eye: { x: 1.7, y: 1.7, z: 0.85 } },
      aspectmode: "manual",
      aspectratio: { x: 1.4, y: 1.1, z: 1 },
    },
  }

  const config = { displaylogo: false, responsive: true, modeBarButtonsToRemove: ["toImage"] }

  return (
    <Plot
      data={traces as unknown as Record<string, unknown>[]}
      layout={layout as unknown as Record<string, unknown>}
      config={config as unknown as Record<string, unknown>}
      style={{ width: "100%", height }}
      useResizeHandler
    />
  )
}
