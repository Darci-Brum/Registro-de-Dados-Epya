const TARGET_SLEEPERS = 94077;
const BASELINE_RECEIVED = 2226;
const DRAFT_KEY = "epya-crm-dormentes-draft-v3";
const OFFLINE_KEY = "epya-crm-dormentes-offline-v3";
const THEME_KEY = "epya-crm-theme";
const EMAIL_KEY = "epya-crm-email";
const AUTH_CACHE_KEY = "epya-crm-auth-v1";
const OUTBOX_KEY = "epya-crm-outbox-v1";
const GITHUB_PAGES_MODE = window.location.hostname.endsWith("github.io");
const requestedView = new URLSearchParams(window.location.search).get("view");

const INSPECTIONS = [
  "A quantidade de dormentes entregue em obra está de acordo com a informação da entrega (Arauco) ou Nota Fiscal.",
  "Os dormentes recebidos são do tipo e dimensões especificados e possuem todas as marcações legíveis, conforme o desenho fornecido pela Arauco apresentado nos critérios de verificação.",
  "Os dormentes visualmente não apresentam fissuras ou trincas estruturais, quebras, lascamentos, degradação, ninhos de concretagem, reparos ou outros defeitos críticos e capazes de comprometer resistência, durabilidade ou fixação dos trilhos.",
  "Os dormentes têm camada de cobrimento adequada, isto é, sem a exposição da armadura ou dos fios de protensão, exceto face do topo.",
  "As ombreiras (inserts) estão íntegras, firmemente incorporadas ao concreto e posicionadas conforme desenho nos critérios de verificação.",
  "As mesas de apoio dos trilhos estão com acabamento adequado.",
];

const app = document.querySelector("#app");

const state = {
  view: ["dashboard", "form", "history", "email", "team"].includes(requestedView) ? requestedView : "dashboard",
  records: [],
  loading: true,
  authLoading: !GITHUB_PAGES_MODE,
  authenticated: GITHUB_PAGES_MODE,
  authorized: GITHUB_PAGES_MODE,
  user: GITHUB_PAGES_MODE ? { email: "acesso-publico@epya.local", fullName: "Acesso público", role: "inspector" } : null,
  team: [],
  teamLoaded: false,
  online: navigator.onLine,
  pendingSync: 0,
  installPrompt: null,
  storageMode: "cloud",
  theme: localStorage.getItem(THEME_KEY) || "light",
  tvMode: false,
  draft: null,
  filters: { invoice: "", from: "", to: "" },
};

function nowLocalInput() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function todayInput() {
  return nowLocalInput().slice(0, 10);
}

function defaultDraft() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  } catch {
    stored = null;
  }
  return {
    id: "",
    status: "concluido",
    work: "Obra Ferrovia Arauco",
    client: "Arauco",
    material: "Dormente Monobloco de Concreto Protendido",
    invoiceNumbers: "",
    quantity: "",
    unit: "peças",
    supplier: "Cavan / Arauco",
    vehiclePlate: "",
    receivedAt: nowLocalInput(),
    truckloads: 1,
    rejected: 0,
    checklist: INSPECTIONS.map(() => ({ result: "C", date: todayInput() })),
    samples: ["", "", "", "", ""],
    observations: "",
    nonconformity: "",
    notifiedTo: "",
    notifiedDate: "",
    notificationMethod: "",
    inspectorName: stored?.inspectorName || "",
    inspectorDate: todayInput(),
    approverName: "",
    approverDate: "",
    inspectorSignature: "",
    approverSignature: "",
    attachmentNames: [],
    createdAt: "",
    ...stored,
    id: "",
    invoiceNumbers: "",
    quantity: "",
    vehiclePlate: "",
    receivedAt: nowLocalInput(),
    rejected: 0,
    observations: "",
    nonconformity: "",
    notifiedTo: "",
    notifiedDate: "",
    notificationMethod: "",
    approverName: "",
    approverDate: "",
    inspectorSignature: "",
    approverSignature: "",
    attachmentNames: [],
    checklist: INSPECTIONS.map(() => ({ result: "C", date: todayInput() })),
    samples: ["", "", "", "", ""],
  };
}

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

function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(date);
}

