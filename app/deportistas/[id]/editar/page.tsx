import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { saveJugador } from "../../../actions";

type PageProps = { params: Promise<{ id: string }> };

async function getJugador(id: string) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase.from("jugadores").select("*").eq("id", id).single();
  return data;
}

export default async function EditarJugadorPage({ params }: PageProps) {
  const { id } = await params;
  const jugador = await getJugador(id);
  if (!jugador) notFound();

  async function handleSave(formData: FormData) {
    "use server";
    await saveJugador(formData);
    redirect(`/deportistas/${id}`);
  }

  return (
    <main style={{ padding: "40px", maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <Link href={`/deportistas/${id}`} style={{ color: "#0284c7", textDecoration: "none", fontWeight: 700 }}>
          ← Volver a {jugador.nombre}
        </Link>
      </div>
      <h1 style={{ fontSize: "24px", fontWeight: 900, marginBottom: "30px", color: "#0f172a" }}>
        Editar Perfil de Deportista
      </h1>

      <form action={handleSave} style={{ background: "#ffffff", padding: "30px", borderRadius: "12px", border: "1px solid #cbd5e1", display: "flex", flexDirection: "column", gap: "20px" }}>
        <input type="hidden" name="id" value={jugador.id} />
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 800, marginBottom: "6px" }}>Nombre Completo</label>
            <input name="nombre" defaultValue={jugador.nombre || undefined} required style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 800, marginBottom: "6px" }}>Apodo / Nombre Corto</label>
            <input name="apodo" defaultValue={jugador.apodo || undefined} style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 800, marginBottom: "6px" }}>Posición Base (ej. DF, MC, DL)</label>
            <input name="posicion_base" defaultValue={(jugador.posicion || "").split(" ")[0] || undefined} style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 800, marginBottom: "6px" }}>Lateralidad (ej. DERECHO)</label>
            <input name="lateralidad" defaultValue={(jugador.posicion || "").split(" ")[1] || undefined} style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 800, marginBottom: "6px" }}>Dorsal</label>
            <input name="cor_id" type="number" defaultValue={jugador.cor_id || undefined} style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 800, marginBottom: "6px" }}>Pierna Hábil</label>
            <select name="pierna_habil" defaultValue={jugador.pierna_habil || undefined} style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
              <option value="">Seleccionar...</option>
              <option value="Diestro">Diestro</option>
              <option value="Zurdo">Zurdo</option>
              <option value="Ambidiestro">Ambidiestro</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 800, marginBottom: "6px" }}>Fecha de Nacimiento</label>
            <input name="fecha_nacimiento" type="date" defaultValue={jugador.fecha_nacimiento || undefined} style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 800, marginBottom: "6px" }}>URL de Foto (Transfermarkt u otra)</label>
          <input name="foto_url" type="url" defaultValue={jugador.foto_url || undefined} style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "10px" }}>
          <Link href={`/deportistas/${id}`} style={{ padding: "10px 20px", borderRadius: "8px", background: "#f1f5f9", color: "#475569", fontWeight: 800, textDecoration: "none" }}>
            Cancelar
          </Link>
          <button type="submit" style={{ padding: "10px 24px", borderRadius: "8px", background: "#0284c7", color: "#ffffff", border: "none", fontWeight: 800, cursor: "pointer" }}>
            Guardar Cambios
          </button>
        </div>
      </form>
    </main>
  );
}
