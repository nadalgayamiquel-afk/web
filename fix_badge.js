const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace the !isActiva button block
content = content.replace(
  /\{\!isActiva && \([\s\S]*?onClick=\{\(\) => \{\s*setClubConfig[\s\S]*?\}\s*\}\s*style=\{[\s\S]*?\}[\s\S]*?Seleccionar como Activa[\s\S]*?<\/button>\s*\)\}/,
  `<button
                                type="button"
                                onClick={() => {
                                  setClubConfig((prev) => {
                                    const nextIsActiva = prev.temporadaActiva === tempItem.temporada && prev.nombreClub === tempItem.equipo;
                                    return {
                                      ...prev,
                                      temporadaActiva: nextIsActiva ? "" : tempItem.temporada,
                                      nombreClub: nextIsActiva ? "" : (tempItem.equipo || prev.nombreClub),
                                      escudoUrl: nextIsActiva ? "" : (tempItem.escudoUrl || prev.escudoUrl),
                                    };
                                  });
                                }}
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: "6px",
                                  fontSize: "11.5px",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  border: isActiva ? "1px solid #fca5a5" : "1px solid #cbd5e1",
                                  background: isActiva ? "#fee2e2" : "#f1f5f9",
                                  color: isActiva ? "#b91c1c" : "#0f172a",
                                }}
                              >
                                {isActiva ? "Deseleccionar" : "Seleccionar como Activa"}
                              </button>`
);

fs.writeFileSync(file, content);
