// app/ka/asia-incentive/page.tsx

"use client"

import { useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"

type AsiaIncentiveRow = {
  fleet?: string
  mmyy?: string
  driver_id?: string
  driver_name?: string
  late_days?: number
  total_ac?: number
  total_nc?: number
  total_q?: number
  total_trip?: number
  total_unique_date_trip?: number
  working_days?: number
  gpm_total_q?: number
  gpm_total_trip?: number
  created_at?: string
  updated_at?: string
  รหัส?: string
  สถานะ?: string
  แพล้นท์?: string
}

type WorkTarget = {
  target: number
  amount: number
  label: string
}

type TripTarget = {
  target: number
  amount: number
  label: string
}

type ConditionFilter =
  | "work_possible"
  | "work_not_possible"
  | "basic_pass"
  | "basic_fail"
  | "trip_possible"
  | "trip_not_possible"
  | "q_possible"
  | "q_not_possible"
  | "has_late"

type SortKey =
  | "driver_id"
  | "driver_name"
  | "plant"
  | "plant_code"
  | "status"
  | "working_days_value"
  | "incentive_working_days"
  | "late_days_value"
  | "missed_days_so_far"
  | "max_possible_working_days"
  | "trip_value"
  | "q_value"
  | "projected_trip_28"
  | "projected_q_28"
  | "projected_trip_max"
  | "projected_q_max"
  | "total_incentive"
  | "projected_total_incentive_max_possible"

type SortDirection = "asc" | "desc"

type DriverCalcRow = AsiaIncentiveRow & {
  working_days_value: number
  incentive_working_days: number
  late_days_value: number
  trip_value: number
  q_value: number

  total_ac_value: number
  total_nc_value: number
  is_eligible: boolean
  disqualified_reason: string

  work_incentive: number
  trip_incentive: number
  q_incentive: number
  total_incentive: number

  work_level: string
  trip_level: string
  q_level: string

  next_work_target: number | null
  gap_work_days: number

  next_trip_target: number | null
  gap_trip: number

  gap_q: number

  status_label: string
  status_type: "danger" | "warning" | "success" | "neutral"

  data_as_of: string
  data_as_of_day: number
  month_days: number

  missed_days_so_far: number
  max_possible_working_days: number
  projected_work_incentive_max_days: number
  projected_work_level_max_days: string
  is_work_possible: boolean
  work_status_message: string

  avg_trip_per_day: number
  avg_q_per_day: number

  projected_working_days_28: number
  projected_trip_28: number
  projected_q_28: number

  projected_work_incentive_28: number
  projected_trip_incentive_28: number
  projected_q_incentive_28: number
  projected_total_incentive_28: number

  projected_working_days_max: number
  projected_trip_max: number
  projected_q_max: number
  projected_trip_incentive_max: number
  projected_q_incentive_max: number
  projected_total_incentive_max_possible: number

  is_trip_possible_at_28: boolean
  is_q_possible_at_28: boolean
  is_trip_possible_at_max: boolean
  is_q_possible_at_max: boolean

  trip_status_message: string
  q_status_message: string

  work_opportunity_label: string
  trip_opportunity_label: string
  q_opportunity_label: string

  current_gap_summary: string
  projection_summary: string
}

/**
 * ✅ เงื่อนไขวันทำงานใหม่
 * ใช้เหมือนกันทั้ง พจส และ พจร
 * หมายเหตุ: วันมาสายไม่นับเป็นวันทำงานสำหรับ Incentive
 */
const WORK_TARGETS: WorkTarget[] = [
  { target: 26, amount: 1000, label: "26 วัน" },
  { target: 27, amount: 1000, label: "27 วัน" },
  { target: 28, amount: 1000, label: "28 วัน" },
  { target: 29, amount: 1000, label: "29 วัน" },
  { target: 30, amount: 2000, label: "30 วัน" },
  { target: 31, amount: 2000, label: "31 วัน" },
]

/**
 * เที่ยวงาน ใช้เงื่อนไข "มากกว่า"
 */
const TRIP_TARGETS: TripTarget[] = [
  { target: 80, amount: 800, label: ">80 เที่ยว" },
  { target: 90, amount: 1000, label: ">90 เที่ยว" },
  { target: 100, amount: 1200, label: ">100 เที่ยว" },
  { target: 120, amount: 1500, label: ">120 เที่ยว" },
]

const MIN_WORK_DAYS_TARGET = 26

const CONDITION_OPTIONS: {
  value: ConditionFilter
  label: string
  description: string
}[] = [
  {
    value: "work_possible",
    label: "ยังมีโอกาสด้านวันทำงาน",
    description: "วันทำงานสิทธิ์สูงสุดยังถึง 26 วันขึ้นไป",
  },
  {
    value: "work_not_possible",
    label: "ไม่สามารถถึงเกณฑ์วันทำงาน",
    description: "วันทำงานสิทธิ์สูงสุดต่ำกว่า 26 วัน",
  },
  {
    value: "basic_pass",
    label: "ผ่านเงื่อนไขพื้นฐาน AC/NC",
    description: "AC = 0 และ NC = 0",
  },
  {
    value: "basic_fail",
    label: "หมดสิทธิ์ทั้งหมดจาก AC/NC",
    description: "AC หรือ NC ไม่เท่ากับ 0",
  },
  {
    value: "trip_possible",
    label: "เที่ยวงานมีแนวโน้มถึงเกณฑ์",
    description: "Project @28 มากกว่า 80 เที่ยว",
  },
  {
    value: "trip_not_possible",
    label: "เที่ยวงานยังต่ำกว่าเกณฑ์",
    description: "Project @28 ยังไม่เกิน 80 เที่ยว",
  },
  {
    value: "q_possible",
    label: "คิวงานมีแนวโน้มถึงเกณฑ์",
    description: "Project @28 มากกว่า 400 คิว",
  },
  {
    value: "q_not_possible",
    label: "คิวงานยังต่ำกว่าเกณฑ์",
    description: "Project @28 ยังไม่เกิน 400 คิว",
  },
  {
    value: "has_late",
    label: "มีวันมาสาย",
    description: "late_days มากกว่า 0",
  },
]

function getCurrentMMYY() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const year = now.getFullYear()

  return `${month}/${year}`
}

function getYesterdayDate() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d
}

function getDataAsOfDayNumber() {
  return getYesterdayDate().getDate()
}

