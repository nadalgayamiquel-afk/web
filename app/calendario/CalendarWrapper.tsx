"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import type { SesionDia, TipoEvento, ComentarioJugadorDia } from "./CalendarGrid";

const CalendarGridClient = dynamic(
  () => import("./CalendarGrid").then((mod) => mod.CalendarGrid),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: "32px", textAlign: "center", background: "#ffffff", borderRadius: "12px", border: "1px solid #cbd5e1", color: "#64748b", fontWeight: 700 }}>
        ⚡ Cargando cuadrante de planificación...
      </div>
    ),
  }
);

export function CalendarWrapper(props: {
  initialDays: SesionDia[];
  tiposEvento: TipoEvento[];
  initialJugadores: any[];
  initialEstados: any[];
  initialBloques?: Record<string, any>;
  bbddPlayerAssignments?: Record<string, string>;
  initialComentarios?: ComentarioJugadorDia[];
  initialDisponibilidadMap?: Record<string, string>;
  initialMinutesMap?: Record<string, any>;
  initialBrowserData?: Record<string, any>;
}) {
  // Hidratar y restaurar en localStorage todos los datos reales post-12 de octubre antes de montar CalendarGrid
  if (typeof window !== "undefined") {
    try {
      const RESTORE_VERSION = "rescued_post_oct13_v2";
      const alreadyRestored = localStorage.getItem("__master_restore_version__") === RESTORE_VERSION;

      if (!alreadyRestored) {
        if (props.initialDays && props.initialDays.length > 0) {
          const daysJson = JSON.stringify(props.initialDays);
          localStorage.setItem("planificacion_days_v1", daysJson);
          localStorage.setItem("planificacion_days_v2", daysJson);
          localStorage.setItem("planificacion_days_v5", daysJson);
        }
        if (props.bbddPlayerAssignments && Object.keys(props.bbddPlayerAssignments).length > 0) {
          const curRaw = localStorage.getItem("player_events_map_v1");
          const cur = curRaw ? JSON.parse(curRaw) : {};
          localStorage.setItem("player_events_map_v1", JSON.stringify({ ...cur, ...props.bbddPlayerAssignments }));
        }
        if (props.initialBloques && Object.keys(props.initialBloques).length > 0) {
          const curRaw = localStorage.getItem("eventos_bloques_map_v5");
          const cur = curRaw ? JSON.parse(curRaw) : {};
          const mergedBloques = { ...cur, ...props.initialBloques };
          localStorage.setItem("eventos_bloques_map_v5", JSON.stringify(mergedBloques));
          localStorage.setItem("eventos_bloques_map_v1", JSON.stringify(mergedBloques));
        }
        if (props.initialComentarios && props.initialComentarios.length > 0) {
          localStorage.setItem("comentarios_jugadores_v2", JSON.stringify(props.initialComentarios));
        }
        if (props.initialDisponibilidadMap && Object.keys(props.initialDisponibilidadMap).length > 0) {
          const curRaw = localStorage.getItem("disponibilidad_map_v1");
          const cur = curRaw ? JSON.parse(curRaw) : {};
          localStorage.setItem("disponibilidad_map_v1", JSON.stringify({ ...cur, ...props.initialDisponibilidadMap }));
        }
        if (props.initialMinutesMap && Object.keys(props.initialMinutesMap).length > 0) {
          const curRaw = localStorage.getItem("player_event_minutes_map_v1");
          const cur = curRaw ? JSON.parse(curRaw) : {};
          localStorage.setItem("player_event_minutes_map_v1", JSON.stringify({ ...cur, ...props.initialMinutesMap }));
        }
        if (props.initialBrowserData) {
          const bd = props.initialBrowserData;
          const mapKeys = [
            "partidos_jornadas_map_v1",
            "rival_evento_map_v1",
            "disponibilidad_player_tags_v1",
            "disponibilidad_status_overrides_v1",
            "lesiones_registro_detallado_v1",
            "informe_microciclo_comentarios_v1",
            "cargas_manual_wellness_v3",
            "cargas_wellness_general_comments_v2",
            "planificacion_comentarios_v1",
          ];
          for (const k of mapKeys) {
            if (bd[k] !== undefined) {
              localStorage.setItem(k, JSON.stringify(bd[k]));
            }
          }
        }
        localStorage.setItem("__master_restore_version__", RESTORE_VERSION);
      }
    } catch (e) {
      console.warn("Error bootstrapping localStorage:", e);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("storage"));
  }, []);

  return <CalendarGridClient {...props} />;
}
