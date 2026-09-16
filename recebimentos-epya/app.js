import {
  DEFAULT_CATEGORIES,
  OWNER_EMAIL,
  TARGET_SLEEPERS,
} from "./app-config.js";

const app = document.querySelector("#app");
const GITHUB_PAGES_MODE = window.location.hostname.endsWith("github.io");
const INITIAL_RECOVERY_MODE = new URLSearchParams(String(window.location.hash || "").slice(1)).get("type") === "recovery";
const ADMIN_ACCESS_MODE = new URLSearchParams(window.location.search).get("admin") === "1" || INITIAL_RECOVERY_MODE;
const PUBLIC_LINK_MODE = !ADMIN_ACCESS_MODE;
const SUPABASE_URL = "https://raaridhgnjrbmvrxdmtu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ziP1cObIqUagG2opAALnGw_5ncCXDEg";
const supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
const STORAGE_KEY = "epya-recebimentos-v5";
const OUTBOX_KEY = "epya-recebimentos-outbox-v2";
const THEME_KEY = "epya-recebimentos-theme";
const AUTH_CACHE_KEY = "epya-recebimentos-access-v2";
const CATEGORY_KEY = "epya-recebimentos-categories-v1";
const REJECTION_REASON_KEY = "epya-recebimentos-rejection-reasons-v1";
const LOCATION_KEY = "epya-recebimentos-locations-v1";
const GOAL_KEY = "epya-recebimentos-goals-v1";
const GOAL_OUTBOX_KEY = "epya-recebimentos-goals-outbox-v1";
const PHOTO_BUCKET = "recebimento-nf-photos";
const MAX_INVOICE_PHOTOS = 6;
const pendingPhotoFiles = new Map();
const photoUrls = new Map();
const requestedView = new URLSearchParams(window.location.search).get("view");
const CONTROL_OWNER = "Darci de Brum";

const RAIL_QUALITY_CATEGORIES = [
  { id: "trilho-empenamento", label: "Empenamento ou torção", color: "#39b8ff" },
  { id: "trilho-oxidacao", label: "Oxidação ou corrosão", color: "#ef8d32" },
  { id: "trilho-boleto", label: "Danos no boleto", color: "#806bff" },
  { id: "trilho-alma", label: "Danos na alma", color: "#15b7a5" },
  { id: "trilho-patim", label: "Danos no patim", color: "#9cbf33" },
  { id: "trilho-reprovados", label: "Trilhos reprovados", color: "#ec5f78" },
];

const MATERIALS = {
  dormente: { label: "Dormentes", singular: "Dormente", unit: "un", color: "#f4c914" },
  trilho: { label: "Trilhos", singular: "Trilho", unit: "barras", color: "#39b8ff" },
};

const PERA_WARNING_START = 14000;
const PERA_FIRST_MILESTONE = 15000;
const PERA_FINAL_MILESTONE = 20000;

