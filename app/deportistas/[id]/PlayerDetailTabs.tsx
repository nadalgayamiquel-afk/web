"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

import { checkDuplicateJugadorNombre, addLesion, getFullExcelBBDDRows } from "../../actions";
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

export default function PlayerDetailTabs({ jugador, saveJugadorAction, archiveJugadorAction, initialBBDDRows = [], initialTestingData = [] }: Props) {
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
  const [gpsProfileMode, setGpsProfileMode] = useState<"promedio" | "maximos" | "competitivo">("promedio");

  const mdColumns = ["-5 MD", "-4 MD", "-3 MD", "-2 MD", "-1 MD", "MD", "+1 MD", "+2 MD"];
  
  const [gpsMatrixPromedio, setGpsMatrixPromedio] = useState<Record<string, Record<string, number>>>({
    "MAX Speed(km/h)": { "-5 MD": 28.5, "-4 MD": 30.2, "-3 MD": 31.4, "-2 MD": 27.1, "-1 MD": 25.8, "MD": 32.8, "+1 MD": 22.0, "+2 MD": 24.5 },
    "Distance(m)": { "-5 MD": 4800, "-4 MD": 6200, "-3 MD": 7100, "-2 MD": 3800, "-1 MD": 2900, "MD": 10400, "+1 MD": 2200, "+2 MD": 3400 },
    "HMLD (m)": { "-5 MD": 650, "-4 MD": 890, "-3 MD": 1100, "-2 MD": 420, "-1 MD": 280, "MD": 1850, "+1 MD": 150, "+2 MD": 310 },
    "HSR Abs (m)": { "-5 MD": 320, "-4 MD": 540, "-3 MD": 680, "-2 MD": 210, "-1 MD": 120, "MD": 920, "+1 MD": 60, "+2 MD": 180 },
    "Sprint Abs Cnt": { "-5 MD": 4, "-4 MD": 8, "-3 MD": 12, "-2 MD": 2, "-1 MD": 1, "MD": 18, "+1 MD": 0, "+2 MD": 2 },
    "High Acc Cnt": { "-5 MD": 14, "-4 MD": 22, "-3 MD": 28, "-2 MD": 9, "-1 MD": 6, "MD": 42, "+1 MD": 4, "+2 MD": 10 },
    "High Dec Cnt": { "-5 MD": 14, "-4 MD": 20, "-3 MD": 27, "-2 MD": 9, "-1 MD": 6, "MD": 43, "+1 MD": 4, "+2 MD": 9 },
  });

  const [gpsMatrixMaximos, setGpsMatrixMaximos] = useState<Record<string, Record<string, number>>>({
    "MAX Speed(km/h)": { "-5 MD": 30.1, "-4 MD": 31.8, "-3 MD": 33.2, "-2 MD": 28.9, "-1 MD": 27.2, "MD": 34.5, "+1 MD": 24.2, "+2 MD": 26.0 },
    "Distance(m)": { "-5 MD": 5400, "-4 MD": 6800, "-3 MD": 7900, "-2 MD": 4200, "-1 MD": 3300, "MD": 11800, "+1 MD": 2600, "+2 MD": 3800 },
    "HMLD (m)": { "-5 MD": 780, "-4 MD": 1020, "-3 MD": 1290, "-2 MD": 490, "-1 MD": 340, "MD": 2100, "+1 MD": 190, "+2 MD": 370 },
    "HSR Abs (m)": { "-5 MD": 410, "-4 MD": 630, "-3 MD": 790, "-2 MD": 260, "-1 MD": 150, "MD": 1080, "+1 MD": 80, "+2 MD": 210 },
    "Sprint Abs Cnt": { "-5 MD": 6, "-4 MD": 11, "-3 MD": 16, "-2 MD": 4, "-1 MD": 2, "MD": 24, "+1 MD": 1, "+2 MD": 3 },
    "High Acc Cnt": { "-5 MD": 18, "-4 MD": 27, "-3 MD": 34, "-2 MD": 13, "-1 MD": 9, "MD": 52, "+1 MD": 6, "+2 MD": 13 },
    "High Dec Cnt": { "-5 MD": 17, "-4 MD": 25, "-3 MD": 32, "-2 MD": 12, "-1 MD": 8, "MD": 51, "+1 MD": 5, "+2 MD": 12 },
  });

  // Local state for Ficha Cualitativa
  const [cualitativa, setCualitativa] = useState({
    fisico: "Jugador de perfil explosivo, alta capacidad de repetición de esfuerzos de alta intensidad. Gran potencia en tren inferior.",
    psicologico: "Muy enfocado y motivado. Excelente actitud ante la carga y buena tolerancia a la frustración en momentos de alta exigencia.",
    habitos: "Excelente higiene del sueño (8h+ por noche). Cuida la hidratación previa al entrenamiento y sigue pauta de recuperación.",
    objetivos: "Mejorar la fuerza máxima en sentadilla (+5%) y mantener la simetría muscular en isquiosurales durante el microciclo.",
  });

  // Local state for Tests
  const [testRecords, setTestRecords] = useState([
    { fecha: "Set", peso: 74.5, pliegues: 48, vam: 16.2, sprint30: 4.12, cmj: 38.5 },
    { fecha: "Oct", peso: 74.2, pliegues: 46, vam: 16.5, sprint30: 4.08, cmj: 39.8 },
    { fecha: "Nov", peso: 73.8, pliegues: 44, vam: 16.8, sprint30: 4.04, cmj: 41.2 },
    { fecha: "Dic", peso: 74.0, pliegues: 43, vam: 17.0, sprint30: 4.01, cmj: 42.0 },
    { fecha: "Ene", peso: 73.5, pliegues: 42, vam: 17.2, sprint30: 3.98, cmj: 43.1 },
    { fecha: "Feb", peso: 73.6, pliegues: 41, vam: 17.4, sprint30: 3.96, cmj: 43.8 },
  ]);

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
        if (parsed.gpsMatrixPromedio) setGpsMatrixPromedio(parsed.gpsMatrixPromedio);
        if (parsed.gpsMatrixMaximos) setGpsMatrixMaximos(parsed.gpsMatrixMaximos);
        if (parsed.cualitativa) setCualitativa(parsed.cualitativa);
        if (parsed.testRecords) setTestRecords(parsed.testRecords);
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
      gpsMatrixPromedio,
      gpsMatrixMaximos,
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
      peso: parseFloat(newTest.peso) || 74.0,
      pliegues: parseFloat(newTest.pliegues) || 42,
      vam: parseFloat(newTest.vam) || 17.0,
      sprint30: parseFloat(newTest.sprint30) || 4.0,
      cmj: parseFloat(newTest.cmj) || 42.0,
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

  // Rename variable across both matrices
  const handleRenameMetric = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;

    const renameInObj = (source: Record<string, Record<string, number>>) => {
      const res: Record<string, Record<string, number>> = {};
      Object.keys(source).forEach((k) => {
        if (k === oldName) res[trimmed] = source[oldName];
        else res[k] = source[k];
      });
      return res;
    };

    const nextProm = renameInObj(gpsMatrixPromedio);
    const nextMax = renameInObj(gpsMatrixMaximos);
    setGpsMatrixPromedio(nextProm);
    setGpsMatrixMaximos(nextMax);
    saveExtraData({ gpsMatrixPromedio: nextProm, gpsMatrixMaximos: nextMax });
  };

  // Add metric to both matrices
  const handleAddGpsMetric = () => {
    const metricName = prompt("Nombre de la nueva variable GPS:", "Nueva Variable GPS");
    if (!metricName || !metricName.trim()) return;
    const name = metricName.trim();
    if (gpsMatrixPromedio[name]) return;

    const emptyRow: Record<string, number> = {};
    mdColumns.forEach((col) => {
      emptyRow[col] = 0;
    });

    const nextProm = { ...gpsMatrixPromedio, [name]: emptyRow };
    const nextMax = { ...gpsMatrixMaximos, [name]: emptyRow };
    setGpsMatrixPromedio(nextProm);
    setGpsMatrixMaximos(nextMax);
    saveExtraData({ gpsMatrixPromedio: nextProm, gpsMatrixMaximos: nextMax });
  };

  // Delete metric from both matrices
  const handleDeleteGpsMetric = (targetMetric?: string) => {
    const metrics = Object.keys(gpsMatrixPromedio);
    if (metrics.length === 0) return;
    const nameToDelete = targetMetric || prompt(
      `Escribe el nombre exacto de la variable a borrar:\nVariables disponibles:\n- ${metrics.join("\n- ")}`,
      metrics[metrics.length - 1]
    );
    if (!nameToDelete || !nameToDelete.trim()) return;
    const key = nameToDelete.trim();
    if (!gpsMatrixPromedio[key]) {
      alert(`La variable "${key}" no existe.`);
      return;
    }
    if (!confirm(`¿Eliminar la variable "${key}"?`)) return;

    const nextProm = { ...gpsMatrixPromedio };
    delete nextProm[key];
    const nextMax = { ...gpsMatrixMaximos };
    delete nextMax[key];

    setGpsMatrixPromedio(nextProm);
    setGpsMatrixMaximos(nextMax);
    saveExtraData({ gpsMatrixPromedio: nextProm, gpsMatrixMaximos: nextMax });
  };

  // Get active cell value depending on profile mode
  const getCellValue = (metric: string, col: string) => {
    const pVal = gpsMatrixPromedio[metric]?.[col] ?? 0;
    const mVal = gpsMatrixMaximos[metric]?.[col] ?? 0;

    if (gpsProfileMode === "promedio") return pVal;
    if (gpsProfileMode === "maximos") return mVal;
    // Perfil Competitivo: ((Max + promedio) / 2)
    return parseFloat((((mVal + pVal) / 2)).toFixed(1));
  };

  // Update cell value for active profile mode
  const updateCellValue = (metric: string, col: string, newVal: number) => {
    if (gpsProfileMode === "promedio") {
      const nextProm = {
        ...gpsMatrixPromedio,
        [metric]: { ...gpsMatrixPromedio[metric], [col]: newVal },
      };
      setGpsMatrixPromedio(nextProm);
      saveExtraData({ gpsMatrixPromedio: nextProm });
    } else if (gpsProfileMode === "maximos") {
      const nextMax = {
        ...gpsMatrixMaximos,
        [metric]: { ...gpsMatrixMaximos[metric], [col]: newVal },
      };
      setGpsMatrixMaximos(nextMax);
      saveExtraData({ gpsMatrixMaximos: nextMax });
    }
  };

  const activeMetricList = Object.keys(gpsMatrixPromedio);

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
          {/* 1. PERFIL GPS (ARRIBA)                                         */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div style={{ background: "#ffffff", padding: "16px 20px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
            {/* CABECERA CON 3 BOTONCITOS A LA DERECHA */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ fontWeight: 900, fontSize: "13.5px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                DATOS GPS — {gpsProfileMode === "promedio" ? "PERFIL PROMEDIO" : gpsProfileMode === "maximos" ? "PERFIL MÁXIMOS" : "PERFIL COMPETITIVO ((MÁX + PROM)/2)"}
              </div>

              {/* 3 BOTONCITOS PEQUEÑOS A LA DERECHA */}
              <div style={{ display: "flex", gap: "6px" }} className="no-print">
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
                >
                  Promedio
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
                >
                  Perfil Competitivo
                </button>
              </div>
            </div>

            <hr style={{ border: "none", borderTop: "1.5px solid #0f172a", margin: "0 0 12px" }} />

            {/* TABLA MATRIZ DE DATOS GPS POR MATCH DAY */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "6px 10px", width: "160px" }} />
                    {mdColumns.map((col) => {
                      const isMD = col === "MD";
                      return (
                        <th
                          key={col}
                          style={{
                            padding: "6px",
                            textAlign: "center",
                            fontWeight: 800,
                            fontSize: "11px",
                            color: isMD ? "#dc2626" : "#0f172a",
                          }}
                        >
                          {col}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {activeMetricList.map((metric, rIdx) => (
                    <tr key={metric} style={{ background: rIdx % 2 === 0 ? "#f8fafc" : "#ffffff", borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>
                        <input
                          type="text"
                          defaultValue={metric}
                          onBlur={(e) => handleRenameMetric(metric, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          style={{
                            border: "none",
                            background: "transparent",
                            fontWeight: 800,
                            fontSize: "11.5px",
                            color: "#0f172a",
                            textAlign: "right",
                            outline: "none",
                            width: "140px",
                          }}
                        />
                      </td>
                      {mdColumns.map((col) => {
                        const val = getCellValue(metric, col);
                        const isComp = gpsProfileMode === "competitivo";

                        return (
                          <td key={col} style={{ padding: "4px", textAlign: "center" }}>
                            {isComp ? (
                              <span style={{ fontWeight: 800, fontSize: "11.5px", color: "#7e22ce" }}>
                                {val}
                              </span>
                            ) : (
                              <input
                                type="number"
                                step="0.1"
                                value={val}
                                onChange={(e) => {
                                  const nextVal = parseFloat(e.target.value) || 0;
                                  updateCellValue(metric, col, nextVal);
                                }}
                                style={{
                                  width: "100%",
                                  maxWidth: "68px",
                                  textAlign: "center",
                                  background: "transparent",
                                  border: "none",
                                  fontWeight: 700,
                                  fontSize: "11.5px",
                                  color: gpsProfileMode === "maximos" ? "#c2410c" : "#0f172a",
                                  outline: "none",
                                }}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }} className="no-print">
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleAddGpsMetric}
                  style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "5px 12px", borderRadius: "6px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}
                >
                  + Añadir Variable
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteGpsMetric()}
                  style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "5px 12px", borderRadius: "6px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}
                >
                  - Borrar Variable
                </button>
              </div>
              <button
                type="button"
                onClick={() => saveExtraData({ gpsMatrixPromedio, gpsMatrixMaximos })}
                style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
              >
                Guardar Datos GPS
              </button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* 2. EVOLUCIÓN ANTROPOMÉTRICA: PESO vs PLIEGUES (ABAJO)          */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div style={{ background: "#ffffff", padding: "18px 20px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
            
            {/* CABECERA LIMPIA SIN RECUADROS RECARGADOS */}
            {(() => {
              const pesoList = testingData.pesoRecords.map(r => r.peso);
              const latestPeso = pesoList.length > 0 ? pesoList[pesoList.length - 1] : jugador.peso;
              const firstPeso = pesoList.length > 0 ? pesoList[0] : jugador.peso;
              const deltaPeso = latestPeso && firstPeso && pesoList.length > 1 ? Number((latestPeso - firstPeso).toFixed(1)) : null;

              const plieguesList = testingData.plieguesRecords.map(r => r.suma).filter((v): v is number => v !== null);
              const latestPliegues = plieguesList.length > 0 ? plieguesList[plieguesList.length - 1] : null;
              const firstPliegues = plieguesList.length > 0 ? plieguesList[0] : null;
              const deltaPliegues = latestPliegues !== null && firstPliegues !== null && plieguesList.length > 1 ? Number((latestPliegues - firstPliegues).toFixed(1)) : null;

              const fatList = testingData.plieguesRecords.map(r => r.fatPct).filter((v): v is number => v !== null);
              const latestFat = fatList.length > 0 ? fatList[fatList.length - 1] : (latestPliegues ? calculateGrasaPct6Pliegues(latestPliegues) : null);

              const chartDataToUse = testingData.combinedChartData.length > 0
                ? testingData.combinedChartData
                : testRecords.map(r => ({
                    date: r.fecha,
                    peso: r.peso,
                    pliegues: r.pliegues,
                    fatPct: calculateGrasaPct6Pliegues(r.pliegues)
                  }));

              return (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h3 style={{ fontSize: "14.5px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                      Evolución Antropométrica — Peso (kg) y Pliegues Cutáneos (mm)
                    </h3>
                    <p style={{ fontSize: "11.5px", color: "#64748b", margin: "2px 0 0" }}>
                      Progresión temporal sincronizada con los tests de valoración física. {testingData.combinedChartData.length === 0 && "(Datos de ejemplo)"}
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
                  : testRecords.map(r => ({
                      date: r.fecha,
                      peso: r.peso,
                      pliegues: r.pliegues,
                      fatPct: calculateGrasaPct6Pliegues(r.pliegues)
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
