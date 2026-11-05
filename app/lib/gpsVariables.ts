"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

export interface GpsVariableDef {
  key: string;
  label: string;
  shortLabel?: string;
  unit: string;
  categoria: "Volumen y Distancia" | "Velocidad e Intensidad" | "Aceleraciones y Desaceleraciones" | "Carga y Metabólica" | "Tiempo" | "Métricas Relativas" | "Variables Derivadas";
  descripcion?: string;
  esPicoMaximo?: boolean;
  esDerivada?: boolean;
  varA?: string;
  varB?: string;
  operacion?: "suma" | "resta" | "ratio";
}

export interface GpsDerivedVariable {
  id: string;
  label: string;
  shortLabel?: string;
  unit: string;
  operacion: "suma" | "resta" | "ratio";
  variables: string[]; // soporta 2, 3 o más variables para sumar
  varA?: string;
  varB?: string;
  varC?: string;
  descripcion?: string;
}

export const BASE_GPS_VARIABLES: GpsVariableDef[] = [
  // 1. Volumen y Distancia
  {
    key: "Distance(m)",
    label: "Distancia Total",
    shortLabel: "Dist. Total",
    unit: "m",
    categoria: "Volumen y Distancia",
    descripcion: "Distancia acumulada recorrida en metros por el deportista.",
  },
  {
    key: "Distancia / Min",
    label: "Distancia por Minuto (m/min)",
    shortLabel: "m/min",
    unit: "m/min",
    categoria: "Volumen y Distancia",
    descripcion: "Ratio de metros por minuto de sesión o tarea (m/min).",
  },
  {
    key: "15 - 16 km/h (Distancia)",
    label: "Distancia Z1: (15 - 16 km/h)",
    shortLabel: "Dist. 15-16",
    unit: "m",
    categoria: "Volumen y Distancia",
    descripcion: "Metros recorridos en Zona 1 (15 - 16 km/h).",
  },
  {
    key: "16 - 17 km/h (Distancia)",
    label: "Distancia Z2: (16 - 17 km/h)",
    shortLabel: "Dist. 16-17",
    unit: "m",
    categoria: "Volumen y Distancia",
    descripcion: "Metros recorridos en Zona 2 (16 - 17 km/h).",
  },
  {
    key: "17 - 19,8 km/h (Distancia)",
    label: "Distancia Z3: Carrera Rápida (17 - 19,8 km/h)",
    shortLabel: "Dist. 17-19,8",
    unit: "m",
    categoria: "Volumen y Distancia",
    descripcion: "Metros recorridos a alta velocidad moderada.",
  },

  // 2. Velocidad e Intensidad
  {
    key: "19,8 - 21 km/h (Distancia)",
    label: "Distancia Z4: Alta Velocidad (19,8 - 21 km/h)",
    shortLabel: "Dist. 19,8-21",
    unit: "m",
    categoria: "Velocidad e Intensidad",
    descripcion: "Metros recorridos en el umbral de alta intensidad.",
  },
  {
    key: "21 - 24 km/h (Distancia)",
    label: "Distancia Z5: Muy Alta Intensidad (21 - 24 km/h)",
    shortLabel: "Dist. 21-24",
    unit: "m",
    categoria: "Velocidad e Intensidad",
    descripcion: "Metros recorridos a intensidad muy alta justo antes de sprint.",
  },
  {
    key: "+ 24 km/h (Distancia)",
    label: "Distancia Sprint (+24 km/h)",
    shortLabel: "Sprint 24",
    unit: "m",
    categoria: "Velocidad e Intensidad",
    descripcion: "Metros realizados a velocidad de sprint estricto (+24 km/h).",
  },
  {
    key: "Distance +21 (m)",
    label: "Distancia (+21 km/h)",
    shortLabel: "Dist. >21 km/h",
    unit: "m",
    categoria: "Velocidad e Intensidad",
    descripcion: "Metros acumulados por encima de 21 km/h (Suma Z5 + Z6).",
  },
  {
    key: "Distancia (+21km/h) (m)",
    label: "Distancia (+21 km/h)",
    shortLabel: "Dist. >21 km/h",
    unit: "m",
    categoria: "Velocidad e Intensidad",
    descripcion: "Metros acumulados por encima de 21 km/h (Suma Z5 + Z6).",
  },
  {
    key: "Acc+Dec",
    label: "Aceleraciones + Desaceleraciones (+3 m/s²)",
    shortLabel: "Acc+Dec (+3)",
    unit: "nº",
    categoria: "Aceleraciones y Desaceleraciones",
    descripcion: "Suma total de acciones de aceleración (+3 m/s²) y desaceleración (+3 m/s²).",
  },
  {
    key: "HSR Abs (m)",
    label: "HSR Absoluto (>18 o >19,8 km/h)",
    shortLabel: "HSR Abs",
    unit: "m",
    categoria: "Velocidad e Intensidad",
    descripcion: "Distancia en High-Speed Running (>18 km/h / >19,8 km/h acumulada).",
  },
  {
    key: "MAX Speed(km/h)",
    label: "Velocidad Máxima",
    shortLabel: "Vel. Max",
    unit: "km/h",
    categoria: "Velocidad e Intensidad",
    descripcion: "Pico máximo de velocidad alcanzado por el jugador (no sumable).",
    esPicoMaximo: true,
  },
  {
    key: "Sprints Count",
    label: "Nº de Sprints (+24 km/h)",
    shortLabel: "Nº Sprints",
    unit: "nº",
    categoria: "Velocidad e Intensidad",
    descripcion: "Cantidad de acciones de carrera a más de 24 km/h.",
  },
  {
    key: "+28 km/h (Distancia)",
    label: "Distancia a Máxima Velocidad (+28 km/h)",
    shortLabel: "Sprint 28",
    unit: "m",
    categoria: "Velocidad e Intensidad",
    descripcion: "Metros recorridos a velocidad extrema (+28 km/h).",
  },
  {
    key: "+28 km/h (Num)",
    label: "Nº Acciones a Máxima Velocidad (+28 km/h)",
    shortLabel: "Nº Sprints 28",
    unit: "nº",
    categoria: "Velocidad e Intensidad",
    descripcion: "Número de veces que el jugador supera los 28 km/h.",
  },
  {
    key: "+28 km/h (Tiempo)",
    label: "Tiempo a Máxima Velocidad (+28 km/h)",
    shortLabel: "Tiempo >28 km/h",
    unit: "s",
    categoria: "Velocidad e Intensidad",
    descripcion: "Segundos acumulados por encima de 28 km/h.",
  },
  {
    key: "num_hsr",
    label: "Nº de Acciones HSR (>19,8 km/h)",
    shortLabel: "Nº HSR",
    unit: "nº",
    categoria: "Velocidad e Intensidad",
    descripcion: "Número de carreras y entradas a zona de High-Speed Running.",
  },
  {
    key: "hsr_time",
    label: "Tiempo en HSR",
    shortLabel: "Tiempo HSR",
    unit: "s",
    categoria: "Velocidad e Intensidad",
    descripcion: "Segundos acumulados en High-Speed Running.",
  },
  {
    key: "hid_intervals",
    label: "Intervalos Alta Demanda (HID Intervals)",
    shortLabel: "HID Interv.",
    unit: "nº",
    categoria: "Velocidad e Intensidad",
    descripcion: "Número de bloques o intervalos de esfuerzos de alta intensidad.",
  },
  {
    key: "average_speed",
    label: "Velocidad Media",
    shortLabel: "Vel. Media",
    unit: "km/h",
    categoria: "Velocidad e Intensidad",
    descripcion: "Velocidad media de desplazamiento a lo largo de la sesión.",
  },
  {
    key: "num_hids",
    label: "Nº Esfuerzos Alta Intensidad (HIDs)",
    shortLabel: "Nº HIDs",
    unit: "nº",
    categoria: "Velocidad e Intensidad",
    descripcion: "Intervalos y esfuerzos combinados de muy alta intensidad (High Intensity Demands).",
  },

  // 3. Aceleraciones y Desaceleraciones
  {
    key: "Accs Count",
    label: "Nº Aceleraciones (+3 m/s²)",
    shortLabel: "Accs >3m/s²",
    unit: "nº",
    categoria: "Aceleraciones y Desaceleraciones",
    descripcion: "Número de aceleraciones explosivas mayores a 3 m/s².",
  },
  {
    key: "Acc + 4 m/s2 (Num)",
    label: "Nº Aceleraciones Altas (+4 m/s²)",
    shortLabel: "Accs >4m/s²",
    unit: "nº",
    categoria: "Aceleraciones y Desaceleraciones",
    descripcion: "Número de aceleraciones de máxima violencia motriz (+4 m/s²).",
  },
  {
    key: "Max Acc",
    label: "Aceleración Máxima",
    shortLabel: "Max Acc",
    unit: "m/s²",
    categoria: "Aceleraciones y Desaceleraciones",
    descripcion: "Pico de aceleración máxima registrado (no sumable).",
    esPicoMaximo: true,
  },
  {
    key: "Decs Count",
    label: "Nº Desaceleraciones (+3 m/s²)",
    shortLabel: "Decs >3m/s²",
    unit: "nº",
    categoria: "Aceleraciones y Desaceleraciones",
    descripcion: "Número de frenadas o deceleraciones bruscas mayores a 3 m/s².",
  },
  {
    key: "Dec + 4 m/s2 (Num)",
    label: "Nº Desaceleraciones Altas (+4 m/s²)",
    shortLabel: "Decs >4m/s²",
    unit: "nº",
    categoria: "Aceleraciones y Desaceleraciones",
    descripcion: "Número de deceleraciones violentas mayores a 4 m/s².",
  },
  {
    key: "Max Dec",
    label: "Desaceleración Máxima",
    shortLabel: "Max Dec",
    unit: "m/s²",
    categoria: "Aceleraciones y Desaceleraciones",
    descripcion: "Pico de frenada o desaceleración máxima registrado (no sumable).",
    esPicoMaximo: true,
  },

  // 4. Carga y Metabólica
  {
    key: "Player Load",
    label: "Player Load",
    shortLabel: "Player Load",
    unit: "au",
    categoria: "Carga y Metabólica",
    descripcion: "Carga externa neuromuscular instantánea en acelerómetro triaxial (au).",
  },
  {
    key: "HMLD",
    label: "HMLD (High Metabolic Load Distance)",
    shortLabel: "HMLD",
    unit: "m",
    categoria: "Carga y Metabólica",
    descripcion: "Metros recorridos a alta carga metabólica (>25.5 W/kg o >19.8 km/h).",
  },
  {
    key: "HMLD (num)",
    label: "Nº Esfuerzos HMLD",
    shortLabel: "Nº HMLD",
    unit: "nº",
    categoria: "Carga y Metabólica",
    descripcion: "Frecuencia de entradas a zona de alta demanda metabólica.",
  },
  {
    key: "hmld_time",
    label: "Tiempo en HMLD",
    shortLabel: "Tiempo HMLD",
    unit: "min",
    categoria: "Carga y Metabólica",
    descripcion: "Minutos acumulados en alta carga metabólica.",
  },
  {
    key: "hmld_relative",
    label: "HMLD Relativo (%)",
    shortLabel: "HMLD %",
    unit: "%",
    categoria: "Carga y Metabólica",
    descripcion: "Porcentaje de metros en HMLD respecto a la distancia total.",
  },

  // 5. Tiempo
  {
    key: "Duration(min)",
    label: "Duración Total de la Sesión",
    shortLabel: "Duración",
    unit: "min",
    categoria: "Tiempo",
    descripcion: "Minutos totales desde el inicio hasta el fin de la sesión.",
  },
  {
    key: "TIiempo Activo",
    label: "Tiempo Activo",
    shortLabel: "T. Activo",
    unit: "min",
    categoria: "Tiempo",
    descripcion: "Minutos durante los cuales el jugador estuvo en movimiento en el campo.",
  },
  {
    key: "Tiempo Efectivo",
    label: "Tiempo Efectivo de Ejercicio",
    shortLabel: "T. Efectivo",
    unit: "min",
    categoria: "Tiempo",
    descripcion: "Minutos de trabajo efectivo descontando pausas y descansos.",
  },

  // 6. Métricas Relativas al Jugador (% de su máximo individual)
  {
    key: "relative_speed_distance_0_65",
    label: "Distancia Velocidad Relativa (0-65% de su máx)",
    shortLabel: "Rel. 0-65%",
    unit: "m",
    categoria: "Métricas Relativas",
    descripcion: "Metros recorridos hasta el 65% de la velocidad máxima individual.",
  },
  {
    key: "relative_speed_distance_65_75",
    label: "Distancia Velocidad Relativa (65-75% de su máx)",
    shortLabel: "Rel. 65-75%",
    unit: "m",
    categoria: "Métricas Relativas",
    descripcion: "Metros recorridos entre el 65% y 75% de la velocidad pico personal.",
  },
  {
    key: "relative_speed_distance_75_80",
    label: "Distancia Velocidad Relativa (75-80% de su máx)",
    shortLabel: "Rel. 75-80%",
    unit: "m",
    categoria: "Métricas Relativas",
    descripcion: "Metros recorridos entre el 75% y 80% de la velocidad pico personal.",
  },
  {
    key: "relative_speed_distance_80_85",
    label: "Distancia Velocidad Relativa (80-85% de su máx)",
    shortLabel: "Rel. 80-85%",
    unit: "m",
    categoria: "Métricas Relativas",
    descripcion: "Metros recorridos entre el 80% y 85% de la velocidad pico personal.",
  },
  {
    key: "relative_speed_distance_85_90",
    label: "Distancia Velocidad Relativa (85-90% de su máx)",
    shortLabel: "Rel. 85-90%",
    unit: "m",
    categoria: "Métricas Relativas",
    descripcion: "Metros recorridos entre el 85% y 90% de la velocidad pico personal del deportista.",
  },
  {
    key: "relative_speed_distance_90_95",
    label: "Distancia Velocidad Relativa (90-95% de su máx)",
    shortLabel: "Rel. 90-95%",
    unit: "m",
    categoria: "Métricas Relativas",
    descripcion: "Metros recorridos entre el 90% y 95% de la velocidad pico personal.",
  },
  {
    key: "relative_speed_distance_95_100",
    label: "Distancia Velocidad Relativa (95-100% de su máx)",
    shortLabel: "Rel. 95-100%",
    unit: "m",
    categoria: "Métricas Relativas",
    descripcion: "Metros recorridos por encima del 95% de la velocidad máxima del jugador.",
  },
  {
    key: "relative_acc_count_80_90",
    label: "Nº Aceleraciones Relativas (80-90% máx)",
    shortLabel: "Acc Rel. 80-90%",
    unit: "nº",
    categoria: "Métricas Relativas",
    descripcion: "Acciones aceleradas entre el 80% y 90% del límite individual de aceleración.",
  },
  {
    key: "relative_acc_count_90_100",
    label: "Nº Aceleraciones Relativas (90-100% máx)",
    shortLabel: "Acc Rel. 90-100%",
    unit: "nº",
    categoria: "Métricas Relativas",
    descripcion: "Acciones aceleradas de máxima exigencia individual (90-100%).",
  },
  {
    key: "relative_dcc_count_80_90",
    label: "Nº Desaceleraciones Relativas (80-90% máx)",
    shortLabel: "Dec Rel. 80-90%",
    unit: "nº",
    categoria: "Métricas Relativas",
    descripcion: "Acciones de frenada entre el 80% y 90% del límite individual de desaceleración.",
  },
  {
    key: "relative_dcc_count_90_100",
    label: "Nº Desaceleraciones Relativas (90-100% máx)",
    shortLabel: "Dec Rel. 90-100%",
    unit: "nº",
    categoria: "Métricas Relativas",
    descripcion: "Frenadas de máxima exigencia individual (90-100%).",
  },
];