const state = {
  view: ["dashboard", "form", "history", "quality", "rejections", "reports"].includes(requestedView)
    ? requestedView
    : "dashboard",
  records: [],
  categories: readCategories(),
  rejectionReasons: readRejectionReasons(),
  draft: null,
  editingId: "",
  editingInvoiceIndex: -1,
  loading: true,
  authLoading: true,
  authenticated: false,
  authorized: false,
  user: null,
  authMessage: "",
  recoveryMode: !PUBLIC_LINK_MODE && INITIAL_RECOVERY_MODE,
  team: [],
  teamLoaded: false,
  online: navigator.onLine,
  storageMode: "cloud",
  pendingSync: 0,
  installPrompt: null,
  theme: localStorage.getItem(THEME_KEY) || "light",
  tvMode: false,
  modal: null,
  reportImages: [],
  reportTextDraft: "",
  nfQualityFilter: "",
  dashboardTab: "overview",
  dashboardLocation: "",
  locations: [],
  goals: readGoals(),
  saving: false,
  photoBusy: false,
  includeInvoicePhotos: false,
  newLocationMode: false,
  historyFilters: { search: "", material: "todos", from: "", to: "", pending: false },
  reportFilters: { from: "2026-08-18", to: "2026-08-24", material: "dormente", location: "" },
  rejectionFilters: { search: "", location: "", reason: "", from: "", to: "" },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function number(value) {
  return Math.max(0, Number.parseInt(value, 10) || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(number(value));
}

function todayInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatShortDate(value) {
  if (!value) return "—";
  const [, month, day] = String(value).slice(0, 10).split("-");
  return `${day}/${month}`;
}

function readCategories() {
  try {
    const stored = JSON.parse(localStorage.getItem(CATEGORY_KEY) || "null");
    return Array.isArray(stored) && stored.length ? stored : structuredClone(DEFAULT_CATEGORIES);
  } catch {
    return structuredClone(DEFAULT_CATEGORIES);
  }
}

function saveCategoriesLocal() {
  localStorage.setItem(CATEGORY_KEY, JSON.stringify(state.categories));
}

function readRejectionReasons() {
  try {
    const stored = JSON.parse(localStorage.getItem(REJECTION_REASON_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveRejectionReasonsLocal() {
  localStorage.setItem(REJECTION_REASON_KEY, JSON.stringify(state.rejectionReasons));
}

function defaultGoals() {
  return [{ id: "meta-contrato-dormentes", title: "Meta contratual de dormentes", material: "dormente", target: TARGET_SLEEPERS, location: "", startDate: "", dueDate: "", createdAt: "2026-01-01T00:00:00.000Z" }];
}

function normalizeGoal(goal) {
  return {
    id: String(goal?.id || `meta-${crypto.randomUUID()}`),
    title: String(goal?.title || "Meta sem nome").trim(),
    material: goal?.material === "trilho" ? "trilho" : "dormente",
    target: number(goal?.target ?? goal?.target_quantity),
    location: String(goal?.location || "").trim(),
    startDate: String(goal?.startDate ?? goal?.start_date ?? ""),
    dueDate: String(goal?.dueDate ?? goal?.due_date ?? ""),
    createdAt: String(goal?.createdAt ?? goal?.created_at ?? new Date().toISOString()),
  };
}

function readGoals() {
  try {
    const raw = localStorage.getItem(GOAL_KEY);
    if (raw === null) return defaultGoals();
    const goals = JSON.parse(raw);
    return Array.isArray(goals) ? goals.map(normalizeGoal).filter((goal) => goal.target > 0) : defaultGoals();
  } catch {
    return defaultGoals();
  }
}

function saveGoalsLocal() {
  localStorage.setItem(GOAL_KEY, JSON.stringify(state.goals));
}

function readGoalOutbox() {
  try {
    const stored = JSON.parse(localStorage.getItem(GOAL_OUTBOX_KEY) || "null");
    return { upserts: Array.isArray(stored?.upserts) ? stored.upserts.map(normalizeGoal) : [], deletes: Array.isArray(stored?.deletes) ? stored.deletes.map(String) : [] };
  } catch {
    return { upserts: [], deletes: [] };
  }
}

function writeGoalOutbox(changes) {
  localStorage.setItem(GOAL_OUTBOX_KEY, JSON.stringify(changes));
}

function qualityCategories(material) {
  return material === "trilho" ? RAIL_QUALITY_CATEGORIES : state.categories;
}

function blankQuality(material) {
  return Object.fromEntries(qualityCategories(material).map((category) => [category.id, 0]));
}

function blankInvoiceItem(material) {
  return { id: crypto.randomUUID(), number: "", quantity: "", quality: blankQuality(material), photos: [] };
}

function defaultDraft(material = "dormente") {
  return {
    id: "",
    status: "concluido",
    material,
    receivedDate: todayInput(),
    receivedTime: nowTime(),
    timeKnown: true,
    location: "",
    supplier: material === "dormente" ? "Cavan / Arauco" : "Arauco",
    vehiclePlate: "",
    inspectorName: CONTROL_OWNER,
    invoiceItems: [blankInvoiceItem(material)],
    quality: Object.fromEntries([...state.categories, ...RAIL_QUALITY_CATEGORIES].map((category) => [category.id, 0])),
    rejections: [],
    observations: "",
    _cleanupMolde57Cav1: true,
  };
}

function normalizeMaterialSupplier(record) {
  if (!record || record.material !== "trilho" || !/\bcavan\b/i.test(record.supplier || "")) return record;
  const supplier = String(record.supplier).replace(/\bcavan\b/gi, "").replace(/^[\s/,&;+|–—-]+|[\s/,&;+|–—-]+$/g, "").trim();
  return { ...record, supplier: supplier || "Arauco" };
}

function locationKey(location) {
  const label = String(location || "").trim().replace(/\s+/g, " ");
  return label ? `local:${label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")}` : "missing";
}

function locationGroups(records = state.records) {
  const groups = new Map();
  records.forEach((record) => {
    const key = locationKey(record.location);
    if (!groups.has(key)) groups.set(key, { key, label: String(record.location || "").trim().replace(/\s+/g, " ") || "Local não informado", records: [] });
    groups.get(key).records.push(record);
  });
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
}

function reportLocationLabel() {
  return locationGroups().find((group) => group.key === state.reportFilters.location)?.label || (state.reportFilters.location ? "Local não informado" : "Todos os locais");
}

function renderLocationOptions(selected = "") {
  return `<option value="">Todos os locais</option>${locationGroups().map((group) => `<option value="${escapeHtml(group.key)}" ${group.key === selected ? "selected" : ""}>${escapeHtml(group.label)}</option>`).join("")}`;
}

function renderGoalLocationOptions() {
  return `<option value="">Todos os locais</option>${knownLocations().map((label) => `<option value="${escapeHtml(locationKey(label))}">${escapeHtml(label)}</option>`).join("")}`;
}

function invoiceItems(record) {
  if (Array.isArray(record.invoiceItems) && record.invoiceItems.length) return record.invoiceItems;
  const invoices = String(record.invoiceNumbers || "").split(/[;,\n]+/).map((item) => item.trim()).filter(Boolean);
  if (!invoices.length) return [];
  const each = Math.floor(number(record.quantity) / invoices.length);
  return invoices.map((item, index) => ({
    number: item,
    quantity: index === invoices.length - 1 ? number(record.quantity) - each * (invoices.length - 1) : each,
  }));
}

function invoiceQuality(record, item, index = 0) {
  if (item?.quality && typeof item.quality === "object") return item.quality;
  return index === 0 ? (record.quality || {}) : {};
}

function sleeperQualitySummary(quality = {}) {
  return {
    smallBreaks: number(quality["pequenas-quebras"]),
    repaired: number(quality.reparados),
    bubbles: number(quality.bolhas),
    breaks: number(quality.quebras),
    rejected: number(quality.reprovados),
  };
}

function railQualitySummary(quality = {}) {
  return {
    bending: number(quality["trilho-empenamento"]),
    oxidation: number(quality["trilho-oxidacao"]),
    head: number(quality["trilho-boleto"]),
    web: number(quality["trilho-alma"]),
    foot: number(quality["trilho-patim"]),
    rejected: number(quality["trilho-reprovados"]),
  };
}

function rejectionRows(record) {
  const existing = Array.isArray(record?.rejections) ? record.rejections : [];
  const target = Math.max(existing.length, number(record?.quality?.reprovados ?? record?.rejected));
  return Array.from({ length: target }, (_, index) => ({
    id: existing[index]?.id || crypto.randomUUID(),
    invoiceNumber: String(existing[index]?.invoiceNumber || ""),
    mold: String(existing[index]?.mold || ""),
    cavity: String(existing[index]?.cavity || ""),
    reasonId: String(existing[index]?.reasonId || ""),
    reason: String(existing[index]?.reason || ""),
  }));
}

function rejectionsForInvoice(record, invoiceNumber) {
  return rejectionRows(record).filter((rejection) => rejection.invoiceNumber === String(invoiceNumber));
}

function rejectionDetails(record, invoiceNumber) {
  return rejectionsForInvoice(record, invoiceNumber).map((rejection) => {
    const reason = rejection.reason || state.rejectionReasons.find((item) => item.id === rejection.reasonId)?.label || "motivo pendente";
    return `Molde ${rejection.mold || "—"} / Cavidade ${rejection.cavity || "—"} — ${reason}`;
  }).join(" | ");
}

function reconcileInvoiceQuality(record) {
  if (!Array.isArray(record.invoiceItems) || !record.invoiceItems.length) return record;
  const categories = qualityCategories(record.material);
  const originalItems = record.invoiceItems;
  record.invoiceItems = originalItems.map((item) => ({ ...item, quality: { ...blankQuality(record.material), ...(item.quality || {}) } }));
  categories.forEach((category) => {
    const hasPerInvoiceValue = originalItems.some((item) => Object.prototype.hasOwnProperty.call(item.quality || {}, category.id));
    if (!hasPerInvoiceValue) record.invoiceItems[0].quality[category.id] = number(record.quality?.[category.id]);
  });
  if (record.material === "dormente") {
    const rejections = Array.isArray(record.rejections) ? record.rejections : [];
    if (rejections.length) {
      record.invoiceItems.forEach((item) => { item.quality.reprovados = rejections.filter((rejection) => rejection.invoiceNumber === String(item.number)).length; });
      const unassigned = rejections.filter((rejection) => !rejection.invoiceNumber).length;
      if (unassigned) record.invoiceItems[0].quality.reprovados += unassigned;
    }
  }
  record.quality = { ...(record.quality || {}) };
  categories.forEach((category) => {
    record.quality[category.id] = record.invoiceItems.reduce((sum, item) => sum + number(item.quality?.[category.id]), 0);
  });
  return record;
}

function recordQuantity(record) {
  const items = invoiceItems(record);
  return items.length ? items.reduce((sum, item) => sum + number(item.quantity), 0) : number(record.quantity);
}

function qualityRejected(record) {
  return record.material === "trilho"
    ? number(record.quality?.["trilho-reprovados"] ?? record.rejected)
    : number(record.quality?.reprovados ?? record.rejected);
}

function qualityOccurrences(record) {
  return qualityCategories(record.material).reduce((sum, category) => sum + number(record.quality?.[category.id]), 0);
}

function metrics(records = state.records) {
  const dorm = records.filter((record) => record.material === "dormente");
  const rail = records.filter((record) => record.material === "trilho");
  const sleepers = dorm.reduce((sum, record) => sum + recordQuantity(record), 0);
  const rails = rail.reduce((sum, record) => sum + recordQuantity(record), 0);
  const sleeperNfs = dorm.reduce((sum, record) => sum + invoiceItems(record).length, 0);
  const railNfs = rail.reduce((sum, record) => sum + invoiceItems(record).length, 0);
  const rejected = dorm.reduce((sum, record) => sum + qualityRejected(record), 0);
  const repaired = dorm.reduce((sum, record) => sum + number(record.quality?.reparados), 0);
  const sleeperOccurrences = dorm.reduce((sum, record) => sum + qualityOccurrences(record), 0);
  const railRejected = rail.reduce((sum, record) => sum + qualityRejected(record), 0);
  const railOccurrences = rail.reduce((sum, record) => sum + qualityCategories("trilho").reduce((total, category) => total + number(record.quality?.[category.id]), 0), 0);
  const peraSleepers = dorm
    .filter((record) => String(record.location || "").trim().toLocaleLowerCase("pt-BR") === "pera")
    .reduce((sum, record) => sum + recordQuantity(record), 0);
  return {
    sleepers,
    rails,
    sleeperNfs,
    railNfs,
    totalNfs: sleeperNfs + railNfs,
    remaining: Math.max(0, TARGET_SLEEPERS - sleepers),
    progress: Math.min(100, (sleepers / TARGET_SLEEPERS) * 100),
    rejected,
    repaired,
    sleeperOccurrences,
    railRejected,
    railOccurrences,
    peraSleepers,
    records: records.length,
  };
}

function materialBadge(material) {
  const info = MATERIALS[material] || MATERIALS.dormente;
  return `<span class="material-badge ${material}"><i></i>${info.label}</span>`;
}

function canEdit() {
  return state.authorized && state.user?.role === "admin";
}

function navButton(view, label, icon) {
  return `<button class="nav-button ${state.view === view ? "active" : ""}" data-nav="${view}"><span aria-hidden="true">${icon}</span><b>${label}</b></button>`;
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  document.body.classList.toggle("tv-mode", state.tvMode);
  if (!PUBLIC_LINK_MODE && (state.recoveryMode || state.authLoading || !state.user || !state.authorized)) {
    app.innerHTML = renderAccessScreen();
    bindAccessEvents();
    return;
  }
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar no-print">
        <button class="brand-lockup" data-nav="dashboard" aria-label="Abrir painel EPYA"><img src="./epya-logo-oficial.png" alt="EPYA" /><span><strong>Recebimentos</strong><small>Controle diário de materiais</small></span></button>
        <nav class="main-nav" aria-label="Navegação principal">${navButton("dashboard", "Painel", "▦")}${canEdit() ? navButton("form", "Lançar", "+") : ""}${navButton("history", "Histórico", "⌕")}${navButton("quality", "Qualidade", "◇")}${navButton("rejections", "Reprovados", "!")}${navButton("reports", "Relatórios", "▤")}${!PUBLIC_LINK_MODE && state.user.role === "admin" ? navButton("team", "Acessos", "◎") : ""}</nav>
        <div class="top-actions"><button class="status-pill ${state.online ? "online" : "offline"}" data-install><i></i>${state.online ? "Online" : "Offline"}${state.pendingSync ? ` • ${state.pendingSync}` : ""}</button><button class="icon-button" data-theme-toggle title="Alternar tema" aria-label="Alternar tema">${state.theme === "dark" ? "☀" : "◐"}</button><button class="button button-dark compact" data-tv-toggle>Modo TV</button><span class="control-owner-chip"><i>DB</i><span><small class="control-motto">Qualidade é compromisso.</small><small>Responsável pelo controle</small><strong>${CONTROL_OWNER}</strong></span></span>${PUBLIC_LINK_MODE ? '<button class="user-chip" type="button" data-admin-access title="Abrir acesso administrativo"><strong>Modo consulta</strong><small>Entrar para lançar</small></button>' : `<button class="user-chip" type="button" data-sign-out title="Sair" aria-label="Sair do sistema"><strong>${escapeHtml(state.user.fullName || state.user.email.split("@")[0])}</strong><small>${state.user.role === "admin" ? "Administrador" : state.user.role === "viewer" ? "Consulta" : "Operação"}</small></button>`}</div>
      </header>
      <main class="app-main">${renderCurrentView()}</main>
      <footer class="mobile-nav no-print">${navButton("dashboard", "Painel", "▦")}${canEdit() ? navButton("form", "Lançar", "+") : ""}${navButton("history", "Histórico", "⌕")}${navButton("quality", "Qualidade", "◇")}${navButton("rejections", "Reprov.", "!")}${navButton("reports", "Relatórios", "▤")}</footer>
      ${state.tvMode ? '<button class="exit-tv no-print" data-tv-toggle>Sair do modo TV</button>' : ""}
      ${renderModal()}<div class="toast" role="status" aria-live="polite"></div>
    </div>`;
  bindEvents();
  void loadVisiblePhotos();
}

function renderAccessScreen() {
  const unauthorized = !state.recoveryMode && state.authenticated && !state.authorized;
  const loginForm = `<form class="login-form" data-auth-form><label><span>E-mail administrativo</span><input type="email" name="authEmail" autocomplete="email" required placeholder="seu@email.com" /></label><label><span>Senha</span><input type="password" name="authPassword" autocomplete="current-password" minlength="8" required placeholder="Mínimo de 8 caracteres" /></label><button class="button button-yellow full" type="submit">Entrar para lançar</button><button class="auth-help-link" type="button" data-forgot-password>Esqueci minha senha</button><button class="button button-outline full" type="button" data-public-access>Voltar ao modo consulta</button><small>Somente contas autorizadas como administrador podem lançar ou alterar dados.</small></form>`;
  const recoveryForm = `<form class="login-form" data-password-recovery-form><label><span>Nova senha</span><input type="password" name="newPassword" autocomplete="new-password" minlength="8" required placeholder="Mínimo de 8 caracteres" /></label><label><span>Confirmar nova senha</span><input type="password" name="confirmPassword" autocomplete="new-password" minlength="8" required placeholder="Digite novamente" /></label><button class="button button-yellow full" type="submit">Salvar nova senha</button><small>Depois de salvar, o acesso será liberado automaticamente neste aparelho.</small></form>`;
  const heading = state.authLoading ? "Preparando seu acesso" : state.recoveryMode ? "Defina sua nova senha" : unauthorized ? "E-mail não liberado" : "Acesso administrativo";
  const description = state.authLoading ? "Validando sua sessão protegida pelo Supabase…" : state.recoveryMode ? "Crie uma senha com pelo menos 8 caracteres para recuperar sua conta." : unauthorized ? `O e-mail <strong>${escapeHtml(state.user?.email || "")}</strong> foi autenticado, mas não está na lista autorizada por ${OWNER_EMAIL}.` : "Entre com sua conta de administrador para lançar notas fiscais ou alterar os recebimentos.";
  const accessContent = state.authLoading ? '<span class="login-loading"><i></i> Aguarde um instante</span>' : state.recoveryMode ? recoveryForm : unauthorized ? '<button class="button button-outline full" type="button" data-sign-out>Entrar com outro e-mail</button>' : state.online ? loginForm : '<button class="button button-dark full" disabled>O acesso exige conexão</button>';
  return `<main class="login-screen"><section class="login-card"><div class="login-brands"><img src="./epya-logo-oficial.png" alt="EPYA" /><span></span><img src="./arauco-sucuriu-logo.svg" alt="ARAUCO Projeto Sucuriú" /></div><span class="eyebrow">Controle diário • Projeto Sucuriú</span><h1>${heading}</h1><p>${description}</p>${accessContent}${state.authMessage ? `<p class="login-message">${escapeHtml(state.authMessage)}</p>` : ""}<button class="install-link" data-install>＋ Adicionar à tela inicial</button><div class="login-benefits"><span><b>✓</b> Supabase Auth</span><span><b>✓</b> Permissões por perfil</span><span><b>✓</b> PDF e relatórios</span></div></section></main>`;
}

function bindAccessEvents() {
  document.querySelectorAll("[data-install]").forEach((button) => button.addEventListener("click", installApp));
  document.querySelector("[data-auth-form]")?.addEventListener("submit", signInWithEmail);
  document.querySelector("[data-create-account]")?.addEventListener("click", createFirstAccess);
  document.querySelector("[data-forgot-password]")?.addEventListener("click", requestPasswordReset);
  document.querySelector("[data-password-recovery-form]")?.addEventListener("submit", updateRecoveredPassword);
  document.querySelector("[data-public-access]")?.addEventListener("click", openPublicAccess);
  document.querySelectorAll("[data-sign-out]").forEach((button) => button.addEventListener("click", signOut));
}

function renderCurrentView() {
  if (state.loading) return '<section class="loading-panel"><span class="spinner"></span><h1>Carregando os recebimentos</h1><p>Organizando notas fiscais e indicadores.</p></section>';
  if (state.view === "form") return renderForm();
  if (state.view === "history") return renderHistory();
  if (state.view === "quality") return renderQuality();
  if (state.view === "rejections") return renderRejections();
  if (state.view === "reports") return renderReports();
  if (state.view === "team") return renderTeam();
  return renderDashboard();
}

function renderSyncBadge() {
  if (state.pendingSync) return `<span class="sync-badge warning"><i></i> ${state.pendingSync} aguardando sincronização</span>`;
  return state.storageMode === "cloud" ? '<span class="sync-badge success"><i></i> Supabase sincronizado</span>' : '<span class="sync-badge warning"><i></i> Salvo neste aparelho</span>';
}

function weekStart(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function groupedComparison(period, records = state.records) {
  const grouped = new Map();
  records.forEach((record) => {
    const date = record.receivedDate || String(record.receivedAt).slice(0, 10);
    const key = period === "week" ? weekStart(date) : date.slice(0, 7);
    const current = grouped.get(key) || { key, dormente: 0, trilho: 0, nfs: 0, records: [] };
    current[record.material] += recordQuantity(record);
    current.nfs += invoiceItems(record).length;
    current.records.push(record);
    grouped.set(key, current);
  });
  return [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function comparisonLabel(item, period) {
  if (period === "month") {
    const [year, month] = item.key.split("-");
    return `${month}/${year.slice(2)}`;
  }
  return `${formatShortDate(item.key)}–${formatShortDate(addDays(item.key, 6))}`;
}

function renderComparisonChart(period, records = state.records) {
  const grouped = groupedComparison(period, records);
  const max = Math.max(1, ...grouped.flatMap((item) => [item.dormente, item.trilho]));
  return `<div class="comparison-chart" aria-label="Comparação ${period === "week" ? "semanal" : "mensal"} de materiais">${grouped.map((item) => `<div class="comparison-group" tabindex="0" data-tooltip="${escapeHtml(`${comparisonLabel(item, period)} • ${formatNumber(item.dormente)} dormentes • ${formatNumber(item.trilho)} trilhos • ${item.nfs} NFs`)}"><div class="comparison-bars"><span class="chart-bar sleeper" style="height:${Math.max(item.dormente ? 6 : 0, (item.dormente / max) * 100)}%"><b>${item.dormente ? formatNumber(item.dormente) : ""}</b></span><span class="chart-bar rail" style="height:${Math.max(item.trilho ? 6 : 0, (item.trilho / max) * 100)}%"><b>${item.trilho ? formatNumber(item.trilho) : ""}</b></span></div><small>${comparisonLabel(item, period)}</small></div>`).join("")}</div>`;
}

function dailyComparison(records = state.records) {
  const grouped = new Map();
  records.forEach((record) => {
    const key = record.receivedDate || String(record.receivedAt).slice(0, 10);
    const item = grouped.get(key) || { key, dormente: 0, trilho: 0, nfs: 0 };
    item[record.material] += recordQuantity(record);
    item.nfs += invoiceItems(record).length;
    grouped.set(key, item);
  });
  return [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
}

function renderDailyChart(records = state.records) {
  const grouped = dailyComparison(records);
  const max = Math.max(1, ...grouped.map((item) => item.dormente + item.trilho));
  return `<div class="daily-chart" aria-label="Volume diário recebido">${grouped.map((item) => { const total = item.dormente + item.trilho; return `<div class="daily-column" tabindex="0" data-tooltip="${escapeHtml(`${formatDate(item.key)} • ${formatNumber(item.dormente)} dormentes • ${formatNumber(item.trilho)} trilhos • ${item.nfs} NFs`)}"><div class="daily-stack" aria-label="${formatDate(item.key)}: ${formatNumber(total)} itens"><span class="rail" style="height:${(item.trilho / max) * 100}%"></span><span class="sleeper" style="height:${(item.dormente / max) * 100}%"></span></div><small>${formatShortDate(item.key)}</small></div>`; }).join("")}</div>`;
}

function qualityTotals(material = "dormente", records = state.records) {
  const categories = qualityCategories(material);
  const totals = Object.fromEntries(categories.map((category) => [category.id, 0]));
  records.filter((record) => record.material === material).forEach((record) => categories.forEach((category) => { totals[category.id] = number(totals[category.id]) + number(record.quality?.[category.id]); }));
  return totals;
}

function renderQualityDonut(material = "dormente", records = state.records) {
  const categories = qualityCategories(material);
  const totals = qualityTotals(material, records);
  const sum = Object.values(totals).reduce((total, value) => total + number(value), 0);
  let angle = 0;
  const stops = categories.map((category) => { const start = angle; angle += sum ? (number(totals[category.id]) / sum) * 360 : 0; return `${category.color} ${start}deg ${angle}deg`; });
  const gradient = sum ? `conic-gradient(${stops.join(",")})` : "conic-gradient(#dfe3e8 0deg 360deg)";
  return `<div class="quality-summary"><div class="quality-donut ${material}" style="--quality-donut:${gradient}"><strong>${formatNumber(sum)}</strong><small>ocorrências</small></div><ul>${categories.map((category) => `<li tabindex="0" data-tooltip="${escapeHtml(`${category.label}: ${formatNumber(totals[category.id])} ocorrência(s)`)}"><i style="background:${category.color}"></i><span>${escapeHtml(category.label)}</span><strong>${formatNumber(totals[category.id])}</strong></li>`).join("")}</ul></div>`;
}

function sleeperInvoiceQualityRows(records = state.records, filter = "") {
  const query = String(filter || "").trim().toLowerCase().replace(/^nf\s*/i, "");
  const rows = records.filter((record) => record.material === "dormente").flatMap((record) => invoiceItems(record).map((item, index) => {
    const quality = invoiceQuality(record, item, index);
    const rejected = Math.max(number(quality.reprovados), rejectionsForInvoice(record, item.number).length);
    const defects = qualityCategories("dormente").filter((category) => category.id !== "reprovados").reduce((sum, category) => sum + number(quality[category.id]), 0) + rejected;
    const received = number(item.quantity);
    return {
      record,
      item,
      received,
      defects,
      percentage: received ? (defects / received) * 100 : 0,
    };
  }));
  return rows.filter(({ item }) => !query || String(item.number).toLowerCase().includes(query)).sort((a, b) => `${a.record.receivedDate}-${String(a.item.number).padStart(12, "0")}`.localeCompare(`${b.record.receivedDate}-${String(b.item.number).padStart(12, "0")}`));
}

function renderNfQualityChart(records = state.records, filter = state.nfQualityFilter, expanded = false) {
  const allRows = sleeperInvoiceQualityRows(records, filter);
  const rows = filter || expanded ? allRows : allRows.filter((row) => row.defects > 0).slice(-12);
  if (!rows.length) return '<div class="nf-quality-empty"><strong>Nenhuma NF encontrada</strong><span>Limpe a busca ou informe outro número.</span></div>';
  return `<div class="nf-quality-chart" aria-label="Percentual de ocorrências de qualidade por nota fiscal">${rows.map((row) => {
    const percentage = Math.min(100, row.percentage);
    const percentageLabel = row.percentage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `<article class="nf-quality-row" tabindex="0" data-tooltip="${escapeHtml(`NF ${row.item.number} • ${formatNumber(row.received)} recebidos • ${formatNumber(row.defects)} ocorrências • ${percentageLabel}%`)}"><div class="nf-quality-label"><strong>NF ${escapeHtml(row.item.number)}</strong><small>${formatDate(row.record.receivedDate)}</small></div><div class="nf-quality-bars"><span class="received"><i style="width:100%"></i><b>Recebido: ${formatNumber(row.received)} (100%)</b></span><span class="defects"><i style="width:${percentage}%"></i><b>Defeitos: ${formatNumber(row.defects)} (${percentageLabel}%)</b></span></div></article>`;
  }).join("")}</div>`;
}

function renderNfQualityPanel() {
  const allRows = sleeperInvoiceQualityRows(state.records, state.nfQualityFilter);
  const rows = state.nfQualityFilter ? allRows : allRows.filter((row) => row.defects > 0).slice(-12);
  const received = rows.reduce((sum, row) => sum + row.received, 0);
  const defects = rows.reduce((sum, row) => sum + row.defects, 0);
  const percentage = received ? ((defects / received) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "0,0";
  return `<article class="panel nf-quality-panel"><div class="panel-heading"><div><span class="eyebrow">Análise por nota fiscal</span><h2>Recebidos × ocorrências dos dormentes</h2><p>Compare rapidamente o volume recebido e as ocorrências registradas em cada NF.</p></div><button class="text-button" data-chart-modal="nf-quality">Ampliar gráfico ↗</button></div><div class="nf-quality-kpis"><div><span>NFs comparadas</span><strong>${formatNumber(rows.length)}</strong><small>${state.nfQualityFilter ? "resultado da pesquisa" : "últimas com ocorrências"}</small></div><div><span>Dormentes recebidos</span><strong>${formatNumber(received)}</strong><small>nas NFs exibidas</small></div><div><span>Ocorrências</span><strong>${formatNumber(defects)}</strong><small>registros de qualidade</small></div><div><span>Índice de ocorrências</span><strong>${percentage}%</strong><small>sobre o volume exibido</small></div></div><div class="nf-quality-content"><form class="nf-quality-search no-print" data-nf-quality-form><label><span>Pesquisar uma NF</span><input name="nfQualitySearch" value="${escapeHtml(state.nfQualityFilter)}" inputmode="numeric" placeholder="Ex.: 221" /></label><button class="button button-dark" type="submit">Pesquisar</button>${state.nfQualityFilter ? '<button class="button button-outline" type="button" data-clear-nf-quality>Limpar</button>' : ""}<p>Amarelo representa o total recebido. Vermelho mostra as ocorrências encontradas.</p></form>${renderNfQualityChart()}</div></article>`;
}

function renderReportQuality(records, material = state.reportFilters.material) {
  if (material === "dormente" || material === "trilho") return `<div class="report-quality-single"><h3>${MATERIALS[material].label}</h3>${renderQualityDonut(material, records)}</div>`;
  return `<div class="report-quality-pair"><div><h3>Dormentes</h3>${renderQualityDonut("dormente", records)}</div><div><h3>Trilhos</h3>${renderQualityDonut("trilho", records)}</div></div>`;
}

function renderPeraMilestone(value) {
  const total = value.peraSleepers;
  let status = "monitor";
  let title = "Monitoramento da Pera";
  let milestone = PERA_FIRST_MILESTONE;
  let detail = `Faltam ${formatNumber(PERA_FIRST_MILESTONE - total)} dormentes para o primeiro lembrete.`;

  if (total >= PERA_FINAL_MILESTONE) {
    status = "reached";
    title = "Marco atingido: 20.000 dormentes na Pera";
    milestone = PERA_FINAL_MILESTONE;
    detail = `O total registrado chegou a ${formatNumber(total)} dormentes.`;
  } else if (total >= PERA_FIRST_MILESTONE) {
    status = "next";
    title = "Primeiro marco atingido: 15.000 dormentes";
    milestone = PERA_FINAL_MILESTONE;
    detail = `Faltam ${formatNumber(PERA_FINAL_MILESTONE - total)} dormentes para o lembrete de 20.000.`;
  } else if (total >= PERA_WARNING_START) {
    status = "warning";
    title = "Atenção: próximo de 15.000 na Pera";
    detail = `Faltam somente ${formatNumber(PERA_FIRST_MILESTONE - total)} dormentes para o primeiro marco.`;
  }

  const progress = Math.min(100, (total / milestone) * 100);
  const liveRole = status === "warning" || status === "reached" ? "alert" : "status";
  return `<article class="pera-milestone ${status}" role="${liveRole}" aria-live="polite"><span class="pera-milestone-icon" aria-hidden="true">${status === "reached" ? "✓" : "!"}</span><div class="pera-milestone-copy"><span class="eyebrow">Controle de descarga</span><h2>${title}</h2><p>${detail}</p></div><div class="pera-milestone-total"><span>Total na Pera</span><strong>${formatNumber(total)}</strong><small>dormentes</small></div><div class="pera-milestone-progress" aria-label="${progress.toFixed(1).replace(".", ",")}% do marco de ${formatNumber(milestone)} dormentes"><i style="width:${progress}%"></i></div></article>`;
}

function goalRecords(goal) {
  return state.records.filter((record) => {
    const date = record.receivedDate || String(record.receivedAt || "").slice(0, 10);
    return record.material === goal.material
      && (!goal.location || locationKey(record.location) === locationKey(goal.location))
      && (!goal.startDate || date >= goal.startDate);
  });
}

function goalProgress(goal) {
  const current = goalRecords(goal).reduce((sum, record) => sum + recordQuantity(record), 0);
  const percentage = goal.target ? (current / goal.target) * 100 : 0;
  return { current, percentage, remaining: Math.max(0, goal.target - current) };
}

function renderGoalsPanel() {
  const cards = state.goals.map((goal) => {
    const value = goalProgress(goal);
    const scope = goal.location || "Todos os locais";
    const period = goal.startDate ? `Desde ${formatDate(goal.startDate)}` : "Desde o primeiro registro";
    const due = goal.dueDate ? `Prazo ${formatDate(goal.dueDate)}` : "Sem prazo definido";
    const completed = value.current >= goal.target;
    return `<article class="goal-card ${goal.material} ${completed ? "completed" : ""}"><header>${materialBadge(goal.material)}${canEdit() ? `<button class="danger-link no-print" data-delete-goal="${escapeHtml(goal.id)}" aria-label="Excluir a meta ${escapeHtml(goal.title)}">Excluir</button>` : ""}</header><h3>${escapeHtml(goal.title)}</h3><p>${escapeHtml(scope)} • ${period} • ${due}</p><div class="goal-numbers"><strong>${formatNumber(value.current)}</strong><span>de ${formatNumber(goal.target)} ${MATERIALS[goal.material].unit}</span></div><div class="goal-progress" role="progressbar" aria-label="${escapeHtml(goal.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, value.percentage).toFixed(0)}"><i style="width:${Math.min(100, value.percentage)}%"></i></div><footer><b>${value.percentage.toFixed(1).replace(".", ",")}% concluída</b><span>${completed ? "Meta atingida" : `Faltam ${formatNumber(value.remaining)}`}</span></footer></article>`;
  }).join("");
  return `<section class="goals-section"><div class="section-heading"><div><span class="eyebrow">Planejamento</span><h2>Metas da obra</h2><p>Acompanhe automaticamente o avanço total ou por local de descarga.</p></div>${canEdit() ? '<button class="button button-outline no-print" data-add-goal>+ Adicionar meta</button>' : ""}</div>${cards ? `<div class="goal-grid">${cards}</div>` : `<article class="panel empty-goals"><div><strong>Nenhuma meta cadastrada</strong><p>Crie uma meta para dormentes ou trilhos e acompanhe o progresso pelos lançamentos.</p></div>${canEdit() ? '<button class="button button-yellow no-print" data-add-goal>Criar primeira meta</button>' : ""}</article>`}</section>`;
}

function supabaseGoalRow(goal) {
  return { id: goal.id, title: goal.title, material: goal.material, target_quantity: number(goal.target), location: goal.location || "", start_date: goal.startDate || null, due_date: goal.dueDate || null, created_by: state.user?.email || OWNER_EMAIL, created_at: goal.createdAt || new Date().toISOString(), updated_at: new Date().toISOString() };
}

async function syncGoalChanges() {
  if (!supabaseClient || !state.online || !state.authorized) return false;
  const pending = readGoalOutbox();
  const remaining = { upserts: [], deletes: [] };
  for (const goal of pending.upserts) {
    try {
      const { error } = await supabaseClient.from("receiving_goals").upsert(supabaseGoalRow(goal), { onConflict: "id" });
      if (error) throw error;
    } catch {
      remaining.upserts.push(goal);
    }
  }
  for (const id of pending.deletes) {
    try {
      const { error } = await supabaseClient.from("receiving_goals").delete().eq("id", id);
      if (error) throw error;
    } catch {
      remaining.deletes.push(id);
    }
  }
  writeGoalOutbox(remaining);
  return !remaining.upserts.length && !remaining.deletes.length;
}

async function saveGoal() {
  if (!canEdit()) return toast("Seu acesso é somente para consulta.", "error");
  const title = String(document.querySelector('[name="goalTitle"]')?.value || "").trim();
  const material = document.querySelector('[name="goalMaterial"]')?.value === "trilho" ? "trilho" : "dormente";
  const target = number(document.querySelector('[name="goalTarget"]')?.value);
  const locationValue = document.querySelector('[name="goalLocation"]')?.value || "";
  const location = knownLocations().find((label) => locationKey(label) === locationValue) || "";
  const startDate = document.querySelector('[name="goalStart"]')?.value || "";
  const dueDate = document.querySelector('[name="goalDue"]')?.value || "";
  if (!title) return toast("Informe um nome para a meta.", "error");
  if (!target) return toast("Informe uma quantidade maior que zero.", "error");
  if (startDate && dueDate && startDate > dueDate) return toast("O prazo deve ser posterior ao início da meta.", "error");
  const goal = normalizeGoal({ id: `meta-${crypto.randomUUID()}`, title, material, target, location, startDate, dueDate, createdAt: new Date().toISOString() });
  state.goals.push(goal); saveGoalsLocal();
  const pending = readGoalOutbox();
  pending.upserts = [...pending.upserts.filter((item) => item.id !== goal.id), goal];
  pending.deletes = pending.deletes.filter((id) => id !== goal.id);
  writeGoalOutbox(pending);
  state.modal = null; render();
  const synced = await syncGoalChanges();
  toast(synced ? "Meta adicionada e sincronizada." : "Meta adicionada neste aparelho. Será sincronizada quando o banco estiver disponível.", synced ? "success" : "warning");
}

async function deleteGoal(id) {
  const goal = state.goals.find((item) => item.id === id);
  if (!goal || !canEdit() || !confirm(`Excluir a meta “${goal.title}”?`)) return;
  state.goals = state.goals.filter((item) => item.id !== id); saveGoalsLocal();
  const pending = readGoalOutbox();
  pending.upserts = pending.upserts.filter((item) => item.id !== id);
  if (!pending.deletes.includes(id)) pending.deletes.push(id);
  writeGoalOutbox(pending); render();
  const synced = await syncGoalChanges();
  toast(synced ? "Meta excluída." : "Meta excluída neste aparelho. A remoção será sincronizada quando houver conexão.", synced ? "success" : "warning");
}

function renderLocationDashboards() {
  const groups = locationGroups().filter((group) => !state.dashboardLocation || group.key === state.dashboardLocation);
  if (!groups.length) return "";
  return `<section class="location-dashboards"><div class="section-heading"><div><span class="eyebrow">Locais de descarga</span><h2>Painel por local</h2></div><span class="updated-label">${groups.length} locais registrados</span></div><div class="location-dashboard-grid">${groups.map((group) => {
    const value = metrics(group.records);
    const dates = group.records.map((record) => record.receivedDate || String(record.receivedAt || "").slice(0, 10)).filter(Boolean).sort();
    return `<article class="panel location-dashboard"><div class="panel-heading"><div><h3>${escapeHtml(group.label)}</h3><p>Último recebimento: ${formatDate(dates.at(-1))}</p></div></div><div class="location-totals"><div class="location-sleepers"><span>Dormentes</span><strong>${formatNumber(value.sleepers)}</strong><small>${formatNumber(value.sleeperNfs)} NFs</small></div><div class="location-rails"><span>Trilhos</span><strong>${formatNumber(value.rails)}</strong><small>${formatNumber(value.railNfs)} NFs</small></div></div><dl class="location-quality"><div><dt>Notas fiscais</dt><dd>${formatNumber(value.totalNfs)}</dd></div><div><dt>Ocorrências de qualidade</dt><dd>${formatNumber(value.sleeperOccurrences + value.railOccurrences)}</dd></div><div><dt>Reprovados</dt><dd>${formatNumber(value.rejected)} dormentes · ${formatNumber(value.railRejected)} trilhos</dd></div></dl>${state.dashboardLocation ? `<h4>Entradas por semana</h4><div class="chart-legend"><span><i class="dot yellow"></i>Dormentes</span><span><i class="dot blue"></i>Trilhos</span></div>${renderComparisonChart("week", group.records)}` : ""}<button class="button button-outline no-print" data-location-report="${escapeHtml(group.key)}">Gerar relatório deste local</button></article>`;
  }).join("")}</div></section>`;
}

function openLocationReport(location) {
  if (!locationGroups().some((group) => group.key === location)) return;
  state.reportFilters = { from: "", to: "", material: "todos", location };
  navigate("reports");
}

function renderDashboard() {
  if (state.dashboardTab === "locations") return `<section class="view dashboard-view">${renderDashboardHeader()}${renderDashboardTabs()}<article class="panel location-picker"><label><span>Local de descarga</span><select name="dashboardLocation">${renderLocationOptions(state.dashboardLocation)}</select></label><p>Selecione um local para ver seus gráficos e indicadores.</p></article>${renderLocationDashboards()}</section>`;
  const value = metrics();
  const recent = state.records.slice(0, 6);
  return `<section class="view dashboard-view">${renderDashboardHeader()}${renderDashboardTabs()}
    <div class="section-heading"><div><span class="eyebrow">Visão executiva</span><h2>Panorama acumulado</h2></div><span class="updated-label">Atualizado com ${value.totalNfs} notas fiscais</span></div><div class="metrics-grid"><article class="metric-card sleeper"><span>Dormentes recebidos</span><strong>${formatNumber(value.sleepers)}</strong><small>${value.sleeperNfs} NFs • meta ${formatNumber(TARGET_SLEEPERS)}</small><div class="metric-progress"><i style="width:${value.progress}%"></i></div></article><article class="metric-card rail"><span>Trilhos recebidos</span><strong>${formatNumber(value.rails)}</strong><small>${value.railNfs} NFs • acompanhe pelas metas</small><div class="metric-line"></div></article><article class="metric-card remaining"><span>Saldo de dormentes</span><strong>${formatNumber(value.remaining)}</strong><small>${value.progress.toFixed(2).replace(".", ",")}% da meta concluída</small><div class="metric-line"></div></article><article class="metric-card quality"><span>Ocorrências de qualidade</span><strong>${formatNumber(value.sleeperOccurrences + value.railOccurrences)}</strong><small>${formatNumber(value.sleeperOccurrences)} em dormentes • ${formatNumber(value.railOccurrences)} em trilhos</small><div class="metric-line"></div></article></div>${renderGoalsPanel()}${renderPeraMilestone(value)}
    <div class="dashboard-grid charts-main"><article class="panel chart-card clickable" data-chart-modal="week" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Comparação semanal</span><h2>Entradas por semana</h2></div><span class="expand-hint">Ampliar ↗</span></div><div class="chart-legend"><span><i class="dot yellow"></i>Dormentes</span><span><i class="dot blue"></i>Trilhos</span></div>${renderComparisonChart("week")}</article><article class="panel chart-card clickable" data-chart-modal="month" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Comparação mensal</span><h2>Evolução por mês</h2></div><span class="expand-hint">Ampliar ↗</span></div><div class="chart-legend"><span><i class="dot yellow"></i>Dormentes</span><span><i class="dot blue"></i>Trilhos</span></div>${renderComparisonChart("month")}</article></div>
    <div class="dashboard-grid charts-secondary"><article class="panel chart-card clickable" data-chart-modal="daily" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Ritmo da operação</span><h2>Volume diário</h2></div><span class="expand-hint">Ampliar ↗</span></div>${renderDailyChart()}</article><article class="panel quality-card clickable" data-chart-modal="quality-dormente" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Classificações</span><h2>Qualidade dos dormentes</h2></div><span class="expand-hint">Ampliar ↗</span></div>${renderQualityDonut("dormente")}</article><article class="panel quality-card clickable" data-chart-modal="quality-trilho" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Inspeção ferroviária</span><h2>Qualidade dos trilhos</h2></div><span class="expand-hint">Ampliar ↗</span></div>${renderQualityDonut("trilho")}</article></div>
    ${renderPendingSummary()}
    ${renderNfQualityPanel()}
    <article class="panel recent-panel"><div class="panel-heading"><div><span class="eyebrow">Últimos lançamentos</span><h2>Recebimentos recentes</h2></div><button class="text-button" data-nav="history">Abrir histórico →</button></div>${renderRecordsTable(recent, true)}</article></section>`;
}

function renderDashboardHeader() {
  return `<article class="dashboard-hero"><div class="hero-copy"><div class="hero-kicker"><span>Controle de recebimentos</span></div><h1>Controle diário de<br />dormentes e trilhos.</h1><p>Notas fiscais, quantidades, qualidade e avanço físico reunidos em uma visão clara da obra.</p><div class="hero-actions no-print">${renderSyncBadge()}${canEdit() ? '<button class="button button-yellow" data-new-record>+ Novo recebimento</button>' : ""}<button class="button button-glass" data-nav="reports">Gerar relatório</button></div></div><div class="hero-corner-brand"><img src="./arauco-sucuriu-logo.svg" alt="Símbolo do Projeto Sucuriú" /><span><strong>ARAUCO</strong><small>Projeto Sucuriú</small></span></div></article>`;
}

function renderDashboardTabs() {
  return `<div class="dashboard-tabs no-print" role="tablist" aria-label="Visão do painel"><button role="tab" aria-selected="${state.dashboardTab === "overview"}" data-dashboard-tab="overview">Visão geral</button><button role="tab" aria-selected="${state.dashboardTab === "locations"}" data-dashboard-tab="locations">Por local</button></div>`;
}

function recordPending(record) {
  return record.status === "rascunho" || !invoiceItems(record).length || invoiceItems(record).some((item, index) => invoiceCompletion({ record, item, index }).missing.length > 0);
}

function renderPendingSummary() {
  const count = state.records.filter(recordPending).length;
  return count ? `<article class="panel pending-summary"><div><strong>${count} recebimento${count === 1 ? "" : "s"} com pendências</strong><p>Confira os rascunhos e os dados essenciais que faltam preencher.</p></div><button class="button button-outline" data-show-pending>Ver pendências</button></article>` : "";
}

function knownLocations() {
  const values = new Map();
  [...state.locations, ...locationGroups()].forEach((entry) => {
    const label = String(entry.label || "").trim().replace(/\s+/g, " ");
    if (label && label !== "Local não informado" && !values.has(locationKey(label))) values.set(locationKey(label), label);
  });
  return [...values.values()].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

function renderLocationField(draft) {
  const labels = knownLocations();
  if (draft.location && !labels.some((label) => locationKey(label) === locationKey(draft.location))) labels.push(draft.location);
  return `<div class="span-two location-field"><label><span>Local / ponto de descarga *</span><select name="location" required><option value="">Selecione um local</option>${labels.map((label) => `<option value="${escapeHtml(label)}" ${locationKey(label) === locationKey(draft.location) ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label><button class="text-button" type="button" data-new-location>${state.newLocationMode ? "Cancelar novo local" : "+ Adicionar novo local"}</button>${state.newLocationMode ? '<div class="new-location-fields"><label><span>Nome do novo local</span><input name="newLocationName" maxlength="120" placeholder="Ex.: Pátio Norte" /></label><button type="button" class="button button-dark" data-save-location>Cadastrar local</button></div>' : ""}</div>`;
}

async function saveLocation() {
  if (!canEdit() || state.saving || state.photoBusy) return;
  const label = String(document.querySelector('[name="newLocationName"]')?.value || "").trim().replace(/\s+/g, " ");
  if (!label || label.length > 120) return toast("Informe um nome de local com até 120 caracteres.", "error");
  state.draft = formRecordFromDom();
  const existing = knownLocations().find((item) => locationKey(item) === locationKey(label));
  if (existing) { state.draft.location = existing; state.newLocationMode = false; render(); return toast("Local já cadastrado e selecionado."); }
  if (!state.online || !supabaseClient) return toast("Conecte-se à internet para cadastrar o local.", "error");
  state.saving = true; render();
  try {
    const row = { id: locationKey(label), label };
    const { error } = await supabaseClient.from("receiving_locations").insert(row);
    if (error && error.code !== "23505") throw error;
    const { data, error: readError } = await supabaseClient.from("receiving_locations").select("id,label").eq("id", row.id).single();
    if (readError) throw readError;
    state.locations = [...state.locations.filter((item) => item.id !== data.id), data];
    localStorage.setItem(LOCATION_KEY, JSON.stringify(state.locations));
    state.draft = formRecordFromDom(); state.draft.location = data.label; state.newLocationMode = false;
    state.saving = false; render(); toast("Local cadastrado e selecionado.");
  } catch { state.saving = false; render(); toast("Não foi possível cadastrar o local. Tente novamente.", "error"); }
}

function invoiceNumberKey(value) {
  const normalized = String(value || "").trim().toLocaleLowerCase("pt-BR").replace(/[\s.\-/]+/g, "");
  return /^\d+$/.test(normalized) ? normalized.replace(/^0+(?=\d)/, "") : normalized;
}

function duplicateInvoiceWarnings(record) {
  const warnings = [];
  const seen = new Set();
  invoiceItems(record).forEach((item) => {
    const key = invoiceNumberKey(item.number);
    if (!key) return;
    if (seen.has(key)) warnings.push(`NF ${item.number}: aparece mais de uma vez neste lançamento.`);
    seen.add(key);
    const matches = state.records.filter((other) => other.id !== (state.editingId || record.id) && other.material === record.material && invoiceItems(other).some((invoice) => invoiceNumberKey(invoice.number) === key));
    matches.forEach((other) => warnings.push(`NF ${item.number}: já registrada em ${formatDate(other.receivedDate || other.receivedAt)}, ${other.location || "local não informado"} (${other.supplier || "fornecedor não informado"}).`));
  });
  return [...new Set(warnings)];
}

function draftWarnings(record) {
  const missing = [];
  if (!invoiceItems(record).length) missing.push("Ao menos uma nota fiscal");
  if (!record.receivedDate) missing.push("Data do recebimento");
  if (!String(record.location || "").trim()) missing.push("Local de descarga");
  invoiceItems(record).forEach((item, index) => {
    if (!String(item.number || "").trim()) missing.push(`Número da NF ${index + 1}`);
    if (!number(item.quantity)) missing.push(`Quantidade da NF ${item.number || index + 1}`);
  });
  return { missing, duplicates: duplicateInvoiceWarnings(record) };
}

function renderDraftWarnings(record) {
  const { missing, duplicates } = draftWarnings(record);
  if (!missing.length && !duplicates.length) return '<div class="draft-check complete" role="status">✓ Dados essenciais preenchidos. Nenhuma NF repetida encontrada.</div>';
  return `<div class="draft-check pending" role="status">${missing.length ? `<strong>Dados pendentes</strong><ul>${missing.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><p>Você pode salvar como rascunho e concluir depois.</p>` : ""}${duplicates.length ? `<strong>Confira possíveis NFs repetidas</strong><ul>${duplicates.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><p>Se forem entregas parciais ou outra origem, você poderá confirmar ao salvar.</p>` : ""}</div>`;
}

function refreshDraftWarnings() {
  const target = document.querySelector("[data-draft-warnings]");
  if (target) target.innerHTML = renderDraftWarnings(normalizeMaterialSupplier(formRecordFromDom()));
}

function photosForRecords(records) {
  return records.flatMap((record) => invoiceItems(record).flatMap((item) => (item.photos || []).map((photo) => ({ ...photo, invoiceNumber: item.number, recordId: record.id, location: record.location, receivedDate: record.receivedDate }))));
}

function photoSource(photo) {
  const pending = pendingPhotoFiles.get(photo.id);
  if (pending) return pending.url;
  const cached = photoUrls.get(photo.path);
  return cached?.expiresAt > Date.now() ? cached.url || "" : "";
}

function renderPhotoGallery(photos, editableIndex = -1) {
  if (!photos.length) return '<p class="photo-empty">Nenhuma foto vinculada a esta NF.</p>';
  return `<div class="invoice-photo-grid">${photos.map((photo) => {
    const src = photoSource(photo);
    const caption = photo.caption || photo.name || "Foto do recebimento";
    const label = photo.invoiceNumber ? `NF ${photo.invoiceNumber} · ${photo.location || "Local não informado"}` : "";
    return `<figure data-photo-path="${escapeHtml(photo.path || "")}">${src ? `<a href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir foto: ${escapeHtml(caption)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}" /></a>` : '<div class="photo-placeholder">Foto aguardando carregamento<button type="button" class="text-button no-print" data-retry-photos>Carregar foto</button></div>'}<figcaption>${label ? `<strong>${escapeHtml(label)}</strong>` : ""}${editableIndex >= 0 ? `<label><span>Legenda da foto</span><input data-photo-caption="${escapeHtml(photo.id)}" value="${escapeHtml(photo.caption || "")}" maxlength="200" placeholder="Ex.: quebra no dormente" /></label><button type="button" class="text-button danger" data-remove-invoice-photo="${escapeHtml(photo.id)}" data-photo-invoice="${editableIndex}">Remover foto</button>` : `<span>${escapeHtml(caption)}</span>`}<small>Anexada em ${formatDate(photo.createdAt)}</small></figcaption></figure>`;
  }).join("")}</div>`;
}

function renderInvoicePhotoFields(draft) {
  return `<article class="panel form-panel invoice-photo-panel"><div class="form-section-title"><span>05</span><div><h2>Fotos por nota fiscal</h2><p>Até ${MAX_INVOICE_PHOTOS} fotos por NF. As fotos são enviadas ao salvar, com conexão à internet.</p></div></div>${state.photoBusy ? '<p role="status">Preparando as fotos…</p>' : ""}${draft.invoiceItems.map((item, index) => `<section class="invoice-photo-entry"><h3>NF ${escapeHtml(item.number || `${index + 1} · número pendente`)}</h3><label class="button button-outline file-button">＋ Adicionar fotos<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-add-invoice-photos="${index}" ${(item.photos || []).length >= MAX_INVOICE_PHOTOS || state.photoBusy || state.saving ? "disabled" : ""} /></label>${renderPhotoGallery(item.photos || [], index)}</section>`).join("")}</article>`;
}

async function compressInvoicePhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Use fotos JPG, PNG ou WebP de até 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a foto.");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .84));
    if (!blob || blob.size > 2 * 1024 * 1024) throw new Error("A foto ficou muito grande. Selecione uma imagem menor.");
    return blob;
  } finally { bitmap.close(); }
}

async function addInvoicePhotos(index, files) {
  if (!canEdit() || state.photoBusy || state.saving) return;
  state.draft = formRecordFromDom();
  const item = state.draft.invoiceItems[index];
  if (!item) return;
  item.photos ||= [];
  const available = MAX_INVOICE_PHOTOS - item.photos.length;
  const chosen = [...files].slice(0, available);
  if (!chosen.length) return toast(`O limite é de ${MAX_INVOICE_PHOTOS} fotos por NF.`, "error");
  state.photoBusy = true; render();
  let failure = "";
  for (const file of chosen) {
    try {
      const blob = await compressInvoicePhoto(file);
      const id = crypto.randomUUID();
      pendingPhotoFiles.set(id, { blob, url: URL.createObjectURL(blob) });
      item.photos.push({ id, name: file.name, caption: "", createdAt: new Date().toISOString() });
    } catch (error) { failure = error.message || "Não foi possível abrir uma das fotos."; }
  }
  state.draft = formRecordFromDom();
  state.draft.invoiceItems[index].photos = item.photos;
  state.photoBusy = false; render();
  toast(failure || (files.length > available ? `Foram selecionadas ${chosen.length} fotos; o limite é ${MAX_INVOICE_PHOTOS} por NF.` : "Fotos adicionadas. Salve o recebimento para enviá-las."), failure ? "error" : "success");
}

function removeInvoicePhoto(index, id) {
  if (state.saving || state.photoBusy) return;
  state.draft = formRecordFromDom();
  const item = state.draft.invoiceItems[index];
  const photo = item?.photos?.find((entry) => entry.id === id);
  if (!photo || !confirm("Remover esta foto da NF? A alteração será confirmada ao salvar o recebimento.")) return;
  item.photos = item.photos.filter((entry) => entry.id !== id);
  const pending = pendingPhotoFiles.get(id);
  if (pending && !pending.path) { URL.revokeObjectURL(pending.url); pendingPhotoFiles.delete(id); }
  render();
}

async function uploadInvoicePhotos(record) {
  for (const photo of record.invoiceItems.flatMap((item) => item.photos || [])) {
    const pending = pendingPhotoFiles.get(photo.id);
    if (!pending) { if (!photo.path) throw new Error("Selecione novamente a foto que não foi enviada."); continue; }
    if (!pending.path) {
      const path = `${record.id}/${photo.id}.jpg`;
      const { error } = await supabaseClient.storage.from(PHOTO_BUCKET).upload(path, pending.blob, { contentType: "image/jpeg", upsert: false });
      if (error && String(error.statusCode) !== "409" && !/already exists/i.test(error.message || "")) throw new Error("Não foi possível enviar uma das fotos. Seus dados continuam no formulário; tente salvar novamente.");
      pending.path = path;
    }
    photo.path = pending.path;
  }
}

function releasePendingPhotos() {
  pendingPhotoFiles.forEach((photo) => URL.revokeObjectURL(photo.url));
  pendingPhotoFiles.clear();
}

async function removeStoredPhotos(paths) {
  if (!paths.length || !supabaseClient) return;
  try {
    const { error } = await supabaseClient.storage.from(PHOTO_BUCKET).remove([...new Set(paths)]);
    if (error) console.warn("Não foi possível remover fotos desvinculadas.");
  } catch { console.warn("Não foi possível remover fotos desvinculadas."); }
}

let photoLoadPromise = null;
let photoSessionEpoch = 0;
async function ensurePhotoUrls(paths, force = false) {
  if (!supabaseClient || !state.authorized) return false;
  const epoch = photoSessionEpoch;
  if (photoLoadPromise) await photoLoadPromise;
  if (!state.authorized || epoch !== photoSessionEpoch) return false;
  const needed = [...new Set(paths.filter(Boolean))].filter((path) => force || !photoUrls.has(path) || photoUrls.get(path).expiresAt <= Date.now() + 60000);
  if (!needed.length) return false;
  photoLoadPromise = (async () => {
    for (let offset = 0; offset < needed.length; offset += 50) {
      const batch = needed.slice(offset, offset + 50);
      try {
        const { data, error } = await supabaseClient.storage.from(PHOTO_BUCKET).createSignedUrls(batch, 3600);
        if (!state.authorized || epoch !== photoSessionEpoch) return;
        if (error) throw error;
        batch.forEach((path) => {
          const entry = data?.find((item) => item.path === path);
          photoUrls.set(path, { url: entry?.signedUrl || "", expiresAt: Date.now() + (entry?.signedUrl ? 3500000 : 120000) });
        });
      } catch { if (state.authorized && epoch === photoSessionEpoch) batch.forEach((path) => photoUrls.set(path, { url: "", expiresAt: Date.now() + 120000 })); }
    }
  })();
  try { await photoLoadPromise; } finally { photoLoadPromise = null; }
  return true;
}

async function loadVisiblePhotos(force = false) {
  const paths = [...document.querySelectorAll("[data-photo-path]")].map((node) => node.dataset.photoPath).filter(Boolean);
  if (await ensurePhotoUrls(paths, force)) {
    if (state.view === "form" && !state.saving && !state.photoBusy) state.draft = formRecordFromDom();
    if (!state.saving && !state.photoBusy) render();
  }
}

function renderRejectionSection(draft, items, rejections) {
  return `<section class="rejection-control"><div class="rejection-heading"><div><span class="eyebrow">Dormentes reprovados</span><h3>Identificação individual da reprovação</h3><p>Adicione um registro para cada dormente reprovado e informe a NF, o molde, a cavidade e o motivo.</p></div><button type="button" class="button button-dark" data-add-rejection>＋ Adicionar reprovado</button></div>${rejections.length ? `<div class="rejection-list">${rejections.map((rejection, index) => { const invoiceOptions = items.filter((item) => item.number).map((item) => `<option value="${escapeHtml(item.number)}" ${String(item.number) === rejection.invoiceNumber ? "selected" : ""}>NF ${escapeHtml(item.number)}</option>`).join(""); const reasonOptions = state.rejectionReasons.map((reason) => `<option value="${escapeHtml(reason.id)}" ${reason.id === rejection.reasonId ? "selected" : ""}>${escapeHtml(reason.label)}</option>`).join(""); return `<article class="rejection-row" data-rejection-row data-rejection-id="${escapeHtml(rejection.id)}"><header><strong>Dormente reprovado ${index + 1}</strong><button type="button" data-remove-rejection="${index}" aria-label="Remover dormente reprovado ${index + 1}">×</button></header><div class="rejection-fields"><label><span>Nota fiscal *</span><select name="rejectionInvoice" required><option value="">Selecione a NF</option>${invoiceOptions}</select></label><label><span>Molde *</span><input name="rejectionMold" value="${escapeHtml(rejection.mold)}" placeholder="Número do molde" required /></label><label><span>Cavidade *</span><input name="rejectionCavity" value="${escapeHtml(rejection.cavity)}" placeholder="Número da cavidade" required /></label><label><span>Motivo da reprovação *</span><select name="rejectionReason" required><option value="">Selecione o motivo</option>${reasonOptions}</select></label></div></article>`; }).join("")}</div>` : '<div class="rejection-empty">Nenhum dormente reprovado neste lançamento.</div>'}<div class="rejection-reason-manager"><div><strong>Motivos de reprovação</strong><small>Cadastre os motivos conforme precisar. Eles ficarão disponíveis nos próximos lançamentos.</small></div><input name="newRejectionReason" placeholder="Ex.: trinca estrutural" /><button type="button" class="button button-outline" data-add-rejection-reason>Adicionar motivo</button></div></section>`;
}

function formRecordFromDom() {
  const form = document.querySelector("#receiving-form");
  if (!form) return state.draft || defaultDraft();
  const material = form.elements.material.value;
  const categories = qualityCategories(material);
  const invoiceNumbers = [...form.querySelectorAll('[name="invoiceNumber"]')];
  const invoiceQuantities = [...form.querySelectorAll('[name="invoiceQuantity"]')];
  const draftItems = invoiceItems(state.draft || {});
  const items = invoiceNumbers.map((input, index) => {
    const numberValue = input.value.trim();
    const previous = draftItems[index];
    const qualityCard = form.querySelector(`[data-invoice-quality-card="${index}"]`);
    const quality = { ...blankQuality(material), ...(previous?.quality || {}) };
    categories.forEach((category) => { quality[category.id] = number(qualityCard?.querySelector(`[data-quality-category="${category.id}"]`)?.value); });
    return { ...previous, id: previous?.id || crypto.randomUUID(), number: numberValue, quantity: number(invoiceQuantities[index]?.value), quality, photos: (previous?.photos || []).map((photo) => ({ ...photo, caption: [...form.querySelectorAll("[data-photo-caption]")].find((input) => input.dataset.photoCaption === photo.id)?.value.trim() ?? photo.caption ?? "" })) };
  });
  const rejections = [...form.querySelectorAll("[data-rejection-row]")].map((row) => {
    const reasonId = row.querySelector('[name="rejectionReason"]')?.value || "";
    return { id: row.dataset.rejectionId || crypto.randomUUID(), invoiceNumber: row.querySelector('[name="rejectionInvoice"]')?.value || "", mold: row.querySelector('[name="rejectionMold"]')?.value.trim() || "", cavity: row.querySelector('[name="rejectionCavity"]')?.value.trim() || "", reasonId, reason: state.rejectionReasons.find((item) => item.id === reasonId)?.label || "" };
  });
  if (material === "dormente") items.forEach((item) => { item.quality.reprovados = rejections.filter((rejection) => rejection.invoiceNumber === item.number).length; });
  const quality = { ...((state.draft || {}).quality || {}) };
  categories.forEach((category) => { quality[category.id] = items.reduce((sum, item) => sum + number(item.quality?.[category.id]), 0); });
  return { ...(state.draft || defaultDraft()), material, receivedDate: form.elements.receivedDate.value, receivedTime: form.elements.receivedTime.value, timeKnown: Boolean(form.elements.receivedTime.value), location: form.elements.location.value.trim(), supplier: form.elements.supplier.value.trim(), vehiclePlate: form.elements.vehiclePlate.value.trim().toUpperCase(), inspectorName: form.elements.inspectorName.value.trim(), observations: form.elements.observations.value.trim(), invoiceItems: items.length ? items : [blankInvoiceItem(material)], quality, rejections, _cleanupMolde57Cav1: true };
}

function renderInvoiceQualityCards(draft, items, rejections) {
  const isSleeper = draft.material === "dormente";
  return `<div class="invoice-quality-list">${items.map((item, index) => {
    const quality = { ...blankQuality(draft.material), ...invoiceQuality(draft, item, index) };
    const invoiceLabel = item.number ? `NF ${escapeHtml(item.number)}` : `NF ${index + 1}`;
    const invoiceDetail = item.quantity ? `${formatNumber(item.quantity)} ${MATERIALS[draft.material].unit}` : "Quantidade ainda não informada";
    return `<article class="invoice-quality-card" data-invoice-quality-card="${index}"><header><div><span>Qualidade desta nota</span><strong>${invoiceLabel}</strong></div><small>${invoiceDetail}</small></header><div class="quality-input-grid">${qualityCategories(draft.material).map((category) => { const rejectedField = isSleeper && category.id === "reprovados"; const value = rejectedField ? rejections.filter((rejection) => rejection.invoiceNumber === String(item.number)).length : number(quality[category.id]); return `<label style="--category:${category.color}"><i></i><span>${escapeHtml(category.label)}</span><input type="number" min="0" name="invoiceQuality_${category.id}" data-quality-category="${category.id}" value="${value}" ${rejectedField ? "readonly aria-describedby=\"rejected-help\"" : ""} /></label>`; }).join("")}</div></article>`;
  }).join("")}</div>`;
}

function renderForm() {
  const draft = state.draft ||= defaultDraft();
  const items = draft.invoiceItems?.length ? draft.invoiceItems : [blankInvoiceItem(draft.material)];
  const total = items.reduce((sum, item) => sum + number(item.quantity), 0);
  const isSleeper = draft.material === "dormente";
  const rejections = isSleeper ? rejectionRows(draft) : [];
  return `<section class="view form-view"><div class="page-heading"><div><button class="back-link" data-nav="dashboard">← Voltar ao painel</button><span class="eyebrow">${state.editingId ? "Editar lançamento" : "Novo recebimento"}</span><h1>${state.editingId ? "Atualizar recebimento" : "Registrar chegada do dia"}</h1><p>Informe as NFs e as quantidades. O total é calculado automaticamente.</p></div><div class="heading-summary"><span>Total deste lançamento</span><strong data-form-total>${formatNumber(total)}</strong><small>${MATERIALS[draft.material].unit}</small></div></div><form id="receiving-form" class="receiving-form"><fieldset class="receiving-fields" ${state.saving || state.photoBusy ? "disabled" : ""}>
    <article class="panel form-panel"><div class="form-section-title"><span>01</span><div><h2>Material recebido</h2><p>Escolha o tipo antes de preencher as notas.</p></div></div><div class="material-selector"><button type="button" class="material-option ${isSleeper ? "active" : ""}" data-material="dormente"><i class="sleeper-icon"></i><span><strong>Dormentes</strong><small>Meta: ${formatNumber(TARGET_SLEEPERS)} unidades</small></span><b>${isSleeper ? "✓" : ""}</b></button><button type="button" class="material-option ${!isSleeper ? "active" : ""}" data-material="trilho"><i class="rail-icon"></i><span><strong>Trilhos</strong><small>Meta aberta para definição</small></span><b>${!isSleeper ? "✓" : ""}</b></button></div><input type="hidden" name="material" value="${draft.material}" /></article>
    <article class="panel form-panel"><div class="form-section-title"><span>02</span><div><h2>Data, horário e local</h2><p>O horário pode ficar vazio quando ainda não foi confirmado.</p></div></div><div class="field-grid four"><label><span>Data do recebimento *</span><input type="date" name="receivedDate" value="${escapeHtml(draft.receivedDate)}" required /></label><label><span>Horário</span><input type="time" name="receivedTime" value="${escapeHtml(draft.receivedTime || "")}" /></label>${renderLocationField(draft)}<label class="span-two"><span>Fornecedor / origem</span><input name="supplier" value="${escapeHtml(draft.supplier)}" /></label><label><span>Placa do veículo</span><input name="vehiclePlate" value="${escapeHtml(draft.vehiclePlate || "")}" placeholder="ABC-1D23" /></label><label><span>Responsável</span><input name="inspectorName" value="${escapeHtml(draft.inspectorName || "")}" /></label></div></article>
    <article class="panel form-panel invoice-panel"><div class="form-section-title"><span>03</span><div><h2>Notas fiscais e quantidades</h2><p>Adicione quantas NFs chegaram juntas. A soma aparece no topo.</p></div></div><div class="invoice-head"><span>Nota fiscal</span><span>Quantidade</span><span></span></div><div class="invoice-list">${items.map((item, index) => `<div class="invoice-row ${state.editingInvoiceIndex === index ? "edit-target" : ""}" data-invoice-row="${index}"><label><span>NF ${index + 1}</span><input name="invoiceNumber" value="${escapeHtml(item.number)}" inputmode="numeric" placeholder="Número da NF" required /></label><label><span>Quantidade</span><input type="number" min="0" name="invoiceQuantity" value="${item.quantity || ""}" placeholder="0" required /></label><button type="button" class="remove-row" data-remove-invoice="${index}" aria-label="Remover nota" ${items.length === 1 ? "disabled" : ""}>×</button></div>`).join("")}</div><button type="button" class="add-row-button" data-add-invoice>＋ Adicionar outra NF</button><div class="invoice-total"><span>Total automático</span><strong data-form-total>${formatNumber(total)}</strong><small>${MATERIALS[draft.material].unit}</small></div></article>
    <article class="panel form-panel quality-form-panel"><div class="form-section-title"><span>04</span><div><h2>Qualidade por nota fiscal</h2><p>Cada NF tem seus próprios defeitos. Ao adicionar outra nota, estes campos começam zerados.</p></div></div>${renderInvoiceQualityCards(draft, items, rejections)}${isSleeper ? `<p id="rejected-help" class="rejected-help">Os reprovados são calculados por NF a partir dos registros individuais abaixo.</p><div class="new-category-inline"><input name="newCategory" placeholder="Nova classificação, ex.: fissuras" /><button type="button" class="button button-outline" data-add-category>Adicionar classificação</button></div>${renderRejectionSection(draft, items, rejections)}` : '<p class="rail-quality-note">Registre em cada NF o empenamento, a corrosão e os danos no boleto, alma ou patim.</p>'}</article>
    ${renderInvoicePhotoFields(draft)}<article class="panel form-panel final-form-panel"><div class="form-section-title"><span>06</span><div><h2>Observações e confirmação</h2><p>Registre qualquer ressalva importante para o relatório.</p></div></div><label><span>Observações</span><textarea name="observations" rows="4" placeholder="Condições da descarga, divergências ou informações complementares">${escapeHtml(draft.observations || "")}</textarea></label><div data-draft-warnings>${renderDraftWarnings(draft)}</div><div class="form-actions"><button type="button" class="button button-outline" data-cancel-form>Cancelar</button><button type="button" class="button button-dark" data-save-status="rascunho">Salvar rascunho</button><button type="submit" class="button button-yellow" ${state.saving || state.photoBusy ? "disabled" : ""}>${state.saving ? "Salvando…" : state.editingId ? "Atualizar recebimento" : "Salvar recebimento"}</button></div></article></fieldset></form></section>`;
}

function filteredHistory() {
  const { search, material, from, to, pending } = state.historyFilters;
  const query = search.trim().toLowerCase();
  return state.records.filter((record) => {
    const date = record.receivedDate || String(record.receivedAt).slice(0, 10);
    const content = `${record.invoiceNumbers || ""} ${record.supplier || ""} ${record.location || ""}`.toLowerCase();
    return (!query || content.includes(query)) && (material === "todos" || record.material === material) && (!from || date >= from) && (!to || date <= to) && (!pending || recordPending(record));
  });
}

function renderDesktopRecordsTable(records, compact = false) {
  if (!records.length) return '<div class="empty-state"><span>▤</span><h3>Nenhum recebimento encontrado</h3><p>Altere os filtros ou faça um novo lançamento.</p></div>';
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Data / horário</th><th>Material</th><th>Nota fiscal</th><th>Local</th><th>Quantidade</th>${compact ? "" : "<th>Qualidade</th>"}<th class="no-print">Ações</th></tr></thead><tbody>${records.map((record) => { const items = invoiceItems(record); const date = record.receivedDate || String(record.receivedAt).slice(0, 10); return `<tr><td><strong>${formatDate(date)}</strong><small>${record.receivedTime ? record.receivedTime : "Horário pendente"}</small></td><td>${materialBadge(record.material)}</td><td><strong>${items.length} NF${items.length === 1 ? "" : "s"}</strong><small>${escapeHtml(items.map((item) => item.number).join(", "))}</small></td><td><strong>${escapeHtml(record.location || "—")}</strong><small>${escapeHtml(record.supplier || "—")}</small></td><td><strong>${formatNumber(recordQuantity(record))}</strong><small>${MATERIALS[record.material]?.unit || "un"}</small></td>${compact ? "" : `<td><strong>${formatNumber(qualityOccurrences(record))} ocorrências</strong><small>${formatNumber(qualityRejected(record))} reprovados • ${record.status === "rascunho" ? "Rascunho" : "Concluído"}</small></td>`}<td class="table-actions no-print"><button data-view-record="${record.id}" title="Ver detalhes">Ver</button>${canEdit() ? `<button data-edit-record="${record.id}" title="Editar">Editar</button><button class="danger" data-delete-record="${record.id}" title="Excluir">Excluir</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`;
}

function renderRecordsTable(records, compact = false) {
  const desktop = renderDesktopRecordsTable(records, compact);
  if (!records.length) return desktop;
  return `<div class="records-desktop">${desktop}</div><div class="record-cards">${records.map((record) => `<article class="receiving-card"><header>${materialBadge(record.material)}<span>${formatDate(record.receivedDate || record.receivedAt)}</span></header><h3>${escapeHtml(record.location || "Local não informado")}</h3><div class="receiving-card-total"><strong>${formatNumber(recordQuantity(record))}</strong><span>${MATERIALS[record.material]?.unit || "un"} · ${invoiceItems(record).length} NFs</span></div><p class="receiving-card-nfs">${invoiceItems(record).map((item) => `NF ${escapeHtml(item.number || "pendente")}`).join(" · ")}</p><p class="receiving-card-status ${recordPending(record) ? "pending" : "complete"}">${recordPending(record) ? "Dados pendentes" : "Dados essenciais preenchidos"}</p><div class="receiving-card-actions"><button class="button button-dark" data-view-record="${escapeHtml(record.id)}">Ver detalhes</button>${canEdit() ? `<button class="button button-outline" data-edit-record="${escapeHtml(record.id)}">Editar</button>` : ""}</div></article>`).join("")}</div>`;
}

function renderHistory() {
  const records = filteredHistory();
  const value = metrics(records);
  return `<section class="view history-view"><div class="page-heading"><div><span class="eyebrow">Rastreabilidade</span><h1>Histórico de recebimentos</h1><p>Pesquise por NF, fornecedor, período ou tipo de material.</p></div><div class="heading-actions">${canEdit() ? '<button class="button button-yellow" data-new-record>+ Novo recebimento</button>' : ""}<button class="button button-outline" data-export-csv>Exportar planilha</button></div></div><article class="panel filters-panel no-print"><label class="search-field"><span>Buscar NF, local ou fornecedor</span><input name="historySearch" value="${escapeHtml(state.historyFilters.search)}" placeholder="Digite para pesquisar" /></label><label><span>Material</span><select name="historyMaterial"><option value="todos">Todos</option><option value="dormente" ${state.historyFilters.material === "dormente" ? "selected" : ""}>Dormentes</option><option value="trilho" ${state.historyFilters.material === "trilho" ? "selected" : ""}>Trilhos</option></select></label><label><span>De</span><input type="date" name="historyFrom" value="${state.historyFilters.from}" /></label><label><span>Até</span><input type="date" name="historyTo" value="${state.historyFilters.to}" /></label><button class="button button-dark compact" data-apply-history>Filtrar</button><button class="text-button" data-clear-history>Limpar</button><label class="pending-filter"><input type="checkbox" name="historyPending" ${state.historyFilters.pending ? "checked" : ""} /> Somente pendências</label></article><div class="history-summary"><span><strong>${records.length}</strong> lançamentos</span><span><strong>${formatNumber(value.totalNfs)}</strong> notas fiscais</span><span><strong>${formatNumber(value.sleepers)}</strong> dormentes</span><span><strong>${formatNumber(value.rails)}</strong> trilhos</span></div><article class="panel">${renderRecordsTable(records)}</article></section>`;
}

function renderQuality() {
  const sleeperRecords = state.records.filter((record) => record.material === "dormente");
  const railRecords = state.records.filter((record) => record.material === "trilho");
  const value = metrics();
  const sleeperTotals = qualityTotals("dormente", sleeperRecords);
  const railTotals = qualityTotals("trilho", railRecords);
  return `<section class="view quality-view"><div class="page-heading"><div><span class="eyebrow">Inspeção e segregação</span><h1>Qualidade de dormentes e trilhos</h1><p>Acompanhe ocorrências dos dois materiais e registre cada inspeção de campo.</p></div>${canEdit() ? '<div class="heading-actions"><button class="button button-yellow" data-new-sleeper>+ Lançar dormentes</button><button class="button button-outline" data-new-rail>+ Lançar trilhos</button></div>' : ""}</div><div class="quality-hero-grid"><article class="panel quality-overview clickable" data-chart-modal="quality-dormente" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Dormentes</span><h2>Ocorrências acumuladas</h2></div><span class="expand-hint">Ampliar ↗</span></div>${renderQualityDonut("dormente", sleeperRecords)}</article><article class="panel quality-overview clickable" data-chart-modal="quality-trilho" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Trilhos</span><h2>Inspeções e avarias</h2></div><span class="expand-hint">Ampliar ↗</span></div>${renderQualityDonut("trilho", railRecords)}</article></div><article class="panel quality-kpis quality-kpis-wide"><div><span>Dormentes recebidos</span><strong>${formatNumber(value.sleepers)}</strong></div><div><span>Dormentes reprovados</span><strong class="danger-text">${formatNumber(value.rejected)}</strong></div><div><span>Trilhos recebidos</span><strong>${formatNumber(value.rails)}</strong></div><div><span>Trilhos reprovados</span><strong class="danger-text">${formatNumber(value.railRejected)}</strong></div></article><div class="quality-section-heading"><span class="eyebrow">Separação de dormentes</span><h2>Classificações cadastradas</h2></div><div class="quality-category-grid">${state.categories.map((category) => `<article class="category-card" style="--category:${category.color}"><i></i><span>${escapeHtml(category.label)}</span><strong>${formatNumber(sleeperTotals[category.id])}</strong><small>ocorrências acumuladas</small></article>`).join("")}</div><div class="quality-section-heading"><span class="eyebrow">Inspeção dos trilhos</span><h2>Classificações ferroviárias</h2></div><div class="quality-category-grid rail-categories">${RAIL_QUALITY_CATEGORIES.map((category) => `<article class="category-card" style="--category:${category.color}"><i></i><span>${escapeHtml(category.label)}</span><strong>${formatNumber(railTotals[category.id])}</strong><small>ocorrências acumuladas</small></article>`).join("")}</div>${canEdit() ? `<article class="panel category-manager"><div><span class="eyebrow">Personalizar dormentes</span><h2>Adicionar nova classificação</h2><p>Ex.: fissuras, ombreira danificada ou cordoalha aparente.</p></div><div class="category-add-form"><input name="qualityNewCategory" placeholder="Nome da classificação" /><button class="button button-dark" data-add-category-page>Adicionar</button></div></article>` : ""}<article class="panel"><div class="panel-heading"><div><span class="eyebrow">Lançamentos</span><h2>Últimas inspeções de materiais</h2></div></div>${renderRecordsTable(state.records.slice(0, 12), true)}</article></section>`;
}

function rejectionReasonLabel(rejection) {
  return String(rejection.reason || state.rejectionReasons.find((reason) => reason.id === rejection.reasonId)?.label || "Motivo não informado");
}

function rejectedSleeperRows(records = state.records) {
  return records.filter((record) => record.material === "dormente").flatMap((record) => rejectionRows(record).map((rejection, rejectionIndex) => {
    const items = invoiceItems(record);
    let invoiceIndex = items.findIndex((item) => String(item.number) === String(rejection.invoiceNumber));
    if (invoiceIndex < 0) invoiceIndex = 0;
    const item = items[invoiceIndex] || { number: rejection.invoiceNumber || "", quantity: 0, photos: [] };
    return { record, rejection, rejectionIndex, item, invoiceIndex, reason: rejectionReasonLabel(rejection) };
  })).sort((a, b) => String(b.record.receivedAt || b.record.receivedDate).localeCompare(String(a.record.receivedAt || a.record.receivedDate)));
}

function filteredRejectedSleepers() {
  const { search, location, reason, from, to } = state.rejectionFilters;
  const needle = search.trim().toLocaleLowerCase("pt-BR");
  return rejectedSleeperRows().filter((row) => {
    const date = row.record.receivedDate || String(row.record.receivedAt || "").slice(0, 10);
    const searchable = [row.item.number, row.record.location, row.record.supplier, row.record.vehiclePlate, row.record.inspectorName, row.rejection.mold, row.rejection.cavity, row.reason, row.record.observations].join(" ").toLocaleLowerCase("pt-BR");
    return (!from || date >= from) && (!to || date <= to) && (!location || locationKey(row.record.location) === location) && (!reason || row.reason === reason) && (!needle || searchable.includes(needle));
  });
}

function renderRejectedSleeperTable(rows) {
  if (!rows.length) return '<div class="empty-state rejection-empty"><span>✓</span><h3>Nenhum dormente reprovado encontrado</h3><p>Não há reprovações com os filtros escolhidos.</p></div>';
  return `<div class="rejection-table"><table><thead><tr><th>Data / horário</th><th>NF / quantidade</th><th>Local</th><th>Identificação</th><th>Motivo</th><th>Rastreabilidade</th><th>Observações</th><th>Fotos</th><th class="no-print">Ações</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${formatDate(row.record.receivedDate || row.record.receivedAt)}</strong><small>${escapeHtml(row.record.receivedTime || "Horário não informado")}</small></td><td><strong>NF ${escapeHtml(row.item.number || row.rejection.invoiceNumber || "—")}</strong><small>${formatNumber(row.item.quantity)} dormentes recebidos</small></td><td><strong>${escapeHtml(row.record.location || "Não informado")}</strong><small>${escapeHtml(row.record.supplier || "Fornecedor não informado")}</small></td><td><strong>Molde ${escapeHtml(row.rejection.mold || "—")}</strong><small>Cavidade ${escapeHtml(row.rejection.cavity || "—")}</small></td><td class="rejection-reason-cell">${escapeHtml(row.reason)}</td><td><strong>${escapeHtml(row.record.vehiclePlate || "Placa não informada")}</strong><small>${escapeHtml(row.record.inspectorName || CONTROL_OWNER)}</small></td><td class="rejection-observation-cell">${escapeHtml(row.record.observations || "Sem observações")}</td><td><strong>${formatNumber(row.item.photos?.length || 0)}</strong><small>foto(s) da NF</small></td><td class="report-row-actions no-print"><button data-view-invoice="${escapeHtml(row.record.id)}" data-invoice-index="${row.invoiceIndex}">Ver NF</button>${canEdit() ? `<button data-edit-invoice="${escapeHtml(row.record.id)}" data-invoice-index="${row.invoiceIndex}">Editar</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderRejectedSleeperCards(rows) {
  return `<div class="rejection-cards">${rows.map((row) => `<article class="rejection-card"><header><span class="invoice-status-pill is-rejected">Reprovado</span><time>${formatDate(row.record.receivedDate || row.record.receivedAt)}</time></header><h3>Molde ${escapeHtml(row.rejection.mold || "—")} • Cavidade ${escapeHtml(row.rejection.cavity || "—")}</h3><p class="rejection-card-reason">${escapeHtml(row.reason)}</p><dl><div><dt>Nota fiscal</dt><dd>NF ${escapeHtml(row.item.number || row.rejection.invoiceNumber || "—")} • ${formatNumber(row.item.quantity)} recebidos</dd></div><div><dt>Local</dt><dd>${escapeHtml(row.record.location || "Não informado")}</dd></div><div><dt>Fornecedor / placa</dt><dd>${escapeHtml(row.record.supplier || "—")} • ${escapeHtml(row.record.vehiclePlate || "placa não informada")}</dd></div><div><dt>Responsável</dt><dd>${escapeHtml(row.record.inspectorName || CONTROL_OWNER)}</dd></div><div><dt>Observações</dt><dd>${escapeHtml(row.record.observations || "Sem observações")}</dd></div><div><dt>Fotos da NF</dt><dd>${formatNumber(row.item.photos?.length || 0)}</dd></div></dl><div class="receiving-card-actions no-print"><button class="button button-dark" data-view-invoice="${escapeHtml(row.record.id)}" data-invoice-index="${row.invoiceIndex}">Ver NF completa</button>${canEdit() ? `<button class="button button-outline" data-edit-invoice="${escapeHtml(row.record.id)}" data-invoice-index="${row.invoiceIndex}">Editar</button>` : ""}</div></article>`).join("")}</div>`;
}

function renderRejections() {
  const rows = filteredRejectedSleepers();
  const allRows = rejectedSleeperRows();
  const affectedInvoices = new Set(rows.map((row) => `${row.record.id}:${row.item.number}`)).size;
  const affectedLocations = new Set(rows.map((row) => locationKey(row.record.location))).size;
  const pendingDetails = rows.filter((row) => !row.rejection.invoiceNumber || !row.rejection.mold || !row.rejection.cavity || row.reason === "Motivo não informado").length;
  const reasons = [...new Set(allRows.map((row) => row.reason))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const period = `${state.rejectionFilters.from ? formatDate(state.rejectionFilters.from) : "Início dos registros"} a ${state.rejectionFilters.to ? formatDate(state.rejectionFilters.to) : "último recebimento"}`;
  const locationLabel = locationGroups().find((group) => group.key === state.rejectionFilters.location)?.label || "Todos os locais";
  return `<section class="view rejections-view"><div class="page-heading no-print"><div><span class="eyebrow">Rastreabilidade de não conformidades</span><h1>Dormentes reprovados</h1><p>Veja somente as peças reprovadas, com identificação, origem, responsável, observações e fotos da nota fiscal.</p></div><div class="heading-actions"><button class="button button-outline" data-export-rejections>Exportar Excel</button><button class="button button-yellow" data-print-rejections>Gerar PDF</button></div></div><article class="panel rejection-filters no-print"><label class="search-field"><span>Buscar NF, molde, cavidade, placa ou motivo</span><input name="rejectionSearch" value="${escapeHtml(state.rejectionFilters.search)}" placeholder="Digite para pesquisar" /></label><label><span>Local</span><select name="rejectionLocation">${renderLocationOptions(state.rejectionFilters.location)}</select></label><label><span>Motivo</span><select name="rejectionReason"><option value="">Todos os motivos</option>${reasons.map((reason) => `<option value="${escapeHtml(reason)}" ${reason === state.rejectionFilters.reason ? "selected" : ""}>${escapeHtml(reason)}</option>`).join("")}</select></label><label><span>De</span><input type="date" name="rejectionFrom" value="${state.rejectionFilters.from}" /></label><label><span>Até</span><input type="date" name="rejectionTo" value="${state.rejectionFilters.to}" /></label><button class="button button-dark" data-apply-rejections>Filtrar</button><button class="text-button" data-clear-rejections>Limpar</button></article><article class="print-report rejection-report"><header class="report-header"><img src="./epya-logo-oficial.png" alt="EPYA" /><div><span>RELATÓRIO DE NÃO CONFORMIDADES</span><h1>Dormentes reprovados</h1><p>Período: ${period}</p><p>Local: <strong>${escapeHtml(locationLabel)}</strong></p><p>Responsável pelo controle: <strong>${CONTROL_OWNER}</strong></p></div><img src="./arauco-sucuriu-logo.svg" alt="ARAUCO Projeto Sucuriú" /></header><div class="report-kpis rejection-kpis"><div><span>Dormentes reprovados</span><strong>${formatNumber(rows.length)}</strong><small>peças individualizadas</small></div><div><span>Notas fiscais afetadas</span><strong>${formatNumber(affectedInvoices)}</strong><small>no filtro selecionado</small></div><div><span>Locais afetados</span><strong>${formatNumber(affectedLocations)}</strong><small>pontos de descarga</small></div><div><span>Dados pendentes</span><strong>${formatNumber(pendingDetails)}</strong><small>identificações incompletas</small></div></div>${renderRejectedSleeperTable(rows)}${renderRejectedSleeperCards(rows)}<footer class="report-footer"><span>Emitido em ${formatDate(todayInput())}</span><span>EPYA • Controle de dormentes reprovados</span></footer></article></section>`;
}

function reportRecords() {
  const { from, to, material, location } = state.reportFilters;
  return state.records.filter((record) => { const date = record.receivedDate || String(record.receivedAt).slice(0, 10); return (!from || date >= from) && (!to || date <= to) && (material === "todos" || record.material === material) && (!location || locationKey(record.location) === location); });
}

function renderReportImageControls() {
  return `<article class="panel report-image-control no-print"><div><span class="eyebrow">Registro fotográfico opcional</span><h2>Adicionar imagens ao relatório</h2><p>Selecione até 6 fotos. Elas aparecerão no PDF com o nome do arquivo.</p></div><label class="invoice-photo-report-toggle"><input type="checkbox" name="includeInvoicePhotos" ${state.includeInvoicePhotos ? "checked" : ""} /> Incluir ${photosForRecords(reportRecords()).length} fotos salvas das NFs selecionadas</label><label class="button button-outline file-button">＋ Selecionar imagens<input type="file" accept="image/*" multiple data-report-images /></label>${state.reportImages.length ? `<div class="report-image-previews">${state.reportImages.map((image) => `<figure><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.name)}" /><figcaption>${escapeHtml(image.name)}</figcaption><button type="button" data-remove-report-image="${image.id}" aria-label="Remover ${escapeHtml(image.name)}">×</button></figure>`).join("")}</div>` : '<span class="report-image-empty">Nenhuma imagem selecionada.</span>'}</article>`;
}

function renderReportPhotoSection() {
  const stored = state.includeInvoicePhotos ? photosForRecords(reportRecords()) : [];
  if (!state.reportImages.length && !stored.length) return "";
  return `<section class="report-photo-section"><h2>Registro fotográfico</h2>${stored.length ? renderPhotoGallery(stored) : ""}${state.reportImages.length ? `<div class="report-photo-grid">${state.reportImages.map((image) => `<figure><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.name)}" /><figcaption>${escapeHtml(image.name)}</figcaption></figure>`).join("")}</div>` : ""}</section>`;
}

function renderReportMaterialSwitch() {
  const options = [
    { id: "todos", label: "Todos", detail: "Visão conjunta", icon: "▦" },
    { id: "dormente", label: "Dormentes", detail: "Somente dormentes", icon: "D" },
    { id: "trilho", label: "Trilhos", detail: "Somente trilhos", icon: "T" },
  ];
  return `<article class="panel report-material-panel no-print"><div><span class="eyebrow">Material do relatório</span><h2>O que deseja apresentar?</h2><p>Escolha um material ou mantenha a visão conjunta.</p></div><div class="report-material-switch" role="group" aria-label="Selecionar material do relatório">${options.map((option) => `<button type="button" class="${state.reportFilters.material === option.id ? "active" : ""}" data-report-material="${option.id}" aria-pressed="${state.reportFilters.material === option.id}"><i>${option.icon}</i><span><strong>${option.label}</strong><small>${option.detail}</small></span></button>`).join("")}</div></article>`;
}

function reportInvoiceRows(records) {
  return records.flatMap((record) => invoiceItems(record).map((item, index) => ({
    record,
    item,
    index,
    quality: invoiceQuality(record, item, index),
  })));
}

function invoiceRejectedCount(row) {
  if (row.record.material === "dormente") return Math.max(number(row.quality.reprovados), rejectionsForInvoice(row.record, row.item.number).length);
  return number(row.quality["trilho-reprovados"] ?? row.quality.reprovados);
}

function invoiceDefectCount(row) {
  return qualityCategories(row.record.material).reduce((sum, category) => sum + number(row.quality[category.id]), 0);
}

function invoiceCompletion(row) {
  const qualityWasRecorded = row.item.quality && qualityCategories(row.record.material).some((category) => Object.prototype.hasOwnProperty.call(row.item.quality, category.id));
  const checks = [
    { label: "número da NF", ok: Boolean(String(row.item.number || "").trim()) },
    { label: "data", ok: Boolean(row.record.receivedDate || row.record.receivedAt) },
    { label: "quantidade recebida", ok: number(row.item.quantity) > 0 },
    { label: "defeitos", ok: Boolean(qualityWasRecorded) },
    { label: "local da entrega", ok: Boolean(String(row.record.location || "").trim()) },
  ];
  const completed = checks.filter((check) => check.ok).length;
  return {
    percentage: Math.round((completed / checks.length) * 100),
    missing: checks.filter((check) => !check.ok).map((check) => check.label),
  };
}

function joinTextParts(parts) {
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}

function materialQuantityLabel(material, quantity) {
  if (material === "trilho") return quantity === 1 ? "trilho" : "trilhos";
  return quantity === 1 ? "dormente" : "dormentes";
}

function qualityTextForRows(rows, material) {
  const totals = Object.fromEntries(qualityCategories(material).map((category) => [category.id, 0]));
  rows.forEach((row) => qualityCategories(material).forEach((category) => { totals[category.id] += number(row.quality[category.id]); }));
  const parts = qualityCategories(material)
    .map((category) => ({ label: category.label.toLocaleLowerCase("pt-BR"), value: totals[category.id] }))
    .filter((entry) => entry.value > 0)
    .map((entry) => `${formatNumber(entry.value)} ${entry.label}`);
  return parts.length ? joinTextParts(parts) : "nenhuma ocorrência registrada";
}

function descriptiveReportText(records = reportRecords()) {
  const rows = reportInvoiceRows(records).sort((a, b) => {
    const dateOrder = String(a.record.receivedDate || a.record.receivedAt).localeCompare(String(b.record.receivedDate || b.record.receivedAt));
    if (dateOrder) return dateOrder;
    const materialOrder = a.record.material.localeCompare(b.record.material);
    if (materialOrder) return materialOrder;
    return String(a.item.number).localeCompare(String(b.item.number), "pt-BR", { numeric: true });
  });
  const material = state.reportFilters.material;
  const materialTitle = material === "todos" ? "DORMENTES E TRILHOS" : MATERIALS[material].label.toLocaleUpperCase("pt-BR");
  const lines = [
    `*RELATÓRIO DESCRITIVO — ${materialTitle}*`,
    `Período: ${state.reportFilters.from ? formatDate(state.reportFilters.from) : "Início dos registros"} a ${state.reportFilters.to ? formatDate(state.reportFilters.to) : "último recebimento"}`,
    `Local de descarga: ${reportLocationLabel()}`,
  ];
  if (!rows.length) return `${lines.join("\n")}\n\nNenhum recebimento encontrado para os filtros escolhidos.`;

  const groups = new Map();
  rows.forEach((row) => {
    const date = row.record.receivedDate || String(row.record.receivedAt).slice(0, 10);
    const key = `${date}|${row.record.material}|${locationKey(row.record.location)}`;
    if (!groups.has(key)) groups.set(key, { date, material: row.record.material, location: String(row.record.location || "").trim() || "Local não informado", rows: [] });
    groups.get(key).rows.push(row);
  });

  groups.forEach((group) => {
    const total = group.rows.reduce((sum, row) => sum + number(row.item.quantity), 0);
    const groupHeading = material === "todos" ? `${formatDate(group.date)} — ${MATERIALS[group.material].label}` : formatDate(group.date);
    lines.push("", `*${groupHeading}*`);
    if (!state.reportFilters.location) lines.push(`Local de descarga: ${group.location}`);
    lines.push(`Foram recebidos *${formatNumber(total)} ${materialQuantityLabel(group.material, total)}*, distribuídos em *${formatNumber(group.rows.length)} ${group.rows.length === 1 ? "nota fiscal" : "notas fiscais"}*:`);
    group.rows.forEach((row) => lines.push(`• NF ${row.item.number || "não informada"} — ${formatNumber(row.item.quantity)} ${materialQuantityLabel(group.material, number(row.item.quantity))}`));
    lines.push(`Qualidade: ${qualityTextForRows(group.rows, group.material)}.`);
    group.rows.forEach((row) => {
      rejectionsForInvoice(row.record, row.item.number).forEach((rejection) => {
        const reason = rejection.reason || state.rejectionReasons.find((item) => item.id === rejection.reasonId)?.label || "motivo não informado";
        lines.push(`• Reprovação na NF ${row.item.number}: ${reason}, molde ${rejection.mold || "não informado"} e cavidade ${rejection.cavity || "não informada"}.`);
      });
    });
  });

  const value = metrics(records);
  lines.push("", "*RESUMO DO PERÍODO*");
  if (material === "todos" || material === "dormente") lines.push(`• Dormentes recebidos: ${formatNumber(value.sleepers)} em ${formatNumber(value.sleeperNfs)} NFs`);
  if (material === "todos" || material === "trilho") lines.push(`• Trilhos recebidos: ${formatNumber(value.rails)} em ${formatNumber(value.railNfs)} NFs`);
  if (material === "todos") lines.push(`• Total de notas fiscais: ${formatNumber(value.totalNfs)}`);
  if (material === "dormente") lines.push(`• Qualidade acumulada: ${qualityTextForRows(rows, "dormente")}`);
  if (material === "trilho") lines.push(`• Qualidade acumulada: ${qualityTextForRows(rows, "trilho")}`);
  if (material === "todos") {
    const sleeperRows = rows.filter((row) => row.record.material === "dormente");
    const railRows = rows.filter((row) => row.record.material === "trilho");
    lines.push(`• Qualidade dos dormentes: ${qualityTextForRows(sleeperRows, "dormente")}`);
    lines.push(`• Qualidade dos trilhos: ${qualityTextForRows(railRows, "trilho")}`);
  }
  return lines.join("\n");
}

function renderTextReportEditor() {
  const text = state.reportTextDraft || descriptiveReportText();
  return `<div class="report-text-editor-wrap"><label class="report-text-editor-label"><span>Texto do relatório</span><textarea class="report-text-editor" name="reportTextEditor" spellcheck="true" aria-label="Editar texto do relatório">${escapeHtml(text)}</textarea></label><div class="report-text-editor-options"><label><span>E-mail do destinatário</span><input type="email" name="reportEmail" value="${OWNER_EMAIL}" placeholder="destinatario@empresa.com" /></label><p>Você pode corrigir, acrescentar ou retirar qualquer informação acima antes de copiar ou enviar.</p></div></div>`;
}

function reportRejectionRows(records) {
  return records.flatMap((record) => rejectionRows(record).map((rejection) => ({ record, rejection })));
}

function renderReportRejections(records) {
  const rows = reportRejectionRows(records);
  if (!rows.length) return "";
  return `<section class="report-rejections"><h2>Dormentes reprovados</h2><table><thead><tr><th>Data</th><th>NF</th><th>Molde</th><th>Cavidade</th><th>Motivo da reprovação</th></tr></thead><tbody>${rows.map(({ record, rejection }) => `<tr><td>${formatDate(record.receivedDate)}</td><td>${escapeHtml(rejection.invoiceNumber || "—")}</td><td>${escapeHtml(rejection.mold || "—")}</td><td>${escapeHtml(rejection.cavity || "—")}</td><td>${escapeHtml(rejection.reason || state.rejectionReasons.find((reason) => reason.id === rejection.reasonId)?.label || "—")}</td></tr>`).join("")}</tbody></table></section>`;
}

function renderReportKpis(records) {
  const value = metrics(records);
  if (state.reportFilters.material === "dormente") return `<div class="report-kpis material-dormente"><div><span>Dormentes recebidos</span><strong>${formatNumber(value.sleepers)}</strong><small>${value.sleeperNfs} NFs</small></div><div><span>Notas fiscais</span><strong>${formatNumber(value.sleeperNfs)}</strong><small>${value.records} lançamentos</small></div><div><span>Ocorrências de qualidade</span><strong>${formatNumber(value.sleeperOccurrences)}</strong><small>classificações registradas</small></div><div><span>Dormentes reprovados</span><strong>${formatNumber(value.rejected)}</strong><small>identificados individualmente</small></div></div>`;
  if (state.reportFilters.material === "trilho") return `<div class="report-kpis material-trilho"><div><span>Trilhos recebidos</span><strong>${formatNumber(value.rails)}</strong><small>${value.railNfs} NFs</small></div><div><span>Notas fiscais</span><strong>${formatNumber(value.railNfs)}</strong><small>${value.records} lançamentos</small></div><div><span>Ocorrências de qualidade</span><strong>${formatNumber(value.railOccurrences)}</strong><small>classificações registradas</small></div><div><span>Trilhos reprovados</span><strong>${formatNumber(value.railRejected)}</strong><small>nas inspeções selecionadas</small></div></div>`;
  return `<div class="report-kpis material-todos"><div><span>Dormentes</span><strong>${formatNumber(value.sleepers)}</strong><small>${value.sleeperNfs} NFs</small></div><div><span>Trilhos</span><strong>${formatNumber(value.rails)}</strong><small>${value.railNfs} NFs</small></div><div><span>Total de NFs</span><strong>${formatNumber(value.totalNfs)}</strong><small>${value.records} lançamentos</small></div><div><span>Ocorrências de qualidade</span><strong>${formatNumber(value.sleeperOccurrences + value.railOccurrences)}</strong><small>${formatNumber(value.sleeperOccurrences)} dormentes • ${formatNumber(value.railOccurrences)} trilhos</small></div></div>`;
}

function renderReportTable(records) {
  const rows = reportInvoiceRows(records);
  const meta = (row) => {
    const rejected = invoiceRejectedCount(row);
    const completion = invoiceCompletion(row);
    const status = rejected > 0 ? "is-rejected" : "is-ok";
    const statusLabel = rejected > 0 ? `${formatNumber(rejected)} reprovado${rejected === 1 ? "" : "s"}` : "OK";
    const missing = completion.missing.length ? `Falta: ${completion.missing.join(", ")}` : "Dados essenciais completos";
    const nfCell = `<td class="report-nf-cell"><strong>NF ${escapeHtml(row.item.number || "—")}</strong><span class="invoice-status-pill ${status}">${statusLabel}</span></td>`;
    const completionCell = `<td class="report-completion-cell" title="${escapeHtml(missing)}"><div><strong>${completion.percentage}%</strong><small>${escapeHtml(missing)}</small></div><span class="invoice-completion-track" role="progressbar" aria-label="Preenchimento da NF ${escapeHtml(row.item.number || "não informada")}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${completion.percentage}"><i style="width:${completion.percentage}%"></i></span></td>`;
    const actionsCell = `<td class="report-row-actions no-print"><button type="button" data-view-invoice="${row.record.id}" data-invoice-index="${row.index}">Ver</button>${canEdit() ? `<button type="button" data-edit-invoice="${row.record.id}" data-invoice-index="${row.index}">Editar</button>` : ""}</td>`;
    return { rejected, completion, status, nfCell, completionCell, actionsCell };
  };
  const baseCells = (row, rowMeta) => `<td>${formatDate(row.record.receivedDate)}</td>${rowMeta.nfCell}<td>${escapeHtml(row.record.location || "—")}</td><td>${formatNumber(row.item.quantity)}</td>`;
  if (state.reportFilters.material === "dormente") return `<h2 class="report-table-title">Detalhamento por nota fiscal — dormentes</h2><div class="report-table"><table><thead><tr><th>Data</th><th>NF / situação</th><th>Local</th><th>Qtd.</th><th>PQ</th><th>R</th><th>B</th><th>Quebras</th><th>Reprovados</th><th>Preenchimento</th><th class="no-print">Ações</th></tr></thead><tbody>${rows.map((row) => { const summary = sleeperQualitySummary(row.quality); const rowMeta = meta(row); return `<tr class="report-invoice-row ${rowMeta.status}">${baseCells(row, rowMeta)}<td>${formatNumber(summary.smallBreaks)}</td><td>${formatNumber(summary.repaired)}</td><td>${formatNumber(summary.bubbles)}</td><td>${formatNumber(summary.breaks)}</td><td>${formatNumber(rowMeta.rejected)}</td>${rowMeta.completionCell}${rowMeta.actionsCell}</tr>`; }).join("")}</tbody></table></div>`;
  if (state.reportFilters.material === "trilho") return `<h2 class="report-table-title">Detalhamento por nota fiscal — trilhos</h2><div class="report-table"><table><thead><tr><th>Data</th><th>NF / situação</th><th>Local</th><th>Qtd.</th><th>Empeno</th><th>Oxidação</th><th>Boleto</th><th>Alma</th><th>Patim</th><th>Reprovados</th><th>Preenchimento</th><th class="no-print">Ações</th></tr></thead><tbody>${rows.map((row) => { const summary = railQualitySummary(row.quality); const rowMeta = meta(row); return `<tr class="report-invoice-row ${rowMeta.status}">${baseCells(row, rowMeta)}<td>${formatNumber(summary.bending)}</td><td>${formatNumber(summary.oxidation)}</td><td>${formatNumber(summary.head)}</td><td>${formatNumber(summary.web)}</td><td>${formatNumber(summary.foot)}</td><td>${formatNumber(rowMeta.rejected)}</td>${rowMeta.completionCell}${rowMeta.actionsCell}</tr>`; }).join("")}</tbody></table></div>`;
  return `<h2 class="report-table-title">Detalhamento por nota fiscal — visão conjunta</h2><div class="report-table"><table><thead><tr><th>Data</th><th>Material</th><th>NF / situação</th><th>Local</th><th>Qtd.</th><th>Ocorrências de qualidade</th><th>Preenchimento</th><th class="no-print">Ações</th></tr></thead><tbody>${rows.map((row) => { const details = qualityCategories(row.record.material).map((category) => ({ label: category.label, value: number(row.quality[category.id]) })).filter((entry) => entry.value > 0).map((entry) => `${entry.label}: ${formatNumber(entry.value)}`).join(" • ") || "Sem ocorrências"; const rowMeta = meta(row); return `<tr class="report-invoice-row ${rowMeta.status}"><td>${formatDate(row.record.receivedDate)}</td><td>${MATERIALS[row.record.material].label}</td>${rowMeta.nfCell}<td>${escapeHtml(row.record.location || "—")}</td><td>${formatNumber(row.item.quantity)}</td><td class="report-quality-cell">${escapeHtml(details)}</td>${rowMeta.completionCell}${rowMeta.actionsCell}</tr>`; }).join("")}</tbody></table></div>`;
}

function renderReports() {
  const records = reportRecords();
  const material = state.reportFilters.material;
  const materialLabel = material === "todos" ? "Dormentes e trilhos" : MATERIALS[material].label;
  const pdfLabel = material === "todos" ? "Gerar PDF: Ambos" : `Gerar PDF: ${MATERIALS[material].label}`;
  return `<section class="view reports-view">
    <div class="page-heading no-print"><div><span class="eyebrow">Relatório semanal e por período</span><h1>Relatórios da obra</h1><p>Escolha o período, o material e o local de descarga. O PDF, a planilha e o texto para mensagem respeitam exatamente os filtros selecionados.</p></div><div class="heading-actions"><button class="button button-outline" data-report-week>Últimos 7 dias</button><button class="button button-outline" data-export-report>Exportar Excel</button><button class="button button-outline" data-open-report-text>Gerar texto</button><button class="button button-yellow" data-print-report>${pdfLabel}</button></div></div>
    ${renderReportMaterialSwitch()}
    <article class="panel report-filters no-print"><label><span>Data inicial</span><input type="date" name="reportFrom" value="${state.reportFilters.from}" /></label><label><span>Data final</span><input type="date" name="reportTo" value="${state.reportFilters.to}" /></label><label><span>Material selecionado</span><select name="reportMaterial"><option value="todos">Todos os materiais</option><option value="dormente" ${state.reportFilters.material === "dormente" ? "selected" : ""}>Dormentes</option><option value="trilho" ${state.reportFilters.material === "trilho" ? "selected" : ""}>Trilhos</option></select></label><label><span>Local de descarga</span><select name="reportLocation">${renderLocationOptions(state.reportFilters.location)}</select></label><button class="button button-dark" data-apply-report>Atualizar relatório</button></article>
    ${renderReportImageControls()}
    <article class="print-report"><header class="report-header"><img src="./epya-logo-oficial.png" alt="EPYA" /><div><span>RELATÓRIO DE RECEBIMENTO DE MATERIAIS</span><h1>ARAUCO / Projeto Sucuriú</h1><p>Material: <strong>${materialLabel}</strong></p><p>Período: ${state.reportFilters.from ? formatDate(state.reportFilters.from) : "Início dos registros"} a ${state.reportFilters.to ? formatDate(state.reportFilters.to) : "último recebimento"}</p><p>Local de descarga: <strong>${escapeHtml(reportLocationLabel())}</strong></p><p>Responsável pelo controle: <strong>${CONTROL_OWNER}</strong></p></div><img src="./arauco-sucuriu-logo.svg" alt="ARAUCO Projeto Sucuriú" /></header>
      ${renderReportKpis(records)}
      <div class="report-charts"><section class="clickable" data-chart-modal="report-week" tabindex="0"><div class="report-chart-heading"><h2>Comparação semanal</h2><span>Ampliar ↗</span></div>${renderComparisonChart("week", records)}</section><section class="clickable" data-chart-modal="report-quality" tabindex="0"><div class="report-chart-heading"><h2>Qualidade — ${materialLabel}</h2><span>Ampliar ↗</span></div>${renderReportQuality(records, material)}</section></div>
      ${renderReportTable(records)}
      ${renderReportRejections(records)}${renderReportPhotoSection()}<footer class="report-footer"><span>Emitido em ${formatDate(todayInput())}</span><span>EPYA • Controle diário de recebimentos</span></footer></article>
    <article class="panel email-report no-print"><div><span class="eyebrow">Compartilhamento</span><h2>Relatório para mensagem</h2><p>Abra o texto somente quando precisar. Você poderá editar todo o conteúdo antes de copiar, enviar por e-mail ou WhatsApp.</p></div><button class="button button-dark" data-open-report-text>Abrir e editar texto</button></article>
  </section>`;
}

function renderTeam() {
  if (state.user?.role !== "admin") return renderDashboard();
  return `<section class="view team-view"><div class="page-heading"><div><span class="eyebrow">Segurança e acompanhamento</span><h1>E-mails autorizados</h1><p>Libere consulta, operação ou administração para novos integrantes.</p></div></div><div class="team-grid"><article class="panel team-form-panel"><span class="eyebrow">Novo acesso</span><h2>Adicionar e-mail</h2><label><span>Nome</span><input name="teamFullName" placeholder="Nome completo" /></label><label><span>E-mail</span><input type="email" name="teamEmail" placeholder="nome@empresa.com" /></label><label><span>Permissão</span><select name="teamRole"><option value="viewer">Consulta — somente acompanhar</option><option value="editor">Operação — lançar e editar</option><option value="admin">Administrador — gerenciar acessos</option></select></label><button class="button button-yellow" data-add-user>Adicionar acesso</button><p class="security-note">Cadastre o e-mail e envie o link seguro. No primeiro acesso, cada pessoa confirma a própria conta do ChatGPT; o site não cria nem armazena senhas. Quem não estiver nesta lista não consegue visualizar os registros.</p></article><article class="panel team-list-panel"><div class="panel-heading"><div><span class="eyebrow">Equipe liberada</span><h2>${state.team.filter((user) => user.active).length} acesso(s) ativo(s)</h2></div></div>${state.teamLoaded ? `<div class="team-list">${state.team.map((user) => `<div class="team-row ${user.active ? "" : "inactive"}"><span class="team-avatar">${escapeHtml((user.fullName || user.email).slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(user.fullName || "Sem nome")}</strong><small>${escapeHtml(user.email)}</small></div><span class="role-pill">${user.role === "admin" ? "Administrador" : user.role === "viewer" ? "Consulta" : "Operação"}</span>${user.email === OWNER_EMAIL ? '<span class="owner-pill">Acesso principal</span>' : user.active ? `<button class="danger-link" data-remove-user="${user.id}">Remover</button>` : '<span class="status-pill">Inativo</span>'}</div>`).join("")}</div>` : '<div class="loading-inline"><span class="spinner"></span> Carregando acessos…</div>'}</article></div></section>`;
}

function renderModal() {
  if (!state.modal) return "";
  let title = "Detalhes";
  let subtitle = "Dados do painel";
  let body = "";
  let footer = '<button class="button button-outline" data-modal-close>Fechar</button><button class="button button-dark" data-print-report>Gerar PDF do painel</button>';
  if (state.modal.type === "goal-form") {
    title = "Adicionar meta";
    subtitle = "Planejamento da obra";
    body = `<form class="goal-form" data-goal-form><label class="span-two"><span>Nome da meta *</span><input name="goalTitle" maxlength="120" required placeholder="Ex.: Meta de trilhos da Pera" /></label><label><span>Material *</span><select name="goalMaterial"><option value="dormente">Dormentes</option><option value="trilho">Trilhos</option></select></label><label><span>Quantidade da meta *</span><input type="number" min="1" name="goalTarget" required placeholder="Ex.: 20000" /></label><label class="span-two"><span>Local de descarga</span><select name="goalLocation">${renderGoalLocationOptions()}</select><small>Deixe “Todos os locais” para uma meta geral.</small></label><label><span>Contar lançamentos desde</span><input type="date" name="goalStart" /></label><label><span>Prazo da meta</span><input type="date" name="goalDue" /></label></form>`;
    footer = '<button class="button button-outline" data-modal-close>Cancelar</button><button class="button button-yellow" data-save-goal>Salvar meta</button>';
  } else if (state.modal.type === "invoice-photos") {
    const record = state.records.find((item) => item.id === state.modal.id);
    if (!record) return "";
    const item = invoiceItems(record)[number(state.modal.index)];
    if (!item) return "";
    title = `Fotos da NF ${item.number || "pendente"}`;
    subtitle = `${record.location || "Local não informado"} · ${formatDate(record.receivedDate)}`;
    body = renderPhotoGallery(item.photos || []);
    footer = '<button class="button button-outline" data-modal-close>Fechar</button>';
  } else if (state.modal.type === "report-text") {
    title = "Relatório em texto";
    subtitle = "Edite antes de copiar ou enviar";
    body = renderTextReportEditor();
    footer = '<button class="button button-outline" data-modal-close>Fechar</button><button class="button button-outline" data-copy-report-text>Copiar texto</button><button class="button button-outline" data-email-report>Preparar e-mail</button><button class="button button-dark" data-whatsapp-report>Enviar no WhatsApp</button>';
  } else if (["week", "month", "report-week", "report-month"].includes(state.modal.type)) {
    const reportMode = state.modal.type.startsWith("report-");
    const period = state.modal.type.replace("report-", "");
    const records = reportMode ? reportRecords() : state.records;
    const grouped = groupedComparison(period, records);
    title = period === "week" ? "Comparação semanal" : "Comparação mensal";
    subtitle = "Dormentes e trilhos recebidos no período";
    body = `<div class="modal-chart">${renderComparisonChart(period, records)}</div><div class="modal-table"><table><thead><tr><th>Período</th><th>Dormentes</th><th>Trilhos</th><th>NFs</th></tr></thead><tbody>${grouped.map((item) => `<tr><td>${comparisonLabel(item, period)}</td><td>${formatNumber(item.dormente)}</td><td>${formatNumber(item.trilho)}</td><td>${item.nfs}</td></tr>`).join("")}</tbody></table></div>`;
  } else if (state.modal.type === "daily") {
    title = "Volume diário";
    subtitle = "Ritmo das chegadas por data";
    const grouped = dailyComparison();
    body = `<div class="modal-chart">${renderDailyChart()}</div><div class="modal-table"><table><thead><tr><th>Data</th><th>Dormentes</th><th>Trilhos</th><th>NFs</th></tr></thead><tbody>${grouped.map((item) => `<tr><td>${formatDate(item.key)}</td><td>${formatNumber(item.dormente)}</td><td>${formatNumber(item.trilho)}</td><td>${item.nfs}</td></tr>`).join("")}</tbody></table></div>`;
  } else if (state.modal.type === "nf-quality") {
    title = "Recebidos × defeitos por NF";
    subtitle = state.nfQualityFilter ? `Resultado para NF ${state.nfQualityFilter}` : "Percentual de ocorrências em cada nota fiscal de dormentes";
    body = `<div class="modal-nf-quality">${renderNfQualityChart(state.records, state.nfQualityFilter, true)}</div>`;
  } else if (["quality", "quality-dormente", "quality-trilho"].includes(state.modal.type)) {
    const material = state.modal.type === "quality-trilho" ? "trilho" : "dormente";
    const categories = qualityCategories(material);
    title = `Qualidade dos ${material === "trilho" ? "trilhos" : "dormentes"}`;
    subtitle = material === "trilho" ? "Inspeção acumulada por tipo de ocorrência" : "Separação acumulada por classificação";
    const totals = qualityTotals(material);
    body = `<div class="modal-quality">${renderQualityDonut(material)}</div><div class="modal-table"><table><thead><tr><th>Classificação</th><th>Quantidade</th></tr></thead><tbody>${categories.map((category) => `<tr><td><i class="table-dot" style="background:${category.color}"></i>${escapeHtml(category.label)}</td><td>${formatNumber(totals[category.id])}</td></tr>`).join("")}</tbody></table></div>`;
  } else if (state.modal.type === "report-quality") {
    const records = reportRecords();
    title = "Qualidade dos materiais";
    subtitle = "Dormentes e trilhos no período selecionado";
    body = `<div class="modal-quality">${renderReportQuality(records)}</div>`;
  } else if (state.modal.type === "invoice") {
    const record = state.records.find((item) => item.id === state.modal.id);
    if (!record) return "";
    const index = number(state.modal.index);
    const item = invoiceItems(record)[index];
    if (!item) return "";
    const row = { record, item, index, quality: invoiceQuality(record, item, index) };
    const rejected = invoiceRejectedCount(row);
    const completion = invoiceCompletion(row);
    const statusClass = rejected > 0 ? "is-rejected" : "is-ok";
    const statusLabel = rejected > 0 ? `${formatNumber(rejected)} reprovado${rejected === 1 ? "" : "s"}` : "NF sem reprovação";
    title = `NF ${item.number || "não informada"}`;
    subtitle = `${MATERIALS[record.material].label} • ${formatDate(record.receivedDate)} • ${record.location || "local não informado"}`;
    const qualityDetails = qualityCategories(record.material).map((category) => `<span><i style="background:${category.color}"></i>${escapeHtml(category.label)} <strong>${formatNumber(row.quality[category.id])}</strong></span>`).join("");
    const invoiceRejections = rejectionsForInvoice(record, item.number);
    const completionDetail = completion.missing.length ? `Falta preencher: ${completion.missing.join(", ")}.` : "Todos os dados essenciais estão preenchidos.";
    body = `<div class="invoice-modal-overview ${statusClass}"><span class="invoice-status-pill ${statusClass}">${statusLabel}</span><div><strong>${completion.percentage}% preenchido</strong><small>${escapeHtml(completionDetail)}</small><span class="invoice-completion-track" role="progressbar" aria-label="Preenchimento da NF" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${completion.percentage}"><i style="width:${completion.percentage}%"></i></span></div></div><div class="record-modal-summary"><div><span>Quantidade recebida</span><strong>${formatNumber(item.quantity)}</strong><small>${MATERIALS[record.material].unit}</small></div><div><span>Defeitos encontrados</span><strong>${formatNumber(invoiceDefectCount(row))}</strong><small>ocorrências nesta NF</small></div><div><span>Local da entrega</span><strong>${escapeHtml(record.location || "—")}</strong><small>${escapeHtml(record.supplier || "Fornecedor não informado")}</small></div><div><span>Data</span><strong>${formatDate(record.receivedDate)}</strong><small>${record.receivedTime || "Horário não informado"}</small></div></div><div class="record-quality-list">${qualityDetails}</div>${invoiceRejections.length ? `<div class="record-rejections"><h3>Detalhes da reprovação</h3><div class="modal-table"><table><thead><tr><th>Molde</th><th>Cavidade</th><th>Motivo</th></tr></thead><tbody>${invoiceRejections.map((rejection) => `<tr><td>${escapeHtml(rejection.mold || "—")}</td><td>${escapeHtml(rejection.cavity || "—")}</td><td>${escapeHtml(rejection.reason || state.rejectionReasons.find((reason) => reason.id === rejection.reasonId)?.label || "—")}</td></tr>`).join("")}</tbody></table></div></div>` : ""}<p class="record-observation"><strong>Observações:</strong> ${escapeHtml(record.observations || "Nenhuma observação.")}</p>${state.modal.type === "invoice" ? `<section class="invoice-photos-detail"><h3>Fotos desta NF</h3>${renderPhotoGallery(invoiceItems(record)[number(state.modal.index)]?.photos || [])}</section>` : ""}`;
    footer = `<button class="button button-outline" data-modal-close>Fechar</button>${canEdit() ? `<button class="button button-dark" data-edit-invoice="${record.id}" data-invoice-index="${index}">Editar esta NF</button>` : ""}`;
  } else if (state.modal.type === "record") {
    const record = state.records.find((item) => item.id === state.modal.id);
    if (!record) return "";
    title = `${MATERIALS[record.material].label} • ${formatDate(record.receivedDate)}`;
    subtitle = `${record.location || "Local não informado"} • ${record.receivedTime || "horário pendente"}`;
    const items = invoiceItems(record);
    const sleeperColumns = record.material === "dormente" ? "<th>PQ</th><th>R</th><th>B</th><th>Quebras</th>" : "";
    const rejectedRows = rejectionRows(record);
    body = `<div class="record-modal-summary"><div><span>Total recebido</span><strong>${formatNumber(recordQuantity(record))}</strong><small>${MATERIALS[record.material].unit}</small></div><div><span>Fornecedor</span><strong>${escapeHtml(record.supplier || "—")}</strong><small>${escapeHtml(record.vehiclePlate || "Sem placa")}</small></div></div><div class="modal-table"><table><thead><tr><th>Nota fiscal</th><th>Quantidade</th>${sleeperColumns}</tr></thead><tbody>${items.map((item, index) => { const summary = sleeperQualitySummary(invoiceQuality(record, item, index)); return `<tr><td>NF ${escapeHtml(item.number)}</td><td>${formatNumber(item.quantity)} ${MATERIALS[record.material].unit}</td>${record.material === "dormente" ? `<td>${formatNumber(summary.smallBreaks)}</td><td>${formatNumber(summary.repaired)}</td><td>${formatNumber(summary.bubbles)}</td><td>${formatNumber(summary.breaks)}</td>` : ""}</tr>`; }).join("")}</tbody></table></div><div class="record-photo-links">${items.map((item, index) => `<button class="button button-outline" data-view-invoice="${escapeHtml(record.id)}" data-invoice-index="${index}">NF ${escapeHtml(item.number)} · ${(item.photos || []).length} fotos · Ver detalhes</button>`).join("")}</div><div class="record-quality-list">${qualityCategories(record.material).map((category) => `<span><i style="background:${category.color}"></i>${escapeHtml(category.label)} <strong>${formatNumber(record.quality?.[category.id])}</strong></span>`).join("")}</div>${rejectedRows.length ? `<div class="record-rejections"><h3>Dormentes reprovados</h3><div class="modal-table"><table><thead><tr><th>NF</th><th>Molde</th><th>Cavidade</th><th>Motivo</th></tr></thead><tbody>${rejectedRows.map((rejection) => `<tr><td>${escapeHtml(rejection.invoiceNumber || "—")}</td><td>${escapeHtml(rejection.mold || "—")}</td><td>${escapeHtml(rejection.cavity || "—")}</td><td>${escapeHtml(rejection.reason || state.rejectionReasons.find((reason) => reason.id === rejection.reasonId)?.label || "—")}</td></tr>`).join("")}</tbody></table></div></div>` : ""}<p class="record-observation"><strong>Responsável:</strong> ${escapeHtml(record.inspectorName || CONTROL_OWNER)}</p><p class="record-observation"><strong>Observações:</strong> ${escapeHtml(record.observations || "Nenhuma observação.")}</p>${state.modal.type === "invoice" ? `<section class="invoice-photos-detail"><h3>Fotos desta NF</h3>${renderPhotoGallery(invoiceItems(record)[number(state.modal.index)]?.photos || [])}</section>` : ""}`;
    footer = `<button class="button button-outline" data-modal-close>Fechar</button>${canEdit() ? `<button class="button button-outline danger" data-delete-record="${escapeHtml(record.id)}">Excluir recebimento</button><button class="button button-dark" data-edit-record="${escapeHtml(record.id)}">Editar</button>` : ""}`;
  }
  return `<div class="modal-backdrop" data-modal-close><section class="chart-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" onclick="event.stopPropagation()"><header><div><span class="eyebrow">${escapeHtml(subtitle)}</span><h2>${escapeHtml(title)}</h2></div><button data-modal-close aria-label="Fechar">×</button></header>${body}<footer>${footer}</footer></section></div>`;
}

function bindEvents() {
  document.querySelectorAll("[data-dashboard-tab]").forEach((button) => {
    button.addEventListener("click", () => { state.dashboardTab = button.dataset.dashboardTab; render(); });
    button.addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); state.dashboardTab = state.dashboardTab === "overview" ? "locations" : "overview"; render(); document.querySelector(`[data-dashboard-tab="${state.dashboardTab}"]`)?.focus(); });
  });
  document.querySelector('[name="dashboardLocation"]')?.addEventListener("change", (event) => { state.dashboardLocation = event.target.value; render(); });
  document.querySelector("[data-show-pending]")?.addEventListener("click", () => { state.historyFilters = { search: "", material: "todos", from: "", to: "", pending: true }; navigate("history"); });
  document.querySelector('[name="historyPending"]')?.addEventListener("change", applyHistoryFilters);
  document.querySelector('[name="includeInvoicePhotos"]')?.addEventListener("change", (event) => { syncReportFiltersFromDom(); state.includeInvoicePhotos = event.target.checked; render(); });
  document.querySelectorAll("[data-retry-photos]").forEach((button) => button.addEventListener("click", () => loadVisiblePhotos(true)));
  document.querySelectorAll("[data-location-report]").forEach((button) => button.addEventListener("click", () => openLocationReport(button.dataset.locationReport)));
  document.querySelectorAll("[data-add-goal]").forEach((button) => button.addEventListener("click", () => { state.modal = { type: "goal-form" }; render(); requestAnimationFrame(() => document.querySelector('[name="goalTitle"]')?.focus()); }));
  document.querySelector("[data-save-goal]")?.addEventListener("click", saveGoal);
  document.querySelector("[data-goal-form]")?.addEventListener("submit", (event) => { event.preventDefault(); saveGoal(); });
  document.querySelectorAll("[data-delete-goal]").forEach((button) => button.addEventListener("click", () => deleteGoal(button.dataset.deleteGoal)));
  document.querySelector("[data-admin-access]")?.addEventListener("click", openAdminAccess);
  document.querySelector("[data-sign-out]")?.addEventListener("click", signOut);
  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.nav)));
  document.querySelectorAll("[data-new-record]").forEach((button) => button.addEventListener("click", () => newRecord()));
  document.querySelector("[data-new-sleeper]")?.addEventListener("click", () => newRecord("dormente"));
  document.querySelector("[data-new-rail]")?.addEventListener("click", () => newRecord("trilho"));
  document.querySelector("[data-theme-toggle]")?.addEventListener("click", toggleTheme);
  document.querySelectorAll("[data-tv-toggle]").forEach((button) => button.addEventListener("click", toggleTv));
  document.querySelectorAll("[data-install]").forEach((button) => button.addEventListener("click", installApp));
  document.querySelectorAll("[data-chart-modal]").forEach((card) => { const open = () => { state.modal = { type: card.dataset.chartModal }; render(); }; card.addEventListener("click", open); card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") open(); }); });
  document.querySelectorAll("[data-modal-close]").forEach((button) => button.addEventListener("click", () => { state.modal = null; render(); }));
  document.querySelectorAll("[data-view-record]").forEach((button) => button.addEventListener("click", () => { state.modal = { type: "record", id: button.dataset.viewRecord }; render(); }));
  document.querySelectorAll("[data-view-invoice]").forEach((button) => button.addEventListener("click", () => { state.modal = { type: "invoice", id: button.dataset.viewInvoice, index: number(button.dataset.invoiceIndex) }; render(); }));
  document.querySelectorAll("[data-edit-record]").forEach((button) => button.addEventListener("click", () => editRecord(button.dataset.editRecord)));
  document.querySelectorAll("[data-edit-invoice]").forEach((button) => button.addEventListener("click", () => editRecord(button.dataset.editInvoice, number(button.dataset.invoiceIndex))));
  document.querySelectorAll("[data-delete-record]").forEach((button) => button.addEventListener("click", () => deleteRecord(button.dataset.deleteRecord)));
  document.querySelector("[data-export-csv]")?.addEventListener("click", () => exportCsv(filteredHistory()));
  document.querySelector("[data-export-rejections]")?.addEventListener("click", exportRejectedCsv);
  document.querySelector("[data-print-rejections]")?.addEventListener("click", printRejectedReport);
  document.querySelector("[data-export-report]")?.addEventListener("click", () => { syncReportFiltersFromDom(); exportCsv(reportRecords()); });
  document.querySelectorAll("[data-print-report]").forEach((button) => button.addEventListener("click", printReport));
  document.querySelectorAll("[data-open-report-text]").forEach((button) => button.addEventListener("click", openReportText));
  document.querySelector("[data-email-report]")?.addEventListener("click", emailReport);
  document.querySelectorAll("[data-whatsapp-report]").forEach((button) => button.addEventListener("click", whatsappReport));
  document.querySelectorAll("[data-copy-report-text]").forEach((button) => button.addEventListener("click", copyReportText));
  document.querySelector("[data-add-user]")?.addEventListener("click", addTeamMember);
  document.querySelectorAll("[data-remove-user]").forEach((button) => button.addEventListener("click", () => removeTeamMember(button.dataset.removeUser)));
  document.querySelector("[data-apply-history]")?.addEventListener("click", applyHistoryFilters);
  document.querySelector("[data-clear-history]")?.addEventListener("click", () => { state.historyFilters = { search: "", material: "todos", from: "", to: "", pending: false }; render(); });
  document.querySelector("[data-apply-rejections]")?.addEventListener("click", applyRejectionFilters);
  document.querySelector("[data-clear-rejections]")?.addEventListener("click", clearRejectionFilters);
  document.querySelector("[data-apply-report]")?.addEventListener("click", applyReportFilters);
  document.querySelector("[data-report-week]")?.addEventListener("click", selectLatestReportWeek);
  document.querySelector("[data-nf-quality-form]")?.addEventListener("submit", (event) => { event.preventDefault(); state.nfQualityFilter = document.querySelector('[name="nfQualitySearch"]')?.value.trim() || ""; render(); });
  document.querySelector("[data-clear-nf-quality]")?.addEventListener("click", () => { state.nfQualityFilter = ""; render(); });
  document.querySelectorAll("[data-report-material]").forEach((button) => button.addEventListener("click", () => selectReportMaterial(button.dataset.reportMaterial)));
  document.querySelector("[data-report-images]")?.addEventListener("change", (event) => addReportImages(event.target.files));
  document.querySelectorAll("[data-remove-report-image]").forEach((button) => button.addEventListener("click", () => removeReportImage(button.dataset.removeReportImage)));
  bindFormEvents(); bindCategoryEvents();
}

function bindFormEvents() {
  const form = document.querySelector("#receiving-form");
  if (!form) return;
  form.addEventListener("input", refreshDraftWarnings);
  form.addEventListener("change", refreshDraftWarnings);
  form.querySelector("[data-new-location]")?.addEventListener("click", () => { state.draft = formRecordFromDom(); state.newLocationMode = !state.newLocationMode; render(); document.querySelector('[name="newLocationName"]')?.focus(); });
  form.querySelector("[data-save-location]")?.addEventListener("click", saveLocation);
  form.querySelectorAll("[data-add-invoice-photos]").forEach((input) => input.addEventListener("change", (event) => addInvoicePhotos(number(input.dataset.addInvoicePhotos), event.target.files)));
  form.querySelectorAll("[data-remove-invoice-photo]").forEach((button) => button.addEventListener("click", () => removeInvoicePhoto(number(button.dataset.photoInvoice), button.dataset.removeInvoicePhoto)));
  form.addEventListener("submit", (event) => { event.preventDefault(); saveCurrent("concluido"); });
  form.querySelectorAll('[name="invoiceQuantity"]').forEach((input) => input.addEventListener("input", updateFormTotal));
  form.querySelectorAll("[data-material]").forEach((button) => button.addEventListener("click", () => { state.draft = formRecordFromDom(); state.draft.material = button.dataset.material; if (!state.draft.supplier) state.draft.supplier = button.dataset.material === "dormente" ? "Cavan / Arauco" : "Arauco"; state.draft = normalizeMaterialSupplier(state.draft); render(); }));
  form.querySelector("[data-add-invoice]")?.addEventListener("click", () => { state.draft = formRecordFromDom(); state.draft.invoiceItems.push(blankInvoiceItem(state.draft.material)); render(); });
  form.querySelectorAll("[data-remove-invoice]").forEach((button) => button.addEventListener("click", () => { state.draft = formRecordFromDom(); state.draft.invoiceItems.splice(number(button.dataset.removeInvoice), 1); render(); }));
  form.querySelector("[data-add-rejection]")?.addEventListener("click", () => { state.draft = formRecordFromDom(); const firstInvoice = state.draft.invoiceItems.find((item) => item.number)?.number || ""; state.draft.rejections = rejectionRows(state.draft); state.draft.rejections.push({ id: crypto.randomUUID(), invoiceNumber: firstInvoice, mold: "", cavity: "", reasonId: "", reason: "" }); state.draft.quality.reprovados = state.draft.rejections.length; render(); });
  form.querySelectorAll("[data-remove-rejection]").forEach((button) => button.addEventListener("click", () => { state.draft = formRecordFromDom(); state.draft.rejections.splice(number(button.dataset.removeRejection), 1); state.draft.quality.reprovados = state.draft.rejections.length; render(); }));
  form.querySelector("[data-add-rejection-reason]")?.addEventListener("click", () => addRejectionReason(form.querySelector('[name="newRejectionReason"]')?.value));
  form.querySelector("[data-save-status]")?.addEventListener("click", () => saveCurrent("rascunho"));
  form.querySelector("[data-cancel-form]")?.addEventListener("click", cancelDraft);
}

function bindCategoryEvents() {
  document.querySelector("[data-add-category]")?.addEventListener("click", () => addCategory(document.querySelector('[name="newCategory"]')?.value));
  document.querySelector("[data-add-category-page]")?.addEventListener("click", () => addCategory(document.querySelector('[name="qualityNewCategory"]')?.value));
}

function updateFormTotal() {
  const total = [...document.querySelectorAll('[name="invoiceQuantity"]')].reduce((sum, input) => sum + number(input.value), 0);
  document.querySelectorAll("[data-form-total]").forEach((node) => { node.textContent = formatNumber(total); });
}

function navigate(view) {
  if (state.saving || state.photoBusy) return toast("Aguarde a preparação das fotos e o salvamento.", "error");
  if (view === "form" && !canEdit()) return;
  if (state.view === "form" && view !== "form") state.draft = formRecordFromDom();
  state.view = view; state.modal = null;
  if (view === "form" && !state.draft) state.draft = defaultDraft();
  if (view === "team" && state.user?.role === "admin" && !state.teamLoaded) loadTeam();
  render(); window.scrollTo({ top: 0, behavior: "smooth" });
}

function newRecord(material = "dormente") { if (state.saving || state.photoBusy) return; if (pendingPhotoFiles.size && !confirm("Há fotos não salvas. Deseja descartá-las e iniciar outro recebimento?")) return; releasePendingPhotos(); state.newLocationMode = false; state.draft = defaultDraft(material); state.editingId = ""; state.editingInvoiceIndex = -1; navigate("form"); }

function editRecord(id, invoiceIndex = -1) {
  if (state.saving || state.photoBusy) return;
  if (pendingPhotoFiles.size && !confirm("Há fotos não salvas. Deseja descartá-las e editar este recebimento?")) return;
  releasePendingPhotos(); state.newLocationMode = false;
  const record = state.records.find((item) => item.id === id);
  if (!record || !canEdit()) return;
  state.draft = reconcileInvoiceQuality(structuredClone({ ...record, receivedDate: record.receivedDate || String(record.receivedAt).slice(0, 10), receivedTime: record.receivedTime || "", invoiceItems: invoiceItems(record), quality: { ...Object.fromEntries([...state.categories, ...RAIL_QUALITY_CATEGORIES].map((category) => [category.id, 0])), ...(record.quality || {}) } }));
  state.editingId = id;
  state.editingInvoiceIndex = Number.isInteger(invoiceIndex) && invoiceIndex >= 0 && invoiceIndex < state.draft.invoiceItems.length ? invoiceIndex : -1;
  navigate("form");
  if (state.editingInvoiceIndex >= 0) requestAnimationFrame(() => { const row = document.querySelector(`[data-invoice-row="${state.editingInvoiceIndex}"]`); row?.scrollIntoView({ behavior: "smooth", block: "center" }); row?.querySelector('[name="invoiceNumber"]')?.focus(); });
}

async function saveCurrent(status) {
  if (state.saving || state.photoBusy) return toast("Aguarde a preparação das fotos e o salvamento.", "error");
  if (!canEdit()) return toast("Seu acesso é somente para consulta.", "error");
  const record = normalizeMaterialSupplier(formRecordFromDom());
  state.draft = record;
  const warnings = draftWarnings(record);
  if (status !== "rascunho" && warnings.missing.length) { render(); return toast("Preencha os dados pendentes ou salve como rascunho.", "error"); }
  if (status !== "rascunho" && record.material === "dormente" && record.rejections.some((item) => !item.invoiceNumber || !item.mold || !item.cavity || !item.reasonId)) return toast("Complete NF, molde, cavidade e motivo de cada dormente reprovado.", "error");
  if (status !== "rascunho" && warnings.duplicates.length) {
    const signature = JSON.stringify({ material: record.material, invoices: record.invoiceItems.map((item) => [invoiceNumberKey(item.number), number(item.quantity)]), matches: warnings.duplicates.slice().sort() });
    if (record.duplicateReview?.signature !== signature) {
      if (!confirm(warnings.duplicates.join("\n") + "\n\nConfirma que são entregas parciais ou registros distintos e deseja salvar?")) return;
      record.duplicateReview = { signature, confirmedAt: new Date().toISOString(), confirmedBy: state.user?.email || "" };
    }
  }
  const hasPendingPhotos = record.invoiceItems.some((item) => (item.photos || []).some((photo) => pendingPhotoFiles.has(photo.id) || !photo.path));
  if (hasPendingPhotos && (!state.online || !supabaseClient)) return toast("Conecte-se à internet para salvar as fotos. O formulário continua aberto.", "error");
  record.id = state.editingId || record.id || crypto.randomUUID();
  const previousPaths = photosForRecords(state.records.filter((item) => item.id === record.id)).map((photo) => photo.path).filter(Boolean);
  record.status = status; record.seeded = false; reconcileInvoiceQuality(record);
  record.invoiceNumbers = record.invoiceItems.map((item) => item.number).filter(Boolean).join(", ");
  record.quantity = record.invoiceItems.reduce((sum, item) => sum + number(item.quantity), 0);
  record.rejected = qualityRejected(record); record.approved = Math.max(0, record.quantity - record.rejected);
  record.inspectorName = record.inspectorName || CONTROL_OWNER;
  record.receivedAt = `${record.receivedDate || todayInput()}T${record.receivedTime || "00:00"}:00`;
  record.timeKnown = Boolean(record.receivedTime); record.createdAt ||= new Date().toISOString(); record.updatedAt = new Date().toISOString();
  state.saving = true; render();
  let savedLocally = false;
  try {
    if (!supabaseClient || !state.online) throw new Error("offline");
    if (outboxSyncPromise) await outboxSyncPromise;
    if (hasPendingPhotos) await uploadInvoicePhotos(record);
    const { error } = await supabaseClient.from("crm_records").upsert(supabaseRecordRow(record), { onConflict: "id" });
    if (error) throw error;
    replaceRecord(record); state.storageMode = "cloud";
    try { forgetQueuedRecord(record.id); writeLocalRecords(); } catch { toast("Salvo na nuvem. Não foi possível atualizar o cache deste aparelho.", "error"); }
    const paths = new Set(photosForRecords([record]).map((photo) => photo.path));
    const unused = [...previousPaths, ...[...pendingPhotoFiles.values()].map((photo) => photo.path).filter(Boolean)].filter((path) => !paths.has(path));
    await removeStoredPhotos(unused);
  } catch (error) {
    if (hasPendingPhotos) {
      state.saving = false; render();
      return toast(error.message?.startsWith("Não foi possível enviar") ? error.message : "Não foi possível salvar as fotos e o recebimento. Seus dados continuam no formulário; tente novamente.", "error");
    }
    try { queueForSync(record); replaceRecord(record); writeLocalRecords(); state.storageMode = "local"; savedLocally = true; }
    catch { state.saving = false; render(); return toast("Não foi possível salvar neste aparelho. Mantenha o formulário aberto e tente novamente com conexão.", "error"); }
  }
  state.saving = false; releasePendingPhotos(); state.draft = null; state.newLocationMode = false;
  state.editingId = ""; state.editingInvoiceIndex = -1; state.view = "dashboard"; render();
  toast(savedLocally ? "Salvo neste aparelho. Aguardando sincronização." : status === "rascunho" ? "Rascunho salvo." : "Recebimento e fotos salvos.");
}

function cancelDraft() {
  if (state.saving || state.photoBusy) return;
  if (pendingPhotoFiles.size && !confirm("Descartar as fotos e as alterações ainda não salvas?")) return;
  releasePendingPhotos(); state.draft = null; state.editingId = ""; state.editingInvoiceIndex = -1; state.newLocationMode = false;
  navigate("dashboard");
}

function replaceRecord(record) { record = normalizeMaterialSupplier(record); const index = state.records.findIndex((item) => item.id === record.id); if (index >= 0) state.records[index] = record; else state.records.push(record); state.records.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt))); }

async function deleteRecord(id) {
  if (!canEdit() || state.saving || state.photoBusy) return;
  const record = state.records.find((item) => item.id === id);
  if (!record || !confirm(`Excluir o recebimento de ${formatDate(record.receivedDate)}?`)) return;
  try { const { error } = await supabaseClient.from("crm_records").delete().eq("id", id); if (error) throw error; } catch { return toast("Não foi possível excluir no Supabase.", "error"); }
  state.records = state.records.filter((item) => item.id !== id); if (state.modal?.id === id) state.modal = null; forgetQueuedRecord(id); writeLocalRecords(); await removeStoredPhotos(photosForRecords([record]).map((photo) => photo.path).filter(Boolean)); render(); toast("Recebimento excluído.", "success");
}

async function addCategory(rawName) {
  const label = String(rawName || "").trim();
  if (!label) return toast("Digite o nome da nova classificação.", "error");
  const id = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (state.categories.some((category) => category.id === id)) return toast("Essa classificação já existe.", "error");
  const palette = ["#ef8d32", "#15b7a5", "#ec5f78", "#806bff", "#25a8e0", "#9cbf33"];
  const category = { id, label, color: palette[state.categories.length % palette.length] };
  try { const { data, error } = await supabaseClient.from("quality_categories").upsert({ ...category, active: true, created_by: state.user.email, updated_at: new Date().toISOString() }, { onConflict: "id" }).select("id,label,color").single(); if (error) throw error; state.categories.push(data); } catch { return toast("Não foi possível adicionar a classificação no Supabase.", "error"); }
  if (state.draft) { const formDraft = formRecordFromDom(); state.draft = { ...formDraft, invoiceItems: formDraft.invoiceItems.map((item) => ({ ...item, quality: { ...(item.quality || {}), [id]: 0 } })), quality: { ...formDraft.quality, [id]: 0 } }; }
  render(); toast(`Classificação “${label}” adicionada.`, "success");
}

async function addRejectionReason(rawName) {
  const label = String(rawName || "").trim();
  if (!label) return toast("Digite o motivo da reprovação.", "error");
  const id = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
  if (state.rejectionReasons.some((reason) => reason.id === id)) return toast("Esse motivo já foi cadastrado.", "error");
  const reason = { id, label };
  if (state.draft) state.draft = formRecordFromDom();
  try { const { data, error } = await supabaseClient.from("rejection_reasons").upsert({ ...reason, active: true, created_by: state.user.email, updated_at: new Date().toISOString() }, { onConflict: "id" }).select("id,label").single(); if (error) throw error; state.rejectionReasons.push(data); } catch { return toast("Não foi possível adicionar o motivo no Supabase.", "error"); }
  render(); toast(`Motivo “${label}” adicionado.`, "success");
}

function applyHistoryFilters() { state.historyFilters = { search: document.querySelector('[name="historySearch"]')?.value || "", material: document.querySelector('[name="historyMaterial"]')?.value || "todos", from: document.querySelector('[name="historyFrom"]')?.value || "", to: document.querySelector('[name="historyTo"]')?.value || "", pending: Boolean(document.querySelector('[name="historyPending"]')?.checked) }; render(); }
function syncRejectionFiltersFromDom() {
  if (!document.querySelector('[name="rejectionSearch"]')) return state.rejectionFilters;
  state.rejectionFilters = {
    search: document.querySelector('[name="rejectionSearch"]')?.value || "",
    location: document.querySelector('[name="rejectionLocation"]')?.value || "",
    reason: document.querySelector('[name="rejectionReason"]')?.value || "",
    from: document.querySelector('[name="rejectionFrom"]')?.value || "",
    to: document.querySelector('[name="rejectionTo"]')?.value || "",
  };
  return state.rejectionFilters;
}
function applyRejectionFilters() { syncRejectionFiltersFromDom(); render(); }
function clearRejectionFilters() { state.rejectionFilters = { search: "", location: "", reason: "", from: "", to: "" }; render(); }
function syncReportFiltersFromDom() {
  if (!document.querySelector('[name="reportMaterial"]')) return state.reportFilters;
  state.reportFilters = { from: document.querySelector('[name="reportFrom"]')?.value || "", to: document.querySelector('[name="reportTo"]')?.value || "", material: document.querySelector('[name="reportMaterial"]')?.value || "todos", location: document.querySelector('[name="reportLocation"]')?.value || "" };
  return state.reportFilters;
}
function applyReportFilters() { syncReportFiltersFromDom(); render(); }
function selectLatestReportWeek() { syncReportFiltersFromDom(); const { material, location } = state.reportFilters; const dates = state.records.filter((record) => (material === "todos" || record.material === material) && (!location || locationKey(record.location) === location)).map((record) => record.receivedDate || String(record.receivedAt).slice(0, 10)).filter(Boolean).sort(); const to = dates.at(-1) || todayInput(); state.reportFilters = { material, location, from: addDays(to, -6), to }; render(); }
function selectReportMaterial(material) { if (!["todos", "dormente", "trilho"].includes(material)) return; syncReportFiltersFromDom(); state.reportFilters = { ...state.reportFilters, material }; render(); }

function addReportImages(fileList) {
  const available = Math.max(0, 6 - state.reportImages.length);
  const files = [...(fileList || [])].filter((file) => file.type.startsWith("image/") && file.size <= 8 * 1024 * 1024).slice(0, available);
  if (!files.length) return toast(available ? "Selecione imagens de até 8 MB." : "O relatório aceita até 6 imagens.", "error");
  state.reportImages.push(...files.map((file) => ({ id: crypto.randomUUID(), name: file.name, url: URL.createObjectURL(file) })));
  render();
  toast(`${files.length} imagem(ns) adicionada(s) ao relatório.`, "success");
}

function removeReportImage(id) {
  const image = state.reportImages.find((item) => item.id === id);
  if (image) URL.revokeObjectURL(image.url);
  state.reportImages = state.reportImages.filter((item) => item.id !== id);
  render();
}

function exportCsv(records) {
  const rows = [["Data", "Horário", "Material", "Nota Fiscal", "Quantidade", "Local", "Fornecedor", "Pequenas quebras", "Reparados", "Bolhas", "Quebras", "Dormentes reprovados", "Molde / cavidade / motivo", "Empenamento / torção", "Oxidação / corrosão", "Danos no boleto", "Danos na alma", "Danos no patim", "Trilhos reprovados", "Responsável", "Observações"]];
  records.forEach((record) => invoiceItems(record).forEach((item, index) => { const quality = invoiceQuality(record, item, index); const rejected = Math.max(number(quality.reprovados), rejectionsForInvoice(record, item.number).length); rows.push([formatDate(record.receivedDate), record.receivedTime || "não informado", MATERIALS[record.material].label, item.number, item.quantity, record.location, record.supplier, quality["pequenas-quebras"] || 0, quality.reparados || 0, quality.bolhas || 0, quality.quebras || 0, rejected, rejectionDetails(record, item.number), quality["trilho-empenamento"] || 0, quality["trilho-oxidacao"] || 0, quality["trilho-boleto"] || 0, quality["trilho-alma"] || 0, quality["trilho-patim"] || 0, quality["trilho-reprovados"] || 0, record.inspectorName || CONTROL_OWNER, record.observations || ""]); }));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
  const suffix = `${state.reportFilters.from || "inicio"}-a-${state.reportFilters.to || "fim"}`;
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); link.download = `relatorio-epya-${suffix}.csv`; link.click(); URL.revokeObjectURL(link.href); toast("Planilha para Excel gerada.", "success");
}

function exportRejectedCsv() {
  syncRejectionFiltersFromDom();
  const rows = [["Data", "Horário", "Nota Fiscal", "Quantidade da NF", "Local", "Fornecedor", "Placa", "Molde", "Cavidade", "Motivo da reprovação", "Responsável", "Observações", "Fotos da NF"]];
  filteredRejectedSleepers().forEach((row) => rows.push([formatDate(row.record.receivedDate || row.record.receivedAt), row.record.receivedTime || "não informado", row.item.number || row.rejection.invoiceNumber || "", row.item.quantity, row.record.location || "", row.record.supplier || "", row.record.vehiclePlate || "", row.rejection.mold || "", row.rejection.cavity || "", row.reason, row.record.inspectorName || CONTROL_OWNER, row.record.observations || "", row.item.photos?.length || 0]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
  const suffix = `${state.rejectionFilters.from || "inicio"}-a-${state.rejectionFilters.to || "fim"}`;
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); link.download = `dormentes-reprovados-epya-${suffix}.csv`; link.click(); URL.revokeObjectURL(link.href); toast("Planilha de dormentes reprovados gerada.", "success");
}

function printRejectedReport() {
  syncRejectionFiltersFromDom(); state.modal = null; state.view = "rejections"; render();
  requestAnimationFrame(() => window.print());
}

async function printReport() {
  syncReportFiltersFromDom(); state.modal = null; state.view = "reports"; render();
  const photos = state.includeInvoicePhotos ? photosForRecords(reportRecords()) : [];
  await ensurePhotoUrls(photos.map((photo) => photo.path));
  render();
  if (photos.some((photo) => !photoSource(photo))) return toast("Algumas fotos não carregaram. Tente carregar novamente ou desmarque as fotos no relatório.", "error");
  let timeout;
  try {
    await Promise.race([
      Promise.all([...document.querySelectorAll(".print-report img")].map((img) => img.complete && img.naturalWidth ? Promise.resolve() : img.decode())),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("timeout")), 15000); }),
    ]);
    window.print();
  } catch { toast("Aguarde o carregamento das imagens e tente gerar o PDF novamente.", "error"); }
  finally { clearTimeout(timeout); }
}

