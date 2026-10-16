"use client";

import React, { useState, useMemo } from "react";

export interface CargaExternaSectionProps {
  gpsRecords: any[];
  jugadores: any[];
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  isGpsUploading: boolean;
  handleGpsCsvUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSyncDownloadsGps: () => void;
  gpsUploadStatus: { message: string; isError: boolean } | null;
  loadDbGpsRecords?: () => Promise<void>;
  renderDisponibilidadBadge?: (player: any) => React.ReactNode;
}

export type ExternaSubTab = "velocidad" | "perfil_competitivo" | "ratios_semanales" | "preguntas_clave" | "sesiones_bbdd";

export default function CargaExternaSection({
  gpsRecords,
  jugadores,
  selectedDate,
  setSelectedDate,
  isGpsUploading,
  handleGpsCsvUpload,
  handleSyncDownloadsGps,
  gpsUploadStatus,
  renderDisponibilidadBadge,
}: CargaExternaSectionProps) {
  // ── SUB-PESTAÑA ACTIVA ──
  const [subTab, setSubTab] = useState<ExternaSubTab>("velocidad");

  // ── 1. ESTADOS PARA MONITOR DE VELOCIDAD & VMAX ──
  const [vmaxThresholdPct, setVmaxThresholdPct] = useState<number>(90); // 90%, 85%, 95%, 100%
  const [vmaxSortBy, setVmaxSortBy] = useState<"dias_desc" | "vmax_desc" | "nombre">("dias_desc");
  const [vmaxFilterPos, setVmaxFilterPos] = useState<string>("TODOS");
  const [vmaxSearch, setVmaxSearch] = useState<string>("");

  // ── 2. ESTADOS PARA PERFIL COMPETITIVO ──
  const [profileSearch, setProfileSearch] = useState<string>("");
  const [profileNorm90, setProfileNorm90] = useState<boolean>(true); // normalizado a 90 min o media directa
  const [customOverrides, setCustomOverrides] = useState<Record<string, any>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gps_competitive_profile_overrides");
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return {};
  });

  // ── 3. ESTADOS PARA RATIOS SEMANALES ──
  const [ratioFormat, setRatioFormat] = useState<"multiplier" | "percentage">("multiplier");
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number>(0);

  // ── FECHA DE REFERENCIA ACTUAL (la fecha más reciente con GPS o la seleccionada) ──
  const latestGpsDate = useMemo(() => {
    if (gpsRecords.length === 0) return selectedDate || new Date().toISOString().split("T")[0];
    const sorted = [...gpsRecords].map((r) => r.fecha).filter(Boolean).sort().reverse();
    return sorted[0] || selectedDate;
  }, [gpsRecords, selectedDate]);

  // Lista de fechas únicas ordenadas
  const allUniqueDates = useMemo(() => {
    const set = new Set<string>();
    gpsRecords.forEach((r) => {
      if (r.fecha) set.add(r.fecha);
    });
    return Array.from(set).sort().reverse();
  }, [gpsRecords]);

  // Semanas detectadas a partir de los registros GPS (de lunes a domingo)
  const availableWeeks = useMemo(() => {
    if (allUniqueDates.length === 0) {
      const today = new Date();
      return [{ id: 0, label: "Semana Actual", start: today.toISOString().split("T")[0], end: today.toISOString().split("T")[0], dates: [] }];
    }
    const weeksMap = new Map<string, { start: string; end: string; dates: string[] }>();
    allUniqueDates.forEach((dStr) => {
      const d = new Date(dStr + "T00:00:00");
      const day = d.getDay(); // 0 is Sunday
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const mon = new Date(d);
      mon.setDate(d.getDate() + diffToMonday);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      const monStr = mon.toISOString().split("T")[0];
      const sunStr = sun.toISOString().split("T")[0];
      const key = monStr + "_" + sunStr;
      if (!weeksMap.has(key)) {
        weeksMap.set(key, { start: monStr, end: sunStr, dates: [] });
      }
      weeksMap.get(key)!.dates.push(dStr);
    });

    return Array.from(weeksMap.entries()).map(([key, val], idx) => {
      const sParts = val.start.split("-");
      const eParts = val.end.split("-");
      const sLabel = sParts[2] + "/" + sParts[1];
      const eLabel = eParts[2] + "/" + eParts[1];
      return {
        id: idx,
        label: "Microciclo (" + sLabel + " - " + eLabel + ") · " + val.dates.length + " sesiones",
        start: val.start,
        end: val.end,
        dates: val.dates.sort(),
      };
    });
  }, [allUniqueDates]);

  // ── MÉTODOS DE CÁLCULO DE VELOCIDAD POR JUGADOR ──
  const speedRecordsByPlayer = useMemo(() => {
    const map = new Map<string, Array<{ fecha: string; speed: number; md?: string; tipo?: string }>>();
    gpsRecords.forEach((r) => {
      const pId = r.jugador_id;
      if (!pId) return;
      const spd = Number(
        r.metricas?.["MAX Speed(km/h)"] ??
        r.metricas?.max_speed ??
        r.metricas?.["Vel Max"] ??
        r.max_speed ??
        0
      );
      if (spd > 0) {
        if (!map.has(pId)) map.set(pId, []);
        map.get(pId)!.push({
          fecha: r.fecha,
          speed: spd,
          md: r.match_day || r.metricas?.match_day,
          tipo: r.tipo_sesion || r.metricas?.tipo_sesion || (r.match_day === "MD" ? "PARTIDO" : "ENTRENAMIENTO"),
        });
      }
    });

    map.forEach((arr) => {
      arr.sort((a, b) => b.fecha.localeCompare(a.fecha));
    });
    return map;
  }, [gpsRecords]);

  // Análisis de Vmax y exposición al umbral para cada jugador
  const vmaxAnalysis = useMemo(() => {
    const refDateObj = new Date(latestGpsDate + "T00:00:00");

    return jugadores.map((j) => {
      const recs = speedRecordsByPlayer.get(j.id) || [];
      const historicalMax = recs.length > 0 ? Math.max(...recs.map((x) => x.speed)) : 0;
      const thresholdVal = Math.round((historicalMax * (vmaxThresholdPct / 100)) * 100) / 100;

      // Buscar el registro más reciente que superó o igualó el umbral
      const hitRecord = recs.find((x) => x.speed >= thresholdVal);
      let daysSinceHit: number | null = null;
      if (hitRecord) {
        const hitDateObj = new Date(hitRecord.fecha + "T00:00:00");
        const diffMs = refDateObj.getTime() - hitDateObj.getTime();
        daysSinceHit = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }

      // Último registro absoluto (de la sesión más reciente)
      const lastSessionRecord = recs[0] || null;
      const lastSessionSpeed = lastSessionRecord ? lastSessionRecord.speed : 0;
      const lastSessionPct = historicalMax > 0 ? Math.round((lastSessionSpeed / historicalMax) * 100) : 0;

      // Nivel de alerta
      let status: "optimo" | "alerta" | "riesgo" | "sin_datos" = "sin_datos";
      if (daysSinceHit !== null) {
        if (daysSinceHit <= 4) status = "optimo";
        else if (daysSinceHit <= 7) status = "alerta";
        else status = "riesgo";
      }

      return {
        jugador: j,
        historicalMax,
        thresholdVal,
        hitRecord,
        daysSinceHit,
        status,
        lastSessionRecord,
        lastSessionSpeed,
        lastSessionPct,
        totalSessionsWithGps: recs.length,
      };
    });
  }, [jugadores, speedRecordsByPlayer, latestGpsDate, vmaxThresholdPct]);

  // Filtrado y ordenación de la lista de velocidad
  const filteredVmaxList = useMemo(() => {
    let list = vmaxAnalysis.filter((item) => {
      const name = (item.jugador.apodo || item.jugador.nombre || "").toLowerCase();
      const pos = (item.jugador.posicion || "").toUpperCase();
      if (vmaxSearch && !name.includes(vmaxSearch.toLowerCase())) return false;
      if (vmaxFilterPos !== "TODOS") {
        if (vmaxFilterPos === "DEF" && !pos.includes("DEF") && !pos.includes("LAT") && !pos.includes("CEN")) return false;
        if (vmaxFilterPos === "MED" && !pos.includes("MED") && !pos.includes("PIV") && !pos.includes("INT")) return false;
        if (vmaxFilterPos === "DEL" && !pos.includes("DEL") && !pos.includes("EXT") && !pos.includes("PUN")) return false;
        if (vmaxFilterPos === "POR" && !pos.includes("POR")) return false;
      }
      return true;
    });

    if (vmaxSortBy === "dias_desc") {
      list.sort((a, b) => {
        if (a.daysSinceHit === null && b.daysSinceHit === null) return 0;
        if (a.daysSinceHit === null) return 1;
        if (b.daysSinceHit === null) return -1;
        return b.daysSinceHit - a.daysSinceHit;
      });
    } else if (vmaxSortBy === "vmax_desc") {
      list.sort((a, b) => b.historicalMax - a.historicalMax);
    } else if (vmaxSortBy === "nombre") {
      list.sort((a, b) => (a.jugador.apodo || a.jugador.nombre).localeCompare(b.jugador.apodo || b.jugador.nombre));
    }

    return list;
  }, [vmaxAnalysis, vmaxSearch, vmaxFilterPos, vmaxSortBy]);

  // Contadores de alerta de Vmax
  const vmaxStats = useMemo(() => {
    const optimo = vmaxAnalysis.filter((x) => x.status === "optimo").length;
    const alerta = vmaxAnalysis.filter((x) => x.status === "alerta").length;
    const riesgo = vmaxAnalysis.filter((x) => x.status === "riesgo").length;
    const sinDatos = vmaxAnalysis.filter((x) => x.status === "sin_datos").length;

    const maxTeamSpeed = vmaxAnalysis.length > 0 ? Math.max(...vmaxAnalysis.map((x) => x.historicalMax)) : 0;
    const fastestPlayer = vmaxAnalysis.find((x) => x.historicalMax === maxTeamSpeed);

    return { optimo, alerta, riesgo, sinDatos, maxTeamSpeed, fastestPlayer };
  }, [vmaxAnalysis]);

  // ── 4. CÁLCULO DE PERFIL COMPETITIVO (MATCH BENCHMARK) ──
  const competitiveProfiles = useMemo(() => {
    const matchRecs = gpsRecords.filter((r) => {
      const tipo = (r.tipo_sesion || r.metricas?.tipo_sesion || "").toUpperCase();
      const md = (r.match_day || r.metricas?.match_day || "").toUpperCase();
      return tipo.includes("PARTIDO") || md === "MD" || r.es_partido === true;
    });

    const byPlayer = new Map<string, any[]>();
    matchRecs.forEach((r) => {
      if (!r.jugador_id) return;
      if (!byPlayer.has(r.jugador_id)) byPlayer.set(r.jugador_id, []);
      byPlayer.get(r.jugador_id)!.push(r);
    });

    const byPos = new Map<string, { dist: number[]; hsr: number[]; sprint: number[]; accDec: number[]; load: number[]; count: number }>();
    jugadores.forEach((j) => {
      const pRecs = byPlayer.get(j.id) || [];
      if (pRecs.length > 0) {
        const posKey = (j.posicion || "JUGADOR").toUpperCase();
        if (!byPos.has(posKey)) byPos.set(posKey, { dist: [], hsr: [], sprint: [], accDec: [], load: [], count: 0 });
        const entry = byPos.get(posKey)!;
        pRecs.forEach((r) => {
          const d = Number(r.metricas?.["Distance(m)"] || r.distancia_total || 0);
          const h = Number(r.metricas?.["HSR Abs (m)"] || r.metricas?.hsr || r.distancia_z4 || 0);
          const s = Number(r.metricas?.["Sprint (m)"] || r.metricas?.sprint_m || (r.num_sprints ? r.num_sprints * 15 : 0));
          const ad = Number(r.metricas?.["Accs Count"] || r.aceleraciones || 0) + Number(r.metricas?.["Decs Count"] || r.desaceleraciones || 0);
          const pl = Number(r.metricas?.["Player Load"] || r.player_load || 0);
          if (d > 0) entry.dist.push(d);
          if (h > 0) entry.hsr.push(h);
          if (s > 0) entry.sprint.push(s);
          if (ad > 0) entry.accDec.push(ad);
          if (pl > 0) entry.load.push(pl);
          entry.count++;
        });
      }
    });

    const getPosAvg = (pos: string | null, metric: "dist" | "hsr" | "sprint" | "accDec" | "load", defVal: number): number => {
      const posKey = (pos || "").toUpperCase();
      const entry = byPos.get(posKey);
      if (entry && entry[metric].length > 0) {
        const sum = entry[metric].reduce((a, b) => a + b, 0);
        return Math.round(sum / entry[metric].length);
      }
      return defVal;
    };

    const profiles = new Map<string, any>();
    jugadores.forEach((j) => {
      const pRecs = byPlayer.get(j.id) || [];
      const overrides = customOverrides[j.id] || {};

      let matchesCount = pRecs.length;
      let rawDist = 0, rawHsr = 0, rawSprint = 0, rawAcc = 0, rawDec = 0, rawLoad = 0, rawSpeed = 0, rawDur = 0;

      if (pRecs.length > 0) {
        pRecs.forEach((r) => {
          rawDist += Number(r.metricas?.["Distance(m)"] || r.distancia_total || 0);
          rawHsr += Number(r.metricas?.["HSR Abs (m)"] || r.metricas?.hsr || r.distancia_z4 || 0);
          rawSprint += Number(r.metricas?.["Sprint (m)"] || r.metricas?.sprint_m || (r.num_sprints ? r.num_sprints * 15 : 0));
          rawAcc += Number(r.metricas?.["Accs Count"] || r.aceleraciones || 0);
          rawDec += Number(r.metricas?.["Decs Count"] || r.desaceleraciones || 0);
          rawLoad += Number(r.metricas?.["Player Load"] || r.player_load || 0);
          rawSpeed = Math.max(rawSpeed, Number(r.metricas?.["MAX Speed(km/h)"] || r.max_speed || 0));
          rawDur += Number(r.duracion || r.metricas?.["Duration(min)"] || 90);
        });

        const avgDur = rawDur / pRecs.length;
        const normFactor = profileNorm90 && avgDur > 0 ? (90 / avgDur) : 1;

        const dist = Math.round((rawDist / pRecs.length) * normFactor);
        const hsr = Math.round((rawHsr / pRecs.length) * normFactor);
        const sprint = Math.round((rawSprint / pRecs.length) * normFactor);
        const accDec = Math.round(((rawAcc + rawDec) / pRecs.length) * normFactor);
        const load = Math.round((rawLoad / pRecs.length) * normFactor);
        const mMin = avgDur > 0 ? Math.round(rawDist / rawDur) : 105;

        profiles.set(j.id, {
          isFallback: false,
          matchesCount,
          dist: overrides.dist ?? dist,
          hsr: overrides.hsr ?? hsr,
          sprint: overrides.sprint ?? sprint,
          accDec: overrides.accDec ?? accDec,
          load: overrides.load ?? load,
          mMin: overrides.mMin ?? mMin,
          maxSpeed: rawSpeed,
        });
      } else {
        const fallbackDist = getPosAvg(j.posicion, "dist", 10200);
        const fallbackHsr = getPosAvg(j.posicion, "hsr", 720);
        const fallbackSprint = getPosAvg(j.posicion, "sprint", 190);
        const fallbackAccDec = getPosAvg(j.posicion, "accDec", 75);
        const fallbackLoad = getPosAvg(j.posicion, "load", 780);

        profiles.set(j.id, {
          isFallback: true,
          matchesCount: 0,
          dist: overrides.dist ?? fallbackDist,
          hsr: overrides.hsr ?? fallbackHsr,
          sprint: overrides.sprint ?? fallbackSprint,
          accDec: overrides.accDec ?? fallbackAccDec,
          load: overrides.load ?? fallbackLoad,
          mMin: 110,
          maxSpeed: 30.5,
        });
      }
    });

    return profiles;
  }, [gpsRecords, jugadores, profileNorm90, customOverrides]);

  // ── 5. CÁLCULO DE RATIOS SEMANALES (% MATCH DEMANDS) ──
  const activeWeek = availableWeeks[selectedWeekIdx] || availableWeeks[0];

  const weeklyRatiosData = useMemo(() => {
    if (!activeWeek || activeWeek.dates.length === 0) return [];

    const weekRecords = gpsRecords.filter((r) => activeWeek.dates.includes(r.fecha));
    const byPlayer = new Map<string, any[]>();
    weekRecords.forEach((r) => {
      if (!r.jugador_id) return;
      if (!byPlayer.has(r.jugador_id)) byPlayer.set(r.jugador_id, []);
      byPlayer.get(r.jugador_id)!.push(r);
    });

    return jugadores.map((j) => {
      const pRecs = byPlayer.get(j.id) || [];
      const profile = competitiveProfiles.get(j.id) || {
        dist: 10000,
        hsr: 700,
        sprint: 200,
        accDec: 70,
        load: 800,
      };

      let weekDist = 0, weekHsr = 0, weekSprint = 0, weekAcc = 0, weekDec = 0, weekLoad = 0, weekMaxSpeed = 0;
      pRecs.forEach((r) => {
        weekDist += Number(r.metricas?.["Distance(m)"] || r.distancia_total || 0);
        weekHsr += Number(r.metricas?.["HSR Abs (m)"] || r.metricas?.hsr || r.distancia_z4 || 0);
        weekSprint += Number(r.metricas?.["Sprint (m)"] || r.metricas?.sprint_m || (r.num_sprints ? r.num_sprints * 15 : 0));
        weekAcc += Number(r.metricas?.["Accs Count"] || r.aceleraciones || 0);
        weekDec += Number(r.metricas?.["Decs Count"] || r.desaceleraciones || 0);
        weekLoad += Number(r.metricas?.["Player Load"] || r.player_load || 0);
        weekMaxSpeed = Math.max(weekMaxSpeed, Number(r.metricas?.["MAX Speed(km/h)"] || r.max_speed || 0));
      });

      const weekAccDec = weekAcc + weekDec;
      const sessionsCount = pRecs.length;

      const ratioDist = profile.dist > 0 ? weekDist / profile.dist : 0;
      const ratioHsr = profile.hsr > 0 ? weekHsr / profile.hsr : 0;
      const ratioSprint = profile.sprint > 0 ? weekSprint / profile.sprint : 0;
      const ratioAccDec = profile.accDec > 0 ? weekAccDec / profile.accDec : 0;
      const ratioLoad = profile.load > 0 ? weekLoad / profile.load : 0;

      const vAnalysis = vmaxAnalysis.find((x) => x.jugador.id === j.id);
      const histMax = vAnalysis ? vAnalysis.historicalMax : 30;
      const vmaxPct = histMax > 0 ? Math.round((weekMaxSpeed / histMax) * 100) : 0;

      return {
        jugador: j,
        sessionsCount,
        weekDist: Math.round(weekDist),
        weekHsr: Math.round(weekHsr),
        weekSprint: Math.round(weekSprint),
        weekAccDec,
        weekLoad: Math.round(weekLoad),
        weekMaxSpeed,
        vmaxPct,
        ratioDist,
        ratioHsr,
        ratioSprint,
        ratioAccDec,
        ratioLoad,
        profile,
      };
    });
  }, [activeWeek, gpsRecords, jugadores, competitiveProfiles, vmaxAnalysis]);

  const formatRatioVal = (ratio: number) => {
    if (ratioFormat === "multiplier") {
      return ratio.toFixed(2) + "x";
    }
    return Math.round(ratio * 100) + "%";
  };

  const getRatioBadgeStyle = (ratio: number, type: "dist" | "hsr" | "sprint" | "load") => {
    if (type === "sprint") {
      if (ratio < 0.75) return { bg: "#fee2e2", color: "#b91c1c", label: "⚠️ Subestímulo" };
      if (ratio <= 1.6) return { bg: "#dcfce7", color: "#15803d", label: "🟢 Óptimo" };
      return { bg: "#fef3c7", color: "#b45309", label: "⚡ Pico Alto" };
    }
    if (ratio < 1.0) return { bg: "#fee2e2", color: "#b91c1c", label: "Bajo" };
    if (ratio > 3.0) return { bg: "#ffedd5", color: "#c2410c", label: "Sobrecarga" };
    return { bg: "#eff6ff", color: "#1e40af", label: "Normal" };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* ── BARRA DE SUB-PESTAÑAS REPLANTEADA DE CARGA EXTERNA ── */}
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "#ffffff",
          padding: "6px",
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => setSubTab("velocidad")}
          style={{
            flex: "1 1 180px",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            background: subTab === "velocidad" ? "#1e3a8a" : "transparent",
            color: subTab === "velocidad" ? "#ffffff" : "#475569",
            border: "none",
            boxShadow: subTab === "velocidad" ? "0 2px 6px rgba(30,58,138,0.25)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>🚀</span> Velocidad & Vmax (90%)
        </button>

        <button
          type="button"
          onClick={() => setSubTab("perfil_competitivo")}
          style={{
            flex: "1 1 180px",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            background: subTab === "perfil_competitivo" ? "#ea580c" : "transparent",
            color: subTab === "perfil_competitivo" ? "#ffffff" : "#475569",
            border: "none",
            boxShadow: subTab === "perfil_competitivo" ? "0 2px 6px rgba(234,88,12,0.25)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>🏆</span> Perfil Competitivo (Partido 100%)
        </button>

        <button
          type="button"
          onClick={() => setSubTab("ratios_semanales")}
          style={{
            flex: "1 1 180px",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            background: subTab === "ratios_semanales" ? "#0284c7" : "transparent",
            color: subTab === "ratios_semanales" ? "#ffffff" : "#475569",
            border: "none",
            boxShadow: subTab === "ratios_semanales" ? "0 2px 6px rgba(2,132,199,0.25)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>📈</span> Ratios Semanales vs Partido
        </button>

        <button
          type="button"
          onClick={() => setSubTab("preguntas_clave")}
          style={{
            flex: "1 1 160px",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            background: subTab === "preguntas_clave" ? "#9333ea" : "transparent",
            color: subTab === "preguntas_clave" ? "#ffffff" : "#475569",
            border: "none",
            boxShadow: subTab === "preguntas_clave" ? "0 2px 6px rgba(147,51,234,0.25)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>❓</span> Consultas Clave
        </button>

        <button
          type="button"
          onClick={() => setSubTab("sesiones_bbdd")}
          style={{
            flex: "1 1 140px",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            background: subTab === "sesiones_bbdd" ? "#334155" : "transparent",
            color: subTab === "sesiones_bbdd" ? "#ffffff" : "#64748b",
            border: "none",
            boxShadow: subTab === "sesiones_bbdd" ? "0 2px 6px rgba(51,65,85,0.25)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <span>📁</span> Sesiones & BBDD
        </button>
      </div>

      {/* ── SUB-PESTAÑA 1: VELOCIDAD & VMAX (90%) ── */}
      {subTab === "velocidad" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", borderLeft: "4px solid #16a34a", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#16a34a", textTransform: "uppercase" }}>🟢 En Rango Óptimo (≤ 4 días)</span>
              <strong style={{ fontSize: "24px", fontWeight: 900, color: "#0f172a" }}>
                {vmaxStats.optimo} <small style={{ fontSize: "12px", color: "#64748b" }}>jugadores</small>
              </strong>
              <span style={{ fontSize: "11px", color: "#64748b" }}>Exposición neuromuscular reciente a ≥ {vmaxThresholdPct}% Vmax</span>
            </div>

            <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", borderLeft: "4px solid #f59e0b", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#d97706", textTransform: "uppercase" }}>🟡 En Alerta (5 - 7 días)</span>
              <strong style={{ fontSize: "24px", fontWeight: 900, color: "#b45309" }}>
                {vmaxStats.alerta} <small style={{ fontSize: "12px", color: "#64748b" }}>jugadores</small>
              </strong>
              <span style={{ fontSize: "11px", color: "#64748b" }}>Requieren estímulo de velocidad antes de competir</span>
            </div>

            <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", borderLeft: "4px solid #ef4444", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#dc2626", textTransform: "uppercase" }}>🔴 En Riesgo (&gt; 7 días)</span>
              <strong style={{ fontSize: "24px", fontWeight: 900, color: "#b91c1c" }}>
                {vmaxStats.riesgo} <small style={{ fontSize: "12px", color: "#64748b" }}>jugadores</small>
              </strong>
              <span style={{ fontSize: "11px", color: "#64748b" }}>Sin sprint a ≥ {vmaxThresholdPct}% Vmax en más de 1 semana</span>
            </div>

            <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #cbd5e1", borderLeft: "4px solid #1e3a8a", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", textTransform: "uppercase" }}>⚡ Vmax Máxima Equipo</span>
              <strong style={{ fontSize: "24px", fontWeight: 900, color: "#1e3a8a" }}>
                {vmaxStats.maxTeamSpeed.toFixed(1)} <small style={{ fontSize: "12px", color: "#64748b" }}>km/h</small>
              </strong>
              <span style={{ fontSize: "11px", color: "#475569", fontWeight: 700 }}>
                {vmaxStats.fastestPlayer ? (vmaxStats.fastestPlayer.jugador.apodo || vmaxStats.fastestPlayer.jugador.nombre) : "-"}
              </span>
            </div>
          </div>

          {/* BARRA DE HERRAMIENTAS Y FILTROS */}
          <div
            style={{
              background: "#ffffff",
              padding: "12px 16px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a" }}>
                🎯 Umbral de Velocidad:
              </span>
              {[85, 90, 95, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setVmaxThresholdPct(pct)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: vmaxThresholdPct === pct ? "1.5px solid #1e3a8a" : "1px solid #cbd5e1",
                    background: vmaxThresholdPct === pct ? "#eff6ff" : "#f8fafc",
                    color: vmaxThresholdPct === pct ? "#1e3a8a" : "#475569",
                    fontWeight: vmaxThresholdPct === pct ? 800 : 600,
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  {pct}% Vmax
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <select
                value={vmaxFilterPos}
                onChange={(e) => setVmaxFilterPos(e.target.value)}
                style={{
                  padding: "5px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                <option value="TODOS">Todas las Posiciones</option>
                <option value="DEF">Defensas</option>
                <option value="MED">Centrocampistas</option>
                <option value="DEL">Delanteros</option>
                <option value="POR">Porteros</option>
              </select>

              <select
                value={vmaxSortBy}
                onChange={(e) => setVmaxSortBy(e.target.value as any)}
                style={{
                  padding: "5px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                <option value="dias_desc">Ordenar: Días sin tocar (Mayor a menor)</option>
                <option value="vmax_desc">Ordenar: Vmax Histórica (Más rápido)</option>
                <option value="nombre">Ordenar: Nombre</option>
              </select>

              <input
                type="text"
                placeholder="Buscar jugador..."
                value={vmaxSearch}
                onChange={(e) => setVmaxSearch(e.target.value)}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "12px",
                  outline: "none",
                  width: "140px",
                }}
              />
            </div>
          </div>

          {/* TABLA PRINCIPAL DE VELOCIDAD & DIAS AL 90% */}
          <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #cbd5e1", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
                  Monitor de Exposición Neuromuscular (≥ {vmaxThresholdPct}% Vmax)
                </span>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", background: "#e2e8f0", padding: "2px 8px", borderRadius: "12px" }}>
                  {filteredVmaxList.length} jugadores
                </span>
              </div>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                Fecha ref: {latestGpsDate}
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", color: "#0f172a" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", textAlign: "left", color: "#475569", fontSize: "11px", textTransform: "uppercase" }}>
                    <th style={{ padding: "10px 12px" }}>Jugador</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Vmax Histórica</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Umbral ({vmaxThresholdPct}%)</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Último Sprint ≥ {vmaxThresholdPct}%</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Días sin tocar el {vmaxThresholdPct}%</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Estado / Alerta</th>
                    <th style={{ padding: "10px 12px", textAlign: "left" }}>Última Sesión Registrada</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVmaxList.map((item, idx) => {
                    const j = item.jugador;
                    const days = item.daysSinceHit;
                    const hit = item.hitRecord;

                    let badgeColor = "#64748b";
                    let badgeBg = "#f1f5f9";
                    let badgeText = "Sin Registro";
                    if (item.status === "optimo") {
                      badgeColor = "#15803d";
                      badgeBg = "#dcfce7";
                      badgeText = "🟢 Óptimo (Reciente)";
                    } else if (item.status === "alerta") {
                      badgeColor = "#b45309";
                      badgeBg = "#fef3c7";
                      badgeText = "🟡 Alerta (5 - 7 días)";
                    } else if (item.status === "riesgo") {
                      badgeColor = "#b91c1c";
                      badgeBg = "#fee2e2";
                      badgeText = "🔴 Riesgo (> 7 días)";
                    }

                    return (
                      <tr
                        key={j.id || idx}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: item.status === "riesgo" ? "rgba(254, 226, 226, 0.25)" : idx % 2 === 0 ? "#ffffff" : "#fcfcfd",
                        }}
                      >
                        {/* Jugador */}
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {renderDisponibilidadBadge && renderDisponibilidadBadge(j)}
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span style={{ fontWeight: 800, color: "#0f172a" }}>
                                {j.dorsal ? "#" + j.dorsal + " " : ""}{j.apodo || j.nombre}
                              </span>
                              <span style={{ fontSize: "10.5px", color: "#64748b" }}>
                                {j.posicion || "Jugador"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Vmax Histórica */}
                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <strong style={{ fontSize: "13.5px", color: "#1e3a8a" }}>
                            {item.historicalMax > 0 ? item.historicalMax.toFixed(2) : "-"}
                          </strong>
                          <span style={{ fontSize: "10.5px", color: "#64748b", marginLeft: "3px" }}>km/h</span>
                        </td>

                        {/* Umbral 90% */}
                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <span style={{ fontWeight: 800, color: "#0f172a" }}>
                            {item.thresholdVal > 0 ? item.thresholdVal.toFixed(2) : "-"}
                          </span>
                          <span style={{ fontSize: "10.5px", color: "#64748b", marginLeft: "3px" }}>km/h</span>
                        </td>

                        {/* Último Sprint >= 90% */}
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {hit ? (
                            <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
                              <span style={{ fontWeight: 800, color: "#0f172a" }}>
                                {hit.speed.toFixed(2)} km/h
                              </span>
                              <span style={{ fontSize: "10.5px", color: "#64748b" }}>
                                {hit.fecha} {hit.md ? "(" + hit.md + ")" : ""}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>No alcanzado</span>
                          )}
                        </td>

                        {/* Días sin tocar */}
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {days !== null ? (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <span
                                style={{
                                  padding: "3px 9px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  fontWeight: 900,
                                  background: days <= 4 ? "#dcfce7" : days <= 7 ? "#fef3c7" : "#fee2e2",
                                  color: days <= 4 ? "#15803d" : days <= 7 ? "#b45309" : "#b91c1c",
                                }}
                              >
                                {days === 0 ? "Hoy" : days === 1 ? "Hace 1 día" : "Hace " + days + " días"}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>-</span>
                          )}
                        </td>

                        {/* Estado / Alerta */}
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: 800,
                              background: badgeBg,
                              color: badgeColor,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {badgeText}
                          </span>
                        </td>

                        {/* Última Sesión Registrada */}
                        <td style={{ padding: "10px 12px" }}>
                          {item.lastSessionRecord ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "120px" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                                <span style={{ fontWeight: 700, color: "#334155" }}>
                                  {item.lastSessionSpeed.toFixed(1)} km/h
                                </span>
                                <span style={{ fontWeight: 800, color: item.lastSessionPct >= vmaxThresholdPct ? "#15803d" : "#64748b" }}>
                                  {item.lastSessionPct}% Vmax
                                </span>
                              </div>
                              <div style={{ width: "100%", height: "5px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                                <div
                                  style={{
                                    width: Math.min(100, item.lastSessionPct) + "%",
                                    height: "100%",
                                    background: item.lastSessionPct >= vmaxThresholdPct ? "#16a34a" : item.lastSessionPct >= 80 ? "#f59e0b" : "#94a3b8",
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>Sin registros</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-PESTAÑA 2: PERFIL COMPETITIVO (PARTIDO 100%) ── */}
      {subTab === "perfil_competitivo" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              background: "#fff7ed",
              borderRadius: "10px",
              padding: "12px 18px",
              border: "1px solid #fed7aa",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div>
              <h4 style={{ margin: 0, fontSize: "13.5px", fontWeight: 900, color: "#c2410c" }}>
                🏆 Perfil Competitivo Individual (Benchmark 100% Match)
              </h4>
              <p style={{ margin: "2px 0 0 0", fontSize: "11.5px", color: "#7c2d12" }}>
                Calcula automáticamente la demanda media de 1 partido entero de competición por jugador (a partir de partidos jugados o media de posición).
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, color: "#9a3412", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={profileNorm90}
                  onChange={(e) => setProfileNorm90(e.target.checked)}
                />
                <span>Normalizar a 90 minutos (m/min × 90)</span>
              </label>

              <input
                type="text"
                placeholder="Buscar jugador..."
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: "1px solid #fed7aa",
                  fontSize: "12px",
                  outline: "none",
                  width: "140px",
                  background: "#ffffff",
                }}
              />
            </div>
          </div>

          <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #cbd5e1", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", color: "#0f172a" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1", textAlign: "left", color: "#475569", fontSize: "11px", textTransform: "uppercase" }}>
                    <th style={{ padding: "10px 12px" }}>Jugador</th>
                    <th style={{ padding: "10px 8px", textAlign: "center" }}>Partidos Analizados</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Distancia Total (m)</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Intensidad (m/min)</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>HSR (&gt;18 km/h)</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Sprint (&gt;25 km/h)</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Acc + Dec Totales</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Player Load (AU)</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Origen Benchmark</th>
                  </tr>
                </thead>
                <tbody>
                  {jugadores
                    .filter((j) => {
                      if (!profileSearch) return true;
                      const name = (j.apodo || j.nombre || "").toLowerCase();
                      return name.includes(profileSearch.toLowerCase());
                    })
                    .map((j, idx) => {
                      const p = competitiveProfiles.get(j.id) || {
                        dist: 10000,
                        hsr: 700,
                        sprint: 200,
                        accDec: 70,
                        load: 800,
                        mMin: 110,
                        matchesCount: 0,
                        isFallback: true,
                      };

                      return (
                        <tr key={j.id || idx} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#ffffff" : "#fcfcfd" }}>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {renderDisponibilidadBadge && renderDisponibilidadBadge(j)}
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontWeight: 800, color: "#0f172a" }}>
                                  {j.dorsal ? "#" + j.dorsal + " " : ""}{j.apodo || j.nombre}
                                </span>
                                <span style={{ fontSize: "10.5px", color: "#64748b" }}>
                                  {j.posicion || "Jugador"}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td style={{ padding: "10px 8px", textAlign: "center" }}>
                            <span style={{ fontWeight: 800, color: p.matchesCount > 0 ? "#1e3a8a" : "#94a3b8" }}>
                              {p.matchesCount} {p.matchesCount === 1 ? "partido" : "partidos"}
                            </span>
                          </td>

                          <td style={{ padding: "10px 10px", textAlign: "right" }}>
                            <strong style={{ color: "#0f172a" }}>{p.dist.toLocaleString("es-ES")}</strong>
                            <small style={{ fontSize: "10.5px", color: "#64748b", marginLeft: "2px" }}>m</small>
                          </td>

                          <td style={{ padding: "10px 10px", textAlign: "right" }}>
                            <strong style={{ color: "#0284c7" }}>{p.mMin}</strong>
                            <small style={{ fontSize: "10.5px", color: "#64748b", marginLeft: "2px" }}>m/min</small>
                          </td>

                          <td style={{ padding: "10px 10px", textAlign: "right" }}>
                            <strong style={{ color: "#ea580c" }}>{p.hsr.toLocaleString("es-ES")}</strong>
                            <small style={{ fontSize: "10.5px", color: "#64748b", marginLeft: "2px" }}>m</small>
                          </td>

                          <td style={{ padding: "10px 10px", textAlign: "right" }}>
                            <strong style={{ color: "#dc2626" }}>{p.sprint.toLocaleString("es-ES")}</strong>
                            <small style={{ fontSize: "10.5px", color: "#64748b", marginLeft: "2px" }}>m</small>
                          </td>

                          <td style={{ padding: "10px 10px", textAlign: "right" }}>
                            <strong style={{ color: "#9333ea" }}>{p.accDec}</strong>
                          </td>

                          <td style={{ padding: "10px 10px", textAlign: "right" }}>
                            <strong style={{ color: "#16a34a" }}>{p.load}</strong>
                          </td>

                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            {p.isFallback ? (
                              <span style={{ fontSize: "10.5px", fontWeight: 700, padding: "2px 7px", borderRadius: "4px", background: "#fef3c7", color: "#b45309" }}>
                                Media Posición
                              </span>
                            ) : (
                              <span style={{ fontSize: "10.5px", fontWeight: 700, padding: "2px 7px", borderRadius: "4px", background: "#dcfce7", color: "#15803d" }}>
                                Partidos Reales
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-PESTAÑA 3: RATIOS SEMANALES VS PARTIDO (% MATCH) ── */}
      {subTab === "ratios_semanales" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              background: "#ffffff",
              padding: "12px 16px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#0f172a" }}>
                📆 Microciclo:
              </span>
              <select
                value={selectedWeekIdx}
                onChange={(e) => setSelectedWeekIdx(Number(e.target.value))}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1.5px solid #0284c7",
                  background: "#f0f9ff",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  color: "#0369a1",
                  outline: "none",
                }}
              >
                {availableWeeks.map((w, idx) => (
                  <option key={w.start + idx} value={idx}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                Formato de visualización:
              </span>
              <button
                type="button"
                onClick={() => setRatioFormat("multiplier")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: ratioFormat === "multiplier" ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                  background: ratioFormat === "multiplier" ? "#e0f2fe" : "#f8fafc",
                  color: ratioFormat === "multiplier" ? "#0369a1" : "#475569",
                  fontWeight: ratioFormat === "multiplier" ? 800 : 600,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Multiplicador (ej. 2.1x)
              </button>

              <button
                type="button"
                onClick={() => setRatioFormat("percentage")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: ratioFormat === "percentage" ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                  background: ratioFormat === "percentage" ? "#e0f2fe" : "#f8fafc",
                  color: ratioFormat === "percentage" ? "#0369a1" : "#475569",
                  fontWeight: ratioFormat === "percentage" ? 800 : 600,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Porcentaje (ej. 210%)
              </button>
            </div>
          </div>

          <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #cbd5e1", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 900, color: "#0f172a" }}>
                Ratios de Carga Semanal vs 1 Partido Entero de Competición
              </span>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Cálculo: (Carga Semanal Acumulada / Perfil de Partido)
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", color: "#0f172a" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", textAlign: "left", color: "#475569", fontSize: "11px", textTransform: "uppercase" }}>
                    <th style={{ padding: "10px 12px" }}>Jugador</th>
                    <th style={{ padding: "10px 6px", textAlign: "center" }}>Sesiones</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Distancia (m / Ratio)</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>HSR (m / Ratio)</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Sprint (m / Ratio)</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Acc + Dec (Ratio)</th>
                    <th style={{ padding: "10px 10px", textAlign: "right" }}>Player Load (Ratio)</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Vmax Semana (% Top)</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyRatiosData.map((row, idx) => {
                    const j = row.jugador;
                    const sprintBadge = getRatioBadgeStyle(row.ratioSprint, "sprint");

                    return (
                      <tr key={j.id || idx} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#ffffff" : "#fcfcfd" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {renderDisponibilidadBadge && renderDisponibilidadBadge(j)}
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span style={{ fontWeight: 800, color: "#0f172a" }}>
                                {j.dorsal ? "#" + j.dorsal + " " : ""}{j.apodo || j.nombre}
                              </span>
                              <span style={{ fontSize: "10px", color: "#64748b" }}>
                                {j.posicion || "Jugador"}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: "10px 6px", textAlign: "center", fontWeight: 800 }}>
                          {row.sessionsCount}
                        </td>

                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                            <span style={{ fontWeight: 800, color: "#0f172a" }}>
                              {row.weekDist.toLocaleString("es-ES")} m
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: 900, color: "#1e40af" }}>
                              {formatRatioVal(row.ratioDist)}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                            <span style={{ fontWeight: 800, color: "#ea580c" }}>
                              {row.weekHsr.toLocaleString("es-ES")} m
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: 900, color: "#c2410c" }}>
                              {formatRatioVal(row.ratioHsr)}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                            <span style={{ fontWeight: 800, color: "#dc2626" }}>
                              {row.weekSprint.toLocaleString("es-ES")} m
                            </span>
                            <span
                              style={{
                                fontSize: "10.5px",
                                fontWeight: 900,
                                padding: "1px 6px",
                                borderRadius: "4px",
                                background: sprintBadge.bg,
                                color: sprintBadge.color,
                              }}
                            >
                              {formatRatioVal(row.ratioSprint)} {row.ratioSprint < 0.75 ? "⚠️" : ""}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                            <span style={{ fontWeight: 800, color: "#9333ea" }}>
                              {row.weekAccDec}
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: 900, color: "#7e22ce" }}>
                              {formatRatioVal(row.ratioAccDec)}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: "10px 10px", textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                            <span style={{ fontWeight: 800, color: "#16a34a" }}>
                              {row.weekLoad}
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: 900, color: "#15803d" }}>
                              {formatRatioVal(row.ratioLoad)}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                            <span style={{ fontWeight: 800, color: row.vmaxPct >= 90 ? "#15803d" : "#64748b" }}>
                              {row.weekMaxSpeed > 0 ? row.weekMaxSpeed.toFixed(1) + " km/h" : "-"}
                            </span>
                            {row.weekMaxSpeed > 0 && (
                              <span style={{ fontSize: "10px", fontWeight: 800, color: row.vmaxPct >= 90 ? "#15803d" : "#b45309" }}>
                                {row.vmaxPct}% Vmax
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-PESTAÑA 4: CONSULTAS & PREGUNTAS CLAVE ── */}
      {subTab === "preguntas_clave" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ background: "#ffffff", padding: "16px 20px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 900, color: "#0f172a", textTransform: "uppercase" }}>
              ❓ Centro de Consultas Clave de Rendimiento
            </h3>
            <p style={{ margin: "4px 0 16px 0", fontSize: "12.5px", color: "#64748b" }}>
              Acceso rápido a las preguntas más críticas de control de carga, prevención de lesiones y rendimiento deportivo.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
              <div
                onClick={() => setSubTab("velocidad")}
                style={{
                  background: "#f0fdf4",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  border: "1px solid #bbf7d0",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "16px" }}>🚀</span>
                  <span style={{ fontSize: "11px", fontWeight: 800, background: "#dcfce7", color: "#15803d", padding: "2px 6px", borderRadius: "4px" }}>
                    {vmaxStats.alerta + vmaxStats.riesgo} alertas
                  </span>
                </div>
                <strong style={{ fontSize: "13px", color: "#166534" }}>
                  ¿Cuánto hace que un jugador no llega al 90% de Vmax?
                </strong>
                <span style={{ fontSize: "11.5px", color: "#4b5563" }}>
                  Identifica jugadores sin estímulo neuromuscular en los últimos 5 a 8 días para programar sprints preventivos.
                </span>
              </div>

              <div
                onClick={() => {
                  setSubTab("ratios_semanales");
                  setRatioFormat("multiplier");
                }}
                style={{
                  background: "#eff6ff",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  border: "1px solid #bfdbfe",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "16px" }}>📈</span>
                  <span style={{ fontSize: "11px", fontWeight: 800, background: "#dbeafe", color: "#1e40af", padding: "2px 6px", borderRadius: "4px" }}>
                    Ratios vs Partido
                  </span>
                </div>
                <strong style={{ fontSize: "13px", color: "#1e3a8a" }}>
                  ¿Cuál es el ratio de carga semanal respecto a 1 partido entero?
                </strong>
                <span style={{ fontSize: "11.5px", color: "#4b5563" }}>
                  Mide los multiplicadores de volumen (distancia), HSR, sprint y aceleraciones para calibrar el microciclo.
                </span>
              </div>

              <div
                onClick={() => setSubTab("perfil_competitivo")}
                style={{
                  background: "#fff7ed",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  border: "1px solid #fed7aa",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "16px" }}>🏆</span>
                  <span style={{ fontSize: "11px", fontWeight: 800, background: "#ffedd5", color: "#c2410c", padding: "2px 6px", borderRadius: "4px" }}>
                    Match Profile
                  </span>
                </div>
                <strong style={{ fontSize: "13px", color: "#9a3412" }}>
                  ¿Cuál es el perfil competitivo (100%) de cada jugador?
                </strong>
                <span style={{ fontSize: "11.5px", color: "#4b5563" }}>
                  Calcula la huella de 90 minutos de partido en distancia, HSR, sprints y m/min.
                </span>
              </div>

              <div
                style={{
                  background: "#faf5ff",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  border: "1.5px dashed #d8b4fe",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "16px" }}>➕</span>
                  <span style={{ fontSize: "11px", fontWeight: 800, background: "#f3e8ff", color: "#7e22ce", padding: "2px 6px", borderRadius: "4px" }}>
                    Escalable
                  </span>
                </div>
                <strong style={{ fontSize: "13px", color: "#6b21a8" }}>
                  Nuevas preguntas por responder
                </strong>
                <span style={{ fontSize: "11.5px", color: "#6b7280" }}>
                  Aquí iremos integrando las siguientes preguntas analíticas que me vayas indicando.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-PESTAÑA 5: SESIONES & BBDD ── */}
      {subTab === "sesiones_bbdd" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              background: "#ffffff",
              padding: "16px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#0f172a" }}>
                📁 Gestión de Archivos GPS & Sincronización
              </h4>
              <span style={{ fontSize: "11.5px", color: "#64748b" }}>
                Sincroniza directamente desde la carpeta Downloads o carga archivos CSV / Excel puntuales.
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={handleSyncDownloadsGps}
                disabled={isGpsUploading}
                style={{
                  background: isGpsUploading ? "#94a3b8" : "#1e3a8a",
                  color: "#ffffff",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 800,
                  border: "none",
                  cursor: isGpsUploading ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>{isGpsUploading ? "⏳" : "🔄"}</span>
                <span>{isGpsUploading ? "Sincronizando..." : "Sincronizar Downloads"}</span>
              </button>

              <label
                style={{
                  background: isGpsUploading ? "#94a3b8" : "#0284c7",
                  color: "#ffffff",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: isGpsUploading ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>📁</span>
                <span>Seleccionar CSV</span>
                <input
                  type="file"
                  multiple
                  accept=".csv, .tsv, .xlsx, .xls"
                  onChange={handleGpsCsvUpload}
                  disabled={isGpsUploading}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>

          {gpsUploadStatus && (
            <div
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                background: gpsUploadStatus.isError ? "#fee2e2" : "#dcfce7",
                color: gpsUploadStatus.isError ? "#b91c1c" : "#15803d",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              {gpsUploadStatus.message}
            </div>
          )}

          <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #cbd5e1", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a" }}>
                  📅 Registros de Sesión
                </span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                />
              </div>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                {gpsRecords.filter((r) => r.fecha === selectedDate).length} registros en esta fecha
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", color: "#0f172a" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", textAlign: "left", color: "#475569" }}>
                    <th style={{ padding: "8px 10px" }}>Jugador</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Distancia (m)</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>HSR (m)</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Top Speed (km/h)</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Player Load (AU)</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>Sprints</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>Tipo Sesión</th>
                  </tr>
                </thead>
                <tbody>
                  {jugadores.map((j, idx) => {
                    const rec = gpsRecords.find((r) => r.jugador_id === j.id && r.fecha === selectedDate);
                    const dist = rec ? Math.round(Number(rec.distancia_total) || 0) : 0;
                    const hsr = rec ? Math.round(Number(rec.distancia_z4) || 0) : 0;
                    const topSpd = rec ? Number(rec.max_speed) || 0 : 0;
                    const load = rec ? Math.round(Number(rec.player_load) || 0) : 0;
                    const sprints = rec ? Math.round(Number(rec.num_sprints) || 0) : 0;
                    const tipoSesion = rec ? rec.tipo_sesion || "Entrenamiento" : "-";

                    return (
                      <tr key={j.id || idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {renderDisponibilidadBadge && renderDisponibilidadBadge(j)}
                            <span style={{ fontWeight: 700 }}>{(j.apodo || j.nombre || "").toUpperCase()}</span>
                          </div>
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800 }}>{dist > 0 ? dist.toLocaleString("es-ES") : "-"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#ea580c", fontWeight: 700 }}>{hsr > 0 ? hsr.toLocaleString("es-ES") : "-"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#9333ea", fontWeight: 800 }}>{topSpd > 0 ? topSpd.toFixed(1) : "-"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#0284c7", fontWeight: 700 }}>{load > 0 ? load.toLocaleString("es-ES") : "-"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 800 }}>{sprints > 0 ? sprints : "-"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center", fontSize: "11px", color: "#64748b" }}>{tipoSesion}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
