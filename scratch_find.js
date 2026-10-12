const fs = require("fs");
const file = "/Users/MiquelNadalGaya/web/app/actions.ts";
const content = fs.readFileSync(file, "utf8");
const lines = content.split("\n");
lines.forEach((l, i) => {
  if (l.includes("evento_1")) console.log(`Line ${i}: ${l.trim()}`);
});
