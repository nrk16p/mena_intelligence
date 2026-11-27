#!/usr/bin/env python3
"""Build app/budget-control/fleet-budget-2569.json for the "งบรายฟลีท" tab on /budget-control.

Repair/parts budget is split by truck age: cost per truck per year comes from analytics.truck_year_cost
(type × model year, 40 months; model years with fewer than 5 trucks use a weighted trend line on age),
each company truck gets that weight, and a budget group's money is shared by weight.
PM and tyre budgets are split by truck count only.

Inputs are files, nothing here touches a database:
  tyc.json  export of analytics.truck_year_cost
  vm.json     export of atms.vehiclemaster (ทะเบียน, ประเภทยานพาหนะ, ปี, ประเภทรถร่วม): model year, type, owner
  avail.json  trucks of one month from the ATMS report vehicle.availability (หัว), pulled per fleet group + fleet:
              [{"group": "โม่ใหญ่", "fleet": "Asia", "plate": "สบ.71-2035"}, ...]  group = the report's กลุ่มฟลีท
  xlsx        KPI 2026 ฝ่ายยานยนต์ workbook, sheet Budget_2026

Trucks = company heads (รถมีนา) that appear in the report that month, whether they worked or sat in the shop.
Tails, partner trucks and placeholder plates are left out; a plate with several ATMS records counts once.

  python3 scripts/budget-fleet-snapshot.py tyc.json vm.json avail.json "KPI 2026 - ฝ่ายยานยนต์ สระบุรี_ลาดกระบัง .xlsx" 2026-11-26 "พ.ย. 69"
"""
import collections, json, re, sys
import pandas as pd

YEAR = 2026
tyc_path, vm_path, avail_path, xlsx, as_of, avail_month = sys.argv[1:7]
tyc = json.load(open(tyc_path)); vm = json.load(open(vm_path)); avail = json.load(open(avail_path))

# ── cost per truck per year by (type, model year) ──
curve, fit = {}, {}
for t in {r['ประเภทยานพาหนะ'] for r in tyc}:
    rs = [r for r in tyc if r['ประเภทยานพาหนะ'] == t]
    pts = [(YEAR - r['ปี'], r['avg_cost_per_ทะเบียน'] / 40 * 12, r['count_ทะเบียน']) for r in rs]
    W = sum(w for *_, w in pts); mx = sum(x * w for x, _, w in pts) / W; my = sum(y * w for _, y, w in pts) / W
    den = sum(w * (x - mx) ** 2 for x, _, w in pts)
    b = sum(w * (x - mx) * (y - my) for x, y, w in pts) / den if den else 0
    fit[t] = (my - b * mx, b, my)
    for r in rs: curve[(t, r['ปี'])] = (r['avg_cost_per_ทะเบียน'] / 40 * 12, r['count_ทะเบียน'])

def cost(t, y):
    c = curve.get((t, y))
    if c and c[1] >= 5: return c[0], False
    a, b, mean = fit[t]; v = a + b * (YEAR - y)
    return (v if v > 0 else mean), True

# ── company trucks → budget group + fleet, from the availability report ──
REPORT_GROUP = {'โม่ใหญ่': 'ML', 'โม่เล็ก': 'MS', 'SCCC': 'TR-SCCC', 'ตู้ผ้าใบ': 'TR-SC', 'BTG': 'TR-FEED', 'TFG': 'TR-FEED'}
TYPE_ALIAS = {'ลากจูง OIL ADBLUE': 'ลากจูง Oil'}  # no repair history of its own yet; same tractor as Oil
norm = lambda p: re.sub(r'\s', '', str(p or ''))
base = lambda p: re.sub(r'\(\d+\)$', '', norm(p))
# ATMS placeholders (JRC001-01-01, RP001-01-01, TPI.00-0000, สบ.00-0000 …) are not trucks.
def is_real_plate(p):
    s = base(p)
    return bool(re.fullmatch(r'[ก-ฮ]{1,3}\.\d{2}-\d{4}', s)) and '.00-' not in s

vmi = {norm(v.get('ทะเบียน')): v for v in vm}
def group_of(r, v):
    g, f, t = r['group'], r['fleet'], v.get('ประเภทยานพาหนะ') or ''
    if g in ('DHL', 'คูเน่'): return ('BOX-9.5' if 'ตู้เย็น 9.5' in t else 'BOX-7.5' if 'ตู้เย็น 7.5' in t else None), f
    gid = REPORT_GROUP.get(g)
    if gid == 'TR-SC': return gid, 'งานทั่วไป'
    return gid, f

