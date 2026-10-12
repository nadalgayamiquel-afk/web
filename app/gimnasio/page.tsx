import React from 'react';
import { getActiveJugadores, getSesionesDiaRange, getFuerzaSesionesForMatrix } from '../actions';
import GimnasioMatrixClient from './GimnasioMatrixClient';

export const dynamic = 'force-dynamic';

export default async function GimnasioPage() {
  let jugadores: any[] = [];
  let days: any[] = [];
  let sesionesMap: Record<string, any[]> = {};

  try {
    const [rawJugadores, rawDays, rawSesiones] = await Promise.all([
      getActiveJugadores(),
      getSesionesDiaRange(),
      getFuerzaSesionesForMatrix(),
    ]);
    jugadores = rawJugadores || [];
    days = rawDays || [];
    sesionesMap = rawSesiones || {};
  } catch (e) {
    console.error('Error fetching data for Gimnasio:', e);
  }

  return (
    <GimnasioMatrixClient
      initialJugadores={jugadores}
      initialDays={days}
      initialSesionesMap={sesionesMap}
    />
  );
}
