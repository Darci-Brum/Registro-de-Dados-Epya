const STORAGE_KEY = 'ferrovia-operacional-v1';
let state = loadData();
let costChart = null;
let fuelChart = null;

const formatterBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const formatterNumber = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 1
});

const monthFilter = document.getElementById('monthFilter');
const teamFilter = document.getElementById('teamFilter');
const teamsTable = document.getElementById('teamsTable');
const fuelTable = document.getElementById('fuelTable');
const expensesTable = document.getElementById('expensesTable');
const fuelForm = document.getElementById('fuelForm');
const expenseForm = document.getElementById('expenseForm');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const resetDataBtn = document.getElementById('resetDataBtn');

function loadData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return structuredClone(window.ferroviaDefaultData);

  try {
    return JSON.parse(stored);
  } catch (error) {
    console.warn('Não foi possível ler os dados salvos. Restaurando padrão.', error);
    return structuredClone(window.ferroviaDefaultData);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getAvailableMonths() {
  const months = new Set([
    ...state.gastos.map((item) => item.mes),
    ...state.abastecimentos.map((item) => item.data.slice(0, 7))
  ]);

  return [...months].sort().reverse();
}

function monthLabel(month) {
  const [year, monthNumber] = month.split('-');
  const date = new Date(Number(year), Number(monthNumber) - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function getTeamName(id) {
  return state.equipes.find((team) => team.id === id)?.nome || id;
}

function getStatusClass(status) {
  const normalized = status.toLowerCase();
  if (normalized.includes('operação')) return 'status-operacao';
  if (normalized.includes('alerta')) return 'status-alerta';
  if (normalized.includes('finalizado')) return 'status-finalizado';
  return 'status-planejado';
}

function getFilters() {
  return {
    month: monthFilter.value,
    team: teamFilter.value
  };
}

function filteredFuel() {
  const { month, team } = getFilters();
  return state.abastecimentos.filter((item) => {
    const itemMonth = item.data.slice(0, 7);
    const monthOk = month === 'all' || itemMonth === month;
    const teamOk = team === 'all' || item.equipe === team;
    return monthOk && teamOk;
  });
}

function filteredExpenses() {
  const { month } = getFilters();
  return state.gastos.filter((item) => month === 'all' || item.mes === month);
}

function filteredTeams() {
  const { team } = getFilters();
  return state.equipes.filter((item) => team === 'all' || item.id === team);
}

function fillFilters() {
  const months = getAvailableMonths();
  const currentMonth = monthFilter.value || months[0] || 'all';

  monthFilter.innerHTML = `
    <option value="all">Todos os meses</option>
    ${months.map((month) => `<option value="${month}">${monthLabel(month)}</option>`).join('')}
  `;
  monthFilter.value = months.includes(currentMonth) ? currentMonth : (months[0] || 'all');

  teamFilter.innerHTML = `
    <option value="all">Todas as equipes</option>
    ${state.equipes.map((team) => `<option value="${team.id}">${team.id} — ${team.nome}</option>`).join('')}
  `;

  const teamSelect = fuelForm?.querySelector('[name="equipe"]');
  if (teamSelect) {
    teamSelect.innerHTML = state.equipes.map((team) => `<option value="${team.id}">${team.id} — ${team.nome}</option>`).join('');
  }
}

function renderKpis() {
  const fuels = filteredFuel();
  const expenses = filteredExpenses();
  const teams = filteredTeams().filter((team) => team.status !== 'Finalizado');

  const liters = fuels.reduce((sum, item) => sum + Number(item.litros), 0);
  const fuelCost = fuels.reduce((sum, item) => sum + Number(item.litros) * Number(item.valorLitro), 0);
  const expensesCost = expenses.reduce((sum, item) => sum + Number(item.valor), 0);

  document.getElementById('kpiTeams').textContent = teams.length;
  document.getElementById('kpiLiters').textContent = `${formatterNumber.format(liters)} L`;
  document.getElementById('kpiFuelCost').textContent = formatterBRL.format(fuelCost);
  document.getElementById('kpiMonthCost').textContent = formatterBRL.format(expensesCost);
}

function renderTeamsTable() {
  teamsTable.innerHTML = filteredTeams().map((team) => `
    <tr>
      <td><strong>${team.id}</strong><br>${team.nome}</td>
      <td>${team.frente}</td>
      <td>${team.local}</td>
      <td>${team.supervisor}<br><small>${team.membros} integrantes</small></td>
      <td><span class="status-pill ${getStatusClass(team.status)}">${team.status}</span></td>
      <td>
        <div class="progress-bar" title="${team.progresso}%"><span style="width:${team.progresso}%"></span></div>
        <small>${team.progresso}%</small>
      </td>
    </tr>
  `).join('');
}

function renderFuelTable() {
  const fuels = filteredFuel().sort((a, b) => b.data.localeCompare(a.data));
  fuelTable.innerHTML = fuels.map((item) => {
    const total = Number(item.litros) * Number(item.valorLitro);
    return `
      <tr>
        <td>${new Date(`${item.data}T00:00:00`).toLocaleDateString('pt-BR')}</td>
        <td><strong>${item.veiculo}</strong></td>
        <td>${item.placa}</td>
        <td>${getTeamName(item.equipe)}</td>
        <td>${formatterNumber.format(item.litros)} L</td>
        <td>${formatterBRL.format(item.valorLitro)}</td>
        <td><strong>${formatterBRL.format(total)}</strong></td>
        <td>${formatterNumber.format(item.odometro)}</td>
      </tr>
    `;
  }).join('');
}

function renderExpensesTable() {
  const expenses = filteredExpenses().sort((a, b) => b.mes.localeCompare(a.mes) || b.valor - a.valor);
  expensesTable.innerHTML = expenses.map((item) => `
    <tr>
      <td>${monthLabel(item.mes)}</td>
      <td><strong>${item.categoria}</strong></td>
      <td>${formatterBRL.format(item.valor)}</td>
      <td>${item.observacao || '-'}</td>
    </tr>
  `).join('');
}

function expenseByCategory() {
  const result = {};
  filteredExpenses().forEach((item) => {
    result[item.categoria] = (result[item.categoria] || 0) + Number(item.valor);
  });
  return result;
}

function fuelByTeam() {
  const result = {};
  filteredFuel().forEach((item) => {
    const label = getTeamName(item.equipe).replace('Via Permanente ', 'Via Perm. ');
    result[label] = (result[label] || 0) + Number(item.litros);
  });
  return result;
}

function renderCharts() {
  if (typeof Chart === 'undefined') {
    return;
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          font: { family: 'Montserrat', weight: '700' },
          color: '#2F2F34',
          boxWidth: 12
        }
      }
    },
    scales: {
      x: {
        ticks: { color: '#4A4A50', font: { family: 'Montserrat', weight: '700', size: 10 } },
        grid: { display: false }
      },
      y: {
        ticks: { color: '#4A4A50', font: { family: 'Montserrat', weight: '700', size: 10 } },
        grid: { color: 'rgba(17,17,17,.08)' }
      }
    }
  };

  const expenses = expenseByCategory();
  const expenseLabels = Object.keys(expenses);
  const expenseValues = Object.values(expenses);

  if (costChart) costChart.destroy();
  costChart = new Chart(document.getElementById('costChart'), {
    type: 'bar',
    data: {
      labels: expenseLabels,
      datasets: [{
        label: 'Valor em R$',
        data: expenseValues,
        backgroundColor: '#F4C21B',
        borderColor: '#D9A900',
        borderWidth: 1,
        borderRadius: 8
      }]
    },
    options: chartOptions
  });

  const fuel = fuelByTeam();
  const fuelLabels = Object.keys(fuel);
  const fuelValues = Object.values(fuel);

  if (fuelChart) fuelChart.destroy();
  fuelChart = new Chart(document.getElementById('fuelChart'), {
    type: 'doughnut',
    data: {
      labels: fuelLabels,
      datasets: [{
        label: 'Litros',
        data: fuelValues,
        backgroundColor: ['#F4C21B', '#111111', '#4A4A50', '#D9A900', '#2F2F34'],
        borderColor: '#FFFFFF',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Montserrat', weight: '700' },
            color: '#2F2F34',
            boxWidth: 12
          }
        }
      }
    }
  });
}

