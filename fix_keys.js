const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /\{clubConfig\.temporadas\.map\(\(t\) => \(/g,
  '{clubConfig.temporadas.map((t, i) => ('
);

content = content.replace(
  /<button\s+key=\{t\.temporada\}/g,
  '<button\n                key={`${t.temporada}-${i}`}'
);

content = content.replace(
  /<option key=\{t\.temporada\}/g,
  '<option key={`${t.temporada}-${i}`}'
);

fs.writeFileSync(file, content);
