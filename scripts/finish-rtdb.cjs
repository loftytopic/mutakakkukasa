const { spawnSync } = require("node:child_process");

const dbUrl =
  "https://mutakakkukasa-default-rtdb.europe-west1.firebasedatabase.app";

async function probe() {
  const res = await fetch(`${dbUrl}/.json`);
  if (res.status === 404) return false;
  return res.ok;
}

async function waitForDb(maxMinutes = 15) {
  const deadline = Date.now() + maxMinutes * 60 * 1000;
  process.stdout.write("Odotetaan Realtime Databasea");
  while (Date.now() < deadline) {
    if (await probe()) {
      process.stdout.write("\n");
      return true;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 4000));
  }
  process.stdout.write("\n");
  return false;
}

async function main() {
  console.log(
    "Luo tietokanta konsolissa (jos et ole vielä):",
    "https://console.firebase.google.com/project/mutakakkukasa/database",
  );
  console.log("Sijainti: europe-west1, säännöt: test (julkaistaan CLI:llä).\n");

  const ready = await waitForDb();
  if (!ready) {
    console.error("RTDB ei vastaa — luo tietokanta konsolissa ja aja uudelleen.");
    process.exit(1);
  }

  console.log("RTDB löytyi:", dbUrl);
  const rules = spawnSync(
    "npx",
    ["firebase", "deploy", "--only", "database", "--project", "mutakakkukasa"],
    { stdio: "inherit", shell: true, cwd: require("node:path").join(__dirname, "..") },
  );
  if (rules.status !== 0) process.exit(rules.status ?? 1);
  console.log("Valmis. Synkka: npm run firebase:hosting (jos et jo julkaissut).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
