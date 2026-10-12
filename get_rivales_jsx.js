const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
const content = fs.readFileSync(file, 'utf8');

const match = content.match(/activeTab === "rivales" && \([\s\S]*?(?=activeTab === "datos" && \()/);
if (match) {
  console.log(match[0].substring(0, 2500));
}
