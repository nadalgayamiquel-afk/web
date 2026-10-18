import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { archiveJugadorFromForm, saveJugador, getFullExcelBBDDRows, getTestingDatasets, getAllGpsDatos, getActiveJugadores, getPlayerProfileConfigServer } from "../../actions";
import PlayerDetailTabs from "./PlayerDetailTabs";

type PageProps = { params: Promise<{ id: string }> };

type Jugador = {
  id: string;
  nombre: string;
  apodo: string | null;
  cor_id: string | null;
  posicion: string | null;
  equipo: string | null;
  seccion: string | null;
  temporada: string | null;
  nacionalidad: string | null;
  fecha_nacimiento: string | null;
  contacto: string | null;
  anos_en_club: number | null;
  seleccion_autonomica: boolean | null;
  seleccion_nacional: boolean | null;
  peso: number | null;
  altura: number | null;
  foto_url: string | null;
  activo: boolean | null;
};

async function getJugador(id: string) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase.from("jugadores").select("*").eq("id", id).single();
  return data as Jugador | null;
}

export default async function JugadorPage({ params }: PageProps) {
  const { id } = await params;
  const jugador = await getJugador(id);
  if (!jugador) notFound();

  let initialBBDDRows: any[] = [];
  try {
    const bbddRes = await getFullExcelBBDDRows(jugador.equipo || "CE Europa");
    if (bbddRes && Array.isArray(bbddRes.rows)) {
      initialBBDDRows = bbddRes.rows;
    }
  } catch (e) {
    console.error("Error fetching BBDD rows for player report:", e);
  }

  let initialTestingData: any[] = [];
  try {
    initialTestingData = await getTestingDatasets();
  } catch (e) {
    console.error("Error fetching testing data:", e);
  }

  let allGpsRecords: any[] = [];
  try {
    allGpsRecords = await getAllGpsDatos();
  } catch (e) {
    console.error("Error fetching gps_datos for player report:", e);
  }

  let allJugadores: any[] = [];
  try {
    allJugadores = await getActiveJugadores();
  } catch (e) {
    console.error("Error fetching all jugadores for player report:", e);
  }

  let playerProfileConfig = null;
  try {
    playerProfileConfig = await getPlayerProfileConfigServer(jugador.id);
  } catch (e) {
    console.error("Error fetching player profile config:", e);
  }

  return (
    <main className="athlete-detail-page">
      <div className="athlete-detail-topbar">
        <Link className="placeholder-back" href="/deportistas">
          ← Volver a Deportistas
        </Link>
        <span className="eyebrow">FICHA INDIVIDUAL DEPORTISTA</span>
      </div>

      <section className="athlete-detail-card">
        {/* HERO / FOTO DEL JUGADOR */}
        <div className="athlete-detail-hero">
          <div className="athlete-detail-photo">
            {jugador.foto_url ? (
              <img src={jugador.foto_url || undefined} alt={`Foto de ${jugador.nombre || 'Deportista'}`} />
            ) : (
              <span>{(jugador.nombre || "JU").slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <h1>{(jugador.nombre || "Jugador Sin Nombre").toUpperCase()}</h1>
              <Link href={`/deportistas/${jugador.id}/editar`} style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, textDecoration: "none" }}>
                ✏️ Editar Perfil
              </Link>
            </div>
            <p>
              {(jugador.apodo || "Sin nombre corto").toUpperCase()} · {jugador.posicion || "Posición no indicada"} · {jugador.equipo || "CE Europa"}
            </p>
          </div>
        </div>

        {/* NAVEGACIÓN Y PESTAÑAS (ENTRE LA FOTO Y EL CONTENIDO DE LAS FICHAS) */}
        <PlayerDetailTabs
          jugador={jugador}
          saveJugadorAction={saveJugador}
          archiveJugadorAction={archiveJugadorFromForm}
          initialBBDDRows={initialBBDDRows}
          initialTestingData={initialTestingData}
          allGpsRecords={allGpsRecords}
          allJugadores={allJugadores}
          initialPlayerTargetRatios={playerProfileConfig?.ratios}
          initialPlayerCompVariables={playerProfileConfig?.variables}
          initialBenchmarkOverrides={playerProfileConfig?.benchmarkOverrides}
        />
      </section>
    </main>
  );
}
