import { getMasterBackupTable } from "@/app/lib/masterBackup";
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

  // ─── RESILIENT DATA FALLBACK: Asegurar que nunca quede vacío en producción ───
  if (!days || days.length === 0) {
    const backupDays = getMasterBackupTable("sesiones_dia");
    days = (backupDays || []).map((row: any) => {
      const mainEv = row.evento_am ?? row.evento_principal ?? row.evento ?? (row.rival ? "P" : null);
      return {
        ...row,
        rival: row.rival ?? "",
        carga: row.carga ?? null,
        volumen: row.volumen ?? null,
        intensidad: row.intensidad ?? null,
        resultado_partido: row.resultado_partido ?? "",
        evento: mainEv,
        evento_principal: mainEv,
        evento_am: row.evento_am ?? mainEv,
        evento_pm: row.evento_pm ?? null,
        evento_1: row.evento_1 ?? null,
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

  if (!bloques || Object.keys(bloques).length === 0) {
    const backupBloques = getMasterBackupTable("sesiones_dia_bloques");
    const map: Record<string, any> = {};
    backupBloques.forEach((row: any) => {
      if (row.day_id) {
        map[`${row.day_id}_slot_${row.slot}`] = row;
        if (row.fecha) {
          map[`${row.fecha}_slot_${row.slot}`] = row;
          map[`day_${row.fecha}_slot_${row.slot}`] = row;
        }
      }
    });
    bloques = map;
  }

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
      {days.length === 0 ? (
        <GenerateDaysModal />
      ) : (
        <CalendarWrapper initialDays={days} tiposEvento={tiposEvento} initialJugadores={jugadores} initialEstados={estados} initialBloques={bloques} bbddPlayerAssignments={bbddAssignments} />
      )}
    </main>
  );
}
