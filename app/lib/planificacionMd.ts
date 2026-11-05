/**
 * Helper centralizado para resolver el Match Day (MD) exacto de una fecha según Planificación (sesiones_dia)
 */

export function isMatchDaySession(d: any): boolean {
  if (!d) return false;
  if (d.rival && String(d.rival).trim().length > 0) return true;
  if (String(d.md || "").trim().toUpperCase() === "MD") return true;
  const evs = [d.evento, d.evento_am, d.evento_pm, d.evento_principal, d.evento_1];
  const codes = ["PAV", "PAL", "PL", "PV", "PA", "PARTIDO"];
  return evs.some((e: any) => {
    if (!e) return false;
    const n = String(e).toUpperCase().trim();
    return codes.some((c) => n === c || n.startsWith(c) || n.includes(" " + c));
  });
}

export function getLocalStoragePlanificacionDays(): any[] {
  if (typeof window === "undefined") return [];
  const planKeys = [
    "planificacion_days_v5",
    "planificacion_days_v2",
    "planificacion_days_v1",
    "planificacion_days_v4",
    "planificacion_days_v3",
    "planificacion_sesiones_v1",
    "planificacion_calendario_v1",
  ];
  for (const k of planKeys) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : Object.values(parsed);
        if (Array.isArray(list) && list.length > 0) return list;
      }
    } catch {}
  }
  return [];
}

export function resolvePlanificacionMD(
  dateStr: string,
  planifDays: any[] = [],
  gpsRecs: any[] = [],
  playerId?: string
): string {
  if (!dateStr) return "MD";

  // Si se busca el perfil individual de un jugador específico y dicho jugador tiene partido registrado en esa fecha
  if (playerId && gpsRecs && gpsRecs.length > 0) {
    const pRec = gpsRecs.find(
      (r: any) =>
        r.fecha === dateStr &&
        r.jugador_id === playerId &&
        (r.match_day === "MD" ||
          r.md === "MD" ||
          String(r.tipo_sesion || "").toUpperCase().includes("PARTIDO") ||
          String(r.sesion_nombre || "").toUpperCase().includes("PARTIDO"))
    );
    if (pRec) return "MD";
  }

  const localDays = getLocalStoragePlanificacionDays();
  const allKnownDays = (Array.isArray(planifDays) && planifDays.length > 0) ? planifDays : localDays;

  // 1. Si la propia fecha es un partido del equipo en planificación -> MD
  const directFound = allKnownDays.find((d: any) => d && (d.fecha === dateStr || d.id === dateStr));
  if (directFound && isMatchDaySession(directFound)) {
    return "MD";
  }

  // 2. LA MD+1 SIEMPRE SE PRIORIZA: si el día anterior fue partido, SIEMPRE es +1 MD
  const prevDate = new Date(dateStr + "T12:00:00");
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().split("T")[0];
  const prevDay = allKnownDays.find((d: any) => d && (d.fecha === prevDateStr || d.id === prevDateStr));
  if (prevDay && isMatchDaySession(prevDay)) {
    return "+1 MD";
  }

  // 3. Coincidencia directa en planificación
  if (directFound?.md && String(directFound.md).trim()) {
    return String(directFound.md).trim();
  }

  // 4. Recalcular según distancia a los partidos registrados en Planificación
  const matches = Array.from(
    new Set(
      allKnownDays
        .filter(isMatchDaySession)
        .map((d: any) => d.fecha)
        .filter(Boolean)
    )
  ).sort();

  // Si no hay partidos en planificación, mirar también en gpsRecs
  // REGLA CLAVE: Si solo 1 jugador tiene MD en un día, no altera la visión de equipo (solo si > 1 jugador jugó)
  if (matches.length === 0 && gpsRecs && gpsRecs.length > 0) {
    const matchPlayersPerDate = new Map<string, Set<string>>();
    gpsRecs.forEach((r: any) => {
      if (
        r.fecha &&
        (r.match_day === "MD" ||
          r.md === "MD" ||
          String(r.tipo_sesion || "").toUpperCase().includes("PARTIDO") ||
          String(r.sesion_nombre || "").toUpperCase().includes("PARTIDO"))
      ) {
        const pId = r.jugador_id || r.id || "p";
        if (!matchPlayersPerDate.has(r.fecha)) matchPlayersPerDate.set(r.fecha, new Set());
        matchPlayersPerDate.get(r.fecha)!.add(pId);
      }
    });

    matchPlayersPerDate.forEach((pSet, dt) => {
      if (pSet.size > 1 && !matches.includes(dt)) {
        matches.push(dt);
      }
    });
    matches.sort();
  }

  if (matches.includes(dateStr)) return "MD";

  if (matches.length > 0) {
    const tTime = new Date(dateStr + "T12:00:00").getTime();
    const upcoming = matches.filter((m) => m > dateStr).sort();
    const past = matches.filter((m) => m < dateStr).sort().reverse();

    if (upcoming.length > 0 && past.length > 0) {
      const uTime = new Date(upcoming[0] + "T12:00:00").getTime();
      const pTime = new Date(past[0] + "T12:00:00").getTime();
      const distNext = Math.round((uTime - tTime) / (1000 * 60 * 60 * 24));
      const distPrev = Math.round((tTime - pTime) / (1000 * 60 * 60 * 24));

      const totalCycleDays = Math.round((uTime - pTime) / (1000 * 60 * 60 * 24));

      // 1. REGLA CLAVE: La MD+1 SIEMPRE se prioriza por encima de -2, -3...
      if (distPrev === 1) {
        return "+1 MD";
      }

      // 2. REGLA CLAVE: La MD+2 SIEMPRE se prioriza por encima de -3, -4, -5...
      if (distPrev === 2 && distNext >= 3) {
        return "+2 MD";
      }

      // 3. Partido inminente en 1 o 2 días
      if (distNext === 1) return "-1 MD";
      if (distNext === 2) return "-2 MD";

      // 4. REGLA CLAVE: Una semana media (<= 7 días entre MD) NO TIENE MD-5
      if (totalCycleDays <= 7 && distNext === 5) {
        if (distPrev <= 2) return "+2 MD";
        return "-4 MD";
      }

      if (distNext <= 5) {
        return `-${distNext} MD`;
      } else {
        return `+${distPrev} MD`;
      }
    } else if (upcoming.length > 0) {
      const uTime = new Date(upcoming[0] + "T12:00:00").getTime();
      const distNext = Math.round((uTime - tTime) / (1000 * 60 * 60 * 24));
      return `-${distNext} MD`;
    } else if (past.length > 0) {
      const pTime = new Date(past[0] + "T12:00:00").getTime();
      const distPrev = Math.round((tTime - pTime) / (1000 * 60 * 60 * 24));
      if (distPrev > 3) return "MD";
      return `+${distPrev} MD`;
    }
  }

  return "MD";
}
