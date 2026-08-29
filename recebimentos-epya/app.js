import {
  DEFAULT_CATEGORIES,
  OWNER_EMAIL,
  TARGET_SLEEPERS,
} from "./app-config.js";

const app = document.querySelector("#app");
const GITHUB_PAGES_MODE = window.location.hostname.endsWith("github.io");
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

const state = {
  view: ["dashboard", "form", "history", "quality", "reports", "team"].includes(requestedView)
    ? requestedView
    : "dashboard",
  records: [],
  categories: readCategories(),
  rejectionReasons: readRejectionReasons(),
  draft: null,
  editingId: "",
  loading: true,
  authLoading: true,
  authenticated: false,
  authorized: false,
  user: null,
  authMessage: "",
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
  nfQualityFilter: "",
  historyFilters: { search: "", material: "todos", from: "", to: "" },
  reportFilters: { from: "2026-08-18", to: "2026-08-24", material: "dormente" },
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

function qualityCategories(material) {
  return material === "trilho" ? RAIL_QUALITY_CATEGORIES : state.categories;
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
    invoiceItems: [{ number: "", quantity: "" }],
    quality: Object.fromEntries([...state.categories, ...RAIL_QUALITY_CATEGORIES].map((category) => [category.id, 0])),
    rejections: [],
    observations: "",
    _cleanupMolde57Cav1: true,
  };
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
  if (record.material !== "dormente" || !Array.isArray(record.invoiceItems) || !record.invoiceItems.length) return record;
  record.invoiceItems = record.invoiceItems.map((item) => ({ ...item, quality: { ...Object.fromEntries(state.categories.map((category) => [category.id, 0])), ...(item.quality || {}) } }));
  state.categories.filter((category) => category.id !== "reprovados").forEach((category) => {
    const target = number(record.quality?.[category.id]);
    const current = record.invoiceItems.reduce((sum, item) => sum + number(item.quality?.[category.id]), 0);
    if (current === target) return;
    const base = Math.floor(target / record.invoiceItems.length);
    let remainder = target % record.invoiceItems.length;
    record.invoiceItems.forEach((item) => { item.quality[category.id] = base + (remainder-- > 0 ? 1 : 0); });
  });
  record.invoiceItems.forEach((item) => { item.quality.reprovados = rejectionsForInvoice(record, item.number).length; });
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
    records: records.length,
  };
}

function materialBadge(material) {
  const info = MATERIALS[material] || MATERIALS.dormente;
  return `<span class="material-badge ${material}"><i></i>${info.label}</span>`;
}

function canEdit() {
  return state.user?.role !== "viewer";
}

