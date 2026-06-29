export interface GarageOutStatus {
  waiting_assessment: number
  waiting_approval: number
  waiting_parts: number
  in_progress: number
  completed: number
}

export interface GarageStatus {
  waiting_queue: number
  in_repair: number
  waiting_parts: number
  waiting_qc: number
  on_hold: number
}

export interface NextDayPlan {
  target_complete: number
  urgent_close: number
  urgent_parts: number
  team_reallocation: number
  support_needed: string
}

export interface VSRecord {
  date: string
  opening_backlog: number
  new_repairs: number
  completed_today: number
  closing_backlog: number
  backlog_change: number
  completed_in: number
  completed_out: number
  garage_in_count: number
  garage_out_count: number
  garage_out_status: GarageOutStatus
  vs_followup_count: number
  notes: string
  created_at?: Date
  updated_at?: Date
}

export interface GarageRecord {
  date: string
  opening_backlog: number
  received_today: number
  completed_today: number
  closing_backlog: number
  backlog_change: number
  status: GarageStatus
  overdue_count: number
  next_day: NextDayPlan
  created_at?: Date
  updated_at?: Date
}

export interface DailyTemplate {
  type: "vs" | "garage"
  template_text: string
  updated_at?: Date
}

export function toThaiDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-")
  return `${parseInt(d)}/${parseInt(m)}/${parseInt(y) + 543}`
}

export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "")
}

export function vsToTemplateVars(r: VSRecord): Record<string, string> {
  const change = r.backlog_change
  return {
    date_thai: toThaiDate(r.date),
    opening_backlog: String(r.opening_backlog),
    new_repairs: String(r.new_repairs),
    completed_today: String(r.completed_today),
    closing_backlog: String(r.closing_backlog),
    backlog_change: change >= 0 ? `+${change}` : String(change),
    backlog_change_abs: String(Math.abs(change)),
    completed_in: String(r.completed_in),
    completed_out: String(r.completed_out),
    garage_in_count: String(r.garage_in_count),
    garage_out_count: String(r.garage_out_count),
    waiting_assessment: String(r.garage_out_status.waiting_assessment),
    waiting_approval: String(r.garage_out_status.waiting_approval),
    waiting_parts: String(r.garage_out_status.waiting_parts),
    in_progress: String(r.garage_out_status.in_progress),
    out_completed: String(r.garage_out_status.completed),
    vs_followup_count: String(r.vs_followup_count),
    notes: r.notes,
  }
}

export function garageToTemplateVars(r: GarageRecord): Record<string, string> {
  const change = r.backlog_change
  return {
    date_thai: toThaiDate(r.date),
    opening_backlog: String(r.opening_backlog),
    received_today: String(r.received_today),
    completed_today: String(r.completed_today),
    closing_backlog: String(r.closing_backlog),
    backlog_change: change >= 0 ? `+${change}` : String(change),
    waiting_queue: String(r.status.waiting_queue),
    in_repair: String(r.status.in_repair),
    waiting_parts: String(r.status.waiting_parts),
    waiting_qc: String(r.status.waiting_qc),
    on_hold: String(r.status.on_hold),
    overdue_count: String(r.overdue_count),
    target_complete: String(r.next_day.target_complete),
    urgent_close: String(r.next_day.urgent_close),
    urgent_parts: String(r.next_day.urgent_parts),
    team_reallocation: String(r.next_day.team_reallocation),
    support_needed: r.next_day.support_needed || "………………………………………",
  }
}

export const DEFAULT_VS_TEMPLATE = `📌 รายงานสรุปการแจ้งซ่อมทั้งหมด โดย VS
ประจำวันที่ {{date_thai}}

🔷 สรุปภาพรวมงานแจ้งซ่อม

🚗 คงค้างต้นวัน : {{opening_backlog}}  คัน
📥 รับแจ้งซ่อมใหม่วันนี้ : {{new_repairs}} คัน
✅ ซ่อมเสร็จส่งมอบวันนี้ : {{completed_today}} คัน
📌 คงค้างสิ้นวันรวม: {{closing_backlog}} คัน

📊 Backlog ลด : {{backlog_change_abs}} คัน
สาเหตุภาพรวม : อู่ในเสร็จ {{completed_in}} คัน อู่นอกเสร็จ {{completed_out}} คัน

🔧 แยกคงค้างสิ้นวัน

🏭 อู่ใน : {{garage_in_count}} คัน
↗️ อู่นอก : {{garage_out_count}} คัน
รวมคงค้างสิ้นวัน : {{closing_backlog}} คัน


↗️ สถานะอู่นอก

* รอประเมิน : {{waiting_assessment}} คัน
* รออนุมัติซ่อม : {{waiting_approval}} คัน
* รออะไหล่ : {{waiting_parts}} คัน
* อยู่ระหว่างซ่อม : {{in_progress}} คัน
* เสร็จ : {{out_completed}} คัน

🎯 แผนติดตามของ VS วันถัดไป

* งานอู่นอกที่ต้องเร่งติดตามซ่อมในวันถัดไป : {{vs_followup_count}} คัน

📌 ตรวจยอด
คงค้างต้นวัน + รับแจ้งใหม่ - ซ่อมเสร็จ = คงค้างสิ้นวันรวม
คงค้างอู่ใน + คงค้างอู่นอก = คงค้างสิ้นวันรวม`

export const DEFAULT_GARAGE_TEMPLATE = `ประจำวันที่ {{date_thai}}

🔷 สรุปงานอู่ใน

🏭 คงค้างอู่ในต้นวัน: {{opening_backlog}} คัน
📥 รับเข้าอู่ในวันนี้: {{received_today}} คัน
✅ ซ่อมเสร็จส่งมอบวันนี้: {{completed_today}} คัน
📌 คงค้างอู่ในสิ้นวัน: {{closing_backlog}} คัน

📊 งานอู่ในเพิ่ม/ลด: {{backlog_change}} คัน
สาเหตุภาพรวม: ………………………………………

🔧 สถานะรถคงค้างอู่ใน

* รอขึ้นซ่อม: {{waiting_queue}} คัน
* กำลังซ่อม: {{in_repair}} คัน
* รออะไหล่: {{waiting_parts}} คัน
* รอ QC / รอส่งมอบ: {{waiting_qc}} คัน
* ชะลอซ่อม: {{on_hold}} คัน

⏰ งานเกินกำหนดอู่ใน: {{overdue_count}} คัน

🎯 แผนอู่ในวันถัดไป

* เป้าซ่อมเสร็จส่งมอบ: {{target_complete}} คัน
* งานที่ต้องเร่งปิด: {{urgent_close}} คัน
* งานที่ต้องเร่งอะไหล่: {{urgent_parts}} คัน
* งานที่ต้องจัดช่าง/โยกทีมเพิ่ม: {{team_reallocation}} คัน
* เรื่องที่ต้องขอ Support: {{support_needed}}

📌 ตรวจยอด
รอขึ้นซ่อม + กำลังซ่อม + รออะไหล่ + รอ QC/รอส่งมอบ + ชะลอซ่อม = คงค้างอู่ในสิ้นวัน`
