const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /style={{ width: "38px", height: "44px", objectFit: "contain", background: "#ffffff", borderRadius: "6px", padding: "2px" }}/,
  'style={{ width: "64px", height: "72px", objectFit: "contain", background: "#ffffff", borderRadius: "8px", padding: "4px" }}'
);

fs.writeFileSync(file, content);
