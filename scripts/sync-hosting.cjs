const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const out = path.join(root, "hosting");
const files = ["index.html", "app.js", "styles.css", "firebase-config.js"];

fs.mkdirSync(out, { recursive: true });
for (const name of files) {
  fs.copyFileSync(path.join(root, name), path.join(out, name));
}
