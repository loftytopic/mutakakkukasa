const PACKAGE_HEIGHT_CM = 2.5;
const MIN_DEBT_AFTER_HUB_WOLTTA_CM = 0.1;
const USER_COUNT = 3;
const STORAGE_KEY = "mutakakkukasa-v3";
/** Joni: vain katselu — ei kirjauksia. */
const VIEW_ONLY_NAMES = new Set(["joni"]);
const DEBT_FRIEND_NAME = "joni";
const DELIVERY_ADDRESS_EDITORS = new Set(["aapo", "jaakko"]);
const FLAVORS = [
  { id: "perus", label: "Perus" },
  { id: "minttu", label: "Minttu" },
  { id: "appelsiini", label: "Appelsiini" },
];
const FLAVOR_IDS = FLAVORS.map((f) => f.id);
const LOCAL_FLAVOR_KEY = "mutakakkukasa-selected-flavor";

/** Ravintoarvoilmoitus / 100 g (pakkausmerkintä). */
const NUTRITION_PER_100G = {
  energyKj: 1606,
  energyKcal: 381,
  fatG: 15,
  saturatedFatG: 2,
  carbsG: 56,
  sugarsG: 41,
  proteinG: 5,
  saltG: 0.45,
};
const DEFAULT_GRAMS_PER_PACKAGE = 100;
const CAKE_PILE_MAX_SLABS = 36;

const defaultFlavorCm = () => ({ perus: 0, minttu: 0, appelsiini: 0 });

const defaultState = () => ({
  names: ["Aapo", "Joni", "Jaakko"],
  debtFriendIndex: 0,
  activeUserIndex: 0,
  sharedDebtCm: 0,
  flavorCm: defaultFlavorCm(),
  wolttaLog: [],
  deliveryAddress: "",
  canWoltta: [true, false, true],
  gramsPerPackage: DEFAULT_GRAMS_PER_PACKAGE,
});

let selectedFlavor = "perus";

function flavorLabel(id) {
  return FLAVORS.find((f) => f.id === id)?.label ?? id;
}

function normalizeFlavorCm(raw, fallbackTotal = 0) {
  const base = defaultFlavorCm();
  if (raw && typeof raw === "object") {
    for (const id of FLAVOR_IDS) {
      const n = Number(raw[id]);
      base[id] = Number.isFinite(n) ? Math.max(0, n) : 0;
    }
    return base;
  }
  base.perus = Math.max(0, fallbackTotal);
  return base;
}

function totalDebtCm(flavorCm = state.flavorCm) {
  return FLAVOR_IDS.reduce((sum, id) => sum + (flavorCm[id] ?? 0), 0);
}

function syncSharedDebtFromFlavors() {
  state.sharedDebtCm = Math.round(totalDebtCm() * 100) / 100;
}

function loadSelectedFlavor() {
  const saved = localStorage.getItem(LOCAL_FLAVOR_KEY);
  if (saved && FLAVOR_IDS.includes(saved)) selectedFlavor = saved;
}

function setSelectedFlavor(id) {
  if (!FLAVOR_IDS.includes(id)) return;
  selectedFlavor = id;
  localStorage.setItem(LOCAL_FLAVOR_KEY, id);
  syncFlavorPickerUi();
}

