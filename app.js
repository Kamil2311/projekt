/* =======================
   AUTH (frontend-only)
======================= */
const SESSION_KEY = "session_v1";

const USERS = [
  { name: "Admin 1", role: "admin", password: "DaGrasso54321" },
  { name: "Admin 2", role: "admin", password: "DaGrasso54321" },
  ...Array.from({ length: 13 }, (_, i) => ({
    name: `Konsultant ${i + 1}`,
    role: "worker",
    password: "DaGrasso123",
  })),
];

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}
function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
function isAdmin() {
  return loadSession()?.role === "admin";
}
function requireSession() {
  const s = loadSession();
  if (!s) showLogin(true);
  return s;
}

/* =======================
   MONTH SELECT
======================= */
const MONTHS = [
  { id: "01", label: "Styczeń" },
  { id: "02", label: "Luty" },
  { id: "03", label: "Marzec" },
  { id: "04", label: "Kwiecień" },
  { id: "05", label: "Maj" },
  { id: "06", label: "Czerwiec" },
  { id: "07", label: "Lipiec" },
  { id: "08", label: "Sierpień" },
  { id: "09", label: "Wrzesień" },
  { id: "10", label: "Październik" },
  { id: "11", label: "Listopad" },
  { id: "12", label: "Grudzień" },
];

const ACTIVE_MONTH_KEY = "active_month_v1";

function getActiveMonthId() {
  const raw = localStorage.getItem(ACTIVE_MONTH_KEY);
  return raw && MONTHS.some((m) => m.id === raw) ? raw : "01";
}
function setActiveMonthId(id) {
  localStorage.setItem(ACTIVE_MONTH_KEY, id);
}
function nextMonthId(curr) {
  const n = Number(curr);
  const next = n === 12 ? 1 : n + 1;
  return String(next).padStart(2, "0");
}

function renderMonthSelect() {
  const sel = document.getElementById("month-select");
  if (!sel) return;

  const active = getActiveMonthId();
  sel.innerHTML = "";

  MONTHS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    if (m.id === active) opt.selected = true;
    sel.appendChild(opt);
  });
}

document.getElementById("month-select")?.addEventListener("change", (e) => {
  const id = e.target.value;
  if (!MONTHS.some((m) => m.id === id)) return;

  setActiveMonthId(id);
  renderBoard();
});

/* =======================
   BOARD STATE (per month)
======================= */
const STORAGE_KEY = "grafik_boards_v3";
const DEFAULT_POOL_TITLE = "Godziny do wzięcia";
let dragState = { fromColId: null, cardId: null };

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function loadAllBoards() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveAllBoards(all) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

function initBoardState() {
  const poolId = uid();
  return {
    columns: [{ id: poolId, title: DEFAULT_POOL_TITLE, isPool: true }],
    cardsByColumn: { [poolId]: [] },
  };
}

function getBoardKey(monthId) {
  return `m${monthId}`;
}

function getOrInitBoard(monthId) {
  const all = loadAllBoards();
  const key = getBoardKey(monthId);
  if (!all[key]?.columns || !all[key]?.cardsByColumn) {
    all[key] = initBoardState();
    saveAllBoards(all);
  }
  return all[key];
}

function saveBoard(monthId, boardState) {
  const all = loadAllBoards();
  all[getBoardKey(monthId)] = boardState;
  saveAllBoards(all);
}

function ensureCardsArray(state, colId) {
  if (!state.cardsByColumn[colId]) state.cardsByColumn[colId] = [];
  return state.cardsByColumn[colId];
}

function getPoolColumn(state) {
  return state.columns.find((c) => c.isPool) || null;
}

function normalizeText(v, maxLen = 200) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/* =======================
   PRIORITY (drag lock)
======================= */
const PRIORITY_ORDER = { high: 3, medium: 2, low: 1 };

function highestPriorityInPool(state) {
  const pool = getPoolColumn(state);
  if (!pool) return null;
  const arr = ensureCardsArray(state, pool.id);
  let max = 0;
  for (const c of arr) max = Math.max(max, PRIORITY_ORDER[c.priority || "low"] || 1);
  if (max === 3) return "high";
  if (max === 2) return "medium";
  return "low";
}

function canDragCard(state, cardObj) {
  const top = highestPriorityInPool(state);
  if (!top) return true;
  const topVal = PRIORITY_ORDER[top] || 1;
  const myVal = PRIORITY_ORDER[cardObj.priority || "low"] || 1;
  return myVal >= topVal;
}