function navButton(view, label, icon) {
  return `<button class="nav-button ${state.view === view ? "active" : ""}" data-nav="${view}"><span aria-hidden="true">${icon}</span><b>${label}</b></button>`;
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  document.body.classList.toggle("tv-mode", state.tvMode);
  if (state.authLoading || !state.user || !state.authorized) {
    app.innerHTML = renderAccessScreen();
    bindAccessEvents();
    return;
  }
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar no-print">
        <button class="brand-lockup" data-nav="dashboard" aria-label="Abrir painel EPYA"><img src="./epya-logo-oficial.png" alt="EPYA" /><span><strong>Recebimentos</strong><small>Controle diário de materiais</small></span></button>
        <nav class="main-nav" aria-label="Navegação principal">${navButton("dashboard", "Painel", "▦")}${canEdit() ? navButton("form", "Lançar", "+") : ""}${navButton("history", "Histórico", "⌕")}${navButton("quality", "Qualidade", "◇")}${navButton("reports", "Relatórios", "▤")}${state.user.role === "admin" ? navButton("team", "Acessos", "◎") : ""}</nav>
        <div class="top-actions"><button class="status-pill ${state.online ? "online" : "offline"}" data-install><i></i>${state.online ? "Online" : "Offline"}${state.pendingSync ? ` • ${state.pendingSync}` : ""}</button><button class="icon-button" data-theme-toggle title="Alternar tema" aria-label="Alternar tema">${state.theme === "dark" ? "☀" : "◐"}</button><button class="button button-dark compact" data-tv-toggle>Modo TV</button><span class="control-owner-chip"><i>DB</i><span><small class="control-motto">Qualidade é compromisso.</small><small>Responsável pelo controle</small><strong>${CONTROL_OWNER}</strong></span></span><button class="user-chip" type="button" data-sign-out title="Sair"><strong>${escapeHtml(state.user.fullName || state.user.email.split("@")[0])}</strong><small>${state.user.role === "admin" ? "Administrador" : state.user.role === "viewer" ? "Consulta" : "Operação"}</small></button></div>
      </header>
      <main class="app-main">${renderCurrentView()}</main>
      <footer class="mobile-nav no-print">${navButton("dashboard", "Painel", "▦")}${canEdit() ? navButton("form", "Lançar", "+") : ""}${navButton("history", "Histórico", "⌕")}${navButton("reports", "Relatórios", "▤")}</footer>
      ${state.tvMode ? '<button class="exit-tv no-print" data-tv-toggle>Sair do modo TV</button>' : ""}
      ${renderModal()}<div class="toast" role="status" aria-live="polite"></div>
    </div>`;
  bindEvents();
}

function renderAccessScreen() {
  const unauthorized = state.authenticated && !state.authorized;
  const form = `<form class="login-form" data-auth-form><label><span>E-mail autorizado</span><input type="email" name="authEmail" autocomplete="email" required placeholder="nome@empresa.com" /></label><label><span>Senha</span><input type="password" name="authPassword" autocomplete="current-password" minlength="8" required placeholder="Mínimo de 8 caracteres" /></label><button class="button button-yellow full" type="submit">Entrar com segurança</button><button class="button button-outline full" type="button" data-create-account>Primeiro acesso</button><small>No primeiro acesso, o Supabase enviará a confirmação ao e-mail previamente autorizado.</small></form>`;
  return `<main class="login-screen"><section class="login-card"><div class="login-brands"><img src="./epya-logo-oficial.png" alt="EPYA" /><span></span><img src="./arauco-sucuriu-logo.svg" alt="ARAUCO Projeto Sucuriú" /></div><span class="eyebrow">Controle diário • Projeto Sucuriú</span><h1>${state.authLoading ? "Preparando seu acesso" : unauthorized ? "E-mail não liberado" : "Recebimentos sob controle"}</h1><p>${state.authLoading ? "Validando sua sessão protegida pelo Supabase…" : unauthorized ? `O e-mail <strong>${escapeHtml(state.user?.email || "")}</strong> foi autenticado, mas não está na lista autorizada por ${OWNER_EMAIL}.` : "Entre com um e-mail autorizado para consultar ou registrar recebimentos."}</p>${state.authLoading ? '<span class="login-loading"><i></i> Aguarde um instante</span>' : unauthorized ? '<button class="button button-outline full" type="button" data-sign-out>Entrar com outro e-mail</button>' : state.online ? form : '<button class="button button-dark full" disabled>O acesso exige conexão</button>'}${state.authMessage ? `<p class="login-message">${escapeHtml(state.authMessage)}</p>` : ""}<button class="install-link" data-install>＋ Adicionar à tela inicial</button><div class="login-benefits"><span><b>✓</b> Supabase Auth</span><span><b>✓</b> RLS por e-mail</span><span><b>✓</b> PDF e relatórios</span></div></section></main>`;
}

function bindAccessEvents() {
  document.querySelectorAll("[data-install]").forEach((button) => button.addEventListener("click", installApp));
  document.querySelector("[data-auth-form]")?.addEventListener("submit", signInWithEmail);
  document.querySelector("[data-create-account]")?.addEventListener("click", createFirstAccess);
  document.querySelectorAll("[data-sign-out]").forEach((button) => button.addEventListener("click", signOut));
}

function renderCurrentView() {
  if (state.loading) return '<section class="loading-panel"><span class="spinner"></span><h1>Carregando os recebimentos</h1><p>Organizando notas fiscais e indicadores.</p></section>';
  if (state.view === "form") return renderForm();
  if (state.view === "history") return renderHistory();
  if (state.view === "quality") return renderQuality();
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

function renderDashboard() {
  const value = metrics();
  const recent = state.records.slice(0, 6);
  return `<section class="view dashboard-view"><article class="dashboard-hero"><div class="hero-copy"><div class="hero-kicker"><span>Controle de recebimentos</span></div><h1>Controle diário de<br />dormentes e trilhos.</h1><p>Notas fiscais, quantidades, qualidade e avanço físico reunidos em uma visão clara da obra.</p><div class="hero-actions no-print">${renderSyncBadge()}${canEdit() ? '<button class="button button-yellow" data-new-record>+ Novo recebimento</button>' : ""}<button class="button button-glass" data-nav="reports">Gerar relatório</button></div></div><div class="hero-corner-brand"><img src="./arauco-sucuriu-logo.svg" alt="Símbolo do Projeto Sucuriú" /><span><strong>ARAUCO</strong><small>Projeto Sucuriú</small></span></div></article>
    <div class="section-heading"><div><span class="eyebrow">Visão executiva</span><h2>Panorama acumulado</h2></div><span class="updated-label">Atualizado com ${value.totalNfs} notas fiscais</span></div><div class="metrics-grid"><article class="metric-card sleeper"><span>Dormentes recebidos</span><strong>${formatNumber(value.sleepers)}</strong><small>${value.sleeperNfs} NFs • meta ${formatNumber(TARGET_SLEEPERS)}</small><div class="metric-progress"><i style="width:${value.progress}%"></i></div></article><article class="metric-card rail"><span>Trilhos recebidos</span><strong>${formatNumber(value.rails)}</strong><small>${value.railNfs} NFs • meta ainda não definida</small><div class="metric-line"></div></article><article class="metric-card remaining"><span>Saldo de dormentes</span><strong>${formatNumber(value.remaining)}</strong><small>${value.progress.toFixed(2).replace(".", ",")}% da meta concluída</small><div class="metric-line"></div></article><article class="metric-card quality"><span>Ocorrências de qualidade</span><strong>${formatNumber(value.sleeperOccurrences + value.railOccurrences)}</strong><small>${formatNumber(value.sleeperOccurrences)} em dormentes • ${formatNumber(value.railOccurrences)} em trilhos</small><div class="metric-line"></div></article></div>
    <div class="dashboard-grid charts-main"><article class="panel chart-card clickable" data-chart-modal="week" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Comparação semanal</span><h2>Entradas por semana</h2></div><span class="expand-hint">Ampliar ↗</span></div><div class="chart-legend"><span><i class="dot yellow"></i>Dormentes</span><span><i class="dot blue"></i>Trilhos</span></div>${renderComparisonChart("week")}</article><article class="panel chart-card clickable" data-chart-modal="month" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Comparação mensal</span><h2>Evolução por mês</h2></div><span class="expand-hint">Ampliar ↗</span></div><div class="chart-legend"><span><i class="dot yellow"></i>Dormentes</span><span><i class="dot blue"></i>Trilhos</span></div>${renderComparisonChart("month")}</article></div>
    <div class="dashboard-grid charts-secondary"><article class="panel chart-card clickable" data-chart-modal="daily" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Ritmo da operação</span><h2>Volume diário</h2></div><span class="expand-hint">Ampliar ↗</span></div>${renderDailyChart()}</article><article class="panel quality-card clickable" data-chart-modal="quality-dormente" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Classificações</span><h2>Qualidade dos dormentes</h2></div><span class="expand-hint">Ampliar ↗</span></div>${renderQualityDonut("dormente")}</article><article class="panel quality-card clickable" data-chart-modal="quality-trilho" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Inspeção ferroviária</span><h2>Qualidade dos trilhos</h2></div><span class="expand-hint">Ampliar ↗</span></div>${renderQualityDonut("trilho")}</article></div>
    ${renderNfQualityPanel()}
    <article class="panel recent-panel"><div class="panel-heading"><div><span class="eyebrow">Últimos lançamentos</span><h2>Recebimentos recentes</h2></div><button class="text-button" data-nav="history">Abrir histórico →</button></div>${renderRecordsTable(recent, true)}</article></section>`;
}

function renderRejectionSection(draft, items, rejections) {
  return `<section class="rejection-control"><div class="rejection-heading"><div><span class="eyebrow">Dormentes reprovados</span><h3>Identificação individual da reprovação</h3><p>Adicione um registro para cada dormente reprovado e informe a NF, o molde, a cavidade e o motivo.</p></div><button type="button" class="button button-dark" data-add-rejection>＋ Adicionar reprovado</button></div>${rejections.length ? `<div class="rejection-list">${rejections.map((rejection, index) => { const invoiceOptions = items.filter((item) => item.number).map((item) => `<option value="${escapeHtml(item.number)}" ${String(item.number) === rejection.invoiceNumber ? "selected" : ""}>NF ${escapeHtml(item.number)}</option>`).join(""); const reasonOptions = state.rejectionReasons.map((reason) => `<option value="${escapeHtml(reason.id)}" ${reason.id === rejection.reasonId ? "selected" : ""}>${escapeHtml(reason.label)}</option>`).join(""); return `<article class="rejection-row" data-rejection-row data-rejection-id="${escapeHtml(rejection.id)}"><header><strong>Dormente reprovado ${index + 1}</strong><button type="button" data-remove-rejection="${index}" aria-label="Remover dormente reprovado ${index + 1}">×</button></header><div class="rejection-fields"><label><span>Nota fiscal *</span><select name="rejectionInvoice" required><option value="">Selecione a NF</option>${invoiceOptions}</select></label><label><span>Molde *</span><input name="rejectionMold" value="${escapeHtml(rejection.mold)}" placeholder="Número do molde" required /></label><label><span>Cavidade *</span><input name="rejectionCavity" value="${escapeHtml(rejection.cavity)}" placeholder="Número da cavidade" required /></label><label><span>Motivo da reprovação *</span><select name="rejectionReason" required><option value="">Selecione o motivo</option>${reasonOptions}</select></label></div></article>`; }).join("")}</div>` : '<div class="rejection-empty">Nenhum dormente reprovado neste lançamento.</div>'}<div class="rejection-reason-manager"><div><strong>Motivos de reprovação</strong><small>Cadastre os motivos conforme precisar. Eles ficarão disponíveis nos próximos lançamentos.</small></div><input name="newRejectionReason" placeholder="Ex.: trinca estrutural" /><button type="button" class="button button-outline" data-add-rejection-reason>Adicionar motivo</button></div></section>`;
}

function formRecordFromDom() {
  const form = document.querySelector("#receiving-form");
  if (!form) return state.draft || defaultDraft();
  const invoiceNumbers = [...form.querySelectorAll('[name="invoiceNumber"]')];
  const invoiceQuantities = [...form.querySelectorAll('[name="invoiceQuantity"]')];
  const draftItems = invoiceItems(state.draft || {});
  const items = invoiceNumbers.map((input, index) => { const numberValue = input.value.trim(); const previous = draftItems.find((item) => String(item.number) === numberValue) || draftItems[index]; return { number: numberValue, quantity: number(invoiceQuantities[index]?.value), ...(previous?.quality ? { quality: structuredClone(previous.quality) } : {}) }; }).filter((item) => item.number || item.quantity);
  const quality = { ...((state.draft || {}).quality || {}) };
  qualityCategories(form.elements.material.value).forEach((category) => { quality[category.id] = number(form.querySelector(`[name="quality_${category.id}"]`)?.value); });
  const rejections = [...form.querySelectorAll("[data-rejection-row]")].map((row) => {
    const reasonId = row.querySelector('[name="rejectionReason"]')?.value || "";
    return { id: row.dataset.rejectionId || crypto.randomUUID(), invoiceNumber: row.querySelector('[name="rejectionInvoice"]')?.value || "", mold: row.querySelector('[name="rejectionMold"]')?.value.trim() || "", cavity: row.querySelector('[name="rejectionCavity"]')?.value.trim() || "", reasonId, reason: state.rejectionReasons.find((item) => item.id === reasonId)?.label || "" };
  });
  if (form.elements.material.value === "dormente") quality.reprovados = rejections.length;
  return { ...(state.draft || defaultDraft()), material: form.elements.material.value, receivedDate: form.elements.receivedDate.value, receivedTime: form.elements.receivedTime.value, timeKnown: Boolean(form.elements.receivedTime.value), location: form.elements.location.value.trim(), supplier: form.elements.supplier.value.trim(), vehiclePlate: form.elements.vehiclePlate.value.trim().toUpperCase(), inspectorName: form.elements.inspectorName.value.trim(), observations: form.elements.observations.value.trim(), invoiceItems: items.length ? items : [{ number: "", quantity: 0 }], quality, rejections, _cleanupMolde57Cav1: true };
}

function renderForm() {
  const draft = state.draft || defaultDraft();
  const items = draft.invoiceItems?.length ? draft.invoiceItems : [{ number: "", quantity: "" }];
  const total = items.reduce((sum, item) => sum + number(item.quantity), 0);
  const isSleeper = draft.material === "dormente";
  const rejections = isSleeper ? rejectionRows(draft) : [];
  return `<section class="view form-view"><div class="page-heading"><div><button class="back-link" data-nav="dashboard">← Voltar ao painel</button><span class="eyebrow">${state.editingId ? "Editar lançamento" : "Novo recebimento"}</span><h1>${state.editingId ? "Atualizar recebimento" : "Registrar chegada do dia"}</h1><p>Informe as NFs e as quantidades. O total é calculado automaticamente.</p></div><div class="heading-summary"><span>Total deste lançamento</span><strong data-form-total>${formatNumber(total)}</strong><small>${MATERIALS[draft.material].unit}</small></div></div><form id="receiving-form" class="receiving-form">
    <article class="panel form-panel"><div class="form-section-title"><span>01</span><div><h2>Material recebido</h2><p>Escolha o tipo antes de preencher as notas.</p></div></div><div class="material-selector"><button type="button" class="material-option ${isSleeper ? "active" : ""}" data-material="dormente"><i class="sleeper-icon"></i><span><strong>Dormentes</strong><small>Meta: ${formatNumber(TARGET_SLEEPERS)} unidades</small></span><b>${isSleeper ? "✓" : ""}</b></button><button type="button" class="material-option ${!isSleeper ? "active" : ""}" data-material="trilho"><i class="rail-icon"></i><span><strong>Trilhos</strong><small>Meta aberta para definição</small></span><b>${!isSleeper ? "✓" : ""}</b></button></div><input type="hidden" name="material" value="${draft.material}" /></article>
    <article class="panel form-panel"><div class="form-section-title"><span>02</span><div><h2>Data, horário e local</h2><p>O horário pode ficar vazio quando ainda não foi confirmado.</p></div></div><div class="field-grid four"><label><span>Data do recebimento *</span><input type="date" name="receivedDate" value="${escapeHtml(draft.receivedDate)}" required /></label><label><span>Horário</span><input type="time" name="receivedTime" value="${escapeHtml(draft.receivedTime || "")}" /></label><label class="span-two"><span>Local / ponto de descarga *</span><input name="location" value="${escapeHtml(draft.location)}" placeholder="Ex.: Frente Norte, pátio ou ponto de descarga" required /></label><label class="span-two"><span>Fornecedor / origem</span><input name="supplier" value="${escapeHtml(draft.supplier)}" /></label><label><span>Placa do veículo</span><input name="vehiclePlate" value="${escapeHtml(draft.vehiclePlate || "")}" placeholder="ABC-1D23" /></label><label><span>Responsável</span><input name="inspectorName" value="${escapeHtml(draft.inspectorName || "")}" /></label></div></article>
    <article class="panel form-panel invoice-panel"><div class="form-section-title"><span>03</span><div><h2>Notas fiscais e quantidades</h2><p>Adicione quantas NFs chegaram juntas. A soma aparece no topo.</p></div></div><div class="invoice-head"><span>Nota fiscal</span><span>Quantidade</span><span></span></div><div class="invoice-list">${items.map((item, index) => `<div class="invoice-row" data-invoice-row="${index}"><label><span>NF ${index + 1}</span><input name="invoiceNumber" value="${escapeHtml(item.number)}" inputmode="numeric" placeholder="Número da NF" required /></label><label><span>Quantidade</span><input type="number" min="0" name="invoiceQuantity" value="${item.quantity || ""}" placeholder="0" required /></label><button type="button" class="remove-row" data-remove-invoice="${index}" aria-label="Remover nota" ${items.length === 1 ? "disabled" : ""}>×</button></div>`).join("")}</div><button type="button" class="add-row-button" data-add-invoice>＋ Adicionar outra NF</button><div class="invoice-total"><span>Total automático</span><strong data-form-total>${formatNumber(total)}</strong><small>${MATERIALS[draft.material].unit}</small></div></article>
    <article class="panel form-panel quality-form-panel"><div class="form-section-title"><span>04</span><div><h2>Qualidade dos ${isSleeper ? "dormentes" : "trilhos"}</h2><p>Use somente quando houver ocorrência. Os campos podem permanecer zerados.</p></div></div><div class="quality-input-grid">${qualityCategories(draft.material).map((category) => { const rejectedField = isSleeper && category.id === "reprovados"; return `<label style="--category:${category.color}"><i></i><span>${escapeHtml(category.label)}</span><input type="number" min="0" name="quality_${category.id}" value="${rejectedField ? rejections.length : number(draft.quality?.[category.id])}" ${rejectedField ? "readonly aria-describedby=\"rejected-help\"" : ""} /></label>`; }).join("")}</div>${isSleeper ? `<p id="rejected-help" class="rejected-help">O total de reprovados é calculado automaticamente pelos registros individuais abaixo.</p><div class="new-category-inline"><input name="newCategory" placeholder="Nova classificação, ex.: fissuras" /><button type="button" class="button button-outline" data-add-category>Adicionar classificação</button></div>${renderRejectionSection(draft, items, rejections)}` : '<p class="rail-quality-note">Registre empenamento, corrosão e danos no boleto, alma ou patim antes da liberação.</p>'}</article>
    <article class="panel form-panel final-form-panel"><div class="form-section-title"><span>05</span><div><h2>Observações e confirmação</h2><p>Registre qualquer ressalva importante para o relatório.</p></div></div><label><span>Observações</span><textarea name="observations" rows="4" placeholder="Condições da descarga, divergências ou informações complementares">${escapeHtml(draft.observations || "")}</textarea></label><div class="form-actions"><button type="button" class="button button-outline" data-cancel-form>Cancelar</button><button type="button" class="button button-dark" data-save-status="rascunho">Salvar rascunho</button><button type="submit" class="button button-yellow">${state.editingId ? "Atualizar recebimento" : "Salvar recebimento"}</button></div></article></form></section>`;
}

function filteredHistory() {
  const { search, material, from, to } = state.historyFilters;
  const query = search.trim().toLowerCase();
  return state.records.filter((record) => {
    const date = record.receivedDate || String(record.receivedAt).slice(0, 10);
    const content = `${record.invoiceNumbers || ""} ${record.supplier || ""} ${record.location || ""}`.toLowerCase();
    return (!query || content.includes(query)) && (material === "todos" || record.material === material) && (!from || date >= from) && (!to || date <= to);
  });
}

function renderRecordsTable(records, compact = false) {
  if (!records.length) return '<div class="empty-state"><span>▤</span><h3>Nenhum recebimento encontrado</h3><p>Altere os filtros ou faça um novo lançamento.</p></div>';
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Data / horário</th><th>Material</th><th>Nota fiscal</th><th>Local</th><th>Quantidade</th>${compact ? "" : "<th>Qualidade</th>"}<th class="no-print">Ações</th></tr></thead><tbody>${records.map((record) => { const items = invoiceItems(record); const date = record.receivedDate || String(record.receivedAt).slice(0, 10); return `<tr><td><strong>${formatDate(date)}</strong><small>${record.receivedTime ? record.receivedTime : "Horário pendente"}</small></td><td>${materialBadge(record.material)}</td><td><strong>${items.length} NF${items.length === 1 ? "" : "s"}</strong><small>${escapeHtml(items.map((item) => item.number).join(", "))}</small></td><td><strong>${escapeHtml(record.location || "—")}</strong><small>${escapeHtml(record.supplier || "—")}</small></td><td><strong>${formatNumber(recordQuantity(record))}</strong><small>${MATERIALS[record.material]?.unit || "un"}</small></td>${compact ? "" : `<td><strong>${formatNumber(qualityOccurrences(record))} ocorrências</strong><small>${formatNumber(qualityRejected(record))} reprovados • ${record.status === "rascunho" ? "Rascunho" : "Concluído"}</small></td>`}<td class="table-actions no-print"><button data-view-record="${record.id}" title="Ver detalhes">Ver</button>${canEdit() ? `<button data-edit-record="${record.id}" title="Editar">Editar</button><button class="danger" data-delete-record="${record.id}" title="Excluir">Excluir</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`;
}

function renderHistory() {
  const records = filteredHistory();
  const value = metrics(records);
  return `<section class="view history-view"><div class="page-heading"><div><span class="eyebrow">Rastreabilidade</span><h1>Histórico de recebimentos</h1><p>Pesquise por NF, fornecedor, período ou tipo de material.</p></div><div class="heading-actions">${canEdit() ? '<button class="button button-yellow" data-new-record>+ Novo recebimento</button>' : ""}<button class="button button-outline" data-export-csv>Exportar planilha</button></div></div><article class="panel filters-panel no-print"><label class="search-field"><span>Buscar NF, local ou fornecedor</span><input name="historySearch" value="${escapeHtml(state.historyFilters.search)}" placeholder="Digite para pesquisar" /></label><label><span>Material</span><select name="historyMaterial"><option value="todos">Todos</option><option value="dormente" ${state.historyFilters.material === "dormente" ? "selected" : ""}>Dormentes</option><option value="trilho" ${state.historyFilters.material === "trilho" ? "selected" : ""}>Trilhos</option></select></label><label><span>De</span><input type="date" name="historyFrom" value="${state.historyFilters.from}" /></label><label><span>Até</span><input type="date" name="historyTo" value="${state.historyFilters.to}" /></label><button class="button button-dark compact" data-apply-history>Filtrar</button><button class="text-button" data-clear-history>Limpar</button></article><div class="history-summary"><span><strong>${records.length}</strong> lançamentos</span><span><strong>${formatNumber(value.totalNfs)}</strong> notas fiscais</span><span><strong>${formatNumber(value.sleepers)}</strong> dormentes</span><span><strong>${formatNumber(value.rails)}</strong> trilhos</span></div><article class="panel">${renderRecordsTable(records)}</article></section>`;
}

function renderQuality() {
  const sleeperRecords = state.records.filter((record) => record.material === "dormente");
  const railRecords = state.records.filter((record) => record.material === "trilho");
  const value = metrics();
  const sleeperTotals = qualityTotals("dormente", sleeperRecords);
  const railTotals = qualityTotals("trilho", railRecords);
  return `<section class="view quality-view"><div class="page-heading"><div><span class="eyebrow">Inspeção e segregação</span><h1>Qualidade de dormentes e trilhos</h1><p>Acompanhe ocorrências dos dois materiais e registre cada inspeção de campo.</p></div>${canEdit() ? '<div class="heading-actions"><button class="button button-yellow" data-new-sleeper>+ Lançar dormentes</button><button class="button button-outline" data-new-rail>+ Lançar trilhos</button></div>' : ""}</div><div class="quality-hero-grid"><article class="panel quality-overview clickable" data-chart-modal="quality-dormente" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Dormentes</span><h2>Ocorrências acumuladas</h2></div><span class="expand-hint">Ampliar ↗</span></div>${renderQualityDonut("dormente", sleeperRecords)}</article><article class="panel quality-overview clickable" data-chart-modal="quality-trilho" tabindex="0"><div class="panel-heading"><div><span class="eyebrow">Trilhos</span><h2>Inspeções e avarias</h2></div><span class="expand-hint">Ampliar ↗</span></div>${renderQualityDonut("trilho", railRecords)}</article></div><article class="panel quality-kpis quality-kpis-wide"><div><span>Dormentes recebidos</span><strong>${formatNumber(value.sleepers)}</strong></div><div><span>Dormentes reprovados</span><strong class="danger-text">${formatNumber(value.rejected)}</strong></div><div><span>Trilhos recebidos</span><strong>${formatNumber(value.rails)}</strong></div><div><span>Trilhos reprovados</span><strong class="danger-text">${formatNumber(value.railRejected)}</strong></div></article><div class="quality-section-heading"><span class="eyebrow">Separação de dormentes</span><h2>Classificações cadastradas</h2></div><div class="quality-category-grid">${state.categories.map((category) => `<article class="category-card" style="--category:${category.color}"><i></i><span>${escapeHtml(category.label)}</span><strong>${formatNumber(sleeperTotals[category.id])}</strong><small>ocorrências acumuladas</small></article>`).join("")}</div><div class="quality-section-heading"><span class="eyebrow">Inspeção dos trilhos</span><h2>Classificações ferroviárias</h2></div><div class="quality-category-grid rail-categories">${RAIL_QUALITY_CATEGORIES.map((category) => `<article class="category-card" style="--category:${category.color}"><i></i><span>${escapeHtml(category.label)}</span><strong>${formatNumber(railTotals[category.id])}</strong><small>ocorrências acumuladas</small></article>`).join("")}</div>${canEdit() ? `<article class="panel category-manager"><div><span class="eyebrow">Personalizar dormentes</span><h2>Adicionar nova classificação</h2><p>Ex.: fissuras, ombreira danificada ou cordoalha aparente.</p></div><div class="category-add-form"><input name="qualityNewCategory" placeholder="Nome da classificação" /><button class="button button-dark" data-add-category-page>Adicionar</button></div></article>` : ""}<article class="panel"><div class="panel-heading"><div><span class="eyebrow">Lançamentos</span><h2>Últimas inspeções de materiais</h2></div></div>${renderRecordsTable(state.records.slice(0, 12), true)}</article></section>`;
}

function reportRecords() {
  const { from, to, material } = state.reportFilters;
  return state.records.filter((record) => { const date = record.receivedDate || String(record.receivedAt).slice(0, 10); return (!from || date >= from) && (!to || date <= to) && (material === "todos" || record.material === material); });
}

function renderReportImageControls() {
  return `<article class="panel report-image-control no-print"><div><span class="eyebrow">Registro fotográfico opcional</span><h2>Adicionar imagens ao relatório</h2><p>Selecione até 6 fotos. Elas aparecerão no PDF com o nome do arquivo.</p></div><label class="button button-outline file-button">＋ Selecionar imagens<input type="file" accept="image/*" multiple data-report-images /></label>${state.reportImages.length ? `<div class="report-image-previews">${state.reportImages.map((image) => `<figure><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.name)}" /><figcaption>${escapeHtml(image.name)}</figcaption><button type="button" data-remove-report-image="${image.id}" aria-label="Remover ${escapeHtml(image.name)}">×</button></figure>`).join("")}</div>` : '<span class="report-image-empty">Nenhuma imagem selecionada.</span>'}</article>`;
}

function renderReportPhotoSection() {
  if (!state.reportImages.length) return "";
  return `<section class="report-photo-section"><h2>Registro fotográfico</h2><div class="report-photo-grid">${state.reportImages.map((image) => `<figure><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.name)}" /><figcaption>${escapeHtml(image.name)}</figcaption></figure>`).join("")}</div></section>`;
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
    quality: invoiceQuality(record, item, index),
  })));
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
  const baseCells = ({ record, item }) => `<td>${formatDate(record.receivedDate)}</td><td>${escapeHtml(item.number)}</td><td>${escapeHtml(record.location)}</td><td>${formatNumber(item.quantity)}</td>`;
  if (state.reportFilters.material === "dormente") return `<h2 class="report-table-title">Detalhamento por nota fiscal — dormentes</h2><div class="report-table"><table><thead><tr><th>Data</th><th>NF</th><th>Local</th><th>Qtd.</th><th>PQ</th><th>R</th><th>B</th><th>Quebras</th><th>Reprovados</th></tr></thead><tbody>${rows.map((row) => { const summary = sleeperQualitySummary(row.quality); return `<tr>${baseCells(row)}<td>${formatNumber(summary.smallBreaks)}</td><td>${formatNumber(summary.repaired)}</td><td>${formatNumber(summary.bubbles)}</td><td>${formatNumber(summary.breaks)}</td><td>${formatNumber(Math.max(summary.rejected, rejectionsForInvoice(row.record, row.item.number).length))}</td></tr>`; }).join("")}</tbody></table></div>`;
  if (state.reportFilters.material === "trilho") return `<h2 class="report-table-title">Detalhamento por nota fiscal — trilhos</h2><div class="report-table"><table><thead><tr><th>Data</th><th>NF</th><th>Local</th><th>Qtd.</th><th>Empeno</th><th>Oxidação</th><th>Boleto</th><th>Alma</th><th>Patim</th><th>Reprovados</th></tr></thead><tbody>${rows.map((row) => { const summary = railQualitySummary(row.quality); return `<tr>${baseCells(row)}<td>${formatNumber(summary.bending)}</td><td>${formatNumber(summary.oxidation)}</td><td>${formatNumber(summary.head)}</td><td>${formatNumber(summary.web)}</td><td>${formatNumber(summary.foot)}</td><td>${formatNumber(summary.rejected)}</td></tr>`; }).join("")}</tbody></table></div>`;
  return `<h2 class="report-table-title">Detalhamento por nota fiscal — visão conjunta</h2><div class="report-table"><table><thead><tr><th>Data</th><th>Material</th><th>NF</th><th>Local</th><th>Qtd.</th><th>Ocorrências de qualidade</th></tr></thead><tbody>${rows.map(({ record, item, quality }) => { const details = qualityCategories(record.material).map((category) => ({ label: category.label, value: number(quality[category.id]) })).filter((entry) => entry.value > 0).map((entry) => `${entry.label}: ${formatNumber(entry.value)}`).join(" • ") || "Sem ocorrências"; return `<tr><td>${formatDate(record.receivedDate)}</td><td>${MATERIALS[record.material].label}</td><td>${escapeHtml(item.number)}</td><td>${escapeHtml(record.location)}</td><td>${formatNumber(item.quantity)}</td><td class="report-quality-cell">${escapeHtml(details)}</td></tr>`; }).join("")}</tbody></table></div>`;
}