export const ALL_GPS_VARIABLES = BASE_GPS_VARIABLES;

export const DEFAULT_FAVORITE_GPS_VARIABLES: string[] = [
  "Distance(m)",
  "Distance +21 (m)",
  "MAX Speed(km/h)",
  "Sprints Count",
  "Accs Count",
  "Decs Count",
  "Player Load",
  "Duration(min)",
  "Distancia / Min",
  "Acc+Dec",
];

const STORAGE_FAVORITES_KEY = "gps_favorite_variables";
const STORAGE_DERIVED_KEY = "gps_derived_variables";

export function getStoredFavoriteKeys(): string[] {
  if (typeof window === "undefined") return DEFAULT_FAVORITE_GPS_VARIABLES;
  try {
    const raw = localStorage.getItem(STORAGE_FAVORITES_KEY);
    const derived = getStoredDerivedVariables();
    const derivedIds = derived.map((d) => d.id);
    if (!raw) {
      return Array.from(new Set([...DEFAULT_FAVORITE_GPS_VARIABLES, ...derivedIds])).filter(
        (k) => k !== "HSR Abs (m)" && k !== "derived_1791992159697" && (!k.startsWith("derived_") || derivedIds.includes(k))
      );
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const cleaned = parsed.filter(
        (k) => k !== "HSR Abs (m)" && k !== "derived_1791992159697" && (!k.startsWith("derived_") || derivedIds.includes(k))
      );
      if (cleaned.length !== parsed.length) {
        try {
          localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify(cleaned));
        } catch (e) {}
      }
      return Array.from(new Set([...cleaned, ...derivedIds])).filter(
        (k) => k !== "derived_1791992159697" && (!k.startsWith("derived_") || derivedIds.includes(k))
      );
    }
  } catch (e) {}
  return DEFAULT_FAVORITE_GPS_VARIABLES.filter((k) => k !== "HSR Abs (m)" && k !== "derived_1791992159697");
}

