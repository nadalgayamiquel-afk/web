const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /{t.equipo} \({t.temporada}\)/g,
  '{t.equipo}'
);

fs.writeFileSync(file, content);
