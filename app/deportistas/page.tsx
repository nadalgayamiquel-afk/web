import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import DeportistasGrid from "./deportistas-grid";

type Jugador = {
  id: string;
  nombre: string;
  apodo: string | null;
  cor_id: string | null;
  dorsal: number | string | null;
  posicion: string | null;
  equipo: string | null;
  temporada: string | null;
  foto_url: string | null;
  activo: boolean | null;
};

async function getJugadores() {
  let finalJugadores: any[] = [];
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  let club = "";
  try {
    const fs = require("fs");
    const path = require("path");
    const confPath = path.join(process.cwd(), "public", "club_config.json");
    if (fs.existsSync(confPath)) {
      const localConf = JSON.parse(fs.readFileSync(confPath, "utf8"));
      if (localConf?.nombreClub) {
        club = localConf.nombreClub.replace(/^(CE|CF|FC|UE|CD|AE|SD|UD|CP)\s+/i, "").trim();
      }
    }
  } catch {}

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      let query = supabase.from("jugadores").select("*").order("nombre");
      if (club) query = query.ilike("equipo", `%${club}%`);
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        finalJugadores = data;
      }
    } catch (e) {}
  }

  // Si Supabase no devolvió datos o las claves no están registradas en Vercel, cargar del backup maestro
  if (finalJugadores.length === 0) {
    try {
      const fs = require("fs");
      const path = require("path");
      const backupPath = path.join(process.cwd(), "public", "master_backup.json");
      if (fs.existsSync(backupPath)) {
        const parsed = JSON.parse(fs.readFileSync(backupPath, "utf8"));
        let rows = parsed?.database_tables?.jugadores?.rows || [];
        if (club) {
          const clubNorm = club.toLowerCase();
          const matches = rows.filter((j: any) => (j.equipo || "").toLowerCase().includes(clubNorm));
          if (matches.length > 0) rows = matches;
        }
        finalJugadores = rows;
      }
    } catch (e) {}
  }

  return finalJugadores.map((j: any) => ({
    ...j,
    dorsal: j.dorsal !== undefined && j.dorsal !== null ? j.dorsal : j.cor_id,
  })) as Jugador[];
}

export default async function DeportistasPage() {
  const jugadores = await getJugadores();

  return (
    <main className="athletes-page" style={{ paddingTop: "16px", paddingBottom: "40px" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          background: "#ffffff",
          padding: "12px 18px",
          borderRadius: "12px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
          maxWidth: "1240px",
          margin: "0 auto 16px auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link
            href="/"
            style={{
              fontSize: "11px",
              fontWeight: 800,
              color: "#1e3a8a",
              background: "#e2e8f0",
              padding: "4px 10px",
              borderRadius: "6px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            ← Menú
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "22px" }}>🏃</span>
            <h1 style={{ fontSize: "16px", fontWeight: 900, color: "#0f172a", margin: 0, letterSpacing: "-0.02em", fontFamily: "system-ui, -apple-system, sans-serif", textTransform: "uppercase" }}>
              DEPORTISTAS
            </h1>
          </div>
        </div>

        <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b" }}>
          Plantilla ({jugadores.length} miembros)
        </div>
      </header>

      {jugadores.length === 0 ? (
        <section className="athletes-empty">
          <span className="empty-icon">+</span>
          <h2>Aún no hay jugadores activos</h2>
          <p>Cuando la plantilla esté conectada, sus perfiles aparecerán aquí.</p>
        </section>
      ) : (
        <DeportistasGrid jugadores={jugadores} />
      )}
    </main>
  );
}