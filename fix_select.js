const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /onClick=\{\(\) => \{\s+setClubConfig\(\(prev\) => \(\{\s+\.\.\.prev,\s+temporadaActiva: t\.temporada,\s+nombreClub: t\.equipo \|\| prev\.nombreClub,\s+escudoUrl: t\.escudoUrl \|\| prev\.escudoUrl,\s+\}\)\);\s+\}\}/g,
  `onClick={() => {
                  setClubConfig((prev) => {
                    const isSelected = prev.temporadaActiva === t.temporada;
                    return {
                      ...prev,
                      temporadaActiva: isSelected ? "" : t.temporada,
                      nombreClub: isSelected ? "" : (t.equipo || prev.nombreClub),
                      escudoUrl: isSelected ? "" : (t.escudoUrl || prev.escudoUrl),
                    };
                  });
                }}`
);

content = content.replace(
  /\{clubConfig\.temporadaActiva === tempItem\.temporada \? \([\s\S]*?✅ Activa[\s\S]*?<\/span>\s*\)\s*:\s*\(\s*<button[\s\S]*?onClick=\{\(\) => \{[\s\S]*?\}\}[\s\S]*?>[\s\S]*?Seleccionar como Activa[\s\S]*?<\/button>\s*\)/,
  `<button
                                type="button"
                                onClick={() => {
                                  setClubConfig((prev) => {
                                    const isSelected = prev.temporadaActiva === tempItem.temporada;
                                    return {
                                      ...prev,
                                      temporadaActiva: isSelected ? "" : tempItem.temporada,
                                      nombreClub: isSelected ? "" : (tempItem.equipo || prev.nombreClub),
                                      escudoUrl: isSelected ? "" : (tempItem.escudoUrl || prev.escudoUrl),
                                    };
                                  });
                                }}
                                style={{ 
                                  background: clubConfig.temporadaActiva === tempItem.temporada ? "#dcfce7" : "#f1f5f9", 
                                  color: clubConfig.temporadaActiva === tempItem.temporada ? "#15803d" : "#0f172a", 
                                  border: "none", 
                                  padding: "5px 9px", 
                                  borderRadius: "6px", 
                                  fontSize: "11px", 
                                  fontWeight: 800, 
                                  cursor: "pointer" 
                                }}
                              >
                                {clubConfig.temporadaActiva === tempItem.temporada ? "✅ Activa" : "Seleccionar como Activa"}
                              </button>`
);

fs.writeFileSync(file, content);
