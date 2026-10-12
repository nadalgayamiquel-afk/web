const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
const content = fs.readFileSync(file, 'utf8');

const parts = content.split('activeTab === "club" && (');
if (parts.length > 1) {
  const rest = parts[1];
  const endIdx = rest.indexOf('activeTab === "pantallas" && (');
  if (endIdx !== -1) {
    console.log(rest.substring(0, endIdx).trim());
  }
}