function renderReports() {
  const records = reportRecords();
  const material = state.reportFilters.material;
  const materialLabel = material === "todos" ? "Dormentes e trilhos" : MATERIALS[material].label;
  const pdfLabel = material === "todos" ? "Gerar PDF: Ambos" : `Gerar PDF: ${MATERIALS[material].label}`;
  return `<section class="view reports-view">
    <div class="page-heading no-print"><div><span class="eyebrow">Relatório semanal e por período</span><h1>Relatórios da obra</h1><p>Escolha dormentes, trilhos ou a visão conjunta. O PDF e a planilha respeitam exatamente essa seleção.</p></div><div class="heading-actions"><button class="button button-outline" data-report-week>Últimos 7 dias</button><button class="button button-outline" data-export-report>Exportar Excel</button><button class="button button-yellow" data-print-report>${pdfLabel}</button></div></div>
    ${renderReportMaterialSwitch()}
    <article class="panel report-filters no-print"><label><span>Data inicial</span><input type="date" name="reportFrom" value="${state.reportFilters.from}" /></label><label><span>Data final</span><input type="date" name="reportTo" value="${state.reportFilters.to}" /></label><label><span>Material selecionado</span><select name="reportMaterial"><option value="todos">Todos os materiais</option><option value="dormente" ${state.reportFilters.material === "dormente" ? "selected" : ""}>Dormentes</option><option value="trilho" ${state.reportFilters.material === "trilho" ? "selected" : ""}>Trilhos</option></select></label><button class="button button-dark" data-apply-report>Atualizar relatório</button></article>
    ${renderReportImageControls()}
    <article class="print-report"><header class="report-header"><img src="./epya-logo-oficial.png" alt="EPYA" /><div><span>RELATÓRIO DE RECEBIMENTO DE MATERIAIS</span><h1>ARAUCO / Projeto Sucuriú</h1><p>Material: <strong>${materialLabel}</strong></p><p>Período: ${formatDate(state.reportFilters.from)} a ${formatDate(state.reportFilters.to)}</p><p>Responsável pelo controle: <strong>${CONTROL_OWNER}</strong></p></div><img src="./arauco-sucuriu-logo.svg" alt="ARAUCO Projeto Sucuriú" /></header>
      ${renderReportKpis(records)}
      <div class="report-charts"><section class="clickable" data-chart-modal="report-week" tabindex="0"><div class="report-chart-heading"><h2>Comparação semanal</h2><span>Ampliar ↗</span></div>${renderComparisonChart("week", records)}</section><section class="clickable" data-chart-modal="report-quality" tabindex="0"><div class="report-chart-heading"><h2>Qualidade — ${materialLabel}</h2><span>Ampliar ↗</span></div>${renderReportQuality(records, material)}</section></div>
      ${renderReportTable(records)}
      ${renderReportRejections(records)}${renderReportPhotoSection()}<footer class="report-footer"><span>Emitido em ${formatDate(todayInput())}</span><span>EPYA • Controle diário de recebimentos</span></footer></article>
    <article class="panel email-report no-print"><div><span class="eyebrow">Compartilhamento</span><h2>Enviar relatório</h2><p>Gere o PDF e depois abra o WhatsApp para anexar o arquivo salvo. Você também pode preparar o envio por e-mail.</p></div><div class="email-fields"><input type="email" name="reportEmail" value="${OWNER_EMAIL}" placeholder="destinatario@empresa.com" /><button class="button button-outline" data-email-report>Preparar e-mail</button><button class="button button-dark" data-whatsapp-report>Abrir WhatsApp</button></div></article>
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
  if (["week", "month", "report-week", "report-month"].includes(state.modal.type)) {
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
  } else if (state.modal.type === "record") {
    const record = state.records.find((item) => item.id === state.modal.id);
    if (!record) return "";
    title = `${MATERIALS[record.material].label} • ${formatDate(record.receivedDate)}`;
    subtitle = `${record.location || "Local não informado"} • ${record.receivedTime || "horário pendente"}`;
    const items = invoiceItems(record);
    const sleeperColumns = record.material === "dormente" ? "<th>PQ</th><th>R</th><th>B</th><th>Quebras</th>" : "";
    const rejectedRows = rejectionRows(record);
    body = `<div class="record-modal-summary"><div><span>Total recebido</span><strong>${formatNumber(recordQuantity(record))}</strong><small>${MATERIALS[record.material].unit}</small></div><div><span>Fornecedor</span><strong>${escapeHtml(record.supplier || "—")}</strong><small>${escapeHtml(record.vehiclePlate || "Sem placa")}</small></div></div><div class="modal-table"><table><thead><tr><th>Nota fiscal</th><th>Quantidade</th>${sleeperColumns}</tr></thead><tbody>${items.map((item, index) => { const summary = sleeperQualitySummary(invoiceQuality(record, item, index)); return `<tr><td>NF ${escapeHtml(item.number)}</td><td>${formatNumber(item.quantity)} ${MATERIALS[record.material].unit}</td>${record.material === "dormente" ? `<td>${formatNumber(summary.smallBreaks)}</td><td>${formatNumber(summary.repaired)}</td><td>${formatNumber(summary.bubbles)}</td><td>${formatNumber(summary.breaks)}</td>` : ""}</tr>`; }).join("")}</tbody></table></div><div class="record-quality-list">${qualityCategories(record.material).map((category) => `<span><i style="background:${category.color}"></i>${escapeHtml(category.label)} <strong>${formatNumber(record.quality?.[category.id])}</strong></span>`).join("")}</div>${rejectedRows.length ? `<div class="record-rejections"><h3>Dormentes reprovados</h3><div class="modal-table"><table><thead><tr><th>NF</th><th>Molde</th><th>Cavidade</th><th>Motivo</th></tr></thead><tbody>${rejectedRows.map((rejection) => `<tr><td>${escapeHtml(rejection.invoiceNumber || "—")}</td><td>${escapeHtml(rejection.mold || "—")}</td><td>${escapeHtml(rejection.cavity || "—")}</td><td>${escapeHtml(rejection.reason || state.rejectionReasons.find((reason) => reason.id === rejection.reasonId)?.label || "—")}</td></tr>`).join("")}</tbody></table></div></div>` : ""}<p class="record-observation"><strong>Responsável:</strong> ${escapeHtml(record.inspectorName || CONTROL_OWNER)}</p><p class="record-observation"><strong>Observações:</strong> ${escapeHtml(record.observations || "Nenhuma observação.")}</p>`;
  }
  return `<div class="modal-backdrop" data-modal-close><section class="chart-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" onclick="event.stopPropagation()"><header><div><span class="eyebrow">${escapeHtml(subtitle)}</span><h2>${escapeHtml(title)}</h2></div><button data-modal-close aria-label="Fechar">×</button></header>${body}<footer><button class="button button-outline" data-modal-close>Fechar</button><button class="button button-dark" data-print-report>Gerar PDF do painel</button></footer></section></div>`;
}

function bindEvents() {
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
  document.querySelectorAll("[data-edit-record]").forEach((button) => button.addEventListener("click", () => editRecord(button.dataset.editRecord)));
  document.querySelectorAll("[data-delete-record]").forEach((button) => button.addEventListener("click", () => deleteRecord(button.dataset.deleteRecord)));
  document.querySelector("[data-export-csv]")?.addEventListener("click", () => exportCsv(filteredHistory()));
  document.querySelector("[data-export-report]")?.addEventListener("click", () => exportCsv(reportRecords()));
  document.querySelectorAll("[data-print-report]").forEach((button) => button.addEventListener("click", printReport));
  document.querySelector("[data-email-report]")?.addEventListener("click", emailReport);
  document.querySelector("[data-whatsapp-report]")?.addEventListener("click", whatsappReport);
  document.querySelector("[data-add-user]")?.addEventListener("click", addTeamMember);
  document.querySelectorAll("[data-remove-user]").forEach((button) => button.addEventListener("click", () => removeTeamMember(button.dataset.removeUser)));
  document.querySelector("[data-apply-history]")?.addEventListener("click", applyHistoryFilters);
  document.querySelector("[data-clear-history]")?.addEventListener("click", () => { state.historyFilters = { search: "", material: "todos", from: "", to: "" }; render(); });
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
  form.addEventListener("submit", (event) => { event.preventDefault(); saveCurrent("concluido"); });
  form.querySelectorAll('[name="invoiceQuantity"]').forEach((input) => input.addEventListener("input", updateFormTotal));
  form.querySelectorAll("[data-material]").forEach((button) => button.addEventListener("click", () => { state.draft = formRecordFromDom(); state.draft.material = button.dataset.material; if (!state.draft.supplier) state.draft.supplier = button.dataset.material === "dormente" ? "Cavan / Arauco" : "Arauco"; render(); }));
  form.querySelector("[data-add-invoice]")?.addEventListener("click", () => { state.draft = formRecordFromDom(); state.draft.invoiceItems.push({ number: "", quantity: "" }); render(); });
  form.querySelectorAll("[data-remove-invoice]").forEach((button) => button.addEventListener("click", () => { state.draft = formRecordFromDom(); state.draft.invoiceItems.splice(number(button.dataset.removeInvoice), 1); render(); }));
  form.querySelector("[data-add-rejection]")?.addEventListener("click", () => { state.draft = formRecordFromDom(); const firstInvoice = state.draft.invoiceItems.find((item) => item.number)?.number || ""; state.draft.rejections = rejectionRows(state.draft); state.draft.rejections.push({ id: crypto.randomUUID(), invoiceNumber: firstInvoice, mold: "", cavity: "", reasonId: "", reason: "" }); state.draft.quality.reprovados = state.draft.rejections.length; render(); });
  form.querySelectorAll("[data-remove-rejection]").forEach((button) => button.addEventListener("click", () => { state.draft = formRecordFromDom(); state.draft.rejections.splice(number(button.dataset.removeRejection), 1); state.draft.quality.reprovados = state.draft.rejections.length; render(); }));
  form.querySelector("[data-add-rejection-reason]")?.addEventListener("click", () => addRejectionReason(form.querySelector('[name="newRejectionReason"]')?.value));
  form.querySelector("[data-save-status]")?.addEventListener("click", () => saveCurrent("rascunho"));
  form.querySelector("[data-cancel-form]")?.addEventListener("click", () => navigate("dashboard"));
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
  if (view === "form" && !canEdit()) return;
  state.view = view; state.modal = null;
  if (view === "form" && !state.draft) state.draft = defaultDraft();
  if (view === "team" && state.user?.role === "admin" && !state.teamLoaded) loadTeam();
  render(); window.scrollTo({ top: 0, behavior: "smooth" });
}

function newRecord(material = "dormente") { state.draft = defaultDraft(material); state.editingId = ""; navigate("form"); }

function editRecord(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record || !canEdit()) return;
  state.draft = structuredClone({ ...record, receivedDate: record.receivedDate || String(record.receivedAt).slice(0, 10), receivedTime: record.receivedTime || "", invoiceItems: invoiceItems(record), quality: { ...Object.fromEntries([...state.categories, ...RAIL_QUALITY_CATEGORIES].map((category) => [category.id, 0])), ...(record.quality || {}) } });
  state.editingId = id; navigate("form");
}

async function saveCurrent(status) {
  if (!canEdit()) return toast("Seu acesso é somente para consulta.", "error");
  const record = formRecordFromDom();
  const validItems = record.invoiceItems.filter((item) => item.number && number(item.quantity));
  if (status !== "rascunho" && !record.receivedDate) return toast("Informe a data do recebimento.", "error");
  if (status !== "rascunho" && !validItems.length) return toast("Informe ao menos uma NF com quantidade.", "error");
  if (status !== "rascunho" && !record.location) return toast("Informe o local de descarga.", "error");
  if (status !== "rascunho" && record.material === "dormente" && record.rejections.some((item) => !item.invoiceNumber || !item.mold || !item.cavity || !item.reasonId)) return toast("Complete NF, molde, cavidade e motivo de cada dormente reprovado.", "error");
  record.id = state.editingId || record.id || crypto.randomUUID(); record.status = status; record.seeded = false; record.invoiceItems = validItems.length ? validItems : record.invoiceItems; reconcileInvoiceQuality(record); record.invoiceNumbers = record.invoiceItems.map((item) => item.number).filter(Boolean).join(", "); record.quantity = record.invoiceItems.reduce((sum, item) => sum + number(item.quantity), 0); record.rejected = qualityRejected(record); record.approved = Math.max(0, record.quantity - record.rejected); record.inspectorName = record.inspectorName || CONTROL_OWNER; record.receivedAt = `${record.receivedDate || todayInput()}T${record.receivedTime || "00:00"}:00`; record.timeKnown = Boolean(record.receivedTime); record.createdAt = record.createdAt || new Date().toISOString(); record.updatedAt = new Date().toISOString();
  try {
    if (!supabaseClient || !state.online) throw new Error("offline");
    const { error } = await supabaseClient.from("crm_records").upsert(supabaseRecordRow(record), { onConflict: "id" });
    if (error) throw error;
    replaceRecord(record); state.storageMode = "cloud";
  } catch {
    replaceRecord(record); writeLocalRecords(); queueForSync(record); state.storageMode = "local";
  }
  state.draft = null; state.editingId = ""; state.view = "dashboard"; render(); toast(status === "rascunho" ? "Rascunho salvo." : "Recebimento salvo e painel atualizado.", "success");
}

function replaceRecord(record) { const index = state.records.findIndex((item) => item.id === record.id); if (index >= 0) state.records[index] = record; else state.records.push(record); state.records.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt))); }

async function deleteRecord(id) {
  if (!canEdit()) return;
  const record = state.records.find((item) => item.id === id);
  if (!record || !confirm(`Excluir o recebimento de ${formatDate(record.receivedDate)}?`)) return;
  try { const { error } = await supabaseClient.from("crm_records").delete().eq("id", id); if (error) throw error; } catch { return toast("Não foi possível excluir no Supabase.", "error"); }
  state.records = state.records.filter((item) => item.id !== id); writeLocalRecords(); render(); toast("Recebimento excluído.", "success");
}

async function addCategory(rawName) {
  const label = String(rawName || "").trim();
  if (!label) return toast("Digite o nome da nova classificação.", "error");
  const id = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (state.categories.some((category) => category.id === id)) return toast("Essa classificação já existe.", "error");
  const palette = ["#ef8d32", "#15b7a5", "#ec5f78", "#806bff", "#25a8e0", "#9cbf33"];
  const category = { id, label, color: palette[state.categories.length % palette.length] };
  try { const { data, error } = await supabaseClient.from("quality_categories").upsert({ ...category, active: true, created_by: state.user.email, updated_at: new Date().toISOString() }, { onConflict: "id" }).select("id,label,color").single(); if (error) throw error; state.categories.push(data); } catch { return toast("Não foi possível adicionar a classificação no Supabase.", "error"); }
  if (state.draft) { const formDraft = formRecordFromDom(); state.draft = { ...formDraft, quality: { ...formDraft.quality, [id]: 0 } }; }
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

function applyHistoryFilters() { state.historyFilters = { search: document.querySelector('[name="historySearch"]')?.value || "", material: document.querySelector('[name="historyMaterial"]')?.value || "todos", from: document.querySelector('[name="historyFrom"]')?.value || "", to: document.querySelector('[name="historyTo"]')?.value || "" }; render(); }
function applyReportFilters() { state.reportFilters = { from: document.querySelector('[name="reportFrom"]')?.value || "", to: document.querySelector('[name="reportTo"]')?.value || "", material: document.querySelector('[name="reportMaterial"]')?.value || "todos" }; render(); }
function selectLatestReportWeek() { const material = document.querySelector('[name="reportMaterial"]')?.value || state.reportFilters.material; const dates = state.records.filter((record) => material === "todos" || record.material === material).map((record) => record.receivedDate || String(record.receivedAt).slice(0, 10)).filter(Boolean).sort(); const to = dates.at(-1) || todayInput(); state.reportFilters = { material, from: addDays(to, -6), to }; render(); }
function selectReportMaterial(material) { if (!["todos", "dormente", "trilho"].includes(material)) return; state.reportFilters = { ...state.reportFilters, from: document.querySelector('[name="reportFrom"]')?.value || state.reportFilters.from, to: document.querySelector('[name="reportTo"]')?.value || state.reportFilters.to, material }; render(); }

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

function printReport() { state.modal = null; state.view = "reports"; render(); setTimeout(() => window.print(), 250); }

function emailReport() {
  const recipient = document.querySelector('[name="reportEmail"]')?.value.trim();
  if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) return toast("Informe um e-mail válido.", "error");
  const value = metrics(reportRecords()); const subject = `Relatório EPYA • Recebimentos ${formatDate(state.reportFilters.from)} a ${formatDate(state.reportFilters.to)}`; const body = `Olá,\n\nSegue o relatório de recebimentos do Projeto Sucuriú.\n\nDormentes: ${formatNumber(value.sleepers)}\nTrilhos: ${formatNumber(value.rails)}\nNotas fiscais: ${formatNumber(value.totalNfs)}\n\nAnexe o PDF gerado pelo painel antes de enviar.`; window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function whatsappReport() {
  const records = reportRecords();
  const value = metrics(records);
  const quality = qualityTotals("dormente", records);
  const message = `Relatório EPYA — Projeto Sucuriú\nPeríodo: ${formatDate(state.reportFilters.from)} a ${formatDate(state.reportFilters.to)}\nDormentes: ${formatNumber(value.sleepers)}\nNotas fiscais: ${formatNumber(value.sleeperNfs)}\nPequenas quebras: ${formatNumber(quality["pequenas-quebras"])}\nReparados: ${formatNumber(quality.reparados)}\nBolhas: ${formatNumber(quality.bolhas)}\nQuebras: ${formatNumber(quality.quebras)}\n\nAnexe o PDF gerado pelo painel antes de enviar.`;
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  toast("WhatsApp aberto. Agora anexe o PDF salvo.", "success");
}

function toggleTheme() { state.theme = state.theme === "dark" ? "light" : "dark"; localStorage.setItem(THEME_KEY, state.theme); render(); }
async function toggleTv() { state.tvMode = !state.tvMode; state.view = "dashboard"; if (state.tvMode) { try { await document.documentElement.requestFullscreen?.(); } catch {} } else if (document.fullscreenElement) await document.exitFullscreen?.(); render(); }
async function installApp() { if (state.installPrompt) { state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; return; } toast(/iphone|ipad|ipod/i.test(navigator.userAgent) ? "No Safari, toque em Compartilhar e Adicionar à Tela de Início." : "No menu do navegador, escolha Instalar app.", "success"); }
function toast(message, type = "success") { const node = document.querySelector(".toast"); if (!node) return; node.textContent = message; node.className = `toast show ${type}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => { node.className = "toast"; }, 4200); }

