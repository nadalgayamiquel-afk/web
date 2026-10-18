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
      explanations: {},
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

      varsToCompute.forEach((v) => {
        const isRate = isRateOrPeak(v.key);
        const matchBreakdowns: MetricMatchBreakdown[] = [];

        fullMatches.forEach((m) => {
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
            matchVal = partsBreakdown.reduce((sum, pb) => sum + pb.val, 0);
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
        const avgVal = vList.reduce((a, b) => a + b, 0) / vList.length;
        const calcVal = isRate ? Math.round(((maxVal + avgVal) / 2) * 10) / 10 : Math.round((maxVal + avgVal) / 2);
        const isOverridden = overrides[v.key] !== undefined;
        const finalVal = isOverridden ? overrides[v.key] : calcVal;

        p.values[v.key] = finalVal;

        const label = getCompactMetricHeader(v.key, v.label);
        const unit = v.unit || "";
        const avgFormatted = isRate ? avgVal.toFixed(1) : Math.round(avgVal).toString();

        const steps: string[] = [
          `1. Partidos completos detectados: ${fullMatches.length} partidos oficiales de 90 minutos.`,
          `2. Valores por partido: ` +
            matchBreakdowns.map((mb) => `${mb.fecha} (${mb.totalMatchVal} ${unit})`).join(", ") +
            `.`,
          `3. Máximo registrado en un partido = ${maxVal} ${unit}.`,
          `4. Promedio de los partidos = ${avgFormatted} ${unit}.`,
          `5. Cálculo oficial ((Máx + Prom) / 2): (${maxVal} + ${avgFormatted}) / 2 = ${calcVal} ${unit}.`,
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
          summary: `Calculado a partir de ${fullMatches.length} partidos de 90' aplicando la fórmula oficial (Máximo + Promedio) / 2.`,
          formula: `(Máx: ${maxVal} + Prom: ${avgFormatted}) / 2 = ${calcVal} ${unit}`,
          steps,
          matches: matchBreakdowns,
        };
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
          raw = partsBreakdown.reduce((sum, pb) => sum + pb.val, 0);
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
          `1. El jugador ha disputado un único partido completo de 90' (${m.fecha}, ${m.minutos} min).`,
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
          summary: `Valor directo del único partido de 90' disputado (${m.fecha}).`,
          formula: `Valor partido 90' = ${calcVal} ${unit}`,
          steps,
          matches: matchBreakdowns,
        };
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

      varsToCompute.forEach((v) => {
        const isRate = isRateOrPeak(v.key);
        let partVal: number;
        let calcVal: number;
        let formulaText: string;

        if (v.key === "Distancia / Min" || v.key.toLowerCase().includes("m/min")) {
          partVal = best45.minutos > 0 ? Math.round((best45.dist / best45.minutos) * 10) / 10 : 0;
          calcVal = partVal;
          formulaText = `Ritmo directo de la parte (${best45.minutos}') = ${calcVal} m/min*`;
        } else if (isRate) {
          const raw = calculateGpsMetricValue(best45.rawTask, v.key, derivedVariables);
          partVal = Math.round(raw * 10) / 10;
          calcVal = partVal;
          formulaText = `Intensidad / Pico directo de la parte = ${calcVal} ${v.unit || ""}*`;
        } else {
          const raw = calculateGpsMetricValue(best45.rawTask, v.key, derivedVariables);
          partVal = Math.round(raw);
          calcVal = Math.round(raw * 2);
          formulaText = `Parte de ${best45.minutos}' × 2 = ${partVal} × 2 = ${calcVal} ${v.unit || ""}*`;
        }

        const isOverridden = overrides[v.key] !== undefined;
        const finalVal = isOverridden ? overrides[v.key] : calcVal;

        p.values[v.key] = finalVal;

        const label = getCompactMetricHeader(v.key, v.label);
        const unit = v.unit || "";

        const steps: string[] = [
          `1. El jugador no ha disputado 90' completos en ningún partido oficial.`,
          `2. Mejor parte oficial registrada: ${best45.nombre} (${best45.minutos} minutos).`,
          isRate
            ? `3. Al ser una métrica de intensidad/ritmo, se toma el valor directo registrado en la parte (${partVal} ${unit}).`
            : `3. Volumen acumulado en la parte: ${partVal} ${unit}.`,
          isRate
            ? `4. Resultado proyectado = ${calcVal} ${unit}*.`
            : `4. Proyección a 90' multiplicando por 2: ${partVal} × 2 = ${calcVal} ${unit}*.`,
          `5. Se indica con asterisco (*) porque no corresponde a un partido real de 90'.`,
        ];

        if (isOverridden) {
          steps.push(`✏️ Ajuste manual activo: ${finalVal} ${unit} (Valor calculado: ${calcVal} ${unit}).`);
        }

        p.explanations[v.key] = {
          key: v.key,
          label,
          unit,
          category: "estimado_45",
          isOverridden,
          overrideVal: isOverridden ? overrides[v.key] : null,
          calculatedVal: calcVal,
          finalVal,
          summary: `Estimación proyectada a partir de su mejor parte disputada (${best45.nombre}, ${best45.minutos}').`,
          formula: formulaText,
          steps,
          best45: {
            nombre: best45.nombre,
            minutos: best45.minutos,
            partVal,
            factor: isRate ? 1 : 2,
          },
        };
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
      p.sprint = (p.values["Sprint (m)"] as number) || 180;
      p.accDec = (p.values["Acc+Dec"] as number) || 85;
      p.load = (p.values["Player Load"] as number) || 850;
      p.mMin = (p.values["Distancia / Min"] as number) || 113;
      p.maxSpeed = (p.values["MAX Speed(km/h)"] as number) || 28.5;
    }
  });

  return profiles;
}
