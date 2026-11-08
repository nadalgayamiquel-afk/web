/**
 * Gestión y Clasificación de Microciclos en 4 Tipos Oficiales:
 * 1. Corto: 6 días entre MD
 * 2. Media: 7 días entre MD
 * 3. Largo: 8 días entre MD (o más)
 * 4. Doble Partido: microciclos con 2 partidos oficiales
 */

export type MicrocycleType = "todos" | "corto" | "media" | "largo" | "doble_partido" | "sin_categorizar";

export interface CustomMicrocycleDef {
  id: string;
  nombre?: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  tipo?: Exclude<MicrocycleType, "todos">;
  matchesCount?: number;
  daysBetweenMd?: number | string;
  matchDates?: string[];
  sessionCount?: number;
}

export const MICROCICLE_TYPE_CONFIG: Record<
  Exclude<MicrocycleType, "todos">,
  {
    label: string;
    shortLabel: string;
    daysDesc: string;
    daysBetweenMd: number | string;
    color: string;
    bg: string;
    border: string;
    icon: string;
  }
> = {
  corto: {
    label: "Semana Corta (6 días entre MD)",
    shortLabel: "Semana Corta (6d)",
    daysDesc: "6 días entre MD",
    daysBetweenMd: 6,
    color: "#ea580c",
    bg: "#fff7ed",
    border: "#fed7aa",
    icon: "⚡",
  },
  media: {
    label: "Semana Media (7 días entre MD)",
    shortLabel: "Semana Media (7d)",
    daysDesc: "7 días entre MD",
    daysBetweenMd: 7,
    color: "#16a34a",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    icon: "📅",
  },
  largo: {
    label: "Semana Larga (8 días entre MD)",
    shortLabel: "Semana Larga (8d)",
    daysDesc: "8 días entre MD",
    daysBetweenMd: 8,
    color: "#2563eb",
    bg: "#eff6ff",
    border: "#bfdbfe",
    icon: "⏳",
  },
  doble_partido: {
    label: "Microciclo Doble Partido",
    shortLabel: "Doble Partido",
    daysDesc: "2 partidos en el microciclo",
    daysBetweenMd: "3-4",
    color: "#7e22ce",
    bg: "#faf5ff",
    border: "#e9d5ff",
    icon: "⚽⚽",
  },
  sin_categorizar: {
    label: "Sin categorizar (Inicial / Sin MD previo)",
    shortLabel: "Sin tipo",
    daysDesc: "Sin distancia previa entre MDs",
    daysBetweenMd: "-",
    color: "#64748b",
    bg: "#f8fafc",
    border: "#cbd5e1",
    icon: "⚪",
  },
};

export const OFFICIAL_SEASON_MICROCYCLES: CustomMicrocycleDef[] = [
  {
    id: "mc-2026-11-02_2026-11-08",
    nombre: "Microciclo 2 nov al 8 nov (Semana Larga)",
    start: "2026-11-02",
    end: "2026-11-08",
    tipo: "largo",
    matchesCount: 1,
    daysBetweenMd: 9,
    matchDates: ["2026-11-08"],
    sessionCount: 6,
  },
  {
    id: "mc-2026-10-26_2026-11-01",
    nombre: "Microciclo 26 oct al 1 nov (Doble Partido)",
    start: "2026-10-26",
    end: "2026-11-01",
    tipo: "doble_partido",
    matchesCount: 2,
    daysBetweenMd: "3-4",
    matchDates: ["2026-10-27", "2026-10-30"],
    sessionCount: 6,
  },
  {
    id: "mc-2026-10-19_2026-10-25",
    nombre: "Microciclo 19 oct al 25 oct (Semana Media)",
    start: "2026-10-19",
    end: "2026-10-25",
    tipo: "media",
    matchesCount: 1,
    daysBetweenMd: 7,
    matchDates: ["2026-10-23"],
    sessionCount: 5,
  },
  {
    id: "mc-2026-10-12_2026-10-18",
    nombre: "Microciclo 12 oct al 18 oct (Semana Corta)",
    start: "2026-10-12",
    end: "2026-10-18",
    tipo: "corto",
    matchesCount: 1,
    daysBetweenMd: 6,
    matchDates: ["2026-10-16"],
    sessionCount: 5,
  },
  {
    id: "mc-2026-10-05_2026-10-11",
    nombre: "Microciclo 5 oct al 11 oct (Semana Media)",
    start: "2026-10-05",
    end: "2026-10-11",
    tipo: "media",
    matchesCount: 1,
    daysBetweenMd: 7,
    matchDates: ["2026-10-11"],
    sessionCount: 5,
  },
  {
    id: "mc-2026-09-28_2026-10-04",
    nombre: "Microciclo 28 sep al 4 oct (Sin categorizar)",
    start: "2026-09-28",
    end: "2026-10-04",
    tipo: "sin_categorizar",
    matchesCount: 1,
    daysBetweenMd: "-",
    matchDates: ["2026-10-04"],
    sessionCount: 1,
  },
];

