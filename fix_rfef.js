const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/lib/rivales.ts';
let content = fs.readFileSync(file, 'utf8');

const updatedRfef = `
export const PRIMERA_RFEF_G2_2627: RivalConfig[] = [
  { id: "ad-alcorcon", nombre: "AD ALCORCÓN", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/5267.png" },
  { id: "aguilas-fc", nombre: "ÁGUILAS FC", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/49957.png" },
  { id: "algeciras-cf", nombre: "ALGECIRAS CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/3705.png" },
  { id: "antequera-cf", nombre: "ANTEQUERA CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/10260.png" },
  { id: "atletico-madrileno", nombre: "ATLÉTICO MADRILEÑO", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/3679.png" },
  { id: "cd-teruel", nombre: "CD TERUEL", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/19301.png" },
  { id: "ce-europa", nombre: "CE EUROPA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/20528.png" },
  { id: "rayo-majadahonda", nombre: "CF RAYO MAJADAHONDA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/13702.png" },
  { id: "fc-cartagena", nombre: "FC CARTAGENA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/7196.png" },
  { id: "nastic", nombre: "GIMNÀSTIC DE TARRAGONA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/2812.png" },
  { id: "hercules-cf", nombre: "HÉRCULES CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/7483.png" },
  { id: "juventud-torremolinos", nombre: "JUVENTUD DE TORREMOLINOS CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/51351.png" },
  { id: "real-jaen", nombre: "REAL JAÉN CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/666.png" },
  { id: "real-madrid-castilla", nombre: "REAL MADRID CASTILLA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/53.png" },
  { id: "real-murcia", nombre: "REAL MURCIA CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/361.png" },
  { id: "real-zaragoza", nombre: "REAL ZARAGOZA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/142.png" },
  { id: "sd-huesca", nombre: "SD HUESCA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/5358.png" },
  { id: "ud-ibiza", nombre: "UD IBIZA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/52601.png" },
  { id: "ue-sant-andreu", nombre: "UE SANT ANDREU", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/12697.png" },
  { id: "villarreal-b", nombre: "VILLARREAL CF B", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/9842.png" }
];
`;

content = content.replace(
  /export const PRIMERA_RFEF_G2: RivalConfig\[\] = \[[\s\S]*?\];/g,
  updatedRfef
);

fs.writeFileSync(file, content);
