const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add import
content = content.replace(
  /\{ RivalConfig, DEFAULT_RIVALES, getStoredRivales, saveStoredRivales, findRivalEscudoUrl, syncRivalesFromBBDD \}/,
  '{ RivalConfig, DEFAULT_RIVALES, PRIMERA_RFEF_G2, getStoredRivales, saveStoredRivales, findRivalEscudoUrl, syncRivalesFromBBDD }'
);

// Add the selector in the UI
const replaceBtn = `<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <select
                    id="league_select"
                    style={{ padding: "6px 10px", borderRadius: "6px", fontSize: "12px", border: "1px solid #cbd5e1" }}
                  >
                    <option value="primera">Primera RFEF Grupo 2</option>
                    <option value="segunda">Segunda RFEF G3 (Cat/Ara/Val)</option>
                  </select>
                  <button
                    onClick={() => {
                      const sel = document.getElementById('league_select') as HTMLSelectElement;
                      const conf = confirm("¿Deseas restaurar todos los escudos oficiales para " + sel.options[sel.selectedIndex].text + "? Esto sobrescribirá tus rivales actuales.");
                      if (conf) {
                        const ligasMap: any = {
                          "primera": PRIMERA_RFEF_G2,
                          "segunda": DEFAULT_RIVALES
                        };
                        const targetList = ligasMap[sel.value];
                        if (targetList) {
                          setRivalesConfig(targetList);
                          saveStoredRivales(targetList);
                        }
                      }
                    }}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 800,
                      background: "#0284c7",
                      color: "#ffffff",
                      border: "1px solid #0369a1",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    🔄 Cargar Equipos Oficiales
                  </button>
                </div>`;

content = content.replace(
  /<div style=\{\{ display: "flex", gap: "8px" \}\}>[\s\S]*?<\/button>\s*<\/div>/,
  replaceBtn
);

fs.writeFileSync(file, content);
