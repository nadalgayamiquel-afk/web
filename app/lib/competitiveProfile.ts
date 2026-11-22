import { calculateGpsMetricValue, ALL_GPS_VARIABLES, DEFAULT_FAVORITE_GPS_VARIABLES } from "./gpsVariables";

export interface AnalyzedMatchPart {
  nombre: string;
  minutos: number;
  dist: number;
  rawTask: any;
  fecha?: string;
}

export interface AnalyzedMatch {
  fecha: string;
  minutos: number;
  dist: number;
  parts: AnalyzedMatchPart[];
  rival?: string;
  tipo_sesion?: string;
  rawRecord?: any;
}

export interface MetricMatchPart {
  nombre: string;
  minutos: number;
  val: number;
}

export interface MetricMatchBreakdown {
  fecha: string;
  minutos: number;
  partes: MetricMatchPart[];
  totalMatchVal: number;
}

export interface MetricPeerBreakdown {
  jugadorId: string;
  apodo: string;
  posicion: string;
  val: number;
}

export interface MetricExplanation {
  key: string;
  label: string;
  unit: string;
  category: "real_varios" | "real_uno" | "estimado_45" | "copiado_posicion" | "sin_perfil";
  isOverridden: boolean;
  overrideVal?: number | null;
  calculatedVal: number | null;
  finalVal: number | null;
  summary: string;
  formula: string;
  steps: string[];
  matches?: MetricMatchBreakdown[];
  best45?: {
    nombre: string;
    minutos: number;
    partVal: number;
    factor: number;
  };
  peers?: MetricPeerBreakdown[];
}

