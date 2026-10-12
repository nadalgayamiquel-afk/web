/**
 * Limpieza automática de claves obsoletas en localStorage para fechas >= 2026-10-17.
 * Evita que datos locales antiguos de disponibilidad, comentarios o bloques de eventos
 * reaparezcan en el cliente tras haber sido purgados de Supabase.
 */
export function pruneStaleFutureLocalStorage(cutoffDate = "2026-10-17") {
  if (typeof window === "undefined") return;
  try {
    // 1. Bloques de eventos
    const blockKeys = [
      "eventos_bloques_map_v5",
      "eventos_bloques_map_v4",
      "eventos_bloques_map_v3",
      "eventos_bloques_map_v2",
      "eventos_bloques_map_v1",
    ];
    blockKeys.forEach((k) => {
      const raw = localStorage.getItem(k);
      if (!raw) return;
      try {
        const obj = JSON.parse(raw);
        let changed = false;
        const next: Record<string, any> = {};
        for (const [key, val] of Object.entries(obj)) {
          const f = (val && typeof val === "object" && (val as any).fecha)
            ? (val as any).fecha
            : key.match(/\d{4}-\d{2}-\d{2}/)?.[0];
          if (f && f >= cutoffDate) {
            changed = true;
          } else {
            next[key] = val;
          }
        }
        if (changed) localStorage.setItem(k, JSON.stringify(next));
      } catch {}
    });

    // 2. Disponibilidad
    const dispKeys = [
      "planificacion_disponibilidad_map",
      "disponibilidad_map_v1",
      "disponibilidad_status_overrides_v1",
    ];
    dispKeys.forEach((k) => {
      const raw = localStorage.getItem(k);
      if (!raw) return;
      try {
        const obj = JSON.parse(raw);
        let changed = false;
        const next: Record<string, any> = {};
        for (const [key, val] of Object.entries(obj)) {
          const f = key.match(/\d{4}-\d{2}-\d{2}/)?.[0];
          if (f && f >= cutoffDate) {
            changed = true;
          } else {
            next[key] = val;
          }
        }
        if (changed) localStorage.setItem(k, JSON.stringify(next));
      } catch {}
    });

    // 3. Asignación de eventos a jugadores
    const evKeys = [
      "player_events_map_v1",
      "bbdd_player_assignments",
      "player_event_minutes_map_v1",
    ];
    evKeys.forEach((k) => {
      const raw = localStorage.getItem(k);
      if (!raw) return;
      try {
        const obj = JSON.parse(raw);
        let changed = false;
        const next: Record<string, any> = {};
        for (const [key, val] of Object.entries(obj)) {
          const f = key.match(/\d{4}-\d{2}-\d{2}/)?.[0];
          if (f && f >= cutoffDate) {
            changed = true;
          } else {
            next[key] = val;
          }
        }
        if (changed) localStorage.setItem(k, JSON.stringify(next));
      } catch {}
    });

    // 4. Comentarios de jugadores y de planificación (arrays)
    const comKeys = [
      "comentarios_jugadores_v2",
      "planificacion_comentarios_v1",
      "disponibilidad_player_comments_v1",
    ];
    comKeys.forEach((k) => {
      const raw = localStorage.getItem(k);
      if (!raw) return;
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const next = arr.filter((c: any) => {
            const f = c?.fecha || (typeof c?.day_id === "string" ? c.day_id.match(/\d{4}-\d{2}-\d{2}/)?.[0] : null);
            return !f || f < cutoffDate;
          });
          if (next.length !== arr.length) {
            localStorage.setItem(k, JSON.stringify(next));
          }
        }
      } catch {}
    });

    // 5. Comentarios de pitch y tareas de sesión (objetos con clave fecha)
    const pitchKeys = [
      "disponibilidad_pitch_comments_v1",
      "disponibilidad_session_tasks_v1",
      "cargas_wellness_general_comments_v1",
    ];
    pitchKeys.forEach((k) => {
      const raw = localStorage.getItem(k);
      if (!raw) return;
      try {
        const obj = JSON.parse(raw);
        let changed = false;
        const next: Record<string, any> = {};
        for (const [key, val] of Object.entries(obj)) {
          const f = key.match(/\d{4}-\d{2}-\d{2}/)?.[0];
          if (f && f >= cutoffDate) {
            changed = true;
          } else {
            next[key] = val;
          }
        }
        if (changed) localStorage.setItem(k, JSON.stringify(next));
      } catch {}
    });
  } catch (e) {
    console.warn("Error en pruneStaleFutureLocalStorage:", e);
  }
}
