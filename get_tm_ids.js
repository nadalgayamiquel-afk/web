const https = require('https');

const teams = [
  "Alcoyano", "Alcorcón", "Algeciras CF", "Antequera CF", "Atlético de Madrid B",
  "Atlético Sanluqueño", "Betis Deportivo", "AD Ceuta FC", "Fuenlabrada", "Hércules CF",
  "Intercity", "Marbella FC", "Mérida AD", "Real Madrid Castilla", "Real Murcia",
  "Recreativo de Huelva", "Sevilla Atlético", "UD Ibiza", "Villarreal CF B", "Yeclano Deportivo"
];

async function fetchId(team) {
  return new Promise((resolve) => {
    // TM doesn't allow easy curl, let's use Wikipedia or just normal HTTP?
    // Let's try duckduckgo or tmssl
    const opts = {
      hostname: 'www.transfermarkt.es',
      path: '/suche/ajaxSearch/suggest?query=' + encodeURIComponent(team),
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    https.get(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // Look at Vereins (Clubs)
          if (json && json.length > 0) {
            console.log(team, '=>', json[0]);
          } else {
            console.log(team, '=> no results');
          }
        } catch (e) {
          console.log(team, '=> Error parsing or blocked', res.statusCode);
        }
        resolve();
      });
    }).on('error', () => resolve());
  });
}

async function run() {
  for (const t of teams) {
    await fetchId(t);
  }
}
run();
