const https = require('https');

https.get('https://www.transfermarkt.es/primera-federacion-grupo-ii/startseite/wettbewerb/RF2B', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': 'text/html'
  }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const regex = /href="([^"]+)\/startseite\/verein\/(\d+)\/saison_id\/2024"/g;
    let match;
    const teams = new Map();
    while ((match = regex.exec(body)) !== null) {
      const name = match[1].replace('/', '');
      const id = match[2];
      teams.set(name, id);
    }
    console.log(Array.from(teams.entries()));
  });
});