export function saveStoredFavoriteKeys(keys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const derived = getStoredDerivedVariables();
    const derivedIds = derived.map((d) => d.id);
    const cleaned = keys.filter(
      (k) => k !== "HSR Abs (m)" && k !== "derived_1791992159697" && (!k.startsWith("derived_") || derivedIds.includes(k))
    );
    const val = cleaned.length > 0 ? cleaned : DEFAULT_FAVORITE_GPS_VARIABLES;
    localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify(val));
    window.dispatchEvent(new CustomEvent("gps_favorites_updated", { detail: val }));
    fetch("/api/gps/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favoriteVariables: val }),
    }).catch(() => {});
  } catch (e) {}
}

export function getStoredDerivedVariables(): GpsDerivedVariable[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_DERIVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {}
  return [];
}

export function saveStoredDerivedVariables(list: GpsDerivedVariable[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_DERIVED_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent("gps_derived_updated", { detail: list }));
    fetch("/api/gps/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ derivedVariables: list }),
    }).catch(() => {});
    // Asegurar que las variables derivadas también estén registradas en favoritas
    const currentFavs = getStoredFavoriteKeys();
    const newFavs = [...currentFavs];
    let changed = false;
    for (const d of list) {
      if (!newFavs.includes(d.id)) {
        newFavs.push(d.id);
        changed = true;
      }
    }
    if (changed) {
      saveStoredFavoriteKeys(newFavs);
    }
  } catch (e) {}
}