function invoiceList(value) {
  return String(value || "")
    .split(/[;,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function calcApproved(record) {
  return Math.max(0, number(record.quantity) - number(record.rejected));
}

function metrics() {
  const receivedNew = state.records.reduce((sum, record) => sum + number(record.quantity), 0);
  const approvedNew = state.records.reduce((sum, record) => sum + calcApproved(record), 0);
  const rejected = state.records.reduce((sum, record) => sum + number(record.rejected), 0);
  const truckloads = state.records.reduce((sum, record) => sum + Math.max(1, number(record.truckloads)), 0);
  const invoices = new Set(state.records.flatMap((record) => invoiceList(record.invoiceNumbers)));
  const approvedTotal = BASELINE_RECEIVED + approvedNew;
  return {
    received: BASELINE_RECEIVED + receivedNew,
    approved: approvedTotal,
    rejected,
    remaining: Math.max(0, TARGET_SLEEPERS - approvedTotal),
    progress: Math.min(100, (approvedTotal / TARGET_SLEEPERS) * 100),
    truckloads,
    invoices: invoices.size,
    crms: state.records.length,
  };
}

function statusLabel(status) {
  return { concluido: "Concluído", pendente: "Pendente", rascunho: "Rascunho" }[status] || status;
}

function statusClass(status) {
  return status === "concluido" ? "success" : status === "pendente" ? "warning" : "muted";
}

function navButton(view, label, icon) {
  return `<button class="nav-button ${state.view === view ? "active" : ""}" data-nav="${view}">
    <span aria-hidden="true">${icon}</span><span>${label}</span>
  </button>`;
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
        <button class="brand" data-nav="dashboard" aria-label="Ir para o painel">
          <img src="./epya-logo-oficial.png" alt="EPYA" />
          <span><strong>CRM Dormentes</strong><small>Qualidade • FORM-F-003</small></span>
        </button>
        <nav class="main-nav" aria-label="Navegação principal">
          ${navButton("dashboard", "Painel", "▦")}
          ${navButton("form", "Novo CRM", "+")}
          ${navButton("history", "Histórico", "⌕")}
          ${navButton("email", "Envio", "✉")}
          ${state.user.role === "admin" ? navButton("team", "Equipe", "◎") : ""}
        </nav>
        <div class="top-actions">
          <button class="connection-pill ${state.online ? "online" : "offline"}" data-install title="Instalar no celular"><i></i>${state.online ? "Online" : "Offline"}${state.pendingSync ? ` • ${state.pendingSync} pendente(s)` : ""}</button>
          <button class="icon-button" data-theme-toggle title="Alternar modo claro e escuro" aria-label="Alternar tema">${state.theme === "dark" ? "☀" : "◐"}</button>
          <button class="button button-dark compact" data-tv-toggle>Modo TV</button>
          ${GITHUB_PAGES_MODE ? '<span class="user-pill"><strong>Acesso público</strong><small>Dados neste aparelho</small></span>' : `<a class="user-pill" href="/signout-with-chatgpt?return_to=/" title="Sair"><strong>${escapeHtml(state.user.fullName || state.user.email.split("@")[0])}</strong><small>Sair</small></a>`}
        </div>
      </header>
      <main class="app-main">${renderCurrentView()}</main>
      ${state.tvMode ? '<button class="exit-tv no-print" data-tv-toggle>Sair do modo TV</button>' : ""}
      <div class="toast" role="status" aria-live="polite"></div>
    </div>`;
  bindEvents();
}

function renderAccessScreen() {
  const cachedOffline = !state.online && state.authLoading;
  const unauthorized = state.authenticated && !state.authorized;
  return `<main class="login-screen">
    <section class="login-card">
      <img class="login-logo" src="./epya-logo-oficial.png" alt="EPYA" />
      <span class="eyebrow">Projeto Sucuriú • Inocência/MS</span>
      <h1>${state.authLoading ? "Preparando seu acesso" : unauthorized ? "E-mail ainda não liberado" : "CRM de dormentes"}</h1>
      <p>${state.authLoading ? (cachedOffline ? "Buscando o acesso salvo neste aparelho…" : "Validando seu e-mail cadastrado…") : unauthorized ? `O e-mail <strong>${escapeHtml(state.user?.email || "")}</strong> está autenticado, mas precisa ser adicionado por Darci na tela Equipe.` : state.online ? "Entre com o e-mail cadastrado para preencher, imprimir e acompanhar os recebimentos." : "O primeiro acesso precisa de sinal. Depois disso, este aparelho poderá trabalhar offline e sincronizar mais tarde."}</p>
      ${state.authLoading ? '<span class="login-loading"><i></i> Aguarde um instante</span>' : unauthorized ? '<a class="button button-outline full" href="/signout-with-chatgpt?return_to=/">Entrar com outro e-mail</a>' : state.online ? '<a class="button button-yellow full" href="/signin-with-chatgpt?return_to=/">Entrar com e-mail cadastrado</a>' : '<button class="button button-dark full" disabled>Sem conexão para o primeiro acesso</button>'}
      <button class="install-link" data-install>＋ Adicionar CRM à tela inicial</button>
      <div class="login-benefits"><span><b>✓</b> Funciona offline</span><span><b>✓</b> Sincroniza ao voltar o sinal</span><span><b>✓</b> PDF frente e verso</span></div>
    </section>
    <div class="login-brand-badge"><img src="./epya-logo-oficial.png" alt="EPYA" /><span>Qualidade em campo</span></div>
  </main>`;
}

function bindAccessEvents() {
  document.querySelectorAll("[data-install]").forEach((button) => button.addEventListener("click", installApp));
}

function renderCurrentView() {
  if (state.loading) {
    return `<section class="loading-panel"><span class="spinner"></span><h1>Carregando o controle de dormentes</h1><p>Sincronizando CRMs, notas fiscais e quantidades.</p></section>`;
  }
  if (state.view === "form") return renderForm();
  if (state.view === "history") return renderHistory();
  if (state.view === "email") return renderEmail();
  if (state.view === "team") return renderTeam();
  return renderDashboard();
}

function renderStorageBadge() {
  if (GITHUB_PAGES_MODE) return '<span class="sync-badge warning"><i></i> Salvo somente neste aparelho</span>';
  if (state.pendingSync) return `<span class="sync-badge warning"><i></i> ${state.pendingSync} CRM(s) aguardando sinal</span>`;
  return state.storageMode === "cloud"
    ? '<span class="sync-badge success"><i></i> Dados sincronizados</span>'
    : '<span class="sync-badge warning"><i></i> Modo offline neste aparelho</span>';
}

function dailySeries() {
  const grouped = new Map();
  state.records.forEach((record) => {
    const key = String(record.receivedAt || record.createdAt || "").slice(0, 10) || todayInput();
    const current = grouped.get(key) || { date: key, approved: 0, rejected: 0, crms: 0 };
    current.approved += calcApproved(record);
    current.rejected += number(record.rejected);
    current.crms += 1;
    grouped.set(key, current);
  });
  const sorted = [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
  return sorted.length ? sorted : [{ date: todayInput(), approved: 0, rejected: 0, crms: 0 }];
}

function renderDailyChart() {
  const series = dailySeries();
  const max = Math.max(1, ...series.map((item) => item.approved + item.rejected));
  return `<div class="bar-chart" aria-label="Dormentes recebidos por dia">
    ${series
      .map((item) => {
        const approvedHeight = Math.max(item.approved ? 8 : 0, (item.approved / max) * 100);
        const rejectedHeight = Math.max(item.rejected ? 5 : 0, (item.rejected / max) * 100);
        const tooltip = `${formatDate(item.date)} • ${formatNumber(item.approved)} aprovados • ${formatNumber(item.rejected)} reprovados • ${item.crms} CRM(s)`;
        return `<div class="bar-column tooltip" data-tooltip="${escapeHtml(tooltip)}">
          <div class="bar-stack"><span class="bar rejected" style="height:${rejectedHeight}%"></span><span class="bar approved" style="height:${approvedHeight}%"></span></div>
          <small>${escapeHtml(item.date.slice(5).split("-").reverse().join("/"))}</small>
        </div>`;
      })
      .join("")}
  </div>`;
}

function renderDashboard() {
  const value = metrics();
  const recent = state.records.slice(0, 5);
  const completed = state.records.filter((record) => record.status === "concluido").length;
  const pending = state.records.filter((record) => record.status === "pendente").length;
  const drafts = state.records.filter((record) => record.status === "rascunho").length;
  const totalStatus = Math.max(1, state.records.length);
  const completedAngle = (completed / totalStatus) * 360;
  const pendingAngle = completedAngle + (pending / totalStatus) * 360;

  return `<section class="view dashboard-view">
    <div class="dashboard-hero">
      <div>
        <span class="eyebrow">Controle de recebimento • Dormente de concreto</span>
        <h1>Visão geral da obra</h1>
        <p>Acompanhe o avanço físico, as aprovações e cada nota fiscal em um único lugar.</p>
      </div>
      <div class="hero-actions no-print">
        ${renderStorageBadge()}
        <button class="button button-yellow" data-new-record>+ Preencher novo CRM</button>
      </div>
    </div>

    <div class="metrics-grid">
      <article class="metric-card received tooltip" data-tooltip="Meta do contrato: ${formatNumber(TARGET_SLEEPERS)} dormentes. Base anterior: ${formatNumber(BASELINE_RECEIVED)}.">
        <span>Recebidos</span><strong>${formatNumber(value.received)}</strong><small>de ${formatNumber(TARGET_SLEEPERS)}</small>
      </article>
      <article class="metric-card approved tooltip" data-tooltip="Quantidade recebida menos os dormentes reprovados.">
        <span>Aprovados</span><strong>${formatNumber(value.approved)}</strong><small>${value.progress.toFixed(1).replace(".", ",")}% da meta</small>
      </article>
      <article class="metric-card danger tooltip" data-tooltip="Soma automática do campo Reprovados em todos os CRMs.">
        <span>Reprovados</span><strong>${formatNumber(value.rejected)}</strong><small>acumulado digital</small>
      </article>
      <article class="metric-card tooltip" data-tooltip="Quantidade que falta para alcançar a meta, considerando os aprovados.">
        <span>Saldo da meta</span><strong>${formatNumber(value.remaining)}</strong><small>dormentes restantes</small>
      </article>
      <article class="metric-card tooltip" data-tooltip="Carretas informadas nos registros salvos.">
        <span>Carretas</span><strong>${formatNumber(value.truckloads)}</strong><small>${value.crms} CRM(s)</small>
      </article>
      <article class="metric-card tooltip" data-tooltip="Contagem de números de notas fiscais únicos.">
        <span>Notas fiscais</span><strong>${formatNumber(value.invoices)}</strong><small>NF(s) registradas</small>
      </article>
    </div>

    <div class="dashboard-grid">
      <article class="panel progress-panel">
        <div class="panel-heading"><div><span class="eyebrow">Avanço do contrato</span><h2>${formatNumber(value.approved)} aprovados</h2></div><strong>${value.progress.toFixed(1).replace(".", ",")}%</strong></div>
        <div class="progress-track"><span style="width:${value.progress}%"></span></div>
        <div class="progress-caption"><span>Base inicial: ${formatNumber(BASELINE_RECEIVED)}</span><span>Meta: ${formatNumber(TARGET_SLEEPERS)}</span></div>
      </article>
      <article class="panel flow-panel">
        <div class="panel-heading"><div><span class="eyebrow">Fluxo dos CRMs</span><h2>Situação atual</h2></div></div>
        <div class="flow-content">
          <div class="donut tooltip" data-tooltip="${completed} concluído(s), ${pending} pendente(s), ${drafts} rascunho(s)" style="--donut:conic-gradient(#f4ca16 0deg ${completedAngle}deg,#ef8d32 ${completedAngle}deg ${pendingAngle}deg,#737a84 ${pendingAngle}deg 360deg)"><strong>${value.crms}</strong><small>CRMs</small></div>
          <ul><li><i class="dot yellow"></i>Concluídos <strong>${completed}</strong></li><li><i class="dot orange"></i>Pendentes <strong>${pending}</strong></li><li><i class="dot gray"></i>Rascunhos <strong>${drafts}</strong></li></ul>
        </div>
      </article>
    </div>

    <article class="panel chart-panel">
      <div class="panel-heading"><div><span class="eyebrow">Entrada diária</span><h2>Dormentes adicionados por data</h2></div><div class="chart-legend"><span><i class="dot yellow"></i>Aprovados</span><span><i class="dot red"></i>Reprovados</span></div></div>
      ${renderDailyChart()}
    </article>

    <article class="panel recent-panel">
      <div class="panel-heading"><div><span class="eyebrow">Últimos lançamentos</span><h2>CRMs recentes</h2></div><button class="text-button no-print" data-nav="history">Ver histórico completo →</button></div>
      ${renderRecordsTable(recent, true)}
    </article>
  </section>`;
}

function renderRecordsTable(records, compact = false) {
  if (!records.length) {
    return `<div class="empty-state"><span>▤</span><h3>Nenhum CRM salvo ainda</h3><p>Preencha o primeiro recebimento para alimentar o painel.</p><button class="button button-yellow no-print" data-new-record>Criar primeiro CRM</button></div>`;
  }
  return `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>Data</th><th>Nota fiscal</th><th>Fornecedor</th><th>Recebidos</th><th>Aprovados</th><th>Reprovados</th><th>Status</th><th class="no-print">Ações</th></tr></thead>
    <tbody>${records
      .map(
        (record) => `<tr>
          <td>${formatDate(record.receivedAt)}</td>
          <td><strong>${escapeHtml(record.invoiceNumbers || "Sem NF")}</strong></td>
          <td>${escapeHtml(record.supplier || "—")}</td>
          <td>${formatNumber(record.quantity)}</td>
          <td>${formatNumber(calcApproved(record))}</td>
          <td class="danger-text">${formatNumber(record.rejected)}</td>
          <td><span class="status-pill ${statusClass(record.status)}">${escapeHtml(statusLabel(record.status))}</span></td>
          <td class="table-actions no-print"><button data-edit-record="${record.id}" title="Editar">Editar</button><button data-print-record="${record.id}" title="Imprimir/PDF">PDF</button><button class="whatsapp-link" data-whatsapp-record="${record.id}" title="Enviar pelo WhatsApp">WhatsApp</button>${compact ? "" : `<button class="danger-link" data-delete-record="${record.id}" title="Excluir">Excluir</button>`}</td>
        </tr>`,
      )
      .join("")}</tbody>
  </table></div>`;
}

function renderHistory() {
  const invoiceTerm = state.filters.invoice.toLowerCase().trim();
  const records = state.records.filter((record) => {
    const recordDate = String(record.receivedAt || "").slice(0, 10);
    return (
      (!invoiceTerm || String(record.invoiceNumbers || "").toLowerCase().includes(invoiceTerm)) &&
      (!state.filters.from || recordDate >= state.filters.from) &&
      (!state.filters.to || recordDate <= state.filters.to)
    );
  });
  return `<section class="view">
    <div class="page-heading"><div><span class="eyebrow">Arquivo digital</span><h1>Histórico de CRMs</h1><p>Localize notas fiscais antigas por número ou período.</p></div><div class="heading-actions no-print"><button class="button button-outline" data-export>Exportar Excel</button><button class="button button-yellow" data-new-record>+ Novo CRM</button></div></div>
    <article class="panel filter-panel no-print">
      <label class="filter-search"><span>Buscar NF</span><input type="search" name="filterInvoice" value="${escapeHtml(state.filters.invoice)}" placeholder="Ex.: 212 ou 005489" /></label>
      <label><span>Data inicial</span><input type="date" name="filterFrom" value="${escapeHtml(state.filters.from)}" /></label>
      <label><span>Data final</span><input type="date" name="filterTo" value="${escapeHtml(state.filters.to)}" /></label>
      <button class="button button-dark" data-apply-filter>Filtrar</button>
      <button class="text-button" data-clear-filter>Limpar</button>
    </article>
    <article class="panel history-panel"><div class="panel-heading"><div><span class="eyebrow">Resultado</span><h2>${records.length} CRM(s) encontrado(s)</h2></div>${renderStorageBadge()}</div>${renderRecordsTable(records)}</article>
  </section>`;
}

function documentHeader(page) {
  return `<div class="document-header">
    <div class="document-logo"><img src="./epya-logo-pdf.svg" alt="EPYA" /></div>
    <div class="document-title"><strong>Sistema de Gestão da Qualidade</strong><b>CRM - Controle de Recebimento de Material</b><span>Dormente Monobloco de Concreto Protendido</span></div>
    <div class="document-meta"><div><b>Código</b><span>FORM-F-003</span></div><div><b>Revisão</b><mark>01</mark></div><div><b>Área</b><span>Qualidade</span></div><div><b>Aprovação</b><span>Líder de Contrato</span></div><div><b>Data</b><mark>13/08/2026</mark></div><div><b>Página</b><span>${page} / 2</span></div></div>
  </div>`;
}

function inputCell(label, name, value, type = "text", extra = "") {
  return `<label class="document-field"><span>${label}</span><input type="${type}" name="${name}" value="${escapeHtml(value)}" ${extra} /></label>`;
}

function renderForm() {
  if (!state.draft) state.draft = defaultDraft();
  const draft = state.draft;
  const approved = calcApproved(draft);
  return `<section class="view form-view">
    <div class="page-heading no-print"><div><span class="eyebrow">FORM-F-003 • Revisão 01</span><h1>${draft.id ? "Editar CRM" : "Novo CRM de dormentes"}</h1><p>Preencha na tela e gere as duas páginas prontas para impressão frente e verso.</p></div><div class="heading-actions"><button class="button button-outline" data-save-draft>Salvar rascunho</button><button class="button button-dark" data-print-current>Imprimir frente e verso</button><button class="button button-yellow" data-save-record>Salvar CRM</button></div></div>

    <form id="crm-form" autocomplete="off">
      <div class="automation-strip no-print">
        <div><span>Recebidos</span><label><input type="number" min="0" name="quantityQuick" value="${escapeHtml(draft.quantity)}" placeholder="0" data-quick="quantity" /> peças</label></div>
        <div><span>Reprovados</span><label><input type="number" min="0" name="rejectedQuick" value="${escapeHtml(draft.rejected)}" data-quick="rejected" /> peças</label></div>
        <div class="auto-result"><span>Aprovados automaticamente</span><strong data-approved>${formatNumber(approved)}</strong></div>
        <div><span>Carretas</span><label><input type="number" min="1" name="truckloadsQuick" value="${escapeHtml(draft.truckloads)}" data-quick="truckloads" /></label></div>
        <div class="print-tip"><strong>Impressão duplex</strong><small>A4 • frente e verso • virar na borda longa</small></div>
      </div>

      <div class="print-stage">
        <article class="crm-sheet print-page page-one">
          ${documentHeader(1)}
          <div class="document-grid two">${inputCell("Obra:", "work", draft.work)}${inputCell("Cliente:", "client", draft.client)}</div>
          <div class="material-row"><strong>Material (Tipo):</strong><span class="checked-box">✓</span><span>Dormente Monobloco de Concreto Protendido</span></div>
          <div class="document-grid three">
            ${inputCell("Nota(s) Fiscal(is):", "invoiceNumbers", draft.invoiceNumbers, "text", 'placeholder="Separe várias NFs por vírgula"')}
            ${inputCell("Quantidade:", "quantity", draft.quantity, "number", 'min="0" required')}
            ${inputCell("Unidade (peça, m³, tonelada etc.):", "unit", draft.unit)}
          </div>
          <div class="document-grid supplier-grid">
            ${inputCell("Fornecedor:", "supplier", draft.supplier, "text", 'list="supplier-options"')}
            ${inputCell("Placa do Veículo:", "vehiclePlate", draft.vehiclePlate)}
            ${inputCell("Data e Hora do Recebimento:", "receivedAt", draft.receivedAt, "datetime-local", "required")}
          </div>
          <datalist id="supplier-options"><option value="Cavan / Arauco"></option><option value="Cavan"></option>${[...new Set(state.records.map((record) => record.supplier).filter(Boolean))].map((supplier) => `<option value="${escapeHtml(supplier)}"></option>`).join("")}</datalist>

          <table class="inspection-table">
            <thead><tr><th>Item</th><th>Inspeção Visual</th><th>Inspeção</th><th>Data</th></tr></thead>
            <tbody>${INSPECTIONS.map((text, index) => `<tr><td>${String(index + 1).padStart(2, "0")}</td><td>${text}</td><td><select name="inspection_${index}"><option ${draft.checklist?.[index]?.result === "C" ? "selected" : ""}>C</option><option ${draft.checklist?.[index]?.result === "NC" ? "selected" : ""}>NC</option><option ${draft.checklist?.[index]?.result === "NA" ? "selected" : ""}>NA</option></select></td><td><input type="date" name="inspectionDate_${index}" value="${escapeHtml(draft.checklist?.[index]?.date || todayInput())}" /></td></tr>`).join("")}</tbody>
          </table>
          <div class="legend-row"><strong>Legenda:</strong><b>C – Conforme</b><b>NC – Não Conforme</b><b>NA – Não Aplicável</b></div>
          <section class="document-section criteria-section"><h3>Critérios de Verificação</h3><img src="/dormente-desenho-tecnico.png" alt="Desenho dimensional do dormente monobloco de concreto" /></section>
        </article>

        <article class="crm-sheet print-page page-two">
          ${documentHeader(2)}
          <section class="document-notes">
            <ul>
              <li>Observar todas as marcações: molde e cavidade (022-05), fabricante (Cavan), cliente (Arauco), perfil do trilho (TR68) e carga por eixo (32,5T), conforme desenho.</li>
              <li>As Notas Fiscais e os Certificados de Qualidade (quando recebidos em obra) são entregues diretamente à fiscalização/cliente. Por esse motivo, os Certificados de Qualidade não são verificados pela Epya.</li>
              <li>A verificação visual é realizada em todas as peças.</li>
              <li>A verificação dimensional é realizada por entrega conforme Plano de Amostragem descrito na tabela a seguir:</li>
            </ul>
            <table class="sampling-table"><caption>Plano de Amostragem – Verificação Dimensional</caption><thead><tr><th colspan="3">Tamanho do Lote de Dormentes</th><th colspan="3">Normal</th></tr><tr><th colspan="3"></th><th>TA</th><th>AC</th><th>RE</th></tr></thead><tbody><tr><td>1</td><td>a</td><td>90</td><td>5</td><td>1</td><td>2</td></tr><tr><td colspan="6" class="sampling-legend"><b>Legenda:</b><br><b>TA:</b> tamanho da amostra<br><b>AC:</b> número máximo de peças defeituosas (ou falhas) admitido para aceitação do lote<br><b>RE:</b> número de peças defeituosas (ou falhas) que implica a rejeição do lote</td></tr><tr><th colspan="6"><mark>Dormentes Selecionados Para Amostragem</mark></th></tr><tr class="sample-inputs">${draft.samples.map((sample, index) => `<td><input name="sample_${index}" value="${escapeHtml(sample)}" aria-label="Dormente selecionado ${index + 1}" /></td>`).join("")}<td class="sample-spacer"></td></tr></tbody></table>
          </section>

          <section class="document-section observations-section"><h3>Observações</h3><textarea name="observations" rows="4">${escapeHtml(draft.observations)}</textarea><div class="auto-print-summary">Resumo automático: <b data-quantity-summary>${formatNumber(draft.quantity)}</b> recebidos • <b data-approved>${formatNumber(approved)}</b> aprovados • <b data-rejected-summary>${formatNumber(draft.rejected)}</b> reprovados • <b data-truck-summary>${formatNumber(draft.truckloads)}</b> carreta(s) • <b data-nf-count>${invoiceList(draft.invoiceNumbers).length}</b> NF(s)</div></section>

          <section class="document-section storage-section"><h3>Critérios de Armazenamento</h3><ul><li><mark>Armazenar os dormentes sobre apoios adequados e</mark> em local apropriado e definido para o armazenamento.</li><li>Deve-se atentar para o correto descarregamento da pilha a fim de preservar a integridade mecânica das peças.</li><li><mark>Pilhas estáveis, com todas as camadas alinhadas, sem risco de quedas e/ou tombamento e altura de no máximo 8 camadas.</mark></li><li><mark>Em caso de circulação de pessoas, utilizar distanciamento de, no mínimo 60 cm, entre uma pilha e a outra.</mark></li></ul></section>

          <section class="document-section nc-section"><h3>Notificação de Não Conformidade ao Cliente</h3><label><span>Descrição da não conformidade:</span><textarea name="nonconformity" rows="3">${escapeHtml(draft.nonconformity)}</textarea></label><label><span>Notificado para (representante do cliente):</span><input name="notifiedTo" value="${escapeHtml(draft.notifiedTo)}" /></label><label><span>Notificado em (data):</span><input type="date" name="notifiedDate" value="${escapeHtml(draft.notifiedDate)}" /></label><label><span>Forma de notificação (informação ao fiscal, envio de e-mail etc.):</span><input name="notificationMethod" value="${escapeHtml(draft.notificationMethod)}" /></label></section>

          <section class="signature-grid">
            <div><h3>Responsável pela Inspeção</h3><label><span>Nome completo ou carimbo:</span><input name="inspectorName" value="${escapeHtml(draft.inspectorName)}" /></label><label><span>Data:</span><input type="date" name="inspectorDate" value="${escapeHtml(draft.inspectorDate)}" /></label><label class="signature-label"><span>Assinatura:</span><canvas width="520" height="105" data-signature="inspectorSignature"></canvas><button type="button" class="clear-signature no-print" data-clear-signature="inspectorSignature">Limpar assinatura</button></label></div>
            <div><h3>Responsável pela Aprovação - Arauco</h3><label><span>Nome completo ou carimbo:</span><input name="approverName" value="${escapeHtml(draft.approverName)}" /></label><label><span>Data:</span><input type="date" name="approverDate" value="${escapeHtml(draft.approverDate)}" /></label><label class="signature-label"><span>Assinatura:</span><canvas width="520" height="105" data-signature="approverSignature"></canvas><button type="button" class="clear-signature no-print" data-clear-signature="approverSignature">Limpar assinatura</button></label></div>
          </section>
        </article>
      </div>

      <article class="panel attachments-panel no-print"><div><span class="eyebrow">Documentos de apoio</span><h2>Anexos do recebimento</h2><p>Selecione fotos, NF ou certificados para registrar os nomes junto ao CRM.</p></div><label class="file-drop"><input type="file" name="attachments" multiple accept="image/*,.pdf" /><span>＋</span><strong>Escolher arquivos</strong><small data-file-names>${draft.attachmentNames?.length ? escapeHtml(draft.attachmentNames.join(", ")) : "Nenhum arquivo selecionado"}</small></label></article>
    </form>
  </section>`;
}

function renderEmail() {
  const recipient = localStorage.getItem(EMAIL_KEY) || "";
  const selected = state.records[0];
  return `<section class="view email-view">
    <div class="email-background">
      <div class="email-copy"><img class="email-logo" src="./epya-logo-oficial.png" alt="EPYA" /><span class="eyebrow light">Envio e documentação</span><h1>Prepare o CRM para envio</h1><p>Gere o arquivo com duas páginas e envie pelo e-mail ou WhatsApp. No celular, salve primeiro o PDF e depois anexe na conversa.</p><div class="duplex-card"><span>2</span><div><strong>Páginas A4</strong><small>Prontas para frente e verso</small></div></div></div>
      <div class="email-panel">
        <span class="eyebrow">Destinatário</span><h2>Enviar CRM por e-mail</h2>
        <label><span>E-mail</span><input type="email" name="emailRecipient" value="${escapeHtml(recipient)}" placeholder="qualidade@empresa.com" /></label>
        <label><span>CRM / Nota fiscal</span><select name="emailRecord"><option value="">Selecione um CRM</option>${state.records.map((record) => `<option value="${record.id}" ${selected?.id === record.id ? "selected" : ""}>NF ${escapeHtml(record.invoiceNumbers || "sem número")} • ${formatDate(record.receivedAt)}</option>`).join("")}</select></label>
        <label><span>Assunto</span><input name="emailSubject" value="CRM FORM-F-003 - Recebimento de dormentes" /></label>
        <label><span>Mensagem</span><textarea name="emailBody" rows="5">Olá,\n\nSegue o CRM FORM-F-003 referente ao recebimento de dormentes de concreto.\n\nAtenciosamente,\nEquipe EPYA</textarea></label>
        <label class="email-attachments"><span>Anexos adicionais</span><input type="file" name="emailAttachments" multiple accept="image/*,.pdf" /><small>Os arquivos serão escolhidos novamente no aplicativo de e-mail.</small></label>
        <div class="email-actions three"><button class="button button-outline" data-email-pdf ${selected ? "" : "disabled"}>Gerar PDF (2 páginas)</button><button class="button button-yellow" data-open-email>Abrir e-mail</button><button class="button button-whatsapp" data-open-whatsapp ${selected ? "" : "disabled"}>Enviar no WhatsApp</button></div>
      </div>
    </div>
  </section>`;
}

function renderTeam() {
  if (state.user?.role !== "admin") return renderDashboard();
  const active = state.team.filter((user) => user.active);
  return `<section class="view team-view">
    <div class="page-heading"><div><span class="eyebrow">Controle de acesso</span><h1>Equipe autorizada</h1><p>Cadastre o e-mail que cada pessoa usa na conta ChatGPT. O primeiro acesso dela será feito pelo botão de entrada do CRM.</p></div><div class="install-callout"><span>⌂</span><div><strong>App no celular</strong><small>Abra o link e toque em “Adicionar à tela inicial”.</small></div><button class="button button-dark compact" data-install>Instalar</button></div></div>
    <div class="team-grid">
      <article class="panel team-form-panel">
        <span class="eyebrow">Adicionar pessoa</span><h2>Liberar novo e-mail</h2>
        <label><span>Nome</span><input name="teamFullName" placeholder="Nome completo" /></label>
        <label><span>E-mail cadastrado</span><input type="email" name="teamEmail" placeholder="nome@empresa.com" /></label>
        <label><span>Perfil</span><select name="teamRole"><option value="inspector">Inspetor — preencher e consultar</option><option value="admin">Administrador — também cadastra pessoas</option></select></label>
        <button class="button button-yellow" data-add-user>Adicionar à equipe</button>
        <small class="form-note">Não criamos senha. A identidade é confirmada com segurança pelo e-mail da conta ChatGPT.</small>
      </article>
      <article class="panel team-list-panel">
        <div class="panel-heading"><div><span class="eyebrow">Acessos ativos</span><h2>${active.length} pessoa(s)</h2></div>${renderStorageBadge()}</div>
        ${state.teamLoaded ? `<div class="team-list">${state.team.map((user) => `<div class="team-row ${user.active ? "" : "inactive"}"><span class="team-avatar">${escapeHtml((user.fullName || user.email).slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(user.fullName || "Sem nome")}</strong><small>${escapeHtml(user.email)}</small></div><span class="role-pill">${user.role === "admin" ? "Administrador" : "Inspetor"}</span>${user.email === "darcibrum3010@gmail.com" ? '<span class="owner-pill">Acesso principal</span>' : user.active ? `<button class="danger-link" data-remove-user="${user.id}">Remover</button>` : '<span class="status-pill muted">Inativo</span>'}</div>`).join("")}</div>` : '<div class="loading-inline"><span class="spinner"></span> Carregando equipe…</div>'}
      </article>
    </div>
    <article class="panel suggestions-panel"><div><span class="eyebrow">Próximas melhorias sugeridas</span><h2>Ideias úteis para o campo</h2></div><div class="suggestions-grid"><div><b>01</b><strong>Fotos da reprovação</strong><p>Anexar foto e motivo padronizado para cada dormente reprovado.</p></div><div><b>02</b><strong>QR Code no CRM</strong><p>Abrir o registro completo ao apontar a câmera para a folha impressa.</p></div><div><b>03</b><strong>Alerta de não conformidade</strong><p>Avisar o responsável automaticamente quando houver reprovação.</p></div></div></article>
  </section>`;
}

function bindEvents() {
  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.nav)));
  document.querySelectorAll("[data-new-record]").forEach((button) => button.addEventListener("click", newRecord));
  document.querySelector("[data-theme-toggle]")?.addEventListener("click", toggleTheme);
  document.querySelectorAll("[data-tv-toggle]").forEach((button) => button.addEventListener("click", toggleTv));
  document.querySelectorAll("[data-edit-record]").forEach((button) => button.addEventListener("click", () => editRecord(button.dataset.editRecord)));
  document.querySelectorAll("[data-print-record]").forEach((button) => button.addEventListener("click", () => printRecord(button.dataset.printRecord)));
  document.querySelectorAll("[data-whatsapp-record]").forEach((button) => button.addEventListener("click", () => shareWhatsApp(button.dataset.whatsappRecord)));
  document.querySelectorAll("[data-delete-record]").forEach((button) => button.addEventListener("click", () => deleteRecord(button.dataset.deleteRecord)));
  document.querySelector("[data-export]")?.addEventListener("click", exportCsv);
  document.querySelector("[data-apply-filter]")?.addEventListener("click", applyFilters);
  document.querySelector("[data-clear-filter]")?.addEventListener("click", clearFilters);
  document.querySelector("[data-save-record]")?.addEventListener("click", () => saveCurrent("concluido"));
  document.querySelector("[data-save-draft]")?.addEventListener("click", () => saveCurrent("rascunho"));
  document.querySelector("[data-print-current]")?.addEventListener("click", printCurrent);
  document.querySelector("[data-email-pdf]")?.addEventListener("click", printEmailRecord);
  document.querySelector("[data-open-email]")?.addEventListener("click", openEmail);
  document.querySelector("[data-open-whatsapp]")?.addEventListener("click", () => shareWhatsApp(document.querySelector('[name="emailRecord"]')?.value));
  document.querySelector("[data-add-user]")?.addEventListener("click", addTeamMember);
  document.querySelectorAll("[data-remove-user]").forEach((button) => button.addEventListener("click", () => removeTeamMember(button.dataset.removeUser)));
  document.querySelectorAll("[data-install]").forEach((button) => button.addEventListener("click", installApp));

  const form = document.querySelector("#crm-form");
  if (form) {
    setupForm(form);
    form.querySelectorAll("canvas[data-signature]").forEach(setupSignatureCanvas);
  }
}

function navigate(view) {
  state.view = view;
  if (view === "form" && !state.draft) state.draft = defaultDraft();
  if (view === "team" && state.user?.role === "admin" && !state.teamLoaded) loadTeam();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function newRecord() {
  state.draft = defaultDraft();
  state.view = "form";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function editRecord(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  state.draft = structuredClone(record);
  state.view = "form";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setupForm(form) {
  const quickMap = { quantity: "quantity", rejected: "rejected", truckloads: "truckloads" };
  form.querySelectorAll("[data-quick]").forEach((quick) => {
    quick.addEventListener("input", () => {
      const target = form.elements[quickMap[quick.dataset.quick]];
      if (target) target.value = quick.value;
      syncCalculatedUi(form);
    });
  });
  ["quantity", "invoiceNumbers"].forEach((name) => form.elements[name]?.addEventListener("input", () => {
    const quick = form.querySelector(`[data-quick="${name}"]`);
    if (quick) quick.value = form.elements[name].value;
    syncCalculatedUi(form);
  }));
  form.querySelector('[name="attachments"]')?.addEventListener("change", (event) => {
    const names = [...event.target.files].map((file) => file.name);
    form.querySelector("[data-file-names]").textContent = names.length ? names.join(", ") : "Nenhum arquivo selecionado";
  });
  form.addEventListener("input", () => saveDraftPreference(form));
  syncCalculatedUi(form);
}

function syncCalculatedUi(form) {
  const quantity = number(form.elements.quantity?.value);
  const rejected = Math.min(quantity, number(form.querySelector('[data-quick="rejected"]')?.value));
  const approved = quantity - rejected;
  const trucks = Math.max(1, number(form.querySelector('[data-quick="truckloads"]')?.value));
  const nfs = invoiceList(form.elements.invoiceNumbers?.value).length;
  form.querySelectorAll("[data-approved]").forEach((node) => (node.textContent = formatNumber(approved)));
  form.querySelectorAll("[data-quantity-summary]").forEach((node) => (node.textContent = formatNumber(quantity)));
  form.querySelectorAll("[data-rejected-summary]").forEach((node) => (node.textContent = formatNumber(rejected)));
  form.querySelectorAll("[data-truck-summary]").forEach((node) => (node.textContent = formatNumber(trucks)));
  form.querySelectorAll("[data-nf-count]").forEach((node) => (node.textContent = String(nfs)));
}

function formRecord() {
  const form = document.querySelector("#crm-form");
  if (!form) return null;
  const values = Object.fromEntries(new FormData(form).entries());
  const quantity = number(values.quantity);
  const rejected = Math.min(quantity, number(form.querySelector('[data-quick="rejected"]')?.value));
  const attachments = [...(form.elements.attachments?.files || [])].map((file) => file.name);
  return {
    ...state.draft,
    id: state.draft.id || crypto.randomUUID(),
    status: state.draft.status || "concluido",
    work: values.work?.trim() || "",
    client: values.client?.trim() || "",
    material: "Dormente Monobloco de Concreto Protendido",
    invoiceNumbers: values.invoiceNumbers?.trim() || "",
    quantity,
    approved: quantity - rejected,
    rejected,
    unit: values.unit?.trim() || "peças",
    supplier: values.supplier?.trim() || "",
    vehiclePlate: values.vehiclePlate?.trim().toUpperCase() || "",
    receivedAt: values.receivedAt || nowLocalInput(),
    truckloads: Math.max(1, number(form.querySelector('[data-quick="truckloads"]')?.value)),
    checklist: INSPECTIONS.map((_, index) => ({ result: values[`inspection_${index}`] || "C", date: values[`inspectionDate_${index}`] || todayInput() })),
    samples: Array.from({ length: 5 }, (_, index) => values[`sample_${index}`]?.trim() || ""),
    observations: values.observations?.trim() || "",
    nonconformity: values.nonconformity?.trim() || "",
    notifiedTo: values.notifiedTo?.trim() || "",
    notifiedDate: values.notifiedDate || "",
    notificationMethod: values.notificationMethod?.trim() || "",
    inspectorName: values.inspectorName?.trim() || "",
    inspectorDate: values.inspectorDate || "",
    approverName: values.approverName?.trim() || "",
    approverDate: values.approverDate || "",
    attachmentNames: attachments.length ? attachments : state.draft.attachmentNames || [],
    createdAt: state.draft.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function saveDraftPreference(form) {
  const record = formRecord();
  if (!record) return;
  state.draft = record;
  const preference = { inspectorName: record.inspectorName, work: record.work, client: record.client, supplier: record.supplier, unit: record.unit };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(preference));
}

async function saveCurrent(status) {
  const record = formRecord();
  if (!record) return;
  if (!record.invoiceNumbers && status !== "rascunho") return toast("Informe pelo menos uma nota fiscal.", "error");
  if (!record.quantity && status !== "rascunho") return toast("Informe a quantidade recebida.", "error");
  record.status = status;
  if (GITHUB_PAGES_MODE) {
    replaceRecord(record);
    state.storageMode = "local";
    state.draft = record;
    writeLocalRecords();
    render();
    toast(status === "rascunho" ? "Rascunho salvo neste aparelho." : "CRM salvo neste aparelho.", "success");
    return;
  }
  const button = document.querySelector(status === "rascunho" ? "[data-save-draft]" : "[data-save-record]");
  if (button) {
    button.disabled = true;
    button.textContent = "Salvando…";
  }
  let resultMessage = "";
  let resultType = "success";
  try {
    const response = await fetch("/api/crms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) });
    if (!response.ok) throw new Error("Falha ao sincronizar");
    const saved = (await response.json()).record;
    replaceRecord(saved);
    state.storageMode = "cloud";
    state.draft = saved;
    resultMessage = status === "rascunho" ? "Rascunho salvo." : "CRM salvo e painel atualizado.";
  } catch {
    replaceRecord(record);
    state.storageMode = "local";
    writeLocalRecords();
    queueForSync(record);
    state.draft = record;
    resultMessage = "Salvo neste dispositivo. Será enviado automaticamente quando o sinal voltar.";
    resultType = "warning";
  } finally {
    render();
    toast(resultMessage, resultType);
  }
}

function replaceRecord(record) {
  const index = state.records.findIndex((item) => item.id === record.id);
  if (index >= 0) state.records[index] = record;
  else state.records.unshift(record);
  state.records.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
}

async function deleteRecord(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record || !confirm(`Excluir o CRM da NF ${record.invoiceNumbers || "sem número"}?`)) return;
  try {
    if (GITHUB_PAGES_MODE) throw new Error("Modo local");
    const response = await fetch(`/api/crms/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Falha");
  } catch {
    state.storageMode = "local";
  }
  state.records = state.records.filter((item) => item.id !== id);
  writeLocalRecords();
  render();
  toast("CRM excluído.", "success");
}

function printCurrent() {
  const record = formRecord();
  if (record) state.draft = record;
  toast("Na impressão, escolha A4, frente e verso e virar na borda longa.", "success");
  setTimeout(() => window.print(), 350);
}

function printRecord(id) {
  editRecord(id);
  setTimeout(printCurrent, 250);
}

function setupSignatureCanvas(canvas) {
  const key = canvas.dataset.signature;
  const context = canvas.getContext("2d");
  context.lineWidth = 2.4;
  context.lineCap = "round";
  context.strokeStyle = state.theme === "dark" ? "#f4ca16" : "#153b70";
  const existing = state.draft?.[key];
  if (existing) {
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = existing;
  }
  let drawing = false;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
  };
  canvas.addEventListener("pointerdown", (event) => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const p = point(event);
    context.beginPath();
    context.moveTo(p.x, p.y);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const p = point(event);
    context.lineTo(p.x, p.y);
    context.stroke();
  });
  const finish = () => {
    if (!drawing) return;
    drawing = false;
    state.draft[key] = canvas.toDataURL("image/png");
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
  document.querySelector(`[data-clear-signature="${key}"]`)?.addEventListener("click", () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    state.draft[key] = "";
  });
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, state.theme);
  render();
}

