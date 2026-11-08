"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  useFavoriteGpsVariables,
  ALL_GPS_VARIABLES,
  DEFAULT_FAVORITE_GPS_VARIABLES,
  calculateGpsMetricValue,
} from "../../lib/gpsVariables";
import {
  computeCompetitiveProfiles,
  getCompactMetricHeader,
  isRateOrPeak,
  CompetitiveProfilePlayer,
} from "../../lib/competitiveProfile";
import { useRouter } from "next/navigation";
import {
  MicrocycleType,
  MICROCICLE_TYPE_CONFIG,
  CustomMicrocycleDef,
  getStoredMicrocycles,
  saveStoredMicrocycles,
  saveMicrocycleTypeOverride,
  getMicrocycleType,
  extractMicrocyclesFromGpsData,
  getMicrocycleForDate,
  getMicrocycleTypeForDate,
  OFFICIAL_SEASON_MICROCYCLES,
  parseDateStrToISO,
} from "../../lib/microciclos";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import { checkDuplicateJugadorNombre, addLesion, getFullExcelBBDDRows, savePlayerProfileConfigServer, getAllGpsDatos } from "../../actions";
import {
  CONTEXTOS_OPTIONS,
  CONTACTO_OPTIONS,
  REGIONES_OPTIONS,
  RECURRENCIA_OPTIONS,
  TEJIDO_OPTIONS,
  GRAVEDAD_OPTIONS,
  LesionFormData,
} from "../../calendario/LesionControlModal";

type Jugador = {
  id: string;
  nombre: string;
  apodo: string | null;
  cor_id: string | null;
  dorsal?: number | string | null;
  pierna_habil?: string | null;
  posicion: string | null;
  equipo: string | null;
  seccion: string | null;
  temporada: string | null;
  nacionalidad: string | null;
  fecha_nacimiento: string | null;
  contacto: string | null;
  anos_en_club: number | null;
  seleccion_autonomica: boolean | null;
  seleccion_nacional: boolean | null;
  peso: number | null;
  altura: number | null;
  foto_url: string | null;
  activo: boolean | null;
};

function parsePosicion(posicion: string | null) {
  if (!posicion) return { base: "", lado: "" };
  const posUpper = posicion?.toString()?.toUpperCase();

  let lado = "";
  if (posUpper.includes("DERECHO") || posUpper.includes("DER") || posUpper.includes("DR")) lado = "DR";
  else if (posUpper.includes("IZQUIERDO") || posUpper.includes("IZQ")) lado = "IZQ";

  let base = posUpper;
  if (posUpper.includes("PORTERO") || posUpper.includes("POR")) base = "PORTERO";
  else if (posUpper.includes("LATERAL")) base = "LATERAL";
  else if (posUpper.includes("EXTREMO")) base = "EXTREMO";
  else if (posUpper.includes("PIVOTE")) base = "PIVOTE";
  else if (posUpper.includes("INTERIOR")) base = "INTERIOR";
  else if (posUpper.includes("DELANTERO")) base = "DELANTERO";
  else if (posUpper.includes("CENTRAL")) base = "CENTRAL";

  return { base, lado };
}

type Props = {
  jugador: Jugador;
  saveJugadorAction: (formData: FormData) => Promise<void>;
  archiveJugadorAction: (formData: FormData) => Promise<void>;
  initialBBDDRows?: any[];
  initialTestingData?: any[];
  allGpsRecords?: any[];
  allJugadores?: any[];
  initialPlayerTargetRatios?: Record<string, number>;
  initialPlayerCompVariables?: string[];
  initialBenchmarkOverrides?: Record<string, number>;
  initialPlayerHsriVariableKey?: string;
};

function fieldValue(value: string | number | null | undefined) {
  return value ?? "";
}


function formatToDDMM(rawDate: string): string {
  if (!rawDate) return "";
  const s = String(rawDate).trim();
  
  // DD/MM o DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}/.test(s)) {
    const parts = s.split("/");
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    return `${day}/${month}`;
  }
  
  // YYYY-MM-DD o YYYY/MM/DD
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) {
    const parts = s.split(/[-/]/);
    const day = parts[2].slice(0, 2).padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    return `${day}/${month}`;
  }
  
  // DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}/.test(s)) {
    const parts = s.split("-");
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    return `${day}/${month}`;
  }

  // Si tiene timestamp ISO o formato Date
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      return `${day}/${month}`;
    }
  } catch {}

  return s;
}

function calculateGrasaPct6Pliegues(suma6mm: number | null | undefined): number | null {
  if (suma6mm === null || suma6mm === undefined || isNaN(suma6mm) || suma6mm <= 0) return null;
  const fat = (suma6mm * 0.097) + 3.64;
  return Number(Math.max(3.0, Math.min(45.0, fat)).toFixed(1));
}

function getFatCategoryLabel(fatPct: number | null): { label: string; color: string } {
  if (fatPct === null) return { label: "—", color: "#64748b" };
  if (fatPct < 9.0) return { label: "Magro / Alto Rendimiento", color: "#0284c7" };
  if (fatPct <= 13.0) return { label: "Óptimo Competitivo", color: "#16a34a" };
  if (fatPct <= 16.5) return { label: "Aceptable / Moderado", color: "#d97706" };
  return { label: "Elevado / En Seguimiento", color: "#dc2626" };
}

type TestingPlayerHistory = {
  pesoRecords: { date: string; peso: number; delta: number | null; dayAvg: number | null }[];
  plieguesRecords: {
    date: string;
    metricValues: Record<string, number | null>;
    suma: number | null;
    delta: number | null;
    fatPct: number | null;
    fatCategory: { label: string; color: string };
  }[];
  skinfoldMetricsList: string[];
  combinedChartData: { date: string; peso?: number | null; pliegues?: number | null; fatPct?: number | null }[];
};