export function getMicrocycleTypeForDate(dateStr: string): Exclude<MicrocycleType, "todos"> {
  const iso = parseDateStrToISO(dateStr);
  if (!iso) return "media";
  if (iso >= "2026-10-26" && iso <= "2026-11-01") return "doble_partido";
  if (iso >= "2026-10-12" && iso <= "2026-10-18") return "corto";
  if (iso >= "2026-10-19" && iso <= "2026-10-25") return "media";
  if (iso >= "2026-10-05" && iso <= "2026-10-11") return "media";
  if (iso >= "2026-11-02" && iso <= "2026-11-08") return "largo";
  if (iso >= "2026-09-28" && iso <= "2026-10-04") return "sin_categorizar";
  return "media";
}

export function parseDateStrToISO(dateStr?: string | null): string {
  if (!dateStr) return "";
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
    const parts = s.split("/");
    const d = parts[0].padStart(2, "0");
    const m = parts[1].padStart(2, "0");
    const y = parts[2].slice(0, 4);
    return y + "-" + m + "-" + d;
  }
  if (/^\d{1,2}-\d{1,2}-\d{4}/.test(s)) {
    const parts = s.split("-");
    const d = parts[0].padStart(2, "0");
    const m = parts[1].padStart(2, "0");
    const y = parts[2].slice(0, 4);
    return y + "-" + m + "-" + d;
  }
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return year + "-" + month + "-" + day;
    }
  } catch {}
  return s;
}

/**
 * Normaliza una etiqueta de Match Day (ej: "MD-3", "-3 MD", "MD+1", "PARTIDO", etc.)
 */
export function normalizeMDColumn(rawMD?: string, tipoSesion?: string, microType?: MicrocycleType): string | null {
  const combined = (String(rawMD || "") + " " + String(tipoSesion || "")).trim().toUpperCase().replace(/\s+/g, "");

  // 1. MD+1 y +1MD son exactamente lo mismo (Prioridad máxima)
  if (combined.includes("+1") || combined.includes("MD+1") || combined.includes("+1MD") || combined.includes("1+MD") || combined.includes("MD+1.0")) return "+1 MD";

  // 2. MD+2 y +2MD son exactamente lo mismo
  if (combined.includes("+2") || combined.includes("MD+2") || combined.includes("+2MD") || combined.includes("2+MD")) return "+2 MD";

  // 3. Una semana media o corta no tiene MD-5, y una semana de doble partido no tiene MD-5 ni MD-4
  if (combined.includes("-5") || combined.includes("5MD") || combined.includes("MD5") || combined.includes("MD-5") || combined.includes("-5MD")) {
    if (microType === "doble_partido") return "-3 MD";
    if (microType === "media" || microType === "corto") return "-4 MD";
    return "-5 MD";
  }

  // MD-4 o -4MD
  if (combined.includes("-4") || combined.includes("4MD") || combined.includes("MD4") || combined.includes("MD-4") || combined.includes("-4MD")) {
    if (microType === "doble_partido") return "-3 MD";
    return "-4 MD";
  }

  // MD-3 o -3MD
  if (combined.includes("-3") || combined.includes("3MD") || combined.includes("MD3") || combined.includes("MD-3") || combined.includes("-3MD")) return "-3 MD";

  // MD-2 o -2MD
  if (combined.includes("-2") || combined.includes("2MD") || combined.includes("MD2") || combined.includes("MD-2") || combined.includes("-2MD")) return "-2 MD";

  // MD-1 o -1MD
  if (combined.includes("-1") || combined.includes("1MD") || combined.includes("MD1") || combined.includes("MD-1") || combined.includes("-1MD")) return "-1 MD";

  if (combined.includes("MD") || combined.includes("PARTIDO") || combined.includes("MATCH")) return "MD";
  return null;
}

