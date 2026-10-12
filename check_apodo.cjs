
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter(Boolean).map(l => {
  const idx = l.indexOf("=");
  return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

async function check() {
  const { data: jugadores } = await supabase.from("jugadores").select("id, nombre, apodo, dorsal");
  const withApodo = jugadores.filter(j => j.apodo || j.nombre.toLowerCase().includes("pochi") || j.nombre.toLowerCase().includes("richard"));
  console.log("Jugadores con apodo o coincidencia:", withApodo);
}
check();
