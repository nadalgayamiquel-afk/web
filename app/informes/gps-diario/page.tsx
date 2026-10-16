"use client";

import GpsComparativeSection from "../components/GpsComparativeSection";

import { comparePlayersByTacticalPosition } from "@/app/lib/posiciones";
import React, { useEffect, useState, useRef, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getActiveJugadores, getGpsDatosReport, getOptimizadorSessionNumber } from "@/app/actions";
import { DISPONIBILIDADES, DisponibilidadCodigo, getSemaforoEstilos } from "@/app/lib/disponibilidad";
import { getLiveClientSessionNumber } from "@/app/lib/sessionCounter";
import { ReportNav } from "@/app/informes/ReportNav";
import { useReportClubInfo } from "@/app/lib/useReportClubInfo";
import { ALL_GPS_VARIABLES, useFavoriteGpsVariables, DEFAULT_FAVORITE_GPS_VARIABLES, calculateGpsMetricValue, getStoredDerivedVariables } from "@/app/lib/gpsVariables";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  Scatter,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";

type Jugador = {
  id: string;
  nombre: string;
  apodo: string | null;
  posicion: string | null;
  foto_url: string | null;
  fecha_nacimiento: string | null;
  activo: boolean | null;
  cor_id?: string | null;
  dorsal?: number | string | null;
};

type GpsRecord = {
  id: string;
  jugador_id: string;
  fecha: string;
  tipo_sesion: string | null;
  match_day: string | null;
  metricas: Record<string, any> | null;
};

// Claves JSONB confirmadas
const METRIC_DISTANCIA = "Distance(m)";
const METRIC_HSR = "HSR Abs (m)";
const METRIC_TOP_SPEED = "MAX Speed(km/h)";

function getTodayISO(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAutoDay(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T12:00:00");
    const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const dayName = dayNames[d.getDay()];
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dayName} ${dd}/${mm}`;
  } catch {
    return formatDateDDMMAAAA(dateStr);
  }
}

function formatDateDDMMAAAA(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}.${month}.${year}`;
  }
  return dateStr;
}

