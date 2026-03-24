"use client";

import { useEffect, useMemo, useState } from "react";
import { PlateCombobox } from "@/components/PlateCombobox";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
} from "recharts";

// ─── TYPES ─────────────────────────────
interface TruckRecord {
  month_year: string;
  plate: string;
  type: string;
  vehicle_no: string;
  total_distance: number;
}

// ─── KPI CARD ─────────────────────────
function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4 bg-white shadow-sm hover:shadow-md transition">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

// ─── PAGE ─────────────────────────────
export default function TruckDistancePage() {
  const [data, setData] = useState<TruckRecord[]>([]);
  const [plates, setPlates] = useState<string[]>([]);
  const [plate, setPlate] = useState("");
  const [start, setStart] = useState("2026-01");
  const [end, setEnd] = useState("2026-03");

  // ✅ LOAD PLATES (FIX TYPESCRIPT)
  useEffect(() => {
    const loadPlates = async () => {
      const res = await fetch("/api/truck-distance");
      const data: TruckRecord[] = await res.json();

      const unique = [
        ...new Set(data.map((r) => r.plate).filter(Boolean)),
      ];

      setPlates(unique);
    };

    loadPlates();
  }, []);

  // ✅ LOAD DATA
  useEffect(() => {
    if (!plate) return;

    const loadData = async () => {
      const res = await fetch(
        `/api/truck-distance?plate=${plate}&start=${start}&end=${end}`
      );
      const data: TruckRecord[] = await res.json();
      setData(data);
    };

    loadData();
  }, [plate, start, end]);

  // ─── KPI ────────────────────────────
  const total = useMemo(
    () => data.reduce((sum, r) => sum + r.total_distance, 0),
    [data]
  );

  // ─── CHART DATA ─────────────────────
  const chartData = useMemo(() => {
    const map = new Map<string, number>();

    data.forEach((d) => {
      map.set(d.month_year, (map.get(d.month_year) || 0) + d.total_distance);
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({
        month,
        total,
      }));
  }, [data]);

  // ─── TABLE TOTAL ────────────────────
  const tableTotal = useMemo(
    () => data.reduce((sum, r) => sum + r.total_distance, 0),
    [data]
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* HEADER */}
      <div>
        <h1 className="text-xl font-semibold">
          🚛 Truck Distance Dashboard
        </h1>
        <p className="text-sm text-gray-500">
          Monthly distance per truck
        </p>
      </div>

      {/* FILTER */}
      <div className="flex gap-4 items-end flex-wrap">
        <PlateCombobox
          plates={plates}
          value={plate}
          onChange={setPlate}
        />

        <input
          type="month"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="border px-3 py-2 rounded-md"
        />

        <input
          type="month"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="border px-3 py-2 rounded-md"
        />
      </div>

      {/* SELECTED */}
      {plate && (
        <div className="bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg">
          Selected: <span className="font-mono">{plate}</span>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Total Distance"
          value={`${total.toLocaleString()} km`}
        />
        <KpiCard label="Records" value={String(data.length)} />
        <KpiCard label="Months" value={String(chartData.length)} />
      </div>

      {/* 📊 CHART */}
      {chartData.length > 0 && (
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <p className="text-sm font-semibold mb-3">
            📊 Monthly Trend
          </p>

          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />

              <XAxis
                dataKey="month"
                tickFormatter={(m) => m.slice(5)}
              />

              <YAxis
                tickFormatter={(v) => v.toLocaleString()}
              />

              <Tooltip
                formatter={(v: number) =>
                  `${v.toLocaleString()} km`
                }
              />

              <defs>
                <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#60a5fa" />
                </linearGradient>
              </defs>

              <Bar
                dataKey="total"
                fill="url(#colorBar)"
                radius={[6, 6, 0, 0]}
                animationDuration={800}
              >
                <LabelList
                  dataKey="total"
                  position="top"
                  formatter={(v: number) =>
                    v >= 1000
                      ? `${(v / 1000).toFixed(1)}k`
                      : v
                  }
                  style={{ fontSize: 10 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 📋 TABLE */}
      {plate && (
        <div className="rounded-xl border overflow-hidden bg-white shadow-sm">

          {/* header */}
          <div className="px-4 py-3 border-b bg-gray-50 flex justify-between">
            <p className="text-sm font-semibold">📋 Monthly Details</p>
            <p className="text-xs text-gray-500">
              {data.length} records
            </p>
          </div>

          {/* table */}
          <div className="overflow-auto max-h-[400px]">
            <table className="min-w-full text-sm">

              <thead className="sticky top-0 bg-gray-50 border-b">
                <tr className="text-xs uppercase text-gray-500">
                  <th className="p-3 text-left">Month</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-left">Vehicle</th>
                  <th className="p-3 text-right">Distance</th>
                </tr>
              </thead>

              <tbody>
                {data.map((row, i) => {
                  const isHigh = row.total_distance > 1200;

                  return (
                    <tr
                      key={i}
                      className={`border-t ${
                        i % 2 === 0 ? "bg-white" : "bg-gray-50"
                      } hover:bg-blue-50`}
                    >
                      <td className="p-3 font-medium">
                        {row.month_year}
                      </td>

                      <td className="p-3">
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                          {row.type}
                        </span>
                      </td>

                      <td className="p-3 font-mono text-xs text-gray-500">
                        {row.vehicle_no}
                      </td>

                      <td className="p-3 text-right font-semibold tabular-nums">
                        <span
                          className={
                            isHigh
                              ? "text-blue-600"
                              : "text-gray-800"
                          }
                        >
                          {row.total_distance.toLocaleString()}
                        </span>{" "}
                        <span className="text-gray-400 text-xs">
                          km
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* footer */}
          <div className="border-t px-4 py-3 bg-gray-50 flex justify-between text-sm">
            <span className="text-gray-500">Total</span>
            <span className="font-semibold">
              {tableTotal.toLocaleString()} km
            </span>
          </div>
        </div>
      )}
    </div>
  );
}