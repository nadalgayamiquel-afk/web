const https = require('https');

function searchTeam(query) {
  const url = `https://www.transfermarkt.es/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(query)}`;
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const team = json.find(i => i.class === 'Vereine');
        if (team) {
           console.log(query, '->', team.id, team.image);
        } else {
           console.log(query, '-> NOT FOUND');
        }
      } catch (e) {
        console.log(query, '-> ERROR PARSING', e.message);
      }
    });
  }).on('error', console.error);
}

['Arnedo', 'Sant Andreu', 'Europa', 'Sabadell', 'Olot', 'Vilanova CF'].forEach(searchTeam);