function syncFlavorPickerUi() {
  document.querySelectorAll("[data-flavor-option]").forEach((btn) => {
    const active = btn.dataset.flavorOption === selectedFlavor;
    btn.classList.toggle("is-selected", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function initFlavorPickers() {
  document.querySelectorAll("[data-flavor-option]").forEach((btn) => {
    btn.addEventListener("click", () => setSelectedFlavor(btn.dataset.flavorOption));
  });
  loadSelectedFlavor();
  syncFlavorPickerUi();
}

function loadState() {
  try {
    for (const key of [STORAGE_KEY, "mutakakkukasa-v2", "mutakakkukasa-v1"]) {
      const raw = localStorage.getItem(key);
      if (raw) return normalizeState(JSON.parse(raw));
    }
    return defaultState();
  } catch {
    return defaultState();
  }
}

function normalizeState(parsed) {
  let sharedDebtCm = parsed.sharedDebtCm;
  if (!Number.isFinite(sharedDebtCm) && Array.isArray(parsed.debtsCm)) {
    const hub = Number.isFinite(parsed.debtFriendIndex) ? parsed.debtFriendIndex : 0;
    sharedDebtCm = parsed.debtsCm.reduce((sum, cm, i) => (i === hub ? sum : sum + (Number(cm) || 0)), 0);
  }
  if (!Number.isFinite(sharedDebtCm)) sharedDebtCm = 0;

  let canWoltta = parsed.canWoltta;
  if (!Array.isArray(canWoltta)) {
    canWoltta = defaultState().canWoltta;
  }
  const names = (parsed.names ?? defaultState().names).slice(0, USER_COUNT);
  canWoltta = [0, 1, 2].map((i) => Boolean(canWoltta[i]));
  const hub = indexOfDebtFriend(names);
  if (hub >= 0) canWoltta[hub] = false;
  const flavorCm = normalizeFlavorCm(parsed.flavorCm, sharedDebtCm);
  const sharedFromFlavors = totalDebtCm(flavorCm);

  return {
    names,
    debtFriendIndex: indexOfDebtFriend(names),
    flavorCm,
    sharedDebtCm: Math.max(0, sharedFromFlavors || sharedDebtCm),
    wolttaLog: Array.isArray(parsed.wolttaLog) ? parsed.wolttaLog.slice(-20) : [],
    deliveryAddress: typeof parsed.deliveryAddress === "string" ? parsed.deliveryAddress : "",
    canWoltta,
    gramsPerPackage:
      Number.isFinite(parsed.gramsPerPackage) && parsed.gramsPerPackage > 0
        ? parsed.gramsPerPackage
        : DEFAULT_GRAMS_PER_PACKAGE,
    activeUserIndex:
      Number.isFinite(parsed.activeUserIndex) && parsed.activeUserIndex >= 0
        ? parsed.activeUserIndex % USER_COUNT
        : defaultState().activeUserIndex,
  };
}

let state = loadState();

function indexOfUserByName(name) {
  const key = String(name).trim().toLowerCase();
  if (!key) return -1;
  return state.names.findIndex((n) => n.trim().toLowerCase() === key);
}

function isIOS() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/** macOS-selain (ei iPad/iPhone). Joni käyttää MacBookia. */
function isMacOS() {
  if (isIOS()) return false;
  const ua = navigator.userAgent;
  return /Macintosh|Mac OS X/i.test(ua) || navigator.platform === "MacIntel";
}

/** iPhone / iPad / MacBook → aina Joni, ellei URL ?kuka=aapo|jaakko */
function isJoniLockedDevice() {
  return isIOS() || isMacOS();
}

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function readUserUrlParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get("kuka") ?? params.get("user");
}

function hasUserUrlOverride() {
  const raw = readUserUrlParam();
  if (!raw) return false;
  return indexOfUserByName(raw) >= 0;
}

/** Kirjanmerkki ?kuka=aapo — voittaa laitetunnistuksen (esim. MacBookilla Jaakko). */
function applyUserFromUrl() {
  const raw = readUserUrlParam();
  if (!raw) return false;
  const idx = indexOfUserByName(raw);
  if (idx < 0) return false;
  state.activeUserIndex = idx;
  return true;
}

/** Joni: iOS + MacBook. Android: Aapo/Jaakko valitsevat itse. */
function applyUserFromDevice() {
  if (!isJoniLockedDevice()) return false;
  const idx = indexOfUserByName("joni");
  if (idx < 0) return false;
  state.activeUserIndex = idx;
  return true;
}

let applyingRemote = false;
let firebaseReady = false;
let firebasePushTimer = null;
let dbRef = null;
let seededCloud = false;

function isFirebaseConfigured() {
  const cfg = window.FIREBASE_CONFIG;
  return Boolean(
    cfg?.apiKey &&
      cfg.apiKey !== "YOUR_API_KEY" &&
      cfg.databaseURL &&
      !String(cfg.databaseURL).includes("YOUR_PROJECT")
  );
}

function stateForCloud() {
  const { activeUserIndex: _activeUserIndex, ...cloud } = state;
  return cloud;
}

function mergeCloudIntoState(cloud) {
  const keepActive = state.activeUserIndex;
  const merged = normalizeState({ ...cloud, activeUserIndex: keepActive });
  state.names = merged.names;
  state.debtFriendIndex = merged.debtFriendIndex;
  state.flavorCm = merged.flavorCm;
  state.sharedDebtCm = merged.sharedDebtCm;
  state.wolttaLog = merged.wolttaLog;
  state.deliveryAddress = merged.deliveryAddress;
  state.canWoltta = merged.canWoltta;
  state.gramsPerPackage = merged.gramsPerPackage;
}

function refreshUiFromState() {
  syncInputsFromState();
  renderSharedDebt();
  renderWolttaLog();
}

function setSyncStatus(mode, detail = "") {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.classList.remove("is-online", "is-offline");
  const suffix = detail ? ` — ${detail}` : "";
  if (mode === "online") {
    el.classList.add("is-online");
    el.textContent = `Synkronointi: Firebase (reaaliaika)${suffix}`;
  } else if (mode === "offline") {
    el.classList.add("is-offline");
    el.textContent = `Synkronointi: vain tämä laite (täytä firebase-config.js)${suffix}`;
  } else {
    el.textContent = `Synkronointi: ${detail || "…"}`;
  }
}

function enqueueWhatsAppNotify(payload) {
  if (!firebaseReady || !isFirebaseConfigured() || applyingRemote) return;
  const roomId = window.FIREBASE_ROOM_ID || "mutakakkukasa";
  firebase
    .database()
    .ref(`rooms/${roomId}/notifyQueue`)
    .push({
      ...payload,
      at: Date.now(),
    })
    .catch(() => {});
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (applyingRemote || !firebaseReady || !dbRef) return;
  clearTimeout(firebasePushTimer);
  firebasePushTimer = window.setTimeout(() => {
    dbRef
      .set(stateForCloud())
      .catch(() => setSyncStatus("online", "tallennus epäonnistui"));
  }, 280);
}

function initFirebase() {
  if (!isFirebaseConfigured()) {
    setSyncStatus("offline");
    return false;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(window.FIREBASE_CONFIG);
    }
    const roomId = window.FIREBASE_ROOM_ID || "mutakakkukasa";
    dbRef = firebase.database().ref(`rooms/${roomId}/shared`);

    dbRef.on(
      "value",
      (snap) => {
        const cloud = snap.val();
        if (cloud === null) {
          if (!seededCloud) {
            seededCloud = true;
            dbRef.set(stateForCloud()).catch(() => setSyncStatus("online", "aloitustallennus epäonnistui — tarkista säännöt"));
          }
          return;
        }
        applyingRemote = true;
        mergeCloudIntoState(cloud);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        applyingRemote = false;
        refreshUiFromState();
      },
      (err) => {
        const code = err?.code ?? "";
        if (code === "PERMISSION_DENIED") {
          setSyncStatus("offline", "Realtime DB estää luvan — julkaise database.rules.json");
        } else {
          setSyncStatus("online", "yhteys katkesi");
        }
      }
    );

    firebaseReady = true;
    setSyncStatus("online");
    return true;
  } catch {
    setSyncStatus("offline", "Firebase-virhe");
    return false;
  }
}

const els = {
  names: [0, 1, 2].map((i) => document.getElementById(`name-${i}`)),
  debtFriendIndex: document.getElementById("debt-friend-index"),
  deliveryAddress: document.getElementById("delivery-address"),
  wolttaFlags: document.getElementById("woltta-flags"),
  debtFriendLabel: document.getElementById("debt-friend-label"),
  debtorsLabel: document.getElementById("debtors-label"),
  totalReceivable: document.getElementById("total-receivable"),
  sharedDebtCm: document.getElementById("shared-debt-cm"),
  flavorDebtBody: document.getElementById("flavor-debt-body"),
  nutritionBody: document.getElementById("nutrition-body"),
  nutritionSub: document.getElementById("nutrition-sub"),
  gramsPerPackage: document.getElementById("grams-per-package"),
  debtCakePile: document.getElementById("debt-cake-pile"),
  statSharedPackages: document.getElementById("stat-shared-packages"),
  txAddCm: document.getElementById("tx-add-cm"),
  txAddPackages: document.getElementById("tx-add-packages"),
  btnTxAddPackage: document.getElementById("btn-tx-add-package"),
  txWolttaUser: document.getElementById("tx-woltta-user"),
  txWolttaCm: document.getElementById("tx-woltta-cm"),
  txPanelAdd: document.getElementById("tx-panel-add"),
  txPanelWoltta: document.getElementById("tx-panel-woltta"),
  txModeRadios: document.querySelectorAll('input[name="tx-mode"]'),
  wolttaHint: document.getElementById("woltta-hint"),
  deliveryBox: document.getElementById("delivery-box"),
  deliveryText: document.getElementById("delivery-text"),
  btnCopyAddress: document.getElementById("btn-copy-address"),
  wolttaLog: document.getElementById("woltta-log"),
  btnApplyTx: document.getElementById("btn-apply-tx"),
  btnReset: document.getElementById("btn-reset"),
  activeUserIndex: document.getElementById("active-user-index"),
  roleHint: document.getElementById("role-hint"),
  identitySection: document.getElementById("identity-section"),
  identityField: document.querySelector(".field--identity"),
  settingsSection: document.getElementById("settings-section"),
  txSection: document.getElementById("tx-section"),
  txModeWolttaWrap: document.getElementById("tx-mode-woltta-wrap"),
  errorMessage: document.getElementById("error-message"),
};

function formatNumber(n, decimals = 0) {
  return n.toLocaleString("fi-FI", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCm(cm) {
  const rounded = Math.round(cm * 100) / 100;
  const dec = rounded % 1 ? 2 : 0;
  return `${formatNumber(rounded, dec)} cm`;
}

function packagesFromCm(cm) {
  if (!Number.isFinite(cm) || cm < 0) return null;
  return cm / PACKAGE_HEIGHT_CM;
}

function formatPackages(n) {
  if (n === null) return "—";
  const rounded = Math.round(n * 100) / 100;
  return `${formatNumber(rounded, rounded % 1 ? 2 : 0)} kpl`;
}

function formatGrams(g) {
  const rounded = Math.round(g * 10) / 10;
  return `${formatNumber(rounded, rounded % 1 ? 1 : 0)} g`;
}

function pileHash(n) {
  return ((n * 1103515245 + 12345) >>> 0) / 0xffffffff;
}

function renderCakePile(container, packages, { flavor = null } = {}) {
  if (!container) return;

  const count = Number.isFinite(packages) && packages > 0 ? packages : 0;
  const prev = Number.parseFloat(container.dataset.packages || "0");
  container.dataset.packages = String(count);

  const scene = container.closest(".cake-pile-scene");
  if (scene) {
    scene.classList.toggle("is-empty", count === 0);
    if (count > prev) {
      scene.classList.remove("cake-pile-scene--pulse");
      void scene.offsetWidth;
      scene.classList.add("cake-pile-scene--pulse");
    }
  }

  container.replaceChildren();
  if (count === 0) return;

  const slabs = Math.min(Math.ceil(count), CAKE_PILE_MAX_SLABS);
  const over = count - CAKE_PILE_MAX_SLABS;

  for (let i = 0; i < slabs; i++) {
    const slab = document.createElement("div");
    slab.className = "cake-slab";
    if (flavor) slab.classList.add(`cake-slab--flavor-${flavor}`);

    const r1 = pileHash(i + 1);
    const r2 = pileHash(i + 17);
    slab.style.setProperty("--shift", `${(r1 - 0.5) * 14}px`);
    slab.style.setProperty("--tilt", `${(r2 - 0.5) * 5}deg`);
    slab.style.setProperty("--width", `${84 + r1 * 14}%`);
    slab.style.setProperty("--mud", `${22 + (r2 * 14) | 0}%`);

    if (i === slabs - 1 && count % 1 > 0.05) {
      const partial = count - Math.floor(count);
      slab.style.setProperty("--partial", String(Math.max(0.25, partial)));
    }

    container.appendChild(slab);
  }

  if (over > 0) {
    const more = document.createElement("p");
    more.className = "cake-pile-more";
    more.textContent = `+${formatPackages(over)}`;
    container.appendChild(more);
  }
}

function totalDebtGrams() {
  const packs = packagesFromCm(state.sharedDebtCm);
  if (packs === null || !state.gramsPerPackage) return 0;
  return packs * state.gramsPerPackage;
}

function nutritionForGrams(grams) {
  if (grams <= 0) return null;
  const factor = grams / 100;
  return {
    energyKj: NUTRITION_PER_100G.energyKj * factor,
    energyKcal: NUTRITION_PER_100G.energyKcal * factor,
    fatG: NUTRITION_PER_100G.fatG * factor,
    saturatedFatG: NUTRITION_PER_100G.saturatedFatG * factor,
    carbsG: NUTRITION_PER_100G.carbsG * factor,
    sugarsG: NUTRITION_PER_100G.sugarsG * factor,
    proteinG: NUTRITION_PER_100G.proteinG * factor,
    saltG: NUTRITION_PER_100G.saltG * factor,
  };
}

function renderNutrition() {
  if (!els.nutritionBody) return;
  const grams = totalDebtGrams();
  const n = nutritionForGrams(grams);

  if (els.nutritionSub) {
    const packs = formatPackages(packagesFromCm(state.sharedDebtCm));
    els.nutritionSub.textContent =
      grams > 0
        ? `Laskettu: ${packs} × ${formatGrams(state.gramsPerPackage)} = ${formatGrams(grams)} (perustuu 100 g arvoon)`
        : "Ei velkaa — ei ravintoa.";
  }

  if (!n) {
    els.nutritionBody.replaceChildren();
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="2" class="muted">—</td>`;
    els.nutritionBody.appendChild(tr);
    return;
  }

  const rows = [
    ["Energia", `${formatNumber(Math.round(n.energyKj), 0)} kJ / ${formatNumber(Math.round(n.energyKcal), 0)} kcal`],
    ["Rasvaa", `${formatNumber(Math.round(n.fatG * 10) / 10, 1)} g`],
    ["- josta tyydyttyneitä rasvoja", `${formatNumber(Math.round(n.saturatedFatG * 10) / 10, 1)} g`],
    ["Hiilihydraattia", `${formatNumber(Math.round(n.carbsG * 10) / 10, 1)} g`],
    ["- josta sokereita", `${formatNumber(Math.round(n.sugarsG * 10) / 10, 1)} g`],
    ["Proteiinia", `${formatNumber(Math.round(n.proteinG * 10) / 10, 1)} g`],
    ["Suola", `${formatNumber(Math.round(n.saltG * 100) / 100, 2)} g`],
  ];

  els.nutritionBody.replaceChildren(
    ...rows.map(([label, val]) => {
      const tr = document.createElement("tr");
      const sub = label.startsWith("-");
      tr.innerHTML = `
        <td class="${sub ? "nutrition-sub" : ""}">${label}</td>
        <td class="num">${val}</td>
      `;
      return tr;
    })
  );
}

function setError(message) {
  if (message) {
    els.errorMessage.textContent = message;
    els.errorMessage.classList.remove("hidden");
  } else {
    els.errorMessage.textContent = "";
    els.errorMessage.classList.add("hidden");
  }
}

function indexOfDebtFriend(names = state.names) {
  const found = names.findIndex((n) => n.trim().toLowerCase() === DEBT_FRIEND_NAME);
  return found >= 0 ? found : 1;
}

function ensureDebtFriendIsJoni() {
  state.debtFriendIndex = indexOfDebtFriend();
}

function fillDebtFriendSelect() {
  ensureDebtFriendIsJoni();
  const idx = state.debtFriendIndex;
  els.debtFriendIndex.replaceChildren();
  const opt = document.createElement("option");
  opt.value = String(idx);
  opt.textContent = state.names[idx] ?? "Joni";
  opt.selected = true;
  els.debtFriendIndex.appendChild(opt);
}

function debtFriendName() {
  return state.names[state.debtFriendIndex] ?? "Joni";
}

function debtorIndices() {
  return [0, 1, 2].filter((i) => i !== state.debtFriendIndex);
}

function activeUserName() {
  return (state.names[state.activeUserIndex] ?? "").trim();
}

function isViewOnlyUser() {
  return VIEW_ONLY_NAMES.has(activeUserName().toLowerCase());
}

function canEditDeliveryAddress() {
  return DELIVERY_ADDRESS_EDITORS.has(activeUserName().toLowerCase());
}

function applyRoleUi() {
  const on = isViewOnlyUser();
  const canEditAddress = canEditDeliveryAddress();

  els.btnReset.hidden = on;
  els.sharedDebtCm.readOnly = true;
  if (els.txModeWolttaWrap) els.txModeWolttaWrap.hidden = on;
  if (els.txSection) els.txSection.classList.toggle("hidden", on);

  els.deliveryAddress.readOnly = !canEditAddress;
  els.deliveryAddress.classList.toggle("is-locked", !canEditAddress);

  const joniDevice = isJoniLockedDevice();
  const urlOverride = hasUserUrlOverride();
  const joniLocked = joniDevice && on && !urlOverride;
  const hideSettings = joniLocked;
  if (els.settingsSection) els.settingsSection.classList.toggle("hidden", hideSettings);
  if (els.identityField) els.identityField.classList.toggle("hidden", joniLocked);
  const hint = document.getElementById("identity-hint");
  if (hint) {
    if (joniLocked) {
      hint.textContent = `Olet ${activeUserName()} (iPhone tai Mac). Vain katselu — ei lisäystä, ei wolttaa (tilausta).`;
    } else if (joniDevice && urlOverride && !on) {
      hint.textContent = `Kirjanmerkki: ${activeUserName()}. Vain tämä rooli MacBookilla — Joni käyttää linkkiä ilman parametria.`;
    } else {
      hint.textContent =
        "Valitse Aapo tai Jaakko. Kirjanmerkit: ?kuka=aapo / ?kuka=jaakko (tarvitaan MacBookilla).";
    }
  }

  if (on) {
    els.roleHint.hidden = true;
    els.roleHint.textContent = "";
    const addRadio = document.querySelector('input[name="tx-mode"][value="add"]');
    if (transactionMode() === "woltta" && addRadio) {
      addRadio.checked = true;
      syncTxPanels();
    }
  } else if (canEditAddress) {
    els.roleHint.hidden = false;
    const androidNote =
      isAndroid() && !isIOS()
        ? " Android: muista kirjanmerkki ?kuka=aapo tai ?kuka=jaakko."
        : "";
    els.roleHint.textContent = `${activeUserName()} voi muuttaa toimitusosoitetta.${androidNote}`;
  } else if (isAndroid() && !isIOS()) {
    els.roleHint.hidden = false;
    els.roleHint.textContent =
      "Android ei erota Aapoa ja Jaakkoa — valitse käyttäjä tai käytä kirjanmerkkiä ?kuka=aapo / ?kuka=jaakko.";
  } else {
    els.roleHint.hidden = true;
    els.roleHint.textContent = "";
  }
}

function wolttaAllowedIndices() {
  return [0, 1, 2].filter((i) => state.canWoltta[i]);
}

function transactionMode() {
  const checked = document.querySelector('input[name="tx-mode"]:checked');
  return checked?.value === "woltta" ? "woltta" : "add";
}

function fillSelect(select, options, selectedIndex) {
  select.replaceChildren(
    ...options.map((label, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = label;
      if (i === selectedIndex) opt.selected = true;
      return opt;
    })
  );
}

function activeUserSelectIndices() {
  return [0, 1, 2].filter((i) => !VIEW_ONLY_NAMES.has(state.names[i].trim().toLowerCase()));
}

function fillActiveUserSelect() {
  const indices = activeUserSelectIndices();
  const selected = indices.includes(state.activeUserIndex)
    ? state.activeUserIndex
  : indices[0];
  if (!indices.includes(state.activeUserIndex) && indices.length) {
    state.activeUserIndex = selected;
  }
  els.activeUserIndex.replaceChildren(
    ...indices.map((i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = state.names[i] ?? `Kaveri ${i + 1}`;
      if (i === selected) opt.selected = true;
      return opt;
    })
  );
}

function fillWolttaUserSelect() {
  const allowed = wolttaAllowedIndices();
  const current = Number(els.txWolttaUser.value);
  const selected = allowed.includes(current) ? current : allowed[0];

  if (!allowed.length) {
    els.txWolttaUser.replaceChildren();
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— kukaan ei voi wolttaa —";
    els.txWolttaUser.appendChild(opt);
    return;
  }

  els.txWolttaUser.replaceChildren(
    ...allowed.map((i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      const tag = i === state.debtFriendIndex ? " (velkakaveri)" : "";
      opt.textContent = `${state.names[i]}${tag}`;
      if (i === selected) opt.selected = true;
      return opt;
    })
  );
  updateWolttaHint();
}

function parseCm(value) {
  const n = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parsePositiveCm(value) {
  const n = parseCm(value);
  return n !== null && n > 0 ? n : null;
}

function deliveryAddressTrimmed() {
  return state.deliveryAddress.trim();
}

function renderDeliveryAddress() {
  const addr = deliveryAddressTrimmed();
  if (addr) {
    els.deliveryText.textContent = addr;
    els.deliveryBox.classList.remove("is-empty");
  } else {
    els.deliveryText.textContent = "Aseta toimitusosoite yllä (velkakaveri-kohdassa).";
    els.deliveryBox.classList.add("is-empty");
  }
}

async function copyDeliveryAddress() {
  const addr = deliveryAddressTrimmed();
  if (!addr) {
    setError("Toimitusosoitetta ei ole asetettu.");
    return;
  }
  setError("");
  try {
    await navigator.clipboard.writeText(addr);
    els.btnCopyAddress.textContent = "Kopioitu!";
    window.setTimeout(() => {
      els.btnCopyAddress.textContent = "Kopioi osoite";
    }, 2000);
  } catch {
    setError("Osoitteen kopiointi epäonnistui — kopioi käsin laatikosta.");
  }
}

function updateWolttaHint() {
  const whoIdx = Number(els.txWolttaUser.value);
  if (whoIdx === state.debtFriendIndex) {
    els.wolttaHint.textContent =
      "Velkakaveri voi wolttaa osittain, mutta ei koko velkaa kerralla — jäljelle jää aina vähintään ripaus.";
  } else {
    els.wolttaHint.textContent = "Lyhentää yhteistä velkaa. 7,5 cm = 3 pakettia. Velallinen voi nollata velan.";
  }
}

function renderWolttaFlags() {
  els.wolttaFlags.replaceChildren(
    ...[0, 1, 2].map((i) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = state.canWoltta[i];
      input.dataset.userIndex = String(i);
      label.append(input, document.createTextNode(state.names[i]));
      return label;
    })
  );

  els.wolttaFlags.querySelectorAll("input[type=checkbox]").forEach((input) => {
    input.addEventListener("change", () => {
      const i = Number(input.dataset.userIndex);
      state.canWoltta[i] = input.checked;
      saveState();
      fillWolttaUserSelect();
    });
  });
}

function syncInputsFromState() {
  state.names.forEach((name, i) => {
    els.names[i].value = name;
  });
  els.deliveryAddress.value = state.deliveryAddress;
  if (els.gramsPerPackage) {
    els.gramsPerPackage.value = String(state.gramsPerPackage);
    els.gramsPerPackage.readOnly = isViewOnlyUser();
  }
  fillDebtFriendSelect();
  fillActiveUserSelect();
  renderWolttaFlags();
  fillWolttaUserSelect();
  renderDeliveryAddress();
  applyRoleUi();
}

function renderSharedDebt() {
  const friend = debtFriendName();
  const debtors = debtorIndices().map((i) => state.names[i]);

  syncSharedDebtFromFlavors();

  els.debtFriendLabel.textContent = `Velkakaveri: ${friend}`;
  els.debtorsLabel.textContent = `Yhteisvelalliset: ${debtors.join(" ja ")}`;

  els.sharedDebtCm.value = String(state.sharedDebtCm);
  const packs = packagesFromCm(state.sharedDebtCm);
  els.statSharedPackages.textContent = formatPackages(packs);

  if (els.flavorDebtBody) {
    const readonly = isViewOnlyUser();
    els.flavorDebtBody.replaceChildren(
      ...FLAVORS.map(({ id, label }) => {
        const cm = state.flavorCm[id] ?? 0;
        const tr = document.createElement("tr");
        if (readonly) {
          tr.innerHTML = `
            <td>${label}</td>
            <td class="num">${formatCm(cm)}</td>
            <td class="num scaled">${formatPackages(packagesFromCm(cm))}</td>
          `;
        } else {
          tr.innerHTML = `
            <td>${label}</td>
            <td class="num">
              <input type="number" class="cell-input flavor-cm-input" data-flavor="${id}" step="0.1" min="0" value="${cm}" aria-label="${label} velka cm" />
            </td>
            <td class="num scaled">${formatPackages(packagesFromCm(cm))}</td>
          `;
        }
        return tr;
      })
    );

    if (!readonly) {
      els.flavorDebtBody.querySelectorAll(".flavor-cm-input").forEach((input) => {
        input.addEventListener("change", () => {
          const id = input.dataset.flavor;
          const val = parseCm(input.value);
          state.flavorCm[id] = val !== null ? Math.max(0, val) : 0;
          syncSharedDebtFromFlavors();
          saveState();
          renderSharedDebt();
        });
      });
    }
  }

  if (state.sharedDebtCm > 0) {
    els.totalReceivable.hidden = false;
    els.totalReceivable.textContent = `Saatavaa: ${formatCm(state.sharedDebtCm)} · ${formatPackages(packs)}`;
  } else {
    els.totalReceivable.hidden = true;
    els.totalReceivable.textContent = "";
  }

  renderNutrition();

  const debtPacks = packagesFromCm(state.sharedDebtCm);
  renderCakePile(els.debtCakePile, debtPacks ?? 0);
}

function renderWolttaLog() {
  if (!state.wolttaLog.length) {
    els.wolttaLog.hidden = true;
    els.wolttaLog.replaceChildren();
    return;
  }

  els.wolttaLog.hidden = false;
  els.wolttaLog.replaceChildren(
    ...state.wolttaLog
      .slice()
      .reverse()
      .map((entry) => {
        const li = document.createElement("li");
        const who = state.names[entry.whoIndex] ?? "—";
        const flavor = entry.flavor ? ` · ${flavorLabel(entry.flavor)}` : "";
        li.textContent = `${who} wolttasi ${formatCm(entry.cm)} (${formatPackages(packagesFromCm(entry.cm))})${flavor}`;
        return li;
      })
  );
}

function currentTxAddCm() {
  const cm = parseCm(els.txAddCm.value);
  return cm !== null && cm >= 0 ? cm : 0;
}

function renderTxAddPackages() {
  if (!els.txAddPackages) return;
  const cm = parseCm(els.txAddCm.value);
  if (cm === null || cm <= 0) {
    els.txAddPackages.textContent = "—";
    return;
  }
  els.txAddPackages.textContent = `≈ ${formatPackages(packagesFromCm(cm))}`;
}

function addOnePackageToTxAdd() {
  const next = currentTxAddCm() + PACKAGE_HEIGHT_CM;
  const rounded = Math.round(next * 100) / 100;
  els.txAddCm.value = String(rounded);
  renderTxAddPackages();
}

function syncTxPanels() {
  const woltta = transactionMode() === "woltta";
  els.txPanelWoltta.classList.toggle("hidden", !woltta);
  els.txPanelAdd.classList.toggle("hidden", woltta);
  if (woltta) {
    renderDeliveryAddress();
    updateWolttaHint();
  } else {
    renderTxAddPackages();
  }
  setError("");
}

function maxWolttaForUser(whoIdx) {
  if (whoIdx !== state.debtFriendIndex) return state.sharedDebtCm;
  const leave = MIN_DEBT_AFTER_HUB_WOLTTA_CM;
  if (state.sharedDebtCm <= leave) return 0;
  return state.sharedDebtCm - leave;
}

function validateWoltta(whoIdx, woltta) {
  if (!wolttaAllowedIndices().includes(whoIdx)) {
    return "Tällä kaverilla ei ole lupaa wolttaa.";
  }

  const flavorDebt = state.flavorCm[selectedFlavor] ?? 0;
  if (woltta > flavorDebt) {
    return `${flavorLabel(selectedFlavor)}: max ${formatCm(flavorDebt)} tällä hetkellä.`;
  }
  if (woltta > state.sharedDebtCm) {
    return `Woltta (${formatCm(woltta)}) on suurempi kuin kokonaisvelka (${formatCm(state.sharedDebtCm)}).`;
  }

  if (whoIdx === state.debtFriendIndex) {
    const remaining = state.sharedDebtCm - woltta;
    if (remaining === 0 || remaining < MIN_DEBT_AFTER_HUB_WOLTTA_CM) {
      const max = maxWolttaForUser(whoIdx);
      return `Velkakaveri ei voi wolttaa koko velkaa. Enintään ${formatCm(max)} tällä hetkellä.`;
    }
  }

  return null;
}

function applyTransaction() {
  if (isViewOnlyUser()) {
    setError("Joni voi vain seurata velkaa — ei lisäystä eikä wolttaa.");
    return;
  }

  if (transactionMode() === "add") {
    const add = parsePositiveCm(els.txAddCm.value);
    if (add === null) {
      setError("Anna lisättävä velka cm:nä (positiivinen luku).");
      return;
    }
    setError("");
    state.flavorCm[selectedFlavor] = (state.flavorCm[selectedFlavor] ?? 0) + add;
    syncSharedDebtFromFlavors();
    els.txAddCm.value = "";
    renderTxAddPackages();
    saveState();
    enqueueWhatsAppNotify({
      type: "add",
      actor: activeUserName(),
      cm: add,
      flavor: flavorLabel(selectedFlavor),
    });
    renderSharedDebt();
    return;
  }

  const whoIdx = Number(els.txWolttaUser.value);
  const woltta = parsePositiveCm(els.txWolttaCm.value);

  if (!wolttaAllowedIndices().length) {
    setError("Ketään ei ole merkitty wolttajaksi — valitse asetuksista.");
    return;
  }

  if (woltta === null) {
    setError("Anna woltta cm:nä (positiivinen luku, esim. 7,5).");
    return;
  }

  const validationError = validateWoltta(whoIdx, woltta);
  if (validationError) {
    setError(validationError);
    return;
  }

  if (!deliveryAddressTrimmed()) {
    setError("Aseta toimitusosoite ennen wolttaa, jotta wolttaja tietää minne toimittaa.");
    return;
  }

  setError("");
  const flavorDebt = state.flavorCm[selectedFlavor] ?? 0;
  state.flavorCm[selectedFlavor] = Math.max(0, flavorDebt - woltta);
  syncSharedDebtFromFlavors();
  state.wolttaLog.push({ whoIndex: whoIdx, cm: woltta, flavor: selectedFlavor, at: Date.now() });
  if (state.wolttaLog.length > 20) state.wolttaLog = state.wolttaLog.slice(-20);

  els.txWolttaCm.value = "";
  saveState();
  enqueueWhatsAppNotify({
    type: "woltta",
    actor: state.names[whoIdx] ?? "—",
    cm: woltta,
    flavor: flavorLabel(selectedFlavor),
  });
  renderSharedDebt();
  renderWolttaLog();

  void copyDeliveryAddress();
}

function resetDebts() {
  if (isViewOnlyUser()) {
    setError("Joni ei voi tyhjentää velkaa.");
    return;
  }
  if (!confirm("Nollataanko yhteinen velka ja wolttahistoria?")) return;
  state.flavorCm = defaultFlavorCm();
  syncSharedDebtFromFlavors();
  state.wolttaLog = [];
  saveState();
  renderSharedDebt();
  renderWolttaLog();
}

els.names.forEach((input, i) => {
  input.addEventListener("change", () => {
    const name = input.value.trim() || `Kaveri ${i + 1}`;
    state.names[i] = name;
    saveState();
    fillDebtFriendSelect();
    fillActiveUserSelect();
    renderWolttaFlags();
    fillWolttaUserSelect();
    renderSharedDebt();
    renderWolttaLog();
    applyRoleUi();
  });
});

els.debtFriendIndex.addEventListener("change", () => {
  ensureDebtFriendIsJoni();
  saveState();
  fillDebtFriendSelect();
  fillWolttaUserSelect();
  renderSharedDebt();
});

els.activeUserIndex.addEventListener("change", () => {
  state.activeUserIndex = Number(els.activeUserIndex.value);
  saveState();
  setError("");
  applyRoleUi();
});

els.deliveryAddress.addEventListener("change", () => {
  if (!canEditDeliveryAddress()) {
    els.deliveryAddress.value = state.deliveryAddress;
    setError("Vain Aapo ja Jaakko voivat muuttaa toimitusosoitetta.");
    return;
  }
  state.deliveryAddress = els.deliveryAddress.value;
  saveState();
  renderDeliveryAddress();
  setError("");
});

els.deliveryAddress.addEventListener("input", () => {
  if (!canEditDeliveryAddress()) return;
  renderDeliveryAddress();
});

if (els.gramsPerPackage) {
  els.gramsPerPackage.addEventListener("change", () => {
    if (isViewOnlyUser()) return;
    const n = Number.parseFloat(String(els.gramsPerPackage.value).replace(",", "."));
    state.gramsPerPackage = Number.isFinite(n) && n > 0 ? n : DEFAULT_GRAMS_PER_PACKAGE;
    saveState();
    renderSharedDebt();
  });
}

els.txWolttaUser.addEventListener("change", updateWolttaHint);

els.txModeRadios.forEach((radio) => {
  radio.addEventListener("change", syncTxPanels);
});

els.btnCopyAddress.addEventListener("click", () => {
  void copyDeliveryAddress();
});

els.txAddCm.addEventListener("input", renderTxAddPackages);
if (els.btnTxAddPackage) {
  els.btnTxAddPackage.addEventListener("click", addOnePackageToTxAdd);
}
els.btnApplyTx.addEventListener("click", applyTransaction);
els.btnReset.addEventListener("click", resetDebts);

const userSetFromUrl = applyUserFromUrl();
const userSetFromDevice = !userSetFromUrl && applyUserFromDevice();
if (!userSetFromUrl && !userSetFromDevice && !isJoniLockedDevice() && isViewOnlyUser()) {
  const pick = activeUserSelectIndices();
  if (pick.length) state.activeUserIndex = pick[0];
}
if (userSetFromUrl || userSetFromDevice) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

initFirebase();
initFlavorPickers();
syncInputsFromState();
syncTxPanels();
renderSharedDebt();
renderWolttaLog();
renderTxAddPackages();
