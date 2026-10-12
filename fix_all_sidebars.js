const fs = require('fs');

const files = [
  '/Users/MiquelNadalGaya/web/app/disponibilidad/page.tsx',
  '/Users/MiquelNadalGaya/web/app/informes/multas/page.tsx',
  '/Users/MiquelNadalGaya/web/app/page.tsx',
  '/Users/MiquelNadalGaya/web/app/cargas/page.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Replace the brand-mark and team-switcher with the new block
  // First, find if we need to add state for clubConfig
  if (!content.includes('const [clubConfig, setClubConfig] = useState')) {
    content = content.replace(
      /const \[isHydrated, setIsHydrated\] = useState\(false\);/,
      'const [isHydrated, setIsHydrated] = useState(false);\n  const [clubConfig, setClubConfig] = useState<any>(null);'
    );
    // Add logic to useEffect
    content = content.replace(
      /setIsHydrated\(true\);/,
      `setIsHydrated(true);\n    try { const saved = localStorage.getItem("custom_club_config"); if (saved) setClubConfig(JSON.parse(saved)); } catch(e){}`
    );
  }

  const regexBrand = /<div className="brand-mark">[\s\S]*?<\/div>/;
  const regexSwitcher = /<div className="team-switcher"[\s\S]*?<\/div>\s*(?=<nav className="main-nav")/g;

  const replacement = `
        <div className="brand-header" style={{ padding: "20px 0", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <img
            src={clubConfig?.escudoUrl || "/ce-manresa.png"}
            alt={clubConfig?.nombreClub || "Club"}
            style={{ width: "64px", height: "72px", objectFit: "contain" }}
            onError={(e) => { e.target.src = "/ce-manresa.png"; }}
          />
          <div style={{ marginTop: "12px", fontSize: "14px", fontWeight: "bold", color: "#f8fafc", textAlign: "center" }}>
            {clubConfig?.nombreClub || "CE Manresa"}
          </div>
        </div>
        `;

  // Apply replacements
  content = content.replace(regexBrand, '');
  content = content.replace(regexSwitcher, replacement);

  fs.writeFileSync(file, content);
}
