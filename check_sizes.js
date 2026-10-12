const https = require('https');
const ids = [5267, 10260, 7483, 51351, 53, 361, 52601, 9842];

async function checkImg(id) {
  return new Promise((resolve) => {
    https.get(`https://tmssl.akamaized.net/images/wappen/head/${id}.png`, (res) => {
      console.log(`ID: ${id} -> Status: ${res.statusCode} | Length: ${res.headers['content-length']}`);
      resolve();
    }).on('error', (e) => {
      resolve();
    });
  });
}

async function run() {
  for (const id of ids) await checkImg(id);
}
run();
