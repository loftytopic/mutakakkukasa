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

function formatMessage(data) {
  const actor = data.actor || "Joku";
  const flavor = data.flavor ? ` (${data.flavor})` : "";
  const cm = Number(data.cm);
  const packs = Number.isFinite(cm)
    ? ` ≈ ${(cm / 2.5).toLocaleString("fi-FI", { maximumFractionDigits: 2 })} pakettia`
    : "";
  if (data.type === "add") {
    return `🍫 Mutakakkukasa: ${actor} lisäsi ${cm} cm${flavor}${packs}.`;
  }
  if (data.type === "woltta") {
    return `📦 Mutakakkukasa: ${actor} wolttaa ${cm} cm${flavor}${packs}.`;
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
