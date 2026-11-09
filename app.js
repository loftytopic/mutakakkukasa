const PACKAGE_HEIGHT_CM = 2.5;
const MIN_DEBT_AFTER_HUB_WOLTTA_CM = 0.1;
const USER_COUNT = 3;
const STORAGE_KEY = "mutakakkukasa-v3";
const ADD_ONLY_NAMES = new Set(["joni"]);
const DEBT_FRIEND_NAME = "joni";
const DELIVERY_ADDRESS_EDITORS = new Set(["aapo", "jaakko"]);

const defaultState = () => ({
  names: ["Aapo", "Joni", "Jaakko"],
  debtFriendIndex: 0,
  activeUserIndex: 1,
  sharedDebtCm: 0,
  wolttaLog: [],
  deliveryAddress: "",
  canWoltta: [true, true, false],
});

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
  canWoltta = [0, 1, 2].map((i) => Boolean(canWoltta[i]));

  const names = (parsed.names ?? defaultState().names).slice(0, USER_COUNT);

  return {
    names,
    debtFriendIndex: indexOfDebtFriend(names),
    sharedDebtCm: Math.max(0, sharedDebtCm),
    wolttaLog: Array.isArray(parsed.wolttaLog) ? parsed.wolttaLog.slice(-20) : [],
    deliveryAddress: typeof parsed.deliveryAddress === "string" ? parsed.deliveryAddress : "",
    canWoltta,
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

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

/** Kirjanmerkki ?kuka=aapo — voittaa laitetunnistuksen. */
function applyUserFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("kuka") ?? params.get("user");
  if (!raw) return false;
  const idx = indexOfUserByName(raw);
  if (idx < 0) return false;
  state.activeUserIndex = idx;
  return true;
}

/** Joni = ainoa iOS-käyttäjä; Androidilla Aapo/Jaakko erotellaan muulla tavalla. */
function applyUserFromDevice() {
  if (!isIOS()) return false;
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
  return Boolean(cfg?.apiKey && cfg.apiKey !== "YOUR_API_KEY" && cfg.databaseURL);
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
  state.sharedDebtCm = merged.sharedDebtCm;
  state.wolttaLog = merged.wolttaLog;
  state.deliveryAddress = merged.deliveryAddress;
  state.canWoltta = merged.canWoltta;
}

function refreshUiFromState() {
  syncInputsFromState();
  renderSharedDebt();
  renderWolttaLog();
  renderMeasurement();
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
            dbRef.set(stateForCloud()).catch(() => setSyncStatus("online", "aloitustallennus epäonnistui"));
          }
          return;
        }
        applyingRemote = true;
        mergeCloudIntoState(cloud);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        applyingRemote = false;
        refreshUiFromState();
      },
      () => setSyncStatus("online", "yhteys katkesi")
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
  statSharedPackages: document.getElementById("stat-shared-packages"),
  stackHeight: document.getElementById("stack-height"),
  statPackages: document.getElementById("stat-packages"),
  btnAddPackage: document.getElementById("btn-add-package"),
  btnClearStack: document.getElementById("btn-clear-stack"),
  txAddCm: document.getElementById("tx-add-cm"),
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
  settingsSection: document.getElementById("settings-section"),
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

function isAddOnlyUser() {
  return ADD_ONLY_NAMES.has(activeUserName().toLowerCase());
}

function canEditDeliveryAddress() {
  return DELIVERY_ADDRESS_EDITORS.has(activeUserName().toLowerCase());
}

function applyAddOnlyUi() {
  const on = isAddOnlyUser();
  const canEditAddress = canEditDeliveryAddress();

  els.btnClearStack.hidden = on;
  els.btnReset.hidden = on;
  els.sharedDebtCm.readOnly = on;
  els.stackHeight.readOnly = on;
  if (els.txModeWolttaWrap) els.txModeWolttaWrap.hidden = on;

  els.deliveryAddress.readOnly = !canEditAddress;
  els.deliveryAddress.classList.toggle("is-locked", !canEditAddress);

  if (els.settingsSection) els.settingsSection.classList.toggle("hidden", on);

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
  fillDebtFriendSelect();
  fillSelect(els.activeUserIndex, state.names, state.activeUserIndex);
  renderWolttaFlags();
  fillWolttaUserSelect();
  renderDeliveryAddress();
  applyAddOnlyUi();
}

