const https = require('https');
const ids = [5267, 49957, 3705, 10260, 3679, 19301, 20528, 13702, 7196, 2812, 7483, 51351, 666, 53, 361, 142, 5358, 52601, 12697, 9842];

async function checkImg(id) {
  return new Promise((resolve) => {
    https.get(`https://tmssl.akamaized.net/images/wappen/head/${id}.png`, (res) => {
      console.log(`ID: ${id} -> ${res.statusCode}`);
      resolve();
    }).on('error', (e) => {
      console.log(`ID: ${id} -> ERROR ${e.message}`);
      resolve();
    });
  });
}

async function run() {
  for (const id of ids) await checkImg(id);
}
run();
