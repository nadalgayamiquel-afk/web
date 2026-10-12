const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Update the buttons to show team if multiple
content = content.replace(
  />\s*\{t\.temporada\}\s*<\/button>/g,
  `>
                <div style={{ fontSize: "11px", fontWeight: "bold" }}>{t.temporada}</div>
                <div style={{ fontSize: "9px", opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{t.equipo}</div>
              </button>`
);

// Update the select to use index as value
content = content.replace(
  /<select[\s\S]*?className="team-select"[\s\S]*?value=\{clubConfig\.nombreClub\}[\s\S]*?onChange=\{\(e\) => setClubConfig\(\(prev\) => \(\{ \.\.\.prev,\s*nombreClub:\s*e\.target\.value\s*\}\)\)\}[\s\S]*?>/g,
  `<select
            className="team-select"
            value={clubConfig.temporadas.findIndex(t => t.temporada === clubConfig.temporadaActiva && t.equipo === clubConfig.nombreClub)}
            onChange={(e) => {
              const idx = Number(e.target.value);
              const selectedItem = clubConfig.temporadas[idx];
              if (selectedItem) {
                setClubConfig((prev) => ({ 
                  ...prev, 
                  nombreClub: selectedItem.equipo,
                  temporadaActiva: selectedItem.temporada,
                  escudoUrl: selectedItem.escudoUrl || prev.escudoUrl
                }));
              }
            }}
          >`
);

content = content.replace(
  /<option key=\{`\$\{t\.temporada\}-\$\{i\}`\} value=\{t\.equipo\}>\{t\.equipo\} \(\{t\.temporada\}\)<\/option>/g,
  `<option key={\`\${t.temporada}-\${i}\`} value={i}>{t.equipo} ({t.temporada})</option>`
);

fs.writeFileSync(file, content);
