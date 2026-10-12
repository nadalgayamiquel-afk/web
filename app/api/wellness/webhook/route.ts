import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Almacenamiento temporal en memoria para respuestas entrantes
let memoryWellnessStore: any[] = [];

export async function GET() {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase
        .from("wellness_respuestas")
        .select("*")
        .order("created_at", { ascending: false });
      if (data && data.length > 0) {
        return NextResponse.json({ success: true, data });
      }
    } catch (e) {
      // Ignorar si la tabla no existe aún
    }
  }
  return NextResponse.json({ success: true, data: memoryWellnessStore });
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log("📥 Webhook recibido de Microsoft Power Automate:", payload);

    // Mapear campos desde Microsoft Forms
    const keys = Object.keys(payload);
    const nombre = payload["jugador"] || payload["jugadora"] || payload["Nombre"] || payload["Nombre y apellidos"] || payload["Respuestas"] || payload[keys[0]] || "Jugador Anónimo";
    const sueno = payload["sueno"] || payload["Sueño"] || payload["Horas de sueño"] || payload[keys[1]] || "8";
    const fatiga = payload["fatiga"] || payload["Fatiga"] || payload[keys[2]] || "2";
    const doms = payload["doms"] || payload["Dolor Muscular"] || payload[keys[3]] || "2";
    const estres = payload["estres"] || payload["Estrés"] || payload[keys[4]] || "1";

    const record = {
      id: `w-${Date.now()}`,
      created_at: new Date().toISOString(),
      Jugador: String(nombre),
      Jugadora: String(nombre),
      "Sueño": `${sueno} h`,
      Fatiga: `${fatiga} / 5`,
      "Dolor Muscular": `${doms} / 5`,
      "Wellness Total": `${25 - (Number(fatiga) || 2) * 2 - (Number(doms) || 2) * 2} / 25`,
      raw: payload,
    };

    // Guardar en memoria
    memoryWellnessStore.unshift(record);

    // Guardar en Supabase si está disponible
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from("wellness_respuestas").insert([{
          jugadora_nombre: record.Jugadora,
          sueno_horas: Number(sueno) || 8,
          fatiga: Number(fatiga) || 2,
          doms: Number(doms) || 2,
          estres: Number(estres) || 1,
          payload: payload,
        }]);
      } catch (dbErr) {
        console.warn("Tabla wellness_respuestas no encontrada en Supabase, guardado en memoria activa.");
      }
    }

    return NextResponse.json({
      success: true,
      message: "✓ Respuesta de Microsoft Forms recibida y registrada con éxito",
      record,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Error procesando Webhook de Power Automate" },
      { status: 400 }
    );
  }
}