function sanitizeLegacyMoldEntry(record) {
  if (!record || record._cleanupMolde57Cav1) return record;
  const cleaned = structuredClone(record);
  cleaned.observations = String(cleaned.observations || "").replace(/\bmolde\s*:?\s*57\s*[,;\/-]?\s*cav(?:idade)?\.?\s*:?\s*1\b/gi, "").replace(/\s{2,}/g, " ").trim();
  if (String(cleaned.mold || "").trim() === "57" && String(cleaned.cavity || "").trim() === "1") { delete cleaned.mold; delete cleaned.cavity; }
  if (Array.isArray(cleaned.rejections)) cleaned.rejections = cleaned.rejections.filter((item) => !(String(item.mold || "").trim() === "57" && String(item.cavity || "").trim() === "1" && !String(item.reason || item.reasonId || "").trim()));
  cleaned._cleanupMolde57Cav1 = true;
  return cleaned;
}

function supabaseRecordRow(record) { return { id: record.id, status: record.status, received_at: record.receivedAt, invoice_numbers: record.invoiceNumbers || "", supplier: record.supplier || "", quantity: number(record.quantity), approved: number(record.approved), rejected: number(record.rejected), truckloads: 1, payload: record, created_at: record.createdAt || new Date().toISOString(), updated_at: record.updatedAt || new Date().toISOString() }; }
function clearProtectedLocalData() { [STORAGE_KEY, OUTBOX_KEY, AUTH_CACHE_KEY, CATEGORY_KEY, REJECTION_REASON_KEY].forEach((key) => localStorage.removeItem(key)); }
function readLocalRecords() { try { const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); return Array.isArray(stored) ? stored.map(sanitizeLegacyMoldEntry).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt))) : []; } catch { return []; } }
function writeLocalRecords() { if (state.authorized) localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records)); }
function readOutbox() { try { const records = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); return Array.isArray(records) ? records : []; } catch { return []; } }
function queueForSync(record) { const outbox = readOutbox(); const index = outbox.findIndex((item) => item.id === record.id); if (index >= 0) outbox[index] = record; else outbox.push(record); localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox)); state.pendingSync = outbox.length; }

