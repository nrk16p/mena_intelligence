#!/usr/bin/env python3
"""Build app/budget-control/fleet-budget-2569.json for the "งบรายฟลีท" tab on /budget-control.

Repair/parts budget is split by truck age: cost per truck per year comes from analytics.truck_year_cost
(type × model year, 40 months; model years with fewer than 5 trucks use a weighted trend line on age),
each company truck gets that weight, and a budget group's money is shared by weight.
PM and tyre budgets are split by truck count only.

Inputs are files, nothing here touches a database:
  tyc.json  export of analytics.truck_year_cost
  vm.json   export of atms.vehiclemaster (ทะเบียน, ฟลีท, สาขา, ประเภทยานพาหนะ, ปี, ประเภทรถร่วม)
  xlsx      KPI 2026 ฝ่ายยานยนต์ workbook, sheet Budget_2026

  python3 scripts/budget-fleet-snapshot.py tyc.json vm.json "KPI 2026 - ฝ่ายยานยนต์ สระบุรี_ลาดกระบัง .xlsx" 2026-11-25
"""
import collections, json, sys
import pandas as pd

YEAR = 2026
tyc_path, vm_path, xlsx, as_of = sys.argv[1:5]
tyc = json.load(open(tyc_path)); vm = json.load(open(vm_path))

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

# ── company trucks → budget group + fleet ──
SKIP = {'รถขาย', 'รถว่าง', 'nan', 'None', ''}
OTHER_ML = {'ที.เอ็น.ซีเมนต์บล็อค', 'Acon', 'มหาทรัพย์ซีเมนต์', 'จิรโชติ', 'RP'}
def group_of(v):
    if v.get('ประเภทรถร่วม') != 'รถมีนา' or str(v.get('ฟลีท')) in SKIP or not v.get('ปี'): return None
    t, f, s = v.get('ประเภทยานพาหนะ') or '', v.get('ฟลีท'), v.get('สาขา')
    if t not in fit: return None
    if s == 'ลาดกระบัง' and t == 'Mixer 10 ล้อ': return 'ML', ('อื่น ๆ' if f in OTHER_ML else f)
    if s == 'ลาดกระบัง' and t == 'Mixer 6 ล้อ': return 'MS', f
    if 'ตู้เย็น 9.5' in t: return 'BOX-9.5', f
    if 'ตู้เย็น 7.5' in t: return 'BOX-7.5', f
    if s == 'สระบุรี':
        if f == 'SCCC': return 'TR-SCCC', 'SCCC'
        if f in ('BTG', 'TFG'): return 'TR-FEED', f
        if f == 'งานทั่วไป(สระบุรี)': return ('TR-SCCC', 'งานทั่วไป ปูนผง') if 'กล้วยหอม' in t else ('TR-SC', 'งานทั่วไป')
    return None

trucks = []
for v in vm:
    g = group_of(v)
    if g:
        y = int(v['ปี']); w, trend = cost(v['ประเภทยานพาหนะ'], y)
        trucks.append(dict(group=g[0], fleet=g[1], type=v['ประเภทยานพาหนะ'], age=YEAR - y, w=w, trend=trend))

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

out = dict(year=YEAR, as_of=as_of, source=dict(truck_year_cost='ม.ค. 66–พ.ค. 69 (40 เดือน)', budget='KPI 2026 ชีต Budget_2026', trucks=f'ATMS {as_of}'),
           groups=groups, types=types)
json.dump(out, open('app/budget-control/fleet-budget-2569.json', 'w'), ensure_ascii=False, indent=1)
print('groups', len(groups), 'trucks', len(trucks), 'types', len(types),
      'dec total', round(sum(g['repair'][11] + g['pm'][11] + g['tyre'][11] for g in groups)))
