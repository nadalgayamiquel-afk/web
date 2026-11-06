import React from "react";
import { getActiveJugadores, getSesionesDiaRange, getFuerzaSesionesForMatrix } from "../actions";
import { getMasterBackupTable } from "@/app/lib/masterBackup";
import GimnasioMatrixClient from "./GimnasioMatrixClient";

export const dynamic = "force-dynamic";

export default async function GimnasioPage() {
  let jugadores: any[] = [];
  let days: any[] = [];
  let sesionesMap: Record<string, any[]> = {};

  try {
    const [rawJugadores, rawDays, rawSesiones] = await Promise.all([
      getActiveJugadores().catch(() => []),
      getSesionesDiaRange().catch(() => []),
      getFuerzaSesionesForMatrix().catch(() => ({})),
    ]);
    jugadores = rawJugadores || [];
    days = rawDays || [];
    sesionesMap = rawSesiones || {};
  } catch (e) {
    console.error("Error fetching data for Gimnasio:", e);
  }

  // ─── RESILIENT DATA FALLBACK: Garantizar que siempre cargue la información de Gimnasio ───
  if (!jugadores || jugadores.length === 0) {
    jugadores = getMasterBackupTable("jugadores");
  }

  if (!days || days.length === 0) {
    days = getMasterBackupTable("sesiones_dia");
  }

  if (!sesionesMap || Object.keys(sesionesMap).length === 0) {
    sesionesMap = await getFuerzaSesionesForMatrix();
  }

  return (
    <GimnasioMatrixClient
      initialJugadores={jugadores}
      initialDays={days}
      initialSesionesMap={sesionesMap}
    />
  );
}
