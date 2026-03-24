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

// ─── Types ─────────────────
interface TruckRecord {
  month_year: string;
  plate: string;
  type: string;
  vehicle_no: string;
  total_distance: number;
}

// ─── KPI Card ──────────────
function KpiCard({ label, value }: any) {
  return (
    <div className="rounded-xl border p-4 bg-white shadow-sm hover:shadow-md transition">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

// ─── Page ─────────────────
export default function TruckDistancePage() {
  const [data, setData] = useState<TruckRecord[]>([]);
  const [plates, setPlates] = useState<string[]>([]);
  const [plate, setPlate] = useState("");
  const [start, setStart] = useState("2026-01");
  const [end, setEnd] = useState("2026-03");

  // Load plates
  useEffect(() => {
    fetch("/api/truck-distance")
      .then((res) => res.json())
      .then((res) => {
        const unique = [...new Set(res.map((r: any) => r.plate))];
        setPlates(unique);
      });
  }, []);

  // Load data
  useEffect(() => {
    if (!plate) return;

    fetch(`/api/truck-distance?plate=${plate}&start=${start}&end=${end}`)
      .then((res) => res.json())
      .then(setData);
  }, [plate, start, end]);

  // KPI
  const total = useMemo(
    () => data.reduce((sum, r) => sum + r.total_distance, 0),
    [data]
  );

  // Chart data
  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((d) => {
      map.set(d.month_year, (map.get(d.month_year) || 0) + d.total_distance);
    });

    return Array.from(map.entries()).map(([month, total]) => ({
      month,
      total,
    }));
  }, [data]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">🚛 Truck Distance Dashboard</h1>
        <p className="text-sm text-gray-500">Track distance per truck</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-end">
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

      {/* Selected */}
      {plate && (
        <div className="bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg">
          Selected: <span className="font-mono">{plate}</span>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Total Distance" value={`${total.toLocaleString()} km`} />
        <KpiCard label="Records" value={data.length} />
        <KpiCard label="Months" value={chartData.length} />
      </div>

{/* Chart */}
{chartData.length > 0 && (
  <div className="bg-white border rounded-xl p-4 shadow-sm">
    <p className="text-sm font-semibold mb-3">📊 Monthly Trend</p>

    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData}>

        {/* Grid */}
        <CartesianGrid strokeDasharray="3 3" vertical={false} />

        {/* X Axis */}
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12 }}
        />

        {/* ✅ Y Axis */}
        <YAxis
          tickFormatter={(value) => value.toLocaleString()}
          tick={{ fontSize: 12 }}
        />

        {/* Tooltip */}
        <Tooltip
          formatter={(value: number) =>
            `${value.toLocaleString()} km`
          }
        />

        {/* Bar */}
        <Bar
          dataKey="total"
          fill="#3b82f6"
          radius={[6, 6, 0, 0]}
        >
          {/* ✅ Data Label */}
          <LabelList
            dataKey="total"
            position="top"
            formatter={(value: number) =>
              value >= 1000
                ? `${(value / 1000).toFixed(1)}k`
                : value
            }
            style={{ fontSize: "10px", fill: "#374151" }}
          />
        </Bar>

      </BarChart>
    </ResponsiveContainer>
  </div>
)}

{/* Table */}
{plate && (
  <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">

    {/* Header */}
    <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center">
      <p className="text-sm font-semibold">📋 Monthly Details</p>
      <p className="text-xs text-gray-500">
        {data.length} records
      </p>
    </div>

    {/* Table */}
    <div className="overflow-auto max-h-[400px]">
      <table className="min-w-full text-sm">

        {/* Head */}
        <thead className="sticky top-0 bg-gray-50 z-10 border-b">
          <tr className="text-gray-600 text-xs uppercase tracking-wide">
            <th className="p-3 text-left">Month</th>
            <th className="p-3 text-left">Type</th>
            <th className="p-3 text-left">Vehicle</th>
            <th className="p-3 text-right">Distance</th>
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {data.map((row, i) => {
            const isHigh = row.total_distance > 1200;

            return (
              <tr
                key={i}
                className={`border-t transition ${
                  i % 2 === 0 ? "bg-white" : "bg-gray-50"
                } hover:bg-blue-50`}
              >
                <td className="p-3 font-medium text-gray-800">
                  {row.month_year}
                </td>

                <td className="p-3 text-gray-600">
                  <span className="px-2 py-1 rounded-md bg-gray-100 text-xs">
                    {row.type}
                  </span>
                </td>

                <td className="p-3 text-gray-500 font-mono text-xs">
                  {row.vehicle_no}
                </td>

                <td className="p-3 text-right font-semibold tabular-nums">
                  <span
                    className={`${
                      isHigh ? "text-blue-600" : "text-gray-800"
                    }`}
                  >
                    {row.total_distance.toLocaleString()}
                  </span>{" "}
                  <span className="text-gray-400 text-xs">km</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    {/* Footer Summary */}
    <div className="border-t px-4 py-3 bg-gray-50 flex justify-between text-sm">
      <span className="text-gray-500">Total</span>
      <span className="font-semibold">
        {data
          .reduce((sum, r) => sum + r.total_distance, 0)
          .toLocaleString()}{" "}
        km
      </span>
    </div>
  </div>
)}

    </div>
  );
}