function prioLabel(p) {
  if (p === "high") return "Wysoki";
  if (p === "medium") return "Średni";
  return "Niski";
}

/* =======================
   UI HELPERS
======================= */
function clearDragUI() {
  document.querySelectorAll(".list.drag-over").forEach((el) => el.classList.remove("drag-over"));
  document.querySelectorAll(".cards.drag-over").forEach((el) => el.classList.remove("drag-over"));
  document.querySelectorAll(".card.drop-before").forEach((el) => el.classList.remove("drop-before"));
}

function createIconButton({ className, title, text }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.title = title;
  btn.textContent = text;
  btn.draggable = false;
  return btn;
}

function formatDyżur(card, monthId) {
  const dd = String(card.day ?? 1).padStart(2, "0");
  const dow = String(card.weekday || "").trim(); // np. "pon"
  const prefix = dow ? `${dow} ` : "";
  return `${prefix}${dd}.${monthId} ${card.hours || ""}`.trim();
}

/* =======================
   RENDER BOARD
======================= */
function createColumnElement(col, state, monthId) {
  const section = document.createElement("section");
  section.className = "list";
  section.dataset.colId = col.id;

  const header = document.createElement("div");
  header.className = "list__header";

  const titleWrap = document.createElement("div");

  const titleBtn = document.createElement("button");
  titleBtn.className = "list__title-btn";
  titleBtn.textContent = col.title;
  titleBtn.title = isAdmin() ? "Kliknij, aby zmienić nazwę" : "Brak uprawnień (tylko admin)";

  const hint = document.createElement("div");
  hint.className = "list__hint";
  hint.textContent = col.isPool ? "Tu dodajesz nowe dyżury (admin)" : "Przeciągnij dyżur";

  titleWrap.appendChild(titleBtn);
  titleWrap.appendChild(hint);

  const menuBtn = document.createElement("button");
  menuBtn.className = "icon-btn";
  menuBtn.textContent = "⋯";
  menuBtn.title = isAdmin() ? "Opcje (zmień nazwę / usuń)" : "Brak uprawnień (tylko admin)";

  header.appendChild(titleWrap);
  header.appendChild(menuBtn);

  const cards = document.createElement("div");
  cards.className = "cards";

  section.appendChild(header);
  section.appendChild(cards);

  const addBtn = document.createElement("button");
  addBtn.className = "add-card";
  addBtn.textContent = "+ Dodaj dyżur";
  if (!(isAdmin() && col.isPool)) addBtn.style.display = "none";

  section.appendChild(addBtn);

  const arr = ensureCardsArray(state, col.id);
  arr.forEach((cardObj, idx) => cards.appendChild(createCardElement(cardObj, col.id, idx, state, monthId)));

  return section;
}