function loadTestingDataForPlayer(nombre: string, apodo?: string | null, allTestingDatasets?: any[]): TestingPlayerHistory {
  if (typeof window === "undefined" && (!allTestingDatasets || allTestingDatasets.length === 0)) {
    return { pesoRecords: [], plieguesRecords: [], skinfoldMetricsList: [], combinedChartData: [] };
  }

  const norm = (s: string) =>
    (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const targetName = norm(nombre);
  const targetApodo = apodo ? norm(apodo) : "";

  let pesoRecords: { date: string; peso: number; delta: number | null; dayAvg: number | null }[] = [];
  let plieguesRecords: {
    date: string;
    metricValues: Record<string, number | null>;
    suma: number | null;
    delta: number | null;
    fatPct: number | null;
    fatCategory: { label: string; color: string };
  }[] = [];
  let skinfoldMetricsList: string[] = [];

  try {
    let datasets: any[] = [];
    if (allTestingDatasets && allTestingDatasets.length > 0) {
      datasets = allTestingDatasets;
    } else {
      const rawIndex = localStorage.getItem("testing_datasets_index");
      const names: string[] = rawIndex ? JSON.parse(rawIndex) : [];
      names.forEach(n => {
        const raw = localStorage.getItem(`testing_dataset_${n}`);
        if (raw) {
          try { datasets.push(JSON.parse(raw)); } catch {}
        }
      });
    }

    // 1. Extraer PESO
    const pesoDatasets = datasets.filter(d => d.testTypeId === "peso" || (d.name && d.name.toLowerCase().includes("peso")));
    if (pesoDatasets.length > 0) {
      pesoDatasets.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      const pDs = pesoDatasets[0];
      const matchPlayer = pDs.players?.find((p: any) => {
        const pn = norm(p.name || "");
        return pn === targetName || (targetApodo && pn === targetApodo) || pn.includes(targetName) || targetName.includes(pn);
      });

      if (matchPlayer && Array.isArray(pDs.dates)) {
        pDs.dates.forEach((d: string, di: number) => {
          const val = matchPlayer.values?.[di];
          if (val !== null && val !== undefined && !isNaN(Number(val))) {
            // Calcular media de equipo
            const allDayVals = (pDs.players || []).map((p: any) => p.values?.[di]).filter((v: any): v is number => v !== null && v !== undefined && !isNaN(Number(v)));
            const dayAvg = allDayVals.length > 0 ? Number((allDayVals.reduce((a: number, b: number) => a + b, 0) / allDayVals.length).toFixed(1)) : null;

            pesoRecords.push({
              date: formatToDDMM(d),
              peso: Number(val),
              delta: null,
              dayAvg,
            });
          }
        });

        // Calcular deltas
        pesoRecords.forEach((r, idx) => {
          if (idx > 0) {
            r.delta = Number((r.peso - pesoRecords[idx - 1].peso).toFixed(1));
          }
        });
      }
    }

    // 2. Extraer PLIEGUES CUTÁNEOS
    const plieguesDatasets = datasets.filter(d => d.structure === "D" || d.testTypeId === "pliegues" || (d.name && d.name.toLowerCase().includes("pliegue")));
    if (plieguesDatasets.length > 0) {
      plieguesDatasets.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      const plDs = plieguesDatasets[0];

      const rawMetrics = plDs.metricsList && plDs.metricsList.length > 0
        ? plDs.metricsList
        : ["Tricipital", "Subescapular", "Suprailiaco", "Abdominal", "Cuadriceps", "Gemelo"];
      skinfoldMetricsList = rawMetrics.filter((m: string) => m.toLowerCase() !== "suma");

      const matchPlayer = plDs.players?.find((p: any) => {
        const pn = norm(p.name || "");
        return pn === targetName || (targetApodo && pn === targetApodo) || pn.includes(targetName) || targetName.includes(pn);
      });

      if (matchPlayer && Array.isArray(plDs.dates)) {
        plDs.dates.forEach((d: string, di: number) => {
          const dateMetrics = matchPlayer.metricsByDate?.[d] || {};
          const metricValues: Record<string, number | null> = {};

          skinfoldMetricsList.forEach(m => {
            let val: number | null = null;
            if (dateMetrics[m] !== undefined && dateMetrics[m] !== null) {
              val = Number(dateMetrics[m]);
            } else if (plDs.tabularRows) {
              const matchRow = plDs.tabularRows.find(
                (r: any) => r.fecha === d && norm(r.jugador) === targetName
              );
              if (matchRow && matchRow.metrics && matchRow.metrics[m] !== undefined) {
                val = Number(matchRow.metrics[m]);
              }
            }
            metricValues[m] = val;
          });

          let suma: number | null = dateMetrics["Suma"] ?? matchPlayer.values?.[di] ?? null;
          if (suma === null) {
            const validM = Object.values(metricValues).filter((v): v is number => v !== null && !isNaN(v));
            if (validM.length >= skinfoldMetricsList.length && skinfoldMetricsList.length > 0) {
              suma = Number(validM.reduce((a, b) => a + b, 0).toFixed(1));
            }
          }

          if (suma !== null || Object.values(metricValues).some(v => v !== null)) {
            const fatPct = calculateGrasaPct6Pliegues(suma);
            const fatCategory = getFatCategoryLabel(fatPct);

            plieguesRecords.push({
              date: formatToDDMM(d),
              metricValues,
              suma,
              delta: null,
              fatPct,
              fatCategory,
            });
          }
        });

        // Calcular deltas de pliegues
        plieguesRecords.forEach((r, idx) => {
          if (idx > 0 && r.suma !== null && plieguesRecords[idx - 1].suma !== null) {
            r.delta = Number((r.suma - plieguesRecords[idx - 1].suma!).toFixed(1));
          }
        });
      }
    }
  } catch (err) {
    console.error("Error loading player testing data:", err);
  }

  // 3. Crear combinedChartData unificando fechas
  const datesSet = new Set<string>([
    ...pesoRecords.map(r => r.date),
    ...plieguesRecords.map(r => r.date),
  ]);

  const combinedChartData = Array.from(datesSet).map(date => {
    const pRec = pesoRecords.find(r => r.date === date);
    const plRec = plieguesRecords.find(r => r.date === date);
    return {
      date: formatToDDMM(date),
      peso: pRec ? pRec.peso : null,
      pliegues: plRec ? plRec.suma : null,
      fatPct: plRec ? plRec.fatPct : null,
    };
  });

  return {
    pesoRecords,
    plieguesRecords,
    skinfoldMetricsList: skinfoldMetricsList.length > 0 ? skinfoldMetricsList : ["Tricipital", "Subescapular", "Suprailiaco", "Abdominal", "Cuadriceps", "Gemelo"],
    combinedChartData,
  };
}

function getLatestTestingPeso(nombre: string, apodo?: string | null): number | null {
  if (typeof window === "undefined") return null;
  try {
    const index = localStorage.getItem("testing_datasets_index");
    if (!index) return null;
    const names: string[] = JSON.parse(index);
    const pesoDsList: any[] = [];
    names.forEach(n => {
      const raw = localStorage.getItem(`testing_dataset_${n}`);
      if (!raw) return;
      try {
        const ds = JSON.parse(raw);
        if (ds.testTypeId === "peso" || n.toLowerCase().includes("peso")) {
          pesoDsList.push(ds);
        }
      } catch {}
    });
    if (pesoDsList.length === 0) return null;
    pesoDsList.sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const ds = pesoDsList[0];
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const playerNorm = norm(nombre || "");
    const apodoNorm = apodo ? norm(apodo) : "";
    const match = ds.players?.find((p: any) => {
      const pn = norm(p.name || "");
      return pn === playerNorm || (apodoNorm && pn === apodoNorm);
    });
    if (!match || !Array.isArray(match.values)) return null;
    for (let i = match.values.length - 1; i >= 0; i--) {
      const v = match.values[i];
      if (v !== null && v !== undefined && !isNaN(Number(v))) {
        return Number(v);
      }
    }
  } catch (err) {
    console.error("Error reading testing peso:", err);
  }
  return null;
}

function loadPlayerLesionesFromStorage(jugadorId: string, jugadorNombre: string): any[] {
  if (typeof window === "undefined") return [];
  try {
    const rawDetailed = localStorage.getItem("lesiones_registro_detallado_v1");
    const detailedList: any[] = rawDetailed ? JSON.parse(rawDetailed) : [];

    const rawDel = localStorage.getItem("lesiones_eliminadas_v1");
    const deletedKeys = new Set<string>(rawDel ? JSON.parse(rawDel) : []);

    const rawExtra = localStorage.getItem(`player_extra_${jugadorId}`);
    const extraLesiones = rawExtra ? JSON.parse(rawExtra)?.lesiones || [] : [];

    // Comments map
    const rawCom = localStorage.getItem("comentarios_jugadores_v2");
    const comArr: any[] = rawCom ? JSON.parse(rawCom) : [];
    const comMap: Record<string, string> = {};
    comArr.forEach((c) => {
      if (c && c.jugador_id === jugadorId && c.fecha && c.tipo === "FIS" && c.texto) {
        comMap[c.fecha] = c.texto.trim();
      }
    });

    const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const playerNorm = norm(jugadorNombre || "");

    // Función para limpiar fechas que correspondan al envío del formulario de valoración (ej: 30-08-2026)
    const sanitizeFecha = (rawF: any) => {
      if (!rawF) return "";
      const s = String(rawF).trim();
      if (s === "2026-08-30" || s === "30-08-2026" || s === "30/08/2026" || s.startsWith("2026-08-30") || s === "2026-08-29" || s === "2026-08-31") {
        return ""; // No era fecha de lesión, era fecha del cuestionario -> queda en blanco
      }
      return s;
    };

    const getUniqueKey = (f: string, z: string, t: string, c: string) =>
      `${norm(f)}_${norm(z)}_${norm(t)}_${norm(c).slice(0, 60)}`;

    // Detailed matches for this player from global Historial de Lesiones
    const playerDetailed = detailedList.filter((r) => {
      const matchId = r.jugador_id === jugadorId;
      const matchName = r.jugador_nombre && norm(r.jugador_nombre) === playerNorm;
      if (!matchId && !matchName) return false;
      const key1 = `${r.jugador_id}_${r.fecha}`;
      const key2 = r.id || "";
      return !deletedKeys.has(key1) && !deletedKeys.has(key2);
    });

    const combined: any[] = [];
    const seenKeys = new Set<string>();

    playerDetailed.forEach((r) => {
      const f = sanitizeFecha(r.fecha);
      const z = r.region_corporal || "Zona no especificada";
      const t = r.tejido || "Lesión";
      const c = r.comentario || comMap[r.fecha] || "";
      const uKey = getUniqueKey(f, z, t, c);

      if (!seenKeys.has(uKey)) {
        seenKeys.add(uKey);
        combined.push({
          id: r.id || `${jugadorId}_${f || "sin_fecha"}`,
          fechaInicio: f,
          fechaAlta: sanitizeFecha(r.fecha_alta),
          tipo: t,
          zona: z,
          contexto: r.contexto || "Entrenamiento",
          contacto: r.contacto || "Sin contacto",
          recurrencia: r.recurrencia || "Nueva",
          gravedad: r.gravedad || (r.dias_baja <= 7 ? "Leve (1 a 7)" : r.dias_baja <= 28 ? "Moderada (8 a 28)" : "Grave (>28)"),
          diasBaja: r.dias_baja !== undefined ? r.dias_baja : 0,
          estado: r.resultado === "Sin baja" || r.dias_baja === 0 ? "Alta Médica" : (r.estado || "Baja Médica"),
          comentario: c,
          isGlobalRecord: true,
        });
      }
    });

    extraLesiones.forEach((l: any) => {
      const f = sanitizeFecha(l.fechaInicio);
      const z = l.zona || "Zona no especificada";
      const t = l.tipo || "Lesión";
      const c = l.comentario || "";
      const uKey = getUniqueKey(f, z, t, c);

      if (!seenKeys.has(uKey) && !deletedKeys.has(l.id)) {
        seenKeys.add(uKey);
        combined.push({
          ...l,
          fechaInicio: f,
          fechaAlta: sanitizeFecha(l.fechaAlta),
        });
      }
    });

    return combined.sort((a, b) => {
      const fa = String(a.fechaInicio || "").trim();
      const fb = String(b.fechaInicio || "").trim();
      if (!fa && !fb) return 0;
      if (!fa) return 1; // Sin fecha abajo del todo
      if (!fb) return -1;
      return fb.localeCompare(fa, undefined, { numeric: true }); // Más recientes arriba
    });
  } catch (e) {
    console.error("Error loading player lesiones:", e);
    return [];
  }
}
function isEntrenamientoCode(code?: string | null): boolean {
  if (!code) return false;
  const c = code.trim()?.toString()?.toUpperCase();
  return ["E", "OP", "CO", "ENTRENAMIENTO", "OPTIMIZADOR", "COADYUVANTE", "ENT"].includes(c) || c.startsWith("E");
}

function isPartidoCode(code?: string | null): boolean {
  if (!code) return false;
  const c = code.trim()?.toString()?.toUpperCase();
  return ["PL", "PAL", "PV", "PAV", "PA", "PAAM", "PARTIDO", "PARTIDO AMISTOSO"].includes(c);
}

function isDinamicaCode(code?: string | null): boolean {
  if (!code) return false;
  const c = code.trim()?.toString()?.toUpperCase();
  return c === "D" || c === "DIN" || c === "DN" || c.includes("DINAM");
}

function isOffCode(code?: string | null): boolean {
  if (!code) return false;
  const c = code.trim()?.toString()?.toUpperCase();
  return ["OFF", "DESCANSO", "FIESTA", "LIBRE", "DES"].includes(c);
}

function isViajeCode(code?: string | null): boolean {
  if (!code) return false;
  const c = code.trim()?.toString()?.toUpperCase();
  return ["VI", "VIAJE"].includes(c);
}

function isPlayerMatchDetail(
  prefix: string | undefined | null,
  jugadorOrId: any,
  maybeJugador?: { id: string; nombre: string; apodo?: string | null }
): boolean {
  if (!prefix && !jugadorOrId) return false;
  const targetJugador = maybeJugador || (typeof jugadorOrId === "object" ? jugadorOrId : null);
  if (!targetJugador) return false;

  const rowId = typeof jugadorOrId === "string" ? jugadorOrId : "";
  if (rowId && targetJugador.id && String(rowId).trim() === String(targetJugador.id).trim()) {
    return true;
  }

  const normP = (str?: string | null) =>
    (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

  const pId = normP(targetJugador.id);
  const pNombre = normP(targetJugador.nombre);
  const pApodo = normP(targetJugador.apodo);
  const clean = normP(prefix);

  if (!clean) return false;
  if (clean === pId || (pApodo && clean === pApodo) || (pNombre && clean === pNombre)) return true;
  if (pNombre && (clean.includes(pNombre) || pNombre.includes(clean))) return true;
  if (pApodo && (clean.includes(pApodo) || pApodo.includes(clean))) return true;

  if (pNombre.split(/[^a-z0-9]/).some((part: string) => part === clean && part.length > 2)) return true;
  if (pApodo.split(/[^a-z0-9]/).some((part: string) => part === clean && part.length > 2)) return true;

  return false;
}

function getPlayerDayValue(
  map: Record<string, any>,
  jugador: Jugador,
  dayObj?: any,
  fecha?: string
): any {
  if (!map || (!dayObj && !fecha)) return undefined;
  const dId = dayObj?.id ? String(dayObj.id) : "";
  const dFecha = fecha || (dayObj?.fecha ? String(dayObj.fecha) : "");

  const identifiers = [
    jugador.id,
    jugador.nombre,
    jugador.apodo,
    jugador.nombre ? jugador.nombre.toLowerCase() : null,
    jugador.apodo ? jugador.apodo.toLowerCase() : null,
    jugador.id ? jugador.id.toLowerCase() : null,
  ].filter(Boolean) as string[];

  const dateKeys = [dFecha, dId].filter(Boolean);

  // 1. Búsqueda por clave directa
  for (const dateKey of dateKeys) {
    for (const id of identifiers) {
      if (map[`${id}_${dateKey}`] !== undefined) return map[`${id}_${dateKey}`];
      if (map[`${dateKey}_${id}`] !== undefined) return map[`${dateKey}_${id}`];
    }
  }

  // 2. Escaneo de entradas que contengan la fecha o dayId
  for (const [k, v] of Object.entries(map)) {
    for (const dateKey of dateKeys) {
      if (k.includes(dateKey)) {
        const rest = k.replace(dateKey, "").replace(/^_+|_+$/g, "").replace(/^slot_\d+_+/, "").replace(/_+slot_\d+$/, "");
        if (isPlayerMatchDetail(rest, jugador)) {
          return v;
        }
      }
    }
  }

  return undefined;
}

function loadRealReportDataForPlayer(
  jugador: Jugador,
  loadedLesiones: any[],
  bbddRows: any[] = []
) {
  if (typeof window === "undefined") return null;

  let days: any[] = [];
  try {
    const rawDays = localStorage.getItem("planificacion_days_v2") || localStorage.getItem("planificacion_days_v1");
    if (rawDays) days = JSON.parse(rawDays);
  } catch (e) {}

  let bloquesMap: Record<string, any> = {};
  try {
    const rawBloques = localStorage.getItem("eventos_bloques_map_v1");
    if (rawBloques) bloquesMap = JSON.parse(rawBloques);
  } catch (e) {}

  let playerEventsMap: Record<string, string> = {};
  try {
    const rawEvents = localStorage.getItem("player_events_map_v1");
    if (rawEvents) playerEventsMap = JSON.parse(rawEvents);
  } catch (e) {}

  let minutesMap: Record<string, any> = {};
  try {
    const rawMin = localStorage.getItem("player_event_minutes_map_v1") || localStorage.getItem("minutos_por_jugador_v1");
    if (rawMin) minutesMap = JSON.parse(rawMin);
  } catch (e) {}

  let dispMap: Record<string, string> = {};
  try {
    const rawDisp1 = localStorage.getItem("disponibilidad_map_v1");
    const rawDisp2 = localStorage.getItem("planificacion_disponibilidad_map");
    const rawDisp3 = localStorage.getItem("planificacion_disponibilidad_map_v1");
    const rawDisp4 = localStorage.getItem("estado_diario_jugador_v1");
    const d1 = rawDisp1 ? JSON.parse(rawDisp1) : {};
    const d2 = rawDisp2 ? JSON.parse(rawDisp2) : {};
    const d3 = rawDisp3 ? JSON.parse(rawDisp3) : {};
    const d4 = rawDisp4 ? JSON.parse(rawDisp4) : {};
    dispMap = { ...d4, ...d3, ...d2, ...d1 };
  } catch (e) {}

  let effectiveBbddRows = bbddRows;
  if (!effectiveBbddRows || effectiveBbddRows.length === 0) {
    try {
      const rawBBDD = localStorage.getItem("bbdd_general_rows_v1");
      if (rawBBDD) effectiveBbddRows = JSON.parse(rawBBDD);
    } catch (e) {}
  }

  const rawSeasons = localStorage.getItem("active_seasons");
  let activeSeasonsList: string[] = ["2026/27"];
  if (rawSeasons) {
    try {
      const parsed = JSON.parse(rawSeasons);
      if (Array.isArray(parsed) && parsed.length > 0) activeSeasonsList = parsed;
    } catch (e) {}
  }
  const activeTeam = localStorage.getItem("active_team") || "";
  const jugTemp = String(jugador?.temporada || "").toLowerCase();
  const jugEq = String(jugador?.equipo || "").toLowerCase();

  const is2025_26 =
    jugTemp.includes("25/26") ||
    jugTemp.includes("2025/2026") ||
    jugEq.includes("prat") ||
    (!jugTemp && !jugEq && (activeTeam.toLowerCase().includes("prat") || (activeSeasonsList.includes("2025/26") && !activeSeasonsList.includes("2026/27"))));

  const seasonStart = is2025_26 ? "2025-07-01" : "2026-07-01";
  const seasonEnd = is2025_26 ? "2026-06-30" : "2027-06-30";
  const todayISO = new Date().toISOString().split("T")[0];
  const effectiveEndDate = seasonEnd < todayISO ? seasonEnd : todayISO;

  // La temporada empieza estrictamente el 20 de julio (primer día de inicio de actividad/datos)
  const firstDay = is2025_26 ? "2025-07-21" : "2026-07-20";

  // Generar todos los días naturales consecutivos desde el 20 de julio hasta el día de hoy
  const allDates: string[] = [];
  const currDate = new Date(firstDay + "T12:00:00");
  const maxDate = new Date(effectiveEndDate + "T12:00:00");
  while (currDate <= maxDate) {
    const y = currDate.getFullYear();
    const m = String(currDate.getMonth() + 1).padStart(2, "0");
    const d = String(currDate.getDate()).padStart(2, "0");
    allDates.push(`${y}-${m}-${d}`);
    currDate.setDate(currDate.getDate() + 1);
  }

  if (allDates.length === 0) return null;

  const seasonLesiones = (loadedLesiones || []).filter((l: any) => {
    const fi = l.fechaInicio || l.fecha;
    if (!fi) return true;
    if (/^\d{4}$/.test(String(fi).trim())) {
      const year = Number(fi);
      return is2025_26 ? (year === 2025 || year === 2026) : (year === 2026 || year === 2027);
    }
    return fi >= firstDay && fi <= effectiveEndDate;
  });

  const totalDias = allDates.length;

  // --- 1. EVENTOS DEL EQUIPO (FORMATO Y EVENTOS DEL EQUIPO CONFIRMADOS) ---
  let pretemporadaCount = 0;
  let competitivoCount = 0;
  let entrenamientosCount = 0;
  let dinamicasCount = 0;
  let partidosCount = 0;
  let viajesCount = 0;
  let diasOffCount = 0;

  allDates.forEach((fecha) => {
    const dayObj = days.find((d: any) => d.fecha === fecha);
    const subperiodo = String(dayObj?.subperiodo || dayObj?.periodo || "")?.toString()?.toUpperCase();
    
    if (subperiodo.includes("COMP") || subperiodo.includes("LIGA") || subperiodo.includes("COMPETITIVO")) {
      competitivoCount++;
    } else {
      pretemporadaCount++;
    }

    const dayBlocks: any[] = [];
    for (let slot = 0; slot < 6; slot++) {
      const b = bloquesMap[`${fecha}_slot_${slot}`] || (dayObj?.id ? bloquesMap[`${dayObj.id}_slot_${slot}`] : null);
      if (b && b.tipo) dayBlocks.push(b);
    }

    const evPrincipalRaw = String(dayObj?.evento || dayObj?.evento_am || "").trim()?.toString()?.toUpperCase();
    const evPrincipal = evPrincipalRaw || (dayBlocks[0]?.tipo ? String(dayBlocks[0]?.tipo).trim()?.toString()?.toUpperCase() : "");
    const evPm = String(dayObj?.evento_pm || (dayBlocks[1]?.tipo) || "").trim()?.toString()?.toUpperCase();

    const isDinamica = isDinamicaCode(evPrincipalRaw) || isDinamicaCode(evPrincipal);
    const isTraining = isEntrenamientoCode(evPrincipalRaw) || isEntrenamientoCode(evPrincipal) || isEntrenamientoCode(evPm) || dayBlocks.some((b) => isEntrenamientoCode(b.tipo) && !isPartidoCode(b.tipo));
    const hasMatch = isPartidoCode(evPrincipalRaw) || isPartidoCode(evPrincipal) || isPartidoCode(evPm) || dayBlocks.some((b) => isPartidoCode(b.tipo));
    const hasTravel = isViajeCode(evPrincipalRaw) || isViajeCode(evPrincipal) || isViajeCode(evPm) || dayBlocks.some((b) => isViajeCode(b.tipo));

    if (hasMatch) {
      partidosCount++;
    } else if (hasTravel) {
      viajesCount++;
    } else if (isTraining) {
      entrenamientosCount++;
    } else {
      diasOffCount++;
    }

    if (isDinamica) {
      dinamicasCount++;
    }
  });

  const evEquipo = [
    { label: "Días totales", pct: 100, val: totalDias },
    { label: "Pretemporada", pct: Math.round((pretemporadaCount / totalDias) * 100) || 0, val: pretemporadaCount },
    { label: "Competitivo", pct: Math.round((competitivoCount / totalDias) * 100) || 0, val: competitivoCount },
    { label: "Entrenamientos", pct: Math.round((entrenamientosCount / totalDias) * 100) || 0, val: entrenamientosCount },
    { label: "Dinámicas", pct: Math.round((dinamicasCount / totalDias) * 100) || 0, val: dinamicasCount },
    { label: "Partidos", pct: Math.round((partidosCount / totalDias) * 100) || 0, val: partidosCount },
    { label: "Viajes", pct: Math.round((viajesCount / totalDias) * 100) || 0, val: viajesCount },
    { label: "Días off", pct: Math.round((diasOffCount / totalDias) * 100) || 0, val: diasOffCount },
  ];

  // --- 2. DISPONIBILIDAD [JUGADOR] (DIRECTAMENTE DE BBDD GENERAL) ---
  let dispCount = 0;
  let dcsCount = 0;
  let selCount = 0;
  let parcialCount = 0;
  let ndrCount = 0;
  let ndoCount = 0;
  let ndlCount = 0;

  allDates.forEach((fecha) => {
    const dayObj = days.find((d: any) => d.fecha === fecha);

    // 1. Lesión clínica activa en esta fecha
    const isInjured = seasonLesiones.some((l: any) => {
      const fi = l.fechaInicio || l.fecha;
      const fa = l.fechaAlta;
      if (!fi) return false;
      const isAlta = l.estado === "Alta Médica";
      if (fa) {
        return isAlta ? (fecha >= fi && fecha < fa) : (fecha >= fi && fecha <= fa);
      }
      return isAlta ? false : (fecha >= fi);
    });

    if (isInjured) {
      ndlCount++;
      return;
    }

    // 2. Buscar directamente en las filas de la BBDD general
    let code = "";
    if (effectiveBbddRows && effectiveBbddRows.length > 0) {
      const dayPlayerRows = effectiveBbddRows.filter(
        (r) => r.fecha === fecha && isPlayerMatchDetail(r.jugador || r.jugador_nombre, r.jugador_id, jugador)
      );
      if (dayPlayerRows.length > 0) {
        const primaryRow = dayPlayerRows.find((r) => r.num_evento === 1) || dayPlayerRows[0];
        code = String(primaryRow.disponibilidad || "").trim()?.toString()?.toUpperCase();
      }
    }

    // 3. Si no vino en BBDD, consultar el mapa de disponibilidad de planificación / estado diario
    if (!code) {
      const rawDispVal = getPlayerDayValue(dispMap, jugador, dayObj, fecha);
      if (rawDispVal !== undefined && rawDispVal !== null) {
        code = String(rawDispVal).trim()?.toString()?.toUpperCase();
      }
    }

    if (code === "NDL" || code === "L" || code.includes("LES") || code.includes("BAJA")) {
      ndlCount++;
    } else if (code === "NDR" || code === "RED" || code.includes("READAPT")) {
      ndrCount++;
    } else if (code === "NDO" || code.includes("OTRO")) {
      ndoCount++;
    } else if (code === "DCS" || code === "DCI" || code === "CS" || code.includes("SUPERIOR")) {
      dcsCount++;
    } else if (code === "DS" || code === "SEL" || code === "S") {
      selCount++;
    } else if (code === "P" || code.includes("PARCIAL") || code.includes("CUIDADO")) {
      parcialCount++;
    } else {
      // D o vacía -> Disponible por defecto en la BBDD
      dispCount++;
    }
  });

  const totalLesionesCount = seasonLesiones.length;

  const dispJugador = [
    { label: "Disponible", pct: Math.round((dispCount / totalDias) * 100) || 0, val: dispCount },
    { label: "Dis. Categorías superior", pct: Math.round((dcsCount / totalDias) * 100) || 0, val: dcsCount },
    { label: "Dis. Selección", pct: Math.round((selCount / totalDias) * 100) || 0, val: selCount },
    { label: "Parcial", pct: Math.round((parcialCount / totalDias) * 100) || 0, val: parcialCount },
    { label: "No dis. readaptación", pct: Math.round((ndrCount / totalDias) * 100) || 0, val: ndrCount },
    { label: "No dis. otros", pct: Math.round((ndoCount / totalDias) * 100) || 0, val: ndoCount },
    { label: "No dis. estado lesionado", pct: Math.round((ndlCount / totalDias) * 100) || 0, val: ndlCount },
    { label: "Lesión", pct: totalDias > 0 && totalLesionesCount > 0 ? Math.round((totalLesionesCount / totalDias) * 100) : 0, val: totalLesionesCount },
  ];

  // --- 3. EVENTOS [JUGADOR] (DIRECTAMENTE DE BBDD GENERAL Y PLANIFICACIÓN) ---
  let eCoadCount = 0;
  let eOptiCount = 0;
  let partidosJugCount = 0;
  let viajesJugCount = 0;
  let readaptacionCount = 0;
  let eCoadMin = 0;
  let eOptiMin = 0;
  let partidosMin = 0;

  allDates.forEach((fecha) => {
    const dayObj = days.find((d: any) => d.fecha === fecha);

    // 1. Lesión clínica activa en esta fecha
    const isInjured = seasonLesiones.some((l: any) => {
      const fi = l.fechaInicio || l.fecha;
      const fa = l.fechaAlta;
      if (!fi) return false;
      const isAlta = l.estado === "Alta Médica";
      if (fa) {
        return isAlta ? (fecha >= fi && fecha < fa) : (fecha >= fi && fecha <= fa);
      }
      return isAlta ? false : (fecha >= fi);
    });

    // 2. Disponibilidad en este día
    let code = "";
    const dayPlayerBBDDRows = (effectiveBbddRows || []).filter(
      (r) => r.fecha === fecha && isPlayerMatchDetail(r.jugador || r.jugador_nombre, r.jugador_id, jugador)
    );
    if (dayPlayerBBDDRows.length > 0) {
      const primaryRow = dayPlayerBBDDRows.find((r) => r.num_evento === 1) || dayPlayerBBDDRows[0];
      code = String(primaryRow.disponibilidad || "").trim()?.toString()?.toUpperCase();
    }
    if (!code) {
      const rawDispVal = getPlayerDayValue(dispMap, jugador, dayObj, fecha);
      if (rawDispVal !== undefined && rawDispVal !== null) {
        code = String(rawDispVal).trim()?.toString()?.toUpperCase();
      }
    }

    // 3. Procesar eventos de este día
    if (dayPlayerBBDDRows.length > 0) {
      // Eventos explícitos en las filas de BBDD
      dayPlayerBBDDRows.forEach((r) => {
        const rawRealiza = r.realiza_evento;
        const realiza = rawRealiza === undefined || rawRealiza === null || rawRealiza === "" ||
                        String(rawRealiza).trim()?.toString()?.toUpperCase() === "SI" ||
                        String(rawRealiza).trim()?.toString()?.toUpperCase() === "S" ||
                        String(rawRealiza).trim()?.toString()?.toUpperCase() === "TRUE" ||
                        rawRealiza === true;

        const tipo = String(r.tipo_de_evento || "").trim()?.toString()?.toUpperCase();
        const evPrinc = String(r.evento_principal || "").trim()?.toString()?.toUpperCase();
        const dur = Number(r.duracion_evento) || Number(r.minutos_partido) || 0;

        if ((tipo === "CO" || tipo === "COP" || tipo.includes("COAD") || tipo.includes("COADYUVANTE")) && realiza) {
          eCoadCount++;
          eCoadMin += (dur > 0 ? dur : 55);
        }
        if ((tipo === "OP" || tipo === "OOP" || tipo.includes("OPTI") || tipo.includes("OPTIMIZADOR") || (!tipo && evPrinc === "E")) && realiza) {
          eOptiCount++;
          eOptiMin += (dur > 0 ? dur : 75);
        }
        if ((isPartidoCode(tipo) || isPartidoCode(evPrinc) || tipo.includes("PAAM") || tipo.includes("PAL") || tipo.includes("PAV")) && (realiza || dur > 0)) {
          partidosJugCount++;
          partidosMin += (dur > 0 ? dur : 90);
        }
        if ((isViajeCode(tipo) || isViajeCode(evPrinc) || tipo === "VI" || tipo.includes("VIAJE")) && realiza) {
          viajesJugCount++;
        }
        if ((tipo === "RED" || tipo.includes("READAPT") || tipo.includes("RECUPERACION") || r.disponibilidad === "NDR") && realiza) {
          readaptacionCount++;
        }
      });
    } else {
      // Eventos desde bloques y planificación del calendario
      const dayBlocks: any[] = [];
      for (let slot = 0; slot < 6; slot++) {
        const b = bloquesMap[`${fecha}_slot_${slot}`] || (dayObj?.id ? bloquesMap[`${dayObj.id}_slot_${slot}`] : null);
        if (b && b.tipo) dayBlocks.push(b);
      }

      let assignedCodes: string[] = [];
      const evVal = getPlayerDayValue(playerEventsMap, jugador, dayObj, fecha);
      if (evVal !== undefined && evVal !== null) {
        const codes = String(evVal).split(/[\s,]+/).map((c) => c.trim()?.toString()?.toUpperCase()).filter(Boolean);
        assignedCodes.push(...codes);
      }

      dayBlocks.forEach((b) => {
        const jList = b.jugadores || b.asistentes || b.players;
        if (Array.isArray(jList) && jList.some((j: any) => isPlayerMatchDetail(typeof j === "string" ? j : (j?.id || j?.nombre || ""), jugador))) {
          const tCode = String(b.tipo || "").trim()?.toString()?.toUpperCase();
          if (tCode && !assignedCodes.includes(tCode)) {
            assignedCodes.push(tCode);
          }
        }
      });

      let customMinOpti: number | null = null;
      let customMinCoad: number | null = null;
      let customMinPartido: number | null = null;

      const minVal = getPlayerDayValue(minutesMap, jugador, dayObj, fecha);
      if (minVal !== undefined && minVal !== null) {
        if (typeof minVal === "number") customMinOpti = minVal;
        else if (typeof minVal === "object") {
          if (minVal.minutos_partido !== undefined || minVal.partido !== undefined) customMinPartido = Number(minVal.minutos_partido ?? minVal.partido);
          if (minVal.minutos_opti !== undefined || minVal.opti !== undefined) customMinOpti = Number(minVal.minutos_opti ?? minVal.opti);
          if (minVal.minutos_coad !== undefined || minVal.coad !== undefined) customMinCoad = Number(minVal.minutos_coad ?? minVal.coad);
        } else if (!isNaN(Number(minVal))) {
          customMinOpti = Number(minVal);
        }
      }

      if (assignedCodes.length > 0) {
        const isAssignedCoad = assignedCodes.some((c) => c === "CO" || c.includes("COAD"));
        const isAssignedOpti = assignedCodes.some((c) => c === "OP" || c.includes("OPTI") || c === "E");
        const isAssignedPa = assignedCodes.some((c) => isPartidoCode(c));
        const isAssignedVi = assignedCodes.some((c) => isViajeCode(c));
        const isAssignedRed = assignedCodes.some((c) => c === "RED" || c.includes("READAPT"));

        if (isAssignedCoad) {
          eCoadCount++;
          eCoadMin += customMinCoad !== null ? customMinCoad : 55;
        }
        if (isAssignedOpti) {
          eOptiCount++;
          eOptiMin += customMinOpti !== null ? customMinOpti : 75;
        }
        if (isAssignedPa || (customMinPartido !== null && customMinPartido > 0)) {
          partidosJugCount++;
          partidosMin += customMinPartido !== null ? customMinPartido : 90;
        }
        if (isAssignedVi) viajesJugCount++;
        if (isAssignedRed) readaptacionCount++;
      } else if (code === "NDR") {
        readaptacionCount++;
      } else if (code !== "NDL" && code !== "NDO" && !isInjured) {
        const evPrincipalRaw = String(dayObj?.evento || dayObj?.evento_am || "").trim()?.toString()?.toUpperCase();
        const evPrincipal = evPrincipalRaw || (dayBlocks[0]?.tipo ? String(dayBlocks[0]?.tipo).trim()?.toString()?.toUpperCase() : "");
        const evPm = String(dayObj?.evento_pm || (dayBlocks[1]?.tipo) || "").trim()?.toString()?.toUpperCase();

        const isDinamica = isDinamicaCode(evPrincipalRaw) || isDinamicaCode(evPrincipal);
        const isTraining = isEntrenamientoCode(evPrincipalRaw) || isEntrenamientoCode(evPrincipal) || isEntrenamientoCode(evPm) || dayBlocks.some((b) => isEntrenamientoCode(b.tipo) && !isPartidoCode(b.tipo));
        const hasMatch = isPartidoCode(evPrincipalRaw) || isPartidoCode(evPrincipal) || isPartidoCode(evPm) || dayBlocks.some((b) => isPartidoCode(b.tipo));
        const hasTravel = isViajeCode(evPrincipalRaw) || isViajeCode(evPrincipal) || isViajeCode(evPm) || dayBlocks.some((b) => isViajeCode(b.tipo));

        if (hasMatch) {
          partidosJugCount++;
          partidosMin += customMinPartido !== null ? customMinPartido : 90;
        } else if (hasTravel) {
          viajesJugCount++;
        } else if (isTraining) {
          eOptiCount++;
          eOptiMin += customMinOpti !== null ? customMinOpti : 75;
          if (isDinamica) {
            eCoadCount++;
            eCoadMin += customMinCoad !== null ? customMinCoad : 55;
          }
        }
      }
    }
  });

  const totalMinutos = eCoadMin + eOptiMin + partidosMin;
  const totalEventos = eCoadCount + eOptiCount + partidosJugCount + viajesJugCount + readaptacionCount;

  const evJugador = [
    { label: "E. Coad (Nº)", pct: totalEventos > 0 ? Math.round((eCoadCount / totalEventos) * 100) : 0, val: eCoadCount },
    { label: "E. Opti (Nº)", pct: totalEventos > 0 ? Math.round((eOptiCount / totalEventos) * 100) : 0, val: eOptiCount },
    { label: "Partidos (Nº)", pct: totalEventos > 0 ? Math.round((partidosJugCount / totalEventos) * 100) : 0, val: partidosJugCount },
    { label: "Viajes (Nº)", pct: totalEventos > 0 ? Math.round((viajesJugCount / totalEventos) * 100) : 0, val: viajesJugCount },
    { label: "Readaptación (Nº)", pct: totalEventos > 0 ? Math.round((readaptacionCount / totalEventos) * 100) : 0, val: readaptacionCount },
    { label: "E. Coad (Min)", pct: totalMinutos > 0 ? Math.round((eCoadMin / totalMinutos) * 100) : 0, val: eCoadMin },
    { label: "E. Opti (Min)", pct: totalMinutos > 0 ? Math.round((eOptiMin / totalMinutos) * 100) : 0, val: eOptiMin },
    { label: "Partidos (Min)", pct: totalMinutos > 0 ? Math.round((partidosMin / totalMinutos) * 100) : 0, val: partidosMin },
  ];

  return { evEquipo, dispJugador, evJugador };
}

export interface SpeedTestRecord {
  fecha: string;
  velMax: number;
  tipo: string;
  origen: "tarea_sprint" | "sesion_max";
  sesion: string;
}

export function getPlayerSpeedTestRecords(
  jugador: { id: string; nombre?: string | null; apodo?: string | null },
  records: any[] = []
): SpeedTestRecord[] {
  const pRecords = (records || []).filter((r: any) => {
    const isSim = Boolean(
      r.es_simulado ||
      r.metricas?.es_simulado ||
      String(r.tipo_registro || r.metricas?.tipo_registro || "").toUpperCase() === "SIMULADO" ||
      (r.metricas?.colC && String(r.metricas?.colC).toUpperCase().includes("SIMULA"))
    );
    if (isSim) return false;

    const jId = r.jugador_id || r.metricas?.jugador_id;
    if (jId && jId === jugador.id) return true;

    const rName = String(r.jugador || r.metricas?.Player_Name || r.metricas?.jugador || "").trim().toLowerCase();
    const pName = String(jugador.nombre || "").trim().toLowerCase();
    const pApodo = String(jugador.apodo || "").trim().toLowerCase();
    return (pName && rName === pName) || (pApodo && rName === pApodo);
  });

  if (!pRecords || pRecords.length === 0) return [];

  const sprintTestRecords: SpeedTestRecord[] = [];
  const otherSessionRecords: SpeedTestRecord[] = [];

  pRecords.forEach((r: any) => {
    const m = r.metricas || {};
    const totalVel = Number(m["Vel Max"] || m.vel_max || m.max_speed || m["MAX Speed(km/h)"] || 0);

    let hasSprintTask = false;
    let sprintTaskVel = 0;
    let sprintTaskName = "";

    if (Array.isArray(m.tareas)) {
      m.tareas.forEach((t: any) => {
        const tName = String(t.nombre || t.tarea || "").trim();
        if (tName.toUpperCase().includes("SPRINT")) {
          const v = Number(t["Vel Max"] || t["MAX Speed(km/h)"] || t.vel_max || 0);
          if (v > sprintTaskVel) {
            sprintTaskVel = v;
            sprintTaskName = tName;
            hasSprintTask = true;
          }
        }
      });
    }

    if (hasSprintTask && sprintTaskVel > 0) {
      sprintTestRecords.push({
        fecha: r.fecha,
        velMax: Math.round(sprintTaskVel * 100) / 100,
        tipo: `Test Sprint (${sprintTaskName})`,
        origen: "tarea_sprint",
        sesion: r.tipo_sesion || r.match_day || "Sesión",
      });
    } else if (totalVel > 0) {
      otherSessionRecords.push({
        fecha: r.fecha,
        velMax: Math.round(totalVel * 100) / 100,
        tipo: `Vel Máx (${r.tipo_sesion || r.match_day || "Sesión"})`,
        origen: "sesion_max",
        sesion: r.tipo_sesion || r.match_day || "Sesión",
      });
    }
  });

  const byDate = new Map<string, SpeedTestRecord>();
  sprintTestRecords.forEach((s) => {
    const existing = byDate.get(s.fecha);
    if (!existing || s.velMax > existing.velMax) {
      byDate.set(s.fecha, s);
    }
  });

  otherSessionRecords.sort((a, b) => b.velMax - a.velMax);

  for (const other of otherSessionRecords) {
    if (!byDate.has(other.fecha)) {
      byDate.set(other.fecha, other);
      if (byDate.size >= 3) break;
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export default function PlayerDetailTabs({
  jugador,
  saveJugadorAction,
  archiveJugadorAction,
  initialBBDDRows = [],
  initialTestingData = [],
  allGpsRecords = [],
  allJugadores = [],
  initialPlayerTargetRatios,
  initialPlayerCompVariables,
  initialBenchmarkOverrides,
  initialPlayerHsriVariableKey,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "general" | "report" | "cualitativa" | "fisicos_tests" | "lesiones"
  >("report");

  const [bbddRows, setBbddRows] = useState<any[]>(initialBBDDRows);

  const [testingData, setTestingData] = useState<TestingPlayerHistory>({
    pesoRecords: [],
    plieguesRecords: [],
    skinfoldMetricsList: [],
    combinedChartData: [],
  });

  // Registros GPS reactivos con carga en cliente y sincronización en tiempo real
  const [localGpsRecords, setLocalGpsRecords] = useState<any[]>(allGpsRecords || []);

  useEffect(() => {
    if (allGpsRecords && allGpsRecords.length > 0) {
      setLocalGpsRecords(allGpsRecords);
    }
  }, [allGpsRecords]);

  useEffect(() => {
    let isMounted = true;
    const loadFreshGps = async () => {
      try {
        const records = await getAllGpsDatos();
        if (isMounted && Array.isArray(records) && records.length > 0) {
          setLocalGpsRecords(records);
        }
      } catch (e) {
        console.error("Error loading fresh GPS in PlayerDetailTabs:", e);
      }
    };
    loadFreshGps();

    const handleGpsSync = () => {
      loadFreshGps();
    };
    window.addEventListener("gps_synced", handleGpsSync);
    return () => {
      isMounted = false;
      window.removeEventListener("gps_synced", handleGpsSync);
    };
  }, []);

  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [saveGeneralMessage, setSaveGeneralMessage] = useState("");

  const [pesoVal, setPesoVal] = useState<string | number>(fieldValue(jugador.peso));
  const [pesoOrigin, setPesoOrigin] = useState<string | null>(null);

  // Auto-sync peso from testing/testing if available
  useEffect(() => {
    const latest = getLatestTestingPeso(jugador.nombre, jugador.apodo);
    if (latest !== null && latest !== undefined) {
      setPesoVal(latest);
      setPesoOrigin("auto");
    }
  }, [jugador.nombre, jugador.apodo]);

  const handleSubmitGeneral = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSavingGeneral(true);
    setSaveGeneralMessage("");
    try {
      const formData = new FormData(e.currentTarget);
      const newNombre = String(formData.get("nombre") || "").trim();

      if (newNombre && newNombre.toLowerCase() !== (jugador.nombre || "").toLowerCase()) {
        const isDuplicate = await checkDuplicateJugadorNombre(newNombre, jugador.id);
        if (isDuplicate) {
          const confirmReplace = confirm(
            `El nombre "${newNombre}" ya está registrado para otro deportista.\n\n¿Quieres reemplazarlo y actualizar esta ficha con ese nombre?`
          );
          if (!confirmReplace) {
            setIsSavingGeneral(false);
            return;
          }
        }
      }

      await saveJugadorAction(formData);
      setSaveGeneralMessage("✓ Cambios guardados con éxito");
      router.refresh();
      setTimeout(() => setSaveGeneralMessage(""), 3500);
    } catch (err: any) {
      console.error(err);
      setSaveGeneralMessage("❌ Error: " + (err?.message || "No se pudo guardar"));
    } finally {
      setIsSavingGeneral(false);
    }
  };

  // State for Report Stats
  const [eventosEquipo, setEventosEquipo] = useState<{ label: string; pct: number; val: number }[]>([]);
  const [disponibilidadJugador, setDisponibilidadJugador] = useState<{ label: string; pct: number; val: number }[]>([]);
  const [eventosJugador, setEventosJugador] = useState<{ label: string; pct: number; val: number }[]>([]);

  // Local state for GPS Profile Mode (Promedio | Máximos | Competitivo)
  // ── PERFIL COMPETITIVO INDIVIDUAL OFICIAL (MOTOR REACTIVO 100% MATCH) ──
  const { favoriteVariables, derivedVariables, allVariables } = useFavoriteGpsVariables();

  // Lista de métricas favoritas activas del usuario (excluyendo Duration(min))
  const availableFavVariables = useMemo(() => {
    const list = (favoriteVariables || []).filter((v) => v.key !== "Duration(min)");
    if (list.length > 0) return list;
    return ALL_GPS_VARIABLES.filter((v) => DEFAULT_FAVORITE_GPS_VARIABLES.includes(v.key) && v.key !== "Duration(min)");
  }, [favoriteVariables]);
  const [compProfileOverrides, setCompProfileOverrides] = useState<Record<string, any>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_competitive_profile_overrides");
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return {};
  });
  const [showCompMatchesDetail, setShowCompMatchesDetail] = useState<boolean>(false);
  const [showAddVarDropdown, setShowAddVarDropdown] = useState<boolean>(false);
  const [ratioDisplayMode, setRatioDisplayMode] = useState<"multiplier" | "percentage">("multiplier");

  // Variables activas en la fila del perfil competitivo de este jugador (según las favoritas del usuario)
  const [playerCompVariables, setPlayerCompVariables] = useState<string[]>(() => {
    let result: string[] = [];
    if (initialPlayerCompVariables && initialPlayerCompVariables.length > 0) {
      result = initialPlayerCompVariables.filter((k) => k !== "derived_1791992159697" && k !== "derived_undefined");
    } else if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`player_comp_vars_${jugador.id}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            result = parsed.filter((k: string) => k !== "derived_1791992159697" && k !== "derived_undefined");
          }
        }
        if (result.length === 0) {
          const teamFavs = localStorage.getItem("gps_profile_selected_fav_keys");
          if (teamFavs) {
            const parsed = JSON.parse(teamFavs);
            if (Array.isArray(parsed) && parsed.length > 0) {
              result = parsed.filter((k: string) => k !== "derived_1791992159697" && k !== "derived_undefined");
            }
          }
        }
      } catch {}
    }
    if (result.length === 0) {
      result = [
        "Distance(m)",
        "HSR Abs (m)",
        "Distancia / Min",
        "Acc+Dec",
        "Player Load",
        "MAX Speed(km/h)",
      ];
    }
    // Asegurar SIEMPRE que HSR Abs (m) esté predeterminado en la tabla y evitar duplicados con Distance +21
    if (!result.includes("HSR Abs (m)")) {
      result.splice(1, 0, "HSR Abs (m)");
    }
    if (result.includes("HSR Abs (m)") && result.includes("Distance +21 (m)")) {
      result = result.filter((k) => k !== "Distance +21 (m)");
    }
    return result;
  });

  const handleToggleVariable = (key: string) => {
    let next: string[];
    if (playerCompVariables.includes(key)) {
      if (playerCompVariables.length <= 1) return;
      next = playerCompVariables.filter((k) => k !== key);
    } else {
      next = [...playerCompVariables, key];
      if (playerTargetRatios[key] === undefined) {
        const updatedRatios = { ...playerTargetRatios, [key]: 1.0 };
        setPlayerTargetRatios(updatedRatios);
        if (typeof window !== "undefined") {
          localStorage.setItem(`player_target_ratios_${jugador.id}`, JSON.stringify(updatedRatios));
        }
      }
    }
    setPlayerCompVariables(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(`player_comp_vars_${jugador.id}`, JSON.stringify(next));
    }
  };

  const handleSetPresetVariables = (keys: string[]) => {
    if (!keys || keys.length === 0) return;
    setPlayerCompVariables(keys);
    const updatedRatios = { ...playerTargetRatios };
    keys.forEach((k) => {
      if (updatedRatios[k] === undefined) updatedRatios[k] = 1.0;
    });
    setPlayerTargetRatios(updatedRatios);
    if (typeof window !== "undefined") {
      localStorage.setItem(`player_comp_vars_${jugador.id}`, JSON.stringify(keys));
      localStorage.setItem(`player_target_ratios_${jugador.id}`, JSON.stringify(updatedRatios));
    }
    savePlayerProfileConfigServer(jugador.id, {
      ratios: updatedRatios,
      variables: keys,
      benchmarkOverrides: compProfileOverrides[jugador.id] || {},
    }).catch(() => {});
  };

  // Ratios de trabajo individuales para cada variable (ej: 1.0x = 100% partido, 1.2x = +20% sobrecarga)
  const [playerTargetRatios, setPlayerTargetRatios] = useState<Record<string, number>>(() => {
    if (initialPlayerTargetRatios && Object.keys(initialPlayerTargetRatios).length > 0) {
      return initialPlayerTargetRatios;
    }
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`player_target_ratios_${jugador.id}`);
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return {
      "Distance(m)": 1.0,
      "HSR Abs (m)": 1.0,
      "Distancia / Min": 1.0,
      "Distance +21 (m)": 1.0,
      "Acc+Dec": 1.0,
      "Player Load": 1.0,
      "MAX Speed(km/h)": 1.0,
    };
  });

  const [isSavingRatios, setIsSavingRatios] = useState(false);
  const [ratiosSavedMessage, setRatiosSavedMessage] = useState(false);

  // Variable HSRI Individualizada asignada a este deportista
  const [hsriVariableKey, setHsriVariableKey] = useState<string>(() => {
    if (initialPlayerHsriVariableKey) {
      return initialPlayerHsriVariableKey;
    }
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`player_hsri_var_${jugador.id}`);
        if (stored) return stored;
      } catch {}
    }
    return "Distance +21 (m)";
  });

  const handleAssignHsriVariable = async (newVarKey: string) => {
    setHsriVariableKey(newVarKey);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`player_hsri_var_${jugador.id}`, newVarKey);
      } catch {}
    }
    setIsSavingRatios(true);
    try {
      await savePlayerProfileConfigServer(jugador.id, {
        ratios: playerTargetRatios,
        variables: playerCompVariables,
        hsriVariableKey: newVarKey,
        benchmarkOverrides: compProfileOverrides[jugador.id] || {},
      });
      setRatiosSavedMessage(true);
      setTimeout(() => setRatiosSavedMessage(false), 3000);
    } catch (e) {
      console.error("Error asignando HSRI:", e);
    } finally {
      setIsSavingRatios(false);
    }
  };

  // Función explícita para guardar los ratios individuales y variable HSRI en Supabase
  const handleSavePlayerRatios = async (
    customRatios?: Record<string, number>,
    customVars?: string[],
    customOverrides?: Record<string, number>,
    customHsri?: string
  ) => {
    const ratiosToSave = customRatios || playerTargetRatios;
    const varsToSave = customVars || playerCompVariables;
    const overridesToSave = customOverrides || compProfileOverrides[jugador.id] || {};
    const hsriToSave = customHsri || hsriVariableKey;

    setIsSavingRatios(true);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`player_target_ratios_${jugador.id}`, JSON.stringify(ratiosToSave));
        localStorage.setItem(`player_comp_vars_${jugador.id}`, JSON.stringify(varsToSave));
        localStorage.setItem(`player_comp_profile_overrides_${jugador.id}`, JSON.stringify(overridesToSave));
        localStorage.setItem(`player_hsri_var_${jugador.id}`, hsriToSave);
      } catch (e) {}
    }

    try {
      const res = await savePlayerProfileConfigServer(jugador.id, {
        ratios: ratiosToSave,
        variables: varsToSave,
        hsriVariableKey: hsriToSave,
        benchmarkOverrides: overridesToSave,
      });
      if (res?.success) {
        setRatiosSavedMessage(true);
        setTimeout(() => setRatiosSavedMessage(false), 3000);
      }
    } catch (e) {
      console.error("Error guardando ratios:", e);
    } finally {
      setIsSavingRatios(false);
    }
  };

  const handleUpdateRatio = (metricKey: string, newRatio: number) => {
    let val = isNaN(newRatio) ? 1.0 : newRatio;
    if (val > 10) val = val / 100; // si el usuario escribe 110, interpretar como 1.10x (110%)
    val = Math.max(0.1, Math.min(5.0, Number(val.toFixed(2))));
    const updated = { ...playerTargetRatios, [metricKey]: val };
    setPlayerTargetRatios(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(`player_target_ratios_${jugador.id}`, JSON.stringify(updated));
    }
    // Auto-guardado en segundo plano
    savePlayerProfileConfigServer(jugador.id, {
      ratios: updated,
      variables: playerCompVariables,
      hsriVariableKey,
      benchmarkOverrides: compProfileOverrides[jugador.id] || {},
    }).catch(() => {});
  };

  const handleSetAllRatios = (ratio: number) => {
    const updated: Record<string, number> = {};
    playerCompVariables.forEach((k) => {
      updated[k] = ratio;
    });
    setPlayerTargetRatios(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(`player_target_ratios_${jugador.id}`, JSON.stringify(updated));
    }
    // Auto-guardado en segundo plano
    savePlayerProfileConfigServer(jugador.id, {
      ratios: updated,
      variables: playerCompVariables,
      hsriVariableKey,
      benchmarkOverrides: compProfileOverrides[jugador.id] || {},
    }).catch(() => {});
  };

  const handleAddVariable = (key: string) => {
    if (!playerCompVariables.includes(key)) {
      const updated = [...playerCompVariables, key];
      setPlayerCompVariables(updated);
      if (!playerTargetRatios[key]) {
        const updatedRatios = { ...playerTargetRatios, [key]: 1.0 };
        setPlayerTargetRatios(updatedRatios);
        if (typeof window !== "undefined") {
          localStorage.setItem(`player_target_ratios_${jugador.id}`, JSON.stringify(updatedRatios));
        }
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(`player_comp_vars_${jugador.id}`, JSON.stringify(updated));
      }
    }
    setShowAddVarDropdown(false);
  };

  const handleRemoveVariable = (key: string) => {
    if (playerCompVariables.length <= 1) return;
    const updated = playerCompVariables.filter((k) => k !== key);
    setPlayerCompVariables(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(`player_comp_vars_${jugador.id}`, JSON.stringify(updated));
    }
  };

  const [selectedExplanationKey, setSelectedExplanationKey] = useState<string | null>(null);

  const handleModifyMetric = (metricKey: string) => {
    const currentVal = playerCompProfile?.values?.[metricKey] ?? 0;
    const fav = favoriteVariables.find((v) => v.key === metricKey) || ALL_GPS_VARIABLES.find((v) => v.key === metricKey);
    const label = getCompactMetricHeader(metricKey, fav?.label);
    const unit = fav?.unit || "";
    const input = window.prompt(
      `Modificar benchmark de ${label} (${unit}) para ${jugador.apodo || jugador.nombre}:\n\n(Valor actual: ${currentVal} ${unit})`,
      String(currentVal)
    );
    if (input !== null && input.trim() !== "" && !isNaN(Number(input))) {
      const updated = {
        ...compProfileOverrides,
        [jugador.id]: {
          ...(compProfileOverrides[jugador.id] || {}),
          [metricKey]: Number(input),
        },
      };
      setCompProfileOverrides(updated);
      if (typeof window !== "undefined") {
        localStorage.setItem("gps_competitive_profile_overrides", JSON.stringify(updated));
      }
    }
  };

  const handleResetMetric = (metricKey: string) => {
    const fav = favoriteVariables.find((v) => v.key === metricKey) || ALL_GPS_VARIABLES.find((v) => v.key === metricKey);
    const label = getCompactMetricHeader(metricKey, fav?.label);
    if (!confirm(`¿Restablecer ${label} al valor oficial calculado automáticamente por el sistema?`)) return;
    const current = { ...(compProfileOverrides[jugador.id] || {}) };
    delete current[metricKey];
    const updated = {
      ...compProfileOverrides,
      [jugador.id]: current,
    };
    setCompProfileOverrides(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("gps_competitive_profile_overrides", JSON.stringify(updated));
    }
  };

  // Se recalcula reactivamente al añadir nuevos partidos en gps_datos
  const competitiveProfilesMap = useMemo(() => {
    return computeCompetitiveProfiles({
      gpsRecords: localGpsRecords,
      jugadores: allJugadores && allJugadores.length > 0 ? allJugadores : [jugador],
      customOverrides: compProfileOverrides,
      availableFavVariables: favoriteVariables,
      derivedVariables,
    });
  }, [localGpsRecords, allJugadores, jugador, compProfileOverrides, favoriteVariables, derivedVariables]);

  const playerCompProfile = useMemo(() => {
    return competitiveProfilesMap.get(jugador.id);
  }, [competitiveProfilesMap, jugador.id]);

  const [gpsProfileMode, setGpsProfileMode] = useState<"promedio" | "maximos" | "competitivo">("promedio");

  // 4 Tipos de Microciclos: Corto (6d), Media (7d), Largo (8d), Doble Partido
  const [gpsSubjectMode, setGpsSubjectMode] = useState<"jugador" | "equipo">("jugador");
  const [gpsMicrocycleTypeFilter, setGpsMicrocycleTypeFilter] = useState<MicrocycleType>("todos");
  const [gpsDataSourceMode, setGpsDataSourceMode] = useState<"reales" | "todos">(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_player_data_source_mode");
        if (stored === "reales" || stored === "todos") return stored;
      } catch {}
    }
    return "reales";
  });

  const handleSetGpsDataSourceMode = (mode: "reales" | "todos") => {
    setGpsDataSourceMode(mode);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("gps_player_data_source_mode", mode);
      } catch {}
    }
  };
  const [showTotalColumn, setShowTotalColumn] = useState<boolean>(true);

  // Estados para filtro de tareas en Match Day (por defecto SOLO primera y segunda parte)
  const [mdIncludeActivacion, setMdIncludeActivacion] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("gps_md_include_activacion") === "true";
      } catch {}
    }
    return false;
  });

  const [mdIncludeCarreras, setMdIncludeCarreras] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("gps_md_include_carreras") === "true";
      } catch {}
    }
    return false;
  });

  const [showMdTaskMenu, setShowMdTaskMenu] = useState<boolean>(false);

  const handleToggleMdActivacion = (val: boolean) => {
    setMdIncludeActivacion(val);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("gps_md_include_activacion", String(val));
      } catch {}
    }
  };

  const handleToggleMdCarreras = (val: boolean) => {
    setMdIncludeCarreras(val);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("gps_md_include_carreras", String(val));
      } catch {}
    }
  };

  // Columnas de Match Day según el tipo de microciclo:
  // - Doble partido (3-4 días entre partidos): NO tiene MD-5 ni MD-4
  // - Semana media (7d) y corta (6d): NO tienen MD-5
  // - Semana larga (8d+) o todos: muestra MD-5
  const mdColumns = useMemo(() => {
    if (gpsMicrocycleTypeFilter === "doble_partido") {
      return ["-3 MD", "-2 MD", "-1 MD", "MD", "+1 MD", "+2 MD"];
    }
    if (gpsMicrocycleTypeFilter === "media" || gpsMicrocycleTypeFilter === "corto") {
      return ["-4 MD", "-3 MD", "-2 MD", "-1 MD", "MD", "+1 MD", "+2 MD"];
    }
    return ["-5 MD", "-4 MD", "-3 MD", "-2 MD", "-1 MD", "MD", "+1 MD", "+2 MD"];
  }, [gpsMicrocycleTypeFilter]);

  // Función para normalizar nombres de Match Day procedentes de gps_datos
  const normalizeMD = (rawMD?: string, tipoSesion?: string): string | null => {
    const combined = `${rawMD || ""} ${tipoSesion || ""}`.trim().toUpperCase().replace(/\s+/g, "");

    // 1. REGLA CLAVE: MD+1 y +1MD son exactamente lo mismo (Prioridad máxima)
    if (combined.includes("+1") || combined.includes("MD+1") || combined.includes("+1MD") || combined.includes("1+MD") || combined.includes("MD+1.0")) return "+1 MD";

    // 2. REGLA CLAVE: MD+2 y +2MD son exactamente lo mismo
    if (combined.includes("+2") || combined.includes("MD+2") || combined.includes("+2MD") || combined.includes("2+MD")) return "+2 MD";

    // 3. REGLA CLAVE: En doble partido no hay MD-5 ni MD-4 (máximo MD-3)
    if (gpsMicrocycleTypeFilter === "doble_partido") {
      if (combined.includes("-5") || combined.includes("5MD") || combined.includes("-4") || combined.includes("4MD") || combined.includes("MD-4") || combined.includes("MD-5")) {
        return "-3 MD";
      }
    } else if (gpsMicrocycleTypeFilter === "media" || gpsMicrocycleTypeFilter === "corto") {
      if (combined.includes("-5") || combined.includes("5MD") || combined.includes("MD5") || combined.includes("MD-5")) {
        return "-4 MD";
      }
    }

    if (combined.includes("-5") || combined.includes("5MD") || combined.includes("MD5") || combined.includes("MD-5") || combined.includes("-5MD")) return "-5 MD";
    if (combined.includes("-4") || combined.includes("4MD") || combined.includes("MD4") || combined.includes("MD-4") || combined.includes("-4MD")) return "-4 MD";
    if (combined.includes("-3") || combined.includes("3MD") || combined.includes("MD3") || combined.includes("MD-3") || combined.includes("-3MD")) return "-3 MD";
    if (combined.includes("-2") || combined.includes("2MD") || combined.includes("MD2") || combined.includes("MD-2") || combined.includes("-2MD")) return "-2 MD";
    if (combined.includes("-1") || combined.includes("1MD") || combined.includes("MD1") || combined.includes("MD-1") || combined.includes("-1MD")) return "-1 MD";
    if (combined.includes("MD") || combined.includes("PARTIDO") || combined.includes("MATCH")) return "MD";
    return null;
  };
  const [showWeeksPicker, setShowWeeksPicker] = useState<boolean>(false);
  const [microcycleRefreshKey, setMicrocycleRefreshKey] = useState<number>(0);

  // Microciclos detectados y auto-ajustados según sesiones de partido y fechas
  const availableMicrocycles = useMemo(() => {
    const stored = getStoredMicrocycles();
    const extracted = extractMicrocyclesFromGpsData(localGpsRecords, stored);
    const map = new Map<string, CustomMicrocycleDef>();
    // Garantizar que todos los microciclos oficiales de la temporada siempre existan
    OFFICIAL_SEASON_MICROCYCLES.forEach((mc) => map.set(mc.id, { ...mc }));
    extracted.forEach((mc) => {
      const existing = map.get(mc.id);
      if (existing) {
        map.set(mc.id, { ...existing, ...mc, tipo: existing.tipo });
      } else {
        map.set(mc.id, mc);
      }
    });
    return Array.from(map.values()).sort((a, b) => b.start.localeCompare(a.start));
  }, [localGpsRecords, microcycleRefreshKey]);

  // Microciclos que corresponden al tipo actualmente seleccionado en el filtro
  const relevantMicrocyclesForCurrentFilter = useMemo(() => {
    if (gpsMicrocycleTypeFilter === "todos") return availableMicrocycles;
    return availableMicrocycles.filter((m) => getMicrocycleType(m) === gpsMicrocycleTypeFilter);
  }, [availableMicrocycles, gpsMicrocycleTypeFilter, microcycleRefreshKey]);

  // Semanas desmarcadas por el usuario por cada tipo de microciclo
  const [unselectedWeeksByType, setUnselectedWeeksByType] = useState<Record<string, string[]>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_unselected_weeks_by_type");
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return {};
  });

  const isWeekActive = (weekId: string): boolean => {
    const unselected = unselectedWeeksByType[gpsMicrocycleTypeFilter] || [];
    return !unselected.includes(weekId);
  };

  const handleToggleWeek = (weekId: string) => {
    setUnselectedWeeksByType((prev) => {
      const typeKey = gpsMicrocycleTypeFilter;
      const currentUnselected = prev[typeKey] || [];
      let updated: string[];
      if (currentUnselected.includes(weekId)) {
        updated = currentUnselected.filter((id) => id !== weekId);
      } else {
        updated = [...currentUnselected, weekId];
      }
      const nextMap = { ...prev, [typeKey]: updated };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("gps_unselected_weeks_by_type", JSON.stringify(nextMap));
        } catch {}
      }
      return nextMap;
    });
  };

  const handleSelectAllWeeksOfCurrentType = () => {
    setUnselectedWeeksByType((prev) => {
      const nextMap = { ...prev, [gpsMicrocycleTypeFilter]: [] };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("gps_unselected_weeks_by_type", JSON.stringify(nextMap));
        } catch {}
      }
      return nextMap;
    });
  };

  const handleUnselectAllWeeksOfCurrentType = () => {
    const allIds = relevantMicrocyclesForCurrentFilter.map((m) => m.id);
    setUnselectedWeeksByType((prev) => {
      const nextMap = { ...prev, [gpsMicrocycleTypeFilter]: allIds };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("gps_unselected_weeks_by_type", JSON.stringify(nextMap));
        } catch {}
      }
      return nextMap;
    });
  };

  const handleSelectMicrocycleTypeFilter = (t: MicrocycleType) => {
    setGpsMicrocycleTypeFilter(t);
  };

  // Registros reales de GPS del jugador (todos los históricos reales)
  const playerRealGpsRecords = useMemo(() => {
    return (localGpsRecords || []).filter((r) => {
      const isSim = Boolean(
        r.es_simulado ||
        r.metricas?.es_simulado ||
        String(r.tipo_registro || r.metricas?.tipo_registro || "").toUpperCase() === "SIMULADO" ||
        (r.metricas?.colC && String(r.metricas?.colC).toUpperCase().includes("SIMULA"))
      );
      if (gpsDataSourceMode === "reales" && isSim) return false;

      const jId = r.jugador_id || r.metricas?.jugador_id;
      if (jId === jugador.id) return true;

      const rName = String(r.jugador || r.metricas?.Player_Name || r.metricas?.jugador || "").trim().toLowerCase();
      const pName = String(jugador.nombre || "").trim().toLowerCase();
      const pApodo = String(jugador.apodo || "").trim().toLowerCase();
      return (pName && rName === pName) || (pApodo && rName === pApodo);
    });
  }, [localGpsRecords, jugador.id, jugador.nombre, jugador.apodo, gpsDataSourceMode]);

  // Registros filtrados para la Matriz según Sujeto (Jugador o Equipo), Tipo de Microciclo y Semanas seleccionadas
  const matrixFilteredGpsRecords = useMemo(() => {
    return (localGpsRecords || []).filter((r) => {
      const isSim = Boolean(
        r.es_simulado ||
        r.metricas?.es_simulado ||
        String(r.tipo_registro || r.metricas?.tipo_registro || "").toUpperCase() === "SIMULADO" ||
        (r.metricas?.colC && String(r.metricas?.colC).toUpperCase().includes("SIMULA"))
      );
      if (gpsDataSourceMode === "reales" && isSim) return false;

      if (gpsSubjectMode === "jugador") {
        const jId = r.jugador_id || r.metricas?.jugador_id;
        const rName = String(r.jugador || r.metricas?.Player_Name || r.metricas?.jugador || "").trim().toLowerCase();
        const pName = String(jugador.nombre || "").trim().toLowerCase();
        const pApodo = String(jugador.apodo || "").trim().toLowerCase();
        const isThisPlayer = (jId && jId === jugador.id) || (pName && rName === pName) || (pApodo && rName === pApodo);
        if (!isThisPlayer) return false;
      }

      // Filtrar estrictamente por tipo de microciclo si se selecciona un tipo específico
      const mc = getMicrocycleForDate(r.fecha, availableMicrocycles);
      const mType = mc ? getMicrocycleType(mc) : getMicrocycleTypeForDate(r.fecha);
      if (gpsMicrocycleTypeFilter !== "todos") {
        if (mType !== gpsMicrocycleTypeFilter) return false;
      }

      if (mc) {
        const unselected = unselectedWeeksByType[gpsMicrocycleTypeFilter] || [];
        if (unselected.includes(mc.id)) return false;
      }

      return true;
    });
  }, [localGpsRecords, gpsSubjectMode, jugador.id, jugador.nombre, jugador.apodo, availableMicrocycles, gpsMicrocycleTypeFilter, gpsDataSourceMode, unselectedWeeksByType]);

  // Registros de Tests de Velocidad (Tareas SPRINT + Picos de Velocidad)
  const speedTestRecords = useMemo(() => {
    return getPlayerSpeedTestRecords(jugador, localGpsRecords);
  }, [jugador, localGpsRecords]);

  const speedChartData = useMemo(() => {
    return speedTestRecords.map((r) => {
      let dateLabel = r.fecha;
      try {
        const parts = r.fecha.split("-");
        if (parts.length === 3) {
          dateLabel = `${parts[2]}/${parts[1]}`;
        }
      } catch {}
      return {
        fecha: r.fecha,
        dateLabel,
        velMax: r.velMax,
        tipo: r.tipo,
        origen: r.origen,
        sesion: r.sesion,
      };
    });
  }, [speedTestRecords]);

  const speedStats = useMemo(() => {
    if (!speedTestRecords || speedTestRecords.length === 0) {
      return { maxSpeed: 0, latestSprintTest: null, avgSpeed: 0 };
    }
    const max = Math.max(...speedTestRecords.map((r) => r.velMax));
    const sprints = speedTestRecords.filter((r) => r.origen === "tarea_sprint");
    const latestSprint = sprints.length > 0 ? sprints[sprints.length - 1] : null;
    const avg = speedTestRecords.reduce((acc, r) => acc + r.velMax, 0) / speedTestRecords.length;
    return {
      maxSpeed: max,
      latestSprintTest: latestSprint,
      avgSpeed: avg,
    };
  }, [speedTestRecords]);

  // Overrides manuales para la matriz de GPS
  const [gpsMatrixCustomOverrides, setGpsMatrixCustomOverrides] = useState<Record<string, Record<string, number>>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`gps_matrix_overrides_${jugador.id}`);
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return {};
  });

  // Conteo de días distintos por columna MD para el equipo
  const distinctDaysByMD = useMemo(() => {
    const res: Record<string, number> = {};
    mdColumns.forEach((col) => {
      const dates = new Set<string>();
      matrixFilteredGpsRecords.forEach((r) => {
        if (normalizeMD(r.match_day, r.tipo_sesion) === col) {
          const iso = parseDateStrToISO(r.fecha);
          if (iso) dates.add(iso);
        }
      });
      res[col] = dates.size;
    });
    return res;
  }, [matrixFilteredGpsRecords, mdColumns]);

  // Helper para clasificar tareas de Match Day
  const classifyMdTask = (taskName?: string): "activacion" | "carreras" | "partido" => {
    const n = String(taskName || "").trim().toUpperCase();
    if (n.includes("ACTIVACI") || n.includes("CALENTAMIENTO") || n.includes("PREPARTIDO") || n.includes("WARM")) {
      return "activacion";
    }
    if (n.includes("CARRERA") || n.includes("CARRERE") || n.includes("POST-PARTIDO") || n.includes("POSTPARTIDO")) {
      return "carreras";
    }
    return "partido";
  };

  const getRecordMetricValue = (
    r: any,
    vKey: string,
    isMD: boolean
  ): number => {
    if (isMD && r.metricas?.tareas) {
      const rawList = Array.isArray(r.metricas.tareas) ? r.metricas.tareas : Object.values(r.metricas.tareas);
      const validTasks = rawList.filter((t: any) => {
        if (!t || typeof t !== "object") return false;
        const cat = classifyMdTask(t.nombre || t.tarea || t.name || t.Split_Name);
        if (cat === "partido") return true;
        if (cat === "activacion") return mdIncludeActivacion;
        if (cat === "carreras") return mdIncludeCarreras;
        return true;
      });

      if (validTasks.length > 0) {
        if (isRateOrPeak(vKey)) {
          const pVals = validTasks.map((t: any) => calculateGpsMetricValue(t, vKey, derivedVariables));
          const maxVal = Math.max(...pVals);
          return isNaN(maxVal) ? 0 : maxVal;
        }
        if (vKey === "Distancia / Min" || vKey.toLowerCase().includes("m/min")) {
          const totalDist = validTasks.reduce((sum: number, t: any) => sum + calculateGpsMetricValue(t, "Distance(m)", derivedVariables), 0);
          const totalMin = validTasks.reduce((sum: number, t: any) => sum + Number(t.Tiempo || t.duracion_min || t["Duration(min)"] || 0), 0);
          return totalMin > 0 ? Math.round((totalDist / totalMin) * 10) / 10 : 0;
        }
        const sumVal = validTasks.reduce((sum: number, t: any) => sum + calculateGpsMetricValue(t, vKey, derivedVariables), 0);
        return Math.round(sumVal * 100) / 100;
      }
    }

    if (vKey === "Distancia / Min" || vKey.toLowerCase().includes("m/min")) {
      const dur = Number(r.duracion || r.metricas?.["Duration(min)"] || r.metricas?.Tiempo || 0);
      const dist = calculateGpsMetricValue(r.metricas || r, "Distance(m)", derivedVariables);
      return dur > 0 ? Math.round((dist / dur) * 10) / 10 : calculateGpsMetricValue(r.metricas || r, vKey, derivedVariables);
    }
    return calculateGpsMetricValue(r.metricas || r, vKey, derivedVariables);
  };

  // Cálculo reactivo de la matriz GPS según datos filtrados (Jugador o Equipo, Microciclos y Semanas)
  const realGpsMatrixByMD = useMemo(() => {
    const res: {
      promedio: Record<string, Record<string, number | null>>;
      maximos: Record<string, Record<string, number | null>>;
      competitivo: Record<string, Record<string, number | null>>;
      sessionCounts: Record<string, number>;
    } = { promedio: {}, maximos: {}, competitivo: {}, sessionCounts: {} };

    // Conteo de sesiones por columna de Match Day
    mdColumns.forEach((col) => {
      res.sessionCounts[col] = matrixFilteredGpsRecords.filter(
        (r) => normalizeMD(r.match_day, r.tipo_sesion) === col
      ).length;
    });

    playerCompVariables.forEach((vKey) => {
      res.promedio[vKey] = {};
      res.maximos[vKey] = {};
      res.competitivo[vKey] = {};

      const isRate = isRateOrPeak(vKey);

      mdColumns.forEach((col) => {
        const colRecs = matrixFilteredGpsRecords.filter(
          (r) => normalizeMD(r.match_day, r.tipo_sesion) === col
        );

        if (colRecs.length === 0) {
          res.promedio[vKey][col] = null;
          res.maximos[vKey][col] = null;
          if (col === "MD" && gpsSubjectMode === "jugador") {
            const compVal = playerCompProfile?.values?.[vKey];
            res.competitivo[vKey][col] = typeof compVal === "number" ? compVal : null;
          } else {
            res.competitivo[vKey][col] = null;
          }
          return;
        }

        const vals = colRecs.map((r) => {
          return getRecordMetricValue(r, vKey, col === "MD");
        }).filter((v) => typeof v === "number" && !isNaN(v) && v > 0);

        if (vals.length === 0) {
          res.promedio[vKey][col] = null;
          res.maximos[vKey][col] = null;
          res.competitivo[vKey][col] = null;
          return;
        }

        const max = Math.max(...vals);

        if (gpsSubjectMode === "jugador") {
          const maxIdx = vals.indexOf(max);
          const valsWithoutMax = vals.filter((_, i) => i !== maxIdx);
          const avgWithoutMax = valsWithoutMax.length > 0
            ? valsWithoutMax.reduce((a, b) => a + b, 0) / valsWithoutMax.length
            : max;

          const formattedAvgWithoutMax = isRate ? Math.round(avgWithoutMax * 10) / 10 : Math.round(avgWithoutMax);
          const formattedMax = isRate ? Math.round(max * 10) / 10 : Math.round(max);

          res.promedio[vKey][col] = formattedAvgWithoutMax;
          res.maximos[vKey][col] = formattedMax;

          if (col === "MD") {
            const compVal = playerCompProfile?.values?.[vKey];
            if (typeof compVal === "number") {
              res.competitivo[vKey][col] = compVal;
            } else {
              const compDemMD = (max + avgWithoutMax) / 2;
              res.competitivo[vKey][col] = isRate ? Math.round(compDemMD * 10) / 10 : Math.round(compDemMD);
            }
          } else {
            const compDem = (max + avgWithoutMax) / 2;
            res.competitivo[vKey][col] = isRate ? Math.round(compDem * 10) / 10 : Math.round(compDem);
          }
        } else {
          // Modo EQUIPO: promedio global de la plantilla y máximo pico de plantilla
          const sum = vals.reduce((a, b) => a + b, 0);
          const avgTeam = sum / vals.length;
          const formattedAvgTeam = isRate ? Math.round(avgTeam * 10) / 10 : Math.round(avgTeam);
          const formattedMax = isRate ? Math.round(max * 10) / 10 : Math.round(max);
          const compDem = (max + avgTeam) / 2;
          const formattedComp = isRate ? Math.round(compDem * 10) / 10 : Math.round(compDem);

          res.promedio[vKey][col] = formattedAvgTeam;
          res.maximos[vKey][col] = formattedMax;
          res.competitivo[vKey][col] = formattedComp;
        }
      });
    });

    return res;
  }, [matrixFilteredGpsRecords, playerCompVariables, mdColumns, derivedVariables, playerCompProfile, gpsSubjectMode, mdIncludeActivacion, mdIncludeCarreras]);




  // Local state for Ficha Cualitativa
  const [cualitativa, setCualitativa] = useState({
    fisico: "Jugador de perfil explosivo, alta capacidad de repetición de esfuerzos de alta intensidad. Gran potencia en tren inferior.",
    psicologico: "Muy enfocado y motivado. Excelente actitud ante la carga y buena tolerancia a la frustración en momentos de alta exigencia.",
    habitos: "Excelente higiene del sueño (8h+ por noche). Cuida la hidratación previa al entrenamiento y sigue pauta de recuperación.",
    objetivos: "Mejorar la fuerza máxima en sentadilla (+5%) y mantener la simetría muscular en isquiosurales durante el microciclo.",
  });

  // Local state for Tests (solo datos reales registrados)
  const [testRecords, setTestRecords] = useState<{ fecha: string; peso: number; pliegues: number; vam?: number; sprint30?: number; cmj?: number }[]>([]);

  const [newTest, setNewTest] = useState({ fecha: "", peso: "", pliegues: "", vam: "", sprint30: "", cmj: "" });

  // Local state for Historial Lesional sincronizado con Historial de Lesiones global
  const [lesiones, setLesiones] = useState<any[]>(() =>
    loadPlayerLesionesFromStorage(jugador.id, jugador.nombre)
  );

  const [showNuevaLesion, setShowNuevaLesion] = useState(false);
  const [nuevaLesion, setNuevaLesion] = useState({
    fechaInicio: new Date().toISOString().split("T")[0],
    fechaAlta: "",
    tipo: "Músculo",
    zona: "Muslo (cuádriceps)",
    contexto: "Entrenamiento Optimizador",
    contacto: "Sin contacto",
    recurrencia: "Nueva",
    gravedad: "Leve (1 a 7)",
    diasBaja: "3",
    estado: "Baja Médica",
    comentario: "",
  });

  // Save/Load to LocalStorage with live real calculation from BBDD
  useEffect(() => {
    // 1. Cargar historial lesional sincronizado
    const loadedLesiones = loadPlayerLesionesFromStorage(jugador.id, jugador.nombre);
    setLesiones(loadedLesiones);

    // 2. Cargar datos reales de Testing (Peso y Pliegues)
    const tData = loadTestingDataForPlayer(jugador.nombre, jugador.apodo, initialTestingData);
    setTestingData(tData);

    // 3. Cargar filas de BBDD fresca y calcular datos reales
    const currentTeam = localStorage.getItem("active_team") || jugador.equipo || "CE Europa";
    getFullExcelBBDDRows(currentTeam)
      .then((res) => {
        const rowsToUse = res?.rows && res.rows.length > 0 ? res.rows : bbddRows;
        if (res?.rows && res.rows.length > 0) {
          setBbddRows(res.rows);
          try {
            localStorage.setItem("bbdd_general_rows_v1", JSON.stringify(res.rows));
          } catch (e) {}
        }
        const realStats = loadRealReportDataForPlayer(jugador, loadedLesiones, rowsToUse);
        if (realStats) {
          setEventosEquipo(realStats.evEquipo);
          setDisponibilidadJugador(realStats.dispJugador);
          setEventosJugador(realStats.evJugador);
        }
      })
      .catch(() => {
        const realStats = loadRealReportDataForPlayer(jugador, loadedLesiones, bbddRows);
        if (realStats) {
          setEventosEquipo(realStats.evEquipo);
          setDisponibilidadJugador(realStats.dispJugador);
          setEventosJugador(realStats.evJugador);
        }
      });

    const saved = localStorage.getItem(`player_extra_${jugador.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
// GPS matrix is now reactive and computed dynamically from real GPS records
        if (parsed.cualitativa) setCualitativa(parsed.cualitativa);
        if (parsed.testRecords && Array.isArray(parsed.testRecords)) {
          // Filtrar registros mock/demo antiguos (Set, Oct, Nov, Dic, Ene, Feb)
          const isDemoRecord = (r: any) =>
            (r.fecha === "Set" && r.peso === 74.5) ||
            (r.fecha === "Oct" && r.peso === 74.2) ||
            (r.fecha === "Nov" && r.peso === 73.8) ||
            (r.fecha === "Dic" && r.peso === 74.0) ||
            (r.fecha === "Ene" && r.peso === 73.5) ||
            (r.fecha === "Feb" && r.peso === 73.6);
          const cleanRecords = parsed.testRecords.filter((r: any) => !isDemoRecord(r));
          setTestRecords(cleanRecords);
        }
      } catch (e) {
        console.error(e);
      }
    }

    const handleSync = () => {
      const les = loadPlayerLesionesFromStorage(jugador.id, jugador.nombre);
      setLesiones(les);

      let cachedBBDD = bbddRows;
      try {
        const rawCached = localStorage.getItem("bbdd_general_rows_v1");
        if (rawCached) cachedBBDD = JSON.parse(rawCached);
      } catch (e) {}

      const st = loadRealReportDataForPlayer(jugador, les, cachedBBDD);
      if (st) {
        setEventosEquipo(st.evEquipo);
        setDisponibilidadJugador(st.dispJugador);
        setEventosJugador(st.evJugador);
      }
    };

    window.addEventListener("storage", handleSync);
    window.addEventListener("player_events_updated", handleSync);
    window.addEventListener("eventos_bloques_updated", handleSync);
    window.addEventListener("lesiones_updated", handleSync);
    window.addEventListener("minutes_updated", handleSync);
    window.addEventListener("disponibilidad_updated", handleSync);
    window.addEventListener("bbdd_updated", handleSync);

    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("player_events_updated", handleSync);
      window.removeEventListener("eventos_bloques_updated", handleSync);
      window.removeEventListener("lesiones_updated", handleSync);
      window.removeEventListener("minutes_updated", handleSync);
      window.removeEventListener("disponibilidad_updated", handleSync);
      window.removeEventListener("bbdd_updated", handleSync);
    };
  }, [jugador.id, jugador.nombre]);

  const saveExtraData = (updated: Record<string, any>) => {
    const current = {
      eventosEquipo,
      disponibilidadJugador,
      eventosJugador,
      gpsMatrixCustomOverrides,
      cualitativa,
      testRecords,
      lesiones,
      ...updated,
    };
    localStorage.setItem(`player_extra_${jugador.id}`, JSON.stringify(current));
  };

  const handleUpdateDisponibilidadRow = (index: number, field: "val" | "pct", value: number) => {
    setDisponibilidadJugador((prev) => {
      const next = [...prev];
      const totalDias = eventosEquipo[0]?.val || 52;
      if (field === "val") {
        const pct = totalDias > 0 ? Math.round((value / totalDias) * 100) : 0;
        next[index] = { ...next[index], val: value, pct };
      } else {
        next[index] = { ...next[index], pct: value };
      }
      saveExtraData({ disponibilidadJugador: next });
      return next;
    });
  };

  const handleUpdateEventosEquipoRow = (index: number, field: "val" | "pct", value: number) => {
    setEventosEquipo((prev) => {
      const next = [...prev];
      const totalDias = index === 0 ? value : (next[0]?.val || 52);
      if (field === "val") {
        const pct = totalDias > 0 ? Math.round((value / totalDias) * 100) : (index === 0 ? 100 : 0);
        next[index] = { ...next[index], val: value, pct };
      } else {
        next[index] = { ...next[index], pct: value };
      }
      saveExtraData({ eventosEquipo: next });
      return next;
    });
  };

  const handleUpdateEventosJugadorRow = (index: number, field: "val" | "pct", value: number) => {
    setEventosJugador((prev) => {
      const next = [...prev];
      if (field === "val") {
        next[index] = { ...next[index], val: value };
      } else {
        next[index] = { ...next[index], pct: value };
      }
      saveExtraData({ eventosJugador: next });
      return next;
    });
  };

  const handleRecalculateReportData = () => {
    const les = loadPlayerLesionesFromStorage(jugador.id, jugador.nombre);
    let cachedBBDD = bbddRows;
    try {
      const rawCached = localStorage.getItem("bbdd_general_rows_v1");
      if (rawCached) cachedBBDD = JSON.parse(rawCached);
    } catch (e) {}

    const st = loadRealReportDataForPlayer(jugador, les, cachedBBDD);
    if (st) {
      setEventosEquipo(st.evEquipo);
      setDisponibilidadJugador(st.dispJugador);
      setEventosJugador(st.evJugador);
      saveExtraData({
        eventosEquipo: st.evEquipo,
        disponibilidadJugador: st.dispJugador,
        eventosJugador: st.evJugador,
      });
      alert("✓ Datos recalculados con éxito desde la base de datos.");
    }
  };

  const handleAddTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTest.fecha) return;
    const entry = {
      fecha: newTest.fecha,
      peso: parseFloat(newTest.peso) || (jugador.peso ? Number(jugador.peso) : 0),
      pliegues: parseFloat(newTest.pliegues) || 0,
      vam: parseFloat(newTest.vam) || 0,
      sprint30: parseFloat(newTest.sprint30) || 0,
      cmj: parseFloat(newTest.cmj) || 0,
    };
    const updated = [...testRecords, entry];
    setTestRecords(updated);
    saveExtraData({ testRecords: updated });
    setNewTest({ fecha: "", peso: "", pliegues: "", vam: "", sprint30: "", cmj: "" });
  };

  const handleAddLesion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaLesion.fechaInicio || !nuevaLesion.zona) return;
    const dias = parseInt(nuevaLesion.diasBaja) || 0;
    let grav = nuevaLesion.gravedad || "Leve (1 a 7)";
    if (dias === 0) grav = "Sin baja (0)";
    else if (dias <= 7) grav = "Leve (1 a 7)";
    else if (dias <= 28) grav = "Moderada (8 a 28)";
    else grav = "Grave (>28)";

    const newId = `manual_${Date.now()}`;
    const entry = {
      id: newId,
      fechaInicio: nuevaLesion.fechaInicio,
      fechaAlta: nuevaLesion.fechaAlta,
      tipo: nuevaLesion.tipo,
      zona: nuevaLesion.zona,
      contexto: nuevaLesion.contexto,
      contacto: nuevaLesion.contacto,
      recurrencia: nuevaLesion.recurrencia,
      gravedad: grav,
      diasBaja: dias,
      estado: nuevaLesion.estado,
      comentario: nuevaLesion.comentario,
      isGlobalRecord: true,
    };

    const updated = [entry, ...lesiones];
    setLesiones(updated);
    saveExtraData({ lesiones: updated });

    // Sincronizar inmediatamente al Historial de Lesiones global (lesiones_registro_detallado_v1)
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("lesiones_registro_detallado_v1");
        const list: any[] = raw ? JSON.parse(raw) : [];
        const recordDetailed: LesionFormData = {
          id: newId,
          jugador_id: jugador.id,
          jugador_nombre: jugador.nombre,
          jugador_apodo: jugador.apodo || "",
          posicion: jugador.posicion || "",
          cor_id: jugador.cor_id || jugador.dorsal || "",
          seccion: "CE MANRESA",
          equipo: "1er EQUIPO",
          fecha_nacimiento: jugador.fecha_nacimiento || "",
          fecha: nuevaLesion.fechaInicio,
          tipo_disponibilidad: "NDL",
          contexto: nuevaLesion.contexto || "Entrenamiento Optimizador",
          contacto: nuevaLesion.contacto || "Sin contacto",
          region_corporal: nuevaLesion.zona,
          recurrencia: nuevaLesion.recurrencia || "Nueva",
          tejido: nuevaLesion.tipo || "Músculo",
          resultado: dias === 0 ? "Sin baja" : "Con baja",
          gravedad: grav,
          dias_baja: dias,
          comentario: nuevaLesion.comentario || "",
        };

        const existingIdx = list.findIndex(
          (r) => r.jugador_id === jugador.id && r.fecha === nuevaLesion.fechaInicio
        );
        if (existingIdx >= 0) {
          list[existingIdx] = recordDetailed;
        } else {
          list.unshift(recordDetailed);
        }
        localStorage.setItem("lesiones_registro_detallado_v1", JSON.stringify(list));

        // Desbloquear de eliminadas si estuviese
        const rawDel = localStorage.getItem("lesiones_eliminadas_v1");
        if (rawDel) {
          const delSet = new Set<string>(JSON.parse(rawDel));
          delSet.delete(`${jugador.id}_${nuevaLesion.fechaInicio}`);
          delSet.delete(newId);
          localStorage.setItem("lesiones_eliminadas_v1", JSON.stringify(Array.from(delSet)));
        }

        // Sincronizar comentario clínico
        if (nuevaLesion.comentario && nuevaLesion.comentario.trim()) {
          const rawCom = localStorage.getItem("comentarios_jugadores_v2");
          let comArr: any[] = rawCom ? JSON.parse(rawCom) : [];
          comArr = comArr.filter(
            (c) => !(c.jugador_id === jugador.id && c.fecha === nuevaLesion.fechaInicio && c.tipo === "FIS")
          );
          comArr.push({
            jugador_id: jugador.id,
            fecha: nuevaLesion.fechaInicio,
            tipo: "FIS",
            texto: nuevaLesion.comentario.trim(),
          });
          localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(comArr));
        }
      } catch (e) {
        console.error("Error al sincronizar lesión con historial global:", e);
      }
    }

    try {
      await addLesion(jugador.id, {
        fecha_inicio: nuevaLesion.fechaInicio,
        tipo: nuevaLesion.tipo,
        zona: nuevaLesion.zona,
        comentario: nuevaLesion.comentario,
      });
    } catch (err) {
      console.error("Error al registrar lesión en servidor:", err);
    }

    setNuevaLesion({
      fechaInicio: new Date().toISOString().split("T")[0],
      fechaAlta: "",
      tipo: "Músculo",
      zona: "Muslo (cuádriceps)",
      contexto: "Entrenamiento Optimizador",
      contacto: "Sin contacto",
      recurrencia: "Nueva",
      gravedad: "Leve (1 a 7)",
      diasBaja: "0",
      estado: "Alta Médica",
      comentario: "",
    });
    setShowNuevaLesion(false);
  };

  const handleDeletePlayerLesion = (les: any) => {
    if (!window.confirm(`¿Eliminar este registro de lesión (${les.zona} - ${les.fechaInicio})?`)) return;

    const updated = lesiones.filter(
      (l) => l.id !== les.id && !(l.fechaInicio === les.fechaInicio && l.zona === les.zona)
    );
    setLesiones(updated);
    saveExtraData({ lesiones: updated });

    if (typeof window !== "undefined") {
      try {
        // Eliminar del registro detallado global
        const raw = localStorage.getItem("lesiones_registro_detallado_v1");
        if (raw) {
          const list: any[] = JSON.parse(raw);
          const nextList = list.filter(
            (r) => !(r.jugador_id === jugador.id && r.fecha === les.fechaInicio)
          );
          localStorage.setItem("lesiones_registro_detallado_v1", JSON.stringify(nextList));
        }

        // Añadir a claves eliminadas para que no reaparezca
        const rawDel = localStorage.getItem("lesiones_eliminadas_v1");
        const delSet = new Set<string>(rawDel ? JSON.parse(rawDel) : []);
        delSet.add(`${jugador.id}_${les.fechaInicio}`);
        if (les.id) delSet.add(les.id);
        localStorage.setItem("lesiones_eliminadas_v1", JSON.stringify(Array.from(delSet)));

        // Eliminar comentario clínico
        const rawCom = localStorage.getItem("comentarios_jugadores_v2");
        if (rawCom) {
          let comArr: any[] = JSON.parse(rawCom);
          comArr = comArr.filter(
            (c) => !(c.jugador_id === jugador.id && c.fecha === les.fechaInicio && c.tipo === "FIS")
          );
          localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(comArr));
        }
      } catch (e) {
        console.error("Error eliminando lesión de almacenamiento:", e);
      }
    }
  };

  const handleUpdatePlayerComment = (les: any, newComment: string) => {
    const updated = lesiones.map((l) => {
      if (l.id === les.id || (l.fechaInicio === les.fechaInicio && l.zona === les.zona)) {
        return { ...l, comentario: newComment };
      }
      return l;
    });
    setLesiones(updated);
    saveExtraData({ lesiones: updated });

    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("lesiones_registro_detallado_v1");
        if (raw) {
          const list: any[] = JSON.parse(raw);
          const idx = list.findIndex(
            (r) => r.jugador_id === jugador.id && r.fecha === les.fechaInicio
          );
          if (idx >= 0) {
            list[idx].comentario = newComment;
            localStorage.setItem("lesiones_registro_detallado_v1", JSON.stringify(list));
          }
        }

        const rawCom = localStorage.getItem("comentarios_jugadores_v2");
        let comArr: any[] = rawCom ? JSON.parse(rawCom) : [];
        comArr = comArr.filter(
          (c) => !(c.jugador_id === jugador.id && c.fecha === les.fechaInicio && c.tipo === "FIS")
        );
        if (newComment && newComment.trim()) {
          comArr.push({
            jugador_id: jugador.id,
            fecha: les.fechaInicio,
            tipo: "FIS",
            texto: newComment.trim(),
          });
        }
        localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(comArr));
      } catch (e) {}
    }
  };

  // Obtener valor de celda según el modo activo (promedio, maximos o competitivo con datos reales)
  const getCellValue = (metricKey: string, col: string): string | number => {
    if (gpsMatrixCustomOverrides[metricKey]?.[col] !== undefined) {
      return gpsMatrixCustomOverrides[metricKey][col];
    }
    const modeData = realGpsMatrixByMD[gpsProfileMode] || realGpsMatrixByMD.promedio;
    const val = modeData[metricKey]?.[col];
    if (val === null || val === undefined) return "—";
    return val;
  };

  // Modificar valor de celda manualmente
  const updateCellValue = (metricKey: string, col: string, newVal: number) => {
    const nextOverrides = {
      ...gpsMatrixCustomOverrides,
      [metricKey]: {
        ...(gpsMatrixCustomOverrides[metricKey] || {}),
        [col]: newVal,
      },
    };
    setGpsMatrixCustomOverrides(nextOverrides);
    if (typeof window !== "undefined") {
      localStorage.setItem(`gps_matrix_overrides_${jugador.id}`, JSON.stringify(nextOverrides));
    }
  };

  // Restablecer celda a datos reales calculados
  const handleResetCellOverride = (metricKey: string, col: string) => {
    const current = { ...(gpsMatrixCustomOverrides[metricKey] || {}) };
    delete current[col];
    const nextOverrides = { ...gpsMatrixCustomOverrides, [metricKey]: current };
    setGpsMatrixCustomOverrides(nextOverrides);
    if (typeof window !== "undefined") {
      localStorage.setItem(`gps_matrix_overrides_${jugador.id}`, JSON.stringify(nextOverrides));
    }
  };

  // Restablecer todas las celdas a datos reales calculados
  const handleResetAllMatrixOverrides = () => {
    if (!confirm("¿Restablecer todas las celdas a los datos reales calculados del GPS?")) return;
    setGpsMatrixCustomOverrides({});
    if (typeof window !== "undefined") {
      localStorage.removeItem(`gps_matrix_overrides_${jugador.id}`);
    }
  };

  // Las variables activas son las elegidas por el usuario
  const activeMetricList = playerCompVariables;

  return (
    <div>
      {/* BARRA DE NAVEGACIÓN LIMPIA DE SUB-PESTAÑAS (UNA SOLA LÍNEA, SIN EMOJIS, ESTILO PROFESIONAL) */}
      <div
        className="no-print"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "4px",
          background: "#e2e8f0",
          padding: "3px",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          margin: "16px 0 20px",
          width: "100%",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("general")}
          style={{
            padding: "7px 10px",
            borderRadius: "6px",
            border: "none",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
            textAlign: "center",
            whiteSpace: "nowrap",
            background: activeTab === "general" ? "#1e3a8a" : "transparent",
            color: activeTab === "general" ? "#ffffff" : "#475569",
            boxShadow: activeTab === "general" ? "0 1px 4px rgba(30,58,138,0.2)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          Ficha General
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("report")}
          style={{
            padding: "7px 10px",
            borderRadius: "6px",
            border: "none",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
            textAlign: "center",
            whiteSpace: "nowrap",
            background: activeTab === "report" ? "#1e3a8a" : "transparent",
            color: activeTab === "report" ? "#ffffff" : "#475569",
            boxShadow: activeTab === "report" ? "0 1px 4px rgba(30,58,138,0.2)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          Ficha Report
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("cualitativa")}
          style={{
            padding: "7px 10px",
            borderRadius: "6px",
            border: "none",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
            textAlign: "center",
            whiteSpace: "nowrap",
            background: activeTab === "cualitativa" ? "#1e3a8a" : "transparent",
            color: activeTab === "cualitativa" ? "#ffffff" : "#475569",
            boxShadow: activeTab === "cualitativa" ? "0 1px 4px rgba(30,58,138,0.2)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          Ficha Cualitativa
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("fisicos_tests")}
          style={{
            padding: "7px 10px",
            borderRadius: "6px",
            border: "none",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
            textAlign: "center",
            whiteSpace: "nowrap",
            background: activeTab === "fisicos_tests" ? "#1e3a8a" : "transparent",
            color: activeTab === "fisicos_tests" ? "#ffffff" : "#475569",
            boxShadow: activeTab === "fisicos_tests" ? "0 1px 4px rgba(30,58,138,0.2)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          Datos Físicos y Tests
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("lesiones")}
          style={{
            padding: "7px 10px",
            borderRadius: "6px",
            border: "none",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
            textAlign: "center",
            whiteSpace: "nowrap",
            background: activeTab === "lesiones" ? "#1e3a8a" : "transparent",
            color: activeTab === "lesiones" ? "#ffffff" : "#475569",
            boxShadow: activeTab === "lesiones" ? "0 1px 4px rgba(30,58,138,0.2)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          Historial Lesional
        </button>
      </div>

      {/* PESTAÑA 1: FICHA GENERAL */}
      {activeTab === "general" && (
        <div>
          <form className="athlete-detail-form" onSubmit={handleSubmitGeneral}>
            <input type="hidden" name="id" value={jugador.id} />
            <div className="detail-section-title">Identidad y equipo</div>
            <div className="detail-field detail-field-wide">
              <label htmlFor="detail-nombre">Nombre y apellido</label>
              <input id="detail-nombre" name="nombre" defaultValue={fieldValue(jugador.nombre)?.toString()?.toUpperCase()} required />
            </div>
            <div className="detail-field">
              <label htmlFor="detail-apodo">Nombre corto o apodo</label>
              <input id="detail-apodo" name="apodo" defaultValue={fieldValue(jugador.apodo)?.toString()?.toUpperCase()} />
            </div>
            <div className="detail-field">
              <label htmlFor="detail-posicion-base">Posición</label>
              <input
                id="detail-posicion-base"
                name="posicion_base"
                defaultValue={parsePosicion(jugador.posicion).base}
                placeholder="Ej. LATERAL, EXTREMO..."
              />
            </div>
            <div className="detail-field">
              <label htmlFor="detail-lateralidad">Lateralidad</label>
              <input
                id="detail-lateralidad"
                name="lateralidad"
                defaultValue={parsePosicion(jugador.posicion).lado}
                placeholder="Ej. DERECHO, IZQUIERDO..."
              />
            </div>
            <div className="detail-field">
              <label htmlFor="detail-temporada">Temporada</label>
              <input id="detail-temporada" name="temporada" defaultValue={fieldValue(jugador.temporada)} />
            </div>
            <div className="detail-field">
              <label htmlFor="detail-equipo">Equipo</label>
              <input id="detail-equipo" name="equipo" defaultValue={fieldValue(jugador.equipo)} />
            </div>
            <div className="detail-field">
              <label htmlFor="detail-dorsal">Dorsal</label>
              <input id="detail-dorsal" name="dorsal" type="number" defaultValue={fieldValue(jugador.dorsal ?? jugador.cor_id)} />
            </div>
            <div className="detail-field">
              <label htmlFor="detail-pierna-habil">Pierna Hábil</label>
              <input id="detail-pierna-habil" name="pierna_habil" defaultValue={fieldValue(jugador.pierna_habil)} placeholder="Ej. Diestra, Zurda, Ambidextra..." />
            </div>
            <div className="detail-section-title">Datos personales</div>
            <div className="detail-field">
              <label htmlFor="detail-nacionalidad">Nacionalidad</label>
              <input id="detail-nacionalidad" name="nacionalidad" defaultValue={fieldValue(jugador.nacionalidad)} />
            </div>
            <div className="detail-field">
              <label htmlFor="detail-fecha">Fecha de nacimiento</label>
              <input id="detail-fecha" name="fecha_nacimiento" type="date" defaultValue={fieldValue(jugador.fecha_nacimiento)} />
            </div>
            <div className="detail-field">
              <label htmlFor="detail-contacto">Contacto</label>
              <input id="detail-contacto" name="contacto" defaultValue={fieldValue(jugador.contacto)} />
            </div>
            <div className="detail-field">
              <label htmlFor="detail-anos">Años en el club</label>
              <input id="detail-anos" name="anos_en_club" type="number" min="0" defaultValue={fieldValue(jugador.anos_en_club)} />
            </div>
            <div className="detail-section-title">Rendimiento y selección</div>
            <div className="detail-field">
              <label htmlFor="detail-peso">Peso (kg)</label>
              <input
                id="detail-peso"
                name="peso"
                type="number"
                min="0"
                step="0.1"
                value={pesoVal ?? ""}
                onChange={(e) => {
                  setPesoVal(e.target.value);
                  setPesoOrigin(null);
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "3px" }}>
                {pesoOrigin === "auto" ? (
                  <span style={{ fontSize: "10.5px", color: "#16a34a", fontWeight: 600 }}>
                    ✓ Sincronizado
                  </span>
                ) : <span />}
                <button
                  type="button"
                  onClick={() => {
                    const latest = getLatestTestingPeso(jugador.nombre, jugador.apodo);
                    if (latest !== null && latest !== undefined) {
                      setPesoVal(latest);
                      setPesoOrigin("auto");
                    } else {
                      alert("No se encontraron mediciones de peso para este deportista en Valoración.");
                    }
                  }}
                  style={{
                    fontSize: "10.5px",
                    color: "#64748b",
                    background: "none",
                    border: "none",
                    padding: "0",
                    cursor: "pointer",
                    textDecoration: "underline",
                    marginLeft: "auto",
                  }}
                  title="Actualizar peso desde datos de Valoración"
                >
                  ↻ Actualizar
                </button>
              </div>
            </div>
            <div className="detail-field">
              <label htmlFor="detail-altura">Altura (cm)</label>
              <input id="detail-altura" name="altura" type="number" min="0" step="0.1" defaultValue={fieldValue(jugador.altura)} />
            </div>
            <label className="detail-check">
              <input name="seleccion_autonomica" type="checkbox" defaultChecked={Boolean(jugador.seleccion_autonomica)} /> Selección autonómica
            </label>
            <label className="detail-check">
              <input name="seleccion_nacional" type="checkbox" defaultChecked={Boolean(jugador.seleccion_nacional)} /> Selección nacional
            </label>
            <div className="detail-field detail-field-wide">
              <label htmlFor="detail-foto">URL de la foto</label>
              <input id="detail-foto" name="foto_url" type="url" defaultValue={fieldValue(jugador.foto_url)} />
            </div>
            <div className="detail-actions" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button className="modal-save" type="submit" disabled={isSavingGeneral}>
                {isSavingGeneral ? "Guardando..." : "Guardar cambios"}
              </button>
              {saveGeneralMessage && (
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: saveGeneralMessage.startsWith("✓") ? "#16a34a" : "#dc2626" }}>
                  {saveGeneralMessage}
                </span>
              )}
            </div>
          </form>

          <form className="archive-form" action={archiveJugadorAction} style={{ marginTop: "24px" }}>
            <input type="hidden" name="id" value={jugador.id} />
            <button className="archive-button" type="submit">Archivar jugador</button>
            <span>La ficha se conservará, pero dejará de aparecer entre los jugadores activos.</span>
          </form>
        </div>
      )}

      {/* PESTAÑA 2: FICHA REPORT — DATOS GENERALES */}
      {activeTab === "report" && (
        <div style={{ background: "#ffffff", padding: "16px 20px", borderRadius: "10px", border: "1px solid #cbd5e1", fontFamily: "inherit" }}>
          {/* TITULO SECCIÓN: DATOS GENERALES */}
          <div style={{ textAlign: "center", fontWeight: 900, fontSize: "13.5px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
            DATOS GENERALES
          </div>
          <hr style={{ border: "none", borderTop: "1.5px solid #0f172a", margin: "0 0 16px" }} />

          {/* GRID 3 COLUMNAS: EVENTOS DEL EQUIPO | DISPONIBILIDAD | EVENTOS JUGADOR */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", marginBottom: "16px" }}>
            {/* COLUMNA 1: EVENTOS DEL EQUIPO */}
            <div>
              <div style={{ textAlign: "center", fontWeight: 800, fontSize: "11px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "10px", borderBottom: "1.5px solid #0f172a", paddingBottom: "4px" }}>
                EVENTOS DEL EQUIPO
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {eventosEquipo.map((row, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11.5px" }}>
                    <span style={{ width: "105px", textAlign: "right", fontWeight: 700, color: "#334155" }}>
                      {row.label}
                    </span>
                    <div style={{ width: "42px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={row.pct}
                        onChange={(e) => handleUpdateEventosEquipoRow(idx, "pct", Number(e.target.value) || 0)}
                        style={{
                          width: "30px",
                          background: "transparent",
                          border: "none",
                          textAlign: "right",
                          fontWeight: 800,
                          fontSize: "11px",
                          color: "#0f172a",
                          padding: 0,
                          outline: "none",
                        }}
                      />
                      <span style={{ fontSize: "10px", fontWeight: 800, color: "#64748b" }}>%</span>
                    </div>
                    <div style={{ width: "110px", background: "#f1f5f9", height: "22px", borderRadius: "3px", border: "1px solid #cbd5e1", display: "flex", alignItems: "center", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, row.pct)}%`, background: "#93c5fd" }} />
                      <input
                        type="number"
                        min="0"
                        value={row.val}
                        onChange={(e) => handleUpdateEventosEquipoRow(idx, "val", Number(e.target.value) || 0)}
                        style={{
                          position: "relative",
                          zIndex: 1,
                          width: "100%",
                          height: "100%",
                          background: "transparent",
                          border: "none",
                          outline: "none",
                          paddingLeft: "6px",
                          fontWeight: 900,
                          fontSize: "11.5px",
                          color: "#0f172a",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* COLUMNA 2: DISPONIBILIDAD JUGADOR */}
            <div>
              <div style={{ textAlign: "center", fontWeight: 800, fontSize: "11px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "10px", borderBottom: "1.5px solid #0f172a", paddingBottom: "4px" }}>
                DISPONIBILIDAD {(jugador?.nombre ? jugador.nombre.trim().split(" ")[0] : "DEPORTISTA")?.toString()?.toUpperCase()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {disponibilidadJugador.map((row, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11.5px" }}>
                    <span style={{ width: "135px", textAlign: "right", fontWeight: 700, color: row.label === "Disponible" ? "#16a34a" : row.label.includes("No dis") ? "#dc2626" : "#334155" }}>
                      {row.label}
                    </span>
                    <div style={{ width: "42px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={row.pct}
                        onChange={(e) => handleUpdateDisponibilidadRow(idx, "pct", Number(e.target.value) || 0)}
                        style={{
                          width: "30px",
                          background: "transparent",
                          border: "none",
                          textAlign: "right",
                          fontWeight: 800,
                          fontSize: "11px",
                          color: "#0f172a",
                          padding: 0,
                          outline: "none",
                        }}
                      />
                      <span style={{ fontSize: "10px", fontWeight: 800, color: "#64748b" }}>%</span>
                    </div>
                    <div style={{ width: "100px", background: "#f1f5f9", height: "22px", borderRadius: "3px", border: "1px solid #cbd5e1", display: "flex", alignItems: "center", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, row.pct)}%`, background: "#93c5fd" }} />
                      <input
                        type="number"
                        min="0"
                        value={row.val}
                        onChange={(e) => handleUpdateDisponibilidadRow(idx, "val", Number(e.target.value) || 0)}
                        style={{
                          position: "relative",
                          zIndex: 1,
                          width: "100%",
                          height: "100%",
                          background: "transparent",
                          border: "none",
                          outline: "none",
                          paddingLeft: "6px",
                          fontWeight: 900,
                          fontSize: "11.5px",
                          color: "#0f172a",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* COLUMNA 3: EVENTOS JUGADOR */}
            <div>
              <div style={{ textAlign: "center", fontWeight: 800, fontSize: "11px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "10px", borderBottom: "1.5px solid #0f172a", paddingBottom: "4px" }}>
                EVENTOS {(jugador?.nombre ? jugador.nombre.trim().split(" ")[0] : "DEPORTISTA")?.toString()?.toUpperCase()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {eventosJugador.map((row, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11.5px" }}>
                    <span style={{ width: "110px", textAlign: "right", fontWeight: 700, color: row.label.includes("Coad") || row.label.includes("Opti") ? "#ea580c" : row.label.includes("Partidos") ? "#dc2626" : "#334155" }}>
                      {row.label}
                    </span>
                    <div style={{ width: "42px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={row.pct}
                        onChange={(e) => handleUpdateEventosJugadorRow(idx, "pct", Number(e.target.value) || 0)}
                        style={{
                          width: "30px",
                          background: "transparent",
                          border: "none",
                          textAlign: "right",
                          fontWeight: 800,
                          fontSize: "11px",
                          color: "#0f172a",
                          padding: 0,
                          outline: "none",
                        }}
                      />
                      <span style={{ fontSize: "10px", fontWeight: 800, color: "#64748b" }}>%</span>
                    </div>
                    <div style={{ width: "110px", background: "#f1f5f9", height: "22px", borderRadius: "3px", border: "1px solid #cbd5e1", display: "flex", alignItems: "center", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, row.pct)}%`, background: "#93c5fd" }} />
                      <input
                        type="number"
                        min="0"
                        value={row.val}
                        onChange={(e) => handleUpdateEventosJugadorRow(idx, "val", Number(e.target.value) || 0)}
                        style={{
                          position: "relative",
                          zIndex: 1,
                          width: "100%",
                          height: "100%",
                          background: "transparent",
                          border: "none",
                          outline: "none",
                          paddingLeft: "6px",
                          fontWeight: 900,
                          fontSize: "11.5px",
                          color: "#0f172a",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "10px", alignItems: "center" }} className="no-print">
            <button
              type="button"
              onClick={handleRecalculateReportData}
              style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}
              title="Recalcular automáticamente desde el calendario de planificación"
            >
              ↻ Recalcular desde Planificación
            </button>
            <button
              type="button"
              onClick={() => {
                saveExtraData({ eventosEquipo, disponibilidadJugador, eventosJugador });
                alert("✓ Datos generales guardados con éxito.");
              }}
              style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
            >
              Guardar Datos Generales
            </button>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: FICHA CUALITATIVA */}
      {activeTab === "cualitativa" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div>
              <h3 style={{ fontSize: "14.5px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                Ficha Cualitativa — Evaluación Individual
              </h3>
              <p style={{ fontSize: "11.5px", color: "#64748b", margin: "2px 0 0" }}>
                Análisis cualitativo condicional, conductual y de hábitos realizado por el cuerpo técnico.
              </p>
            </div>
            <button
              type="button"
              onClick={() => saveExtraData({ cualitativa })}
              style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "5px 12px", borderRadius: "5px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}
            >
              Guardar Ficha Cualitativa
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ background: "#ffffff", padding: "14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
              <label style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", display: "block", marginBottom: "4px" }}>
                Perfil Físico / Condicional
              </label>
              <textarea
                value={cualitativa.fisico}
                onChange={(e) => setCualitativa({ ...cualitativa, fisico: e.target.value })}
                rows={3}
                style={{ width: "100%", padding: "6px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1", outline: "none", fontFamily: "inherit", lineHeight: 1.4 }}
                placeholder="Describe su perfil físico, capacidades condicionales y fortalezas..."
              />
            </div>

            <div style={{ background: "#ffffff", padding: "14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
              <label style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", display: "block", marginBottom: "4px" }}>
                Perfil Psicológico / Mental
              </label>
              <textarea
                value={cualitativa.psicologico}
                onChange={(e) => setCualitativa({ ...cualitativa, psicologico: e.target.value })}
                rows={3}
                style={{ width: "100%", padding: "6px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1", outline: "none", fontFamily: "inherit", lineHeight: 1.4 }}
                placeholder="Describe su actitud, mentalidad, liderazgo y gestión del estrés..."
              />
            </div>

            <div style={{ background: "#ffffff", padding: "14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
              <label style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", display: "block", marginBottom: "4px" }}>
                Hábitos y Estilo de Vida
              </label>
              <textarea
                value={cualitativa.habitos}
                onChange={(e) => setCualitativa({ ...cualitativa, habitos: e.target.value })}
                rows={3}
                style={{ width: "100%", padding: "6px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1", outline: "none", fontFamily: "inherit", lineHeight: 1.4 }}
                placeholder="Higiene del descanso, nutrición, puntualidad y rutinas de prevención..."
              />
            </div>

            <div style={{ background: "#ffffff", padding: "14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
              <label style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", display: "block", marginBottom: "4px" }}>
                Objetivos de Desarrollo Individual (IDI)
              </label>
              <textarea
                value={cualitativa.objetivos}
                onChange={(e) => setCualitativa({ ...cualitativa, objetivos: e.target.value })}
                rows={3}
                style={{ width: "100%", padding: "6px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1", outline: "none", fontFamily: "inherit", lineHeight: 1.4 }}
                placeholder="Objetivos a trabajar con el cuerpo técnico..."
              />
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 4: DATOS FÍSICOS Y TESTS (GPS ARRIBA, GRÁFICO PESO vs PLIEGUES ABAJO) */}
      {activeTab === "fisicos_tests" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* ══════════════════════════════════════════════════════════════ */}
          {/* SECCIÓN A: PERFIL COMPETITIVO INDIVIDUAL (BENCHMARK 100% MATCH EN UNA SOLA LÍNEA) */}
          {(() => {
            const cp = playerCompProfile;
            const isReal = cp?.isReal || false;
            const is45 = cp?.category === "estimado_45";
            const isCopied = cp?.category === "copiado_posicion";
            const isGK = cp?.category === "sin_perfil";

            let methodBadgeBg = "#f1f5f9";
            let methodBadgeColor = "#334155";
            let methodBorder = "#cbd5e1";

            if (isReal) {
              methodBadgeBg = "#dcfce7";
              methodBadgeColor = "#15803d";
              methodBorder = "#86efac";
            } else if (is45) {
              methodBadgeBg = "#fef3c7";
              methodBadgeColor = "#b45309";
              methodBorder = "#fde047";
            } else if (isCopied) {
              methodBadgeBg = "#ffedd5";
              methodBadgeColor = "#c2410c";
              methodBorder = "#fdba74";
            }

            // Lista de métricas a mostrar según las variables elegidas por el usuario
            const validDerivedSet = new Set(derivedVariables.map((d) => d.id));
            const displayMetrics = playerCompVariables
              .filter((k) => k !== "derived_1791992159697" && k !== "derived_undefined" && (!k.startsWith("derived_") || validDerivedSet.has(k)))
              .map((k) => {
              const fav = favoriteVariables.find((v) => v.key === k) || ALL_GPS_VARIABLES.find((v) => v.key === k);
              const label = getCompactMetricHeader(k, fav?.label);
              const unit = fav?.unit || (k === "Distance(m)" || k.includes("(m)") ? "m" : k.includes("Speed") ? "km/h" : k.includes("Min") ? "m/min" : k.includes("Load") ? "AU" : "cnt");
              const isOverridden = compProfileOverrides[jugador.id]?.[k] !== undefined;

              let rawVal = cp?.values?.[k];
              if (rawVal === undefined || rawVal === null) {
                if (k === "Distance(m)") rawVal = cp?.dist;
                else if (k === "Distancia / Min") rawVal = cp?.mMin;
                else if (k === "Distance +21 (m)") rawVal = cp?.hsr;
                else if (k === "Acc+Dec") rawVal = cp?.accDec;
                else if (k === "Player Load") rawVal = cp?.load;
                else if (k === "MAX Speed(km/h)") rawVal = cp?.maxSpeed;
              }
              const ratio = playerTargetRatios[k] !== undefined ? playerTargetRatios[k] : 1.0;
              const targetVal = rawVal !== undefined && rawVal !== null && typeof rawVal === "number" ? (k.includes("Min") || k.includes("Speed") ? Math.round(rawVal * ratio * 10) / 10 : Math.round(rawVal * ratio)) : null;

              return {
                key: k,
                label,
                unit,
                rawVal,
                ratio,
                targetVal,
                isOverridden,
              };
            });

            return (
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "10px",
                  border: "1.5px solid #cbd5e1",
                  padding: "16px 18px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {/* ── FILA SUPERIOR: TÍTULO, MÉTODO, ESTADO EN LÍNEA Y CONTROLES ── */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "16px" }}>🏆</span>
                    <strong style={{ fontSize: "14px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      Perfil Competitivo (100% Match)
                    </strong>
                    <span
                      style={{
                        background: methodBadgeBg,
                        color: methodBadgeColor,
                        border: `1px solid ${methodBorder}`,
                        fontSize: "11px",
                        fontWeight: 800,
                        padding: "2px 8px",
                        borderRadius: "5px",
                      }}
                    >
                      {cp?.badgeText || "Sin Perfil"}
                    </span>
                    <span style={{ fontSize: "11.5px", color: isReal ? "#166534" : is45 ? "#854d0e" : isCopied ? "#9a3412" : "#64748b", fontWeight: 600 }}>
                      • {cp?.detailText || "Actualizado automáticamente con cada partido"}
                    </span>
                  </div>

                  {/* CONTROLES DERECHA: PRESETS DE RATIO, AÑADIR VARIABLE Y PARTIDOS */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    {/* Presets Rápidos de Ratio */}
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "3px", background: "#f8fafc", padding: "2px 4px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#64748b", marginRight: "2px" }}>Ratio:</span>
                      {[
                        { label: "1.0x (100%)", val: 1.0 },
                        { label: "1.1x (+10%)", val: 1.1 },
                        { label: "1.2x (+20%)", val: 1.2 },
                        { label: "0.8x (-20%)", val: 0.8 },
                      ].map((preset) => (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => handleSetAllRatios(preset.val)}
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            border: "none",
                            background: "transparent",
                            color: "#0369a1",
                            fontSize: "10px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                          title={`Fijar ratio ${preset.label} en todas las variables`}
                        >
                          {preset.val}x
                        </button>
                      ))}
                    </div>

                    {/* Selector discreto y elegante de Variable HSRI Individual */}
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        background: "#f8fafc",
                        padding: "2px 6px",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0",
                      }}
                      title={`Variable asignada como métrica HSRI individual para ${jugador.apodo || jugador.nombre}`}
                    >
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b" }}>HSRI:</span>
                      <select
                        value={hsriVariableKey}
                        onChange={(e) => handleAssignHsriVariable(e.target.value)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#334155",
                          fontSize: "10.5px",
                          fontWeight: 700,
                          cursor: "pointer",
                          outline: "none",
                          maxWidth: "130px",
                        }}
                      >
                        {derivedVariables.length > 0 && (
                          <optgroup label="Tus Variables Derivadas">
                            {derivedVariables.map((d) => (
                              <option key={d.id} value={d.id}>
                                ⭐ {d.label}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Velocidad e Intensidad (GPS)">
                          {allVariables
                            .filter((v) => !v.esDerivada && (v.categoria === "Velocidad e Intensidad" || v.key.includes("Distance +") || v.key.includes("km/h")))
                            .map((v) => (
                              <option key={v.key} value={v.key}>
                                {v.label}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="Otras Variables GPS">
                          {allVariables
                            .filter((v) => !v.esDerivada && v.categoria !== "Velocidad e Intensidad" && !v.key.includes("Distance +") && !v.key.includes("km/h"))
                            .map((v) => (
                              <option key={v.key} value={v.key}>
                                {v.label}
                              </option>
                            ))}
                        </optgroup>
                      </select>

                      {!playerCompVariables.includes(hsriVariableKey) && (
                        <button
                          type="button"
                          onClick={() => handleAddVariable(hsriVariableKey)}
                          style={{
                            border: "none",
                            background: "#e2e8f0",
                            color: "#475569",
                            fontSize: "9.5px",
                            fontWeight: 700,
                            borderRadius: "3px",
                            padding: "1px 4px",
                            cursor: "pointer",
                          }}
                          title="Añadir esta variable HSRI a la fila de variables"
                        >
                          + fila
                        </button>
                      )}
                    </div>

                    {/* Botón Guardar Ratios Individuales */}
                    <button
                      type="button"
                      onClick={() => handleSavePlayerRatios()}
                      disabled={isSavingRatios}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "3px 10px",
                        borderRadius: "6px",
                        border: ratiosSavedMessage ? "1px solid #059669" : "1px solid #0284c7",
                        background: ratiosSavedMessage ? "#ecfdf5" : isSavingRatios ? "#e0f2fe" : "#0284c7",
                        color: ratiosSavedMessage ? "#065f46" : isSavingRatios ? "#0369a1" : "#ffffff",
                        fontSize: "11px",
                        fontWeight: 800,
                        cursor: isSavingRatios ? "wait" : "pointer",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                        transition: "all 0.15s ease",
                      }}
                      title={`Guardar permanentemente en la base de datos los ratios de ${jugador.apodo || jugador.nombre} para cada variable`}
                    >
                      <span>
                        {ratiosSavedMessage ? "✓ Guardado en Supabase" : isSavingRatios ? "Guardando en Supabase..." : "💾 Guardar Ratios en Supabase"}
                      </span>
                    </button>

                    {/* Selector de Variables según Mis Favoritas */}
                    <div style={{ position: "relative" }}>
                      <button
                        type="button"
                        onClick={() => setShowAddVarDropdown((prev) => !prev)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          border: showAddVarDropdown ? "1.5px solid #2563eb" : "1px solid #cbd5e1",
                          background: showAddVarDropdown ? "#eff6ff" : "#ffffff",
                          color: showAddVarDropdown ? "#1e40af" : "#0f172a",
                          fontSize: "11px",
                          fontWeight: 800,
                          cursor: "pointer",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span>⭐ Variables Favoritas ({playerCompVariables.length})</span>
                        <span style={{ fontSize: "9px" }}>{showAddVarDropdown ? "▲" : "▼"}</span>
                      </button>

                      {showAddVarDropdown && (
                        <div
                          style={{
                            position: "absolute",
                            right: 0,
                            top: "calc(100% + 5px)",
                            zIndex: 60,
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: "8px",
                            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)",
                            padding: "12px",
                            width: "295px",
                            maxHeight: "380px",
                            overflowY: "auto",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                          }}
                        >
                          {/* Cabecera del selector */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px" }}>
                            <div>
                              <strong style={{ fontSize: "12px", color: "#0f172a", display: "block" }}>Tus Variables Favoritas</strong>
                              <span style={{ fontSize: "9.5px", color: "#64748b" }}>{playerCompVariables.length} activas en la fila</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowAddVarDropdown(false)}
                              style={{ border: "none", background: "#f1f5f9", borderRadius: "4px", padding: "1px 6px", fontSize: "11px", cursor: "pointer", color: "#64748b", fontWeight: 700 }}
                            >
                              ✕
                            </button>
                          </div>

                          {/* Presets Rápidos */}
                          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => handleSetPresetVariables(availableFavVariables.map((v) => v.key))}
                              style={{
                                flex: "1 1 auto",
                                padding: "4px 8px",
                                borderRadius: "5px",
                                border: "1px solid #bfdbfe",
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                fontSize: "10px",
                                fontWeight: 800,
                                cursor: "pointer",
                                textAlign: "center",
                              }}
                              title="Activar todas tus variables favoritas"
                            >
                              ⭐ Todas mis Favoritas
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetPresetVariables(["Distance(m)", "Distancia / Min", "Distance +21 (m)", "Acc+Dec", "Player Load", "MAX Speed(km/h)"])}
                              style={{
                                flex: "1 1 auto",
                                padding: "4px 8px",
                                borderRadius: "5px",
                                border: "1px solid #e2e8f0",
                                background: "#f8fafc",
                                color: "#334155",
                                fontSize: "10px",
                                fontWeight: 800,
                                cursor: "pointer",
                                textAlign: "center",
                              }}
                              title="Activar las 6 variables favoritas recomendadas (DT, m/min, HSR, Acc-Dec, Load, Vmax)"
                            >
                              Top 6 Favoritas
                            </button>
                          </div>

                          {/* Lista con Checkboxes de Mis Variables Favoritas */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                              Mis Variables Favoritas:
                            </div>
                            {availableFavVariables.map((v) => {
                              const isSelected = playerCompVariables.includes(v.key);
                              const compact = getCompactMetricHeader(v.key, v.label);
                              return (
                                <label
                                  key={v.key}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleToggleVariable(v.key);
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "6px 8px",
                                    borderRadius: "5px",
                                    background: isSelected ? "#f0fdf4" : "transparent",
                                    border: `1px solid ${isSelected ? "#bbf7d0" : "#f1f5f9"}`,
                                    cursor: "pointer",
                                    transition: "all 0.1s ease",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {}}
                                      style={{ cursor: "pointer", accentColor: "#16a34a" }}
                                    />
                                    <span style={{ fontSize: "11px", fontWeight: isSelected ? 800 : 600, color: isSelected ? "#15803d" : "#1e293b" }}>
                                      {compact} — {v.label}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600 }}>({v.unit})</span>
                                </label>
                              );
                            })}
                          </div>

                          {/* Sección Opcional: Otras Variables de la BBDD */}
                          {(() => {
                            const otherVars = ALL_GPS_VARIABLES.filter(
                              (v) => !availableFavVariables.some((fav) => fav.key === v.key) && v.key !== "Duration(min)"
                            );
                            if (otherVars.length === 0) return null;
                            return (
                              <details style={{ borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
                                <summary style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", cursor: "pointer", userSelect: "none" }}>
                                  + Ver otras variables ({otherVars.length})
                                </summary>
                                <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "5px" }}>
                                  {otherVars.map((v) => {
                                    const isSelected = playerCompVariables.includes(v.key);
                                    const compact = getCompactMetricHeader(v.key, v.label);
                                    return (
                                      <label
                                        key={v.key}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          handleToggleVariable(v.key);
                                        }}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          padding: "4px 6px",
                                          borderRadius: "4px",
                                          background: isSelected ? "#eff6ff" : "transparent",
                                          border: `1px solid ${isSelected ? "#bfdbfe" : "#f8fafc"}`,
                                          cursor: "pointer",
                                        }}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => {}}
                                            style={{ cursor: "pointer", accentColor: "#2563eb" }}
                                          />
                                          <span style={{ fontSize: "10.5px", color: isSelected ? "#1d4ed8" : "#475569", fontWeight: isSelected ? 700 : 500 }}>
                                            {compact} — {v.label}
                                          </span>
                                        </div>
                                        <span style={{ fontSize: "9px", color: "#94a3b8" }}>({v.unit})</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </details>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Botón Ver Partidos */}
                    <button
                      type="button"
                      onClick={() => setShowCompMatchesDetail((prev) => !prev)}
                      style={{
                        padding: "4px 9px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: showCompMatchesDetail ? "#f1f5f9" : "#ffffff",
                        color: "#475569",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {showCompMatchesDetail ? "Ocultar Partidos ▲" : `Partidos (${cp?.analyzedMatches?.length || 0}) ▼`}
                    </button>
                  </div>
                </div>

                {/* ── FILA ÚNICA HORIZONTAL CON TODAS LAS VARIABLES (DISEÑADA PARA 6 VARIABLES EN 1 LÍNEA) ── */}
                <div
                  style={{
                    display: "flex",
                    overflowX: "auto",
                    gap: "6px",
                    alignItems: "stretch",
                    paddingBottom: "2px",
                  }}
                >
                  {displayMetrics.map((m) => {
                    const suffix = cp?.asterisk || "";
                    const displayRaw =
                      m.rawVal !== undefined && m.rawVal !== null
                        ? typeof m.rawVal === "number"
                          ? m.rawVal % 1 !== 0
                            ? m.rawVal.toFixed(1)
                            : m.rawVal.toLocaleString()
                          : m.rawVal
                        : "—";

                    const displayTarget =
                      m.targetVal !== undefined && m.targetVal !== null
                        ? typeof m.targetVal === "number"
                          ? m.targetVal % 1 !== 0
                            ? m.targetVal.toFixed(1)
                            : m.targetVal.toLocaleString()
                          : m.targetVal
                        : "—";

                    return (
                      <div
                        key={m.key}
                        style={{
                          minWidth: "115px",
                          flex: "1 1 0px",
                          background: m.isOverridden ? "#fffdf5" : "#f8fafc",
                          borderRadius: "8px",
                          border: `1px solid ${m.isOverridden ? "#fcd34d" : "#e2e8f0"}`,
                          padding: "7px 8px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                          position: "relative",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                        }}
                      >
                        {/* Cabecera de la columna con nombre, unidad y botones de acción */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "2px", minWidth: 0 }}>
                            <strong
                              style={{
                                fontSize: "11.5px",
                                color: "#1e293b",
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title={m.label}
                            >
                              {m.label}
                            </strong>
                            <span style={{ fontSize: "8.5px", color: "#94a3b8" }}>({m.unit})</span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "1.5px", flexShrink: 0 }}>
                            {/* Botón Explicación Matemática */}
                            <button
                              type="button"
                              onClick={() => setSelectedExplanationKey(m.key)}
                              style={{
                                border: "none",
                                background: "#eff6ff",
                                color: "#2563eb",
                                fontSize: "9.5px",
                                cursor: "pointer",
                                padding: "1px 3px",
                                borderRadius: "3px",
                                fontWeight: 800,
                              }}
                              title={`Ver explicación matemática detallada de cómo se calculó ${m.label}`}
                            >
                              ℹ️
                            </button>

                            {/* Botón Modificar Benchmark */}
                            <button
                              type="button"
                              onClick={() => handleModifyMetric(m.key)}
                              style={{
                                border: "none",
                                background: m.isOverridden ? "#fef3c7" : "#f1f5f9",
                                color: m.isOverridden ? "#b45309" : "#475569",
                                fontSize: "9.5px",
                                cursor: "pointer",
                                padding: "1px 3px",
                                borderRadius: "3px",
                                fontWeight: 800,
                              }}
                              title={`Modificar manualmente el benchmark de ${m.label}`}
                            >
                              ✏️
                            </button>

                            {/* Botón Restablecer si está editado manual */}
                            {m.isOverridden && (
                              <button
                                type="button"
                                onClick={() => handleResetMetric(m.key)}
                                style={{
                                  border: "none",
                                  background: "#fee2e2",
                                  color: "#dc2626",
                                  fontSize: "9px",
                                  cursor: "pointer",
                                  padding: "1px 3px",
                                  borderRadius: "3px",
                                  fontWeight: 900,
                                }}
                                title="Restablecer valor al cálculo automático oficial"
                              >
                                ↺
                              </button>
                            )}

                            {/* Botón Quitar Variable */}
                            {playerCompVariables.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveVariable(m.key)}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "#94a3b8",
                                  fontSize: "10.5px",
                                  cursor: "pointer",
                                  padding: "0 1px",
                                }}
                                title={`Quitar ${m.label} de la fila`}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Benchmark 100% Partido */}
                        <div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ fontSize: "9.5px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
                              100% Partido
                            </div>
                            {m.isOverridden && (
                              <span style={{ fontSize: "8.5px", fontWeight: 800, color: "#b45309", background: "#fef3c7", padding: "1px 4px", borderRadius: "3px" }}>
                                Manual
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "2px", marginTop: "1px" }}>
                            <span style={{ fontSize: "15px", fontWeight: 900, color: m.isOverridden ? "#b45309" : "#0f172a" }}>
                              {displayRaw}
                            </span>
                            {suffix && displayRaw !== "—" && !m.isOverridden && (
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: 900,
                                  color: is45 ? "#b45309" : "#c2410c",
                                }}
                                title={is45 ? "Estimado 45x2*" : "Copiado Posición**"}
                              >
                                {suffix}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Selector de Ratio de Trabajo */}
                        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px" }}>
                            <span style={{ fontSize: "9.5px", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
                              Ratio Trabajo:
                            </span>
                            <span style={{ fontSize: "10px", fontWeight: 800, color: m.ratio > 1.0 ? "#0369a1" : m.ratio < 1.0 ? "#d97706" : "#166534" }}>
                              {Math.round(m.ratio * 100)}%
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                            <button
                              type="button"
                              onClick={() => handleUpdateRatio(m.key, m.ratio - 0.05)}
                              style={{
                                width: "16px",
                                height: "18px",
                                padding: 0,
                                borderRadius: "3px",
                                border: "1px solid #cbd5e1",
                                background: "#ffffff",
                                fontSize: "10px",
                                fontWeight: 800,
                                cursor: "pointer",
                                color: "#475569",
                              }}
                            >
                              -
                            </button>

                            <input
                              type="number"
                              step="0.05"
                              min="0.1"
                              max="5.0"
                              value={m.ratio}
                              onChange={(e) => handleUpdateRatio(m.key, parseFloat(e.target.value))}
                              style={{
                                width: "100%",
                                padding: "1px 2px",
                                borderRadius: "3px",
                                border: "1px solid #cbd5e1",
                                fontSize: "11px",
                                fontWeight: 800,
                                textAlign: "center",
                                color: "#0f172a",
                                background: "#ffffff",
                                outline: "none",
                              }}
                            />

                            <button
                              type="button"
                              onClick={() => handleUpdateRatio(m.key, m.ratio + 0.05)}
                              style={{
                                width: "16px",
                                height: "18px",
                                padding: 0,
                                borderRadius: "3px",
                                border: "1px solid #cbd5e1",
                                background: "#ffffff",
                                fontSize: "10px",
                                fontWeight: 800,
                                cursor: "pointer",
                                color: "#475569",
                              }}
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Carga Objetivo Calculada */}
                        <div
                          style={{
                            background: m.ratio !== 1.0 ? "#eff6ff" : "#f1f5f9",
                            borderRadius: "4px",
                            padding: "3px 5px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginTop: "auto",
                          }}
                        >
                          <span style={{ fontSize: "8.5px", fontWeight: 700, color: "#64748b" }}>🎯 Obj:</span>
                          <span style={{ fontSize: "10.5px", fontWeight: 900, color: m.ratio !== 1.0 ? "#1d4ed8" : "#334155" }}>
                            {displayTarget} {m.unit}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── DESGLOSE DESPLEGABLE DE PARTIDOS ANALIZADOS CON TODAS LAS VARIABLES ACTIVAS ── */}
                {showCompMatchesDetail && (
                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ fontSize: "11.5px", fontWeight: 800, color: "#334155" }}>
                      Partidos Oficiales Computados ({cp?.analyzedMatches?.length || 0}) — Desglose de Todas las Variables
                    </div>
                    {cp?.analyzedMatches && cp.analyzedMatches.length > 0 ? (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", color: "#0f172a" }}>
                          <thead>
                            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #cbd5e1", textAlign: "left", color: "#64748b" }}>
                              <th style={{ padding: "5px 8px" }}>Fecha</th>
                              <th style={{ padding: "5px 8px", textAlign: "center" }}>Minutos</th>
                              <th style={{ padding: "5px 8px" }}>Partes Disputadas</th>
                              {displayMetrics.map((dm) => (
                                <th key={dm.key} style={{ padding: "5px 8px", textAlign: "right", color: "#1e293b", fontWeight: 800 }}>
                                  {dm.label} ({dm.unit})
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {cp.analyzedMatches.map((m, mIdx) => (
                              <tr key={m.fecha || mIdx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ padding: "5px 8px", fontWeight: 700 }}>{m.fecha}</td>
                                <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: 800 }}>{m.minutos}'</td>
                                <td style={{ padding: "5px 8px" }}>
                                  <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                                    {m.parts?.map((pPart, pIdx) => (
                                      <span
                                        key={pIdx}
                                        style={{
                                          padding: "1px 5px",
                                          borderRadius: "3px",
                                          background: "#eff6ff",
                                          color: "#1e40af",
                                          fontSize: "9.5px",
                                          fontWeight: 700,
                                        }}
                                      >
                                        {pPart.nombre} ({pPart.minutos}' • {pPart.dist}m)
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                {displayMetrics.map((dm) => {
                                  let matchVal: number;
                                  if (dm.key === "Distancia / Min" || dm.key.toLowerCase().includes("m/min")) {
                                    matchVal = m.minutos > 0 ? Math.round((m.dist / m.minutos) * 10) / 10 : 0;
                                  } else if (isRateOrPeak(dm.key)) {
                                    const partVals = m.parts.map((p) => calculateGpsMetricValue(p.rawTask, dm.key, derivedVariables));
                                    matchVal = Math.round(Math.max(...partVals) * 10) / 10;
                                  } else {
                                    const sumVal = m.parts.reduce((acc, p) => acc + calculateGpsMetricValue(p.rawTask, dm.key, derivedVariables), 0);
                                    matchVal = Math.round(sumVal);
                                  }
                                  return (
                                    <td key={dm.key} style={{ padding: "5px 8px", textAlign: "right", fontWeight: 800 }}>
                                      {matchVal !== undefined && !isNaN(matchVal) ? matchVal.toLocaleString() : "—"}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic" }}>
                        Este jugador no tiene tareas oficiales de 1ª o 2ª parte de partido registradas.
                      </div>
                    )}
                  </div>
                )}

                {/* ── MODAL DE EXPLICACIÓN MATEMÁTICA PASO A PASO POR VARIABLE ── */}
                {selectedExplanationKey && (() => {
                  const exp = cp?.explanations?.[selectedExplanationKey];
                  const fav = favoriteVariables.find((v) => v.key === selectedExplanationKey) || ALL_GPS_VARIABLES.find((v) => v.key === selectedExplanationKey);
                  const metricLabel = fav?.label || selectedExplanationKey;
                  const compactLabel = getCompactMetricHeader(selectedExplanationKey, fav?.label);
                  const unit = fav?.unit || exp?.unit || "";

                  return (
                    <div
                      style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(15, 23, 42, 0.65)",
                        backdropFilter: "blur(4px)",
                        zIndex: 99999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "20px",
                      }}
                      onClick={() => setSelectedExplanationKey(null)}
                    >
                      <div
                        style={{
                          background: "#ffffff",
                          borderRadius: "12px",
                          maxWidth: "680px",
                          width: "100%",
                          maxHeight: "90vh",
                          overflowY: "auto",
                          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                          border: "1px solid #cbd5e1",
                          display: "flex",
                          flexDirection: "column",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Cabecera del modal */}
                        <div
                          style={{
                            padding: "16px 20px",
                            borderBottom: "1px solid #e2e8f0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            background: "#f8fafc",
                            borderTopLeftRadius: "12px",
                            borderTopRightRadius: "12px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "20px" }}>ℹ️</span>
                            <div>
                              <div style={{ fontSize: "14.5px", fontWeight: 900, color: "#0f172a" }}>
                                Explicación de Cálculo — {compactLabel} ({metricLabel})
                              </div>
                              <div style={{ fontSize: "11px", color: "#64748b" }}>
                                Deportista: <strong>{jugador.apodo || jugador.nombre}</strong> ({jugador.posicion || "Jugador"})
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedExplanationKey(null)}
                            style={{
                              border: "none",
                              background: "#e2e8f0",
                              color: "#475569",
                              borderRadius: "50%",
                              width: "28px",
                              height: "28px",
                              fontSize: "14px",
                              fontWeight: 800,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            ✕
                          </button>
                        </div>

                        {/* Contenido del modal */}
                        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                          {/* Tarjeta de Resumen y Fórmula */}
                          <div
                            style={{
                              background: exp?.isOverridden ? "#fffbeb" : "#f0fdf4",
                              border: `1.5px solid ${exp?.isOverridden ? "#fcd34d" : "#86efac"}`,
                              borderRadius: "10px",
                              padding: "14px 16px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 800,
                                  textTransform: "uppercase",
                                  color: exp?.isOverridden ? "#92400e" : "#166534",
                                  letterSpacing: "0.03em",
                                }}
                              >
                                {exp?.isOverridden ? "✏️ Valor Ajustado Manualmente" : "🏆 Método Oficial Aplicado"}
                              </span>
                              <span
                                style={{
                                  fontSize: "11.5px",
                                  fontWeight: 800,
                                  padding: "2px 8px",
                                  borderRadius: "5px",
                                  background: exp?.isOverridden ? "#fef3c7" : methodBadgeBg,
                                  color: exp?.isOverridden ? "#b45309" : methodBadgeColor,
                                  border: `1px solid ${exp?.isOverridden ? "#fde047" : methodBorder}`,
                                }}
                              >
                                {exp?.isOverridden ? "Manual" : cp?.badgeText}
                              </span>
                            </div>

                            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                              <span style={{ fontSize: "28px", fontWeight: 900, color: "#0f172a" }}>
                                {exp?.finalVal !== null && exp?.finalVal !== undefined ? exp.finalVal.toLocaleString() : "—"}
                              </span>
                              <span style={{ fontSize: "14px", fontWeight: 800, color: "#64748b" }}>{unit}</span>
                            </div>

                            <div
                              style={{
                                background: "#ffffff",
                                padding: "8px 12px",
                                borderRadius: "6px",
                                border: "1px dashed #cbd5e1",
                                fontSize: "12px",
                                fontFamily: "monospace",
                                color: "#1e293b",
                                fontWeight: 700,
                              }}
                            >
                              Fórmula: {exp?.formula || "—"}
                            </div>

                            {exp?.summary && (
                              <div style={{ fontSize: "11.5px", color: "#475569", lineHeight: 1.4 }}>
                                {exp.summary}
                              </div>
                            )}
                          </div>

                          {/* Pasos de Cálculo Detallados */}
                          {exp?.steps && exp.steps.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <strong style={{ fontSize: "12.5px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                Desglose Paso a Paso:
                              </strong>
                              <div
                                style={{
                                  background: "#f8fafc",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "8px",
                                  padding: "12px 14px",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "6px",
                                }}
                              >
                                {exp.steps.map((st, sIdx) => (
                                  <div key={sIdx} style={{ fontSize: "11.5px", color: "#334155", lineHeight: 1.45 }}>
                                    {st}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Desglose de Partidos Oficiales Computados */}
                          {exp?.matches && exp.matches.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <strong style={{ fontSize: "12.5px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                Partidos Oficiales Computados para esta Variable:
                              </strong>
                              <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", color: "#0f172a" }}>
                                  <thead>
                                    <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1", textAlign: "left", color: "#475569" }}>
                                      <th style={{ padding: "6px 10px" }}>Fecha</th>
                                      <th style={{ padding: "6px 10px", textAlign: "center" }}>Minutos</th>
                                      <th style={{ padding: "6px 10px" }}>Partes Analizadas</th>
                                      <th style={{ padding: "6px 10px", textAlign: "right" }}>Valor Registrado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {exp.matches.map((m, mIdx) => (
                                      <tr key={mIdx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                        <td style={{ padding: "6px 10px", fontWeight: 700 }}>{m.fecha}</td>
                                        <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 800 }}>{m.minutos}'</td>
                                        <td style={{ padding: "6px 10px" }}>
                                          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                                            {m.partes.map((p, pIdx) => (
                                              <span
                                                key={pIdx}
                                                style={{
                                                  background: "#eff6ff",
                                                  color: "#1d4ed8",
                                                  padding: "2px 6px",
                                                  borderRadius: "4px",
                                                  fontSize: "10px",
                                                  fontWeight: 700,
                                                }}
                                              >
                                                {p.nombre} ({p.minutos}'): {p.val.toLocaleString()} {unit}
                                              </span>
                                            ))}
                                          </div>
                                        </td>
                                        <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 900, color: "#0f172a" }}>
                                          {m.totalMatchVal.toLocaleString()} {unit}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Desglose de Compañeros de Posición (si fue copiado) */}
                          {exp?.peers && exp.peers.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <strong style={{ fontSize: "12.5px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                Compañeros de Posición ({jugador.posicion || "Misma Demarcación"}):
                              </strong>
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                {exp.peers.map((peer, pIdx) => (
                                  <div
                                    key={pIdx}
                                    style={{
                                      background: "#fff7ed",
                                      border: "1px solid #fdba74",
                                      padding: "6px 10px",
                                      borderRadius: "6px",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      fontSize: "11px",
                                    }}
                                  >
                                    <span style={{ fontWeight: 800, color: "#9a3412" }}>{peer.apodo}:</span>
                                    <strong style={{ color: "#0f172a" }}>{peer.val.toLocaleString()} {unit}</strong>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Pie del modal con acciones */}
                        <div
                          style={{
                            padding: "12px 20px",
                            borderTop: "1px solid #e2e8f0",
                            background: "#f8fafc",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderBottomLeftRadius: "12px",
                            borderBottomRightRadius: "12px",
                            flexWrap: "wrap",
                            gap: "8px",
                          }}
                        >
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              onClick={() => {
                                handleModifyMetric(selectedExplanationKey);
                              }}
                              style={{
                                padding: "5px 12px",
                                borderRadius: "6px",
                                border: "1px solid #cbd5e1",
                                background: "#ffffff",
                                color: "#1e3a8a",
                                fontSize: "11.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              ✏️ Modificar este Valor Manualmente
                            </button>

                            {exp?.isOverridden && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleResetMetric(selectedExplanationKey);
                                }}
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: "6px",
                                  border: "1px solid #fecaca",
                                  background: "#fef2f2",
                                  color: "#dc2626",
                                  fontSize: "11.5px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                ↺ Restablecer al Cálculo Oficial
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => setSelectedExplanationKey(null)}
                            style={{
                              padding: "5px 14px",
                              borderRadius: "6px",
                              border: "none",
                              background: "#0f172a",
                              color: "#ffffff",
                              fontSize: "11.5px",
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            Cerrar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
          
          {/* ══════════════════════════════════════════════════════════════ */}
          {/* 1. PERFIL GPS REAL POR MATCH DAY (MD) SEGÚN VARIABLES ELEGIDAS */}
          {/* ══════════════════════════════════════════════════════════════ */}

                    {/* ══════════════════════════════════════════════════════════════ */}
          {/* TABLA PRINCIPAL DE DATOS GPS POR MATCH DAY                    */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div style={{ background: "#ffffff", padding: "16px 20px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
            {/* CABECERA CON TÍTULO Y SUBTÍTULO */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "16px" }}>📊</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900, fontSize: "13.5px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      DATOS GPS POR MATCH DAY (MD) — {gpsSubjectMode === "jugador" ? "PERFIL JUGADOR" : "MEDIA DEL EQUIPO"} — {gpsProfileMode === "promedio" ? (gpsSubjectMode === "jugador" ? "PERFIL PROMEDIO (SIN MÁXIMA)" : "PROMEDIO DE EQUIPO") : gpsProfileMode === "maximos" ? "PERFIL MÁXIMOS" : "PERFIL COMPETITIVO ((MÁX + PROM SIN MÁX)/2)"}
                    </div>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 800,
                        padding: "2px 7px",
                        borderRadius: "4px",
                        background: gpsDataSourceMode === "reales" ? "#f0fdf4" : "#faf5ff",
                        color: gpsDataSourceMode === "reales" ? "#16a34a" : "#7e22ce",
                        border: `1px solid ${gpsDataSourceMode === "reales" ? "#bbf7d0" : "#e9d5ff"}`,
                        textTransform: "none",
                      }}
                    >
                      {gpsDataSourceMode === "reales" ? "🟢 Solo Reales" : "🧪 Reales + Simulados"}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                  • Calculado a partir de {matrixFilteredGpsRecords.length} sesiones ({gpsDataSourceMode === "reales" ? "Solo Reales" : "Reales + Simulados"}) · {gpsSubjectMode === "jugador" ? `👤 ${jugador.apodo || jugador.nombre}` : "👥 Media de Plantilla (Equipo)"} · {gpsMicrocycleTypeFilter === "todos" ? "🌐 Todos los microciclos" : MICROCICLE_TYPE_CONFIG[gpsMicrocycleTypeFilter]?.shortLabel} ({relevantMicrocyclesForCurrentFilter.filter((m) => isWeekActive(m.id)).length} de {relevantMicrocyclesForCurrentFilter.length} semanas activas)
                </div>
              </div>

              {/* CONTROLES: 3 BOTONES DE MODO DE PERFIL */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }} className="no-print">
                <button
                  type="button"
                  onClick={() => setGpsProfileMode("promedio")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    fontSize: "11px",
                    fontWeight: 800,
                    cursor: "pointer",
                    background: gpsProfileMode === "promedio" ? "#1e3a8a" : "#ffffff",
                    color: gpsProfileMode === "promedio" ? "#ffffff" : "#475569",
                    boxShadow: gpsProfileMode === "promedio" ? "0 1px 3px rgba(30,58,138,0.2)" : "none",
                    transition: "all 0.15s ease",
                  }}
                  title="Promedio real de las sesiones excluyendo la máxima"
                >
                  Promedio (sin máx)
                </button>
                <button
                  type="button"
                  onClick={() => setGpsProfileMode("maximos")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    fontSize: "11px",
                    fontWeight: 800,
                    cursor: "pointer",
                    background: gpsProfileMode === "maximos" ? "#c2410c" : "#ffffff",
                    color: gpsProfileMode === "maximos" ? "#ffffff" : "#475569",
                    boxShadow: gpsProfileMode === "maximos" ? "0 1px 3px rgba(194,65,12,0.2)" : "none",
                    transition: "all 0.15s ease",
                  }}
                  title="Mostrar máximos picos reales por cada día de partido (MD)"
                >
                  Perfil Máximos
                </button>
                <button
                  type="button"
                  onClick={() => setGpsProfileMode("competitivo")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    fontSize: "11px",
                    fontWeight: 800,
                    cursor: "pointer",
                    background: gpsProfileMode === "competitivo" ? "#7e22ce" : "#ffffff",
                    color: gpsProfileMode === "competitivo" ? "#ffffff" : "#475569",
                    boxShadow: gpsProfileMode === "competitivo" ? "0 1px 3px rgba(126,34,206,0.2)" : "none",
                    transition: "all 0.15s ease",
                  }}
                  title="Perfil Competitivo: (Máxima + Promedio sin máxima) / 2"
                >
                  Perfil Competitivo ((Máx+Prom sin máx)/2)
                </button>
                <button
                  type="button"
                  onClick={() => setShowTotalColumn(!showTotalColumn)}
                  style={{
                    padding: "4px 9px",
                    borderRadius: "5px",
                    border: showTotalColumn ? "1px solid #0284c7" : "1px solid #cbd5e1",
                    fontSize: "11px",
                    fontWeight: 800,
                    cursor: "pointer",
                    background: showTotalColumn ? "#eff6ff" : "#ffffff",
                    color: showTotalColumn ? "#0369a1" : "#64748b",
                    boxShadow: showTotalColumn ? "0 1px 3px rgba(2,132,199,0.15)" : "none",
                    transition: "all 0.15s ease",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  title="Añadir u ocultar la columna de Total y Ratio alcanzado respecto al partido"
                >
                  <span>📊</span>
                  <span>Columna Total {showTotalColumn ? "(Activa)" : "(Oculta)"}</span>
                </button>
              </div>
            </div>

            {/* BARRA DE FILTROS: SUJETO (JUGADOR / EQUIPO) + TIPOS DE MICROCICLO + ELECCIÓN DE SEMANAS BASE */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                padding: "8px 12px",
                borderRadius: "8px",
                marginBottom: "12px",
              }}
              className="no-print"
            >
              {/* SUJETO: ESTE JUGADOR vs MEDIA EQUIPO */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Sujeto:</span>
                <button
                  type="button"
                  onClick={() => setGpsSubjectMode("jugador")}
                  style={{
                    padding: "4px 9px",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: gpsSubjectMode === "jugador" ? "#0284c7" : "#ffffff",
                    color: gpsSubjectMode === "jugador" ? "#ffffff" : "#475569",
                    transition: "all 0.15s",
                  }}
                >
                  👤 {jugador.apodo || jugador.nombre}
                </button>
                <button
                  type="button"
                  onClick={() => setGpsSubjectMode("equipo")}
                  style={{
                    padding: "4px 9px",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: gpsSubjectMode === "equipo" ? "#16a34a" : "#ffffff",
                    color: gpsSubjectMode === "equipo" ? "#ffffff" : "#475569",
                    transition: "all 0.15s",
                  }}
                >
                  👥 Media del Equipo
                </button>
              </div>

              {/* SEGMENTO: DATOS REALES VS TODOS (CON SIMULADOS) */}
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Datos:</span>
                <button
                  type="button"
                  onClick={() => handleSetGpsDataSourceMode("reales")}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "5px",
                    border: `1px solid ${gpsDataSourceMode === "reales" ? "#0284c7" : "#cbd5e1"}`,
                    background: gpsDataSourceMode === "reales" ? "#0284c7" : "#ffffff",
                    color: gpsDataSourceMode === "reales" ? "#ffffff" : "#475569",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  title="Calcular únicamente con datos de sesiones reales"
                >
                  ⚡ Solo Reales
                </button>
                <button
                  type="button"
                  onClick={() => handleSetGpsDataSourceMode("todos")}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "5px",
                    border: `1px solid ${gpsDataSourceMode === "todos" ? "#7e22ce" : "#cbd5e1"}`,
                    background: gpsDataSourceMode === "todos" ? "#7e22ce" : "#ffffff",
                    color: gpsDataSourceMode === "todos" ? "#ffffff" : "#475569",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  title="Incluir también datos de sesiones simuladas"
                >
                  🧪 Reales + Simulados
                </button>
              </div>

              {/* BOTÓN DISCRETO: TAREAS MD (1ª Y 2ª PARTE, ACTIVACIÓN, CARRERAS) */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowMdTaskMenu(!showMdTaskMenu)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "5px",
                    border: `1px solid ${mdIncludeActivacion || mdIncludeCarreras ? "#0284c7" : "#cbd5e1"}`,
                    background: mdIncludeActivacion || mdIncludeCarreras ? "#f0f9ff" : "#ffffff",
                    color: mdIncludeActivacion || mdIncludeCarreras ? "#0284c7" : "#475569",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    transition: "all 0.15s",
                  }}
                  title="Configurar qué tareas entran en el cómputo de Match Day (MD)"
                >
                  <span>⏱️ MD:</span>
                  <span style={{ textDecoration: (!mdIncludeActivacion && !mdIncludeCarreras) ? "none" : "underline" }}>
                    {!mdIncludeActivacion && !mdIncludeCarreras
                      ? "Solo 1ª y 2ª parte"
                      : mdIncludeActivacion && mdIncludeCarreras
                      ? "1ª+2ª + Act + Carreras"
                      : mdIncludeActivacion
                      ? "1ª+2ª + Activación"
                      : "1ª+2ª + Carreras"}
                  </span>
                  <span style={{ fontSize: "8px", opacity: 0.7 }}>▼</span>
                </button>

                {showMdTaskMenu && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 40 }}
                      onClick={() => setShowMdTaskMenu(false)}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        marginTop: "5px",
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                        padding: "10px 12px",
                        zIndex: 50,
                        minWidth: "260px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a", borderBottom: "1px solid #f1f5f9", paddingBottom: "5px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>⏱️ Tareas en Match Day (MD)</span>
                        <button
                          type="button"
                          onClick={() => setShowMdTaskMenu(false)}
                          style={{ border: "none", background: "none", cursor: "pointer", fontSize: "11px", color: "#94a3b8" }}
                        >
                          ✕
                        </button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#1e293b", background: "#f8fafc", padding: "4px 8px", borderRadius: "5px" }}>
                        <span style={{ color: "#16a34a", fontWeight: 900 }}>✓</span>
                        <span style={{ fontWeight: 700 }}>1ª y 2ª Parte de Partido</span>
                        <span style={{ fontSize: "9.5px", color: "#64748b", marginLeft: "auto", fontWeight: 600 }}>Siempre</span>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#334155", cursor: "pointer", padding: "2px 4px" }}>
                        <input
                          type="checkbox"
                          checked={mdIncludeActivacion}
                          onChange={(e) => handleToggleMdActivacion(e.target.checked)}
                          style={{ cursor: "pointer" }}
                        />
                        <span>Contar Activación Prepartido</span>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#334155", cursor: "pointer", padding: "2px 4px" }}>
                        <input
                          type="checkbox"
                          checked={mdIncludeCarreras}
                          onChange={(e) => handleToggleMdCarreras(e.target.checked)}
                          style={{ cursor: "pointer" }}
                        />
                        <span>Contar Carreras Día de Partido</span>
                      </label>
                      <div style={{ fontSize: "9.5px", color: "#94a3b8", borderTop: "1px solid #f1f5f9", paddingTop: "5px" }}>
                        Por defecto solo se contabiliza el tiempo oficial de juego (1ª y 2ª parte).
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

              {/* 4 TIPOS DE MICROCICLO */}
              <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569", marginRight: "2px" }}>Microciclo:</span>
                <button
                  type="button"
                  onClick={() => handleSelectMicrocycleTypeFilter("todos")}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: gpsMicrocycleTypeFilter === "todos" ? "#0f172a" : "#ffffff",
                    color: gpsMicrocycleTypeFilter === "todos" ? "#ffffff" : "#475569",
                  }}
                >
                  🌐 Todos
                </button>
                {(["corto", "media", "largo", "doble_partido"] as const).map((t) => {
                  const cfg = MICROCICLE_TYPE_CONFIG[t];
                  const isActive = gpsMicrocycleTypeFilter === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleSelectMicrocycleTypeFilter(t)}
                      style={{
                        padding: "3px 8px",
                        borderRadius: "5px",
                        border: `1px solid ${isActive ? cfg.color : "#cbd5e1"}`,
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        background: isActive ? cfg.color : "#ffffff",
                        color: isActive ? "#ffffff" : "#475569",
                      }}
                      title={cfg.daysDesc}
                    >
                      {cfg.icon} {cfg.shortLabel}
                    </button>
                  );
                })}
              </div>

              {/* SELECTOR DE SEMANAS SEGÚN EL TIPO ELEGIDO */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowWeeksPicker(!showWeeksPicker)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: `1.5px solid ${gpsMicrocycleTypeFilter !== "todos" ? (MICROCICLE_TYPE_CONFIG[gpsMicrocycleTypeFilter]?.color || "#cbd5e1") : "#cbd5e1"}`,
                    background: gpsMicrocycleTypeFilter !== "todos" ? (MICROCICLE_TYPE_CONFIG[gpsMicrocycleTypeFilter]?.bg || "#f8fafc") : "#ffffff",
                    color: gpsMicrocycleTypeFilter !== "todos" ? (MICROCICLE_TYPE_CONFIG[gpsMicrocycleTypeFilter]?.color || "#0f172a") : "#334155",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  title={
                    gpsMicrocycleTypeFilter === "media"
                      ? "Añadir o quitar semanas medias para el cálculo de medias"
                      : gpsMicrocycleTypeFilter === "corto"
                      ? "Añadir o quitar semanas cortas para el cálculo de medias"
                      : "Añadir o quitar semanas para el cálculo de medias"
                  }
                >
                  <span>{gpsMicrocycleTypeFilter !== "todos" ? MICROCICLE_TYPE_CONFIG[gpsMicrocycleTypeFilter]?.icon : "📆"}</span>
                  <span>
                    {(() => {
                      const total = relevantMicrocyclesForCurrentFilter.length;
                      const active = relevantMicrocyclesForCurrentFilter.filter((m) => isWeekActive(m.id)).length;
                      if (gpsMicrocycleTypeFilter === "media") return `Semanas Medias (${active}/${total})`;
                      if (gpsMicrocycleTypeFilter === "corto") return `Semanas Cortas (${active}/${total})`;
                      if (gpsMicrocycleTypeFilter === "largo") return `Semanas Largas (${active}/${total})`;
                      if (gpsMicrocycleTypeFilter === "doble_partido") return `Semanas Doble Partido (${active}/${total})`;
                      return `Todas las Semanas (${active}/${total})`;
                    })()}
                  </span>
                  <span style={{ fontSize: "9px" }}>▼</span>
                </button>

                {showWeeksPicker && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "100%",
                      marginTop: "6px",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "10px",
                      boxShadow: "0 10px 25px -5px rgba(0,0,0,0.2)",
                      zIndex: 100,
                      width: "360px",
                      padding: "14px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                      <strong style={{ fontSize: "12px", color: "#0f172a" }}>
                        {gpsMicrocycleTypeFilter === "media"
                          ? "📅 Añadir o Quitar Semanas Medias"
                          : gpsMicrocycleTypeFilter === "corto"
                          ? "⚡ Añadir o Quitar Semanas Cortas"
                          : gpsMicrocycleTypeFilter === "doble_partido"
                          ? "⚽⚽ Añadir o Quitar Semanas Doble Partido"
                          : "Elegir Semanas Base"}
                      </strong>
                      <button
                        type="button"
                        onClick={() => setShowWeeksPicker(false)}
                        style={{ border: "none", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: "13px", fontWeight: 700 }}
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                      <button
                        type="button"
                        onClick={handleSelectAllWeeksOfCurrentType}
                        style={{
                          padding: "3px 8px",
                          fontSize: "10.5px",
                          borderRadius: "4px",
                          border: "1px solid #0284c7",
                          background: "#f0f9ff",
                          color: "#0369a1",
                          fontWeight: 700,
                          cursor: "pointer"
                        }}
                      >
                        Marcar todas ({relevantMicrocyclesForCurrentFilter.length})
                      </button>
                      <button
                        type="button"
                        onClick={handleUnselectAllWeeksOfCurrentType}
                        style={{
                          padding: "3px 8px",
                          fontSize: "10.5px",
                          borderRadius: "4px",
                          border: "1px solid #cbd5e1",
                          background: "#f8fafc",
                          color: "#64748b",
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        Desmarcar todas
                      </button>
                    </div>

                    <div style={{ maxHeight: "240px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {relevantMicrocyclesForCurrentFilter.length === 0 ? (
                        <div style={{ fontSize: "11.5px", color: "#94a3b8", padding: "8px", textAlign: "center" }}>
                          No hay microciclos de este tipo en los registros GPS.
                        </div>
                      ) : (
                        relevantMicrocyclesForCurrentFilter.map((mc) => {
                          const active = isWeekActive(mc.id);
                          const sParts = mc.start.split("-");
                          const eParts = mc.end.split("-");
                          const dateLabel = `${sParts[2]}/${sParts[1]} al ${eParts[2]}/${eParts[1]}`;

                          return (
                            <label
                              key={mc.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "7px 10px",
                                borderRadius: "6px",
                                background: active ? "#f0fdf4" : "#f8fafc",
                                border: `1px solid ${active ? "#bbf7d0" : "#e2e8f0"}`,
                                cursor: "pointer",
                                fontSize: "11.5px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={() => handleToggleWeek(mc.id)}
                                  style={{ cursor: "pointer", width: "15px", height: "15px" }}
                                />
                                <div>
                                  <strong style={{ color: active ? "#0f172a" : "#64748b" }}>{mc.nombre}</strong>
                                  <div style={{ fontSize: "10px", color: "#64748b" }}>
                                    📅 ${dateLabel} {mc.matchDates && mc.matchDates.length > 0 ? `· MD: ${mc.matchDates.join(", ")}` : ""}
                                  </div>
                                </div>
                              </div>
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: active ? "#dcfce7" : "#e2e8f0",
                                  color: active ? "#15803d" : "#64748b",
                                }}
                              >
                                {mc.sessionCount || 5} ses
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <hr style={{ border: "none", borderTop: "1.5px solid #0f172a", margin: "0 0 12px" }} />

            {/* TABLA MATRIZ DE DATOS GPS REALES POR MATCH DAY */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1.5px solid #cbd5e1" }}>
                    <th style={{ padding: "6px 10px", width: "190px", textAlign: "left", fontSize: "11px", color: "#475569" }}>
                      Variable GPS
                    </th>
                    {mdColumns.map((col) => {
                      const isMD = col === "MD";
                      const count = realGpsMatrixByMD.sessionCounts[col] || 0;
                      const datesCount = distinctDaysByMD[col] || 0;
                      return (
                        <th
                          key={col}
                          style={{
                            padding: "6px 4px",
                            textAlign: "center",
                            fontWeight: 800,
                            fontSize: "11px",
                            color: isMD ? "#dc2626" : "#0f172a",
                          }}
                        >
                          <div title={col === "+1 MD" ? "MD+1 (+1MD son equivalentes)" : col}>{col === "+1 MD" ? "MD+1" : col === "+2 MD" ? "MD+2" : col}</div>
                          <div style={{ fontSize: "9px", color: isMD ? "#ef4444" : "#94a3b8", fontWeight: 600 }}>
                            {gpsSubjectMode === "equipo" ? (
                              `(${count} ses · ${datesCount} d)`
                            ) : (
                              `(${count} ses)`
                            )}
                          </div>
                        </th>
                      );
                    })}

                    {showTotalColumn && (
                      <th
                        style={{
                          padding: "6px 8px",
                          textAlign: "center",
                          fontWeight: 900,
                          fontSize: "11px",
                          color: "#1e3a8a",
                          background: "#eff6ff",
                          borderLeft: "2px solid #bfdbfe",
                          minWidth: "95px",
                        }}
                      >
                        <div>TOTAL</div>
                        <div style={{ fontSize: "9px", color: "#3b82f6", fontWeight: 700 }}>
                          ({matrixFilteredGpsRecords.length} ses)
                        </div>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {activeMetricList.map((metricKey, rIdx) => {
                    const fav = favoriteVariables.find((v) => v.key === metricKey) || ALL_GPS_VARIABLES.find((v) => v.key === metricKey);
                    const compact = getCompactMetricHeader(metricKey, fav?.label);
                    const unit = fav?.unit || (metricKey === "Distance(m)" || metricKey.includes("(m)") ? "m" : metricKey.includes("Speed") ? "km/h" : metricKey.includes("Min") ? "m/min" : metricKey.includes("Load") ? "AU" : "cnt");

                    return (
                      <tr key={metricKey} style={{ background: rIdx % 2 === 0 ? "#f8fafc" : "#ffffff", borderBottom: "1px solid #f1f5f9" }}>
                        {/* Celda del nombre de la variable */}
                        <td style={{ padding: "6px 10px", textAlign: "left" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: "4px", minWidth: 0 }}>
                              <strong style={{ fontSize: "11.5px", color: "#0f172a", fontWeight: 800 }}>
                                {compact}
                              </strong>
                              <span style={{ fontSize: "9.5px", color: "#64748b" }}>
                                ({unit})
                              </span>
                            </div>

                            {/* Botón quitar variable de la fila */}
                            {activeMetricList.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveVariable(metricKey)}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "#94a3b8",
                                  fontSize: "10px",
                                  cursor: "pointer",
                                  padding: "0 2px",
                                }}
                                title={`Quitar ${compact} de la tabla`}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Celdas de cada Match Day (MD) */}
                        {mdColumns.map((col) => {
                          const val = getCellValue(metricKey, col);
                          const isComp = gpsProfileMode === "competitivo";
                          const isMD = col === "MD";
                          const isOverridden = gpsMatrixCustomOverrides[metricKey]?.[col] !== undefined;

                          return (
                            <td
                              key={col}
                              style={{
                                padding: "4px 6px",
                                textAlign: "center",
                                background: isMD && isComp ? "#faf5ff" : undefined,
                              }}
                            >
                              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "2px" }}>
                                <span
                                  style={{
                                    fontWeight: isMD ? 900 : 700,
                                    fontSize: "11.5px",
                                    color: isOverridden
                                      ? "#b45309"
                                      : isComp && isMD
                                      ? "#7e22ce"
                                      : gpsProfileMode === "maximos"
                                      ? "#c2410c"
                                      : "#0f172a",
                                  }}
                                  title={
                                    isOverridden
                                      ? "Valor ajustado manualmente (haz clic para modificar o restablecer)"
                                      : `Valor real en ${col}`
                                  }
                                >
                                  {val !== "—" && typeof val === "number" ? val.toLocaleString() : val}
                                </span>

                                {/* Botón para editar celda si se desea */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const curr = val !== "—" ? val : 0;
                                    const input = prompt(
                                      `Ajustar ${compact} (${unit}) para ${col} (${gpsProfileMode}):`,
                                      String(curr)
                                    );
                                    if (input !== null && input.trim() !== "" && !isNaN(Number(input))) {
                                      updateCellValue(metricKey, col, Number(input));
                                    }
                                  }}
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    color: "#cbd5e1",
                                    fontSize: "9px",
                                    cursor: "pointer",
                                    padding: "0 1px",
                                    opacity: isOverridden ? 1 : 0.4,
                                  }}
                                  title="Editar este valor"
                                >
                                  ✏️
                                </button>

                                {isOverridden && (
                                  <button
                                    type="button"
                                    onClick={() => handleResetCellOverride(metricKey, col)}
                                    style={{
                                      border: "none",
                                      background: "transparent",
                                      color: "#dc2626",
                                      fontSize: "9px",
                                      cursor: "pointer",
                                      padding: "0 1px",
                                      fontWeight: 800,
                                    }}
                                    title="Restablecer al cálculo automático real"
                                  >
                                    ↺
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        {showTotalColumn && (() => {
                          const isRate = isRateOrPeak(metricKey);
                          const colVals = mdColumns
                            .map((col) => getCellValue(metricKey, col))
                            .filter((v): v is number => typeof v === "number");

                          let totalVal: number | null = null;
                          if (colVals.length > 0) {
                            totalVal = isRate
                              ? Math.max(...colVals)
                              : colVals.reduce((a, b) => a + b, 0);
                            totalVal = isRate ? Math.round(totalVal * 10) / 10 : Math.round(totalVal);
                          }

                          const mdVal = getCellValue(metricKey, "MD");
                          let ratioToMd: number | null = null;
                          if (totalVal !== null && typeof mdVal === "number" && mdVal > 0) {
                            ratioToMd = Math.round((totalVal / mdVal) * 100) / 100;
                          }

                          return (
                            <td
                              style={{
                                padding: "4px 8px",
                                textAlign: "center",
                                background: "#f0f9ff",
                                borderLeft: "2px solid #bfdbfe",
                              }}
                            >
                              <div style={{ fontWeight: 900, fontSize: "11.5px", color: "#0f172a" }}>
                                {totalVal !== null ? totalVal.toLocaleString() : "—"}
                              </div>
                              {ratioToMd !== null ? (
                                <div
                                  style={{
                                    fontSize: "10px",
                                    fontWeight: 800,
                                    color: ratioToMd >= 2.0 ? "#15803d" : ratioToMd >= 1.0 ? "#0284c7" : "#b45309",
                                    marginTop: "2px",
                                  }}
                                  title={`Ratio alcanzado respecto a la demanda del partido (MD): ${totalVal} / ${mdVal} = ${ratioToMd}x`}
                                >
                                  {ratioToMd}x MD ({Math.round(ratioToMd * 100)}%)
                                </div>
                              ) : (
                                <div style={{ fontSize: "9.5px", color: "#94a3b8" }}>—</div>
                              )}
                            </td>
                          );
                        })()}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* BARRA INFERIOR CON INFORMACIÓN Y ACCIONES */}
            <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }} className="no-print">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "#166534", fontWeight: 700 }}>
                  ✓ Calculado automáticamente con datos reales de las sesiones GPS oficiales
                </span>
              </div>

              {Object.keys(gpsMatrixCustomOverrides).length > 0 && (
                <button
                  type="button"
                  onClick={handleResetAllMatrixOverrides}
                  style={{
                    background: "#fef2f2",
                    color: "#dc2626",
                    border: "1px solid #fecaca",
                    padding: "4px 10px",
                    borderRadius: "5px",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  title="Restablecer todas las celdas a los cálculos reales del GPS"
                >
                  ↺ Restablecer todas las celdas a Datos Reales
                </button>
              )}
            </div>
          </div>
          
          {/* ══════════════════════════════════════════════════════════════ */}
          {/* 2. TESTS DE VELOCIDAD: PICOS Y TAREAS SPRINT (CRONOLÓGICO)     */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div style={{ background: "#ffffff", padding: "18px 20px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "18px" }}>⚡</span>
                  <h3 style={{ fontSize: "14.5px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                    Tests de Velocidad — Velocidad Máxima y Tareas de Sprint
                  </h3>
                </div>
                <p style={{ fontSize: "11.5px", color: "#64748b", margin: "2px 0 0" }}>
                  Progresión cronológica de la velocidad máxima registrada en tareas de sprint y sesiones oficiales de competición.
                </p>
              </div>

              {/* RESUMEN DE MÉTRICAS */}
              {speedTestRecords.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "11.5px" }}>
                  <span style={{ color: "#1e3a8a", fontWeight: 800 }}>
                    🏆 Pico Histórico: <strong>{speedStats.maxSpeed.toFixed(2)} km/h</strong>
                  </span>
                  {speedStats.latestSprintTest && (
                    <span style={{ color: "#166534", fontWeight: 800 }}>
                      ⚡ Último Test Sprint: <strong>{speedStats.latestSprintTest.velMax.toFixed(2)} km/h</strong>
                    </span>
                  )}
                  <span style={{ color: "#7e22ce", fontWeight: 800 }}>
                    📊 Media Tests: <strong>{speedStats.avgSpeed.toFixed(2)} km/h</strong>
                  </span>
                </div>
              )}
            </div>

            {/* GRÁFICO DE LÍNEAS CON PUNTOS Y CONEXIÓN ENTRE ELLOS */}
            <div style={{ width: "100%", height: 250, marginBottom: "16px" }}>
              {speedChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={speedChartData} margin={{ top: 25, right: 35, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="dateLabel"
                      stroke="#64748b"
                      fontSize={11}
                      fontWeight={600}
                      padding={{ left: 50, right: 50 }}
                    />
                    <YAxis
                      domain={[27, 36]}
                      ticks={[27, 28, 29, 30, 31, 32, 33, 34, 35, 36]}
                      stroke="#2563eb"
                      fontSize={11}
                      fontWeight={600}
                      unit=" km/h"
                      tickFormatter={(v) => `${Number(v)}`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div style={{ background: "#ffffff", borderRadius: "8px", border: "1px solid #cbd5e1", padding: "8px 12px", fontSize: "12px", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>
                              <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: "4px" }}>📅 {data.fecha}</div>
                              <div style={{ color: "#1e3a8a", fontWeight: 900, fontSize: "13px", marginBottom: "3px" }}>
                                ⚡ {data.velMax.toFixed(2)} km/h
                              </div>
                              <div style={{ color: "#2563eb", fontSize: "11px", fontWeight: 700 }}>{data.tipo}</div>
                              <div style={{ color: "#64748b", fontSize: "10.5px" }}>Sesión: {data.sesion}</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="velMax"
                      name="Velocidad Máxima (km/h)"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={{ r: 5, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 2 }}
                      activeDot={{ r: 7, fill: "#1d4ed8" }}
                      label={({ x, y, value }: any) => {
                        if (value === null || value === undefined) return null;
                        return (
                          <text
                            x={x}
                            y={y - 10}
                            fill="#1e3a8a"
                            fontSize={11.5}
                            fontWeight={800}
                            textAnchor="middle"
                          >
                            {`${Number(value).toFixed(2)} km/h`}
                          </text>
                        );
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: "30px 20px", textAlign: "center", color: "#94a3b8", fontSize: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                  ⚡ No hay registros de velocidad GPS registrados para {jugador.nombre || "este deportista"}. Se sincronizarán automáticamente al cargar sesiones GPS.
                </div>
              )}
            </div>

            {/* TABLA DE PROGRESIÓN TEMPORAL SINTÉTICA */}
            {speedChartData.length > 0 && (
              <div style={{ overflowX: "auto", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ background: "#0f172a", color: "#ffffff" }}>
                      <th style={{ padding: "6px 10px", textAlign: "left" }}>Fecha</th>
                      <th style={{ padding: "6px 10px", textAlign: "left" }}>Tipo / Tarea / Contexto</th>
                      <th style={{ padding: "6px 10px", textAlign: "center", background: "#1e3a8a" }}>Velocidad Máxima (km/h)</th>
                      <th style={{ padding: "6px 10px", textAlign: "center" }}>Δ Evolución</th>
                    </tr>
                  </thead>
                  <tbody>
                    {speedChartData.map((row, idx) => {
                      const prev = idx > 0 ? speedChartData[idx - 1] : null;
                      const delta = prev ? Number((row.velMax - prev.velMax).toFixed(2)) : null;
                      const isSprint = row.origen === "tarea_sprint";

                      return (
                        <tr key={row.fecha + "-" + idx} style={{ background: idx % 2 === 0 ? "#ffffff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "6px 10px", fontWeight: 800, color: "#0f172a" }}>{row.fecha}</td>
                          <td style={{ padding: "6px 10px" }}>
                            <span style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "10.5px",
                              fontWeight: 700,
                              background: isSprint ? "#dcfce7" : "#eff6ff",
                              color: isSprint ? "#15803d" : "#1e40af",
                              border: `1px solid ${isSprint ? "#bbf7d0" : "#bfdbfe"}`
                            }}>
                              {row.tipo}
                            </span>
                            <span style={{ fontSize: "10.5px", color: "#64748b", marginLeft: "6px" }}>({row.sesion})</span>
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 900, color: "#1e3a8a", fontSize: "12px" }}>
                            {row.velMax.toFixed(2)} km/h
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 800 }}>
                            {delta === null ? (
                              <span style={{ color: "#94a3b8" }}>📍 Base</span>
                            ) : delta > 0 ? (
                              <span style={{ color: "#16a34a" }}>+{delta.toFixed(2)} km/h ↗</span>
                            ) : delta < 0 ? (
                              <span style={{ color: "#dc2626" }}>{delta.toFixed(2)} km/h ↘</span>
                            ) : (
                              <span style={{ color: "#64748b" }}>0.00 km/h =</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* 3. EVOLUCIÓN ANTROPOMÉTRICA: PESO vs PLIEGUES (ABAJO)          */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div style={{ background: "#ffffff", padding: "18px 20px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
            
            {/* CABECERA LIMPIA SIN RECUADROS RECARGADOS */}
            {(() => {
              const pesoList = testingData.pesoRecords.length > 0
                ? testingData.pesoRecords.map(r => r.peso)
                : testRecords.filter(r => r.peso && r.peso > 0).map(r => r.peso);
              const latestPeso = pesoList.length > 0 ? pesoList[pesoList.length - 1] : (jugador.peso ? Number(jugador.peso) : null);
              const firstPeso = pesoList.length > 0 ? pesoList[0] : (jugador.peso ? Number(jugador.peso) : null);
              const deltaPeso = latestPeso && firstPeso && pesoList.length > 1 ? Number((latestPeso - firstPeso).toFixed(1)) : null;

              const plieguesList = testingData.plieguesRecords.length > 0
                ? testingData.plieguesRecords.map(r => r.suma).filter((v): v is number => v !== null)
                : testRecords.filter(r => r.pliegues && r.pliegues > 0).map(r => r.pliegues);
              const latestPliegues = plieguesList.length > 0 ? plieguesList[plieguesList.length - 1] : null;
              const firstPliegues = plieguesList.length > 0 ? plieguesList[0] : null;
              const deltaPliegues = latestPliegues !== null && firstPliegues !== null && plieguesList.length > 1 ? Number((latestPliegues - firstPliegues).toFixed(1)) : null;

              const fatList = testingData.plieguesRecords.map(r => r.fatPct).filter((v): v is number => v !== null);
              const latestFat = fatList.length > 0
                ? fatList[fatList.length - 1]
                : (latestPliegues !== null ? calculateGrasaPct6Pliegues(latestPliegues) : null);

              return (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h3 style={{ fontSize: "14.5px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                      Evolución Antropométrica — Peso (kg) y Pliegues Cutáneos (mm)
                    </h3>
                    <p style={{ fontSize: "11.5px", color: "#64748b", margin: "2px 0 0" }}>
                      Progresión temporal con datos reales sincronizados de valoración física y antropometría.
                    </p>
                  </div>

                  {/* Resumen sutil en una sola línea */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px" }}>
                    {latestPeso && (
                      <span style={{ color: "#0284c7", fontWeight: 800 }}>
                        Peso: <strong>{latestPeso} kg</strong> {deltaPeso !== null ? `(${deltaPeso > 0 ? "+" : ""}${deltaPeso} kg)` : ""}
                      </span>
                    )}
                    {latestPliegues !== null && (
                      <span style={{ color: "#d97706", fontWeight: 800 }}>
                        Pliegues: <strong>{latestPliegues.toFixed(1)} mm</strong> {deltaPliegues !== null ? `(${deltaPliegues > 0 ? "+" : ""}${deltaPliegues} mm)` : ""}
                      </span>
                    )}
                    {latestFat !== null && (
                      <span style={{ color: "#16a34a", fontWeight: 800 }}>
                        Grasa: <strong>{latestFat.toFixed(1)}%</strong>
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* GRÁFICO DE LÍNEAS CON DOBLE EJE Y (PESO vs PLIEGUES) */}
            <div style={{ width: "100%", height: 230, marginBottom: "16px" }}>
              {(() => {
                const chartDataToUse = testingData.combinedChartData.length > 0
                  ? testingData.combinedChartData
                  : testRecords.filter(r => (r.peso && r.peso > 0) || (r.pliegues && r.pliegues > 0)).map(r => ({
                      date: r.fecha,
                      peso: r.peso > 0 ? r.peso : null,
                      pliegues: r.pliegues > 0 ? r.pliegues : null,
                      fatPct: r.pliegues > 0 ? calculateGrasaPct6Pliegues(r.pliegues) : null
                    }));
                
                return chartDataToUse.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartDataToUse} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                    <YAxis yAxisId="left" stroke="#0284c7" fontSize={11} domain={["dataMin - 1", "dataMax + 1"]} unit=" kg" />
                    <YAxis yAxisId="right" orientation="right" stroke="#ea580c" fontSize={11} domain={["dataMin - 3", "dataMax + 3"]} unit=" mm" />
                    <Tooltip
                      contentStyle={{ background: "#ffffff", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "12px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}
                      formatter={(value: any, name: any) => {
                        if (name === "Peso (kg)") return [`${value} kg`, "Peso"];
                        if (name === "Suma Pliegues (mm)") return [`${value} mm`, "Pliegues (∑6)"];
                        return [value, name];
                      }}
                    />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="peso" name="Peso (kg)" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 4, fill: "#0284c7" }} activeDot={{ r: 6 }} connectNulls />
                    <Line yAxisId="right" type="monotone" dataKey="pliegues" name="Suma Pliegues (mm)" stroke="#ea580c" strokeWidth={2.5} dot={{ r: 4, fill: "#ea580c" }} activeDot={{ r: 6 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: "30px 20px", textAlign: "center", color: "#94a3b8", fontSize: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                  📈 No hay datos de peso o pliegues registrados para {jugador.nombre}. Puedes importarlos desde Testing ➔ Cocina.
                </div>
              );
              })()}
            </div>

            {/* TABLA DE PROGRESIÓN TEMPORAL SINTÉTICA */}
            {(() => {
              const chartDataToUse = testingData.combinedChartData.length > 0
                ? testingData.combinedChartData
                : testRecords.map(r => ({
                    date: r.fecha,
                    peso: r.peso,
                    pliegues: r.pliegues,
                    fatPct: calculateGrasaPct6Pliegues(r.pliegues)
                  }));

              return chartDataToUse.length > 0 && (
              <div style={{ overflowX: "auto", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ background: "#0f172a", color: "#ffffff" }}>
                      <th style={{ padding: "6px 10px", textAlign: "left" }}>Fecha</th>
                      <th style={{ padding: "6px 10px", textAlign: "center", background: "#0369a1" }}>Peso (kg)</th>
                      <th style={{ padding: "6px 10px", textAlign: "center", background: "#0369a1" }}>Δ Peso</th>
                      <th style={{ padding: "6px 10px", textAlign: "center", background: "#b45309" }}>Pliegues (mm)</th>
                      <th style={{ padding: "6px 10px", textAlign: "center", background: "#b45309" }}>Δ Pliegues</th>
                      <th style={{ padding: "6px 10px", textAlign: "center", background: "#581c87" }}>% Grasa (6P)</th>
                      <th style={{ padding: "6px 10px", textAlign: "center" }}>Progresión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartDataToUse.map((row, idx) => {
                      const prev = idx > 0 ? chartDataToUse[idx - 1] : null;
                      const deltaP = row.peso !== null && row.peso !== undefined && prev && prev.peso !== null && prev.peso !== undefined ? Number((row.peso - prev.peso).toFixed(1)) : null;
                      const deltaPl = row.pliegues !== null && row.pliegues !== undefined && prev && prev.pliegues !== null && prev.pliegues !== undefined ? Number((row.pliegues - prev.pliegues).toFixed(1)) : null;

                      return (
                        <tr key={row.date} style={{ background: idx % 2 === 0 ? "#ffffff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "6px 10px", fontWeight: 800, color: "#0f172a" }}>{row.date}</td>
                          <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 800, color: row.peso ? "#0284c7" : "#94a3b8" }}>
                            {row.peso ? `${row.peso} kg` : "—"}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: deltaP === null ? "#94a3b8" : deltaP > 0 ? "#ea580c" : "#16a34a" }}>
                            {deltaP !== null ? (deltaP > 0 ? `+${deltaP}` : `${deltaP}`) : "—"}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 800, color: row.pliegues ? "#d97706" : "#94a3b8" }}>
                            {row.pliegues ? `${row.pliegues.toFixed(1)} mm` : "—"}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: deltaPl === null ? "#94a3b8" : deltaPl <= 0 ? "#16a34a" : "#dc2626" }}>
                            {deltaPl !== null ? (deltaPl > 0 ? `+${deltaPl}` : `${deltaPl}`) : "—"}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 800, color: row.fatPct ? "#7c3aed" : "#94a3b8" }}>
                            {row.fatPct ? `${row.fatPct.toFixed(1)}%` : (row.pliegues ? `${calculateGrasaPct6Pliegues(row.pliegues)}%` : "—")}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, fontSize: "10.5px", color: deltaPl !== null && deltaPl <= 0 ? "#16a34a" : deltaPl !== null && deltaPl > 0 ? "#dc2626" : "#64748b" }}>
                            {deltaPl !== null && deltaPl <= 0 ? "📉 Reducción" : deltaPl !== null && deltaPl > 0 ? "📈 Aumento" : idx === 0 ? "📍 Base" : "═ Estable"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              );
            })()}
          </div>
        </div>
      )}
{/* PESTAÑA 5: HISTORIAL LESIONAL */}
      {activeTab === "lesiones" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ fontSize: "14.5px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                Historial Lesional y Médico
              </h3>
              <p style={{ fontSize: "11.5px", color: "#64748b", margin: "2px 0 0" }}>
                Sincronizado en tiempo real con el Historial de Lesiones y Planificación del club.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNuevaLesion(!showNuevaLesion)}
              style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "11.5px", fontWeight: 800, cursor: "pointer" }}
            >
              {showNuevaLesion ? "Cancelar" : "+ Registrar Nueva Lesión"}
            </button>
          </div>

          {showNuevaLesion && (
            <form onSubmit={handleAddLesion} style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1.5px solid #cbd5e1", marginBottom: "18px" }}>
              <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", marginBottom: "12px", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px" }}>
                ➕ Registro de Incidencia Médico / Lesional
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginBottom: "12px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "3px" }}>📅 Fecha Lesión *:</label>
                  <input type="date" value={nuevaLesion.fechaInicio} onChange={(e) => setNuevaLesion({ ...nuevaLesion, fechaInicio: e.target.value })} style={{ width: "100%", padding: "5px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1" }} required />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "3px" }}>Región Corporal / Zona *:</label>
                  <select value={nuevaLesion.zona} onChange={(e) => setNuevaLesion({ ...nuevaLesion, zona: e.target.value })} style={{ width: "100%", padding: "5px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1" }}>
                    {REGIONES_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "3px" }}>Tejido / Tipo *:</label>
                  <select value={nuevaLesion.tipo} onChange={(e) => setNuevaLesion({ ...nuevaLesion, tipo: e.target.value })} style={{ width: "100%", padding: "5px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1" }}>
                    {TEJIDO_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "3px" }}>Contexto:</label>
                  <select value={nuevaLesion.contexto} onChange={(e) => setNuevaLesion({ ...nuevaLesion, contexto: e.target.value })} style={{ width: "100%", padding: "5px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1" }}>
                    {CONTEXTOS_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "3px" }}>Contacto:</label>
                  <select value={nuevaLesion.contacto} onChange={(e) => setNuevaLesion({ ...nuevaLesion, contacto: e.target.value })} style={{ width: "100%", padding: "5px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1" }}>
                    {CONTACTO_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "3px" }}>Recurrencia:</label>
                  <select value={nuevaLesion.recurrencia} onChange={(e) => setNuevaLesion({ ...nuevaLesion, recurrencia: e.target.value })} style={{ width: "100%", padding: "5px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1" }}>
                    {RECURRENCIA_OPTIONS.map((rc) => (
                      <option key={rc} value={rc}>{rc}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "3px" }}>Días de Baja Estimados:</label>
                  <input type="number" min={0} value={nuevaLesion.diasBaja} onChange={(e) => setNuevaLesion({ ...nuevaLesion, diasBaja: e.target.value })} style={{ width: "100%", padding: "5px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1" }} />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "3px" }}>Estado Actual:</label>
                  <select value={nuevaLesion.estado} onChange={(e) => setNuevaLesion({ ...nuevaLesion, estado: e.target.value })} style={{ width: "100%", padding: "5px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1" }}>
                    <option value="Alta Médica">Alta Médica</option>
                    <option value="En Reeducación">En Reeducación / Al margen</option>
                    <option value="Baja Médica">Baja Médica</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#334155", display: "block", marginBottom: "3px" }}>💬 Comentarios Clínicos / Diagnóstico / Fisioterapia:</label>
                <textarea rows={2} placeholder="Evolución clínica, protocolo, pruebas de imagen..." value={nuevaLesion.comentario} onChange={(e) => setNuevaLesion({ ...nuevaLesion, comentario: e.target.value })} style={{ width: "100%", padding: "6px 8px", fontSize: "12px", borderRadius: "5px", border: "1px solid #cbd5e1" }} />
              </div>
              <button type="submit" style={{ background: "#16a34a", color: "#fff", border: "none", padding: "6px 16px", borderRadius: "5px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
                ✓ Guardar Registro Lesional
              </button>
            </form>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {lesiones.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", color: "#64748b" }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: "13px" }}>No hay registros de lesiones para este deportista.</p>
                <p style={{ margin: "4px 0 0", fontSize: "11.5px", color: "#94a3b8" }}>Las incidencias registradas en Planificación o Disponibilidad aparecerán automáticamente aquí.</p>
              </div>
            ) : (
              lesiones.map((les, idx) => {
                const isAlta = les.estado === "Alta Médica";
                const isBaja = les.estado === "Baja Médica";

                return (
                  <div
                    key={les.id || `${les.fechaInicio}_${idx}`}
                    style={{
                      background: "#ffffff",
                      padding: "14px 16px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      borderLeft: `5px solid ${isBaja ? "#dc2626" : isAlta ? "#16a34a" : "#d97706"}`,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "14px", fontWeight: 900, color: "#0f172a" }}>
                            {les.zona || "Lesión"}
                          </span>
                          <span style={{ background: "#e0f2fe", color: "#0369a1", fontSize: "11px", fontWeight: 800, padding: "2px 8px", borderRadius: "4px" }}>
                            {les.tipo || "Músculo"}
                          </span>
                          {les.contexto && (
                            <span style={{ background: "#f1f5f9", color: "#475569", fontSize: "10.5px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px" }}>
                              {les.contexto}
                            </span>
                          )}
                          {les.contacto && (
                            <span style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b", fontSize: "10.5px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px" }}>
                              {les.contacto}
                            </span>
                          )}
                          {les.recurrencia && (
                            <span style={{ background: les.recurrencia === "Recurrente" ? "#fee2e2" : "#f1f5f9", color: les.recurrencia === "Recurrente" ? "#b91c1c" : "#475569", fontSize: "10.5px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px" }}>
                              {les.recurrencia}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "4px", fontWeight: 600 }}>
                          📅 <strong>Fecha inicio:</strong> {les.fechaInicio ? (/^\d{4}$/.test(String(les.fechaInicio).trim()) ? `Año ${les.fechaInicio}` : les.fechaInicio) : "Sin fecha"} {les.fechaAlta ? ` ➔ Alta: ${les.fechaAlta}` : ""}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: "11.5px", fontWeight: 800, color: les.gravedad?.includes("Grave") ? "#dc2626" : les.gravedad?.includes("Moderada") ? "#d97706" : "#2563eb", display: "block" }}>
                            {les.gravedad || "Leve"} ({les.diasBaja || 0} días baja)
                          </span>
                          <span style={{ fontSize: "10.5px", fontWeight: 800, background: isBaja ? "#fee2e2" : isAlta ? "#dcfce7" : "#fef3c7", color: isBaja ? "#b91c1c" : isAlta ? "#15803d" : "#b45309", padding: "2px 6px", borderRadius: "4px", display: "inline-block", marginTop: "2px" }}>
                            {les.estado}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeletePlayerLesion(les)}
                          title="Eliminar lesión"
                          style={{
                            background: "#fee2e2",
                            border: "1px solid #fecaca",
                            color: "#b91c1c",
                            borderRadius: "5px",
                            padding: "4px 8px",
                            cursor: "pointer",
                            fontSize: "11px",
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Comentario clínico editable */}
                    <div style={{ marginTop: "8px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#475569", marginBottom: "3px" }}>
                        💬 Comentarios Clínicos / Fisioterapia (Editable):
                      </div>
                      <input
                        type="text"
                        defaultValue={les.comentario || undefined}
                        key={les.comentario || les.id}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (val !== (les.comentario || "")) {
                            handleUpdatePlayerComment(les, val);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        placeholder="Añadir comentario o evolución médica..."
                        style={{
                          width: "100%",
                          padding: "5px 10px",
                          fontSize: "11.5px",
                          borderRadius: "5px",
                          border: "1px solid #cbd5e1",
                          background: "#f8fafc",
                          color: "#0f172a",
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
