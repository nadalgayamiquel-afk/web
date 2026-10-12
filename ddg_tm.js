const https = require('https');

const teams = [
  "Águilas FC", "Algeciras CF", "Antequera CF", "Atlético Madrileño",
  "CD Teruel", "CE Europa", "CF Rayo Majadahonda", "FC Cartagena",
  "Gimnàstic de Tarragona", "Juventud de Torremolinos CF", "Real Jaén CF",
  "Real Madrid Castilla", "Real Murcia CF", "Real Zaragoza", "SD Huesca",
  "UD Ibiza", "UE Sant Andreu", "Villarreal CF B", "AD Alcorcón", "Hércules de Alicante CF"
];

async function searchTM(team) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(`site:transfermarkt.es ${team}`);
    const req = https.get(`https://html.duckduckgo.com/html/?q=${q}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const regex = /verein\/(\d+)/;
        const match = regex.exec(body);
        if (match) {
          console.log(`{ id: "${team.toLowerCase().replace(/ /g, '-')}", nombre: "${team.toUpperCase()}", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/${match[1]}.png" },`);
        } else {
          console.log(`// NO MATCH FOR ${team}`);
        }
        resolve();
      });
    });
    req.on('error', () => resolve());
  });
}

async function run() {
  for (const t of teams) {
    await searchTM(t);
    await new Promise(r => setTimeout(r, 500)); // sleep to avoid rate limit
  }
}
run();