function createCardElement(cardObj, colId, index, state, monthId) {
  const card = document.createElement("article");
  card.className = "card";
  card.draggable = true;

  card.dataset.colId = colId;
  card.dataset.index = String(index);
  card.dataset.cardId = cardObj.id;

  const top = document.createElement("div");
  top.className = "card__top";

  const title = document.createElement("div");
  title.className = "card__title";

  const pr = document.createElement("span");
  pr.className = `card__prio ${cardObj.priority || "low"}`;
  pr.textContent = prioLabel(cardObj.priority || "low");

  const t = document.createElement("span");
  t.textContent = formatDyżur(cardObj, monthId);

  title.appendChild(pr);
  title.appendChild(t);

  const actions = document.createElement("div");
  actions.className = "card__actions";

  const assigneeBtn = createIconButton({
    className: "card__icon card__assignee-btn",
    title: isAdmin() ? "Ustaw osobę przypisaną" : "Brak uprawnień (tylko admin)",
    text: "👤",
  });

  const commentBtn = createIconButton({
    className: "card__icon card__comment-btn",
    title: "Dodaj/edytuj komentarz",
    text: "💬",
  });

  const deleteBtn = createIconButton({
    className: "card__icon card__delete-btn",
    title: isAdmin() ? "Usuń kartę" : "Brak uprawnień (tylko admin)",
    text: "🗑️",
  });

  if (!isAdmin()) {
    assigneeBtn.style.display = "none";
    deleteBtn.style.display = "none";
  }

  actions.appendChild(assigneeBtn);
  actions.appendChild(commentBtn);
  actions.appendChild(deleteBtn);

  top.appendChild(title);
  top.appendChild(actions);
  card.appendChild(top);

  if (cardObj.assignee || cardObj.comment) {
    const meta = document.createElement("div");
    meta.className = "card__meta";

    if (cardObj.assignee) {
      const row = document.createElement("div");
      row.className = "card__meta-row";
      row.innerHTML = `<span class="card__meta-label">Osoba:</span><span class="card__meta-value"></span>`;
      row.querySelector(".card__meta-value").textContent = cardObj.assignee;
      meta.appendChild(row);
    }

    if (cardObj.comment) {
      const row = document.createElement("div");
      row.className = "card__meta-row";
      row.innerHTML = `<span class="card__meta-label">Komentarz:</span><span class="card__meta-value"></span>`;
      row.querySelector(".card__meta-value").textContent = cardObj.comment;
      meta.appendChild(row);
    }

    card.appendChild(meta);
  }

  card.addEventListener("dragstart", (e) => {
    const month = getActiveMonthId();
    const st = getOrInitBoard(month);

    const arr = ensureCardsArray(st, colId);
    const real = arr.find((c) => c.id === cardObj.id) || cardObj;

    if (!canDragCard(st, real)) {
      e.preventDefault();
      alert("Zablokowane: w „Godziny do wzięcia” są dyżury o wyższym priorytecie.");
      return;
    }

    card.classList.add("dragging");
    dragState = { fromColId: colId, cardId: cardObj.id };

    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    e.dataTransfer.setDragImage(img, 0, 0);

    clearDragUI();
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    dragState = { fromColId: null, cardId: null };
    clearDragUI();
  });

  return card;
}

function renderBoard() {
  const s = requireSession();
  if (!s) return;

  const badge = document.getElementById("session-badge");
  const newColBtn = document.getElementById("new-column");
  const logoutBtn = document.getElementById("logout");

  if (badge) badge.textContent = `${s.name} (${s.role === "admin" ? "Admin" : "Pracownik"})`;
  if (newColBtn) newColBtn.style.display = isAdmin() ? "" : "none";
  if (logoutBtn) logoutBtn.style.display = "";

  const monthId = getActiveMonthId();
  const state = getOrInitBoard(monthId);

  const board = document.getElementById("board");
  if (!board) return;

  board.innerHTML = "";
  state.columns.forEach((col) => board.appendChild(createColumnElement(col, state, monthId)));

  syncTopFiltersUI(monthId);
  applyTopFilters(monthId);
}

/* =======================
   LOGIN UI
======================= */
function showLogin(force = false) {
  const overlay = document.getElementById("login-overlay");
  const userSelect = document.getElementById("login-user");
  const passInput = document.getElementById("login-pass");

  if (!overlay || !userSelect || !passInput) return;

  if (!userSelect.options.length) {
    USERS.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u.name;
      opt.textContent = u.name;
      userSelect.appendChild(opt);
    });
  }

  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
  passInput.value = "";
  passInput.focus();

  if (!force) return;
}

document.getElementById("login-btn")?.addEventListener("click", () => {
  const userSelect = document.getElementById("login-user");
  const passInput = document.getElementById("login-pass");
  const overlay = document.getElementById("login-overlay");

  const chosenName = userSelect.value;
  const pass = passInput.value;

  const user = USERS.find((u) => u.name === chosenName);
  if (!user) return alert("Nie znaleziono użytkownika.");
  if (pass !== user.password) return alert("Złe hasło.");

  saveSession({ name: user.name, role: user.role });

  overlay.classList.remove("show");
  overlay.setAttribute("aria-hidden", "true");

  renderMonthSelect();
  renderBoard();
});

document.getElementById("logout")?.addEventListener("click", () => {
  clearSession();
  showLogin(true);
});

/* =======================
   ADMIN – new column + rename + add duty
======================= */
document.getElementById("new-column")?.addEventListener("click", () => {
  if (!isAdmin()) return;

  const monthId = getActiveMonthId();
  const state = getOrInitBoard(monthId);

  const title = prompt("Nazwa nowej kolumny:");
  if (!title || !title.trim()) return;

  const newColId = uid();
  state.columns.push({ id: newColId, title: title.trim(), isPool: false });
  state.cardsByColumn[newColId] = [];
  saveBoard(monthId, state);

  renderBoard();
});