async function syncOutbox() {
  if (!supabaseClient || !state.online || !state.authorized) return;
  const pending = readOutbox(); const remaining = [];
  for (const record of pending) { try { const { error } = await supabaseClient.from("crm_records").upsert(supabaseRecordRow(record), { onConflict: "id" }); if (error) throw error; replaceRecord(record); } catch { remaining.push(record); } }
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining)); state.pendingSync = remaining.length; if (!remaining.length) state.storageMode = "cloud"; writeLocalRecords();
}

async function loadSession() {
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
async function signInWithEmail(event) { event?.preventDefault(); const { email, password } = authFields(); if (!email || password.length < 8) return; state.authLoading = true; state.authMessage = ""; render(); const { error } = await supabaseClient.auth.signInWithPassword({ email, password }); if (error) { state.authLoading = false; state.authMessage = "E-mail ou senha inválidos, ou confirmação ainda pendente."; render(); return; } await loadSession(); if (state.authorized) await loadRecordsAndCategories(); state.loading = false; render(); }
async function createFirstAccess() { const { email, password } = authFields(); if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return toast("Informe um e-mail válido e uma senha de pelo menos 8 caracteres.", "error"); state.authLoading = true; state.authMessage = ""; render(); const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } }); state.authLoading = false; if (error) { state.authMessage = error.message || "Não foi possível criar o primeiro acesso."; render(); return; } if (data.session) { await loadSession(); if (state.authorized) await loadRecordsAndCategories(); state.loading = false; render(); return; } state.authMessage = "Confira seu e-mail e use o link de confirmação para concluir o primeiro acesso."; render(); }
async function signOut() { await supabaseClient?.auth.signOut(); clearProtectedLocalData(); state.authenticated = false; state.authorized = false; state.user = null; state.records = []; state.team = []; state.teamLoaded = false; state.authMessage = "Sessão encerrada com segurança."; render(); }