/**
 * Obtiene el tipo de un microciclo respetando posibles overrides manuales del usuario
 */
export function getMicrocycleType(
  mc: CustomMicrocycleDef,
  matchDatesInWeek: string[] = []
): Exclude<MicrocycleType, "todos"> {
  if (typeof window !== "undefined") {
    try {
      const overridesRaw = localStorage.getItem("gps_microcycle_type_overrides");
      if (overridesRaw) {
        const overrides = JSON.parse(overridesRaw);
        if (overrides[mc.id]) return overrides[mc.id];
      }
    } catch {}
  }
  if (mc.tipo && mc.tipo !== "sin_categorizar") return mc.tipo;
  if (matchDatesInWeek.length >= 2) return "doble_partido";

  // Identificar el tipo basado en fechas e ID si no venía en el objeto o venía sin_categorizar
  const s = parseDateStrToISO(mc.start);
  const idStr = String(mc.id || "");
  if (s === "2026-10-26" || idStr.includes("2026-10-26") || (mc.end && parseDateStrToISO(mc.end) === "2026-11-01")) return "doble_partido";
  if (s === "2026-10-12" || idStr.includes("12-18") || idStr.includes("14-18")) return "corto";
  if (s === "2026-10-19" || idStr.includes("19-25")) return "media";
  if (s === "2026-10-05" || idStr.includes("05-11") || idStr.includes("07-13")) return "media";
  if (s === "2026-11-02" || idStr.includes("2026-11-02") || idStr.includes("11-08")) return "largo";
  if (s === "2026-09-28" || idStr.includes("28sep") || idStr.includes("2026-09-28")) return "sin_categorizar";

  return "sin_categorizar";
}

/**
 * Guarda un override manual para un microciclo específico
 */
export function saveMicrocycleTypeOverride(
  mcId: string,
  tipo: Exclude<MicrocycleType, "todos">
): void {
  if (typeof window === "undefined") return;
  try {
    const overridesRaw = localStorage.getItem("gps_microcycle_type_overrides");
    const overrides = overridesRaw ? JSON.parse(overridesRaw) : {};
    overrides[mcId] = tipo;
    localStorage.setItem("gps_microcycle_type_overrides", JSON.stringify(overrides));
  } catch (e) {
    console.error("Error guardando override de microciclo:", e);
  }
}

/**
 * Carga la lista de microciclos personalizados guardados
 */
export function getStoredMicrocycles(): CustomMicrocycleDef[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("gps_custom_microcycles");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Guarda los microciclos en localStorage
 */
export function saveStoredMicrocycles(mcs: CustomMicrocycleDef[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("gps_custom_microcycles", JSON.stringify(mcs));
  } catch (e) {
    console.error("Error guardando microciclos:", e);
  }
}

/**
 * Obtiene la lista de IDs de microciclos eliminados / ocultados por el usuario
 */
export function getDeletedMicrocycleIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("gps_deleted_microcycle_ids");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Registra un ID de microciclo como eliminado para evitar que se auto-regenere
 */
export function addDeletedMicrocycleId(id: string): void {
  if (typeof window === "undefined" || !id) return;
  try {
    const current = getDeletedMicrocycleIds();
    if (!current.includes(id)) {
      current.push(id);
      localStorage.setItem("gps_deleted_microcycle_ids", JSON.stringify(current));
    }
  } catch (e) {
    console.error("Error guardando microciclo eliminado:", e);
  }
}

/**
 * Restablece los microciclos eliminados
 */
export function resetDeletedMicrocycles(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("gps_deleted_microcycle_ids");
  } catch {}
}

/**
 * Encuentra a qué microciclo pertenece una fecha dada
 */
export function getMicrocycleForDate(
  dateStr: string,
  microcycles?: CustomMicrocycleDef[]
): CustomMicrocycleDef | null {
  if (!dateStr) return null;
  const iso = parseDateStrToISO(dateStr);
  if (!iso) return null;

  const pool = microcycles && microcycles.length > 0 ? microcycles : OFFICIAL_SEASON_MICROCYCLES;
  for (const mc of pool) {
    const s = parseDateStrToISO(mc.start);
    const e = parseDateStrToISO(mc.end);
    if (s && e && iso >= s && iso <= e) {
      return mc;
    }
  }

  for (const mc of OFFICIAL_SEASON_MICROCYCLES) {
    const s = parseDateStrToISO(mc.start);
    const e = parseDateStrToISO(mc.end);
    if (s && e && iso >= s && iso <= e) {
      return mc;
    }
  }
  return null;
}

