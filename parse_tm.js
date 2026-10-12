
const fs = require("fs");
const cheerio = require("cheerio");

const htmlPath = "/Users/MiquelNadalGaya/.gemini/antigravity-ide/brain/0c7fbb57-8983-4d1e-8995-6b346666eb74/.system_generated/steps/530/content.md";
const htmlContent = fs.readFileSync(htmlPath, "utf8");
const $ = cheerio.load(htmlContent);

const players = [];

$("table.items > tbody > tr").each((i, el) => {
  const row = $(el);
  const imgTag = row.find("td img.bilderrahmen-fixed");
  if (!imgTag.length) return;
  
  const foto_url = imgTag.attr("data-src") || imgTag.attr("src");
  
  // Name is typically in td.hauptlink a
  const nameTag = row.find("td.hauptlink a");
  const name = nameTag.text().trim();
  
  // Position is often right below or in another td
  // Sometimes it is the td after the inline table
  const tds = row.find("td");
  let posicion = "UNKNOWN";
  
  // Try to find position string
  const posText = row.find("table.inline-table tr").eq(1).find("td").text().trim();
  if (posText) posicion = posText;
  
  // Date of birth
  const dobText = row.find("td.zentriert").eq(1).text().trim(); // usually index 1
  let fecha_nacimiento = null;
  if (dobText && dobText !== "-") {
    const match = dobText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      fecha_nacimiento = `${match[3]}-${match[2]}-${match[1]}`; // YYYY-MM-DD
    } else {
      // try . match
      const match2 = dobText.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (match2) fecha_nacimiento = `${match2[3]}-${match2[2]}-${match2[1]}`;
    }
  }

  // Pierna habil - usually not on the overview page, but maybe there is a "pie" or something? Wait, overview page might not have preferred foot!
  // It only has Nationality, Market Value.
  
  if (name) {
    players.push({ nombre: name, apodo: name, foto_url, posicion, fecha_nacimiento, equipo: "CE Europa", temporada: "2026/27" });
  }
});

console.log(JSON.stringify(players, null, 2));
