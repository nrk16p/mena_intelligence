"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { useSetAiContext } from "@/lib/ai-context";
import { AiInsightsPanel } from "@/components/ai-insights-panel";
import { FLEET_MAP, FLEET_ORDER, FLEET_COLORS } from "@/lib/fleets";
import {
  ComposedChart, Bar, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ── Status helpers ────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  "A":"ทำงานปกติ","AX":"ระหว่างเดินทาง","Aท":"รถสำรองทำงานแทน",
  "Aอ":"รถโอน","Aอส":"รถโอนสาย","A75":"ทำงาน 6 ชม.","A50":"ทำงาน 4 ชม.","A25":"ทำงาน 2 ชม.",
  "B":"รถซ่อมไม่มีพจส.","BA":"รถซ่อมมีพจส.","BAQ":"รถซ่อมมีคิว","BY":"รถเบรกแย๊กโม่","PM":"เช็คระยะตามรอบ",
  "อ":"รถจอด (อุบัติเหตุ)","วซ":"รถว่างรอซ่อม","วA":"รถว่างรอดำเนินการ","วร":"รถว่างรอสรรหา",
  "วล":"รถว่างพจส.ลาปกติ","วก":"รถว่างพจส.ลากิจฉุกเฉิน","วป":"รถว่างพจส.ลาป่วย","วภ":"รถว่างรอต่อภาษี",
  "X":"ตกคิว/ไม่ได้งาน","วส":"รถว่างพจส.อบรม/สอบ","วพ":"รถว่างพจส.ถูกพักงาน","วข":"รถว่างพจส.ขาดงาน","วฝ":"ว่างฝึกงาน",
};
const WORKING_STATUSES = new Set(["A","AX","Aท","Aอ","Aอส","A75","A50","A25"]);
const REPAIR_STATUSES  = new Set(["B","BA","BAQ","BY","PM"]);
const IDLE_STATUSES    = new Set(["อ","วซ","วA","วร","วล","วก","วป","วภ","X","วส","วพ","วข","วฝ"]);

function deriveGroup(status: string | null, dbGroup: string | null): string {
  if (dbGroup && ["working","repair","idle"].includes(dbGroup)) return dbGroup;
  if (!status) return "unknown";
  if (WORKING_STATUSES.has(status)) return "working";
  if (REPAIR_STATUSES.has(status))  return "repair";
  if (IDLE_STATUSES.has(status))    return "idle";
  return "unknown";
}
const GROUP_STYLE: Record<string,string> = {
  working:"bg-blue-100 text-blue-700", repair:"bg-red-100 text-red-700",
  idle:"bg-yellow-100 text-yellow-700", unknown:"bg-gray-100 text-gray-500",
};
const GROUP_LABEL: Record<string,string> = { working:"ทำงาน", repair:"ซ่อม", idle:"ว่าง", unknown:"ไม่ระบุ" };

// ── Fleet helpers ─────────────────────────────────────────────────────────
const TOTAL_COLOR = "#374151";
const MONTHS      = ["01","02","03","04","05","06","07","08","09","10","11","12"] as const;
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

function daysInMonthYear(my: string): number {
  const [mm, yy] = my.split("-");
  return new Date(2000 + parseInt(yy,10), parseInt(mm,10), 0).getDate();
}
function fmtPct(n: number): string { return (n*100).toFixed(2)+"%"; }
function pctColor(n: number): string {
  if (n===0) return "text-gray-400";
  if (n<0.05) return "text-green-600 font-semibold";
  if (n<0.10) return "text-yellow-600 font-semibold";
  return "text-red-600 font-semibold";
}
function pctBg(n: number): string {
  if (n===0) return "";
  if (n<0.05) return "bg-green-50 dark:bg-green-900/10";
  if (n<0.10) return "bg-yellow-50 dark:bg-yellow-900/10";
  return "bg-red-50 dark:bg-red-900/10";
}

