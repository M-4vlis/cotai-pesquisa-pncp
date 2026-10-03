const dbName = 'cotai-local';
const storeName = 'state';
let state = { items: [], results: [], settings: {} };

const $ = (id) => document.getElementById(id);
const fields = ['resultCount', 'minScore', 'periodPreset', 'startDate', 'endDate'];

function db() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function save() {
  const database = await db();
  database.transaction(storeName, 'readwrite').objectStore(storeName).put(state, 'current');
}

async function load() {
  const database = await db();
  const request = database.transaction(storeName, 'readonly').objectStore(storeName).get('current');
  request.onsuccess = () => {
    if (request.result) state = { items: [], results: [], settings: {}, ...request.result };
    fields.forEach((id) => { if (state.settings?.[id] !== undefined) $(id).value = state.settings[id]; });
    toggleCustomPeriod();
    renderItems();
    renderResults();
  };
}

function persistSettings() {
  state.settings = Object.fromEntries(fields.map((id) => [id, $(id).value]));
  save();
}

function esc(value = '') {
  const element = document.createElement('div');
  element.textContent = value;
  return element.innerHTML;
}

function renderItems() {
  $('itemsBody').innerHTML = state.items.map((item) => {
    const catmat = item.catmat ? `<span class="catmat-chip">${esc(String(item.catmat.codigoItem))}</span> ${esc(item.catmat.descricaoItem)}` : '<span class="pending-chip">Será identificado</span>';
    return `<tr><td>${esc(item.descricao)}</td><td>${esc(item.unidade || '—')}</td><td>${esc(item.quantidade || '—')}</td><td class="catmat-cell">${catmat}</td></tr>`;
  }).join('');
  $('itemSummary').classList.toggle('hidden', state.items.length > 0);
  $('itemsWrap').classList.toggle('hidden', !state.items.length);
  if (state.items.length) $('itemSummary').textContent = `${state.items.length} item(ns) mantido(s) neste navegador.`;
}

function parseRows(rows) {
  const keys = Object.keys(rows[0] || {});
  const match = (...terms) => keys.find((key) => terms.includes(key.toLowerCase().trim()));
  const description = match('descricao', 'descrição', 'item', 'produto');
  const unit = match('unidade', 'unidade de fornecimento', 'und');
  const quantity = match('quantidade', 'qtd', 'qtde');
  if (!description) throw new Error('A planilha precisa de uma coluna “descricao” ou “descrição”.');
  return rows.filter((row) => row[description]).map((row) => ({
    descricao: String(row[description]).trim(),
    unidade: unit ? String(row[unit] || '').trim() : '',
    quantidade: quantity ? String(row[quantity] || '').trim() : '',
  }));
}

async function importFile(file) {
  try {
    let rows;
    if (file.name.toLowerCase().endsWith('.csv')) {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const separator = lines[0]?.includes(';') ? ';' : ',';
      const headers = lines.shift().split(separator).map((value) => value.trim());
      rows = lines.map((line) => Object.fromEntries(headers.map((header, index) => [header, line.split(separator)[index]?.trim()])));
    } else {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    }
    state.items = parseRows(rows);
    state.results = [];
    await save();
    renderItems();
    renderResults();
    status(`${state.items.length} item(ns) importado(s). Clique em pesquisar para iniciar a classificação CATMAT.`);
  } catch (error) {
    status(error.message || 'Não foi possível ler a planilha.', true);
  }
}

