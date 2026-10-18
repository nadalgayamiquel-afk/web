import { calculateGpsMetricValue, ALL_GPS_VARIABLES, DEFAULT_FAVORITE_GPS_VARIABLES } from "./gpsVariables";

export interface AnalyzedMatchPart {
  nombre: string;
  minutos: number;
  dist: number;
  rawTask: any;
}

export interface AnalyzedMatch {
  fecha: string;
  minutos: number;
  dist: number;
  parts: AnalyzedMatchPart[];
}

export interface CompetitiveProfilePlayer {
  jugadorId: string;
  nombre: string;
  apodo: string;
  dorsal: string;
  posicion: string;
  category: "real_varios" | "real_uno" | "estimado_45" | "copiado_posicion" | "sin_perfil";
  isReal: boolean;
  badgeText: string;
  shortBadgeText: string;
  asterisk: string;
  detailText: string;
  matchesCount: number;
  fullMatchesCount: number;
  halfMatchesCount: number;
  minutesMatch: number;
  analyzedMatches: AnalyzedMatch[];
  values: Record<string, number | null>;
  dist: number;
  mMin: number;
  hsr: number;
  sprint: number;
  accDec: number;
  load: number;
  maxSpeed: number;
}

export function isRecordSimulado(record: any): boolean {
  if (!record) return false;
  if (record.es_simulado === true) return true;
  if (String(record.tipo_registro || "").toUpperCase() === "SIMULADO") return true;
  if (String(record.origen_dato || "").toUpperCase() === "SIMULADO") return true;
  if (!record.metricas) return false;
  return Boolean(
    record.metricas.es_simulado ||
      String(record.metricas.tipo_registro || "").toUpperCase() === "SIMULADO" ||
      String(record.metricas.origen_dato || "").toUpperCase() === "SIMULADO" ||
      (record.metricas.colC && String(record.metricas.colC).toUpperCase().includes("SIMULA")) ||
      (record.metricas["REAL / SIMULADO"] && String(record.metricas["REAL / SIMULADO"]).toUpperCase().includes("SIMULA"))
  );
}

export function isMatchHalfTask(taskName?: string): boolean {
  if (!taskName) return false;
  const n = String(taskName).trim().toUpperCase();
  if (n.includes("PREPARTIDO") || n.includes("CALENTAMIENTO") || n.includes("ACTIVACI")) return false;
  if (n.includes("PRIMERA PART") || n.includes("PRIMERA PARTE") || n.includes("1ª PART") || n.includes("1A PART")) return true;
  if (n.includes("SEGONA PART") || n.includes("SEGUNDA PARTE") || n.includes("2ª PART") || n.includes("2A PART")) return true;
  return false;
}

export function isRateOrPeak(key: string): boolean {
  const k = (key || "").toLowerCase();
  return (
    k.includes("min") || // "Distancia / Min", "m/min"
    k.includes("speed") ||
    k.includes("velocidad") ||
    k.includes("max") ||
    k.includes("ratio") ||
    k.includes("porcentaje") ||
    k.includes("%")
  );
}

export function getCompactMetricHeader(key: string, rawLabel?: string): string {
  const k = (key || "").toLowerCase();
  const l = (rawLabel || "").toLowerCase();

  // 1. Distancia Total -> DT
  if (k === "distance(m)" || l.includes("distancia total") || (k.includes("distance") && !k.includes("+") && !k.includes("/"))) {
    return "DT";
  }

  // 2. Distancia 19,8 / HSR -> HSR
  if (
    k === "distance +21 (m)" ||
    k === "hsr abs (m)" ||
    k.includes("19,8") ||
    k.includes("19.8") ||
    l.includes("19,8") ||
    l.includes("19.8") ||
    l.includes("hsr") ||
    k === "hsr"
  ) {
    return "HSR";
  }

  // 3. Aceleraciones y Desaceleraciones -> Acc-Dec
  if (
    key === "Acc+Dec" ||
    l.includes("aceleraciones + desaceleraciones") ||
    (l.includes("aceleraciones") && l.includes("desaceleraciones"))
  ) {
    return "Acc-Dec";
  }

  // 4. Distancia / Min -> m/min
  if (k.includes("distancia / min") || k.includes("distancia/min") || l.includes("distancia por minuto")) {
    return "m/min";
  }

  // 5. MAX Speed -> Vmax
  if (k.includes("max speed") || l.includes("velocidad máxima") || l.includes("velocidad maxima")) {
    return "Vmax";
  }

  // 6. Sprints Count -> Sprints
  if (k.includes("sprints count") || l.includes("sprints")) {
    return "Sprints";
  }

  return rawLabel || key;
}

