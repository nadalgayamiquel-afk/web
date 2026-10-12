import React from 'react';
import { getFuerzaBBDDRows, getActiveJugadores } from '@/app/actions';
import FuerzaBBDDClient from './FuerzaBBDDClient';

export const dynamic = 'force-dynamic';

export default async function FuerzaBBDDPage() {
  let initialRows: any[] = [];
  let jugadores: any[] = [];

  try {
    const [rawRows, rawJug] = await Promise.all([
      getFuerzaBBDDRows(),
      getActiveJugadores(),
    ]);
    initialRows = rawRows || [];
    jugadores = rawJug || [];
  } catch (e) {
    console.error('Error fetching data for BBDD Fuerza:', e);
  }

  return <FuerzaBBDDClient initialRows={initialRows} jugadores={jugadores} />;
}
