
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const cheerio = require("cheerio");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function run() {
  const htmlPath = "/Users/MiquelNadalGaya/.gemini/antigravity-ide/brain/0c7fbb57-8983-4d1e-8995-6b346666eb74/.system_generated/steps/546/content.md";
  const htmlContent = fs.readFileSync(htmlPath, "utf8");
  const $ = cheerio.load(htmlContent);

  const players = [];

  $("table.items > tbody > tr").each((i, el) => {
    const row = $(el);
    const imgTag = row.find("td img.bilderrahmen-fixed");
    if (!imgTag.length) return;
    
    const foto_url = imgTag.attr("data-src") || imgTag.attr("src") || "";
    
    const nameTag = row.find("td.hauptlink a").first();
    let name = nameTag.text().trim();
    
    const posText = row.find("table.inline-table tr").eq(1).find("td").text().trim();
    let posicion = posText || "Desconocida";
    
    // In plus/1, columns might be different:
    // Pos, Jugador, Nacido/Edad, Nac, Altura, Pie, Fichado, etc.
    const tds = row.find("> td");
    
    let fecha_nacimiento = null;
    let dobText = tds.eq(2).text().trim(); // usually index 2 or 3 is DOB
    if (dobText && dobText !== "-") {
      const match = dobText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (match) {
        fecha_nacimiento = `${match[3]}-${match[2]}-${match[1]}`; 
      } else {
        const match2 = dobText.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (match2) fecha_nacimiento = `${match2[3]}-${match2[2]}-${match2[1]}`;
      }
    }
    
    let altura = null;
    let alturaText = tds.eq(4).text().trim();
    if (alturaText && alturaText !== "-") {
      const match = alturaText.match(/(\d)\,(\d{2})\s*m/);
      if (match) altura = match[1] + match[2]; // e.g. "1,85 m" -> "185"
    }

    let pie = tds.eq(5).text().trim();

    if (name) {
      name = name.replace(/\s*\d+\s*mil\s*€/g, "");
      players.push({ 
        nombre: name, 
        apodo: name.split(" ")[0], 
        foto_url, 
        posicion, 
        fecha_nacimiento, 
        altura,
        equipo: "CE Europa", 
        temporada: "2026/27",
        activo: true
      });
    }
  });

  console.log("Parsed " + players.length + " players.");
  
  if (players.length > 0) {
    console.log("Wiping old CE Europa dummy players...");
    await supabase.from("jugadores").delete().eq("equipo", "CE Europa");
    
    console.log("Inserting new players...");
    const { error } = await supabase.from("jugadores").insert(players);
    if (error) {
      console.error("Insert error:", error);
    } else {
      console.log("Success! Inserted " + players.length + " players.");
    }
  } else {
    console.log("No players found to insert.");
  }
}

run();