async function loadRecordsAndCategories() {
  try { const [recordsResult, categoriesResult, reasonsResult] = await Promise.all([supabaseClient.from("crm_records").select("payload").order("received_at", { ascending: false }), supabaseClient.from("quality_categories").select("id,label,color").eq("active", true).order("label"), supabaseClient.from("rejection_reasons").select("id,label").eq("active", true).order("label")]); if (recordsResult.error) throw recordsResult.error; state.records = (recordsResult.data || []).map((row) => row.payload).filter(Boolean).map(sanitizeLegacyMoldEntry); if (!categoriesResult.error && categoriesResult.data?.length) state.categories = categoriesResult.data; if (!reasonsResult.error) state.rejectionReasons = reasonsResult.data || []; readOutbox().forEach(replaceRecord); state.storageMode = "cloud"; writeLocalRecords(); saveCategoriesLocal(); saveRejectionReasonsLocal(); } catch { state.records = readLocalRecords(); state.storageMode = "local"; }
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
  if ("serviceWorker" in navigator) navigator.serviceWorker.register(GITHUB_PAGES_MODE ? "./service-worker.js" : "/service-worker.js").catch(() => {});
  await loadSession(); if (state.authorized) { await loadRecordsAndCategories(); await syncOutbox(); } state.loading = false; render();
}

window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); state.installPrompt = event; render(); });
window.addEventListener("online", async () => { state.online = true; await loadSession(); if (state.authorized) await syncOutbox(); render(); });
window.addEventListener("offline", () => { state.online = false; state.storageMode = "local"; render(); });
window.addEventListener("keydown", (event) => { if (event.key === "Escape" && state.modal) { state.modal = null; render(); } });

bootstrap();