/**
 * Calcula el valor numérico de una métrica para un objeto de métricas dado,
 * resolviendo de manera transparente variables derivadas si aplica.
 */
function normalizeKey(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMetricNum(val: any): number {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const s = String(val).trim();
  let clean = s;
  if (clean.includes(",") && clean.includes(".")) {
    clean = clean.replace(/\./g, "").replace(/,/g, ".");
  } else if (clean.includes(",")) {
    clean = clean.replace(/,/g, ".");
  }
  clean = clean.replace(/[^0-9.-]/g, "");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

const RAW_ALIAS_MAP: Record<string, string[]> = {
  "distance(m)": [
    "total_distance",
    "total distance",
    "total_distance(m)",
    "distance(m)",
    "distance",
    "total distance(m)",
    "distancia total(m)",
    "distancia total",
    "distancia(m)",
    "distancia",
    "dist",
    "volumen(m)",
    "volumen",
    "volume(m)",
    "volume",
  ],
  "total_distance": [
    "total_distance",
    "total distance",
    "distance(m)",
    "distancia total",
    "distancia",
    "dist",
  ],
  "minute_distance": [
    "minute_distance",
    "minute distance",
    "distancia / min",
    "distancia/min",
    "m/min",
    "m min",
    "distancia min",
    "dist min",
  ],
  "num_hsr": ["num_hsr", "num hsr", "nº hsr", "hsr count"],
  "hsr": ["hsr", "num_hsr", "hsr abs (m)", "hsr abs", "high speed running", "hsr distance", "distancia hsr"],
  "hsr_time": ["hsr_time", "hsr time", "tiempo hsr"],
  "sprints": ["sprints", "num_sprints", "sprints count", "+24 km/h (num)", "sprint count"],
  "player_load": ["player_load", "player load", "playerload", "load", "carga"],
  "hmld_count": ["hmld_count", "hmld (num)", "hmld count"],
  "hmld_time": ["hmld_time", "hmld time", "tiempo hmld"],
  "hmld_relative": ["hmld_relative", "hmld relative"],
  "num_acc": ["num_acc", "accs count", "aceleraciones", "acc + 3 m/s2 (num)", "acc"],
  "num_acc_expl": ["num_acc_expl", "acc + 4 m/s2 (num)", "acc + 4", "acc4", "aceleraciones explosivas"],
  "num_dec": ["num_dec", "decs count", "desaceleraciones", "dec + 3 m/s2 (num)", "dec"],
  "num_dec_expl": ["num_dec_expl", "dec + 4 m/s2 (num)", "dec + 4", "dec4", "desaceleraciones explosivas"],
  "max_acc": ["max_acc", "max acc", "aceleracion maxima"],
  "max_dec": ["max_dec", "max dec", "desaceleracion maxima"],
  "max_speed": ["max_speed", "max speed(km/h)", "vel max", "max speed", "top speed", "velocidad maxima", "v max"],
  "num_hids": ["num_hids", "num hids", "hids"],
  "hid_intervals": ["hid_intervals", "hid intervals"],
  "average_speed": ["average_speed", "average speed", "velocidad media"],
  "time": ["time", "duration(min)", "duracion min", "tiempo", "duracion", "volume(min)"],
  "active_time": ["active_time", "active time", "tiiempo activo", "tiempo activo"],
  "effective_time": ["effective_time", "effective time", "tiempo efectivo"],
  "total distance": [
    "distance(m)",
    "distance",
    "total distance(m)",
    "total distance",
    "distancia total(m)",
    "distancia total",
    "distancia(m)",
    "distancia",
    "dist",
  ],
  "distancia total": [
    "distance(m)",
    "distance",
    "total distance(m)",
    "total distance",
    "distancia total(m)",
    "distancia total",
    "distancia(m)",
    "distancia",
    "dist",
  ],
  "distancia total(m)": [
    "distance(m)",
    "distance",
    "total distance(m)",
    "total distance",
    "distancia total(m)",
    "distancia total",
    "distancia(m)",
    "distancia",
    "dist",
  ],
  "hsr abs (m)": [
    "hsr abs (m)",
    "hsr",
    "distancia z4",
    "hsr abs",
    "high speed running",
    "hsr distance",
    "distancia hsr",
    "distancia alta velocidad",
  ],
  "max speed(km/h)": [
    "max speed(km/h)",
    "vel max",
    "max speed",
    "top speed (km/h)",
    "top speed",
    "v max",
    "velocidad maxima",
  ],
  "player load": ["player load", "playerload", "carga mecanica", "load"],
  "sprints count": ["sprints count", "+24 km/h (num)", "num sprints", "sprints", "nº sprints", "sprint count"],
  "accs count": ["accs count", "acc + 3 m/s2 (num)", "acc + 3 m/s2", "aceleraciones", "acc", "accelerations", "total acc"],
  "acc + 4 m/s2 (num)": ["acc + 4 m/s2 (num)", "acc + 4 m/s2", "acc 4", "acc4"],
  "decs count": ["decs count", "dec + 3 m/s2 (num)", "dec + 3 m/s2", "desaceleraciones", "dec", "decelerations", "total dec"],
  "dec + 4 m/s2 (num)": ["dec + 4 m/s2 (num)", "dec + 4 m/s2", "dec 4", "dec4"],
  "max acc": ["max acc", "aceleracion maxima"],
  "max dec": ["max dec", "desaceleracion maxima"],
  "duration(min)": ["duration(min)", "duracion min", "tiempo", "duracion", "time", "volume(min)", "time(min)", "minutos"],
  "tiiempo activo": ["tiiempo activo", "tiempo activo"],
  "tiempo efectivo": ["tiempo efectivo"],
  "distancia / min": [
    "distancia / min",
    "distancia/min",
    "distancia min",
    "m/min",
    "m min",
    "metros por minuto",
    "dist min",
    "relative distance",
  ],
  "15 - 16 km/h (distancia)": [
    "15 - 16 km/h (distancia)",
    "15-16 km/h (distancia)",
    "15 - 16 km/h",
    "15-16 km/h",
    "15 - 16",
    "15-16",
    "z1",
    "vrange1",
    "distance_vrange1",
    "distance vrange1",
    "distancia z1",
    "dist z1",
    "zona 1",
    "1 - 8 km/h (distancia)",
    "1 - 8 km/h",
    "1 - 8",
  ],
  "16 - 17 km/h (distancia)": [
    "16 - 17 km/h (distancia)",
    "16-17 km/h (distancia)",
    "16 - 17 km/h",
    "16-17 km/h",
    "16 - 17",
    "16-17",
    "z2",
    "vrange2",
    "distance_vrange2",
    "distance vrange2",
    "distancia z2",
    "dist z2",
    "zona 2",
    "8 - 17 km/h (distancia)",
    "8 - 17 km/h",
    "8 - 17",
  ],
  "1 - 8 km/h (distancia)": [
    "1 - 8 km/h (distancia)",
    "15 - 16 km/h (distancia)",
    "distance_vrange1",
  ],
  "8 - 17 km/h (distancia)": [
    "8 - 17 km/h (distancia)",
    "16 - 17 km/h (distancia)",
    "distance_vrange2",
  ],
  "17 - 19,8 km/h (distancia)": [
    "17 - 19,8 km/h (distancia)",
    "17 - 19.8 km/h (distancia)",
    "17 - 19,8 km/h",
    "17 - 19.8 km/h",
    "17 - 19",
    "z3",
    "vrange3",
    "distance_vrange3",
    "distance vrange3",
    "distancia z3",
    "dist z3",
    "zona 3",
  ],
  "19,8 - 21 km/h (distancia)": [
    "19,8 - 21 km/h (distancia)",
    "19.8 - 21 km/h (distancia)",
    "19,8 - 21 km/h",
    "19.8 - 21 km/h",
    "19 - 21 km/h (distancia)",
    "19 - 21 km/h",
    "19 - 21",
    "z4",
    "vrange4",
    "distance_vrange4",
    "distance vrange4",
    "distancia z4",
    "dist z4",
    "zona 4",
  ],
  "21 - 24 km/h (distancia)": [
    "21 - 24 km/h (distancia)",
    "21 - 24 km/h",
    "21 - 24",
    "z5",
    "vrange5",
    "distance_vrange5",
    "distance vrange5",
    "distancia z5",
    "dist z5",
    "zona 5",
  ],
  "+ 24 km/h (distancia)": [
    "+ 24 km/h (distancia)",
    "+ 24 km/h",
    "+24 km/h (distancia)",
    "+24 km/h",
    "+ 24",
    "+24",
    ">24 km/h (distancia)",
    ">24 km/h",
    "distancia sprint (+24 km/h)",
    "distancia sprint (+24)",
    "distancia sprint 24",
    "dist sprint 24",
    "sprint 24 (m)",
    "sprint 24",
    "dist sprint",
    "sprint distance",
    "distancia sprint",
    "z6",
    "vrange6",
    "distance_vrange6",
    "distance vrange6",
    "distancia z6",
    "dist z6",
    "zona 6",
  ],
  "distance +21 (m)": [
    "distance +21 (m)",
    "distance +21(m)",
    "distancia (+21km/h) (m)",
    "distancia (+21 km/h)",
    "distancia +21",
    "+ 21 km/h (distancia)",
    "+21 km/h (distancia)",
    "+ 21 km/h",
    "+21 km/h",
    "z5 z6",
  ],
  "+28 km/h (distancia)": [
    "+28 km/h (distancia)",
    "+ 28 km/h (distancia)",
    "+28 km/h",
    "+ 28 km/h",
    "+28",
    "+ 28",
    ">28 km/h (distancia)",
    ">28 km/h",
    "distancia a maxima velocidad (+28 km/h)",
    "distancia a máxima velocidad (+28 km/h)",
    "distancia maxima velocidad (+28 km/h)",
    "distancia sprint (+28 km/h)",
    "distancia sprint 28",
    "dist sprint 28",
    "sprint 28 (m)",
    "sprint 28",
    "vrange7",
    "distance_vrange7",
  ],
  "+28 km/h (num)": [
    "+28 km/h (num)",
    "+ 28 km/h (num)",
    "+28 km/h (nº)",
    "+ 28 km/h (nº)",
    "+28 km/h (no)",
    "+ 28 km/h (no)",
    "n acciones a maxima velocidad (+28 km/h)",
    "nº acciones a maxima velocidad (+28 km/h)",
    "nº acciones a máxima velocidad (+28 km/h)",
    "nº de sprints (+28 km/h)",
    "nº sprints (+28 km/h)",
    "nº sprints 28",
    "sprints 28",
    "sprint 28 count",
    "nº >28 km/h",
  ],
  "hmld": ["hmld", "hmld distance"],
};

export const ALIAS_MAP: Record<string, string[]> = {};
for (const [k, aliases] of Object.entries(RAW_ALIAS_MAP)) {
  const allNorm = Array.from(new Set([normalizeKey(k), ...aliases.map(normalizeKey)]));
  for (const alias of allNorm) {
    if (!ALIAS_MAP[alias]) {
      ALIAS_MAP[alias] = allNorm;
    } else {
      const merged = Array.from(new Set([...ALIAS_MAP[alias], ...allNorm]));
      for (const a of merged) {
        ALIAS_MAP[a] = merged;
      }
    }
  }
}

// Asegurar que todas las variables definidas en BASE_GPS_VARIABLES enlazan sus keys, labels y shortLabels
for (const def of BASE_GPS_VARIABLES) {
  const keysToAdd = [def.key, def.label, def.shortLabel].filter(Boolean).map((s) => normalizeKey(s as string));
  let existingGroup: string[] = [];
  for (const k of keysToAdd) {
    if (ALIAS_MAP[k]) {
      existingGroup = ALIAS_MAP[k];
      break;
    }
  }
  const merged = Array.from(new Set([...existingGroup, ...keysToAdd]));
  for (const k of merged) {
    ALIAS_MAP[k] = merged;
  }
}

export function calculateGpsMetricValue(
  metricas: any,
  key: string,
  derivedVariablesList: GpsDerivedVariable[] = []
): number {
  if (!metricas || typeof metricas !== "object") return 0;

  // Si nos pasan un registro GPS completo con la propiedad .metricas, desenvolverla automáticamente
  const targetObj = (metricas.metricas && typeof metricas.metricas === "object") ? metricas.metricas : metricas;

  // 1. Comprobar si es una variable derivada por ID o por Label
  const derived =
    derivedVariablesList.find((d) => d.id === key) ||
    derivedVariablesList.find((d) => normalizeKey(d.label) === normalizeKey(key));

  if (derived) {
    const varList: string[] =
      derived.variables && Array.isArray(derived.variables) && derived.variables.length > 0
        ? derived.variables
        : [derived.varA, derived.varB, derived.varC].filter(Boolean) as string[];

    if (derived.operacion === "suma") {
      const total = varList.reduce((acc, vKey) => {
        return acc + calculateGpsMetricValue(metricas, vKey, derivedVariablesList);
      }, 0);
      return Math.round(total * 100) / 100;
    }
    if (derived.operacion === "resta") {
      const first = varList[0] ? calculateGpsMetricValue(metricas, varList[0], derivedVariablesList) : 0;
      const rest = varList.slice(1).reduce((acc, vKey) => {
        return acc + calculateGpsMetricValue(metricas, vKey, derivedVariablesList);
      }, 0);
      return Math.round((first - rest) * 100) / 100;
    }
    if (derived.operacion === "ratio") {
      const valA = varList[0] ? calculateGpsMetricValue(metricas, varList[0], derivedVariablesList) : 0;
      const valB = varList[1] ? calculateGpsMetricValue(metricas, varList[1], derivedVariablesList) : 0;
      return valB !== 0 ? Math.round((valA / valB) * 100) / 100 : 0;
    }
  }

  const normTarget = normalizeKey(key);

  // Helper para buscar valor directo o por alias en metricas
  const findInMetricas = (): { found: boolean; val: number } => {
    // 1. Coincidencia directa por clave exacta
    if (targetObj[key] !== undefined && targetObj[key] !== null) {
      const p = parseMetricNum(targetObj[key]);
      if (p !== 0) return { found: true, val: Math.round(p * 100) / 100 };
    }

    const possibleAliases = ALIAS_MAP[normTarget] || [normTarget];
    let zeroFound = false;

    // Reglas estrictas de aislamiento anti-confusión entre 24 y 28 km/h y entre Distancia y Conteo
    const is28Target = normTarget.includes("28");
    const is24Target = normTarget.includes("24");
    const isCountTarget = normTarget.includes("num") || normTarget.includes("count") || normTarget.includes("no ");
    const isDistTarget = normTarget.includes("dist") || normTarget.includes("(m)") || normTarget.includes("m)");

    for (const [mKey, mVal] of Object.entries(targetObj)) {
      if (mKey === "tareas") continue;
      const normMKey = normalizeKey(mKey);

      // Aislamiento estricto: NUNCA cruzar métricas de 28 con 24 ni conteo con distancia
      if (is28Target && normMKey.includes("24")) continue;
      if (is24Target && normMKey.includes("28")) continue;
      if (isCountTarget && (normMKey.includes("dist") || normMKey.includes("(m)"))) continue;
      if (isDistTarget && (normMKey.includes("num") || normMKey.includes("count") || normMKey.includes("no "))) continue;

      if (normMKey === normTarget || possibleAliases.includes(normMKey)) {
        if (mVal !== undefined && mVal !== null && mVal !== "") {
          const p = parseMetricNum(mVal);
          if (p !== 0) return { found: true, val: Math.round(p * 100) / 100 };
          zeroFound = true;
        }
      }
    }
    if (zeroFound) return { found: true, val: 0 };
    return { found: false, val: 0 };
  };

  const directFound = findInMetricas();
  if (directFound.found && directFound.val !== 0) return directFound.val;

  // 1.5 Cálculo dinámico de métricas comunes combinadas si no existen directamente
  if (normTarget.includes("hsr 15") || normTarget.includes("+ hsr 15") || normTarget === "derived_hsr_15") {
    const v1 = calculateGpsMetricValue(metricas, "15 - 16 km/h (Distancia)", derivedVariablesList);
    const v2 = calculateGpsMetricValue(metricas, "16 - 17 km/h (Distancia)", derivedVariablesList);
    const v3 = calculateGpsMetricValue(metricas, "17 - 19,8 km/h (Distancia)", derivedVariablesList);
    const v4 = calculateGpsMetricValue(metricas, "19,8 - 21 km/h (Distancia)", derivedVariablesList);
    const v5 = calculateGpsMetricValue(metricas, "21 - 24 km/h (Distancia)", derivedVariablesList);
    const v6 = calculateGpsMetricValue(metricas, "+ 24 km/h (Distancia)", derivedVariablesList);
    return Math.round((v1 + v2 + v3 + v4 + v5 + v6) * 100) / 100;
  }

  if (normTarget.includes("hsr 16") || normTarget.includes("+ hsr 16") || normTarget === "derived_hsr_16") {
    const v2 = calculateGpsMetricValue(metricas, "16 - 17 km/h (Distancia)", derivedVariablesList);
    const v3 = calculateGpsMetricValue(metricas, "17 - 19,8 km/h (Distancia)", derivedVariablesList);
    const v4 = calculateGpsMetricValue(metricas, "19,8 - 21 km/h (Distancia)", derivedVariablesList);
    const v5 = calculateGpsMetricValue(metricas, "21 - 24 km/h (Distancia)", derivedVariablesList);
    const v6 = calculateGpsMetricValue(metricas, "+ 24 km/h (Distancia)", derivedVariablesList);
    return Math.round((v2 + v3 + v4 + v5 + v6) * 100) / 100;
  }

  if (normTarget.includes("hsr 17") || normTarget.includes("+ hsr 17") || normTarget === "derived_hsr_17") {
    const v3 = calculateGpsMetricValue(metricas, "17 - 19,8 km/h (Distancia)", derivedVariablesList);
    const v4 = calculateGpsMetricValue(metricas, "19,8 - 21 km/h (Distancia)", derivedVariablesList);
    const v5 = calculateGpsMetricValue(metricas, "21 - 24 km/h (Distancia)", derivedVariablesList);
    const v6 = calculateGpsMetricValue(metricas, "+ 24 km/h (Distancia)", derivedVariablesList);
    return Math.round((v3 + v4 + v5 + v6) * 100) / 100;
  }

  if (normTarget.includes("distancia 19,8") || normTarget.includes("distancia 19.8") || normTarget === "derived_hsr_19_8") {
    const v4 = calculateGpsMetricValue(metricas, "19,8 - 21 km/h (Distancia)", derivedVariablesList);
    const v5 = calculateGpsMetricValue(metricas, "21 - 24 km/h (Distancia)", derivedVariablesList);
    const v6 = calculateGpsMetricValue(metricas, "+ 24 km/h (Distancia)", derivedVariablesList);
    return Math.round((v4 + v5 + v6) * 100) / 100;
  }

  if (
    normTarget === "distance +21 (m)" ||
    normTarget === "distance +21(m)" ||
    normTarget === "distancia (+21km/h) (m)" ||
    normTarget === "distancia (+21 km/h)" ||
    normTarget === "distancia +21" ||
    normTarget === "+ 21 km/h (distancia)" ||
    normTarget === "+21 km/h (distancia)"
  ) {
    const z5 = calculateGpsMetricValue(metricas, "21 - 24 km/h (Distancia)", derivedVariablesList);
    const z6 = calculateGpsMetricValue(metricas, "+ 24 km/h (Distancia)", derivedVariablesList);
    const sum = z5 + z6;
    if (sum > 0) return Math.round(sum * 100) / 100;
  }

  if (
    normTarget === "distancia / min" ||
    normTarget === "distancia/min" ||
    normTarget === "m/min" ||
    normTarget === "distancia min" ||
    normTarget === "distancia por minuto (m/min)"
  ) {
    const dist = calculateGpsMetricValue(metricas, "Distance(m)", derivedVariablesList);
    const dur = calculateGpsMetricValue(metricas, "Duration(min)", derivedVariablesList);
    if (dur > 0 && dist > 0) return Math.round((dist / dur) * 100) / 100;
  }

  if (normTarget === "acc+dec" || normTarget === "acc + dec" || normTarget === "accs decs") {
    const acc = calculateGpsMetricValue(metricas, "Accs Count", derivedVariablesList);
    const dec = calculateGpsMetricValue(metricas, "Decs Count", derivedVariablesList);
    const sum = acc + dec;
    if (sum > 0) return Math.round(sum * 100) / 100;
  }

  if (normTarget === "hsr abs (m)" || normTarget === "hsr") {
    const v4 = calculateGpsMetricValue(metricas, "19,8 - 21 km/h (Distancia)", derivedVariablesList);
    const v5 = calculateGpsMetricValue(metricas, "21 - 24 km/h (Distancia)", derivedVariablesList);
    const v6 = calculateGpsMetricValue(metricas, "+ 24 km/h (Distancia)", derivedVariablesList);
    const sum = v4 + v5 + v6;
    if (sum > 0) return Math.round(sum * 100) / 100;
  }

  if (normTarget === "distance(m)" || normTarget === "distancia total" || normTarget === "total distance") {
    // Si no se encuentra Distancia Total directamente, intentar sumar zonas de velocidad
    const v1 = calculateGpsMetricValue(metricas, "15 - 16 km/h (Distancia)", derivedVariablesList);
    const v2 = calculateGpsMetricValue(metricas, "16 - 17 km/h (Distancia)", derivedVariablesList);
    const v3 = calculateGpsMetricValue(metricas, "17 - 19,8 km/h (Distancia)", derivedVariablesList);
    const v4 = calculateGpsMetricValue(metricas, "19,8 - 21 km/h (Distancia)", derivedVariablesList);
    const v5 = calculateGpsMetricValue(metricas, "21 - 24 km/h (Distancia)", derivedVariablesList);
    const v6 = calculateGpsMetricValue(metricas, "+ 24 km/h (Distancia)", derivedVariablesList);
    const sumZones = v1 + v2 + v3 + v4 + v5 + v6;
    if (sumZones > 0) return Math.round(sumZones * 100) / 100;
  }

  // 4. Fallback si el dato está acumulado en tareas
  if (Array.isArray(metricas.tareas) && metricas.tareas.length > 0) {
    let taskSum = 0;
    let foundInTask = false;
    for (const t of metricas.tareas) {
      if (t && typeof t === "object") {
        const val = calculateGpsMetricValue(t, key, derivedVariablesList);
        if (val > 0) {
          taskSum += val;
          foundInTask = true;
        }
      }
    }
    if (foundInTask) return Math.round(taskSum * 100) / 100;
  }

  return directFound.val;
}

export function useFavoriteGpsVariables() {
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>(() => DEFAULT_FAVORITE_GPS_VARIABLES.filter((k) => k !== "HSR Abs (m)"));
  const [derivedVariables, setDerivedVariables] = useState<GpsDerivedVariable[]>([]);

  useEffect(() => {
    setFavoriteKeys(getStoredFavoriteKeys());
    setDerivedVariables(getStoredDerivedVariables());

    // Sincronización y recuperación automática con el servidor para que nunca se pierdan
    fetch("/api/gps/favorites")
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res && Array.isArray(res.favoriteVariables) && res.favoriteVariables.length > 0) {
          const cleaned = res.favoriteVariables.filter((k: string) => k !== "HSR Abs (m)");
          setFavoriteKeys((prev) => {
            const merged = Array.from(new Set([...prev, ...cleaned]));
            if (prev.length === merged.length && prev.every((v, i) => v === merged[i])) {
              return prev;
            }
            try {
              localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify(merged));
            } catch (e) {}
            return merged;
          });
        }
        if (res && Array.isArray(res.derivedVariables) && res.derivedVariables.length > 0) {
          setDerivedVariables((prev) => {
            const existingIds = new Set(prev.map((d) => d.id));
            const merged = [...prev];
            let changed = false;
            for (const d of res.derivedVariables) {
              if (!existingIds.has(d.id)) {
                merged.push(d);
                changed = true;
              }
            }
            if (changed) {
              try {
                localStorage.setItem(STORAGE_DERIVED_KEY, JSON.stringify(merged));
              } catch (e) {}
              return merged;
            }
            return prev;
          });
        }
      })
      .catch(() => {});

    const handleFavUpdate = (e: any) => {
      const next = Array.isArray(e.detail) ? e.detail.filter((k: string) => k !== "HSR Abs (m)") : getStoredFavoriteKeys();
      setFavoriteKeys((prev) => {
        if (prev.length === next.length && prev.every((v, i) => v === next[i])) return prev;
        return next;
      });
    };

    const handleDerivedUpdate = (e: any) => {
      if (Array.isArray(e.detail)) setDerivedVariables(e.detail);
      else setDerivedVariables(getStoredDerivedVariables());
    };

    window.addEventListener("gps_favorites_updated", handleFavUpdate);
    window.addEventListener("gps_derived_updated", handleDerivedUpdate);
    window.addEventListener("storage", handleFavUpdate);

    return () => {
      window.removeEventListener("gps_favorites_updated", handleFavUpdate);
      window.removeEventListener("gps_derived_updated", handleDerivedUpdate);
      window.removeEventListener("storage", handleFavUpdate);
    };
  }, []);

  const allVariables = useMemo<GpsVariableDef[]>(() => {
    const derivedDefs: GpsVariableDef[] = derivedVariables.map((d) => {
      const varList = d.variables && Array.isArray(d.variables) && d.variables.length > 0
        ? d.variables
        : [d.varA, d.varB, d.varC].filter(Boolean) as string[];
      const formulaStr = varList.join(" + ");
      return {
        key: d.id,
        label: d.label,
        shortLabel: d.shortLabel || d.label,
        unit: d.unit,
        categoria: "Variables Derivadas",
        descripcion: d.descripcion || `Suma de ${varList.length} variables: ${formulaStr}`,
        esDerivada: true,
        operacion: d.operacion,
      };
    });
    return [...derivedDefs, ...BASE_GPS_VARIABLES];
  }, [derivedVariables]);

  const updateFavorites = useCallback((newKeys: string[]) => {
    const cleaned = newKeys.filter((k) => k !== "HSR Abs (m)");
    setFavoriteKeys(cleaned);
    saveStoredFavoriteKeys(cleaned);
  }, []);

  const toggleFavorite = useCallback((key: string) => {
    if (key === "HSR Abs (m)") return;
    setFavoriteKeys((prev) => {
      const exists = prev.includes(key);
      const next = exists ? prev.filter((k) => k !== key) : [...prev, key];
      const result = next.filter((k) => k !== "HSR Abs (m)");
      const finalRes = result.length > 0 ? result : [key];
      setTimeout(() => {
        saveStoredFavoriteKeys(finalRes);
      }, 0);
      return finalRes;
    });
  }, []);

  const addDerivedVariable = useCallback(
    (item: Omit<GpsDerivedVariable, "id">) => {
      const id = "derived_" + Date.now();
      const newItem: GpsDerivedVariable = { ...item, id };
      const nextList = [newItem, ...derivedVariables];
      setDerivedVariables(nextList);
      saveStoredDerivedVariables(nextList);

      // Auto-añadir a favoritas
      if (!favoriteKeys.includes(id)) {
        const nextFav = [...favoriteKeys, id].filter((k) => k !== "HSR Abs (m)");
        setFavoriteKeys(nextFav);
        saveStoredFavoriteKeys(nextFav);
      }
      return newItem;
    },
    [derivedVariables, favoriteKeys]
  );

  const deleteDerivedVariable = useCallback(
    (id: string) => {
      const nextList = derivedVariables.filter((d) => d.id !== id);
      setDerivedVariables(nextList);
      saveStoredDerivedVariables(nextList);

      if (favoriteKeys.includes(id)) {
        const nextFav = favoriteKeys.filter((k) => k !== id && k !== "HSR Abs (m)");
        setFavoriteKeys(nextFav);
        saveStoredFavoriteKeys(nextFav);
      }
    },
    [derivedVariables, favoriteKeys]
  );

  const favoriteVariables = useMemo(() => {
    return allVariables.filter((v) => (favoriteKeys.includes(v.key) || v.esDerivada) && v.key !== "HSR Abs (m)");
  }, [allVariables, favoriteKeys]);

  return {
    favoriteKeys,
    favoriteVariables,
    derivedVariables,
    allVariables,
    updateFavorites,
    toggleFavorite,
    addDerivedVariable,
    deleteDerivedVariable,
    resetToDefaults: () => updateFavorites(DEFAULT_FAVORITE_GPS_VARIABLES),
  };
}
