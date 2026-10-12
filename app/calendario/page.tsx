import Link from "next/link";
import { getSesionesDiaRange, getTiposEvento, getActiveJugadores, getEstadoDiarioJugadores, getFullExcelBBDDRows, getEventosBloquesBBDD } from "../actions";
import type { SesionDia, TipoEvento } from "./CalendarGrid";
import { CalendarWrapper } from "./CalendarWrapper";
import GenerateDaysModal from "./GenerateDaysModal";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  let days: SesionDia[] = [];
  let tiposEvento: TipoEvento[] = [];
  let jugadores: any[] = [];
  let estados: any[] = [];
  let bloques: Record<string, any> = {};
  let bbddAssignments: Record<string, string> = {};
  let errorMsg: string | null = null;

  try {
    // Cargar sesiones, tipos y datos completos de BBDD
    const [rawDays, rawTipos, rawJugadores, rawBloques] = await Promise.all([
      getSesionesDiaRange(),
      getTiposEvento(),
      getActiveJugadores(),
      getEventosBloquesBBDD(),
    ]);

    // Filtrar estados solo por las sesiones del rango cargado para evitar full table scan
    const sesionIds = (rawDays as any[]).map((d: any) => d.id).filter(Boolean);
    const rawEstados = await getEstadoDiarioJugadores(sesionIds.length > 0 ? sesionIds : undefined);

    days = rawDays as SesionDia[];
    tiposEvento = rawTipos as TipoEvento[];
    jugadores = rawJugadores || [];
    estados = rawEstados || [];
    bloques = rawBloques || {};

    // Construir mapa de asignaciones de jugadores a eventos desde BBDD para toda la temporada directamente de estado_diario_jugador
    const idToFecha = new Map<string, string>();
    (days as any[]).forEach((d: any) => {
      if (d.id && d.fecha) idToFecha.set(d.id, d.fecha);
    });

    (estados as any[]).forEach((e: any) => {
      if (!e.evento_asignado || !e.jugador_id) return;
      const fecha = idToFecha.get(e.sesion_dia_id);
      if (fecha) {
        bbddAssignments[`${e.jugador_id}_${fecha}`] = e.evento_asignado;
      }
      if (e.sesion_dia_id) {
        bbddAssignments[`${e.jugador_id}_${e.sesion_dia_id}`] = e.evento_asignado;
      }
    });
  } catch (err: any) {
    errorMsg = err.message || "Error al cargar la planificación del calendario.";
  }

  return (
    <main
      style={{
        padding: "12px 20px",
        maxWidth: "1400px",
        margin: "0 auto",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        background: "#f8fafc",
        minHeight: "100vh",
      }}
    >
      {/* CABECERA DE LA PÁGINA ULTRA COMPACTA */}
      <header className="no-print" style={{ marginBottom: "10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link
            href="/"
            style={{
              fontSize: "11px",
              fontWeight: 800,
              color: "#1e3a8a",
              background: "#e2e8f0",
              padding: "3px 8px",
              borderRadius: "5px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            ← Menú
          </Link>
          <span style={{ color: "#cbd5e1", fontSize: "14px" }}>|</span>
          <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#0f172a", letterSpacing: "0.02em" }}>
            Planificación
          </h1>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      {errorMsg ? (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: "10px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#dc2626",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          ❌ {errorMsg}
        </div>
      ) : days.length === 0 ? (
        <GenerateDaysModal />
      ) : (
        <CalendarWrapper initialDays={days} tiposEvento={tiposEvento} initialJugadores={jugadores} initialEstados={estados} initialBloques={bloques} bbddPlayerAssignments={bbddAssignments} />
      )}
    </main>
  );
}
