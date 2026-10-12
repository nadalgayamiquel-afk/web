const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Buscamos donde empieza el componente AjustesPage
const startIdx = content.indexOf('export default function AjustesPage() {');

// Buscamos la inicialización de clubConfig
content = content.replace(
  /const \[clubConfig, setClubConfig\] = useState<ClubConfig>\(\(\) => \{[\s\S]*?return DEFAULT_CLUB_CONFIG;\s*\}\);/,
  `const [clubConfig, setClubConfig] = useState<ClubConfig>(DEFAULT_CLUB_CONFIG);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const saved = localStorage.getItem("custom_club_config");
      if (saved) setClubConfig(JSON.parse(saved));
    } catch (e) {}
  }, []);`
);

// Buscamos el return ( <div className="app-shell"> ...
content = content.replace(
  /return \(\s*<div className="app-shell">/,
  `if (!isMounted) return null;\n\n  return (\n    <div className="app-shell">`
);

fs.writeFileSync(file, content);
