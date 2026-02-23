import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BarChart3, Calculator } from "lucide-react"

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <div className="w-full max-w-4xl px-6 py-16">

        {/* Title */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            Mena Intelligence
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Fleet Analytics & Repair Cost Allocation Platform
          </p>
        </div>

        {/* Modules */}
        <div className="grid gap-6 md:grid-cols-2">

          {/* Repair Cost Card */}
          <div className="rounded-2xl border bg-background p-6 shadow-sm transition hover:shadow-md">
            <div className="flex items-center gap-3 mb-4">
              <Calculator className="h-6 w-6" />
              <h2 className="text-xl font-semibold">
                Calculate Repair Cost
              </h2>
            </div>

            <p className="text-muted-foreground mb-6">
              Upload LDT, GPM and Cost files to allocate repair expenses
              automatically with fleet balancing logic.
            </p>

            <Link href="/repair-cost">
              <Button className="w-full">
                Open Module
              </Button>
            </Link>
          </div>

          {/* Dashboard Card (Future) */}
          <div className="rounded-2xl border bg-background p-6 shadow-sm transition hover:shadow-md">
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="h-6 w-6" />
              <h2 className="text-xl font-semibold">
                Fleet Dashboard
              </h2>
            </div>

            <p className="text-muted-foreground mb-6">
              Visualize cost allocation, fleet performance and variance
              insights. (Coming Soon)
            </p>

            <Button disabled className="w-full">
              Coming Soon
            </Button>
          </div>

        </div>

      </div>
    </div>
  )
}