function getDataAsOfText() {
  return getYesterdayDate().toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function getDaysInMonthFromMMYY(mmyy?: string) {
  if (!mmyy) return 31

  const [monthText, yearText] = String(mmyy).split("/")
  const month = Number(monthText)
  const year = Number(yearText)

  if (!month || !year) return 31

  return new Date(year, month, 0).getDate()
}

function getMaxPossibleWorkingDays({
  incentiveWorkingDays,
  monthDays,
  dataAsOfDay,
}: {
  incentiveWorkingDays: number
  monthDays: number
  dataAsOfDay: number
}) {
  /**
   * ✅ มาสายไม่นับวันทำงาน
   * ดังนั้นวันที่หยุด/ไม่ได้สิทธิ์สะสม = วันที่ข้อมูลถึง - วันทำงานที่นับสิทธิ์
   */
  const missedDaysSoFar = Math.max(dataAsOfDay - incentiveWorkingDays, 0)
  const maxPossibleWorkingDays = Math.max(monthDays - missedDaysSoFar, 0)

  return {
    missedDaysSoFar,
    maxPossibleWorkingDays,
  }
}

function getWorkRuleName() {
  return "เงื่อนไขวันทำงานใหม่ พจส/พจร ใช้เหมือนกัน"
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function getWorkIncentive(days: number) {
  const achieved = [...WORK_TARGETS]
    .reverse()
    .find((item) => days >= item.target)

  const next = WORK_TARGETS.find((item) => days < item.target)

  return {
    amount: achieved?.amount || 0,
    level: achieved?.label || "ยังไม่ถึงเกณฑ์",
    nextTarget: next?.target || null,
    gap: next ? Math.max(next.target - days, 0) : 0,
  }
}

function getTripIncentive(trip: number) {
  const achieved = [...TRIP_TARGETS]
    .reverse()
    .find((item) => trip > item.target)

  const next = TRIP_TARGETS.find((item) => trip <= item.target)

  const gap = next ? Math.max(next.target - trip + 1, 0) : 0

  return {
    amount: achieved?.amount || 0,
    level: achieved?.label || "ยังไม่ถึงเกณฑ์",
    nextTarget: next?.target || null,
    gap,
  }
}

function getTripLevelText(trip: number) {
  if (trip > 120) return "ระดับ >120 เที่ยว"
  if (trip > 100) return "ระดับ >100 เที่ยว"
  if (trip > 90) return "ระดับ >90 เที่ยว"
  if (trip > 80) return "ระดับ >80 เที่ยว"
  return "ต่ำกว่าเกณฑ์ >80 เที่ยว"
}

function getProjectedTripOpportunityLabel(projectedTrip: number, days: number) {
  if (projectedTrip > 120) {
    return `Project ${formatNumber(days)} วัน คาดว่าจะถึงระดับ >120 เที่ยว`
  }

  if (projectedTrip > 100) {
    return `Project ${formatNumber(days)} วัน คาดว่าจะถึงระดับ >100 เที่ยว`
  }

  if (projectedTrip > 90) {
    return `Project ${formatNumber(days)} วัน คาดว่าจะถึงระดับ >90 เที่ยว`
  }

  if (projectedTrip > 80) {
    return `Project ${formatNumber(days)} วัน คาดว่าจะถึงระดับ >80 เที่ยว`
  }

  return `Project ${formatNumber(days)} วัน ยังต่ำกว่าเกณฑ์ >80 เที่ยว`
}

function calculateDriver(row: AsiaIncentiveRow): DriverCalcRow {
  const workingDays = Number(row.working_days || 0)
  const lateDays = Number(row.late_days || 0)

  /**
   * ✅ วันทำงานที่ใช้คิด Incentive
   * ถ้ามาสาย แปลว่าไม่นับวันทำงาน
   */
  const incentiveWorkingDays = Math.max(workingDays - lateDays, 0)

  const trip = Number(row.gpm_total_trip || 0)
  const q = Number(row.gpm_total_q || 0)

  const totalAC = Number(row.total_ac || 0)
  const totalNC = Number(row.total_nc || 0)

  const isEligible = totalAC === 0 && totalNC === 0

  let disqualifiedReason = ""
  if (totalAC > 0 && totalNC > 0) {
    disqualifiedReason = `หมดสิทธิ์ทั้งหมด: มี AC ${formatNumber(
      totalAC
    )} และ NC ${formatNumber(totalNC)}`
  } else if (totalAC > 0) {
    disqualifiedReason = `หมดสิทธิ์ทั้งหมด: มี AC ${formatNumber(totalAC)}`
  } else if (totalNC > 0) {
    disqualifiedReason = `หมดสิทธิ์ทั้งหมด: มี NC ${formatNumber(totalNC)}`
  }

  const monthDays = getDaysInMonthFromMMYY(row.mmyy)
  const dataAsOfDay = getDataAsOfDayNumber()

  const { missedDaysSoFar, maxPossibleWorkingDays } =
    getMaxPossibleWorkingDays({
      incentiveWorkingDays,
      monthDays,
      dataAsOfDay,
    })

  const currentWork = getWorkIncentive(incentiveWorkingDays)
  const projectedWorkMax = getWorkIncentive(maxPossibleWorkingDays)

  const isWorkPossible = maxPossibleWorkingDays >= MIN_WORK_DAYS_TARGET

  const tripCalc = getTripIncentive(trip)

  const qIncentive = q > 400 ? 1000 : 0
  const gapQ = q > 400 ? 0 : Math.max(400 - q, 0)

  const currentTotalBeforeEligibility =
    Number(currentWork.amount || 0) +
    Number(tripCalc.amount || 0) +
    Number(qIncentive || 0)

  const currentTotal = isEligible ? currentTotalBeforeEligibility : 0

  /**
   * ✅ เฉลี่ยเที่ยว/คิว ใช้ working_days เดิม
   * เพราะแม้มาสาย จะไม่นับวันทำงาน Incentive แต่ผลงานเที่ยว/คิวยังนับรวม
   */
  const avgBaseDays = workingDays > 0 ? workingDays : 0
  const avgTripPerDay = avgBaseDays > 0 ? trip / avgBaseDays : 0
  const avgQPerDay = avgBaseDays > 0 ? q / avgBaseDays : 0

  const projectedWorkingDays28 = 28
  const projectedTrip28 = avgTripPerDay * projectedWorkingDays28
  const projectedQ28 = avgQPerDay * projectedWorkingDays28

  const projectedTripIncentive28 = getTripIncentive(projectedTrip28).amount
  const projectedQIncentive28 = projectedQ28 > 400 ? 1000 : 0

  const isTripPossibleAt28 = projectedTrip28 > 80
  const isQPossibleAt28 = projectedQ28 > 400

  const projectedWorkIncentive28 =
    maxPossibleWorkingDays >= 28 ? getWorkIncentive(28).amount : 0

  const projectedTotalIncentive28 = isEligible
    ? projectedWorkIncentive28 +
      projectedTripIncentive28 +
      projectedQIncentive28
    : 0

  const projectedWorkingDaysMax = maxPossibleWorkingDays
  const projectedTripMax = avgTripPerDay * projectedWorkingDaysMax
  const projectedQMax = avgQPerDay * projectedWorkingDaysMax

  const projectedTripIncentiveMax =
    getTripIncentive(projectedTripMax).amount

  const projectedQIncentiveMax = projectedQMax > 400 ? 1000 : 0

  const isTripPossibleAtMax = projectedTripMax > 80
  const isQPossibleAtMax = projectedQMax > 400

  const projectedTotalIncentiveMaxPossible = isEligible
    ? projectedWorkMax.amount +
      projectedTripIncentiveMax +
      projectedQIncentiveMax
    : 0

  let workStatusMessage = ""
  if (!isEligible) {
    workStatusMessage = "หมดสิทธิ์ทั้งหมด เนื่องจากไม่ผ่านเงื่อนไข AC/NC"
  } else if (!isWorkPossible) {
    workStatusMessage =
      "ไม่สามารถถึงเกณฑ์วันทำงานขั้นต่ำ 26 วัน เนื่องจากวันทำงานที่นับสิทธิ์ไม่พอ"
  } else if (maxPossibleWorkingDays >= 30) {
    workStatusMessage = "ยังมีโอกาสถึงระดับ 30–31 วัน = 2,000 บาท"
  } else {
    workStatusMessage = "ยังมีโอกาสถึงระดับ 26–29 วัน = 1,000 บาท"
  }

  let tripStatusMessage = ""
  if (!isEligible) {
    tripStatusMessage = "หมดสิทธิ์ทั้งหมด เนื่องจากไม่ผ่านเงื่อนไข AC/NC"
  } else if (projectedTripMax <= 80) {
    tripStatusMessage = "Project @Max ยังต่ำกว่าเกณฑ์ >80 เที่ยว"
  } else {
    tripStatusMessage = getProjectedTripOpportunityLabel(
      projectedTripMax,
      projectedWorkingDaysMax
    )
  }

  let qStatusMessage = ""
  if (!isEligible) {
    qStatusMessage = "หมดสิทธิ์ทั้งหมด เนื่องจากไม่ผ่านเงื่อนไข AC/NC"
  } else if (projectedQMax <= 400) {
    qStatusMessage = "Project @Max ยังต่ำกว่าเกณฑ์ Bonus คิว"
  } else {
    qStatusMessage = "Project @Max คาดว่าจะได้รับ Bonus คิว +1,000 บาท"
  }

  let statusLabel = "ผ่านเงื่อนไขพื้นฐาน รอสะสมผลงาน"
  let statusType: DriverCalcRow["status_type"] = "warning"

  if (!isEligible) {
    statusLabel = "หมดสิทธิ์ทั้งหมด"
    statusType = "danger"
  } else if (!isWorkPossible) {
    statusLabel = "ไม่สามารถถึงเกณฑ์วันทำงาน"
    statusType = "danger"
  } else if (currentTotal > 0) {
    statusLabel = "มี Incentive ตามผลงานปัจจุบัน"
    statusType = "success"
  } else {
    statusLabel = "ยังมีโอกาสได้รับ Incentive"
    statusType = "warning"
  }

  let workOpportunityLabel = ""
  if (!isEligible) {
    workOpportunityLabel = "หมดสิทธิ์จาก AC/NC"
  } else {
    workOpportunityLabel =
      `ข้อมูลถึงวันที่ ${dataAsOfDay}: ทำงานจริง ${formatNumber(
        workingDays
      )} วัน, มาสาย ${formatNumber(lateDays)} วัน, วันทำงานนับสิทธิ์ ${formatNumber(
        incentiveWorkingDays
      )} วัน, ไม่ได้นับสิทธิ์/หยุดสะสม ${formatNumber(
        missedDaysSoFar
      )} วัน, สูงสุดเดือนนี้ทำได้ ${formatNumber(
        maxPossibleWorkingDays
      )} วัน = ${projectedWorkMax.level}`
  }

  const tripOpportunityLabel = tripStatusMessage
  const qOpportunityLabel = qStatusMessage

  const currentGapSummary = isEligible
    ? [
        isWorkPossible
          ? `วันทำงานนับสิทธิ์สูงสุด ${formatNumber(maxPossibleWorkingDays)} วัน`
          : `ไม่สามารถถึงเกณฑ์วันทำงาน สูงสุด ${formatNumber(
              maxPossibleWorkingDays
            )} วัน`,
        tripCalc.nextTarget === null
          ? "เที่ยวถึงระดับสูงสุดแล้ว"
          : `เที่ยวปัจจุบันต้องเพิ่มอีก ${formatNumber(
              tripCalc.gap
            )} เที่ยว เพื่อให้มากกว่า ${tripCalc.nextTarget} เที่ยว`,
        q > 400
          ? "คิวได้รับ Bonus แล้ว"
          : `คิวปัจจุบันเหลือ ${formatNumber(gapQ)} คิว ถึง 400 คิว`,
      ].join(" | ")
    : disqualifiedReason

  const projectionSummary = isEligible
    ? [
        "รางวัล 3 ส่วน: วันทำงาน + เที่ยวงาน + คิวงาน",
        `ทำงานจริง ${formatNumber(workingDays)} วัน`,
        `มาสาย ${formatNumber(lateDays)} วัน`,
        `วันทำงานนับสิทธิ์ ${formatNumber(incentiveWorkingDays)} วัน`,
        `วันทำงานสูงสุดเดือนนี้ ${formatNumber(maxPossibleWorkingDays)} วัน`,
        `เงินวันทำงานสูงสุด ${formatMoney(projectedWorkMax.amount)} บาท`,
        `Trip @28 = ${formatNumber(projectedTrip28)}`,
        `Q @28 = ${formatNumber(projectedQ28)}`,
        `Trip @Max = ${formatNumber(projectedTripMax)}`,
        `Q @Max = ${formatNumber(projectedQMax)}`,
        `คาดการณ์รวม = ${formatMoney(
          projectedTotalIncentiveMaxPossible
        )} บาท`,
      ].join(" | ")
    : "หมดสิทธิ์ จึงไม่คำนวณเงินคาดการณ์"

  return {
    ...row,
    working_days_value: workingDays,
    incentive_working_days: incentiveWorkingDays,
    late_days_value: lateDays,
    trip_value: trip,
    q_value: q,

    total_ac_value: totalAC,
    total_nc_value: totalNC,
    is_eligible: isEligible,
    disqualified_reason: disqualifiedReason,

    work_incentive: isEligible ? currentWork.amount : 0,
    trip_incentive: isEligible ? tripCalc.amount : 0,
    q_incentive: isEligible ? qIncentive : 0,
    total_incentive: currentTotal,

    work_level: isEligible ? currentWork.level : "หมดสิทธิ์",
    trip_level: isEligible ? tripCalc.level : "หมดสิทธิ์",
    q_level: isEligible ? (q > 400 ? ">400 คิว" : "ยังไม่ถึง") : "หมดสิทธิ์",

    next_work_target: isEligible ? currentWork.nextTarget : null,
    gap_work_days: isEligible ? currentWork.gap : 0,

    next_trip_target: isEligible ? tripCalc.nextTarget : null,
    gap_trip: isEligible ? tripCalc.gap : 0,

    gap_q: isEligible ? gapQ : 0,

    status_label: statusLabel,
    status_type: statusType,

    data_as_of: getDataAsOfText(),
    data_as_of_day: dataAsOfDay,
    month_days: monthDays,

    missed_days_so_far: missedDaysSoFar,
    max_possible_working_days: maxPossibleWorkingDays,
    projected_work_incentive_max_days: isEligible ? projectedWorkMax.amount : 0,
    projected_work_level_max_days: isEligible
      ? projectedWorkMax.level
      : "หมดสิทธิ์",
    is_work_possible: isWorkPossible,
    work_status_message: workStatusMessage,

    avg_trip_per_day: avgTripPerDay,
    avg_q_per_day: avgQPerDay,

    projected_working_days_28: projectedWorkingDays28,
    projected_trip_28: projectedTrip28,
    projected_q_28: projectedQ28,

    projected_work_incentive_28: isEligible ? projectedWorkIncentive28 : 0,
    projected_trip_incentive_28: isEligible
      ? projectedTripIncentive28
      : 0,
    projected_q_incentive_28: isEligible ? projectedQIncentive28 : 0,
    projected_total_incentive_28: projectedTotalIncentive28,

    projected_working_days_max: projectedWorkingDaysMax,
    projected_trip_max: projectedTripMax,
    projected_q_max: projectedQMax,
    projected_trip_incentive_max: isEligible ? projectedTripIncentiveMax : 0,
    projected_q_incentive_max: isEligible ? projectedQIncentiveMax : 0,
    projected_total_incentive_max_possible: projectedTotalIncentiveMaxPossible,

    is_trip_possible_at_28: isTripPossibleAt28,
    is_q_possible_at_28: isQPossibleAt28,
    is_trip_possible_at_max: isTripPossibleAtMax,
    is_q_possible_at_max: isQPossibleAtMax,

    trip_status_message: tripStatusMessage,
    q_status_message: qStatusMessage,

    work_opportunity_label: workOpportunityLabel,
    trip_opportunity_label: tripOpportunityLabel,
    q_opportunity_label: qOpportunityLabel,

    current_gap_summary: currentGapSummary,
    projection_summary: projectionSummary,
  }
}

function getSortValue(row: DriverCalcRow, sortKey: SortKey) {
  if (sortKey === "plant") return row.แพล้นท์ || ""
  if (sortKey === "plant_code") return row.รหัส || ""
  if (sortKey === "status") return row.สถานะ || ""

  return row[sortKey]
}

function sortRows(
  rows: DriverCalcRow[],
  sortKey: SortKey,
  sortDirection: SortDirection
) {
  return [...rows].sort((a, b) => {
    const aValue = getSortValue(a, sortKey)
    const bValue = getSortValue(b, sortKey)

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue
    }

    const aText = String(aValue ?? "").toLowerCase()
    const bText = String(bValue ?? "").toLowerCase()

    return sortDirection === "asc"
      ? aText.localeCompare(bText, "th")
      : bText.localeCompare(aText, "th")
  })
}

function ProgressBar({
  value,
  max,
  danger = false,
}: {
  value: number
  max: number
  danger?: boolean
}) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={`h-full rounded-full ${
          danger ? "bg-red-600" : "bg-black"
        }`}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

function StatusBadge({ row }: { row: DriverCalcRow }) {
  if (row.status_type === "danger") {
    return (
      <span className="inline-flex rounded-full bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700">
        {row.status_label}
      </span>
    )
  }

  if (row.status_type === "success") {
    return (
      <span className="inline-flex rounded-full bg-green-50 px-2 py-1 text-[11px] font-medium text-green-700">
        {row.status_label}
      </span>
    )
  }

  return (
    <span className="inline-flex rounded-full bg-yellow-50 px-2 py-1 text-[11px] font-medium text-yellow-700">
      {row.status_label}
    </span>
  )
}

function SortButton({
  label,
  sortKey,
  activeSortKey,
  sortDirection,
  onSort,
}: {
  label: string
  sortKey: SortKey
  activeSortKey: SortKey
  sortDirection: SortDirection
  onSort: (key: SortKey) => void
}) {
  const isActive = activeSortKey === sortKey
  const icon = isActive ? (sortDirection === "asc" ? "▲" : "▼") : "↕"

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
        isActive ? "text-black" : "text-gray-500 hover:text-black"
      }`}
    >
      <span>{label}</span>
      <span className="text-[9px]">{icon}</span>
    </button>
  )
}

function SummaryOverviewCard({
  totalDrivers,
  eligibleDrivers,
  disqualifiedDrivers,
  workDisqualifiedDrivers,
  stillPossibleDrivers,
}: {
  totalDrivers: number
  eligibleDrivers: number
  disqualifiedDrivers: number
  workDisqualifiedDrivers: number
  stillPossibleDrivers: number
}) {
  const workDisqualifiedPercent =
    totalDrivers > 0 ? (workDisqualifiedDrivers / totalDrivers) * 100 : 0

  const stillPossiblePercent =
    totalDrivers > 0 ? (stillPossibleDrivers / totalDrivers) * 100 : 0

  const eligiblePercent =
    totalDrivers > 0 ? (eligibleDrivers / totalDrivers) * 100 : 0

  const disqualifiedPercent =
    totalDrivers > 0 ? (disqualifiedDrivers / totalDrivers) * 100 : 0

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm lg:p-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm text-muted-foreground">จำนวนคนขับทั้งหมด</p>
          <h2 className="mt-1 text-3xl font-bold lg:text-4xl">
            {formatNumber(totalDrivers)}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            ตาม filter ปัจจุบัน
          </p>
        </div>

        <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm">
          <div className="font-medium">รางวัล 3 ส่วน</div>
          <div className="mt-1 text-xs text-muted-foreground">
            วันทำงาน + เที่ยวงาน + คิวงาน
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-sm font-semibold">1. สถานะวันทำงาน</div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-blue-50 p-4">
              <p className="text-sm font-medium text-blue-800">
                ยังมีโอกาสด้านวันทำงาน
              </p>
              <p className="mt-1 text-2xl font-bold text-blue-900">
                {formatNumber(stillPossibleDrivers)} คน
              </p>
              <p className="mt-1 text-xs text-blue-700">
                วันทำงานสิทธิ์สูงสุดยังถึง 26 วันขึ้นไป
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
                <div
                  className="h-full rounded-full bg-blue-700"
                  style={{ width: `${Math.min(stillPossiblePercent, 100)}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border bg-orange-50 p-4">
              <p className="text-sm font-medium text-orange-800">
                ไม่สามารถถึงเกณฑ์วันทำงาน
              </p>
              <p className="mt-1 text-2xl font-bold text-orange-900">
                {formatNumber(workDisqualifiedDrivers)} คน
              </p>
              <p className="mt-1 text-xs text-orange-700">
                วันทำงานสิทธิ์สูงสุดต่ำกว่า 26 วัน
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-orange-100">
                <div
                  className="h-full rounded-full bg-orange-700"
                  style={{
                    width: `${Math.min(workDisqualifiedPercent, 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold">
            2. เงื่อนไขพื้นฐาน AC/NC
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">
                ผ่านเงื่อนไขพื้นฐาน
              </p>
              <p className="mt-1 text-2xl font-bold text-green-900">
                {formatNumber(eligibleDrivers)} คน
              </p>
              <p className="mt-1 text-xs text-green-700">
                AC = 0 และ NC = 0
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-green-100">
                <div
                  className="h-full rounded-full bg-green-700"
                  style={{ width: `${Math.min(eligiblePercent, 100)}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">
                หมดสิทธิ์ทั้งหมด
              </p>
              <p className="mt-1 text-2xl font-bold text-red-900">
                {formatNumber(disqualifiedDrivers)} คน
              </p>
              <p className="mt-1 text-xs text-red-700">
                AC หรือ NC ไม่เท่ากับ 0
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-red-100">
                <div
                  className="h-full rounded-full bg-red-700"
                  style={{ width: `${Math.min(disqualifiedPercent, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getConditionFilterLabel(value: ConditionFilter) {
  const option = CONDITION_OPTIONS.find((item) => item.value === value)
  return option?.label || value
}

function matchCondition(row: DriverCalcRow, condition: ConditionFilter) {
  if (condition === "work_possible") {
    return row.is_eligible && row.is_work_possible
  }

  if (condition === "work_not_possible") {
    return row.is_eligible && !row.is_work_possible
  }

  if (condition === "basic_pass") {
    return row.is_eligible
  }

  if (condition === "basic_fail") {
    return !row.is_eligible
  }

  if (condition === "trip_possible") {
    return row.is_eligible && row.is_trip_possible_at_28
  }

  if (condition === "trip_not_possible") {
    return row.is_eligible && !row.is_trip_possible_at_28
  }

  if (condition === "q_possible") {
    return row.is_eligible && row.is_q_possible_at_28
  }

  if (condition === "q_not_possible") {
    return row.is_eligible && !row.is_q_possible_at_28
  }

  if (condition === "has_late") {
    return row.late_days_value > 0
  }

  return true
}

export default function AsiaIncentiveDashboardPage() {
  const [data, setData] = useState<AsiaIncentiveRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [mmyy, setMmyy] = useState(getCurrentMMYY())
  const [selectedPlant, setSelectedPlant] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("")
  const [search, setSearch] = useState("")
  const [conditionFilters, setConditionFilters] = useState<ConditionFilter[]>(
    []
  )

  const [sortKey, setSortKey] = useState<SortKey>(
    "projected_total_incentive_max_possible"
  )
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [activeTab, setActiveTab] = useState<"projection" | "summary">("projection")
  const [filterMinWork15, setFilterMinWork15] = useState(false)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setSortDirection("desc")
  }

  function toggleConditionFilter(value: ConditionFilter) {
    setConditionFilters((current) => {
      if (current.includes(value)) {
        return current.filter((item) => item !== value)
      }

      return [...current, value]
    })
  }

  async function fetchData() {
    try {
      setLoading(true)
      setError("")

      const params = new URLSearchParams()
      if (mmyy) params.append("mmyy", mmyy)

      const response = await fetch(
        `/api/asia-incentive?${params.toString()}`,
        {
          cache: "no-store",
        }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch data")
      }

      if (Array.isArray(result)) {
        setData(result)
      } else if (Array.isArray(result.data)) {
        setData(result.data)
      } else {
        setData([])
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong")
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const calculatedData = useMemo(() => {
    return data.map(calculateDriver)
  }, [data])

  const plantOptions = useMemo(() => {
    return Array.from(
      new Set(calculatedData.map((row) => row.แพล้นท์ || "ไม่ระบุ"))
    ).sort()
  }, [calculatedData])

  const statusOptions = useMemo(() => {
    return Array.from(
      new Set(calculatedData.map((row) => row.สถานะ || "ไม่ระบุ"))
    ).sort()
  }, [calculatedData])

  const filteredData = useMemo(() => {
    return calculatedData.filter((row) => {
      const plant = row.แพล้นท์ || "ไม่ระบุ"
      const status = row.สถานะ || "ไม่ระบุ"

      const matchPlant = selectedPlant ? plant === selectedPlant : true
      const matchStatus = selectedStatus ? status === selectedStatus : true

      const keyword = search.trim().toLowerCase()

      const matchSearch = keyword
        ? String(row.driver_id || "").toLowerCase().includes(keyword) ||
          String(row.driver_name || "").toLowerCase().includes(keyword) ||
          String(row.รหัส || "").toLowerCase().includes(keyword) ||
          String(row.แพล้นท์ || "").toLowerCase().includes(keyword)
        : true

      const matchConditions =
        conditionFilters.length === 0
          ? true
          : conditionFilters.every((condition) =>
              matchCondition(row, condition)
            )

      const matchMinWork = filterMinWork15 ? row.working_days_value > 15 : true

      return matchPlant && matchStatus && matchSearch && matchConditions && matchMinWork
    })
  }, [
    calculatedData,
    selectedPlant,
    selectedStatus,
    search,
    conditionFilters,
    filterMinWork15,
  ])

  const sortedData = useMemo(() => {
    return sortRows(filteredData, sortKey, sortDirection)
  }, [filteredData, sortKey, sortDirection])

  const summary = useMemo(() => {
    const totalDrivers = filteredData.length

    const eligibleDrivers = filteredData.filter((row) => row.is_eligible)
      .length

    const disqualifiedDrivers = filteredData.filter(
      (row) => !row.is_eligible
    ).length

    const workDisqualifiedDrivers = filteredData.filter(
      (row) => row.is_eligible && !row.is_work_possible
    ).length

    const stillPossibleDrivers = filteredData.filter(
      (row) => row.is_eligible && row.is_work_possible
    ).length

    return {
      totalDrivers,
      eligibleDrivers,
      disqualifiedDrivers,
      workDisqualifiedDrivers,
      stillPossibleDrivers,
    }
  }, [filteredData])

  const latestUpdatedAt = useMemo(() => {
    const dates = calculatedData
      .map((row) => row.updated_at)
      .filter(Boolean)
      .map((date) => new Date(String(date)).getTime())
      .filter((time) => !Number.isNaN(time))

    if (dates.length === 0) return "-"

    return new Date(Math.max(...dates)).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    })
  }, [calculatedData])

  const dataAsOfText = getDataAsOfText()

  const monthlySummaryStats = useMemo(() => {
    const eligible = filteredData.filter((r) => r.is_eligible)
    const totalIncentive = filteredData.reduce((s, r) => s + r.total_incentive, 0)
    const totalTrip = filteredData.reduce((s, r) => s + r.trip_value, 0)
    const totalQ = filteredData.reduce((s, r) => s + r.q_value, 0)
    const avgIncentive = eligible.length > 0 ? totalIncentive / eligible.length : 0

    const workLevelMap = new Map<string, { count: number; baht: number }>()
    for (const r of filteredData) {
      const level = r.work_level
      const cur = workLevelMap.get(level) ?? { count: 0, baht: 0 }
      workLevelMap.set(level, { count: cur.count + 1, baht: cur.baht + r.work_incentive })
    }

    const tripLevelMap = new Map<string, { count: number; baht: number }>()
    for (const r of filteredData) {
      const level = r.trip_level
      const cur = tripLevelMap.get(level) ?? { count: 0, baht: 0 }
      tripLevelMap.set(level, { count: cur.count + 1, baht: cur.baht + r.trip_incentive })
    }

    const qLevelMap = new Map<string, { count: number; baht: number }>()
    for (const r of filteredData) {
      const level = r.q_level
      const cur = qLevelMap.get(level) ?? { count: 0, baht: 0 }
      qLevelMap.set(level, { count: cur.count + 1, baht: cur.baht + r.q_incentive })
    }

    const gotWork  = filteredData.filter((r) => r.work_incentive > 0)
    const gotTrip  = filteredData.filter((r) => r.trip_incentive > 0)
    const gotQ     = filteredData.filter((r) => r.q_incentive > 0)
    const gotAll3  = filteredData.filter((r) => r.work_incentive > 0 && r.trip_incentive > 0 && r.q_incentive > 0)
    const gotAny   = filteredData.filter((r) => r.total_incentive > 0)

    return {
      totalDrivers: filteredData.length,
      eligibleDrivers: eligible.length,
      totalIncentive,
      totalTrip,
      totalQ,
      avgIncentive,
      workLevels: Array.from(workLevelMap.entries()).sort((a, b) => b[1].baht - a[1].baht),
      tripLevels: Array.from(tripLevelMap.entries()).sort((a, b) => b[1].baht - a[1].baht),
      qLevels: Array.from(qLevelMap.entries()).sort((a, b) => b[1].baht - a[1].baht),
      rewardSummary: [
        {
          label: "รางวัลวันทำงาน",
          count: gotWork.length,
          baht: gotWork.reduce((s, r) => s + r.work_incentive, 0),
          color: "bg-gray-900",
          textColor: "text-gray-900",
        },
        {
          label: "รางวัลเที่ยวงาน",
          count: gotTrip.length,
          baht: gotTrip.reduce((s, r) => s + r.trip_incentive, 0),
          color: "bg-blue-600",
          textColor: "text-blue-700",
        },
        {
          label: "รางวัลคิว",
          count: gotQ.length,
          baht: gotQ.reduce((s, r) => s + r.q_incentive, 0),
          color: "bg-orange-500",
          textColor: "text-orange-600",
        },
        {
          label: "ได้ครบทั้ง 3 รางวัล",
          count: gotAll3.length,
          baht: gotAll3.reduce((s, r) => s + r.total_incentive, 0),
          color: "bg-green-600",
          textColor: "text-green-700",
        },
        {
          label: "ได้รับรางวัล (อย่างน้อย 1)",
          count: gotAny.length,
          baht: gotAny.reduce((s, r) => s + r.total_incentive, 0),
          color: "bg-teal-600",
          textColor: "text-teal-700",
        },
      ],
    }
  }, [filteredData])

  const summaryTableData = useMemo(() => {
    return [...filteredData].sort((a, b) => b.total_incentive - a.total_incentive)
  }, [filteredData])

  const plantAnalysisData = useMemo(() => {
    const map = new Map<string, { plant: string; drivers: number; totalTrip: number; totalQ: number }>()
    for (const r of filteredData) {
      const plant = r.แพล้นท์ || "ไม่ระบุ"
      const cur = map.get(plant) ?? { plant, drivers: 0, totalTrip: 0, totalQ: 0 }
      map.set(plant, {
        plant,
        drivers: cur.drivers + 1,
        totalTrip: cur.totalTrip + Number(r.total_trip || 0),
        totalQ: cur.totalQ + Number(r.total_q || 0),
      })
    }
    return Array.from(map.values()).sort((a, b) => b.totalTrip - a.totalTrip)
  }, [filteredData])

  function exportMonthlySummary() {
    const rows = sortedData.map((row) => ({
      driver_id: row.driver_id || "",
      driver_name: row.driver_name || "",
      แพล้นท์: row.แพล้นท์ || "",
      รหัส: row.รหัส || "",
      สถานะ: row.สถานะ || "",
      วันทำงานจริง: row.working_days_value,
      มาสาย: row.late_days_value,
      วันทำงานนับสิทธิ์: row.incentive_working_days,
      AC: row.total_ac_value,
      NC: row.total_nc_value,
      ผ่านเงื่อนไข_AC_NC: row.is_eligible ? "ผ่าน" : "ไม่ผ่าน",
      GPM_Trip_actual: row.trip_value,
      GPM_Q_actual: row.q_value,
      เงินวันทำงาน: row.work_incentive,
      ระดับวันทำงาน: row.work_level,
      เงินเที่ยวงาน: row.trip_incentive,
      ระดับเที่ยวงาน: row.trip_level,
      เงินคิวงาน: row.q_incentive,
      รวม_Incentive: row.total_incentive,
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Summary")
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    saveAs(
      new Blob([buf], { type: "application/octet-stream" }),
      `monthly-summary-${mmyy.replace("/", "-")}.xlsx`
    )
  }

  function exportToExcel() {
    const rows = sortedData.map((row) => ({
      driver_id: row.driver_id || "",
      driver_name: row.driver_name || "",
      แพล้นท์: row.แพล้นท์ || "",
      รหัส: row.รหัส || "",
      สถานะพนักงาน: row.สถานะ || "",
      ผ่าน_AC_NC: row.is_eligible ? "ผ่าน" : "ไม่ผ่าน",
      AC: row.total_ac_value,
      NC: row.total_nc_value,
      วันทำงานจริง: row.working_days_value,
      วันทำงานนับสิทธิ์: row.incentive_working_days,
      มาสาย: row.late_days_value,
      ไม่ได้นับสิทธิ์_หยุด: row.missed_days_so_far,
      สูงสุดเดือนนี้: row.max_possible_working_days,
      GPM_Trip: row.trip_value,
      GPM_Q: row.q_value,
      Avg_Trip_per_day: Number(row.avg_trip_per_day.toFixed(2)),
      Avg_Q_per_day: Number(row.avg_q_per_day.toFixed(2)),
      Trip_at_28: Number(row.projected_trip_28.toFixed(2)),
      Q_at_28: Number(row.projected_q_28.toFixed(2)),
      Trip_at_Max: Number(row.projected_trip_max.toFixed(2)),
      Q_at_Max: Number(row.projected_q_max.toFixed(2)),
      เงินวันทำงานMax: row.projected_work_incentive_max_days,
      เงินเที่ยวงานMax: row.projected_trip_incentive_max,
      เงินคิวงานMax: row.projected_q_incentive_max,
      คาดการณ์รวมสูงสุด: row.projected_total_incentive_max_possible,
      สถานะ_Incentive: row.status_label,
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Asia Incentive")
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    saveAs(
      new Blob([buf], { type: "application/octet-stream" }),
      `asia-incentive-${mmyy.replace("/", "-")}.xlsx`
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-4 lg:px-5">
        <div className="rounded-2xl border bg-white p-4 shadow-sm lg:p-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-xl font-bold tracking-tight lg:text-2xl">
                KA Asia Incentive Dashboard
              </h1>

              <p className="mt-1 text-sm text-muted-foreground">
                ติดตามรางวัล 3 ส่วน: วันทำงาน, เที่ยวงาน, คิวงาน
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                ข้อมูลแสดงถึงวันที่ {dataAsOfText} | API updated:{" "}
                {latestUpdatedAt}
              </p>
            </div>

            <button
              onClick={fetchData}
              disabled={loading}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 rounded-2xl border bg-white p-1.5 shadow-sm">
          <button
            onClick={() => setActiveTab("projection")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "projection"
                ? "bg-black text-white"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            ยอดคาดการณ์
          </button>
          <button
            onClick={() => setActiveTab("summary")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "summary"
                ? "bg-black text-white"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Monthly Summary
          </button>
        </div>

        {activeTab === "projection" && <>

        <div className="rounded-2xl border bg-yellow-50 p-4 text-sm text-yellow-900">
          <div className="font-semibold">เงื่อนไขรางวัล 3 ส่วน</div>

          <div className="mt-2 grid gap-2 lg:grid-cols-3">
            <div className="rounded-xl bg-white/60 p-3">
              <div className="font-medium">1. รางวัลวันทำงาน</div>
              <div className="mt-1 text-xs">
                มาสายไม่นับเป็นวันทำงาน Incentive
              </div>
              <div className="mt-1 text-xs">
                26–29 วัน = 1,000 บาท | 30–31 วัน = 2,000 บาท
              </div>
            </div>

            <div className="rounded-xl bg-white/60 p-3">
              <div className="font-medium">2. รางวัลเที่ยวงาน</div>
              <div className="mt-1 text-xs">
                ใช้ gpm_total_trip และเงื่อนไขมากกว่า 80/90/100/120 เที่ยว
              </div>
              <div className="mt-1 text-xs">
                มาสายยังนับรวมในค่าเฉลี่ยเที่ยว
              </div>
            </div>

            <div className="rounded-xl bg-white/60 p-3">
              <div className="font-medium">3. รางวัลคิวงาน</div>
              <div className="mt-1 text-xs">
                ใช้ gpm_total_q หากมากกว่า 400 คิว ได้เพิ่ม 1,000 บาท
              </div>
              <div className="mt-1 text-xs">
                มาสายยังนับรวมในค่าเฉลี่ยคิว
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="space-y-1 lg:col-span-2">
              <label className="text-xs font-medium text-gray-600">Month</label>
              <input
                value={mmyy}
                onChange={(e) => setMmyy(e.target.value)}
                placeholder="05/2026"
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1 lg:col-span-2">
              <label className="text-xs font-medium text-gray-600">
                แพล้นท์
              </label>
              <select
                value={selectedPlant}
                onChange={(e) => setSelectedPlant(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="">ทั้งหมด</option>
                {plantOptions.map((plant) => (
                  <option key={plant} value={plant}>
                    {plant}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 lg:col-span-2">
              <label className="text-xs font-medium text-gray-600">ประเภทพนักงาน</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              >
                <option value="">ทั้งหมด</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 lg:col-span-6">
              <label className="text-xs font-medium text-gray-600">Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหา driver_id, ชื่อ, รหัสแพล้นท์, แพล้นท์"
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Filter เงื่อนไข</p>
                <p className="text-xs text-muted-foreground">
                  เลือกได้หลายเงื่อนไขพร้อมกัน ระบบจะกรองแบบ AND
                </p>
              </div>

              {conditionFilters.length > 0 && (
                <button
                  onClick={() => setConditionFilters([])}
                  className="rounded-lg border px-3 py-2 text-xs"
                >
                  Clear condition
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {CONDITION_OPTIONS.map((option) => {
                const checked = conditionFilters.includes(option.value)

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleConditionFilter(option.value)}
                    className={`rounded-full border px-3 py-2 text-xs transition ${
                      checked
                        ? "border-black bg-black text-white"
                        : "bg-white hover:bg-gray-50"
                    }`}
                    title={option.description}
                  >
                    {checked ? "✓ " : ""}
                    {option.label}
                  </button>
                )
              })}

              <button
                type="button"
                onClick={() => setFilterMinWork15((v) => !v)}
                className={`rounded-full border px-3 py-2 text-xs transition ${
                  filterMinWork15
                    ? "border-black bg-black text-white"
                    : "bg-white hover:bg-gray-50"
                }`}
                title="วันทำงานจริงมากกว่า 15 วัน"
              >
                {filterMinWork15 ? "✓ " : ""}วันทำงาน &gt; 15 วัน
              </button>
            </div>

            {conditionFilters.length > 0 && (
              <div className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
                Filter AND:{" "}
                {conditionFilters
                  .map((item) => getConditionFilterLabel(item))
                  .join(" + ")}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Search
            </button>

            <button
              onClick={() => {
                setMmyy(getCurrentMMYY())
                setSelectedPlant("")
                setSelectedStatus("")
                setConditionFilters([])
                setSearch("")
                setFilterMinWork15(false)
                setSortKey("projected_total_incentive_max_possible")
                setSortDirection("desc")
              }}
              className="rounded-xl border px-4 py-2 text-sm"
            >
              Clear
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
            Processing...
          </div>
        )}

        <SummaryOverviewCard
          totalDrivers={summary.totalDrivers}
          eligibleDrivers={summary.eligibleDrivers}
          disqualifiedDrivers={summary.disqualifiedDrivers}
          workDisqualifiedDrivers={summary.workDisqualifiedDrivers}
          stillPossibleDrivers={summary.stillPossibleDrivers}
        />

        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b p-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="font-semibold">Driver Incentive Detail</h2>
              <p className="text-sm text-muted-foreground">
                มาสายถูกหักออกจากวันทำงาน Incentive แต่ Trip/Q ยังนับรวมในค่าเฉลี่ย
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
                Result: {formatNumber(sortedData.length)} rows
              </div>

              <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
                Sort: {sortKey} /{" "}
                {sortDirection === "asc" ? "น้อยไปมาก" : "มากไปน้อย"}
              </div>

              <button
                onClick={exportMonthlySummary}
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                Export Monthly Summary
              </button>

              <button
                onClick={exportToExcel}
                className="rounded-xl bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700"
              >
                Export Full Detail
              </button>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-[1320px] w-full text-xs">
              <thead className="sticky top-0 z-20 bg-gray-50 shadow-sm">
                <tr className="border-b">
                  <th className="sticky left-0 z-30 w-[220px] bg-gray-50 px-3 py-3 text-left">
                    <div className="flex flex-col gap-1">
                      <SortButton
                        label="Driver"
                        sortKey="driver_name"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                      <SortButton
                        label="ID"
                        sortKey="driver_id"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                    </div>
                  </th>

                  <th className="w-[170px] px-3 py-3 text-left">
                    <div className="flex flex-col gap-1">
                      <SortButton
                        label="Plant"
                        sortKey="plant"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                      <SortButton
                        label="Status"
                        sortKey="status"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                    </div>
                  </th>

                  <th className="w-[210px] px-3 py-3 text-left">
                    Eligibility
                  </th>

                  <th className="w-[240px] px-3 py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <SortButton
                        label="วันทำงานจริง"
                        sortKey="working_days_value"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                      <SortButton
                        label="วันทำงานนับสิทธิ์"
                        sortKey="incentive_working_days"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                    </div>
                  </th>

                  <th className="w-[90px] px-3 py-3 text-right">
                    <SortButton
                      label="มาสาย"
                      sortKey="late_days_value"
                      activeSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                  </th>

                  <th className="w-[180px] px-3 py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <SortButton
                        label="GPM Trip"
                        sortKey="trip_value"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                      <SortButton
                        label="GPM Q"
                        sortKey="q_value"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                    </div>
                  </th>

                  <th className="w-[180px] px-3 py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <SortButton
                        label="Trip @28"
                        sortKey="projected_trip_28"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                      <SortButton
                        label="Q @28"
                        sortKey="projected_q_28"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                    </div>
                  </th>

                  <th className="w-[190px] px-3 py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <SortButton
                        label="Trip @Max"
                        sortKey="projected_trip_max"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                      <SortButton
                        label="Q @Max"
                        sortKey="projected_q_max"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                    </div>
                  </th>

                  <th className="w-[170px] px-3 py-3 text-right">
                    <SortButton
                      label="คาดการณ์สูงสุด"
                      sortKey="projected_total_incentive_max_possible"
                      activeSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                  </th>

                  <th className="w-[360px] px-3 py-3 text-left">
                    สรุปโอกาส
                  </th>
                </tr>
              </thead>

              <tbody>
                {sortedData.map((row) => (
                  <tr
                    key={row.driver_id}
                    className="border-b align-top hover:bg-gray-50"
                  >
                    <td className="sticky left-0 z-10 bg-white px-3 py-3 shadow-[1px_0_0_0_#e5e7eb]">
                      <div className="font-semibold text-gray-900">
                        {row.driver_name || "-"}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {row.driver_id || "-"}
                      </div>

                      <div className="mt-1 text-[11px] text-muted-foreground">
                        ข้อมูลถึง: {row.data_as_of}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-medium">{row.แพล้นท์ || "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.รหัส || "-"} | {row.สถานะ || "-"}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        พจส/พจร ใช้เงื่อนไขวันทำงานเดียวกัน
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <StatusBadge row={row} />

                      <div
                        className={`mt-1 text-[11px] ${
                          row.is_eligible ? "text-green-700" : "text-red-600"
                        }`}
                      >
                        AC = {formatNumber(row.total_ac_value)}, NC ={" "}
                        {formatNumber(row.total_nc_value)}
                      </div>

                      {row.is_eligible ? (
                        <div className="mt-1 text-[11px] text-green-700">
                          ผ่านเงื่อนไขพื้นฐาน
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] text-red-600">
                          {row.disqualified_reason}
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      <div>
                        <span className="text-muted-foreground">จริง:</span>{" "}
                        <span className="font-semibold">
                          {formatNumber(row.working_days_value)} วัน
                        </span>
                      </div>

                      <div>
                        <span className="text-muted-foreground">นับสิทธิ์:</span>{" "}
                        <span
                          className={`font-semibold ${
                            row.is_work_possible
                              ? "text-green-700"
                              : "text-red-600"
                          }`}
                        >
                          {formatNumber(row.incentive_working_days)} วัน
                        </span>
                      </div>

                      <div className="mt-1">
                        <ProgressBar
                          value={row.incentive_working_days}
                          max={row.month_days}
                          danger={!row.is_work_possible}
                        />
                      </div>

                      <div className="mt-1 text-[11px] text-muted-foreground">
                        ถึงวันที่ {row.data_as_of_day} / {row.month_days} วัน
                      </div>

                      <div
                        className={`mt-1 text-[11px] font-medium ${
                          row.is_work_possible
                            ? "text-yellow-700"
                            : "text-red-600"
                        }`}
                      >
                        ไม่ได้นับสิทธิ์/หยุด {formatNumber(
                          row.missed_days_so_far
                        )} วัน
                      </div>

                      <div className="mt-1 text-[11px] font-medium text-gray-700">
                        Max นับสิทธิ์ {formatNumber(row.max_possible_working_days)} วัน
                      </div>

                      <div
                        className={`mt-1 text-[11px] ${
                          row.is_work_possible
                            ? "text-green-700"
                            : "text-red-600"
                        }`}
                      >
                        {row.projected_work_level_max_days} ={" "}
                        {formatMoney(row.projected_work_incentive_max_days)} บาท
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right">
                      <div
                        className={`font-semibold ${
                          row.late_days_value > 0
                            ? "text-orange-700"
                            : "text-gray-700"
                        }`}
                      >
                        {formatNumber(row.late_days_value)}
                      </div>

                      <div className="text-[11px] text-muted-foreground">
                        วัน
                      </div>

                      {row.late_days_value > 0 && (
                        <div className="mt-1 text-[11px] text-orange-700">
                          หักวันทำงาน
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      <div>
                        <span className="text-muted-foreground">Trip:</span>{" "}
                        <span className="font-semibold">
                          {formatNumber(row.trip_value)}
                        </span>
                      </div>

                      <div>
                        <span className="text-muted-foreground">Q:</span>{" "}
                        <span className="font-semibold">
                          {formatNumber(row.q_value)}
                        </span>
                      </div>

                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Avg Trip {formatNumber(row.avg_trip_per_day)} / วัน
                      </div>

                      <div className="text-[11px] text-muted-foreground">
                        Avg Q {formatNumber(row.avg_q_per_day)} / วัน
                      </div>

                      <div className="text-[11px] text-muted-foreground">
                        เฉลี่ยยังนับวันมาสายรวม
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right">
                      <div>
                        <span className="text-muted-foreground">Trip:</span>{" "}
                        <span
                          className={`font-semibold ${
                            row.is_trip_possible_at_28
                              ? "text-green-700"
                              : "text-red-600"
                          }`}
                        >
                          {formatNumber(row.projected_trip_28)}
                        </span>
                      </div>

                      <div>
                        <span className="text-muted-foreground">Q:</span>{" "}
                        <span
                          className={`font-semibold ${
                            row.is_q_possible_at_28
                              ? "text-green-700"
                              : "text-red-600"
                          }`}
                        >
                          {formatNumber(row.projected_q_28)}
                        </span>
                      </div>

                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Avg × 28 วัน
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right">
                      <div className="text-[11px] text-muted-foreground">
                        Max {formatNumber(row.projected_working_days_max)} วัน
                      </div>

                      <div>
                        <span className="text-muted-foreground">Trip:</span>{" "}
                        <span
                          className={`font-semibold ${
                            row.is_trip_possible_at_max
                              ? "text-green-700"
                              : "text-red-600"
                          }`}
                        >
                          {formatNumber(row.projected_trip_max)}
                        </span>
                      </div>

                      <div>
                        <span className="text-muted-foreground">Q:</span>{" "}
                        <span
                          className={`font-semibold ${
                            row.is_q_possible_at_max
                              ? "text-green-700"
                              : "text-red-600"
                          }`}
                        >
                          {formatNumber(row.projected_q_max)}
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right">
                      <div className="font-bold">
                        {formatMoney(
                          row.projected_total_incentive_max_possible
                        )}{" "}
                        บาท
                      </div>

                      <div className="mt-1 text-[11px] text-muted-foreground">
                        วัน {formatMoney(row.projected_work_incentive_max_days)}
                      </div>

                      <div className="text-[11px] text-muted-foreground">
                        เที่ยว {formatMoney(row.projected_trip_incentive_max)}
                      </div>

                      <div className="text-[11px] text-muted-foreground">
                        คิว {formatMoney(row.projected_q_incentive_max)}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <div className="space-y-1 text-[11px]">
                        <div>
                          <span className="font-medium">สถานะรวม:</span>{" "}
                          <span
                            className={
                              row.status_type === "danger"
                                ? "text-red-600"
                                : row.status_type === "success"
                                ? "text-green-700"
                                : "text-yellow-700"
                            }
                          >
                            {row.status_label}
                          </span>
                        </div>

                        <div>
                          <span className="font-medium">วันทำงาน:</span>{" "}
                          <span
                            className={
                              row.is_work_possible
                                ? "text-green-700"
                                : "text-red-600"
                            }
                          >
                            {row.work_status_message}
                          </span>
                        </div>

                        <div>
                          <span className="font-medium">มาสาย:</span>{" "}
                          <span
                            className={
                              row.late_days_value > 0
                                ? "text-orange-700"
                                : "text-green-700"
                            }
                          >
                            {formatNumber(row.late_days_value)} วัน
                          </span>
                        </div>

                        <div>
                          <span className="font-medium">เที่ยว:</span>{" "}
                          <span
                            className={
                              row.is_trip_possible_at_max
                                ? "text-green-700"
                                : "text-red-600"
                            }
                          >
                            {row.trip_status_message}
                          </span>
                        </div>

                        <div>
                          <span className="font-medium">คิว:</span>{" "}
                          <span
                            className={
                              row.is_q_possible_at_max
                                ? "text-green-700"
                                : "text-red-600"
                            }
                          >
                            {row.q_status_message}
                          </span>
                        </div>

                        {row.is_eligible ? (
                          <details className="mt-2 rounded-lg bg-gray-50 p-2">
                            <summary className="cursor-pointer text-[11px] font-medium">
                              รายละเอียด Projection
                            </summary>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {row.projection_summary}
                            </div>
                          </details>
                        ) : (
                          <div className="mt-2 rounded-lg bg-red-50 p-2 text-red-700">
                            หมดสิทธิ์ Incentive เพราะ AC/NC ต้องเป็น 0
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {sortedData.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        </> /* end projection tab */}

        {activeTab === "summary" && (
          <div className="space-y-5">

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "คนขับทั้งหมด", value: formatNumber(monthlySummaryStats.totalDrivers), unit: "คน", color: "text-gray-900" },
                { label: "รวมเงิน Incentive", value: formatMoney(monthlySummaryStats.totalIncentive), unit: "บาท", color: "text-green-700" },
                { label: "เฉลี่ยต่อคน (eligible)", value: formatMoney(monthlySummaryStats.avgIncentive), unit: "บาท", color: "text-blue-700" },
                { label: "Trip รวม", value: formatNumber(monthlySummaryStats.totalTrip), unit: "เที่ยว", color: "text-purple-700" },
                { label: "Q รวม", value: formatNumber(monthlySummaryStats.totalQ), unit: "คิว", color: "text-orange-700" },
                { label: "ผ่านเงื่อนไข AC/NC", value: `${formatNumber(monthlySummaryStats.eligibleDrivers)} / ${formatNumber(monthlySummaryStats.totalDrivers)}`, unit: "คน", color: "text-teal-700" },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className={`mt-1 text-xl font-bold ${card.color}`}>{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.unit}</p>
                </div>
              ))}
            </div>

            {/* Reward headcount summary */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold">สรุปยอด — คนที่ได้รับในแต่ละรางวัล</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left text-xs font-semibold text-gray-400">รางวัล</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-400">จำนวนคน</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-400">% จากทั้งหมด</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-400">รวมเงิน (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {monthlySummaryStats.rewardSummary.map((row) => {
                      const pct = monthlySummaryStats.totalDrivers > 0
                        ? (row.count / monthlySummaryStats.totalDrivers) * 100
                        : 0
                      return (
                        <tr key={row.label} className="hover:bg-gray-50">
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              <div className={`h-2.5 w-2.5 rounded-full ${row.color}`} />
                              <span className={`font-medium ${row.textColor}`}>{row.label}</span>
                            </div>
                          </td>
                          <td className="py-2.5 text-right font-bold text-gray-900">
                            {formatNumber(row.count)} คน
                          </td>
                          <td className="py-2.5 text-right text-gray-500">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className={`h-full rounded-full ${row.color}`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                              <span className="w-10 text-right text-xs">{pct.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 text-right font-medium text-gray-700">
                            {formatMoney(row.baht)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t-2">
                    <tr>
                      <td className="py-2 text-xs font-semibold text-gray-600">ทั้งหมด</td>
                      <td className="py-2 text-right text-xs font-bold">{formatNumber(monthlySummaryStats.totalDrivers)} คน</td>
                      <td />
                      <td className="py-2 text-right text-xs font-bold text-green-700">{formatMoney(monthlySummaryStats.totalIncentive)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Plant Analysis */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold">Plant Analysis — total_trip &amp; total_q</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left text-xs font-semibold text-gray-400">แพล้นท์</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-400">คนขับ</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-400">total_trip รวม</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-400">total_q รวม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {plantAnalysisData.map((row) => (
                      <tr key={row.plant} className="hover:bg-gray-50">
                        <td className="py-2 font-medium text-gray-900">{row.plant}</td>
                        <td className="py-2 text-right text-gray-600">{formatNumber(row.drivers)}</td>
                        <td className="py-2 text-right font-bold text-purple-700">{formatNumber(row.totalTrip)}</td>
                        <td className="py-2 text-right font-bold text-orange-700">{formatNumber(row.totalQ)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2">
                    <tr>
                      <td className="py-2 text-xs font-semibold text-gray-600">รวม</td>
                      <td className="py-2 text-right text-xs font-bold">{formatNumber(filteredData.length)}</td>
                      <td className="py-2 text-right text-xs font-bold text-purple-700">{formatNumber(plantAnalysisData.reduce((s, r) => s + r.totalTrip, 0))}</td>
                      <td className="py-2 text-right text-xs font-bold text-orange-700">{formatNumber(plantAnalysisData.reduce((s, r) => s + r.totalQ, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Breakdown Cards */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold">รางวัลวันทำงาน — แบ่งตามระดับ</h3>
                <div className="space-y-2">
                  {monthlySummaryStats.workLevels.map(([level, data]) => {
                    const maxBaht = Math.max(...monthlySummaryStats.workLevels.map((x) => x[1].baht), 1)
                    const pct = (data.baht / maxBaht) * 100
                    return (
                      <div key={level}>
                        <div className="mb-0.5 flex justify-between text-xs">
                          <span className="font-medium text-gray-700">{level}</span>
                          <span className="text-muted-foreground">{data.count} คน · {formatMoney(data.baht)} บาท</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-black" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold">รางวัลเที่ยวงาน — แบ่งตามระดับ</h3>
                <div className="space-y-2">
                  {monthlySummaryStats.tripLevels.map(([level, data]) => {
                    const maxBaht = Math.max(...monthlySummaryStats.tripLevels.map((x) => x[1].baht), 1)
                    const pct = (data.baht / maxBaht) * 100
                    return (
                      <div key={level}>
                        <div className="mb-0.5 flex justify-between text-xs">
                          <span className="font-medium text-gray-700">{level}</span>
                          <span className="text-muted-foreground">{data.count} คน · {formatMoney(data.baht)} บาท</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold">รางวัลคิว — แบ่งตามระดับ</h3>
                <div className="space-y-2">
                  {monthlySummaryStats.qLevels.map(([level, data]) => {
                    const maxBaht = Math.max(...monthlySummaryStats.qLevels.map((x) => x[1].baht), 1)
                    const pct = (data.baht / maxBaht) * 100
                    return (
                      <div key={level}>
                        <div className="mb-0.5 flex justify-between text-xs">
                          <span className="font-medium text-gray-700">{level}</span>
                          <span className="text-muted-foreground">{data.count} คน · {formatMoney(data.baht)} บาท</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Summary Table */}
            <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-3 border-b p-4 lg:flex-row lg:items-center">
                <div>
                  <h2 className="font-semibold">Monthly Summary — Actual Performance</h2>
                  <p className="text-sm text-muted-foreground">
                    ข้อมูลจริงเดือน {mmyy} · {formatNumber(summaryTableData.length)} คน · เรียงตามรวม Incentive มากไปน้อย
                  </p>
                </div>
                <button
                  onClick={exportMonthlySummary}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Export Monthly Summary
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-gray-50">
                    <tr className="border-b">
                      <th className="px-3 py-3 text-left font-semibold text-gray-500">Driver</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-500">แพล้นท์</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-500">สถานะ</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-500">วันทำงาน</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-500">มาสาย</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-500">GPM Trip</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-500">GPM Q</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-500">เงินวัน</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-500">เงินเที่ยว</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-500">เงินคิว</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-900">รวม Incentive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryTableData.map((row) => (
                      <tr key={row.driver_id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">{row.driver_name || "—"}</div>
                          <div className="text-muted-foreground">{row.driver_id || "—"}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{row.แพล้นท์ || "—"}</td>
                        <td className="px-3 py-2">
                          {row.is_eligible ? (
                            <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">ผ่าน</span>
                          ) : (
                            <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">ไม่ผ่าน</span>
                          )}
                          <div className="mt-0.5 text-[10px] text-muted-foreground">{row.สถานะ || ""}</div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="font-medium">{formatNumber(row.incentive_working_days)}</div>
                          <div className="text-muted-foreground">{row.work_level}</div>
                        </td>
                        <td className={`px-3 py-2 text-right ${row.late_days_value > 0 ? "font-medium text-orange-600" : "text-gray-400"}`}>
                          {formatNumber(row.late_days_value)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{formatNumber(row.trip_value)}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{formatNumber(row.q_value)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{formatMoney(row.work_incentive)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{formatMoney(row.trip_incentive)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{formatMoney(row.q_incentive)}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`text-sm font-bold ${row.total_incentive > 0 ? "text-green-700" : "text-gray-400"}`}>
                            {formatMoney(row.total_incentive)}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {summaryTableData.length === 0 && !loading && (
                      <tr>
                        <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">No data</td>
                      </tr>
                    )}
                  </tbody>
                  {summaryTableData.length > 0 && (
                    <tfoot className="border-t-2 bg-gray-50">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-gray-600">รวมทั้งหมด ({formatNumber(summaryTableData.length)} คน)</td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-purple-700">{formatNumber(monthlySummaryStats.totalTrip)}</td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-orange-700">{formatNumber(monthlySummaryStats.totalQ)}</td>
                        <td className="px-3 py-2 text-right text-xs font-bold">{formatMoney(summaryTableData.reduce((s, r) => s + r.work_incentive, 0))}</td>
                        <td className="px-3 py-2 text-right text-xs font-bold">{formatMoney(summaryTableData.reduce((s, r) => s + r.trip_incentive, 0))}</td>
                        <td className="px-3 py-2 text-right text-xs font-bold">{formatMoney(summaryTableData.reduce((s, r) => s + r.q_incentive, 0))}</td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-green-700">{formatMoney(monthlySummaryStats.totalIncentive)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}