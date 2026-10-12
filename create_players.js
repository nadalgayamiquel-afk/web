
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function createPlayers() {
  const nombres = [
    "Marc Campeny", "Àlex Cano", "Arnau Campeny", "Mario Domingo",
    "Guillem Castell", "Pau López", "Noel Carbonell", "Albert Martí",
    "Roger Escoruela", "Sergi Pastells", "Buba", "Arnau Vilamitjana",
    "Adnane", "Bermu", "Víctor Aliaga", "Carlos Cano", "Jordi Cano",
    "Pablo Servetti", "Michael", "Sicu", "Max", "Albert", "Manel"
  ];

  console.log("Creating players for CE Europa...");
  const records = nombres.map((nombre, idx) => ({
    nombre: nombre,
    apodo: nombre.split(" ")[0],
    posicion: idx === 0 || idx === 1 ? "POR" : idx < 8 ? "DEF" : idx < 15 ? "MED" : "DEL"
  }));

  const { error } = await supabase.from("jugadores").insert(records);
  if (error) {
    console.error("Error creating players:", error);
  } else {
    console.log("Created", records.length, "players successfully!");
  }
}
createPlayers();
