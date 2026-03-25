"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Calculator,
  Truck,
  ArrowRight,
} from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <div className="w-full max-w-5xl px-6 py-16 space-y-12">

        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">
            Mena Intelligence
          </h1>
          <p className="text-lg text-muted-foreground">
            Fleet Analytics & Operational Intelligence Platform
          </p>
        </div>

        {/* Modules */}
        <div className="grid gap-6 md:grid-cols-3">

          {/* 🚛 Truck Distance */}
          <div className="group rounded-2xl border bg-background p-6 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-3 mb-4">
              <Truck className="h-6 w-6 text-blue-500" />
              <h2 className="text-lg font-semibold">
                Truck Distance
              </h2>
            </div>

            <p className="text-sm text-muted-foreground mb-6">
              Analyze distance trends per truck, monitor utilization
              and track performance across time.
            </p>

            <Link href="/truck-distance">
              <Button className="w-full flex items-center justify-between">
                Open Dashboard
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {/* 🧮 Repair Cost */}
          <div className="group rounded-2xl border bg-background p-6 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-3 mb-4">
              <Calculator className="h-6 w-6 text-green-500" />
              <h2 className="text-lg font-semibold">
                Repair Cost
              </h2>
            </div>

            <p className="text-sm text-muted-foreground mb-6">
              Upload LDT, GPM and cost files to allocate repair
              expenses automatically with fleet balancing logic.
            </p>

            <Link href="/repair-cost">
              <Button className="w-full flex items-center justify-between">
                Open Module
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {/* 📊 Future Dashboard */}
          <div className="rounded-2xl border bg-background p-6 shadow-sm opacity-70">
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="h-6 w-6 text-gray-400" />
              <h2 className="text-lg font-semibold">
                Fleet Analytics
              </h2>
            </div>

            <p className="text-sm text-muted-foreground mb-6">
              Advanced insights including cost per km, anomaly
              detection and fleet optimization.
            </p>

            <Button disabled className="w-full">
              Coming Soon
            </Button>
          </div>

        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground">
          Mena Transport • Internal Intelligence Platform
        </div>

      </div>
    </div>
  );
}