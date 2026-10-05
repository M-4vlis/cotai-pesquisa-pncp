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
    const hasOldEvidence = state.results.some((group) => group.found?.some((result) => !String(result.link || '').startsWith('https://pncp.gov.br/app/editais/')));
    if (hasOldEvidence) state.results = [];
    fields.forEach((id) => { if (state.settings?.[id] !== undefined) $(id).value = state.settings[id]; });
    updateControls();
    renderItems();
    renderResults();
  };
}

function esc(value = '') {
  const element = document.createElement('div');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}

function persistSettings() {
  state.settings = Object.fromEntries(fields.map((id) => [id, $(id).value]));
  save();
}

function updateControls() {
  $('resultCountValue').textContent = $('resultCount').value;
  $('minScoreValue').textContent = `${$('minScore').value}%`;
  $('customPeriod').classList.toggle('hidden', $('periodPreset').value !== 'custom');
  const minutes = Math.max(1, Math.ceil(state.items.length / 4));
  $('timeEstimate').textContent = state.items.length ? `Aprox. ${minutes} a ${minutes + 1} minuto${minutes > 1 ? 's' : ''}` : 'Aprox. 1 a 2 minutos';
}

function setStage(active, complete = false) {
  for (let index = 1; index <= 4; index += 1) {
    const element = $(`process${index}`);
    element.classList.toggle('done', index < active || (complete && index === active));
    element.classList.toggle('active', !complete && index === active);
  }
}

function renderItems() {
  $('itemsBody').innerHTML = state.items.map((item, index) => {
    const catmat = item.catmat
      ? `<span class="catmat-chip">${esc(item.catmat.codigoItem)}</span>${esc(item.catmat.nomePdm || item.catmat.descricaoItem)}`
      : `<span class="pending-chip">${item.catalogError ? 'Não identificado' : 'Aguardando busca'}</span>`;
    return `<tr><td data-label="Item">${index + 1}</td><td data-label="Descrição">${esc(item.descricao)}</td><td data-label="Unidade">${esc(item.unidade || '—')}</td><td data-label="Quantidade">${esc(item.quantidade || '—')}</td><td data-label="CATMAT">${catmat}</td></tr>`;
  }).join('');
  $('itemsWrap').classList.toggle('hidden', !state.items.length);
  $('itemSummary').textContent = state.items.length ? `${state.items.length} item(ns) pronto(s) para pesquisa.` : 'Nenhum item importado.';
  $('itemSummary').classList.toggle('success', state.items.length > 0);
  if (state.items.length && !state.results.length) setStage(2);
  updateControls();
}

