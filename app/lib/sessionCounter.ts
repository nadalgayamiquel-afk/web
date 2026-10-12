/**
 * Motor de cálculo del número acumulado de Sesión Optimizadora.
 * Ruta: app/lib/sessionCounter.ts
 *
 * El número de sesión avanza según si en la Planificación ha habido un evento
 * Optimizador ("Op", "Optimizador", "E", "Entrenamiento").
 * Regla explícita: "Oop" (Optimizador Opcional) NUNCA se cuenta como sesión optimizadora.
 * Ancla oficial fijada por el usuario: Sábado 05/09/2026 es la Sesión 24.
 */

export const ANCHOR_DATE = "2026-09-05";
export const ANCHOR_SESSION = 24;

/**
 * Determina si un código o texto de tipo de evento corresponde a un entrenamiento Optimizador.
 * Excluye explícitamente "Oop" (Optimizador Opcional), Coadyuvantes, Partidos, Descansos, etc.
 */
export function isOptimizadorEventType(val?: string | null): boolean {
  if (!val) return false;
  const s = String(val).trim().toLowerCase();
  if (!s) return false;

  // Exclusiones explícitas - Nunca contar "Oop" (Optimizador Opcional)
  if (s === "oop" || s.startsWith("oop") || s.includes("opcional")) {
    return false;
  }
  if (
    s === "co" ||
    s.startsWith("co ") ||
    s === "cop" ||
    s.startsWith("pa") ||
    s === "d" ||
    s.includes("descanso") ||
    s.includes("libre") ||
    s.includes("off") ||
    s === "red" ||
    s === "vd" ||
    s === "vi" ||
    s === "viaje" ||
    s === "ot" ||
    s === "otros" ||
    s === "va" ||
    s === "gim" ||
    s === "gimnasio"
  ) {
    return false;
  }

  // Coincidencias de Optimizador
  if (
    s === "op" ||
    s === "e" ||
    s.startsWith("op ") ||
    s.endsWith(" op") ||
    s.includes("optimizador") ||
    s.includes("entrenamiento optimizador") ||
    s === "entrenamiento"
  ) {
    return true;
  }

  return false;
}

export interface PlanContextOptions {
  bloquesMap?: Record<string, any>;
  daysList?: any[];
}

/**
 * Comprueba si en una fecha concreta existe al menos un evento Optimizador
 * comprobando bloques de eventos (slots 0..5), columnas evento_am, evento_pm y campos generales.
 */
export function hasOptimizadorEventOnDate(dateStr: string, options?: PlanContextOptions): boolean {
  if (!dateStr) return false;

  // 1. Comprobar en el mapa de bloques de eventos (ej. "2026-08-28_slot_0", etc.)
  if (options?.bloquesMap) {
    for (let slot = 0; slot < 6; slot++) {
      const b1 = options.bloquesMap[`${dateStr}_slot_${slot}`];
      if (b1 && isOptimizadorEventType(b1.tipo || b1.codigo)) {
        return true;
      }
    }

    // Buscar también por propiedad fecha
    const keys = Object.keys(options.bloquesMap);
    for (const k of keys) {
      const item = options.bloquesMap[k];
      if (item && (item.fecha === dateStr || item.day_id === dateStr)) {
        if (isOptimizadorEventType(item.tipo || item.codigo)) {
          return true;
        }
      }
    }
  }

  // 2. Comprobar en la lista de días de planificación (días con evento_am, evento_pm, evento_principal, etc.)
  if (options?.daysList && Array.isArray(options.daysList) && options.daysList.length > 0) {
    const day = options.daysList.find((d: any) => d && (d.fecha === dateStr || d.id === dateStr));
    if (day) {
      const eventFields = [
        day.evento_principal,
        day.evento_am,
        day.evento_pm,
        day.evento,
        day.evento_1,
        day.evento_2,
        day.evento_3,
        day.evento_4,
        day.evento_5,
        day.evento_6,
      ];

      const hasOpInFields = eventFields.some((f) => isOptimizadorEventType(f));
      if (hasOpInFields) return true;

      // Si el día está en la lista pero no tiene ningún evento Op
      return false;
    }
  }

  // Fallback para días predeterminados
  const PRESET_OP_DATES: Record<string, boolean> = {
    "2026-08-31": true,
    "2026-09-01": false,
    "2026-09-02": true,
    "2026-09-03": true,
    "2026-09-04": false,
    "2026-09-05": true, // Sesión 24
    "2026-09-06": false,
    "2026-09-07": true,
    "2026-09-08": false,
    "2026-09-09": true,
  };

  if (PRESET_OP_DATES[dateStr] !== undefined) {
    return PRESET_OP_DATES[dateStr];
  }

  return false;
}