function getPeriod() {
  const preset = $('periodPreset').value;
  const end = preset === 'custom' && $('endDate').value ? new Date(`${$('endDate').value}T12:00:00`) : new Date();
  const start = preset === 'custom' && $('startDate').value ? new Date(`${$('startDate').value}T12:00:00`) : new Date(end);
  if (preset !== 'custom') start.setMonth(start.getMonth() - Number(preset));
  if (start > end) throw new Error('A data inicial deve ser anterior à data final.');
  const iso = (date) => date.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

function toggleCustomPeriod() {
  $('customPeriod').classList.toggle('hidden', $('periodPreset').value !== 'custom');
}

async function api(path, params) {
  const response = await fetch(`${path}?${new URLSearchParams(params)}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'O serviço público está temporariamente indisponível. Tente novamente em alguns minutos.');
  return body;
}

function setProgress(current, total) {
  $('progressWrap').classList.remove('hidden');
  $('progressWrap').setAttribute('aria-hidden', 'false');
  $('progressBar').style.width = `${Math.max(3, Math.round((current / total) * 100))}%`;
}

async function search() {
  if (!state.items.length) return status('Importe uma planilha ou use o exemplo antes de pesquisar.', true);
  let period;
  try { period = getPeriod(); } catch (error) { return status(error.message, true); }
  persistSettings();
  $('searchButton').disabled = true;
  $('searchButton').textContent = 'Pesquisando…';
  state.results = [];
  const totalSteps = state.items.length * 2;
  let step = 0;
  setProgress(step, totalSteps);

  try {
    for (let index = 0; index < state.items.length; index += 1) {
      const item = state.items[index];
      status(`Item ${index + 1} de ${state.items.length}: identificando os CATMAT mais semelhantes…`);
      const catalog = await api('/api/catmat', { q: item.descricao, limit: 3 });
      item.catmatSuggestions = catalog.items || [];
      item.catmat = item.catmatSuggestions[0] || null;
      step += 1;
      setProgress(step, totalSteps);
      renderItems();
      await save();

      if (!item.catmat) {
        state.results.push({ item, catmat: null, alternatives: [], found: [], message: 'Não foi possível identificar um CATMAT suficientemente próximo.' });
        step += 1;
        setProgress(step, totalSteps);
        continue;
      }

      status(`Item ${index + 1} de ${state.items.length}: pesquisando preços do CATMAT ${item.catmat.codigoItem}…`);
      const prices = await api('/api/prices', {
        q: item.descricao,
        catmat: item.catmat.codigoItem,
        catmatDescription: item.catmat.descricaoItem,
        start: period.start,
        end: period.end,
        limit: $('resultCount').value,
        minScore: $('minScore').value,
      });
      state.results.push({ item, catmat: item.catmat, alternatives: item.catmatSuggestions.slice(1), found: prices.items || [], message: prices.message || '' });
      step += 1;
      setProgress(step, totalSteps);
      renderResults();
      await save();
    }
    const pricesFound = state.results.reduce((sum, group) => sum + group.found.length, 0);
    status(pricesFound ? `Pesquisa concluída com ${pricesFound} preço(s). Confirme cada resultado no PNCP antes de utilizá-lo.` : 'Pesquisa concluída. Não foram encontrados preços comparáveis neste período; tente ampliar o período ou reduzir a similaridade mínima.');
  } catch (error) {
    status(error.message || 'Não foi possível concluir a pesquisa agora. Tente novamente em alguns minutos.', true);
  } finally {
    $('searchButton').disabled = false;
    $('searchButton').textContent = 'Identificar CATMAT e pesquisar preços';
    setTimeout(() => $('progressWrap').classList.add('hidden'), 900);
  }
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function renderResults() {
  const section = $('resultsSection');
  const list = $('resultsList');
  list.innerHTML = '';
  section.classList.toggle('hidden', !state.results.length);
  state.results.forEach((group) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'result-group';
    const catalog = group.catmat
      ? `<div class="catalog-summary"><strong>CATMAT ${esc(String(group.catmat.codigoItem))}</strong><span>${esc(group.catmat.descricaoItem)}</span><small>${group.catmat.score}% de aderência ao item enviado</small></div>`
      : '<div class="catalog-summary warning">CATMAT não identificado</div>';
    wrapper.innerHTML = `<h3>${esc(group.item.descricao)}</h3>${catalog}`;
    if (group.alternatives?.length) {
      wrapper.innerHTML += `<details class="alternatives"><summary>Ver outros CATMAT sugeridos</summary>${group.alternatives.map((item) => `<p><strong>${esc(String(item.codigoItem))}</strong> · ${esc(item.descricaoItem)} <span>${item.score}%</span></p>`).join('')}</details>`;
    }
    if (!group.found.length) wrapper.innerHTML += `<p class="empty">${esc(group.message || 'Nenhum preço atingiu os critérios definidos.')}</p>`;
    group.found.forEach((result) => {
      const node = $('resultTemplate').content.cloneNode(true);
      node.querySelector('.score').textContent = `${result.score}% similar`;
      node.querySelector('h3').textContent = result.descricao;
      node.querySelector('.source-description').textContent = result.fornecedor ? `Fornecedor: ${result.fornecedor}` : 'Registro público localizado';
      node.querySelector('.price').textContent = money(result.valor);
      node.querySelector('.unit').textContent = result.unidade || '—';
      node.querySelector('.agency').textContent = result.orgao || '—';
      node.querySelector('.date').textContent = result.data ? new Date(`${result.data.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
      node.querySelector('.price-type').textContent = result.tipo || '—';
      node.querySelector('.evidence').href = result.link;
      wrapper.append(node);
    });
    list.append(wrapper);
  });
}

function status(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
}

function sample() {
  state.items = [
    { descricao: 'Papel A4, 75 g/m², resma com 500 folhas', unidade: 'Resma', quantidade: '20' },
    { descricao: 'Caneta esferográfica azul, ponta média', unidade: 'Unidade', quantidade: '100' },
  ];
  state.results = [];
  save();
  renderItems();
  renderResults();
  status('Exemplo carregado. Clique em pesquisar para identificar os CATMAT.');
}

function csv() {
  const rows = [['Item pesquisado', 'CATMAT', 'Descrição CATMAT', 'Descrição encontrada', 'Similaridade', 'Preço', 'Unidade', 'Órgão', 'Data', 'Tipo', 'Link']];
  state.results.forEach((group) => group.found.forEach((result) => rows.push([
    group.item.descricao, group.catmat?.codigoItem, group.catmat?.descricaoItem, result.descricao, `${result.score}%`, result.valor,
    result.unidade, result.orgao, result.data, result.tipo, result.link,
  ])));
  const content = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
  const blob = new Blob([`\ufeff${content}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'cotai-resultados.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

$('fileInput').addEventListener('change', (event) => event.target.files[0] && importFile(event.target.files[0]));
$('sampleButton').onclick = sample;
$('searchButton').onclick = search;
$('exportButton').onclick = csv;
$('clearButton').onclick = async () => {
  state = { items: [], results: [], settings: {} };
  await save();
  renderItems();
  renderResults();
  status('Dados locais removidos.');
};
$('periodPreset').addEventListener('change', () => { toggleCustomPeriod(); persistSettings(); });
fields.filter((id) => id !== 'periodPreset').forEach((id) => $(id).addEventListener('change', persistSettings));
load();