export function computeCompetitiveProfiles({
  gpsRecords,
  jugadores,
  customOverrides = {},
  availableFavVariables,
  derivedVariables = [],
}: {
  gpsRecords: any[];
  jugadores: any[];
  customOverrides?: Record<string, any>;
  availableFavVariables?: any[];
  derivedVariables?: any[];
}): Map<string, CompetitiveProfilePlayer> {
  const favVars =
    availableFavVariables && availableFavVariables.length > 0
      ? availableFavVariables
      : ALL_GPS_VARIABLES.filter((v) => DEFAULT_FAVORITE_GPS_VARIABLES.includes(v.key) && v.key !== "Duration(min)");

  const realGps = (gpsRecords || []).filter((r) => !isRecordSimulado(r));
  const playerMatchesMap = new Map<string, AnalyzedMatch[]>();

  realGps.forEach((r) => {
    if (!r.jugador_id) return;
    const isMatch =
      String(r.tipo_sesion || r.metricas?.tipo_sesion || "").toUpperCase().includes("PARTIDO") ||
      String(r.match_day || r.metricas?.match_day || "").toUpperCase() === "MD" ||
      r.es_partido === true;

    const tareas = r.metricas?.tareas;
    let matchParts: any[] = [];

    if (Array.isArray(tareas) && tareas.length > 0) {
      matchParts = tareas.filter((t: any) => isMatchHalfTask(t.nombre || t.name || t.tarea));
    }

    // Si no tiene array de tareas desglosadas pero es un partido registrado completo
    if (matchParts.length === 0 && isMatch) {
      const dur = Number(r.duracion || r.metricas?.["Duration(min)"] || r.minutos_totales || 90);
      const dist = calculateGpsMetricValue(r, "Distance(m)", derivedVariables);
      if (dist > 0) {
        if (!playerMatchesMap.has(r.jugador_id)) playerMatchesMap.set(r.jugador_id, []);
        playerMatchesMap.get(r.jugador_id)!.push({
          fecha: r.fecha,
          minutos: dur,
          dist,
          parts: [{ nombre: "Partido Completo", minutos: dur, dist, rawTask: r.metricas || r }],
        });
      }
      return;
    }

    if (matchParts.length === 0) return;

    if (!playerMatchesMap.has(r.jugador_id)) playerMatchesMap.set(r.jugador_id, []);

    const totalMinutes = matchParts.reduce((acc, t) => acc + Number(t.Tiempo || t.duracion_min || t.Duration || 0), 0);
    const totalDist = matchParts.reduce((acc, t) => acc + calculateGpsMetricValue(t, "Distance(m)", derivedVariables), 0);

    const parts: AnalyzedMatchPart[] = matchParts.map((t) => {
      const pMin = Number(t.Tiempo || t.duracion_min || t.Duration || 0);
      const pDist = calculateGpsMetricValue(t, "Distance(m)", derivedVariables);
      return {
        nombre: t.nombre || t.name || t.tarea || "Parte",
        minutos: pMin,
        dist: pDist,
        rawTask: t,
      };
    });

    playerMatchesMap.get(r.jugador_id)!.push({
      fecha: r.fecha,
      minutos: Math.round(totalMinutes * 10) / 10,
      dist: totalDist,
      parts,
    });
  });

  const profiles = new Map<string, CompetitiveProfilePlayer>();
  const positionProfilesMap = new Map<string, CompetitiveProfilePlayer[]>();

  // PASO 1: Calcular perfiles individuales para jugadores con minutos jugados
  (jugadores || []).forEach((j) => {
    const overrides = customOverrides[j.id] || {};
    const matches = playerMatchesMap.get(j.id) || [];
    const pos = (j.posicion || "JUG").toUpperCase();

    const fullMatches = matches.filter((m) => m.minutos >= 80);

    // Extraer todas las partes individuales de ~45 min (entre 38 y 65 min)
    const halfParts: AnalyzedMatchPart[] = [];
    matches.forEach((m) => {
      if (Array.isArray(m.parts)) {
        m.parts.forEach((p) => {
          if (p.minutos >= 38 && p.minutos <= 65) {
            halfParts.push(p);
          }
        });
      }
    });

    const p: CompetitiveProfilePlayer = {
      jugadorId: j.id,
      nombre: j.apodo || j.nombre,
      apodo: j.apodo || j.nombre,
      dorsal: j.dorsal,
      posicion: j.posicion,
      category: "copiado_posicion",
      isReal: false,
      badgeText: "Posición **",
      shortBadgeText: "Pos.**",
      asterisk: "**",
      detailText: "Sin minutos (<45'). Copiado de compañeros de posición (No real **)",
      matchesCount: matches.length,
      fullMatchesCount: fullMatches.length,
      halfMatchesCount: halfParts.length,
      minutesMatch: 90,
      analyzedMatches: matches,
      values: {},
      dist: 10200,
      mMin: 113,
      hsr: 650,
      sprint: 180,
      accDec: 85,
      load: 850,
      maxSpeed: 28.5,
    };

    if (fullMatches.length > 1) {
      // CASO 1: Varios partidos de 90 min -> (Máximo + Promedio) / 2
      p.category = "real_varios";
      p.isReal = true;
      p.badgeText = "90' (Máx+Prom)/2";
      p.shortBadgeText = "90'";
      p.asterisk = "";
      p.detailText = `${fullMatches.length} partidos oficiales de 90' ((Máx+Prom)/2)`;

      favVars.forEach((v) => {
        const vList = fullMatches.map((m) => {
          if (v.key === "Distancia / Min" || v.key.toLowerCase().includes("m/min")) {
            return m.minutos > 0 ? m.dist / m.minutos : 0;
          }
          if (isRateOrPeak(v.key)) {
            return Math.max(...m.parts.map((part) => calculateGpsMetricValue(part.rawTask, v.key, derivedVariables)));
          }
          return m.parts.reduce((acc, part) => acc + calculateGpsMetricValue(part.rawTask, v.key, derivedVariables), 0);
        });

        const maxVal = Math.max(...vList);
        const avgVal = vList.reduce((a, b) => a + b, 0) / vList.length;
        const finalVal =
          overrides[v.key] ?? (isRateOrPeak(v.key) ? Math.round(((maxVal + avgVal) / 2) * 10) / 10 : Math.round((maxVal + avgVal) / 2));
        p.values[v.key] = finalVal;
      });

      p.dist = (p.values["Distance(m)"] as number) || 10200;
      p.hsr = (p.values["Distance +21 (m)"] as number) || (p.values["HSR Abs (m)"] as number) || 650;
      p.sprint = (p.values["Sprint (m)"] as number) || 180;
      p.accDec = (p.values["Acc+Dec"] as number) || 85;
      p.load = (p.values["Player Load"] as number) || 850;
      p.mMin = (p.values["Distancia / Min"] as number) || 113;
      p.maxSpeed = (p.values["MAX Speed(km/h)"] as number) || 28.5;
      p.minutesMatch = Math.round(fullMatches.reduce((a, b) => a + b.minutos, 0) / fullMatches.length);

      profiles.set(j.id, p);

      if (!positionProfilesMap.has(pos)) positionProfilesMap.set(pos, []);
      positionProfilesMap.get(pos)!.push(p);
    } else if (fullMatches.length === 1) {
      // CASO 2: Solo 1 partido de 90 min -> valor directo de ese partido
      p.category = "real_uno";
      p.isReal = true;
      p.badgeText = "90' (1 partido)";
      p.shortBadgeText = "90'";
      p.asterisk = "";
      p.detailText = `1 partido de 90' (${fullMatches[0].fecha})`;

      const m = fullMatches[0];
      favVars.forEach((v) => {
        let raw: number;
        if (v.key === "Distancia / Min" || v.key.toLowerCase().includes("m/min")) {
          raw = m.minutos > 0 ? Math.round((m.dist / m.minutos) * 10) / 10 : 0;
        } else if (isRateOrPeak(v.key)) {
          raw = Math.max(...m.parts.map((part) => calculateGpsMetricValue(part.rawTask, v.key, derivedVariables)));
        } else {
          raw = m.parts.reduce((acc, part) => acc + calculateGpsMetricValue(part.rawTask, v.key, derivedVariables), 0);
        }
        p.values[v.key] = overrides[v.key] ?? (isRateOrPeak(v.key) ? Math.round(raw * 10) / 10 : Math.round(raw));
      });

      p.dist = (p.values["Distance(m)"] as number) || 10200;
      p.hsr = (p.values["Distance +21 (m)"] as number) || (p.values["HSR Abs (m)"] as number) || 650;
      p.sprint = (p.values["Sprint (m)"] as number) || 180;
      p.accDec = (p.values["Acc+Dec"] as number) || 85;
      p.load = (p.values["Player Load"] as number) || 850;
      p.mMin = (p.values["Distancia / Min"] as number) || 113;
      p.maxSpeed = (p.values["MAX Speed(km/h)"] as number) || 28.5;
      p.minutesMatch = m.minutos;

      profiles.set(j.id, p);

      if (!positionProfilesMap.has(pos)) positionProfilesMap.set(pos, []);
      positionProfilesMap.get(pos)!.push(p);
    } else if (halfParts.length > 0) {
      // CASO 3: <90 min pero al menos 45 min en una parte -> ESE 45 min x 2 (*)
      p.category = "estimado_45";
      p.isReal = false;
      p.badgeText = "45' x 2 *";
      p.shortBadgeText = "45'*";
      p.asterisk = "*";
      const best45 = [...halfParts].sort((a, b) => (b.minutos || 0) - (a.minutos || 0))[0];
      p.detailText = `Estimado: parte ${best45.nombre || "1ª parte"} (${best45.minutos}') x 2 (No real *)`;

      favVars.forEach((v) => {
        if (v.key === "Distancia / Min" || v.key.toLowerCase().includes("m/min")) {
          p.values[v.key] = overrides[v.key] ?? (best45.minutos > 0 ? Math.round((best45.dist / best45.minutos) * 10) / 10 : 0);
        } else if (isRateOrPeak(v.key)) {
          const raw = calculateGpsMetricValue(best45.rawTask, v.key, derivedVariables);
          p.values[v.key] = overrides[v.key] ?? Math.round(raw * 10) / 10;
        } else {
          const raw = calculateGpsMetricValue(best45.rawTask, v.key, derivedVariables);
          p.values[v.key] = overrides[v.key] ?? Math.round(raw * 2);
        }
      });

      p.dist = (p.values["Distance(m)"] as number) || Math.round(best45.dist * 2);
      p.hsr = (p.values["Distance +21 (m)"] as number) || (p.values["HSR Abs (m)"] as number) || 650;
      p.sprint = (p.values["Sprint (m)"] as number) || 180;
      p.accDec = (p.values["Acc+Dec"] as number) || 85;
      p.load = (p.values["Player Load"] as number) || 850;
      p.mMin = (p.values["Distancia / Min"] as number) || 113;
      p.maxSpeed = (p.values["MAX Speed(km/h)"] as number) || 28.5;
      p.minutesMatch = 90;

      profiles.set(j.id, p);
    } else {
      // CASO 4 PRE-MARCADO: <45 min
      profiles.set(j.id, p);
    }
  });

  // PASO 2: Resolver jugadores <45 min y porteros
  (jugadores || []).forEach((j) => {
    const p = profiles.get(j.id);
    if (p && p.category === "copiado_posicion") {
      const overrides = customOverrides[j.id] || {};
      const pos = (j.posicion || "JUG").toUpperCase();

      // Si es Portero (Nil, Lucas, etc.), no tienen datos GPS de partido ni se les copia de jugadores de campo
      if (pos.includes("POR")) {
        p.category = "sin_perfil";
        p.isReal = false;
        p.badgeText = "Sin perfil";
        p.shortBadgeText = "S/P";
        p.asterisk = "";
        p.detailText = "Portero sin datos GPS oficiales (Sin perfil competitivo)";
        favVars.forEach((v) => {
          p.values[v.key] = overrides[v.key] ?? null;
        });
        p.dist = overrides["Distance(m)"] ?? overrides.dist ?? 0;
        p.hsr = overrides["Distance +21 (m)"] ?? overrides.hsr ?? 0;
        p.sprint = overrides["Sprint (m)"] ?? overrides.sprint ?? 0;
        p.accDec = overrides["Acc+Dec"] ?? overrides.accDec ?? 0;
        p.load = overrides["Player Load"] ?? overrides.load ?? 0;
        p.mMin = overrides["Distancia / Min"] ?? overrides.mMin ?? 0;
        p.maxSpeed = overrides["MAX Speed(km/h)"] ?? overrides.maxSpeed ?? 0;
        return;
      }

      let pool = positionProfilesMap.get(pos);
      if (!pool || pool.length === 0) {
        if (pos.includes("DEF") || pos.includes("LAT") || pos.includes("CEN")) {
          pool = Array.from(positionProfilesMap.entries())
            .filter(([k]) => k.includes("DEF") || k.includes("LAT") || k.includes("CEN"))
            .flatMap(([, v]) => v);
        } else if (pos.includes("MED") || pos.includes("PIV") || pos.includes("INT")) {
          pool = Array.from(positionProfilesMap.entries())
            .filter(([k]) => k.includes("MED") || k.includes("PIV") || k.includes("INT"))
            .flatMap(([, v]) => v);
        } else if (pos.includes("DEL") || pos.includes("EXT") || pos.includes("PUN")) {
          pool = Array.from(positionProfilesMap.entries())
            .filter(([k]) => k.includes("DEL") || k.includes("EXT") || k.includes("PUN"))
            .flatMap(([, v]) => v);
        }
      }

      if (!pool || pool.length === 0) {
        pool = Array.from(positionProfilesMap.values()).flat();
      }

      favVars.forEach((v) => {
        if (pool && pool.length > 0) {
          const vals = pool.map((x) => (x.values[v.key] as number) ?? 0);
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          p.values[v.key] = overrides[v.key] ?? (isRateOrPeak(v.key) ? Math.round(avg * 10) / 10 : Math.round(avg));
        } else {
          p.values[v.key] = overrides[v.key] ?? null;
        }
      });

      p.dist = (p.values["Distance(m)"] as number) || 10200;
      p.hsr = (p.values["Distance +21 (m)"] as number) || (p.values["HSR Abs (m)"] as number) || 650;
      p.sprint = (p.values["Sprint (m)"] as number) || 180;
      p.accDec = (p.values["Acc+Dec"] as number) || 85;
      p.load = (p.values["Player Load"] as number) || 850;
      p.mMin = (p.values["Distancia / Min"] as number) || 113;
      p.maxSpeed = (p.values["MAX Speed(km/h)"] as number) || 28.5;
    }
  });

  return profiles;
}