function renderSharedDebt() {
  const friend = debtFriendName();
  const debtors = debtorIndices().map((i) => state.names[i]);

  els.debtFriendLabel.textContent = `Velkakaveri: ${friend}`;
  els.debtorsLabel.textContent = `Yhteisvelalliset: ${debtors.join(" ja ")}`;

  els.sharedDebtCm.value = String(state.sharedDebtCm);
  const packs = packagesFromCm(state.sharedDebtCm);
  els.statSharedPackages.textContent = formatPackages(packs);

  if (state.sharedDebtCm > 0) {
    els.totalReceivable.hidden = false;
    els.totalReceivable.textContent = `Saatavaa: ${formatCm(state.sharedDebtCm)} · ${formatPackages(packs)}`;
  } else {
    els.totalReceivable.hidden = true;
    els.totalReceivable.textContent = "";
  }
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
        li.textContent = `${who} wolttasi ${formatCm(entry.cm)} (${formatPackages(packagesFromCm(entry.cm))})`;
        return li;
      })
  );
}

function currentStackCm() {
  const cm = parseCm(els.stackHeight.value);
  return cm !== null && cm >= 0 ? cm : 0;
}

function setStackCm(cm) {
  const rounded = Math.round(Math.max(0, cm) * 100) / 100;
  els.stackHeight.value = String(rounded);
  renderMeasurement();
}

function renderMeasurement() {
  const cm = currentStackCm();
  const packs = packagesFromCm(cm);
  els.statPackages.textContent = formatPackages(packs);
}

function addOnePackageToStack() {
  setStackCm(currentStackCm() + PACKAGE_HEIGHT_CM);
}

function clearStack() {
  if (isAddOnlyUser()) return;
  setStackCm(0);
}

function syncTxPanels() {
  const woltta = transactionMode() === "woltta";
  els.txPanelWoltta.classList.toggle("hidden", !woltta);
  els.txPanelAdd.classList.toggle("hidden", woltta);
  if (woltta) {
    renderDeliveryAddress();
    updateWolttaHint();
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

  if (woltta > state.sharedDebtCm) {
    return `Woltta (${formatCm(woltta)}) on suurempi kuin velka (${formatCm(state.sharedDebtCm)}).`;
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
  if (isAddOnlyUser() && transactionMode() === "woltta") {
    setError("Joni voi vain lisätä, ei wolttaa.");
    return;
  }

  if (transactionMode() === "add") {
    const add = parsePositiveCm(els.txAddCm.value);
    if (add === null) {
      setError("Anna lisättävä velka cm:nä (positiivinen luku).");
      return;
    }
    setError("");
    state.sharedDebtCm += add;
    els.txAddCm.value = "";
    saveState();
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
  state.sharedDebtCm = Math.max(0, state.sharedDebtCm - woltta);
  state.wolttaLog.push({ whoIndex: whoIdx, cm: woltta, at: Date.now() });
  if (state.wolttaLog.length > 20) state.wolttaLog = state.wolttaLog.slice(-20);

  els.txWolttaCm.value = "";
  saveState();
  renderSharedDebt();
  renderWolttaLog();

  void copyDeliveryAddress();
}

function resetDebts() {
  if (isAddOnlyUser()) {
    setError("Joni ei voi tyhjentää velkaa.");
    return;
  }
  if (!confirm("Nollataanko yhteinen velka ja wolttahistoria?")) return;
  state.sharedDebtCm = 0;
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
    fillSelect(els.activeUserIndex, state.names, state.activeUserIndex);
    renderWolttaFlags();
    fillWolttaUserSelect();
    renderSharedDebt();
    renderWolttaLog();
    applyAddOnlyUi();
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
  applyAddOnlyUi();
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

els.sharedDebtCm.addEventListener("change", () => {
  const val = parseCm(els.sharedDebtCm.value);
  if (val === null) {
    renderSharedDebt();
    return;
  }
  if (isAddOnlyUser() && val < state.sharedDebtCm) {
    setError("Joni voi vain lisätä velkaa — ei pienentää käsin.");
    renderSharedDebt();
    return;
  }
  state.sharedDebtCm = Math.max(0, val);
  saveState();
  renderSharedDebt();
});

els.txWolttaUser.addEventListener("change", updateWolttaHint);

els.txModeRadios.forEach((radio) => {
  radio.addEventListener("change", syncTxPanels);
});

els.btnCopyAddress.addEventListener("click", () => {
  void copyDeliveryAddress();
});

els.stackHeight.addEventListener("input", renderMeasurement);
els.btnAddPackage.addEventListener("click", addOnePackageToStack);
els.btnClearStack.addEventListener("click", clearStack);
els.btnApplyTx.addEventListener("click", applyTransaction);
els.btnReset.addEventListener("click", resetDebts);

const userSetFromUrl = applyUserFromUrl();
const userSetFromDevice = !userSetFromUrl && applyUserFromDevice();
if (userSetFromUrl || userSetFromDevice) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

initFirebase();
syncInputsFromState();
syncTxPanels();
renderSharedDebt();
renderWolttaLog();
renderMeasurement();
