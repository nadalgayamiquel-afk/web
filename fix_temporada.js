const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Remove TEMPORADA section
const regexTemporada = /<span className="eyebrow">TEMPORADA<\/span>[\s\S]*?<div className="season-options">[\s\S]*?<\/div>\s*(?=<span className="eyebrow team-label">EQUIPO ACTIVO<\/span>)/;
content = content.replace(regexTemporada, '');

// Remove background from shield
content = content.replace(
  /style={{ width: "64px", height: "72px", objectFit: "contain", background: "#ffffff", borderRadius: "8px", padding: "4px" }}/,
  'style={{ width: "64px", height: "72px", objectFit: "contain" }}'
);

fs.writeFileSync(file, content);
