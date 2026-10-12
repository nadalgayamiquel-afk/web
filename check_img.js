const https = require('https');

const urls = [
  "https://tmssl.akamaized.net/images/wappen/head/59757.png", // Arnedo
  "https://tmssl.akamaized.net/images/wappen/head/2505.png", // Sant Andreu
  "https://tmssl.akamaized.net/images/wappen/head/12108.png", // Europa
  "https://tmssl.akamaized.net/images/wappen/head/1357.png", // Sabadell
  "https://tmssl.akamaized.net/images/wappen/head/10776.png" // Olot
];

urls.forEach(url => {
  https.get(url, (res) => {
    console.log(url, res.statusCode);
  }).on('error', console.error);
});
