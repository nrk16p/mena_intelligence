"use client";
import { useEffect, useState, useCallback } from "react";

// ── Config ────────────────────────────────────────────────────────────────────
const FLEET_ML  = "1";
const FLEET_MS  = "2";
const LB_WH     = ["ลาดกระบัง", "ขอนแก่น"];
const SB_WH     = ["สระบุรี", "DIST"];

const MONTH_SHORT: Record<string,string> = {
  "01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"May","06":"Jun",
  "07":"Jul","08":"Aug","09":"Sep","10":"Oct","11":"Nov","12":"Dec",
};
const ALL_MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysInMY(my: string) {
  const [mm, yy] = my.split("-");
  return new Date(2000 + parseInt(yy), parseInt(mm), 0).getDate();
}
function fmtM(n: number)  { return (n / 1e6).toFixed(2) + "M"; }
function fmtK(n: number)  { return Math.abs(n) >= 1e6 ? (n/1e6).toFixed(2)+"M" : Math.round(n/1e3)+"K"; }
function fmtPct(n: number, dp = 2) { return n.toFixed(dp) + "%"; }
function sign(n: number)  { return n > 0 ? "+" : ""; }

function bdColorClass(pct: number) {
  if (pct >= 10) return "red";
  if (pct >= 5)  return "amber";
  return "green";
}
function diffColorClass(n: number) {
  if (n > 0) return "red";
  if (n < 0) return "green";
  return "amber";
}
function riskBadge(type: "red"|"warn"|"ok"): {label: string; cls: string} {
  if (type === "red")  return { label: "HIGH RISK",  cls: "badge-red"   };
  if (type === "warn") return { label: "MID RANGE",  cls: "badge-amber" };
  return                      { label: "ON TRACK",   cls: "badge-green" };
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface BDRow  { fleet_group_id: string; month_year: string; truck_count: number; breakdown_count: number; }
interface CostRow { month_year: string; group_value: string; total_cost: number; }

// ── Main component ────────────────────────────────────────────────────────────
export default function FleetReportPage() {
  const [fromMM,  setFromMM]  = useState("01");
  const [toMM,    setToMM]    = useState("05");
  const [yy,      setYy]      = useState("26");
  const [yyBase,  setYyBase]  = useState("25");
  const [inputYy, setInputYy] = useState("26");
  const [inputBy, setInputBy] = useState("25");
  const [bd26,    setBd26]    = useState<BDRow[]>([]);
  const [bd25,    setBd25]    = useState<BDRow[]>([]);
  const [cost26,  setCost26]  = useState<CostRow[]>([]);
  const [cost25,  setCost25]  = useState<CostRow[]>([]);
  const [loading, setLoading] = useState(false);

  const doFetch = useCallback(async () => {
    setLoading(true);
    try {
      const cy = `20${yy}`, by = `20${yyBase}`;
      const [r1,r2,r3,r4] = await Promise.all([
        fetch(`/api/truck-utilize/breakdown?start=${fromMM}-${yy}&end=${toMM}-${yy}`),
        fetch(`/api/truck-utilize/breakdown?start=${fromMM}-${yyBase}&end=${toMM}-${yyBase}`),
        fetch(`/api/cost/summary?group_by=${encodeURIComponent("คลังสินค้า")}&start=${cy}-${fromMM}&end=${cy}-${toMM}`),
        fetch(`/api/cost/summary?group_by=${encodeURIComponent("คลังสินค้า")}&start=${by}-${fromMM}&end=${by}-${toMM}`),
      ]);
      const [j1,j2,j3,j4] = await Promise.all([r1.json(),r2.json(),r3.json(),r4.json()]);
      if (j1.success) setBd26(j1.data);
      if (j2.success) setBd25(j2.data);
      const mapCost = (d: any[]) => d.map(r => ({month_year: r.month_year, group_value: r.group_value ?? r.warehouse, total_cost: r.total_cost}));
      if (j3.success) setCost26(mapCost(j3.data));
      if (j4.success) setCost25(mapCost(j4.data));
    } finally { setLoading(false); }
  }, [fromMM, toMM, yy, yyBase]);

  useEffect(() => { doFetch(); }, [doFetch]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const cy          = `20${yy}`;
  const by          = `20${yyBase}`;
  const monthRange  = ALL_MONTHS.filter(mm => mm >= fromMM && mm <= toMM);

  function getBD(data: BDRow[], fleet: string, mm: string, yyS: string) {
    const r = data.find(r => String(r.fleet_group_id) === fleet && r.month_year === `${mm}-${yyS}`);
    if (!r || !Number(r.truck_count)) return null;
    return Number(r.breakdown_count) / (Number(r.truck_count) * daysInMY(`${mm}-${yyS}`)) * 100;
  }
  function getTrucks(data: BDRow[], fleet: string, mm: string, yyS: string) {
    return Number(data.find(r => String(r.fleet_group_id) === fleet && r.month_year === `${mm}-${yyS}`)?.truck_count ?? 0);
  }
  function costMo(data: CostRow[], whs: string[], cyS: string, mm: string) {
    return data.filter(r => whs.includes(r.group_value ?? "") && r.month_year === `${cyS}-${mm}`)
               .reduce((s,r) => s + Number(r.total_cost), 0);
  }
  function costYTD(data: CostRow[], whs: string[]) {
    return data.filter(r => whs.includes(r.group_value ?? "")).reduce((s,r) => s + Number(r.total_cost), 0);
  }

  // BD monthly rows
  const mlRows = monthRange.map(mm => {
    const p26 = getBD(bd26, FLEET_ML, mm, yy);
    const p25 = getBD(bd25, FLEET_ML, mm, yyBase);
    const yoy = p26 != null && p25 != null && p25 > 0 ? (p26-p25)/p25*100 : null;
    return { mm, p26, p25, yoy };
  });
  const msRows = monthRange.map(mm => {
    const p26 = getBD(bd26, FLEET_MS, mm, yy);
    const p25 = getBD(bd25, FLEET_MS, mm, yyBase);
    const yoy = p26 != null && p25 != null && p25 > 0 ? (p26-p25)/p25*100 : null;
    return { mm, p26, p25, yoy };
  });

  // Averages & totals
  const avg = (arr: (number|null)[]) => { const v = arr.filter((x): x is number => x != null); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0; };
  const mlAvg   = avg(mlRows.map(r=>r.p26));
  const msAvg   = avg(msRows.map(r=>r.p26));
  const mlYoyAvg = avg(mlRows.map(r=>r.yoy));
  const msYoyAvg = avg(msRows.map(r=>r.yoy));
  const mlBest   = mlRows.filter(r=>r.p26!=null).reduce((b,r)=>r.p26!<(b.p26??Infinity)?r:b, mlRows[0]);
  const mlWorst  = mlRows.filter(r=>r.p26!=null).reduce((w,r)=>r.p26!>(w.p26??-1)?r:w, mlRows[0]);
  const msBest   = msRows.filter(r=>r.p26!=null).reduce((b,r)=>r.p26!<(b.p26??Infinity)?r:b, msRows[0]);
  const msWorst  = msRows.filter(r=>r.p26!=null).reduce((w,r)=>r.p26!>(w.p26??-1)?r:w, msRows[0]);
  const mlTrucks = monthRange.map(mm => getTrucks(bd26, FLEET_ML, mm, yy)).filter(Boolean);
  const msTrucks = monthRange.map(mm => getTrucks(bd26, FLEET_MS, mm, yy)).filter(Boolean);
  const mlBD26   = bd26.filter(r=>String(r.fleet_group_id)===FLEET_ML).reduce((s,r)=>s+Number(r.breakdown_count),0);
  const msBD26   = bd26.filter(r=>String(r.fleet_group_id)===FLEET_MS).reduce((s,r)=>s+Number(r.breakdown_count),0);

  // Cost rows
  const lbRows = monthRange.map(mm => {
    const c26 = costMo(cost26, LB_WH, cy, mm);
    const c25 = costMo(cost25, LB_WH, by, mm);
    return { mm, c26, diff: c26-c25, pct: c25>0?(c26-c25)/c25*100:0 };
  });
  const sbRows = monthRange.map(mm => {
    const c26 = costMo(cost26, SB_WH, cy, mm);
    const c25 = costMo(cost25, SB_WH, by, mm);
    return { mm, c26, diff: c26-c25, pct: c25>0?(c26-c25)/c25*100:0 };
  });
  const lbYTD26 = costYTD(cost26, LB_WH), lbYTD25 = costYTD(cost25, LB_WH);
  const sbYTD26 = costYTD(cost26, SB_WH), sbYTD25 = costYTD(cost25, SB_WH);
  const lbPct   = lbYTD25>0?(lbYTD26-lbYTD25)/lbYTD25*100:0;
  const sbPct   = sbYTD25>0?(sbYTD26-sbYTD25)/sbYTD25*100:0;

  // Risk classification
  const mlRisk: "red"|"warn"|"ok" = mlAvg>=10?"red":mlAvg>=7.5?"warn":"ok";
  const msRisk: "red"|"warn"|"ok" = msAvg>=8?"red":msAvg>=5.5?"warn":"ok";
  const lbRisk: "red"|"warn"|"ok" = lbPct>5?"red":lbPct>-5?"warn":"ok";
  const sbRisk: "red"|"warn"|"ok" = sbPct>5?"red":sbPct>-5?"warn":"ok";

  // Auto insights
  const insights = [
    {
      type: mlRisk,
      title: mlRisk==="red"?"ML Fleet — Critical":mlRisk==="warn"?"ML Fleet — Monitor":"ML Fleet — On Track",
      body: `Avg BD ${fmtPct(mlAvg)}, YoY ${sign(mlYoyAvg)}${fmtPct(mlYoyAvg,1)}. ${mlRows.filter(r=>r.p26!=null&&r.p26>=10).length} month(s) above 10%. Fleet ${mlTrucks[0]??"-"}→${mlTrucks[mlTrucks.length-1]??"-"} trucks. ${mlBD26.toLocaleString()} events total.`,
    },
    {
      type: msRisk,
      title: msRisk==="red"?"MS Fleet — Critical":msRisk==="warn"?"MS Fleet — Monitor":"MS Fleet — On Track",
      body: `Avg BD ${fmtPct(msAvg)}, YoY ${sign(msYoyAvg)}${fmtPct(msYoyAvg,1)}. Best: ${MONTH_SHORT[msBest?.mm??"01"]} ${msBest?.p26!=null?fmtPct(msBest.p26):"-"}. Worst: ${MONTH_SHORT[msWorst?.mm??"01"]} ${msWorst?.p26!=null?fmtPct(msWorst.p26):"-"}. ${msBD26.toLocaleString()} events.`,
    },
    {
      type: lbRisk,
      title: lbRisk==="red"?"ลาดกระบัง & ขอนแก่น — Over Budget":lbRisk==="warn"?"ลาดกระบัง & ขอนแก่น — Near Target":"ลาดกระบัง & ขอนแก่น — Good",
      body: `YTD ${sign(lbPct)}${fmtPct(lbPct,1)} vs LY (${fmtM(lbYTD26)} vs ${fmtM(lbYTD25)}). Worst month: ${MONTH_SHORT[lbRows.reduce((w,r)=>r.pct>w.pct?r:w,lbRows[0])?.mm??"01"]} ${sign(lbRows.reduce((w,r)=>r.pct>w.pct?r:w,lbRows[0])?.pct??0)}${fmtPct(lbRows.reduce((w,r)=>r.pct>w.pct?r:w,lbRows[0])?.pct??0,1)}.`,
    },
    {
      type: sbRisk,
      title: sbRisk==="red"?"สระบุรี & DIST — Over Budget":sbRisk==="warn"?"สระบุรี & DIST — Near Target":"สระบุรี & DIST — Good",
      body: `YTD ${sign(sbPct)}${fmtPct(sbPct,1)} vs LY (${fmtM(sbYTD26)} vs ${fmtM(sbYTD25)}). ${sbYTD26>sbYTD25?`Overrun: ${fmtM(sbYTD26-sbYTD25)}.`:`Saving: ${fmtM(sbYTD25-sbYTD26)}.`} Worst: ${MONTH_SHORT[sbRows.reduce((w,r)=>r.pct>w.pct?r:w,sbRows[0])?.mm??"01"]} ${sign(sbRows.reduce((w,r)=>r.pct>w.pct?r:w,sbRows[0])?.pct??0)}${fmtPct(sbRows.reduce((w,r)=>r.pct>w.pct?r:w,sbRows[0])?.pct??0,1)}.`,
    },
  ];

  const periodLabel = `${MONTH_SHORT[fromMM]} – ${MONTH_SHORT[toMM]} ${cy}`;

  return (
    <div className="min-h-screen bg-[#f0f0f0] dark:bg-zinc-950 p-6 print:bg-white print:p-0">

      {/* ── Controls ── */}
      <div className="print:hidden mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold text-gray-700 dark:text-gray-200 mr-1">Fleet Report</h1>

        <div className="flex items-center gap-1 rounded-lg border bg-white dark:bg-zinc-800 px-3 py-2 text-sm shadow-sm">
          <span className="text-gray-400 text-xs">Base</span>
          <input value={`20${inputBy}`} onChange={e => setInputBy(e.target.value.slice(-2))}
            className="w-12 text-center font-bold bg-transparent focus:outline-none text-gray-600 dark:text-gray-300" />
          <span className="text-gray-300 mx-1 text-xs">vs</span>
          <input value={`20${inputYy}`} onChange={e => setInputYy(e.target.value.slice(-2))}
            className="w-12 text-center font-bold bg-transparent focus:outline-none text-blue-600" />
        </div>

        <div className="flex items-center gap-1 rounded-lg border bg-white dark:bg-zinc-800 px-3 py-2 text-sm shadow-sm">
          <span className="text-gray-400 text-xs">From</span>
          <select value={fromMM} onChange={e => setFromMM(e.target.value)}
            className="font-semibold bg-transparent border-none focus:outline-none text-gray-700 dark:text-gray-200 cursor-pointer text-sm">
            {Object.entries(MONTH_SHORT).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="text-gray-300 text-xs">→</span>
          <select value={toMM} onChange={e => setToMM(e.target.value)}
            className="font-semibold bg-transparent border-none focus:outline-none text-gray-700 dark:text-gray-200 cursor-pointer text-sm">
            {Object.entries(MONTH_SHORT).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <button onClick={() => { setYy(inputYy); setYyBase(inputBy); }}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-sm">
          Apply
        </button>
        <button onClick={() => window.print()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm ml-auto">
          🖨 Export PDF
        </button>
      </div>

      {loading && <div className="print:hidden text-center py-10 text-gray-400 text-sm">Loading…</div>}

      {/* ── Slide wrapper — scales 680×382 to fit screen ── */}
      {!loading && (
        <div className="flex justify-center">
          <div style={{width:"100%", maxWidth:"1360px"}}>
            {/* scale container: render at 680px, zoom 2× for display */}
            <div style={{position:"relative", paddingBottom:"56.18%"}}>
              <div style={{position:"absolute", top:0, left:0, width:"200%", height:"200%", transform:"scale(0.5)", transformOrigin:"top left"}}>

                {/* ══ SLIDE 680×382 ══ */}
                <div style={{
                  width:"1360px", height:"764px",
                  background:"#ffffff", fontFamily:"'Inter',ui-sans-serif,system-ui,sans-serif",
                  color:"#1a1a1a", padding:"32px 40px",
                  display:"grid", gridTemplateRows:"auto auto 1fr auto", gap:"16px",
                  boxSizing:"border-box",
                }}>

                  {/* ── HEADER ── */}
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", borderBottom:"1px solid #e5e7eb", paddingBottom:"12px"}}>
                    <span style={{fontSize:"30px", fontWeight:500}}>Fleet Performance &amp; Cost Summary — {cy} vs {by}</span>
                    <span style={{fontSize:"20px", color:"#6b7280"}}>{periodLabel} &nbsp;|&nbsp; Base: {by}</span>
                  </div>

                  {/* ── KPI ROW ── */}
                  <div style={{display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:"14px"}}>
                    {[
                      { label:`Avg BD% — ML Fleet`, value: mlAvg>0?fmtPct(mlAvg):"—", valColor: bdColorClass(mlAvg), sub: mlYoyAvg!==0?`${sign(mlYoyAvg)}${fmtPct(mlYoyAvg,1)} YoY  |  ${mlBD26.toLocaleString()} events`:"—", subColor: mlYoyAvg>0?"red":"green" },
                      { label:`Avg BD% — MS Fleet`, value: msAvg>0?fmtPct(msAvg):"—", valColor: bdColorClass(msAvg), sub: msYoyAvg!==0?`${sign(msYoyAvg)}${fmtPct(msYoyAvg,1)} YoY  |  ${msBD26.toLocaleString()} events`:"—", subColor: msYoyAvg>0?"red":"green" },
                      { label:`YTD Cost — ลาดกระบัง & ขอนแก่น`, value: lbYTD26>0?fmtM(lbYTD26):"—", valColor: lbRisk==="red"?"red":lbRisk==="warn"?"amber":"green", sub: lbPct!==0?`${sign(lbPct)}${fmtPct(lbPct,1)} vs LY  |  Base: ${fmtM(lbYTD25)}`:"—", subColor: lbPct>0?"red":lbPct<0?"green":"amber" },
                      { label:`YTD Cost — สระบุรี & DIST`, value: sbYTD26>0?fmtM(sbYTD26):"—", valColor: sbRisk==="red"?"red":sbRisk==="warn"?"amber":"green", sub: sbPct!==0?`${sign(sbPct)}${fmtPct(sbPct,1)} vs LY  |  Base: ${fmtM(sbYTD25)}`:"—", subColor: sbPct>0?"red":sbPct<0?"green":"amber" },
                    ].map((kpi, i) => (
                      <div key={i} style={{background:"#f9fafb", borderRadius:"12px", padding:"12px 18px"}}>
                        <div style={{fontSize:"18px", color:"#6b7280", marginBottom:"4px"}}>{kpi.label}</div>
                        <div style={{fontSize:"34px", fontWeight:500, lineHeight:1, color: kpi.valColor==="red"?"#E24B4A":kpi.valColor==="amber"?"#BA7517":"#3B6D11"}}>{kpi.value}</div>
                        <div style={{fontSize:"18px", marginTop:"4px", color: kpi.subColor==="red"?"#E24B4A":kpi.subColor==="green"?"#3B6D11":"#BA7517"}}>{kpi.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* ── MAIN GRID (4 cards) ── */}
                  <div style={{display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:"14px"}}>

                    {/* ML Fleet card */}
                    <div style={{background:"#fff", border:"1px solid #e5e7eb", borderRadius:"16px", padding:"14px 18px", overflow:"hidden"}}>
                      <div style={{fontSize:"20px", fontWeight:500, marginBottom:"10px", display:"flex", alignItems:"center", gap:"8px"}}>
                        ML Fleet
                        <span style={{fontSize:"18px", padding:"2px 10px", borderRadius:"6px", fontWeight:500,
                          background: mlRisk==="red"?"#FCEBEB":mlRisk==="warn"?"#FAEEDA":"#EAF3DE",
                          color:      mlRisk==="red"?"#A32D2D":mlRisk==="warn"?"#854F0B":"#3B6D11"}}>
                          {riskBadge(mlRisk).label}
                        </span>
                      </div>
                      {[
                        { label:"Best",   val: mlBest?.p26!=null  ? `${MONTH_SHORT[mlBest.mm]}  — ${fmtPct(mlBest.p26)}`  : "—", color:"green" },
                        { label:"Worst",  val: mlWorst?.p26!=null ? `${MONTH_SHORT[mlWorst.mm]} — ${fmtPct(mlWorst.p26)}` : "—", color:"red"   },
                        { label:"Trucks", val: mlTrucks.length ? `${mlTrucks[0]} → ${mlTrucks[mlTrucks.length-1]}` : "—", color:"" },
                      ].map(row => (
                        <div key={row.label} style={{display:"flex", justifyContent:"space-between", fontSize:"19px", padding:"4px 0", borderBottom:"1px solid #f3f4f6"}}>
                          <span style={{color:"#9ca3af"}}>{row.label}</span>
                          <span style={{color: row.color==="green"?"#3B6D11":row.color==="red"?"#E24B4A":"#1a1a1a"}}>{row.val}</span>
                        </div>
                      ))}
                      <table style={{width:"100%", borderCollapse:"collapse", fontSize:"20px", marginTop:"8px"}}>
                        <thead>
                          <tr>
                            {["Mo",cy.slice(2),by.slice(2),"YoY"].map(h=>(
                              <th key={h} style={{textAlign:"left", fontWeight:500, color:"#9ca3af", fontSize:"18px", padding:"4px 8px", borderBottom:"1px solid #e5e7eb"}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {mlRows.map(r => (
                            <tr key={r.mm}>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6"}}>{MONTH_SHORT[r.mm]}</td>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6", color: r.p26!=null?( r.p26>=10?"#E24B4A":r.p26>=5?"#BA7517":"#3B6D11" ):"#9ca3af"}}>{r.p26!=null?fmtPct(r.p26):"—"}</td>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6", color:"#6b7280"}}>{r.p25!=null?fmtPct(r.p25):"—"}</td>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6", color: r.yoy!=null?(r.yoy>0?"#E24B4A":"#3B6D11"):"#9ca3af"}}>{r.yoy!=null?`${sign(r.yoy)}${fmtPct(r.yoy,0)}`:"—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* MS Fleet card */}
                    <div style={{background:"#fff", border:"1px solid #e5e7eb", borderRadius:"16px", padding:"14px 18px", overflow:"hidden"}}>
                      <div style={{fontSize:"20px", fontWeight:500, marginBottom:"10px", display:"flex", alignItems:"center", gap:"8px"}}>
                        MS Fleet
                        <span style={{fontSize:"18px", padding:"2px 10px", borderRadius:"6px", fontWeight:500,
                          background: msRisk==="red"?"#FCEBEB":msRisk==="warn"?"#FAEEDA":"#EAF3DE",
                          color:      msRisk==="red"?"#A32D2D":msRisk==="warn"?"#854F0B":"#3B6D11"}}>
                          {riskBadge(msRisk).label}
                        </span>
                      </div>
                      {[
                        { label:"Best",   val: msBest?.p26!=null  ? `${MONTH_SHORT[msBest.mm]}  — ${fmtPct(msBest.p26)}`  : "—", color:"green" },
                        { label:"Worst",  val: msWorst?.p26!=null ? `${MONTH_SHORT[msWorst.mm]} — ${fmtPct(msWorst.p26)}` : "—", color:"red"   },
                        { label:"Trucks", val: msTrucks.length ? `${msTrucks[0]} → ${msTrucks[msTrucks.length-1]}` : "—", color:"" },
                      ].map(row => (
                        <div key={row.label} style={{display:"flex", justifyContent:"space-between", fontSize:"19px", padding:"4px 0", borderBottom:"1px solid #f3f4f6"}}>
                          <span style={{color:"#9ca3af"}}>{row.label}</span>
                          <span style={{color: row.color==="green"?"#3B6D11":row.color==="red"?"#E24B4A":"#1a1a1a"}}>{row.val}</span>
                        </div>
                      ))}
                      <table style={{width:"100%", borderCollapse:"collapse", fontSize:"20px", marginTop:"8px"}}>
                        <thead>
                          <tr>
                            {["Mo",cy.slice(2),by.slice(2),"YoY"].map(h=>(
                              <th key={h} style={{textAlign:"left", fontWeight:500, color:"#9ca3af", fontSize:"18px", padding:"4px 8px", borderBottom:"1px solid #e5e7eb"}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {msRows.map(r => (
                            <tr key={r.mm}>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6"}}>{MONTH_SHORT[r.mm]}</td>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6", color: r.p26!=null?(r.p26>=10?"#E24B4A":r.p26>=5?"#BA7517":"#3B6D11"):"#9ca3af"}}>{r.p26!=null?fmtPct(r.p26):"—"}</td>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6", color:"#6b7280"}}>{r.p25!=null?fmtPct(r.p25):"—"}</td>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6", color: r.yoy!=null?(r.yoy>0?"#E24B4A":"#3B6D11"):"#9ca3af"}}>{r.yoy!=null?`${sign(r.yoy)}${fmtPct(r.yoy,0)}`:"—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* LB Cost card */}
                    <div style={{background:"#fff", border:"1px solid #e5e7eb", borderRadius:"16px", padding:"14px 18px", overflow:"hidden"}}>
                      <div style={{fontSize:"20px", fontWeight:500, marginBottom:"10px", display:"flex", alignItems:"center", gap:"8px"}}>
                        ลาดกระบัง &amp; ขอนแก่น
                        <span style={{fontSize:"18px", padding:"2px 10px", borderRadius:"6px", fontWeight:500,
                          background: lbRisk==="red"?"#FCEBEB":lbRisk==="warn"?"#FAEEDA":"#EAF3DE",
                          color:      lbRisk==="red"?"#A32D2D":lbRisk==="warn"?"#854F0B":"#3B6D11"}}>
                          {sign(lbPct)}{fmtPct(lbPct,1)}
                        </span>
                      </div>
                      {[
                        { label:`YTD ${cy}`, val: fmtM(lbYTD26), color: lbRisk==="red"?"red":lbRisk==="warn"?"amber":"" },
                        { label:`YTD ${by}`, val: fmtM(lbYTD25), color:"" },
                      ].map(row => (
                        <div key={row.label} style={{display:"flex", justifyContent:"space-between", fontSize:"19px", padding:"4px 0", borderBottom:"1px solid #f3f4f6"}}>
                          <span style={{color:"#9ca3af"}}>{row.label}</span>
                          <span style={{fontWeight:500, color: row.color==="red"?"#E24B4A":row.color==="amber"?"#BA7517":"#1a1a1a"}}>{row.val}</span>
                        </div>
                      ))}
                      <table style={{width:"100%", borderCollapse:"collapse", fontSize:"20px", marginTop:"8px"}}>
                        <thead>
                          <tr>
                            {["Mo",cy.slice(2),"Diff","%"].map(h=>(
                              <th key={h} style={{textAlign:"left", fontWeight:500, color:"#9ca3af", fontSize:"18px", padding:"4px 8px", borderBottom:"1px solid #e5e7eb"}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lbRows.map(r => (
                            <tr key={r.mm}>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6"}}>{MONTH_SHORT[r.mm]}</td>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6"}}>{r.c26>0?fmtM(r.c26):"—"}</td>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6", color: r.diff>0?"#E24B4A":r.diff<0?"#3B6D11":"#BA7517"}}>{r.c26>0?`${r.diff<0?"–":"+"}${fmtK(Math.abs(r.diff))}`:"—"}</td>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6", color: r.pct>0?"#E24B4A":r.pct<0?"#3B6D11":"#BA7517"}}>{r.c26>0?`${sign(r.pct)}${fmtPct(r.pct,1)}`:"—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* SB Cost card */}
                    <div style={{background:"#fff", border:"1px solid #e5e7eb", borderRadius:"16px", padding:"14px 18px", overflow:"hidden"}}>
                      <div style={{fontSize:"20px", fontWeight:500, marginBottom:"10px", display:"flex", alignItems:"center", gap:"8px"}}>
                        สระบุรี &amp; DIST
                        <span style={{fontSize:"18px", padding:"2px 10px", borderRadius:"6px", fontWeight:500,
                          background: sbRisk==="red"?"#FCEBEB":sbRisk==="warn"?"#FAEEDA":"#EAF3DE",
                          color:      sbRisk==="red"?"#A32D2D":sbRisk==="warn"?"#854F0B":"#3B6D11"}}>
                          {sign(sbPct)}{fmtPct(sbPct,1)}
                        </span>
                      </div>
                      {[
                        { label:`YTD ${cy}`, val: fmtM(sbYTD26), color: sbRisk==="red"?"red":"" },
                        { label:`YTD ${by}`, val: fmtM(sbYTD25), color:"" },
                      ].map(row => (
                        <div key={row.label} style={{display:"flex", justifyContent:"space-between", fontSize:"19px", padding:"4px 0", borderBottom:"1px solid #f3f4f6"}}>
                          <span style={{color:"#9ca3af"}}>{row.label}</span>
                          <span style={{fontWeight:500, color: row.color==="red"?"#E24B4A":"#1a1a1a"}}>{row.val}</span>
                        </div>
                      ))}
                      <table style={{width:"100%", borderCollapse:"collapse", fontSize:"20px", marginTop:"8px"}}>
                        <thead>
                          <tr>
                            {["Mo",cy.slice(2),"Diff","%"].map(h=>(
                              <th key={h} style={{textAlign:"left", fontWeight:500, color:"#9ca3af", fontSize:"18px", padding:"4px 8px", borderBottom:"1px solid #e5e7eb"}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sbRows.map(r => (
                            <tr key={r.mm}>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6"}}>{MONTH_SHORT[r.mm]}</td>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6"}}>{r.c26>0?fmtM(r.c26):"—"}</td>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6", color: r.diff>0?"#E24B4A":r.diff<0?"#3B6D11":"#BA7517"}}>{r.c26>0?`${r.diff<0?"–":"+"}${fmtK(Math.abs(r.diff))}`:"—"}</td>
                              <td style={{padding:"5px 8px", borderBottom:"1px solid #f3f4f6", color: r.pct>0?"#E24B4A":r.pct<0?"#3B6D11":"#BA7517"}}>{r.c26>0?`${sign(r.pct)}${fmtPct(r.pct,1)}`:"—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                  </div>{/* /main-grid */}

                  {/* ── INSIGHTS ── */}
                  <div style={{display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:"14px"}}>
                    {insights.map((ins, i) => (
                      <div key={i} style={{
                        borderLeft: `4px solid ${ins.type==="red"?"#E24B4A":ins.type==="warn"?"#BA7517":"#639922"}`,
                        background:"#f9fafb", borderRadius:"0 10px 10px 0",
                        padding:"10px 14px", fontSize:"18px", lineHeight:1.5,
                      }}>
                        <strong style={{fontWeight:500, display:"block", marginBottom:"2px", fontSize:"19px"}}>{ins.title}</strong>
                        {ins.body}
                      </div>
                    ))}
                  </div>

                </div>{/* /slide */}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { size: 680px 382px; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
