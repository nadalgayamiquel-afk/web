const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace active check in sidebar buttons
content = content.replace(
  /const isSelected = prev\.temporadaActiva === t\.temporada;/g,
  'const isSelected = prev.temporadaActiva === t.temporada && prev.nombreClub === t.equipo;'
);

content = content.replace(
  /className=\{\`season-option \$\{clubConfig\.temporadaActiva === t\.temporada \? "selected" : ""\}\`\}/g,
  'className={`season-option ${clubConfig.temporadaActiva === t.temporada && clubConfig.nombreClub === t.equipo ? "selected" : ""}`}'
);

// Replace active check in main club tab
content = content.replace(
  /const isSelected = prev\.temporadaActiva === tempItem\.temporada;/g,
  'const isSelected = prev.temporadaActiva === tempItem.temporada && prev.nombreClub === tempItem.equipo;'
);

content = content.replace(
  /clubConfig\.temporadaActiva === tempItem\.temporada \? "#dcfce7" : "#f1f5f9"/g,
  '(clubConfig.temporadaActiva === tempItem.temporada && clubConfig.nombreClub === tempItem.equipo) ? "#dcfce7" : "#f1f5f9"'
);

content = content.replace(
  /clubConfig\.temporadaActiva === tempItem\.temporada \? "#15803d" : "#0f172a"/g,
  '(clubConfig.temporadaActiva === tempItem.temporada && clubConfig.nombreClub === tempItem.equipo) ? "#15803d" : "#0f172a"'
);

content = content.replace(
  /\{clubConfig\.temporadaActiva === tempItem\.temporada \? "✅ Activa" : "Seleccionar como Activa"\}/g,
  '{(clubConfig.temporadaActiva === tempItem.temporada && clubConfig.nombreClub === tempItem.equipo) ? "✅ Activa" : "Seleccionar como Activa"}'
);

fs.writeFileSync(file, content);
