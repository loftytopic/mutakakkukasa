const { requireAuth } = require("firebase-tools/lib/requireAuth");
const {
  createInstance,
  DatabaseLocation,
  DatabaseInstanceType,
} = require("firebase-tools/lib/management/database");

const projectId = "mutakakkukasa";
const location = DatabaseLocation.EUROPE_WEST1;
const instanceName = `${projectId}-default-rtdb`;

async function main() {
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT = projectId;
  const opts = { project: projectId, projectId };
  await requireAuth(opts);

  const created = await createInstance(
    projectId,
    instanceName,
    location,
    DatabaseInstanceType.DEFAULT_DATABASE
  );
  console.log("RTDB valmis:", created.databaseUrl || created.name);
  console.log("Seuraavaksi: npm run firebase:deploy-rules");
}

main().catch((err) => {
  if (err?.original?.message) console.error(err.original.message);
  if (err?.context?.body) console.error(JSON.stringify(err.context.body, null, 2));
  else console.error(err.message || err);
  console.error(
    "\nJos virhe on USER_PROJECT_DENIED: avaa IAM ja lisää itsellesi rooli",
    "`Service Usage Consumer` projektiin mutakakkukasa:",
    "https://console.cloud.google.com/iam-admin/iam?project=mutakakkukasa",
  );
  console.error(
    "Vaihtoehto: luo Realtime Database käsin (Create Database, europe-west1):",
    "https://console.firebase.google.com/project/mutakakkukasa/database",
  );
  process.exit(1);
});