document.addEventListener("click", (e) => {
  const titleBtn = e.target.closest(".list__title-btn");
  if (!titleBtn || !isAdmin()) return;

  const listEl = e.target.closest(".list");
  const colId = listEl?.dataset.colId;
  if (!colId) return;

  const monthId = getActiveMonthId();
  const state = getOrInitBoard(monthId);
  const col = state.columns.find((c) => c.id === colId);
  if (!col) return;

  const newTitle = prompt("Zmień nazwę kolumny:", col.title);
  if (newTitle === null) return;

  const cleaned = newTitle.trim();
  if (!cleaned) return;

  col.title = cleaned;
  saveBoard(monthId, state);
  renderBoard();
});

/* ✅ MENU ⋯: usuń kolumnę (admin) */
document.addEventListener("click", (e) => {
  const menuBtn = e.target.closest(".icon-btn");
  if (!menuBtn) return;

  const listEl = e.target.closest(".list");
  const colId = listEl?.dataset.colId;
  if (!colId) return;

  if (!isAdmin()) return;

  const monthId = getActiveMonthId();
  const state = getOrInitBoard(monthId);
  const col = state.columns.find((c) => c.id === colId);
  if (!col) return;

  if (col.isPool) {
    alert("Nie można usunąć kolumny „Godziny do wzięcia”.");
    return;
  }

  const ok = confirm(
    `Usunąć kolumnę „${col.title}”?\n\nDyżury z tej kolumny zostaną przeniesione do „Godziny do wzięcia”.`
  );
  if (!ok) return;

  const pool = getPoolColumn(state);
  if (pool) {
    const fromArr = ensureCardsArray(state, colId);
    const poolArr = ensureCardsArray(state, pool.id);
    poolArr.push(...fromArr);
  }

  state.columns = state.columns.filter((c) => c.id !== colId);
  delete state.cardsByColumn[colId];

  saveBoard(monthId, state);
  renderBoard();
});

document.addEventListener("click", (e) => {
  const addBtn = e.target.closest(".add-card");
  if (!addBtn || !isAdmin()) return;

  const listEl = e.target.closest(".list");
  const colId = listEl?.dataset.colId;
  if (!colId) return;

  const monthId = getActiveMonthId();
  const state = getOrInitBoard(monthId);
  const col = state.columns.find((c) => c.id === colId);
  if (!col || !col.isPool) return;

  const dayRaw = prompt("Dzień miesiąca (1–31):", "1");
  if (dayRaw === null) return;
  const day = Number(dayRaw);
  if (!Number.isFinite(day) || day < 1 || day > 31) return alert("Zły dzień.");

  let weekday = prompt("Dzień tygodnia (skrót, np. pon / wt / śr / czw / pt / sob / nd):", "pon");
  if (weekday === null) return;
  weekday = normalizeText(weekday, 5).toLowerCase();

  const hours = prompt("Godziny (np. 12:00-20:00):", "12:00-20:00");
  if (!hours || !hours.trim()) return;

  let pr = prompt("Priorytet: high / medium / low", "medium");
  if (pr === null) return;
  pr = String(pr).trim().toLowerCase();
  if (!["high", "medium", "low"].includes(pr)) return alert("Zły priorytet.");

  ensureCardsArray(state, colId).push({
    id: uid(),
    day,
    weekday,
    hours: hours.trim(),
    priority: pr,
    assignee: "",
    comment: "",
  });

  saveBoard(monthId, state);
  renderBoard();
});

/* =======================
   DRAG & DROP
======================= */
function getInsertIndex(cardsEl, mouseY) {
  const cardEls = [...cardsEl.querySelectorAll(".card:not(.dragging)")];
  let closest = { offset: Number.NEGATIVE_INFINITY, index: cardEls.length };

  cardEls.forEach((cardEl, idx) => {
    const rect = cardEl.getBoundingClientRect();
    const offset = mouseY - (rect.top + rect.height / 2);
    if (offset < 0 && offset > closest.offset) closest = { offset, index: idx };
  });

  return closest.index;
}

function highlightDropPosition(cardsEl, insertIndex) {
  document.querySelectorAll(".card.drop-before").forEach((el) => el.classList.remove("drop-before"));
  const cardEls = [...cardsEl.querySelectorAll(".card:not(.dragging)")];
  const target = cardEls[insertIndex];
  if (target) target.classList.add("drop-before");
}

