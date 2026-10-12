const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const env = fs.readFileSync("/Users/MiquelNadalGaya/web/.env.local", "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1];

const supabase = createClient(url, key);

async function run() {
  const { data: players } = await supabase.from("jugadores").select("id, apodo");
  if (players) {
    let count = 0;
    for (const player of players) {
      if (player.apodo && player.apodo !== player.apodo.toUpperCase()) {
        await supabase.from("jugadores").update({ apodo: player.apodo.toUpperCase() }).eq("id", player.id);
        count++;
      }
    }
    console.log(`Updated ${count} players to uppercase apodo`);
  }
}
run();
