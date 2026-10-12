const https = require('https');

const teams = [
  "AD Alcorcón", "Antequera CF", "Hércules CF", "Juventud de Torremolinos",
  "Real Madrid", "Real Murcia", "UD Ibiza", "Villarreal CF"
];

async function getShield(team) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(team + " logo");
    https.get(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&titles=${q}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const pages = json.query.pages;
          const pageId = Object.keys(pages)[0];
          if (pageId !== "-1" && pages[pageId].original) {
            console.log(team, '=>', pages[pageId].original.source);
          } else {
            // fallback search
            console.log(team, '=> NOT FOUND (try manual search)');
          }
        } catch (e) {
          console.log(team, '=> ERROR', e.message);
        }
        resolve();
      });
    }).on('error', () => resolve());
  });
}

async function run() {
  for (const t of teams) {
    await getShield(t);
  }
}
run();