document.addEventListener("dragover", (e) => {
  const listEl = e.target.closest(".list");
  if (!listEl) return;

  e.preventDefault();
  clearDragUI();

  listEl.classList.add("drag-over");

  const cardsEl = listEl.querySelector(".cards");
  if (!cardsEl) return;

  cardsEl.classList.add("drag-over");
  highlightDropPosition(cardsEl, getInsertIndex(cardsEl, e.clientY));
});

document.addEventListener("drop", (e) => {
  const listEl = e.target.closest(".list");
  if (!listEl) return;

  e.preventDefault();
  clearDragUI();

  const toColId = listEl.dataset.colId;
  const { fromColId, cardId } = dragState;
  if (!toColId || !fromColId || !cardId) return;

  const monthId = getActiveMonthId();
  const state = getOrInitBoard(monthId);

  const fromArr = ensureCardsArray(state, fromColId);
  const toArr = ensureCardsArray(state, toColId);

  const fromIndex = fromArr.findIndex((c) => c.id === cardId);
  if (fromIndex === -1) return;

  const moved = fromArr[fromIndex];
  if (!canDragCard(state, moved)) {
    alert("Zablokowane przez priorytety w „Godziny do wzięcia”.");
    return;
  }

  const [obj] = fromArr.splice(fromIndex, 1);

  const cardsEl = listEl.querySelector(".cards");
  const insertIndex = cardsEl ? getInsertIndex(cardsEl, e.clientY) : toArr.length;
  const finalIndex = fromColId === toColId && insertIndex > fromIndex ? insertIndex - 1 : insertIndex;

  toArr.splice(finalIndex, 0, obj);

  saveBoard(monthId, state);
  renderBoard();
});

/* =======================
   CARD ACTIONS (assignee / comment / delete)
======================= */
function findCardInState(state, cardId) {
  for (const col of state.columns) {
    const arr = ensureCardsArray(state, col.id);
    const idx = arr.findIndex((c) => c.id === cardId);
    if (idx !== -1) return { colId: col.id, arr, idx, card: arr[idx] };
  }
  return null;
}

document.addEventListener("click", (e) => {
  const commentBtn = e.target.closest(".card__comment-btn");
  const assigneeBtn = e.target.closest(".card__assignee-btn");
  const deleteBtn = e.target.closest(".card__delete-btn");

  if (!commentBtn && !assigneeBtn && !deleteBtn) return;

  const cardEl = e.target.closest(".card");
  if (!cardEl) return;

  const cardId = cardEl.dataset.cardId;
  if (!cardId) return;

  const monthId = getActiveMonthId();
  const state = getOrInitBoard(monthId);
  const found = findCardInState(state, cardId);
  if (!found) return;

  if (commentBtn) {
    const current = found.card.comment || "";
    const next = prompt("Komentarz do dyżuru:", current);
    if (next === null) return;

    found.card.comment = normalizeText(next, 300);
    saveBoard(monthId, state);
    renderBoard();
    return;
  }

  if (assigneeBtn) {
    if (!isAdmin()) return;

    const current = found.card.assignee || "";
    const next = prompt("Osoba przypisana (np. imię/nick):", current);
    if (next === null) return;

    found.card.assignee = normalizeText(next, 60);
    saveBoard(monthId, state);
    renderBoard();
    return;
  }

  if (deleteBtn) {
    if (!isAdmin()) return;

    const ok = confirm("Usunąć ten dyżur?");
    if (!ok) return;

    found.arr.splice(found.idx, 1);
    saveBoard(monthId, state);
    renderBoard();
    return;
  }
});

/* =======================
   TOP FILTERS (górny pasek)
   Filtr: priorytet + dzień miesiąca (od/do)
   (używa istniejących ID w HTML)
======================= */
function topFiltersKey(monthId) {
  return `top_filters_v2_${monthId}`;
}

function loadTopFilters(monthId) {
  try {
    return JSON.parse(localStorage.getItem(topFiltersKey(monthId)) || "{}");
  } catch {
    return {};
  }
}

function saveTopFilters(monthId, f) {
  localStorage.setItem(topFiltersKey(monthId), JSON.stringify(f));
}

function syncTopFiltersUI(monthId) {
  const f = loadTopFilters(monthId);

  const pr = document.getElementById("filter-priority");
  const min = document.getElementById("filter-start-min");
  const max = document.getElementById("filter-start-max");

  if (pr) pr.value = f.priority || "all";
  if (min) min.value = f.dayMin ?? "";
  if (max) max.value = f.dayMax ?? "";
}

