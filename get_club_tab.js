const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/ajustes/page.tsx';
const content = fs.readFileSync(file, 'utf8');

const startIdx = content.indexOf('activeTab === "club"');
if (startIdx !== -1) {
  console.log(content.substring(startIdx, startIdx + 2000));
}
