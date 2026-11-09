/**
 * Lukee firebase apps:sdkconfig JSON:n stdinistä ja kirjoittaa firebase-config.js
 * Käyttö: npx firebase apps:sdkconfig web --json | node scripts/write-firebase-config.mjs
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const raw = readFileSync(0, "utf8");
const data = JSON.parse(raw);
const cfg = data.result?.sdkConfig ?? data.sdkConfig ?? data;

if (!cfg?.apiKey) {
  console.error("Ei sdkConfigia — aja: npx firebase apps:sdkconfig web --project PROJEKTI --json");
  process.exit(1);
}

const roomId =
  process.env.FIREBASE_ROOM_ID ||
  `mutakakkukasa-${randomBytes(12).toString("base64url")}`;

if (!cfg.databaseURL && cfg.projectId) {
  cfg.databaseURL = `https://${cfg.projectId}-default-rtdb.europe-west1.firebasedatabase.app`;
}

const file = `/** Automaattisesti luotu — älä commitoi julkiseen repoon jos room-id on salainen. */
window.FIREBASE_CONFIG = ${JSON.stringify(cfg, null, 2)};

window.FIREBASE_ROOM_ID = ${JSON.stringify(roomId)};
`;

process.stdout.write(file);