async function toggleTv() {
  state.tvMode = !state.tvMode;
  if (state.tvMode) {
    state.view = "dashboard";
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // The expanded dashboard still works when fullscreen is blocked.
    }
  } else if (document.fullscreenElement) {
    await document.exitFullscreen?.();
  }
  render();
}

function applyFilters() {
  state.filters.invoice = document.querySelector('[name="filterInvoice"]')?.value || "";
  state.filters.from = document.querySelector('[name="filterFrom"]')?.value || "";
  state.filters.to = document.querySelector('[name="filterTo"]')?.value || "";
  render();
}

function clearFilters() {
  state.filters = { invoice: "", from: "", to: "" };
  render();
}

function exportCsv() {
  const header = ["Data", "Nota Fiscal", "Fornecedor", "Placa", "Recebidos", "Aprovados", "Reprovados", "Carretas", "Status"];
  const rows = state.records.map((record) => [formatDate(record.receivedAt), record.invoiceNumbers, record.supplier, record.vehiclePlate, record.quantity, calcApproved(record), record.rejected, record.truckloads, statusLabel(record.status)]);
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  link.download = `crm-dormentes-epya-${todayInput()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function printEmailRecord() {
  const id = document.querySelector('[name="emailRecord"]')?.value;
  if (!id) return toast("Selecione um CRM.", "error");
  printRecord(id);
}

function openEmail() {
  const recipientInput = document.querySelector('[name="emailRecipient"]');
  const recipient = recipientInput?.value.trim() || "";
  const subject = document.querySelector('[name="emailSubject"]')?.value || "CRM FORM-F-003";
  const body = document.querySelector('[name="emailBody"]')?.value || "";
  if (!recipient) return toast("Informe o e-mail do destinatário.", "error");
  localStorage.setItem(EMAIL_KEY, recipient);
  toast("E-mail preparado. Anexe o PDF salvo em duas páginas.", "success");
  window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function shareWhatsApp(id) {
  const record = state.records.find((item) => item.id === id) || state.records[0];
  if (!record) return toast("Selecione ou salve um CRM antes de enviar.", "error");
  const message = [
    "CRM EPYA • FORM-F-003",
    `NF: ${record.invoiceNumbers || "sem número"}`,
    `Data: ${formatDate(record.receivedAt, true)}`,
    `Fornecedor: ${record.supplier || "não informado"}`,
    `Recebidos: ${formatNumber(record.quantity)}`,
    `Aprovados: ${formatNumber(calcApproved(record))}`,
    `Reprovados: ${formatNumber(record.rejected)}`,
    "",
    "Abra o CRM: " + window.location.href.split("?")[0],
    "Após gerar o PDF de 2 páginas, anexe-o nesta conversa.",
  ].join("\n");
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  toast("WhatsApp aberto. Anexe o PDF salvo em duas páginas.", "success");
}

async function loadTeam() {
  try {
    const response = await fetch("/api/users", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Falha ao carregar equipe");
    const data = await response.json();
    state.team = Array.isArray(data.users) ? data.users : [];
    state.teamLoaded = true;
  } catch {
    state.teamLoaded = true;
    toast("Não foi possível atualizar a equipe sem conexão.", "warning");
  }
  if (state.view === "team") render();
}

async function addTeamMember() {
  const fullName = document.querySelector('[name="teamFullName"]')?.value.trim() || "";
  const email = document.querySelector('[name="teamEmail"]')?.value.trim().toLowerCase() || "";
  const role = document.querySelector('[name="teamRole"]')?.value || "inspector";
  if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Informe um e-mail válido.", "error");
  const button = document.querySelector("[data-add-user]");
  if (button) {
    button.disabled = true;
    button.textContent = "Adicionando…";
  }
  try {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, role }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível adicionar.");
    state.teamLoaded = false;
    await loadTeam();
    toast(`${email} já pode fazer o primeiro acesso.`, "success");
  } catch (error) {
    render();
    toast(error.message || "É necessário estar online para liberar um acesso.", "error");
  }
}

async function removeTeamMember(id) {
  const user = state.team.find((item) => item.id === id);
  if (!user || !confirm(`Remover o acesso de ${user.fullName || user.email}?`)) return;
  try {
    const response = await fetch(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível remover.");
    state.teamLoaded = false;
    await loadTeam();
    toast("Acesso removido.", "success");
  } catch (error) {
    toast(error.message || "Falha ao remover acesso.", "error");
  }
}

async function installApp() {
  if (state.installPrompt) {
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    return;
  }
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  toast(isIos ? "No Safari: toque em Compartilhar e depois em Adicionar à Tela de Início." : "No navegador, abra o menu e escolha Instalar app ou Adicionar à tela inicial.", "success");
}

function readLocalRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function writeLocalRecords() {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(state.records));
}

function readOutbox() {
  try {
    const records = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function queueForSync(record) {
  const outbox = readOutbox();
  const index = outbox.findIndex((item) => item.id === record.id);
  if (index >= 0) outbox[index] = record;
  else outbox.push(record);
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  state.pendingSync = outbox.length;
}

async function syncOutbox() {
  if (GITHUB_PAGES_MODE || !state.online || !state.authorized) return;
  const pending = readOutbox();
  if (!pending.length) {
    state.pendingSync = 0;
    return;
  }
  const remaining = [];
  for (const record of pending) {
    try {
      const response = await fetch("/api/crms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      if (!response.ok) throw new Error("Falha de sincronização");
      const saved = (await response.json()).record;
      replaceRecord(saved);
    } catch {
      remaining.push(record);
    }
  }
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining));
  state.pendingSync = remaining.length;
  state.storageMode = remaining.length ? "local" : "cloud";
  writeLocalRecords();
  render();
  toast(remaining.length ? `${remaining.length} CRM(s) ainda aguardam sincronização.` : "Registros offline sincronizados com sucesso.", remaining.length ? "warning" : "success");
}

function toast(message, type = "success") {
  const node = document.querySelector(".toast");
  if (!node) return;
  node.textContent = message;
  node.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (node.className = "toast"), 4200);
}

async function loadRecords() {
  try {
    const response = await fetch("/api/crms", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Banco indisponível");
    const data = await response.json();
    state.records = Array.isArray(data.records) ? data.records : [];
    readOutbox().forEach((record) => replaceRecord(record));
    state.storageMode = "cloud";
    writeLocalRecords();
  } catch {
    state.records = readLocalRecords();
    state.storageMode = "local";
  }
  state.pendingSync = readOutbox().length;
  state.loading = false;
  render();
}

async function loadSession() {
  const cached = (() => {
    try {
      return JSON.parse(localStorage.getItem(AUTH_CACHE_KEY) || "null");
    } catch {
      return null;
    }
  })();
  try {
    const response = await fetch("/api/session", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Sessão indisponível");
    const session = await response.json();
    state.authenticated = Boolean(session.authenticated);
    state.authorized = Boolean(session.authorized);
    state.user = session.user || (session.authenticated ? { email: session.email || "" } : null);
    if (session.authorized && session.user) localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(session.user));
    if (session.authenticated && !session.authorized) localStorage.removeItem(AUTH_CACHE_KEY);
  } catch {
    if (cached) {
      state.authenticated = true;
      state.authorized = true;
      state.user = cached;
      state.storageMode = "local";
    } else {
      state.authenticated = false;
      state.authorized = false;
      state.user = null;
    }
  }
  state.authLoading = false;
}

async function bootstrap() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(GITHUB_PAGES_MODE ? "./service-worker.js" : "/service-worker.js").catch(() => {});
  }
  state.pendingSync = readOutbox().length;
  render();
  if (GITHUB_PAGES_MODE) {
    state.records = readLocalRecords();
    state.loading = false;
    state.storageMode = "local";
    state.pendingSync = 0;
    render();
    return;
  }
  await loadSession();
  if (state.authorized) {
    await loadRecords();
    await syncOutbox();
  } else {
    state.loading = false;
    render();
  }
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
  render();
});

window.addEventListener("online", async () => {
  state.online = true;
  await loadSession();
  render();
  if (state.authorized) await syncOutbox();
});

window.addEventListener("offline", () => {
  state.online = false;
  state.storageMode = "local";
  render();
});

bootstrap();
