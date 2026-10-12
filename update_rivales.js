const fs = require('fs');
const file = '/Users/MiquelNadalGaya/web/app/lib/rivales.ts';
let content = fs.readFileSync(file, 'utf8');

const primeraRfefG2 = `
export const PRIMERA_RFEF_G2: RivalConfig[] = [
  { id: "alcoyano", nombre: "CD ALCOYANO", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/2862.png" },
  { id: "alcorcon", nombre: "AD ALCORCÓN", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/5267.png" },
  { id: "algeciras", nombre: "ALGECIRAS CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/6900.png" },
  { id: "antequera", nombre: "ANTEQUERA CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/10260.png" },
  { id: "atletico-madrid-b", nombre: "ATLÉTICO DE MADRID B", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/4222.png" },
  { id: "atletico-sanluqueno", nombre: "ATLÉTICO SANLUQUEÑO", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/10255.png" },
  { id: "betis-deportivo", nombre: "BETIS DEPORTIVO", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/12185.png" },
  { id: "ceuta", nombre: "AD CEUTA FC", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/82767.png" },
  { id: "fuenlabrada", nombre: "CF FUENLABRADA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/16386.png" },
  { id: "hercules", nombre: "HÉRCULES CF", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/7483.png" },
  { id: "intercity", nombre: "CF INTERCITY", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/68297.png" },
  { id: "marbella", nombre: "MARBELLA FC", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/4819.png" },
  { id: "merida", nombre: "MÉRIDA AD", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/44917.png" },
  { id: "real-madrid-castilla", nombre: "REAL MADRID CASTILLA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/53.png" },
  { id: "real-murcia", nombre: "REAL MURCIA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/361.png" },
  { id: "recreativo-huelva", nombre: "RECREATIVO DE HUELVA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/165.png" },
  { id: "sevilla-atletico", nombre: "SEVILLA ATLÉTICO", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/4223.png" },
  { id: "ud-ibiza", nombre: "UD IBIZA", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/52601.png" },
  { id: "villarreal-b", nombre: "VILLARREAL CF B", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/9842.png" },
  { id: "yeclano", nombre: "YECLANO DEPORTIVO", escudoUrl: "https://tmssl.akamaized.net/images/wappen/head/19539.png" }
];
`;

content = content.replace(
  /export const DEFAULT_RIVALES: RivalConfig\[\] = \[/,
  primeraRfefG2 + '\nexport const DEFAULT_RIVALES: RivalConfig[] = ['
);

fs.writeFileSync(file, content);
