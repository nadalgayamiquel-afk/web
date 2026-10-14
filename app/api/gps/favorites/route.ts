import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const DEFAULT_FAVORITE_GPS_VARIABLES: string[] = [
  "Distance(m)",
  "Distance +21 (m)",
  "MAX Speed(km/h)",
  "Sprints Count",
  "Accs Count",
  "Decs Count",
  "Player Load",
  "Duration(min)",
  "Distancia / Min",
  "Acc+Dec",
];

function getServerSupabase() {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://noumrtldxzmtqrfmydwz.supabase.co";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_H3rT__cBnF3fk5QAHUFjVg_Tf1vI9Cs";

  return createClient(supabaseUrl, supabaseKey);
}

function readClubConfigJson(): any {
  try {
    const filePath = path.join(process.cwd(), "public", "club_config.json");
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Error reading club_config.json in route handler:", e);
  }
  return null;
}

function writeClubConfigJson(data: any): boolean {
  try {
    const filePath = path.join(process.cwd(), "public", "club_config.json");
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Error writing club_config.json in route handler:", e);
    return false;
  }
}

export async function GET() {
  try {
    let config = readClubConfigJson();

    if (!config?.gpsConfig?.favoriteVariables || !Array.isArray(config.gpsConfig.favoriteVariables) || config.gpsConfig.favoriteVariables.length === 0) {
      // Intentar obtener desde Supabase
      try {
        const supabase = getServerSupabase();
        const { data: dbData } = await supabase
          .from("configuracion_club")
          .select("config_json")
          .eq("id", "default")
          .maybeSingle();

        if (dbData?.config_json?.gpsConfig) {
          config = dbData.config_json;
        }
      } catch (err) {
        console.error("Error fetching gps favorites from Supabase:", err);
      }
    }

    const rawFavs: string[] = config?.gpsConfig?.favoriteVariables || DEFAULT_FAVORITE_GPS_VARIABLES;
    const cleanedFavs = rawFavs.filter((k) => k !== "HSR Abs (m)");
    const favoriteVariables = cleanedFavs.length > 0 ? cleanedFavs : DEFAULT_FAVORITE_GPS_VARIABLES;
    const derivedVariables = Array.isArray(config?.gpsConfig?.derivedVariables) ? config.gpsConfig.derivedVariables : [];

    return NextResponse.json({
      favoriteVariables,
      derivedVariables,
    });
  } catch (e: any) {
    console.error("Error in GET /api/gps/favorites:", e);
    return NextResponse.json(
      {
        favoriteVariables: DEFAULT_FAVORITE_GPS_VARIABLES,
        derivedVariables: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { favoriteVariables, derivedVariables } = body || {};

    let config = readClubConfigJson() || {};
    if (!config.gpsConfig) {
      config.gpsConfig = {};
    }

    if (Array.isArray(favoriteVariables)) {
      const cleaned = favoriteVariables.filter((k: string) => k !== "HSR Abs (m)");
      config.gpsConfig.favoriteVariables = cleaned.length > 0 ? cleaned : DEFAULT_FAVORITE_GPS_VARIABLES;
    }

    if (Array.isArray(derivedVariables)) {
      config.gpsConfig.derivedVariables = derivedVariables;
    }

    // Guardar en disco local
    writeClubConfigJson(config);

    // Guardar en Supabase asíncronamente
    try {
      const supabase = getServerSupabase();
      await supabase.from("configuracion_club").upsert(
        {
          id: "default",
          config_json: config,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    } catch (dbErr) {
      console.error("Error syncing gps favorites to Supabase:", dbErr);
    }

    return NextResponse.json({
      success: true,
      favoriteVariables: config.gpsConfig.favoriteVariables,
      derivedVariables: config.gpsConfig.derivedVariables || [],
    });
  } catch (e: any) {
    console.error("Error in POST /api/gps/favorites:", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
