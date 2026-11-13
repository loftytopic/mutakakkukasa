const functions = require("firebase-functions/v1");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

function readEnv() {
  return {
    chatId: process.env.WHATSAPP_CHAT_ID || "",
    greenInstance: process.env.WHATSAPP_GREEN_INSTANCE || "",
    greenToken: process.env.WHATSAPP_GREEN_TOKEN || "",
    webhookUrl: process.env.WHATSAPP_WEBHOOK_URL || "",
  };
}

function fmtCm(cm) {
  const n = Number(cm);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  return `${rounded.toLocaleString("fi-FI", { maximumFractionDigits: rounded % 1 ? 1 : 0 })} cm`;
}

function fmtPacks(packs) {
  const n = Number(packs);
  if (!Number.isFinite(n)) return "— pkt";
  const rounded = Math.round(n * 100) / 100;
  const dec = rounded % 1 ? 1 : 0;
  return `${rounded.toLocaleString("fi-FI", { minimumFractionDigits: dec, maximumFractionDigits: dec })} pkt`;
}

function fmtKcal(kcal) {
  const n = Number(kcal);
  if (!Number.isFinite(n)) return "— kcal";
  return `${Math.round(n).toLocaleString("fi-FI")} kcal`;
}

function joniBalanceLine(data) {
  const totalCm = fmtCm(data.totalCm);
  const totalPacks = fmtPacks(data.totalPacks);
  const totalKcal = fmtKcal(data.totalKcal);
  return `🎯 Jonille kasassa: ${totalCm} · ${totalPacks} · ${totalKcal}`;
}

function formatMessage(data) {
  const actor = data.actor || "Joku";
  const flavor = data.flavor ? ` · ${data.flavor}` : "";
  const cm = fmtCm(data.cm);
  const packs = fmtPacks(data.txPacks ?? data.cm / 2.5);
  const txKcal = fmtKcal(data.txKcal);
  const joni = joniBalanceLine(data);

  if (data.type === "add") {
    return [
      `🍫 ${actor} lisäsi velkaa`,
      `➕ ${cm} · ${packs} · +${txKcal}${flavor}`,
      joni,
    ].join("\n");
  }
  if (data.type === "woltta") {
    return [
      `📦 ${actor} wolttaa`,
      `➖ ${cm} · ${packs} · −${txKcal}${flavor}`,
      joni,
    ].join("\n");
  }
  return `Mutakakkukasa: ${JSON.stringify(data)}`;
}

async function sendGreen(instanceId, token, chatId, message) {
  const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Green API ${res.status}: ${body}`);
  }
}

async function sendWebhook(webhookUrl, payload) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Webhook ${res.status}: ${body}`);
  }
}

async function deliverWhatsApp(data) {
  const cfg = readEnv();
  const message = formatMessage(data);
  const payload = { message, ...data };

  if (cfg.webhookUrl) {
    await sendWebhook(cfg.webhookUrl, payload);
    return "webhook";
  }
  if (cfg.greenInstance && cfg.greenToken && cfg.chatId) {
    await sendGreen(cfg.greenInstance, cfg.greenToken, cfg.chatId, message);
    return "green";
  }
  return null;
}

exports.notifyWhatsApp = functions
  .region("europe-west1")
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .database.ref("/rooms/{roomId}/notifyQueue/{eventId}")
  .onCreate(async (snap) => {
    const data = snap.val();
    if (!data?.type) {
      await snap.ref.remove();
      return null;
    }
    try {
      const mode = await deliverWhatsApp(data);
      if (!mode) {
        logger.warn("WhatsApp ei konfiguroitu — täytä functions/.env.mutakakkukasa");
      } else {
        logger.info("WhatsApp lähetetty", { mode, type: data.type });
      }
    } catch (err) {
      logger.error("WhatsApp-lähetys epäonnistui", err);
    }
    await snap.ref.remove();
    return null;
  });
