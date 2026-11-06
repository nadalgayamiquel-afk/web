import React from "react";
import { getAllGpsDatos, getActiveJugadores } from "@/app/actions";
import GpsBBDDClient from "./GpsBBDDClient";

export const dynamic = "force-dynamic";

export default async function GpsBBDDPage() {
  let initialRecords: any[] = [];
  let jugadores: any[] = [];

  try {
    const [rawGps, rawJug] = await Promise.all([
      getAllGpsDatos(),
      getActiveJugadores(),
    ]);
    initialRecords = rawGps || [];
    jugadores = rawJug || [];
  } catch (e) {
    console.error("Error fetching data for BBDD GPS:", e);
  }

  return <GpsBBDDClient initialRecords={initialRecords} jugadores={jugadores} />;
}

