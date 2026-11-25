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
import { getSesionesDiaRange, getTiposEvento, getTiposEventoConfig, getActiveJugadores, getEstadoDiarioJugadores, getEventosBloquesBBDD, TipoEventoConfig } from "../actions";
import { type SesionDia, type TipoEvento, DEFAULT_TIPOS_EVENTO_CONFIG } from "./CalendarGrid";
import { CalendarWrapper } from "./CalendarWrapper";
import GenerateDaysModal from "./GenerateDaysModal";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  let days: SesionDia[] = [];
  let tiposEvento: TipoEvento[] = [];
  let tiposEventoConfig: TipoEventoConfig[] = DEFAULT_TIPOS_EVENTO_CONFIG;
  let jugadores: any[] = [];
  let estados: any[] = [];
  let bloques: Record<string, any> = {};
  let bbddAssignments: Record<string, string> = {};

  try {
    const [rawDays, rawTipos, rawTiposConfig, rawJugadores, rawBloques] = await Promise.all([
      getSesionesDiaRange().catch((e) => {
        console.warn("getSesionesDiaRange error:", e);
        return [];
      }),
      getTiposEvento().catch((e) => {
        console.warn("getTiposEvento error:", e);
        return [];
      }),
      getTiposEventoConfig().catch((e) => {
        console.warn("getTiposEventoConfig error:", e);
        return DEFAULT_TIPOS_EVENTO_CONFIG;
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
    tiposEventoConfig = (rawTiposConfig || DEFAULT_TIPOS_EVENTO_CONFIG) as TipoEventoConfig[];
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
  // 1. Bloques: Si la BBDD está vacía o falló, usar backup maestro como fallback
  if (!bloques || Object.keys(bloques).length === 0) {
    bloques = getMasterEventosBloquesMap();
  }

  // 2. Días: Usar planificacion de BBDD / Supabase y sincronizar evento_1..6 desde bloques reales
  const masterPlanDays = getMasterPlanificacionDays();
  const masterDaysMap = new Map<string, any>();
  masterPlanDays.forEach((d: any) => { if (d.fecha) masterDaysMap.set(d.fecha, d); });

  if (!days || days.length === 0) {
    days = masterPlanDays as SesionDia[];
  } else {
    days = days.map((d: any) => {
      const m = masterDaysMap.get(d.fecha);
      const b0 = bloques[`${d.id}_slot_0`] || bloques[`${d.fecha}_slot_0`];
      const b1 = bloques[`${d.id}_slot_1`] || bloques[`${d.fecha}_slot_1`];
      const b2 = bloques[`${d.id}_slot_2`] || bloques[`${d.fecha}_slot_2`];
      const b3 = bloques[`${d.id}_slot_3`] || bloques[`${d.fecha}_slot_3`];
      const b4 = bloques[`${d.id}_slot_4`] || bloques[`${d.fecha}_slot_4`];
      const b5 = bloques[`${d.id}_slot_5`] || bloques[`${d.fecha}_slot_5`];

      return {
        ...d,
        rival: d.rival ? d.rival.trim() : "",
        evento: (d.evento_am && d.evento_am.trim()) || (d.evento && d.evento.trim()) || null,
        evento_am: (d.evento_am && d.evento_am.trim()) || (d.evento && d.evento.trim()) || null,
        evento_1: b0?.tipo ? b0.tipo.trim() : null,
        evento_2: b1?.tipo ? b1.tipo.trim() : null,
        evento_3: b2?.tipo ? b2.tipo.trim() : null,
        evento_4: b3?.tipo ? b3.tipo.trim() : null,
        evento_5: b4?.tipo ? b4.tipo.trim() : null,
        evento_6: b5?.tipo ? b5.tipo.trim() : null,
        md: d.md || null,
        carga: d.carga ?? null,
        volumen: d.volumen ?? null,
        intensidad: d.intensidad ?? null,
        comentario_microciclo: d.comentario_microciclo || null,
        resultado_partido: d.resultado_partido || "",
      };
    }) as SesionDia[];
  }

  if (!tiposEvento || tiposEvento.length === 0) {
    tiposEvento = [
      { codigo: "E", texto: "Entrenamiento", color: "#1e3a8a" },
      { codigo: "PL", texto: "Partido Liga", color: "#dc2626" },
      { codigo: "PAL", texto: "Partido Amistoso Local", color: "#dc2626" },
      { codigo: "PV", texto: "Partido Viaje", color: "#dc2626" },
      { codigo: "PAV", texto: "Partido Amistoso Visitante", color: "#dc2626" },
      { codigo: "D", texto: "Descanso", color: "#64748b" },
    ];
  }

  if (!jugadores || jugadores.length === 0) {
    jugadores = getMasterBackupTable("jugadores");
  }

  if (!estados || estados.length === 0) {
    estados = getMasterBackupTable("estado_diario_jugador");
  }

  // 3. Asignaciones de jugadores a eventos: Base de datos Supabase tiene prioridad absoluta
  const idToFecha = new Map<string, string>();
  (days as any[]).forEach((d: any) => {
    if (d.id && d.fecha) idToFecha.set(d.id, d.fecha);
  });

  if (!estados || estados.length === 0) {
    bbddAssignments = getMasterPlayerEventsMap();
  } else {
    bbddAssignments = {};
    (estados as any[]).forEach((e: any) => {
      if (!e.jugador_id || !e.sesion_dia_id) return;
      const fecha = idToFecha.get(e.sesion_dia_id);
      const assignedVal = (e.evento_asignado || "").trim();
      if (fecha) {
        bbddAssignments[`${e.jugador_id}_${fecha}`] = assignedVal;
      }
      bbddAssignments[`${e.jugador_id}_${e.sesion_dia_id}`] = assignedVal;
    });
  }

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
          initialTiposEventoConfig={tiposEventoConfig}
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