trucks, seen, left_out = [], set(), collections.Counter()
for r in avail:
    if not is_real_plate(r['plate']): left_out['placeholder'] += 1; continue
    v = vmi.get(norm(r['plate'])) or vmi.get(base(r['plate'])) or {}
    if v.get('ประเภทรถร่วม') != 'รถมีนา': left_out['partner / not company'] += 1; continue
    gid, fleet = group_of(r, v)
    t = TYPE_ALIAS.get(v.get('ประเภทยานพาหนะ'), v.get('ประเภทยานพาหนะ'))
    if not gid or t not in fit or not v.get('ปี'): left_out[f'no group/type/year: {r["group"]} {t}'] += 1; continue
    if (gid, base(r['plate'])) in seen: continue  # same truck, another ATMS record
    seen.add((gid, base(r['plate'])))
    y = int(v['ปี']); w, trend = cost(t, y)
    trucks.append(dict(group=gid, fleet=fleet, type=t, age=YEAR - y, w=w, trend=trend))
print('left out', dict(left_out))

# ── budgets ──
df = pd.read_excel(xlsx, sheet_name='Budget_2026')
MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
cols = [f'BG {m} {YEAR}' for m in MONTHS]
df[cols] = df[cols].apply(pd.to_numeric, errors='coerce').fillna(0)
def monthly(accs): return [round(float(df[df.AccCode.isin(accs)][c].sum()), 2) for c in cols]
GROUPS = [  # id, label, branch, repair, PM, tyre accounts
    ('ML', 'ML · Mixer 10 ล้อ', 'ศลบ', [624102], [625102], [620502]),
    ('MS', 'MS · Mixer 6 ล้อ', 'ศลบ', [624103], [625103], [620503]),
    ('TR-SCCC', 'Trailer SCCC ปูนผง', 'สสบ', [624101], [625101], []),
    ('TR-SC', 'Trailer Side curtain', 'สสบ', [624110], [625108], []),
    ('TR-FEED', 'Trailer อาหารสัตว์', 'สสบ', [624114], [625112], [620512]),
    ('BOX-9.5', 'รถตู้เย็น 9.5 ม.', 'สสบ', [624112], [625110], [620510, 620609]),
    ('BOX-7.5', 'รถตู้เย็น 7.5 ม.', 'สสบ', [624113], [625111], [620511, 620610]),
]
SHARED_TYRE = monthly([620501])  # ค่ายาง - ขนส่ง → TR-SCCC + TR-SC by truck count
shared_n = sum(1 for t in trucks if t['group'] in ('TR-SCCC', 'TR-SC'))

def band(a): return '0–5' if a <= 5 else '6–10' if a <= 10 else '11–15' if a <= 15 else '16+'
groups = []
for gid, label, branch, rep, pm, ty in GROUPS:
    tt = [t for t in trucks if t['group'] == gid]; n = len(tt); W = sum(t['w'] for t in tt)
    tyre = monthly(ty)
    if gid in ('TR-SCCC', 'TR-SC'): tyre = [round(a + s * n / shared_n, 2) for a, s in zip(tyre, SHARED_TYRE)]
    bands = {b: dict(n=0, w=0.0) for b in ['0–5', '6–10', '11–15', '16+']}
    fleets = collections.defaultdict(lambda: dict(n=0, w=0.0, age=0))
    for t in tt:
        bands[band(t['age'])]['n'] += 1; bands[band(t['age'])]['w'] += t['w']
        f = fleets[t['fleet']]; f['n'] += 1; f['w'] += t['w']; f['age'] += t['age']
    groups.append(dict(
        id=gid, label=label, branch=branch, trucks=n, trend_priced=sum(t['trend'] for t in tt),
        repair=monthly(rep), pm=monthly(pm), tyre=tyre,
        bands=[dict(band=b, trucks=v['n'], share=round(v['w'] / W, 6) if W else 0) for b, v in bands.items()],
        fleets=[dict(fleet=k, trucks=v['n'], avg_age=round(v['age'] / v['n'], 1), repair_share=round(v['w'] / W, 6))
                for k, v in sorted(fleets.items(), key=lambda x: -x[1]['w'])],
    ))

# ── age table per vehicle type (straight from truck_year_cost) ──
types = []
for t in ['Mixer 10 ล้อ', 'Mixer 6 ล้อ'] + sorted({x['type'] for x in trucks} - {'Mixer 10 ล้อ', 'Mixer 6 ล้อ'}):
    rs = sorted([r for r in tyc if r['ประเภทยานพาหนะ'] == t], key=lambda r: -r['ปี'])
    types.append(dict(type=t, rows=[dict(year=r['ปี'], age=YEAR - r['ปี'], trucks=r['count_ทะเบียน'],
                                         per_month=round(r['avg_cost_per_ทะเบียน'] / 40, 2)) for r in rs]))

out = dict(year=YEAR, as_of=as_of, source=dict(truck_year_cost='ม.ค. 66–พ.ค. 69 (40 เดือน)', budget='KPI 2026 ชีต Budget_2026', trucks=f'ATMS รายงานความพร้อมใช้รถ {avail_month} (หัว รถบริษัท)'),
           groups=groups, types=types)
json.dump(out, open('app/budget-control/fleet-budget-2569.json', 'w'), ensure_ascii=False, indent=1)
print('groups', len(groups), 'trucks', len(trucks), 'types', len(types),
      'dec total', round(sum(g['repair'][11] + g['pm'][11] + g['tyre'][11] for g in groups)))
