declare module "plotly.js-dist-min" {
  const Plotly: unknown
  export default Plotly
}

declare module "react-plotly.js/factory" {
  import type * as React from "react"
  const createPlotlyComponent: (plotly: unknown) => React.ComponentType<Record<string, unknown>>
  export default createPlotlyComponent
}