function calculateAge(fechaNacimiento: string | null): string {
  if (!fechaNacimiento) return "";
  const birthDate = new Date(fechaNacimiento);
  if (isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return `${age} años`;
}


function isRecordSimulado(record: any): boolean {
  if (!record || !record.metricas) return false;
  return Boolean(
    record.metricas.es_simulado ||
    record.metricas.tipo_registro === "SIMULADO" ||
    (record.metricas.colC && String(record.metricas.colC).toUpperCase().includes("SIMULA"))
  );
}

function getMetricValue(metricas: any, key: string, derivedList?: any[]): number {
  if (!metricas || typeof metricas !== "object") return 0;
  const derived = derivedList || (typeof window !== "undefined" ? getStoredDerivedVariables() : []);
  return calculateGpsMetricValue(metricas, key, derived);
}

function getEffectiveRecord(
  rec: any,
  activeTasks: string[],
  allTasks: string[],
  derivedVariablesList: any[] = []
): any {
  if (!rec) return null;
  if (!allTasks || allTasks.length === 0) return rec;

  // Si todas las tareas de la sesión están activadas, devolver el registro completo
  if (activeTasks.length === allTasks.length) {
    return rec;
  }

  // Si se han desmarcado todas las tareas de la sesión, todos los valores pasan a 0
  if (activeTasks.length === 0) {
    const zeroMetricas: any = {
      ...(rec.metricas || {}),
      tareas: [],
      _hasActiveTasks: false,
    };
    for (const key of Object.keys(zeroMetricas)) {
      if (
        key === "tareas" ||
        key === "_hasActiveTasks" ||
        key === "es_simulado" ||
        key === "tipo_registro" ||
        key === "origen_dato" ||
        key === "colC" ||
        key === "fecha" ||
        key === "jugador_id"
      ) {
        continue;
      }
      if (typeof zeroMetricas[key] === "number" || !isNaN(Number(zeroMetricas[key]))) {
        zeroMetricas[key] = 0;
      }
    }
    zeroMetricas["Distance(m)"] = 0;
    zeroMetricas["Distancia Total (m)"] = 0;
    zeroMetricas["Distancia Total"] = 0;
    zeroMetricas["distancia_total"] = 0;
    zeroMetricas["distance"] = 0;
    zeroMetricas["Distancia / Min"] = 0;
    zeroMetricas["m/min"] = 0;
    zeroMetricas["distancia_min"] = 0;
    zeroMetricas["Duration(min)"] = 0;
    zeroMetricas["Tiempo"] = 0;
    zeroMetricas["duracion_min"] = 0;
    zeroMetricas["duration"] = 0;
    zeroMetricas["TIiempo Activo"] = 0;
    zeroMetricas["tiempo_activo"] = 0;
    zeroMetricas["Tiempo Efectivo"] = 0;
    zeroMetricas["tiempo_efectivo"] = 0;
    zeroMetricas["MAX Speed(km/h)"] = 0;
    zeroMetricas["Vel Max"] = 0;
    zeroMetricas["max_speed"] = 0;
    zeroMetricas["top_speed"] = 0;
    zeroMetricas["average_speed"] = 0;
    zeroMetricas["Sprints Count"] = 0;
    zeroMetricas["+24 km/h (Num)"] = 0;
    zeroMetricas["num_sprints"] = 0;
    zeroMetricas["sprints"] = 0;
    zeroMetricas["Accs Count"] = 0;
    zeroMetricas["Acc + 3 m/s2 (Num)"] = 0;
    zeroMetricas["aceleraciones"] = 0;
    zeroMetricas["num_acc"] = 0;
    zeroMetricas["Acc + 4 m/s2 (Num)"] = 0;
    zeroMetricas["Max Acc"] = 0;
    zeroMetricas["max_acc"] = 0;
    zeroMetricas["Decs Count"] = 0;
    zeroMetricas["Dec + 3 m/s2 (Num)"] = 0;
    zeroMetricas["desaceleraciones"] = 0;
    zeroMetricas["num_dec"] = 0;
    zeroMetricas["Dec + 4 m/s2 (Num)"] = 0;
    zeroMetricas["Max Dec"] = 0;
    zeroMetricas["max_dec"] = 0;
    zeroMetricas["Acc + Dec"] = 0;
    zeroMetricas["Acc+Dec"] = 0;
    zeroMetricas["acc_dec"] = 0;
    zeroMetricas["Player Load"] = 0;
    zeroMetricas["player_load"] = 0;
    zeroMetricas["load"] = 0;
    zeroMetricas["carga"] = 0;
    zeroMetricas["HMLD"] = 0;
    zeroMetricas["hmld"] = 0;
    zeroMetricas["HMLD (num)"] = 0;
    zeroMetricas["hmld_time"] = 0;
    zeroMetricas["1 - 8 km/h (Distancia)"] = 0;
    zeroMetricas["8 - 17 km/h (Distancia)"] = 0;
    zeroMetricas["17 - 19,8 km/h (Distancia)"] = 0;
    zeroMetricas["19,8 - 21 km/h (Distancia)"] = 0;
    zeroMetricas["21 - 24 km/h (Distancia)"] = 0;
    zeroMetricas["+ 24 km/h (Distancia)"] = 0;
    zeroMetricas["Distance +21 (m)"] = 0;
    zeroMetricas["Distancia (+21km/h) (m)"] = 0;
    zeroMetricas["+ 21 km/h (Distancia)"] = 0;
    zeroMetricas["HSR Abs (m)"] = 0;
    zeroMetricas["hsr"] = 0;
    zeroMetricas["+28 km/h (Distancia)"] = 0;
    zeroMetricas["+28 km/h (Num)"] = 0;
    zeroMetricas["+28 km/h (Tiempo)"] = 0;
    zeroMetricas["num_hids"] = 0;

    return {
      ...rec,
      duracion: 0,
      metricas: zeroMetricas,
    };
  }

  const rawTasks = rec.metricas?.tareas || rec.tareas;

  // Caso 1: El registro contiene el desglose de tareas en metricas.tareas
  if (Array.isArray(rawTasks) && rawTasks.length > 0) {
    const activeTasksForPlayer = rawTasks.filter((t: any) => {
      const name = (t.nombre || t.name || t.tarea || t.task || "").trim();
      return activeTasks.some((sel) => sel.toLowerCase() === name.toLowerCase());
    });

    const inactiveTasksForPlayer = rawTasks.filter((t: any) => {
      const name = (t.nombre || t.name || t.tarea || t.task || "").trim();
      return !activeTasks.some((sel) => sel.toLowerCase() === name.toLowerCase());
    });

    if (activeTasksForPlayer.length === rawTasks.length) {
      return rec;
    }

    if (activeTasksForPlayer.length === 0) {
      return getEffectiveRecord(rec, [], allTasks, derivedVariablesList);
    }

    let sumDist = 0;
    let sumDur = 0;
    let sumDurAct = 0;
    let sumDurEf = 0;
    let sumSprints = 0;
    let sumAcc = 0;
    let sumAcc4 = 0;
    let sumDec = 0;
    let sumDec4 = 0;
    let sumPL = 0;
    let maxSpeed = 0;
    let maxAcc = 0;
    let maxDec = 0;
    let sumHsr = 0;
    let sumV1_8 = 0;
    let sumV8_17 = 0;
    let sumV17_19 = 0;
    let sumV19_21 = 0;
    let sumV21 = 0;
    let sumV24 = 0;
    let sumV28Num = 0;
    let sumV28Dist = 0;
    let sumV28Time = 0;
    let sumHids = 0;
    let sumHmld = 0;
    let sumHmldNum = 0;
    let sumHmldTime = 0;

    activeTasksForPlayer.forEach((t: any) => {
      const d = Number(t["Distance(m)"] || t["Distancia Total (m)"] || t["Distancia Total"] || t.distancia_total || t.distance || 0);
      const dur = Number(t["Duration(min)"] || t.Tiempo || t.duracion_min || t.duration || 0);
      const tAct = Number(t["TIiempo Activo"] || t.tiempo_activo || 0);
      const tEf = Number(t["Tiempo Efectivo"] || t.tiempo_efectivo || 0);
      const sp = Number(t["Sprints Count"] || t["+24 km/h (Num)"] || t.num_sprints || t.sprints || 0);
      const ac = Number(t["Accs Count"] || t["Acc + 3 m/s2 (Num)"] || t.aceleraciones || t.num_acc || t.acc || 0);
      const ac4 = Number(t["Acc + 4 m/s2 (Num)"] || 0);
      const dc = Number(t["Decs Count"] || t["Dec + 3 m/s2 (Num)"] || t.desaceleraciones || t.num_dec || t.dec || 0);
      const dc4 = Number(t["Dec + 4 m/s2 (Num)"] || 0);
      const pl = Number(t["Player Load"] || t.player_load || t.load || t.carga || t.HMLD || t.hmld || 0);
      const spd = Number(t["MAX Speed(km/h)"] || t["Vel Max"] || t.max_speed || t.top_speed || 0);
      const mAc = Number(t["Max Acc"] || t.max_acc || 0);
      const mDc = Math.abs(Number(t["Max Dec"] || t.max_dec || 0));
      const hsrVal = Number(t["HSR Abs (m)"] || t.hsr || 0);

      sumDist += d;
      sumDur += dur;
      sumDurAct += tAct;
      sumDurEf += tEf;
      sumSprints += sp;
      sumAcc += ac;
      sumAcc4 += ac4;
      sumDec += dc;
      sumDec4 += dc4;
      sumPL += pl;
      if (spd > maxSpeed) maxSpeed = spd;
      if (mAc > maxAcc) maxAcc = mAc;
      if (mDc > maxDec) maxDec = mDc;
      sumHsr += hsrVal;

      sumV1_8 += Number(t["1 - 8 km/h (Distancia)"] || 0);
      sumV8_17 += Number(t["8 - 17 km/h (Distancia)"] || 0);
      sumV17_19 += Number(t["17 - 19,8 km/h (Distancia)"] || 0);
      sumV19_21 += Number(t["19,8 - 21 km/h (Distancia)"] || 0);
      sumV21 += Number(t["21 - 24 km/h (Distancia)"] || 0);
      sumV24 += Number(t["+ 24 km/h (Distancia)"] || 0);
      sumV28Num += Number(t["+28 km/h (Num)"] || 0);
      sumV28Dist += Number(t["+28 km/h (Distancia)"] || 0);
      sumV28Time += Number(t["+28 km/h (Tiempo)"] || 0);
      sumHids += Number(t.num_hids || 0);
      sumHmld += Number(t.HMLD || t.hmld || 0);
      sumHmldNum += Number(t["HMLD (num)"] || 0);
      sumHmldTime += Number(t.hmld_time || 0);
    });

    if (sumHsr === 0 && (sumV21 > 0 || sumV24 > 0 || sumV19_21 > 0)) {
      sumHsr = Math.round(sumV21 + sumV24 + sumV19_21);
    }

    const origDist = Number(rec.metricas?.["Distance(m)"] || rec.metricas?.["Distancia Total (m)"] || 0);
    const origHsr = Number(rec.metricas?.["HSR Abs (m)"] || rec.metricas?.hsr || 0);
    let finalHsr = sumHsr;
    if (finalHsr === 0 && origHsr > 0 && origDist > 0 && sumDist > 0) {
      finalHsr = Math.round(origHsr * (sumDist / origDist));
    }

    const distMin = sumDur > 0 ? Math.round((sumDist / sumDur) * 100) / 100 : 0;
    const avgSpd = distMin > 0 ? Math.round((distMin * 0.06) * 100) / 100 : 0;
    const dist21 = Math.round(sumV21 + sumV24);
    const accDec = Math.round(sumAcc + sumDec);
    const finalPL = sumPL > 0 ? Math.round(sumPL) : (sumHmld > 0 ? Math.round(sumHmld) : 0);

    const newMetricas: any = {};
    const origDur = Number(rec.metricas?.["Duration(min)"] || rec.metricas?.Tiempo || rec.duracion || 0);
    const durRatio = origDur > 0 ? (sumDur / origDur) : (activeTasksForPlayer.length / rawTasks.length);

    if (rec.metricas && typeof rec.metricas === "object") {
      for (const [k, v] of Object.entries(rec.metricas)) {
        if (
          k === "tareas" ||
          k === "_hasActiveTasks" ||
          k === "es_simulado" ||
          k === "tipo_registro" ||
          k === "origen_dato" ||
          k === "colC" ||
          k === "fecha" ||
          k === "jugador_id"
        ) {
          newMetricas[k] = v;
          continue;
        }

        const numVal = Number(v);
        if (isNaN(numVal)) {
          newMetricas[k] = v;
          continue;
        }

        let actSum = 0;
        let hasInTasks = false;
        for (const t of activeTasksForPlayer) {
          if (t[k] !== undefined && t[k] !== null && !isNaN(Number(t[k]))) {
            actSum += Number(t[k]);
            hasInTasks = true;
          }
        }

        if (hasInTasks) {
          newMetricas[k] = Math.max(0, Math.round(actSum * 100) / 100);
        } else {
          newMetricas[k] = Math.max(0, Math.round(numVal * durRatio * 100) / 100);
        }
      }
    }

    newMetricas["Distance(m)"] = Math.round(sumDist);
    newMetricas["Distancia Total (m)"] = Math.round(sumDist);
    newMetricas["Distancia Total"] = Math.round(sumDist);
    newMetricas["distancia_total"] = Math.round(sumDist);
    newMetricas["distance"] = Math.round(sumDist);

    newMetricas["Duration(min)"] = Math.round(sumDur * 100) / 100;
    newMetricas["Tiempo"] = Math.round(sumDur * 100) / 100;
    newMetricas["duracion_min"] = Math.round(sumDur * 100) / 100;
    newMetricas["duration"] = Math.round(sumDur * 100) / 100;

    newMetricas["TIiempo Activo"] = Math.round(sumDurAct * 100) / 100;
    newMetricas["tiempo_activo"] = Math.round(sumDurAct * 100) / 100;
    newMetricas["Tiempo Efectivo"] = Math.round(sumDurEf * 100) / 100;
    newMetricas["tiempo_efectivo"] = Math.round(sumDurEf * 100) / 100;

    newMetricas["Distancia / Min"] = distMin;
    newMetricas["m/min"] = distMin;
    newMetricas["distancia_min"] = distMin;
    newMetricas["average_speed"] = avgSpd;

    newMetricas["MAX Speed(km/h)"] = maxSpeed;
    newMetricas["Vel Max"] = maxSpeed;
    newMetricas["max_speed"] = maxSpeed;
    newMetricas["top_speed"] = maxSpeed;

    newMetricas["Sprints Count"] = Math.round(sumSprints);
    newMetricas["+24 km/h (Num)"] = Math.round(sumSprints);
    newMetricas["num_sprints"] = Math.round(sumSprints);
    newMetricas["sprints"] = Math.round(sumSprints);

    newMetricas["Accs Count"] = Math.round(sumAcc);
    newMetricas["Acc + 3 m/s2 (Num)"] = Math.round(sumAcc);
    newMetricas["aceleraciones"] = Math.round(sumAcc);
    newMetricas["num_acc"] = Math.round(sumAcc);
    newMetricas["Acc + 4 m/s2 (Num)"] = Math.round(sumAcc4);
    newMetricas["Max Acc"] = maxAcc;
    newMetricas["max_acc"] = maxAcc;

    newMetricas["Decs Count"] = Math.round(sumDec);
    newMetricas["Dec + 3 m/s2 (Num)"] = Math.round(sumDec);
    newMetricas["desaceleraciones"] = Math.round(sumDec);
    newMetricas["num_dec"] = Math.round(sumDec);
    newMetricas["Dec + 4 m/s2 (Num)"] = Math.round(sumDec4);
    newMetricas["Max Dec"] = maxDec;
    newMetricas["max_dec"] = maxDec;

    newMetricas["Acc + Dec"] = accDec;
    newMetricas["Acc+Dec"] = accDec;
    newMetricas["acc_dec"] = accDec;

    newMetricas["Player Load"] = finalPL;
    newMetricas["player_load"] = finalPL;
    newMetricas["load"] = finalPL;
    newMetricas["carga"] = finalPL;

    newMetricas["HMLD"] = Math.round(sumHmld);
    newMetricas["hmld"] = Math.round(sumHmld);
    newMetricas["HMLD (num)"] = Math.round(sumHmldNum);
    newMetricas["hmld_time"] = Math.round(sumHmldTime * 100) / 100;

    newMetricas["HSR Abs (m)"] = finalHsr;
    newMetricas["hsr"] = finalHsr;

    newMetricas["1 - 8 km/h (Distancia)"] = Math.round(sumV1_8);
    newMetricas["8 - 17 km/h (Distancia)"] = Math.round(sumV8_17);
    newMetricas["17 - 19,8 km/h (Distancia)"] = Math.round(sumV17_19);
    newMetricas["19,8 - 21 km/h (Distancia)"] = Math.round(sumV19_21);
    newMetricas["21 - 24 km/h (Distancia)"] = Math.round(sumV21);
    newMetricas["+ 24 km/h (Distancia)"] = Math.round(sumV24);
    newMetricas["Distance +21 (m)"] = dist21;
    newMetricas["Distancia (+21km/h) (m)"] = dist21;
    newMetricas["+ 21 km/h (Distancia)"] = dist21;

    newMetricas["+28 km/h (Num)"] = Math.round(sumV28Num);
    newMetricas["+28 km/h (Distancia)"] = Math.round(sumV28Dist);
    newMetricas["+28 km/h (Tiempo)"] = Math.round(sumV28Time * 100) / 100;
    newMetricas["num_hids"] = Math.round(sumHids);

    newMetricas.tareas = activeTasksForPlayer;
    newMetricas._hasActiveTasks = true;

    return {
      ...rec,
      duracion: Math.round(sumDur * 100) / 100,
      metricas: newMetricas,
    };
  }

  // Caso 2: Si el registro no tiene tareas desglosadas pero hay tareas en la sesión y se han desmarcado algunas
  if (activeTasks.length < allTasks.length) {
    const ratio = activeTasks.length / allTasks.length;
    const scaledMetricas: any = { ...(rec.metricas || {}) };
    for (const [k, v] of Object.entries(scaledMetricas)) {
      if (
        k === "tareas" ||
        k === "_hasActiveTasks" ||
        k === "es_simulado" ||
        k === "tipo_registro" ||
        k === "origen_dato" ||
        k === "colC" ||
        k === "fecha" ||
        k === "jugador_id"
      ) {
        continue;
      }
      const numVal = Number(v);
      if (!isNaN(numVal)) {
        scaledMetricas[k] = Math.max(0, Math.round(numVal * ratio * 100) / 100);
      }
    }
    const origDur = Number(rec.duracion || rec.metricas?.["Duration(min)"] || 0);
    return {
      ...rec,
      duracion: Math.max(0, Math.round(origDur * ratio * 100) / 100),
      metricas: scaledMetricas,
    };
  }

  return rec;
}

function SessionTasksSelector({
  availableTasks,
  selectedTasks,
  onToggleTask,
  onSelectAll,
  onDeselectAll,
  subViewName,
}: {
  availableTasks: string[];
  selectedTasks: string[];
  onToggleTask: (taskName: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  subViewName?: string;
}) {
  if (!availableTasks || availableTasks.length === 0) return null;

  const allSelected = selectedTasks.length === availableTasks.length;
  const countExcluded = availableTasks.length - selectedTasks.length;

  return (
    <div
      className="no-print"
      style={{
        background: "#ffffff",
        border: countExcluded > 0 ? "1.5px solid #f59e0b" : "1px solid #cbd5e1",
        borderRadius: "10px",
        padding: "10px 14px",
        marginBottom: "14px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        transition: "all 0.2s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "8px",
          paddingBottom: "6px",
          borderBottom: "1px solid #f1f5f9",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 800,
              color: "#1e3a8a",
              textTransform: "uppercase",
              letterSpacing: "0.3px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>📋</span> Tareas de la sesión ({selectedTasks.length}/{availableTasks.length} activadas)
          </span>
          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
            {subViewName
              ? `(Desmarca una casilla para restar o excluir los valores de esa tarea en ${subViewName})`
              : "(Desmarca una casilla para restar o excluir los valores de esa tarea)"}
          </span>
          {countExcluded > 0 && (
            <span
              style={{
                background: "#fef3c7",
                color: "#92400e",
                fontSize: "10.5px",
                fontWeight: 800,
                padding: "2px 8px",
                borderRadius: "6px",
                border: "1px solid #fde68a",
              }}
            >
              ⚠️ {countExcluded} {countExcluded === 1 ? "tarea restada" : "tareas restadas"}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            onClick={onSelectAll}
            disabled={allSelected}
            style={{
              fontSize: "11px",
              fontWeight: 700,
              padding: "3px 9px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: allSelected ? "#f8fafc" : "#ffffff",
              color: allSelected ? "#94a3b8" : "#1e3a8a",
              cursor: allSelected ? "default" : "pointer",
              transition: "all 0.15s ease",
            }}
            title="Activar todas las tareas de la sesión"
          >
            ✓ Todas
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            disabled={selectedTasks.length === 0}
            style={{
              fontSize: "11px",
              fontWeight: 700,
              padding: "3px 9px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: selectedTasks.length === 0 ? "#f8fafc" : "#ffffff",
              color: selectedTasks.length === 0 ? "#94a3b8" : "#dc2626",
              cursor: selectedTasks.length === 0 ? "default" : "pointer",
              transition: "all 0.15s ease",
            }}
            title="Desactivar todas las tareas"
          >
            ✕ Ninguna
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {availableTasks.map((tName) => {
          const isChecked = selectedTasks.some((s) => s.toLowerCase() === tName.toLowerCase());
          return (
            <label
              key={tName}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "4px 11px",
                borderRadius: "7px",
                border: isChecked ? "1.5px solid #2563eb" : "1.5px solid #cbd5e1",
                background: isChecked ? "#eff6ff" : "#f8fafc",
                color: isChecked ? "#1e40af" : "#94a3b8",
                fontSize: "12px",
                fontWeight: isChecked ? 800 : 600,
                cursor: "pointer",
                userSelect: "none",
                transition: "all 0.15s ease",
                textDecoration: isChecked ? "none" : "line-through",
                boxShadow: isChecked ? "0 1px 3px rgba(37, 99, 235, 0.12)" : "none",
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggleTask(tName)}
                style={{
                  accentColor: "#2563eb",
                  cursor: "pointer",
                  width: "14px",
                  height: "14px",
                }}
              />
              <span>{tName}</span>
              {!isChecked && (
                <span style={{ fontSize: "10px", color: "#ef4444", fontWeight: 700, textDecoration: "none" }}>
                  (Restada)
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function getJugadorDisplayName(j: Jugador): string {
  const nombre = j.nombre || "Jugador";
  if (j.apodo && j.apodo.trim() && j.apodo.toLowerCase() !== nombre.toLowerCase()) {
    return `${nombre} (${j.apodo})`;
  }
  return nombre;
}

function getPlayerFirstName(j: Jugador | null): string {
  if (!j) return "Jugador";
  if (j.apodo && j.apodo.trim()) return j.apodo;
  const nombre = j.nombre || "Jugador";
  return nombre.trim().split(" ")[0] || nombre;
}

// Componente Buscador + Desplegable para seleccionar deportistas activos
function SearchableJugadorSelect({
  jugadores,
  selectedJugadorId,
  onSelectJugador,
}: {
  jugadores: Jugador[];
  selectedJugadorId: string;
  onSelectJugador: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedJugador = jugadores.find((j) => j.id === selectedJugadorId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredJugadores = jugadores.filter(
    (j) =>
      j.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (j.apodo && j.apodo.toLowerCase().includes(search.toLowerCase())) ||
      (j.posicion && j.posicion.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div ref={dropdownRef} style={{ position: "relative", minWidth: "320px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "#ffffff",
          border: isOpen ? "2px solid #1e3a8a" : "1px solid #cbd5e1",
          borderRadius: "8px",
          padding: "4px 10px",
          cursor: "pointer",
          boxShadow: isOpen ? "0 0 0 3px rgba(30, 58, 138, 0.1)" : "0 1px 3px rgba(0,0,0,0.05)",
          transition: "all 0.15s ease",
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ fontSize: "13px", marginRight: "8px", color: "var(--muted)" }}>⌕</span>
        <input
          type="text"
          placeholder="Escribe o selecciona deportista activo..."
          value={isOpen ? search : selectedJugador ? `${getJugadorDisplayName(selectedJugador)} · ${selectedJugador.posicion || "Sin pos."}` : ""}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setSearch("");
            setIsOpen(true);
          }}
          style={{
            border: "none",
            background: "transparent",
            outline: "none",
            fontSize: "13.5px",
            fontWeight: 600,
            color: "#17202b",
            width: "100%",
            cursor: "text",
          }}
        />
        <span style={{ fontSize: "10px", color: "var(--muted)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          ▼
        </span>
      </div>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: "260px",
            overflowY: "auto",
            background: "#ffffff",
            borderRadius: "10px",
            boxShadow: "0 10px 24px rgba(0, 0, 0, 0.15)",
            border: "1px solid #e2e6e3",
            zIndex: 100,
            padding: "4px",
          }}
        >
          {filteredJugadores.length === 0 ? (
            <div style={{ padding: "10px", fontSize: "12px", color: "var(--muted)", textAlign: "center" }}>
              No se encontraron deportistas activos
            </div>
          ) : (
            filteredJugadores.map((j) => {
              const isSelected = j.id === selectedJugadorId;
              const displayName = getJugadorDisplayName(j);

              return (
                <div
                  key={j.id}
                  onClick={() => {
                    onSelectJugador(j.id);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    background: isSelected ? "#e0f2fe" : "transparent",
                    color: isSelected ? "#0369a1" : "#17202b",
                    fontWeight: isSelected ? 700 : 500,
                    fontSize: "13px",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "#f1f5f9";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        background: isSelected ? "#0284c7" : "#24374d",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10.5px",
                        fontWeight: 700,
                      }}
                    >
                      {j.nombre.slice(0, 2).toUpperCase()}
                    </div>
                    <span>{displayName}</span>
                  </div>
                  <span style={{ fontSize: "11px", color: isSelected ? "#0369a1" : "var(--muted)", fontWeight: 500 }}>
                    {j.posicion || "Sin pos."}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// Función para calcular la escala de azul suave (de azul clarito a azul medio/suave, sin oscurecer en exceso)
function getMetricHeatmapColor(
  val: number,
  min: number,
  max: number
): { bg: string; color: string; fontWeight: number } {
  if (max <= min || isNaN(val) || val <= 0) {
    return { bg: "transparent", color: "#334155", fontWeight: 600 };
  }

  const ratio = Math.max(0, Math.min(1, (val - min) / (max - min)));

  // Interpolación de azul suave y elegante:
  // - ratio 0.0 (menor): rgb(246, 250, 254) (fondo casi blanco con sutil matiz azul)
  // - ratio 1.0 (mayor): rgb(160, 205, 250) (azul cielo pastel suave, sin saturar)
  const r = Math.round(246 + (160 - 246) * ratio);
  const g = Math.round(250 + (205 - 250) * ratio);
  const b = Math.round(254 + (250 - 254) * ratio);

  // Todo el texto se mantiene en azul marino oscuro (#0f172a / #1e3a8a) de alta legibilidad
  const textColor = ratio >= 0.85 ? "#1e3a8a" : "#0f172a";
  const weight = ratio >= 0.85 ? 800 : 600;

  return {
    bg: `rgb(${r}, ${g}, ${b})`,
    color: textColor,
    fontWeight: weight,
  };
}

function InformeGpsDiarioContent() {
  const searchParams = useSearchParams();
  const initialJugadorId = searchParams.get("jugadorId") || "";

  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [selectedJugadorId, setSelectedJugadorId] = useState<string>(initialJugadorId);
  const [jugador, setJugador] = useState<Jugador | null>(null);

  const [playerGpsRecords, setPlayerGpsRecords] = useState<GpsRecord[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayISO());
  const [teamGpsRecords, setTeamGpsRecords] = useState<GpsRecord[]>([]);
  const [optimizadorSessionNum, setOptimizadorSessionNum] = useState<number>(17);
  const [loading, setLoading] = useState<boolean>(true);
  const [mainTab, setMainTab] = useState<"gps" | "general" | "completo">("gps");
  const [subView, setSubView] = useState<"jugador" | "comparativa" | "equipo">("jugador");
  const [commentJugador, setCommentJugador] = useState<string>("");
  const [commentEquipo, setCommentEquipo] = useState<string>("");
  const [sessionHeaderComment, setSessionHeaderComment] = useState<string>("");
  const [playerComments, setPlayerComments] = useState<Record<string, string>>({});
  const [hoveredBadge, setHoveredBadge] = useState<{ id: string; text: string; x: number; y: number } | null>(null);
  const [selectedTaskNames, setSelectedTaskNames] = useState<string[]>([]);

  
  // Variables GPS y Favoritas configuradas en Ajustes
  const { favoriteKeys, favoriteVariables, allVariables, derivedVariables } = useFavoriteGpsVariables();

  const resolveCurrentMatchDay = (): string => {
    if (typeof window !== "undefined") {
      try {
        const planKeys = ["planificacion_days_v5", "planificacion_days_v2", "planificacion_days_v1"];
        for (const k of planKeys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const days = JSON.parse(raw);
            const found = (Array.isArray(days) ? days : Object.values(days)).find(
              (d: any) => d && (d.fecha === selectedDate || d.id === selectedDate)
            );
            if (found?.md && typeof found.md === "string" && found.md.trim()) {
              const clean = found.md.trim();
              return /^[-+]?\d+\s*MD$/i.test(clean) ? `MD${clean.replace(/MD/i, "").trim()}` : clean;
            }
          }
        }
      } catch (e) {}
    }

    const currentRecordRaw = playerGpsRecords.find((r) => r.fecha === selectedDate);
    if (currentRecordRaw?.match_day && typeof currentRecordRaw.match_day === "string" && currentRecordRaw.match_day.trim()) {
      return currentRecordRaw.match_day.trim();
    }

    const teamRecWithMd = teamGpsRecords.find(
      (r) => r.fecha === selectedDate && r.match_day && typeof r.match_day === "string" && r.match_day.trim()
    );
    if (teamRecWithMd?.match_day) {
      return teamRecWithMd.match_day.trim();
    }

    return "MD";
  };

  const getExportDocumentName = () => {
    let tipo = "GPS";
    if (mainTab === "general") tipo = "General";
    else if (mainTab === "completo") tipo = "Completo";

    const currentMd = resolveCurrentMatchDay();
    const sesionStr = currentMd && currentMd !== "MD" ? `Sesión ${currentMd}` : "Sesión";

    const sujetoStr = subView === "jugador"
      ? (jugador?.apodo || jugador?.nombre || "Jugador")
      : "Equipo";

    const fechaStr = selectedDate || new Date().toISOString().split("T")[0];

    return `Informe ${tipo} ${sesionStr} ${sujetoStr} ${fechaStr}`.replace(/\s+/g, " ").trim();
  };

  const handleExportPDF = () => {
    if (typeof window === "undefined") return;
    const exportName = getExportDocumentName();
    const prevTitle = document.title;
    document.title = exportName;
    window.print();
    setTimeout(() => {
      document.title = prevTitle;
    }, 1500);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      document.title = getExportDocumentName();
    }
  }, [mainTab, subView, jugador, selectedDate, teamGpsRecords, playerGpsRecords]);
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(true);
  const [tableMetricsOnlyFav, setTableMetricsOnlyFav] = useState<boolean>(true);

  // Lista de métricas GPS disponibles (todas las variables de la base de datos)
  const GPS_METRICS_LIST = ALL_GPS_VARIABLES;

  const getVariableDef = (metricKey: string) => {
    const foundInAll = allVariables.find((v) => v.key === metricKey);
    if (foundInAll) return foundInAll;

    const foundInDerived = derivedVariables.find((d) => d.id === metricKey);
    if (foundInDerived) {
      return {
        key: foundInDerived.id,
        label: foundInDerived.label,
        shortLabel: foundInDerived.shortLabel || foundInDerived.label,
        unit: foundInDerived.unit,
        categoria: "Variables Derivadas" as const,
        esDerivada: true,
      };
    }

    const foundInBase = ALL_GPS_VARIABLES.find((v) => v.key === metricKey);
    if (foundInBase) return foundInBase;

    return {
      key: metricKey,
      label: metricKey.startsWith("derived_") ? "Variable Derivada" : metricKey,
      shortLabel: metricKey.startsWith("derived_") ? "Derivada" : metricKey,
      unit: "",
      categoria: "Variables Derivadas" as const,
    };
  };

  const getHeaderTitle = (def: { label?: string; key: string; unit?: string }) => {
    const lbl = def.label && !def.label.startsWith("derived_") ? def.label : "Variable Derivada";
    if (!def.unit || def.unit.trim() === "" || lbl.includes(`(${def.unit})`)) {
      return lbl;
    }
    return `${lbl} (${def.unit})`;
  };



  // Estados de configuración para los gráficos comparativos de Jugador (Fila 1 y Fila 2)
  const [playerChartMetric1, setPlayerChartMetric1] = useState<string>("Distance(m)");
  const [playerChartMetric2, setPlayerChartMetric2] = useState<string>("MAX Speed(km/h)");
  const [playerChartMetric3, setPlayerChartMetric3] = useState<string>("Distance +21 (m)");
  const [playerChartMetric4, setPlayerChartMetric4] = useState<string>("Acc +3 (m/s2)");
  const [playerTableMetrics, setPlayerTableMetrics] = useState<string[]>([]);

  const handlePlayerChartMetric1Change = (val: string) => {
    setPlayerChartMetric1(val);
    if (typeof window !== "undefined") localStorage.setItem("gps_player_chart_metric1", val);
  };
  const handlePlayerChartMetric2Change = (val: string) => {
    setPlayerChartMetric2(val);
    if (typeof window !== "undefined") localStorage.setItem("gps_player_chart_metric2", val);
  };
  const handlePlayerChartMetric3Change = (val: string) => {
    setPlayerChartMetric3(val);
    if (typeof window !== "undefined") localStorage.setItem("gps_player_chart_metric3", val);
  };
  const handlePlayerChartMetric4Change = (val: string) => {
    setPlayerChartMetric4(val);
    if (typeof window !== "undefined") localStorage.setItem("gps_player_chart_metric4", val);
  };

  const handlePlayerTableMetricsChange = (newMetrics: string[]) => {
    setPlayerTableMetrics(newMetrics);
    if (typeof window !== "undefined") {
      localStorage.setItem("gps_player_table_metrics", JSON.stringify(newMetrics));
    }
  };

  const [chart1LeftMetric, setChart1LeftMetric] = useState<string>("Distance(m)");
  const [chart1RightMetric, setChart1RightMetric] = useState<string>("MAX Speed(km/h)");

  const [chart1Comment, setChart1Comment] = useState<string>("");

  const [chart2LeftMetric, setChart2LeftMetric] = useState<string>("MAX Speed(km/h)");
  const [chart2RightMetric, setChart2RightMetric] = useState<string>("Player Load");
  const [chart2Comment, setChart2Comment] = useState<string>("");
  const [tableComment, setTableComment] = useState<string>("");
  const [equipoSessionComment, setEquipoSessionComment] = useState<string>("");
  const [tableMetrics, setTableMetrics] = useState<string[]>([]);

  const handleTableMetricsChange = (newMetrics: string[]) => {
    setTableMetrics(newMetrics);
    if (typeof window !== "undefined") {
      localStorage.setItem("gps_equipo_table_metrics", JSON.stringify(newMetrics));
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const c1l = localStorage.getItem("gps_equipo_chart1_left_metric");
      if (c1l && c1l !== "HSR Abs (m)") setChart1LeftMetric(c1l);
      const c1r = localStorage.getItem("gps_equipo_chart1_right_metric");
      if (c1r) {
        if (c1r === "HSR Abs (m)") {
          setChart1RightMetric("MAX Speed(km/h)");
          try { localStorage.setItem("gps_equipo_chart1_right_metric", "MAX Speed(km/h)"); } catch (e) {}
        } else {
          setChart1RightMetric(c1r);
        }
      }
      const c2l = localStorage.getItem("gps_equipo_chart2_left_metric");
      if (c2l && c2l !== "HSR Abs (m)") setChart2LeftMetric(c2l);
      const c2r = localStorage.getItem("gps_equipo_chart2_right_metric");
      if (c2r && c2r !== "HSR Abs (m)") setChart2RightMetric(c2r);

      const c1s = localStorage.getItem("gps_equipo_chart1_sort_metric");
      if (c1s && c1s !== "HSR Abs (m)") setChart1SortMetric(c1s);
      const c2s = localStorage.getItem("gps_equipo_chart2_sort_metric");
      if (c2s && c2s !== "HSR Abs (m)") setChart2SortMetric(c2s);

      const storedTableSort = localStorage.getItem("gps_equipo_table_sort_mode");
      if (storedTableSort && ["habitual", "posicion", "mayor", "menor"].includes(storedTableSort)) {
        setTableSortMode(storedTableSort as any);
      }
      const storedC1Sort = localStorage.getItem("gps_equipo_chart1_sort_mode");
      if (storedC1Sort && ["posicion", "alfabetico", "valor"].includes(storedC1Sort)) {
        setChart1SortMode(storedC1Sort as any);
      }
      const storedC2Sort = localStorage.getItem("gps_equipo_chart2_sort_mode");
      if (storedC2Sort && ["posicion", "alfabetico", "valor"].includes(storedC2Sort)) {
        setChart2SortMode(storedC2Sort as any);
      }

      const m1 = localStorage.getItem("gps_player_chart_metric1");
      if (m1 && m1 !== "HSR Abs (m)") setPlayerChartMetric1(m1);
      const m2 = localStorage.getItem("gps_player_chart_metric2");
      if (m2) {
        if (m2 === "HSR Abs (m)") {
          setPlayerChartMetric2("MAX Speed(km/h)");
          try { localStorage.setItem("gps_player_chart_metric2", "MAX Speed(km/h)"); } catch (e) {}
        } else {
          setPlayerChartMetric2(m2);
        }
      }
      const m3 = localStorage.getItem("gps_player_chart_metric3");
      if (m3 && m3 !== "HSR Abs (m)") setPlayerChartMetric3(m3);
      const m4 = localStorage.getItem("gps_player_chart_metric4");
      if (m4 && m4 !== "HSR Abs (m)") setPlayerChartMetric4(m4);

      const ptm = localStorage.getItem("gps_player_table_metrics");
      if (ptm) {
        try {
          const parsed = JSON.parse(ptm);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const cleaned = parsed.filter((k) => k !== "HSR Abs (m)");
            setPlayerTableMetrics(cleaned);
            if (cleaned.length !== parsed.length) {
              localStorage.setItem("gps_player_table_metrics", JSON.stringify(cleaned));
            }
          }
        } catch (e) {}
      }

      const tm = localStorage.getItem("gps_equipo_table_metrics");
      if (tm) {
        try {
          const parsed = JSON.parse(tm);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const cleaned = parsed.filter((k) => k !== "HSR Abs (m)");
            setTableMetrics(cleaned);
            if (cleaned.length !== parsed.length) {
              localStorage.setItem("gps_equipo_table_metrics", JSON.stringify(cleaned));
            }
          }
        } catch (e) {}
      }
    }
  }, []);

  const [gpsFilter, setGpsFilter] = useState<"TODO" | "REAL">("TODO");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("gps_filtro_tipo");
      if (stored === "REAL" || stored === "TODO") {
        setGpsFilter(stored);
      }
    }

    const handleExternalFilter = (e: any) => {
      if (e.detail === "REAL" || e.detail === "TODO") {
        setGpsFilter(e.detail);
      }
    };

    window.addEventListener("gps_filter_change", handleExternalFilter);
    return () => window.removeEventListener("gps_filter_change", handleExternalFilter);
  }, []);

  const handleFilterChange = (newFilter: "TODO" | "REAL") => {
    setGpsFilter(newFilter);
    if (typeof window !== "undefined") {
      localStorage.setItem("gps_filtro_tipo", newFilter);
      window.dispatchEvent(new CustomEvent("gps_filter_change", { detail: newFilter }));
    }
  };

  // Sincronizar automáticamente tableMetrics y métricas de jugador con las favoritas si no hay configuración previa
  useEffect(() => {
    const cleanFavs = favoriteKeys.filter((k) => k !== "HSR Abs (m)");
    if (cleanFavs && cleanFavs.length > 0) {
      setTableMetrics((prev) => {
        if (typeof window !== "undefined") {
          const stored = localStorage.getItem("gps_equipo_table_metrics");
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const cleaned = parsed.filter((k) => k !== "HSR Abs (m)" && cleanFavs.includes(k));
                if (cleaned.length > 0) return cleaned;
              }
            } catch (e) {}
          }
        }
        return cleanFavs.slice(0, 5);
      });

      setPlayerTableMetrics((prev) => {
        if (prev.filter((k) => k !== "HSR Abs (m)" && cleanFavs.includes(k)).length > 0) {
          return prev.filter((k) => k !== "HSR Abs (m)" && cleanFavs.includes(k));
        }
        if (typeof window !== "undefined") {
          const stored = localStorage.getItem("gps_player_table_metrics");
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const cleaned = parsed.filter((k) => k !== "HSR Abs (m)" && cleanFavs.includes(k));
                if (cleaned.length > 0) return cleaned;
              }
            } catch (e) {}
          }
        }
        return cleanFavs.slice(0, 6);
      });

      if (typeof window !== "undefined") {
        const m1 = localStorage.getItem("gps_player_chart_metric1");
        if ((!m1 || m1 === "HSR Abs (m)") && cleanFavs.length >= 1) setPlayerChartMetric1(cleanFavs[0]);
        const m2 = localStorage.getItem("gps_player_chart_metric2");
        if ((!m2 || m2 === "HSR Abs (m)") && cleanFavs.length >= 2) setPlayerChartMetric2(cleanFavs[1]);
        const m3 = localStorage.getItem("gps_player_chart_metric3");
        if ((!m3 || m3 === "HSR Abs (m)") && cleanFavs.length >= 3) setPlayerChartMetric3(cleanFavs[2]);
        const m4 = localStorage.getItem("gps_player_chart_metric4");
        if ((!m4 || m4 === "HSR Abs (m)") && cleanFavs.length >= 4) setPlayerChartMetric4(cleanFavs[3]);
      }
    }
  }, [favoriteKeys]);

  const [ocultarSinDatos, setOcultarSinDatos] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("gps_equipo_ocultar_sin_datos");
      if (stored !== null) {
        setOcultarSinDatos(stored === "true");
      }
    }
  }, []);

  const handleToggleOcultarSinDatos = (checked: boolean) => {
    setOcultarSinDatos(checked);
    if (typeof window !== "undefined") {
      localStorage.setItem("gps_equipo_ocultar_sin_datos", String(checked));
    }
  };

  const [tableSortMode, setTableSortMode] = useState<"habitual" | "posicion" | "mayor" | "menor">("mayor");
  const [tableSortMetric, setTableSortMetric] = useState<string>("");

  const handleTableSortModeChange = (val: "habitual" | "posicion" | "mayor" | "menor") => {
    setTableSortMode(val);
    if (typeof window !== "undefined") localStorage.setItem("gps_equipo_table_sort_mode", val);
  };

  const [chart1SortMode, setChart1SortMode] = useState<"posicion" | "alfabetico" | "valor">("valor");
  const [chart1SortMetric, setChart1SortMetric] = useState<string>("Distance(m)");

  const handleChart1SortModeChange = (val: "posicion" | "alfabetico" | "valor") => {
    setChart1SortMode(val);
    if (typeof window !== "undefined") localStorage.setItem("gps_equipo_chart1_sort_mode", val);
  };

  const handleChart1SortMetricChange = (val: string) => {
    setChart1SortMetric(val);
    if (typeof window !== "undefined") localStorage.setItem("gps_equipo_chart1_sort_metric", val);
  };

  const [chart2SortMode, setChart2SortMode] = useState<"posicion" | "alfabetico" | "valor">("valor");
  const [chart2SortMetric, setChart2SortMetric] = useState<string>("MAX Speed(km/h)");

  const handleChart2SortModeChange = (val: "posicion" | "alfabetico" | "valor") => {
    setChart2SortMode(val);
    if (typeof window !== "undefined") localStorage.setItem("gps_equipo_chart2_sort_mode", val);
  };

  const handleChart2SortMetricChange = (val: string) => {
    setChart2SortMetric(val);
    if (typeof window !== "undefined") localStorage.setItem("gps_equipo_chart2_sort_metric", val);
  };

  // Filtros de ordenación y formato de nombre para el Informe General
  const [sortMode, setSortMode] = useState<"alfabetico" | "dorsal" | "posicion">("alfabetico");
  const [nameDisplayMode, setNameDisplayMode] = useState<"ambos" | "entero" | "corto">("ambos");
  const [showSortMenu, setShowSortMenu] = useState<boolean>(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutsideSort(event: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setShowSortMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutsideSort);
    return () => document.removeEventListener("mousedown", handleClickOutsideSort);
  }, []);

  function getCustomPlayerName(j: Jugador): string {
    const apodo = j.apodo && j.apodo.trim() ? j.apodo.trim() : null;
    if (apodo) return apodo;
    const nombre = (j.nombre || "Jugador").trim();
    return nombre.split(" ")[0];
  }

  const sortedJugadores = [...jugadores].sort((a, b) => {
    if (sortMode === "dorsal") {
      const numA = Number(a.dorsal || a.cor_id || 999);
      const numB = Number(b.dorsal || b.cor_id || 999);
      return numA - numB;
    }
    if (sortMode === "posicion") {
      return comparePlayersByTacticalPosition(a, b);
    }
    // alfabetico
    return a.nombre.localeCompare(b.nombre);
  });

  const { clubName: activeTeam, clubShield, activeTemporada, setSeasonAndTeam, availableTemporadas } = useReportClubInfo();

  const isPlayerOfTeam = (j: any, teamName: string) => {
    if (!j) return false;
    const eq = (j.equipo || "").trim().toLowerCase();
    const temp = (j.temporada || "").trim().toLowerCase();
    const tn = (teamName || "").trim().toLowerCase();
    if (tn.includes("prat") || activeTemporada === "2025/26") {
      return eq.includes("prat") || temp.includes("25/26") || temp.includes("2025/26");
    }
    if (tn.includes("manresa")) {
      return eq.includes("manresa");
    }
    if (tn.includes("europa") || activeTemporada === "2026/27") {
      return eq.includes("europa") || temp.includes("26/27") || temp.includes("2026/27");
    }
    return eq === tn || eq.includes(tn);
  };

  // 1. Cargar deportistas activos
  useEffect(() => {
    async function loadJugadores() {
      try {
        const activos = await getActiveJugadores();
        if (activos && activos.length > 0) {
          const filtered = (activos as any[]).filter((j) => isPlayerOfTeam(j, activeTeam));
          setJugadores(filtered as Jugador[]);
          if (filtered.length > 0) {
            setSelectedJugadorId(filtered[0].id);
          }
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    }
    loadJugadores();
  }, [activeTeam]);

  const [gpsRefreshTrigger, setGpsRefreshTrigger] = useState(0);

  useEffect(() => {
    const handleGpsSynced = () => setGpsRefreshTrigger((prev) => prev + 1);
    window.addEventListener("gps_synced", handleGpsSynced);
    return () => window.removeEventListener("gps_synced", handleGpsSynced);
  }, []);

  // 2. Cargar datos GPS del jugador seleccionado
  useEffect(() => {
    if (!selectedJugadorId) return;

    async function loadGpsData() {
      setLoading(true);
      try {
        const reportData = await getGpsDatosReport(selectedJugadorId);
        if (reportData.jugador) setJugador(reportData.jugador as Jugador);

        const records: GpsRecord[] = reportData.playerGps || [];
        setPlayerGpsRecords(records);

        const allTeamDates = Array.from(new Set((reportData.teamGps || []).map((r: any) => r.fecha))).filter(Boolean) as string[];
        const dates = Array.from(new Set([...records.map((r) => r.fecha), ...allTeamDates])).sort(
          (a, b) => new Date(b).getTime() - new Date(a).getTime()
        );
        setAvailableDates(dates);

        const todayStr = getTodayISO();
        let targetDate = selectedDate;
        if (!targetDate || !dates.includes(targetDate)) {
          targetDate = dates.includes(todayStr) ? todayStr : (dates[0] || todayStr);
          setSelectedDate(targetDate);
        }

        setTeamGpsRecords(reportData.teamGps || []);

        // Si el deportista actual no tiene registros para la fecha pero otros miembros del equipo sí, seleccionar automáticamente un jugador con datos
        const playerWithData = (reportData.teamGps || []).find((r: any) => r.fecha === targetDate)?.jugador_id;
        if (playerWithData && !records.some((r) => r.fecha === targetDate)) {
          setSelectedJugadorId(playerWithData);
        }
      } catch (err) {
        console.error("Error al cargar datos del informe GPS:", err);
      } finally {
        setLoading(false);
      }
    }

    loadGpsData();
  }, [selectedJugadorId, gpsRefreshTrigger]);

  // Cuando el usuario cambia la fecha seleccionada en el informe, asegurar que el jugador activo tenga datos para esa fecha
  useEffect(() => {
    if (!selectedDate || teamGpsRecords.length === 0) return;
    const currentHasData = playerGpsRecords.some((r) => r.fecha === selectedDate);
    if (!currentHasData) {
      const matchInDate = teamGpsRecords.find((r) => r.fecha === selectedDate);
      if (matchInDate?.jugador_id) {
        setSelectedJugadorId(matchInDate.jugador_id);
      }
    }
  }, [selectedDate, teamGpsRecords, playerGpsRecords]);

  useEffect(() => {
    function updateSessionNum() {
      try {
        const num = getLiveClientSessionNumber(selectedDate);
        setOptimizadorSessionNum(num);
      } catch (err) {
        console.error("Error al obtener el número de sesión:", err);
      }
    }

    updateSessionNum();

    const handleEventsUpdate = () => {
      updateSessionNum();
    };

    window.addEventListener("storage", handleEventsUpdate);
    window.addEventListener("eventos_bloques_updated", handleEventsUpdate);

    return () => {
      window.removeEventListener("storage", handleEventsUpdate);
      window.removeEventListener("eventos_bloques_updated", handleEventsUpdate);
    };
  }, [selectedDate]);

    // Descubrir todas las tareas registradas en la sesión (para el equipo y el jugador)
    const availableSessionTasks: string[] = useMemo(() => {
      const taskNames = new Set<string>();
      const allRecords = [
        ...teamGpsRecords.filter((r) => r.fecha === selectedDate),
        ...playerGpsRecords.filter((r) => r.fecha === selectedDate),
      ];
      allRecords.forEach((r) => {
        const tList = r?.metricas?.tareas || (r as any)?.tareas;
        if (Array.isArray(tList)) {
          tList.forEach((t: any) => {
            const name = (t.nombre || t.name || t.tarea || t.task || "").trim();
            if (name && name.toLowerCase() !== "total") {
              taskNames.add(name);
            }
          });
        }
        const rowTarea = (r as any)?.tarea;
        if (rowTarea && typeof rowTarea === "string" && rowTarea.trim().toLowerCase() !== "total") {
          taskNames.add(rowTarea.trim());
        }
      });
      return Array.from(taskNames);
    }, [teamGpsRecords, playerGpsRecords, selectedDate]);

    // Mantener las tareas activadas por defecto al cargar o cambiar de fecha
    const taskListKey = availableSessionTasks.join("|||");
    useEffect(() => {
      if (availableSessionTasks.length > 0) {
        setSelectedTaskNames(availableSessionTasks);
      } else {
        setSelectedTaskNames([]);
      }
    }, [selectedDate, taskListKey]);

    const handleToggleTask = (taskName: string) => {
      setSelectedTaskNames((prev) => {
        const exists = prev.some((t) => t.toLowerCase() === taskName.toLowerCase());
        if (exists) {
          return prev.filter((t) => t.toLowerCase() !== taskName.toLowerCase());
        } else {
          return [...prev, taskName];
        }
      });
    };

    const handleSelectAllTasks = () => {
      setSelectedTaskNames([...availableSessionTasks]);
    };

    const handleDeselectAllTasks = () => {
      setSelectedTaskNames([]);
    };

    const currentRecordRaw = playerGpsRecords.find((r) => r.fecha === selectedDate);
    const isCurrentPlayerSimulado = isRecordSimulado(currentRecordRaw);
    const currentRecord = (gpsFilter === "REAL" && isCurrentPlayerSimulado) ? null : currentRecordRaw;
    const currentRecordEffective = getEffectiveRecord(currentRecord, selectedTaskNames, availableSessionTasks, derivedVariables);

    // Lectura de MD con máxima precisión: 1º Planificación (localStorage), 2º BBDD GPS (match_day)
    const resolveMatchDay = (): string => {
      if (typeof window !== "undefined") {
        try {
          const planKeys = ["planificacion_days_v5", "planificacion_days_v2", "planificacion_days_v1"];
          for (const k of planKeys) {
            const raw = localStorage.getItem(k);
            if (raw) {
              const days = JSON.parse(raw);
              const found = (Array.isArray(days) ? days : Object.values(days)).find(
                (d: any) => d && (d.fecha === selectedDate || d.id === selectedDate)
              );
              if (found?.md && typeof found.md === "string" && found.md.trim()) {
                const clean = found.md.trim();
                return /^[-+]?\d+\s*MD$/i.test(clean) ? `MD${clean.replace(/MD/i, "").trim()}` : clean;
              }
            }
          }
        } catch (e) {}
      }

      if (currentRecordRaw?.match_day && typeof currentRecordRaw.match_day === "string" && currentRecordRaw.match_day.trim()) {
        return currentRecordRaw.match_day.trim();
      }

      const teamRecWithMd = teamGpsRecords.find(
        (r) => r.fecha === selectedDate && r.match_day && typeof r.match_day === "string" && r.match_day.trim()
      );
      if (teamRecWithMd?.match_day) {
        return teamRecWithMd.match_day.trim();
      }

      return "MD";
    };

    const matchDay = resolveMatchDay();
    const firstName = getPlayerFirstName(jugador);

    // Extraer valores reales si existen (afectados por tareas activadas)
    const realDist = getMetricValue(currentRecordEffective?.metricas, METRIC_DISTANCIA);
    const realHsr = getMetricValue(currentRecordEffective?.metricas, METRIC_HSR);
    const realTopSpeed = getMetricValue(currentRecordEffective?.metricas, METRIC_TOP_SPEED);

    const isDemo = false;

    // Métricas reales para los gráficos y la tabla (0 si no tiene datos o si se desmarcan sus tareas)
    const jugadorDistancia = realDist || 0;
    const jugadorHsr = realHsr || 0;
    const jugadorTopSpeed = realTopSpeed || 0;

    // Extracción de métricas adicionales para la tabla (0 si no tiene datos o restadas)
    const durationVal = currentRecordEffective ? (getMetricValue(currentRecordEffective.metricas, "Duration(min)") || getMetricValue(currentRecordEffective.metricas, "Volume(min)") || 0) : 0;
    const distanceKmVal = Math.round((jugadorDistancia / 1000) * 100) / 100;
    const sprintsVal = currentRecordEffective ? (getMetricValue(currentRecordEffective.metricas, "Sprints Count") || getMetricValue(currentRecordEffective.metricas, "Sprints") || 0) : 0;
    const accDecVal = currentRecordEffective ? ((getMetricValue(currentRecordEffective.metricas, "Accs Count") + getMetricValue(currentRecordEffective.metricas, "Decs Count")) || getMetricValue(currentRecordEffective.metricas, "Acc+Dec") || 0) : 0;
    const playerLoadVal = currentRecordEffective ? (getMetricValue(currentRecordEffective.metricas, "Player Load") || 0) : 0;

    // --- 1. Gráfico 1: Vs Media del equipo ---
    const rawTeamRecordsSameDay = teamGpsRecords.filter((r) => r.fecha === selectedDate);
    const simulatedPlayerIdsInDate = new Set(
      rawTeamRecordsSameDay.filter((r) => isRecordSimulado(r)).map((r) => r.jugador_id)
    );
    const isPlayerSimInDate = (playerId: string) => simulatedPlayerIdsInDate.has(playerId);

    const teamRecordsSameDay = rawTeamRecordsSameDay
      .filter((r) => gpsFilter === "TODO" || !isRecordSimulado(r))
      .map((r) => getEffectiveRecord(r, selectedTaskNames, availableSessionTasks, derivedVariables))
      .filter(Boolean);
    const teamCount = teamRecordsSameDay.length || 1;

    const realTeamDist = Math.round(
      (teamRecordsSameDay.reduce(
        (sum, r) => sum + getMetricValue(r.metricas, METRIC_DISTANCIA),
        0
      ) / teamCount) * 100
    ) / 100;

    const teamAvgDistancia = realTeamDist;
    const teamAvgHsr = Math.round(
      (teamRecordsSameDay.reduce(
        (sum, r) => sum + getMetricValue(r.metricas, METRIC_HSR),
        0
      ) / teamCount) * 100
    ) / 100;

    // --- 2. Gráfico 2: Vs Su media en este Match Day ---
    const playerSameMdRecords = playerGpsRecords.filter(
      (r) => r.match_day === currentRecord?.match_day && r.match_day != null
    );
    const playerMdCount = playerSameMdRecords.length || 1;

    const realMdDist = Math.round(
      (playerSameMdRecords.reduce(
        (sum, r) => sum + getMetricValue(r.metricas, METRIC_DISTANCIA),
        0
      ) / playerMdCount) * 100
    ) / 100;

    const playerMdAvgDistancia = realMdDist;
    const playerMdAvgHsr = Math.round(
      (playerSameMdRecords.reduce(
        (sum, r) => sum + getMetricValue(r.metricas, METRIC_HSR),
        0
      ) / playerMdCount) * 100
    ) / 100;

    // Definiciones dinámicas para los 4 sub-gráficos del jugador
    const m1Def = getVariableDef(playerChartMetric1);
    const m2Def = getVariableDef(playerChartMetric2);
    const m3Def = getVariableDef(playerChartMetric3);
    const m4Def = getVariableDef(playerChartMetric4);

    // Valores individuales del jugador
    const jugadorM1Val = currentRecordEffective ? getMetricValue(currentRecordEffective.metricas, playerChartMetric1) : 0;
    const jugadorM2Val = currentRecordEffective ? getMetricValue(currentRecordEffective.metricas, playerChartMetric2) : 0;
    const jugadorM3Val = currentRecordEffective ? getMetricValue(currentRecordEffective.metricas, playerChartMetric3) : 0;
    const jugadorM4Val = currentRecordEffective ? getMetricValue(currentRecordEffective.metricas, playerChartMetric4) : 0;

    // Valores promedios del equipo en la sesión
    const teamAvgM1 = teamRecordsSameDay.length > 0 ? Math.round((teamRecordsSameDay.reduce((sum, r) => sum + getMetricValue(r.metricas, playerChartMetric1), 0) / teamCount) * 100) / 100 : 0;
    const teamAvgM2 = teamRecordsSameDay.length > 0 ? Math.round((teamRecordsSameDay.reduce((sum, r) => sum + getMetricValue(r.metricas, playerChartMetric2), 0) / teamCount) * 100) / 100 : 0;
    const teamAvgM3 = teamRecordsSameDay.length > 0 ? Math.round((teamRecordsSameDay.reduce((sum, r) => sum + getMetricValue(r.metricas, playerChartMetric3), 0) / teamCount) * 100) / 100 : 0;
    const teamAvgM4 = teamRecordsSameDay.length > 0 ? Math.round((teamRecordsSameDay.reduce((sum, r) => sum + getMetricValue(r.metricas, playerChartMetric4), 0) / teamCount) * 100) / 100 : 0;

    // Valores promedios del jugador en este Match Day
    const playerMdAvgM1 = playerSameMdRecords.length > 0 ? Math.round((playerSameMdRecords.reduce((sum, r) => sum + getMetricValue(r.metricas, playerChartMetric1), 0) / playerMdCount) * 100) / 100 : 0;
    const playerMdAvgM2 = playerSameMdRecords.length > 0 ? Math.round((playerSameMdRecords.reduce((sum, r) => sum + getMetricValue(r.metricas, playerChartMetric2), 0) / playerMdCount) * 100) / 100 : 0;
    const playerMdAvgM3 = playerSameMdRecords.length > 0 ? Math.round((playerSameMdRecords.reduce((sum, r) => sum + getMetricValue(r.metricas, playerChartMetric3), 0) / playerMdCount) * 100) / 100 : 0;
    const playerMdAvgM4 = playerSameMdRecords.length > 0 ? Math.round((playerSameMdRecords.reduce((sum, r) => sum + getMetricValue(r.metricas, playerChartMetric4), 0) / playerMdCount) * 100) / 100 : 0;

    const dataDistanciaEquipo = [
      {
        categoria: "Distancia (m)",
        [firstName]: jugadorDistancia,
        "Media equipo": teamAvgDistancia,
      },
    ];

    const dataHsrEquipo = [
      {
        categoria: "HSR (m)",
        [firstName]: jugadorHsr,
        "Media equipo": teamAvgHsr,
      },
    ];

    const dataDistanciaMatchDay = [
      {
        categoria: "Distancia (m)",
        [firstName]: jugadorDistancia,
        [`Media ${matchDay}`]: playerMdAvgDistancia,
      },
    ];

    const dataHsrMatchDay = [
      {
        categoria: "HSR (m)",
        [firstName]: jugadorHsr,
        [`Media ${matchDay}`]: playerMdAvgHsr,
      },
    ];

    // --- 3. Top Speed del día ---
    const realMaxTopSpeed = playerGpsRecords.reduce(
      (max, r) => {
        const eff = r.fecha === selectedDate ? getEffectiveRecord(r, selectedTaskNames, availableSessionTasks, derivedVariables) : r;
        return Math.max(max, getMetricValue(eff?.metricas, METRIC_TOP_SPEED));
      },
      0
    );

    const playerMaxTopSpeed = realMaxTopSpeed > 0 ? Math.max(realMaxTopSpeed, jugadorTopSpeed) : jugadorTopSpeed;
    const percentOfMax = playerMaxTopSpeed > 0 ? Math.min(100, Math.round((jugadorTopSpeed / playerMaxTopSpeed) * 100)) : 0;

    // --- Cálculos para la vista de Equipo ---
    const getEquipoVal = (j: Jugador, metricKey: string) => {
      const rec = teamGpsRecords.find((r) => r.jugador_id === j.id && r.fecha === selectedDate) ||
        (j.id === selectedJugadorId ? currentRecord : null);
      if (rec) {
        const effRec = getEffectiveRecord(rec, selectedTaskNames, availableSessionTasks, derivedVariables);
        if (!effRec) return 0;
        const combined = { ...effRec, ...(effRec.metricas || {}) };
        return getMetricValue(combined, metricKey, derivedVariables);
      }
      return 0;
    };

    const posOrderMap: Record<string, number> = { "PORTERO": 1, "POR": 1, "DEFENSA": 2, "DEF": 2, "MEDIOCAMPISTA": 3, "MED": 3, "DELANTERO": 4, "DEL": 4 };

    const playerHasGpsData = (j: Jugador) => {
      const rec = teamGpsRecords.find((r) => r.jugador_id === j.id && r.fecha === selectedDate) ||
        (j.id === selectedJugadorId && currentRecord?.fecha === selectedDate ? currentRecord : null);
      if (!rec) return false;
      const effRec = getEffectiveRecord(rec, selectedTaskNames, availableSessionTasks, derivedVariables);
      if (!effRec) return false;
      const combined = { ...effRec, ...(effRec.metricas || {}) };
      const dist = getMetricValue(combined, "Distance(m)", derivedVariables);
      const dur = getMetricValue(combined, "Duration(min)", derivedVariables);
      const pl = getMetricValue(combined, "Player Load", derivedVariables);
      const speed = getMetricValue(combined, "MAX Speed(km/h)", derivedVariables);
      return dist > 0 || dur > 0 || pl > 0 || speed > 0;
    };

    const jugadoresConDatosCount = jugadores.filter((j) => playerHasGpsData(j) && (gpsFilter === "TODO" || !isPlayerSimInDate(j.id))).length;
    const totalJugadoresFiltrados = jugadores.filter((j) => gpsFilter === "TODO" || !isPlayerSimInDate(j.id)).length;

    const sortedJugadoresChart1 = [...jugadores].sort((a, b) => {
      if (chart1SortMode === "posicion") {
        return comparePlayersByTacticalPosition(a, b);
      }
      if (chart1SortMode === "alfabetico") {
        return (a.apodo || a.nombre).localeCompare(b.apodo || b.nombre);
      }
      if (chart1SortMode === "valor") {
        return getEquipoVal(b, chart1SortMetric) - getEquipoVal(a, chart1SortMetric);
      }
      return 0;
    });

    const chart1Data = sortedJugadoresChart1
      .filter((j) => {
        if (gpsFilter === "REAL" && isPlayerSimInDate(j.id)) return false;
        if (ocultarSinDatos && !playerHasGpsData(j)) return false;
        return true;
      })
      .map((j) => {
        const baseName = j.apodo && j.apodo.trim() ? j.apodo.trim() : (j.nombre || "Jugador").trim().split(" ")[0];
        const isSim = isPlayerSimInDate(j.id);
        return {
          name: isSim ? `${baseName}*` : baseName,
          Y1: getEquipoVal(j, chart1LeftMetric),
          Y2: getEquipoVal(j, chart1RightMetric),
          pos: j.posicion || "",
          isSimulado: isSim,
        };
      });

    const sortedJugadoresChart2 = [...jugadores].sort((a, b) => {
      if (chart2SortMode === "posicion") {
        return comparePlayersByTacticalPosition(a, b);
      }
      if (chart2SortMode === "alfabetico") {
        return (a.apodo || a.nombre).localeCompare(b.apodo || b.nombre);
      }
      if (chart2SortMode === "valor") {
        return getEquipoVal(b, chart2SortMetric) - getEquipoVal(a, chart2SortMetric);
      }
      return 0;
    });

    const chart2Data = sortedJugadoresChart2
      .filter((j) => {
        if (gpsFilter === "REAL" && isPlayerSimInDate(j.id)) return false;
        if (ocultarSinDatos && !playerHasGpsData(j)) return false;
        return true;
      })
      .map((j) => {
        const baseName = j.apodo && j.apodo.trim() ? j.apodo.trim() : (j.nombre || "Jugador").trim().split(" ")[0];
        const isSim = isPlayerSimInDate(j.id);
        return {
          name: isSim ? `${baseName}*` : baseName,
          Y1: getEquipoVal(j, chart2LeftMetric),
          Y2: getEquipoVal(j, chart2RightMetric),
          pos: j.posicion || "",
          isSimulado: isSim,
        };
      });

    // Jugadores que han participado en la sesión (o todos si se desmarca ocultarSinDatos)
    const rawParticipating = (() => {
      return jugadores.filter((j) => {
        if (gpsFilter === "REAL" && isPlayerSimInDate(j.id)) return false;
        if (ocultarSinDatos && !playerHasGpsData(j)) return false;
        return true;
      });
    })();

    const filteredPlayerMetrics = playerTableMetrics.filter((k) => favoriteKeys.includes(k) && k !== "HSR Abs (m)");
    const activePlayerTableMetricsList = (filteredPlayerMetrics.length > 0 ? filteredPlayerMetrics : favoriteKeys.filter((k) => k !== "HSR Abs (m)").slice(0, 6))
      .map(getVariableDef)
      .filter(Boolean);

    const filteredTableMetrics = tableMetrics.filter((k) => favoriteKeys.includes(k) && k !== "HSR Abs (m)");
    const activeTableMetricsList = (filteredTableMetrics.length > 0 ? filteredTableMetrics : favoriteKeys.filter((k) => k !== "HSR Abs (m)").slice(0, 5))
      .map(getVariableDef)
      .filter(Boolean);

    // Ordenación según el modo seleccionado (habitual, posición o valor en variable seleccionada / primera visible)
    const effectiveTableSortMetric = tableSortMetric || (activeTableMetricsList[0] as any)?.key || tableMetrics[0] || "Distance(m)";
    const participatingPlayers = [...rawParticipating].sort((a, b) => {
      if (tableSortMode === "posicion") {
        return comparePlayersByTacticalPosition(a, b);
      }
      if (tableSortMode === "mayor") {
        return getEquipoVal(b, effectiveTableSortMetric) - getEquipoVal(a, effectiveTableSortMetric);
      }
      if (tableSortMode === "menor") {
        return getEquipoVal(a, effectiveTableSortMetric) - getEquipoVal(b, effectiveTableSortMetric);
      }
      // "habitual": mantener el orden habitual de la lista de la plantilla
      return jugadores.indexOf(a) - jugadores.indexOf(b);
    });

    
    const renderGpsMetricOptions = (currentVal?: string) => {
      // 1. Favoritas seleccionadas por el usuario (sin derivadas para separarlas limpiamente)
      const favList = favoriteVariables.filter((v) => !v.esDerivada && v.key !== "HSR Abs (m)");

      // 2. Variables derivadas creadas por el usuario
      const derivedList = allVariables.filter((v) => v.esDerivada && v.key !== "HSR Abs (m)");

      // Si el valor actual no está en favoritas ni en derivadas, se incluye para que no se pierda la selección
      const isCurrentInList =
        favList.some((f) => f.key === currentVal) || derivedList.some((d) => d.key === currentVal);
      const extraCurrent = !isCurrentInList && currentVal && currentVal !== "HSR Abs (m)" ? getVariableDef(currentVal) : null;

      return (
        <>
          {favList.length > 0 && (
            <optgroup label="⭐ Mis Favoritas (Ajustes)">
              {favList.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} ({m.unit})
                </option>
              ))}
            </optgroup>
          )}

          {derivedList.length > 0 && (
            <optgroup label="➕ Variables Derivadas / Sumas">
              {derivedList.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} ({m.unit})
                </option>
              ))}
            </optgroup>
          )}

          {extraCurrent && (
            <optgroup label="Selección Actual">
              <option value={extraCurrent.key}>
                {extraCurrent.label} ({extraCurrent.unit})
              </option>
            </optgroup>
          )}
        </>
      );
    };

    const m1Left = getVariableDef(chart1LeftMetric);
    const m1Right = getVariableDef(chart1RightMetric);
    const m2Left = getVariableDef(chart2LeftMetric);
    const m2Right = getVariableDef(chart2RightMetric);

    return (
      <main className="gps-report-page">
        <ReportNav />
        {/* Topbar de navegación + Botón Exportar PDF */}
        <div className="gps-topbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Link
              href="/"
              className="no-print"
              style={{
                fontSize: "11px",
                fontWeight: 800,
                color: "#1e3a8a",
                background: "#e2e8f0",
                padding: "4px 10px",
                borderRadius: "6px",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              ← Menú
            </Link>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--muted)" }}>
              INFORMES · GPS DIARIO
            </span>
          </div>

          <button
            type="button"
            onClick={handleExportPDF}
            className="no-print"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              background: "#1e3a8a",
              color: "#ffffff",
              borderRadius: "8px",
              border: "none",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(30, 58, 138, 0.25)",
              transition: "all 0.15s ease",
            }}
          >
            <span>📄</span> Exportar PDF
          </button>
        </div>

        {/* NIVEL 1: NAVEGACIÓN SUPERIOR (GPS | GENERAL | COMPLETO) */}
        <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", margin: "14px 0 10px 0" }}>
          {[
            { id: "gps", label: "⚡ GPS", color: "#1e3a8a" },
            { id: "general", label: "📋 GENERAL", color: "#475569" },
            { id: "completo", label: "📦 COMPLETO", color: "#0f172a" },
          ].map((tab) => {
            const isActive = mainTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMainTab(tab.id as any)}
                style={{
                  padding: "8px 20px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  fontWeight: 900,
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                  border: isActive ? `2px solid ${tab.color}` : "1px solid #cbd5e1",
                  background: isActive ? tab.color : "#ffffff",
                  color: isActive ? "#ffffff" : "#475569",
                  boxShadow: isActive ? "0 3px 8px rgba(0,0,0,0.12)" : "0 1px 3px rgba(0,0,0,0.04)",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* NIVEL 2: SUB-VISTAS DE INFORMES (JUGADOR | COMPARATIVA | EQUIPO) */}
        <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", margin: "0 0 16px 0", background: "#f8fafc", padding: "5px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <button
            type="button"
            onClick={() => setSubView("jugador")}
            style={{
              flex: 1,
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "12.5px",
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              background: subView === "jugador" ? "#1e3a8a" : "transparent",
              color: subView === "jugador" ? "#ffffff" : "#64748b",
              border: "none",
              boxShadow: subView === "jugador" ? "0 2px 6px rgba(30, 58, 138, 0.2)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <span>👤</span> Jugador
          </button>

          <button
            type="button"
            onClick={() => setSubView("comparativa")}
            style={{
              flex: 1,
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "12.5px",
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              background: subView === "comparativa" ? "#ea580c" : "transparent",
              color: subView === "comparativa" ? "#ffffff" : "#64748b",
              border: "none",
              boxShadow: subView === "comparativa" ? "0 2px 6px rgba(234, 88, 12, 0.2)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <span>📊</span> Comparativa
          </button>

          <button
            type="button"
            onClick={() => setSubView("equipo")}
            style={{
              flex: 1,
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "12.5px",
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              background: subView === "equipo" ? "#0284c7" : "transparent",
              color: subView === "equipo" ? "#ffffff" : "#64748b",
              border: "none",
              boxShadow: subView === "equipo" ? "0 2px 6px rgba(2, 132, 199, 0.2)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <span>👥</span> Equipo
          </button>
        </div>

        {/* Bar de Selección de Jugador Activo y Fecha */}
        <div className="no-print" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", justifyContent: "space-between", background: "#ffffff", padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
          {subView !== "equipo" && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--navy)" }}>
                Deportista activo ({jugadores.length}):
              </label>
              <SearchableJugadorSelect
                jugadores={jugadores}
                selectedJugadorId={selectedJugadorId}
                onSelectJugador={(id) => setSelectedJugadorId(id)}
              />
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginRight: "10px" }}>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy)" }}>Temporada:</label>
            <select
              value={`${activeTemporada}::${activeTeam}`}
              onChange={(e) => {
                const [tVal, teamVal] = e.target.value.split("::");
                setSeasonAndTeam(tVal, teamVal);
              }}
              style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 700, background: "#ffffff", color: "#0f172a" }}
            >
              {availableTemporadas.map((t) => (
                <option key={`${t.temporada}_${t.equipo}`} value={`${t.temporada}::${t.equipo}`}>
                  {t.temporada} · {t.equipo}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Discreto de Datos: Solo REAL vs TODO (no-print para exportación PDF) */}
          <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy)" }}>Datos:</label>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "#f1f5f9",
                borderRadius: "6px",
                padding: "2px",
                border: "1px solid #cbd5e1",
              }}
            >
              <button
                type="button"
                onClick={() => handleFilterChange("REAL")}
                title="Filtrar métricas 100% reales"
                style={{
                  fontSize: "11px",
                  fontWeight: gpsFilter === "REAL" ? 800 : 600,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  border: "none",
                  background: gpsFilter === "REAL" ? "#ffffff" : "transparent",
                  color: gpsFilter === "REAL" ? "#0f172a" : "#64748b",
                  boxShadow: gpsFilter === "REAL" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                Solo REAL
              </button>
              <button
                type="button"
                onClick={() => handleFilterChange("TODO")}
                title="Ver todas las métricas (Reales y Simuladas con *)"
                style={{
                  fontSize: "11px",
                  fontWeight: gpsFilter === "TODO" ? 800 : 600,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  border: "none",
                  background: gpsFilter === "TODO" ? "#ffffff" : "transparent",
                  color: gpsFilter === "TODO" ? "#0f172a" : "#64748b",
                  boxShadow: gpsFilter === "TODO" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                TODO
              </button>
            </div>
          </div>

          {/* Checkbox para añadir o eliminar jugadores sin datos */}
          <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "3px 9px",
                borderRadius: "6px",
                border: ocultarSinDatos ? "1px solid #93c5fd" : "1px solid #cbd5e1",
                background: ocultarSinDatos ? "#eff6ff" : "#ffffff",
                cursor: "pointer",
                fontSize: "11.5px",
                fontWeight: 700,
                color: ocultarSinDatos ? "#1e40af" : "#475569",
                userSelect: "none",
                transition: "all 0.15s ease",
              }}
              title={ocultarSinDatos ? "Desmarcar casilla para añadir los jugadores sin datos a los gráficos y tabla" : "Marcar casilla para eliminar los jugadores sin datos"}
            >
              <input
                type="checkbox"
                checked={ocultarSinDatos}
                onChange={(e) => handleToggleOcultarSinDatos(e.target.checked)}
                style={{ cursor: "pointer", accentColor: "#1e3a8a" }}
              />
              <span>{ocultarSinDatos ? "Ocultar sin datos" : "Mostrar sin datos"}</span>
              <span style={{ fontSize: "10.5px", color: ocultarSinDatos ? "#2563eb" : "#94a3b8", fontWeight: 800 }}>
                ({ocultarSinDatos ? `${jugadoresConDatosCount} con datos` : `${totalJugadoresFiltrados} todos`})
              </span>
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: subView === "equipo" ? "0" : "auto" }}>
            <label htmlFor="gps-date-select" style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy)" }}>Fecha del Informe:</label>
            {availableDates.length > 0 ? (
              <select
                id="gps-date-select"
                className="gps-date-select"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 700 }}
              >
                {!availableDates.includes(selectedDate) && (
                  <option value={selectedDate}>{formatDateDDMMAAAA(selectedDate)} (Seleccionada)</option>
                )}
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {formatDateDDMMAAAA(d)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="gps-date-select"
                type="date"
                className="gps-date-select"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 700 }}
              />
            )}
          </div>

          {isDemo && (
            <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "10px" }}>
              ⚡ DATOS DEMO
            </span>
          )}
        </div>

        {/* Selector de Tareas de la Sesión para Jugador y Equipo */}
        {!loading && availableSessionTasks.length > 0 && (
          <SessionTasksSelector
            availableTasks={availableSessionTasks}
            selectedTasks={selectedTaskNames}
            onToggleTask={handleToggleTask}
            onSelectAll={handleSelectAllTasks}
            onDeselectAll={handleDeselectAllTasks}
            subViewName={subView === "equipo" ? "el equipo" : "el jugador"}
          />
        )}

        {loading ? (
          <div className="gps-header-card" style={{ justifyContent: "center", padding: "20px" }}>
            <span style={{ color: "var(--muted)", fontSize: "13px" }}>Cargando informe GPS...</span>
          </div>
        ) : (
          <>
          <div className={mainTab === "completo" && subView === "jugador" ? "completo-player-report-wrapper" : ""}>
            {/* FICHA PERFIL JUGADOR (PREVIA A LOS DOS INFORMES EN COMPLETO JUGADOR) */}
            {mainTab === "completo" && subView === "jugador" && jugador && (
              <section className="gps-header-card" style={{ marginBottom: "12px" }}>
                <div className="gps-profile-block">
                  <div className="gps-profile-photo">
                    {jugador.foto_url ? (
                      <img src={jugador.foto_url || undefined} alt={jugador.nombre} />
                    ) : (
                      <span>{jugador.nombre.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="gps-profile-info">
                    <h1>{getJugadorDisplayName(jugador)}</h1>
                    <p>
                      {jugador.posicion || "Sin posición"}{calculateAge(jugador.fecha_nacimiento) ? ` · ${calculateAge(jugador.fecha_nacimiento)}` : ""}
                    </p>
                  </div>
                </div>

                <div className="gps-controls-block" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "4px" }}>
                    <img src="/ce-europa.png" alt="CE EUROPA" style={{ width: "24px", height: "24px", objectFit: "contain", background: "#ffffff", borderRadius: "4px", padding: "1px" }} />
                    <span style={{ fontSize: "12px", fontWeight: 900, color: "#1e3a8a", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      CE EUROPA
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="gps-badge-md">Match Day: {matchDay}</span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e3a8a" }}>
                      📅 {formatDateDDMMAAAA(selectedDate)}
                    </span>
                  </div>
                </div>
              </section>
            )}
            {/* BLOQUE GENERAL: INFORME REPORT SESIÓN GENERAL */}
            {(mainTab === "general" || mainTab === "completo") && (
              <div
                className={`general-report-card ${(mainTab === "completo" && subView !== "jugador") ? "has-following-report" : ""}`}
                style={{
                  background: "#ffffff",
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1px solid #cbd5e1",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
                  marginBottom: (mainTab === "completo" && subView === "jugador") ? "10px" : (mainTab === "completo" ? "14px" : "0"),
                }}
              >
                {(mainTab === "completo" && subView === "jugador") ? (
                  <div style={{ borderBottom: "2px solid #0f172a", paddingBottom: "6px", marginBottom: "10px", textAlign: "center" }}>
                    <h2 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0, textTransform: "uppercase", letterSpacing: "-0.01em" }}>
                      INFORME GENERAL DE LA SESIÓN
                    </h2>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "16px", alignItems: "center", marginBottom: "12px", borderBottom: "2px solid #0f172a", paddingBottom: "10px" }}>
                    {/* Arriba a la izquierda: Escudo y nombre del club */}
                    <div style={{ justifySelf: "start", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minWidth: "75px" }}>
                      <img
                        src="/ce-europa.png"
                        alt="CE EUROPA"
                        style={{ width: "46px", height: "54px", objectFit: "contain", background: "#ffffff", borderRadius: "6px", padding: "2px" }}
                      />
                      <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap" }}>
                        CE EUROPA
                      </span>
                    </div>

                    {/* Centro: Título */}
                    <div style={{ justifySelf: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <h2 style={{ fontSize: "23px", fontWeight: 900, color: "#0f172a", margin: 0, textTransform: "uppercase", whiteSpace: "normal", textAlign: "center", letterSpacing: "0.02em" }}>
                        INFORME GENERAL DE LA SESIÓN
                      </h2>
                    </div>

                    {/* Arriba a la derecha: Día y MD pegados al margen derecho */}
                    <div style={{ justifySelf: "end", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.2px" }}>Día:</span>
                          <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a" }}>
                            {getAutoDay(selectedDate)}
                          </span>
                          <input
                            type="text"
                            defaultValue={getAutoDay(selectedDate)}
                            key={selectedDate}
                            className="clean-header-input no-print"
                            style={{ fontSize: "11.5px", fontWeight: 800, padding: "2px 4px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", outline: "none", width: "95px", textAlign: "center" }}
                          />
                        </div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.2px" }}>MD:</span>
                          <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: matchDay === "MD" ? "#dc2626" : "#0f172a" }}>
                            {matchDay}
                          </span>
                          <input
                            type="text"
                            value={matchDay}
                            readOnly
                            className="clean-header-input no-print"
                            style={{ fontSize: "11.5px", fontWeight: 800, padding: "2px 4px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: matchDay === "MD" ? "#dc2626" : "#0f172a", outline: "none", width: "44px", textAlign: "center" }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* Header Card de Jugador en Vista General (si aplica) */}
                {subView === "jugador" && jugador && mainTab !== "completo" && (
                  <section className="gps-header-card">
                    <div className="gps-profile-block">
                      <div className="gps-profile-photo">
                        {jugador.foto_url ? (
                          <img src={jugador.foto_url || undefined} alt={jugador.nombre} />
                        ) : (
                          <span>{jugador.nombre.slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="gps-profile-info">
                        <h1>{getJugadorDisplayName(jugador)}</h1>
                        <p>
                          {jugador.posicion || "Sin posición"}{calculateAge(jugador.fecha_nacimiento) ? ` · ${calculateAge(jugador.fecha_nacimiento)}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="gps-controls-block no-print" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                      {/* Escudo Oficial de CE Europa y Nombre del Club */}
                      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "4px" }}>
                        <img src="/ce-europa.png" alt="CE EUROPA" style={{ width: "24px", height: "24px", objectFit: "contain", background: "#ffffff", borderRadius: "4px", padding: "1px" }} />
                    <span style={{ fontSize: "12px", fontWeight: 900, color: "#1e3a8a", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      CE EUROPA
                    </span>
                      </div>
                    </div>
                  </section>
                )}

                {/* Comentario de Sesión editable (la frase en gris "Escribe aquí..." no sale en print si está vacía) */}
                  <div style={{ marginTop: "12px" }}>
                    <textarea
                      value={sessionHeaderComment}
                      onChange={(e) => setSessionHeaderComment(e.target.value)}
                      placeholder="Escribe aquí observaciones generales de la sesión..."
                      rows={2}
                      className={`session-header-textarea ${!sessionHeaderComment ? "no-print" : ""}`}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "none",
                        borderLeft: "3px solid #1e3a8a",
                        fontSize: "12.5px",
                        fontFamily: "inherit",
                        color: "#0f172a",
                        outline: "none",
                        resize: "vertical",
                        background: "rgba(241, 245, 249, 0.7)",
                        transition: "all 0.15s ease",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.background = "#ffffff";
                        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.background = "rgba(241, 245, 249, 0.7)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                  </div>

                {/* Tabla del Informe General de Sesión */}
                <div style={{ overflowX: "auto", position: "relative" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1.5px solid #cbd5e1" }}>
                        {/* Encabezado Columna 1: Deportista con Menú de 3 puntitos */}
                        <th style={{ padding: "6px 10px", textAlign: "left", color: "#0f172a", fontWeight: 800, position: "relative" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span>Deportista</span>

                            {/* Botón de 3 puntitos (no sale en reporte PDF / print) */}
                            <div className="no-print" ref={sortMenuRef} style={{ position: "relative" }}>
                              <button
                                type="button"
                                onClick={() => setShowSortMenu(!showSortMenu)}
                                style={{
                                  background: "transparent",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "4px",
                                  padding: "1px 5px",
                                  fontSize: "12px",
                                  cursor: "pointer",
                                  color: "#475569",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                                title="Opciones de ordenación y nombre"
                              >
                                ⋮
                              </button>

                              {showSortMenu && (
                                <div style={{
                                  position: "absolute",
                                  top: "100%",
                                  right: 0,
                                  marginTop: "4px",
                                  background: "#ffffff",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "8px",
                                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                  padding: "8px 12px",
                                  zIndex: 100,
                                  minWidth: "190px",
                                  textTransform: "none",
                                  fontWeight: 400,
                                }}>
                                  <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#64748b", marginBottom: "4px", textTransform: "uppercase" }}>
                                    Ordenar por:
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginBottom: "8px" }}>
                                    {[
                                      { id: "alfabetico", label: "🔤 Alfabéticamente" },
                                      { id: "dorsal", label: "🔢 Dorsal" },
                                      { id: "posicion", label: "🏃 Posición" },
                                    ].map((opt) => (
                                      <label key={opt.id} style={{ fontSize: "11.5px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: sortMode === opt.id ? "#1e3a8a" : "#334155", fontWeight: sortMode === opt.id ? 700 : 400 }}>
                                        <input
                                          type="radio"
                                          name="sortMode"
                                          checked={sortMode === opt.id}
                                          onChange={() => setSortMode(opt.id as any)}
                                        />
                                        {opt.label}
                                      </label>
                                    ))}
                                  </div>

                                  <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "6px" }}>
                                    <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#64748b", marginBottom: "4px", textTransform: "uppercase" }}>
                                      Formato de nombre:
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                      {[
                                        { id: "ambos", label: "Nombre y Apodo" },
                                        { id: "entero", label: "Nombre entero" },
                                        { id: "corto", label: "Nombre corto / Apodo" },
                                      ].map((opt) => (
                                        <label key={opt.id} style={{ fontSize: "11.5px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: nameDisplayMode === opt.id ? "#1e3a8a" : "#334155", fontWeight: nameDisplayMode === opt.id ? 700 : 400 }}>
                                          <input
                                            type="radio"
                                            name="nameMode"
                                            checked={nameDisplayMode === opt.id}
                                            onChange={() => setNameDisplayMode(opt.id as any)}
                                          />
                                          {opt.label}
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </th>
                        <th style={{ padding: "6px 8px", textAlign: "center", color: "#0f172a", fontWeight: 800, width: "65px" }}>
                          Disp.
                        </th>

                        {/* Eventos 1 a 4 del día */}
                        <th style={{ padding: "4px 2px", textAlign: "center", color: "#0f172a", fontWeight: 800, width: "65px" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <span>Video</span>
                            <span style={{ fontSize: "9.5px", fontWeight: 500, color: "#64748b" }}>09:30</span>
                          </div>
                        </th>
                        <th style={{ padding: "4px 2px", textAlign: "center", color: "#0f172a", fontWeight: 800, width: "65px" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <span>Coadyuv.</span>
                            <span style={{ fontSize: "9.5px", fontWeight: 500, color: "#64748b" }}>10:00</span>
                          </div>
                        </th>
                        <th style={{ padding: "4px 2px", textAlign: "center", color: "#0f172a", fontWeight: 800, width: "65px" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <span>Campo</span>
                            <span style={{ fontSize: "9.5px", fontWeight: 500, color: "#64748b" }}>10:45</span>
                          </div>
                        </th>
                        <th style={{ padding: "4px 2px", textAlign: "center", color: "#0f172a", fontWeight: 800, width: "65px" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <span>Optimiz.</span>
                            <span style={{ fontSize: "9.5px", fontWeight: 500, color: "#64748b" }}>12:15</span>
                          </div>
                        </th>

                        {/* Columna de Comentarios */}
                        <th style={{ padding: "6px 10px", textAlign: "left", color: "#0f172a", fontWeight: 800, minWidth: "320px" }}>
                          Comentarios
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const list = (subView === "jugador" && (selectedJugadorId || jugador))
                          ? sortedJugadores.filter((j) => j.id === selectedJugadorId || (jugador && j.id === jugador.id))
                          : sortedJugadores;
                        const finalJugadores = (subView === "jugador" && list.length === 0 && jugador)
                          ? [jugador]
                          : list;
                        return finalJugadores.map((j, idx) => {
                        // Disponibilidad real desde planificación (sin inventar con módulo)
                        let dispCode = "D";
                        try {
                          const dMap = JSON.parse(localStorage.getItem("disponibilidad_map_v1") || "{}");
                          dispCode = dMap[`${j.id}_${selectedDate}`] || dMap[`${j.apodo || j.nombre}_${selectedDate}`] || "D";
                        } catch (e) {}
                        const dispInfo = DISPONIBILIDADES[dispCode as DisponibilidadCodigo] || DISPONIBILIDADES.D;
                        const semaforo = getSemaforoEstilos(dispCode);

                        // Minutos reales del día (0 si no tiene datos)
                        let ev1Mins = 0;
                        let ev2Mins = 0;
                        let ev3Mins = 0;
                        let ev4Mins = 0;
                        try {
                          const mMap = JSON.parse(localStorage.getItem("player_event_minutes_map_v1") || "{}");
                          const pMins = mMap[`${j.id}_${selectedDate}`] || {};
                          ev1Mins = Number(pMins.ev1 || pMins.video || 0);
                          ev2Mins = Number(pMins.ev2 || pMins.gym || 0);
                          ev3Mins = Number(pMins.ev3 || pMins.campo || 0);
                          ev4Mins = Number(pMins.ev4 || pMins.opt || 0);
                        } catch (e) {}

                        // Textos por tipo de comentario
                        const COMMENT_TYPES = [
                          { key: "wellness", code: "W", name: "Wellness", color: "#0369a1", bg: "#e0f2fe", border: "#0284c7", sampleText: "Recuperación 4/5, fatiga leve en cuadriceps." },
                          { key: "fisio", code: "F", name: "Fisioterapia", color: "#c2410c", bg: "#ffedd5", border: "#ea580c", sampleText: "Tratamiento de descarga realizado." },
                          { key: "medico", code: "M", name: "Médico", color: "#b91c1c", bg: "#fee2e2", border: "#ef4444", sampleText: "Revisión médica positiva." },
                          { key: "readapt", code: "R", name: "Readaptación", color: "#6d28d9", bg: "#f3e8ff", border: "#8b5cf6", sampleText: "Trabajo en gimnasio y campo progresivo." },
                          { key: "nutri", code: "N", name: "Nutrición", color: "#15803d", bg: "#dcfce7", border: "#22c55e", sampleText: "Pauta de suplementación ajustada." },
                          { key: "psico", code: "P", name: "Psicología", color: "#0f766e", bg: "#ccfbf1", border: "#14b8a6", sampleText: "Sesión individual completada." },
                        ];

                        const currentComment = playerComments[j.id] || "";

                        const toggleTag = (typeName: string, text: string) => {
                          const tagHeader = `(${typeName}) ${text}`;
                          if (currentComment.includes(`(${typeName})`)) {
                            const regex = new RegExp(`\\(${typeName}\\)[^\\n]*\\n?`, "g");
                            const updated = currentComment.replace(regex, "").trim();
                            setPlayerComments({ ...playerComments, [j.id]: updated });
                          } else {
                            const updated = currentComment ? `${tagHeader}\n${currentComment}` : tagHeader;
                            setPlayerComments({ ...playerComments, [j.id]: updated });
                          }
                        };

                        return (
                          <tr key={j.id} style={{ borderBottom: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                            {/* EJE Y: Deportista con FOTO más grande */}
                            <td style={{ padding: "4px 8px", fontWeight: 800, color: "#0f172a" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                {j.foto_url ? (
                                  <img
                                    src={j.foto_url || undefined}
                                    alt={j.nombre}
                                    style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover", border: "1px solid #cbd5e1" }}
                                  />
                                ) : (
                                  <div style={{
                                    width: "32px",
                                    height: "32px",
                                    borderRadius: "50%",
                                    background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
                                    color: "#ffffff",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "11px",
                                    fontWeight: 800,
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
                                  }}>
                                    {j.nombre.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                  <span style={{ fontSize: "12px", lineHeight: "1.2" }}>{getCustomPlayerName(j)}</span>
                                </div>
                              </div>
                            </td>

                            {/* COLUMNA 1: Disponibilidad Estrecha */}
                            <td style={{ padding: "4px 4px", textAlign: "center" }}>
                              <span style={{
                                fontSize: "11px",
                                fontWeight: 900,
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: semaforo.bg,
                                color: semaforo.color,
                                border: `1px solid ${semaforo.border}`,
                                display: "inline-block",
                                minWidth: "36px"
                              }}>
                                {dispCode}
                              </span>
                            </td>

                            {/* Evento 1: Video */}
                            <td style={{ padding: "4px 4px", textAlign: "center", fontWeight: 700, color: ev1Mins > 0 ? "#0f172a" : "#94a3b8", fontSize: "11.5px" }}>
                              {ev1Mins > 0 ? `${ev1Mins}'` : "—"}
                            </td>

                            {/* Evento 2: Coadyuvante */}
                            <td style={{ padding: "4px 4px", textAlign: "center", fontWeight: 700, color: ev2Mins > 0 ? "#0f172a" : "#94a3b8", fontSize: "11.5px" }}>
                              {ev2Mins > 0 ? `${ev2Mins}'` : "—"}
                            </td>

                            {/* Evento 3: Campo */}
                            <td style={{ padding: "4px 4px", textAlign: "center", fontWeight: 700, color: ev3Mins > 0 ? "#0f172a" : "#94a3b8", fontSize: "11.5px" }}>
                              {ev3Mins > 0 ? `${ev3Mins}'` : "—"}
                            </td>

                            {/* Evento 4: Optimizador */}
                            <td style={{ padding: "4px 4px", textAlign: "center", fontWeight: 700, color: ev4Mins > 0 ? "#0f172a" : "#94a3b8", fontSize: "11.5px" }}>
                              {ev4Mins > 0 ? `${ev4Mins}'` : "—"}
                            </td>

                            {/* Columna de Comentarios Ancha con Botoncitos a la derecha */}
                            <td style={{ padding: "4px 8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                {/* Textarea editable de comentario (ocupa todo el ancho disponible) */}
                                <textarea
                                  value={playerComments[j.id] || ""}
                                  onChange={(e) => setPlayerComments({ ...playerComments, [j.id]: e.target.value })}
                                  placeholder="Añadir comentario..."
                                  rows={1}
                                  style={{
                                    flex: 1,
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    border: "1px solid #cbd5e1",
                                    fontSize: "11.5px",
                                    fontFamily: "inherit",
                                    color: "#0f172a",
                                    outline: "none",
                                    resize: "vertical",
                                    background: playerComments[j.id] ? "#ffffff" : "#fdfdfd",
                                  }}
                                />

                                {/* Botoncitos de las categorías de comentarios asignados A LA DERECHA DEL TODO (no salen en reporte / print) */}
                                <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                  {COMMENT_TYPES.filter((ct) => currentComment.includes(`(${ct.name})`)).map((ct) => {
                                    const hasTag = currentComment.includes(`(${ct.name})`);
                                    return (
                                      <button
                                        key={ct.key}
                                        type="button"
                                        onClick={() => toggleTag(ct.name, ct.sampleText)}
                                        onMouseEnter={(e) => {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          setHoveredBadge({ id: `${ct.key}-${j.id}`, text: `${ct.name}: ${ct.sampleText}`, x: rect.left, y: rect.top - 38 });
                                        }}
                                        onMouseLeave={() => setHoveredBadge(null)}
                                        style={{
                                          width: "20px",
                                          height: "20px",
                                          borderRadius: "4px",
                                          border: `2px solid ${ct.border}`,
                                          background: ct.bg,
                                          color: ct.color,
                                          fontSize: "10px",
                                          fontWeight: 900,
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          transition: "all 0.15s ease",
                                        }}
                                        title={`Quitar ${ct.name}`}
                                      >
                                        {ct.code}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                        });
                      })()}
                    </tbody>
                  </table>

                  {/* Tooltip Emergente on Hover para Iniciales de Comentarios */}
                  {hoveredBadge && (
                    <div
                      style={{
                        position: "fixed",
                        left: `${hoveredBadge.x}px`,
                        top: `${hoveredBadge.y}px`,
                        transform: "translateY(-100%)",
                        background: "#0f172a",
                        color: "#ffffff",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 600,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        pointerEvents: "none",
                        zIndex: 9999,
                        maxWidth: "280px",
                      }}
                    >
                      {hoveredBadge.text}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SEPARADOR ENTRE INFORMES EN VISTA COMPLETO JUGADOR */}
            {mainTab === "completo" && subView === "jugador" && (
              <div
                className="completo-report-separator"
                style={{
                  height: "6px",
                  width: "100%",
                }}
                aria-hidden="true"
              />
            )}

            {/* VISTA GPS (VISTAS EXISTENTES DE JUGADOR / COMPARATIVA / EQUIPO) */}
            {(mainTab === "gps" || mainTab === "completo") && (
              <div>
                {/* VISTA 1: JUGADOR */}
                {subView === "jugador" && jugador && (
                  <>
                    {/* CABECERA ESTÁNDAR: ESCUDO Y CLUB A LA IZQ / TÍTULO ENMEDIO / DÍA Y MD A LA DERECHA */}
                    <div
                      className={`gps-second-header ${mainTab === "completo" ? "completo-second-header" : ""}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: mainTab === "completo" ? "1fr" : "auto 1fr auto",
                        gap: "16px",
                        alignItems: "center",
                        marginTop: mainTab === "completo" ? "6px" : "0",
                        marginBottom: mainTab === "completo" ? "8px" : "12px",
                        borderBottom: "2px solid #0f172a",
                        paddingBottom: mainTab === "completo" ? "4px" : "10px",
                      }}
                    >
                      {/* Arriba a la izquierda: Escudo y nombre del club (oculto en informe completo jugador) */}
                      <div
                        className={mainTab === "completo" ? "completo-player-header-hide" : ""}
                        style={{ justifySelf: "start", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minWidth: "75px" }}
                      >
                        <img
                        src="/ce-europa.png"
                        alt="CE EUROPA"
                        style={{ width: "46px", height: "54px", objectFit: "contain", background: "#ffffff", borderRadius: "6px", padding: "2px" }}
                      />
                      <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap" }}>
                        CE EUROPA
                      </span>
                      </div>

                      {/* Centro: Título */}
                      <div style={{ justifySelf: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <h2 style={{ fontSize: mainTab === "completo" ? "19px" : "23px", fontWeight: 900, color: "#0f172a", margin: 0, textTransform: "uppercase", whiteSpace: "normal", textAlign: "center", letterSpacing: "0.02em" }}>
                          INFORME GPS SESIÓN INDIVIDUAL
                        </h2>
                      </div>

                      {/* Arriba a la derecha: Día y MD (oculto en informe completo jugador) */}
                      <div
                        className={mainTab === "completo" ? "completo-player-header-hide" : ""}
                        style={{ justifySelf: "end", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}
                      >
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.2px" }}>Día:</span>
                            <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a" }}>
                              {getAutoDay(selectedDate)}
                            </span>
                            <input
                              type="text"
                              defaultValue={getAutoDay(selectedDate)}
                              key={selectedDate}
                              className="clean-header-input no-print"
                              style={{ fontSize: "11.5px", fontWeight: 800, padding: "2px 4px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", outline: "none", width: "95px", textAlign: "center" }}
                            />
                          </div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.2px" }}>MD:</span>
                            <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: matchDay === "MD" ? "#dc2626" : "#0f172a" }}>
                              {matchDay}
                            </span>
                            <input
                              type="text"
                              value={matchDay}
                              readOnly
                              className="clean-header-input no-print"
                              style={{ fontSize: "11.5px", fontWeight: 800, padding: "2px 4px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: matchDay === "MD" ? "#dc2626" : "#0f172a", outline: "none", width: "44px", textAlign: "center" }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Header Card con Perfil Reducido y Foto Más Grande (solo cuando no es completo) */}
                    {mainTab !== "completo" && (
                      <section className="gps-header-card">
                      <div className="gps-profile-block">
                        <div className="gps-profile-photo">
                          {jugador.foto_url ? (
                            <img src={jugador.foto_url || undefined} alt={jugador.nombre} />
                          ) : (
                            <span>{jugador.nombre.slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="gps-profile-info">
                          <h1>{getJugadorDisplayName(jugador)}</h1>
                          <p>
                            {jugador.posicion || "Sin posición"}{calculateAge(jugador.fecha_nacimiento) ? ` · ${calculateAge(jugador.fecha_nacimiento)}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="gps-controls-block no-print" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                        {/* Escudo Oficial de CE Europa y Nombre del Club */}
                        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "4px" }}>
                          <img src="/ce-europa.png" alt="CE EUROPA" style={{ width: "24px", height: "24px", objectFit: "contain", background: "#ffffff", borderRadius: "4px", padding: "1px" }} />
                    <span style={{ fontSize: "12px", fontWeight: 900, color: "#1e3a8a", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      CE EUROPA
                    </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className="gps-badge-md">Match Day: {matchDay}</span>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e3a8a" }}>
                            📅 {formatDateDDMMAAAA(selectedDate)}
                          </span>
                        </div>
                      </div>
                    </section>
                    )}

                    {/* BLOQUE DE OBSERVACIONES / COMENTARIOS DE LA SESIÓN */}
                    <div className={!commentJugador ? "no-print" : ""} style={{ marginBottom: "16px" }}>
                      <textarea
                        value={commentJugador}
                        onChange={(e) => setCommentJugador(e.target.value)}
                        placeholder="Escribe aquí observaciones sobre la sesión del jugador..."
                        rows={2}
                        className="gps-observations-textarea"
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          border: "none",
                          borderLeft: "3px solid #1e3a8a",
                          fontSize: "12.5px",
                          fontFamily: "inherit",
                          color: "#0f172a",
                          outline: "none",
                          resize: "vertical",
                          background: "rgba(241, 245, 249, 0.7)",
                          transition: "all 0.15s ease",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.background = "#ffffff";
                          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.background = "rgba(241, 245, 249, 0.7)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      />
                    </div>

                    {/* 1. GRÁFICOS COMPARATIVOS DE SESIÓN JUGADOR (FILA 1 Y FILA 2 CON BARRAS JUNTAS Y CONFIGURABLES) */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "16px" }}>
                      {/* FILA 1: Variables 1 y 2 */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                        {/* Fila 1 - Gráfico Izq: Comparativa vs Media del Equipo */}
                        <div className="gps-chart-card" style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                          <h3 style={{ fontSize: "13px", fontWeight: 800, textTransform: "uppercase", color: "#0f172a", margin: "0 0 12px 0", textAlign: "center" }}>
                            📊 COMPARATIVA VS. MEDIA DEL EQUIPO
                          </h3>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", width: "100%", height: 210 }}>
                            {/* Sub-chart Variable 1 */}
                            <div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "4px" }}>
                                <select
                                  value={playerChartMetric1}
                                  onChange={(e) => handlePlayerChartMetric1Change(e.target.value)}
                                  className="no-print"
                                  title="Cambiar variable 1"
                                  style={{ padding: "2px 6px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "10.5px", fontWeight: 800, color: "#1e3a8a", background: "#eff6ff", cursor: "pointer", outline: "none", maxWidth: "190px" }}
                                >
                                  {renderGpsMetricOptions(playerChartMetric1)}
                                </select>
                                <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#000000" }}>
                                  {getHeaderTitle(m1Def)}
                                </span>
                              </div>
                              <ResponsiveContainer width="100%" height="90%">
                                <BarChart
                                  data={[{ categoria: "comp", [firstName]: jugadorM1Val, "Media eq.": teamAvgM1 }]}
                                  barGap={6}
                                  margin={{ top: 22, right: 10, left: -15, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                  <XAxis dataKey="categoria" stroke="#000000" tick={false} axisLine={{ stroke: "#000000" }} />
                                  <YAxis stroke="#000000" tick={{ fontSize: 9, fontWeight: 700, fill: "#000000" }} unit={m1Def.unit || ""} domain={[0, "auto"]} />
                                  <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "11px" }} />
                                  <Bar dataKey={firstName} name={firstName} fill="#1e3a8a" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey={firstName} position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#1e3a8a" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                  <Bar dataKey="Media eq." name="Media equipo" fill="#ea580c" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey="Media eq." position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#ea580c" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>

                            {/* Sub-chart Variable 2 */}
                            <div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "4px" }}>
                                <select
                                  value={playerChartMetric2}
                                  onChange={(e) => handlePlayerChartMetric2Change(e.target.value)}
                                  className="no-print"
                                  title="Cambiar variable 2"
                                  style={{ padding: "2px 6px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "10.5px", fontWeight: 800, color: "#1e3a8a", background: "#eff6ff", cursor: "pointer", outline: "none", maxWidth: "190px" }}
                                >
                                  {renderGpsMetricOptions(playerChartMetric2)}
                                </select>
                                <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#000000" }}>
                                  {getHeaderTitle(m2Def)}
                                </span>
                              </div>
                              <ResponsiveContainer width="100%" height="90%">
                                <BarChart
                                  data={[{ categoria: "comp", [firstName]: jugadorM2Val, "Media eq.": teamAvgM2 }]}
                                  barGap={6}
                                  margin={{ top: 22, right: 10, left: -15, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                  <XAxis dataKey="categoria" stroke="#000000" tick={false} axisLine={{ stroke: "#000000" }} />
                                  <YAxis orientation="right" stroke="#000000" tick={{ fontSize: 9, fontWeight: 700, fill: "#000000" }} unit={m2Def.unit || ""} domain={[0, "auto"]} />
                                  <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "11px" }} />
                                  <Bar dataKey={firstName} name={firstName} fill="#1e3a8a" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey={firstName} position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#1e3a8a" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                  <Bar dataKey="Media eq." name="Media equipo" fill="#ea580c" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey="Media eq." position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#ea580c" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          <div className="gps-chart-legend" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "16px", marginTop: "14px", fontSize: "11px", fontWeight: 800 }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "2px", background: "#1e3a8a", flexShrink: 0 }} />
                              <span style={{ color: "#1e3a8a" }}>{firstName}</span>
                            </div>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "2px", background: "#ea580c", flexShrink: 0 }} />
                              <span style={{ color: "#ea580c" }}>Media equipo</span>
                            </div>
                          </div>
                        </div>

                        {/* Fila 1 - Gráfico Der: Promedio en Match Day */}
                        <div className="gps-chart-card" style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                          <h3 style={{ fontSize: "13px", fontWeight: 800, textTransform: "uppercase", color: "#0f172a", margin: "0 0 12px 0", textAlign: "center" }}>
                            🎯 PROMEDIO {firstName.toUpperCase()} EN SESIÓN {matchDay}
                          </h3>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", width: "100%", height: 210 }}>
                            {/* Sub-chart Variable 1 Match Day */}
                            <div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "4px" }}>
                                <select
                                  value={playerChartMetric1}
                                  onChange={(e) => handlePlayerChartMetric1Change(e.target.value)}
                                  className="no-print"
                                  title="Cambiar variable 1"
                                  style={{ padding: "2px 6px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "10.5px", fontWeight: 800, color: "#1e3a8a", background: "#eff6ff", cursor: "pointer", outline: "none", maxWidth: "190px" }}
                                >
                                  {renderGpsMetricOptions(playerChartMetric1)}
                                </select>
                                <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#000000" }}>
                                  {getHeaderTitle(m1Def)}
                                </span>
                              </div>
                              <ResponsiveContainer width="100%" height="90%">
                                <BarChart
                                  data={[{ categoria: "comp", [firstName]: jugadorM1Val, [`Media ${matchDay}`]: playerMdAvgM1 }]}
                                  barGap={6}
                                  margin={{ top: 22, right: 10, left: -15, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                  <XAxis dataKey="categoria" stroke="#000000" tick={false} axisLine={{ stroke: "#000000" }} />
                                  <YAxis stroke="#000000" tick={{ fontSize: 9, fontWeight: 700, fill: "#000000" }} unit={m1Def.unit || ""} domain={[0, "auto"]} />
                                  <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "11px" }} />
                                  <Bar dataKey={firstName} name={firstName} fill="#1e3a8a" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey={firstName} position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#1e3a8a" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                  <Bar dataKey={`Media ${matchDay}`} name={`Media ${matchDay}`} fill="#ea580c" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey={`Media ${matchDay}`} position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#ea580c" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>

                            {/* Sub-chart Variable 2 Match Day */}
                            <div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "4px" }}>
                                <select
                                  value={playerChartMetric2}
                                  onChange={(e) => handlePlayerChartMetric2Change(e.target.value)}
                                  className="no-print"
                                  title="Cambiar variable 2"
                                  style={{ padding: "2px 6px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "10.5px", fontWeight: 800, color: "#1e3a8a", background: "#eff6ff", cursor: "pointer", outline: "none", maxWidth: "190px" }}
                                >
                                  {renderGpsMetricOptions(playerChartMetric2)}
                                </select>
                                <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#000000" }}>
                                  {getHeaderTitle(m2Def)}
                                </span>
                              </div>
                              <ResponsiveContainer width="100%" height="90%">
                                <BarChart
                                  data={[{ categoria: "comp", [firstName]: jugadorM2Val, [`Media ${matchDay}`]: playerMdAvgM2 }]}
                                  barGap={6}
                                  margin={{ top: 22, right: 10, left: -15, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                  <XAxis dataKey="categoria" stroke="#000000" tick={false} axisLine={{ stroke: "#000000" }} />
                                  <YAxis orientation="right" stroke="#000000" tick={{ fontSize: 9, fontWeight: 700, fill: "#000000" }} unit={m2Def.unit || ""} domain={[0, "auto"]} />
                                  <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "11px" }} />
                                  <Bar dataKey={firstName} name={firstName} fill="#1e3a8a" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey={firstName} position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#1e3a8a" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                  <Bar dataKey={`Media ${matchDay}`} name={`Media ${matchDay}`} fill="#ea580c" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey={`Media ${matchDay}`} position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#ea580c" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          <div className="gps-chart-legend" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "16px", marginTop: "14px", fontSize: "11px", fontWeight: 800 }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "2px", background: "#1e3a8a", flexShrink: 0 }} />
                              <span style={{ color: "#1e3a8a" }}>{firstName}</span>
                            </div>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "2px", background: "#ea580c", flexShrink: 0 }} />
                              <span style={{ color: "#ea580c" }}>Media {matchDay}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* FILA 2: Variables 3 y 4 (Gráficos debajo con barras juntas) */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                        {/* Fila 2 - Gráfico Izq: Comparativa vs Media del Equipo */}
                        <div className="gps-chart-card" style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                          <h3 style={{ fontSize: "13px", fontWeight: 800, textTransform: "uppercase", color: "#0f172a", margin: "0 0 12px 0", textAlign: "center" }}>
                            📊 COMPARATIVA VS. MEDIA DEL EQUIPO
                          </h3>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", width: "100%", height: 210 }}>
                            {/* Sub-chart Variable 3 */}
                            <div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "4px" }}>
                                <select
                                  value={playerChartMetric3}
                                  onChange={(e) => handlePlayerChartMetric3Change(e.target.value)}
                                  className="no-print"
                                  title="Cambiar variable 3"
                                  style={{ padding: "2px 6px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "10.5px", fontWeight: 800, color: "#1e3a8a", background: "#eff6ff", cursor: "pointer", outline: "none", maxWidth: "190px" }}
                                >
                                  {renderGpsMetricOptions(playerChartMetric3)}
                                </select>
                                <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#000000" }}>
                                  {getHeaderTitle(m3Def)}
                                </span>
                              </div>
                              <ResponsiveContainer width="100%" height="90%">
                                <BarChart
                                  data={[{ categoria: "comp", [firstName]: jugadorM3Val, "Media eq.": teamAvgM3 }]}
                                  barGap={6}
                                  margin={{ top: 22, right: 10, left: -15, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                  <XAxis dataKey="categoria" stroke="#000000" tick={false} axisLine={{ stroke: "#000000" }} />
                                  <YAxis stroke="#000000" tick={{ fontSize: 9, fontWeight: 700, fill: "#000000" }} unit={m3Def.unit || ""} domain={[0, "auto"]} />
                                  <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "11px" }} />
                                  <Bar dataKey={firstName} name={firstName} fill="#1e3a8a" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey={firstName} position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#1e3a8a" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                  <Bar dataKey="Media eq." name="Media equipo" fill="#ea580c" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey="Media eq." position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#ea580c" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>

                            {/* Sub-chart Variable 4 */}
                            <div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "4px" }}>
                                <select
                                  value={playerChartMetric4}
                                  onChange={(e) => handlePlayerChartMetric4Change(e.target.value)}
                                  className="no-print"
                                  title="Cambiar variable 4"
                                  style={{ padding: "2px 6px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "10.5px", fontWeight: 800, color: "#1e3a8a", background: "#eff6ff", cursor: "pointer", outline: "none", maxWidth: "190px" }}
                                >
                                  {renderGpsMetricOptions(playerChartMetric4)}
                                </select>
                                <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#000000" }}>
                                  {getHeaderTitle(m4Def)}
                                </span>
                              </div>
                              <ResponsiveContainer width="100%" height="90%">
                                <BarChart
                                  data={[{ categoria: "comp", [firstName]: jugadorM4Val, "Media eq.": teamAvgM4 }]}
                                  barGap={6}
                                  margin={{ top: 22, right: 10, left: -15, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                  <XAxis dataKey="categoria" stroke="#000000" tick={false} axisLine={{ stroke: "#000000" }} />
                                  <YAxis orientation="right" stroke="#000000" tick={{ fontSize: 9, fontWeight: 700, fill: "#000000" }} unit={m4Def.unit || ""} domain={[0, "auto"]} />
                                  <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "11px" }} />
                                  <Bar dataKey={firstName} name={firstName} fill="#1e3a8a" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey={firstName} position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#1e3a8a" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                  <Bar dataKey="Media eq." name="Media equipo" fill="#ea580c" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey="Media eq." position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#ea580c" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          <div className="gps-chart-legend" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "16px", marginTop: "14px", fontSize: "11px", fontWeight: 800 }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "2px", background: "#1e3a8a", flexShrink: 0 }} />
                              <span style={{ color: "#1e3a8a" }}>{firstName}</span>
                            </div>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "2px", background: "#ea580c", flexShrink: 0 }} />
                              <span style={{ color: "#ea580c" }}>Media equipo</span>
                            </div>
                          </div>
                        </div>

                        {/* Fila 2 - Gráfico Der: Promedio en Match Day */}
                        <div className="gps-chart-card" style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                          <h3 style={{ fontSize: "13px", fontWeight: 800, textTransform: "uppercase", color: "#0f172a", margin: "0 0 12px 0", textAlign: "center" }}>
                            🎯 PROMEDIO {firstName.toUpperCase()} EN SESIÓN {matchDay}
                          </h3>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", width: "100%", height: 210 }}>
                            {/* Sub-chart Variable 3 Match Day */}
                            <div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "4px" }}>
                                <select
                                  value={playerChartMetric3}
                                  onChange={(e) => handlePlayerChartMetric3Change(e.target.value)}
                                  className="no-print"
                                  title="Cambiar variable 3"
                                  style={{ padding: "2px 6px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "10.5px", fontWeight: 800, color: "#1e3a8a", background: "#eff6ff", cursor: "pointer", outline: "none", maxWidth: "190px" }}
                                >
                                  {renderGpsMetricOptions(playerChartMetric3)}
                                </select>
                                <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#000000" }}>
                                  {getHeaderTitle(m3Def)}
                                </span>
                              </div>
                              <ResponsiveContainer width="100%" height="90%">
                                <BarChart
                                  data={[{ categoria: "comp", [firstName]: jugadorM3Val, [`Media ${matchDay}`]: playerMdAvgM3 }]}
                                  barGap={6}
                                  margin={{ top: 22, right: 10, left: -15, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                  <XAxis dataKey="categoria" stroke="#000000" tick={false} axisLine={{ stroke: "#000000" }} />
                                  <YAxis stroke="#000000" tick={{ fontSize: 9, fontWeight: 700, fill: "#000000" }} unit={m3Def.unit || ""} domain={[0, "auto"]} />
                                  <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "11px" }} />
                                  <Bar dataKey={firstName} name={firstName} fill="#1e3a8a" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey={firstName} position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#1e3a8a" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                  <Bar dataKey={`Media ${matchDay}`} name={`Media ${matchDay}`} fill="#ea580c" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey={`Media ${matchDay}`} position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#ea580c" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>

                            {/* Sub-chart Variable 4 Match Day */}
                            <div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "4px" }}>
                                <select
                                  value={playerChartMetric4}
                                  onChange={(e) => handlePlayerChartMetric4Change(e.target.value)}
                                  className="no-print"
                                  title="Cambiar variable 4"
                                  style={{ padding: "2px 6px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "10.5px", fontWeight: 800, color: "#1e3a8a", background: "#eff6ff", cursor: "pointer", outline: "none", maxWidth: "190px" }}
                                >
                                  {renderGpsMetricOptions(playerChartMetric4)}
                                </select>
                                <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#000000" }}>
                                  {getHeaderTitle(m4Def)}
                                </span>
                              </div>
                              <ResponsiveContainer width="100%" height="90%">
                                <BarChart
                                  data={[{ categoria: "comp", [firstName]: jugadorM4Val, [`Media ${matchDay}`]: playerMdAvgM4 }]}
                                  barGap={6}
                                  margin={{ top: 22, right: 10, left: -15, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                  <XAxis dataKey="categoria" stroke="#000000" tick={false} axisLine={{ stroke: "#000000" }} />
                                  <YAxis orientation="right" stroke="#000000" tick={{ fontSize: 9, fontWeight: 700, fill: "#000000" }} unit={m4Def.unit || ""} domain={[0, "auto"]} />
                                  <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "11px" }} />
                                  <Bar dataKey={firstName} name={firstName} fill="#1e3a8a" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey={firstName} position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#1e3a8a" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                  <Bar dataKey={`Media ${matchDay}`} name={`Media ${matchDay}`} fill="#ea580c" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey={`Media ${matchDay}`} position="top" style={{ fontSize: "9.5px", fontWeight: 800, fill: "#ea580c" }} formatter={(val: any) => typeof val === "number" ? val.toLocaleString("es-ES") : val} />
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          <div className="gps-chart-legend" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "16px", marginTop: "14px", fontSize: "11px", fontWeight: 800 }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "2px", background: "#1e3a8a", flexShrink: 0 }} />
                              <span style={{ color: "#1e3a8a" }}>{firstName}</span>
                            </div>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "2px", background: "#ea580c", flexShrink: 0 }} />
                              <span style={{ color: "#ea580c" }}>Media {matchDay}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. VELOCIDAD MÁXIMA */}
                    <div className="gps-chart-card gps-chart-card-full" style={{ padding: "12px 16px", marginBottom: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                        <h2 className="gps-chart-title" style={{ margin: 0, fontSize: "13px", letterSpacing: "0.04em", textTransform: "uppercase", color: "#000000" }}>
                          VELOCIDAD MÁXIMA
                        </h2>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#0284c7" }}>
                          Hoy: <strong>{jugadorTopSpeed} km/h</strong> · <span style={{ color: "#10b981" }}>Máx Histórico: <strong>{playerMaxTopSpeed} km/h</strong></span>
                        </span>
                      </div>

                      <div style={{ background: "#f8fafc", padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e6e3" }}>
                        <div style={{ position: "relative", width: "100%", height: "16px", background: "#e2e8f0", borderRadius: "8px", overflow: "hidden", marginTop: "2px" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${percentOfMax}%`,
                              background: "linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)",
                              borderRadius: "8px",
                              transition: "width 0.5s ease",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              top: 0,
                              right: 0,
                              width: "3px",
                              height: "100%",
                              background: "#10b981",
                            }}
                            title={`Máximo Histórico: ${playerMaxTopSpeed} km/h`}
                          />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>
                          <span>0 km/h</span>
                          <span style={{ color: "#0369a1", fontWeight: 700 }}>
                            {percentOfMax}% del máximo alcanzado hoy
                          </span>
                          <span>Máx: {playerMaxTopSpeed} km/h</span>
                        </div>
                      </div>
                    </div>

                    {/* 3. TABLA PERSONALIZABLE DE MÉTRICAS INDIVIDUALES */}
                    <section style={{ background: "#ffffff", borderRadius: "12px", padding: "14px 16px", border: "1px solid #e2e6e3", boxShadow: "0 2px 10px rgba(0,0,0,0.03)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                        <h2 style={{ fontSize: "13px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "#000000", margin: 0 }}>
                          RESUMEN DE MÉTRICAS INDIVIDUALES ({formatDateDDMMAAAA(selectedDate)})
                        </h2>

                        {/* Botones de acción rápida */}
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }} className="no-print">
                          <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#64748b", marginRight: "2px" }}>Variables:</span>
                          <button
                            type="button"
                            onClick={() => {
                              handlePlayerTableMetricsChange(favoriteKeys.filter((k) => k !== "HSR Abs (m)").slice(0, 6));
                            }}
                            title="Cargar tus variables favoritas configuradas en Ajustes"
                            style={{
                              fontSize: "9.5px",
                              fontWeight: 800,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              border: "1px solid #bfdbfe",
                              background: "#eff6ff",
                              color: "#1e3a8a",
                              cursor: "pointer",
                            }}
                          >
                            ⭐ Cargar Favoritas
                          </button>
                        </div>
                      </div>

                      {/* Chips / Botones para seleccionar variables de la tabla individual */}
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", marginBottom: "12px" }} className="no-print">
                        {favoriteVariables.filter((m) => m.key !== "HSR Abs (m)").map((m) => {
                          const filteredList = playerTableMetrics.filter((k) => favoriteKeys.includes(k) && k !== "HSR Abs (m)");
                          const currentList = filteredList.length > 0 ? filteredList : favoriteKeys.filter((k) => k !== "HSR Abs (m)").slice(0, 6);
                          const isSelected = currentList.includes(m.key);
                          return (
                            <button
                              key={m.key}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  if (currentList.length > 1) {
                                    handlePlayerTableMetricsChange(currentList.filter((k) => k !== m.key));
                                  }
                                } else {
                                  if (currentList.length < 8) {
                                    handlePlayerTableMetricsChange([...currentList, m.key]);
                                  }
                                }
                              }}
                              style={{
                                fontSize: "9.5px",
                                fontWeight: 700,
                                padding: "2px 6px",
                                borderRadius: "4px",
                                border: isSelected ? "1px solid #0284c7" : "1px solid #cbd5e1",
                                background: isSelected ? "#0284c7" : "#ffffff",
                                color: isSelected ? "#ffffff" : "#475569",
                                cursor: "pointer",
                              }}
                            >
                              {m.shortLabel || m.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Tabla Dinámica con las variables elegidas */}
                      <div style={{ width: "100%", overflowX: "auto" }}>
                        <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: "12.5px", textAlign: "center" }}>
                          <thead>
                            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                              {activePlayerTableMetricsList.map((m) => (
                                <th
                                  key={m.key}
                                  style={{
                                    padding: "10px 8px",
                                    color: "#1e3a8a",
                                    fontWeight: 800,
                                    fontSize: "11px",
                                    width: `${100 / Math.max(activePlayerTableMetricsList.length, 1)}%`,
                                    boxSizing: "border-box",
                                    lineHeight: "1.3",
                                    verticalAlign: "middle"
                                  }}
                                >
                                  {getHeaderTitle(m)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr style={{ borderBottom: "1px solid #f1f5f9", fontWeight: 900, color: "#0f172a", fontSize: "13.5px" }}>
                              {activePlayerTableMetricsList.map((m) => {
                                const val = currentRecordEffective ? getMetricValue(currentRecordEffective.metricas, m.key) : 0;
                                const isMaxSpeed = m.key === "MAX Speed(km/h)" || m.key === "Vel Max";
                                const formatted = isMaxSpeed ? val.toFixed(1) : (typeof val === "number" ? val.toLocaleString("es-ES") : val);
                                return (
                                  <td key={m.key} style={{ padding: "12px 8px", verticalAlign: "middle" }}>
                                    {formatted}
                                  </td>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}

                {/* VISTA 2: COMPARATIVA */}
                {subView === "comparativa" && (
                  <GpsComparativeSection
                    mode="sesion"
                    clubName={activeTeam}
                    clubShield={clubShield}
                    jugadores={jugadores}
                    initialJugadorId={selectedJugadorId}
                    teamGpsRecords={teamGpsRecords}
                    availableDates={availableDates}
                    selectedDate={selectedDate}
                    favoriteKeys={favoriteKeys}
                    derivedVariables={derivedVariables}
                    allVariables={allVariables}
                  />
                )}

                {/* VISTA 3: EQUIPO */}
                {subView === "equipo" && (
                  <div className="team-report-card">
                    {/* CABECERA ESTÁNDAR: ESCUDO Y CLUB A LA IZQ / TÍTULO ENMEDIO / DÍA Y MD A LA DERECHA */}
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "16px", alignItems: "center", marginBottom: "10px", borderBottom: "2px solid #0f172a", paddingBottom: "10px" }}>
                      {/* Arriba a la izquierda: Escudo y nombre del club */}
                      <div style={{ justifySelf: "start", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minWidth: "75px" }}>
                        <img
                        src="/ce-europa.png"
                        alt="CE EUROPA"
                        style={{ width: "46px", height: "54px", objectFit: "contain", background: "#ffffff", borderRadius: "6px", padding: "2px" }}
                      />
                      <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap" }}>
                        CE EUROPA
                      </span>
                      </div>

                      {/* Centro: Título */}
                      <div style={{ justifySelf: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <h2 style={{ fontSize: "23px", fontWeight: 900, color: "#0f172a", margin: 0, textTransform: "uppercase", whiteSpace: "normal", textAlign: "center", letterSpacing: "0.02em" }}>
                          INFORME SESIÓN GPS EQUIPO
                        </h2>
                      </div>

                      {/* Arriba a la derecha: Día y MD pegados al margen derecho */}
                      <div style={{ justifySelf: "end", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.2px" }}>Día:</span>
                            <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a" }}>
                              {getAutoDay(selectedDate)}
                            </span>
                            <input
                              type="text"
                              defaultValue={getAutoDay(selectedDate)}
                              key={selectedDate}
                              className="clean-header-input no-print"
                              style={{ fontSize: "11.5px", fontWeight: 800, padding: "2px 4px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", outline: "none", width: "95px", textAlign: "center" }}
                            />
                          </div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.2px" }}>MD:</span>
                            <span className="print-only" style={{ fontSize: "11px", fontWeight: 800, color: matchDay === "MD" ? "#dc2626" : "#0f172a" }}>
                              {matchDay}
                            </span>
                            <input
                              type="text"
                              value={matchDay}
                              readOnly
                              className="clean-header-input no-print"
                              style={{ fontSize: "11.5px", fontWeight: 800, padding: "2px 4px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: matchDay === "MD" ? "#dc2626" : "#0f172a", outline: "none", width: "44px", textAlign: "center" }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Campo Limpio de Comentario General de la Sesión */}
                      <div style={{ marginTop: "8px" }}>
                        <textarea
                          value={equipoSessionComment}
                          onChange={(e) => setEquipoSessionComment(e.target.value)}
                          placeholder="Comentario de la sesión..."
                          rows={2}
                          style={{
                            width: "100%",
                            padding: "6px 0",
                            border: "none",
                            background: "transparent",
                            fontSize: "12px",
                            fontWeight: 500,
                            color: "#334155",
                            outline: "none",
                            resize: "none",
                            fontFamily: "inherit",
                          }}
                        />
                      </div>

                    {/* Contenido de gráficos de Equipo con variables previamente calculadas */}

                    {/* GRÁFICO 1 DE BARRAS DUAL-AXIS (EJE Y1 EN COLUMNA & Y2 EN PUNTO) */}
                    <div style={{ background: "#ffffff", padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", marginBottom: "12px", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
                      {/* Controles de Selección de Métricas y Ordenación para Gráfico 1 (no print) */}
                      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px", background: "#f8fafc", padding: "6px 10px", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <h3 style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", margin: 0, textTransform: "uppercase" }}>
                            📊 Gráfico 1
                          </h3>
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "2px 7px",
                              borderRadius: "4px",
                              border: ocultarSinDatos ? "1px solid #93c5fd" : "1px solid #cbd5e1",
                              background: ocultarSinDatos ? "#eff6ff" : "#ffffff",
                              cursor: "pointer",
                              fontSize: "10.5px",
                              fontWeight: 700,
                              color: ocultarSinDatos ? "#1e40af" : "#64748b",
                            }}
                            title="Marca o desmarca para eliminar o añadir jugadores sin datos"
                          >
                            <input
                              type="checkbox"
                              checked={ocultarSinDatos}
                              onChange={(e) => handleToggleOcultarSinDatos(e.target.checked)}
                              style={{ cursor: "pointer", accentColor: "#1e3a8a" }}
                            />
                            <span>{ocultarSinDatos ? "Ocultar sin datos" : "Añadir sin datos"}</span>
                          </label>
                          {/* Filtro de Ordenación Gráfico 1 */}
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>Ordenar:</span>
                            <select
                              value={chart1SortMode}
                              onChange={(e) => handleChart1SortModeChange(e.target.value as any)}
                              style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600 }}
                            >
                              <option value="posicion">Por Posición Táctica</option>
                              <option value="alfabetico">Alfabéticamente (A-Z)</option>
                              <option value="valor">Por Valor Mayor (↓)</option>
                            </select>
                            {chart1SortMode === "valor" && (
                              <select
                                value={chart1SortMetric}
                                onChange={(e) => handleChart1SortMetricChange(e.target.value)}
                                style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600 }}
                              >
                                {renderGpsMetricOptions(chart1SortMetric)}
                              </select>
                            )}
                          </div>
                        </div>

                        {/* Filtros de Métricas Gráfico 1 */}
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", width: "100%" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginLeft: "auto" }} className="no-print">
                            <Link
                              href="/ajustes"
                              title="Configurar variables favoritas en Ajustes > GPS"
                              style={{ fontSize: "11px", color: "#64748b", textDecoration: "none" }}
                            >
                              ⚙️
                            </Link>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#0284c7" }} />
                            <span style={{ fontSize: "11px", fontWeight: 600, color: "#0284c7" }}>Columna (Y):</span>
                            <select
                              value={chart1LeftMetric}
                              onChange={(e) => {
                              const val = e.target.value;
                              setChart1LeftMetric(val);
                              if (typeof window !== "undefined") localStorage.setItem("gps_equipo_chart1_left_metric", val);
                            }}
                              style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600 }}
                            >
                              {renderGpsMetricOptions(chart1LeftMetric)}
                            </select>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#dc2626" }} />
                            <span style={{ fontSize: "11px", fontWeight: 600, color: "#dc2626" }}>Punto (Y2):</span>
                            <select
                              value={chart1RightMetric}
                              onChange={(e) => {
                              const val = e.target.value;
                              setChart1RightMetric(val);
                              if (typeof window !== "undefined") localStorage.setItem("gps_equipo_chart1_right_metric", val);
                            }}
                              style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600 }}
                            >
                              {renderGpsMetricOptions(chart1RightMetric)}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Título en Versión Imprimible */}
                      <div className="print-only gps-chart-legend" style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a", marginTop: "2px", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.02em", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span>GRÁFICO 1:</span>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", background: "#0284c7", flexShrink: 0 }} />
                          <span style={{ color: "#0284c7", fontWeight: 800 }}>{m1Left.label} (Columna)</span>
                        </div>
                        <span style={{ color: "#64748b" }}>vs.</span>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#dc2626", flexShrink: 0 }} />
                          <span style={{ color: "#dc2626", fontWeight: 800 }}>{m1Right.label} (Punto)</span>
                        </div>
                      </div>

                      {/* Render Recharts ComposedChart Dual-Axis */}
                      <div style={{ width: "100%", height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chart1Data} margin={{ top: 16, right: 0, left: 0, bottom: 25 }} barCategoryGap="2%">
                            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                            <XAxis
                              dataKey="name"
                              stroke="#0f172a"
                              interval={0}
                              tick={{ fontSize: 8.5, fontWeight: 600, fill: "#0f172a" }}
                              angle={-35}
                              textAnchor="end"
                            />
                            <YAxis yAxisId="left" orientation="left" stroke="#0284c7" tick={{ fontSize: 8.5, fontWeight: 500, fill: "#0284c7" }} />
                            <YAxis yAxisId="right" orientation="right" stroke="#dc2626" tick={{ fontSize: 8.5, fontWeight: 500, fill: "#dc2626" }} />
                            <Tooltip contentStyle={{ borderRadius: "6px", fontSize: "11px", fontWeight: 500 }} />
                            {/* Variable 1 (Y): Representada en Columna (Barra azul claro brillante con valor en blanco) */}
                            <Bar yAxisId="left" dataKey="Y1" name={m1Left.label} fill="#0284c7" radius={[3, 3, 0, 0]} barSize={24}>
                              <LabelList dataKey="Y1" position="insideBottom" dy={-4} style={{ fontSize: "7.5px", fontWeight: 500, fill: "#ffffff" }} formatter={(val: any) => typeof val === "number" ? (val > 100 ? Math.round(val) : val) : val} />
                            </Bar>
                            {/* Variable 2 (Y2): Representada en Punto rojo (Scatter/Dot) sobre la barra */}
                            <Scatter yAxisId="right" dataKey="Y2" name={m1Right.label} fill="#dc2626" shape="circle">
                              <LabelList dataKey="Y2" position="top" style={{ fontSize: "8px", fontWeight: 500, fill: "#dc2626" }} formatter={(val: any) => typeof val === "number" ? (val > 100 ? Math.round(val) : val) : val} />
                            </Scatter>
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Campo Limpio de Comentario debajo del Gráfico 1 */}
                      <div style={{ marginTop: "4px" }}>
                        <textarea
                          value={chart1Comment}
                          onChange={(e) => setChart1Comment(e.target.value)}
                          placeholder="Añadir comentario explicativo para el Gráfico 1..."
                          rows={1}
                          style={{
                            width: "100%",
                            padding: "4px 8px",
                            border: "none",
                            borderLeft: "3px solid #0284c7",
                            background: "#f8fafc",
                            fontSize: "11px",
                            fontWeight: 500,
                            color: "#0f172a",
                            outline: "none",
                            resize: "none",
                            fontFamily: "inherit",
                          }}
                        />
                      </div>
                    </div>

                    {/* GRÁFICO 2 DE BARRAS DUAL-AXIS (EJE Y1 EN COLUMNA & Y2 EN PUNTO) */}
                    <div style={{ background: "#ffffff", padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", marginBottom: "12px", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
                      {/* Controles de Selección de Métricas y Ordenación para Gráfico 2 (no print) */}
                      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px", background: "#f8fafc", padding: "6px 10px", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <h3 style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", margin: 0, textTransform: "uppercase" }}>
                            📊 Gráfico 2
                          </h3>
                          {/* Filtro de Ordenación Gráfico 2 */}
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>Ordenar:</span>
                            <select
                              value={chart2SortMode}
                              onChange={(e) => handleChart2SortModeChange(e.target.value as any)}
                              style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600 }}
                            >
                              <option value="posicion">Por Posición Táctica</option>
                              <option value="alfabetico">Alfabéticamente (A-Z)</option>
                              <option value="valor">Por Valor Mayor (↓)</option>
                            </select>
                            {chart2SortMode === "valor" && (
                              <select
                                value={chart2SortMetric}
                                onChange={(e) => handleChart2SortMetricChange(e.target.value)}
                                style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600 }}
                              >
                                {renderGpsMetricOptions(chart2SortMetric)}
                              </select>
                            )}
                          </div>
                        </div>

                        {/* Filtros de Métricas Gráfico 2 */}
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", width: "100%" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginLeft: "auto" }} className="no-print">
                            <Link
                              href="/ajustes"
                              title="Configurar variables favoritas en Ajustes > GPS"
                              style={{ fontSize: "11px", color: "#64748b", textDecoration: "none" }}
                            >
                              ⚙️
                            </Link>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#0284c7" }} />
                            <span style={{ fontSize: "11px", fontWeight: 600, color: "#0284c7" }}>Columna (Y):</span>
                            <select
                              value={chart2LeftMetric}
                              onChange={(e) => {
                              const val = e.target.value;
                              setChart2LeftMetric(val);
                              if (typeof window !== "undefined") localStorage.setItem("gps_equipo_chart2_left_metric", val);
                            }}
                              style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600 }}
                            >
                              {renderGpsMetricOptions(chart2LeftMetric)}
                            </select>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#dc2626" }} />
                            <span style={{ fontSize: "11px", fontWeight: 600, color: "#dc2626" }}>Punto (Y2):</span>
                            <select
                              value={chart2RightMetric}
                              onChange={(e) => {
                              const val = e.target.value;
                              setChart2RightMetric(val);
                              if (typeof window !== "undefined") localStorage.setItem("gps_equipo_chart2_right_metric", val);
                            }}
                              style={{ padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 600 }}
                            >
                              {renderGpsMetricOptions(chart2RightMetric)}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Título en Versión Imprimible */}
                      <div className="print-only gps-chart-legend" style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a", marginTop: "2px", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.02em", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span>GRÁFICO 2:</span>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", background: "#0284c7", flexShrink: 0 }} />
                          <span style={{ color: "#0284c7", fontWeight: 800 }}>{m2Left.label} (Columna)</span>
                        </div>
                        <span style={{ color: "#64748b" }}>vs.</span>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#dc2626", flexShrink: 0 }} />
                          <span style={{ color: "#dc2626", fontWeight: 800 }}>{m2Right.label} (Punto)</span>
                        </div>
                      </div>

                      {/* Render Recharts ComposedChart Dual-Axis */}
                      <div style={{ width: "100%", height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chart2Data} margin={{ top: 16, right: 0, left: 0, bottom: 25 }} barCategoryGap="2%">
                            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                            <XAxis
                              dataKey="name"
                              stroke="#0f172a"
                              interval={0}
                              tick={{ fontSize: 8.5, fontWeight: 600, fill: "#0f172a" }}
                              angle={-35}
                              textAnchor="end"
                            />
                            <YAxis yAxisId="left" orientation="left" stroke="#0284c7" tick={{ fontSize: 8.5, fontWeight: 500, fill: "#0284c7" }} />
                            <YAxis yAxisId="right" orientation="right" stroke="#dc2626" tick={{ fontSize: 8.5, fontWeight: 500, fill: "#dc2626" }} />
                            <Tooltip contentStyle={{ borderRadius: "6px", fontSize: "11px", fontWeight: 500 }} />
                            {/* Variable 1 (Y): Representada en Columna (Barra azul claro brillante con valor en blanco) */}
                            <Bar yAxisId="left" dataKey="Y1" name={m2Left.label} fill="#0284c7" radius={[3, 3, 0, 0]} barSize={24}>
                              <LabelList dataKey="Y1" position="insideBottom" dy={-4} style={{ fontSize: "7.5px", fontWeight: 500, fill: "#ffffff" }} formatter={(val: any) => typeof val === "number" ? (val > 100 ? Math.round(val) : val) : val} />
                            </Bar>
                            {/* Variable 2 (Y2): Representada en Punto rojo (Scatter/Dot) sobre la barra */}
                            <Scatter yAxisId="right" dataKey="Y2" name={m2Right.label} fill="#dc2626" shape="circle">
                              <LabelList dataKey="Y2" position="top" style={{ fontSize: "8px", fontWeight: 500, fill: "#dc2626" }} formatter={(val: any) => typeof val === "number" ? (val > 100 ? Math.round(val) : val) : val} />
                            </Scatter>
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Campo Limpio de Comentario debajo del Gráfico 2 */}
                      <div style={{ marginTop: "4px" }}>
                        <textarea
                          value={chart2Comment}
                          onChange={(e) => setChart2Comment(e.target.value)}
                          placeholder="Añadir comentario explicativo para el Gráfico 2..."
                          rows={1}
                          style={{
                            width: "100%",
                            padding: "4px 8px",
                            border: "none",
                            borderLeft: "3px solid #0284c7",
                            background: "#f8fafc",
                            fontSize: "11px",
                            fontWeight: 500,
                            color: "#0f172a",
                            outline: "none",
                            resize: "none",
                            fontFamily: "inherit",
                          }}
                        />
                      </div>
                    </div>

                    {/* TABLA DE RENDIMIENTO GPS POR JUGADOR (EJE Y: VARIABLES, EJE X: JUGADORES QUE HAN PARTICIPADO) */}
                    <div className="team-gps-table-card" style={{ background: "#ffffff", padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", marginTop: "12px", boxShadow: "0 1px 4px rgba(0,0,0,0.03)", pageBreakInside: "avoid" }}>
                      {/* Cabecera de la tabla con título y selector interactivo de métricas */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <h3 style={{ fontSize: "12.5px", fontWeight: 800, color: "#0f172a", margin: 0, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                            📋 Resumen de Variables GPS por Jugador
                          </h3>
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "#0284c7", background: "#e0f2fe", padding: "1px 6px", borderRadius: "10px" }}>
                            {participatingPlayers.length} Jugadores
                          </span>
                        </div>

                        {/* Selector interactivo de métricas, ordenación y escala de azul suave (no-print) */}
                        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          {/* Selector de ordenación de la tabla */}
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#475569" }}>Ordenar:</span>
                            <select
                              value={tableSortMode}
                              onChange={(e) => handleTableSortModeChange(e.target.value as any)}
                              style={{
                                padding: "2px 6px",
                                borderRadius: "4px",
                                border: "1px solid #cbd5e1",
                                fontSize: "10px",
                                fontWeight: 700,
                                background: "#ffffff",
                                color: "#0f172a",
                                outline: "none",
                                cursor: "pointer",
                              }}
                            >
                              <option value="habitual">Orden habitual</option>
                              <option value="posicion">Por Posición Táctica</option>
                              <option value="mayor">Mayor a menor (↓)</option>
                              <option value="menor">Menor a mayor (↑)</option>
                            </select>
                          </div>

                          {/* Leyenda visual de la escala de azul suave */}
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#475569" }}>Escala:</span>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "#f8fafc", padding: "2px 7px", borderRadius: "5px", border: "1px solid #cbd5e1" }}>
                              <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 700 }}>Clarito</span>
                              <div style={{ width: "42px", height: "8px", borderRadius: "3px", background: "linear-gradient(to right, rgb(246, 250, 254), rgb(160, 205, 250))", border: "0.5px solid #cbd5e1" }} />
                              <span style={{ fontSize: "9px", color: "#1e3a8a", fontWeight: 800 }}>Azul suave</span>
                            </div>
                          </div>

                                                    {/* Selector de variables GPS */}
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginRight: "4px" }}>
                              <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#64748b" }}>Variables:</span>
                              <button
                                type="button"
                                onClick={() => {
                                  handleTableMetricsChange(favoriteKeys.filter((k) => k !== "HSR Abs (m)").slice(0, 5));
                                }}
                                title="Cargar automáticamente tus variables favoritas configuradas en Ajustes"
                                style={{
                                  fontSize: "9.5px",
                                  fontWeight: 800,
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  border: "1px solid #bfdbfe",
                                  background: "#eff6ff",
                                  color: "#1e3a8a",
                                  cursor: "pointer",
                                }}
                              >
                                ⭐ Cargar Favoritas
                              </button>
                            </div>
                            {favoriteVariables.filter((m) => m.key !== "HSR Abs (m)").map((m) => {
                              const filteredList = tableMetrics.filter((k) => favoriteKeys.includes(k) && k !== "HSR Abs (m)");
                              const isSelected = filteredList.includes(m.key);
                              return (
                                <button
                                  key={m.key}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      if (filteredList.length > 1) {
                                        handleTableMetricsChange(filteredList.filter((k) => k !== m.key));
                                      }
                                    } else {
                                      if (filteredList.length < 6) {
                                        handleTableMetricsChange([...filteredList, m.key]);
                                      }
                                    }
                                  }}
                                  style={{
                                    fontSize: "9.5px",
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    border: isSelected ? "1px solid #0284c7" : "1px solid #cbd5e1",
                                    background: isSelected ? "#0284c7" : "#ffffff",
                                    color: isSelected ? "#ffffff" : "#475569",
                                    cursor: "pointer",
                                  }}
                                >
                                  {m.shortLabel || m.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Tabla responsiva: Eje Y = Jugadores que han participado, Eje X = Variables GPS con escala de azul suave */}
                      {(() => {
                        // Estadísticas para cada métrica (columna): valor mínimo, máximo y promedio
                        const metricStats = activeTableMetricsList.reduce<Record<string, { min: number; max: number; avg: number }>>((acc, m) => {
                          const vals = participatingPlayers.map((j) => getEquipoVal(j, m.key));
                          const min = vals.length > 0 ? Math.min(...vals) : 0;
                          const max = vals.length > 0 ? Math.max(...vals) : 0;
                          const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                          acc[m.key] = { min, max, avg };
                          return acc;
                        }, {});

                        return (
                          <div className="team-gps-table-container" style={{ overflowX: "auto", width: "100%", WebkitOverflowScrolling: "touch", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                            <table className="team-gps-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "center" }}>
                              <thead>
                                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1" }}>
                                  {/* Columna 1 (Sticky): Jugador (sin columna de posición) */}
                                  <th style={{
                                    position: "sticky",
                                    left: 0,
                                    background: "#f8fafc",
                                    zIndex: 3,
                                    textAlign: "left",
                                    padding: "7px 12px",
                                    fontSize: "11px",
                                    fontWeight: 800,
                                    color: "#0f172a",
                                    borderRight: "2px solid #cbd5e1",
                                    whiteSpace: "nowrap",
                                    minWidth: "160px",
                                  }}>
                                    JUGADOR
                                  </th>

                                  {/* Columnas Eje X: Variables GPS */}
                                  {activeTableMetricsList.map((m, colIdx) => {
                                    const isSortedByThis = effectiveTableSortMetric === m.key;
                                    return (
                                      <th
                                        key={m.key}
                                        onClick={() => {
                                          if (effectiveTableSortMetric === m.key && tableSortMode === "mayor") {
                                            handleTableSortModeChange("menor");
                                          } else {
                                            setTableSortMetric(m.key);
                                            handleTableSortModeChange("mayor");
                                          }
                                        }}
                                        title={`Ordenar por ${m.label} (${isSortedByThis && tableSortMode === "mayor" ? "Menor a mayor" : "Mayor a menor"})`}
                                        style={{
                                          padding: "7px 10px",
                                          fontSize: "10.5px",
                                          fontWeight: 800,
                                          color: isSortedByThis ? "#0284c7" : "#1e3a8a",
                                          borderRight: colIdx === activeTableMetricsList.length - 1 ? "none" : "1px solid #e2e8f0",
                                          whiteSpace: "nowrap",
                                          background: isSortedByThis ? "#f0f9ff" : "#f8fafc",
                                          cursor: "pointer",
                                          userSelect: "none",
                                        }}
                                      >
                                        <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                                          <span style={{
                                            width: "6px",
                                            height: "6px",
                                            borderRadius: "50%",
                                            background: colIdx === 0 ? "#0284c7" : colIdx === 1 ? "#dc2626" : colIdx === 2 ? "#16a34a" : colIdx === 3 ? "#9333ea" : "#ea580c",
                                          }} />
                                          <span>{getHeaderTitle(m)}</span>
                                          {isSortedByThis && (
                                            <span style={{ fontSize: "10px", fontWeight: 900, color: "#0284c7" }}>
                                              {tableSortMode === "mayor" ? " ↓" : tableSortMode === "menor" ? " ↑" : ""}
                                            </span>
                                          )}
                                        </div>
                                      </th>
                                    );
                                  })}
                                </tr>
                              </thead>

                              <tbody>
                                {/* Filas Eje Y: Cada jugador que ha participado */}
                                {participatingPlayers.map((j) => {
                                  const displayName = j.apodo && j.apodo.trim() ? j.apodo.trim() : (j.nombre || "Jugador").trim().split(" ")[0];
                                  const isSim = isPlayerSimInDate(j.id);
                                  const nameDisplay = isSim ? `${displayName}*` : displayName;

                                  return (
                                    <tr key={j.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                                      {/* Celda 1 (Sticky): Nombre del jugador */}
                                      <td style={{
                                        position: "sticky",
                                        left: 0,
                                        background: "#ffffff",
                                        zIndex: 2,
                                        textAlign: "left",
                                        padding: "6px 12px",
                                        fontSize: "11px",
                                        fontWeight: 700,
                                        color: "#0f172a",
                                        borderRight: "2px solid #cbd5e1",
                                        whiteSpace: "nowrap",
                                      }}>
                                        <span style={{ textTransform: "uppercase", fontWeight: 700, color: isSim ? "#b45309" : "#0f172a" }}>{nameDisplay}</span>
                                      </td>

                                      {/* Celdas Variables GPS con escala de azul suave */}
                                      {activeTableMetricsList.map((metric, colIdx) => {
                                        const val = getEquipoVal(j, metric.key);
                                        const { min, max } = metricStats[metric.key] || { min: 0, max: 0 };
                                        const isMax = val === max && val > 0 && participatingPlayers.length > 1;

                                        let formattedText = "";
                                        if (metric.key === "MAX Speed(km/h)") {
                                          formattedText = val.toFixed(1);
                                        } else if (metric.key === "Distance(m)" || metric.key === "HSR Abs (m)" || metric.key === "Player Load") {
                                          formattedText = Math.round(val).toLocaleString("es-ES");
                                        } else {
                                          formattedText = Math.round(val).toString();
                                        }

                                        const heat = getMetricHeatmapColor(val, min, max);

                                        return (
                                          <td
                                            key={metric.key}
                                            style={{
                                              padding: "6px 10px",
                                              fontSize: "10.5px",
                                              fontWeight: isMax ? 800 : heat.fontWeight,
                                              color: heat.color,
                                              background: heat.bg,
                                              borderRight: colIdx === activeTableMetricsList.length - 1 ? "none" : "1px solid #e2e8f0",
                                              textAlign: "center",
                                              transition: "background 0.2s ease",
                                            }}
                                            title={`${displayName}: ${formattedText} ${metric.unit}`}
                                          >
                                            {formattedText}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}

                                {/* Fila Final: Media del Equipo */}
                                <tr style={{ background: "#fff7ed", borderTop: "2px solid #cbd5e1", fontWeight: 900 }}>
                                  {/* Columna Sticky: Etiqueta Media Equipo */}
                                  <td style={{
                                    position: "sticky",
                                    left: 0,
                                    background: "#fff7ed",
                                    zIndex: 2,
                                    textAlign: "left",
                                    padding: "7px 12px",
                                    fontSize: "11px",
                                    fontWeight: 900,
                                    color: "#c2410c",
                                    borderRight: "2px solid #cbd5e1",
                                    whiteSpace: "nowrap",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.02em",
                                  }}>
                                    MEDIA EQUIPO
                                  </td>

                                  {/* Valores promedio de cada columna */}
                                  {activeTableMetricsList.map((metric, colIdx) => {
                                    const { avg } = metricStats[metric.key] || { avg: 0 };
                                    const formattedAvg = metric.key === "MAX Speed(km/h)"
                                      ? avg.toFixed(1)
                                      : Math.round(avg).toLocaleString("es-ES");

                                    return (
                                      <td
                                        key={metric.key}
                                        style={{
                                          padding: "7px 10px",
                                          fontSize: "11px",
                                          fontWeight: 900,
                                          color: "#c2410c",
                                          borderRight: colIdx === activeTableMetricsList.length - 1 ? "none" : "1px solid #fed7aa",
                                          whiteSpace: "nowrap",
                                          background: "#fff7ed",
                                        }}
                                      >
                                        {formattedAvg}
                                      </td>
                                    );
                                  })}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}

{/* Campo Limpio de Comentario debajo de la Tabla */}
                      <div style={{ marginTop: "6px" }}>
                        <textarea
                          value={tableComment}
                          onChange={(e) => setTableComment(e.target.value)}
                          placeholder="Añadir comentario explicativo para la tabla de variables..."
                          rows={1}
                          style={{
                            width: "100%",
                            padding: "4px 8px",
                            border: "none",
                            borderLeft: "3px solid #0284c7",
                            background: "#f8fafc",
                            fontSize: "11px",
                            fontWeight: 500,
                            color: "#0f172a",
                            outline: "none",
                            resize: "none",
                            fontFamily: "inherit",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          </>
        )}
            <style jsx global>{`
        @media print {
          .general-report-card.has-following-report {
            page-break-after: always !important;
          }
          .completo-player-header-hide {
            display: none !important;
          }
          .completo-report-separator {
            display: block !important;
            height: 12px !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            clear: both !important;
          }
          .completo-second-header {
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            text-align: center !important;
            margin-top: 8px !important;
            margin-bottom: 8px !important;
            padding-bottom: 4px !important;
          }
          .completo-player-report-wrapper {
            page-break-inside: avoid !important;
            page-break-after: avoid !important;
          }
          .completo-player-report-wrapper .general-report-card {
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            margin-bottom: 0 !important;
            padding-bottom: 4px !important;
            border: none !important;
          }
          .gps-chart-legend {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            margin-top: 14px !important;
            padding-bottom: 2px !important;
          }
          .gps-chart-legend span {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .completo-player-report-wrapper .gps-header-card {
            margin-bottom: 6px !important;
            padding: 4px 8px !important;
            page-break-inside: avoid !important;
          }
          .completo-player-report-wrapper .gps-chart-card {
            padding: 10px 12px 14px 12px !important;
            margin-bottom: 8px !important;
            page-break-inside: avoid !important;
          }
          .completo-player-report-wrapper div[style*="marginBottom: 16px"],
          .completo-player-report-wrapper div[style*="marginBottom: 14px"] {
            margin-bottom: 6px !important;
          }
          .completo-player-report-wrapper section {
            padding: 6px 10px !important;
            page-break-inside: avoid !important;
          }
          .team-gps-table-card {
            page-break-inside: avoid !important;
            margin-top: 10px !important;
          }
          .team-gps-table-container {
            overflow: visible !important;
          }
          .team-gps-table {
            font-size: 7.5px !important;
            width: 100% !important;
          }
          .team-gps-table th,
          .team-gps-table td {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            padding: 2px 3px !important;
          }
        }
      `}</style>
      </main>
    );
}

export default function InformeGpsDiarioPage() {
  return (
    <Suspense fallback={<div style={{ padding: "40px", textAlign: "center" }}>Cargando informe...</div>}>
      <InformeGpsDiarioContent />
    </Suspense>
  );
}