function renderAll() {
  renderKpis();
  renderTeamsTable();
  renderFuelTable();
  renderExpensesTable();
  renderCharts();
}

function showNotice(element) {
  element.classList.remove('hidden');
  setTimeout(() => element.classList.add('hidden'), 2800);
}

function handleFuelSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  state.abastecimentos.push({
    data: formData.get('data'),
    veiculo: formData.get('veiculo'),
    placa: formData.get('placa').toUpperCase(),
    equipe: formData.get('equipe'),
    litros: Number(formData.get('litros')),
    valorLitro: Number(formData.get('valorLitro')),
    odometro: Number(formData.get('odometro'))
  });

  saveData();
  fillFilters();
  renderAll();
  event.currentTarget.reset();
  showNotice(document.getElementById('fuelNotice'));
}

function handleExpenseSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  state.gastos.push({
    mes: formData.get('mes'),
    categoria: formData.get('categoria'),
    valor: Number(formData.get('valor')),
    observacao: formData.get('observacao') || 'Lançamento operacional'
  });

  saveData();
  fillFilters();
  renderAll();
  event.currentTarget.reset();
  showNotice(document.getElementById('expenseNotice'));
}

function exportCsv() {
  const fuels = filteredFuel();
  const expenses = filteredExpenses();
  const lines = [];

  lines.push('TIPO;DATA/MES;EQUIPE/CATEGORIA;DESCRICAO;LITROS;VALOR_UNITARIO;VALOR_TOTAL;OBSERVACAO');

  fuels.forEach((item) => {
    const total = Number(item.litros) * Number(item.valorLitro);
    lines.push([
      'ABASTECIMENTO',
      item.data,
      getTeamName(item.equipe),
      `${item.veiculo} - ${item.placa}`,
      String(item.litros).replace('.', ','),
      String(item.valorLitro).replace('.', ','),
      total.toFixed(2).replace('.', ','),
      `Odômetro ${item.odometro}`
    ].join(';'));
  });

  expenses.forEach((item) => {
    lines.push([
      'GASTO',
      item.mes,
      item.categoria,
      'Despesa mensal',
      '',
      '',
      Number(item.valor).toFixed(2).replace('.', ','),
      item.observacao || ''
    ].join(';'));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'controle-operacional-ferrovia.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function resetData() {
  const confirmed = window.confirm('Deseja restaurar os dados demonstrativos? Isso apagará os lançamentos salvos neste navegador.');
  if (!confirmed) return;

  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(window.ferroviaDefaultData);
  fillFilters();
  renderAll();
}

monthFilter?.addEventListener('change', renderAll);
teamFilter?.addEventListener('change', renderAll);
fuelForm?.addEventListener('submit', handleFuelSubmit);
expenseForm?.addEventListener('submit', handleExpenseSubmit);
exportCsvBtn?.addEventListener('click', exportCsv);
resetDataBtn?.addEventListener('click', resetData);

fillFilters();
renderAll();