function openReportText() {
  syncReportFiltersFromDom();
  state.reportTextDraft = descriptiveReportText();
  state.modal = { type: "report-text" };
  render();
  requestAnimationFrame(() => document.querySelector('[name="reportTextEditor"]')?.focus());
}

function editedReportText() {
  const editor = document.querySelector('[name="reportTextEditor"]');
  state.reportTextDraft = editor?.value ?? state.reportTextDraft ?? descriptiveReportText();
  return state.reportTextDraft.trim();
}

function emailReport() {
  const recipient = document.querySelector('[name="reportEmail"]')?.value.trim();
  if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) return toast("Informe um e-mail válido.", "error");
  const message = editedReportText();
  if (!message) return toast("O texto do relatório está vazio.", "error");
  const subject = `Relatório EPYA • Recebimentos ${formatDate(state.reportFilters.from)} a ${formatDate(state.reportFilters.to)}`;
  window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

function whatsappReport() {
  const message = editedReportText();
  if (!message) return toast("O texto do relatório está vazio.", "error");
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  toast("Texto editado aberto no WhatsApp.", "success");
}

async function copyReportText() {
  const message = editedReportText();
  if (!message) return toast("O texto do relatório está vazio.", "error");
  try {
    await navigator.clipboard.writeText(message);
  } catch {
    const input = document.createElement("textarea");
    input.value = message; input.setAttribute("readonly", ""); input.style.position = "fixed"; input.style.opacity = "0";
    document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove();
  }
  toast("Texto editado copiado para enviar por mensagem.", "success");
}

