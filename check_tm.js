const https = require('https');

const teams = [
  { id: 2862, name: "Alcoyano" },
  { id: 5267, name: "Alcorcon" },
  { id: 6900, name: "Algeciras" },
  { id: 10260, name: "Antequera" },
  { id: 4222, name: "At Madrid B" },
  { id: 10255, name: "At Sanluqueno" },
  { id: 12185, name: "Betis Deportivo" },
  { id: 82767, name: "Ceuta" },
  { id: 16386, name: "Fuenlabrada" },
  { id: 7483, name: "Hercules" },
  { id: 68297, name: "Intercity" },
  { id: 4819, name: "Marbella" },
  { id: 44917, name: "Merida" },
  { id: 53, name: "Castilla" },
  { id: 361, name: "Murcia" },
  { id: 165, name: "Recreativo" },
  { id: 4223, name: "Sevilla At" },
  { id: 52601, name: "Ibiza" },
  { id: 9842, name: "Villarreal B" },
  { id: 19539, name: "Yeclano" }
];

async function checkId({id, name}) {
  return new Promise((resolve) => {
    https.get(`https://www.transfermarkt.es/verein/startseite/verein/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, (res) => {
      // It will redirect to the canonical URL if the ID is valid
      const loc = res.headers.location;
      if (res.statusCode === 301 || res.statusCode === 302) {
        console.log(`[OK] ${name} (ID: ${id}) -> ${loc}`);
      } else {
        console.log(`[FAIL] ${name} (ID: ${id}) - Status: ${res.statusCode}`);
      }
      resolve();
    }).on('error', (e) => {
      console.log(`[ERR] ${name} (ID: ${id}) - ${e.message}`);
      resolve();
    });
  });
}

async function run() {
  for (const t of teams) {
    await checkId(t);
  }
}
run();