/**
 * Calcula el número acumulado de sesión Optimizadora para cualquier fecha target.
 * Vinculado a que el Sábado 05/09/2026 es la Sesión 24, incrementando hacia adelante
 * y calculando de forma coherente hacia atrás.
 */
export function calculateOptimizadorSessionNumber(
  targetDateISO: string,
  options?: PlanContextOptions
): number {
  if (!targetDateISO) return ANCHOR_SESSION;

  const targetHasOp = hasOptimizadorEventOnDate(targetDateISO, options);

  // Caso exacto Sábado 05/09/2026 -> Sesión 24
  if (targetDateISO === ANCHOR_DATE) {
    return ANCHOR_SESSION;
  }

  // Fechas posteriores a 2026-09-05: sumar sesiones Optimizadoras
  if (targetDateISO > ANCHOR_DATE) {
    let count = ANCHOR_SESSION;
    const curr = new Date(ANCHOR_DATE + "T00:00:00Z");
    curr.setUTCDate(curr.getUTCDate() + 1);
    const target = new Date(targetDateISO + "T00:00:00Z");

    while (curr <= target) {
      const iso = curr.toISOString().slice(0, 10);
      if (hasOptimizadorEventOnDate(iso, options)) {
        count++;
      }
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return targetHasOp ? count : count + 1;
  }

  // Fechas anteriores a 2026-09-05: restar sesiones Optimizadoras ocurridas entre target y anchor
  let opsBetween = 0;
  const curr = new Date(targetDateISO + "T00:00:00Z");
  curr.setUTCDate(curr.getUTCDate() + 1);
  const anchor = new Date(ANCHOR_DATE + "T00:00:00Z");

  while (curr <= anchor) {
    const iso = curr.toISOString().slice(0, 10);
    if (hasOptimizadorEventOnDate(iso, options)) {
      opsBetween++;
    }
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  const numAtDate = Math.max(1, ANCHOR_SESSION - opsBetween);
  return targetHasOp ? numAtDate : numAtDate + 1;
}

/**
 * Helper para cliente (navegador) que lee automáticamente los datos más recientes
 * guardados en localStorage (eventos_bloques_map_v1, planificacion_days_v2, etc.)
 */
export function getLiveClientSessionNumber(targetDateISO: string, options?: PlanContextOptions): number {
  if (!targetDateISO) return ANCHOR_SESSION;

  let bloquesMap: Record<string, any> = options?.bloquesMap || {};
  let daysList: any[] = options?.daysList || [];

  if (typeof window !== "undefined") {
    try {
      if (!bloquesMap || Object.keys(bloquesMap).length === 0) {
        const rawBloques = localStorage.getItem("eventos_bloques_map_v1");
        if (rawBloques) {
          bloquesMap = JSON.parse(rawBloques);
        }
      }

      if (!daysList || daysList.length === 0) {
        const rawDays =
          localStorage.getItem("planificacion_days_v2") ||
          localStorage.getItem("planificacion_days_v1");
        if (rawDays) {
          daysList = JSON.parse(rawDays);
        }
      }
    } catch (e) {
      console.warn("Error leyendo planificación local para número de sesión:", e);
    }
  }

  return calculateOptimizadorSessionNumber(targetDateISO, { bloquesMap, daysList });
}