function toggleTheme() { if (state.saving || state.photoBusy) return; if (state.view === "form") state.draft = formRecordFromDom(); state.theme = state.theme === "dark" ? "light" : "dark"; localStorage.setItem(THEME_KEY, state.theme); render(); }
async function toggleTv() { if (state.saving || state.photoBusy) return; if (state.view === "form") state.draft = formRecordFromDom(); state.tvMode = !state.tvMode; state.view = "dashboard"; if (state.tvMode) { try { await document.documentElement.requestFullscreen?.(); } catch {} } else if (document.fullscreenElement) await document.exitFullscreen?.(); render(); }
async function installApp() { if (state.installPrompt) { state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; return; } toast(/iphone|ipad|ipod/i.test(navigator.userAgent) ? "No Safari, toque em Compartilhar e Adicionar à Tela de Início." : "No menu do navegador, escolha Instalar app.", "success"); }
function toast(message, type = "success") { const node = document.querySelector(".toast"); if (!node) return; node.textContent = message; node.className = `toast show ${type}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => { node.className = "toast"; }, 4200); }

function sanitizeLegacyMoldEntry(record) {
  record = normalizeMaterialSupplier(record);
  if (!record || record._cleanupMolde57Cav1) return record;
  const cleaned = structuredClone(record);
  cleaned.observations = String(cleaned.observations || "").replace(/\bmolde\s*:?\s*57\s*[,;\/-]?\s*cav(?:idade)?\.?\s*:?\s*1\b/gi, "").replace(/\s{2,}/g, " ").trim();
  if (String(cleaned.mold || "").trim() === "57" && String(cleaned.cavity || "").trim() === "1") { delete cleaned.mold; delete cleaned.cavity; }
  if (Array.isArray(cleaned.rejections)) cleaned.rejections = cleaned.rejections.filter((item) => !(String(item.mold || "").trim() === "57" && String(item.cavity || "").trim() === "1" && !String(item.reason || item.reasonId || "").trim()));
  cleaned._cleanupMolde57Cav1 = true;
  return cleaned;
}

function supabaseRecordRow(record) { return { id: record.id, status: record.status, received_at: record.receivedAt, invoice_numbers: record.invoiceNumbers || "", supplier: record.supplier || "", quantity: number(record.quantity), approved: number(record.approved), rejected: number(record.rejected), truckloads: 1, payload: record, created_at: record.createdAt || new Date().toISOString(), updated_at: record.updatedAt || new Date().toISOString() }; }
function clearProtectedLocalData() { [STORAGE_KEY, OUTBOX_KEY, AUTH_CACHE_KEY, CATEGORY_KEY, REJECTION_REASON_KEY, LOCATION_KEY, GOAL_KEY, GOAL_OUTBOX_KEY].forEach((key) => localStorage.removeItem(key)); }
function readLocalRecords() { try { const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); return Array.isArray(stored) ? stored.map(sanitizeLegacyMoldEntry).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt))) : []; } catch { return []; } }
function writeLocalRecords() { if (state.authorized) localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records)); }
function readOutbox() { try { const records = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); return Array.isArray(records) ? records : []; } catch { return []; } }
function queueForSync(record) { const outbox = readOutbox(); const index = outbox.findIndex((item) => item.id === record.id); if (index >= 0) outbox[index] = record; else outbox.push(record); localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox)); state.pendingSync = outbox.length; }
function forgetQueuedRecord(id) { const outbox = readOutbox().filter((record) => record.id !== id); localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox)); state.pendingSync = outbox.length; }

let outboxSyncPromise = null;
async function syncOutbox() {
  if (outboxSyncPromise) return outboxSyncPromise;
  if (!supabaseClient || !state.online || !state.authorized || state.saving) return;
  outboxSyncPromise = (async () => {
    const pending = readOutbox(); const remaining = [];
    for (const record of pending) { try { const { error } = await supabaseClient.from("crm_records").upsert(supabaseRecordRow(record), { onConflict: "id" }); if (error) throw error; replaceRecord(record); } catch { remaining.push(record); } }
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining)); state.pendingSync = remaining.length; if (!remaining.length) state.storageMode = "cloud"; writeLocalRecords();
  })();
  try { await outboxSyncPromise; } finally { outboxSyncPromise = null; }
}

async function loadSession() {
  if (PUBLIC_LINK_MODE) {
    state.authenticated = false;
    state.authorized = true;
    state.user = { id: "public-link", email: "acesso-direto", fullName: "Acesso direto", role: "viewer" };
    state.recoveryMode = false;
    state.authLoading = false;
    return;
  }
  if (!supabaseClient) { state.authenticated = false; state.authorized = false; state.user = null; state.authMessage = "O cliente seguro do Supabase não foi carregado."; state.authLoading = false; return; }
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (!session?.user?.email) { state.authenticated = false; state.authorized = false; state.user = null; state.authLoading = false; return; }
    const email = session.user.email.trim().toLowerCase();
    state.authenticated = true;
    const { data: profile, error: profileError } = await supabaseClient.from("app_users").select("id,email,full_name,role,active").eq("active", true).eq("email", email).maybeSingle();
    if (profileError) throw profileError;
    state.authorized = Boolean(profile);
    state.user = profile ? { id: profile.id, email: profile.email, fullName: profile.full_name, role: profile.role } : { email, fullName: session.user.user_metadata?.full_name || email.split("@")[0], role: "viewer" };
    if (state.authorized) localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(state.user)); else clearProtectedLocalData();
  } catch (error) { state.authenticated = false; state.authorized = false; state.user = null; state.authMessage = error.message || "Não foi possível validar a sessão."; }
  state.authLoading = false;
}

function authFields() { return { email: document.querySelector('[name="authEmail"]')?.value.trim().toLowerCase() || "", password: document.querySelector('[name="authPassword"]')?.value || "" }; }
function accessUrl(admin) { const url = new URL(window.location.href); url.hash = ""; url.searchParams.delete("view"); if (admin) url.searchParams.set("admin", "1"); else url.searchParams.delete("admin"); return url; }
function openAdminAccess() { window.location.assign(accessUrl(true)); }
function openPublicAccess() { window.location.assign(accessUrl(false)); }
async function signInWithEmail(event) { event?.preventDefault(); const { email, password } = authFields(); if (!email || password.length < 8) return; state.authLoading = true; state.authMessage = ""; render(); const { error } = await supabaseClient.auth.signInWithPassword({ email, password }); if (error) { state.authLoading = false; state.authMessage = "E-mail ou senha inválidos."; render(); return; } await loadSession(); if (state.authorized) await loadRecordsAndCategories(); state.loading = false; render(); }
async function createFirstAccess() { const { email, password } = authFields(); if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return toast("Informe um e-mail válido e uma senha de pelo menos 8 caracteres.", "error"); state.authLoading = true; state.authMessage = ""; render(); const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: accessUrl(true).toString() } }); state.authLoading = false; if (error) { state.authMessage = error.message || "Não foi possível criar o primeiro acesso."; render(); return; } if (data.session) { await loadSession(); if (state.authorized) await loadRecordsAndCategories(); state.loading = false; render(); return; } state.authMessage = "Confira seu e-mail e use o link de confirmação para concluir o primeiro acesso."; render(); }
async function requestPasswordReset() { const email = document.querySelector('[name="authEmail"]')?.value.trim().toLowerCase() || ""; if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Informe seu e-mail para recuperar a senha.", "error"); state.authLoading = true; state.authMessage = ""; render(); const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: accessUrl(true).toString() }); state.authLoading = false; state.authMessage = error ? (error.message || "Não foi possível enviar a recuperação de senha.") : "Enviamos um link para redefinir sua senha. Confira também a caixa de spam."; render(); }
async function updateRecoveredPassword(event) { event?.preventDefault(); const password = document.querySelector('[name="newPassword"]')?.value || ""; const confirmation = document.querySelector('[name="confirmPassword"]')?.value || ""; if (password.length < 8) return toast("A nova senha precisa ter pelo menos 8 caracteres.", "error"); if (password !== confirmation) return toast("As senhas informadas não são iguais.", "error"); state.authLoading = true; state.authMessage = ""; render(); const { error } = await supabaseClient.auth.updateUser({ password }); if (error) { state.authLoading = false; state.authMessage = error.message || "Não foi possível atualizar a senha."; render(); return; } state.recoveryMode = false; window.history.replaceState({}, document.title, accessUrl(true)); await loadSession(); if (state.authorized) await loadRecordsAndCategories(); state.loading = false; render(); toast("Senha atualizada. Acesso liberado com segurança.", "success"); }
async function signOut() { if (state.saving || state.photoBusy) return; if (pendingPhotoFiles.size && !confirm("Há fotos ainda não salvas. Deseja sair e descartá-las?")) return; photoSessionEpoch++; await supabaseClient?.auth.signOut(); releasePendingPhotos(); photoUrls.clear(); state.draft = null; state.editingId = ""; state.editingInvoiceIndex = -1; state.newLocationMode = false; state.locations = []; state.goals = []; clearProtectedLocalData(); state.authenticated = false; state.authorized = false; state.user = null; state.records = []; state.team = []; state.teamLoaded = false; state.authMessage = "Sessão encerrada com segurança."; render(); }

async function loadRecordsAndCategories() {
  try {
    await syncGoalChanges();
    const [recordsResult, categoriesResult, reasonsResult, locationsResult, goalsResult] = await Promise.all([
      supabaseClient.from("crm_records").select("payload").order("received_at", { ascending: false }),
      supabaseClient.from("quality_categories").select("id,label,color").eq("active", true).order("label"),
      supabaseClient.from("rejection_reasons").select("id,label").eq("active", true).order("label"),
      supabaseClient.from("receiving_locations").select("id,label").order("label"),
      supabaseClient.from("receiving_goals").select("id,title,material,target_quantity,location,start_date,due_date,created_at").order("created_at"),
    ]);
    if (recordsResult.error) throw recordsResult.error;
    state.records = (recordsResult.data || []).map((row) => row.payload).filter(Boolean).map(sanitizeLegacyMoldEntry);
    if (!categoriesResult.error && categoriesResult.data?.length) state.categories = categoriesResult.data;
    if (!reasonsResult.error) state.rejectionReasons = reasonsResult.data || [];
    if (!locationsResult.error) { state.locations = locationsResult.data || []; localStorage.setItem(LOCATION_KEY, JSON.stringify(state.locations)); }
    if (!goalsResult.error) {
      const pending = readGoalOutbox();
      const merged = new Map((goalsResult.data || []).map((goal) => { const normalized = normalizeGoal(goal); return [normalized.id, normalized]; }));
      pending.upserts.forEach((goal) => merged.set(goal.id, normalizeGoal(goal)));
      pending.deletes.forEach((id) => merged.delete(id));
      state.goals = [...merged.values()]; saveGoalsLocal();
    } else {
      state.goals = readGoals();
    }
    readOutbox().forEach(replaceRecord); state.storageMode = "cloud"; writeLocalRecords(); saveCategoriesLocal(); saveRejectionReasonsLocal();
  } catch {
    state.records = readLocalRecords(); state.goals = readGoals();
    try { state.locations = JSON.parse(localStorage.getItem(LOCATION_KEY) || "[]"); } catch { state.locations = []; }
    state.storageMode = "local";
  }
  state.pendingSync = readOutbox().length;
}

async function loadTeam() {
  try { const { data, error } = await supabaseClient.from("app_users").select("id,email,full_name,role,active,created_at").order("active", { ascending: false }).order("full_name"); if (error) throw error; state.team = (data || []).map((item) => ({ id: item.id, email: item.email, fullName: item.full_name, role: item.role, active: item.active, createdAt: item.created_at })); } catch { state.team = [{ id: "owner-darci-brum", email: OWNER_EMAIL, fullName: CONTROL_OWNER, role: "admin", active: true }]; }
  state.teamLoaded = true; if (state.view === "team") render();
}

async function addTeamMember() {
  const fullName = document.querySelector('[name="teamFullName"]')?.value.trim() || ""; const email = document.querySelector('[name="teamEmail"]')?.value.trim().toLowerCase() || ""; const role = document.querySelector('[name="teamRole"]')?.value || "viewer";
  if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Informe um e-mail válido.", "error");
  try { const existing = state.team.find((item) => item.email.toLowerCase() === email); const row = { email, full_name: fullName || email.split("@")[0], role, active: true, created_by: state.user.email, updated_at: new Date().toISOString() }; const query = existing ? supabaseClient.from("app_users").update(row).eq("id", existing.id) : supabaseClient.from("app_users").insert({ id: `user-${crypto.randomUUID()}`, ...row }); const { error } = await query; if (error) throw error; state.teamLoaded = false; await loadTeam(); toast(`${email} foi liberado.`, "success"); } catch (error) { toast(error.message || "Não foi possível liberar o acesso no Supabase.", "error"); }
}

async function removeTeamMember(id) {
  const user = state.team.find((item) => item.id === id); if (!user || !confirm(`Remover o acesso de ${user.fullName || user.email}?`)) return;
  try { const { error } = await supabaseClient.from("app_users").update({ active: false, updated_at: new Date().toISOString() }).eq("id", id); if (error) throw error; state.teamLoaded = false; await loadTeam(); toast("Acesso removido.", "success"); } catch (error) { toast(error.message || "Falha ao remover acesso.", "error"); }
}

async function bootstrap() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register(GITHUB_PAGES_MODE ? "./service-worker.js?v=35" : "/service-worker.js?v=35").catch(() => {});
  await loadSession(); if (state.authorized) { await loadRecordsAndCategories(); await syncOutbox(); } state.loading = false; render();
}

supabaseClient?.auth?.onAuthStateChange?.((event) => {
  if (PUBLIC_LINK_MODE || event !== "PASSWORD_RECOVERY") return;
  state.recoveryMode = true;
  state.authLoading = false;
  setTimeout(render, 0);
});

window.addEventListener("beforeunload", (event) => { if (pendingPhotoFiles.size || state.saving || state.photoBusy) { event.preventDefault(); event.returnValue = ""; } });
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); state.installPrompt = event; if (state.view === "form" && !state.saving && !state.photoBusy) state.draft = formRecordFromDom(); render(); });
window.addEventListener("online", async () => { state.online = true; if (state.saving || state.photoBusy) return; if (state.view === "form") state.draft = formRecordFromDom(); await loadSession(); if (state.authorized) { await syncOutbox(); await syncGoalChanges(); } if (state.saving || state.photoBusy) return; if (state.view === "form") state.draft = formRecordFromDom(); render(); });
window.addEventListener("offline", () => { state.online = false; state.storageMode = "local"; if (state.saving || state.photoBusy) return; if (state.view === "form") state.draft = formRecordFromDom(); render(); });
window.addEventListener("keydown", (event) => { if (event.key === "Escape" && state.modal) { state.modal = null; render(); } });

bootstrap();
