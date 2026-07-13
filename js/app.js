(() => {
  const STORAGE_KEY = 'epya-quality-control-v1';
  const THEME_KEY = 'epya-theme-preference';
  const MAX_ATTACHMENT_SIZE = 2.5 * 1024 * 1024;
  const SUPABASE_PROJECT_URL = 'https://eerebnizeuwxxqoxhjqh.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dvp7n399kM679L0dXf9R8w_1ih-WiWY';
  const ADMIN_EMAIL = 'DarciBrum3010@gmail.com';
  const supabaseClient = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
  let currentSession = null;
  let currentProfile = null;
  let remoteReady = false;

  const defaultState = {
    users: [
      {
        id: 'usr-darci-admin',
        name: 'Darci Brum',
        email: ADMIN_EMAIL,
        role: 'admin',
        status: 'Ativo',
        notes: 'Responsável pelo painel de controle de qualidade EPYA.',
        createdAt: new Date().toISOString(),
      },
    ],
    activeUserId: 'usr-darci-admin',
    rdos: [],
    ncs: [],
    projects: [],
    leaders: [],
    expenses: [],
    teamMembers: [],
    visitLogs: [],
    vehicle: {
      model: '',
      plate: '',
      color: '',
      odometer: '',
    },
    vehicleCosts: [],
    agendaItems: [],
  };

  let state = loadState();
  migrateProjectsFromRdos();

  function migrateProjectsFromRdos() {
    if (!Array.isArray(state.projects)) state.projects = [];
    if (!Array.isArray(state.ncs)) state.ncs = [];
    if (!Array.isArray(state.visitLogs)) state.visitLogs = [];
    if (!Array.isArray(state.leaders)) state.leaders = [];
    const known = new Set(state.projects.map((project) => normalizeText(project.name)));
    [...state.rdos, ...state.ncs].forEach((item) => {
      const name = String(item.project || '').trim();
      if (!name || known.has(normalizeText(name))) return;
      known.add(normalizeText(name));
      state.projects.push({ id: uid('prj'), name, createdAt: new Date().toISOString() });
    });
    state.projects.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    const knownLeaders = new Set(state.leaders.map((leader) => normalizeText(leader.name)));
    state.teamMembers.forEach((member) => {
      const name = String(member.leader || '').trim();
      if (!name || knownLeaders.has(normalizeText(name))) return;
      knownLeaders.add(normalizeText(name));
      state.leaders.push({ id: uid('ldr'), name, createdAt: new Date().toISOString() });
    });
    state.leaders.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    pageTitle: $('#pageTitle'),
    navList: $('#navList'),
    activeUserSelect: $('#activeUserSelect'),
    metricsGrid: $('#metricsGrid'),
    upcomingReminders: $('#upcomingReminders'),
    recentRdoTable: $('#recentRdoTable'),
    expensesChart: $('#expensesChart'),
    rdoChart: $('#rdoChart'),
    teamVisitsChart: $('#teamVisitsChart'),
    dashboardSummary: $('#dashboardSummary'),
    toast: $('#toast'),
    modal: $('#modal'),
    modalTitle: $('#modalTitle'),
    modalBody: $('#modalBody'),
    loginScreen: $('#loginScreen'),
    appShell: $('#appShell'),
    loginMessage: $('#loginMessage'),
    sessionUserName: $('#sessionUserName'),
    sessionUserRole: $('#sessionUserRole'),
    themeToggle: $('#themeToggle'),
    topLogoutButton: $('#topLogoutButton'),
  };

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return structuredClone(defaultState);
      const parsed = JSON.parse(saved);
      return {
        ...structuredClone(defaultState),
        ...parsed,
        vehicle: { ...defaultState.vehicle, ...(parsed.vehicle || {}) },
      };
    } catch (error) {
      console.error('Erro ao carregar dados locais:', error);
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid(prefix = 'id') {
    if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function todayInput(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function monthInput(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  function datetimeLocalInput(date = new Date()) {
    return `${todayInput(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(`${value}T00:00:00`);
    return date.toLocaleDateString('pt-BR');
  }

  function formatDateTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  function currency(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function getCurrentUser() {
    if (currentProfile) return currentProfile;
    return state.users.find((user) => user.id === state.activeUserId) || state.users[0];
  }

  function canEdit() {
    const role = getCurrentUser()?.role;
    return role === 'admin' || role === 'analista';
  }

  function isAdmin() {
    return getCurrentUser()?.role === 'admin';
  }

  function assertCanEdit() {
    if (canEdit()) return true;
    toast('Este perfil é somente consulta. Peça acesso de analista ou admin para lançar/editar dados.');
    return false;
  }

  function assertAdmin() {
    if (isAdmin()) return true;
    toast('Somente administrador pode acessar esta função.');
    return false;
  }

  function toast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => elements.toast.classList.remove('show'), 3600);
  }

  function openModal(title, bodyHtml) {
    elements.modalTitle.textContent = title;
    elements.modalBody.innerHTML = bodyHtml;
    elements.modal.hidden = false;
  }

  function closeModal() {
    elements.modal.hidden = true;
  }

  function setLoginMessage(message) {
    if (elements.loginMessage) elements.loginMessage.textContent = message;
  }

  function showLogin() {
    elements.loginScreen.hidden = false;
    elements.appShell.hidden = true;
  }

  function showApp() {
    elements.loginScreen.hidden = true;
    elements.appShell.hidden = false;
  }

  function setupTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    document.body.dataset.theme = savedTheme;
    updateThemeButton(savedTheme);

    elements.themeToggle?.addEventListener('click', () => {
      const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
      document.body.dataset.theme = next;
      localStorage.setItem(THEME_KEY, next);
      updateThemeButton(next);
      renderDashboard();
    });
  }

  function updateThemeButton(theme) {
    if (!elements.themeToggle) return;
    elements.themeToggle.textContent = theme === 'dark' ? 'Tema claro' : 'Tema escuro';
  }

  async function performLogout() {
    await supabaseClient?.auth.signOut();
    currentSession = null;
    currentProfile = null;
    remoteReady = false;
    showLogin();
    setLoginMessage('Você saiu do sistema.');
  }

  function setupAuthForms() {
    document.querySelectorAll('[data-login-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.loginMode;
        document.querySelectorAll('[data-login-mode]').forEach((item) => item.classList.toggle('active', item === button));
        $('#loginForm').hidden = mode !== 'signin';
        $('#signupForm').hidden = mode !== 'signup';
        setLoginMessage(mode === 'signin'
          ? 'Acesso restrito a usuários cadastrados.'
          : 'O primeiro acesso só libera e-mails previamente cadastrados pelo admin.');
      });
    });

    $('#loginForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!supabaseClient) {
        setLoginMessage('Biblioteca do Supabase não carregou. Verifique a conexão com a internet.');
        return;
      }
      setLoginMessage('Validando acesso...');
      const email = $('#loginEmail').value.trim();
      const password = $('#loginPassword').value;
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        setLoginMessage(`Não foi possível entrar: ${error.message}`);
        return;
      }
      currentSession = data.session;
      await loadAuthenticatedApp();
    });

    $('#signupForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!supabaseClient) {
        setLoginMessage('Biblioteca do Supabase não carregou. Verifique a conexão com a internet.');
        return;
      }
      const name = $('#signupName').value.trim();
      const email = $('#signupEmail').value.trim();
      const password = $('#signupPassword').value;
      setLoginMessage('Conferindo se o e-mail foi liberado pelo administrador...');

      const { data: approved, error: approvalError } = await supabaseClient.rpc('is_email_preapproved', { p_email: email });
      if (approvalError) {
        setLoginMessage(`Não consegui validar o cadastro: ${approvalError.message}. Rode o supabase_schema.sql no projeto.`);
        return;
      }
      if (!approved) {
        setLoginMessage('Este e-mail ainda não foi cadastrado pelo administrador.');
        return;
      }

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) {
        setLoginMessage(`Não foi possível ativar o acesso: ${error.message}`);
        return;
      }
      if (data.session) {
        currentSession = data.session;
        await loadAuthenticatedApp();
      } else {
        setLoginMessage('Acesso criado. Se o Supabase pedir confirmação, confirme o e-mail e depois entre pela aba Login.');
      }
    });

    $('#logoutButton')?.addEventListener('click', performLogout);
    $('#topLogoutButton')?.addEventListener('click', performLogout);
  }

  async function restoreSession() {
    if (!supabaseClient) {
      showLogin();
      setLoginMessage('Não foi possível carregar a biblioteca do Supabase. Verifique sua internet ou os scripts CDN no final do index.html.');
      return;
    }
    const { data } = await supabaseClient.auth.getSession();
    currentSession = data.session;
    if (!currentSession) {
      showLogin();
      return;
    }
    await loadAuthenticatedApp();
  }

  async function loadAuthenticatedApp() {
    try {
      await loadCurrentProfile();
      if (!currentProfile || currentProfile.status !== 'Ativo') {
        await supabaseClient.auth.signOut();
        currentSession = null;
        currentProfile = null;
        remoteReady = false;
        showLogin();
        setLoginMessage('Seu usuário está inativo ou não foi cadastrado pelo administrador.');
        return;
      }
      await loadRemoteData();
      showApp();
      renderAll();
      toast('Dados carregados do Supabase.');
    } catch (error) {
      console.error(error);
      showLogin();
      setLoginMessage(`Erro ao carregar Supabase: ${error.message || error}`);
    }
  }

  async function loadCurrentProfile() {
    const user = currentSession?.user;
    if (!user) return null;

    let { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;

    if (!profile && user.email) {
      const byEmail = await supabaseClient
        .from('profiles')
        .select('*')
        .ilike('email', user.email)
        .maybeSingle();
      if (byEmail.error && byEmail.error.code !== 'PGRST116') throw byEmail.error;
      profile = byEmail.data;
      if (profile && !profile.auth_user_id) {
        await supabaseClient.from('profiles').update({ auth_user_id: user.id, updated_at: new Date().toISOString() }).eq('id', profile.id);
        profile.auth_user_id = user.id;
      }
    }

    currentProfile = profile ? profileFromDb(profile) : null;
    if (currentProfile) state.activeUserId = currentProfile.id;
    return currentProfile;
  }

  async function loadRemoteData() {
    if (!supabaseClient || !currentSession) return;
    const [profiles, rdos, expenses, teamMembers, vehicles, vehicleCosts, agendaItems, ncs, projects, visitLogs, leaders] = await Promise.all([
      supabaseClient.from('profiles').select('*').order('name', { ascending: true }),
      supabaseClient.from('rdos').select('*').order('date', { ascending: false }),
      supabaseClient.from('expenses').select('*').order('date', { ascending: false }),
      supabaseClient.from('team_members').select('*').order('name', { ascending: true }),
      supabaseClient.from('vehicles').select('*').limit(1),
      supabaseClient.from('vehicle_costs').select('*').order('date', { ascending: false }),
      supabaseClient.from('agenda_items').select('*').order('date_time', { ascending: true }),
      supabaseClient.from('ncs').select('*').order('date', { ascending: false }),
      supabaseClient.from('projects').select('*').order('name', { ascending: true }),
      supabaseClient.from('visit_logs').select('*').order('date', { ascending: false }),
      supabaseClient.from('leaders').select('*').order('name', { ascending: true }),
    ]);

    const responses = { profiles, rdos, expenses, teamMembers, vehicles, vehicleCosts, agendaItems };
    Object.entries(responses).forEach(([name, response]) => {
      if (response.error) throw new Error(`${name}: ${response.error.message}`);
    });

    const newTablesMissing = Boolean(ncs.error || projects.error || visitLogs.error || leaders.error);
    if (newTablesMissing) {
      console.warn('Tabelas ncs/projects/visit_logs/leaders ainda não existem no Supabase. Rode o supabase_schema.sql atualizado.', ncs.error || projects.error || visitLogs.error || leaders.error);
      toast('Aviso: rode o supabase_schema.sql atualizado para sincronizar NCs, frentes, visitas e encarregados.');
    }

    state = {
      ...structuredClone(defaultState),
      users: profiles.data.map(profileFromDb),
      activeUserId: currentProfile?.id || profiles.data[0]?.id || defaultState.activeUserId,
      rdos: rdos.data.map(rdoFromDb),
      ncs: ncs.error ? state.ncs : ncs.data.map(ncFromDb),
      projects: projects.error ? state.projects : projects.data.map(projectFromDb),
      leaders: leaders.error ? state.leaders : leaders.data.map(leaderFromDb),
      visitLogs: visitLogs.error ? state.visitLogs : visitLogs.data.map(visitLogFromDb),
      expenses: expenses.data.map(expenseFromDb),
      teamMembers: teamMembers.data.map(teamMemberFromDb),
      vehicle: vehicleFromDb(vehicles.data?.[0]),
      vehicleCosts: vehicleCosts.data.map(vehicleCostFromDb),
      agendaItems: agendaItems.data.map(agendaFromDb),
    };
    migrateProjectsFromRdos();
    remoteReady = true;
    saveState();
  }

  async function refreshRemoteData() {
    if (!remoteReady) {
      toast('Entre no sistema para atualizar os dados do Supabase.');
      return;
    }
    await loadRemoteData();
    renderAll();
    toast('Dados atualizados do Supabase.');
  }

  function profileFromDb(row) {
    return {
      id: row.id,
      authUserId: row.auth_user_id,
      name: row.name || row.email || 'Usuário',
      email: row.email || '',
      role: row.role || 'consulta',
      status: row.status || 'Ativo',
      notes: row.notes || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function profileToDb(user) {
    return {
      id: user.id || uid('usr'),
      auth_user_id: user.authUserId || null,
      name: user.name,
      email: String(user.email || '').trim(),
      role: user.role,
      status: user.status,
      notes: user.notes || '',
      updated_at: new Date().toISOString(),
      created_at: user.createdAt || new Date().toISOString(),
    };
  }

  function rdoFromDb(row) {
    return {
      id: row.id, date: row.date, shift: row.shift, project: row.project, location: row.location,
      weather: row.weather, status: row.status, activities: row.activities, issues: row.issues,
      quality: row.quality, attachments: row.attachments || [], createdBy: row.created_by,
      updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  function rdoToDb(item) {
    return {
      id: item.id, date: item.date, shift: item.shift, project: item.project, location: item.location,
      weather: item.weather, status: item.status, activities: item.activities, issues: item.issues,
      quality: item.quality, attachments: item.attachments || [], created_by: item.createdBy,
      updated_by: item.updatedBy, created_at: item.createdAt || new Date().toISOString(), updated_at: item.updatedAt || new Date().toISOString(),
    };
  }

  function expenseFromDb(row) {
    return {
      id: row.id, date: row.date, category: row.category, supplier: row.supplier,
      value: Number(row.value || 0), payment: row.payment, description: row.description,
      attachments: row.attachments || [], createdBy: row.created_by, updatedBy: row.updated_by,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  function expenseToDb(item) {
    return {
      id: item.id, date: item.date, category: item.category, supplier: item.supplier,
      value: Number(item.value || 0), payment: item.payment, description: item.description,
      attachments: item.attachments || [], created_by: item.createdBy, updated_by: item.updatedBy,
      created_at: item.createdAt || new Date().toISOString(), updated_at: item.updatedAt || new Date().toISOString(),
    };
  }

  function teamMemberFromDb(row) {
    return {
      id: row.id, name: row.name, role: row.member_role, leader: row.leader, group: row.team_group,
      phone: row.phone, status: row.status, lastVisitDate: row.last_visit_date || '', visitCount: Number(row.visit_count || 0), notes: row.notes, createdBy: row.created_by,
      updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  function teamMemberToDb(item) {
    return {
      id: item.id, name: item.name, member_role: item.role, leader: item.leader, team_group: item.group,
      phone: item.phone, status: item.status, last_visit_date: item.lastVisitDate || null, visit_count: Number(item.visitCount || 0), notes: item.notes, created_by: item.createdBy,
      updated_by: item.updatedBy, created_at: item.createdAt || new Date().toISOString(), updated_at: item.updatedAt || new Date().toISOString(),
    };
  }

  function vehicleFromDb(row) {
    if (!row) return structuredClone(defaultState.vehicle);
    return { id: row.id, model: row.model || '', plate: row.plate || '', color: row.color || '', odometer: row.odometer || '' };
  }

  function vehicleToDb(vehicle) {
    return {
      id: vehicle.id || `vehicle-${currentProfile?.id || 'local'}`,
      model: vehicle.model || '', plate: vehicle.plate || '', color: vehicle.color || '', odometer: Number(vehicle.odometer || 0),
      updated_at: new Date().toISOString(),
    };
  }

  function vehicleCostFromDb(row) {
    return {
      id: row.id, date: row.date, type: row.cost_type, value: Number(row.value || 0), km: row.km,
      description: row.description, attachments: row.attachments || [], createdBy: row.created_by,
      updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  function vehicleCostToDb(item) {
    return {
      id: item.id, date: item.date, cost_type: item.type, value: Number(item.value || 0), km: item.km,
      description: item.description, attachments: item.attachments || [], created_by: item.createdBy,
      updated_by: item.updatedBy, created_at: item.createdAt || new Date().toISOString(), updated_at: item.updatedAt || new Date().toISOString(),
    };
  }

  function agendaFromDb(row) {
    return {
      id: row.id, title: row.title, dateTime: row.date_time, priority: row.priority, status: row.status,
      notes: row.notes, notified: row.notified, createdBy: row.created_by, updatedBy: row.updated_by,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  function agendaToDb(item) {
    return {
      id: item.id, title: item.title, date_time: item.dateTime, priority: item.priority, status: item.status,
      notes: item.notes, notified: Boolean(item.notified), created_by: item.createdBy, updated_by: item.updatedBy,
      created_at: item.createdAt || new Date().toISOString(), updated_at: item.updatedAt || new Date().toISOString(),
    };
  }

  function ncFromDb(row) {
    return {
      id: row.id, date: row.date, project: row.project, type: row.nc_type, severity: row.severity,
      responsible: row.responsible, deadline: row.deadline || '', status: row.status,
      description: row.description, action: row.corrective_action, attachments: row.attachments || [],
      closedAt: row.closed_at, createdBy: row.created_by, updatedBy: row.updated_by,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  function ncToDb(item) {
    return {
      id: item.id, date: item.date, project: item.project, nc_type: item.type, severity: item.severity,
      responsible: item.responsible, deadline: item.deadline || null, status: item.status,
      description: item.description, corrective_action: item.action, attachments: item.attachments || [],
      closed_at: item.closedAt || null, created_by: item.createdBy, updated_by: item.updatedBy,
      created_at: item.createdAt || new Date().toISOString(), updated_at: item.updatedAt || new Date().toISOString(),
    };
  }

  function projectFromDb(row) {
    return { id: row.id, name: row.name, createdAt: row.created_at };
  }

  function projectToDb(item) {
    return { id: item.id, name: item.name, created_at: item.createdAt || new Date().toISOString(), updated_at: new Date().toISOString() };
  }

  function leaderFromDb(row) {
    return { id: row.id, name: row.name, createdAt: row.created_at };
  }

  function leaderToDb(item) {
    return { id: item.id, name: item.name, created_at: item.createdAt || new Date().toISOString(), updated_at: new Date().toISOString() };
  }

  function visitLogFromDb(row) {
    return {
      id: row.id, teamMemberId: row.team_member_id, project: row.project, date: row.date,
      notes: row.notes, createdBy: row.created_by, createdAt: row.created_at,
    };
  }

  function visitLogToDb(item) {
    return {
      id: item.id, team_member_id: item.teamMemberId || null, project: item.project || null, date: item.date,
      notes: item.notes || '', created_by: item.createdBy, created_at: item.createdAt || new Date().toISOString(),
    };
  }

  function remoteMapping(collection, item) {
    const map = {
      users: ['profiles', profileToDb],
      rdos: ['rdos', rdoToDb],
      ncs: ['ncs', ncToDb],
      projects: ['projects', projectToDb],
      leaders: ['leaders', leaderToDb],
      visitLogs: ['visit_logs', visitLogToDb],
      expenses: ['expenses', expenseToDb],
      teamMembers: ['team_members', teamMemberToDb],
      vehicleCosts: ['vehicle_costs', vehicleCostToDb],
      agendaItems: ['agenda_items', agendaToDb],
    };
    const found = map[collection];
    return found ? { table: found[0], row: found[1](item) } : null;
  }

  async function saveRemote(collection, item) {
    if (!remoteReady || !supabaseClient) return;
    const mapping = remoteMapping(collection, item);
    if (!mapping) return;
    const { error } = await supabaseClient.from(mapping.table).upsert(mapping.row, { onConflict: 'id' });
    if (error) {
      console.error(error);
      toast(`Erro ao salvar no Supabase: ${error.message}`);
      return;
    }
    if (collection === 'users') await loadRemoteData();
  }

  async function deleteRemote(collection, id) {
    if (!remoteReady || !supabaseClient) return;
    const mapping = remoteMapping(collection, { id });
    if (!mapping) return;
    const { error } = await supabaseClient.from(mapping.table).delete().eq('id', id);
    if (error) {
      console.error(error);
      toast(`Erro ao excluir no Supabase: ${error.message}`);
    }
  }

  async function saveVehicleRemote() {
    if (!remoteReady || !supabaseClient) return;
    const row = vehicleToDb(state.vehicle);
    state.vehicle.id = row.id;
    const { error } = await supabaseClient.from('vehicles').upsert(row, { onConflict: 'id' });
    if (error) toast(`Erro ao salvar veículo no Supabase: ${error.message}`);
  }

  async function syncLocalBackupToSupabase() {
    if (!remoteReady) {
      toast('Entre no sistema com Supabase antes de sincronizar.');
      return;
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      toast('Não encontrei backup local para enviar.');
      return;
    }
    const local = JSON.parse(saved);
    const confirmed = confirm('Enviar os dados locais deste navegador para o Supabase? Registros com mesmo ID serão atualizados.');
    if (!confirmed) return;

    const collections = ['rdos', 'ncs', 'projects', 'leaders', 'visitLogs', 'expenses', 'teamMembers', 'vehicleCosts', 'agendaItems'];
    for (const collection of collections) {
      for (const item of local[collection] || []) await saveRemote(collection, item);
    }
    if (local.vehicle) {
      state.vehicle = { ...state.vehicle, ...local.vehicle };
      await saveVehicleRemote();
    }
    await loadRemoteData();
    renderAll();
    toast('Dados locais enviados para o Supabase.');
  }

  async function readAttachments(input, existing = [], append = false) {
    const files = [...(input?.files || [])];
    if (!files.length) return append ? existing : existing;

    const accepted = [];
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        toast(`Arquivo ignorado por ser maior que 2,5MB: ${file.name}`);
        continue;
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      accepted.push({
        id: uid('file'),
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl,
        uploadedAt: new Date().toISOString(),
      });
    }
    return append ? [...existing, ...accepted] : accepted;
  }

  function attachmentBadge(attachments = []) {
    if (!attachments.length) return '<span class="badge warn">Sem anexo</span>';
    return `<span class="badge ok">${attachments.length} anexo${attachments.length > 1 ? 's' : ''}</span>`;
  }

  function renderAttachmentLinks(attachments = []) {
    if (!attachments.length) return '<span class="empty-state">Nenhum anexo salvo.</span>';
    return `<div class="attachments-list">${attachments.map((file) => `<a href="${file.dataUrl}" download="${escapeHtml(file.name)}">${escapeHtml(file.name)}</a>`).join('')}</div>`;
  }

  function sortByDateDesc(list, field = 'date') {
    return [...list].sort((a, b) => String(b[field] || '').localeCompare(String(a[field] || '')));
  }

  function setupNavigation() {
    elements.navList.addEventListener('click', (event) => {
      const button = event.target.closest('.nav-item');
      if (!button) return;
      openTab(button.dataset.tab);
    });

    document.body.addEventListener('click', (event) => {
      const opener = event.target.closest('[data-open-tab]');
      if (opener) openTab(opener.dataset.openTab);
    });

    $('#quickRdoButton').addEventListener('click', () => openTab('rdo'));

    $('#dashPeriodFilter')?.addEventListener('change', renderDashboard);
    $('#dashProjectFilter')?.addEventListener('change', renderDashboard);
  }

  function openTab(tabId) {
    $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.tab === tabId));
    $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === tabId));
    const nav = $(`.nav-item[data-tab="${tabId}"]`);
    elements.pageTitle.textContent = nav?.querySelector('span')?.textContent || nav?.textContent || 'Dashboard';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderUsersSelect() {
    const current = getCurrentUser();
    if (remoteReady && currentProfile) {
      elements.activeUserSelect.innerHTML = `<option value="${currentProfile.id}">${escapeHtml(currentProfile.name)} — ${roleLabel(currentProfile.role)}</option>`;
      elements.activeUserSelect.disabled = true;
    } else {
      elements.activeUserSelect.disabled = false;
      elements.activeUserSelect.innerHTML = state.users
        .filter((user) => user.status === 'Ativo')
        .map((user) => `<option value="${user.id}" ${user.id === current.id ? 'selected' : ''}>${escapeHtml(user.name)} — ${roleLabel(user.role)}</option>`)
        .join('');
    }

    if (elements.sessionUserName) elements.sessionUserName.textContent = current?.name || 'Não conectado';
    if (elements.sessionUserRole) elements.sessionUserRole.textContent = `${roleLabel(current?.role)} • ${current?.email || 'local'}`;

    $$('.nav-item[data-admin-only="true"]').forEach((item) => {
      item.style.display = current?.role === 'admin' ? '' : 'none';
      if (item.classList.contains('active') && current?.role !== 'admin') openTab('dashboard');
    });

    document.body.classList.toggle('read-only', !canEdit());
  }

  function roleLabel(role) {
    const labels = {
      admin: 'Admin',
      analista: 'Analista',
      consulta: 'Consulta',
    };
    return labels[role] || role || '-';
  }

  function currentUserStamp() {
    const user = getCurrentUser();
    return user ? user.name : 'Não informado';
  }

  const dashboardCharts = {};

  function dashboardFilters() {
    return {
      period: $('#dashPeriodFilter')?.value || 'month',
      project: $('#dashProjectFilter')?.value || 'all',
    };
  }

  function periodStartDate(period) {
    const now = new Date();
    if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === 'year') return new Date(now.getFullYear(), 0, 1);
    if (period === 'all') return null;
    const days = Number(period);
    if (Number.isFinite(days)) {
      const start = new Date(now);
      start.setDate(start.getDate() - days);
      return start;
    }
    return null;
  }

  function inDashboardScope(item, dateField = 'date') {
    const { period, project } = dashboardFilters();
    if (project !== 'all' && normalizeText(item.project || '') !== normalizeText(project)) return false;
    const start = periodStartDate(period);
    if (!start) return true;
    const raw = item[dateField];
    if (!raw) return false;
    const itemDate = new Date(String(raw).length === 10 ? `${raw}T00:00:00` : raw);
    return itemDate >= start;
  }

  function chartTheme() {
    const dark = document.body.dataset.theme === 'dark';
    return {
      text: dark ? '#c8cbd3' : '#676b73',
      grid: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(18, 20, 24, 0.08)',
      surface: dark ? '#1f2126' : '#ffffff',
    };
  }

  function upsertChart(key, canvasId, config) {
    const canvas = $(canvasId);
    if (!canvas || !window.Chart) return;
    if (dashboardCharts[key]) {
      dashboardCharts[key].destroy();
      delete dashboardCharts[key];
    }
    dashboardCharts[key] = new Chart(canvas, config);
  }

  function metricCard(metric) {
    const deltaClass = metric.deltaKind ? ` metric-delta-${metric.deltaKind}` : '';
    const delta = metric.delta ? `<span class="metric-delta${deltaClass}">${escapeHtml(metric.delta)}</span>` : '';
    const alertClass = metric.alert ? ' metric-card-alert' : '';
    return `
      <div class="metric-card${alertClass}">
        <div class="metric-topline">
          <small>${escapeHtml(metric.label)}</small>
          <span class="metric-icon">${escapeHtml(metric.icon)}</span>
        </div>
        <strong>${escapeHtml(metric.value)}</strong>
        ${delta}
      </div>
    `;
  }

  function renderDashboard() {
    renderDashboardProjectFilter();

    const now = new Date();
    const currentMonth = monthInput(now);
    const previousMonth = monthInput(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const { project: projectFilter } = dashboardFilters();
    const matchProject = (item) => projectFilter === 'all' || normalizeText(item.project || '') === normalizeText(projectFilter);

    const scopedRdos = state.rdos.filter((item) => inDashboardScope(item));
    const scopedNcs = state.ncs.filter((item) => inDashboardScope(item));

    const monthRdos = state.rdos.filter((item) => item.date?.startsWith(currentMonth) && matchProject(item)).length;
    const prevMonthRdos = state.rdos.filter((item) => item.date?.startsWith(previousMonth) && matchProject(item)).length;
    let rdoDelta = '';
    let rdoDeltaKind = '';
    if (prevMonthRdos > 0) {
      const percent = Math.round(((monthRdos - prevMonthRdos) / prevMonthRdos) * 100);
      rdoDelta = `${percent >= 0 ? '▲ +' : '▼ '}${percent}% vs mês anterior`;
      rdoDeltaKind = percent >= 0 ? 'up' : 'down';
    } else if (monthRdos > 0) {
      rdoDelta = 'Primeiro mês com lançamentos';
      rdoDeltaKind = 'up';
    }

    const openNcs = scopedNcs.filter((item) => normalizeText(item.status) !== 'fechada');
    const criticalNcs = openNcs.filter((item) => normalizeText(item.severity) === 'critica').length;
    const lateNcs = openNcs.filter((item) => item.deadline && new Date(`${item.deadline}T23:59:59`) < now).length;
    let ncDetail = openNcs.length ? `${criticalNcs} crítica${criticalNcs === 1 ? '' : 's'}` : 'Nada pendente';
    if (lateNcs) ncDetail += ` • ${lateNcs} com prazo vencido`;

    const expensesThisMonth = state.expenses.filter((item) => item.date?.startsWith(currentMonth)).reduce((sum, item) => sum + Number(item.value || 0), 0)
      + state.vehicleCosts.filter((item) => item.date?.startsWith(currentMonth)).reduce((sum, item) => sum + Number(item.value || 0), 0);
    const monthTotals = lastMonths(6).map((month) => monthlySpendTotal(month));
    const historicalMonths = monthTotals.slice(0, 5).filter((value) => value > 0);
    const averageSpend = historicalMonths.length ? historicalMonths.reduce((sum, value) => sum + value, 0) / historicalMonths.length : 0;
    let spendDelta = '';
    let spendKind = '';
    if (averageSpend > 0) {
      const percent = Math.round(((expensesThisMonth - averageSpend) / averageSpend) * 100);
      if (percent > 10) {
        spendDelta = `⚠ ${percent}% acima da média`;
        spendKind = 'warn';
      } else if (percent < -10) {
        spendDelta = `▼ ${Math.abs(percent)}% abaixo da média`;
        spendKind = 'up';
      } else {
        spendDelta = 'Dentro da média dos últimos meses';
        spendKind = 'neutral';
      }
    }

    const totalRdoScoped = scopedRdos.length;
    const doneRdoScoped = scopedRdos.filter((item) => normalizeText(item.status) === 'concluido').length;
    const donePercent = totalRdoScoped ? Math.round((doneRdoScoped / totalRdoScoped) * 100) : 0;
    const interrupted = scopedRdos.filter((item) => normalizeText(item.status) === 'interrompido').length;

    const totalVisits = state.teamMembers.reduce((sum, item) => sum + Number(item.visitCount || 0), 0);
    const pendingReminders = state.agendaItems.filter((item) => item.status !== 'Concluído' && new Date(item.dateTime) >= now).length;

    const staleLimit = new Date(now);
    staleLimit.setDate(staleLimit.getDate() - 15);
    const activeGroups = new Map();
    state.teamMembers.filter((member) => member.status === 'Ativo').forEach((member) => {
      const group = member.group || member.name;
      const visitDate = member.lastVisitDate ? new Date(`${member.lastVisitDate}T00:00:00`) : null;
      const current = activeGroups.get(group);
      if (!current || (visitDate && (!current.visitDate || visitDate > current.visitDate))) {
        activeGroups.set(group, { visitDate });
      }
    });
    const staleTeams = [...activeGroups.values()].filter((entry) => !entry.visitDate || entry.visitDate < staleLimit).length;

    const metrics = [
      { label: 'RDOs no mês', value: monthRdos, icon: 'RDO', delta: rdoDelta, deltaKind: rdoDeltaKind },
      { label: 'NCs abertas', value: openNcs.length, icon: 'NC', delta: ncDetail, deltaKind: lateNcs || criticalNcs ? 'down' : 'neutral', alert: openNcs.length > 0 },
      { label: 'Gastos do mês', value: currency(expensesThisMonth), icon: 'R$', delta: spendDelta, deltaKind: spendKind },
      { label: 'Dias concluídos', value: `${donePercent}%`, icon: '%', delta: interrupted ? `${interrupted} dia${interrupted === 1 ? '' : 's'} interrompido${interrupted === 1 ? '' : 's'}` : 'Nenhuma interrupção no período', deltaKind: interrupted ? 'warn' : 'up' },
      { label: 'Visitas às equipes', value: totalVisits, icon: 'VS', delta: staleTeams ? `${staleTeams} equipe${staleTeams === 1 ? '' : 's'} sem visita há 15+ dias` : 'Todas visitadas recentemente', deltaKind: staleTeams ? 'warn' : 'up', alert: staleTeams > 0 },
      { label: 'Lembretes pendentes', value: pendingReminders, icon: 'AG', delta: '', deltaKind: '' },
    ];

    elements.metricsGrid.innerHTML = metrics.map(metricCard).join('');

    elements.upcomingReminders.innerHTML = upcomingAgendaItems(5).map((item) => `
      <div class="stack-item">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${formatDateTime(item.dateTime)} • ${escapeHtml(item.priority)}</small>
      </div>
    `).join('') || '<p class="empty-state">Nenhum lembrete pendente.</p>';

    const openRdos = state.rdos.filter((item) => normalizeText(item.status) !== 'concluido').length;
    const totalExpenses = state.expenses.reduce((sum, item) => sum + Number(item.value || 0), 0) + state.vehicleCosts.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const totalTeams = new Set(state.teamMembers.map((item) => item.group || 'Sem equipe')).size;
    elements.dashboardSummary.innerHTML = [
      { title: 'RDOs em aberto', value: openRdos, detail: 'Lançamentos ainda não concluídos.' },
      { title: 'Total acumulado de gastos', value: currency(totalExpenses), detail: 'Despesas gerais somadas ao veículo.' },
      { title: 'Frentes / equipes', value: totalTeams, detail: 'Equipes ou frentes cadastradas no sistema.' },
      { title: 'NCs registradas', value: state.ncs.length, detail: 'Total histórico de não conformidades.' },
    ].map((item) => `
      <div class="stack-item">
        <strong class="summary-number">${escapeHtml(item.value)}</strong>
        <small><strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(item.detail)}</small>
      </div>
    `).join('');

    elements.recentRdoTable.innerHTML = sortByDateDesc(state.rdos).slice(0, 6).map((rdo) => `
      <tr>
        <td data-label="Data">${formatDate(rdo.date)}</td>
        <td data-label="Frente/Obra">${escapeHtml(rdo.project)}</td>
        <td data-label="Local">${escapeHtml(rdo.location || '-')}</td>
        <td data-label="Status">${statusBadge(rdo.status)}</td>
        <td data-label="Responsável">${escapeHtml(rdo.createdBy || '-')}</td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="empty-state">Nenhum RDO lançado ainda.</td></tr>';

    updateNcNavBadge();
    renderQualitySemaphore();
    drawRdoChart(scopedRdos);
    drawExpensesChart();
    drawExpensesCategoryChart();
    drawTeamVisitsChart();
    drawNcParetoChart(scopedNcs);
    drawWeatherChart(scopedRdos);
  }

  function renderQualitySemaphore() {
    const container = $('#qualitySemaphore');
    if (!container) return;
    if (!state.projects.length) {
      container.innerHTML = '<p class="empty-state">Cadastre frentes/obras (na aba RDO) para acompanhar o semáforo de qualidade.</p>';
      return;
    }
    container.innerHTML = state.projects.map((project) => {
      const ncsForProject = state.ncs.filter((nc) => normalizeText(nc.project) === normalizeText(project.name));
      const openNcs = ncsForProject.filter((nc) => normalizeText(nc.status) !== 'fechada');
      const criticalOpen = openNcs.filter((nc) => normalizeText(nc.severity) === 'critica').length;
      const lateOpen = openNcs.filter(ncIsLate).length;
      let level = 'ok';
      let label = 'Em dia';
      if (criticalOpen > 0 || lateOpen > 0) {
        level = 'danger';
        label = 'Atenção urgente';
      } else if (openNcs.length > 0) {
        level = 'warn';
        label = 'Acompanhar';
      }
      const detailParts = [`${openNcs.length} NC${openNcs.length === 1 ? '' : 's'} aberta${openNcs.length === 1 ? '' : 's'}`];
      if (criticalOpen) detailParts.push(`${criticalOpen} crítica${criticalOpen === 1 ? '' : 's'}`);
      if (lateOpen) detailParts.push(`${lateOpen} vencida${lateOpen === 1 ? '' : 's'}`);
      return `
        <div class="semaphore-item semaphore-${level}">
          <span class="semaphore-dot"></span>
          <div>
            <strong>${escapeHtml(project.name)}</strong>
            <small>${label} • ${detailParts.join(' • ')}</small>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderDashboardProjectFilter() {
    const select = $('#dashProjectFilter');
    if (!select) return;
    const current = select.value || 'all';
    select.innerHTML = ['<option value="all">Todas as frentes</option>', ...state.projects.map((project) => `<option value="${escapeHtml(project.name)}">${escapeHtml(project.name)}</option>`)].join('');
    select.value = [...select.options].some((option) => option.value === current) ? current : 'all';
  }

  function lastMonths(count) {
    const months = [];
    const base = new Date();
    for (let index = count - 1; index >= 0; index -= 1) {
      months.push(monthInput(new Date(base.getFullYear(), base.getMonth() - index, 1)));
    }
    return months;
  }

  function monthlySpendTotal(month) {
    const general = state.expenses.filter((item) => item.date?.startsWith(month)).reduce((sum, item) => sum + Number(item.value || 0), 0);
    const vehicle = state.vehicleCosts.filter((item) => item.date?.startsWith(month)).reduce((sum, item) => sum + Number(item.value || 0), 0);
    return general + vehicle;
  }

  function updateNcNavBadge() {
    const badge = $('#ncNavBadge');
    if (!badge) return;
    const open = state.ncs.filter((item) => normalizeText(item.status) !== 'fechada').length;
    badge.textContent = open;
    badge.hidden = open === 0;
  }

  function upcomingAgendaItems(limit = 10) {
    const now = new Date();
    return [...state.agendaItems]
      .filter((item) => item.status !== 'Concluído' && new Date(item.dateTime) >= now)
      .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
      .slice(0, limit);
  }

  function statusBadge(status) {
    const normalized = normalizeText(status);
    let kind = 'warn';
    if (normalized.includes('concluido') || normalized.includes('ativo') || normalized.includes('fechada')) kind = 'ok';
    if (normalized.includes('interrompido') || normalized.includes('critica') || normalized.includes('desligado') || normalized.includes('aberta')) kind = 'danger';
    if (normalized.includes('tratativa') || normalized.includes('andamento')) kind = 'info';
    return `<span class="badge ${kind}">${escapeHtml(status || '-')}</span>`;
  }

  function severityBadge(severity) {
    const normalized = normalizeText(severity);
    let kind = 'ok';
    if (normalized === 'media') kind = 'warn';
    if (normalized === 'critica') kind = 'danger';
    return `<span class="badge ${kind}">${escapeHtml(severity || '-')}</span>`;
  }

  function isoWeekLabel(dateStr) {
    const date = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    const target = new Date(date.valueOf());
    target.setDate(target.getDate() - ((date.getDay() + 6) % 7) + 3);
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
    const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 3600 * 1000));
    return { key: `${target.getFullYear()}-S${pad(week)}`, label: `Sem ${pad(week)}` };
  }

  function drawRdoChart(scopedRdos = state.rdos) {
    const theme = chartTheme();
    const statuses = [
      { name: 'Concluído', color: '#06d6a0' },
      { name: 'Em andamento', color: '#3a86ff' },
      { name: 'Pendente', color: '#ffbe0b' },
      { name: 'Interrompido', color: '#ff006e' },
    ];

    const weeks = new Map();
    scopedRdos.forEach((rdo) => {
      const info = rdo.date ? isoWeekLabel(rdo.date) : null;
      if (!info) return;
      if (!weeks.has(info.key)) weeks.set(info.key, { label: info.label, counts: {} });
      const bucket = weeks.get(info.key);
      const statusKey = normalizeText(rdo.status);
      bucket.counts[statusKey] = (bucket.counts[statusKey] || 0) + 1;
    });

    const orderedKeys = [...weeks.keys()].sort().slice(-8);
    const labels = orderedKeys.length ? orderedKeys.map((key) => weeks.get(key).label) : ['Sem dados'];
    const datasets = statuses.map((status) => ({
      label: status.name,
      data: orderedKeys.length ? orderedKeys.map((key) => weeks.get(key).counts[normalizeText(status.name)] || 0) : [0],
      backgroundColor: status.color,
      borderRadius: 4,
      maxBarThickness: 34,
    }));

    upsertChart('rdo', '#rdoChart', {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: theme.text, boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: theme.text } },
          y: { stacked: true, grid: { color: theme.grid }, ticks: { color: theme.text, precision: 0 } },
        },
      },
    });
  }

  function drawExpensesChart() {
    const theme = chartTheme();
    const months = lastMonths(6);
    const labels = months.map((month) => month.split('-').reverse().join('/'));
    const generalValues = months.map((month) => state.expenses.filter((item) => item.date?.startsWith(month)).reduce((sum, item) => sum + Number(item.value || 0), 0));
    const vehicleValues = months.map((month) => state.vehicleCosts.filter((item) => item.date?.startsWith(month)).reduce((sum, item) => sum + Number(item.value || 0), 0));
    const totals = months.map((month, index) => generalValues[index] + vehicleValues[index]);

    upsertChart('expenses', '#expensesChart', {
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Despesas gerais',
            data: generalValues,
            backgroundColor: 'rgba(131, 56, 236, 0.85)',
            hoverBackgroundColor: '#8338ec',
            borderRadius: 6,
            maxBarThickness: 40,
            stack: 'gastos',
            order: 2,
          },
          {
            type: 'bar',
            label: 'Veículo',
            data: vehicleValues,
            backgroundColor: 'rgba(255, 0, 110, 0.85)',
            hoverBackgroundColor: '#ff006e',
            borderRadius: 6,
            maxBarThickness: 40,
            stack: 'gastos',
            order: 2,
          },
          {
            type: 'line',
            label: 'Total do mês',
            data: totals,
            borderColor: '#f3c229',
            backgroundColor: '#f3c229',
            borderWidth: 3,
            tension: 0.35,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#f3c229',
            pointBorderColor: theme.surface,
            pointBorderWidth: 2,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: theme.text, boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${currency(context.parsed.y)}` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: theme.text } },
          y: { stacked: true, grid: { color: theme.grid }, ticks: { color: theme.text, callback: (value) => currency(value) } },
        },
      },
    });
  }

  function drawExpensesCategoryChart() {
    const theme = chartTheme();
    const { period } = dashboardFilters();
    const start = periodStartDate(period);
    const inPeriod = (item) => {
      if (!start) return true;
      if (!item.date) return false;
      return new Date(`${item.date}T00:00:00`) >= start;
    };

    const grouped = {};
    state.expenses.filter(inPeriod).forEach((item) => {
      const key = item.category || 'Outros';
      grouped[key] = (grouped[key] || 0) + Number(item.value || 0);
    });
    state.vehicleCosts.filter(inPeriod).forEach((item) => {
      const key = `Veículo: ${item.type || 'Outros'}`;
      grouped[key] = (grouped[key] || 0) + Number(item.value || 0);
    });

    const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const labels = entries.length ? entries.map(([label]) => label) : ['Sem dados'];
    const values = entries.length ? entries.map(([, value]) => value) : [1];
    const colors = ['#ff006e', '#3a86ff', '#ffbe0b', '#8338ec', '#06d6a0', '#fb5607', '#00b4d8'];

    upsertChart('expensesCategory', '#expensesCategoryChart', {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderColor: theme.surface, borderWidth: 2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { color: theme.text, boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (context) => `${context.label}: ${entries.length ? currency(context.parsed) : 'sem lançamentos'}` } },
        },
      },
    });
  }

  function drawTeamVisitsChart() {
    const theme = chartTheme();
    const grouped = {};
    state.teamMembers.forEach((item) => {
      const key = item.group || 'Sem equipe';
      grouped[key] = (grouped[key] || 0) + Number(item.visitCount || 0);
    });
    const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const labels = entries.length ? entries.map(([label]) => label) : ['Sem dados'];
    const values = entries.length ? entries.map(([, value]) => value) : [0];

    upsertChart('teamVisits', '#teamVisitsChart', {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Visitas', data: values, backgroundColor: ['#8338ec', '#ff006e', '#3a86ff', '#06d6a0', '#ffbe0b', '#fb5607'], borderRadius: 6, maxBarThickness: 30 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: theme.grid }, ticks: { color: theme.text, precision: 0 } },
          y: { grid: { display: false }, ticks: { color: theme.text } },
        },
      },
    });
  }

  function drawNcParetoChart(scopedNcs = state.ncs) {
    const theme = chartTheme();
    const grouped = {};
    scopedNcs.forEach((item) => {
      const key = item.project || 'Sem frente';
      grouped[key] = (grouped[key] || 0) + 1;
    });
    const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const labels = entries.length ? entries.map(([label]) => label) : ['Sem dados'];
    const values = entries.length ? entries.map(([, value]) => value) : [0];
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    let running = 0;
    const cumulative = values.map((value) => {
      running += value;
      return Math.round((running / total) * 100);
    });

    upsertChart('ncPareto', '#ncParetoChart', {
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'NCs', data: values, backgroundColor: '#ff006e', borderRadius: 6, maxBarThickness: 34, order: 2 },
          { type: 'line', label: '% acumulado', data: cumulative, borderColor: '#ffbe0b', backgroundColor: '#ffbe0b', borderWidth: 3, pointRadius: 5, order: 1, yAxisID: 'percent' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: theme.text, boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: theme.text } },
          y: { grid: { color: theme.grid }, ticks: { color: theme.text, precision: 0 } },
          percent: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { color: theme.text, callback: (value) => `${value}%` } },
        },
      },
    });
  }

  const WEATHER_ORDER = ['Sol', 'Nublado', 'Chuva', 'Frio', 'Calor intenso'];

  function drawWeatherChart(scopedRdos = state.rdos) {
    const theme = chartTheme();
    const totals = {};
    const interrupted = {};
    scopedRdos.forEach((rdo) => {
      const weather = rdo.weather || 'Não informado';
      totals[weather] = (totals[weather] || 0) + 1;
      if (normalizeText(rdo.status) === 'interrompido') interrupted[weather] = (interrupted[weather] || 0) + 1;
    });
    const labels = Object.keys(totals).sort((a, b) => WEATHER_ORDER.indexOf(a) - WEATHER_ORDER.indexOf(b));

    upsertChart('weather', '#weatherChart', {
      type: 'bar',
      data: {
        labels: labels.length ? labels : ['Sem dados'],
        datasets: [
          { label: 'Total de dias', data: labels.length ? labels.map((label) => totals[label] || 0) : [0], backgroundColor: '#00b4d8', borderRadius: 6, maxBarThickness: 28 },
          { label: 'Dias interrompidos', data: labels.length ? labels.map((label) => interrupted[label] || 0) : [0], backgroundColor: '#ff006e', borderRadius: 6, maxBarThickness: 28 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: theme.text, boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: theme.text } },
          y: { grid: { color: theme.grid }, ticks: { color: theme.text, precision: 0 } },
        },
      },
    });
  }

  function prefillNewRdo() {
    const last = sortByDateDesc(state.rdos)[0];
    if (!last) return;
    const projectField = $('#rdoProject');
    const locationField = $('#rdoLocation');
    if (projectField && last.project) projectField.value = last.project;
    if (locationField && last.location) locationField.value = last.location;
  }

  function setupRdo() {
    $('#rdoDate').value = todayInput();
    prefillNewRdo();

    $('#rdoForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!assertCanEdit()) return;
      const id = $('#rdoId').value || uid('rdo');
      const existing = state.rdos.find((item) => item.id === id);
      const attachments = await readAttachments($('#rdoAttachment'), existing?.attachments || [], true);
      const rdo = {
        id,
        date: $('#rdoDate').value,
        shift: $('#rdoShift').value,
        project: $('#rdoProject').value.trim(),
        location: $('#rdoLocation').value.trim(),
        weather: $('#rdoWeather').value,
        status: $('#rdoStatus').value,
        activities: $('#rdoActivities').value.trim(),
        issues: $('#rdoIssues').value.trim(),
        quality: $('#rdoQuality').value.trim(),
        attachments,
        createdBy: existing?.createdBy || currentUserStamp(),
        updatedBy: currentUserStamp(),
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      upsert('rdos', rdo);
      event.target.reset();
      $('#rdoId').value = '';
      $('#rdoDate').value = todayInput();
      prefillNewRdo();
      renderAll();
      toast('RDO salvo com sucesso.');
    });

    $('#clearRdoForm').addEventListener('click', () => {
      $('#rdoForm').reset();
      $('#rdoId').value = '';
      $('#rdoDate').value = todayInput();
      prefillNewRdo();
    });

    $('#rdoSearch').addEventListener('input', renderRdoTable);
    $('#exportRdoCsv').addEventListener('click', () => exportCsv('rdos.csv', state.rdos));

    $('#rdoTable').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const id = button.dataset.id;
      const rdo = state.rdos.find((item) => item.id === id);
      if (!rdo) return;
      if (button.dataset.action === 'view-rdo') viewRdo(rdo);
      if (button.dataset.action === 'edit-rdo') editRdo(rdo);
      if (button.dataset.action === 'delete-rdo') removeItem('rdos', id, 'RDO excluído.');
    });
  }

  function renderRdoTable() {
    const query = normalizeText($('#rdoSearch')?.value);
    const list = sortByDateDesc(state.rdos).filter((rdo) => {
      const searchable = normalizeText([rdo.date, rdo.project, rdo.location, rdo.status, rdo.createdBy].join(' '));
      return searchable.includes(query);
    });

    $('#rdoTable').innerHTML = list.map((rdo) => `
      <tr>
        <td data-label="Data">${formatDate(rdo.date)}<br><small>${escapeHtml(rdo.shift)}</small></td>
        <td data-label="Frente/Obra">${escapeHtml(rdo.project)}</td>
        <td data-label="Local">${escapeHtml(rdo.location || '-')}</td>
        <td data-label="Status">${statusBadge(rdo.status)}</td>
        <td data-label="Anexos">${attachmentBadge(rdo.attachments)}</td>
        <td data-label="Ações">
          <div class="row-actions">
            <button class="icon-btn" data-action="view-rdo" data-id="${rdo.id}">Ver</button>
            <button class="icon-btn" data-action="edit-rdo" data-id="${rdo.id}">Editar</button>
            <button class="icon-btn danger" data-action="delete-rdo" data-id="${rdo.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="empty-state">Nenhum RDO encontrado.</td></tr>';
  }

  function viewRdo(rdo) {
    openModal(`RDO - ${formatDate(rdo.date)}`, `
      <div class="detail-grid">
        <p><strong>Frente/Obra</strong>${escapeHtml(rdo.project)}</p>
        <p><strong>Local</strong>${escapeHtml(rdo.location || '-')}</p>
        <p><strong>Turno / Clima / Status</strong>${escapeHtml(rdo.shift)} • ${escapeHtml(rdo.weather)} • ${escapeHtml(rdo.status)}</p>
        <p><strong>Atividades executadas</strong>${escapeHtml(rdo.activities || '-')}</p>
        <p><strong>Ocorrências / Não conformidades</strong>${escapeHtml(rdo.issues || '-')}</p>
        <p><strong>Segurança e qualidade</strong>${escapeHtml(rdo.quality || '-')}</p>
        <p><strong>Anexos</strong>${renderAttachmentLinks(rdo.attachments)}</p>
        <p><strong>Atualizado por</strong>${escapeHtml(rdo.updatedBy || rdo.createdBy || '-')}</p>
      </div>
    `);
  }

  function editRdo(rdo) {
    openTab('rdo');
    ensureProjectOption(rdo.project);
    $('#rdoId').value = rdo.id;
    $('#rdoDate').value = rdo.date || todayInput();
    $('#rdoShift').value = rdo.shift || 'Diurno';
    $('#rdoProject').value = rdo.project || '';
    $('#rdoLocation').value = rdo.location || '';
    $('#rdoWeather').value = rdo.weather || 'Sol';
    $('#rdoStatus').value = rdo.status || 'Em andamento';
    $('#rdoActivities').value = rdo.activities || '';
    $('#rdoIssues').value = rdo.issues || '';
    $('#rdoQuality').value = rdo.quality || '';
    toast('RDO carregado para edição. Se anexar novos arquivos, eles serão somados aos atuais.');
  }

  function projectNames() {
    return state.projects.map((project) => project.name);
  }

  function renderProjectSelects() {
    const options = projectNames().map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    ['#rdoProject', '#ncProject'].forEach((selector) => {
      const select = $(selector);
      if (!select) return;
      const current = select.value;
      select.innerHTML = `<option value="">Selecione a frente...</option>${options}`;
      if (current && projectNames().some((name) => name === current)) select.value = current;
    });
    renderDashboardProjectFilter();
  }

  function ensureProjectOption(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    if (!state.projects.some((project) => normalizeText(project.name) === normalizeText(trimmed))) {
      state.projects.push({ id: uid('prj'), name: trimmed, createdAt: new Date().toISOString() });
      state.projects.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      saveState();
    }
    renderProjectSelects();
    const select = $('#rdoProject');
    if (select) select.value = trimmed;
  }

  function addProject(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    if (state.projects.some((project) => normalizeText(project.name) === normalizeText(trimmed))) {
      toast('Essa frente já está cadastrada.');
      return false;
    }
    const project = { id: uid('prj'), name: trimmed, createdAt: new Date().toISOString() };
    state.projects.push(project);
    state.projects.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    saveState();
    saveRemote('projects', project);
    renderProjectSelects();
    renderProjectList();
    toast(`Frente "${trimmed}" cadastrada.`);
    return true;
  }

  function renderProjectList() {
    const container = $('#projectList');
    if (!container) return;
    if (!state.projects.length) {
      container.innerHTML = '<p class="empty-state">Nenhuma frente cadastrada ainda. As frentes usadas nos RDOs antigos são importadas automaticamente.</p>';
      return;
    }
    container.innerHTML = state.projects.map((project) => {
      const usage = state.rdos.filter((rdo) => normalizeText(rdo.project) === normalizeText(project.name)).length;
      return `
        <span class="chip">
          ${escapeHtml(project.name)}
          <small>${usage} RDO${usage === 1 ? '' : 's'}</small>
          <button type="button" class="chip-remove" data-project-id="${project.id}" title="Remover frente">×</button>
        </span>
      `;
    }).join('');
  }

  function setupProjects() {
    $('#projectForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!assertCanEdit()) return;
      if (addProject($('#projectName').value)) $('#projectName').value = '';
    });

    $('#addProjectQuick')?.addEventListener('click', () => {
      if (!assertCanEdit()) return;
      const name = prompt('Nome da nova frente / obra:');
      if (!name) return;
      if (addProject(name)) {
        const select = $('#rdoProject');
        if (select) select.value = name.trim();
      }
    });

    $('#projectList')?.addEventListener('click', (event) => {
      const button = event.target.closest('.chip-remove');
      if (!button) return;
      if (!assertCanEdit()) return;
      const project = state.projects.find((item) => item.id === button.dataset.projectId);
      if (!project) return;
      const usage = state.rdos.filter((rdo) => normalizeText(rdo.project) === normalizeText(project.name)).length
        + state.ncs.filter((nc) => normalizeText(nc.project) === normalizeText(project.name)).length;
      const message = usage
        ? `A frente "${project.name}" está em uso em ${usage} registro(s). Os registros existentes não serão alterados. Remover mesmo assim?`
        : `Remover a frente "${project.name}"?`;
      if (!confirm(message)) return;
      state.projects = state.projects.filter((item) => item.id !== project.id);
      saveState();
      deleteRemote('projects', project.id);
      renderProjectSelects();
      renderProjectList();
      toast('Frente removida.');
    });

    renderProjectSelects();
    renderProjectList();
  }

  function setupNcs() {
    $('#ncDate').value = todayInput();

    $('#ncForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!assertCanEdit()) return;
      const id = $('#ncId').value || uid('nc');
      const existing = state.ncs.find((item) => item.id === id);
      const attachments = await readAttachments($('#ncAttachment'), existing?.attachments || [], true);
      const status = $('#ncStatus').value;
      const nc = {
        id,
        date: $('#ncDate').value,
        project: $('#ncProject').value,
        type: $('#ncType').value,
        severity: $('#ncSeverity').value,
        responsible: $('#ncResponsible').value.trim(),
        deadline: $('#ncDeadline').value,
        status,
        description: $('#ncDescription').value.trim(),
        action: $('#ncAction').value.trim(),
        attachments,
        closedAt: normalizeText(status) === 'fechada' ? (existing?.closedAt || new Date().toISOString()) : null,
        createdBy: existing?.createdBy || currentUserStamp(),
        updatedBy: currentUserStamp(),
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      upsert('ncs', nc);
      event.target.reset();
      $('#ncId').value = '';
      $('#ncDate').value = todayInput();
      renderAll();
      toast('Não conformidade salva.');
    });

    $('#clearNcForm').addEventListener('click', () => {
      $('#ncForm').reset();
      $('#ncId').value = '';
      $('#ncDate').value = todayInput();
    });

    $('#ncSearch').addEventListener('input', renderNcTable);
    $('#ncFilter').addEventListener('change', renderNcTable);
    $('#exportNcCsv').addEventListener('click', () => exportCsv('nao-conformidades.csv', state.ncs));

    $('#ncTable').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const nc = state.ncs.find((item) => item.id === button.dataset.id);
      if (!nc) return;
      if (button.dataset.action === 'view-nc') viewNc(nc);
      if (button.dataset.action === 'edit-nc') editNc(nc);
      if (button.dataset.action === 'close-nc') closeNc(nc);
      if (button.dataset.action === 'delete-nc') removeItem('ncs', nc.id, 'Não conformidade excluída.');
    });
  }

  function ncIsLate(nc) {
    return normalizeText(nc.status) !== 'fechada' && nc.deadline && new Date(`${nc.deadline}T23:59:59`) < new Date();
  }

  function renderNcMetrics() {
    const grid = $('#ncMetricsGrid');
    if (!grid) return;
    const open = state.ncs.filter((item) => normalizeText(item.status) === 'aberta').length;
    const inProgress = state.ncs.filter((item) => normalizeText(item.status) === 'em tratativa').length;
    const late = state.ncs.filter(ncIsLate).length;
    const closed = state.ncs.filter((item) => normalizeText(item.status) === 'fechada');
    const closeDays = closed
      .filter((item) => item.closedAt && item.date)
      .map((item) => Math.max(0, (new Date(item.closedAt) - new Date(`${item.date}T00:00:00`)) / (24 * 3600 * 1000)));
    const averageClose = closeDays.length ? Math.round(closeDays.reduce((sum, value) => sum + value, 0) / closeDays.length) : null;

    grid.innerHTML = [
      { label: 'Abertas', value: open, icon: 'NC', alert: open > 0 },
      { label: 'Em tratativa', value: inProgress, icon: '→' },
      { label: 'Prazo vencido', value: late, icon: '!', alert: late > 0 },
      { label: 'Tempo médio de fechamento', value: averageClose === null ? '-' : `${averageClose} dia${averageClose === 1 ? '' : 's'}`, icon: '⏱' },
    ].map(metricCard).join('');
  }

  function renderNcTable() {
    renderNcMetrics();
    updateNcNavBadge();
    const table = $('#ncTable');
    if (!table) return;
    const query = normalizeText($('#ncSearch')?.value);
    const filter = $('#ncFilter')?.value || 'all';

    const list = sortByDateDesc(state.ncs).filter((nc) => {
      const searchable = normalizeText([nc.date, nc.project, nc.type, nc.severity, nc.responsible, nc.status, nc.description].join(' '));
      if (query && !searchable.includes(query)) return false;
      if (filter === 'open') return normalizeText(nc.status) === 'aberta';
      if (filter === 'progress') return normalizeText(nc.status) === 'em tratativa';
      if (filter === 'closed') return normalizeText(nc.status) === 'fechada';
      if (filter === 'late') return ncIsLate(nc);
      return true;
    });

    table.innerHTML = list.map((nc) => `
      <tr>
        <td data-label="Data">${formatDate(nc.date)}</td>
        <td data-label="Frente/Obra">${escapeHtml(nc.project || '-')}</td>
        <td data-label="Tipo">${escapeHtml(nc.type || '-')}</td>
        <td data-label="Severidade">${severityBadge(nc.severity)}</td>
        <td data-label="Responsável">${escapeHtml(nc.responsible || '-')}</td>
        <td data-label="Prazo">${nc.deadline ? `${formatDate(nc.deadline)}${ncIsLate(nc) ? ' <span class="badge danger">Vencido</span>' : ''}` : '-'}</td>
        <td data-label="Status">${statusBadge(nc.status)}</td>
        <td data-label="Ações">
          <div class="row-actions">
            <button class="icon-btn" data-action="view-nc" data-id="${nc.id}">Ver</button>
            <button class="icon-btn" data-action="edit-nc" data-id="${nc.id}">Editar</button>
            ${normalizeText(nc.status) !== 'fechada' ? `<button class="icon-btn" data-action="close-nc" data-id="${nc.id}">Fechar</button>` : ''}
            <button class="icon-btn danger" data-action="delete-nc" data-id="${nc.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="8" class="empty-state">Nenhuma não conformidade registrada.</td></tr>';
  }

  function closeNc(nc) {
    if (!assertCanEdit()) return;
    if (!confirm(`Fechar a NC de ${formatDate(nc.date)} (${nc.project || 'sem frente'})?`)) return;
    const updated = {
      ...nc,
      status: 'Fechada',
      closedAt: new Date().toISOString(),
      updatedBy: currentUserStamp(),
      updatedAt: new Date().toISOString(),
    };
    upsert('ncs', updated);
    renderAll();
    toast('Não conformidade fechada.');
  }

  function viewNc(nc) {
    openModal(`NC - ${formatDate(nc.date)}`, `
      <div class="detail-grid">
        <p><strong>Frente/Obra</strong>${escapeHtml(nc.project || '-')}</p>
        <p><strong>Tipo / Severidade</strong>${escapeHtml(nc.type || '-')} • ${escapeHtml(nc.severity || '-')}</p>
        <p><strong>Status</strong>${escapeHtml(nc.status || '-')}${nc.closedAt ? ` (fechada em ${formatDate(nc.closedAt.slice(0, 10))})` : ''}</p>
        <p><strong>Responsável / Prazo</strong>${escapeHtml(nc.responsible || '-')} • ${nc.deadline ? formatDate(nc.deadline) : 'sem prazo'}</p>
        <p><strong>Descrição</strong>${escapeHtml(nc.description || '-')}</p>
        <p><strong>Ação corretiva</strong>${escapeHtml(nc.action || '-')}</p>
        <p><strong>Evidências</strong>${renderAttachmentLinks(nc.attachments)}</p>
        <p><strong>Atualizado por</strong>${escapeHtml(nc.updatedBy || nc.createdBy || '-')}</p>
      </div>
    `);
  }

  function editNc(nc) {
    openTab('ncs');
    renderProjectSelects();
    $('#ncId').value = nc.id;
    $('#ncDate').value = nc.date || todayInput();
    $('#ncProject').value = nc.project || '';
    $('#ncType').value = nc.type || 'Execução';
    $('#ncSeverity').value = nc.severity || 'Leve';
    $('#ncResponsible').value = nc.responsible || '';
    $('#ncDeadline').value = nc.deadline || '';
    $('#ncStatus').value = nc.status || 'Aberta';
    $('#ncDescription').value = nc.description || '';
    $('#ncAction').value = nc.action || '';
    toast('NC carregada para edição. Novos anexos serão somados aos atuais.');
  }

  function setupExpenses() {
    $('#expenseDate').value = todayInput();
    $('#expenseMonthFilter').value = monthInput();

    $('#expenseForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!assertCanEdit()) return;
      const id = $('#expenseId').value || uid('exp');
      const existing = state.expenses.find((item) => item.id === id);
      const attachments = await readAttachments($('#expenseAttachment'), existing?.attachments || [], false);
      const expense = {
        id,
        date: $('#expenseDate').value,
        category: $('#expenseCategory').value,
        supplier: $('#expenseSupplier').value.trim(),
        value: Number($('#expenseValue').value || 0),
        payment: $('#expensePayment').value,
        description: $('#expenseDescription').value.trim(),
        attachments,
        createdBy: existing?.createdBy || currentUserStamp(),
        updatedBy: currentUserStamp(),
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      upsert('expenses', expense);
      event.target.reset();
      $('#expenseId').value = '';
      $('#expenseDate').value = todayInput();
      renderAll();
      toast('Despesa salva com sucesso.');
    });

    $('#expenseMonthFilter').addEventListener('change', renderExpenseTable);
    $('#exportExpenseCsv').addEventListener('click', () => exportCsv('despesas.csv', state.expenses));

    $('#expenseTable').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const item = state.expenses.find((expense) => expense.id === button.dataset.id);
      if (!item) return;
      if (button.dataset.action === 'edit-expense') editExpense(item);
      if (button.dataset.action === 'delete-expense') removeItem('expenses', item.id, 'Despesa excluída.');
      if (button.dataset.action === 'view-expense') viewExpense(item);
    });
  }

  function renderExpenseTable() {
    const month = $('#expenseMonthFilter')?.value || monthInput();
    const list = sortByDateDesc(state.expenses).filter((expense) => !month || expense.date?.startsWith(month));
    const total = list.reduce((sum, expense) => sum + Number(expense.value || 0), 0);
    $('#expenseMonthTotal').textContent = currency(total);
    $('#expenseTable').innerHTML = list.map((expense) => `
      <tr>
        <td data-label="Data">${formatDate(expense.date)}</td>
        <td data-label="Categoria">${escapeHtml(expense.category)}</td>
        <td data-label="Fornecedor">${escapeHtml(expense.supplier || '-')}</td>
        <td data-label="Valor"><strong>${currency(expense.value)}</strong></td>
        <td data-label="Comprovante">${attachmentBadge(expense.attachments)}</td>
        <td data-label="Ações">
          <div class="row-actions">
            <button class="icon-btn" data-action="view-expense" data-id="${expense.id}">Ver</button>
            <button class="icon-btn" data-action="edit-expense" data-id="${expense.id}">Editar</button>
            <button class="icon-btn danger" data-action="delete-expense" data-id="${expense.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="empty-state">Nenhuma despesa no mês selecionado.</td></tr>';
  }

  function editExpense(expense) {
    $('#expenseId').value = expense.id;
    $('#expenseDate').value = expense.date || todayInput();
    $('#expenseCategory').value = expense.category || 'Outros';
    $('#expenseSupplier').value = expense.supplier || '';
    $('#expenseValue').value = expense.value || '';
    $('#expensePayment').value = expense.payment || 'Pix';
    $('#expenseDescription').value = expense.description || '';
    toast('Despesa carregada para edição.');
  }

  function viewExpense(expense) {
    openModal('Detalhes da despesa', `
      <div class="detail-grid">
        <p><strong>Data</strong>${formatDate(expense.date)}</p>
        <p><strong>Categoria</strong>${escapeHtml(expense.category)}</p>
        <p><strong>Fornecedor</strong>${escapeHtml(expense.supplier || '-')}</p>
        <p><strong>Valor</strong>${currency(expense.value)}</p>
        <p><strong>Pagamento</strong>${escapeHtml(expense.payment || '-')}</p>
        <p><strong>Descrição</strong>${escapeHtml(expense.description || '-')}</p>
        <p><strong>Comprovante</strong>${renderAttachmentLinks(expense.attachments)}</p>
      </div>
    `);
  }

  function setupTeams() {
    $('#teamForm').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!assertCanEdit()) return;
      const id = $('#teamId').value || uid('team');
      const existing = state.teamMembers.find((item) => item.id === id);
      const member = {
        id,
        name: $('#teamName').value.trim(),
        role: $('#teamRole').value.trim(),
        leader: $('#teamLeader').value.trim(),
        group: $('#teamGroup').value.trim(),
        phone: $('#teamPhone').value.trim(),
        status: $('#teamStatus').value,
        lastVisitDate: $('#teamLastVisitDate').value,
        visitCount: Number($('#teamVisitCount').value || 0),
        notes: $('#teamNotes').value.trim(),
        createdBy: existing?.createdBy || currentUserStamp(),
        updatedBy: currentUserStamp(),
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      upsert('teamMembers', member);
      if (member.leader) addLeader(member.leader, { silent: true });
      event.target.reset();
      $('#teamId').value = '';
      renderAll();
      toast('Colaborador salvo com sucesso.');
    });

    $('#teamSearch').addEventListener('input', renderTeamTable);
    $('#exportTeamCsv').addEventListener('click', () => exportCsv('equipes.csv', state.teamMembers));

    $('#teamTable').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const member = state.teamMembers.find((item) => item.id === button.dataset.id);
      if (!member) return;
      if (button.dataset.action === 'edit-team') editTeamMember(member);
      if (button.dataset.action === 'delete-team') removeItem('teamMembers', member.id, 'Colaborador excluído.');
      if (button.dataset.action === 'view-team') viewTeamMember(member);
      if (button.dataset.action === 'log-visit') logVisit(member);
    });

    $('#heatmapGroupFilter')?.addEventListener('change', renderVisitHeatmap);
  }

  function addLeader(name, options = {}) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    if (state.leaders.some((leader) => normalizeText(leader.name) === normalizeText(trimmed))) {
      if (!options.silent) toast('Esse encarregado já está cadastrado.');
      return false;
    }
    const leader = { id: uid('ldr'), name: trimmed, createdAt: new Date().toISOString() };
    state.leaders.push(leader);
    state.leaders.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    saveState();
    saveRemote('leaders', leader);
    renderLeaderList();
    renderLeaderOptions();
    if (!options.silent) toast(`Encarregado "${trimmed}" cadastrado.`);
    return true;
  }

  function renderLeaderList() {
    const container = $('#leaderList');
    if (!container) return;
    if (!state.leaders.length) {
      container.innerHTML = '<p class="empty-state">Nenhum encarregado cadastrado ainda. Os nomes usados nos colaboradores são importados automaticamente.</p>';
      return;
    }
    container.innerHTML = state.leaders.map((leader) => {
      const usage = state.teamMembers.filter((member) => normalizeText(member.leader) === normalizeText(leader.name)).length;
      return `
        <span class="chip">
          ${escapeHtml(leader.name)}
          <small>${usage} colaborador${usage === 1 ? '' : 'es'}</small>
          <button type="button" class="chip-remove" data-leader-id="${leader.id}" title="Remover encarregado">×</button>
        </span>
      `;
    }).join('');
  }

  function renderLeaderOptions() {
    const datalist = $('#leaderOptions');
    if (!datalist) return;
    datalist.innerHTML = state.leaders.map((leader) => `<option value="${escapeHtml(leader.name)}"></option>`).join('');
  }

  function setupLeaders() {
    $('#leaderForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!assertCanEdit()) return;
      if (addLeader($('#leaderName').value)) $('#leaderName').value = '';
    });

    $('#leaderList')?.addEventListener('click', (event) => {
      const button = event.target.closest('.chip-remove');
      if (!button) return;
      if (!assertCanEdit()) return;
      const leader = state.leaders.find((item) => item.id === button.dataset.leaderId);
      if (!leader) return;
      const usage = state.teamMembers.filter((member) => normalizeText(member.leader) === normalizeText(leader.name)).length;
      const message = usage
        ? `O encarregado "${leader.name}" está vinculado a ${usage} colaborador(es). Os registros existentes não serão alterados. Remover mesmo assim?`
        : `Remover o encarregado "${leader.name}"?`;
      if (!confirm(message)) return;
      state.leaders = state.leaders.filter((item) => item.id !== leader.id);
      saveState();
      deleteRemote('leaders', leader.id);
      renderLeaderList();
      renderLeaderOptions();
      toast('Encarregado removido.');
    });

    renderLeaderList();
    renderLeaderOptions();
  }

  function logVisit(member) {
    if (!assertCanEdit()) return;
    const today = todayInput();
    const visit = {
      id: uid('visit'),
      teamMemberId: member.id,
      project: member.group || '',
      date: today,
      notes: '',
      createdBy: currentUserStamp(),
      createdAt: new Date().toISOString(),
    };
    state.visitLogs.push(visit);
    const updatedMember = {
      ...member,
      visitCount: Number(member.visitCount || 0) + 1,
      lastVisitDate: today,
      updatedBy: currentUserStamp(),
      updatedAt: new Date().toISOString(),
    };
    saveState();
    saveRemote('visitLogs', visit);
    upsert('teamMembers', updatedMember);
    renderAll();
    toast(`Visita registrada para ${member.name}.`);
  }

  function renderVisitHeatmapFilterOptions() {
    const select = $('#heatmapGroupFilter');
    if (!select) return;
    const current = select.value || 'all';
    const groups = [...new Set(state.teamMembers.map((member) => member.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    select.innerHTML = ['<option value="all">Todas as equipes</option>', ...groups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`)].join('');
    select.value = [...select.options].some((option) => option.value === current) ? current : 'all';
  }

  function renderVisitHeatmap() {
    renderVisitHeatmapFilterOptions();
    const container = $('#visitHeatmap');
    if (!container) return;
    const groupFilter = $('#heatmapGroupFilter')?.value || 'all';

    const memberGroup = new Map(state.teamMembers.map((member) => [member.id, member.group || '']));
    const relevantLogs = state.visitLogs.filter((log) => {
      if (groupFilter === 'all') return true;
      const group = memberGroup.get(log.teamMemberId) || log.project || '';
      return normalizeText(group) === normalizeText(groupFilter);
    });

    const counts = {};
    relevantLogs.forEach((log) => {
      if (!log.date) return;
      counts[log.date] = (counts[log.date] || 0) + 1;
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 90);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));

    const days = [];
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      days.push(new Date(cursor));
    }
    const weeks = [];
    for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
    const maxCount = Math.max(1, ...Object.values(counts));

    const weeksHtml = weeks.map((week, weekIndex) => {
      const firstDay = week[0];
      const prevWeek = weeks[weekIndex - 1];
      const monthLabel = (!prevWeek || firstDay.getMonth() !== prevWeek[0].getMonth())
        ? firstDay.toLocaleDateString('pt-BR', { month: 'short' })
        : '';
      const cells = week.map((day) => {
        if (day > today) return '<span class="heatmap-cell level-future"></span>';
        const key = todayInput(day);
        const count = counts[key] || 0;
        const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / maxCount) * 4));
        return `<span class="heatmap-cell level-${level}" title="${day.toLocaleDateString('pt-BR')}: ${count} visita${count === 1 ? '' : 's'}"></span>`;
      }).join('');
      return `
        <div class="heatmap-week">
          <small class="heatmap-month">${escapeHtml(monthLabel)}</small>
          <div class="heatmap-days">${cells}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="heatmap-grid">${weeksHtml}</div>
      <div class="heatmap-legend">
        <span>Menos</span>
        <span class="heatmap-cell level-0"></span>
        <span class="heatmap-cell level-1"></span>
        <span class="heatmap-cell level-2"></span>
        <span class="heatmap-cell level-3"></span>
        <span class="heatmap-cell level-4"></span>
        <span>Mais</span>
      </div>
      ${relevantLogs.length ? '' : '<p class="empty-state">Nenhuma visita registrada ainda. Use o botão "Visitar" na lista de colaboradores.</p>'}
    `;
  }

  function renderTeamTable() {
    renderVisitHeatmap();
    const query = normalizeText($('#teamSearch')?.value);
    const list = [...state.teamMembers]
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .filter((member) => normalizeText(Object.values(member).join(' ')).includes(query));

    $('#teamTable').innerHTML = list.map((member) => `
      <tr>
        <td data-label="Nome">${escapeHtml(member.name)}</td>
        <td data-label="Função">${escapeHtml(member.role || '-')}</td>
        <td data-label="Encarregado">${escapeHtml(member.leader || '-')}</td>
        <td data-label="Equipe">${escapeHtml(member.group || '-')}</td>
        <td data-label="Status">${statusBadge(member.status)}</td>
        <td data-label="Visitas">${escapeHtml(member.visitCount || 0)}</td>
        <td data-label="Última visita">${formatDate(member.lastVisitDate)}</td>
        <td data-label="Ações">
          <div class="row-actions">
            <button class="icon-btn" data-action="log-visit" data-id="${member.id}" title="Registrar visita de hoje">Visitar</button>
            <button class="icon-btn" data-action="view-team" data-id="${member.id}">Ver</button>
            <button class="icon-btn" data-action="edit-team" data-id="${member.id}">Editar</button>
            <button class="icon-btn danger" data-action="delete-team" data-id="${member.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="8" class="empty-state">Nenhum colaborador cadastrado.</td></tr>';
  }

  function editTeamMember(member) {
    $('#teamId').value = member.id;
    $('#teamName').value = member.name || '';
    $('#teamRole').value = member.role || '';
    $('#teamLeader').value = member.leader || '';
    $('#teamGroup').value = member.group || '';
    $('#teamPhone').value = member.phone || '';
    $('#teamStatus').value = member.status || 'Ativo';
    $('#teamLastVisitDate').value = member.lastVisitDate || '';
    $('#teamVisitCount').value = member.visitCount || 0;
    $('#teamNotes').value = member.notes || '';
    toast('Colaborador carregado para edição.');
  }

  function viewTeamMember(member) {
    openModal('Detalhes do colaborador', `
      <div class="detail-grid">
        <p><strong>Nome</strong>${escapeHtml(member.name)}</p>
        <p><strong>Função</strong>${escapeHtml(member.role || '-')}</p>
        <p><strong>Encarregado</strong>${escapeHtml(member.leader || '-')}</p>
        <p><strong>Equipe</strong>${escapeHtml(member.group || '-')}</p>
        <p><strong>Telefone</strong>${escapeHtml(member.phone || '-')}</p>
        <p><strong>Status</strong>${escapeHtml(member.status || '-')}</p>
        <p><strong>Visitas registradas</strong>${escapeHtml(member.visitCount || 0)}</p>
        <p><strong>Última visita</strong>${formatDate(member.lastVisitDate)}</p>
        <p><strong>Observações</strong>${escapeHtml(member.notes || '-')}</p>
      </div>
    `);
  }

  function setupVehicle() {
    $('#vehicleProfileForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!assertCanEdit()) return;
      state.vehicle = {
        ...state.vehicle,
        model: $('#vehicleModel').value.trim(),
        plate: $('#vehiclePlate').value.trim().toUpperCase(),
        color: $('#vehicleColor').value.trim(),
        odometer: $('#vehicleOdometer').value,
      };
      saveState();
      await saveVehicleRemote();
      renderAll();
      toast('Dados do carro salvos.');
    });

    $('#vehicleCostDate').value = todayInput();

    $('#vehicleCostForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!assertCanEdit()) return;
      const id = $('#vehicleCostId').value || uid('car');
      const existing = state.vehicleCosts.find((item) => item.id === id);
      const attachments = await readAttachments($('#vehicleAttachment'), existing?.attachments || [], false);
      const item = {
        id,
        date: $('#vehicleCostDate').value,
        type: $('#vehicleCostType').value,
        value: Number($('#vehicleCostValue').value || 0),
        km: $('#vehicleCostKm').value,
        description: $('#vehicleCostDescription').value.trim(),
        attachments,
        createdBy: existing?.createdBy || currentUserStamp(),
        updatedBy: currentUserStamp(),
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      upsert('vehicleCosts', item);
      event.target.reset();
      $('#vehicleCostId').value = '';
      $('#vehicleCostDate').value = todayInput();
      renderAll();
      toast('Gasto do veículo salvo.');
    });

    $('#exportVehicleCsv').addEventListener('click', () => exportCsv('gastos-veiculo.csv', state.vehicleCosts));

    $('#vehicleCostTable').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const item = state.vehicleCosts.find((cost) => cost.id === button.dataset.id);
      if (!item) return;
      if (button.dataset.action === 'view-car') viewVehicleCost(item);
      if (button.dataset.action === 'edit-car') editVehicleCost(item);
      if (button.dataset.action === 'delete-car') removeItem('vehicleCosts', item.id, 'Gasto do veículo excluído.');
    });
  }

  function renderVehicle() {
    $('#vehicleModel').value = state.vehicle.model || '';
    $('#vehiclePlate').value = state.vehicle.plate || '';
    $('#vehicleColor').value = state.vehicle.color || '';
    $('#vehicleOdometer').value = state.vehicle.odometer || '';

    const vehicleText = state.vehicle.model || state.vehicle.plate
      ? `${state.vehicle.model || 'Modelo não informado'} • Placa ${state.vehicle.plate || '-'} • Km ${state.vehicle.odometer || '-'}`
      : 'Nenhum veículo cadastrado.';
    $('#vehicleSummary').textContent = vehicleText;
    const total = state.vehicleCosts.reduce((sum, item) => sum + Number(item.value || 0), 0);
    $('#vehicleTotal').textContent = currency(total);

    $('#vehicleCostTable').innerHTML = sortByDateDesc(state.vehicleCosts).map((item) => `
      <tr>
        <td data-label="Data">${formatDate(item.date)}</td>
        <td data-label="Tipo">${escapeHtml(item.type)}</td>
        <td data-label="Valor"><strong>${currency(item.value)}</strong></td>
        <td data-label="Km">${escapeHtml(item.km || '-')}</td>
        <td data-label="Comprovante">${attachmentBadge(item.attachments)}</td>
        <td data-label="Ações">
          <div class="row-actions">
            <button class="icon-btn" data-action="view-car" data-id="${item.id}">Ver</button>
            <button class="icon-btn" data-action="edit-car" data-id="${item.id}">Editar</button>
            <button class="icon-btn danger" data-action="delete-car" data-id="${item.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="empty-state">Nenhum gasto cadastrado.</td></tr>';
  }

  function editVehicleCost(item) {
    $('#vehicleCostId').value = item.id;
    $('#vehicleCostDate').value = item.date || todayInput();
    $('#vehicleCostType').value = item.type || 'Outros';
    $('#vehicleCostValue').value = item.value || '';
    $('#vehicleCostKm').value = item.km || '';
    $('#vehicleCostDescription').value = item.description || '';
    toast('Gasto do veículo carregado para edição.');
  }

  function viewVehicleCost(item) {
    openModal('Detalhes do gasto do veículo', `
      <div class="detail-grid">
        <p><strong>Data</strong>${formatDate(item.date)}</p>
        <p><strong>Tipo</strong>${escapeHtml(item.type)}</p>
        <p><strong>Valor</strong>${currency(item.value)}</p>
        <p><strong>Km</strong>${escapeHtml(item.km || '-')}</p>
        <p><strong>Descrição</strong>${escapeHtml(item.description || '-')}</p>
        <p><strong>Comprovante</strong>${renderAttachmentLinks(item.attachments)}</p>
      </div>
    `);
  }

  function setupAgenda() {
    const nextHour = new Date(Date.now() + 60 * 60 * 1000);
    nextHour.setSeconds(0, 0);
    $('#agendaDateTime').value = datetimeLocalInput(nextHour);

    $('#notificationButton').addEventListener('click', requestNotificationPermission);

    $('#agendaForm').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!assertCanEdit()) return;
      const id = $('#agendaId').value || uid('agenda');
      const existing = state.agendaItems.find((item) => item.id === id);
      const item = {
        id,
        title: $('#agendaTitle').value.trim(),
        dateTime: $('#agendaDateTime').value,
        priority: $('#agendaPriority').value,
        status: $('#agendaStatus').value,
        notes: $('#agendaNotes').value.trim(),
        notified: existing?.dateTime === $('#agendaDateTime').value ? Boolean(existing?.notified) : false,
        createdBy: existing?.createdBy || currentUserStamp(),
        updatedBy: currentUserStamp(),
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      upsert('agendaItems', item);
      event.target.reset();
      $('#agendaId').value = '';
      const newDefault = new Date(Date.now() + 60 * 60 * 1000);
      newDefault.setSeconds(0, 0);
      $('#agendaDateTime').value = datetimeLocalInput(newDefault);
      renderAll();
      toast('Lembrete salvo. Mantenha o site aberto para receber o alerta.');
    });

    $('#agendaFilter').addEventListener('change', renderAgendaList);
    $('#exportAgendaCsv').addEventListener('click', () => exportCsv('agenda.csv', state.agendaItems));

    $('#agendaList').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const item = state.agendaItems.find((agenda) => agenda.id === button.dataset.id);
      if (!item) return;
      if (button.dataset.action === 'done-agenda') {
        item.status = 'Concluído';
        saveState();
        renderAll();
        toast('Lembrete concluído.');
      }
      if (button.dataset.action === 'edit-agenda') editAgendaItem(item);
      if (button.dataset.action === 'delete-agenda') removeItem('agendaItems', item.id, 'Lembrete excluído.');
    });

    setInterval(checkReminders, 60 * 1000);
  }

  function renderAgendaList() {
    const filter = $('#agendaFilter')?.value || 'all';
    const now = new Date();
    const today = todayInput(now);
    let list = [...state.agendaItems];

    if (filter === 'pending') list = list.filter((item) => item.status !== 'Concluído');
    if (filter === 'today') list = list.filter((item) => item.dateTime?.slice(0, 10) === today);
    if (filter === 'overdue') list = list.filter((item) => item.status !== 'Concluído' && new Date(item.dateTime) < now);

    list.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

    $('#agendaList').innerHTML = list.map((item) => {
      const due = new Date(item.dateTime);
      const overdue = item.status !== 'Concluído' && due < now;
      return `
        <div class="agenda-item">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${formatDateTime(item.dateTime)} • Criado por ${escapeHtml(item.createdBy || '-')}</small>
            <div class="agenda-meta">
              ${statusBadge(item.status)}
              <span class="badge ${item.priority === 'Crítica' ? 'danger' : item.priority === 'Alta' ? 'warn' : 'ok'}">${escapeHtml(item.priority)}</span>
              ${overdue ? '<span class="badge danger">Vencido</span>' : ''}
            </div>
            ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ''}
          </div>
          <div class="row-actions">
            <button class="icon-btn" data-action="done-agenda" data-id="${item.id}">Concluir</button>
            <button class="icon-btn" data-action="edit-agenda" data-id="${item.id}">Editar</button>
            <button class="icon-btn danger" data-action="delete-agenda" data-id="${item.id}">Excluir</button>
          </div>
        </div>
      `;
    }).join('') || '<p class="empty-state">Nenhum compromisso cadastrado.</p>';
  }

  function editAgendaItem(item) {
    $('#agendaId').value = item.id;
    $('#agendaTitle').value = item.title || '';
    $('#agendaDateTime').value = item.dateTime || '';
    $('#agendaPriority').value = item.priority || 'Normal';
    $('#agendaStatus').value = item.status || 'Pendente';
    $('#agendaNotes').value = item.notes || '';
    toast('Lembrete carregado para edição.');
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) {
      toast('Seu navegador não suporta notificação nativa. O alerta interno continuará funcionando.');
      return;
    }
    const permission = await Notification.requestPermission();
    toast(permission === 'granted' ? 'Notificações ativadas.' : 'Notificações não autorizadas pelo navegador.');
  }

  function checkReminders() {
    const now = new Date();
    let changed = false;
    state.agendaItems.forEach((item) => {
      if (item.status === 'Concluído' || item.notified || !item.dateTime) return;
      if (new Date(item.dateTime) <= now) {
        const message = `${item.title} — ${formatDateTime(item.dateTime)}`;
        toast(`Lembrete: ${message}`);
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Lembrete EPYA', {
            body: message,
            icon: 'assets/epya-emblema.svg',
          });
        }
        openModal('Lembrete importante', `
          <div class="detail-grid">
            <p><strong>${escapeHtml(item.title)}</strong>${escapeHtml(item.notes || 'Sem observações adicionais.')}</p>
            <p><strong>Data e hora</strong>${formatDateTime(item.dateTime)}</p>
            <p><strong>Prioridade</strong>${escapeHtml(item.priority)}</p>
          </div>
        `);
        item.notified = true;
        changed = true;
      }
    });
    if (changed) {
      saveState();
      renderAll();
    }
  }

  function setupUsers() {
    elements.activeUserSelect.addEventListener('change', (event) => {
      if (remoteReady) return;
      state.activeUserId = event.target.value;
      saveState();
      renderAll();
      toast(`Usuário ativo: ${getCurrentUser().name}`);
    });

    $('#userForm').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!assertAdmin()) return;
      const id = $('#userId').value || uid('usr');
      const existing = state.users.find((user) => user.id === id);
      const user = {
        id,
        name: $('#userName').value.trim(),
        email: $('#userEmail').value.trim(),
        role: $('#userRole').value,
        status: $('#userStatus').value,
        notes: $('#userNotes').value.trim(),
        authUserId: existing?.authUserId || null,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      upsert('users', user);
      event.target.reset();
      $('#userId').value = '';
      renderAll();
      toast('Usuário salvo. Agora ele pode criar a senha em Primeiro acesso.');
    });

    $('#userTable').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (!assertAdmin()) return;
      const user = state.users.find((item) => item.id === button.dataset.id);
      if (!user) return;
      if (button.dataset.action === 'edit-user') editUser(user);
      if (button.dataset.action === 'delete-user') {
        const isProtectedAdmin = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        if (isProtectedAdmin || user.id === state.activeUserId) {
          toast('Não é possível excluir o administrador principal ou o usuário ativo.');
          return;
        }
        removeItem('users', user.id, 'Usuário excluído.');
      }
    });
  }

  function renderUserTable() {
    $('#userTable').innerHTML = state.users.map((user) => `
      <tr>
        <td data-label="Nome">${escapeHtml(user.name)}</td>
        <td data-label="E-mail">${escapeHtml(user.email || '-')}</td>
        <td data-label="Perfil">${escapeHtml(roleLabel(user.role))}</td>
        <td data-label="Status">${statusBadge(user.status)}</td>
        <td data-label="Ações">
          <div class="row-actions">
            <button class="icon-btn" data-action="edit-user" data-id="${user.id}">Editar</button>
            <button class="icon-btn danger" data-action="delete-user" data-id="${user.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function editUser(user) {
    $('#userId').value = user.id;
    $('#userName').value = user.name || '';
    $('#userEmail').value = user.email || '';
    $('#userRole').value = user.role || 'consulta';
    $('#userStatus').value = user.status || 'Ativo';
    $('#userNotes').value = user.notes || '';
    toast('Usuário carregado para edição.');
  }

  function setupBackup() {
    $('#exportBackup').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json;charset=utf-8;' });
      downloadBlob(blob, `backup-epya-${todayInput()}.json`);
    });

    $('#importBackup').addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          state = { ...structuredClone(defaultState), ...imported, vehicle: { ...defaultState.vehicle, ...(imported.vehicle || {}) } };
          if (!state.users?.length) state.users = structuredClone(defaultState.users);
          if (!state.activeUserId) state.activeUserId = state.users[0].id;
          saveState();
          renderAll();
          toast('Backup importado com sucesso.');
        } catch (error) {
          console.error(error);
          toast('Não foi possível importar o arquivo. Verifique se é um JSON válido.');
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    });

    $('#resetDemo').addEventListener('click', () => {
      const confirmed = confirm('Tem certeza que deseja limpar todos os dados salvos neste navegador?');
      if (!confirmed) return;
      state = structuredClone(defaultState);
      saveState();
      renderAll();
      toast('Dados locais apagados.');
    });

    $('#syncLocalToSupabase')?.addEventListener('click', syncLocalBackupToSupabase);
    $('#refreshSupabaseData')?.addEventListener('click', refreshRemoteData);
    $('#exportFullExcel')?.addEventListener('click', exportFullExcel);
    $('#exportFullPdf')?.addEventListener('click', downloadFullPdf);
    $('#sharePdfWhatsapp')?.addEventListener('click', sharePdfToWhatsapp);
  }

  function upsert(collection, item) {
    const index = state[collection].findIndex((entry) => entry.id === item.id);
    if (index >= 0) state[collection][index] = item;
    else state[collection].push(item);
    saveState();
    saveRemote(collection, item);
  }

  function removeItem(collection, id, message) {
    if (collection === 'users') {
      if (!assertAdmin()) return;
    } else if (!assertCanEdit()) return;
    const confirmed = confirm('Confirmar exclusão?');
    if (!confirmed) return;
    state[collection] = state[collection].filter((item) => item.id !== id);
    if (collection === 'users' && state.activeUserId === id) state.activeUserId = state.users[0]?.id || defaultState.activeUserId;
    saveState();
    deleteRemote(collection, id);
    renderAll();
    toast(message);
  }

  function exportFullExcel() {
    if (!window.XLSX) {
      toast('Biblioteca de Excel não carregou. Verifique sua internet ou o script xlsx no index.html.');
      return;
    }

    const workbook = XLSX.utils.book_new();
    const sheets = buildWorkbookSheets();
    Object.entries(sheets).forEach(([sheetName, rows]) => {
      const safeRows = rows.length ? rows : [{ Informacao: 'Sem dados cadastrados' }];
      const worksheet = XLSX.utils.json_to_sheet(safeRows);
      worksheet['!cols'] = autoExcelWidths(safeRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
    });

    XLSX.writeFile(workbook, `relatorio-epya-${todayInput()}.xlsx`);
    toast('Planilha Excel gerada com sucesso.');
  }

  function buildWorkbookSheets() {
    const totalExpenses = state.expenses.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const vehicleExpenses = state.vehicleCosts.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const openRdos = state.rdos.filter((item) => item.status !== 'Concluído').length;
    const openNcs = state.ncs.filter((item) => normalizeText(item.status) !== 'fechada').length;
    const activeReminders = state.agendaItems.filter((item) => item.status !== 'Concluído').length;

    return {
      Dashboard: [
        { Indicador: 'RDOs cadastrados', Valor: state.rdos.length },
        { Indicador: 'RDOs em aberto', Valor: openRdos },
        { Indicador: 'Não conformidades registradas', Valor: state.ncs.length },
        { Indicador: 'Não conformidades abertas', Valor: openNcs },
        { Indicador: 'Despesas gerais', Valor: totalExpenses },
        { Indicador: 'Gastos do veículo', Valor: vehicleExpenses },
        { Indicador: 'Colaboradores cadastrados', Valor: state.teamMembers.length },
        { Indicador: 'Visitas às equipes', Valor: state.teamMembers.reduce((sum, item) => sum + Number(item.visitCount || 0), 0) },
        { Indicador: 'Lembretes ativos', Valor: activeReminders },
        { Indicador: 'Usuário logado', Valor: getCurrentUser()?.name || '-' },
        { Indicador: 'Perfil', Valor: roleLabel(getCurrentUser()?.role || '-') },
        { Indicador: 'Data de emissão', Valor: new Date().toLocaleString('pt-BR') },
      ],
      RDO: state.rdos.map((item) => ({
        Data: formatDate(item.date),
        Turno: item.shift,
        Frente_Obra: item.project,
        Local: item.location,
        Clima: item.weather,
        Status: item.status,
        Atividades: item.activities,
        Ocorrencias_Nao_Conformidades: item.issues,
        Seguranca_Qualidade: item.quality,
        Anexos: attachmentNames(item.attachments),
        Responsavel: userName(item.createdBy),
      })),
      Nao_Conformidades: state.ncs.map((item) => ({
        Data: formatDate(item.date),
        Frente_Obra: item.project,
        Tipo: item.type,
        Severidade: item.severity,
        Responsavel: item.responsible,
        Prazo: item.deadline ? formatDate(item.deadline) : '',
        Status: item.status,
        Descricao: item.description,
        Acao_Corretiva: item.action,
        Fechada_Em: item.closedAt ? new Date(item.closedAt).toLocaleString('pt-BR') : '',
        Anexos: attachmentNames(item.attachments),
        Registrado_Por: item.createdBy,
      })),
      Frentes: state.projects.map((item) => ({
        Frente_Obra: item.name,
        RDOs: state.rdos.filter((rdo) => normalizeText(rdo.project) === normalizeText(item.name)).length,
        NCs: state.ncs.filter((nc) => normalizeText(nc.project) === normalizeText(item.name)).length,
      })),
      Encarregados: state.leaders.map((item) => ({
        Nome: item.name,
        Colaboradores: state.teamMembers.filter((member) => normalizeText(member.leader) === normalizeText(item.name)).length,
      })),
      Despesas: state.expenses.map((item) => ({
        Data: formatDate(item.date),
        Mes_Referencia: item.month,
        Categoria: item.category,
        Valor: Number(item.value || 0),
        Forma_Pagamento: item.payment,
        Descricao: item.description,
        Anexos: attachmentNames(item.attachments),
        Responsavel: userName(item.createdBy),
      })),
      Equipes: state.teamMembers.map((item) => ({
        Nome: item.name,
        Funcao: item.role,
        Encarregado: item.leader,
        Equipe: item.group,
        Telefone: item.phone,
        Status: item.status,
        Visitas_Registradas: Number(item.visitCount || 0),
        Ultima_Visita: formatDate(item.lastVisitDate),
        Observacoes: item.notes,
      })),
      Veiculo: [{
        Modelo: state.vehicle.model || '',
        Placa: state.vehicle.plate || '',
        Cor: state.vehicle.color || '',
        Odometro_Atual: state.vehicle.odometer || '',
      }],
      Gastos_Veiculo: state.vehicleCosts.map((item) => ({
        Data: formatDate(item.date),
        Tipo: item.type,
        Valor: Number(item.value || 0),
        KM: item.km,
        Descricao: item.description,
        Anexos: attachmentNames(item.attachments),
      })),
      Agenda: state.agendaItems.map((item) => ({
        Data_Hora: formatDateTime(item.dateTime),
        Titulo: item.title,
        Prioridade: item.priority,
        Status: item.status,
        Observacoes: item.notes,
      })),
      Usuarios: state.users.map((item) => ({
        Nome: item.name,
        Email: item.email,
        Perfil: roleLabel(item.role),
        Status: item.status,
        Observacoes: item.notes,
        Criado_Em: item.createdAt ? new Date(item.createdAt).toLocaleString('pt-BR') : '',
      })),
    };
  }

  function autoExcelWidths(rows) {
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return headers.map((header) => {
      const max = Math.max(String(header).length, ...rows.map((row) => String(row[header] ?? '').length));
      return { wch: Math.min(Math.max(max + 2, 12), 42) };
    });
  }

  function attachmentNames(files) {
    return Array.isArray(files) && files.length ? files.map((file) => file.name).join(' | ') : '';
  }

  function userName(userId) {
    return state.users.find((user) => user.id === userId)?.name || userId || '-';
  }

  async function downloadFullPdf() {
    const { blob, filename } = createReportPdfBlob();
    if (!blob) return;
    downloadBlob(blob, filename);
    toast('PDF do relatório gerado com sucesso.');
  }

  async function sharePdfToWhatsapp() {
    const { blob, filename } = createReportPdfBlob();
    if (!blob) return;

    const message = `Relatório EPYA Controle de Qualidade - Responsável Darci Brum - ${new Date().toLocaleString('pt-BR')}`;
    const file = new File([blob], filename, { type: 'application/pdf' });

    try {
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ title: 'Relatório EPYA', text: message, files: [file] });
        toast('Compartilhamento aberto. Escolha o WhatsApp para enviar o PDF.');
        return;
      }
    } catch (error) {
      console.warn('Compartilhamento nativo não concluído:', error);
    }

    downloadBlob(blob, filename);
    const whatsappText = encodeURIComponent(`${message}\n\nO PDF foi baixado no navegador. No WhatsApp Web, anexe o arquivo ${filename} na conversa desejada.`);
    window.open(`https://wa.me/?text=${whatsappText}`, '_blank', 'noopener,noreferrer');
    toast('PDF baixado. O WhatsApp Web foi aberto para você anexar o arquivo.');
  }

  function createReportPdfBlob() {
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) {
      toast('Biblioteca de PDF não carregou. Verifique sua internet ou o script jsPDF no index.html.');
      return { blob: null, filename: null };
    }

    const doc = new jsPDFCtor({ unit: 'pt', format: 'a4' });
    const margin = 42;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 44;

    const addPageIfNeeded = (needed = 48) => {
      if (y + needed <= pageHeight - 42) return;
      doc.addPage();
      y = 44;
      footer();
    };

    const footer = () => {
      const current = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`EPYA Controle de Qualidade - pagina ${current}`, margin, pageHeight - 20);
    };

    const text = (content, x, options = {}) => {
      const size = options.size || 10;
      const style = options.style || 'normal';
      const color = options.color || [36, 39, 43];
      const maxWidth = options.maxWidth || pageWidth - margin * 2;
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(String(content || '-'), maxWidth);
      doc.text(lines, x, y);
      y += lines.length * (size + 4) + (options.gap ?? 6);
    };

    const section = (title) => {
      addPageIfNeeded(70);
      y += 8;
      doc.setFillColor(243, 194, 41);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 26, 8, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(28, 29, 32);
      doc.text(title, margin + 12, y + 18);
      y += 42;
    };

    const row = (label, value) => {
      addPageIfNeeded(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(70);
      doc.text(String(label), margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(32);
      const lines = doc.splitTextToSize(String(value || '-'), pageWidth - margin * 2 - 145);
      doc.text(lines, margin + 145, y);
      y += Math.max(18, lines.length * 13 + 4);
    };

    doc.setFillColor(23, 24, 27);
    doc.rect(0, 0, pageWidth, 112, 'F');
    doc.setTextColor(243, 194, 41);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('EPYA', margin, 48);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('Relatorio de Controle de Qualidade', margin, 76);
    doc.setFontSize(10);
    doc.text(`Responsavel Darci Brum - Emitido em ${new Date().toLocaleString('pt-BR')}`, margin, 96);
    y = 142;

    section('Resumo geral');
    row('Usuario', `${getCurrentUser()?.name || '-'} (${roleLabel(getCurrentUser()?.role || '-')})`);
    row('RDOs cadastrados', state.rdos.length);
    row('Despesas gerais', currency(state.expenses.reduce((sum, item) => sum + Number(item.value || 0), 0)));
    row('Gastos do veiculo', currency(state.vehicleCosts.reduce((sum, item) => sum + Number(item.value || 0), 0)));
    row('Colaboradores', state.teamMembers.length);
    row('Lembretes ativos', state.agendaItems.filter((item) => item.status !== 'Concluído').length);

    section('Ultimos RDOs');
    if (!state.rdos.length) text('Sem RDOs cadastrados.', margin);
    state.rdos.slice(0, 12).forEach((item, index) => {
      addPageIfNeeded(110);
      text(`${index + 1}. ${formatDate(item.date)} - ${item.project || 'Frente/obra não informada'}`, margin, { style: 'bold', size: 11, gap: 2 });
      row('Local / Status', `${item.location || '-'} / ${item.status || '-'}`);
      row('Atividades', item.activities || '-');
      row('Ocorrencias', item.issues || '-');
      y += 8;
    });

    section('Despesas gerais');
    if (!state.expenses.length) text('Sem despesas cadastradas.', margin);
    state.expenses.slice(0, 20).forEach((item, index) => {
      addPageIfNeeded(70);
      text(`${index + 1}. ${formatDate(item.date)} - ${item.category || '-'} - ${currency(item.value)}`, margin, { style: 'bold', size: 10, gap: 2 });
      row('Descricao', item.description || '-');
    });

    section('Equipes');
    if (!state.teamMembers.length) text('Sem colaboradores cadastrados.', margin);
    state.teamMembers.slice(0, 30).forEach((item, index) => {
      addPageIfNeeded(45);
      text(`${index + 1}. ${item.name || '-'} - ${item.role || '-'}`, margin, { style: 'bold', size: 10, gap: 0 });
      row('Equipe / Encarregado', `${item.group || '-'} / ${item.leader || '-'}`);
      row('Visitas / Última visita', `${item.visitCount || 0} / ${formatDate(item.lastVisitDate)}`);
    });

    section('Veiculo e agenda');
    row('Modelo', state.vehicle.model || '-');
    row('Placa', state.vehicle.plate || '-');
    row('Odometro atual', state.vehicle.odometer || '-');
    row('Total de gastos do veiculo', currency(state.vehicleCosts.reduce((sum, item) => sum + Number(item.value || 0), 0)));
    y += 8;
    text('Proximos lembretes', margin, { style: 'bold', size: 12 });
    if (!state.agendaItems.length) text('Sem lembretes cadastrados.', margin);
    state.agendaItems.slice(0, 15).forEach((item, index) => {
      addPageIfNeeded(55);
      text(`${index + 1}. ${formatDateTime(item.dateTime)} - ${item.title || '-'}`, margin, { style: 'bold', size: 10, gap: 0 });
      row('Prioridade / Status', `${item.priority || '-'} / ${item.status || '-'}`);
    });

    const pages = doc.internal.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      footer();
    }

    const filename = `relatorio-epya-${todayInput()}.pdf`;
    return { blob: doc.output('blob'), filename };
  }

  function exportCsv(filename, rows) {
    if (!rows?.length) {
      toast('Não existem dados para exportar.');
      return;
    }
    const flattened = rows.map((row) => {
      const copy = { ...row };
      if (copy.attachments) copy.attachments = copy.attachments.map((file) => file.name).join(' | ');
      return copy;
    });
    const headers = [...new Set(flattened.flatMap((row) => Object.keys(row)))];
    const csv = [
      headers.join(';'),
      ...flattened.map((row) => headers.map((header) => quoteCsv(row[header])).join(';')),
    ].join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename);
  }

  function quoteCsv(value) {
    if (value == null) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function renderAll() {
    renderUsersSelect();
    renderProjectSelects();
    renderProjectList();
    renderLeaderList();
    renderLeaderOptions();
    renderDashboard();
    renderRdoTable();
    renderNcTable();
    renderExpenseTable();
    renderTeamTable();
    renderVehicle();
    renderAgendaList();
    renderUserTable();
  }

  async function init() {
    setupTheme();
    setupAuthForms();
    setupNavigation();
    setupProjects();
    setupRdo();
    setupNcs();
    setupExpenses();
    setupLeaders();
    setupTeams();
    setupVehicle();
    setupAgenda();
    setupUsers();
    setupBackup();

    $('#closeModal').addEventListener('click', closeModal);
    $('#printModal').addEventListener('click', () => window.print());
    elements.modal.addEventListener('click', (event) => {
      if (event.target === elements.modal) closeModal();
    });

    renderAll();
    await restoreSession();
    setTimeout(checkReminders, 1500);
  }

  init();
})();
