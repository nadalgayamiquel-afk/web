"use client";

import dynamic from "next/dynamic";
import type { SesionDia, TipoEvento } from "./CalendarGrid";

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
}) {

  return <CalendarGridClient {...props} />;
}
