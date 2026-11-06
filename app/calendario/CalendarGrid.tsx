"use client";

import { pruneStaleFutureLocalStorage } from "@/app/lib/cleanStorage";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { updateSesionDia, batchUpdateSesionesDia, saveFullPlanificacionBBDD, updateEstadoDiarioJugador, fetchLiveWellnessSheet, updateFullBBDDRow, addLesion, forceBackupSyncDataLocal, getEventosBloquesBBDD, saveClubConfig, upsertSingleRivalBBDD, getRivalesBBDD, saveSingleBloqueBBDD, getPlayerEventsBBDD, updatePlayerEventAssignmentBBDD, savePlayerEventAssignments, savePlayerCommentBBDD, deletePlayerCommentBBDD, syncWellnessCommentsBatchBBDD } from "../actions";
import { getDisponibilidadInfo, CODIGOS_MANUALES, normalizeDisponibilidadCodigo } from "@/app/lib/disponibilidad";
import LesionControlModal, { LesionFormData } from "./LesionControlModal";
import { findRivalEscudoUrl, getStoredRivales, saveStoredRivales, RivalConfig, syncRivalesFromBBDD } from "@/app/lib/rivales";
import { comparePlayersByTacticalPosition } from "@/app/lib/posiciones";
import { useClubConfig } from "@/app/lib/useClubConfig";
import { findMatchingJugador as findMatchingJugadorLib, extractPlayerNameFromRow } from "@/app/lib/playerMatching";


export type SesionDia = {
  id: string;
  fecha: string;
  equipo?: string | null;
  temporada?: string | null;
  periodo: string | null;
  subperiodo: string | null;
  semana: number | null;
  md: string | null;
  rival: string | null;
  evento: string | null;
  evento_am?: string | null;
  evento_pm?: string | null;
  evento_1: string | null;
  evento_2: string | null;
  evento_3: string | null;
  evento_4: string | null;
  evento_5: string | null;
  evento_6: string | null;
  carga: number | null;
  volumen: number | null;
  intensidad: number | null;
  comentario_microciclo: string | null;
  resultado_partido?: string | null;
  competicion?: string | null;
};

export type TipoComentarioCodigo = "FIS" | "CON" | "TEC" | "PSI" | "WEL" | "OTR";

export type ComentarioJugadorDia = {
  id: string;
  jugador_id: string;
  day_id: string;
  fecha: string;
  tipo: TipoComentarioCodigo;
  texto: string;
};

const TIPOS_COMENTARIO = [
  { codigo: "FIS" as const, nombre: "Fisioterapia", color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
  { codigo: "CON" as const, nombre: "Condicional", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  { codigo: "TEC" as const, nombre: "Técnico", color: "#2563eb", bg: "#eff6ff", border: "#93c5fd" },
  { codigo: "PSI" as const, nombre: "Psicológico", color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd" },
  { codigo: "WEL" as const, nombre: "Wellness", color: "#059669", bg: "#ecfdf5", border: "#6ee7b7" },
  { codigo: "OTR" as const, nombre: "Otros", color: "#475569", bg: "#f8fafc", border: "#cbd5e1" },
];

export function normalizeCommentText(txt?: string | null): string {
  if (!txt) return "";
  return txt
    .replace(/^["']|["']$/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function deduplicateComentarios(
  list: ComentarioJugadorDia[],
  dayDateMap?: Map<string, string>
): ComentarioJugadorDia[] {
  if (!Array.isArray(list) || list.length === 0) return [];

  const resolveFecha = (c: ComentarioJugadorDia): string => {
    if (c.fecha && c.fecha.trim()) return c.fecha.trim();
    if (c.day_id) {
      if (dayDateMap && dayDateMap.has(c.day_id)) {
        return dayDateMap.get(c.day_id)!;
      }
      return String(c.day_id).replace(/^d_/, "").trim();
    }
    return "";
  };

  const welTextSet = new Set<string>();
  list.forEach((c) => {
    if (!c || c.tipo !== "WEL" || !c.texto) return;
    const f = resolveFecha(c);
    const norm = normalizeCommentText(c.texto).toLowerCase();
    if (f && norm) {
      welTextSet.add(`${c.jugador_id}_${f}_${norm}`);
    }
  });

  const map = new Map<string, ComentarioJugadorDia>();

  list.forEach((c) => {
    if (!c || !c.texto) return;
    // Descartar comentarios inventados o generados automáticamente
    if (c.id && (c.id.startsWith("pitch_team_") || c.id.startsWith("tasks_team_") || c.id.includes("_obj_"))) return;
    if (c.texto.startsWith("(ACT:") || c.texto.startsWith("ACT:")) return;
    const norm = normalizeCommentText(c.texto);
    if (!norm) return;

    const f = resolveFecha(c);
    const normLower = norm.toLowerCase();

    // Descartar comentarios CON si duplican el texto de un comentario WEL
    if (c.tipo === "CON" && f && welTextSet.has(`${c.jugador_id}_${f}_${normLower}`)) {
      return;
    }

    let key: string;
    if (c.tipo === "WEL") {
      // REGLA ESTRICTA: como máximo UN solo comentario wellness por jugador y fecha
      key = `wel_${c.jugador_id}_${f || c.day_id || "nodate"}`;
    } else {
      key = `${c.jugador_id}_${f || c.day_id || "nodate"}_${c.tipo}_${normLower}`;
    }

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...c,
        fecha: f || c.fecha,
        texto: norm,
        id: c.tipo === "WEL" ? key : (c.id || key),
      });
    } else {
      if (c.tipo === "WEL") {
        const existingNorm = normalizeCommentText(existing.texto);
        if (norm.length >= existingNorm.length) {
          map.set(key, {
            ...c,
            fecha: f || c.fecha || existing.fecha,
            texto: norm,
            id: key,
          });
        }
      }
    }
  });

  return Array.from(map.values());
}

export type TipoEvento = {
  codigo: string;
  texto: string;
  color: string;
};

export type TipoEventoConfig = {
  codigo: string;
  nombre: string;
  color: string;
  bg: string;
  border: string;
};

export type JugadorItem = {
  id: string;
  nombre: string;
  apodo?: string | null;
  posicion?: string | null;
  dorsal?: string | number | null;
  cor_id?: string | null;
  foto_url?: string | null;
};

export const DEFAULT_TIPOS_EVENTO_CONFIG: TipoEventoConfig[] = [
  { codigo: "E", nombre: "Entrenamiento (E)", color: "#166534", bg: "#bbf7d0", border: "#86efac" },
  { codigo: "Co", nombre: "Coadyuvante (Co)", color: "#713f12", bg: "#fde047", border: "#eab308" },
  { codigo: "Op", nombre: "Optimizador (Op)", color: "#1e3a8a", bg: "#93c5fd", border: "#60a5fa" },
  { codigo: "Pa", nombre: "Partido (Pa)", color: "#881337", bg: "#fecdd3", border: "#fda4af" },
  { codigo: "PAL", nombre: "Partido Local (PAL)", color: "#881337", bg: "#fecdd3", border: "#fda4af" },
  { codigo: "PAV", nombre: "Partido Visitante (PAV)", color: "#881337", bg: "#fecdd3", border: "#fda4af" },
  { codigo: "PL", nombre: "Partido Local (PL)", color: "#881337", bg: "#fecdd3", border: "#fda4af" },
  { codigo: "PV", nombre: "Partido Visitante (PV)", color: "#881337", bg: "#fecdd3", border: "#fda4af" },
  { codigo: "Vi", nombre: "Viaje (Vi)", color: "#ffffff", bg: "#475569", border: "#334155" },
  { codigo: "VD", nombre: "Video (VD)", color: "#713f12", bg: "#fef08a", border: "#fde047" },
  { codigo: "Red", nombre: "Readaptación (Red)", color: "#713f12", bg: "#fef9c3", border: "#fef08a" },
  { codigo: "Ot", nombre: "Otros (Ot)", color: "#1e293b", bg: "#e2e8f0", border: "#cbd5e1" },
  { codigo: "Va", nombre: "Valoraciones (Va)", color: "#7c2d12", bg: "#ffedd5", border: "#fed7aa" },
  { codigo: "Cop", nombre: "Coadyuvante Opcional (Cop)", color: "#ffffff", bg: "#d97706", border: "#b45309" },
  { codigo: "Oop", nombre: "Optimizador Opcional (Oop)", color: "#ffffff", bg: "#1e40af", border: "#1e3a8a" },
  { codigo: "PaAm", nombre: "Partido Amistoso (PaAm)", color: "#881337", bg: "#ffe4e6", border: "#fca5a5" },
];

export function autoCorrectEventoTipo(inputVal: string, tiposConfig: TipoEventoConfig[]): string {
  if (!inputVal) return "";
  const trimmed = inputVal.trim();
  const lower = trimmed.toLowerCase();
  const matched = tiposConfig.find((t) => t.codigo.toLowerCase() === lower);
  return matched ? matched.codigo : inputVal;
}

const EventCellInput = React.memo(function EventCellInput({
  value,
  textColor,
  tiposConfig,
  onCommit,
  onOpenPicker,
}: {
  value: string;
  textColor: string;
  tiposConfig: TipoEventoConfig[];
  onCommit: (val: string) => void;
  onOpenPicker: (rect: DOMRect) => void;
}) {
  const [localText, setLocalText] = useState(value || "");

  useEffect(() => {
    setLocalText(value || "");
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const corrected = autoCorrectEventoTipo(val, tiposConfig);
    setLocalText(corrected);
    onCommit(corrected);
  };

  const handleBlur = () => {
    const corrected = autoCorrectEventoTipo(localText, tiposConfig);
    setLocalText(corrected);
    onCommit(corrected);
  };

  return (
    <div
      style={{
        width: "100%",
        height: "26px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "relative",
        padding: "0 2px",
      }}
    >
      <input
        type="text"
        value={localText}
        onChange={handleChange}
        onBlur={handleBlur}
        onDoubleClick={(e) => {
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onOpenPicker(rect);
        }}
        placeholder=""
        style={{
          width: "calc(100% - 14px)",
          background: "transparent",
          border: "none",
          fontSize: "12px",
          fontWeight: 900,
          textAlign: "center",
          outline: "none",
          color: textColor,
        }}
      />
      <button
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onOpenPicker(rect);
        }}
        style={{
          border: "none",
          background: "none",
          cursor: "pointer",
          fontSize: "9px",
          padding: "0 2px",
          color: textColor,
          opacity: 0.6,
        }}
      >
        ▼
      </button>
    </div>
  );
});

export type EventoBloque = {
  id: string;
  day_id: string;
  fecha: string;
  slot: number;
  tipo: string;
  hora: string;
  lugar: string;
  duracion: string;
  orientacion: string;
  carga: string;
  comentario: string;
  num_jugadores: string;
  competicion?: string;
};

export function isMatchCode(code?: string | null): boolean {
  if (!code) return false;
  const c = code.trim().toUpperCase();
  return ["PL", "PV", "PA", "PAL", "PAV", "PAAM", "PARTIDO"].includes(c);
}

export function getMatchResultStatus(
  d: SesionDia,
  eventBlocksMap?: Record<string, EventoBloque>
): { status: "win" | "draw" | "loss" | null; bg: string; textColor: string } {
  const resultStr = d.resultado_partido || (d.rival ? d.rival.match(/\((\d+\s*[-:]\s*\d+)\)/)?.[1] : "");

  let isVisitante = false;
  if (d.evento && /PV|PAV|VISITANTE/i.test(d.evento)) {
    isVisitante = true;
  }
  if (eventBlocksMap) {
    for (let s = 0; s < 7; s++) {
      const key = `${d.id}_slot_${s}`;
      const ev = eventBlocksMap[key];
      if (ev && ev.tipo && /PV|PAV|VISITANTE/i.test(ev.tipo)) {
        isVisitante = true;
      }
    }
  }

  if (!resultStr || !resultStr.trim()) {
    return { status: null, bg: "#ffffff", textColor: "#0f172a" };
  }

  const match = resultStr.trim().match(/(\d+)\s*[-:]\s*(\d+)/);
  if (!match) {
    return { status: null, bg: "#ffffff", textColor: "#0f172a" };
  }

  const goalsA = parseInt(match[1], 10);
  const goalsB = parseInt(match[2], 10);

  let status: "win" | "draw" | "loss" = "draw";

  if (goalsA === goalsB) {
    status = "draw";
  } else if (isVisitante) {
    status = goalsB > goalsA ? "win" : "loss";
  } else {
    status = goalsA > goalsB ? "win" : "loss";
  }

  if (status === "win") {
    return { status: "win", bg: "#dcfce7", textColor: "#15803d" };
  } else if (status === "draw") {
    return { status: "draw", bg: "#fef9c3", textColor: "#854d0e" };
  } else {
    return { status: "loss", bg: "#fee2e2", textColor: "#b91c1c" };
  }
}

type Props = {
  initialDays: SesionDia[];
  tiposEvento: TipoEvento[];
  initialJugadores?: any[];
  initialEstados?: any[];
  initialBloques?: Record<string, any>;
  bbddPlayerAssignments?: Record<string, string>;
};

// Formato de fecha corta: "lu. 20 jul"
function formatDiaCorto(fechaISO: string): string {
  if (!fechaISO) return "";
  const dateObj = new Date(fechaISO + "T12:00:00");
  const dias = ["do.", "lu.", "ma.", "mi.", "ju.", "vi.", "sá."];
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const diaSemana = dias[dateObj.getDay()];
  const diaNum = dateObj.getDate();
  const mesNom = meses[dateObj.getMonth()];
  return `${diaSemana} ${diaNum} ${mesNom}`;
}

// Formato de Mes: "JULIO", "AGOSTO"
function formatNombreMes(fechaISO: string): string {
  if (!fechaISO) return "";
  const dateObj = new Date(fechaISO + "T12:00:00");
  const meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  return meses[dateObj.getMonth()];
}

// Etiqueta de Mes simplificada: solo Día 1, Último Día de Mes, y Jueves de cada semana
function getMesDisplayLabel(fechaISO: string): string {
  if (!fechaISO) return "";
  const dateObj = new Date(fechaISO + "T12:00:00");
  const dayOfMonth = dateObj.getDate();
  const dayOfWeek = dateObj.getDay(); // 0: dom, 1: lun, 2: mar, 3: mié, 4: jue, 5: vie, 6: sáb
  const lastDayOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();

  const isFirstDay = dayOfMonth === 1;
  const isLastDay = dayOfMonth === lastDayOfMonth;
  const isThursday = dayOfWeek === 4;

  if (isFirstDay || isLastDay || isThursday) {
    return formatNombreMes(fechaISO);
  }
  return "";
}

// Comprobar si un día se considera día de partido (por Rival o por eventos PAV, PAL, PL, PV, PA, PAAM, PARTIDO)
function isMatchDayEvent(d: SesionDia, eventBlocksMap?: Record<string, EventoBloque>): boolean {
  if (d.rival && d.rival.trim().length > 0) return true;

  const eventValues = [
    d.evento,
    d.evento_am,
    d.evento_pm,
    (d as any).evento_principal,
    d.evento_1,
    d.evento_2,
    d.evento_3,
    d.evento_4,
    d.evento_5,
    d.evento_6,
  ];

  if (eventBlocksMap) {
    for (let s = 0; s < 6; s++) {
      const bKey = `${d.id}_slot_${s}`;
      const bKeyFecha = `${d.fecha}_slot_${s}`;
      const block = eventBlocksMap[bKey] || eventBlocksMap[bKeyFecha];
      if (block && block.tipo) {
        eventValues.push(block.tipo);
      }
    }
  }

  const matchCodes = ["PAV", "PAL", "PL", "PV", "PA", "PAAM", "PARTIDO"];

  return eventValues.some((val) => {
    if (!val) return false;
    const norm = val.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!norm) return false;

    return matchCodes.some((code) => norm === code || norm.startsWith(code) || norm.includes(` ${code}`));
  });
}

// Recálculo automático de MD según la fila de Rival y los eventos de partido (PAV, PAL, PL, PV, Pa)
function recalculateMDForDays(daysList: SesionDia[], eventBlocksMap?: Record<string, EventoBloque>): SesionDia[] {
  const sorted = [...daysList].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const matchIndices: number[] = [];

  sorted.forEach((d, idx) => {
    if (isMatchDayEvent(d, eventBlocksMap)) {
      matchIndices.push(idx);
    }
  });

  return sorted.map((d, idx) => {
    // Keep all valid events preserved across the season
    const isMatch = isMatchDayEvent(d, eventBlocksMap);

    let res = d.resultado_partido;
    if (!res && d.rival) {
      const matchScore = d.rival.match(/\((\d+\s*[-:]\s*\d+)\)/);
      if (matchScore && matchScore[1]) {
        res = matchScore[1].replace(":", "-").trim();
      }
    }

    // Si el propio día es un día de partido (Rival o Eventos PAV/PAL/PL/PV)
    if (isMatch) {
      return { ...d, md: "MD", resultado_partido: res || d.resultado_partido || null };
    }

    if (matchIndices.length === 0) {
      return { ...d, md: null, resultado_partido: res || d.resultado_partido || null };
    }

    // Buscar partido previo y siguiente
    const nextMatchIdx = matchIndices.find((mIdx) => mIdx > idx);
    const prevMatchIdx = [...matchIndices].slice().reverse().find((mIdx) => mIdx < idx);

    if (nextMatchIdx !== undefined && prevMatchIdx !== undefined) {
      const distNext = nextMatchIdx - idx;
      const distPrev = idx - prevMatchIdx;

      // La MD+1 siempre se prioriza sobre el partido siguiente
      if (distPrev === 1) {
        return { ...d, md: "+1 MD", resultado_partido: res || d.resultado_partido || null };
      }

      // Priorizar -4 MD (y -1, -2, -3 MD) sobre +3 MD (+3, +4, etc.)
      if (distNext <= 4 || distNext <= distPrev || (distNext === 5 && distPrev >= 3)) {
        const diff = -distNext;
        if (diff < -5) {
          return { ...d, md: ">-5 MD", resultado_partido: res || d.resultado_partido || null };
        }
        return { ...d, md: `${diff} MD`, resultado_partido: res || d.resultado_partido || null };
      } else {
        const diff = distPrev;
        return { ...d, md: `+${diff} MD`, resultado_partido: res || d.resultado_partido || null };
      }
    } else if (nextMatchIdx !== undefined) {
      const diff = idx - nextMatchIdx; // negativo (-1 MD, -2 MD, etc.)
      if (diff < -5) {
        return { ...d, md: ">-5 MD", resultado_partido: res || d.resultado_partido || null };
      }
      return { ...d, md: `${diff} MD`, resultado_partido: res || d.resultado_partido || null };
    } else if (prevMatchIdx !== undefined) {
      const diff = idx - prevMatchIdx; // positivo (+1 MD, +2 MD, etc.)
      if (diff > 3) {
        return { ...d, md: null, resultado_partido: res || d.resultado_partido || null };
      }
      return { ...d, md: `+${diff} MD`, resultado_partido: res || d.resultado_partido || null };
    }

    return { ...d, md: null, resultado_partido: res || d.resultado_partido || null };
  });
}

// Agrupador de días consecutivos idénticos para fusionar en una sola celda (colSpan)
function groupConsecutiveDays(
  daysList: SesionDia[],
  fieldKey: keyof SesionDia
): { day: SesionDia; colSpan: number; isStart: boolean; originalIndex: number }[] {
  const result: { day: SesionDia; colSpan: number; isStart: boolean; originalIndex: number }[] = [];
  let i = 0;

  while (i < daysList.length) {
    const rawVal = daysList[i][fieldKey];
    const val = rawVal ? String(rawVal).trim() : "";
    let span = 1;

    // Solo fusionar si no está vacío
    if (val !== "") {
      while (
        i + span < daysList.length &&
        (daysList[i + span][fieldKey] ? String(daysList[i + span][fieldKey]).trim() : "") === val
      ) {
        span++;
      }
    }

    result.push({ day: daysList[i], colSpan: span, isStart: true, originalIndex: i });
    for (let s = 1; s < span; s++) {
      result.push({ day: daysList[i + s], colSpan: 0, isStart: false, originalIndex: i + s });
    }

    i += span;
  }

  return result;
}

// Cálculo automático dinámico de Nº Semana (Semana 1 = Lunes del primer microciclo con datos reales de la temporada)
export function getSemana1StartDate(daysList: SesionDia[]): string {
  if (!daysList || daysList.length === 0) return "";
  const sorted = [...daysList].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const firstDataDay = sorted.find((d) => {
    const hasEv = d.evento && d.evento.trim() !== "" && d.evento !== "—";
    const hasCarga = d.carga !== null && d.carga !== undefined;
    const hasVol = d.volumen !== null && d.volumen !== undefined;
    const hasInt = d.intensidad !== null && d.intensidad !== undefined;
    const hasRiv = d.rival && d.rival.trim() !== "";
    return hasEv || hasCarga || hasVol || hasInt || hasRiv;
  });
  const targetDateStr = firstDataDay ? firstDataDay.fecha : sorted[0].fecha;
  if (!targetDateStr) return "";

  // Alinear al lunes de esa primera semana para que cada microciclo completo (Lunes a Domingo) pertenezca a la misma semana
  const d = new Date(targetDateStr + "T12:00:00");
  const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function calculateDynamicWeekNumber(fechaISO: string, semana1StartDate: string): number {
  if (!fechaISO || !semana1StartDate) return 1;
  const baseDate = new Date(semana1StartDate + "T12:00:00");
  const targetDate = new Date(fechaISO + "T12:00:00");

  const diffMs = targetDate.getTime() - baseDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays >= 0) {
    return Math.floor(diffDays / 7) + 1;
  } else {
    return Math.floor(diffDays / 7) + 1;
  }
}

// Agrupador para la fila Nº Semana (Fusión visual por bloques de 7 días / número único centrado)
function groupConsecutiveWeeks(
  daysList: SesionDia[],
  semana1StartDate: string,
  allDays?: SesionDia[]
): { day: SesionDia; weekNum: number; colSpan: number; isStart: boolean; originalIndex: number }[] {
  const result: { day: SesionDia; weekNum: number; colSpan: number; isStart: boolean; originalIndex: number }[] = [];
  let i = 0;

  const getWeekForDay = (d: SesionDia) => {
    if (allDays && allDays.length > 0) {
      const isSeason2 = (d.equipo || "").toLowerCase().includes("europa") || (d.equipo || "").toLowerCase().includes("manresa") || d.fecha >= "2026-07-01";
      const seasonDays = allDays.filter((x) =>
        isSeason2
          ? (x.equipo || "").toLowerCase().includes("europa") || (x.equipo || "").toLowerCase().includes("manresa") || x.fecha >= "2026-07-01"
          : (x.equipo || "").toLowerCase().includes("prat") || x.fecha < "2026-07-01"
      );
      const seasonStart = getSemana1StartDate(seasonDays.length > 0 ? seasonDays : allDays);
      return calculateDynamicWeekNumber(d.fecha, seasonStart || semana1StartDate);
    }
    return calculateDynamicWeekNumber(d.fecha, semana1StartDate);
  };

  while (i < daysList.length) {
    const weekNum = getWeekForDay(daysList[i]);
    let span = 1;

    while (
      i + span < daysList.length &&
      getWeekForDay(daysList[i + span]) === weekNum
    ) {
      span++;
    }

    result.push({ day: daysList[i], weekNum, colSpan: span, isStart: true, originalIndex: i });
    for (let s = 1; s < span; s++) {
      result.push({ day: daysList[i + s], weekNum, colSpan: 0, isStart: false, originalIndex: i + s });
    }

    i += span;
  }

  return result;
}

