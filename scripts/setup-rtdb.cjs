const { requireAuth } = require("firebase-tools/lib/requireAuth");
const { ensure } = require("firebase-tools/lib/ensureApiEnabled");
const { rtdbManagementOrigin } = require("firebase-tools/lib/api");
const {
  createInstance,
  DatabaseLocation,
  DatabaseInstanceType,
} = require("firebase-tools/lib/management/database");

const projectId = "mutakakkukasa";
const location = DatabaseLocation.EUROPE_WEST1;
const instanceName = `${projectId}-default-rtdb`;

async function main() {
  const opts = { project: projectId, projectId };
  await requireAuth(opts);
  await ensure(projectId, rtdbManagementOrigin(), "database", false);
  const created = await createInstance(
    projectId,
    instanceName,
    location,
    DatabaseInstanceType.DEFAULT_DATABASE
  );
  console.log("RTDB valmis:", created.databaseUrl || created.name);
}

main().catch((err) => {
  if (err?.original?.message) console.error(err.original.message);
  if (err?.context?.body) console.error(JSON.stringify(err.context.body, null, 2));
  else console.error(err.message || err);
  process.exit(1);
});