function normalizeHeader(value = '') {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function parseRows(rows) {
  const keys = Object.keys(rows[0] || {});
  const match = (...terms) => keys.find((key) => terms.includes(normalizeHeader(key)));
  const description = match('descricao', 'item', 'produto', 'material', 'objeto');
  const unit = match('unidade', 'unidade de fornecimento', 'und', 'un');
  const quantity = match('quantidade', 'qtd', 'qtde');
  if (!description) throw new Error('A planilha precisa de uma coluna “descrição”, “item”, “produto” ou “material”.');
  return rows.filter((row) => String(row[description] || '').trim()).map((row) => ({
    descricao: String(row[description]).trim(),
    unidade: unit ? String(row[unit] || '').trim() : '',
    quantidade: quantity ? String(row[quantity] || '').trim() : '',
  }));
}

async function importFile(file) {
  try {
    if (!window.XLSX) throw new Error('O leitor de planilhas ainda está carregando. Aguarde alguns segundos e tente novamente.');
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const content = isCsv ? await file.text() : await file.arrayBuffer();
    const workbook = XLSX.read(content, { type: isCsv ? 'string' : 'array' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    state.items = parseRows(rows);
    state.results = [];
    await save();
    renderItems();
    renderResults();
    status(`${state.items.length} item(ns) importado(s). Revise a leitura e inicie a pesquisa.`);
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

async function api(path, params) {
  const response = await fetch(`${path}?${new URLSearchParams(params)}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'O serviço público está temporariamente indisponível. Tente novamente em alguns minutos.');
  return body;
}

async function postApi(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'O serviço público está temporariamente indisponível. Tente novamente em alguns minutos.');
  return body;
}

async function withRetries(callback, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await callback();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
    }
  }
  throw lastError;
}

async function findCatmatWithRetry(description) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const catalog = await api('/api/catmat', { q: description, limit: 8 });
      if (catalog.items?.length || attempt === 1) return catalog;
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 650));
  }
  if (lastError) throw lastError;
  return { items: [] };
}

function setProgress(current, total) {
  $('progressWrap').classList.remove('hidden');
  $('progressWrap').setAttribute('aria-hidden', 'false');
  $('progressBar').style.width = `${Math.max(3, Math.round((current / Math.max(1, total)) * 100))}%`;
}

async function mapLimit(list, concurrency, callback) {
  const output = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, list.length) }, async () => {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await callback(list[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function search() {
  if (!state.items.length) return status('Importe uma planilha ou use o modelo antes de pesquisar.', true);
  let period;
  try { period = getPeriod(); } catch (error) { return status(error.message, true); }
  persistSettings();
  $('searchButton').disabled = true;
  $('searchButton').innerHTML = '<span>◌</span>Pesquisando…';
  state.results = [];
  const totalSteps = state.items.length * 2;
  let completedSteps = 0;
  setProgress(0, totalSteps);
  setStage(2);

  try {
    status('Etapa 1 de 2: identificando os CATMAT com busca híbrida e validação das especificações…');
    await mapLimit(state.items, 1, async (item, index) => {
      try {
        const catalog = await findCatmatWithRetry(item.descricao);
        item.catmatSuggestions = catalog.items || [];
        item.catmat = item.catmatSuggestions[0] || null;
        item.catalogError = item.catmat ? '' : 'Nenhum CATMAT semanticamente compatível foi localizado.';
      } catch (error) {
        item.catmatSuggestions = [];
        item.catmat = null;
        item.catalogError = error.message;
      }
      completedSteps += 1;
      setProgress(completedSteps, totalSteps);
      status(`CATMAT: ${completedSteps} de ${state.items.length} itens analisados.`);
      renderItems();
      if (index % 2 === 0) await save();
    });
    await save();

    const classified = state.items.filter((item) => item.catmat);
    setStage(3);
    status(`Etapa 2 de 2: validando até quatro CATMAT por item com preços reais do PNCP…`);
    const priceGroups = await mapLimit(classified, 2, async (item, index) => {
      try {
        const resolution = await withRetries(() => postApi('/api/resolve-prices', {
          query: item.descricao,
          unit: item.unidade || '',
          candidates: item.catmatSuggestions,
          start: period.start,
          end: period.end,
          limit: $('resultCount').value,
          minScore: $('minScore').value,
        }), 2);
        item.catmat = resolution.selected || item.catmat;
        return {
          item,
          catmat: item.catmat,
          alternatives: resolution.alternatives || item.catmatSuggestions.filter((candidate) => candidate.codigoItem !== item.catmat.codigoItem),
          found: resolution.items || [],
          message: resolution.message || '',
          testedCatmats: resolution.testedCatmats || 1,
          evaluations: resolution.evaluations || [],
          candidates: item.catmatSuggestions,
        };
      } catch (error) {
        return { item, catmat: item.catmat, alternatives: item.catmatSuggestions.slice(1), candidates: item.catmatSuggestions, found: [], message: error.message };
      } finally {
        completedSteps += 1;
        setProgress(completedSteps, totalSteps);
        status(`PNCP: ${index + 1} de ${classified.length} itens consultados.`);
      }
    });

    const byDescription = new Map(priceGroups.map((group) => [group.item.descricao, group]));
    state.results = state.items.map((item) => byDescription.get(item.descricao) || {
      item, catmat: null, alternatives: [], candidates: item.catmatSuggestions || [], found: [], message: item.catalogError || 'CATMAT não identificado com segurança.',
    });
    setProgress(totalSteps, totalSteps);
    await save();
    renderResults();
    setStage(4, true);
    const pricesFound = state.results.reduce((sum, group) => sum + group.found.length, 0);
    const catalogsFound = state.results.filter((group) => group.catmat).length;
    status(`Pesquisa concluída: ${catalogsFound} CATMAT e ${pricesFound} preços comparáveis. Confirme os registros na fonte oficial.`);
    $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    status(error.message || 'Não foi possível concluir a pesquisa agora.', true);
  } finally {
    $('searchButton').disabled = false;
    $('searchButton').innerHTML = '<span>▶</span>Iniciar pesquisa <i>›</i>';
    setTimeout(() => $('progressWrap').classList.add('hidden'), 1000);
  }
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function scoreClass(score) {
  return score >= 80 ? 'high' : (score >= 65 ? 'medium' : 'low');
}

function formatDate(value) {
  return value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
}

function groupCandidates(group) {
  const unique = new Map();
  [group.catmat, ...(group.candidates || []), ...(group.alternatives || [])].filter(Boolean)
    .forEach((candidate) => unique.set(String(candidate.codigoItem), candidate));
  return [...unique.values()];
}

function manualCatmatControl(group, groupIndex) {
  const content = `<form class="catmat-manual" data-group="${groupIndex}">
    <label for="manualCatmat-${groupIndex}">Código CATMAT</label>
    <span><input id="manualCatmat-${groupIndex}" name="catmat" inputmode="numeric" autocomplete="off" pattern="[0-9]+" maxlength="12" placeholder="Ex.: 461889" aria-label="Código CATMAT do item ${groupIndex + 1}" ${group.loading ? 'disabled' : ''} /><button type="submit" ${group.loading ? 'disabled' : ''}>Pesquisar</button></span>
    <small>Informe apenas os números. O código será validado no catálogo oficial.</small>
  </form>`;
  return `<details class="catmat-manual-wrap" ${group.catmat ? '' : 'open'}><summary>Informar CATMAT manualmente</summary>${content}</details>`;
}

function catalogCell(group, groupIndex, allowChoice = true) {
  if (!group.catmat) return `<div class="catalog-detail"><span class="pending-chip">Não identificado</span>${allowChoice ? manualCatmatControl(group, groupIndex) : ''}</div>`;
  const reason = group.catmat.selectionReason ? `<span class="selection-reason">${esc(group.catmat.selectionReason)}</span>` : '';
  const alternatives = groupCandidates(group).filter((candidate) => String(candidate.codigoItem) !== String(group.catmat.codigoItem));
  const choices = allowChoice && alternatives.length
    ? `<details class="catmat-choices"><summary>Escolher outro CATMAT</summary><div class="catmat-options">${alternatives.map((item) => `<button type="button" class="catmat-option" data-group="${groupIndex}" data-code="${esc(item.codigoItem)}" ${group.loading ? 'disabled' : ''}><strong>${esc(item.codigoItem)} · ${esc(item.nomePdm || 'CATMAT')}</strong><span>${esc(item.descricaoItem || item.nomePdm)}</span><em>${esc(item.score)}% · Pesquisar preços</em></button>`).join('')}</div></details>` : '';
  const refresh = allowChoice ? `<button type="button" class="catmat-refresh" data-group="${groupIndex}" data-code="${esc(group.catmat.codigoItem)}" ${group.loading ? 'disabled' : ''}>↻ ${group.loading ? 'Buscando preços…' : 'Consultar este CATMAT'}</button>` : '';
  return `<div class="catalog-detail"><span class="catmat-code">${esc(group.catmat.codigoItem)}</span><small>${esc(group.catmat.descricaoItem || group.catmat.nomePdm)}</small>${reason}${choices}${refresh}${allowChoice ? manualCatmatControl(group, groupIndex) : ''}</div>`;
}

async function chooseCatmat(groupIndex, code, manual = false) {
  const group = state.results[groupIndex];
  if (!group || group.loading) return;
  const candidates = groupCandidates(group);
  const normalizedCode = String(code || '').replace(/\D/g, '');
  if (!normalizedCode) return status('Informe um código CATMAT numérico.', true);
  const candidate = candidates.find((item) => String(item.codigoItem) === normalizedCode)
    || (manual ? { codigoItem: normalizedCode, descricaoItem: 'Validando código informado…', nomePdm: 'CATMAT informado', score: 0 } : null);
  if (!candidate) return status('O CATMAT escolhido não está mais disponível nesta pesquisa.', true);
  let period;
  try { period = getPeriod(); } catch (error) { return status(error.message, true); }

  const previous = {
    catmat: group.catmat,
    itemCatmat: group.item.catmat,
    alternatives: group.alternatives,
    found: group.found,
    message: group.message,
  };
  const requestId = `${Date.now()}-${Math.random()}`;
  group.loading = true;
  group.priceRequestId = requestId;
  group.candidates = candidates;
  group.catmat = { ...candidate, selectionReason: manual ? 'CATMAT informado pelo usuário' : 'Selecionado manualmente pelo usuário' };
  group.item.catmat = group.catmat;
  group.alternatives = candidates.filter((item) => String(item.codigoItem) !== String(candidate.codigoItem));
  group.found = [];
  group.message = manual ? 'Validando o CATMAT e consultando preços no PNCP…' : 'Consultando preços no PNCP para o CATMAT escolhido…';
  renderItems();
  renderResults();
  status(`${manual ? 'Validando e consultando' : 'Consultando'} o CATMAT ${candidate.codigoItem} no PNCP…`);

  try {
    const prices = await withRetries(() => postApi('/api/prices', {
      query: group.item.descricao,
      unit: group.item.unidade || '',
      catmat: candidate.codigoItem,
      catmatDescription: candidate.descricaoItem || candidate.nomePdm || '',
      catmatScore: candidate.score || 0,
      start: period.start,
      end: period.end,
      limit: $('resultCount').value,
      minScore: $('minScore').value,
    }), 2);
    if (group.priceRequestId !== requestId) return;
    const confirmed = prices.catmat || candidate;
    group.catmat = {
      ...confirmed,
      selectionReason: manual ? 'CATMAT informado e validado pelo usuário' : 'CATMAT escolhido pelo usuário',
    };
    group.item.catmat = group.catmat;
    group.candidates = groupCandidates({ ...group, catmat: group.catmat });
    group.alternatives = group.candidates.filter((item) => String(item.codigoItem) !== String(group.catmat.codigoItem));
    group.found = prices.items || [];
    group.message = prices.message || '';
    status(group.found.length
      ? `${group.found.length} preço(s) encontrado(s) no PNCP para o CATMAT ${group.catmat.codigoItem}.`
      : (group.message || `Nenhum preço localizado no PNCP para o CATMAT ${group.catmat.codigoItem}.`));
  } catch (error) {
    if (group.priceRequestId !== requestId) return;
    group.catmat = previous.catmat;
    group.item.catmat = previous.itemCatmat;
    group.alternatives = previous.alternatives;
    group.found = previous.found;
    group.message = manual
      ? `${error.message} Confira o código informado e tente novamente.`
      : `${error.message} Use “Consultar este CATMAT” para tentar novamente.`;
    status(group.message, true);
  } finally {
    if (group.priceRequestId === requestId) {
      group.loading = false;
      delete group.priceRequestId;
      await save();
      renderItems();
      renderResults();
    }
  }
}

function renderResults() {
  const section = $('resultsSection');
  const body = $('resultsTableBody');
  section.classList.toggle('hidden', !state.results.length);
  const priceCount = state.results.reduce((sum, group) => sum + (group.found?.length || 0), 0);
  const catalogCount = state.results.filter((group) => group.catmat).length;
  const successCount = state.results.filter((group) => group.found?.length).length;
  $('metricProcessed').textContent = state.items.length;
  $('metricCatmat').textContent = catalogCount;
  $('metricPrices').textContent = priceCount;
  $('metricSuccess').textContent = state.items.length ? `${Math.round((successCount / state.items.length) * 100)}%` : '0%';
  $('metricCatmatDetail').textContent = state.items.length ? `${Math.round((catalogCount / state.items.length) * 100)}% dos itens classificados` : 'Aguardando pesquisa';
  $('metricPricesDetail').textContent = catalogCount ? `Média de ${(priceCount / catalogCount).toFixed(1)} por CATMAT` : 'Aguardando pesquisa';

  const rows = [];
  state.results.forEach((group, groupIndex) => {
    if (!group.found?.length) {
      rows.push(`<tr class="empty-row"><td data-label="Item">${groupIndex + 1}</td><td data-label="Material" class="item-name">${esc(group.item.descricao)}</td><td data-label="Similaridade">—</td><td data-label="CATMAT">${catalogCell(group, groupIndex)}</td><td data-label="Resultado" colspan="4">${esc(group.message || 'Nenhum preço comparável atingiu os critérios definidos.')}</td></tr>`);
      return;
    }
    group.found.forEach((result, resultIndex) => {
      const reasons = result.matchReasons?.length ? result.matchReasons.join(' · ') : 'Comparação por descrição e especificações';
      rows.push(`<tr><td data-label="Item">${groupIndex + 1}.${resultIndex + 1}</td><td data-label="Material" class="item-name">${esc(group.item.descricao)}<small>${esc(reasons)}</small></td><td data-label="Similaridade"><span class="match-pill ${scoreClass(result.score)}">${result.score}%</span></td><td data-label="CATMAT">${catalogCell(group, groupIndex, resultIndex === 0)}</td><td data-label="Preço / PNCP" class="price-cell"><strong>${money(result.valor)}</strong><small>Item ${esc(result.numeroItemPncp || '—')} · ${esc(result.descricao)}</small></td><td data-label="Unidade">${esc(result.unidade || '—')}</td><td data-label="Órgão / data" class="agency-date">${esc(result.orgao || '—')}<small>${formatDate(result.data)} · <span class="type-pill">${esc(result.tipo || 'Registro')}</span></small></td><td data-label="Fonte"><a class="official-link" href="${esc(result.link)}" target="_blank" rel="noopener">↗ Abrir compra</a></td></tr>`);
    });
  });
  body.innerHTML = rows.join('');
  filterRows();
  if (state.results.length) setStage(4, true);
}

function filterRows() {
  const term = normalizeHeader($('globalSearch').value);
  document.querySelectorAll('#resultsTableBody tr').forEach((row) => row.classList.toggle('filtered-out', Boolean(term) && !normalizeHeader(row.textContent).includes(term)));
}

function status(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
}

function sample() {
  state.items = [
    { descricao: 'Papel sulfite A4, 75 g/m², branco, resma com 500 folhas', unidade: 'Resma', quantidade: '20' },
    { descricao: 'Caneta esferográfica azul, ponta média 1,0 mm', unidade: 'Unidade', quantidade: '100' },
    { descricao: 'Lâmpada LED bulbo 12 W bivolt', unidade: 'Unidade', quantidade: '30' },
  ];
  state.results = [];
  save();
  renderItems();
  renderResults();
  status('Modelo carregado. Revise os itens e inicie a pesquisa.');
  $('nova-pesquisa').scrollIntoView({ behavior: 'smooth' });
}

function csv() {
  const rows = [['Item pesquisado', 'CATMAT', 'Descrição CATMAT', 'Descrição encontrada', 'Similaridade', 'Preço', 'Item no PNCP', 'ID da contratação PNCP', 'Unidade', 'Órgão', 'Data', 'Tipo', 'Link PNCP']];
  state.results.forEach((group) => group.found.forEach((result) => rows.push([
    group.item.descricao, group.catmat?.codigoItem, group.catmat?.descricaoItem, result.descricao, `${result.score}%`, result.valor,
    result.numeroItemPncp, result.numeroControlePncp, result.unidade, result.orgao, result.data, result.tipo, result.link,
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
  setStage(1);
  status('Dados locais removidos.');
};
fields.forEach((id) => $(id).addEventListener('change', () => { updateControls(); persistSettings(); }));
$('resultCount').addEventListener('input', updateControls);
$('minScore').addEventListener('input', updateControls);
$('globalSearch').addEventListener('input', filterRows);
$('resultsTableBody').addEventListener('click', (event) => {
  const button = event.target.closest('.catmat-option, .catmat-refresh');
  if (button) {
    event.preventDefault();
    chooseCatmat(Number(button.dataset.group), button.dataset.code);
  }
});
$('resultsTableBody').addEventListener('submit', (event) => {
  const form = event.target.closest('.catmat-manual');
  if (!form) return;
  event.preventDefault();
  const input = form.elements.catmat;
  const code = String(input.value || '').replace(/\D/g, '');
  input.value = code;
  chooseCatmat(Number(form.dataset.group), code, true);
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('globalSearch').focus(); }
});
['dragenter', 'dragover'].forEach((name) => $('dropzone').addEventListener(name, (event) => { event.preventDefault(); $('dropzone').classList.add('dragging'); }));
['dragleave', 'drop'].forEach((name) => $('dropzone').addEventListener(name, (event) => { event.preventDefault(); $('dropzone').classList.remove('dragging'); }));
$('dropzone').addEventListener('drop', (event) => event.dataTransfer.files[0] && importFile(event.dataTransfer.files[0]));

setStage(1);
updateControls();
load();