function applyTopFilters(monthId) {
  const state = getOrInitBoard(monthId);
  const pool = getPoolColumn(state);
  if (!pool) return;

  const f = loadTopFilters(monthId);
  const prio = f.priority || "all";
  const dayMin = f.dayMin === "" || f.dayMin == null ? null : Number(f.dayMin);
  const dayMax = f.dayMax === "" || f.dayMax == null ? null : Number(f.dayMax);

  const poolListEl = document.querySelector(`.list[data-col-id="${pool.id}"]`);
  if (!poolListEl) return;

  const poolArr = ensureCardsArray(state, pool.id);

  poolListEl.querySelectorAll(".card").forEach((cardEl) => {
    const cardId = cardEl.dataset.cardId;
    const cardObj = poolArr.find((c) => c.id === cardId);
    if (!cardObj) return;

    let ok = true;

    if (prio !== "all") ok = ok && cardObj.priority === prio;

    const d = Number(cardObj.day);
    if (dayMin != null && Number.isFinite(dayMin)) ok = ok && d >= dayMin;
    if (dayMax != null && Number.isFinite(dayMax)) ok = ok && d <= dayMax;

    cardEl.style.display = ok ? "" : "none";
  });
}

document.getElementById("filter-priority")?.addEventListener("change", (e) => {
  const monthId = getActiveMonthId();
  const f = loadTopFilters(monthId);
  f.priority = e.target.value;
  saveTopFilters(monthId, f);
  applyTopFilters(monthId);
});

document.getElementById("filter-start-min")?.addEventListener("input", (e) => {
  const monthId = getActiveMonthId();
  const f = loadTopFilters(monthId);
  f.dayMin = e.target.value;
  saveTopFilters(monthId, f);
  applyTopFilters(monthId);
});

document.getElementById("filter-start-max")?.addEventListener("input", (e) => {
  const monthId = getActiveMonthId();
  const f = loadTopFilters(monthId);
  f.dayMax = e.target.value;
  saveTopFilters(monthId, f);
  applyTopFilters(monthId);
});

document.getElementById("filter-clear")?.addEventListener("click", () => {
  const monthId = getActiveMonthId();
  saveTopFilters(monthId, { priority: "all", dayMin: "", dayMax: "" });
  syncTopFiltersUI(monthId);
  renderBoard();
});

/* =======================
   COPY COLUMNS -> NEXT MONTH
======================= */
document.getElementById("copy-cols-next")?.addEventListener("click", () => {
  if (!isAdmin()) return alert("Tylko admin może kopiować kolumny.");

  const fromMonthId = getActiveMonthId();
  const toMonthId = nextMonthId(fromMonthId);

  const fromState = getOrInitBoard(fromMonthId);

  const ok = confirm(
    `Skopiować UKŁAD KOLUMN z ${fromMonthId} do ${toMonthId}?\n` +
      `To skopiuje tylko kolumny (bez dyżurów) i nadpisze układ kolumn w następnym miesiącu.`
  );
  if (!ok) return;

  const newPoolId = uid();
  const newColumns = [{ id: newPoolId, title: DEFAULT_POOL_TITLE, isPool: true }];
  const newCardsByColumn = { [newPoolId]: [] };

  fromState.columns
    .filter((c) => !c.isPool)
    .forEach((c) => {
      const newId = uid();
      newColumns.push({ id: newId, title: c.title, isPool: false });
      newCardsByColumn[newId] = [];
    });

  const nextState = { columns: newColumns, cardsByColumn: newCardsByColumn };
  saveBoard(toMonthId, nextState);

  setActiveMonthId(toMonthId);
  renderMonthSelect();
  renderBoard();

  alert("Skopiowano kolumny do następnego miesiąca ✅");
});

/* =======================
   START
======================= */
(function init() {
  const session = loadSession();
  const overlay = document.getElementById("login-overlay");
  const logoutBtn = document.getElementById("logout");

  renderMonthSelect();

  if (!session) {
    overlay?.classList.add("show");
    overlay?.setAttribute("aria-hidden", "false");
    if (logoutBtn) logoutBtn.style.display = "none";
  } else {
    overlay?.classList.remove("show");
    overlay?.setAttribute("aria-hidden", "true");
  }

  renderBoard();
})();