export interface CompetitiveProfilePlayer {
  jugadorId: string;
  nombre: string;
  apodo: string;
  dorsal: string;
  posicion: string;
  category: "real_varios" | "real_uno" | "estimado_45" | "copiado_posicion" | "sin_perfil";
  isReal: boolean;
  isCustomMatches?: boolean;
  customMatchesCount?: number;
  badgeText: string;
  shortBadgeText: string;
  asterisk: string;
  detailText: string;
  methodDescription?: string;
  usedMatchesList?: Array<{
    fecha: string;
    minutos: number;
    desc: string;
    isFull: boolean;
    dist?: number;
    velMax?: number;
    tipo?: string;
  }>;
  allAvailableMatches?: AnalyzedMatch[];
  matchesCount: number;
  fullMatchesCount: number;
  halfMatchesCount: number;
  minutesMatch: number;
  analyzedMatches: AnalyzedMatch[];
  values: Record<string, number | null>;
  explanations: Record<string, MetricExplanation>;
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

export function isFirstHalfTask(taskName?: string): boolean {
  if (!taskName) return false;
  const n = String(taskName).trim().toUpperCase();
  if (n.includes("PREPARTIDO") || n.includes("CALENTAMIENTO") || n.includes("ACTIVACI") || n.includes("CARRERAS") || n.includes("BTB")) return false;
  return (
    n.includes("PRIMERA") ||
    n.includes("1ª") ||
    n.includes("1A") ||
    n.includes("1ER") ||
    n.includes("1R") ||
    n.includes("1º") ||
    n.includes("1 TEMPS") ||
    n.includes("1 TIEMPO") ||
    n.includes("FIRST") ||
    n.includes("1ST")
  );
}

export function isSecondHalfTask(taskName?: string): boolean {
  if (!taskName) return false;
  const n = String(taskName).trim().toUpperCase();
  if (n.includes("PREPARTIDO") || n.includes("CALENTAMIENTO") || n.includes("ACTIVACI") || n.includes("CARRERAS") || n.includes("BTB")) return false;
  return (
    n.includes("SEGUNDA") ||
    n.includes("SEGONA") ||
    n.includes("2ª") ||
    n.includes("2A") ||
    n.includes("2DO") ||
    n.includes("2N") ||
    n.includes("2ON") ||
    n.includes("2NA") ||
    n.includes("2DA") ||
    n.includes("2º") ||
    n.includes("2 TEMPS") ||
    n.includes("2 TIEMPO") ||
    n.includes("SECOND") ||
    n.includes("2ND")
  );
}

export function isMatchHalfTask(taskName?: string): boolean {
  return isFirstHalfTask(taskName) || isSecondHalfTask(taskName);
}

export function isFullMatchTask(taskName?: string): boolean {
  if (!taskName) return false;
  const n = String(taskName).trim().toUpperCase();
  if (
    n.includes("PREPARTIDO") ||
    n.includes("CALENTAMIENTO") ||
    n.includes("ACTIVACI") ||
    n.includes("CARRERAS") ||
    n.includes("BTB") ||
    n.includes("REDUCIDO") ||
    n.includes("MEDIO") ||
    n.includes("JDP") ||
    n.includes("POSICION") ||
    n.includes("RONDO") ||
    n.includes("CONDICIONADO")
  ) {
    return false;
  }
  return (
    n === "PARTIDO" ||
    n === "PARTIT" ||
    n === "MATCH" ||
    n === "PARTIDO COMPLETO" ||
    n === "PARTIT COMPLET" ||
    n === "COMPETICION" ||
    n === "COMPETICIÓN"
  );
}

export function formatProfileMatchDate(d: string): string {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return d;
}

export function getAllTeamMatches(gpsRecords: any[]): Array<{ fecha: string; label: string; count: number }> {
  const map = new Map<string, { fecha: string; label: string; count: number }>();
  (gpsRecords || []).forEach((r) => {
    if (!r.fecha) return;
    if (isRecordSimulado(r)) return;
    const isMatch =
      String(r.tipo_sesion || r.metricas?.tipo_sesion || "").toUpperCase().includes("PARTIDO") ||
      String(r.match_day || r.metricas?.match_day || "").toUpperCase() === "MD" ||
      r.es_partido === true;

    const tareas = r.metricas?.tareas;
    let hasMatchTasks = false;
    if (tareas && typeof tareas === "object") {
      const rawList = Array.isArray(tareas) ? tareas : Object.values(tareas);
      hasMatchTasks = rawList.some((t: any) =>
        isMatchHalfTask(t?.nombre || t?.name || t?.tarea || t?.Split_Name) ||
        isFullMatchTask(t?.nombre || t?.name || t?.tarea || t?.Split_Name)
      );
    }

    if (isMatch || hasMatchTasks) {
      if (!map.has(r.fecha)) {
        const rival =
          r.metricas?.rival ||
          r.rival ||
          (r.tarea && r.tarea.toLowerCase() !== "total" ? r.tarea : null) ||
          r.tipo_sesion ||
          "Partido";
        map.set(r.fecha, {
          fecha: r.fecha,
          label: `${formatProfileMatchDate(r.fecha)}${rival ? ` (${rival})` : ""}`,
          count: 0,
        });
      }
      map.get(r.fecha)!.count++;
    }
  });

  return Array.from(map.values()).sort((a, b) => b.fecha.localeCompare(a.fecha));
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

  // 1b. Distancia +21 km/h
  if (k === "distance +21 (m)" || k.includes("+21") || l.includes("+21") || l.includes(">21")) {
    return "+21 km/h";
  }

  // 2. Distancia 19,8 / HSR -> HSR
  if (
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

  // 5.5 Métricas de Máxima Velocidad (+28 km/h)
  if (k.includes("28") || l.includes("28")) {
    if (k.includes("num") || k.includes("count") || l.includes("acciones") || l.includes("nº")) {
      return "Nº Sprints 28";
    }
    return "Sprint 28";
  }

  // 6. Sprints Count (+24 km/h)
  if (k.includes("sprints count") || l.includes("nº de sprints") || l.includes("sprints count")) {
    return "Nº Sprints";
  }

  // 7. Sprint (+24 km/h) Distancia
  if (k.includes("+ 24") || k.includes("+24") || l.includes("+24") || k.includes("sprint (m)") || l.includes("sprint")) {
    return "Sprint 24";
  }

  return rawLabel || key;
}

export function computeCompetitiveProfiles({
  gpsRecords,
  jugadores,
  customOverrides = {},
  availableFavVariables,
  derivedVariables = [],
  customPlayerMatches = {},
}: {
  gpsRecords: any[];
  jugadores: any[];
  customOverrides?: Record<string, any>;
  availableFavVariables?: any[];
  derivedVariables?: any[];
  customPlayerMatches?: Record<string, string[]>;
}): Map<string, CompetitiveProfilePlayer> {
  // Construir mapa de todas las variables posibles para que cualquier variable elegida tenga cálculo y explicación completa
  const allVarsMap = new Map<string, any>();
  ALL_GPS_VARIABLES.forEach((v) => allVarsMap.set(v.key, v));
  (availableFavVariables || []).forEach((v) => allVarsMap.set(v.key, v));
  (derivedVariables || []).forEach((v) => {
    allVarsMap.set(v.id || v.key, {
      key: v.id || v.key,
      label: v.label,
      shortLabel: v.shortLabel,
      unit: v.unit,
      categoria: "Variables Derivadas",
    });
  });
  const varsToCompute = Array.from(allVarsMap.values());

  const realGps = (gpsRecords || []).filter((r) => !isRecordSimulado(r));
  const playerMatchesMap = new Map<string, AnalyzedMatch[]>();

  realGps.forEach((r) => {
    if (!r.jugador_id || !r.fecha) return;
    const isMatch =
      String(r.tipo_sesion || r.metricas?.tipo_sesion || "").toUpperCase().includes("PARTIDO") ||
      String(r.match_day || r.metricas?.match_day || "").toUpperCase() === "MD" ||
      r.es_partido === true;

    const tareas = r.metricas?.tareas;
    let matchParts: any[] = [];

    if (tareas && typeof tareas === "object") {
      const rawList = Array.isArray(tareas) ? tareas : Object.values(tareas);
      matchParts = rawList.filter((t: any) => {
        const tName = t?.nombre || t?.name || t?.tarea || t?.Split_Name;
        return isMatchHalfTask(tName) || isFullMatchTask(tName);
      });
    }

    if (matchParts.length === 0 && !isMatch) return;

    if (!playerMatchesMap.has(r.jugador_id)) playerMatchesMap.set(r.jugador_id, []);
    const playerMatches = playerMatchesMap.get(r.jugador_id)!;

    let existingMatch = playerMatches.find((m) => m.fecha === r.fecha);
    if (!existingMatch) {
      existingMatch = {
        fecha: r.fecha,
        minutos: 0,
        dist: 0,
        parts: [],
        rival:
          r.metricas?.rival ||
          r.rival ||
          (r.tarea && r.tarea.toLowerCase() !== "total" ? r.tarea : null) ||
          r.tipo_sesion ||
          "Partido",
        tipo_sesion: r.tipo_sesion,
        rawRecord: r,
      };
      playerMatches.push(existingMatch);
    }

    if (matchParts.length > 0) {
      matchParts.forEach((t) => {
        const pMin = Number(t.Tiempo || t.duracion_min || t.Duration || 0);
        const pDist = calculateGpsMetricValue(t, "Distance(m)", derivedVariables);
        existingMatch!.parts.push({
          nombre: t.nombre || t.name || t.tarea || t.Split_Name || "Parte",
          minutos: Math.round(pMin * 10) / 10,
          dist: pDist,
          rawTask: t,
          fecha: r.fecha,
        });
        existingMatch!.minutos = Math.round((existingMatch!.minutos + pMin) * 10) / 10;
        existingMatch!.dist += pDist;
      });
    } else if (isMatch) {
      const dur = Number(r.duracion || r.metricas?.["Duration(min)"] || r.minutos_totales || 0);
      const dist = calculateGpsMetricValue(r, "Distance(m)", derivedVariables);
      if (dur > 0 || dist > 0) {
        existingMatch.parts.push({
          nombre: "Partido Completo",
          minutos: dur || 90,
          dist,
          rawTask: r.metricas || r,
          fecha: r.fecha,
        });
        existingMatch.minutos = Math.round((existingMatch.minutos + (dur || 90)) * 10) / 10;
        existingMatch.dist += dist;
      }
    }
  });

  const profiles = new Map<string, CompetitiveProfilePlayer>();
  const positionProfilesMap = new Map<string, CompetitiveProfilePlayer[]>();

  // PASO 1: Calcular perfiles individuales para jugadores
  (jugadores || []).forEach((j) => {
    const overrides = customOverrides[j.id] || {};
    const matches = playerMatchesMap.get(j.id) || [];
    const pos = (j.posicion || "JUG").toUpperCase();

    // Ordenar partidos del más reciente al más antiguo
    const allSortedMatches = [...matches].sort((a, b) => b.fecha.localeCompare(a.fecha));

    // Detección automática oficial: partidos de 90' (>=70 min o ambas partes con >=60 min)
    const autoFullMatches = allSortedMatches.filter(
      (m) =>
        m.minutos >= 70 ||
        (m.parts.some((pt) => isFirstHalfTask(pt.nombre)) &&
          m.parts.some((pt) => isSecondHalfTask(pt.nombre)) &&
          m.minutos >= 60)
    );

    // Extraer todas las partes individuales de ~45 min (entre 35 y 65 min) que no pertenezcan ya a un partido completo
    const halfParts: AnalyzedMatchPart[] = [];
    allSortedMatches.forEach((m) => {
      if (m.parts && m.parts.length > 0) {
        m.parts.forEach((p) => {
          if (p.minutos >= 35 && p.minutos <= 65) {
            halfParts.push(p);
          }
        });
      }
    });

    // Determinar si el jugador tiene una selección manual personalizada de partidos
    const customDates = customPlayerMatches?.[j.id];
    const isCustom = Array.isArray(customDates);

    let matchesToUse: AnalyzedMatch[] = [];
    if (isCustom) {
      matchesToUse = allSortedMatches.filter((m) => customDates.includes(m.fecha));
    } else {
      matchesToUse = autoFullMatches;
    }

    const p: CompetitiveProfilePlayer = {
      jugadorId: j.id,
      nombre: j.apodo || j.nombre,
      apodo: j.apodo || j.nombre,
      dorsal: j.dorsal,
      posicion: j.posicion,
      category: "copiado_posicion",
      isReal: false,
      isCustomMatches: isCustom,
      customMatchesCount: isCustom ? customDates.length : undefined,
      badgeText: "Posición **",
      shortBadgeText: "Pos.**",
      asterisk: "**",
      detailText: isCustom
        ? "Sin partidos seleccionados manualmente. Copiado de posición (**)"
        : "Sin minutos (<45'). Copiado de compañeros de posición (No real **)",
      methodDescription: isCustom
        ? "Copiado de posición (sin partidos seleccionados)"
        : "Copiado de compañeros de posición (menos de 45')",
      usedMatchesList: [],
      allAvailableMatches: allSortedMatches,
      matchesCount: allSortedMatches.length,
      fullMatchesCount: autoFullMatches.length,
      halfMatchesCount: halfParts.length,
      minutesMatch: 90,
      analyzedMatches: allSortedMatches,
      values: {},
      explanations: {},
      dist: 10200,
      mMin: 113,
      hsr: 650,
      sprint: 180,
      accDec: 85,
      load: 850,
      maxSpeed: 28.5,
    };

    if (matchesToUse.length > 1) {
      // CASO 1: Varios partidos (oficiales o seleccionados) -> (Máximo + Promedio sin máximo) / 2
      p.category = "real_varios";
      p.isReal = true;
      if (isCustom) {
        p.badgeText = `90' (${matchesToUse.length} part. pers.)*`;
        p.shortBadgeText = `${matchesToUse.length} part.*`;
        p.asterisk = "*";
        p.detailText =
          `Partidos seleccionados manualmente (${matchesToUse.length}):\n` +
          matchesToUse
            .map(
              (m) =>
                `• ${formatProfileMatchDate(m.fecha)}: ${m.minutos}' (${m.parts.map((pt) => pt.nombre).join(", ") || "Partido"})`
            )
            .join("\n") +
          `\nFórmula oficial: (Máxima + Promedio de las restantes) / 2`;
      } else {
        p.badgeText = "90' (Máx+Prom sin máx)/2";
        p.shortBadgeText = "90'";
        p.asterisk = "";
        p.detailText =
          `Partidos de 90' computados (${matchesToUse.length}):\n` +
          matchesToUse
            .map(
              (m) =>
                `• ${formatProfileMatchDate(m.fecha)}: ${m.minutos}' (${m.parts.map((pt) => pt.nombre).join(", ") || "Partido"})`
            )
            .join("\n") +
          `\nFórmula oficial: (Máxima + Promedio de las restantes) / 2`;
        p.methodDescription = `Fórmula oficial: (Máx + Prom sin máx)/2 con ${matchesToUse.length} partidos`;
      }

      p.usedMatchesList = matchesToUse.map((m) => {
        const velMax = Math.max(0, ...m.parts.map((pt) => calculateGpsMetricValue(pt.rawTask, "MAX Speed(km/h)", derivedVariables) || 0));
        const isHalf = m.minutos >= 35 && m.minutos < 70;
        return {
          fecha: m.fecha,
          minutos: m.minutos,
          desc: m.parts.map((pt) => pt.nombre).join(" • ") || "Partido completo",
          isFull: m.minutos >= 70,
          dist: isHalf ? Math.round(m.dist * 2) : Math.round(m.dist),
          velMax: Math.round(velMax * 10) / 10,
          tipo: m.minutos >= 70 ? "90'" : `${Math.round(m.minutos)}' (x2)`,
        };
      });

      varsToCompute.forEach((v) => {
        const isRate = isRateOrPeak(v.key);
        const matchBreakdowns: MetricMatchBreakdown[] = [];

        matchesToUse.forEach((m) => {
          const partsBreakdown: MetricMatchPart[] = m.parts.map((part) => {
            let pVal: number;
            if (v.key === "Distancia / Min" || v.key.toLowerCase().includes("m/min")) {
              pVal = part.minutos > 0 ? Math.round((part.dist / part.minutos) * 10) / 10 : 0;
            } else {
              pVal = calculateGpsMetricValue(part.rawTask, v.key, derivedVariables);
            }
            return {
              nombre: part.nombre,
              minutos: part.minutos,
              val: isRate ? Math.round(pVal * 10) / 10 : Math.round(pVal),
            };
          });

          let matchVal: number;
          if (v.key === "Distancia / Min" || v.key.toLowerCase().includes("m/min")) {
            matchVal = m.minutos > 0 ? Math.round((m.dist / m.minutos) * 10) / 10 : 0;
          } else if (isRate) {
            matchVal = Math.max(...partsBreakdown.map((pb) => pb.val));
          } else {
            const rawSum = partsBreakdown.reduce((sum, pb) => sum + pb.val, 0);
            if (m.minutos >= 35 && m.minutos < 70) {
              matchVal = Math.round(rawSum * 2);
            } else if (m.minutos > 0 && m.minutos < 35) {
              matchVal = Math.round((rawSum * 90) / m.minutos);
            } else {
              matchVal = rawSum;
            }
          }

          matchBreakdowns.push({
            fecha: m.fecha,
            minutos: m.minutos,
            partes: partsBreakdown,
            totalMatchVal: matchVal,
          });
        });

        const vList = matchBreakdowns.map((mb) => mb.totalMatchVal);
        const maxVal = Math.max(...vList);
        const maxIdx = vList.indexOf(maxVal);
        const listWithoutMax = vList.filter((_, idx) => idx !== maxIdx);
        const avgWithoutMax =
          listWithoutMax.length > 0
            ? listWithoutMax.reduce((a, b) => a + b, 0) / listWithoutMax.length
            : maxVal;

        const calcVal = isRate
          ? Math.round(((maxVal + avgWithoutMax) / 2) * 10) / 10
          : Math.round((maxVal + avgWithoutMax) / 2);

        const isOverridden = overrides[v.key] !== undefined;
        const finalVal = isOverridden ? overrides[v.key] : calcVal;

        p.values[v.key] = finalVal;

        const label = getCompactMetricHeader(v.key, v.label);
        const unit = v.unit || "";
        const avgWithoutMaxFormatted = isRate ? avgWithoutMax.toFixed(1) : Math.round(avgWithoutMax).toString();

        const steps: string[] = [
          `1. Partidos computados: ${matchesToUse.length} partidos (${isCustom ? "selección manual" : "oficiales de 90'"}).`,
          `2. Valores por partido: ` +
            matchBreakdowns.map((mb) => `${formatProfileMatchDate(mb.fecha)} (${mb.totalMatchVal} ${unit})`).join(", ") +
            `.`,
          `3. Máximo registrado en un partido = ${maxVal} ${unit}.`,
          `4. Promedio excluyendo la máxima = ${avgWithoutMaxFormatted} ${unit}.`,
          `5. Cálculo oficial (Máxima + Promedio sin máxima) / 2: (${maxVal} + ${avgWithoutMaxFormatted}) / 2 = ${calcVal} ${unit}.`,
        ];

        if (isOverridden) {
          steps.push(`✏️ Ajuste manual activo: ${finalVal} ${unit} (Valor calculado: ${calcVal} ${unit}).`);
        }

        p.explanations[v.key] = {
          key: v.key,
          label,
          unit,
          category: "real_varios",
          isOverridden,
          overrideVal: isOverridden ? overrides[v.key] : null,
          calculatedVal: calcVal,
          finalVal,
          summary: `Calculado a partir de ${matchesToUse.length} partidos aplicando la fórmula oficial: (Máxima + Promedio sin máxima) / 2.`,
          formula: `(Máx: ${maxVal} + Prom. sin máx: ${avgWithoutMaxFormatted}) / 2 = ${calcVal} ${unit}`,
          steps,
          matches: matchBreakdowns,
        };
      });

      p.dist = (p.values["Distance(m)"] as number) || 10200;
      p.hsr = (p.values["Distance +21 (m)"] as number) || (p.values["HSR Abs (m)"] as number) || 650;
      p.sprint = (p.values["+ 24 km/h (Distancia)"] as number) || (p.values["Sprint (m)"] as number) || 180;
      p.accDec = (p.values["Acc+Dec"] as number) || 85;
      p.load = (p.values["Player Load"] as number) || 850;
      p.mMin = (p.values["Distancia / Min"] as number) || 113;
      p.maxSpeed = (p.values["MAX Speed(km/h)"] as number) || 28.5;
      p.minutesMatch = Math.round(matchesToUse.reduce((a, b) => a + b.minutos, 0) / matchesToUse.length);

      profiles.set(j.id, p);

      if (!positionProfilesMap.has(pos)) positionProfilesMap.set(pos, []);
      positionProfilesMap.get(pos)!.push(p);
    } else if (matchesToUse.length === 1) {
      // CASO 2: Solo 1 partido (oficial o seleccionado) -> valor directo de ese partido
      const m = matchesToUse[0];
      p.category = "real_uno";
      p.isReal = true;
      if (isCustom) {
        p.badgeText = `1 part. pers. (${formatProfileMatchDate(m.fecha)})*`;
        p.shortBadgeText = "1 part.*";
        p.asterisk = "*";
        p.detailText = `1 partido seleccionado manualmente: ${formatProfileMatchDate(m.fecha)} (${m.minutos}') [Directo]`;
      } else {
        p.badgeText = "90' (1 partido)";
        p.shortBadgeText = "90'";
        p.asterisk = "";
        p.detailText = `1 partido oficial de 90' computado: ${formatProfileMatchDate(m.fecha)} (${m.minutos}') [100% Real]`;
        p.methodDescription = `1 partido de 90' completo oficial`;
      }

      const singleVelMax = Math.max(0, ...m.parts.map((pt) => calculateGpsMetricValue(pt.rawTask, "MAX Speed(km/h)", derivedVariables) || 0));
      const isSingleHalf = m.minutos >= 35 && m.minutos < 70;
      p.usedMatchesList = [
        {
          fecha: m.fecha,
          minutos: m.minutos,
          desc: m.parts.map((pt) => pt.nombre).join(" • ") || "Partido completo",
          isFull: m.minutos >= 70,
          dist: isSingleHalf ? Math.round(m.dist * 2) : Math.round(m.dist),
          velMax: Math.round(singleVelMax * 10) / 10,
          tipo: m.minutos >= 70 ? "90'" : `${Math.round(m.minutos)}' (x2)`,
        },
      ];

      varsToCompute.forEach((v) => {
        const isRate = isRateOrPeak(v.key);
        const partsBreakdown: MetricMatchPart[] = m.parts.map((part) => {
          let pVal: number;
          if (v.key === "Distancia / Min" || v.key.toLowerCase().includes("m/min")) {
            pVal = part.minutos > 0 ? Math.round((part.dist / part.minutos) * 10) / 10 : 0;
          } else {
            pVal = calculateGpsMetricValue(part.rawTask, v.key, derivedVariables);
          }
          return {
            nombre: part.nombre,
            minutos: part.minutos,
            val: isRate ? Math.round(pVal * 10) / 10 : Math.round(pVal),
          };
        });

        let raw: number;
        if (v.key === "Distancia / Min" || v.key.toLowerCase().includes("m/min")) {
          raw = m.minutos > 0 ? Math.round((m.dist / m.minutos) * 10) / 10 : 0;
        } else if (isRate) {
          raw = Math.max(...partsBreakdown.map((pb) => pb.val));
        } else {
          const rawSum = partsBreakdown.reduce((sum, pb) => sum + pb.val, 0);
          if (m.minutos >= 35 && m.minutos < 70) {
            raw = Math.round(rawSum * 2);
          } else if (m.minutos > 0 && m.minutos < 35) {
            raw = Math.round((rawSum * 90) / m.minutos);
          } else {
            raw = rawSum;
          }
        }

        const calcVal = isRate ? Math.round(raw * 10) / 10 : Math.round(raw);
        const isOverridden = overrides[v.key] !== undefined;
        const finalVal = isOverridden ? overrides[v.key] : calcVal;

        p.values[v.key] = finalVal;

        const label = getCompactMetricHeader(v.key, v.label);
        const unit = v.unit || "";

        const matchBreakdowns: MetricMatchBreakdown[] = [
          {
            fecha: m.fecha,
            minutos: m.minutos,
            partes: partsBreakdown,
            totalMatchVal: calcVal,
          },
        ];

        const steps: string[] = [
          `1. Partido computado: ${formatProfileMatchDate(m.fecha)} (${m.minutos} min).`,
          `2. Desglose de tareas del partido: ` +
            partsBreakdown.map((pb) => `${pb.nombre}: ${pb.val} ${unit}`).join(" | ") +
            `.`,
          `3. Benchmark Competitivo directo = ${calcVal} ${unit} (100% Real).`,
        ];

        if (isOverridden) {
          steps.push(`✏️ Ajuste manual activo: ${finalVal} ${unit} (Valor calculado: ${calcVal} ${unit}).`);
        }

        p.explanations[v.key] = {
          key: v.key,
          label,
          unit,
          category: "real_uno",
          isOverridden,
          overrideVal: isOverridden ? overrides[v.key] : null,
          calculatedVal: calcVal,
          finalVal,
          summary: `Valor directo del partido disputado (${formatProfileMatchDate(m.fecha)}).`,
          formula: `Valor partido = ${calcVal} ${unit}`,
          steps,
          matches: matchBreakdowns,
        };
      });

      p.dist = (p.values["Distance(m)"] as number) || 10200;
      p.hsr = (p.values["Distance +21 (m)"] as number) || (p.values["HSR Abs (m)"] as number) || 650;
      p.sprint = (p.values["+ 24 km/h (Distancia)"] as number) || (p.values["Sprint (m)"] as number) || 180;
      p.accDec = (p.values["Acc+Dec"] as number) || 85;
      p.load = (p.values["Player Load"] as number) || 850;
      p.mMin = (p.values["Distancia / Min"] as number) || 113;
      p.maxSpeed = (p.values["MAX Speed(km/h)"] as number) || 28.5;
      p.minutesMatch = m.minutos;

      profiles.set(j.id, p);

      if (!positionProfilesMap.has(pos)) positionProfilesMap.set(pos, []);
      positionProfilesMap.get(pos)!.push(p);
    } else if (!isCustom && halfParts.length > 0) {
      // CASO 3: <90 min pero al menos 45 min en una o varias partes (solo en modo automático)
      // Si tiene varias partes de ~45 min, promediamos aplicando la fórmula oficial (Máx + Prom sin máx)/2 proyectado a 90 min (x2)
      p.category = "estimado_45";
      p.isReal = false;
      p.asterisk = "*";
      p.methodDescription = `Estimado 45' x 2 (${halfParts.length} partes)`;

      p.usedMatchesList = halfParts.map((hp) => ({
        fecha: hp.fecha || "",
        minutos: hp.minutos,
        desc: hp.nombre,
        isFull: false,
        dist: Math.round(hp.dist || 0),
        velMax: Math.round((calculateGpsMetricValue(hp.rawTask, "MAX Speed(km/h)", derivedVariables) || 0) * 10) / 10,
        tipo: "45'",
      }));

      if (halfParts.length > 1) {
        p.badgeText = `45' x 2 (${halfParts.length} partes) *`;
        p.shortBadgeText = `45'* (${halfParts.length})`;
        p.detailText =
          `Estimado 45' x 2 a partir de ${halfParts.length} partes:\n` +
          halfParts
            .map((hp) => `• ${formatProfileMatchDate(hp.fecha || "")}: ${hp.nombre} (${hp.minutos}')`)
            .join("\n") +
          `\nFórmula: Proyección x 2 (No real *)`;
      } else {
        const singlePart = halfParts[0];
        p.badgeText = "45' x 2 *";
        p.shortBadgeText = "45'*";
        p.detailText = `Estimado 45' x 2 a partir de parte: ${singlePart.nombre} (${formatProfileMatchDate(singlePart.fecha || "")}, ${singlePart.minutos}') x 2 (No real *)`;
      }

      varsToCompute.forEach((v) => {
        const isRate = isRateOrPeak(v.key);
        const label = getCompactMetricHeader(v.key, v.label);
        const unit = v.unit || "";

        // Calcular valor proyectado a 90 min (o directo si es intensidad/ritmo) para cada parte de 45 min
        const partProjects: Array<{
          nombre: string;
          fecha: string;
          minutos: number;
          partVal: number;
          projectedVal: number;
        }> = halfParts.map((hp) => {
          let pVal: number;
          let projVal: number;
          if (v.key === "Distancia / Min" || v.key.toLowerCase().includes("m/min")) {
            pVal = hp.minutos > 0 ? Math.round((hp.dist / hp.minutos) * 10) / 10 : 0;
            projVal = pVal;
          } else if (isRate) {
            const raw = calculateGpsMetricValue(hp.rawTask, v.key, derivedVariables);
            pVal = Math.round(raw * 10) / 10;
            projVal = pVal;
          } else {
            const raw = calculateGpsMetricValue(hp.rawTask, v.key, derivedVariables);
            pVal = Math.round(raw);
            projVal = Math.round(raw * 2);
          }
          return {
            nombre: hp.nombre,
            fecha: hp.fecha || "",
            minutos: hp.minutos,
            partVal: pVal,
            projectedVal: projVal,
          };
        });

        let calcVal: number;
        let formulaText: string;
        let steps: string[] = [];

        if (halfParts.length > 1) {
          const vList = partProjects.map((p) => p.projectedVal);
          const maxVal = Math.max(...vList);
          const maxIdx = vList.indexOf(maxVal);
          const listWithoutMax = vList.filter((_, idx) => idx !== maxIdx);
          const avgWithoutMax = listWithoutMax.length > 0
            ? listWithoutMax.reduce((a, b) => a + b, 0) / listWithoutMax.length
            : maxVal;

          calcVal = isRate
            ? Math.round(((maxVal + avgWithoutMax) / 2) * 10) / 10
            : Math.round((maxVal + avgWithoutMax) / 2);

          const avgWithoutMaxFormatted = isRate ? avgWithoutMax.toFixed(1) : Math.round(avgWithoutMax).toString();

          formulaText = isRate
            ? `(Máx: ${maxVal} + Prom. sin máx: ${avgWithoutMaxFormatted}) / 2 = ${calcVal} ${unit}*`
            : `(Máx proyectada: ${maxVal} + Prom. sin máx: ${avgWithoutMaxFormatted}) / 2 = ${calcVal} ${unit}*`;

          steps = [
            `1. El jugador no ha disputado 90' completos pero tiene ${halfParts.length} partes oficiales de ~45 minutos.`,
            `2. Partes detectadas: ` +
              partProjects.map((p) => `${p.nombre}${p.fecha ? " (" + p.fecha + ")" : ""} [${p.partVal} ${unit} ${!isRate ? "-> Proy. 90': " + p.projectedVal + " " + unit : ""}]`).join(", ") +
              `.`,
            isRate
              ? `3. Máxima intensidad registrada = ${maxVal} ${unit}.`
              : `3. Máxima parte proyectada a 90' = ${maxVal} ${unit}.`,
            `4. Promedio excluyendo la máxima = ${avgWithoutMaxFormatted} ${unit}.`,
            `5. Cálculo oficial (Máxima + Promedio sin máxima) / 2: (${maxVal} + ${avgWithoutMaxFormatted}) / 2 = ${calcVal} ${unit}*.`,
            `6. Se indica con asterisco (*) porque proviene de proyección de partes de 45'.`,
          ];
        } else {
          // Solo 1 parte de 45 min
          const best45 = partProjects[0];
          calcVal = best45.projectedVal;
          formulaText = isRate
            ? `Intensidad / Pico directo de la parte = ${calcVal} ${unit}*`
            : `Parte de ${best45.minutos}' × 2 = ${best45.partVal} × 2 = ${calcVal} ${unit}*`;

          steps = [
            `1. El jugador no ha disputado 90' completos en ningún partido oficial.`,
            `2. Única parte oficial registrada: ${best45.nombre} (${best45.minutos} minutos).`,
            isRate
              ? `3. Al ser una métrica de intensidad/ritmo, se toma el valor directo registrado en la parte (${best45.partVal} ${unit}).`
              : `3. Volumen acumulado en la parte: ${best45.partVal} ${unit}.`,
            isRate
              ? `4. Resultado proyectado = ${calcVal} ${unit}*.`
              : `4. Proyección a 90' multiplicando por 2: ${best45.partVal} × 2 = ${calcVal} ${unit}*.`,
            `5. Se indica con asterisco (*) porque no corresponde a un partido real de 90'.`,
          ];
        }

        const isOverridden = overrides[v.key] !== undefined;
        const finalVal = isOverridden ? overrides[v.key] : calcVal;

        p.values[v.key] = finalVal;

        if (isOverridden) {
          steps.push(`✏️ Ajuste manual activo: ${finalVal} ${unit} (Valor calculado: ${calcVal} ${unit}).`);
        }

        const bestPart = [...partProjects].sort((a, b) => b.projectedVal - a.projectedVal)[0];

        p.explanations[v.key] = {
          key: v.key,
          label,
          unit,
          category: "estimado_45",
          isOverridden,
          overrideVal: isOverridden ? overrides[v.key] : null,
          calculatedVal: calcVal,
          finalVal,
          summary: halfParts.length > 1
            ? `Calculado a partir de ${halfParts.length} partes de ~45' proyectadas a 90' con la fórmula oficial (Máx + Prom sin máx) / 2.`
            : `Estimación proyectada a partir de su parte disputada (${bestPart.nombre}, ${bestPart.minutos}').`,
          formula: formulaText,
          steps,
          best45: {
            nombre: bestPart.nombre,
            minutos: bestPart.minutos,
            partVal: bestPart.partVal,
            factor: isRate ? 1 : 2,
          },
        };
      });

      p.dist = (p.values["Distance(m)"] as number) || 10200;
      p.hsr = (p.values["Distance +21 (m)"] as number) || (p.values["HSR Abs (m)"] as number) || 650;
      p.sprint = (p.values["+ 24 km/h (Distancia)"] as number) || (p.values["Sprint (m)"] as number) || 180;
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
        varsToCompute.forEach((v) => {
          const isOverridden = overrides[v.key] !== undefined;
          const finalVal = isOverridden ? overrides[v.key] : null;
          p.values[v.key] = finalVal;

          const label = getCompactMetricHeader(v.key, v.label);
          const unit = v.unit || "";

          p.explanations[v.key] = {
            key: v.key,
            label,
            unit,
            category: "sin_perfil",
            isOverridden,
            overrideVal: isOverridden ? overrides[v.key] : null,
            calculatedVal: null,
            finalVal,
            summary: "Los porteros no disponen de registros GPS en partidos oficiales.",
            formula: "Sin Perfil Competitivo (—)",
            steps: [
              "1. El jugador es guardameta (POR).",
              "2. No se dispone de datos de GPS en partidos oficiales de campo para esta posición.",
              "3. Se clasifica como Sin Perfil (S/P). Puedes asignar un valor manual si dispones de datos específicos.",
            ],
          };
        });
        p.dist = overrides["Distance(m)"] ?? overrides.dist ?? 0;
        p.hsr = overrides["Distance +21 (m)"] ?? overrides.hsr ?? 0;
        p.sprint = overrides["+ 24 km/h (Distancia)"] ?? overrides["Sprint (m)"] ?? overrides.sprint ?? 0;
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

      varsToCompute.forEach((v) => {
        const isRate = isRateOrPeak(v.key);
        const label = getCompactMetricHeader(v.key, v.label);
        const unit = v.unit || "";

        if (pool && pool.length > 0) {
          const peerBreakdown: MetricPeerBreakdown[] = pool.map((tm) => ({
            jugadorId: tm.jugadorId,
            apodo: tm.apodo,
            posicion: tm.posicion,
            val: (tm.values[v.key] as number) ?? 0,
          }));

          const vals = peerBreakdown.map((pb) => pb.val);
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          const calcVal = isRate ? Math.round(avg * 10) / 10 : Math.round(avg);
          const isOverridden = overrides[v.key] !== undefined;
          const finalVal = isOverridden ? overrides[v.key] : calcVal;

          p.values[v.key] = finalVal;

          const steps: string[] = [
            `1. El jugador no dispone de suficientes minutos (<45' en un partido) para un cálculo individual.`,
            `2. Se consulta el perfil de compañeros de su misma posición (${pos}).`,
            `3. Compañeros de posición computados (${peerBreakdown.length}): ` +
              peerBreakdown.map((pb) => `${pb.apodo} (${pb.val} ${unit})`).join(", ") +
              `.`,
            `4. Promedio de la demarcación = ${calcVal} ${unit}**.`,
            `5. Marcado con doble asterisco (**) para señalar que es un perfil copiado por posición.`,
          ];

          if (isOverridden) {
            steps.push(`✏️ Ajuste manual activo: ${finalVal} ${unit} (Valor calculado: ${calcVal} ${unit}).`);
          }

          p.explanations[v.key] = {
            key: v.key,
            label,
            unit,
            category: "copiado_posicion",
            isOverridden,
            overrideVal: isOverridden ? overrides[v.key] : null,
            calculatedVal: calcVal,
            finalVal,
            summary: `Copiado del promedio de jugadores de su misma posición (${pos}).`,
            formula: `Promedio posición (${pos}) = ${calcVal} ${unit}**`,
            steps,
            peers: peerBreakdown,
          };
        } else {
          const isOverridden = overrides[v.key] !== undefined;
          const finalVal = isOverridden ? overrides[v.key] : null;
          p.values[v.key] = finalVal;

          p.explanations[v.key] = {
            key: v.key,
            label,
            unit,
            category: "copiado_posicion",
            isOverridden,
            overrideVal: isOverridden ? overrides[v.key] : null,
            calculatedVal: null,
            finalVal,
            summary: `Sin compañeros con datos en su posición (${pos}).`,
            formula: "—",
            steps: ["No se han encontrado compañeros de la misma posición con partidos registrados."],
          };
        }
      });

      p.dist = (p.values["Distance(m)"] as number) || 10200;
      p.hsr = (p.values["Distance +21 (m)"] as number) || (p.values["HSR Abs (m)"] as number) || 650;
      p.sprint = (p.values["+ 24 km/h (Distancia)"] as number) || (p.values["Sprint (m)"] as number) || 180;
      p.accDec = (p.values["Acc+Dec"] as number) || 85;
      p.load = (p.values["Player Load"] as number) || 850;
      p.mMin = (p.values["Distancia / Min"] as number) || 113;
      p.maxSpeed = (p.values["MAX Speed(km/h)"] as number) || 28.5;
    }
  });


  // ── ASEGURAR QUE PARA TODOS LOS JUGADORES, LA VELOCIDAD MÁXIMA SEA SU MÁXIMA REAL ALCANZADA (NO DE PARTIDO) ──
  profiles.forEach((p, jId) => {
    const playerAllRealRecords = realGps.filter((r) => r.jugador_id === jId);
    let allTimeMaxSpeed = 0;
    let allTimeMaxSpeedDate = "";
    let allTimeMaxSpeedSession = "";

    playerAllRealRecords.forEach((r) => {
      const spd = calculateGpsMetricValue(r.metricas || r, "MAX Speed(km/h)", derivedVariables);
      if (spd > allTimeMaxSpeed) {
        allTimeMaxSpeed = spd;
        allTimeMaxSpeedDate = r.fecha || "";
        allTimeMaxSpeedSession = r.tarea || r.metricas?.tipo_sesion || "Sesión";
      }
      if (Array.isArray(r.metricas?.tareas)) {
        r.metricas.tareas.forEach((t: any) => {
          const tSpd = calculateGpsMetricValue(t, "MAX Speed(km/h)", derivedVariables);
          if (tSpd > allTimeMaxSpeed) {
            allTimeMaxSpeed = tSpd;
            allTimeMaxSpeedDate = r.fecha || "";
            allTimeMaxSpeedSession = t.nombre || t.name || r.tarea || "Tarea";
          }
        });
      }
    });

    const overrides = customOverrides[jId] || {};
    const isSpeedOverridden = overrides["MAX Speed(km/h)"] !== undefined || overrides["Vel Max"] !== undefined || overrides.maxSpeed !== undefined;
    const finalMaxSpeed = isSpeedOverridden
      ? Number(overrides["MAX Speed(km/h)"] ?? overrides["Vel Max"] ?? overrides.maxSpeed)
      : (allTimeMaxSpeed > 0 ? allTimeMaxSpeed : p.maxSpeed);

    if (allTimeMaxSpeed > 0 || isSpeedOverridden) {
      const speedKeys = ["MAX Speed(km/h)", "Vel Max", "max_speed", "Velocidad Máxima", "velocidad maxima"];
      speedKeys.forEach((sKey) => {
        p.values[sKey] = finalMaxSpeed;
      });
      p.maxSpeed = finalMaxSpeed;
      p.explanations["MAX Speed(km/h)"] = {
        key: "MAX Speed(km/h)",
        label: "Vel. Max",
        unit: "km/h",
        category: "real_uno",
        isOverridden: isSpeedOverridden,
        overrideVal: isSpeedOverridden ? finalMaxSpeed : null,
        calculatedVal: allTimeMaxSpeed,
        finalVal: finalMaxSpeed,
        summary: `Máxima velocidad real alcanzada por el jugador en cualquiera de sus sesiones GPS registradas (${allTimeMaxSpeed} km/h el ${allTimeMaxSpeedDate}).`,
        formula: `Pico real alcanzado = ${finalMaxSpeed} km/h (${allTimeMaxSpeedDate})`,
        steps: [
          `1. Se analizan todas las sesiones reales registradas del jugador (${playerAllRealRecords.length} sesiones).`,
          `2. Máxima velocidad pico absoluta alcanzada = ${allTimeMaxSpeed} km/h (Fecha: ${allTimeMaxSpeedDate}${allTimeMaxSpeedSession ? `, ${allTimeMaxSpeedSession}` : ""}).`,
          `3. Como exige la metodología, la velocidad máxima no se extrae de partido ni se promedia: refleja su máxima real alcanzada.`,
        ],
        matches: [],
      };
      p.explanations["Vel Max"] = { ...p.explanations["MAX Speed(km/h)"], key: "Vel Max" };
      p.explanations["max_speed"] = { ...p.explanations["MAX Speed(km/h)"], key: "max_speed" };
    }
  });

  return profiles;
}
