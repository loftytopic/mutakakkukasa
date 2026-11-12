const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const envPath = path.join(__dirname, "..", "functions", ".env.mutakakkukasa");

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

async function main() {
  console.log("Mutakakkukasa — WhatsApp (Green API tai Make-webhook)\n");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const mode = (await ask(rl, "green vai webhook? [green/webhook]: ")).trim().toLowerCase();
  let lines = [];
  if (mode === "webhook") {
    const url = await ask(rl, "Webhook URL: ");
    lines = [`WHATSAPP_WEBHOOK_URL=${url.trim()}`];
  } else {
    const chatId = await ask(rl, "Ryhmän chatId (@g.us): ");
    const inst = await ask(rl, "Green idInstance: ");
    const token = await ask(rl, "Green apiTokenInstance: ");
    lines = [
      `WHATSAPP_CHAT_ID=${chatId.trim()}`,
      `WHATSAPP_GREEN_INSTANCE=${inst.trim()}`,
      `WHATSAPP_GREEN_TOKEN=${token.trim()}`,
    ];
  }
  rl.close();
  fs.writeFileSync(envPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`\nTallennettu: ${envPath}`);
  console.log("Deploy: npm run firebase:functions");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
