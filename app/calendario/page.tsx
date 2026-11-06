import {
  getMasterBackupTable,
  getMasterPlanificacionDays,
  getMasterEventosBloquesMap,
  getMasterPlayerEventsMap,
  getMasterDisponibilidadMap,
  getMasterComentarios,
  getMasterMinutesMap,
  getMasterBrowserData,
} from "@/app/lib/masterBackup";
import Link from "next/link";
import { getSesionesDiaRange, getTiposEvento, getActiveJugadores, getEstadoDiarioJugadores, getEventosBloquesBBDD } from "../actions";
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

  try {
    const [rawDays, rawTipos, rawJugadores, rawBloques] = await Promise.all([
      getSesionesDiaRange().catch((e) => {
        console.warn("getSesionesDiaRange error:", e);
        return [];
      }),
      getTiposEvento().catch((e) => {
        console.warn("getTiposEvento error:", e);
        return [];
      }),
      getActiveJugadores().catch((e) => {
        console.warn("getActiveJugadores error:", e);
        return [];
      }),
      getEventosBloquesBBDD().catch((e) => {
        console.warn("getEventosBloquesBBDD error:", e);
        return {};
      }),
    ]);

    days = (rawDays || []) as SesionDia[];
    tiposEvento = (rawTipos || []) as TipoEvento[];
    jugadores = rawJugadores || [];
    bloques = rawBloques || {};

    const sesionIds = (days as any[]).map((d: any) => d.id).filter(Boolean);
    try {
      estados = await getEstadoDiarioJugadores(sesionIds.length > 0 ? sesionIds : undefined);
    } catch (e) {
      console.warn("getEstadoDiarioJugadores error:", e);
      estados = [];
    }
  } catch (err: any) {
    console.warn("Error fetching calendario data, falling back to backup maestro:", err);
  }

  // ─── RESILIENT DATA FALLBACK & COMPREHENSIVE MERGE ───
  // 1. Días: Usar planificacion completa con rivales, eventos, cargas, volúmenes
  const masterPlanDays = getMasterPlanificacionDays();
  const masterDaysMap = new Map<string, any>();
  masterPlanDays.forEach((d: any) => { if (d.fecha) masterDaysMap.set(d.fecha, d); });

  if (!days || days.length === 0) {
    days = masterPlanDays as SesionDia[];
  } else {
    days = days.map((d: any) => {
      const m = masterDaysMap.get(d.fecha);
      if (!m) return d;
      return {
        ...d,
        rival: d.rival || m.rival || "",
        evento: d.evento || m.evento || m.evento_am || null,
        evento_am: d.evento_am || m.evento_am || m.evento || null,
        evento_1: d.evento_1 ?? m.evento_1 ?? null,
        evento_2: d.evento_2 ?? m.evento_2 ?? null,
        evento_3: d.evento_3 ?? m.evento_3 ?? null,
        evento_4: d.evento_4 ?? m.evento_4 ?? null,
        evento_5: d.evento_5 ?? m.evento_5 ?? null,
        evento_6: d.evento_6 ?? m.evento_6 ?? null,
        md: d.md || m.md || null,
        carga: d.carga ?? m.carga ?? null,
        volumen: d.volumen ?? m.volumen ?? null,
        intensidad: d.intensidad ?? m.intensidad ?? null,
        comentario_microciclo: d.comentario_microciclo || m.comentario_microciclo || null,
        resultado_partido: d.resultado_partido || m.resultado_partido || "",
      };
    }) as SesionDia[];
  }

  if (!tiposEvento || tiposEvento.length === 0) {
    tiposEvento = [
      { codigo: "E", texto: "Entrenamiento", color: "#1e3a8a" },
      { codigo: "PL", texto: "Partido Liga", color: "#dc2626" },
      { codigo: "PAL", texto: "Partido Amistoso Local", color: "#b91c1c" },
      { codigo: "PV", texto: "Partido Viaje", color: "#d97706" },
      { codigo: "PAV", texto: "Partido Amistoso Visitante", color: "#ea580c" },
      { codigo: "D", texto: "Descanso", color: "#64748b" },
    ];
  }

  if (!jugadores || jugadores.length === 0) {
    jugadores = getMasterBackupTable("jugadores");
  }

  if (!estados || estados.length === 0) {
    estados = getMasterBackupTable("estado_diario_jugador");
  }

  // 2. Bloques: Combinar BBDD con los bloques del backup maestro (118 bloques con horarios, tareas, lugares)
  const masterBloques = getMasterEventosBloquesMap();
  bloques = { ...masterBloques, ...(bloques || {}) };

  // 3. Asignaciones de jugadores a eventos: Combinar con las 16.626 asignaciones del backup maestro
  const masterAssignments = getMasterPlayerEventsMap();
  bbddAssignments = { ...masterAssignments, ...bbddAssignments };

  const idToFecha = new Map<string, string>();
  (days as any[]).forEach((d: any) => {
    if (d.id && d.fecha) idToFecha.set(d.id, d.fecha);
  });

  (estados as any[]).forEach((e: any) => {
    if (!e.evento_asignado || !e.jugador_id) return;
    const fecha = idToFecha.get(e.sesion_dia_id);
    if (fecha) {
      if (!bbddAssignments[`${e.jugador_id}_${fecha}`]) {
        bbddAssignments[`${e.jugador_id}_${fecha}`] = e.evento_asignado;
      }
    }
    if (e.sesion_dia_id) {
      if (!bbddAssignments[`${e.jugador_id}_${e.sesion_dia_id}`]) {
        bbddAssignments[`${e.jugador_id}_${e.sesion_dia_id}`] = e.evento_asignado;
      }
    }
  });

  // 4. Comentarios y disponibilidades maestras
  const masterComentarios = getMasterComentarios();
  const masterDisponibilidad = getMasterDisponibilidadMap();
  const masterMinutesMap = getMasterMinutesMap();
  const masterBrowserData = getMasterBrowserData();

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

      {days.length === 0 ? (
        <GenerateDaysModal />
      ) : (
        <CalendarWrapper
          initialDays={days}
          tiposEvento={tiposEvento}
          initialJugadores={jugadores}
          initialEstados={estados}
          initialBloques={bloques}
          bbddPlayerAssignments={bbddAssignments}
          initialComentarios={masterComentarios}
          initialDisponibilidadMap={masterDisponibilidad}
          initialMinutesMap={masterMinutesMap}
          initialBrowserData={masterBrowserData}
        />
      )}
    </main>
  );
}