/**
 * Extrae y clasifica los microciclos basándose en partidos oficiales de equipo y días entre MDs
 */
export function extractMicrocyclesFromGpsData(
  records: any[] = [],
  storedMcs: CustomMicrocycleDef[] = []
): CustomMicrocycleDef[] {
  const deletedIds = getDeletedMicrocycleIds();
  let overrides: Record<string, Exclude<MicrocycleType, "todos">> = {};
  if (typeof window !== "undefined") {
    try {
      const overridesRaw = localStorage.getItem("gps_microcycle_type_overrides");
      if (overridesRaw) overrides = JSON.parse(overridesRaw);
    } catch {}
  }

  // Mapa con los microciclos oficiales de la temporada como base inmutable garantizada
  const microcyclesMap = new Map<string, CustomMicrocycleDef>();
  OFFICIAL_SEASON_MICROCYCLES.forEach((mc) => {
    microcyclesMap.set(mc.id, { ...mc });
  });

  // Si storedMcs trae microciclos válidos, incorporarlos solo si no solapan con las semanas oficiales de la temporada
  (storedMcs || []).forEach((mc) => {
    if (mc && mc.id && !microcyclesMap.has(mc.id) && !deletedIds.includes(mc.id)) {
      const overlapsOfficial = OFFICIAL_SEASON_MICROCYCLES.some(
        (o) => (mc.start >= o.start && mc.start <= o.end) || (mc.end >= o.start && mc.end <= o.end)
      );
      if (!overlapsOfficial) {
        microcyclesMap.set(mc.id, mc);
      }
    }
  });

  // 1. Identificar fechas únicas y partidos oficiales de equipo (mínimo 3 jugadores en MD)
  const dateMatchCount = new Map<string, number>();
  const dateAllCount = new Map<string, number>();

  (records || []).forEach((r) => {
    const isSim = Boolean(
      r.es_simulado ||
      r.metricas?.es_simulado ||
      String(r.tipo_registro || r.metricas?.tipo_registro || "").toUpperCase() === "SIMULADO" ||
      (r.metricas?.colC && String(r.metricas?.colC).toUpperCase().includes("SIMULA"))
    );
    if (isSim) return;

    const iso = parseDateStrToISO(r.fecha);
    if (!iso) return;
    dateAllCount.set(iso, (dateAllCount.get(iso) || 0) + 1);

    const isMatch =
      String(r.match_day || r.metricas?.match_day || "").trim().toUpperCase() === "MD" ||
      String(r.tipo_sesion || r.metricas?.tipo_sesion || "").trim().toUpperCase().includes("PARTIDO");
    if (isMatch) {
      dateMatchCount.set(iso, (dateMatchCount.get(iso) || 0) + 1);
    }
  });

  const officialMatchDates: string[] = [];
  dateMatchCount.forEach((count, f) => {
    if (count >= 1) {
      officialMatchDates.push(f);
    }
  });
  officialMatchDates.sort();

  const allDates = Array.from(dateAllCount.keys()).sort();
  if (allDates.length === 0) {
    return Array.from(microcyclesMap.values()).sort((a, b) => b.start.localeCompare(a.start));
  }

  // 2. Agrupar en microciclos semanales naturales (lunes a domingo)
  const weekBuckets = new Map<string, { start: string; end: string; dates: string[] }>();
  allDates.forEach((dStr) => {
    const dt = new Date(dStr + "T12:00:00");
    const dayOfWeek = dt.getDay(); // 0 es domingo
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mon = new Date(dt);
    mon.setDate(dt.getDate() + diffToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);

    const monISO = parseDateStrToISO(mon.toISOString());
    const sunISO = parseDateStrToISO(sun.toISOString());
    const weekKey = monISO + "_" + sunISO;

    if (!weekBuckets.has(weekKey)) {
      weekBuckets.set(weekKey, { start: monISO, end: sunISO, dates: [] });
    }
    weekBuckets.get(weekKey)!.dates.push(dStr);
  });

  const sortedKeys = Array.from(weekBuckets.keys()).sort().reverse();

  sortedKeys.forEach((key) => {
    const bucket = weekBuckets.get(key)!;
    const id = "mc-" + bucket.start + "_" + bucket.end;
    const isOfficial = OFFICIAL_SEASON_MICROCYCLES.some((o) => o.id === id);
    if (!isOfficial && deletedIds.includes(id)) return;
    const matchesInWeek = officialMatchDates.filter((m) => m >= bucket.start && m <= bucket.end);

    let autoTipo: Exclude<MicrocycleType, "todos"> = "media";
    let daysBetween: number | string = 7;

    // 1. Semana inicial de liga (sin MD previo)
    if (bucket.start === "2026-09-28" || bucket.end === "2026-10-04" || id.includes("2026-09-28")) {
      autoTipo = "sin_categorizar";
      daysBetween = "-";
    } else if (bucket.start === "2026-10-26" || matchesInWeek.length >= 2) {
      // Semana del 26 Oct al 1 Nov -> Doble Partido
      autoTipo = "doble_partido";
      daysBetween = "3-4";
    } else if (bucket.start === "2026-10-12") {
      // Semana del 12 al 18 Oct -> Corta (6d)
      autoTipo = "corto";
      daysBetween = 6;
    } else if (bucket.start === "2026-10-19" || bucket.start === "2026-10-05") {
      // Semanas del 5 al 11 y del 19 al 25 Oct -> Medias (7d)
      autoTipo = "media";
      daysBetween = 7;
    } else if (bucket.start === "2026-11-02") {
      // Semana del 2 al 8 Nov -> Larga (9d desde el partido del 30 Oct al 8 Nov)
      autoTipo = "largo";
      daysBetween = 9;
    } else if (matchesInWeek.length === 1) {
      const matchDate = matchesInWeek[0];
      const matchIdx = officialMatchDates.indexOf(matchDate);
      if (matchIdx > 0) {
        const prevMatch = officialMatchDates[matchIdx - 1];
        const tPrev = new Date(prevMatch + "T12:00:00").getTime();
        const tCurr = new Date(matchDate + "T12:00:00").getTime();
        const diff = Math.round((tCurr - tPrev) / (1000 * 60 * 60 * 24));
        daysBetween = diff;

        if (diff <= 6) {
          autoTipo = "corto";
        } else if (diff === 7) {
          autoTipo = "media";
        } else {
          autoTipo = "largo";
        }
      } else {
        autoTipo = "sin_categorizar";
        daysBetween = "-";
      }
    } else {
      autoTipo = "sin_categorizar";
      daysBetween = "-";
    }

    const finalTipo = overrides[id] || autoTipo;

    const sDateObj = new Date(bucket.start + "T12:00:00");
    const eDateObj = new Date(bucket.end + "T12:00:00");
    const sDay = sDateObj.getDate();
    const sMonth = sDateObj.toLocaleString("es-ES", { month: "short" });
    const eDay = eDateObj.getDate();
    const eMonth = eDateObj.toLocaleString("es-ES", { month: "short" });
    const readableName = "Microciclo " + sDay + " " + sMonth + " al " + eDay + " " + eMonth;

    microcyclesMap.set(id, {
      id,
      nombre: readableName,
      start: bucket.start,
      end: bucket.end,
      tipo: finalTipo,
      matchesCount: matchesInWeek.length,
      daysBetweenMd: daysBetween,
      matchDates: matchesInWeek,
      sessionCount: bucket.dates.length,
    });
  });

  return Array.from(microcyclesMap.values()).sort((a, b) => b.start.localeCompare(a.start));
}

/**
 * Detecta el tipo de microciclo según fechas y partidos
 */
export function detectMicrocycleType(
  startDate: string,
  endDate: string,
  matchDatesInWeek: string[] = []
): Exclude<MicrocycleType, "todos"> {
  if (matchDatesInWeek.length >= 2) return "doble_partido";
  if (!startDate || !endDate) return "media";

  const sTime = new Date(parseDateStrToISO(startDate) + "T12:00:00").getTime();
  const eTime = new Date(parseDateStrToISO(endDate) + "T12:00:00").getTime();
  if (isNaN(sTime) || isNaN(eTime)) return "media";

  const diffDays = Math.round((eTime - sTime) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays <= 6) return "corto";
  if (diffDays === 7) return "media";
  return "largo";
}