// ── Date / change helpers ─────────────────────────────────────────────────
function prevYearMY(my: string): string {
  const [mm, yy] = my.split("-");
  return `${mm}-${(parseInt(yy, 10) - 1).toString().padStart(2, "0")}`;
}
function fmtChange(n: number | null): string {
  if (n == null) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(1) + "%";
}
function changeColor(n: number | null): string {
  if (n == null) return "text-gray-400";
  return n > 0 ? "text-red-500 font-semibold" : n < 0 ? "text-green-600 font-semibold" : "text-gray-500";
}
function barFill(pct: number): string {
  if (pct >= 10) return "#ef4444";
  if (pct >= 5)  return "#f59e0b";
  return "#22c55e";
}
function formatDateBKK(val: string | Date | null): string {
  if (!val) return "—";
  return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Bangkok",day:"2-digit",month:"2-digit",year:"numeric"})
    .format(new Date(val)).replace(/\//g,"-");
}

// ── Types ─────────────────────────────────────────────────────────────────
interface VehicleRow {
  id: number; fleet_group_id: string; license_plate: string;
  plant: string|null; customer: string|null; status: string|null;
  group_status: string|null; date: string; month_year: string|null;
}
interface ApiResponse {
  success: boolean; total: number; page: number; page_size: number; total_pages: number; data: VehicleRow[];
}
interface BreakdownRow {
  fleet_group_id: string; month_year: string; truck_count: number; breakdown_count: number;
}
const PAGE_SIZES = [25,50,100] as const;

// ═══════════════════════════════════════════════════════════════════════════
export default function TruckUtilizeAnalysisPage() {
  const setAiContext = useSetAiContext();
  const [tab, setTab] = useState<"breakdown"|"detail">("breakdown");

  // ── Breakdown state ──────────────────────────────────────────────────
  const [yy1, setYy1]             = useState("25");   // base year  e.g. "25" = 2025
  const [yy2, setYy2]             = useState("26");   // current year e.g. "26" = 2026
  const [inputYy1, setInputYy1]   = useState("25");
  const [inputYy2, setInputYy2]   = useState("26");
  const [bdRows1,  setBdRows1]    = useState<BreakdownRow[]>([]);
  const [bdRows2,  setBdRows2]    = useState<BreakdownRow[]>([]);
  const [bdLoading, setBdLoading] = useState(false);
  const [bdError,   setBdError]   = useState("");
  const [selectedFleets, setSelectedFleets] = useState<Set<string>>(new Set(FLEET_ORDER));
  const [fromMM, setFromMM] = useState("01");
  const [toMM,   setToMM]   = useState("12");

  const fetchBreakdown = useCallback(async () => {
    setBdLoading(true); setBdError("");
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/truck-utilize/breakdown?start=01-${yy1}&end=12-${yy1}`),
        fetch(`/api/truck-utilize/breakdown?start=01-${yy2}&end=12-${yy2}`),
      ]);
      const [j1, j2] = await Promise.all([r1.json(), r2.json()]);
      if (!j1.success) throw new Error(j1.error);
      setBdRows1(j1.data);
      setBdRows2(j2.success ? j2.data : []);
    } catch (e:any) { setBdError(e.message||"Failed to load"); }
    finally { setBdLoading(false); }
  }, [yy1, yy2]);

  useEffect(() => { fetchBreakdown(); }, [fetchBreakdown]);

  // ── Push AI context whenever breakdown data updates ────────────────────
  useEffect(() => {
    if (!bdRows1.length && !bdRows2.length) return;
    const fmtPctN = (n: number) => (n * 100).toFixed(2) + "%";

    const lines: string[] = [
      `=== PAGE: Truck Utilization & Breakdown Analysis ===`,
      `METRIC DEFINITIONS:`,
      `- Breakdown Rate = breakdown_days / (truck_count × calendar_days_in_month) × 100%`,
      `- breakdown_days: Total truck-days a truck was in repair/breakdown status`,
      `- truck_count: Number of trucks assigned to that fleet in the month`,
      `- Fleet groups: 1=ML, 2=MS, 3=TDM, 4=BTG, 5=TFG, 6=SCCC, 7=DHL, 8=KN`,
      `- Status groups: working=ทำงาน, repair=ซ่อม, idle=ว่าง`,
      `THRESHOLDS (breakdown rate):`,
      `- < 5%: Healthy (green)`,
      `- 5–10%: Needs attention (yellow)`,
      `- > 10%: Critical — major reliability issue (red)`,
      `LOWER breakdown rate = BETTER`,
      ``,
      `Comparison: 20${yy1} (base) vs 20${yy2} (current)`,
      ``,
    ];

    // Build pivot for both years
    const pivot = (rows: BreakdownRow[]) => {
      const p: Record<string, Record<string, { truck_count: number; breakdown_count: number }>> = {};
      for (const r of rows) {
        if (!p[r.fleet_group_id]) p[r.fleet_group_id] = {};
        p[r.fleet_group_id][r.month_year] = { truck_count: Number(r.truck_count), breakdown_count: Number(r.breakdown_count) };
      }
      return p;
    };
    const p1 = pivot(bdRows1);
    const p2 = pivot(bdRows2);

    lines.push(`Monthly Breakdown Rate by Fleet:`);
    for (const fleetId of FLEET_ORDER) {
      const name = FLEET_MAP[fleetId] ?? fleetId;
      const monthParts: string[] = [];
      for (const mm of MONTHS) {
        const my1 = `${mm}-${yy1}`, my2 = `${mm}-${yy2}`;
        const c1 = p1[fleetId]?.[my1], c2 = p2[fleetId]?.[my2];
        const r1 = c1 && c1.truck_count > 0 ? c1.breakdown_count / (c1.truck_count * new Date(2000 + parseInt(yy1), parseInt(mm), 0).getDate()) : null;
        const r2 = c2 && c2.truck_count > 0 ? c2.breakdown_count / (c2.truck_count * new Date(2000 + parseInt(yy2), parseInt(mm), 0).getDate()) : null;
        if (r1 !== null || r2 !== null) {
          const yoyStr = r1 !== null && r2 !== null ? ` YoY:${((r2 - r1) / r1 * 100).toFixed(1)}%` : "";
          monthParts.push(`${MONTH_NAMES[MONTHS.indexOf(mm)]}:${r1 !== null ? fmtPctN(r1) : "N/A"}→${r2 !== null ? fmtPctN(r2) : "N/A"}${yoyStr}`);
        }
      }
      if (monthParts.length) lines.push(`  Fleet ${name} (${fleetId}): ${monthParts.join(" | ")}`);
    }

    setAiContext(lines.join("\n"), `Truck Utilization 20${yy1} vs 20${yy2}`);
  }, [bdRows1, bdRows2, yy1, yy2, setAiContext]);

  function toggleFleet(g: string) {
    setSelectedFleets(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  function toggleAllFleets() {
    setSelectedFleets(prev =>
      prev.size === FLEET_ORDER.length ? new Set<string>() : new Set(FLEET_ORDER)
    );
  }

  // ── Detail state ─────────────────────────────────────────────────────
  const [rows, setRows]             = useState<VehicleRow[]>([]);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [startDate, setStartDate]   = useState("2025-01-01");
  const [endDate, setEndDate]       = useState("");
  const [monthYear, setMonthYear]   = useState("");
  const [plant, setPlant]           = useState("");
  const [status, setStatus]         = useState("");
  const [groupStatus, setGroupStatus] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [fleetGroupId, setFleetGroupId] = useState("");
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState<25|50|100>(25);

  const fetchData = useCallback(async (currentPage: number) => {
    setLoading(true); setError("");
    try {
      const p = new URLSearchParams();
      if (startDate)    p.set("start_date", startDate);
      if (endDate)      p.set("end_date", endDate);
      if (monthYear)    p.set("month_year", monthYear);
      if (plant)        p.set("plant", plant);
      if (status)       p.set("status", status);
      if (groupStatus)  p.set("group_status", groupStatus);
      if (licensePlate) p.set("license_plate", licensePlate);
      if (fleetGroupId) p.set("fleet_group_id", fleetGroupId);
      p.set("page", String(currentPage)); p.set("page_size", String(pageSize));
      const res  = await fetch(`/api/truck-utilize?${p.toString()}`);
      const json: ApiResponse = await res.json();
      if (!json.success) throw new Error("API error");
      setRows(json.data); setTotal(json.total); setTotalPages(json.total_pages);
    } catch (e:any) { setError(e.message||"Failed to load data"); }
    finally { setLoading(false); }
  }, [startDate,endDate,monthYear,plant,status,groupStatus,licensePlate,fleetGroupId,pageSize]);

  useEffect(() => { fetchData(page); /* eslint-disable-next-line */ }, [page, pageSize]);

  const [exporting, setExporting] = useState(false);
  async function handleExport() {
    setExporting(true);
    try {
      const p = new URLSearchParams();
      if (startDate)    p.set("start_date", startDate);
      if (endDate)      p.set("end_date", endDate);
      if (monthYear)    p.set("month_year", monthYear);
      if (plant)        p.set("plant", plant);
      if (status)       p.set("status", status);
      if (groupStatus)  p.set("group_status", groupStatus);
      if (licensePlate) p.set("license_plate", licensePlate);
      if (fleetGroupId) p.set("fleet_group_id", fleetGroupId);

      const res = await fetch(`/api/truck-utilize/export?${p.toString()}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `truck_utilize_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  // ── Derived breakdown data ────────────────────────────────────────────
  const activeFleets   = FLEET_ORDER.filter(g => selectedFleets.has(g) && FLEET_MAP[g]);
  const visibleMonths  = MONTHS.filter(mm => mm >= fromMM && mm <= toMM);
  const label1 = `20${yy1}`;  // "2025"
  const label2 = `20${yy2}`;  // "2026"

  function buildPivot(rows: BreakdownRow[]) {
    const p: Record<string,Record<string,{truck_count:number;breakdown_count:number}>> = {};
    for (const r of rows) {
      if (!p[r.fleet_group_id]) p[r.fleet_group_id] = {};
      p[r.fleet_group_id][r.month_year] = { truck_count: Number(r.truck_count), breakdown_count: Number(r.breakdown_count) };
    }
    return p;
  }
  function buildTotals(pivot: ReturnType<typeof buildPivot>, fleets: string[]) {
    const t: Record<string,{bd:number;cap:number}> = {};
    for (const g of fleets) {
      for (const m of Object.keys(pivot[g] ?? {})) {
        const cell = pivot[g][m];
        const days = daysInMonthYear(m);
        if (!t[m]) t[m] = { bd:0, cap:0 };
        t[m].bd  += cell.breakdown_count;
        t[m].cap += cell.truck_count * days;
      }
    }
    return t;
  }

  const pivot1  = buildPivot(bdRows1);
  const pivot2  = buildPivot(bdRows2);
  const totals1 = buildTotals(pivot1, activeFleets);
  const totals2 = buildTotals(pivot2, activeFleets);

  // Bar chart: Jan–Dec, grouped bars (yy1 vs yy2) + MoM line for yy2
  const barChartData = MONTHS.map((mm, i) => {
    const my1 = `${mm}-${yy1}`;
    const my2 = `${mm}-${yy2}`;
    const t1  = totals1[my1];
    const t2  = totals2[my2];

    const pct1 = t1 && t1.cap > 0 ? parseFloat((t1.bd / t1.cap * 100).toFixed(2)) : null;
    const pct2 = t2 && t2.cap > 0 ? parseFloat((t2.bd / t2.cap * 100).toFixed(2)) : null;

    // YoY: (yy2 − yy1) / yy1
    const yoy = pct1 != null && pct2 != null && pct1 > 0
      ? parseFloat(((pct2 - pct1) / pct1 * 100).toFixed(1))
      : null;

    // MoM: current month yy2 vs previous month yy2
    const prevMy2  = i > 0 ? `${MONTHS[i-1]}-${yy2}` : null;
    const prevT2   = prevMy2 ? totals2[prevMy2] : null;
    const prevPct2 = prevT2 && prevT2.cap > 0 ? prevT2.bd / prevT2.cap * 100 : null;
    const mom = pct2 != null && prevPct2 != null && prevPct2 > 0
      ? parseFloat(((pct2 - prevPct2) / prevPct2 * 100).toFixed(1))
      : null;

    const point: Record<string, any> = {
      month: MONTH_NAMES[i],
      mm,
      [label1]: pct1,
      [label2]: pct2,
      yoy,
      mom,
    };
    return point;
  });

  const visibleBarData = barChartData.filter(d => visibleMonths.includes(d.mm as typeof MONTHS[number]));

  // ── Stat card computations ───────────────────────────────────────────
  const statMM2 = visibleMonths.filter(mm => (totals2[`${mm}-${yy2}`]?.cap ?? 0) > 0);
  const statMM1 = visibleMonths.filter(mm => (totals1[`${mm}-${yy1}`]?.cap ?? 0) > 0);
  const avgPct2 = statMM2.length
    ? statMM2.reduce((s,mm)=>{ const t=totals2[`${mm}-${yy2}`]; return s+t.bd/t.cap*100; },0)/statMM2.length
    : null;
  const avgPct1 = statMM1.length
    ? statMM1.reduce((s,mm)=>{ const t=totals1[`${mm}-${yy1}`]; return s+t.bd/t.cap*100; },0)/statMM1.length
    : null;
  const totalBD2 = activeFleets.reduce((s,g)=>
    s+visibleMonths.reduce((s2,mm)=>s2+(pivot2[g]?.[`${mm}-${yy2}`]?.breakdown_count??0),0),0);
  const totalBD1 = activeFleets.reduce((s,g)=>
    s+visibleMonths.reduce((s2,mm)=>s2+(pivot1[g]?.[`${mm}-${yy1}`]?.breakdown_count??0),0),0);
  let bestMonth: string|null = null, bestPct = Infinity;
  let worstMonth: string|null = null, worstPct = -Infinity;
  for (const mm of visibleMonths) {
    const t = totals2[`${mm}-${yy2}`];
    if (!t || t.cap === 0) continue;
    const pct = t.bd/t.cap*100;
    if (pct < bestPct)  { bestPct  = pct;  bestMonth  = mm; }
    if (pct > worstPct) { worstPct = pct;  worstMonth = mm; }
  }
  const yoyAvg = avgPct1 && avgPct1 > 0 && avgPct2 != null
    ? ((avgPct2 - avgPct1) / avgPct1 * 100)
    : null;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Truck Utilize Analysis</h1>

      {/* ── Tabs ── */}
      <div className="flex border-b">
        {([["breakdown","Breakdown %"],["detail","รายละเอียด"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              tab === key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── AI Insights ── */}
      {!bdLoading && (bdRows1.length > 0 || bdRows2.length > 0) && <AiInsightsPanel />}

      {/* ══════════ BREAKDOWN TAB ══════════ */}
      {tab === "breakdown" && (
        <div className="space-y-5">

          {/* ── Filters ── */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border px-4 py-3">
            <div className="flex flex-wrap lg:flex-nowrap items-center gap-3">

              {/* Year comparison pill */}
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 px-2 py-1.5 shrink-0">
                <div className="flex flex-col items-center px-1.5">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">Base</span>
                  <input value={`20${inputYy1}`}
                    onChange={e => setInputYy1(e.target.value.replace("20","").slice(0,2))}
                    className="w-12 text-center text-sm font-bold bg-transparent focus:outline-none text-gray-700 dark:text-gray-200" />
                </div>
                <span className="text-[11px] text-gray-300 dark:text-zinc-600 font-semibold">vs</span>
                <div className="flex flex-col items-center px-1.5">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">Current</span>
                  <input value={`20${inputYy2}`}
                    onChange={e => setInputYy2(e.target.value.replace("20","").slice(0,2))}
                    className="w-12 text-center text-sm font-bold bg-transparent focus:outline-none text-blue-600 dark:text-blue-400" />
                </div>
              </div>

              {/* Month range pill */}
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 px-2 py-1.5 shrink-0">
                <div className="flex flex-col items-center px-1.5">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">From</span>
                  <select value={fromMM} onChange={e => setFromMM(e.target.value)}
                    className="text-sm font-bold bg-transparent border-none focus:outline-none text-gray-700 dark:text-gray-200 cursor-pointer">
                    {MONTHS.map((mm,i) => <option key={mm} value={mm}>{MONTH_NAMES[i]}</option>)}
                  </select>
                </div>
                <span className="text-[11px] text-gray-300 dark:text-zinc-600">→</span>
                <div className="flex flex-col items-center px-1.5">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">To</span>
                  <select value={toMM} onChange={e => setToMM(e.target.value)}
                    className="text-sm font-bold bg-transparent border-none focus:outline-none text-gray-700 dark:text-gray-200 cursor-pointer">
                    {MONTHS.map((mm,i) => <option key={mm} value={mm}>{MONTH_NAMES[i]}</option>)}
                  </select>
                </div>
              </div>

              <button onClick={() => { setYy1(inputYy1); setYy2(inputYy2); }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition shrink-0">
                Apply
              </button>

              {/* Divider */}
              <div className="hidden lg:block w-px h-7 bg-gray-200 dark:bg-zinc-700 shrink-0" />

              {/* Fleet pills */}
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide shrink-0">Fleet</span>
                <button onClick={toggleAllFleets}
                  className="text-[11px] text-blue-500 hover:underline shrink-0 mr-1">
                  {selectedFleets.size === FLEET_ORDER.length ? "Clear" : "All"}
                </button>
                {FLEET_ORDER.filter(g => FLEET_MAP[g]).map(g => (
                  <button key={g} onClick={() => toggleFleet(g)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition shrink-0 ${
                      selectedFleets.has(g)
                        ? "text-white border-transparent"
                        : "bg-white dark:bg-zinc-800 text-gray-400 border-gray-200 dark:border-zinc-600 hover:border-gray-300"
                    }`}
                    style={selectedFleets.has(g) ? {backgroundColor: FLEET_COLORS[g], borderColor: FLEET_COLORS[g]} : {}}>
                    {FLEET_MAP[g]}
                  </button>
                ))}
              </div>

            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"/> &lt; 5% ดี</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block"/> 5–10% ปานกลาง</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"/> &gt; 10% สูง</span>
            <span className="ml-auto text-gray-400">= Total B/BA ÷ (Truck × Day)</span>
          </div>

          {bdError && <p className="text-red-500 text-sm">{bdError}</p>}

          {/* ── Stat Cards ── */}
          {!bdLoading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Avg BD% */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border p-4">
                <p className="text-xs text-gray-400 mb-1">Avg BD% — {label2}</p>
                <p className={`text-2xl font-bold tabular-nums ${avgPct2 != null ? pctColor(avgPct2/100) : "text-gray-300"}`}>
                  {avgPct2 != null ? avgPct2.toFixed(2)+"%" : "—"}
                </p>
                <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                  <span>vs {label1}:</span>
                  <span className={changeColor(yoyAvg)}>{fmtChange(yoyAvg)}</span>
                  {yoyAvg != null && <span className={`font-bold ${yoyAvg > 0 ? "text-red-500" : yoyAvg < 0 ? "text-green-500" : "text-gray-400"}`}>{yoyAvg > 0 ? "↑" : yoyAvg < 0 ? "↓" : "="}</span>}
                </div>
              </div>
              {/* Total BD events */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border p-4">
                <p className="text-xs text-gray-400 mb-1">Total BD Events — {label2}</p>
                <p className="text-2xl font-bold tabular-nums text-gray-800 dark:text-gray-100">{totalBD2.toLocaleString()}</p>
                <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                  <span>vs {label1}: {totalBD1.toLocaleString()}</span>
                  {totalBD1 > 0 && (
                    <span className={`font-bold ml-1 ${totalBD2 > totalBD1 ? "text-red-500" : totalBD2 < totalBD1 ? "text-green-500" : "text-gray-400"}`}>
                      {totalBD2 > totalBD1 ? "↑" : totalBD2 < totalBD1 ? "↓" : "="}
                    </span>
                  )}
                </div>
              </div>
              {/* Best month */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border p-4">
                <p className="text-xs text-gray-400 mb-1">Best Month — {label2}</p>
                {bestMonth ? (
                  <>
                    <p className="text-2xl font-bold text-green-600 tabular-nums">{bestPct.toFixed(2)}%</p>
                    <p className="text-xs text-gray-400 mt-1">{MONTH_NAMES[MONTHS.indexOf(bestMonth as typeof MONTHS[number])]} {label2}</p>
                  </>
                ) : <p className="text-2xl font-bold text-gray-300">—</p>}
              </div>
              {/* Worst month */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border p-4">
                <p className="text-xs text-gray-400 mb-1">Worst Month — {label2}</p>
                {worstMonth ? (
                  <>
                    <p className={`text-2xl font-bold tabular-nums ${pctColor(worstPct/100)}`}>{worstPct.toFixed(2)}%</p>
                    <p className="text-xs text-gray-400 mt-1">{MONTH_NAMES[MONTHS.indexOf(worstMonth as typeof MONTHS[number])]} {label2}</p>
                  </>
                ) : <p className="text-2xl font-bold text-gray-300">—</p>}
              </div>
            </div>
          )}

          {bdLoading ? (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border py-20 text-center text-gray-400">Loading...</div>
          ) : (
            <>
              {/* ── Grouped Bar + MoM Line Chart ── */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">Breakdown % — {label1} vs {label2}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-400 inline-block"/>{label1}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="flex gap-0.5">
                        <span className="w-1.5 h-3 rounded-sm bg-green-500 inline-block"/>
                        <span className="w-1.5 h-3 rounded-sm bg-yellow-500 inline-block"/>
                        <span className="w-1.5 h-3 rounded-sm bg-red-500 inline-block"/>
                      </span>
                      {label2}
                    </span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-0.5 bg-indigo-500 border-t-2 border-indigo-500"/>MoM ({label2})</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={380}>
                  <ComposedChart data={visibleBarData} margin={{top:20,right:60,left:0,bottom:5}} barGap={2} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{fontSize:11}} />
                    <YAxis yAxisId="bd" tickFormatter={v => v+"%"} tick={{fontSize:11}} domain={[0,"auto"]} />
                    <YAxis yAxisId="mom" orientation="right" tickFormatter={v => v+"%"} tick={{fontSize:11}} />
                    <Legend wrapperStyle={{fontSize:11}} />
                    <Tooltip
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg shadow-lg p-3 text-xs min-w-[210px]">
                            <p className="font-bold text-sm mb-2">{label}</p>
                            <div className="flex justify-between gap-6 mb-1">
                              <span className="text-slate-500">{label1}</span>
                              <span className="font-medium text-slate-600">{d[label1] != null ? d[label1]+"%" : "—"}</span>
                            </div>
                            <div className="flex justify-between gap-6 mb-1">
                              <span className="text-gray-700 font-medium">{label2}</span>
                              <span className={`font-bold ${d[label2] != null ? pctColor(d[label2]/100) : "text-gray-400"}`}>
                                {d[label2] != null ? d[label2]+"%" : "—"}
                              </span>
                            </div>
                            <div className="flex justify-between gap-6 mb-1">
                              <span className="text-purple-500 font-medium">YoY</span>
                              <span className={changeColor(d.yoy)}>{fmtChange(d.yoy)}</span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span className="text-indigo-500 font-medium">MoM</span>
                              <span className={changeColor(d.mom)}>{fmtChange(d.mom)}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine yAxisId="bd" y={10} stroke="#ef4444" strokeDasharray="4 2"
                      label={{value:"10%",position:"insideTopRight",fontSize:10,fill:"#ef4444"}} />
                    <ReferenceLine yAxisId="bd" y={5}  stroke="#f59e0b" strokeDasharray="4 2"
                      label={{value:"5%", position:"insideTopRight",fontSize:10,fill:"#f59e0b"}} />
                    <ReferenceLine yAxisId="mom" y={0} stroke="#818cf8" strokeDasharray="3 3" />
                    {/* Base year bar — flat gray */}
                    <Bar yAxisId="bd" dataKey={label1} name={label1} fill="#94a3b8" radius={[2,2,0,0]} maxBarSize={22} />
                    {/* Current year bar — colored by threshold */}
                    <Bar yAxisId="bd" dataKey={label2} name={label2} radius={[3,3,0,0]} maxBarSize={22}
                      label={{position:"top", fontSize:9, formatter:(v:any)=>v!=null&&v>0?v+"%":""}}>
                      {barChartData.map((entry, i) => (
                        <Cell key={i} fill={entry[label2] != null ? barFill(entry[label2]) : "#e2e8f0"} />
                      ))}
                    </Bar>
                    {/* MoM line — current year only */}
                    <Line yAxisId="mom" type="monotone" dataKey="mom" name={`MoM (${label2})`}
                      stroke="#6366f1" strokeWidth={2}
                      dot={{r:4, fill:"#6366f1", strokeWidth:0}}
                      activeDot={{r:6}}
                      connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* ── Pivot Table ── */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border overflow-x-auto">
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-zinc-800">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50 dark:bg-zinc-800 border-b border-r border-gray-200 dark:border-zinc-700 min-w-[90px]">Fleet</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-r border-gray-200 dark:border-zinc-700 whitespace-nowrap">Year</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 dark:border-zinc-700">Trucks</th>
                      {visibleMonths.map(mm => (
                        <th key={mm} className="px-3 py-3 text-center text-xs font-semibold text-gray-400 border-b border-gray-200 dark:border-zinc-700 min-w-[60px]">{MONTH_NAMES[MONTHS.indexOf(mm as typeof MONTHS[number])]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeFleets.map(g => {
                      const hasAny = visibleMonths.some(mm =>
                        pivot1[g]?.[`${mm}-${yy1}`] || pivot2[g]?.[`${mm}-${yy2}`]
                      );
                      if (!hasAny) return null;

                      const ms1 = visibleMonths.filter(mm => pivot1[g]?.[`${mm}-${yy1}`]);
                      const ms2 = visibleMonths.filter(mm => pivot2[g]?.[`${mm}-${yy2}`]);
                      const avg1 = ms1.length ? Math.round(ms1.reduce((s,mm)=>s+(pivot1[g][`${mm}-${yy1}`]?.truck_count??0),0)/ms1.length) : null;
                      const avg2 = ms2.length ? Math.round(ms2.reduce((s,mm)=>s+(pivot2[g][`${mm}-${yy2}`]?.truck_count??0),0)/ms2.length) : null;

                      return (
                        <Fragment key={g}>
                          {/* ── Year 1 row ── */}
                          <tr className="group">
                            <td rowSpan={2} className="px-4 sticky left-0 bg-white dark:bg-zinc-900 border-b-2 border-gray-200 dark:border-zinc-700 border-r border-gray-100 dark:border-zinc-800 align-middle">
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full shrink-0 ring-2 ring-offset-1 ring-white dark:ring-zinc-900" style={{backgroundColor:FLEET_COLORS[g]}} />
                                <span className="font-bold text-[13px] text-gray-800 dark:text-gray-100">{FLEET_MAP[g]}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center border-r border-gray-100 dark:border-zinc-800">
                              <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">{label1}</span>
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-slate-400 tabular-nums">{avg1 ?? "—"}</td>
                            {visibleMonths.map(mm => {
                              const cell = pivot1[g]?.[`${mm}-${yy1}`];
                              if (!cell) return <td key={mm} className="px-3 py-2 text-center text-xs text-gray-200 dark:text-zinc-700">—</td>;
                              const days = daysInMonthYear(`${mm}-${yy1}`);
                              const pct  = cell.truck_count*days > 0 ? cell.breakdown_count/(cell.truck_count*days) : 0;
                              return (
                                <td key={mm} className="px-3 py-2 text-center">
                                  <div className="text-xs text-slate-400 tabular-nums">{fmtPct(pct)}</div>
                                  <div className="text-[10px] text-slate-300 tabular-nums">{(cell.breakdown_count/days).toFixed(1)}</div>
                                </td>
                              );
                            })}
                          </tr>
                          {/* ── Year 2 row ── */}
                          <tr className="border-b-2 border-gray-200 dark:border-zinc-700 group">
                            <td className="px-3 py-2 text-center border-r border-gray-100 dark:border-zinc-800">
                              <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">{label2}</span>
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-500 tabular-nums">{avg2 ?? "—"}</td>
                            {visibleMonths.map(mm => {
                              const cell = pivot2[g]?.[`${mm}-${yy2}`];
                              if (!cell) return <td key={mm} className="px-3 py-2 text-center text-xs text-gray-200 dark:text-zinc-700">—</td>;
                              const days  = daysInMonthYear(`${mm}-${yy2}`);
                              const pct   = cell.truck_count*days > 0 ? cell.breakdown_count/(cell.truck_count*days) : 0;
                              const cell1 = pivot1[g]?.[`${mm}-${yy1}`];
                              const days1 = daysInMonthYear(`${mm}-${yy1}`);
                              const pct1  = cell1 && cell1.truck_count*days1 > 0 ? cell1.breakdown_count/(cell1.truck_count*days1) : null;
                              const diff  = pct1 != null ? pct - pct1 : null;
                              return (
                                <td key={mm} className={`px-3 py-2 text-center ${pctBg(pct)}`}>
                                  <div className="flex items-center justify-center gap-0.5">
                                    <span className={`text-xs font-semibold tabular-nums ${pctColor(pct)}`}>{fmtPct(pct)}</span>
                                    {diff != null && (
                                      <span className={`text-[10px] font-bold leading-none ${diff > 0 ? "text-red-500" : diff < 0 ? "text-green-500" : "text-gray-300"}`}>
                                        {diff > 0 ? "↑" : diff < 0 ? "↓" : "="}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-gray-400 tabular-nums">{(cell.breakdown_count/days).toFixed(1)}</div>
                                </td>
                              );
                            })}
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {/* ── YoY row ── */}
                    <tr>
                      <td colSpan={3} className="px-4 py-2 sticky left-0 bg-purple-50 dark:bg-purple-950/30 border-t-2 border-purple-100 dark:border-purple-900/30 border-r border-purple-100 dark:border-purple-900/30">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-400 inline-block"/>
                          <span className="text-xs font-bold text-purple-600 dark:text-purple-400">YoY — {label2} vs {label1}</span>
                        </div>
                      </td>
                      {visibleMonths.map(mm => {
                        const pt = barChartData[MONTHS.indexOf(mm as typeof MONTHS[number])];
                        return (
                          <td key={mm} className="px-3 py-2 text-center text-xs bg-purple-50/50 dark:bg-purple-950/20 border-t-2 border-purple-100 dark:border-purple-900/20">
                            {pt.yoy == null
                              ? <span className="text-gray-300">—</span>
                              : <span className={`font-semibold tabular-nums ${changeColor(pt.yoy)}`}>{fmtChange(pt.yoy)}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════ DETAIL TAB ══════════ */}
      {tab === "detail" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">End Date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Month Year (MM-YY)</label>
                <input type="text" placeholder="e.g. 01-25" value={monthYear} onChange={e => setMonthYear(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">License Plate</label>
                <input type="text" placeholder="Search plate..." value={licensePlate} onChange={e => setLicensePlate(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Plant</label>
                <input type="text" placeholder="Plant name..." value={plant} onChange={e => setPlant(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">สถานะ (Status)</label>
                <select value={status} onChange={e => setStatus(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700">
                  <option value="">ทั้งหมด</option>
                  <optgroup label="── ทำงาน ──">
                    <option value="A">A — ทำงานปกติ</option>
                    <option value="AX">AX — ระหว่างเดินทาง</option>
                    <option value="Aท">Aท — รถสำรองทำงานแทน</option>
                    <option value="Aอ">Aอ — รถโอน</option>
                    <option value="Aอส">Aอส — รถโอนสาย</option>
                    <option value="A75">A75 — ทำงาน 6 ชม.</option>
                    <option value="A50">A50 — ทำงาน 4 ชม.</option>
                    <option value="A25">A25 — ทำงาน 2 ชม.</option>
                  </optgroup>
                  <optgroup label="── ซ่อม ──">
                    <option value="B">B — รถซ่อมไม่มีพจส.</option>
                    <option value="BA">BA — รถซ่อมมีพจส.</option>
                    <option value="BAQ">BAQ — รถซ่อมมีคิว</option>
                    <option value="BY">BY — รถเบรกแย๊กโม่</option>
                    <option value="PM">PM — เช็คระยะตามรอบ</option>
                  </optgroup>
                  <optgroup label="── ว่าง ──">
                    <option value="อ">อ — รถจอด (อุบัติเหตุ)</option>
                    <option value="วซ">วซ — รถว่างรอซ่อม</option>
                    <option value="วA">วA — รถว่างรอดำเนินการ</option>
                    <option value="วร">วร — รถว่างรอสรรหา</option>
                    <option value="วล">วล — รถว่างพจส.ลาปกติ</option>
                    <option value="วก">วก — รถว่างพจส.ลากิจฉุกเฉิน</option>
                    <option value="วป">วป — รถว่างพจส.ลาป่วย</option>
                    <option value="วภ">วภ — รถว่างรอต่อภาษี</option>
                    <option value="X">X — ตกคิว/ไม่ได้งาน</option>
                    <option value="วส">วส — รถว่างพจส.อบรม/สอบ</option>
                    <option value="วพ">วพ — รถว่างพจส.ถูกพักงาน</option>
                    <option value="วข">วข — รถว่างพจส.ขาดงาน</option>
                    <option value="วฝ">วฝ — ว่างฝึกงาน</option>
                  </optgroup>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Group Status</label>
                <select value={groupStatus} onChange={e => setGroupStatus(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700">
                  <option value="">ทั้งหมด</option>
                  <option value="working">ทำงาน</option>
                  <option value="repair">ซ่อม</option>
                  <option value="idle">ว่าง</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Fleet Group</label>
                <select value={fleetGroupId} onChange={e => setFleetGroupId(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700">
                  <option value="">ทั้งหมด (All)</option>
                  {FLEET_ORDER.map(g => (
                    <option key={g} value={g}>{FLEET_MAP[g]} ({g})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setPage(1); fetchData(1); }}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">Search</button>
              <button onClick={() => {
                setStartDate("2025-01-01"); setEndDate(""); setMonthYear("");
                setPlant(""); setStatus(""); setGroupStatus(""); setLicensePlate(""); setFleetGroupId(""); setPage(1);
              }} className="px-4 py-2 border rounded text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 transition">Clear</button>
            </div>
          </div>

          {/* Active filter chips */}
          {(fleetGroupId || groupStatus || status || plant || licensePlate || monthYear || endDate) && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-gray-400 font-medium">Active filters:</span>
              {fleetGroupId && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Fleet: {FLEET_MAP[fleetGroupId] ?? fleetGroupId}</span>}
              {groupStatus  && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Group: {groupStatus}</span>}
              {status       && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Status: {status}</span>}
              {plant        && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Plant: {plant}</span>}
              {licensePlate && <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Plate: {licensePlate}</span>}
              {monthYear    && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Month: {monthYear}</span>}
              {endDate      && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">End: {endDate}</span>}
            </div>
          )}

          {/* Table header row */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{loading ? "Loading..." : `${total.toLocaleString()} records`}</p>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Rows per page:</span>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value) as 25|50|100); setPage(1); }}
                  className="border rounded px-2 py-1 text-sm dark:bg-zinc-800 dark:border-zinc-700">
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={handleExport} disabled={exporting || total === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50 transition">
                {exporting ? "Exporting..." : "Export CSV"}
              </button>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="bg-white dark:bg-zinc-900 rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 dark:bg-zinc-800">
                  {["ID","Fleet Group","License Plate","Plant","Customer","Status","Group Status","Date","Month Year"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">Loading...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">No records found</td></tr>
                ) : rows.map(row => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition">
                    <td className="px-3 py-2 text-gray-400">{row.id}</td>
                    <td className="px-3 py-2">{FLEET_MAP[row.fleet_group_id] ?? row.fleet_group_id}</td>
                    <td className="px-3 py-2 font-medium">{row.license_plate}</td>
                    <td className="px-3 py-2">{row.plant ?? "—"}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={row.customer ?? ""}>{row.customer ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                        title={STATUS_LABEL[row.status ?? ""] ?? ""}>
                        {row.status ?? "—"}
                      </span>
                      {STATUS_LABEL[row.status ?? ""] && (
                        <span className="ml-1 text-xs text-gray-400 hidden lg:inline">{STATUS_LABEL[row.status ?? ""]}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const g = deriveGroup(row.status, row.group_status);
                        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${GROUP_STYLE[g]}`}>{GROUP_LABEL[g]}</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateBKK(row.date)}</td>
                    <td className="px-3 py-2">{row.month_year ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Page {page} of {totalPages.toLocaleString()}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(1)} disabled={page===1} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800">«</button>
                <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800">‹</button>
                <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page===totalPages} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800">»</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
