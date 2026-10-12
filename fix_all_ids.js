const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/lib/rivales.ts';
let content = fs.readFileSync(file, 'utf8');

const replacements = {
  "53.png": "6767.png",     // Castilla
  "361.png": "171.png",     // Murcia
  "5267.png": "11596.png",  // Alcorcon
  "10260.png": "16022.png", // Antequera
  "7483.png": "7971.png",   // Hercules
  "51351.png": "43454.png", // Torremolinos
  "52601.png": "13241.png", // Ibiza
  "9842.png": "11972.png",  // Villarreal B
};

for (const [oldId, newId] of Object.entries(replacements)) {
  content = content.replace(new RegExp(`head/${oldId}`, 'g'), `head/${newId}`);
}

fs.writeFileSync(file, content);