export function CalendarGrid({

  
 initialDays, tiposEvento, initialJugadores = [], initialEstados = [], initialBloques = {}, bbddPlayerAssignments = {} }: Props) {

  useEffect(() => {
    try {
      ["planificacion_days_v1", "planificacion_days_v2", "planificacion_days_v3", "planificacion_days_v4", "planificacion_days_v5"].forEach((keyName) => {
        const d = localStorage.getItem(keyName);
        if (d) {
          const arr = JSON.parse(d);
          if (Array.isArray(arr)) {
            const seen = new Set();
            const dedup = [];
            for (const item of arr) {
              if (item && item.fecha) {
                if (!seen.has(item.fecha)) {
                  seen.add(item.fecha);
                  dedup.push(item);
                }
              }
            }
            if (dedup.length !== arr.length) {
              localStorage.setItem(keyName, JSON.stringify(dedup));
            }
          }
        }
      });
    } catch(e) {}
  }, []);

    const isMountedStorage = React.useRef(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    isMountedStorage.current = true;
    setTimeout(() => {
      setIsHydrated(true);
    }, 0);
  }, []);

  // Auto-hidratación externa eliminada: no sobreescribir datos del usuario

  const clubConfig = useClubConfig();
  const [activeTeam, setActiveTeam] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const savedTeam = localStorage.getItem("active_team");
        if (savedTeam && !savedTeam.toLowerCase().includes("manresa")) return savedTeam;
        const confRaw = localStorage.getItem("custom_club_config");
        if (confRaw) {
          const conf = JSON.parse(confRaw);
          if (conf.nombreClub) return conf.nombreClub;
        }
      } catch {}
    }
    return "CE Europa";
  });

  useEffect(() => {
    if (clubConfig?.nombreClub) {
      setActiveTeam(clubConfig.nombreClub);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("active_team", clubConfig.nombreClub);
        } catch {}
      }
    }
  }, [clubConfig]);

  const isPlayerOfTeam = (j: any, teamKey: string) => {
    if (!j) return false;
    if (teamKey === "todos") return true;
    const eq = (j.equipo || "").trim().toLowerCase();
    const tk = teamKey.trim().toLowerCase();
    if (!eq) return true; // Si el deportista no tiene equipo asignado en BBDD, pertenece a la plantilla activa
    if (eq === tk || eq.includes(tk) || tk.includes(eq)) return true;
    if (j.activo === false) return false;
    if (tk.includes("europa") || teamKey === "CE Europa" || teamKey === "CE EUROPA" || teamKey === "2026/27") {
      return eq.includes("europa") || j.temporada === "2026/27";
    }
    if (tk.includes("prat") || teamKey === "AE Prat" || teamKey === "2025/26") {
      return eq.includes("prat") || j.temporada === "2025/26";
    }
    if (tk.includes("manresa") || teamKey === "CE Manresa") {
      return eq.includes("manresa");
    }
    return false;
  };

  useEffect(() => {
    const handleSync = () => {
      const savedTeam = localStorage.getItem("active_team");
      if (savedTeam && savedTeam !== activeTeam) {
        setActiveTeam(savedTeam);
      }
    };
    window.addEventListener("storage", handleSync);
    window.addEventListener("focus", handleSync);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("focus", handleSync);
    };
  }, [activeTeam]);

  // Lista de deportistas activos filtrados por club (con fallback para nunca quedar vacía)
  const jugadoresList = React.useMemo(() => {
    const list = (initialJugadores || []).filter((j) => isPlayerOfTeam(j, activeTeam));
    if (list.length > 0) return list;
    return initialJugadores || [];
  }, [initialJugadores, activeTeam]);

  // Mapa local de estados de disponibilidad de deportistas: "jugadorId_sesionDiaId" -> disponibilidad
  const [estadosMap, setEstadosMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("disponibilidad_map_v1");
        if (saved) Object.assign(map, JSON.parse(saved));
      } catch (e) {}
    }
    const dayDateMap = new Map<string, string>();
    (initialDays || []).forEach((d) => {
      if (d.id && d.fecha) dayDateMap.set(d.id, d.fecha);
    });

    (initialEstados || []).forEach((s) => {
      if (s.jugador_id && s.sesion_dia_id && s.disponibilidad) {
        const norm = normalizeDisponibilidadCodigo(s.disponibilidad);
        if (norm) {
          map[`${s.jugador_id}_${s.sesion_dia_id}`] = norm;
          const fecha = dayDateMap.get(s.sesion_dia_id);
          if (fecha) map[`${s.jugador_id}_${fecha}`] = norm;
        }
      }
    });

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("disponibilidad_map_v1", JSON.stringify(map));
      } catch (e) {}
    }
    return map;
  });

  useEffect(() => {
    if (Array.isArray(initialEstados) && initialEstados.length > 0) {
      const dayDateMap = new Map<string, string>();
      (initialDays || []).forEach((d) => {
        if (d.id && d.fecha) dayDateMap.set(d.id, d.fecha);
      });

      setEstadosMap((prev) => {
        const next = { ...prev };
        initialEstados.forEach((s) => {
          if (s.jugador_id && s.sesion_dia_id && s.disponibilidad) {
            const norm = normalizeDisponibilidadCodigo(s.disponibilidad);
            if (norm) {
              next[`${s.jugador_id}_${s.sesion_dia_id}`] = norm;
              const fecha = dayDateMap.get(s.sesion_dia_id);
              if (fecha) next[`${s.jugador_id}_${fecha}`] = norm;
            }
          }
        });
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("disponibilidad_map_v1", JSON.stringify(next));
          } catch (e) {}
        }
        return next;
      });
    }
  }, [initialEstados, initialDays]);

  // Modal de control de lesión (se abre al cambiar a NDL / NDR tras D)
  const [pendingLesionModal, setPendingLesionModal] = useState<{
    jugador: any;
    sesionDia: any;
    codigo: "NDL" | "NDR" | "L";
    ultimoDiaDisponible?: string;
  } | null>(null);

  const handlePlayerDisponibilidadUpdate = async (jugadorId: string, sesionDiaId: string, value: string) => {
    const key = `${jugadorId}_${sesionDiaId}`;
    const previousVal = estadosMap[key] || "D";
    const targetDia = days.find((d) => d.id === sesionDiaId);
    setEstadosMap((prev) => {
      const next = { ...prev, [key]: value };
      if (targetDia?.fecha) next[`${jugadorId}_${targetDia.fecha}`] = value;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("disponibilidad_map_v1", JSON.stringify(next));
          window.dispatchEvent(new CustomEvent("disponibilidad_updated"));
        } catch (e) {}
      }
      return next;
    });
    try {
      await updateEstadoDiarioJugador(jugadorId, sesionDiaId, value || null);
    } catch (err) {
      console.error("Error al actualizar disponibilidad:", err);
    }

    // Detectar si pasa a NDL o NDR (o L) y venía de D (o vacío/DCS/DS/P)
    const isInjury = value === "NDL" || value === "NDR" || value === "L";
    const wasAvailable = !previousVal || previousVal === "D" || previousVal === "DCS" || previousVal === "DS" || previousVal === "P";

    if (isInjury && wasAvailable) {
      const targetJugador = jugadoresList.find((j) => j.id === jugadorId);
      const targetDiaIndex = days.findIndex((d) => d.id === sesionDiaId);
      const targetDia = days[targetDiaIndex];

      // Buscar hacia atrás en el calendario el último día en que estuvo Disponible (D)
      let ultimoDiaD = "";
      if (targetDiaIndex > 0) {
        for (let i = targetDiaIndex - 1; i >= 0; i--) {
          const pastDay = days[i];
          const pastVal = estadosMap[`${jugadorId}_${pastDay.id}`];
          if (!pastVal || pastVal === "D" || pastVal === "DCS" || pastVal === "DS" || pastVal === "P") {
            ultimoDiaD = pastDay.fecha;
            break;
          }
        }
      }

      // Si no se encontró en los días previos de la vista, usar el día anterior a la sesión
      if (!ultimoDiaD && targetDia?.fecha) {
        const prevD = new Date(targetDia.fecha);
        prevD.setDate(prevD.getDate() - 1);
        ultimoDiaD = prevD.toISOString().split("T")[0];
      }

      if (targetJugador && targetDia) {
        setPendingLesionModal({
          jugador: targetJugador,
          sesionDia: targetDia,
          codigo: value as "NDL" | "NDR" | "L",
          ultimoDiaDisponible: ultimoDiaD || targetDia.fecha,
        });
      }
    }
  };

  const handleSaveLesionControl = async (data: LesionFormData) => {
    try {
      // 1. Guardar en registro detallado de lesiones en localStorage
      const rawRecords = localStorage.getItem("lesiones_registro_detallado_v1");
      let list: LesionFormData[] = rawRecords ? JSON.parse(rawRecords) : [];
      list = list.filter((item) => !(item.jugador_id === data.jugador_id && item.fecha === data.fecha));
      list.unshift(data);
      try {
        localStorage.setItem("lesiones_registro_detallado_v1", JSON.stringify(list));
      } catch (e) {
        console.warn("LocalStorage lleno, ignorando guardado local de lesiones.");
      }

      // 2. Guardar en comentarios_jugadores_v2 (tipo FIS)
      const comText = data.comentario
        ? `${data.region_corporal} (${data.tejido}) - ${data.comentario}`
        : `${data.region_corporal} (${data.tejido}) - ${data.gravedad}`;

      const rawCom = localStorage.getItem("comentarios_jugadores_v2");
      let comArr: any[] = rawCom ? JSON.parse(rawCom) : [];
      comArr = comArr.filter((c) => !(c.jugador_id === data.jugador_id && (c.fecha === data.fecha || c.day_id === data.sesion_dia_id) && c.tipo === "FIS"));
      comArr.push({
        jugador_id: data.jugador_id,
        fecha: data.fecha,
        day_id: data.sesion_dia_id,
        tipo: "FIS",
        texto: comText,
      });
      try {
        localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(comArr));
      } catch (e) {
        console.warn("LocalStorage lleno, ignorando guardado local de comentarios.");
      }

      // 3. Sincronizar con Supabase lesiones
      await addLesion(data.jugador_id, {
        fecha_inicio: data.fecha,
        tipo: data.tipo_disponibilidad,
        zona: data.region_corporal,
        gravedad: data.gravedad,
        comentario: data.comentario,
      });
    } catch (e) {
      console.error("Error al guardar registro de lesión:", e);
    }
    setPendingLesionModal(null);
  };

  // Estado para la ordenación de deportistas: "dorsal" | "posicion" | "alfabetico"
  const [sortOrder, setSortOrder] = useState<"dorsal" | "posicion" | "alfabetico">((): "dorsal" | "posicion" | "alfabetico" => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("calendar_sort_order_v1");
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return "posicion";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_sort_order_v1", JSON.stringify(sortOrder));
      } catch (e) {}
    }
  }, [sortOrder]);

  const getPositionRank = (pos: string | null | undefined): number => {
    if (!pos) return 99;
    const p = pos.toUpperCase();
    if (p.includes("PORT")) return 1;
    if (p.includes("LATERAL")) return 2;
    if (p.includes("CENTRAL")) return 3;
    if (p.includes("PIVOTE") || p.includes("MEDIO")) return 4;
    if (p.includes("INTERIOR")) return 5;
    if (p.includes("EXTREMO")) return 6;
    if (p.includes("DELANTER")) return 7;
    return 10;
  };

  const sortedJugadores = React.useMemo(() => {
    return [...jugadoresList].sort((a, b) => {
      if (sortOrder === "dorsal") {
        const da = Number(a.dorsal || a.cor_id || 999);
        const db = Number(b.dorsal || b.cor_id || 999);
        if (da !== db) return da - db;
        return (a.apodo || a.nombre).localeCompare(b.apodo || b.nombre);
      }
      if (sortOrder === "posicion") {
        return comparePlayersByTacticalPosition(a, b);
      }
      // Alfabetico
      return (a.apodo || a.nombre).localeCompare(b.apodo || b.nombre);
    });
  }, [jugadoresList, sortOrder]);

  // Filtro de texto de deportistas y ocultar/mostrar individuales
  const [playerFilterText, setPlayerFilterText] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("calendar_player_filter_text_v1") || "";
      } catch (e) {}
    }
    return "";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_player_filter_text_v1", playerFilterText);
      } catch (e) {}
    }
  }, [playerFilterText, isHydrated]);

  const [highlightedPlayers, setHighlightedPlayers] = useState<Record<string, boolean>>({});
  const [hiddenPlayerIds, setHiddenPlayerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("calendar_hidden_player_ids_v1");
        if (saved) {
          setHiddenPlayerIds(new Set(JSON.parse(saved)));
        }
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (isHydrated && typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_hidden_player_ids_v1", JSON.stringify(Array.from(hiddenPlayerIds)));
      } catch (e) {}
    }
  }, [hiddenPlayerIds, isHydrated]);

  const [showPlayerVisibilityPopover, setShowPlayerVisibilityPopover] = useState<boolean>(false);
  const [showDisponibilidad, setShowDisponibilidad] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("calendar_show_disponibilidad_v1");
        if (saved !== null) return JSON.parse(saved);
      } catch (e) {}
    }
    return true;
  });

  const [showComentarios, setShowComentarios] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("calendar_show_comentarios_v1");
        if (saved !== null) return JSON.parse(saved);
      } catch (e) {}
    }
    return true;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_show_disponibilidad_v1", JSON.stringify(showDisponibilidad));
      } catch (e) {}
    }
  }, [showDisponibilidad]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_show_comentarios_v1", JSON.stringify(showComentarios));
      } catch (e) {}
    }
  }, [showComentarios]);

  const [filterCommentType, setFilterCommentType] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("calendar_filter_comment_type_v1") || "TODOS";
      } catch (e) {}
    }
    return "TODOS";
  });

  useEffect(() => {
    if (isHydrated && typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_filter_comment_type_v1", filterCommentType);
      } catch (e) {}
    }
  }, [filterCommentType, isHydrated]);

  // Estado de filtros mediante tres puntitos (···) en las celdas fijas
  const [showCommentsFilterPopover, setShowCommentsFilterPopover] = useState(false);
  const [showEventsFilterPopover, setShowEventsFilterPopover] = useState(false);

  const [comentarios, setComentarios] = useState<ComentarioJugadorDia[]>([]);

  // Cargar comentarios desde localStorage solo en el cliente (para evitar sobrescritura por hidratación SSR)
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("comentarios_jugadores_v2");
        let list: ComentarioJugadorDia[] = saved ? JSON.parse(saved) : [];

        // Limpieza de duplicados residuales en cliente entre CON y WEL
        const welKeys = new Set(
          list
            .filter((c) => c && c.tipo === "WEL" && c.texto)
            .map((c) => `${c.jugador_id}_${c.fecha || c.day_id}_${c.texto.trim()}`)
        );
        list = list.filter((c) => {
          if (c && c.tipo === "CON" && c.texto) {
            const key = `${c.jugador_id}_${c.fecha || c.day_id}_${c.texto.trim()}`;
            if (welKeys.has(key)) return false;
          }
          return true;
        });

        // Purgar de forma estricta cualquier comentario sintético o generado (solo comentarios del usuario o wellness)
        list = list.filter((c) => {
          if (!c || !c.texto) return false;
          if (c.id && (c.id.startsWith("pitch_team_") || c.id.startsWith("tasks_team_") || c.id.includes("_obj_"))) return false;
          if (c.texto.startsWith("(ACT:") || c.texto.startsWith("ACT:")) return false;
          return true;
        });
        list = deduplicateComentarios(list);
        if (list.length > 0) {
          setComentarios(prev => {
            const merged = deduplicateComentarios([...prev, ...list]);
            try {
              localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(merged));
            } catch (e) {}
            return merged;
          });
        }
      } catch (e) {
        console.error("Error leyendo comentarios:", e);
      }
    }
  }, []);

  // Escuchar actualizaciones de comentarios en tiempo real desde /eventos u otras pestañas
  useEffect(() => {
    const handleSyncComentarios = () => {
      try {
        const saved = localStorage.getItem("comentarios_jugadores_v2");
        if (saved) {
          const list: ComentarioJugadorDia[] = JSON.parse(saved);
          if (Array.isArray(list)) {
            setComentarios((prev) => deduplicateComentarios([...prev, ...list]));
          }
        }
      } catch (e) {}
    };

    window.addEventListener("comentarios_updated", handleSyncComentarios);
    window.addEventListener("storage", handleSyncComentarios);
    return () => {
      window.removeEventListener("comentarios_updated", handleSyncComentarios);
      window.removeEventListener("storage", handleSyncComentarios);
    };
  }, []);

  // Hidratar comentarios desde initialEstados si vienen de Supabase (BBDD)
  useEffect(() => {
    if ((Array.isArray(initialEstados) && initialEstados.length > 0) || (Array.isArray(initialDays) && initialDays.length > 0)) {
      setComentarios((prev) => {
        const map = new Map<string, ComentarioJugadorDia>();
        const dayDateMap = new Map<string, string>();
        (initialDays || []).forEach((d) => {
          if (d.id && d.fecha) dayDateMap.set(d.id, d.fecha);
        });

        // Mantener comentarios locales previos sin colisión
        prev.forEach((c) => {
          const key = c.id || `${c.jugador_id}_${c.day_id || c.fecha}_${c.tipo}_${c.texto}`;
          map.set(key, c);
        });

        initialEstados.forEach((est: any) => {
          if (!est.jugador_id || !est.sesion_dia_id) return;
          const fechaISO = dayDateMap.get(est.sesion_dia_id) || est.sesion_dia_id;

          const parseAndAdd = (textoVal: string | null | undefined, tipoCod: TipoComentarioCodigo, prefix: string) => {
            if (!textoVal || !textoVal.trim()) return;
            const lines = textoVal.split("\n").map((l: string) => l.trim()).filter(Boolean);
            lines.forEach((lineText: string, idx: number) => {
              const cleanLine = normalizeCommentText(lineText);
              if (!cleanLine) return;

              if (tipoCod === "WEL") {
                const welKey = `wel_${est.jugador_id}_${fechaISO}`;
                // Si ya existe algún comentario WEL para este deportista y fecha, no añadir otro
                const hasWel = Array.from(map.values()).some(
                  (existing) =>
                    existing.tipo === "WEL" &&
                    existing.jugador_id === est.jugador_id &&
                    (existing.day_id === est.sesion_dia_id || existing.fecha === fechaISO)
                );
                if (!hasWel) {
                  map.set(welKey, {
                    id: welKey,
                    jugador_id: est.jugador_id,
                    day_id: est.sesion_dia_id,
                    fecha: fechaISO,
                    tipo: "WEL",
                    texto: cleanLine,
                  });
                }
                return;
              }

              const key = `db_${prefix}_${est.jugador_id}_${est.sesion_dia_id}_${idx}`;
              const alreadyExists = Array.from(map.values()).some(
                (existing) =>
                  existing.jugador_id === est.jugador_id &&
                  (existing.day_id === est.sesion_dia_id || existing.fecha === fechaISO) &&
                  existing.tipo === tipoCod &&
                  normalizeCommentText(existing.texto).toLowerCase() === cleanLine.toLowerCase()
              );
              if (!alreadyExists) {
                map.set(key, {
                  id: key,
                  jugador_id: est.jugador_id,
                  day_id: est.sesion_dia_id,
                  fecha: fechaISO,
                  tipo: tipoCod,
                  texto: cleanLine,
                });
              }
            });
          };

          const condicionalText = est.comentario_fisico || est.comentario_preparacion_fisica;
          const wellnessText = est.comentario_wellness;

          // Separación estricta de bloques: Condicional (CON) vs Wellness (WEL)
          if (condicionalText && condicionalText.trim() !== (wellnessText || "").trim()) {
            parseAndAdd(condicionalText, "CON", "con");
          }
          parseAndAdd(est.comentario_tecnico || est.comentario_tecnico_tactico, "TEC", "tec");
          // No convertir objetivos en comentarios inventados
          parseAndAdd(est.comentario_lesiones || est.comentario_fisioterapia, "FIS", "fis");
          if (wellnessText) {
            parseAndAdd(wellnessText, "WEL", "wel");
          }
          parseAndAdd(est.comentario_medico, "OTR", "med");
          parseAndAdd(est.comentario_nutricion, "OTR", "nut");
        });

        // Extraer comentarios de TEAM desde initialDays (sesiones_dia)
        (initialDays || []).forEach((d: any) => {
          if (!d.id || !d.fecha) return;
          const fechaISO = d.fecha;
          
          const parseAndAddTeam = (textoVal: string | null | undefined, tipoCod: TipoComentarioCodigo, prefix: string) => {
            if (!textoVal || !textoVal.trim()) return;
            const lines = textoVal.split("\n").map((l: string) => l.trim()).filter(Boolean);
            lines.forEach((lineText: string, idx: number) => {
              const key = `db_${prefix}_TEAM_${d.id}_${idx}`;
              const alreadyExists = Array.from(map.values()).some(
                (existing) =>
                  existing.jugador_id === "TEAM" &&
                  (existing.day_id === d.id || existing.fecha === fechaISO) &&
                  existing.tipo === tipoCod &&
                  existing.texto === lineText
              );
              if (!alreadyExists) {
                map.set(key, {
                  id: key,
                  jugador_id: "TEAM",
                  day_id: d.id,
                  fecha: fechaISO,
                  tipo: tipoCod,
                  texto: lineText,
                });
              }
            });
          };

          parseAndAddTeam(d.comentario_tecnico, "TEC", "tec");
          parseAndAddTeam(d.comentario_fisico, "CON", "con");
        });

        const merged = deduplicateComentarios(Array.from(map.values()), dayDateMap);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(merged));
          } catch (e) {}
        }
        return merged;
      });
    }
  }, [initialEstados, initialDays]);

  useEffect(() => {
    if (isHydrated && typeof window !== "undefined") {
      try {
        localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(comentarios));
      } catch (e) {
        console.warn("Error guardando comentarios (posible límite de cuota):", e);
      }
    }
  }, [comentarios, isHydrated]);

  // Modales de comentarios
  const [addComentarioTarget, setAddComentarioTarget] = useState<{
    jugador_id: string;
    day_id: string;
    fecha: string;
    jugadorNombre: string;
  } | null>(null);

  const [newComentarioTipo, setNewComentarioTipo] = useState<TipoComentarioCodigo>("FIS");
  const [newComentarioTexto, setNewComentarioTexto] = useState<string>("");

  const [deleteComentarioTarget, setDeleteComentarioTarget] = useState<(ComentarioJugadorDia & { jugadorNombre?: string }) | null>(null);

  const normalizeDateStr = (dateStr: string): string => {
    if (!dateStr) return "";
    const clean = dateStr.trim().split(" ")[0].split("T")[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

    const partsSlash = clean.split("/");
    if (partsSlash.length === 3) {
      const d = partsSlash[0].padStart(2, "0");
      const m = partsSlash[1].padStart(2, "0");
      const y = partsSlash[2].length === 2 ? `20${partsSlash[2]}` : partsSlash[2];
      return `${y}-${m}-${d}`;
    }

    const partsDash = clean.split("-");
    if (partsDash.length === 3 && partsDash[0].length <= 2) {
      const d = partsDash[0].padStart(2, "0");
      const m = partsDash[1].padStart(2, "0");
      const y = partsDash[2].length === 2 ? `20${partsDash[2]}` : partsDash[2];
      return `${y}-${m}-${d}`;
    }

    return clean;
  };

  const findMatchingJugadorInGrid = (sheetNameRaw: string, jugadores: JugadorItem[]): JugadorItem | null => {
    return findMatchingJugadorLib(sheetNameRaw, jugadores, jugadores);
  };

  const [wellnessSyncState, setWellnessSyncState] = useState<{
    status: "idle" | "syncing" | "success" | "error";
    message: string;
    count: number;
  }>({ status: "idle", message: "", count: 0 });
  const [showWellnessConfigModal, setShowWellnessConfigModal] = useState<boolean>(false);
  const DEFAULT_WELLNESS_URL = "https://docs.google.com/spreadsheets/d/1JQXKfCrGCxom-N-RM-6nbDqQ0asnL_le0Z4EOwFc5Ds/edit?resourcekey=&gid=432486581#gid=432486581";

  const [customWellnessUrl, setCustomWellnessUrl] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("wellness_sheet_url_v2") || DEFAULT_WELLNESS_URL;
    }
    return DEFAULT_WELLNESS_URL;
  });

  const extractRecordDateISO = (rec: Record<string, any>): string => {
    if (!rec) return "";
    const explicitDate = rec["1. FECHA"] || rec["Fecha"] || rec["FECHA"] || rec["fecha"] || rec["_colB"] || rec["_col1"];
    if (explicitDate && typeof explicitDate === "string") {
      const iso = normalizeDateStr(explicitDate.split("T")[0]);
      if (iso) return iso;
    }
    if (rec.created_at && typeof rec.created_at === "string") {
      const iso = normalizeDateStr(rec.created_at.split("T")[0]);
      if (iso) return iso;
    }
    const keys = Object.keys(rec);
    const rawA = rec["_colA"] || rec["_col0"] || (keys.length > 0 ? rec[keys[0]] : null) || rec["Marca temporal"] || rec["Timestamp"] || "";
    let iso = normalizeDateStr(String(rawA).split("T")[0]);
    if (iso) return iso;
    const rawB = rec["_colB"] || rec["_col1"] || (keys.length > 1 ? rec[keys[1]] : "");
    iso = normalizeDateStr(String(rawB).split("T")[0]);
    if (iso) return iso;
    return "";
  };

  const extractRecordPlayerName = (rec: Record<string, any>): string => {
    if (!rec) return "";
    const keys = Object.keys(rec);
    // Columna C (_colC, _col2, keys[2]) es la principal para Jugadores
    const explicit = rec["_colC"] || rec["_col2"] || (keys.length > 2 ? rec[keys[2]] : null) || rec["jugadora_nombre"] || rec["Jugadora"] || rec["Jugador"] || rec["_colB"] || rec["Nombre"] || rec["Nombre y Apellidos"] || rec["Apellidos y Nombre"];
    if (explicit && typeof explicit === "string" && !/^\d{1,4}[\/\-\.]\d{1,4}/.test(explicit.trim())) {
      return explicit.trim();
    }
    for (let i = 0; i < Math.min(keys.length, 4); i++) {
      const val = rec[keys[i]];
      if (typeof val === "string" && val.trim().length > 1 && !normalizeDateStr(val)) {
        return val.trim();
      }
    }
    return "";
  };

  const getStrictWellnessComment = (rec: Record<string, any>): string => {
    if (!rec) return "";
    const keys = Object.keys(rec);
    let rawText = "";

    // Columna H (_colH, _col7, keys[7]) es la principal para Comentarios
    if (rec["_colH"] !== undefined && rec["_colH"] !== null) {
      rawText = String(rec["_colH"]).trim();
    } else if (rec["_col7"] !== undefined && rec["_col7"] !== null) {
      rawText = String(rec["_col7"]).trim();
    } else if (keys.length > 7 && rec[keys[7]] !== undefined && rec[keys[7]] !== null) {
      rawText = String(rec[keys[7]]).trim();
    }

    if (!rawText && rec.comentario !== undefined && rec.comentario !== null) {
      rawText = String(rec.comentario).trim();
    }
    if (!rawText && rec.payload && typeof rec.payload === "object") {
      rawText = String(rec.payload["Comentarios"] || rec.payload["comentario"] || rec.payload["Observaciones"] || "").trim();
    }
    if (!rawText) {
      const exactCommentKey = keys.find((k) => {
        const kNorm = k.toLowerCase().trim();
        return !k.startsWith("_col") && k !== "_id" && k !== "id" && (kNorm === "comentarios" || kNorm === "comentario" || kNorm === "observaciones" || kNorm === "notas");
      });
      if (exactCommentKey && rec[exactCommentKey] !== undefined && rec[exactCommentKey] !== null) {
        rawText = String(rec[exactCommentKey]).trim();
      }
    }
    if (!rawText) return "";
    if (/^\d+$/.test(rawText)) return "";
    const lower = rawText.toLowerCase();
    if (
      lower === "—" ||
      lower === "-" ||
      lower === "null" ||
      lower === "undefined" ||
      lower === "n/a" ||
      lower === "ninguno" ||
      lower === "ninguna" ||
      lower === "no" ||
      lower === "sin molestias" ||
      lower === "ninguna molestia" ||
      lower === "ok"
    ) {
      return "";
    }
    return rawText;
  };

  // Sincronización automática en tiempo real con Google Sheets y Webhook de Microsoft Forms/Supabase para Comentarios Wellness
  const syncWellnessComments = async () => {
    try {
      const urlToUse = customWellnessUrl || DEFAULT_WELLNESS_URL;
      
      let allRecords: any[] = [];
      let sheetErrMessage = "";

      try {
        const res = await fetchLiveWellnessSheet(urlToUse);
        if (res.success && Array.isArray(res.data)) {
          allRecords = [...res.data];
        } else if (res.error) {
          sheetErrMessage = res.error;
        }
      } catch (e) {
        sheetErrMessage = "Error cargando Google Sheets";
      }

      try {
        const apiRes = await fetch("/api/wellness/webhook");
        if (apiRes.ok) {
          const apiJson = await apiRes.json();
          if (apiJson?.success && Array.isArray(apiJson.data)) {
            allRecords = [...allRecords, ...apiJson.data];
          }
        }
      } catch (e) {
        // ignora
      }

      if (allRecords.length === 0 && sheetErrMessage) {
        setWellnessSyncState({
          status: "error",
          message: sheetErrMessage,
          count: 0,
        });
        return;
      }

      // Deduplicar newWelComments asegurando estrictamente 1 por jugador y fecha
      const uniqueWelMap = new Map<string, ComentarioJugadorDia>();

      allRecords.forEach((rec) => {
        const fechaISO = extractRecordDateISO(rec);
        const nombreRaw = extractPlayerNameFromRow(rec) || extractRecordPlayerName(rec);
        let comentarioTexto = getStrictWellnessComment(rec);

        if (!comentarioTexto || !fechaISO || !nombreRaw) return;
        comentarioTexto = normalizeCommentText(comentarioTexto);
        if (!comentarioTexto) return;

        const matchingPlayer = findMatchingJugadorInGrid(nombreRaw, jugadoresList);

        if (matchingPlayer) {
          const commentId = `wel_${matchingPlayer.id}_${fechaISO}`;
          uniqueWelMap.set(commentId, {
            id: commentId,
            jugador_id: matchingPlayer.id,
            day_id: `d_${fechaISO}`,
            fecha: fechaISO,
            tipo: "WEL",
            texto: comentarioTexto,
          });
        }
      });

      const newWelComments = Array.from(uniqueWelMap.values());

      if (newWelComments.length > 0) {
        setComentarios((prev) => {
          const merged = deduplicateComentarios([...prev, ...newWelComments]);
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(merged));
            } catch (e) {}
          }
          return merged;
        });

        // Persistir en Supabase Cloud BBDD (estado_diario_jugador)
        syncWellnessCommentsBatchBBDD(
          newWelComments.map((wc) => ({
            jugadorId: wc.jugador_id,
            fecha: wc.fecha,
            texto: wc.texto,
          }))
        ).catch((err) => {
          console.error("Error persistiendo comentarios wellness en BBDD:", err);
        });
      }

      setWellnessSyncState({
        status: "success",
        message: `${newWelComments.length} comentarios Wellness sincronizados con BBDD`,
        count: newWelComments.length,
      });
    } catch (err: any) {
      setWellnessSyncState({
        status: "error",
        message: err.message || "Error al sincronizar Wellness",
        count: 0,
      });
    }
  };

  useEffect(() => {
    const timer = setTimeout(syncWellnessComments, 2000);
    const interval = setInterval(syncWellnessComments, 120000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [jugadoresList, customWellnessUrl]);

  const filteredAndSortedJugadores = React.useMemo(() => {
    let list = sortedJugadores.filter((p) => !hiddenPlayerIds.has(p.id));
    if (playerFilterText.trim()) {
      const q = playerFilterText.trim().toLowerCase();
      list = list.filter(
        (p) =>
          (p.nombre || "").toLowerCase().includes(q) ||
          (p.apodo || "").toLowerCase().includes(q) ||
          (p.posicion || "").toLowerCase().includes(q) ||
          String(p.dorsal || "").includes(q)
      );
    }
    return list;
  }, [sortedJugadores, playerFilterText, hiddenPlayerIds]);

  // 1. Selector de vista (por defecto: Microciclo actual)
  const [viewMode, setViewMode] = useState<"microciclo" | "mesociclo" | "personalizado">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("calendar_view_mode_v1");
      if (saved === "microciclo" || saved === "mesociclo" || saved === "personalizado") return saved;
    }
    return "microciclo";
  });
  const [microcicloOffsetWeeks, setMicrocicloOffsetWeeks] = useState<number>(0);
  const [customDesde, setCustomDesde] = useState<string>("");
  const [customHasta, setCustomHasta] = useState<string>("");
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_view_mode_v1", viewMode);
      } catch (e) {}
    }
  }, [viewMode]);

  // Estado para la sección de Eventos del equipo
  const [showEventosSection, setShowEventosSection] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("calendar_show_eventos_section_v1");
        if (saved !== null) return JSON.parse(saved);
      } catch (e) {}
    }
    return true;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_show_eventos_section_v1", JSON.stringify(showEventosSection));
      } catch (e) {}
    }
  }, [showEventosSection]);
  const [filterEventoTipo, setFilterEventoTipo] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("calendar_filter_evento_tipo_v1") || "TODOS";
      } catch (e) {}
    }
    return "TODOS";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_filter_evento_tipo_v1", filterEventoTipo);
      } catch (e) {}
    }
  }, [filterEventoTipo]);

  // Tipos de Eventos configurables (Image 2 + Editable)
  const [tiposEventoConfig, setTiposEventoConfig] = useState<TipoEventoConfig[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("tipos_evento_config_v1");
        if (saved) {
          const list: TipoEventoConfig[] = JSON.parse(saved);
          return list.map((t) => {
            if (t.codigo === "Co" && (t.bg === "#fef3c7" || !t.bg)) {
              return { ...t, color: "#713f12", bg: "#fde047", border: "#eab308" };
            }
            if (t.codigo === "Op" && (t.bg === "#2563eb" || !t.bg)) {
              return { ...t, color: "#1e3a8a", bg: "#93c5fd", border: "#60a5fa" };
            }
            return t;
          });
        }
      } catch (e) {}
    }
    return DEFAULT_TIPOS_EVENTO_CONFIG;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("tipos_evento_config_v1", JSON.stringify(tiposEventoConfig));
      } catch (e) {}
    }
  }, [tiposEventoConfig]);

  // Mapa de Bloques de Eventos: Carga directa de BBDD Supabase (initialBloques)
  const [eventosBloquesMap, setEventosBloquesMap] = useState<Record<string, EventoBloque>>(() => {
    if (initialBloques && Object.keys(initialBloques).length > 0) {
      return initialBloques as Record<string, EventoBloque>;
    }
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("eventos_bloques_map_v5");
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return {};
  });

  useEffect(() => {
    if (initialBloques && Object.keys(initialBloques).length > 0) {
      setEventosBloquesMap((prev) => ({ ...prev, ...(initialBloques as Record<string, EventoBloque>) }));
    }
  }, [initialBloques]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("eventos_bloques_map_v5", JSON.stringify(eventosBloquesMap));
      } catch (e) {}
    }
  }, [eventosBloquesMap]);

  useEffect(() => {
    pruneStaleFutureLocalStorage();
    // 1. Cargar BBDD
    getEventosBloquesBBDD().then((dbData) => {
      if (dbData && Object.keys(dbData).length > 0) {
        const dateMap = new Map<string, string>();
        (initialDays || []).forEach((d) => {
          if (d.id && d.fecha) {
            dateMap.set(d.id, d.fecha);
            dateMap.set(`d_${d.id}`, d.fecha);
          }
        });
        const cleanDbData: Record<string, EventoBloque> = {};
        Object.keys(dbData).forEach(k => {
          cleanDbData[k] = dbData[k];
        });
        setEventosBloquesMap(cleanDbData);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("eventos_bloques_map_v5", JSON.stringify(cleanDbData));
          } catch (e) {}
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      if (typeof window !== "undefined") {
        try {
          const saved = localStorage.getItem("eventos_bloques_map_v5");
          if (saved) {
            const parsed = JSON.parse(saved);
            setEventosBloquesMap((prev) => {
              if (JSON.stringify(prev) !== JSON.stringify(parsed)) {
                return parsed;
              }
              return prev;
            });
          }
        } catch (e) {}
      }
    };
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  // Estado para Asignación de Eventos por Jugadora: "jugadorId_dayId" -> string de códigos (ej. "Co1, Op")
  const [playerEventsMap, setPlayerEventsMap] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("player_events_map_v1");
        if (saved) {
          const parsed = JSON.parse(saved);
          const clean: Record<string, string> = {};
          Object.keys(parsed).forEach((k) => {
            clean[k] = parsed[k];
          });
          return clean;
        }
      } catch (e) {}
    }
    return {};
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("player_events_map_v1", JSON.stringify(playerEventsMap));
      } catch (e) {}
    }
  }, [playerEventsMap]);

  // Hidratar playerEventsMap desde bbddPlayerAssignments (BBDD/CSV)
  useEffect(() => {
    if (!bbddPlayerAssignments || Object.keys(bbddPlayerAssignments).length === 0) return;

    setPlayerEventsMap((prev) => {
      const next = { ...prev };
      let changed = false;

      Object.entries(bbddPlayerAssignments).forEach(([key, eventCodes]) => {
        if (eventCodes && typeof eventCodes === "string" && eventCodes.trim() !== "") {
          if (next[key] !== eventCodes) {
            next[key] = eventCodes;
            changed = true;
          }
        }
      });

      if (changed) {
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("player_events_map_v1", JSON.stringify(next));
          } catch (e) {}
        }
        return next;
      }
      return prev;
    });
  }, [bbddPlayerAssignments]);

  useEffect(() => {
    const fetchFreshAssignments = () => {
      getPlayerEventsBBDD()
        .then((dbAssignments) => {
          if (dbAssignments && Object.keys(dbAssignments).length > 0) {
            setPlayerEventsMap((prev) => {
              const next = { ...prev, ...dbAssignments };
              if (typeof window !== "undefined") {
                try {
                  localStorage.setItem("player_events_map_v1", JSON.stringify(next));
                } catch (e) {}
              }
              return next;
            });
          }
        })
        .catch(() => {});
    };

    fetchFreshAssignments();

    const syncPlayerEvents = () => {
      if (typeof window !== "undefined") {
        try {
          const saved = localStorage.getItem("player_events_map_v1");
          if (saved) {
            const parsed = JSON.parse(saved);
            setPlayerEventsMap((prev) => {
              if (JSON.stringify(prev) !== JSON.stringify(parsed)) {
                return parsed;
              }
              return prev;
            });
          }
        } catch (e) {}
      }
    };
    window.addEventListener("storage", syncPlayerEvents);
    return () => {
      window.removeEventListener("storage", syncPlayerEvents);
    };
  }, []);

  const [showPlayerEventsSection, setShowPlayerEventsSection] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("calendar_show_player_events_v1");
        if (saved !== null) return JSON.parse(saved);
      } catch (e) {}
    }
    return true;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_show_player_events_v1", JSON.stringify(showPlayerEventsSection));
      } catch (e) {}
    }
  }, [showPlayerEventsSection]);

  // Modales para Eventos
  // Modales para Eventos
  useEffect(() => {
    if (typeof window !== "undefined") {
      setTimeout(() => {
        isMountedStorage.current = true;
      }, 50);
    }
  }, []);

  const [showTiposManagerModal, setShowTiposManagerModal] = useState<boolean>(false);
  const [eventoDetailModalTarget, setEventoDetailModalTarget] = useState<EventoBloque | null>(null);

  // Estado para la matriz de eventos copiados en portapapeles (Excel style 2D selection)
  const [eventClipboardMatrix, setEventClipboardMatrix] = useState<EventoBloque[][]>([]);
  const [activePickerCell, setActivePickerCell] = useState<{
    dayId: string;
    slotIdx: number;
    rowKey: string;
    rect: { top: number; left: number; width: number; height: number };
  } | null>(null);

  useEffect(() => {
    if (!activePickerCell) return;
    const handleOutsideClick = () => setActivePickerCell(null);
    const timer = setTimeout(() => {
      window.addEventListener("click", handleOutsideClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleOutsideClick);
    };
  }, [activePickerCell]);

  const copyEventRange = (minR: number, maxR: number, minD: number, maxD: number, e?: ClipboardEvent) => {
    const matrix: EventoBloque[][] = [];
    const textRows: string[] = [];

    for (let r = minR; r <= maxR; r++) {
      const rowKey = allInteractiveRows[r];
      if (rowKey && rowKey.startsWith("evento_")) {
        const slotIdx = parseInt(rowKey.replace("evento_", "")) - 1;
        const rowBlocks: EventoBloque[] = [];
        const textCols: string[] = [];

        for (let d = minD; d <= maxD; d++) {
          const day = filteredDays[d];
          if (day) {
            const key = `${day.id}_slot_${slotIdx}`;
            const exactKey = `evento_${slotIdx + 1}`;
            const tipoVal = (eventosBloquesMap[key]?.tipo) || (day as any)?.[exactKey] || "";
            const block = eventosBloquesMap[key] || {
              id: `ev_${day.id}_${slotIdx}`,
              day_id: day.id,
              fecha: day.fecha,
              slot: slotIdx,
              tipo: tipoVal,
              hora: "",
              lugar: "",
              duracion: "",
              orientacion: "",
              carga: "",
              comentario: "",
              num_jugadores: "",
            };
            rowBlocks.push({ ...block, tipo: tipoVal });
            textCols.push(tipoVal);
          }
        }
        matrix.push(rowBlocks);
        textRows.push(textCols.join("\t"));
      }
    }

    if (matrix.length > 0) {
      setEventClipboardMatrix(matrix);
      const tsvText = textRows.join("\n");
      if (e && e.clipboardData) {
        e.clipboardData.setData("text/plain", tsvText);
        e.preventDefault();
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(tsvText).catch(() => {});
      }
    }
  };

  const pasteEventRange = (startR: number, startD: number, clipboardText?: string) => {
    const newMapUpdates: Record<string, EventoBloque> = {};
    const newPlayerEventsUpdates: Record<string, string> = {};
    let updated = false;

    // 1. Matriz de portapapeles interno (copia exacta de bloque de evento + asignación de jugadores convocados)
    if (eventClipboardMatrix.length > 0) {
      eventClipboardMatrix.forEach((rowBlocks, rOffset) => {
        const targetR = startR + rOffset;
        if (targetR >= allInteractiveRows.length) return;
        const rowKey = allInteractiveRows[targetR];

        if (rowKey && rowKey.startsWith("evento_")) {
          const slotIdx = parseInt(rowKey.replace("evento_", "")) - 1;

          rowBlocks.forEach((srcBlock, cOffset) => {
            const targetD = startD + cOffset;
            if (targetD >= filteredDays.length) return;
            const targetDay = filteredDays[targetD];
            if (!targetDay) return;

            const srcDayId = srcBlock.day_id || srcBlock.fecha;
            const srcCode = srcBlock.tipo.trim();

            const targetKey = `${targetDay.id}_slot_${slotIdx}`;
            const correctedVal = autoCorrectEventoTipo(srcBlock.tipo, tiposEventoConfig);
            const pastedBlock: EventoBloque = {
              ...srcBlock,
              id: `ev_${targetDay.id}_${slotIdx}`,
              day_id: targetDay.id,
              fecha: targetDay.fecha,
              slot: slotIdx,
              tipo: correctedVal,
            };

            newMapUpdates[targetKey] = pastedBlock;
            updated = true;

            // COPIAR ASIGNACIÓN DE JUGADORES CONVOCADOS DESDE EL DÍA/EVENTO ORIGEN AL DÍA/EVENTO DESTINO
            if (srcCode && srcDayId) {
              jugadoresList.forEach((j) => {
                const srcKey1 = `${j.id}_${srcDayId}`;
                const srcKey2 = `${j.id}_${srcBlock.fecha}`;
                const srcAssigned = playerEventsMap[srcKey1] !== undefined ? playerEventsMap[srcKey1] : playerEventsMap[srcKey2];

                if (srcAssigned !== undefined && srcAssigned !== null && srcAssigned.trim() !== "") {
                  const codes = srcAssigned.split(",").map((c) => c.trim().toLowerCase());
                  if (codes.some((c) => c === srcCode.toLowerCase() || srcCode.toLowerCase().startsWith(c))) {
                    // El jugador está convocado en el evento origen -> Copiar asignación al día de destino
                    const targetPlayerKey1 = `${j.id}_${targetDay.id}`;
                    const targetPlayerKey2 = `${j.id}_${targetDay.fecha}`;

                    const existingTargetStr = newPlayerEventsUpdates[targetPlayerKey1] !== undefined
                      ? newPlayerEventsUpdates[targetPlayerKey1]
                      : playerEventsMap[targetPlayerKey1] || playerEventsMap[targetPlayerKey2] || "";

                    let targetCodes = existingTargetStr ? existingTargetStr.split(",").map((c) => c.trim()).filter(Boolean) : [];
                    if (!targetCodes.some((c) => c.toLowerCase() === correctedVal.toLowerCase())) {
                      targetCodes.push(correctedVal);
                    }

                    const mergedVal = targetCodes.join(", ");
                    newPlayerEventsUpdates[targetPlayerKey1] = mergedVal;
                    newPlayerEventsUpdates[targetPlayerKey2] = mergedVal;
                  }
                }
              });
            }

            if (slotIdx < 6) {
              const exactKey = `evento_${slotIdx + 1}` as keyof SesionDia;
              handleCellUpdate(targetDay.id, exactKey, correctedVal);
            }
          });
        }
      });
    }
    // 2. Si no hay matriz interna, pegar desde el texto del portapapeles del sistema (ej: Excel)
    else if (clipboardText && clipboardText.trim()) {
      const lines = clipboardText.replace(/\r/g, "").split("\n");
      lines.forEach((line, rOffset) => {
        if (!line && rOffset === lines.length - 1) return;
        const targetR = startR + rOffset;
        if (targetR >= allInteractiveRows.length) return;
        const rowKey = allInteractiveRows[targetR];

        // Caso A: Pegar en filas de evento general (evento_1, evento_2...)
        if (rowKey && rowKey.startsWith("evento_")) {
          const slotIdx = parseInt(rowKey.replace("evento_", "")) - 1;
          const cols = line.split("\t");
          cols.forEach((colVal, cOffset) => {
            const targetD = startD + cOffset;
            if (targetD >= filteredDays.length) return;
            const targetDay = filteredDays[targetD];
            if (!targetDay) return;

            const targetKey = `${targetDay.id}_slot_${slotIdx}`;
            const existing = eventosBloquesMap[targetKey] || {
              id: `ev_${targetDay.id}_${slotIdx}`,
              day_id: targetDay.id,
              fecha: targetDay.fecha,
              slot: slotIdx,
              tipo: "",
              hora: "",
              lugar: "",
              duracion: "",
              orientacion: "",
              carga: "",
              comentario: "",
              num_jugadores: "",
            };

            const correctedVal = autoCorrectEventoTipo(colVal, tiposEventoConfig);
            const pastedBlock: EventoBloque = {
              ...existing,
              tipo: correctedVal,
            };

            newMapUpdates[targetKey] = pastedBlock;
            updated = true;

            // COPIAR TAMBIÉN ASIGNACIÓN DE JUGADORES CONVOCADOS AL PEGAR TEXTO DE EVENTO
            const cleanSourceCode = correctedVal.trim();
            if (cleanSourceCode) {
              jugadoresList.forEach((j) => {
                let foundAssignedCode = false;
                Object.entries(playerEventsMap).forEach(([pKey, assignedStr]) => {
                  if (pKey.startsWith(`${j.id}_`) && assignedStr && assignedStr.trim() !== "") {
                    const codes = assignedStr.split(",").map((c) => c.trim().toLowerCase());
                    if (codes.some((c) => c === cleanSourceCode.toLowerCase() || cleanSourceCode.toLowerCase().startsWith(c))) {
                      foundAssignedCode = true;
                    }
                  }
                });

                if (foundAssignedCode) {
                  const targetPlayerKey1 = `${j.id}_${targetDay.id}`;
                  const targetPlayerKey2 = `${j.id}_${targetDay.fecha}`;

                  const existingTargetStr = newPlayerEventsUpdates[targetPlayerKey1] !== undefined
                    ? newPlayerEventsUpdates[targetPlayerKey1]
                    : playerEventsMap[targetPlayerKey1] || playerEventsMap[targetPlayerKey2] || "";

                  let targetCodes = existingTargetStr ? existingTargetStr.split(",").map((c) => c.trim()).filter(Boolean) : [];
                  if (!targetCodes.some((c) => c.toLowerCase() === cleanSourceCode.toLowerCase())) {
                    targetCodes.push(cleanSourceCode);
                  }

                  const mergedVal = targetCodes.join(", ");
                  newPlayerEventsUpdates[targetPlayerKey1] = mergedVal;
                  newPlayerEventsUpdates[targetPlayerKey2] = mergedVal;
                }
              });
            }

            if (slotIdx < 6) {
              const exactKey = `evento_${slotIdx + 1}` as keyof SesionDia;
              handleCellUpdate(targetDay.id, exactKey, correctedVal);
            }
          });
        }
        // Caso B: Pegar en filas de asignación individual de deportista (player_event_jugadorId)
        else if (rowKey && rowKey.startsWith("player_event_")) {
          const jugadorId = rowKey.replace("player_event_", "");
          const cols = line.split("\t");
          cols.forEach((colVal, cOffset) => {
            const targetD = startD + cOffset;
            if (targetD >= filteredDays.length) return;
            const targetDay = filteredDays[targetD];
            if (!targetDay) return;

            const key1 = `${jugadorId}_${targetDay.id}`;
            const key2 = `${jugadorId}_${targetDay.fecha}`;
            const cleanVal = colVal.trim();

            newPlayerEventsUpdates[key1] = cleanVal;
            newPlayerEventsUpdates[key2] = cleanVal;
            updated = true;
          });
        }
      });
    }

    if (updated) {
      if (Object.keys(newMapUpdates).length > 0) {
        setEventosBloquesMap((prev) => {
          const next = { ...prev, ...newMapUpdates };
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("eventos_bloques_map_v5", JSON.stringify(next));
              window.dispatchEvent(new Event("eventos_bloques_updated"));
              window.dispatchEvent(new Event("storage"));
            } catch (e) {}
          }
          return next;
        });
      }
      if (Object.keys(newPlayerEventsUpdates).length > 0) {
        setPlayerEventsMap((prev) => {
          const next = { ...prev, ...newPlayerEventsUpdates };
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("player_events_map_v1", JSON.stringify(next));
              window.dispatchEvent(new Event("player_events_updated"));
              window.dispatchEvent(new Event("storage"));
            } catch (e) {}
          }
          return next;
        });

        const rowsToSave: Array<{ jugador_id: string; fecha: string; evento_asignado: string | null }> = [];
        Object.entries(newPlayerEventsUpdates).forEach(([k, val]) => {
          const [jId, dIdOrFecha] = k.split("_");
          if (jId && dIdOrFecha) {
            const dayObj = days.find((d) => d.id === dIdOrFecha || d.fecha === dIdOrFecha);
            const fecha = dayObj?.fecha || dIdOrFecha;
            if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
              rowsToSave.push({ jugador_id: jId, fecha, evento_asignado: val || null });
            }
          }
        });
        if (rowsToSave.length > 0) {
          savePlayerEventAssignments(rowsToSave).catch(console.error);
        }
      }
    }
  };

  const [editingTipoItem, setEditingTipoItem] = useState<TipoEventoConfig | null>(null);
  const [newTipoCodigo, setNewTipoCodigo] = useState<string>("");
  const [newTipoNombre, setNewTipoNombre] = useState<string>("");
  const [newTipoColor, setNewTipoColor] = useState<string>("#78350f");
  const [newTipoBg, setNewTipoBg] = useState<string>("#fef3c7");
  const [newTipoBorder, setNewTipoBorder] = useState<string>("#fde68a");



  function isMatchCode(code: string): boolean {
    const c = (code || "").trim().toUpperCase();
    return ["PA", "PAAM", "PAL", "PAV", "PL", "PV", "CR", "CC", "PARTIDO", "PARTIDO AMISTOSO"].includes(c) || c.startsWith("PA");
  }

  const handleEventoBlockUpdate = (
    dayId: string,
    fecha: string,
    slotIdx: number,
    fieldKey: keyof EventoBloque,
    value: string
  ) => {
    const key = `${dayId}_slot_${slotIdx}`;
    const keyFecha = `${fecha}_slot_${slotIdx}`;
    setHasUnsavedChanges(true);

    let currentBlockSnapshot: EventoBloque | null = null;

    setEventosBloquesMap((prev) => {
      const existing = prev[key] || prev[keyFecha] || {
        id: `ev_${dayId}_${slotIdx}`,
        day_id: dayId,
        fecha,
        slot: slotIdx,
        tipo: "",
        hora: "",
        lugar: "",
        duracion: "",
        orientacion: "",
        carga: "",
        comentario: "",
        num_jugadores: "",
      };
      let newBlock = { ...existing, [fieldKey]: value };

      if (fieldKey === "tipo" && (!value || value.trim() === "")) {
        newBlock = {
          ...newBlock,
          tipo: "",
          hora: "",
          lugar: "",
          duracion: "",
          orientacion: "",
          carga: "",
          comentario: "",
          num_jugadores: "",
          competicion: "",
        };
      }

      // Si se asigna un evento de Partido (Pa, PA, PaAm, PL, PV, etc.), preguntar por Competición y Jornada / Fase
      if (fieldKey === "tipo" && isMatchCode(value)) {
        setTimeout(() => {
          openPaConfigModal(dayId, fecha, slotIdx);
        }, 120);
      }

      currentBlockSnapshot = newBlock;

      const updatedMap = {
        ...prev,
        [key]: newBlock,
        [keyFecha]: newBlock,
      };

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("eventos_bloques_map_v5", JSON.stringify(updatedMap));
          window.dispatchEvent(new Event("eventos_bloques_updated"));
          window.dispatchEvent(new Event("storage"));
        } catch (e) {}
      }

      return updatedMap;
    });

    // Guardado dedicado e hiperrápido de este bloque específico en Supabase (sin volcar toda la BBDD)
    const blockTimerKey = `${dayId}_${slotIdx}`;
    const existingBlockTimer = blockSaveDebounceRef.current.get(blockTimerKey);
    if (existingBlockTimer) clearTimeout(existingBlockTimer);

    blockSaveDebounceRef.current.set(
      blockTimerKey,
      setTimeout(async () => {
        try {
          let blockToSave = currentBlockSnapshot;
          if (typeof window !== "undefined") {
            try {
              const raw = localStorage.getItem("eventos_bloques_map_v5");
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed[key] || parsed[keyFecha]) {
                  blockToSave = parsed[key] || parsed[keyFecha];
                }
              }
            } catch (e) {}
          }
          if (!blockToSave) {
            blockToSave = eventosBloquesMap[key] || eventosBloquesMap[keyFecha];
          }
          if (blockToSave) {
            await saveSingleBloqueBBDD({
              dayId,
              fecha,
              slot: slotIdx,
              block: blockToSave,
            });
          }
        } catch (err: any) {
          console.error("Error guardando bloque en BBDD:", err?.message || err);
        }
      }, 500)
    );

    if (fieldKey === "tipo") {
      const oldType = (eventosBloquesMap[key]?.tipo || "").trim();
      const newType = value.trim();

      // Sincronizar slot en días si aplica
      if (slotIdx < 6) {
        const eventoKey = `evento_${slotIdx + 1}` as keyof SesionDia;
        handleCellUpdate(dayId, eventoKey, value);
      }

      // SI SE HA BORRADO EL TIPO DE EVENTO (TEXTO VACÍO), BORRAR TAMBIÉN LA ASIGNACIÓN DE ESTE EVENTO EN LOS JUGADORES
      if (oldType && !newType) {
        setPlayerEventsMap((prev) => {
          const nextMap = { ...prev };
          let changed = false;

          jugadoresList.forEach((j) => {
            const k1 = `${j.id}_${dayId}`;
            const k2 = `${j.id}_${fecha}`;

            [k1, k2].forEach((k) => {
              if (nextMap[k]) {
                const codes = nextMap[k].split(",").map((c) => c.trim()).filter(Boolean);
                const filtered = codes.filter((c) => c.toLowerCase() !== oldType.toLowerCase());
                const updatedStr = filtered.join(", ");

                if (updatedStr !== nextMap[k]) {
                  nextMap[k] = updatedStr;
                  changed = true;
                }
              }
            });
          });

          if (changed && typeof window !== "undefined") {
            try {
              localStorage.setItem("player_events_map_v1", JSON.stringify(nextMap));
              window.dispatchEvent(new Event("player_events_updated"));
              window.dispatchEvent(new Event("storage"));
            } catch (e) {}
          }
          return nextMap;
        });
      }

      if (slotIdx < 6) {
        const eventoKey = `evento_${slotIdx + 1}` as keyof SesionDia;
        handleCellUpdate(dayId, eventoKey, value);
      }
    }
  };

  // Map de colores personalizados para Subperiodo
  const [subperiodoColors, setSubperiodoColors] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("subperiodo_colors_map");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return {};
  });

  // Estado para desplazamientos de vista y congelado de contexto
  const [mesocicloOffset, setMesocicloOffset] = useState<number>(0);
  const [isContextSticky, setIsContextSticky] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("calendar_context_sticky_v1");
        if (saved !== null) return JSON.parse(saved);
      } catch (e) {}
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_context_sticky_v1", JSON.stringify(isContextSticky));
      } catch (e) {}
    }
  }, [isContextSticky]);

  // Estado para el menú desplegable flotante de Opciones (Zoom, Orden, Filtros, Jugadores, Filas, PDF)
  const [showSettingsPopover, setShowSettingsPopover] = useState<boolean>(false);

  // Estado para desplegable de filtros de filas
  const [showFilterDropdown, setShowFilterDropdown] = useState<boolean>(false);

  // Nivel de Zoom / tamaño de la rejilla (por defecto 85% para alejarse y ver más días)
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("calendar_zoom_level_v1");
        if (saved) return Number(saved);
      } catch (e) {}
    }
    return 85;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_zoom_level_v1", String(zoomLevel));
      } catch (e) {}
    }
  }, [zoomLevel]);

  // Estado para el botón de guardado masivo en BBDD (Supabase) + Respaldo Local
  const [isSavingBBDD, setIsSavingBBDD] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [pendingChangeCount, setPendingChangeCount] = useState<number>(0);
  const [saveStatusMsg, setSaveStatusMsg] = useState<string | null>(null);

  // Lista y configuración de escudos de rivales
  const [rivalesList, setRivalesList] = useState<RivalConfig[]>(() => {
    return getStoredRivales();
  });


  const [escudoModalData, setEscudoModalData] = useState<{ dayId?: string; fecha?: string; nombre: string; escudoUrl: string } | null>(null);
  const [isSavingEscudo, setIsSavingEscudo] = useState<boolean>(false);

  const handleSaveEscudoModal = async () => {
    if (!escudoModalData || !escudoModalData.nombre.trim()) {
      alert("Por favor introduce el nombre del equipo");
      return;
    }
    setIsSavingEscudo(true);
    try {
      const cleanNombre = escudoModalData.nombre.trim().toUpperCase();
      const cleanUrl = escudoModalData.escudoUrl.trim();
      const res = await upsertSingleRivalBBDD({
        nombre: cleanNombre,
        escudo_url: cleanUrl,
        escudoUrl: cleanUrl,
      });

      if (res.success) {
        const nextList = [
          ...rivalesList.filter((r) => r.nombre.toUpperCase() !== cleanNombre),
          { id: res.rival?.id || cleanNombre.toLowerCase().replace(/[^a-z0-9]/g, "-"), nombre: cleanNombre, escudoUrl: cleanUrl },
        ];
        setRivalesList(nextList);
        saveStoredRivales(nextList);

        if (escudoModalData.dayId) {
          handleCellUpdate(escudoModalData.dayId, "rival", cleanNombre);
        }
        setEscudoModalData(null);
      } else {
        alert("Error al guardar en base de datos: " + (res.error || "Desconocido"));
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsSavingEscudo(false);
    }
  };

  useEffect(() => {
    setRivalesList(getStoredRivales());
    syncRivalesFromBBDD();
    const handleRivalesSync = () => {
      setRivalesList(getStoredRivales());
    };
    window.addEventListener("rivales_updated", handleRivalesSync);
    window.addEventListener("storage", handleRivalesSync);
    return () => {
      window.removeEventListener("rivales_updated", handleRivalesSync);
      window.removeEventListener("storage", handleRivalesSync);
    };
  }, []);

  // 2. Visibilidad de filas de contexto con persistencia local
  const defaultsVisibleRows = {
    periodo: true,
    subperiodo: true,
    mes: true,
    dia: true,
    semana: true,
    md: true,
    escudo: true,
    rival: true,
    evento: true,
    evento_1: true,
    evento_2: true,
    evento_3: true,
    evento_4: true,
    evento_5: true,
    evento_6: true,
    carga: true,
    volumen: true,
    intensidad: true,
    comentario: true,
  };
  const [visibleRows, setVisibleRows] = useState(defaultsVisibleRows);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("calendar_visible_rows_v1");
        if (saved) {
          setVisibleRows((prev) => ({ ...prev, ...JSON.parse(saved) }));
        }
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (isHydrated && typeof window !== "undefined") {
      try {
        localStorage.setItem("calendar_visible_rows_v1", JSON.stringify(visibleRows));
      } catch (e) {}
    }
  }, [visibleRows, isHydrated]);

  // 3. Estado local de días: Supabase BBDD es la fuente de verdad autoritativa
  const [days, setDays] = useState<SesionDia[]>(() => {
    if (initialDays && initialDays.length > 0) {
      return recalculateMDForDays(initialDays);
    }
    return [];
  });

  useEffect(() => {
    if (initialDays && initialDays.length > 0) {
      setDays(recalculateMDForDays(initialDays));
    }
  }, [initialDays]);

  // Ref que apunta siempre al valor actual de days (para poder leerlo en beforeunload)
  const daysRef = useRef<SesionDia[]>(days);
  useEffect(() => { daysRef.current = days; }, [days]);

  // Modal interactivo para configurar Competición y Jornada / Fase al poner un evento Pa (Partido)
  type PaConfigModalData = {
    dayId: string;
    fecha: string;
    slotIdx: number;
    rival?: string;
    competicion: string;
    tipoCompeticion: "LIGA" | "COPA_REY" | "COPA_CATALUNYA" | "AMISTOSO" | "TORNEO" | "OTRA";
    jornada: string;
    fase: string;
  };

  const [paConfigModalData, setPaConfigModalData] = useState<PaConfigModalData | null>(null);

  const openPaConfigModal = useCallback((dayId: string, fecha: string, slotIdx: number) => {
    const dayObj = days.find((d) => d.id === dayId || d.fecha === fecha);
    const key = `${dayId}_slot_${slotIdx}`;
    const keyFecha = `${fecha}_slot_${slotIdx}`;
    const ev = eventosBloquesMap[key] || eventosBloquesMap[keyFecha];

    let existingJornadasMap: Record<string, number> = {};
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("partidos_jornadas_map_v1");
        if (raw) existingJornadasMap = JSON.parse(raw);
      } catch (e) {}
    }

    const savedJ = existingJornadasMap[fecha] || (dayId ? existingJornadasMap[dayId] : undefined);

    let suggestedJornada = "";
    if (savedJ) {
      suggestedJornada = String(savedJ);
    } else if (ev?.orientacion && /jornada\s*(\d+)/i.test(ev.orientacion)) {
      suggestedJornada = ev.orientacion.match(/jornada\s*(\d+)/i)?.[1] || "";
    } else {
      const allNums = Object.values(existingJornadasMap).filter((n) => typeof n === "number" && !isNaN(n));
      const maxJ = allNums.length > 0 ? Math.max(...allNums) : 0;
      suggestedJornada = String(maxJ + 1);
    }

    const existingComp = ev?.competicion || dayObj?.competicion || "";
    let tipoComp: "LIGA" | "COPA_REY" | "COPA_CATALUNYA" | "AMISTOSO" | "TORNEO" | "OTRA" = "LIGA";
    const compUpper = existingComp.toUpperCase();
    if (compUpper.includes("REY")) tipoComp = "COPA_REY";
    else if (compUpper.includes("CATALUNYA") || compUpper.includes("CATALUÑA")) tipoComp = "COPA_CATALUNYA";
    else if (compUpper.includes("AMISTOSO")) tipoComp = "AMISTOSO";
    else if (compUpper.includes("PLAYOFF") || compUpper.includes("TORNEO")) tipoComp = "TORNEO";
    else if (existingComp && !compUpper.includes("LIGA")) tipoComp = "OTRA";

    setPaConfigModalData({
      dayId,
      fecha,
      slotIdx,
      rival: dayObj?.rival || undefined,
      competicion: existingComp || "Liga",
      tipoCompeticion: tipoComp,
      jornada: suggestedJornada || "1",
      fase: ev?.orientacion && !ev.orientacion.toLowerCase().includes("jornada") ? ev.orientacion : "1ª Ronda",
    });
  }, [days, eventosBloquesMap]);

  const handleSavePaConfigModal = () => {
    if (!paConfigModalData) return;
    const { dayId, fecha, slotIdx, tipoCompeticion, competicion, jornada, fase } = paConfigModalData;

    let finalComp = competicion.trim();
    if (tipoCompeticion === "LIGA") {
      finalComp = finalComp || "Liga";
    } else if (tipoCompeticion === "COPA_REY") {
      finalComp = "Copa del Rey";
    } else if (tipoCompeticion === "COPA_CATALUNYA") {
      finalComp = "Copa Catalunya";
    } else if (tipoCompeticion === "AMISTOSO") {
      finalComp = "Partido Amistoso";
    } else if (tipoCompeticion === "TORNEO") {
      finalComp = finalComp || "Torneo / Playoff";
    }

    let orientacionVal = "";
    let numJornadaParaMap: number | null = null;
    if (tipoCompeticion === "LIGA") {
      const jClean = jornada.trim().replace(/^j\.?/i, "").trim();
      orientacionVal = jClean ? `Jornada ${jClean}` : "Liga";
      const num = parseInt(jClean);
      if (!isNaN(num) && num > 0) numJornadaParaMap = num;
    } else if (tipoCompeticion === "AMISTOSO") {
      orientacionVal = "Amistoso";
    } else {
      orientacionVal = fase.trim() || finalComp;
    }

    // Actualizar bloque de evento (competicion y orientacion)
    handleEventoBlockUpdate(dayId, fecha, slotIdx, "competicion", finalComp);
    handleEventoBlockUpdate(dayId, fecha, slotIdx, "orientacion", orientacionVal);

    // Actualizar sesión del día
    handleCellUpdate(dayId, "competicion" as keyof SesionDia, finalComp);

    // Guardar número de jornada en localStorage partidos_jornadas_map_v1
    if (numJornadaParaMap !== null && typeof window !== "undefined") {
      try {
        let existingJornadasMap: Record<string, number> = {};
        const raw = localStorage.getItem("partidos_jornadas_map_v1");
        if (raw) existingJornadasMap = JSON.parse(raw);
        existingJornadasMap[fecha] = numJornadaParaMap;
        if (dayId) existingJornadasMap[dayId] = numJornadaParaMap;
        localStorage.setItem("partidos_jornadas_map_v1", JSON.stringify(existingJornadasMap));
        window.dispatchEvent(new Event("partidos_jornadas_updated"));
        window.dispatchEvent(new Event("storage"));
      } catch (e) {}
    }

    setPaConfigModalData(null);
  };

  // Obtener eventos activos de un día ordenados por hora y resolver sus códigos asignados (ej. Co1, Co2, Op)
  const getDailyTeamEventsMap = React.useCallback(
    (dayId: string, fecha?: string) => {
      const dayObj = days.find((d) => d.id === dayId || (fecha && d.fecha === fecha));
      const targetFecha = fecha || dayObj?.fecha;
// Permite eventos en cualquier fecha
      const dayEvents: EventoBloque[] = [];

      for (let slot = 0; slot < 6; slot++) {
        const key = `${dayId}_slot_${slot}`;
        const keyFecha = targetFecha ? `${targetFecha}_slot_${slot}` : "";
        let ev = eventosBloquesMap[key] || (keyFecha ? eventosBloquesMap[keyFecha] : null);

        // Fallback: si no está en el mapa de bloques, buscar en evento_1..6
        if ((!ev || !ev.tipo || !ev.tipo.trim()) && dayObj) {
          const directKey = `evento_${slot + 1}` as keyof SesionDia;
          const directVal = (dayObj as any)[directKey];
          if (directVal && typeof directVal === "string" && directVal.trim()) {
            ev = {
              id: `ev_${dayObj.id}_${slot}`,
              day_id: dayObj.id,
              fecha: dayObj.fecha,
              slot,
              tipo: directVal.trim(),
              hora: "",
              lugar: "",
              duracion: "",
              orientacion: "",
              carga: "",
              comentario: "",
              num_jugadores: "",
            };
          }
        }

        if (ev && ev.tipo && ev.tipo.trim() !== "") {
          dayEvents.push(ev);
        }
      }

      dayEvents.sort((a, b) => {
        const hA = a.hora ? a.hora.trim() : "99:99";
        const hB = b.hora ? b.hora.trim() : "99:99";
        return hA.localeCompare(hB);
      });

      const typeCounts = new Map<string, number>();
      dayEvents.forEach((ev) => {
        const codeUpper = ev.tipo.trim().toUpperCase();
        typeCounts.set(codeUpper, (typeCounts.get(codeUpper) || 0) + 1);
      });

      const currentTypeIndexes = new Map<string, number>();
      const codeToEventMap = new Map<string, { event: EventoBloque; codeLabel: string; tipoConfig: any }>();
      const availableCodesList: { codeLabel: string; event: EventoBloque; tipoConfig: any }[] = [];

      dayEvents.forEach((ev) => {
        const rawCode = ev.tipo.trim();
        const codeUpper = rawCode.toUpperCase();
        const count = typeCounts.get(codeUpper) || 0;
        const currentIdx = (currentTypeIndexes.get(codeUpper) || 0) + 1;
        currentTypeIndexes.set(codeUpper, currentIdx);

        const codeLabel = count > 1 ? `${rawCode}${currentIdx}` : rawCode;
        const tipoConfig = tiposEventoConfig.find((t) => t.codigo.toLowerCase() === rawCode.toLowerCase());

        const info = { event: ev, codeLabel, tipoConfig };
        codeToEventMap.set(codeLabel.toUpperCase(), info);
        codeToEventMap.set(rawCode.toUpperCase(), info);
        codeToEventMap.set(`${rawCode.toUpperCase()}1`, info);
        availableCodesList.push(info);
      });

      return { codeToEventMap, availableCodesList, dayEvents };
    },
    [eventosBloquesMap, tiposEventoConfig, days]
  );

  const getAssignedPlayersCountForSlot = React.useCallback(
    (dayId: string, slotIdx: number, fecha?: string) => {
      const key = `${dayId}_slot_${slotIdx}`;
      const ev = eventosBloquesMap[key];
      if (!ev || !ev.tipo || !ev.tipo.trim()) return "";

      const rawCode = ev.tipo.trim().toLowerCase();

      let count = 0;
      jugadoresList.forEach((p) => {
        const k1 = `${p.id}_${dayId}`;
        const k2 = `${p.id}_${fecha}`;
        const cellVal = (playerEventsMap[k1] || playerEventsMap[k2] || "").trim();

        if (cellVal && cellVal.trim() !== "") {
          const tokens = cellVal.split(",").map((t) => t.trim().toLowerCase());
          if (tokens.some((t) => t === rawCode || rawCode.startsWith(t) || t.startsWith(rawCode))) {
            count++;
          }
        }
      });

      return count > 0 ? String(count) : "0";
    },
    [eventosBloquesMap, jugadoresList, playerEventsMap]
  );

  const parsePlayerEventCellString = React.useCallback(
    (rawCellText: string, dayId: string, fecha?: string) => {
      if (!rawCellText || !rawCellText.trim()) return [];
      const { codeToEventMap } = getDailyTeamEventsMap(dayId, fecha);

      const rawTokens = rawCellText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // Deduplicar tokens
      const seen = new Set<string>();
      const tokens: string[] = [];
      rawTokens.forEach((t) => {
        const lower = t.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          tokens.push(t);
        }
      });

      return tokens
        .map((token) => {
          const tokenUpper = token.toUpperCase();
          const match = codeToEventMap.get(tokenUpper);

          if (match) {
            return {
              token,
              isOrphan: false,
              event: match.event,
              tipoConfig: match.tipoConfig,
            };
          }
          return null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
    },
    [getDailyTeamEventsMap]
  );


  // Sincronizar Carga, Volumen e Intensidad frescos desde Supabase (initialDays) cuando se monte o actualice el server component
  useEffect(() => {
    if (Array.isArray(initialDays) && initialDays.length > 0) {
      setDays((prev) => {
        const initialMap = new Map<string, SesionDia>();
        initialDays.forEach((d) => initialMap.set(d.id, d));

        let changed = false;
        const next = prev.map((pDay) => {
          const fresh = initialMap.get(pDay.id);
          if (!fresh) return pDay;
          if (
            fresh.carga !== pDay.carga ||
            fresh.volumen !== pDay.volumen ||
            fresh.intensidad !== pDay.intensidad
          ) {
            changed = true;
            return {
              ...pDay,
              carga: fresh.carga,
              volumen: fresh.volumen,
              intensidad: fresh.intensidad,
            };
          }
          return pDay;
        });

        return changed ? next : prev;
      });
    }
  }, [initialDays]);

  // Debounce refs para guardar datos en BBDD
  const rivalEventoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRivalEventoDaysRef = useRef<SesionDia[] | null>(null);
  const blockSaveDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Guardar rival/evento en su propio localStorage (más robusto que el blob completo)
  const saveRivalEventoMap = (currentDays: SesionDia[]) => {
    if (typeof window === "undefined") return;
    try {
      const map: Record<string, { rival: string; evento: string }> = {};
      currentDays.forEach((d) => {
        if (d.fecha && d.fecha < "2026-10-01") return;
        if (d.rival !== undefined || d.evento !== undefined) {
          const entry = { rival: d.rival || "", evento: d.evento || "" };
          map[d.id] = entry;
          if (d.fecha) {
            map[d.fecha] = entry;
          }
        }
      });
      localStorage.setItem("rival_evento_map_v1", JSON.stringify(map));
    } catch (e) {}
  };

  const loadRivalEventoMap = (): Record<string, { rival: string; evento: string }> => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("rival_evento_map_v1");
      return saved ? JSON.parse(saved) : {};
    } catch (e) { return {}; }
  };

  // Aplicar el mapa rival/evento al cargar (garantiza que nunca se pierdan)
  useEffect(() => {
    const rivalEventoMap = loadRivalEventoMap();
    const ids = Object.keys(rivalEventoMap);
    if (ids.length === 0) return;
    setDays((prev) => {
      let changed = false;
      const updated = prev.map((d) => {
        if (d.fecha && d.fecha < "2026-10-01") {
          if (d.rival) {
            changed = true;
            return { ...d, rival: "" };
          }
          return d;
        }
        const saved = rivalEventoMap[d.id] || (d.fecha ? rivalEventoMap[d.fecha] : null);
        if (!saved) return d;
        const newRival = saved.rival !== undefined ? saved.rival : (d.rival || "");
        const newEvento = saved.evento !== undefined ? saved.evento : (d.evento || "");
        if (newRival !== d.rival || newEvento !== d.evento) {
          changed = true;
          return { ...d, rival: newRival, evento: newEvento };
        }
        return d;
      });
      return changed ? recalculateMDForDays(updated) : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincronizar días con Supabase: Supabase + localStorage combinados sin perder eventos
  useEffect(() => {
    if (initialDays && initialDays.length > 0) {
      // Leer desde localStorage para fusionar los últimos cambios locales no sincronizados
      let localDays: SesionDia[] | null = null;
      if (typeof window !== "undefined") {
        try {
          const saved = localStorage.getItem("planificacion_days_v5");
          if (saved) {
            localDays = JSON.parse(saved);
          }
        } catch (e) {}
      }
      const localMap = new Map<string, SesionDia>();
      if (localDays) localDays.forEach((d) => localMap.set(d.id, d));

      setDays((prevDays) => {
        const map = new Map<string, SesionDia>();
        // 1. Días oficiales del servidor (claves únicas canónicas por fecha)
        initialDays.forEach((d) => {
          if (d && d.fecha) map.set(d.fecha, d);
        });

        // 2. Fusionar estado local previo o localStorage por fecha
        prevDays.forEach((d) => {
          if (d && d.fecha) {
            const existing = map.get(d.fecha);
            const localDay = localDays ? localDays.find((ld) => ld.fecha === d.fecha || ld.id === d.id) : null;

            const bestRival = (d.fecha && d.fecha < "2026-10-01") ? "" : (d.rival || localDay?.rival || existing?.rival || "");
            const bestResultado = d.resultado_partido || localDay?.resultado_partido || existing?.resultado_partido || "";
            const bestEvento = d.evento || (d as any).evento_am || localDay?.evento || existing?.evento || "";
            const bestEvento1 = d.evento_1 ?? localDay?.evento_1 ?? existing?.evento_1 ?? null;
            const bestEvento2 = d.evento_2 ?? (d as any).evento_pm ?? localDay?.evento_2 ?? existing?.evento_2 ?? null;
            const bestEvento3 = d.evento_3 ?? localDay?.evento_3 ?? existing?.evento_3 ?? null;
            const bestEvento4 = d.evento_4 ?? localDay?.evento_4 ?? existing?.evento_4 ?? null;
            const bestEvento5 = d.evento_5 ?? localDay?.evento_5 ?? existing?.evento_5 ?? null;
            const bestEvento6 = d.evento_6 ?? localDay?.evento_6 ?? existing?.evento_6 ?? null;
            const bestCarga = d.carga ?? localDay?.carga ?? existing?.carga ?? null;
            const bestVolumen = d.volumen ?? localDay?.volumen ?? existing?.volumen ?? null;
            const bestIntensidad = d.intensidad ?? localDay?.intensidad ?? existing?.intensidad ?? null;
            const bestSubperiodo = d.subperiodo || localDay?.subperiodo || existing?.subperiodo || "";
            const bestMD = d.md || localDay?.md || existing?.md || "";
            const bestComentario = d.comentario_microciclo || localDay?.comentario_microciclo || existing?.comentario_microciclo || null;

            if (existing) {
              map.set(d.fecha, {
                ...existing,
                id: existing.id || d.id, // Preservar siempre UUID oficial
                equipo: existing.equipo || d.equipo || "CE EUROPA",
                rival: bestRival,
                resultado_partido: bestResultado,
                evento: bestEvento,
                evento_am: bestEvento,
                evento_1: bestEvento1,
                evento_2: bestEvento2,
                evento_3: bestEvento3,
                evento_4: bestEvento4,
                evento_5: bestEvento5,
                evento_6: bestEvento6,
                carga: bestCarga,
                volumen: bestVolumen,
                intensidad: bestIntensidad,
                subperiodo: bestSubperiodo,
                md: bestMD,
                comentario_microciclo: bestComentario,
              });
            } else {
              map.set(d.fecha, d);
            }
          }
        });
        const dedupList = Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
        return recalculateMDForDays(dedupList, eventosBloquesMap);
      });
    }
  }, [initialDays, eventosBloquesMap]);

  // Guardar en localStorage antes de salir de la página (beforeunload)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (typeof window !== "undefined") {
        try {
          // Usar la referencia de days a través de un ref para acceder al valor actual
          const currentDays = daysRef.current;
          if (currentDays && currentDays.length > 0) {
            localStorage.setItem("planificacion_days_v5", JSON.stringify(currentDays));
          }
        } catch (e) {}
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleDownloadJSON = () => {
    const data = {
      playerEventsMap,
      eventosBloquesMap,
      estadosMap,
      comentarios,
      planificacionDays: days,
      tiposEventoConfig,
      subperiodoColors,
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `copia_seguridad_planificacion_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        if (json.planificacionDays) {
           // Filtramos AE Prat del JSON antes de subirlo para que no reviente la red
           json.planificacionDays = json.planificacionDays.filter((d: any) => d.equipo !== "AE Prat");
        }

        // Obtener los IDs válidos para filtrar los demás mapas
        const validDayIds = new Set(json.planificacionDays ? json.planificacionDays.map((d: any) => d.id) : []);
        const validDates = new Set(json.planificacionDays ? json.planificacionDays.map((d: any) => d.fecha) : []);

        if (json.eventosBloquesMap) {
          const filteredBlocks: Record<string, any> = {};
          Object.keys(json.eventosBloquesMap).forEach(key => {
            const block = json.eventosBloquesMap[key];
            if (validDayIds.has(block.day_id) || validDates.has(block.fecha)) {
              filteredBlocks[key] = block;
            }
          });
          json.eventosBloquesMap = filteredBlocks;
          setEventosBloquesMap(json.eventosBloquesMap);
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("eventos_bloques_map_v5", JSON.stringify(json.eventosBloquesMap));
            } catch (e) {
              console.warn("Storage quota exceeded, skipping local save.");
            }
          }
        }
        
        if (json.playerEventsMap) {
           const filteredPlayerEvents: Record<string, any> = {};
           Object.keys(json.playerEventsMap).forEach(key => {
             // key is usually jugadorId_dayId or jugadorId_fecha
             const datePart = key.split("_").slice(1).join("_");
             if (validDayIds.has(datePart) || validDates.has(datePart) || datePart.includes("2026-08") || datePart.includes("2026-09") || datePart.includes("2026-1") || datePart.includes("2027-")) {
               filteredPlayerEvents[key] = json.playerEventsMap[key];
             }
           });
           json.playerEventsMap = filteredPlayerEvents;
           setPlayerEventsMap(json.playerEventsMap);
        }
        
        if (json.estadosMap) setEstadosMap(json.estadosMap);
        if (json.comentarios) setComentarios(json.comentarios);
        if (json.tiposEventoConfig) setTiposEventoConfig(json.tiposEventoConfig);
        if (json.subperiodoColors) setSubperiodoColors(json.subperiodoColors);
        if (json.planificacionDays) {
           // Si querías setear days aquí, puedes. Generalmente se hace reload de la BBDD de todos modos
           // pero forzamos el render
        }
        
        alert("Backup cargado correctamente en pantalla. Guardando en BBDD...");
        
        setIsSavingBBDD(true);
        setSaveStatusMsg("Inyectando backup en BBDD...");
        
        try {
          await saveFullPlanificacionBBDD(
            json.planificacionDays || days,
            json.comentarios || comentarios,
            json.playerEventsMap || playerEventsMap,
            undefined,
            json.eventosBloquesMap || eventosBloquesMap,
            json.estadosMap || json.disponibilidadMap || estadosMap
          );
          setLastSavedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
          setHasUnsavedChanges(false);
          setSaveStatusMsg("✓ Backup guardado en BBDD");
          setTimeout(() => setSaveStatusMsg(null), 4000);
          alert("¡Todo el backup se ha guardado de forma permanente en la base de datos de la nube!");
        } catch (err: any) {
          alert(`Error al guardar en BBDD: ${err.message}`);
          setSaveStatusMsg("❌ Error BBDD");
        } finally {
          setIsSavingBBDD(false);
        }

      } catch (err: any) {
        console.error("JSON parse error:", err);
        alert(`Error al leer el archivo JSON: ${err.message}. Asegúrate de que seleccionaste el archivo correcto.`);
      }
    };
    reader.readAsText(file);
    // Resetear input para permitir importar el mismo archivo
    e.target.value = "";
  };

  // Función para guardar toda la información en Almacenamiento Local + Base de Datos Supabase BBDD
  const handleSaveAllToBBDD = async () => {
    // Cancelar cualquier debounce pendiente de rival/evento: saveFullPlanificacionBBDD lo cubre todo
    if (rivalEventoDebounceRef.current) {
      clearTimeout(rivalEventoDebounceRef.current);
      rivalEventoDebounceRef.current = null;
    }
    pendingRivalEventoDaysRef.current = null;

    setIsSavingBBDD(true);
    setSaveStatusMsg(null);
    setPendingChangeCount(0);

    const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // 1. Guardar SIEMPRE inmediatamente en localStorage para que nunca se borren los datos al cambiar de página
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("planificacion_days_v5", JSON.stringify(days));
        localStorage.setItem("planificacion_days_v2", JSON.stringify(days));
        localStorage.setItem("eventos_bloques_map_v5", JSON.stringify(eventosBloquesMap));
        localStorage.setItem("eventos_bloques_map_v1", JSON.stringify(eventosBloquesMap));
        window.dispatchEvent(new Event("eventos_bloques_updated"));
        localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(comentarios));
        localStorage.setItem("player_events_map_v1", JSON.stringify(playerEventsMap));
        localStorage.setItem("tipos_evento_config_v1", JSON.stringify(tiposEventoConfig));
        localStorage.setItem("subperiodo_colors_map", JSON.stringify(subperiodoColors));
        saveRivalEventoMap(days); // mapa dedicado para rival/evento
      } catch (e) {}
    }

    try {
      // 2. Sincronizar en BBDD Supabase de forma ultra rápida
      if (clubConfig) {
        saveClubConfig(clubConfig).catch((e) => console.error("Error auto-guardando clubConfig:", e));
      }

      // En visión microciclo o mesociclo, guardar el ámbito activo (rápido y eficiente en < 0.5s)
      const daysToSave = (filteredDays && filteredDays.length > 0) ? filteredDays : days;
      const targetDates = new Set(daysToSave.map(d => d.fecha).filter(Boolean));
      const targetIds = new Set(daysToSave.map(d => d.id).filter(Boolean));

      const scopedPlayerEvents: Record<string, string> = {};
      Object.entries(playerEventsMap).forEach(([k, v]) => {
        const parts = k.split("_");
        const dayRef = parts.slice(1).join("_");
        if (targetDates.has(dayRef) || targetIds.has(dayRef)) {
          scopedPlayerEvents[k] = v;
        }
      });

      const scopedEstados: Record<string, string> = {};
      Object.entries(estadosMap).forEach(([k, v]) => {
        const parts = k.split("_");
        const dayRef = parts.slice(1).join("_");
        if (targetDates.has(dayRef) || targetIds.has(dayRef)) {
          scopedEstados[k] = v;
        }
      });

      const scopedBloques: Record<string, EventoBloque> = {};
      Object.entries(eventosBloquesMap).forEach(([k, v]) => {
        const parts = k.split("_slot_");
        if (targetDates.has(parts[0]) || targetIds.has(parts[0])) {
          scopedBloques[k] = v;
        }
      });

      const scopedComentarios = deduplicateComentarios(comentarios.filter(c => targetDates.has(c.fecha) || targetIds.has(c.day_id)));

      const res = await saveFullPlanificacionBBDD(daysToSave, scopedComentarios, scopedPlayerEvents, undefined, scopedBloques, scopedEstados);
      setLastSavedTime(nowStr);
      setHasUnsavedChanges(false);
      setSaveStatusMsg(`✓ Guardado con éxito en BBDD Supabase (${nowStr})`);
      setTimeout(() => setSaveStatusMsg(null), 3000);
    } catch (err: any) {
      console.warn("Respaldo físico activo. Sincronización BBDD pendiente de estructura SQL:", err.message);
      alert(`⚠️ ERROR AL GUARDAR EN BBDD: ${err.message}\n(Por favor, dime este error exacto)`);
      setLastSavedTime(nowStr);
      setHasUnsavedChanges(false);
      setSaveStatusMsg(`❌ Error al guardar en BBDD: ${err.message}`);
      setTimeout(() => setSaveStatusMsg(null), 4000);
    } finally {
      setIsSavingBBDD(false);
    }
  };

  // Fecha de hoy en formato YYYY-MM-DD
  const todayISO = new Date().toISOString().slice(0, 10);

  const [selectedCell, setSelectedCell] = useState<{ rowKey: string; dayId: string } | null>(null);
  const [hoverCell, setHoverCell] = useState<{ rowKey: string; dayId: string } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const [dragCurrentIdx, setDragCurrentIdx] = useState<number | null>(null);
  const [activeDragRow, setActiveDragRow] = useState<string | null>(null);
  const [openMenuCell, setOpenMenuCell] = useState<string | null>(null);

  // Selección de rango multi-celda estilo Excel
  const [selectionStart, setSelectionStart] = useState<{ rowIdx: number; dayIdx: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ rowIdx: number; dayIdx: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);

  // Estado para arrastre de rellenado 2D tipo Excel (hacia arriba, abajo, izquierda, derecha)
  const [isFillDragging, setIsFillDragging] = useState<boolean>(false);
  const [fillSourceRange, setFillSourceRange] = useState<{ minR: number; maxR: number; minD: number; maxD: number } | null>(null);
  const [fillTargetCell, setFillTargetCell] = useState<{ rIdx: number; dIdx: number } | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setOpenMenuCell(null);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  const isDayOfTeam = (d: SesionDia, teamKey: string) => {
    if (teamKey === "todos") return true;
    const eq = (d.equipo || "").trim().toLowerCase();
    const tk = teamKey.trim().toLowerCase();
    const f = (d.fecha || "");
    if (!eq) return true;
    if (eq === tk || eq.includes(tk) || tk.includes(eq)) return true;
    if (tk.includes("europa") || teamKey === "CE Europa" || teamKey === "CE EUROPA" || teamKey === "2026/27") {
      return !eq.includes("prat") && (f >= "2026-07-01" || eq.includes("europa"));
    }
    if (tk.includes("prat") || teamKey === "AE Prat" || teamKey === "2025/26") {
      return eq.includes("prat") || (f >= "2025-07-01" && f <= "2026-06-30");
    }
    if (tk.includes("manresa") || teamKey === "CE Manresa") {
      return eq.includes("manresa");
    }
    return true;
  };

  const teamDays = React.useMemo(() => {
    const list = days.filter((d) => isDayOfTeam(d, activeTeam));
    const source = list.length > 0 ? list : days;
    const seen = new Set<string>();
    const deduplicated: SesionDia[] = [];
    for (const d of source) {
      if (d && d.fecha && !seen.has(d.fecha)) {
        seen.add(d.fecha);
        deduplicated.push(d);
      }
    }
    return deduplicated.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [days, activeTeam]);

  // Detectar fecha de inicio de Semana 1 para el equipo/temporada activa
  const semana1StartDate = React.useMemo(() => {
    return getSemana1StartDate(teamDays);
  }, [teamDays]);

  // Filtrado de días sin saltos ni huecos memoizado
  const filteredDays = React.useMemo(() => {
    if (teamDays.length === 0) return [];
    const sorted = [...teamDays].sort((a, b) => a.fecha.localeCompare(b.fecha));

    if (viewMode === "microciclo") {
      const isTodayInSorted = sorted.some((d) => d.fecha === todayISO);
      let anchorDate = isTodayInSorted
        ? new Date((todayISO || new Date().toISOString().slice(0, 10)) + "T12:00:00")
        : new Date(sorted[0].fecha + "T12:00:00");
      anchorDate.setDate(anchorDate.getDate() + microcicloOffsetWeeks * 7);

      const dayOfWeek = anchorDate.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const mondayDate = new Date(anchorDate);
      mondayDate.setDate(anchorDate.getDate() + diffToMonday);
      const mondayISO = mondayDate.toISOString().slice(0, 10);

      const mondayIdx = sorted.findIndex((d) => d.fecha >= mondayISO);
      const startIdx = mondayIdx !== -1 ? mondayIdx : 0;
      return sorted.slice(startIdx, startIdx + 7);
    }

    if (viewMode === "mesociclo") {
      const isTodayInSorted = sorted.some((d) => d.fecha === todayISO);
      let anchorDate = isTodayInSorted
        ? new Date((todayISO || new Date().toISOString().slice(0, 10)) + "T12:00:00")
        : new Date(sorted[0].fecha + "T12:00:00");

      const dayOfWeek = anchorDate.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const currentMonday = new Date(anchorDate);
      currentMonday.setDate(anchorDate.getDate() + diffToMonday);

      const week1Monday = new Date(currentMonday);
      week1Monday.setDate(currentMonday.getDate() - (isTodayInSorted ? 7 : 0) + mesocicloOffset * 28);
      const week1ISO = week1Monday.toISOString().slice(0, 10);

      const startIdx = sorted.findIndex((d) => d.fecha >= week1ISO);
      const safeStartIdx = startIdx !== -1 ? startIdx : 0;
      return sorted.slice(safeStartIdx, safeStartIdx + 28);
    }

    if (viewMode === "personalizado") {
      const list = sorted.filter((d) => {
        if (customDesde && d.fecha < customDesde) return false;
        if (customHasta && d.fecha > customHasta) return false;
        return true;
      });
      return list;
    }

    return sorted;
  }, [teamDays, viewMode, customDesde, customHasta, todayISO, microcicloOffsetWeeks, mesocicloOffset]);

  // Auto-scroll horizontal para situar el día de hoy en el centro de la pantalla en la vista Temporada
  useEffect(() => {
    if (viewMode === "personalizado" && tableContainerRef.current && filteredDays.length > 0) {
      const todayIdx = filteredDays.findIndex((d) => d.fecha >= todayISO);
      if (todayIdx !== -1) {
        const colWidth = 110;
        const headerWidth = 140;
        const todayCenterPos = headerWidth + todayIdx * colWidth + colWidth / 2;
        const containerWidth = tableContainerRef.current.clientWidth || 1000;
        const targetScrollLeft = Math.max(0, todayCenterPos - containerWidth / 2);

        const timer = setTimeout(() => {
          if (tableContainerRef.current) {
            tableContainerRef.current.scrollLeft = targetScrollLeft;
          }
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, [viewMode, filteredDays, todayISO]);

  // Lista de todas las filas interactivas en orden (filas de contexto activas + asignación de eventos por jugadora + disponibilidad jugadoras)
  const allInteractiveRows = React.useMemo(() => {
    const contextKeys = [
      "periodo",
      "subperiodo",
      "mes",
      "dia",
      "semana",
      "md",
      "escudo",
      "rival",
      "evento",
      "evento_1",
      "evento_2",
      "evento_3",
      "evento_4",
      "evento_5",
      "evento_6",
    ].filter((key) => (visibleRows as any)[key] !== false);

    const playerEventKeys = filteredAndSortedJugadores.map((p) => `player_event_${p.id}`);
    const otherContextKeys = ["carga", "volumen", "intensidad", "comentario"].filter((key) => (visibleRows as any)[key] !== false);
    const playerKeys = filteredAndSortedJugadores.map((p) => `player_${p.id}`);

    return [...contextKeys, ...playerEventKeys, ...otherContextKeys, ...playerKeys];
  }, [visibleRows, filteredAndSortedJugadores]);

  // Mapa de índices O(1) para consultar posiciones de filas interactivas de forma instantánea
  const rowIndicesMap = React.useMemo(() => {
    const map = new Map<string, number>();
    allInteractiveRows.forEach((r, idx) => map.set(r, idx));
    return map;
  }, [allInteractiveRows]);

  // Límites memoizados del rango seleccionado para evitar recálculos en bucle
  const activeSelectionBounds = React.useMemo(() => {
    if (!selectionStart) return null;
    const selEnd = selectionEnd || selectionStart;
    return {
      minR: Math.min(selectionStart.rowIdx, selEnd.rowIdx),
      maxR: Math.max(selectionStart.rowIdx, selEnd.rowIdx),
      minD: Math.min(selectionStart.dayIdx, selEnd.dayIdx),
      maxD: Math.max(selectionStart.dayIdx, selEnd.dayIdx),
    };
  }, [selectionStart, selectionEnd]);

  // Comprobar si una celda está dentro del rango seleccionado O(1)
  const isCellInRange = (rIdx: number, dIdx: number): boolean => {
    if (!activeSelectionBounds) return false;
    return (
      rIdx >= activeSelectionBounds.minR &&
      rIdx <= activeSelectionBounds.maxR &&
      dIdx >= activeSelectionBounds.minD &&
      dIdx <= activeSelectionBounds.maxD
    );
  };

  // Comprobar si una celda es la esquina inferior derecha del rango seleccionado
  const isBottomRightCornerCell = (rIdx: number, dIdx: number): boolean => {
    if (!activeSelectionBounds) return false;
    return rIdx === activeSelectionBounds.maxR && dIdx === activeSelectionBounds.maxD;
  };

  // Comprobar si una celda está dentro de la previsualización del arrastre de rellenado 2D
  const isCellInFillPreview = (rIdx: number, dIdx: number): boolean => {
    if (!isFillDragging || !fillSourceRange || !fillTargetCell) return false;

    const totalMinR = Math.min(fillSourceRange.minR, fillTargetCell.rIdx);
    const totalMaxR = Math.max(fillSourceRange.maxR, fillTargetCell.rIdx);
    const totalMinD = Math.min(fillSourceRange.minD, fillTargetCell.dIdx);
    const totalMaxD = Math.max(fillSourceRange.maxD, fillTargetCell.dIdx);

    return rIdx >= totalMinR && rIdx <= totalMaxR && dIdx >= totalMinD && dIdx <= totalMaxD;
  };

  // Iniciar arrastre de rellenado 2D desde la esquina del rango seleccionado
  const handleFillHandleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!selectionStart) return;

    const selEnd = selectionEnd || selectionStart;
    const minR = Math.min(selectionStart.rowIdx, selEnd.rowIdx);
    const maxR = Math.max(selectionStart.rowIdx, selEnd.rowIdx);
    const minD = Math.min(selectionStart.dayIdx, selEnd.dayIdx);
    const maxD = Math.max(selectionStart.dayIdx, selEnd.dayIdx);

    setIsFillDragging(true);
    setFillSourceRange({ minR, maxR, minD, maxD });
    setFillTargetCell({ rIdx: maxR, dIdx: maxD });
  };

  // Iniciar selección de rango con clic de ratón
  const handleCellMouseDown = (rowKey: string, dayIdx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const targetTag = (e.target as HTMLElement).tagName.toLowerCase();
    if (targetTag === "select" || targetTag === "option") {
      return;
    }
    const rIdx = allInteractiveRows.indexOf(rowKey);
    if (rIdx === -1) return;

    setIsSelecting(true);
    setSelectionStart({ rowIdx: rIdx, dayIdx });
    setSelectionEnd({ rowIdx: rIdx, dayIdx });
    const dayObj = filteredDays[dayIdx];
    if (dayObj) {
      setSelectedCell({ rowKey, dayId: dayObj.id });
    }
  };

  // Guardar cambio puntual de celda
  const handleCellUpdate = async (dayId: string, fieldKey: keyof SesionDia, value: any, updatedBlocksMap?: Record<string, EventoBloque>) => {
    setHasUnsavedChanges(true);
    setPendingChangeCount((prev) => prev + 1);
    const updatedDays = days.map((d) => {
      if (d.id === dayId) {
        if (fieldKey === "evento" || fieldKey === "evento_principal" as any) {
          return { ...d, evento: value, evento_am: value, evento_principal: value };
        }
        return { ...d, [fieldKey]: value };
      }
      return d;
    });

    const isMDAffecting = fieldKey === "rival" || fieldKey === "evento" || (typeof fieldKey === "string" && fieldKey.startsWith("evento"));
    const mapToUse = updatedBlocksMap || eventosBloquesMap;
    const recalculated = isMDAffecting ? recalculateMDForDays(updatedDays, mapToUse) : updatedDays;
    setDays(recalculated);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("planificacion_days_v1", JSON.stringify(recalculated));
        localStorage.setItem("planificacion_days_v5", JSON.stringify(recalculated));
        // Guardar también en el mapa dedicado de rival/evento para máxima robustez
        if (isMDAffecting) {
          saveRivalEventoMap(recalculated);
        }
      } catch (e) {}
    }

    const VALID_DB_COLUMNS = [
      "periodo", "subperiodo", "semana", "md", "rival", "evento",
      "evento_1", "evento_2", "evento_3", "evento_4", "evento_5", "evento_6",
      "carga", "volumen", "intensidad", "comentario_microciclo", "comentario_fisico", "comentario_tecnico"
    ];

    try {
      if (isMDAffecting) {
        // Para rival/evento: guardar SOLO el día específico que cambió (instantáneo, 1 sola fila).
        // El recálculo de MD de los días adyacentes se persiste en el siguiente "Guardar todo".
        const changedDay = recalculated.find((d) => d.id === dayId);
        if (changedDay) {
          if (rivalEventoDebounceRef.current) {
            clearTimeout(rivalEventoDebounceRef.current);
          }
          rivalEventoDebounceRef.current = setTimeout(async () => {
            try {
              if (fieldKey === "evento") {
                // GUARDAR EXCLUSIVAMENTE EVENTO GENERAL EN evento_am (BBDD / Supabase)
                await updateSesionDia(dayId, {
                  fecha: changedDay.fecha,
                  evento_am: changedDay.evento || null,
                  rival: changedDay.rival ?? null,
                  md: changedDay.md ?? null,
                });
              } else if (fieldKey === "rival") {
                await updateSesionDia(dayId, {
                  fecha: changedDay.fecha,
                  rival: changedDay.rival ?? null,
                  md: changedDay.md ?? null,
                });
                if (changedDay.rival && changedDay.rival.trim().length >= 2) {
                  const rClean = changedDay.rival.trim().toUpperCase();
                  const matchedEscudo = findRivalEscudoUrl(rClean, rivalesList);
                  upsertSingleRivalBBDD({
                    nombre: rClean,
                    escudo_url: matchedEscudo || "",
                  }).catch(console.error);
                }
              } else if (typeof fieldKey === "string" && fieldKey.startsWith("evento_")) {
                // Eventos específicos (evento_1..6) se guardan en su columna exacta y en su bloque de BBDD
                const slotIdx = parseInt(fieldKey.replace("evento_", "")) - 1;
                await updateSesionDia(dayId, {
                  fecha: changedDay.fecha,
                  [fieldKey]: (changedDay as any)[fieldKey] ?? null,
                });
                if (slotIdx >= 0 && slotIdx < 6) {
                  let existingBlock: any = eventosBloquesMap[`${dayId}_slot_${slotIdx}`] ||
                    eventosBloquesMap[`${changedDay.fecha}_slot_${slotIdx}`];
                  if (!existingBlock && typeof window !== "undefined") {
                    try {
                      const raw = localStorage.getItem("eventos_bloques_map_v5");
                      if (raw) {
                        const parsed = JSON.parse(raw);
                        existingBlock = parsed[`${dayId}_slot_${slotIdx}`] || parsed[`${changedDay.fecha}_slot_${slotIdx}`];
                      }
                    } catch (e) {}
                  }
                  await saveSingleBloqueBBDD({
                    dayId,
                    fecha: changedDay.fecha,
                    slot: slotIdx,
                    block: {
                      ...(existingBlock || {}),
                      tipo: (changedDay as any)[fieldKey] || "",
                    },
                  });
                }
              }
              pendingRivalEventoDaysRef.current = null;
              setHasUnsavedChanges(false);
              setLastSavedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
            } catch (e: any) {
              console.error("Error guardando rival/evento en BBDD:", e.message);
            }
          }, 400);
        }
      } else if (VALID_DB_COLUMNS.includes(fieldKey as string)) {
        const changedDay = recalculated.find((d) => d.id === dayId);
        await updateSesionDia(dayId, { [fieldKey]: value, fecha: changedDay?.fecha });
        setHasUnsavedChanges(false);
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      }
    } catch (e: any) {
      console.error("Error guardando celda:", e.message);
    }
  };

  // Arrastre: Mover ratón sobre celdas contiguas o seleccionar rango
  const handleCellMouseEnter = (rowKey: string, dayIdx: number) => {
    const rIdx = allInteractiveRows.indexOf(rowKey);
    if (rIdx === -1) return;

    if (isSelecting && selectionStart) {
      setSelectionEnd((prev) => {
        if (prev?.rowIdx === rIdx && prev?.dayIdx === dayIdx) return prev;
        return { rowIdx: rIdx, dayIdx };
      });
    }

    if (isFillDragging) {
      setFillTargetCell((prev) => {
        if (prev?.rIdx === rIdx && prev?.dIdx === dayIdx) return prev;
        return { rIdx, dIdx: dayIdx };
      });
    }
  };

  // Soltar ratón (Finalizar selección de rango o arrastre 2D de rellenado)
  const handleMouseUp = async () => {
    if (isSelecting) {
      setIsSelecting(false);
    }

    if (isFillDragging && fillSourceRange && fillTargetCell) {
      const { minR: srcMinR, maxR: srcMaxR, minD: srcMinD, maxD: srcMaxD } = fillSourceRange;
      const srcHeight = srcMaxR - srcMinR + 1;
      const srcWidth = srcMaxD - srcMinD + 1;

      const totalMinR = Math.min(srcMinR, fillTargetCell.rIdx);
      const totalMaxR = Math.max(srcMaxR, fillTargetCell.rIdx);
      const totalMinD = Math.min(srcMinD, fillTargetCell.dIdx);
      const totalMaxD = Math.max(srcMaxD, fillTargetCell.dIdx);

      const updatedPlayerMap: Record<string, string> = {};
      const playerUpdatesList: { jId: string; dId: string; val: string }[] = [];
      const updatedPlayerEventsUpdates: Record<string, string> = {};
      const updatedBlocksUpdates: Record<string, EventoBloque> = {};
      let updatedDaysList = [...days];

      for (let r = totalMinR; r <= totalMaxR; r++) {
        const targetRowKey = allInteractiveRows[r];
        if (!targetRowKey) continue;

        // Fila origen relativa dentro del patrón repetido
        const srcR = srcMinR + ((((r - srcMinR) % srcHeight) + srcHeight) % srcHeight);
        const srcRowKey = allInteractiveRows[srcR];

        for (let d = totalMinD; d <= totalMaxD; d++) {
          const targetDay = filteredDays[d];
          if (!targetDay) continue;

          // Día origen relativo dentro del patrón repetido
          const srcD = srcMinD + ((((d - srcMinD) % srcWidth) + srcWidth) % srcWidth);
          const srcDay = filteredDays[srcD];
          if (!srcDay) continue;

          // Leer valor del bloque origen
          let val = "";
          if (srcRowKey.startsWith("player_event_")) {
            const jId = srcRowKey.replace("player_event_", "");
            const k1 = `${jId}_${srcDay.id}`;
            const k2 = `${jId}_${srcDay.fecha}`;
            val = (playerEventsMap[k1] !== undefined ? playerEventsMap[k1] : (playerEventsMap[k2] || "")).trim();
          } else if (srcRowKey.startsWith("player_")) {
            const jId = srcRowKey.replace("player_", "");
            val = (estadosMap[`${jId}_${srcDay.id}`] || estadosMap[`${jId}_${srcDay.fecha}`] || "").trim().toUpperCase();
          } else {
            val = String((srcDay as any)[srcRowKey] ?? "");
          }

          // Asignar al destino
          if (targetRowKey.startsWith("player_event_")) {
            const targetJId = targetRowKey.replace("player_event_", "");
            updatedPlayerEventsUpdates[`${targetJId}_${targetDay.id}`] = val;
            updatedPlayerEventsUpdates[`${targetJId}_${targetDay.fecha}`] = val;
          } else if (targetRowKey.startsWith("player_")) {
            const targetJId = targetRowKey.replace("player_", "");
            updatedPlayerMap[`${targetJId}_${targetDay.id}`] = val;
            updatedPlayerMap[`${targetJId}_${targetDay.fecha}`] = val;
            playerUpdatesList.push({ jId: targetJId, dId: targetDay.id, val });
          } else if (["evento_1", "evento_2", "evento_3", "evento_4", "evento_5", "evento_6"].includes(targetRowKey)) {
            const eventoIdx = parseInt(targetRowKey.replace("evento_", "")) - 1;
            const srcSlotKey = `${srcDay.id}_slot_${eventoIdx}`;
            const srcSlotKeyFecha = `${srcDay.fecha}_slot_${eventoIdx}`;
            const targetSlotKey = `${targetDay.id}_slot_${eventoIdx}`;
            const targetSlotKeyFecha = `${targetDay.fecha}_slot_${eventoIdx}`;
            const srcBlock = eventosBloquesMap[srcSlotKey] || eventosBloquesMap[srcSlotKeyFecha];
            const newTipo = srcBlock?.tipo || val;

            const copiedBlock: EventoBloque = srcBlock
              ? {
                  ...srcBlock,
                  id: `ev_${targetDay.id}_${eventoIdx}`,
                  day_id: targetDay.id,
                  fecha: targetDay.fecha,
                  slot: eventoIdx,
                  tipo: newTipo,
                }
              : {
                  id: `ev_${targetDay.id}_${eventoIdx}`,
                  day_id: targetDay.id,
                  fecha: targetDay.fecha,
                  slot: eventoIdx,
                  tipo: newTipo,
                  hora: "",
                  lugar: "",
                  duracion: "",
                  orientacion: "",
                  carga: "",
                  comentario: "",
                  num_jugadores: "",
                };

            updatedBlocksUpdates[targetSlotKey] = copiedBlock;
            updatedBlocksUpdates[targetSlotKeyFecha] = copiedBlock;

            // Copiar asignaciones de jugadores convocados al arrastrar evento
            const cleanCode = newTipo.trim();
            if (cleanCode && srcDay) {
              const srcDayId = srcDay.id || srcDay.fecha;
              jugadoresList.forEach((j) => {
                const srcKey1 = `${j.id}_${srcDayId}`;
                const srcKey2 = `${j.id}_${srcDay.fecha}`;
                const srcAssigned = playerEventsMap[srcKey1] !== undefined ? playerEventsMap[srcKey1] : playerEventsMap[srcKey2];

                if (srcAssigned !== undefined && srcAssigned !== null && srcAssigned.trim() !== "") {
                  const codes = srcAssigned.split(",").map((c) => c.trim().toLowerCase());
                  if (codes.some((c) => c === cleanCode.toLowerCase() || cleanCode.toLowerCase().startsWith(c))) {
                    const targetPlayerKey1 = `${j.id}_${targetDay.id}`;
                    const targetPlayerKey2 = `${j.id}_${targetDay.fecha}`;

                    const existingTargetStr = updatedPlayerEventsUpdates[targetPlayerKey1] !== undefined
                      ? updatedPlayerEventsUpdates[targetPlayerKey1]
                      : (playerEventsMap[targetPlayerKey1] || playerEventsMap[targetPlayerKey2] || "");
                    let targetCodes = existingTargetStr ? existingTargetStr.split(",").map((c) => c.trim()).filter(Boolean) : [];
                    if (!targetCodes.some((c) => c.toLowerCase() === cleanCode.toLowerCase())) {
                      targetCodes.push(cleanCode);
                    }

                    const mergedVal = targetCodes.join(", ");
                    updatedPlayerEventsUpdates[targetPlayerKey1] = mergedVal;
                    updatedPlayerEventsUpdates[targetPlayerKey2] = mergedVal;
                  }
                }
              });
            }

            updatedDaysList = updatedDaysList.map((dayObj) => {
              if (dayObj.id === targetDay.id) {
                return { ...dayObj, [targetRowKey]: newTipo };
              }
              return dayObj;
            });
            handleCellUpdate(targetDay.id, targetRowKey as keyof SesionDia, newTipo);
          } else {
            const fieldKey = targetRowKey as keyof SesionDia;
            updatedDaysList = updatedDaysList.map((dayObj) => {
              if (dayObj.id === targetDay.id) {
                return { ...dayObj, [fieldKey]: val };
              }
              return dayObj;
            });
            handleCellUpdate(targetDay.id, fieldKey, val);
          }
        }
      }

      if (Object.keys(updatedPlayerEventsUpdates).length > 0) {
        setPlayerEventsMap((prev) => {
          const next = { ...prev, ...updatedPlayerEventsUpdates };
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("player_events_map_v1", JSON.stringify(next));
              window.dispatchEvent(new Event("player_events_updated"));
              window.dispatchEvent(new Event("storage"));
            } catch (e) {}
          }
          return next;
        });

        const rowsToSave: Array<{ jugador_id: string; fecha: string; evento_asignado: string | null }> = [];
        Object.entries(updatedPlayerEventsUpdates).forEach(([k, val]) => {
          const [jId, dIdOrFecha] = k.split("_");
          if (jId && dIdOrFecha) {
            const dayObj = days.find((d) => d.id === dIdOrFecha || d.fecha === dIdOrFecha);
            const fecha = dayObj?.fecha || dIdOrFecha;
            if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
              rowsToSave.push({ jugador_id: jId, fecha, evento_asignado: val || null });
            }
          }
        });
        if (rowsToSave.length > 0) {
          savePlayerEventAssignments(rowsToSave).catch(console.error);
        }
      }

      if (Object.keys(updatedBlocksUpdates).length > 0) {
        setEventosBloquesMap((prev) => {
          const next = { ...prev, ...updatedBlocksUpdates };
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("eventos_bloques_map_v5", JSON.stringify(next));
              window.dispatchEvent(new Event("eventos_bloques_updated"));
              window.dispatchEvent(new Event("storage"));
            } catch (e) {}
          }
          return next;
        });
      }

      if (Object.keys(updatedPlayerMap).length > 0) {
        setEstadosMap((prev) => ({ ...prev, ...updatedPlayerMap }));
        playerUpdatesList.forEach(({ jId, dId, val }) => {
          updateEstadoDiarioJugador(jId, dId, val || null).catch((err) =>
            console.error("Error arrastrando 2D disponibilidad:", err)
          );
        });
      }

      setDays(recalculateMDForDays(updatedDaysList, eventosBloquesMap));

      // Ampliar la selección al rango total rellenado
      setSelectionStart({ rowIdx: totalMinR, dayIdx: totalMinD });
      setSelectionEnd({ rowIdx: totalMaxR, dayIdx: totalMaxD });
    }

    setIsFillDragging(false);
    setFillSourceRange(null);
    setFillTargetCell(null);
  };

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [
    isFillDragging,
    fillSourceRange,
    fillTargetCell,
    isSelecting,
    filteredDays,
    days,
    estadosMap,
    playerEventsMap,
    eventosBloquesMap,
    jugadoresList,
    selectionStart,
    selectionEnd,
    allInteractiveRows,
  ]);

  // Navegación con flechas y Copiar/Pegar RANGO MULTI-CELDA (Cmd+C, Cmd+V / Ctrl+C, Ctrl+V)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isEditableTarget = targetTag === "input" || targetTag === "textarea" || (e.target as HTMLElement)?.isContentEditable;
      if (isEditableTarget) return;

      if (!selectionStart) return;

      const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      const selEnd = selectionEnd || selectionStart;
      const minR = Math.min(selectionStart.rowIdx, selEnd.rowIdx);
      const maxR = Math.max(selectionStart.rowIdx, selEnd.rowIdx);
      const minD = Math.min(selectionStart.dayIdx, selEnd.dayIdx);
      const maxD = Math.max(selectionStart.dayIdx, selEnd.dayIdx);

      // 1. COPIAR (Cmd+C / Ctrl+C)
      if (modifier && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copyEventRange(minR, maxR, minD, maxD);
        
        const rowsData: string[] = [];
        for (let r = minR; r <= maxR; r++) {
          const rowKey = allInteractiveRows[r];
          if (!rowKey) continue;
          const rowCells: string[] = [];
          for (let d = minD; d <= maxD; d++) {
            const day = filteredDays[d];
            if (!day) continue;
            if (rowKey.startsWith("player_event_")) {
              const jId = rowKey.replace("player_event_", "");
              const val = (playerEventsMap[`${jId}_${day.id}`] !== undefined ? playerEventsMap[`${jId}_${day.id}`] : (playerEventsMap[`${jId}_${day.fecha}`] || "")).trim();
              rowCells.push(val);
            } else if (rowKey.startsWith("player_")) {
              const jId = rowKey.replace("player_", "");
              const val = (estadosMap[`${jId}_${day.id}`] || "").trim().toUpperCase();
              rowCells.push(val);
            } else {
              const val = String((day as any)[rowKey] ?? "");
              rowCells.push(val);
            }
          }
          rowsData.push(rowCells.join("\t"));
        }
        const tsvText = rowsData.join("\n");
        if (tsvText) {
          try {
            await navigator.clipboard.writeText(tsvText);
          } catch (err) {}
        }
        return;
      }

      // 2. PEGAR MATRIZ MULTI-CELDA O EVENTOS (Cmd+V / Ctrl+V)
      if (modifier && e.key.toLowerCase() === "v") {
        pasteEventRange(minR, minD);
        let textToPaste = "";
        try {
          textToPaste = await navigator.clipboard.readText();
        } catch (err) {}

        if (!textToPaste) return;
        e.preventDefault();

        const startR = minR;
        const startD = minD;

        const rawRows = textToPaste.split(/\r?\n/).filter((line) => line.length > 0 || line.includes("\t"));
        if (rawRows.length === 0) return;

        const updatedPlayerMap: Record<string, string> = {};
        const playerUpdatesList: { jId: string; dId: string; val: string }[] = [];

        rawRows.forEach((rowLine, rOffset) => {
          const targetR = startR + rOffset;
          if (targetR >= allInteractiveRows.length) return;
          const rowKey = allInteractiveRows[targetR];

          const colVals = rowLine.split("\t");
          colVals.forEach((rawVal, cOffset) => {
            const targetD = startD + cOffset;
            if (targetD >= filteredDays.length) return;
            const day = filteredDays[targetD];
            if (!day) return;

            const cleanVal = rawVal.trim().toUpperCase();

            if (rowKey.startsWith("player_event_")) {
              const jId = rowKey.replace("player_event_", "");
              setPlayerEventsMap((prev) => ({
                ...prev,
                [`${jId}_${day.id}`]: rawVal.trim(),
                [`${jId}_${day.fecha}`]: rawVal.trim(),
              }));
            } else if (rowKey.startsWith("player_")) {
              const jId = rowKey.replace("player_", "");
              updatedPlayerMap[`${jId}_${day.id}`] = cleanVal;
              playerUpdatesList.push({ jId, dId: day.id, val: cleanVal });
            } else {
              const fieldKey = rowKey as keyof SesionDia;
              handleCellUpdate(day.id, fieldKey, rawVal.trim());
            }
          });
        });

        if (Object.keys(updatedPlayerMap).length > 0) {
          setEstadosMap((prev) => ({ ...prev, ...updatedPlayerMap }));
          playerUpdatesList.forEach(({ jId, dId, val }) => {
            updateEstadoDiarioJugador(jId, dId, val || null).catch((err) =>
              console.error("Error al pegar disponibilidad:", err)
            );
          });
        }
        return;
      }

      // 3. TECLAS RÁPIDAS DIRECTAS (Delete / Backspace / D / P / Enter)
      if (!modifier) {
        const keyUpper = e.key.toUpperCase();
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          const updatedPlayerMap: Record<string, string> = {};
          const playerUpdatesList: { jId: string; dId: string }[] = [];
          for (let r = minR; r <= maxR; r++) {
            const rowKey = allInteractiveRows[r];
            if (!rowKey) continue;
            for (let d = minD; d <= maxD; d++) {
              const day = filteredDays[d];
              if (!day) continue;
              if (rowKey.startsWith("player_event_")) {
                const jId = rowKey.replace("player_event_", "");
                setPlayerEventsMap((prev) => ({ ...prev, [`${jId}_${day.id}`]: "", [`${jId}_${day.fecha}`]: "" }));
              } else if (rowKey.startsWith("player_")) {
                const jId = rowKey.replace("player_", "");
                updatedPlayerMap[`${jId}_${day.id}`] = "";
                playerUpdatesList.push({ jId, dId: day.id });
              } else if (rowKey.startsWith("evento_")) {
                const slotIdx = parseInt(rowKey.replace("evento_", "")) - 1;
                handleCellUpdate(day.id, rowKey as keyof SesionDia, "");
                handleEventoBlockUpdate(day.id, day.fecha, slotIdx, "tipo", "");
              } else {
                const fieldKey = rowKey as keyof SesionDia;
                handleCellUpdate(day.id, fieldKey, "");
              }
            }
          }
          if (Object.keys(updatedPlayerMap).length > 0) {
            setEstadosMap((prev) => ({ ...prev, ...updatedPlayerMap }));
            playerUpdatesList.forEach(({ jId, dId }) => {
              updateEstadoDiarioJugador(jId, dId, null).catch((err) =>
                console.error("Error borrando disponibilidad:", err)
              );
            });
          }
          return;
        }

        if (["D", "P"].includes(keyUpper)) {
          e.preventDefault();
          const updatedPlayerMap: Record<string, string> = {};
          const playerUpdatesList: { jId: string; dId: string; val: string }[] = [];
          for (let r = minR; r <= maxR; r++) {
            const rowKey = allInteractiveRows[r];
            if (!rowKey || !rowKey.startsWith("player_")) continue;
            const jId = rowKey.replace("player_", "");
            for (let d = minD; d <= maxD; d++) {
              const day = filteredDays[d];
              if (!day) continue;
              updatedPlayerMap[`${jId}_${day.id}`] = keyUpper;
              playerUpdatesList.push({ jId, dId: day.id, val: keyUpper });
            }
          }
          if (Object.keys(updatedPlayerMap).length > 0) {
            setEstadosMap((prev) => ({ ...prev, ...updatedPlayerMap }));
            playerUpdatesList.forEach(({ jId, dId, val }) => {
              updateEstadoDiarioJugador(jId, dId, val).catch((err) =>
                console.error("Error asignando disponibilidad:", err)
              );
            });
          }
          return;
        }
      }

      // 4. NAVEGACIÓN FLECHAS DEL TECLADO
      let targetR = selectionStart.rowIdx;
      let targetD = selectionStart.dayIdx;

      if (e.key === "ArrowLeft") {
        if (targetD > 0) {
          e.preventDefault();
          targetD--;
        }
      } else if (e.key === "ArrowRight") {
        if (targetD < filteredDays.length - 1) {
          e.preventDefault();
          targetD++;
        }
      } else if (e.key === "ArrowUp") {
        if (targetR > 0) {
          e.preventDefault();
          targetR--;
        }
      } else if (e.key === "ArrowDown") {
        if (targetR < allInteractiveRows.length - 1) {
          e.preventDefault();
          targetR++;
        }
      } else {
        return;
      }

      setSelectionStart({ rowIdx: targetR, dayIdx: targetD });
      setSelectionEnd({ rowIdx: targetR, dayIdx: targetD });
      const targetRowKey = allInteractiveRows[targetR];
      const targetDay = filteredDays[targetD];
      if (targetRowKey && targetDay) {
        setSelectedCell({ rowKey: targetRowKey, dayId: targetDay.id });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionStart, selectionEnd, filteredDays, allInteractiveRows, estadosMap, days]);

  // Escuchar eventos nativos de portapapeles (Copy/Paste) a nivel global de ventana
  useEffect(() => {
    const handleCopyEvent = (e: ClipboardEvent) => {
      if (!selectionStart) return;
      const selEnd = selectionEnd || selectionStart;
      const minR = Math.min(selectionStart.rowIdx, selEnd.rowIdx);
      const maxR = Math.max(selectionStart.rowIdx, selEnd.rowIdx);
      const minD = Math.min(selectionStart.dayIdx, selEnd.dayIdx);
      const maxD = Math.max(selectionStart.dayIdx, selEnd.dayIdx);

      const hasEventoRow = allInteractiveRows.slice(minR, maxR + 1).some((r) => r && r.startsWith("evento_"));
      if (hasEventoRow) {
        copyEventRange(minR, maxR, minD, maxD, e);
      }
    };

    const handlePasteEvent = (e: ClipboardEvent) => {
      if (!selectionStart) return;
      const minR = Math.min(selectionStart.rowIdx, (selectionEnd || selectionStart).rowIdx);
      const minD = Math.min(selectionStart.dayIdx, (selectionEnd || selectionStart).dayIdx);

      const hasEventoRow = allInteractiveRows[minR]?.startsWith("evento_");
      if (hasEventoRow) {
        const clipboardText = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
        pasteEventRange(minR, minD, clipboardText);
        e.preventDefault();
      }
    };

    window.addEventListener("copy", handleCopyEvent);
    window.addEventListener("paste", handlePasteEvent);
    return () => {
      window.removeEventListener("copy", handleCopyEvent);
      window.removeEventListener("paste", handlePasteEvent);
    };
  }, [selectionStart, selectionEnd, allInteractiveRows, filteredDays, eventosBloquesMap, eventClipboardMatrix, tiposEventoConfig]);

  // Auto-foco en la celda seleccionada al navegar con el teclado
  useEffect(() => {
    if (selectedCell) {
      const el = document.getElementById(`cell_input_${selectedCell.rowKey}_${selectedCell.dayId}`);
      if (el) {
        el.focus();
      }
    }
  }, [selectedCell]);

  const toggleRowVisibility = (key: keyof typeof visibleRows) => {
    setVisibleRows((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Determinar si una fecha es domingo (para aplicar el borde grueso entre domingo y lunes)
  const isSundayDate = (fechaISO: string): boolean => {
    if (!fechaISO) return false;
    return new Date(fechaISO + "T12:00:00").getDay() === 0;
  };

  // RENDERIZADO DE UN BLOQUE DE TABLA REUTILIZABLE (SEMANAL O COMPLETO)
  const renderSingleTableBlock = (daysChunk: SesionDia[]) => {
    return (
      <table
        style={{
          borderCollapse: "collapse",
          tableLayout: "fixed",
          width: "max-content",
          minWidth: "100%",
          fontSize: "12px",
          color: "#0f172a",
          userSelect: isDragging ? "none" : "auto",
        }}
      >
        <colgroup>
          <col style={{ width: "140px", minWidth: "140px" }} />
          {daysChunk.map((d) => (
            <col key={`col_${d.id}`} style={{ width: "110px", minWidth: "110px" }} />
          ))}
        </colgroup>
        <thead
          style={{
            position: isContextSticky ? "sticky" : "static",
            top: isContextSticky ? 0 : "auto",
            zIndex: 40,
            background: "#ffffff",
            boxShadow: isContextSticky ? "0 4px 12px rgba(0,0,0,0.12)" : "none",
          }}
        >
          {/* FILA 1: PERÍODO */}
          {visibleRows.periodo && (
            <tr style={{ height: "34px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 50,
                  background: "#f1f5f9",
                  padding: "6px 12px",
                  textAlign: "left",
                  fontWeight: 800,
                  width: "140px",
                  minWidth: "140px",
                  borderRight: "2px solid #cbd5e1",
                  color: "#1e3a8a",
                }}
              >
                Período
              </th>
              {groupConsecutiveDays(daysChunk, "periodo").map((item) => {
                if (!item.isStart) return null;

                const d = item.day;
                const idx = item.originalIndex;
                const colSpan = item.colSpan;
                const rIdx = allInteractiveRows.indexOf("periodo");
                const isInRange = isCellInRange(rIdx, idx);
                const isInFill = isCellInFillPreview(rIdx, idx);
                const isCorner = isBottomRightCornerCell(rIdx, idx);
                const pVal = d.periodo || "";
                const normalizedP =
                  pVal.toUpperCase() === "P" || pVal.toLowerCase().includes("pre")
                    ? "Pretemporada"
                    : pVal.toUpperCase() === "C" || pVal.toLowerCase().includes("comp")
                    ? "Competitivo"
                    : pVal.toUpperCase() === "T" || pVal.toLowerCase().includes("trans")
                    ? "Transitorio"
                    : pVal;
                const bg =
                  normalizedP === "Pretemporada"
                    ? "#dbeafe"
                    : normalizedP === "Competitivo"
                    ? "#fee2e2"
                    : normalizedP === "Transitorio"
                    ? "#fef3c7"
                    : "#ffffff";

                const lastGroupDayISO = daysChunk[Math.min(idx + colSpan - 1, daysChunk.length - 1)].fecha;
                const borderRight = isSundayDate(lastGroupDayISO) ? "3px solid #0f172a" : "1px solid #f1f5f9";

                return (
                  <td
                    key={d.id}
                    colSpan={colSpan}
                    onMouseDown={(e) => handleCellMouseDown("periodo", idx, e)}
                    onMouseEnter={() => handleCellMouseEnter("periodo", idx)}
                    style={{
                      padding: "4px",
                      textAlign: "center",
                      minWidth: `${110 * colSpan}px`,
                      width: `${110 * colSpan}px`,
                      borderRight,
                      position: "relative",
                      background: isInFill ? "#bae6fd" : isInRange ? "#eff6ff" : bg,
                      boxShadow: isInRange ? "inset 0 0 0 2px #1e3a8a" : "none",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%" }}>
                      <select
                        id={`cell_input_periodo_${d.id}`}
                        value={normalizedP || ""}
                        onChange={(e) => {
                          const newVal = e.target.value;
                          for (let sIdx = 0; sIdx < colSpan; sIdx++) {
                            const targetDayObj = daysChunk[idx + sIdx];
                            if (targetDayObj) handleCellUpdate(targetDayObj.id, "periodo", newVal);
                          }
                        }}
                        style={{
                          appearance: "none",
                          WebkitAppearance: "none",
                          MozAppearance: "none",
                          background: pVal.toLowerCase().includes("pre")
                            ? "#dbeafe"
                            : pVal.toLowerCase().includes("comp")
                            ? "#fee2e2"
                            : pVal.toLowerCase().includes("trans")
                            ? "#fef3c7"
                            : "#ffffff",
                          color: pVal.toLowerCase().includes("pre")
                            ? "#1e40af"
                            : pVal.toLowerCase().includes("comp")
                            ? "#991b1b"
                            : pVal.toLowerCase().includes("trans")
                            ? "#92400e"
                            : "#475569",
                          border: `1.5px solid ${
                            pVal.toLowerCase().includes("pre")
                              ? "#93c5fd"
                              : pVal.toLowerCase().includes("comp")
                              ? "#fca5a5"
                              : pVal.toLowerCase().includes("trans")
                              ? "#fcd34d"
                              : "#cbd5e1"
                          }`,
                          borderRadius: "12px",
                          padding: "3px 12px",
                          fontSize: "11px",
                          fontWeight: 900,
                          textAlign: "center",
                          textAlignLast: "center",
                          outline: "none",
                          cursor: "pointer",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                          letterSpacing: "0.03em",
                          textTransform: "uppercase",
                        }}
                      >
                        <option value="">— SELECCIONAR PERÍODO —</option>
                        <option value="Pretemporada">PRETEMPORADA</option>
                        <option value="Competitivo">COMPETITIVO</option>
                        <option value="Transitorio">TRANSITORIO</option>
                      </select>
                    </div>

                    {isCorner && (
                      <div
                        onMouseDown={(e) => handleFillHandleMouseDown(e)}
                        title="Arrastrar para rellenar"
                        style={{
                          position: "absolute",
                          bottom: "-3px",
                          right: "-3px",
                          width: "7px",
                          height: "7px",
                          background: "#1e3a8a",
                          border: "1px solid #ffffff",
                          cursor: "crosshair",
                          zIndex: 20,
                        }}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          )}

          {/* FILA 2: SUBPERIODO */}
          {visibleRows.subperiodo && (
            <tr style={{ height: "32px", background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                  background: "#f1f5f9",
                  padding: "6px 12px",
                  textAlign: "left",
                  fontWeight: 800,
                  width: "140px",
                  minWidth: "140px",
                  borderRight: "2px solid #cbd5e1",
                  color: "#0284c7",
                }}
              >
                Subperiodo
              </th>
              {groupConsecutiveDays(daysChunk, "subperiodo").map((item) => {
                if (!item.isStart) return null;

                const d = item.day;
                const idx = item.originalIndex;
                const colSpan = item.colSpan;
                const rIdx = allInteractiveRows.indexOf("subperiodo");
                const isInRange = isCellInRange(rIdx, idx);
                const isInFill = isCellInFillPreview(rIdx, idx);
                const isCorner = isBottomRightCornerCell(rIdx, idx);

                const lastGroupDayISO = daysChunk[Math.min(idx + colSpan - 1, daysChunk.length - 1)].fecha;
                const borderRight = isSundayDate(lastGroupDayISO) ? "3px solid #0f172a" : "1px solid #f1f5f9";
                const subText = d.subperiodo ? d.subperiodo.trim() : "";
                const customBgColor = subText ? subperiodoColors[subText] || "#e0f2fe" : "#ffffff";

                return (
                  <td
                    key={d.id}
                    colSpan={colSpan}
                    onMouseDown={(e) => handleCellMouseDown("subperiodo", idx, e)}
                    onMouseEnter={() => handleCellMouseEnter("subperiodo", idx)}
                    style={{
                      padding: "2px 4px",
                      textAlign: "center",
                      minWidth: `${110 * colSpan}px`,
                      width: `${110 * colSpan}px`,
                      borderRight,
                      position: "relative",
                      background: isInFill ? "#bae6fd" : isInRange ? "#f0f9ff" : customBgColor,
                      boxShadow: isInRange ? "inset 0 0 0 2px #0284c7" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                      <input
                        id={`cell_input_subperiodo_${d.id}`}
                        type="text"
                        value={d.subperiodo || ""}
                        onChange={(e) => {
                          const newVal = e.target.value;
                          for (let sIdx = 0; sIdx < colSpan; sIdx++) {
                            const targetDayObj = daysChunk[idx + sIdx];
                            if (targetDayObj) handleCellUpdate(targetDayObj.id, "subperiodo", newVal);
                          }
                        }}
                        placeholder=""
                        style={{
                          width: "100%",
                          background: "transparent",
                          border: "none",
                          fontSize: "11px",
                          fontWeight: 800,
                          textAlign: "center",
                          outline: "none",
                          color: "#0369a1",
                        }}
                      />
                      {subText && (
                        <input
                          type="color"
                          value={subperiodoColors[subText] || "#e0f2fe"}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            setSubperiodoColors((prev) => {
                              const updated = { ...prev, [subText]: newColor };
                              if (typeof window !== "undefined") {
                                localStorage.setItem("subperiodo_colors_map", JSON.stringify(updated));
                              }
                              return updated;
                            });
                          }}
                          title="Cambiar color de fondo del subperiodo"
                          style={{
                            width: "18px",
                            height: "18px",
                            padding: 0,
                            border: "1px solid #cbd5e1",
                            borderRadius: "4px",
                            cursor: "pointer",
                            background: "transparent",
                            outline: "none",
                          }}
                        />
                      )}
                    </div>
                    {isCorner && (
                      <div
                        onMouseDown={(e) => handleFillHandleMouseDown(e)}
                        title="Arrastrar para rellenar"
                        style={{
                          position: "absolute",
                          bottom: "-3px",
                          right: "-3px",
                          width: "7px",
                          height: "7px",
                          background: "#0284c7",
                          border: "1px solid #ffffff",
                          cursor: "crosshair",
                          zIndex: 20,
                        }}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          )}

          {/* FILA 3: MES */}
          {visibleRows.mes && (
            <tr style={{ height: "28px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                  background: "#f1f5f9",
                  padding: "4px 12px",
                  textAlign: "left",
                  fontWeight: 800,
                  width: "140px",
                  minWidth: "140px",
                  borderRight: "2px solid #cbd5e1",
                  color: "#475569",
                }}
              >
                Mes
              </th>
              {daysChunk.map((d) => (
                <td
                  key={d.id}
                  style={{
                    padding: "4px",
                    textAlign: "center",
                    minWidth: "110px",
                    width: "110px",
                    borderRight: isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #f1f5f9",
                    fontWeight: 800,
                    fontSize: "10.5px",
                    color: "#64748b",
                    letterSpacing: "0.04em",
                  }}
                >
                  {getMesDisplayLabel(d.fecha)}
                </td>
              ))}
            </tr>
          )}

          {/* FILA 4: DÍA (HOY EN FONDO ROJO VIVO) */}
          {visibleRows.dia && (
            <tr style={{ height: "30px", background: "#0f172a", color: "#ffffff", borderBottom: "1px solid #0f172a" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                  background: "#0f172a",
                  color: "#ffffff",
                  padding: "4px 12px",
                  textAlign: "left",
                  fontWeight: 800,
                  width: "140px",
                  minWidth: "140px",
                  borderRight: "2px solid #cbd5e1",
                }}
              >
                Día
              </th>
              {daysChunk.map((d) => {
                const isToday = d.fecha === todayISO;
                return (
                  <td
                    key={d.id}
                    style={{
                      padding: "4px",
                      textAlign: "center",
                      minWidth: "110px",
                      width: "110px",
                      borderRight: isSundayDate(d.fecha) ? "3px solid #ffffff" : "1px solid #334155",
                      fontWeight: 900,
                      fontSize: "11.5px",
                      background: isToday ? "#dc2626" : "transparent",
                      color: "#ffffff",
                    }}
                  >
                    {formatDiaCorto(d.fecha)}
                  </td>
                );
              })}
            </tr>
          )}

          {/* FILA 5: Nº SEMANA */}
          {visibleRows.semana && (
            <tr style={{ height: "28px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                  background: "#f1f5f9",
                  padding: "4px 12px",
                  textAlign: "left",
                  fontWeight: 800,
                  width: "140px",
                  minWidth: "140px",
                  borderRight: "2px solid #cbd5e1",
                  color: "#475569",
                }}
              >
                Nº Semana
              </th>
              {groupConsecutiveWeeks(daysChunk, semana1StartDate, days).map((item) => {
                if (!item.isStart) return null;

                const d = item.day;
                const idx = item.originalIndex;
                const colSpan = item.colSpan;
                const weekNum = item.weekNum;

                const lastGroupDayISO = daysChunk[Math.min(idx + colSpan - 1, daysChunk.length - 1)].fecha;
                const borderRight = isSundayDate(lastGroupDayISO) ? "3px solid #0f172a" : "1px solid #f1f5f9";

                return (
                  <td
                    key={d.id}
                    colSpan={colSpan}
                    style={{
                      padding: "4px",
                      textAlign: "center",
                      minWidth: `${110 * colSpan}px`,
                      width: `${110 * colSpan}px`,
                      borderRight,
                      fontWeight: 900,
                      color: "#1e3a8a",
                      fontSize: "13px",
                      background: "#e0f2fe",
                    }}
                  >
                    {weekNum}
                  </td>
                );
              })}
            </tr>
          )}

          {/* FILA 6: MD */}
          {visibleRows.md && (
            <tr style={{ height: "30px", background: "#eff6ff", borderBottom: "1px solid #e2e8f0" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                  background: "#dbeafe",
                  padding: "4px 12px",
                  textAlign: "left",
                  fontWeight: 900,
                  width: "140px",
                  minWidth: "140px",
                  borderRight: "2px solid #cbd5e1",
                  color: "#1e40af",
                }}
              >
                MD
              </th>
              {daysChunk.map((d) => {
                const isMDMatch = d.md === "MD";
                return (
                  <td
                    key={d.id}
                    style={{
                      padding: "4px",
                      textAlign: "center",
                      minWidth: "110px",
                      width: "110px",
                      borderRight: isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #bfdbfe",
                      fontWeight: 900,
                      fontSize: "11.5px",
                      color: isMDMatch ? "#dc2626" : "#1e40af",
                      background: isMDMatch ? "#fee2e2" : "transparent",
                    }}
                  >
                    {d.md || "—"}
                  </td>
                );
              })}
            </tr>
          )}

          {/* FILA ESCUDO (ENCIMA DE RIVAL) */}
          {visibleRows.escudo && (
            <tr style={{ height: "36px", background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                  background: "#f1f5f9",
                  padding: "4px 12px",
                  textAlign: "left",
                  fontWeight: 800,
                  width: "140px",
                  minWidth: "140px",
                  borderRight: "2px solid #cbd5e1",
                  color: "#475569",
                  fontSize: "12px",
                }}
              >
                Escudo
              </th>
              {daysChunk.map((d, idx) => {
                const rIdx = allInteractiveRows.indexOf("escudo");
                const isInRange = isCellInRange(rIdx, idx);
                const isInFill = isCellInFillPreview(rIdx, idx);

                const rivalName = (d.rival || "").trim();
                const escudoUrl = rivalName ? findRivalEscudoUrl(rivalName, rivalesList) : "";

                return (
                  <td
                    key={`escudo_${d.id}`}
                    onMouseDown={(e) => handleCellMouseDown("escudo", idx, e)}
                    onMouseEnter={() => handleCellMouseEnter("escudo", idx)}
                    onClick={() => {
                      setEscudoModalData({
                        dayId: d.id,
                        fecha: d.fecha,
                        nombre: rivalName || "",
                        escudoUrl: escudoUrl || "",
                      });
                    }}
                    style={{
                      padding: "2px 4px",
                      textAlign: "center",
                      verticalAlign: "middle",
                      minWidth: "110px",
                      width: "110px",
                      height: "36px",
                      borderRight: isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #f1f5f9",
                      position: "relative",
                      cursor: "pointer",
                      background: isInFill ? "#bae6fd" : isInRange ? "#f1f5f9" : "#ffffff",
                    }}
                    title={rivalName ? `Click para editar escudo/URL de ${rivalName} en BBDD` : "Click para asignar escudo/rival en BBDD"}
                  >
                    {escudoUrl ? (
                      <img
                        src={escudoUrl || undefined}
                        alt={rivalName}
                        style={{
                          maxHeight: "26px",
                          maxWidth: "26px",
                          objectFit: "contain",
                          display: "inline-block",
                          verticalAlign: "middle",
                          transition: "transform 0.15s ease",
                        }}
                      />
                    ) : rivalName ? (
                      <span style={{ fontSize: "14px", opacity: 0.75, display: "inline-flex", alignItems: "center", gap: "2px" }} title={rivalName}>
                        🛡️<span style={{ fontSize: "9px", color: "#0284c7", fontWeight: 900 }}>+</span>
                      </span>
                    ) : (
                      <span style={{ fontSize: "10px", opacity: 0.25, color: "#64748b" }} title="Click para asignar escudo">+🛡️</span>
                    )}
                  </td>
                );
              })}
            </tr>
          )}

          {/* FILA 7: RIVAL */}
          {visibleRows.rival && (
            <tr style={{ height: "32px", background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                  background: "#f1f5f9",
                  padding: "6px 12px",
                  textAlign: "left",
                  fontWeight: 800,
                  width: "140px",
                  minWidth: "140px",
                  borderRight: "2px solid #cbd5e1",
                  color: "#b91c1c",
                }}
              >
                Rival
              </th>
              {daysChunk.map((d, idx) => {
                const rIdx = allInteractiveRows.indexOf("rival");
                const isInRange = isCellInRange(rIdx, idx);
                const isInFill = isCellInFillPreview(rIdx, idx);
                const isCorner = isBottomRightCornerCell(rIdx, idx);

                const matchInfo = getMatchResultStatus(d, eventosBloquesMap);
                const hasMatch = Boolean(d.rival?.trim() || isMatchDayEvent(d, eventosBloquesMap));

                let rivalBg = "#ffffff"; // FILA DE RIVAL BLANCA POR DEFECTO
                let rivalTextColor = "#991b1b";

                if (isInFill) {
                  rivalBg = "#bae6fd";
                } else if (isInRange) {
                  rivalBg = "#fef2f2";
                } else if (matchInfo.status === "win") {
                  rivalBg = "#dcfce7"; // Verde suave si ha ganado
                  rivalTextColor = "#15803d";
                } else if (matchInfo.status === "draw") {
                  rivalBg = "#fef9c3"; // Amarillo suave si ha empatado
                  rivalTextColor = "#854d0e";
                } else if (matchInfo.status === "loss") {
                  rivalBg = "#fee2e2"; // Rojo suave si ha perdido
                  rivalTextColor = "#b91c1c";
                }

                return (
                  <td
                    key={d.id}
                    onMouseDown={(e) => handleCellMouseDown("rival", idx, e)}
                    onMouseEnter={() => handleCellMouseEnter("rival", idx)}
                    style={{
                      padding: "2px 4px",
                      textAlign: "center",
                      minWidth: "110px",
                      width: "110px",
                      borderRight: isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #f1f5f9",
                      position: "relative",
                      background: rivalBg,
                      boxShadow: isInRange ? "inset 0 0 0 2px #dc2626" : "none",
                      transition: "background 0.15s ease",
                    }}
                  >
                    <input
                      id={`cell_input_rival_${d.id}`}
                      type="text"
                      value={d.rival || ""}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleCellUpdate(d.id, "rival", e.target.value)}
                      placeholder=""
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        fontSize: "11.5px",
                        fontWeight: 800,
                        textAlign: "center",
                        outline: "none",
                        color: rivalTextColor,
                      }}
                    />

                    {/* CAMPO DE RESULTADO DEL PARTIDO (0-0) EN LA MISMA CELDA JUSTO DEBAJO DEL RIVAL */}
                    {hasMatch && (
                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "2px", marginTop: "1px" }} onMouseDown={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={d.resultado_partido || (d.rival ? (d.rival.match(/\((\d+\s*[-:]\s*\d+)\)/)?.[1]?.replace(":", "-")) : "") || ""}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleCellUpdate(d.id, "resultado_partido" as keyof SesionDia, e.target.value)}
                          placeholder="0-0"
                          style={{
                            width: "48px",
                            background: "transparent",
                            border: "none",
                            fontSize: "9.5px",
                            fontWeight: 900,
                            textAlign: "center",
                            outline: "none",
                            color: rivalTextColor,
                            borderBottom: (d.resultado_partido || (d.rival && d.rival.includes("("))) ? "none" : "1px dashed #cbd5e1",
                          }}
                        />
                      </div>
                    )}

                    {isCorner && (
                      <div
                        onMouseDown={(e) => handleFillHandleMouseDown(e)}
                        title="Arrastrar para rellenar"
                        style={{
                          position: "absolute",
                          bottom: "-3px",
                          right: "-3px",
                          width: "7px",
                          height: "7px",
                          background: "#dc2626",
                          border: "1px solid #ffffff",
                          cursor: "crosshair",
                          zIndex: 20,
                        }}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          )}

          {/* FILA 8: EVENTO (DESPLEGABLE CÓDIGOS DE EVENTO - ESTADO ORIGINAL) */}
          {visibleRows.evento && (
            <tr style={{ height: "36px", background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                  background: "#f1f5f9",
                  padding: "6px 12px",
                  textAlign: "left",
                  fontWeight: 800,
                  width: "140px",
                  minWidth: "140px",
                  borderRight: "2px solid #cbd5e1",
                  color: "#1e3a8a",
                }}
              >
                Evento General
              </th>
              {daysChunk.map((d, idx) => {
                const isPre = d.fecha && d.fecha < "2026-07-01";
                const evVal = isPre ? "" : (d.evento || "");
                const rIdx = allInteractiveRows.indexOf("evento");
                const isInRange = isCellInRange(rIdx, idx);
                const isInFill = isCellInFillPreview(rIdx, idx);
                const isCorner = isBottomRightCornerCell(rIdx, idx);
                const isSel = selectedCell?.rowKey === "evento" && selectedCell?.dayId === d.id;
                const isDrag = isDragging && activeDragRow === "evento" && dragStartIdx !== null && dragCurrentIdx !== null && idx >= Math.min(dragStartIdx, dragCurrentIdx) && idx <= Math.max(dragStartIdx, dragCurrentIdx);
                const isHovered = hoverCell?.rowKey === "evento" && hoverCell?.dayId === d.id;
                const matchedTipo = isPre ? null : tiposEvento.find((t) => t.codigo.toLowerCase() === evVal.toLowerCase());
                const cellBg = matchedTipo ? matchedTipo.color : isDrag ? "#bfdbfe" : isSel ? "#eff6ff" : "#ffffff";
                const textColor = matchedTipo ? "#ffffff" : "#64748b";
                const showControls = !isPre && Boolean(evVal || isSel || isHovered);

                return (
                  <td
                    key={d.id}
                    onMouseDown={(e) => {
                      const targetTag = (e.target as HTMLElement).tagName.toLowerCase();
                      if (targetTag === "select" || targetTag === "option" || targetTag === "input") {
                        return;
                      }
                      handleCellMouseDown("evento", idx, e);
                    }}
                    onMouseEnter={() => {
                      setHoverCell({ rowKey: "evento", dayId: d.id });
                      handleCellMouseEnter("evento", idx);
                    }}
                    onMouseLeave={() => setHoverCell(null)}
                    style={{
                      padding: "0",
                      textAlign: "center",
                      minWidth: "110px",
                      width: "110px",
                      borderRight: isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #f1f5f9",
                      position: "relative",
                      background: isInFill ? "#bae6fd" : isInRange ? "#eff6ff" : cellBg,
                      boxShadow: isInRange ? "inset 0 0 0 2px #1e3a8a" : "none",
                      transition: "background 0.15s ease",
                    }}
                  >
                    <select
                      id={`cell_input_evento_${d.id}`}
                      value={evVal || ""}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleCellUpdate(d.id, "evento", val);
                      }}
                      style={{
                        width: "100%",
                        height: "100%",
                        background: "transparent",
                        border: "none",
                        fontSize: "13px",
                        fontWeight: 900,
                        textAlign: "center",
                        textAlignLast: "center",
                        outline: "none",
                        cursor: "pointer",
                        color: textColor,
                        padding: "6px 0",
                        opacity: showControls ? 1 : 0,
                        appearance: matchedTipo ? "none" : undefined,
                        WebkitAppearance: matchedTipo ? "none" : undefined,
                      }}
                    >
                      <option value="" style={{ color: "#0f172a", background: "#ffffff" }} />
                      {tiposEvento.map((t) => (
                        <option key={t.codigo} value={t.codigo} style={{ color: "#0f172a", background: "#ffffff", fontWeight: 800 }}>
                          {t.codigo}
                        </option>
                      ))}
                    </select>

                    {isCorner && (
                      <div
                        onMouseDown={(e) => handleFillHandleMouseDown(e)}
                        title="Arrastrar para rellenar"
                        style={{
                          position: "absolute",
                          bottom: "-3px",
                          right: "-3px",
                          width: "7px",
                          height: "7px",
                          background: matchedTipo ? "#ffffff" : "#1e3a8a",
                          border: "1px solid #0f172a",
                          cursor: "crosshair",
                          zIndex: 20,
                        }}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          )}

          {/* FILAS DE EVENTOS 1 A 6 (SINCRONIZADOS Y DIRECTAMENTE EDITABLES) */}
          {(["evento_1", "evento_2", "evento_3", "evento_4", "evento_5", "evento_6"] as const).map((eventoKey, eventoIdx) => {
            const rowVisible = visibleRows[eventoKey as keyof typeof visibleRows];
            if (!rowVisible) return null;
            const label = `Evento ${eventoIdx + 1}`;
            return (
              <tr key={eventoKey} style={{ height: "32px", background: "#ffffff", borderBottom: "1px solid #cbd5e1" }}>
                <th
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 10,
                    background: "#f1f5f9",
                    padding: "4px 12px",
                    textAlign: "left",
                    fontWeight: 800,
                    fontSize: "11px",
                    width: "140px",
                    minWidth: "140px",
                    borderRight: "2px solid #cbd5e1",
                    color: "#334155",
                  }}
                >
                  {label}
                </th>
                {daysChunk.map((d, idx) => {
                  const rIdx = rowIndicesMap.get(eventoKey) ?? -1;
                  const isInRange = isCellInRange(rIdx, idx);
                  const isInFill = isCellInFillPreview(rIdx, idx);
                  const isCorner = isBottomRightCornerCell(rIdx, idx);

                  const isPre = d.fecha && d.fecha < "2026-07-01";
                  const slotKey = `${d.id}_slot_${eventoIdx}`;
                  const slotKeyFecha = `${d.fecha}_slot_${eventoIdx}`;
                  const evBlock = isPre ? null : (eventosBloquesMap[slotKey] || eventosBloquesMap[slotKeyFecha]);
                  let rawVal = isPre ? "" : (evBlock?.tipo || (d as any)[eventoKey] || "").trim();
                  const EXCLUDED_SPECIFIC = new Set(["E", "PAL", "PV", "PL", "V", "PAV", "P"]);
                  if (EXCLUDED_SPECIFIC.has(rawVal.toUpperCase()) || isPre) {
                    rawVal = "";
                  }
                  const currentVal = rawVal;

                  const matchedTipo = tiposEventoConfig.find(
                    (t) => t.codigo.toLowerCase() === currentVal.toLowerCase()
                  );

                  const bg = matchedTipo ? matchedTipo.bg : (isInFill ? "#bae6fd" : isInRange ? "#f0f9ff" : currentVal ? "#f8fafc" : "#ffffff");
                  const textColor = matchedTipo ? matchedTipo.color : "#0f172a";
                  const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #cbd5e1";

                  return (
                    <td
                      key={d.id}
                      onMouseDown={(e) => handleCellMouseDown(eventoKey, idx, e)}
                      onMouseEnter={() => handleCellMouseEnter(eventoKey, idx)}
                      style={{
                        padding: "2px",
                        textAlign: "center",
                        minWidth: "110px",
                        width: "110px",
                        borderRight,
                        position: "relative",
                        background: bg,
                        boxShadow: isInRange ? "inset 0 0 0 2px #0284c7" : "none",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <EventCellInput
                        value={currentVal}
                        textColor={textColor}
                        tiposConfig={tiposEventoConfig}
                        onCommit={(val) => {
                          handleCellUpdate(d.id, eventoKey, val);
                          handleEventoBlockUpdate(d.id, d.fecha, eventoIdx, "tipo", val);
                        }}
                        onOpenPicker={(rect) => {
                          setActivePickerCell({
                            dayId: d.id,
                            slotIdx: eventoIdx,
                            rowKey: eventoKey,
                            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
                          });
                        }}
                      />

                      {isCorner && (
                        <div
                          onMouseDown={(e) => handleFillHandleMouseDown(e)}
                          title="Arrastrar para rellenar"
                          style={{
                            position: "absolute",
                            bottom: "2px",
                            right: "2px",
                            width: "7px",
                            height: "7px",
                            background: "#0284c7",
                            border: "1px solid #ffffff",
                            borderRadius: "1px",
                            cursor: "crosshair",
                            zIndex: 10,
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {/* FILA 12: CARGA */}
          {visibleRows.carga && (
            <tr style={{ height: "32px", background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                  background: "#f1f5f9",
                  padding: "6px 12px",
                  textAlign: "left",
                  fontWeight: 800,
                  width: "140px",
                  minWidth: "140px",
                  borderRight: "2px solid #cbd5e1",
                  color: "#0f172a",
                }}
              >
                Carga
              </th>
              {daysChunk.map((d, idx) => {
                const rIdx = allInteractiveRows.indexOf("carga");
                const isInRange = isCellInRange(rIdx, idx);
                const isInFill = isCellInFillPreview(rIdx, idx);
                const isCorner = isBottomRightCornerCell(rIdx, idx);

                return (
                  <td
                    key={d.id}
                    onMouseDown={(e) => handleCellMouseDown("carga", idx, e)}
                    onMouseEnter={() => handleCellMouseEnter("carga", idx)}
                    style={{
                      padding: "2px 4px",
                      textAlign: "center",
                      minWidth: "110px",
                      width: "110px",
                      borderRight: isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #f1f5f9",
                      position: "relative",
                      background: isInFill ? "#bae6fd" : isInRange ? "#f1f5f9" : "#ffffff",
                      boxShadow: isInRange ? "inset 0 0 0 2px #0f172a" : "none",
                    }}
                  >
                    <input
                      id={`cell_input_carga_${d.id}`}
                      type="text"
                      inputMode="decimal"
                      value={d.carga ?? ""}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleCellUpdate(d.id, "carga", e.target.value === "" ? null : e.target.value)}
                      placeholder=""
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        fontSize: "12px",
                        fontWeight: 800,
                        textAlign: "center",
                        outline: "none",
                        color: "#0f172a",
                      }}
                    />
                    {isCorner && (
                      <div
                        onMouseDown={(e) => handleFillHandleMouseDown(e)}
                        title="Arrastrar para rellenar"
                        style={{
                          position: "absolute",
                          bottom: "-3px",
                          right: "-3px",
                          width: "7px",
                          height: "7px",
                          background: "#0f172a",
                          border: "1px solid #ffffff",
                          cursor: "crosshair",
                          zIndex: 20,
                        }}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          )}

          {/* FILA 10: VOLUMEN */}
          {visibleRows.volumen && (
            <tr style={{ height: "32px", background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                  background: "#f1f5f9",
                  padding: "6px 12px",
                  textAlign: "left",
                  fontWeight: 800,
                  width: "140px",
                  minWidth: "140px",
                  borderRight: "2px solid #cbd5e1",
                  color: "#0f172a",
                }}
              >
                Volumen
              </th>
              {daysChunk.map((d, idx) => {
                const rIdx = allInteractiveRows.indexOf("volumen");
                const isInRange = isCellInRange(rIdx, idx);
                const isInFill = isCellInFillPreview(rIdx, idx);
                const isCorner = isBottomRightCornerCell(rIdx, idx);

                return (
                  <td
                    key={d.id}
                    onMouseDown={(e) => handleCellMouseDown("volumen", idx, e)}
                    onMouseEnter={() => handleCellMouseEnter("volumen", idx)}
                    style={{
                      padding: "2px 4px",
                      textAlign: "center",
                      minWidth: "110px",
                      width: "110px",
                      borderRight: isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #f1f5f9",
                      position: "relative",
                      background: isInFill ? "#bae6fd" : isInRange ? "#f1f5f9" : "#ffffff",
                      boxShadow: isInRange ? "inset 0 0 0 2px #0f172a" : "none",
                    }}
                  >
                    <input
                      id={`cell_input_volumen_${d.id}`}
                      type="text"
                      inputMode="decimal"
                      value={d.volumen ?? ""}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleCellUpdate(d.id, "volumen", e.target.value === "" ? null : e.target.value)}
                      placeholder=""
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        fontSize: "12px",
                        fontWeight: 800,
                        textAlign: "center",
                        outline: "none",
                        color: "#0f172a",
                      }}
                    />
                    {isCorner && (
                      <div
                        onMouseDown={(e) => handleFillHandleMouseDown(e)}
                        title="Arrastrar para rellenar"
                        style={{
                          position: "absolute",
                          bottom: "-3px",
                          right: "-3px",
                          width: "7px",
                          height: "7px",
                          background: "#0f172a",
                          border: "1px solid #ffffff",
                          cursor: "crosshair",
                          zIndex: 20,
                        }}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          )}

          {/* FILA 11: INTENSIDAD */}
          {visibleRows.intensidad && (
            <tr style={{ height: "32px", background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                  background: "#f1f5f9",
                  padding: "6px 12px",
                  textAlign: "left",
                  fontWeight: 800,
                  width: "140px",
                  minWidth: "140px",
                  borderRight: "2px solid #cbd5e1",
                  color: "#0f172a",
                }}
              >
                Intensidad
              </th>
              {daysChunk.map((d, idx) => {
                const rIdx = allInteractiveRows.indexOf("intensidad");
                const isInRange = isCellInRange(rIdx, idx);
                const isInFill = isCellInFillPreview(rIdx, idx);
                const isCorner = isBottomRightCornerCell(rIdx, idx);

                return (
                  <td
                    key={d.id}
                    onMouseDown={(e) => handleCellMouseDown("intensidad", idx, e)}
                    onMouseEnter={() => handleCellMouseEnter("intensidad", idx)}
                    style={{
                      padding: "2px 4px",
                      textAlign: "center",
                      minWidth: "110px",
                      width: "110px",
                      borderRight: isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #f1f5f9",
                      position: "relative",
                      background: isInFill ? "#bae6fd" : isInRange ? "#f1f5f9" : "#ffffff",
                      boxShadow: isInRange ? "inset 0 0 0 2px #0f172a" : "none",
                    }}
                  >
                    <input
                      id={`cell_input_intensidad_${d.id}`}
                      type="text"
                      inputMode="decimal"
                      value={d.intensidad ?? ""}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleCellUpdate(d.id, "intensidad", e.target.value === "" ? null : e.target.value)}
                      placeholder=""
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        fontSize: "12px",
                        fontWeight: 800,
                        textAlign: "center",
                        outline: "none",
                        color: "#0f172a",
                      }}
                    />
                    {isCorner && (
                      <div
                        onMouseDown={(e) => handleFillHandleMouseDown(e)}
                        title="Arrastrar para rellenar"
                        style={{
                          position: "absolute",
                          bottom: "-3px",
                          right: "-3px",
                          width: "7px",
                          height: "7px",
                          background: "#0f172a",
                          border: "1px solid #ffffff",
                          cursor: "crosshair",
                          zIndex: 20,
                        }}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          )}

          {/* FILA 12: COMENTARIO MICRO */}
          {visibleRows.comentario && (
            <tr style={{ height: "40px", background: "#ffffff" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                  background: "#f1f5f9",
                  padding: "6px 12px",
                  textAlign: "left",
                  fontWeight: 800,
                  width: "140px",
                  minWidth: "140px",
                  borderRight: "2px solid #cbd5e1",
                  color: "#475569",
                }}
              >
                Comentario micro
              </th>
              {(() => {
                const colSpan = daysChunk.length;
                const d = daysChunk[0]; // Guardamos el comentario del microciclo en el primer día de la semana
                const rIdx = allInteractiveRows.indexOf("comentario");
                const isInRange = isCellInRange(rIdx, 0);
                const isInFill = isCellInFillPreview(rIdx, 0);
                const isCorner = isBottomRightCornerCell(rIdx, 0);
                
                const lastGroupDayISO = daysChunk[daysChunk.length - 1].fecha;
                const borderRight = isSundayDate(lastGroupDayISO) ? "3px solid #0f172a" : "1px solid #f1f5f9";

                return (
                  <td
                    key={d.id}
                    colSpan={colSpan}
                    onMouseDown={(e) => handleCellMouseDown("comentario", 0, e)}
                    onMouseEnter={() => handleCellMouseEnter("comentario", 0)}
                    style={{
                      padding: "2px 4px",
                      textAlign: "center",
                      minWidth: `${110 * colSpan}px`,
                      width: `${110 * colSpan}px`,
                      borderRight,
                      position: "relative",
                      background: isInFill ? "#bae6fd" : isInRange ? "#f8fafc" : d.comentario_microciclo ? "#f8fafc" : "#ffffff",
                      boxShadow: isInRange ? "inset 0 0 0 2px #475569" : "none",
                    }}
                  >
                    <input
                      id={`cell_input_comentario_${d.id}`}
                      type="text"
                      value={d.comentario_microciclo || ""}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleCellUpdate(d.id, "comentario_microciclo", e.target.value)}
                      placeholder=""
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        fontSize: "11px",
                        fontWeight: 600,
                        textAlign: "center",
                        outline: "none",
                        color: "#334155",
                      }}
                    />
                    {isCorner && (
                      <div
                        onMouseDown={(e) => handleFillHandleMouseDown(e)}
                        title="Arrastrar para rellenar"
                        style={{
                          position: "absolute",
                          bottom: "-3px",
                          right: "-3px",
                          width: "7px",
                          height: "7px",
                          background: "#475569",
                          border: "1px solid #ffffff",
                          cursor: "crosshair",
                          zIndex: 20,
                        }}
                      />
                    )}
                  </td>
                );
              })()}
            </tr>
          )}
        </thead>
        <tbody>

          {/* SECCIÓN DISPONIBILIDAD DE DEPORTISTAS */}
          {jugadoresList.length > 0 && (
            <>
              {/* FILA SEPARADORA - HEADER DISPONIBILIDAD */}
              <tr
                className={!showDisponibilidad ? "no-print" : ""}
                style={{ background: "#0f172a", color: "#ffffff", height: "34px", cursor: "pointer" }}
                onClick={() => setShowDisponibilidad((prev) => !prev)}
              >
                <th
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 20,
                    background: "#0f172a",
                    padding: "4px 8px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: 900,
                    width: "140px",
                    minWidth: "140px",
                    borderRight: "2px solid #cbd5e1",
                    color: "#ffffff",
                  }}
                >
                  <span style={{ fontSize: "10px", fontWeight: 800, color: "#38bdf8", display: "flex", alignItems: "center", gap: "4px" }}>
                    {showDisponibilidad ? "▼" : "▶"} Disponibilidad ({filteredAndSortedJugadores.length})
                  </span>
                </th>
                <th
                  colSpan={daysChunk.length}
                  style={{
                    background: "#0f172a",
                    padding: "4px 12px",
                  }}
                />
              </tr>

              {showDisponibilidad && (<>
              {/* FILA DISCRETA DE RESUMEN DE DISPONIBLES POR DÍA (ej. 24+2) */}
              <tr style={{ background: "#f8fafc", color: "#64748b", height: "24px", borderBottom: "1px solid #e2e8f0" }}>
                <th
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 12,
                    background: "#f8fafc",
                    padding: "2px 10px",
                    textAlign: "left",
                    fontWeight: 700,
                    fontSize: "10.5px",
                    width: "140px",
                    minWidth: "140px",
                    borderRight: "2px solid #cbd5e1",
                    color: "#64748b",
                  }}
                >
                  Disp. (Campo+GK)
                </th>
                {daysChunk.map((d) => {
                  let campoCount = 0;
                  let gkCount = 0;

                  filteredAndSortedJugadores.forEach((p) => {
                    const codeVal = normalizeDisponibilidadCodigo(estadosMap[`${p.id}_${d.id}`] || estadosMap[`${p.id}_${d.fecha}`]);
                    // Cuenta disponible si tiene 'D', 'DCS' o 'DCI'
                    if (codeVal === "D" || codeVal === "DCS" || codeVal === "DCI") {
                      const isGK = (p.posicion || "").toUpperCase().includes("PORT");
                      if (isGK) {
                        gkCount++;
                      } else {
                        campoCount++;
                      }
                    }
                  });

                  const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #f1f5f9";
                  const cellText = (campoCount === 0 && gkCount === 0) ? "" : `${campoCount}+${gkCount}`;

                  return (
                    <td
                      key={d.id}
                      style={{
                        padding: "1px 0",
                        textAlign: "center",
                        minWidth: "110px",
                        width: "110px",
                        borderRight,
                        fontWeight: 800,
                        fontSize: "11px",
                        color: "#475569",
                        background: "#f8fafc",
                      }}
                      title={cellText ? `${campoCount} jugadoras de campo + ${gkCount} porteros disponibles` : ""}
                    >
                      {cellText}
                    </td>
                  );
                })}
              </tr>

              {/* FILA INDIVIDUAL POR CADA JUGADORA (ORDENADA Y FILTRADA) */}
              {filteredAndSortedJugadores.map((p) => {
                const playerLabel = (p.apodo || p.nombre || "").toUpperCase();
                const isHighlighted = Boolean(highlightedPlayers[p.id]);

                return (
                  <tr key={p.id} style={{ height: "26px", background: isHighlighted ? "#fef2f2" : "#ffffff", borderBottom: "1px solid #f1f5f9" }}>
                    <th
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 10,
                        background: isHighlighted ? "#fef2f2" : "#f8fafc",
                        padding: "2px 8px",
                        textAlign: "left",
                        fontWeight: isHighlighted ? 900 : 800,
                        fontSize: "11px",
                        width: "140px",
                        minWidth: "140px",
                        borderRight: "2px solid #cbd5e1",
                        borderTop: isHighlighted ? "2.5px solid #dc2626" : "none",
                        borderBottom: isHighlighted ? "2.5px solid #dc2626" : "1px solid #f1f5f9",
                        color: isHighlighted ? "#dc2626" : "#1e293b",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={`${p.nombre} (${p.posicion || "Sin pos."})`}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHighlightedPlayers((prev) => ({
                              ...prev,
                              [p.id]: !prev[p.id],
                            }));
                          }}
                          title={isHighlighted ? "Quitar destacado red" : "Destacar jugador con bordes rojos y negrita"}
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            padding: 0,
                            fontSize: "11px",
                            lineHeight: 1,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {isHighlighted ? "🔴" : "⚪"}
                        </button>
                        <span style={{ fontWeight: isHighlighted ? 900 : 800 }}>{playerLabel}</span>
                      </div>
                    </th>
                    {daysChunk.map((d, idx) => {
                      const key = `${p.id}_${d.id}`;
                      const keyFecha = `${p.id}_${d.fecha}`;
                      const codeVal = normalizeDisponibilidadCodigo(estadosMap[key] || estadosMap[keyFecha]);
                      const info = getDisponibilidadInfo(codeVal);

                      const bg = info ? info.color : "#ffffff";
                      const textColor = info ? info.textColor : "#64748b";
                      const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #f1f5f9";

                      const rowKey = `player_${p.id}`;
                      const rIdx = allInteractiveRows.indexOf(rowKey);
                      const isInRange = isCellInRange(rIdx, idx);
                      const isInFill = isCellInFillPreview(rIdx, idx);
                      const isCorner = isBottomRightCornerCell(rIdx, idx);

                      return (
                        <td
                          key={d.id}
                          id={`cell_input_${rowKey}_${d.id}`}
                          tabIndex={0}
                          onMouseDown={(e) => handleCellMouseDown(rowKey, idx, e)}
                          onMouseEnter={() => {
                            setHoverCell({ rowKey, dayId: d.id });
                            handleCellMouseEnter(rowKey, idx);
                          }}
                          onMouseLeave={() => setHoverCell(null)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuCell(openMenuCell === key ? null : key);
                          }}
                          style={{
                            padding: "0",
                            textAlign: "center",
                            minWidth: "110px",
                            width: "110px",
                            height: "26px",
                            borderRight,
                            borderTop: isHighlighted ? "2.5px solid #dc2626" : "none",
                            borderBottom: isHighlighted ? "2.5px solid #dc2626" : "none",
                            position: "relative",
                            background: isInFill ? "#bae6fd" : isInRange ? (info ? info.color : "#dbeafe") : bg,
                            boxShadow: isInRange ? "inset 0 0 0 2.5px #0f172a" : "none",
                            cursor: "pointer",
                            userSelect: "none",
                            outline: "none",
                            transition: "background 0.15s ease",
                          }}
                        >
                          {/* TEXTO DE CÓDIGO DIRECTO E INDICADOR DE COMENTARIOS FIS/TEC */}
                          {(() => {
                            const estObj = (initialEstados || []).find(
                              (e: any) => e.jugador_id === p.id && (e.sesion_dia_id === d.id || e.sesion_dia_id === d.fecha)
                            );
                            const comFisText = estObj?.comentario_fisico;
                            const comTecText = estObj?.comentario_tecnico;
                            const comWelText = estObj?.comentario_wellness;
                            const hasComText = comFisText || comTecText || comWelText;
                            const tooltipTitle = [
                              comFisText ? `🏋️ CONDICIONAL: ${comFisText}` : "",
                              comTecText ? `⚽ TÉCNICO-TÁCTICO: ${comTecText}` : "",
                              comWelText ? `💚 WELLNESS: ${comWelText}` : "",
                            ].filter(Boolean).join(" \n");

                            return (
                              <div
                                title={tooltipTitle || undefined}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "11.5px",
                                  fontWeight: isHighlighted ? 900 : 800,
                                  color: isHighlighted && !info ? "#dc2626" : textColor,
                                  position: "relative",
                                }}
                              >
                                {codeVal || "—"}
                                
                              </div>
                            );
                          })()}

                          {/* POPOVER MENÚ DE OPCIONES DE DISPONIBILIDAD (al hacer doble clic) */}
                          {openMenuCell === key && (
                            <div
                              className="no-print"
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                position: "absolute",
                                top: "100%",
                                left: "50%",
                                transform: "translateX(-50%)",
                                zIndex: 60,
                                background: "#ffffff",
                                border: "1px solid #cbd5e1",
                                borderRadius: "8px",
                                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.25)",
                                padding: "6px",
                                display: "grid",
                                gridTemplateColumns: "repeat(2, 1fr)",
                                gap: "4px",
                                minWidth: "130px",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  handlePlayerDisponibilidadUpdate(p.id, d.id, "");
                                  setOpenMenuCell(null);
                                }}
                                style={{
                                  padding: "4px",
                                  background: "#f1f5f9",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "4px",
                                  fontSize: "10.5px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  color: "#64748b",
                                  gridColumn: "span 2",
                                }}
                              >
                                — Vacío
                              </button>
                              {CODIGOS_MANUALES.map((cod) => {
                                const infoCod = getDisponibilidadInfo(cod);
                                if (!infoCod) return null;
                                return (
                                  <button
                                    key={cod}
                                    type="button"
                                    onClick={() => {
                                      handlePlayerDisponibilidadUpdate(p.id, d.id, cod);
                                      setOpenMenuCell(null);
                                    }}
                                    style={{
                                      padding: "4px 6px",
                                      background: infoCod.color,
                                      color: infoCod.textColor,
                                      border: "none",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                      fontWeight: 900,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {cod}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* MANIVELA DE ARRASTRE TIPO EXCEL (EN LA ESQUINA INFERIOR DERECHA DEL RANGO SELECCIONADO) */}
                          {isCorner && (
                            <div
                              onMouseDown={(e) => handleFillHandleMouseDown(e)}
                              title="Arrastrar para rellenar disponibilidad (hacia abajo, arriba o lados)"
                              style={{
                                position: "absolute",
                                bottom: "-3px",
                                right: "-3px",
                                width: "7px",
                                height: "7px",
                                background: "#0f172a",
                                border: "1px solid #ffffff",
                                cursor: "crosshair",
                                zIndex: 25,
                              }}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              </>)}
            </>
          )}

          {/* SECCIÓN COMENTARIOS POR DEPORTISTA */}
          {jugadoresList.length > 0 && (
            <>
              {/* FILA SEPARADORA - HEADER COMENTARIOS */}
              <tr
                id="seccion_comentarios_deportistas"
                className={!showComentarios ? "no-print" : ""}
                style={{ background: "#1e293b", color: "#ffffff", height: "34px", cursor: "pointer" }}
                onClick={() => setShowComentarios((prev) => !prev)}
              >
                <th
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 20,
                    background: "#1e293b",
                    padding: "4px 8px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: 900,
                    width: "140px",
                    minWidth: "140px",
                    borderRight: "2px solid #cbd5e1",
                    color: "#ffffff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", position: "relative" }}>
                    <span style={{ fontSize: "10px", fontWeight: 800, color: "#38bdf8", display: "flex", alignItems: "center", gap: "4px" }}>
                      {showComentarios ? "▼" : "▶"} Comentarios ({filteredAndSortedJugadores.length})
                    </span>

                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          syncWellnessComments();
                        }}
                        title="Actualizar datos y comentarios de Wellness desde Google Sheets y Webhook"
                        style={{
                          background: "rgba(255,255,255,0.2)",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "4px",
                          padding: "2px 5px",
                          fontSize: "11px",
                          fontWeight: 900,
                          cursor: "pointer",
                          lineHeight: 1,
                        }}
                      >
                        🔄
                      </button>

                      {/* BOTÓN CON 3 PUNTITOS (···) EN LA CELDA FIJA DE COMENTARIOS */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCommentsFilterPopover((prev) => !prev);
                          setShowEventsFilterPopover(false);
                        }}
                        title="Filtros de comentarios y sincronización Wellness"
                        style={{
                          background: (filterCommentType !== "TODOS" || wellnessSyncState.status === "error") ? "#0284c7" : "rgba(255,255,255,0.2)",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "4px",
                          padding: "1px 6px",
                          fontSize: "11px",
                          fontWeight: 900,
                          cursor: "pointer",
                          lineHeight: 1,
                        }}
                      >
                        ···
                      </button>
                    </div>

                    {/* POPUP DE FILTROS DE COMENTARIOS */}
                    {showCommentsFilterPopover && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          left: 0,
                          zIndex: 100,
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          padding: "10px 12px",
                          boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
                          minWidth: "220px",
                          color: "#0f172a",
                          textAlign: "left",
                          fontWeight: 400,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", borderBottom: "1px solid #e2e8f0", paddingBottom: "4px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 900, color: "#0f172a" }}>💬 Filtro de Comentarios</span>
                          <button
                            type="button"
                            onClick={() => setShowCommentsFilterPopover(false)}
                            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "11px", padding: 0 }}
                          >
                            ✕
                          </button>
                        </div>

                        <div style={{ marginBottom: "8px" }}>
                          <label style={{ fontSize: "10.5px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "3px" }}>Tipo de Comentario:</label>
                          <select
                            value={filterCommentType}
                            onChange={(e) => setFilterCommentType(e.target.value)}
                            style={{
                              width: "100%",
                              background: "#f8fafc",
                              color: "#0f172a",
                              border: "1px solid #cbd5e1",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "3px 6px",
                              outline: "none",
                            }}
                          >
                            <option value="TODOS">Todos los tipos</option>
                            <option value="FIS">(FIS) Fisioterapia</option>
                            <option value="CON">(CON) Condicional</option>
                            <option value="TEC">(TEC) Técnico</option>
                            <option value="PSI">(PSI) Psicológico</option>
                            <option value="WEL">(WEL) Wellness</option>
                            <option value="OTR">(OTR) Otros</option>
                          </select>
                        </div>

                        <div>
                          <button
                            type="button"
                            onClick={() => {
                              setShowCommentsFilterPopover(false);
                              setShowWellnessConfigModal(true);
                            }}
                            style={{
                              width: "100%",
                              background: wellnessSyncState.status === "error" ? "#fef2f2" : "#f0fdf4",
                              border: `1px solid ${wellnessSyncState.status === "error" ? "#fca5a5" : "#86efac"}`,
                              color: wellnessSyncState.status === "error" ? "#dc2626" : "#15803d",
                              fontSize: "10.5px",
                              fontWeight: 800,
                              padding: "4px 8px",
                              borderRadius: "4px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "4px",
                            }}
                          >
                            {wellnessSyncState.status === "error" ? "⚠️ Permiso Google Sheets" : `🟢 Sincro Wellness (${wellnessSyncState.count})`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </th>
                <th
                  colSpan={daysChunk.length}
                  style={{
                    background: "#1e293b",
                    padding: "4px 12px",
                  }}
                />
              </tr>

              {/* FILA TEAM - COMENTARIOS GENERALES DE SESIÓN (Siempre visible arriba del todo en comentarios) */}
                  <tr key="comentario_row_team" style={{ height: "32px", background: "#f8fafc", borderBottom: "2px solid #cbd5e1" }}>
                    <th
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 10,
                        background: "#0f172a",
                        padding: "3px 8px",
                        textAlign: "left",
                        fontWeight: 900,
                        fontSize: "11px",
                        width: "140px",
                        minWidth: "140px",
                        borderRight: "2px solid #cbd5e1",
                        borderBottom: "2px solid #cbd5e1",
                        color: "#38bdf8",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title="Comentarios generales de la sesión / equipo"
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", paddingRight: "2px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "#38bdf8", fontWeight: 900, fontSize: "11px", letterSpacing: "0.5px" }}>
                          👥 TEAM
                        </span>
                        <span style={{ fontSize: "8.5px", background: "#1e293b", color: "#94a3b8", padding: "1px 5px", borderRadius: "4px", fontWeight: 800, letterSpacing: "0.5px", border: "1px solid #334155" }}>
                          SESIÓN
                        </span>
                      </div>
                    </th>
                    {daysChunk.map((d) => {
                      const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #cbd5e1";

                      // Filtrar comentarios para TEAM en este día con deduplicación defensiva
                      const rawTeamComentarios = comentarios.filter(
                        (c) => (c.jugador_id === "TEAM" || c.jugador_id === "team" || c.jugador_id === "EQUIPO") &&
                               (c.day_id === d.id || c.fecha === d.fecha)
                      ).filter((c) => filterCommentType === "TODOS" || c.tipo === filterCommentType);

                      const seenTeamKeys = new Set<string>();
                      const teamComentarios: ComentarioJugadorDia[] = [];
                      for (const c of rawTeamComentarios) {
                        if (!c || !c.texto) continue;
                        const norm = normalizeCommentText(c.texto).toLowerCase();
                        if (!norm) continue;
                        const key = `${c.tipo}_${norm}`;
                        if (seenTeamKeys.has(key)) continue;
                        seenTeamKeys.add(key);
                        teamComentarios.push(c);
                      }

                      return (
                        <td
                          key={`com_cell_team_${d.id}`}
                          style={{
                            padding: "2px 3px",
                            textAlign: "center",
                            minWidth: "110px",
                            width: "110px",
                            minHeight: "48px",
                            borderRight,
                            position: "relative",
                            background: teamComentarios.length > 0 ? "#f0fdf4" : "#ffffff",
                            borderBottom: "2px solid #cbd5e1",
                            verticalAlign: "middle",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "4px",
                              flexWrap: "wrap",
                              minHeight: "44px",
                              maxHeight: "65px",
                              overflowY: "auto",
                              padding: "2px 0",
                            }}
                          >
                            {teamComentarios.map((com) => {
                              const meta = TIPOS_COMENTARIO.find((t) => t.codigo === com.tipo) || TIPOS_COMENTARIO[4];

                              return (
                                <span
                                  key={com.id}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteComentarioTarget({ ...com, jugadorNombre: "TEAM (Sesión General)" });
                                  }}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    fontSize: "9.5px",
                                    fontWeight: 800,
                                    background: meta.bg,
                                    color: meta.color,
                                    border: `1px solid ${meta.border}`,
                                    cursor: "pointer",
                                    userSelect: "none",
                                    maxWidth: "102px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                  }}
                                  title={`[TEAM - ${meta.nombre}] ${com.texto}\n(Doble clic para borrar)`}
                                >
                                  <span>({com.tipo})</span>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{com.texto}</span>
                                </span>
                              );
                            })}

                            {/* BOTÓN + PARA AÑADIR COMENTARIO GENERAL DE SESIÓN */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAddComentarioTarget({
                                  jugador_id: "TEAM",
                                  day_id: d.id,
                                  fecha: d.fecha,
                                  jugadorNombre: "TEAM (Sesión General)",
                                });
                              }}
                              title="Añadir comentario sobre la sesión en general"
                              style={{
                                border: "1px dashed #0284c7",
                                background: "#f0f9ff",
                                color: "#0284c7",
                                borderRadius: "4px",
                                padding: "0 6px",
                                fontSize: "11px",
                                fontWeight: 900,
                                cursor: "pointer",
                                lineHeight: "18px",
                                transition: "all 0.15s ease",
                              }}
                            >
                              +
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>

              {showComentarios && (
                <>
                  {filteredAndSortedJugadores.map((p) => {
                    const playerLabel = (p.apodo || p.nombre || "").toUpperCase();

                    return (
                      <tr key={`comentario_row_${p.id}`} style={{ height: "28px", background: "#ffffff", borderBottom: "1px solid #f1f5f9" }}>
                        <th
                          style={{
                            position: "sticky",
                            left: 0,
                            zIndex: 10,
                            background: "#f8fafc",
                            padding: "2px 8px",
                            textAlign: "left",
                            fontWeight: 800,
                            fontSize: "11px",
                            width: "140px",
                            minWidth: "140px",
                            borderRight: "2px solid #cbd5e1",
                            borderBottom: "1px solid #f1f5f9",
                            color: "#334155",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={`Comentarios de ${p.nombre}`}
                        >
                          <span style={{ fontWeight: 800, color: "#0f172a" }}>{playerLabel}</span>
                        </th>
                        {daysChunk.map((d) => {
                          const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #f1f5f9";

                          // Filtrar comentarios para este jugador y este día con deduplicación estricta (máx 1 WEL)
                          const rawCellComentarios = comentarios.filter(
                            (c) => c.jugador_id === p.id && (c.day_id === d.id || c.fecha === d.fecha)
                          ).filter((c) => filterCommentType === "TODOS" || c.tipo === filterCommentType);

                          let seenWel = false;
                          const seenCellKeys = new Set<string>();
                          const cellComentarios: ComentarioJugadorDia[] = [];

                          for (const c of rawCellComentarios) {
                            if (!c || !c.texto) continue;
                            const normTxt = normalizeCommentText(c.texto).toLowerCase();
                            if (!normTxt) continue;

                            if (c.tipo === "WEL") {
                              if (seenWel) continue; // estrictamente sólo una vez!
                              seenWel = true;
                            } else {
                              const key = `${c.tipo}_${normTxt}`;
                              if (seenCellKeys.has(key)) continue;
                              seenCellKeys.add(key);
                            }
                            cellComentarios.push(c);
                          }

                          return (
                            <td
                              key={`com_cell_${p.id}_${d.id}`}
                              style={{
                                padding: "2px 3px",
                                textAlign: "center",
                                minWidth: "110px",
                                width: "110px",
                                minHeight: "48px",
                                borderRight,
                                position: "relative",
                                background: "#ffffff",
                                verticalAlign: "middle",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "3px",
                                  flexWrap: "wrap",
                                  minHeight: "44px",
                                  maxHeight: "65px",
                                  overflowY: "auto",
                                }}
                              >
                                {cellComentarios.map((com) => {
                                  const meta = TIPOS_COMENTARIO.find((t) => t.codigo === com.tipo) || TIPOS_COMENTARIO[4];

                                  return (
                                    <span
                                      key={com.id}
                                      onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteComentarioTarget({ ...com, jugadorNombre: playerLabel });
                                      }}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "3px",
                                        padding: "2px 5px",
                                        borderRadius: "4px",
                                        fontSize: "9.5px",
                                        fontWeight: 800,
                                        background: meta.bg,
                                        color: meta.color,
                                        border: `1px solid ${meta.border}`,
                                        cursor: "pointer",
                                        userSelect: "none",
                                        maxWidth: "102px",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                      }}
                                      title={`[${meta.nombre}] ${com.texto}\n(Haz doble clic para borrar)`}
                                    >
                                      <span style={{ flexShrink: 0 }}>({com.tipo})</span>
                                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
                                        {com.texto}
                                      </span>
                                    </span>
                                  );
                                })}

                                {/* BOTÓN + PARA AÑADIR OTRO COMENTARIO EN EL MISMO DÍA */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAddComentarioTarget({
                                      jugador_id: p.id,
                                      day_id: d.id,
                                      fecha: d.fecha,
                                      jugadorNombre: playerLabel,
                                    });
                                  }}
                                  title="Añadir comentario"
                                  style={{
                                    border: "1px dashed #cbd5e1",
                                    background: "#f8fafc",
                                    color: "#64748b",
                                    borderRadius: "4px",
                                    padding: "0 4px",
                                    fontSize: "10px",
                                    fontWeight: 800,
                                    cursor: "pointer",
                                    lineHeight: "16px",
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </>
              )}
            </>
          )}

          {/* SECCIÓN EVENTOS (DESPLEGABLE AUTOMÁTICO PROGRESIVO DE BLOQUES HASTA MÁXIMO 6) */}
          {(() => {
            const MAX_SLOTS = 6;

            // 1. Identificar qué slots (0 a 5) tienen datos o un tipo de evento seleccionado en daysChunk
            const slotsWithData = new Set<number>();
            daysChunk.forEach((d) => {
              if (d.fecha && d.fecha < "2026-07-01") return;
              for (let s = 0; s < MAX_SLOTS; s++) {
                const key = `${d.id}_slot_${s}`;
                const ev = eventosBloquesMap[key];
                if (
                  ev &&
                  (
                    (ev.tipo && ev.tipo.trim()) ||
                    (ev.hora && ev.hora.trim()) ||
                    (ev.lugar && ev.lugar.trim()) ||
                    (ev.duracion && ev.duracion.trim()) ||
                    (ev.orientacion && ev.orientacion.trim()) ||
                    (ev.carga && ev.carga.trim()) ||
                    (ev.comentario && ev.comentario.trim()) ||
                    (ev.num_jugadores && ev.num_jugadores.trim())
                  )
                ) {
                  slotsWithData.add(s);
                }
              }
            });

            // 2. Determinar hasta qué slot mostrar (siempre incluir el siguiente slot disponible)
            let highestUsedSlot = -1;
            for (let s = 0; s < MAX_SLOTS; s++) {
              if (slotsWithData.has(s)) {
                highestUsedSlot = s;
              }
            }

            const maxSlotToShow = Math.min(MAX_SLOTS - 1, highestUsedSlot + 1);
            const visibleSlots: number[] = [];
            for (let s = 0; s <= maxSlotToShow; s++) {
              visibleSlots.push(s);
            }

            return (
              <>
                <tr
                  className={!showEventosSection ? "no-print" : ""}
                  style={{ background: "#0f172a", color: "#ffffff", height: "32px", cursor: "pointer" }}
                  onClick={() => setShowEventosSection((prev) => !prev)}
                >
                  <th
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 20,
                      background: "#0f172a",
                      padding: "4px 8px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 900,
                      width: "140px",
                      minWidth: "140px",
                      borderRight: "2px solid #cbd5e1",
                      color: "#ffffff",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", position: "relative" }}>
                      <span style={{ fontSize: "10px", fontWeight: 800, color: "#fbbf24", display: "flex", alignItems: "center", gap: "4px" }}>
                        {showEventosSection ? "▼" : "▶"} EVENTOS ({visibleSlots.length})
                      </span>

                      {/* BOTÓN CON 3 PUNTITOS (···) EN LA CELDA FIJA DE EVENTOS */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowEventsFilterPopover((prev) => !prev);
                          setShowCommentsFilterPopover(false);
                        }}
                        title="Filtros y configuración de tipos de evento"
                        style={{
                          background: filterEventoTipo !== "TODOS" ? "#fbbf24" : "rgba(255,255,255,0.2)",
                          color: filterEventoTipo !== "TODOS" ? "#0f172a" : "#ffffff",
                          border: "none",
                          borderRadius: "4px",
                          padding: "1px 6px",
                          fontSize: "11px",
                          fontWeight: 900,
                          cursor: "pointer",
                          lineHeight: 1,
                        }}
                      >
                        ···
                      </button>

                      {/* POPUP DE FILTROS DE EVENTOS */}
                      {showEventsFilterPopover && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: "absolute",
                            top: "calc(100% + 6px)",
                            left: 0,
                            zIndex: 100,
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: "8px",
                            padding: "10px 12px",
                            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
                            minWidth: "220px",
                            color: "#0f172a",
                            textAlign: "left",
                            fontWeight: 400,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", borderBottom: "1px solid #e2e8f0", paddingBottom: "4px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 900, color: "#0f172a" }}>🏷️ Filtro de Eventos</span>
                            <button
                              type="button"
                              onClick={() => setShowEventsFilterPopover(false)}
                              style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "11px", padding: 0 }}
                            >
                              ✕
                            </button>
                          </div>

                          <div style={{ marginBottom: "8px" }}>
                            <label style={{ fontSize: "10.5px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "3px" }}>Filtrar Evento:</label>
                            <select
                              value={filterEventoTipo}
                              onChange={(e) => setFilterEventoTipo(e.target.value)}
                              style={{
                                width: "100%",
                                background: "#f8fafc",
                                color: "#0f172a",
                                border: "1px solid #cbd5e1",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "3px 6px",
                                outline: "none",
                              }}
                            >
                              <option value="TODOS">Todos los eventos</option>
                              {tiposEventoConfig.map((t) => (
                                <option key={t.codigo} value={t.codigo}>
                                  {t.codigo} - {t.nombre}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                setShowEventsFilterPopover(false);
                                setShowTiposManagerModal(true);
                              }}
                              style={{
                                width: "100%",
                                background: "#f1f5f9",
                                border: "1px solid #cbd5e1",
                                color: "#1e3a8a",
                                fontSize: "10.5px",
                                fontWeight: 800,
                                padding: "4px 8px",
                                borderRadius: "4px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "4px",
                              }}
                            >
                              ⚙️ Editar tipos de eventos
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </th>
                  <th colSpan={daysChunk.length} style={{ background: "#0f172a", padding: "4px 12px", textAlign: "right" }} />
                </tr>

                {showEventosSection &&
                  visibleSlots.map((slotIdx) => {
                    const isSlotExpanded = slotsWithData.has(slotIdx);

                    return (
                      <React.Fragment key={`event_slot_block_${slotIdx}`}>
                        {/* FILA 1: TIPO SESIÓN */}
                        <tr style={{ height: "30px", background: "#ffffff", borderBottom: isSlotExpanded ? "1px solid #cbd5e1" : "2px solid #0f172a" }}>
                          <th
                            style={{
                              position: "sticky",
                              left: 0,
                              zIndex: 10,
                              background: "#f1f5f9",
                              padding: "4px 8px",
                              textAlign: "left",
                              fontWeight: 900,
                              fontSize: "11px",
                              width: "140px",
                              minWidth: "140px",
                              borderRight: "2px solid #cbd5e1",
                              color: "#1e3a8a",
                              textTransform: "uppercase",
                            }}
                          >
                            TIPO SESIÓN #{slotIdx + 1}
                          </th>
                          {daysChunk.map((d) => {
                            const dIdx = filteredDays.findIndex((dayObj) => dayObj.id === d.id);
                            const rowKey = `evento_${slotIdx + 1}`;
                            const rIdx = rowIndicesMap.get(rowKey) ?? -1;

                            const isInRange = dIdx !== -1 && rIdx !== -1 && isCellInRange(rIdx, dIdx);
                            const isInFill = dIdx !== -1 && rIdx !== -1 && isCellInFillPreview(rIdx, dIdx);
                            const isCorner = dIdx !== -1 && rIdx !== -1 && isBottomRightCornerCell(rIdx, dIdx);

                            const isPre = d.fecha && d.fecha < "2026-07-01";
                            const key = `${d.id}_slot_${slotIdx}`;
                            const keyFecha = `${d.fecha}_slot_${slotIdx}`;
                            const ev = (!isPre && (eventosBloquesMap[key] || eventosBloquesMap[keyFecha])) || {
                              id: `ev_${d.id}_${slotIdx}`,
                              day_id: d.id,
                              fecha: d.fecha,
                              slot: slotIdx,
                              tipo: "",
                              hora: "",
                              lugar: "",
                              duracion: "",
                              orientacion: "",
                              carga: "",
                              comentario: "",
                              num_jugadores: "",
                            };

                            const matchedTipo = tiposEventoConfig.find((t) => t.codigo.toLowerCase() === (ev.tipo || "").toLowerCase());
                            const isFiltered = filterEventoTipo !== "TODOS" && ev.tipo && ev.tipo !== filterEventoTipo;
                            const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #cbd5e1";

                            const bg = isInFill ? "#bae6fd" : isInRange ? "#e0f2fe" : (matchedTipo ? matchedTipo.bg : "#ffffff");
                            const textColor = matchedTipo ? matchedTipo.color : "#0f172a";
                            const border = matchedTipo ? matchedTipo.border : "#cbd5e1";

                            return (
                              <td
                                key={`tipo_${d.id}_${slotIdx}`}
                                onMouseDown={(e) => dIdx !== -1 && handleCellMouseDown(rowKey, dIdx, e)}
                                onMouseEnter={() => dIdx !== -1 && handleCellMouseEnter(rowKey, dIdx)}
                                style={{
                                  padding: "2px",
                                  textAlign: "center",
                                  minWidth: "110px",
                                  width: "110px",
                                  borderRight,
                                  position: "relative",
                                  background: bg,
                                  boxShadow: isInRange ? "inset 0 0 0 2px #0284c7" : "none",
                                  opacity: isFiltered ? 0.2 : 1,
                                  transition: "background 0.15s ease, opacity 0.15s ease",
                                }}
                              >
                                <EventCellInput
                                  value={ev.tipo || ""}
                                  textColor={textColor}
                                  tiposConfig={tiposEventoConfig}
                                  onCommit={(val) => {
                                    handleEventoBlockUpdate(d.id, d.fecha, slotIdx, "tipo", val);
                                    if (slotIdx < 6) {
                                      const eventoKey = `evento_${slotIdx + 1}` as keyof SesionDia;
                                      handleCellUpdate(d.id, eventoKey, val);
                                    }
                                  }}
                                  onOpenPicker={(rect) => {
                                    setActivePickerCell({
                                      dayId: d.id,
                                      slotIdx,
                                      rowKey,
                                      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
                                    });
                                  }}
                                />

                                {isMatchCode(ev.tipo) && (
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPaConfigModal(d.id, d.fecha, slotIdx);
                                    }}
                                    title={`Competición: ${ev.competicion || "Liga"} ${ev.orientacion ? `· ${ev.orientacion}` : ""}. Clic para editar competición y jornada/fase.`}
                                    style={{
                                      position: "absolute",
                                      top: "2px",
                                      right: "2px",
                                      background: "#eff6ff",
                                      border: "1px solid #bfdbfe",
                                      borderRadius: "3px",
                                      fontSize: "9px",
                                      lineHeight: 1,
                                      padding: "1px 2px",
                                      cursor: "pointer",
                                      color: "#1e3a8a",
                                      zIndex: 10,
                                      boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                    }}
                                  >
                                    🏆
                                  </button>
                                )}

                                {isCorner && (
                                  <div
                                    onMouseDown={(e) => handleFillHandleMouseDown(e)}
                                    title="Arrastrar para rellenar"
                                    style={{
                                      position: "absolute",
                                      bottom: "2px",
                                      right: "2px",
                                      width: "7px",
                                      height: "7px",
                                      background: "#0284c7",
                                      border: "1px solid #ffffff",
                                      cursor: "crosshair",
                                      zIndex: 20,
                                    }}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>

                        {/* LAS FILAS 2 A 9 SOLO SE DESPLIEGAN CUANDO EL BLOQUE TIENE UN TIPO O DATOS RELLENADOS */}
                        {isSlotExpanded && (
                          <>
                            {/* FILA 2: HORA */}
                            <tr style={{ height: "26px", background: "#ffffff", borderBottom: "1px solid #cbd5e1" }}>
                              <th style={{ position: "sticky", left: 0, zIndex: 10, background: "#f8fafc", padding: "2px 8px", textAlign: "left", fontWeight: 700, fontSize: "10.5px", width: "140px", minWidth: "140px", borderRight: "2px solid #cbd5e1", color: "#475569" }}>
                                Hora
                              </th>
                              {daysChunk.map((d) => {
                                const dIdx = filteredDays.findIndex((dayObj) => dayObj.id === d.id);
                                const rowKey = `evento_${slotIdx + 1}`;
                                const rIdx = rowIndicesMap.get(rowKey) ?? -1;

                                const isInRange = dIdx !== -1 && rIdx !== -1 && isCellInRange(rIdx, dIdx);
                                const isInFill = dIdx !== -1 && rIdx !== -1 && isCellInFillPreview(rIdx, dIdx);

                                const isPre = d.fecha && d.fecha < "2026-07-01";
                                const key = `${d.id}_slot_${slotIdx}`;
                                const keyFecha = `${d.fecha}_slot_${slotIdx}`;
                                const ev = (!isPre && (eventosBloquesMap[key] || eventosBloquesMap[keyFecha])) || { hora: "", tipo: "" };
                                const matchedTipo = tiposEventoConfig.find((t) => t.codigo.toLowerCase() === (ev.tipo || "").toLowerCase());
                                const bg = isInFill ? "#bae6fd" : isInRange ? "#e0f2fe" : (matchedTipo ? matchedTipo.bg : "#ffffff");
                                const textColor = matchedTipo ? matchedTipo.color : "#0f172a";
                                const isFiltered = filterEventoTipo !== "TODOS" && ev.tipo && ev.tipo !== filterEventoTipo;
                                const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #cbd5e1";
                                return (
                                  <td
                                    key={`hora_${d.id}_${slotIdx}`}
                                    onMouseDown={(e) => dIdx !== -1 && handleCellMouseDown(rowKey, dIdx, e)}
                                    onMouseEnter={() => dIdx !== -1 && handleCellMouseEnter(rowKey, dIdx)}
                                    style={{
                                      padding: "1px 2px",
                                      textAlign: "center",
                                      minWidth: "110px",
                                      width: "110px",
                                      borderRight,
                                      background: bg,
                                      boxShadow: isInRange ? "inset 0 0 0 2px #0284c7" : "none",
                                      opacity: isFiltered ? 0.2 : 1,
                                    }}
                                  >
                                    <input
                                      type="text"
                                      value={ev.hora || ""}
                                      onChange={(e) => handleEventoBlockUpdate(d.id, d.fecha, slotIdx, "hora", e.target.value)}
                                      placeholder=""
                                      style={{ width: "100%", background: "transparent", border: "none", fontSize: "11px", fontWeight: 800, textAlign: "center", outline: "none", color: textColor }}
                                    />
                                  </td>
                                );
                              })}
                            </tr>

                            {/* FILA 3: LUGAR */}
                            <tr style={{ height: "26px", background: "#ffffff", borderBottom: "1px solid #cbd5e1" }}>
                              <th style={{ position: "sticky", left: 0, zIndex: 10, background: "#f8fafc", padding: "2px 8px", textAlign: "left", fontWeight: 700, fontSize: "10.5px", width: "140px", minWidth: "140px", borderRight: "2px solid #cbd5e1", color: "#475569" }}>
                                Lugar
                              </th>
                              {daysChunk.map((d) => {
                                const dIdx = filteredDays.findIndex((dayObj) => dayObj.id === d.id);
                                const rowKey = `evento_${slotIdx + 1}`;
                                const rIdx = rowIndicesMap.get(rowKey) ?? -1;

                                const isInRange = dIdx !== -1 && rIdx !== -1 && isCellInRange(rIdx, dIdx);
                                const isInFill = dIdx !== -1 && rIdx !== -1 && isCellInFillPreview(rIdx, dIdx);

                                const isPre = d.fecha && d.fecha < "2026-07-01";
                                const key = `${d.id}_slot_${slotIdx}`;
                                const keyFecha = `${d.fecha}_slot_${slotIdx}`;
                                const ev = (!isPre && (eventosBloquesMap[key] || eventosBloquesMap[keyFecha])) || { lugar: "", tipo: "" };
                                const matchedTipo = tiposEventoConfig.find((t) => t.codigo.toLowerCase() === (ev.tipo || "").toLowerCase());
                                const bg = isInFill ? "#bae6fd" : isInRange ? "#e0f2fe" : (matchedTipo ? matchedTipo.bg : "#ffffff");
                                const textColor = matchedTipo ? matchedTipo.color : "#0f172a";
                                const isFiltered = filterEventoTipo !== "TODOS" && ev.tipo && ev.tipo !== filterEventoTipo;
                                const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #cbd5e1";
                                return (
                                  <td
                                    key={`lugar_${d.id}_${slotIdx}`}
                                    onMouseDown={(e) => dIdx !== -1 && handleCellMouseDown(rowKey, dIdx, e)}
                                    onMouseEnter={() => dIdx !== -1 && handleCellMouseEnter(rowKey, dIdx)}
                                    style={{
                                      padding: "1px 2px",
                                      textAlign: "center",
                                      minWidth: "110px",
                                      width: "110px",
                                      borderRight,
                                      background: bg,
                                      boxShadow: isInRange ? "inset 0 0 0 2px #0284c7" : "none",
                                      opacity: isFiltered ? 0.2 : 1,
                                    }}
                                  >
                                    <input
                                      type="text"
                                      value={ev.lugar || ""}
                                      onChange={(e) => handleEventoBlockUpdate(d.id, d.fecha, slotIdx, "lugar", e.target.value)}
                                      placeholder=""
                                      style={{ width: "100%", background: "transparent", border: "none", fontSize: "11px", fontWeight: 800, textAlign: "center", outline: "none", color: textColor, textTransform: "uppercase" }}
                                    />
                                  </td>
                                );
                              })}
                            </tr>

                            {/* FILA 4: DURACIÓN */}
                            <tr style={{ height: "26px", background: "#ffffff", borderBottom: "1px solid #cbd5e1" }}>
                              <th style={{ position: "sticky", left: 0, zIndex: 10, background: "#f8fafc", padding: "2px 8px", textAlign: "left", fontWeight: 700, fontSize: "10.5px", width: "140px", minWidth: "140px", borderRight: "2px solid #cbd5e1", color: "#475569" }}>
                                Duración
                              </th>
                              {daysChunk.map((d) => {
                                const dIdx = filteredDays.findIndex((dayObj) => dayObj.id === d.id);
                                const rowKey = `evento_${slotIdx + 1}`;
                                const rIdx = rowIndicesMap.get(rowKey) ?? -1;

                                const isInRange = dIdx !== -1 && rIdx !== -1 && isCellInRange(rIdx, dIdx);
                                const isInFill = dIdx !== -1 && rIdx !== -1 && isCellInFillPreview(rIdx, dIdx);

                                const isPre = d.fecha && d.fecha < "2026-07-01";
                                const key = `${d.id}_slot_${slotIdx}`;
                                const keyFecha = `${d.fecha}_slot_${slotIdx}`;
                                const ev = (!isPre && (eventosBloquesMap[key] || eventosBloquesMap[keyFecha])) || { duracion: "", tipo: "" };
                                const matchedTipo = tiposEventoConfig.find((t) => t.codigo.toLowerCase() === (ev.tipo || "").toLowerCase());
                                const bg = isInFill ? "#bae6fd" : isInRange ? "#e0f2fe" : (matchedTipo ? matchedTipo.bg : "#ffffff");
                                const textColor = matchedTipo ? matchedTipo.color : "#0f172a";
                                const isFiltered = filterEventoTipo !== "TODOS" && ev.tipo && ev.tipo !== filterEventoTipo;
                                const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #cbd5e1";
                                return (
                                  <td
                                    key={`dur_${d.id}_${slotIdx}`}
                                    onMouseDown={(e) => dIdx !== -1 && handleCellMouseDown(rowKey, dIdx, e)}
                                    onMouseEnter={() => dIdx !== -1 && handleCellMouseEnter(rowKey, dIdx)}
                                    style={{
                                      padding: "1px 2px",
                                      textAlign: "center",
                                      minWidth: "110px",
                                      width: "110px",
                                      borderRight,
                                      background: bg,
                                      boxShadow: isInRange ? "inset 0 0 0 2px #0284c7" : "none",
                                      opacity: isFiltered ? 0.2 : 1,
                                    }}
                                  >
                                    <input
                                      type="text"
                                      value={ev.duracion || ""}
                                      onChange={(e) => handleEventoBlockUpdate(d.id, d.fecha, slotIdx, "duracion", e.target.value)}
                                      placeholder=""
                                      style={{ width: "100%", background: "transparent", border: "none", fontSize: "11px", fontWeight: 800, textAlign: "center", outline: "none", color: textColor }}
                                    />
                                  </td>
                                );
                              })}
                            </tr>

                            {/* FILA 5: ORIENTACIÓN */}
                            <tr style={{ height: "26px", background: "#ffffff", borderBottom: "1px solid #cbd5e1" }}>
                              <th style={{ position: "sticky", left: 0, zIndex: 10, background: "#f8fafc", padding: "2px 8px", textAlign: "left", fontWeight: 700, fontSize: "10.5px", width: "140px", minWidth: "140px", borderRight: "2px solid #cbd5e1", color: "#475569" }}>
                                Orientación
                              </th>
                              {daysChunk.map((d) => {
                                const dIdx = filteredDays.findIndex((dayObj) => dayObj.id === d.id);
                                const rowKey = `evento_${slotIdx + 1}`;
                                const rIdx = rowIndicesMap.get(rowKey) ?? -1;

                                const isInRange = dIdx !== -1 && rIdx !== -1 && isCellInRange(rIdx, dIdx);
                                const isInFill = dIdx !== -1 && rIdx !== -1 && isCellInFillPreview(rIdx, dIdx);

                                const isPre = d.fecha && d.fecha < "2026-07-01";
                                const key = `${d.id}_slot_${slotIdx}`;
                                const keyFecha = `${d.fecha}_slot_${slotIdx}`;
                                const ev = (!isPre && (eventosBloquesMap[key] || eventosBloquesMap[keyFecha])) || { orientacion: "", tipo: "" };
                                const matchedTipo = tiposEventoConfig.find((t) => t.codigo.toLowerCase() === (ev.tipo || "").toLowerCase());
                                const bg = isInFill ? "#bae6fd" : isInRange ? "#e0f2fe" : (matchedTipo ? matchedTipo.bg : "#ffffff");
                                const textColor = matchedTipo ? matchedTipo.color : "#0f172a";
                                const isFiltered = filterEventoTipo !== "TODOS" && ev.tipo && ev.tipo !== filterEventoTipo;
                                const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #cbd5e1";
                                return (
                                  <td
                                    key={`ori_${d.id}_${slotIdx}`}
                                    onMouseDown={(e) => dIdx !== -1 && handleCellMouseDown(rowKey, dIdx, e)}
                                    onMouseEnter={() => dIdx !== -1 && handleCellMouseEnter(rowKey, dIdx)}
                                    style={{
                                      padding: "1px 2px",
                                      textAlign: "center",
                                      minWidth: "110px",
                                      width: "110px",
                                      borderRight,
                                      background: bg,
                                      boxShadow: isInRange ? "inset 0 0 0 2px #0284c7" : "none",
                                      opacity: isFiltered ? 0.2 : 1,
                                    }}
                                  >
                                    <input
                                      type="text"
                                      value={ev.orientacion || ""}
                                      onChange={(e) => handleEventoBlockUpdate(d.id, d.fecha, slotIdx, "orientacion", e.target.value)}
                                      placeholder=""
                                      style={{ width: "100%", background: "transparent", border: "none", fontSize: "11px", fontWeight: 800, textAlign: "center", outline: "none", color: textColor }}
                                    />
                                  </td>
                                );
                              })}
                            </tr>

                            {/* FILA 6: CARGA */}
                            <tr style={{ height: "26px", background: "#ffffff", borderBottom: "1px solid #cbd5e1" }}>
                              <th style={{ position: "sticky", left: 0, zIndex: 10, background: "#f8fafc", padding: "2px 8px", textAlign: "left", fontWeight: 700, fontSize: "10.5px", width: "140px", minWidth: "140px", borderRight: "2px solid #cbd5e1", color: "#475569" }}>
                                Carga
                              </th>
                              {daysChunk.map((d) => {
                                const dIdx = filteredDays.findIndex((dayObj) => dayObj.id === d.id);
                                const rowKey = `evento_${slotIdx + 1}`;
                                const rIdx = rowIndicesMap.get(rowKey) ?? -1;

                                const isInRange = dIdx !== -1 && rIdx !== -1 && isCellInRange(rIdx, dIdx);
                                const isInFill = dIdx !== -1 && rIdx !== -1 && isCellInFillPreview(rIdx, dIdx);

                                const isPre = d.fecha && d.fecha < "2026-07-01";
                                const key = `${d.id}_slot_${slotIdx}`;
                                const keyFecha = `${d.fecha}_slot_${slotIdx}`;
                                const ev = (!isPre && (eventosBloquesMap[key] || eventosBloquesMap[keyFecha])) || { carga: "", tipo: "" };
                                const matchedTipo = tiposEventoConfig.find((t) => t.codigo.toLowerCase() === (ev.tipo || "").toLowerCase());
                                const bg = isInFill ? "#bae6fd" : isInRange ? "#e0f2fe" : (matchedTipo ? matchedTipo.bg : "#ffffff");
                                const textColor = matchedTipo ? matchedTipo.color : "#0f172a";
                                const isFiltered = filterEventoTipo !== "TODOS" && ev.tipo && ev.tipo !== filterEventoTipo;
                                const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #cbd5e1";
                                return (
                                  <td
                                    key={`carga_${d.id}_${slotIdx}`}
                                    onMouseDown={(e) => dIdx !== -1 && handleCellMouseDown(rowKey, dIdx, e)}
                                    onMouseEnter={() => dIdx !== -1 && handleCellMouseEnter(rowKey, dIdx)}
                                    style={{
                                      padding: "1px 2px",
                                      textAlign: "center",
                                      minWidth: "110px",
                                      width: "110px",
                                      borderRight,
                                      background: bg,
                                      boxShadow: isInRange ? "inset 0 0 0 2px #0284c7" : "none",
                                      opacity: isFiltered ? 0.2 : 1,
                                    }}
                                  >
                                    <input
                                      type="text"
                                      value={ev.carga || ""}
                                      onChange={(e) => handleEventoBlockUpdate(d.id, d.fecha, slotIdx, "carga", e.target.value)}
                                      placeholder=""
                                      style={{ width: "100%", background: "transparent", border: "none", fontSize: "11px", fontWeight: 800, textAlign: "center", outline: "none", color: textColor }}
                                    />
                                  </td>
                                );
                              })}
                            </tr>

                            {/* FILA 7: COMENTARIO */}
                            <tr style={{ height: "26px", background: "#ffffff", borderBottom: "1px solid #cbd5e1" }}>
                              <th style={{ position: "sticky", left: 0, zIndex: 10, background: "#f8fafc", padding: "2px 8px", textAlign: "left", fontWeight: 700, fontSize: "10.5px", width: "140px", minWidth: "140px", borderRight: "2px solid #cbd5e1", color: "#475569" }}>
                                Comentario
                              </th>
                              {daysChunk.map((d) => {
                                const dIdx = filteredDays.findIndex((dayObj) => dayObj.id === d.id);
                                const rowKey = `evento_${slotIdx + 1}`;
                                const rIdx = rowIndicesMap.get(rowKey) ?? -1;

                                const isInRange = dIdx !== -1 && rIdx !== -1 && isCellInRange(rIdx, dIdx);
                                const isInFill = dIdx !== -1 && rIdx !== -1 && isCellInFillPreview(rIdx, dIdx);

                                const isPre = d.fecha && d.fecha < "2026-07-01";
                                const key = `${d.id}_slot_${slotIdx}`;
                                const keyFecha = `${d.fecha}_slot_${slotIdx}`;
                                const ev = (!isPre && (eventosBloquesMap[key] || eventosBloquesMap[keyFecha])) || { comentario: "", tipo: "" };
                                const matchedTipo = tiposEventoConfig.find((t) => t.codigo.toLowerCase() === (ev.tipo || "").toLowerCase());
                                const bg = isInFill ? "#bae6fd" : isInRange ? "#e0f2fe" : (matchedTipo ? matchedTipo.bg : "#ffffff");
                                const textColor = matchedTipo ? matchedTipo.color : "#0f172a";
                                const isFiltered = filterEventoTipo !== "TODOS" && ev.tipo && ev.tipo !== filterEventoTipo;
                                const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #cbd5e1";
                                return (
                                  <td
                                    key={`com_${d.id}_${slotIdx}`}
                                    onMouseDown={(e) => dIdx !== -1 && handleCellMouseDown(rowKey, dIdx, e)}
                                    onMouseEnter={() => dIdx !== -1 && handleCellMouseEnter(rowKey, dIdx)}
                                    style={{
                                      padding: "1px 2px",
                                      textAlign: "center",
                                      minWidth: "110px",
                                      width: "110px",
                                      borderRight,
                                      background: bg,
                                      boxShadow: isInRange ? "inset 0 0 0 2px #0284c7" : "none",
                                      opacity: isFiltered ? 0.2 : 1,
                                    }}
                                  >
                                    <input
                                      type="text"
                                      value={ev.comentario || ""}
                                      onChange={(e) => handleEventoBlockUpdate(d.id, d.fecha, slotIdx, "comentario", e.target.value)}
                                      placeholder=""
                                      style={{ width: "100%", background: "transparent", border: "none", fontSize: "10.5px", fontWeight: 800, textAlign: "center", outline: "none", color: textColor, textTransform: "uppercase" }}
                                    />
                                  </td>
                                );
                              })}
                            </tr>

                            {/* FILA 8: Nº JUGADORES */}
                            <tr style={{ height: "26px", background: "#ffffff", borderBottom: "1px solid #cbd5e1" }}>
                              <th style={{ position: "sticky", left: 0, zIndex: 10, background: "#f8fafc", padding: "2px 8px", textAlign: "left", fontWeight: 700, fontSize: "10.5px", width: "140px", minWidth: "140px", borderRight: "2px solid #cbd5e1", color: "#475569" }}>
                                Nº Jugadores
                              </th>
                              {daysChunk.map((d) => {
                                const dIdx = filteredDays.findIndex((dayObj) => dayObj.id === d.id);
                                const rowKey = `evento_${slotIdx + 1}`;
                                const rIdx = rowIndicesMap.get(rowKey) ?? -1;

                                const isInRange = dIdx !== -1 && rIdx !== -1 && isCellInRange(rIdx, dIdx);
                                const isInFill = dIdx !== -1 && rIdx !== -1 && isCellInFillPreview(rIdx, dIdx);

                                const isPre = d.fecha && d.fecha < "2026-07-01";
                                const key = `${d.id}_slot_${slotIdx}`;
                                const keyFecha = `${d.fecha}_slot_${slotIdx}`;
                                const ev = (!isPre && (eventosBloquesMap[key] || eventosBloquesMap[keyFecha])) || { num_jugadores: "", tipo: "" };
                                const autoNumJugadores = getAssignedPlayersCountForSlot(d.id, slotIdx, d.fecha);
                                const displayValue = autoNumJugadores || ev.num_jugadores || "";
                                const matchedTipo = tiposEventoConfig.find((t) => t.codigo.toLowerCase() === (ev.tipo || "").toLowerCase());
                                const bg = isInFill ? "#bae6fd" : isInRange ? "#e0f2fe" : (matchedTipo ? matchedTipo.bg : "#ffffff");
                                const textColor = matchedTipo ? matchedTipo.color : "#0f172a";
                                const isFiltered = filterEventoTipo !== "TODOS" && ev.tipo && ev.tipo !== filterEventoTipo;
                                const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #cbd5e1";
                                return (
                                  <td
                                    key={`njug_${d.id}_${slotIdx}`}
                                    onMouseDown={(e) => dIdx !== -1 && handleCellMouseDown(rowKey, dIdx, e)}
                                    onMouseEnter={() => dIdx !== -1 && handleCellMouseEnter(rowKey, dIdx)}
                                    style={{
                                      padding: "1px 2px",
                                      textAlign: "center",
                                      minWidth: "110px",
                                      width: "110px",
                                      borderRight,
                                      background: bg,
                                      boxShadow: isInRange ? "inset 0 0 0 2px #0284c7" : "none",
                                      opacity: isFiltered ? 0.2 : 1,
                                    }}
                                  >
                                    <input
                                      type="text"
                                      value={displayValue}
                                      onChange={(e) => handleEventoBlockUpdate(d.id, d.fecha, slotIdx, "num_jugadores", e.target.value)}
                                      placeholder=""
                                      style={{ width: "100%", background: "transparent", border: "none", fontSize: "11px", fontWeight: 900, textAlign: "center", outline: "none", color: textColor }}
                                    />
                                  </td>
                                );
                              })}
                            </tr>

                            {/* FILA 9: SESIÓN (CASILLA CON BOTÓN CUADRADO PARA ENTRAR DENTRO DEL EVENTO) */}
                            <tr style={{ height: "28px", background: "#ffffff", borderBottom: "3px solid #0f172a" }}>
                              <th style={{ position: "sticky", left: 0, zIndex: 10, background: "#f1f5f9", padding: "2px 8px", textAlign: "left", fontWeight: 800, fontSize: "10.5px", width: "140px", minWidth: "140px", borderRight: "2px solid #cbd5e1", color: "#1e3a8a" }}>
                                Sesión
                              </th>
                              {daysChunk.map((d) => {
                                const dIdx = filteredDays.findIndex((dayObj) => dayObj.id === d.id);
                                const rowKey = `evento_${slotIdx + 1}`;
                                const rIdx = rowIndicesMap.get(rowKey) ?? -1;

                                const isInRange = dIdx !== -1 && rIdx !== -1 && isCellInRange(rIdx, dIdx);
                                const isInFill = dIdx !== -1 && rIdx !== -1 && isCellInFillPreview(rIdx, dIdx);

                                const key = `${d.id}_slot_${slotIdx}`;
                                const keyFecha = `${d.fecha}_slot_${slotIdx}`;
                                const ev = eventosBloquesMap[key] || eventosBloquesMap[keyFecha] || {
                                  id: `ev_${d.id}_${slotIdx}`,
                                  day_id: d.id,
                                  fecha: d.fecha,
                                  slot: slotIdx,
                                  tipo: "",
                                  hora: "",
                                  lugar: "",
                                  duracion: "",
                                  orientacion: "",
                                  carga: "",
                                  comentario: "",
                                  num_jugadores: "",
                                };
                                const matchedTipo = tiposEventoConfig.find((t) => t.codigo.toLowerCase() === (ev.tipo || "").toLowerCase());
                                const bg = isInFill ? "#bae6fd" : isInRange ? "#e0f2fe" : (matchedTipo ? matchedTipo.bg : "#ffffff");
                                const isFiltered = filterEventoTipo !== "TODOS" && ev.tipo && ev.tipo !== filterEventoTipo;
                                const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #cbd5e1";

                                return (
                                  <td
                                    key={`sesion_${d.id}_${slotIdx}`}
                                    onMouseDown={(e) => dIdx !== -1 && handleCellMouseDown(rowKey, dIdx, e)}
                                    onMouseEnter={() => dIdx !== -1 && handleCellMouseEnter(rowKey, dIdx)}
                                    style={{
                                      padding: "2px",
                                      textAlign: "right",
                                      verticalAlign: "bottom",
                                      minWidth: "110px",
                                      width: "110px",
                                      borderRight,
                                      background: bg,
                                      boxShadow: isInRange ? "inset 0 0 0 2px #0284c7" : "none",
                                      opacity: isFiltered ? 0.2 : 1,
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => setEventoDetailModalTarget(ev)}
                                      title="Haz clic para acceder dentro del evento"
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "20px",
                                        height: "20px",
                                        borderRadius: "3px",
                                        border: "1.5px solid #334155",
                                        background: "#ffffff",
                                        cursor: "pointer",
                                        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                        marginRight: "4px",
                                        marginBottom: "2px",
                                        fontSize: "10px",
                                      }}
                                    >
                                      🔲
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          </>
                        )}
                      </React.Fragment>
                    );
                  })}

              
              </>
            );
          })()}

          {/* ========================================================================= */}
          {/* BLOQUES PLEGABLES DEBAJO DE EVENTOS: 1. ASIGNACIONES  2. COMENTARIOS       */}
          {/* ========================================================================= */}
{/* SECCIÓN ASIGNACIÓN DE EVENTOS POR JUGADORA */}
              {jugadoresList.length > 0 && (
                <>
                  <tr
                    id="seccion_asignacion_eventos"
                    style={{
                      background: "linear-gradient(90deg, #0f172a 0%, #1e293b 100%)",
                      color: "#ffffff",
                      height: "36px",
                      cursor: "pointer",
                      borderTop: "3px solid #0284c7",
                      borderBottom: "1px solid #334155",
                    }}
                    onClick={() => setShowPlayerEventsSection((prev) => !prev)}
                    title="Haz clic para desplegar o plegar el bloque de asignación de eventos por jugadora"
                  >
                    <th
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 20,
                        background: "#0f172a",
                        padding: "4px 8px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 900,
                        width: "140px",
                        minWidth: "140px",
                        borderRight: "2px solid #cbd5e1",
                        color: "#ffffff",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "11px", fontWeight: 900, color: "#38bdf8", display: "flex", alignItems: "center", gap: "5px" }}>
                          <span>{showPlayerEventsSection ? "▼" : "▶"}</span>
                          👥 Asignaciones ({filteredAndSortedJugadores.length})
                        </span>
                        <span style={{ fontSize: "8px", background: showPlayerEventsSection ? "#0284c7" : "#475569", color: "#ffffff", padding: "1px 5px", borderRadius: "3px", fontWeight: 800 }}>
                          {showPlayerEventsSection ? "ABIERTO" : "PLEGADO"}
                        </span>
                      </div>
                    </th>
                    <th
                      colSpan={daysChunk.length}
                      style={{
                        background: "#0f172a",
                        padding: "4px 12px",
                      }}
                    />
                  </tr>

                  {showPlayerEventsSection &&
                    filteredAndSortedJugadores.map((p) => {
                      const rowKey = `player_event_${p.id}`;
                      const rIdx = rowIndicesMap.get(rowKey) ?? -1;

                      return (
                        <tr key={`player_event_row_${p.id}`} style={{ height: "40px", background: "#ffffff", borderBottom: "1px solid #cbd5e1" }}>
                          <th
                            style={{
                              position: "sticky",
                              left: 0,
                              zIndex: 10,
                              background: "#f8fafc",
                              padding: "2px 8px",
                              textAlign: "left",
                              fontWeight: 800,
                              fontSize: "11px",
                              width: "140px",
                              minWidth: "140px",
                              borderRight: "2px solid #cbd5e1",
                              color: "#1e3a8a",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span>{(p.apodo || p.nombre || "").toUpperCase()}</span>
                            </div>
                          </th>
                          {daysChunk.map((d) => {
                            const dIdx = filteredDays.findIndex((dayObj) => dayObj.id === d.id);
                            const cellKey = `${p.id}_${d.id}`;
                            const cellKeyFecha = `${p.id}_${d.fecha}`;
                            const pApodo = (p.apodo || "").toUpperCase().trim();
                            const pNombre = (p.nombre || "").toUpperCase().trim();
                            const rawVal = (
                              playerEventsMap[cellKeyFecha] ||
                              playerEventsMap[cellKey] ||
                              (pApodo ? playerEventsMap[`${pApodo}_${d.fecha}`] : "") ||
                              (pNombre ? playerEventsMap[`${pNombre}_${d.fecha}`] : "") ||
                              ""
                            ).trim();

                            const isInRange = dIdx !== -1 && rIdx !== -1 && isCellInRange(rIdx, dIdx);
                            const isInFill = dIdx !== -1 && rIdx !== -1 && isCellInFillPreview(rIdx, dIdx);
                            const isCorner = dIdx !== -1 && rIdx !== -1 && isBottomRightCornerCell(rIdx, dIdx);

                            const borderRight = isSundayDate(d.fecha) ? "3px solid #0f172a" : "1px solid #cbd5e1";
                            const bg = isInFill ? "#bae6fd" : isInRange ? "#e0f2fe" : "#ffffff";

                            return (
                              <td
                                key={`pe_cell_${p.id}_${d.id}`}
                                onMouseDown={(e) => dIdx !== -1 && handleCellMouseDown(rowKey, dIdx, e)}
                                onMouseEnter={() => dIdx !== -1 && handleCellMouseEnter(rowKey, dIdx)}
                                style={{
                                  padding: "4px 3px",
                                  textAlign: "center",
                                  verticalAlign: "top",
                                  minWidth: "110px",
                                  width: "110px",
                                  borderRight,
                                  position: "relative",
                                  background: bg,
                                  boxShadow: isInRange ? "inset 0 0 0 2px #0284c7" : "none",
                                }}
                              >
                                <PlayerEventCell
                                  jugadorId={p.id}
                                  dayId={d.id}
                                  rawVal={rawVal}
                                  availableCodesList={getDailyTeamEventsMap(d.id, d.fecha).availableCodesList}
                                  tiposEventoConfig={tiposEventoConfig}
                                  parsedBadges={parsePlayerEventCellString(rawVal, d.id, d.fecha)}
                                  onChange={(newVal) => {
                                    setPlayerEventsMap((prev) => {
                                      const next = {
                                        ...prev,
                                        [cellKey]: newVal,
                                        [cellKeyFecha]: newVal,
                                      };
                                      if (typeof window !== "undefined") {
                                        try {
                                          localStorage.setItem("player_events_map_v1", JSON.stringify(next));
                                          window.dispatchEvent(new Event("player_events_updated"));
                                        } catch (e) {}
                                      }
                                      return next;
                                    });
                                    updatePlayerEventAssignmentBBDD({
                                      jugadorId: p.id,
                                      dayId: d.id,
                                      fecha: d.fecha,
                                      eventoAsignado: newVal || null,
                                    }).catch(console.error);
                                  }}
                                />

                                {isCorner && (
                                  <div
                                    onMouseDown={(e) => handleFillHandleMouseDown(e)}
                                    title="Arrastrar para rellenar asignación"
                                    style={{
                                      position: "absolute",
                                      bottom: "2px",
                                      right: "2px",
                                      width: "7px",
                                      height: "7px",
                                      background: "#0284c7",
                                      border: "1px solid #ffffff",
                                      cursor: "crosshair",
                                      zIndex: 20,
                                    }}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </>
              )}


                </tbody>
      </table>
    );
  };

  // Preparar bloques para la vista Mesociclo (4 semanas apiladas de 7 días cada una) memoizado
  const mesocicloWeekChunks: SesionDia[][] = React.useMemo(() => {
    if (viewMode !== "mesociclo") return [];
    const chunks: SesionDia[][] = [];
    for (let i = 0; i < filteredDays.length; i += 7) {
      const chunk = filteredDays.slice(i, i + 7);
      if (chunk.length > 0) chunks.push(chunk);
    }
    return chunks;
  }, [viewMode, filteredDays]);

  return (
    <div style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", color: "#0f172a" }}>
      {/* ESTILOS DE IMPRESIÓN PDF HORIZONTAL PARA ENCAJAR 4 SEMANAS EN 1 SOLA PÁGINA */}
      <style jsx global>{`
        @media print {
          @page {
            size: landscape;
            margin: 2mm 3mm;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            max-width: 100% !important;
          }
          .no-print {
            display: none !important;
          }
          .print-area {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          /* Compactar distancias y fuentes para encajar 4 semanas en 1 sola página PDF */
          .mesociclo-container {
            gap: 2px !important;
          }
          .mesociclo-week-card {
            padding: 2px 4px !important;
            margin-bottom: 0 !important;
            border-radius: 4px !important;
            border: 1px solid #e2e8f0 !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
          }
          .mesociclo-week-title {
            margin-bottom: 1px !important;
            font-size: 9.5px !important;
          }
          table {
            font-size: 8.5px !important;
            width: 100% !important;
          }
          tr {
            height: 16px !important;
          }
          td, th {
            padding: 0px 2px !important;
            font-size: 8.5px !important;
          }
          select, input {
            font-size: 8px !important;
            padding: 0 !important;
            height: auto !important;
          }
        }
      `}</style>

      {/* 1. SELECTOR DE VISTA DISCRETO Y CONTROLES SUPERIORES EN UNA ÚNICA FILA HORIZONTAL Y COMPACTA */}
      <div
        className="no-print"
        style={{
          position: "sticky",
          top: "0",
          zIndex: 45,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "12px",
          background: "#ffffff",
          padding: "5px 10px",
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {/* BOTONES DISCRETOS DE MODO DE VISTA */}
          <div style={{ display: "flex", alignItems: "center", gap: "2px", background: "#f1f5f9", padding: "2px", borderRadius: "6px" }}>
            <button
              type="button"
              onClick={() => setViewMode("microciclo")}
              style={{
                padding: "3px 8px",
                borderRadius: "4px",
                border: "none",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                background: viewMode === "microciclo" ? "#1e3a8a" : "transparent",
                color: viewMode === "microciclo" ? "#ffffff" : "#64748b",
                transition: "all 0.15s ease",
              }}
            >
              Microciclo
            </button>
            <button
              type="button"
              onClick={() => setViewMode("mesociclo")}
              style={{
                padding: "3px 8px",
                borderRadius: "4px",
                border: "none",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                background: viewMode === "mesociclo" ? "#15803d" : "transparent",
                color: viewMode === "mesociclo" ? "#ffffff" : "#64748b",
                transition: "all 0.15s ease",
              }}
            >
              Mesociclo
            </button>
            <button
              type="button"
              onClick={() => setViewMode("personalizado")}
              style={{
                padding: "3px 8px",
                borderRadius: "4px",
                border: "none",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                background: viewMode === "personalizado" ? "#0284c7" : "transparent",
                color: viewMode === "personalizado" ? "#ffffff" : "#64748b",
                transition: "all 0.15s ease",
              }}
            >
              Temporada
            </button>
          </div>

          {/* BOTÓN PIN PARA INMOVILIZAR CONTEXTO AL LADO DE TEMPORADA */}
          <button
            type="button"
            onClick={() => setIsContextSticky((prev) => !prev)}
            title="Fijar contexto arriba"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: isContextSticky ? "#1e3a8a" : "#ffffff",
              color: isContextSticky ? "#ffffff" : "#475569",
              border: `1px solid ${isContextSticky ? "#1e3a8a" : "#cbd5e1"}`,
              borderRadius: "6px",
              padding: "3px 7px",
              fontSize: "12px",
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              transition: "all 0.15s ease",
            }}
          >
            📌
          </button>

          

          {/* FLECHITAS DE NAVEGACIÓN ENTRE MICROCICLOS */}
          {viewMode === "microciclo" && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "3px", background: "#f1f5f9", padding: "2px 4px", borderRadius: "6px" }}>
              <button
                type="button"
                onClick={() => setMicrocicloOffsetWeeks((w) => w - 1)}
                title="Microciclo anterior (Lunes - Domingo anterior)"
                style={{
                  padding: "2px 6px",
                  borderRadius: "4px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#1e3a8a",
                  fontSize: "10.5px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                ◀ Anterior
              </button>
              {microcicloOffsetWeeks !== 0 && (
                <button
                  type="button"
                  onClick={() => setMicrocicloOffsetWeeks(0)}
                  title="Volver al Microciclo actual"
                  style={{
                    padding: "2px 6px",
                    borderRadius: "4px",
                    border: "1px solid #0284c7",
                    background: "#e0f2fe",
                    color: "#0284c7",
                    fontSize: "10px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Microciclo actual
                </button>
              )}
              <button
                type="button"
                onClick={() => setMicrocicloOffsetWeeks((w) => w + 1)}
                title="Siguiente Microciclo (Lunes - Domingo siguiente)"
                style={{
                  padding: "2px 6px",
                  borderRadius: "4px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#1e3a8a",
                  fontSize: "10.5px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Siguiente ▶
              </button>
            </div>
          )}

          {/* BOTÓN DE GUARDADO EN BBDD */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input
              type="file"
              accept=".json"
              id="json-upload"
              style={{ display: "none" }}
              onChange={handleImportJSON}
            />
            <button
              type="button"
              onClick={() => document.getElementById("json-upload")?.click()}
              title="Importar y cargar una copia de seguridad (JSON) de tu ordenador"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "6px",
                background: "#f1f5f9",
                color: "#334155",
                border: "1px solid #cbd5e1",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              📤 Cargar JSON
            </button>

            

            <button
              type="button"
              onClick={handleDownloadJSON}
              title="Descargar copia de seguridad en JSON a tu ordenador"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "6px",
                background: "#f1f5f9",
                color: "#334155",
                border: "1px solid #cbd5e1",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              📥 Bajar JSON
            </button>
            <button
              type="button"
              onClick={handleSaveAllToBBDD}
              disabled={isSavingBBDD}
              title="Guardar planificación en BBDD"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "6px",
                background: isSavingBBDD
                  ? "#94a3b8"
                  : hasUnsavedChanges
                  ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                  : "linear-gradient(135deg, #16a34a, #15803d)",
                color: "#ffffff",
                border: "none",
                fontSize: "11px",
                fontWeight: 800,
                cursor: isSavingBBDD ? "not-allowed" : "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              }}
            >
              {isSavingBBDD ? (
                <>⏳ Guardando...</>
              ) : hasUnsavedChanges ? (
                <>💾 Guardar BBDD (Pendiente)</>
              ) : (
                <>✓ Guardado {lastSavedTime ? `(${lastSavedTime})` : ""}</>
              )}
            </button>
            {saveStatusMsg && (
              <span
                style={{
                  fontSize: "10.5px",
                  fontWeight: 700,
                  color: saveStatusMsg.startsWith("❌") ? "#dc2626" : "#16a34a",
                  background: saveStatusMsg.startsWith("❌") ? "#fef2f2" : "#f0fdf4",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  border: `1px solid ${saveStatusMsg.startsWith("❌") ? "#fecaca" : "#bbf7d0"}`,
                }}
              >
                {saveStatusMsg}
              </span>
            )}
          </div>
        </div>

        {/* MENÚ DESPLEGABLE ÚNICO Y ELEGANTE DE OPCIONES Y AJUSTES */}
        <div
          style={{ position: "relative" }}
          onMouseLeave={() => setShowSettingsPopover(false)}
        >
          <button
            type="button"
            onClick={() => setShowSettingsPopover((prev) => !prev)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 10px",
              borderRadius: "7px",
              border: "1px solid #cbd5e1",
              background: showSettingsPopover ? "#1e3a8a" : "#ffffff",
              color: showSettingsPopover ? "#ffffff" : "#0f172a",
              fontSize: "11px",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            <span>⚙️ Opciones</span>
            <span style={{ fontSize: "9px", opacity: 0.7 }}>{showSettingsPopover ? "▲" : "▼"}</span>
          </button>

          {showSettingsPopover && (
            <div
              onMouseLeave={() => setShowSettingsPopover(false)}
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 2px)",
                zIndex: 300,
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                boxShadow: "0 12px 30px -5px rgba(0,0,0,0.18)",
                padding: "14px",
                width: "280px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                <strong style={{ fontSize: "11px", color: "#0f172a", textTransform: "uppercase" }}>🎛️ Opciones y Ajustes</strong>
                <button
                  type="button"
                  onClick={() => setShowSettingsPopover(false)}
                  style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "11px", color: "#64748b", padding: 0 }}
                >
                  ✕
                </button>
              </div>

              {/* 1. ZOOM */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", fontWeight: 700 }}>
                <span style={{ color: "#475569" }}>🔍 Zoom de rejilla:</span>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "#f1f5f9", padding: "2px 6px", borderRadius: "6px" }}>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                    style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "3px", padding: "1px 6px", cursor: "pointer", fontWeight: 800 }}
                  >
                    −
                  </button>
                  <span style={{ minWidth: "32px", textAlign: "center", fontWeight: 900 }}>{zoomLevel}%</span>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
                    style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "3px", padding: "1px 6px", cursor: "pointer", fontWeight: 800 }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 2. ORDEN DEPORTISTAS */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", fontWeight: 700 }}>
                <span style={{ color: "#475569" }}>⇅ Ordenar por:</span>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  style={{ padding: "3px 6px", borderRadius: "5px", border: "1px solid #cbd5e1", fontSize: "11px", fontWeight: 800, outline: "none", cursor: "pointer" }}
                >
                  <option value="posicion">Por Posición Táctica</option>
                  <option value="dorsal">Dorsal</option>
                  <option value="alfabetico">Nombre</option>
                </select>
              </div>

              {/* 3. BUSCAR JUGADOR */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>🔍 Buscar jugador:</span>
                <input
                  type="text"
                  placeholder="Escribe nombre o dorsal..."
                  value={playerFilterText}
                  onChange={(e) => setPlayerFilterText(e.target.value)}
                  style={{ width: "100%", padding: "5px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "11px", outline: "none" }}
                />
              </div>

              {/* 4. VISIBILIDAD DE JUGADORES */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>👥 Visibilidad deportistas:</span>
                  <span style={{ fontSize: "10px", fontWeight: 800, color: "#0284c7" }}>
                    {sortedJugadores.length - hiddenPlayerIds.size}/{sortedJugadores.length}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    type="button"
                    onClick={() => setHiddenPlayerIds(new Set())}
                    style={{ flex: 1, padding: "3px 6px", fontSize: "10px", fontWeight: 700, borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#1e3a8a", cursor: "pointer" }}
                  >
                    Mostrar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setHiddenPlayerIds(new Set(sortedJugadores.map((j) => j.id)))}
                    style={{ flex: 1, padding: "3px 6px", fontSize: "10px", fontWeight: 700, borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#dc2626", cursor: "pointer" }}
                  >
                    Ocultar todos
                  </button>
                </div>
                <div style={{ maxHeight: "120px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "3px", padding: "4px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #f1f5f9", marginTop: "4px" }}>
                  {sortedJugadores.map((j) => {
                    const isVisible = !hiddenPlayerIds.has(j.id);
                    return (
                      <label key={j.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10.5px", fontWeight: 700, color: "#334155", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setHiddenPlayerIds((prev) => {
                              const next = new Set(prev);
                              if (checked) {
                                next.delete(j.id);
                              } else {
                                next.add(j.id);
                              }
                              return next;
                            });
                          }}
                          style={{ accentColor: "#0284c7" }}
                        />
                        {j.dorsal ? `#${j.dorsal} - ` : ""}{(j.apodo || j.nombre || "").toUpperCase()}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 5. FILAS VISIBLES */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>👁️ Filas visibles del contexto:</span>
                <div style={{ maxHeight: "140px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "3px", padding: "4px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #f1f5f9" }}>
                  {Object.keys(visibleRows).map((rowKey) => {
                    const key = rowKey as keyof typeof visibleRows;
                    const labels: Record<string, string> = {
                      periodo: "Período",
                      subperiodo: "Subperiodo",
                      mes: "Mes",
                      dia: "Día",
                      semana: "Semana",
                      md: "MD",
                      escudo: "Escudo",
                      rival: "Rival",
                      evento: "Evento principal",
                      evento_1: "Evento 1",
                      evento_2: "Evento 2",
                      evento_3: "Evento 3",
                      evento_4: "Evento 4",
                      evento_5: "Evento 5",
                      evento_6: "Evento 6",
                      carga: "Carga",
                      volumen: "Volumen",
                      intensidad: "Intensidad",
                      comentario: "Comentario micro",
                    };
                    return (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10.5px", fontWeight: 700, color: "#334155", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={visibleRows[key]}
                          onChange={(e) => setVisibleRows((prev) => ({ ...prev, [key]: e.target.checked }))}
                          style={{ accentColor: "#0284c7" }}
                        />
                        {labels[key] || key}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. RENDIMIENTO DE TABLAS (MICROCICLO, MESOCICLO APILADO O PERSONALIZADO) */}
      <div className="print-area" style={{ zoom: `${zoomLevel}%` }}>
        {viewMode === "mesociclo" ? (
          <div className="mesociclo-container" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {mesocicloWeekChunks.map((chunk, wIdx) => {
              const firstDayStr = chunk[0] ? formatDiaCorto(chunk[0].fecha) : "";
              const lastDayStr = chunk[chunk.length - 1] ? formatDiaCorto(chunk[chunk.length - 1].fecha) : "";
              const weekNum = calculateDynamicWeekNumber(
                chunk[0].fecha,
                chunk[0] && (chunk[0].fecha >= "2026-07-01" || (chunk[0].equipo || "").toLowerCase().includes("europa") || (chunk[0].equipo || "").toLowerCase().includes("manresa"))
                  ? getSemana1StartDate(days.filter((d) => (d.equipo || "").toLowerCase().includes("europa") || (d.equipo || "").toLowerCase().includes("manresa") || d.fecha >= "2026-07-01"))
                  : semana1StartDate
              );
              return (
                <div
                  key={wIdx}
                  className="mesociclo-week-card"
                  style={{
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    padding: "12px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                    overflowX: "auto",
                  }}
                >
                  <div className="mesociclo-week-title" style={{ fontSize: "12px", fontWeight: 900, color: "#1e3a8a", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Semana {weekNum} ({firstDayStr} - {lastDayStr})
                  </div>
                  {renderSingleTableBlock(chunk)}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            ref={tableContainerRef}
            style={{
              width: "100%",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
            }}
          >
            {renderSingleTableBlock(filteredDays)}
          </div>
        )}
      {/* MODAL PARA AÑADIR COMENTARIO */}
      {addComentarioTarget && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(15, 23, 42, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setAddComentarioTarget(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "440px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid #e2e8f0",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
              Añadir comentario
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
              {addComentarioTarget.jugadorNombre} · {addComentarioTarget.fecha}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newComentarioTexto.trim()) return;

                const nuevo: ComentarioJugadorDia = {
                  id: `c_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                  jugador_id: addComentarioTarget.jugador_id,
                  day_id: addComentarioTarget.day_id,
                  fecha: addComentarioTarget.fecha,
                  tipo: newComentarioTipo,
                  texto: newComentarioTexto.trim(),
                };

                let nextComs: ComentarioJugadorDia[] = [];
                setComentarios((prev) => {
                  nextComs = deduplicateComentarios([...prev, nuevo]);
                  return nextComs;
                });

                // --- Procesar side effects fuera del ciclo de render ---
                if (typeof window !== "undefined") {
                  try {
                    localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(nextComs));
                  } catch (e) {}
                }

                if (addComentarioTarget.jugador_id === "TEAM") {
                  if (typeof window !== "undefined") {
                    try {
                      if (newComentarioTipo === "CON") {
                        const rawPitch = localStorage.getItem("disponibilidad_pitch_comments_v1");
                        const pitchMap = rawPitch ? JSON.parse(rawPitch) : {};
                        pitchMap[addComentarioTarget.fecha] = nuevo.texto;
                        localStorage.setItem("disponibilidad_pitch_comments_v1", JSON.stringify(pitchMap));
                      } else if (newComentarioTipo === "TEC") {
                        const rawTasks = localStorage.getItem("disponibilidad_session_tasks_v1");
                        const tasksMap = rawTasks ? JSON.parse(rawTasks) : {};
                        tasksMap[addComentarioTarget.fecha] = { act: nuevo.texto };
                        localStorage.setItem("disponibilidad_session_tasks_v1", JSON.stringify(tasksMap));
                      }

                      const rawPlanif = localStorage.getItem("planificacion_comentarios_v1");
                      let planifArr: any[] = rawPlanif ? JSON.parse(rawPlanif) : [];
                      planifArr = planifArr.filter(
                        (c) =>
                          !(
                            c &&
                            c.jugador_id === "TEAM" &&
                            (c.fecha === addComentarioTarget.fecha || c.day_id === addComentarioTarget.day_id) &&
                            c.tipo === newComentarioTipo
                          )
                      );
                      planifArr.push(nuevo);
                      localStorage.setItem("planificacion_comentarios_v1", JSON.stringify(planifArr));
                      
                      // Guardado automático en BBDD para comentarios de TEAM
                      savePlayerCommentBBDD({
                        jugadorId: "TEAM",
                        dayId: addComentarioTarget.day_id,
                        fecha: addComentarioTarget.fecha,
                        tipo: newComentarioTipo,
                        texto: nuevo.texto,
                      }).catch(console.error);
                    } catch (e) {}
                  }
                } else {
                  const fieldMap: Record<string, string> = {
                    WEL: "comentario_wellness",
                    FIS: "comentario_fisioterapia",
                    TEC: "comentario_tecnico_tactico",
                    CON: "comentario_preparacion_fisica",
                    OTR: "comentario_medico",
                  };
                  const targetField = fieldMap[newComentarioTipo] || "comentario_wellness";
                  const cellId = `${addComentarioTarget.jugador_id}_${addComentarioTarget.day_id}`;

                  const sameTypeTexts = nextComs
                    .filter(
                      (c) =>
                        c.jugador_id === addComentarioTarget.jugador_id &&
                        (c.day_id === addComentarioTarget.day_id || c.fecha === addComentarioTarget.fecha) &&
                        c.tipo === newComentarioTipo
                    )
                    .map((c) => c.texto);

                  savePlayerCommentBBDD({
                    jugadorId: addComentarioTarget.jugador_id,
                    dayId: addComentarioTarget.day_id,
                    fecha: addComentarioTarget.fecha,
                    tipo: newComentarioTipo,
                    texto: sameTypeTexts.join("\n"),
                  }).catch(console.error);
                }
                
                // Guardar también en localStorage para BBDD client render
                if (typeof window !== "undefined") {
                  try {
                    window.dispatchEvent(new Event("storage"));
                  } catch (e) {}
                }

                setNewComentarioTexto("");
                setAddComentarioTarget(null);
              }}
            >
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#334155", marginBottom: "4px", textTransform: "uppercase" }}>
                  Tipo de comentario *
                </label>
                <select
                  value={newComentarioTipo}
                  onChange={(e) => setNewComentarioTipo(e.target.value as TipoComentarioCodigo)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    fontWeight: 700,
                    outline: "none",
                    background: "#ffffff",
                  }}
                >
                  {TIPOS_COMENTARIO.map((tc, idx) => (
                    <option key={tc.codigo} value={tc.codigo}>
                      {idx + 1}- {tc.nombre} ({tc.codigo})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#334155", marginBottom: "4px", textTransform: "uppercase" }}>
                  Comentario escrito *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Escribe aquí las observaciones o notas para este día..."
                  value={newComentarioTexto}
                  onChange={(e) => setNewComentarioTexto(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    outline: "none",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setAddComentarioTarget(null)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#475569",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "none",
                    background: "#1e3a8a",
                    fontSize: "12px",
                    fontWeight: 800,
                    color: "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  Añadir comentario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONTROL DE LESIONES (D -> NDL / NDR) */}
      {pendingLesionModal && (
        <LesionControlModal
          isOpen={true}
          onClose={() => setPendingLesionModal(null)}
          onSave={handleSaveLesionControl}
          initialData={pendingLesionModal}
        />
      )}
      {deleteComentarioTarget && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(15, 23, 42, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setDeleteComentarioTarget(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "400px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid #e2e8f0",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: "15px", fontWeight: 800, color: "#dc2626" }}>
              ¿Eliminar comentario?
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#334155", lineHeight: "1.4" }}>
              ¿Quieres borrar el comentario ({deleteComentarioTarget.tipo}): <strong>"{deleteComentarioTarget.texto}"</strong> para el deportista {deleteComentarioTarget.jugadorNombre || undefined}?
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setDeleteComentarioTarget(null)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = deleteComentarioTarget;
                  if (target) {
                    setComentarios((prev) => {
                      const nextComs = prev.filter((c) => {
                        if (c.id === target.id) return false;
                        if (
                          target.tipo === "WEL" &&
                          c.tipo === "WEL" &&
                          c.jugador_id === target.jugador_id &&
                          (c.day_id === target.day_id || c.fecha === target.fecha)
                        ) {
                          return false;
                        }
                        return true;
                      });
                      if (typeof window !== "undefined") {
                        try {
                          localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(nextComs));
                        } catch (e) {}
                      }

                      if (target.jugador_id === "TEAM") {
                        if (typeof window !== "undefined") {
                          try {
                            const rawPitch = localStorage.getItem("disponibilidad_pitch_comments_v1");
                            const pitchMap = rawPitch ? JSON.parse(rawPitch) : {};
                            delete pitchMap[target.fecha];
                            localStorage.setItem("disponibilidad_pitch_comments_v1", JSON.stringify(pitchMap));

                            const rawPlanif = localStorage.getItem("planificacion_comentarios_v1");
                            let planifArr: any[] = rawPlanif ? JSON.parse(rawPlanif) : [];
                            planifArr = planifArr.filter((c) => c && c.id !== target.id);
                            localStorage.setItem("planificacion_comentarios_v1", JSON.stringify(planifArr));
                          } catch (e) {}
                        }
                      } else {
                        const fieldMap: Record<string, string> = {
                          WEL: "comentario_wellness",
                          FIS: "comentario_fisioterapia",
                          TEC: "comentario_tecnico_tactico",
                          CON: "comentario_preparacion_fisica",
                          OTR: "comentario_medico",
                        };
                        const targetField = fieldMap[target.tipo] || "comentario_wellness";
                        const cellId = `${target.jugador_id}_${target.day_id}`;
                        
                        const remainingSameType = nextComs
                          .filter(
                            (c) =>
                              c.jugador_id === target.jugador_id &&
                              (c.day_id === target.day_id || c.fecha === target.fecha) &&
                              c.tipo === target.tipo
                          )
                          .map((c) => c.texto);

                        // Defer execution outside the React updater render cycle using window object as temporary queue
                        if (typeof window !== "undefined") {
                          (window as any)._pendingDbUpdates = (window as any)._pendingDbUpdates || [];
                          (window as any)._pendingDbUpdates.push({ cellId, targetField, text: remainingSameType.join("\n") });
                        }
                      }

                      return nextComs;
                    });
                    
                    // Procesar side effects
                    if (target) {
                      if (target.jugador_id === "TEAM") {
                        deletePlayerCommentBBDD({
                          jugadorId: "TEAM",
                          dayId: target.day_id,
                          fecha: target.fecha,
                          tipo: target.tipo,
                        }).catch(console.error);
                      } else {
                        const remaining = comentarios
                          .filter((c) => c.id !== target.id && c.jugador_id === target.jugador_id && (c.day_id === target.day_id || c.fecha === target.fecha) && c.tipo === target.tipo)
                          .map((c) => c.texto)
                          .join("\n");
                        savePlayerCommentBBDD({
                          jugadorId: target.jugador_id,
                          dayId: target.day_id,
                          fecha: target.fecha,
                          tipo: target.tipo,
                          texto: remaining,
                        }).catch(console.error);
                      }
                    }
                  }

                  setDeleteComentarioTarget(null);
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#dc2626",
                  fontSize: "12px",
                  fontWeight: 800,
                  color: "#ffffff",
                  cursor: "pointer",
                }}
              >
                Sí, borrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: GESTIÓN DE TIPOS DE EVENTOS (AÑADIR, EDITAR, QUITAR) */}
      {showTiposManagerModal && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => {
            setShowTiposManagerModal(false);
            setEditingTipoItem(null);
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "24px",
              width: "100%",
              maxWidth: "600px",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid #cbd5e1",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 900, color: "#0f172a" }}>
                  ⚙️ Administración de Tipos de Eventos
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                  Puedes añadir nuevos tipos de eventos, editar sus códigos y colores, o eliminar los existentes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTiposManagerModal(false);
                  setEditingTipoItem(null);
                }}
                style={{ border: "none", background: "transparent", fontSize: "18px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            {/* FORMULARIO DE CREACIÓN / EDICIÓN */}
            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#1e3a8a", marginBottom: "10px", textTransform: "uppercase" }}>
                {editingTipoItem ? `✏️ Editar Tipo: ${editingTipoItem.codigo}` : "➕ Añadir Nuevo Tipo de Evento"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px", marginBottom: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>Código (Corta) *</label>
                  <input
                    type="text"
                    placeholder="ej. Co, Op, Pa"
                    value={newTipoCodigo}
                    onChange={(e) => setNewTipoCodigo(e.target.value)}
                    style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 800 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>Nombre Completo *</label>
                  <input
                    type="text"
                    placeholder="ej. Coadyuvante (Co)"
                    value={newTipoNombre}
                    onChange={(e) => setNewTipoNombre(e.target.value)}
                    style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 700 }}
                  />
                </div>
              </div>

              {/* SELECCIÓN DE COLORES */}
              <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
                <div>
                  <label style={{ display: "block", fontSize: "10.5px", fontWeight: 700, color: "#475569", marginBottom: "2px" }}>Texto</label>
                  <input
                    type="color"
                    value={newTipoColor}
                    onChange={(e) => setNewTipoColor(e.target.value)}
                    style={{ width: "32px", height: "28px", border: "none", cursor: "pointer", borderRadius: "4px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "10.5px", fontWeight: 700, color: "#475569", marginBottom: "2px" }}>Fondo</label>
                  <input
                    type="color"
                    value={newTipoBg}
                    onChange={(e) => setNewTipoBg(e.target.value)}
                    style={{ width: "32px", height: "28px", border: "none", cursor: "pointer", borderRadius: "4px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "10.5px", fontWeight: 700, color: "#475569", marginBottom: "2px" }}>Borde</label>
                  <input
                    type="color"
                    value={newTipoBorder}
                    onChange={(e) => setNewTipoBorder(e.target.value)}
                    style={{ width: "32px", height: "28px", border: "none", cursor: "pointer", borderRadius: "4px" }}
                  />
                </div>

                {/* Vista previa del Distinctivo */}
                <div style={{ marginLeft: "auto" }}>
                  <label style={{ display: "block", fontSize: "10.5px", fontWeight: 700, color: "#475569", marginBottom: "2px" }}>Vista Previa</label>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 10px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: 900,
                      color: newTipoColor,
                      background: newTipoBg,
                      border: `1px solid ${newTipoBorder}`,
                    }}
                  >
                    {newTipoCodigo || "—"}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                {editingTipoItem && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTipoItem(null);
                      setNewTipoCodigo("");
                      setNewTipoNombre("");
                    }}
                    style={{ padding: "6px 12px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#ffffff", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!newTipoCodigo.trim() || !newTipoNombre.trim()) return;
                    const cleanCode = newTipoCodigo.trim();

                    if (editingTipoItem) {
                      setTiposEventoConfig((prev) =>
                        prev.map((t) =>
                          t.codigo === editingTipoItem.codigo
                            ? { codigo: cleanCode, nombre: newTipoNombre.trim(), color: newTipoColor, bg: newTipoBg, border: newTipoBorder }
                            : t
                        )
                      );
                      setEditingTipoItem(null);
                    } else {
                      setTiposEventoConfig((prev) => [
                        ...prev.filter((t) => t.codigo.toLowerCase() !== cleanCode.toLowerCase()),
                        { codigo: cleanCode, nombre: newTipoNombre.trim(), color: newTipoColor, bg: newTipoBg, border: newTipoBorder },
                      ]);
                    }
                    setNewTipoCodigo("");
                    setNewTipoNombre("");
                  }}
                  style={{ padding: "6px 14px", borderRadius: "4px", border: "none", background: "#1e3a8a", color: "#ffffff", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
                >
                  {editingTipoItem ? "Guardar Cambios" : "➕ Añadir Tipo"}
                </button>
              </div>
            </div>

            {/* LISTADO DE TIPOS EXISTENTES */}
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#334155", marginBottom: "8px", textTransform: "uppercase" }}>
              Lista de Tipos Registrados ({tiposEventoConfig.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "250px", overflowY: "auto", marginBottom: "16px" }}>
              {tiposEventoConfig.map((t) => (
                <div
                  key={t.codigo}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: "4px",
                        fontSize: "11.5px",
                        fontWeight: 900,
                        color: t.color,
                        background: t.bg,
                        border: `1px solid ${t.border}`,
                        minWidth: "42px",
                        textAlign: "center",
                      }}
                    >
                      {t.codigo}
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>{t.nombre}</span>
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTipoItem(t);
                        setNewTipoCodigo(t.codigo);
                        setNewTipoNombre(t.nombre);
                        setNewTipoColor(t.color);
                        setNewTipoBg(t.bg);
                        setNewTipoBorder(t.border);
                      }}
                      style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: "10.5px", fontWeight: 700, cursor: "pointer", color: "#0284c7" }}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTiposEventoConfig((prev) => prev.filter((item) => item.codigo !== t.codigo));
                      }}
                      style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #fecaca", background: "#fef2f2", fontSize: "10.5px", fontWeight: 700, cursor: "pointer", color: "#dc2626" }}
                    >
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "12px" }}>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("¿Restablecer los tipos de evento a los valores predeterminados de la imagen de referencia?")) {
                    setTiposEventoConfig(DEFAULT_TIPOS_EVENTO_CONFIG);
                  }
                }}
                style={{ padding: "6px 10px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#ffffff", fontSize: "11px", fontWeight: 700, color: "#64748b", cursor: "pointer" }}
              >
                🔄 Restablecer predeterminados
              </button>
              <button
                type="button"
                onClick={() => setShowTiposManagerModal(false)}
                style={{ padding: "6px 14px", borderRadius: "4px", border: "none", background: "#0f172a", fontSize: "11px", fontWeight: 800, color: "#ffffff", cursor: "pointer" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ACCEDER DENTRO DEL EVENTO / DETALLE DE SESIÓN (BOTÓN 🔲 EN FILA 9) */}
      {eventoDetailModalTarget && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setEventoDetailModalTarget(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "24px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid #cbd5e1",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>🔲</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#0f172a" }}>
                    Acceso al Interior del Evento
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "#64748b", fontWeight: 700 }}>
                    Fecha: {formatDiaCorto(eventoDetailModalTarget.fecha)} · Bloque #{eventoDetailModalTarget.slot + 1}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEventoDetailModalTarget(null)}
                style={{ border: "none", background: "transparent", fontSize: "18px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            {/* RESUMEN DE LAS 9 CELDAS DEL EVENTO */}
            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px", fontSize: "12px" }}>
                <div>
                  <strong style={{ color: "#64748b", fontSize: "10.5px", display: "block" }}>1. TIPO SESIÓN</strong>
                  <span style={{ fontWeight: 900, color: "#1e3a8a" }}>{eventoDetailModalTarget.tipo || "Sin asignar"}</span>
                </div>
                <div>
                  <strong style={{ color: "#64748b", fontSize: "10.5px", display: "block" }}>2. HORA</strong>
                  <span style={{ fontWeight: 800, color: "#0f172a" }}>{eventoDetailModalTarget.hora || "—"}</span>
                </div>
                <div>
                  <strong style={{ color: "#64748b", fontSize: "10.5px", display: "block" }}>3. LUGAR</strong>
                  <span style={{ fontWeight: 800, color: "#0f172a" }}>{eventoDetailModalTarget.lugar || "—"}</span>
                </div>
                <div>
                  <strong style={{ color: "#64748b", fontSize: "10.5px", display: "block" }}>4. DURACIÓN</strong>
                  <span style={{ fontWeight: 800, color: "#0f172a" }}>{eventoDetailModalTarget.duracion ? `${eventoDetailModalTarget.duracion} min` : "—"}</span>
                </div>
                <div>
                  <strong style={{ color: "#64748b", fontSize: "10.5px", display: "block" }}>5. ORIENTACIÓN</strong>
                  <span style={{ fontWeight: 800, color: "#0f172a" }}>{eventoDetailModalTarget.orientacion || "—"}</span>
                </div>
                <div>
                  <strong style={{ color: "#64748b", fontSize: "10.5px", display: "block" }}>6. CARGA</strong>
                  <span style={{ fontWeight: 800, color: "#0f172a" }}>{eventoDetailModalTarget.carga || "—"}</span>
                </div>
                <div>
                  <strong style={{ color: "#64748b", fontSize: "10.5px", display: "block" }}>7. COMENTARIO</strong>
                  <span style={{ fontWeight: 800, color: "#0f172a" }}>{eventoDetailModalTarget.comentario || "—"}</span>
                </div>
                <div>
                  <strong style={{ color: "#64748b", fontSize: "10.5px", display: "block" }}>8. Nº JUGADORES</strong>
                  <span style={{ fontWeight: 800, color: "#0f172a" }}>{eventoDetailModalTarget.num_jugadores || "—"}</span>
                </div>
              </div>
            </div>

            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "10px 12px", borderRadius: "8px", color: "#1e40af", fontSize: "11.5px", fontWeight: 700, marginBottom: "16px" }}>
              💡 Esta casilla interactiva (celda 9 de Sesión) está preparada para acceder a la gestión detallada del evento (tareas, ejercicios, convocados y contenidos tácticos).
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setEventoDetailModalTarget(null)}
                style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "#1e3a8a", color: "#ffffff", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPOVER SELECTOR DE EVENTO GLOBAL ÚNICO */}
      {activePickerCell && activePickerCell.rect && (
        <div
          className="no-print"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          /* onMouseLeave removed for stability */
          style={{
            position: "fixed",
            top: activePickerCell.rect.top + activePickerCell.rect.height + 4,
            left: activePickerCell.rect.left + activePickerCell.rect.width / 2,
            transform: "translateX(-50%)",
            zIndex: 99999,
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3)",
            padding: "6px",
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "4px",
            minWidth: "190px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              handleCellUpdate(activePickerCell.dayId, activePickerCell.rowKey as keyof SesionDia, "");
              const dayObj = days.find((d) => d.id === activePickerCell.dayId);
              if (dayObj) handleEventoBlockUpdate(dayObj.id, dayObj.fecha, activePickerCell.slotIdx, "tipo", "");
              setActivePickerCell(null);
            }}
            style={{
              padding: "5px 8px",
              borderRadius: "4px",
              border: "1px dashed #cbd5e1",
              background: "#f8fafc",
              fontSize: "11px",
              fontWeight: 700,
              color: "#64748b",
              cursor: "pointer",
              gridColumn: "span 2",
            }}
          >
            — Limpiar —
          </button>
          {tiposEventoConfig.map((t) => (
            <button
              key={t.codigo}
              type="button"
              onClick={() => {
                handleCellUpdate(activePickerCell.dayId, activePickerCell.rowKey as keyof SesionDia, t.codigo);
                const dayObj = days.find((d) => d.id === activePickerCell.dayId);
                if (dayObj) handleEventoBlockUpdate(dayObj.id, dayObj.fecha, activePickerCell.slotIdx, "tipo", t.codigo);
                const targetSlot = activePickerCell.slotIdx;
                const targetDayId = activePickerCell.dayId;
                const targetFecha = dayObj?.fecha || "";
                setActivePickerCell(null);
                if (isMatchCode(t.codigo)) {
                  setTimeout(() => {
                    openPaConfigModal(targetDayId, targetFecha, targetSlot);
                  }, 120);
                }
              }}
              style={{
                padding: "6px 8px",
                borderRadius: "4px",
                border: `1px solid ${t.border}`,
                background: t.bg,
                color: t.color,
                fontSize: "11px",
                fontWeight: 900,
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              {t.codigo}
            </button>
          ))}
        </div>
      )}

      {/* MODAL PARA PREGUNTAR POR LA COMPETICIÓN Y JORNADA O FASE DEL TORNEO AL ASIGNAR PA */}
      {paConfigModalData && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setPaConfigModalData(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "24px",
              width: "100%",
              maxWidth: "500px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              border: "1px solid #cbd5e1",
              animation: "fadeIn 0.2s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* CABECERA DEL MODAL */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "24px", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "6px 8px", borderRadius: "10px" }}>
                  ⚽
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#0f172a" }}>
                    Configurar Partido (Pa)
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "#64748b", fontWeight: 700 }}>
                    {formatDiaCorto(paConfigModalData.fecha)} {paConfigModalData.rival ? `· vs ${paConfigModalData.rival}` : ""} · Bloque #{paConfigModalData.slotIdx + 1}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaConfigModalData(null)}
                style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            {/* SECCIÓN 1: SELECCIONAR COMPETICIÓN */}
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#1e293b", marginBottom: "8px" }}>
                1. Competición del Partido *
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "10px" }}>
                {[
                  { id: "LIGA" as const, label: "Liga", icon: "🏆", desc: "Competición regular" },
                  { id: "COPA_REY" as const, label: "Copa del Rey", icon: "👑", desc: "Torneo de Copa" },
                  { id: "COPA_CATALUNYA" as const, label: "Copa Cat.", icon: "🛡️", desc: "Copa territorial" },
                  { id: "AMISTOSO" as const, label: "Amistoso", icon: "🤝", desc: "Partido amistoso" },
                  { id: "TORNEO" as const, label: "Playoff / Torneo", icon: "⚽", desc: "Fase de ascenso / Torneo" },
                  { id: "OTRA" as const, label: "Otra...", icon: "✏️", desc: "Competición a medida" },
                ].map((item) => {
                  const isSelected = paConfigModalData.tipoCompeticion === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        let compName = paConfigModalData.competicion;
                        if (item.id === "LIGA") compName = "Liga";
                        else if (item.id === "COPA_REY") compName = "Copa del Rey";
                        else if (item.id === "COPA_CATALUNYA") compName = "Copa Catalunya";
                        else if (item.id === "AMISTOSO") compName = "Partido Amistoso";
                        else if (item.id === "TORNEO") compName = "Torneo / Playoff";

                        setPaConfigModalData({
                          ...paConfigModalData,
                          tipoCompeticion: item.id,
                          competicion: compName,
                        });
                      }}
                      style={{
                        padding: "8px 6px",
                        borderRadius: "8px",
                        border: `1.5px solid ${isSelected ? "#2563eb" : "#cbd5e1"}`,
                        background: isSelected ? "#eff6ff" : "#ffffff",
                        color: isSelected ? "#1e3a8a" : "#334155",
                        fontSize: "11px",
                        fontWeight: 800,
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "2px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span style={{ fontSize: "16px" }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Si es otra competición o quiere personalizar el nombre */}
              {(paConfigModalData.tipoCompeticion === "OTRA" || paConfigModalData.tipoCompeticion === "TORNEO") && (
                <div style={{ marginTop: "6px" }}>
                  <input
                    type="text"
                    value={paConfigModalData.competicion}
                    onChange={(e) => setPaConfigModalData({ ...paConfigModalData, competicion: e.target.value })}
                    placeholder="Escribe el nombre de la competición (ej. Copa RFEF, Torneo Internacional...)"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1.5px solid #2563eb",
                      fontSize: "12px",
                      fontWeight: 700,
                      background: "#ffffff",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}
            </div>

            {/* SECCIÓN 2: JORNADA O FASE DEL TORNEO */}
            <div style={{ marginBottom: "20px" }}>
              {paConfigModalData.tipoCompeticion === "LIGA" ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 800, color: "#1e293b" }}>
                      2. Número de Jornada de Liga *
                    </label>
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                      (Ej. Jornada {paConfigModalData.jornada || "X"})
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 800, color: "#475569" }}>Jornada:</span>
                    <input
                      type="number"
                      min={1}
                      max={46}
                      value={paConfigModalData.jornada}
                      onChange={(e) => setPaConfigModalData({ ...paConfigModalData, jornada: e.target.value })}
                      placeholder="1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSavePaConfigModal();
                      }}
                      style={{
                        width: "80px",
                        padding: "7px 10px",
                        borderRadius: "8px",
                        border: "1.5px solid #2563eb",
                        fontSize: "14px",
                        fontWeight: 900,
                        color: "#1e3a8a",
                        textAlign: "center",
                        background: "#eff6ff",
                        outline: "none",
                      }}
                    />

                    {/* Chips rápidos de jornadas frecuentes */}
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setPaConfigModalData({ ...paConfigModalData, jornada: String(num) })}
                          style={{
                            background: paConfigModalData.jornada === String(num) ? "#1e3a8a" : "#f1f5f9",
                            color: paConfigModalData.jornada === String(num) ? "#ffffff" : "#475569",
                            border: "1px solid #cbd5e1",
                            borderRadius: "6px",
                            padding: "3px 6px",
                            fontSize: "10.5px",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          J{num}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : paConfigModalData.tipoCompeticion === "AMISTOSO" ? (
                <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "12px", color: "#475569", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>🤝</span>
                    <span>Partido Amistoso (No se requiere número de jornada)</span>
                  </span>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 800, color: "#1e293b" }}>
                      2. Fase o Ronda del Torneo *
                    </label>
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                      (Copa / Playoff)
                    </span>
                  </div>

                  {/* Chips de fases habituales */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                    {[
                      "Fase Previa",
                      "1ª Ronda",
                      "2ª Ronda",
                      "Dieciseisavos",
                      "Octavos de final",
                      "Cuartos de final",
                      "Semifinales",
                      "Final",
                    ].map((faseItem) => {
                      const isSel = paConfigModalData.fase === faseItem;
                      return (
                        <button
                          key={faseItem}
                          type="button"
                          onClick={() => setPaConfigModalData({ ...paConfigModalData, fase: faseItem })}
                          style={{
                            background: isSel ? "#1e3a8a" : "#ffffff",
                            color: isSel ? "#ffffff" : "#334155",
                            border: `1px solid ${isSel ? "#1e3a8a" : "#cbd5e1"}`,
                            borderRadius: "6px",
                            padding: "4px 8px",
                            fontSize: "11px",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          {faseItem}
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    value={paConfigModalData.fase}
                    onChange={(e) => setPaConfigModalData({ ...paConfigModalData, fase: e.target.value })}
                    placeholder="O escribe la fase / eliminatoria (ej. 1/4 Ida, Triangular...)"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1.5px solid #2563eb",
                      fontSize: "12px",
                      fontWeight: 700,
                      background: "#ffffff",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}
            </div>

            {/* BOTONES DE ACCIÓN */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
              <button
                type="button"
                onClick={() => setPaConfigModalData(null)}
                style={{
                  padding: "9px 16px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#64748b",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Omitir
              </button>
              <button
                type="button"
                onClick={handleSavePaConfigModal}
                style={{
                  padding: "9px 22px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#1e3a8a",
                  color: "#ffffff",
                  fontSize: "12.5px",
                  fontWeight: 900,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 4px rgba(30, 58, 138, 0.3)",
                }}
              >
                <span>💾</span>
                <span>Guardar Partido</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA EDITAR / GUARDAR ESCUDO Y RIVAL EN BBDD */}
      {escudoModalData && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setEscudoModalData(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "24px",
              width: "100%",
              maxWidth: "460px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e2e8f0",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                🛡️ Guardar Rival y Escudo en BBDD
              </h3>
              <button
                onClick={() => setEscudoModalData(null)}
                style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Nombre del equipo rival *
              </label>
              <input
                type="text"
                value={escudoModalData.nombre}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  const autoEscudo = findRivalEscudoUrl(val, rivalesList);
                  setEscudoModalData((prev: any) => ({
                    ...prev,
                    nombre: val,
                    escudoUrl: prev?.escudoUrl || autoEscudo || ""
                  }));
                }}
                placeholder="ej. SD HUESCA, GIRONA FC B, etc."
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1.5px solid #cbd5e1", fontSize: "13px", fontWeight: 800 }}
              />
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Dirección de imagen (URL del escudo)
              </label>
              <input
                type="text"
                value={escudoModalData.escudoUrl}
                onChange={(e) => setEscudoModalData((prev: any) => ({ ...prev, escudoUrl: e.target.value }))}
                placeholder="https://.../escudo.png"
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1.5px solid #cbd5e1", fontSize: "12px" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                O subir archivo de imagen local (PNG, JPG, SVG)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                      const dataUrl = re.target?.result as string;
                      if (dataUrl) {
                        setEscudoModalData((prev: any) => ({ ...prev, escudoUrl: dataUrl }));
                      }
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                style={{ fontSize: "12px" }}
              />
            </div>

            <div style={{ textAlign: "center", padding: "12px", background: "#f8fafc", borderRadius: "8px", marginBottom: "16px", border: "1px dashed #cbd5e1" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "6px" }}>Previsualización del escudo:</span>
              {escudoModalData.escudoUrl ? (
                <img
                  src={escudoModalData.escudoUrl}
                  alt="Escudo"
                  style={{ maxHeight: "64px", maxWidth: "64px", objectFit: "contain", margin: "0 auto", display: "block" }}
                />
              ) : (
                <div style={{ fontSize: "36px" }}>🛡️</div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                onClick={() => setEscudoModalData(null)}
                style={{ padding: "8px 14px", borderRadius: "8px", background: "#f1f5f9", border: "none", fontWeight: 700, cursor: "pointer", color: "#475569" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEscudoModal}
                disabled={isSavingEscudo}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                {isSavingEscudo ? "Guardando en BBDD..." : "💾 Guardar en BBDD"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURACIÓN Y DIAGNÓSTICO GOOGLE SHEETS WELLNESS */}
      {showWellnessConfigModal && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setShowWellnessConfigModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "24px",
              width: "100%",
              maxWidth: "580px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid #cbd5e1",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: "17px", fontWeight: 900, color: "#0f172a" }}>
              🟢 Sincronización de Comentarios Wellness (Google Sheets)
            </h3>

            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "12px", borderRadius: "8px", fontSize: "12px", color: "#1e40af", marginBottom: "14px", lineHeight: "1.5" }}>
              <strong>💡 Cómo dar acceso público de lectura a tu Google Sheet en 2 clics:</strong>
              <ol style={{ margin: "6px 0 0", paddingLeft: "20px" }}>
                <li>Abre tu hoja de Google Sheets.</li>
                <li>Haz clic en el botón azul <strong>Compartir</strong> (arriba a la derecha).</li>
                <li>En <em>Acceso general</em>, cambia de <strong>Restringido</strong> a <strong>Cualquier persona con el enlace (Lector)</strong>.</li>
              </ol>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>
                URL de la hoja de Google Sheets (Base de datos Wellness)
              </label>
              <input
                type="url"
                value={customWellnessUrl}
                onChange={(e) => {
                  setCustomWellnessUrl(e.target.value);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("wellness_sheet_url_v2", e.target.value);
                  }
                }}
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 700 }}
              />
            </div>

            {wellnessSyncState.message && (
              <div style={{ padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 800, marginBottom: "16px", background: wellnessSyncState.status === "error" ? "#fef2f2" : "#f0fdf4", color: wellnessSyncState.status === "error" ? "#dc2626" : "#15803d", border: `1px solid ${wellnessSyncState.status === "error" ? "#fca5a5" : "#86efac"}` }}>
                {wellnessSyncState.message}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setShowWellnessConfigModal(false)}
                style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "#1e3a8a", color: "#ffffff", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

type PlayerEventCellProps = {
  jugadorId: string;
  dayId: string;
  rawVal: string;
  availableCodesList: { codeLabel: string; event: EventoBloque; tipoConfig?: any }[];
  tiposEventoConfig?: TipoEventoConfig[];
  parsedBadges: { token: string; isOrphan: boolean; event: EventoBloque | null; tipoConfig?: any }[];
  onChange: (newVal: string) => void;
};

const PlayerEventCell = React.memo(function PlayerEventCell({ jugadorId, dayId, rawVal, availableCodesList, tiposEventoConfig = [], parsedBadges, onChange }: PlayerEventCellProps) {
  const [showPicker, setShowPicker] = useState<boolean>(false);
  const [isEditingText, setIsEditingText] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>(rawVal);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputText(rawVal);
  }, [rawVal]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    if (showPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showPicker]);

  const handleToggleCode = (codeLabel: string) => {
    const currentTokens = rawVal ? rawVal.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const codeClean = codeLabel.trim();
    const exists = currentTokens.some((t) => {
      const tClean = t.trim().toLowerCase();
      const target = codeClean.toLowerCase();
      return (
        tClean === target ||
        (target.startsWith(tClean) && !isNaN(Number(target.slice(tClean.length)))) ||
        (tClean.startsWith(target) && !isNaN(Number(tClean.slice(target.length))))
      );
    });
    let newTokens: string[];
    if (exists) {
      newTokens = currentTokens.filter((t) => {
        const tClean = t.trim().toLowerCase();
        const target = codeClean.toLowerCase();
        return !(
          tClean === target ||
          (target.startsWith(tClean) && !isNaN(Number(target.slice(tClean.length)))) ||
          (tClean.startsWith(target) && !isNaN(Number(tClean.slice(target.length))))
        );
      });
    } else {
      newTokens = [...currentTokens, codeClean];
    }
    onChange(newTokens.join(", "));
  };

  const handleRemoveToken = (tokenToRemove: string) => {
    const currentTokens = rawVal ? rawVal.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const filtered = currentTokens.filter((t) => t.toLowerCase() !== tokenToRemove.toLowerCase());
    onChange(filtered.join(", "));
  };

  const handleTextSubmit = () => {
    setIsEditingText(false);
    onChange(inputText);
  };

  const badgeCount = parsedBadges.length;
  const badgeFontSize = badgeCount > 4 ? "7.5px" : badgeCount > 2 ? "8.5px" : "9px";
  const badgePadding = badgeCount > 4 ? "0px 2px" : "1px 3px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px", width: "100%", height: "100%", position: "relative", overflow: "visible" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", width: "100%" }}>
        {isEditingText && (
          <input
            type="text"
            value={inputText}
            autoFocus
            onChange={(e) => setInputText(e.target.value)}
            onBlur={handleTextSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTextSubmit();
              if (e.key === "Escape") setIsEditingText(false);
            }}
            style={{
              width: "100%",
              fontSize: "10.5px",
              fontWeight: 800,
              padding: "1px 3px",
              border: "1px solid #0284c7",
              borderRadius: "3px",
              outline: "none",
              background: "#ffffff",
              color: "#0f172a",
            }}
          />
        )}

        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setShowPicker((prev) => !prev);
          }}
          title="Asignar evento a este jugador"
          style={{
            background: "#0284c7",
            color: "#ffffff",
            border: "none",
            borderRadius: "4px",
            width: "18px",
            height: "18px",
            fontSize: "12px",
            fontWeight: 900,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            lineHeight: 1,
            flexShrink: 0,
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            zIndex: 10,
          }}
        >
          +
        </button>
      </div>

      {showPicker && (
        <div
          ref={pickerRef}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 100,
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.22)",
            padding: "8px",
            minWidth: "150px",
            maxWidth: "195px",
            maxHeight: "230px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "5px",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e0f2fe", paddingBottom: "4px", marginBottom: "2px" }}>
            <span style={{ fontSize: "9.5px", fontWeight: 900, color: "#0284c7", textTransform: "uppercase" }}>
              Asignar eventos
            </span>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setShowPicker(false)}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "11px", color: "#64748b", fontWeight: 800, padding: 0 }}
              title="Cerrar"
            >
              ✕
            </button>
          </div>

          {/* EVENTOS CREADOS DEL DÍA ÚNICAMENTE CON SELECCIÓN MÚLTIPLE */}
          {availableCodesList.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {availableCodesList
                .slice()
                .sort((a, b) => {
                  const hA = a.event?.hora ? a.event.hora.trim() : "99:99";
                  const hB = b.event?.hora ? b.event.hora.trim() : "99:99";
                  return hA.localeCompare(hB);
                })
                .map(({ codeLabel, event, tipoConfig }) => {
                  const currentTokens = rawVal ? rawVal.split(",").map((s) => s.trim()).filter(Boolean) : [];
                  const isSelected = currentTokens.some((t) => t.toLowerCase() === codeLabel.toLowerCase());

                  return (
                    <button
                      key={`${codeLabel}_${event.id}`}
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => handleToggleCode(codeLabel)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "4px 7px",
                        borderRadius: "5px",
                        border: isSelected ? `2px solid ${tipoConfig?.border || "#0284c7"}` : `1px solid ${tipoConfig?.border || "#cbd5e1"}`,
                        background: isSelected ? (tipoConfig?.bg || "#e0f2fe") : "#ffffff",
                        color: tipoConfig?.color || "#0f172a",
                        fontSize: "10.5px",
                        fontWeight: isSelected ? 900 : 700,
                        cursor: "pointer",
                        textAlign: "left",
                        boxShadow: isSelected ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                        transition: "all 0.1s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          style={{ pointerEvents: "none", accentColor: "#0284c7", width: "13px", height: "13px" }}
                        />
                        <span>{codeLabel}</span>
                      </div>
                      {event.hora && <span style={{ fontSize: "9.5px", fontWeight: 900, opacity: 0.9 }}>{event.hora}</span>}
                    </button>
                  );
                })}
            </div>
          ) : (
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", fontStyle: "italic", textAlign: "center", padding: "6px 2px" }}>
              Sin eventos creados hoy
            </div>
          )}
        </div>
      )}

      {parsedBadges.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1px", justifyContent: "center", overflow: "hidden", maxWidth: "100%" }}>
          {parsedBadges.map(({ token, isOrphan, tipoConfig }) => {
            const bg = isOrphan ? "#fef2f2" : (tipoConfig?.bg || "#e2e8f0");
            const textColor = isOrphan ? "#dc2626" : (tipoConfig?.color || "#0f172a");
            const border = isOrphan ? "1.5px dashed #ef4444" : `1px solid ${tipoConfig?.border || "#cbd5e1"}`;

            return (
              <span
                key={token}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "1px",
                  padding: badgePadding,
                  borderRadius: "3px",
                  background: bg,
                  color: textColor,
                  border,
                  fontSize: badgeFontSize,
                  fontWeight: 900,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
                title={isOrphan ? `⚠️ Evento "${token}" no encontrado o eliminado en este día` : `Asignado a evento ${token}`}
              >
                <span>{isOrphan ? `⚠️ ${token}` : token}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveToken(token);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: textColor,
                    fontSize: "8.5px",
                    cursor: "pointer",
                    padding: 0,
                    marginLeft: "1px",
                    fontWeight: 900,
                  }}
                  title={`Eliminar asignación ${token}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
});
