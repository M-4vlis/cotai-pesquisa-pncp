const html = "__COTAI_HTML__";
const ogImageBase64 = "__COTAI_OG_BASE64__";
const memoryCache = new Map();

const upstreamHeaders = {
  accept: 'application/json',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' },
  });
}

const aliasGroups = [
  ['caneta', 'esferografica'], ['notebook', 'laptop', 'microcomputador'], ['celular', 'smartphone', 'telefone'],
  ['refrigerador', 'geladeira'], ['alcool', 'etanol'], ['toner', 'cartucho'], ['pendrive', 'pen', 'drive'],
  ['arcondicionado', 'condicionador'], ['sanitario', 'sanitaria', 'hidraulica'], ['pne', 'acessibilidade'],
  ['contra', 'sede'], ['refil', 'elemento', 'filtrante'], ['sulfite', 'papel', 'impressao'],
  ['lampada', 'bulbo'], ['copo', 'recipiente'], ['mascara', 'respirador'], ['mouse', 'apontador'],
];
const aliases = Object.fromEntries(aliasGroups.flatMap((group) => group.map((token) => [token, group.filter((value) => value !== token)])));
const stopTokens = new Set(['com', 'para', 'das', 'dos', 'uma', 'umas', 'uns', 'por', 'sem', 'tipo', 'modelo', 'unidade', 'unidades', 'uso', 'nome', 'referencia', 'de', 'da', 'do', 'e', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos']);
const lowValueTokens = new Set(['acabamento', 'completo', 'completa', 'superior', 'inferior', 'cromado', 'cromada', 'material', 'aplicacao', 'caracteristicas', 'adicionais', 'bitola', 'acionamento', 'aproximado', 'aproximada']);
const genericObjectTokens = new Set(['aquisicao', 'fornecimento', 'compra', 'contratacao', 'material', 'produto', 'item', 'peca', 'pecas', 'acessorio', 'acessorios', 'kit', 'conjunto', 'lote', 'base', 'acabamento', 'completo', 'completa', 'marca']);
const colorTokens = new Set(['azul', 'amarelo', 'branco', 'branca', 'cinza', 'colorido', 'incolor', 'laranja', 'marrom', 'preto', 'preta', 'rosa', 'roxo', 'verde', 'vermelho', 'vermelha']);
const materialTokens = new Set(['aco', 'algodao', 'aluminio', 'borracha', 'ceramica', 'couro', 'inox', 'latex', 'madeira', 'metal', 'nitrilica', 'nitrilico', 'papel', 'plastico', 'poliester', 'polipropileno', 'pvc', 'tecido', 'vidro', 'vinil']);
const unitDefinitions = {
  mm: ['mm', 'milimetro', 'milimetros'], cm: ['cm', 'centimetro', 'centimetros'], m: ['m', 'metro', 'metros'],
  ml: ['ml', 'mililitro', 'mililitros'], l: ['l', 'lt', 'litro', 'litros'], g: ['g', 'gr', 'grama', 'gramas'],
  kg: ['kg', 'quilo', 'quilos', 'quilograma', 'quilogramas'], w: ['w', 'watt', 'watts'], v: ['v', 'volt', 'volts'],
  ah: ['ah', 'amperehora'], mah: ['mah'], gb: ['gb', 'gigabyte', 'gigabytes'], tb: ['tb', 'terabyte', 'terabytes'],
  pol: ['pol', 'polegada', 'polegadas'], mlm: ['milmicra'],
  un: ['un', 'und', 'unidade', 'unidades'], cx: ['cx', 'caixa', 'caixas'], pct: ['pct', 'pacote', 'pacotes'],
  fr: ['fr', 'frasco', 'frascos'], rl: ['rl', 'rolo', 'rolos'], par: ['par', 'pares'], resma: ['resma', 'resmas'],
};
const unitLookup = Object.fromEntries(Object.entries(unitDefinitions).flatMap(([unit, values]) => values.map((value) => [value, unit])));

function baseTokens(value = '') {
  const prepared = String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ar\s*-?\s*condicionado/g, 'arcondicionado')
    .replace(/pen\s*-?\s*drive/g, 'pendrive')
    .replace(/ampere\s*-?\s*hora/g, 'amperehora')
    .replace(/(\d+)\s*[.,\s]\s*(\d+)\s*\/\s*(\d+)/g, '$1_$2_$3')
    .replace(/(\d+)\s*\/\s*(\d+)/g, '$1_$2');
  return prepared.replace(/[^a-z0-9_ ]/g, ' ').split(/\s+/)
    .filter((token) => token.length > 1 && !stopTokens.has(token));
}

function normalize(value = '') {
  return [...new Set(baseTokens(value).flatMap((token) => [token, ...(aliases[token] || [])]))];
}

function tokenStem(token = '') {
  if (/\d/.test(token) || token.length < 5) return token;
  return token.replace(/(oes|aes)$/g, 'ao').replace(/ais$/g, 'al').replace(/eis$/g, 'el')
    .replace(/(mente|amentos|imentos|amento|imento)$/g, '').replace(/(adoras|adores|adora|ador)$/g, '')
    .replace(/(icos|icas|ico|ica|osos|osas|oso|osa)$/g, '').replace(/(es|s)$/g, '');
}

function trigrams(value = '') {
  const normalized = `  ${value} `;
  const result = new Set();
  for (let index = 0; index < normalized.length - 2; index += 1) result.add(normalized.slice(index, index + 3));
  return result;
}

function diceCoefficient(left = '', right = '') {
  if (left === right) return 1;
  if (left.length < 3 || right.length < 3) return 0;
  const a = trigrams(left);
  const b = trigrams(right);
  let intersection = 0;
  a.forEach((gram) => { if (b.has(gram)) intersection += 1; });
  return (2 * intersection) / (a.size + b.size || 1);
}

function tokenAffinity(left, right) {
  if (left === right) return 1;
  if (/\d/.test(left) || /\d/.test(right)) return 0;
  if (tokenStem(left) === tokenStem(right)) return 0.94;
  if (left.length >= 4 && right.length >= 4 && (left.startsWith(right) || right.startsWith(left))) return 0.88;
  const fuzzy = diceCoefficient(left, right);
  return fuzzy >= 0.58 ? Math.min(0.84, fuzzy) : 0;
}

function tokenMatches(token, targets) {
  return [...targets].some((value) => tokenAffinity(token, value) >= 0.84);
}

function tokenWeight(token) {
  if (genericObjectTokens.has(token)) return 0.22;
  if (lowValueTokens.has(token)) return 0.38;
  if (/\d/.test(token)) return 1.55;
  return token.length >= 9 ? 1.25 : 1;
}

function lateInteractionScore(query, candidate) {
  const source = baseTokens(query);
  const target = normalize(candidate);
  if (!source.length || !target.length) return 0;
  let total = 0;
  let weight = 0;
  source.forEach((token) => {
    const expanded = [token, ...(aliases[token] || [])];
    const best = Math.max(0, ...expanded.flatMap((value) => target.map((other) => tokenAffinity(value, other))));
    const currentWeight = tokenWeight(token);
    total += best * currentWeight;
    weight += currentWeight;
  });
  return Math.round((total / (weight || 1)) * 100);
}

function phraseScore(query, candidate) {
  const source = baseTokens(query).filter((token) => !genericObjectTokens.has(token));
  const target = ` ${baseTokens(candidate).join(' ')} `;
  const phrases = source.slice(0, 8).flatMap((token, index) => index < source.length - 1 ? [`${token} ${source[index + 1]}`] : []);
  if (!phrases.length) return 0;
  return Math.round((phrases.filter((phrase) => target.includes(` ${phrase} `)).length / phrases.length) * 100);
}

function similarity(query, candidate) {
  const late = lateInteractionScore(query, candidate);
  const phrase = phraseScore(query, candidate);
  const queryText = baseTokens(query).join(' ');
  const candidateText = baseTokens(candidate).join(' ');
  const fuzzy = Math.round(diceCoefficient(queryText, candidateText) * 100);
  return Math.min(100, Math.round((late * 0.72) + (phrase * 0.16) + (fuzzy * 0.12)));
}

function headMatches(query, candidate) {
  const heads = anchorTokens(query);
  if (!heads.length) return similarity(query, candidate) >= 45;
  const target = new Set(normalize(candidate));
  return heads.some((head) => normalize(head).some((token) => tokenMatches(token, target)));
}

function anchorTokens(value = '') {
  const tokens = baseTokens(value).filter((token) => !genericObjectTokens.has(token) && !lowValueTokens.has(token) && !/^\d/.test(token));
  return [...new Set(tokens)];
}

function semanticEvidence(query, candidate) {
  const anchors = anchorTokens(query);
  const target = new Set(normalize(candidate));
  const matched = anchors.filter((token) => tokenMatches(token, target));
  return {
    anchors: anchors.length,
    matched: new Set(matched).size,
    coverage: anchors.length ? new Set(matched).size / anchors.length : 0,
  };
}

function normalizedUnit(unit = '') {
  const token = baseTokens(unit)[0] || String(unit).toLowerCase();
  return unitLookup[token] || token;
}

function unitFamily(unit) {
  if (['mm', 'cm', 'm', 'pol'].includes(unit)) return 'length';
  if (['ml', 'l'].includes(unit)) return 'volume';
  if (['g', 'kg'].includes(unit)) return 'mass';
  if (['gb', 'tb'].includes(unit)) return 'storage';
  return unit;
}

function normalizedMeasure(value, unit) {
  const numeric = Number(String(value).replace(',', '.'));
  const factors = { mm: 1, cm: 10, m: 1000, pol: 25.4, ml: 1, l: 1000, g: 1, kg: 1000, gb: 1, tb: 1000 };
  return { value: numeric * (factors[unit] || 1), family: unitFamily(unit), unit };
}

function extractMeasures(value = '') {
  const normalized = String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d)\s*,\s*(\d)/g, '$1.$2');
  const unitPattern = Object.keys(unitLookup).sort((a, b) => b.length - a.length).join('|');
  const expression = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${unitPattern})(?![a-z])`, 'gi');
  const measures = [];
  let match;
  while ((match = expression.exec(normalized))) measures.push(normalizedMeasure(match[1], normalizedUnit(match[2])));
  return measures.filter((item) => Number.isFinite(item.value));
}

function specificationCompatibility(query, candidate) {
  const requested = extractMeasures(query);
  if (!requested.length) return { score: 65, conflicts: 0, matched: 0, total: 0 };
  const offered = extractMeasures(candidate);
  if (!offered.length) return { score: 52, conflicts: 0, matched: 0, total: requested.length };
  let points = 0;
  let conflicts = 0;
  let matched = 0;
  requested.forEach((spec) => {
    const comparable = offered.filter((item) => item.family === spec.family);
    if (!comparable.length) { points += 0.45; return; }
    const distance = Math.min(...comparable.map((item) => Math.abs(item.value - spec.value) / Math.max(1, Math.abs(spec.value))));
    if (distance <= 0.025) { points += 1; matched += 1; }
    else if (distance <= 0.12) { points += 0.7; matched += 1; }
    else { conflicts += 1; }
  });
  return { score: Math.round((points / requested.length) * 100), conflicts, matched, total: requested.length };
}

function categoricalConflict(query, candidate, dictionary) {
  const source = new Set(baseTokens(query).filter((token) => dictionary.has(token)));
  const target = new Set(baseTokens(candidate).filter((token) => dictionary.has(token)));
  if (!source.size || !target.size) return 0;
  return [...source].some((token) => target.has(token)) ? 0 : 1;
}

function constraintPenalty(query, candidate) {
  const specs = specificationCompatibility(query, candidate);
  return (specs.conflicts * 14) + (categoricalConflict(query, candidate, colorTokens) * 12)
    + (categoricalConflict(query, candidate, materialTokens) * 14);
}

async function fetchJson(url, { timeout = 12000, retries = 1, ttl = 0 } = {}) {
  const cached = memoryCache.get(url);
  if (cached && cached.expires > Date.now()) return cached.value;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { headers: upstreamHeaders, signal: controller.signal });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || !type.includes('json')) throw new Error(`upstream_${response.status}`);
      let value = await response.json();
      if (typeof value === 'string' && /^[\[{]/.test(value.trim())) {
        try { value = JSON.parse(value); } catch { /* Mantém a resposta original se não for JSON duplamente codificado. */ }
      }
      if (ttl) memoryCache.set(url, { value, expires: Date.now() + ttl });
      return value;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

const comprasBase = 'https://dadosabertos.compras.gov.br';
const pncpBase = 'https://pncp.gov.br';
const catalogoBase = 'https://cnbs.estaleiro.serpro.gov.br/cnbs-api';

async function getClasses() {
  const urls = [1, 2].map((page) => `${comprasBase}/modulo-material/2_consultarClasseMaterial?pagina=${page}&tamanhoPagina=500&statusClasse=true`);
  const pages = await Promise.all(urls.map((url) => fetchJson(url, { ttl: 86400000 })));
  return pages.flatMap((page) => page.resultado || []);
}

function hintedGroups(query) {
  const map = {
    70: ['computador', 'notebook', 'mouse', 'teclado', 'monitor', 'impressora', 'scanner', 'informatica', 'ssd', 'hd'],
    71: ['cadeira', 'mesa', 'armario', 'estante', 'gaveteiro', 'mobiliario'],
    72: ['copo', 'prato', 'talher', 'panela', 'utensilio'],
    75: ['caneta', 'lapis', 'borracha', 'envelope', 'grampeador', 'pasta', 'expediente'],
    93: ['papel', 'papelao', 'cartolina', 'sulfite', 'resma'],
    79: ['limpeza', 'vassoura', 'rodo', 'detergente', 'desinfetante', 'sabao'],
    84: ['uniforme', 'camisa', 'calca', 'bota', 'vestuario'],
    85: ['higiene', 'sabonete', 'papel higienico', 'creme dental'],
    65: ['medicamento', 'hospitalar', 'seringa', 'agulha', 'luva cirurgica'],
  };
  const tokens = new Set(normalize(query));
  const text = [...tokens].join(' ');
  const groups = Object.entries(map).filter(([, words]) => words.some((word) => text.includes(word))).map(([code]) => Number(code));
  const plumbing = ['descarga', 'canopla', 'vaso', 'sanitario', 'torneira', 'chuveiro', 'acoplada', 'hidraulica'];
  const valveParts = ['acabamento', 'base', 'kit', 'sede', 'reparo', 'botao'];
  if (plumbing.some((token) => tokens.has(token))) groups.push(45);
  if (tokens.has('valvula') && valveParts.some((token) => tokens.has(token))) groups.push(45);
  if (tokens.has('valvula') && !groups.includes(45)) groups.push(48);
  return [...new Set(groups)];
}

function preferredPdms(query) {
  const tokens = new Set(normalize(query));
  const has = (...values) => values.every((value) => tokens.has(value));
  const preferred = [];
  const valvePart = ['canopla', 'botao', 'acabamento', 'kit', 'base', 'sede', 'reparo'].some((token) => tokens.has(token));
  if (tokens.has('canopla')) preferred.push(4429);
  if (has('botao', 'descarga')) preferred.push(3828);
  if (has('acabamento', 'valvula') || has('acabamento', 'descarga')) preferred.push(16221);
  if ((tokens.has('kit') || tokens.has('base') || tokens.has('sede')) && tokens.has('valvula')) preferred.push(11649);
  if (has('valvula', 'descarga') && !valvePart) preferred.push(16403);
  if (tokens.has('papel') && (tokens.has('a4') || has('210', '297'))) preferred.push(19746);
  if (has('caneta', 'esferografica')) preferred.push(99);
  return preferred;
}

function pdmCode(item) {
  return Number(item.codigoPdm ?? item.codigoPDM);
}

function fusePdmLists(lists) {
  const activeLists = lists.filter((list) => Array.isArray(list) && list.length);
  const fused = new Map();
  activeLists.forEach((list, listIndex) => list.forEach((item, rank) => {
    const code = pdmCode(item);
    if (!code) return;
    const current = fused.get(code) || { ...item, codigoPdm: code, _rrfRaw: 0, _sourceCount: 0 };
    current._rrfRaw += 1 / (60 + rank + 1);
    current._sourceCount += 1;
    current._official = current._official || item._official;
    current._preferredSource = current._preferredSource || item._preferredSource;
    current._firstSource = Math.min(current._firstSource ?? listIndex, listIndex);
    fused.set(code, current);
  }));
  const maximum = activeLists.length ? activeLists.length / 61 : 1;
  return [...fused.values()].map((item) => ({ ...item, _rrf: Math.min(100, Math.round((item._rrfRaw / maximum) * 100)) }));
}

function rankPdms(query, items) {
  const preferred = preferredPdms(query);
  const groups = hintedGroups(query);
  return items.map((item) => {
    const codigoPdm = pdmCode(item);
    const nomePdm = item.nomePdm || item.descricaoPDM || '';
    const className = item.nomeClasse || item.descricaoClasse || '';
    const groupName = item.nomeGrupo || item.descricaoGrupo || '';
    const classification = `${nomePdm} ${className} ${groupName}`;
    const nameScore = similarity(query, nomePdm);
    const contextScore = Math.round((similarity(query, className) * 0.68) + (similarity(query, groupName) * 0.32));
    const objectScore = lateInteractionScore(anchorTokens(query).slice(0, 5).join(' '), `${nomePdm} ${className}`);
    const evidence = semanticEvidence(query, nomePdm);
    const preferredMatch = preferred.includes(codigoPdm);
    const groupMatch = groups.includes(Number(item.codigoGrupo));
    const score = Math.min(100, Math.round(
      (nameScore * 0.43) + (contextScore * 0.16) + (objectScore * 0.22) + ((item._rrf || 0) * 0.13)
      + (groupMatch ? 6 : 0) + (preferredMatch ? 28 : 0),
    ));
    return { ...item, codigoPdm, nomePdm, _score: score, _nameScore: nameScore, _objectScore: objectScore, _evidence: evidence, _preferred: preferredMatch };
  }).filter((item) => {
    if (!item.codigoPdm || item.statusPDM === false || item.statusPdm === false) return false;
    return item._preferred || item._objectScore >= 42 || item._nameScore >= 34 || item._score >= 38;
  }).sort((a, b) => b._score - a._score);
}

function queryVariants(query) {
  const cleaned = baseTokens(query).join(' ').slice(0, 180);
  const anchors = anchorTokens(query).slice(0, 7);
  const expanded = [...new Set(anchors.flatMap((token) => [token, ...(aliases[token] || [])]))].slice(0, 8).join(' ');
  return [...new Set([anchors.slice(0, 3).join(' '), anchors.join(' '), expanded, cleaned].filter((term) => term.length >= 2))].slice(0, 4);
}

async function officialPdmLists(query) {
  const terms = queryVariants(query);
  const payloads = await Promise.all(terms.map((term) => fetchJson(
    `${catalogoBase}/material/v1/palavra?palavra=${encodeURIComponent(term)}&apenasAtivos=nao`,
    { timeout: 18000, retries: 1, ttl: 86400000 },
  ).catch(() => [])));
  return payloads.map((payload) => (Array.isArray(payload) ? payload : []).map((item) => ({ ...item, _official: true })));
}

async function directPreferredPdms(query) {
  const codes = preferredPdms(query);
  const pages = await Promise.all(codes.map((codigoPdm) => fetchJson(
    `${comprasBase}/modulo-material/3_consultarPdmMaterial?pagina=1&tamanhoPagina=20&codigoPdm=${codigoPdm}&statusPdm=true`,
    { ttl: 86400000 },
  ).catch(() => ({ resultado: [] }))));
  return pages.flatMap((page) => page.resultado || []);
}

async function hierarchicalPdms(query) {
  const classes = await getClasses();
  const groups = hintedGroups(query);
  const eligible = groups.length ? classes.filter((item) => groups.includes(Number(item.codigoGrupo))) : classes;
  const rankedClasses = eligible.map((item) => ({ ...item, _score: similarity(query, `${item.nomeGrupo} ${item.nomeClasse}`) }))
    .sort((a, b) => b._score - a._score).slice(0, groups.length ? 10 : 8);
  const pages = await Promise.all(rankedClasses.map((item) => fetchJson(
    `${comprasBase}/modulo-material/3_consultarPdmMaterial?pagina=1&tamanhoPagina=500&codigoClasse=${item.codigoClasse}&statusPdm=true`,
    { ttl: 86400000 },
  ).catch(() => ({ resultado: [] }))));
  return pages.flatMap((page) => page.resultado || []);
}

async function searchCatmat(query, limit) {
  const [officialLists, preferred] = await Promise.all([
    officialPdmLists(query).catch(() => []),
    directPreferredPdms(query),
  ]);
  const retrievalLists = [preferred.map((item) => ({ ...item, _preferredSource: true })), ...officialLists];
  let pdms = rankPdms(query, fusePdmLists(retrievalLists));
  if (pdms.length < 10 || (pdms[0]?._score || 0) < 66) {
    const hierarchical = await hierarchicalPdms(query);
    pdms = rankPdms(query, fusePdmLists([...retrievalLists, hierarchical]));
  }
  pdms = pdms.slice(0, 14);
  if (!pdms.length) return [];

  const firstPages = await Promise.all(pdms.map(async (pdm) => ({ pdm, page: await fetchJson(
    `${comprasBase}/modulo-material/4_consultarItemMaterial?pagina=1&tamanhoPagina=500&codigoPdm=${pdm.codigoPdm}&statusItem=true`,
    { ttl: 86400000 },
  ).catch(() => ({ resultado: [] })) })));
  const overflowPages = await Promise.all(firstPages.slice(0, 4).flatMap(({ pdm, page }) => {
    const totalPages = Math.min(3, Number(page.totalPaginas) || 1);
    return Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => fetchJson(
      `${comprasBase}/modulo-material/4_consultarItemMaterial?pagina=${index + 2}&tamanhoPagina=500&codigoPdm=${pdm.codigoPdm}&statusItem=true`,
      { ttl: 86400000 },
    ).then((extra) => ({ pdm, page: extra })).catch(() => ({ pdm, page: { resultado: [] } })));
  }));
  const itemPages = [...firstPages, ...overflowPages];
  const seen = new Set();
  return itemPages.flatMap(({ pdm, page }) => (page.resultado || []).map((item) => ({ item, pdm }))).map(({ item, pdm }) => {
    const description = `${item.nomePdm || ''} ${item.descricaoItem || ''}`;
    const lexical = similarity(query, description);
    const objectScore = lateInteractionScore(anchorTokens(query).slice(0, 5).join(' '), description);
    const specs = specificationCompatibility(query, description);
    const evidence = semanticEvidence(query, description);
    const score = Math.min(100, Math.max(0, Math.round(
      (lexical * 0.43) + (pdm._score * 0.25) + (objectScore * 0.18) + (specs.score * 0.14)
      - constraintPenalty(query, description),
    )));
    const reasons = [];
    if (objectScore >= 75) reasons.push('objeto principal compatível');
    if (specs.total && specs.matched) reasons.push('medidas compatíveis');
    if (phraseScore(query, description) >= 35) reasons.push('descrição próxima');
    return {
      codigoItem: item.codigoItem,
      descricaoItem: item.descricaoItem || item.nomePdm,
      codigoPdm: item.codigoPdm,
      nomePdm: item.nomePdm,
      score,
      confidence: score >= 78 ? 'alta' : (score >= 60 ? 'boa' : 'possível'),
      reasons,
      _headMatch: headMatches(query, description),
      _semanticMatch: pdm._preferred || objectScore >= 48 || (pdm._objectScore >= 50 && lexical >= 34),
      _preferredPdm: pdm._preferred,
      _officialPdm: Boolean(pdm._official),
    };
  }).filter((item) => {
    if (!item.codigoItem || seen.has(item.codigoItem)) return false;
    seen.add(item.codigoItem);
    const threshold = item._preferredPdm ? 32 : (item._officialPdm ? 34 : 42);
    return item._headMatch && item._semanticMatch && item.score >= threshold;
  }).sort((a, b) => b.score - a.score).slice(0, limit)
    .map(({ _headMatch, _semanticMatch, _preferredPdm, _officialPdm, ...item }) => item);
}

function unwrapList(value) {
  if (Array.isArray(value)) return value;
  return value?.data || value?.content || value?.itens || value?.resultado || [];
}

async function fetchContractItems(contract) {
  const cnpj = contract.orgao_cnpj;
  const year = contract.ano;
  const sequence = contract.numero_sequencial;
  if (!cnpj || !year || sequence === undefined) return [];
  const url = `${pncpBase}/api/pncp/v1/orgaos/${cnpj}/compras/${year}/${sequence}/itens`;
  try {
    const payload = await fetchJson(url, { timeout: 15000, retries: 1 });
    return unwrapList(payload).map((item) => ({ ...item, _contract: contract }));
  } catch {
    return [];
  }
}

async function fetchItemResults(item) {
  if (!item.temResultado && Number(item.situacaoCompraItemId) !== 2) return [];
  const contract = item._contract;
  const url = `${pncpBase}/api/pncp/v1/orgaos/${contract.orgao_cnpj}/compras/${contract.ano}/${contract.numero_sequencial}/itens/${item.numeroItem}/resultados`;
  try {
    return unwrapList(await fetchJson(url, { timeout: 12000, retries: 1 }));
  } catch {
    return [];
  }
}

async function pncpReference(item) {
  const params = new URLSearchParams({
    tipo: 'idCompra',
    codigo: String(item.idCompra),
    idCompraItem: String(item.idCompraItem),
  });
  const payload = await fetchJson(
    `${comprasBase}/modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id?${params}`,
    { timeout: 15000, retries: 2, ttl: 3600000 },
  );
  const records = payload.resultado || [];
  const record = records.find((entry) => String(entry.idCompraItem) === String(item.idCompraItem)) || records[0];
  if (!record) return null;
  const control = String(record.numeroControlePNCPCompra || record.idContratacaoPNCP || '');
  const match = control.match(/^([a-z0-9]{14})-1-(\d+)\/(\d{4})$/i);
  if (!match) return null;
  return {
    numeroItemPncp: Number(record.numeroItemPncp || item.numeroItemCompra),
    numeroControlePncp: control,
    link: `${pncpBase}/app/editais/${match[1]}/${match[3]}/${Number(match[2])}`,
  };
}

function unitCompatibility(requested, offered) {
  const source = normalizedUnit(requested);
  const target = normalizedUnit(offered);
  if (!source) return 70;
  if (!target) return 58;
  if (source === target) return 100;
  return unitFamily(source) === unitFamily(target) ? 62 : 25;
}

function materialSimilarity(query, catmatDescription, candidate, requestedUnit, offeredUnit) {
  const queryScore = similarity(query, candidate);
  const catalogScore = similarity(catmatDescription, candidate);
  const objectScore = lateInteractionScore(anchorTokens(query).slice(0, 6).join(' '), candidate);
  const specs = specificationCompatibility(query, candidate);
  const unitScore = unitCompatibility(requestedUnit, offeredUnit);
  const score = Math.min(100, Math.max(0, Math.round(
    (queryScore * 0.42) + (catalogScore * 0.24) + (objectScore * 0.14) + (specs.score * 0.12)
    + (unitScore * 0.08) - constraintPenalty(query, candidate),
  )));
  const reasons = [];
  if (catalogScore >= 72) reasons.push('mesmo material CATMAT');
  if (objectScore >= 75) reasons.push('objeto compatÃ­vel');
  if (specs.total && specs.matched) reasons.push('medidas compatÃ­veis');
  if (unitScore === 100) reasons.push('unidade compatÃ­vel');
  return {
    score,
    reasons,
    details: { query: queryScore, catalog: catalogScore, object: objectScore, specifications: specs.score, unit: unitScore },
  };
}

async function searchPrices({ query, unit, catmat, catmatDescription, start, end, limit, minScore }) {
  const params = new URLSearchParams({
    pagina: '1', tamanhoPagina: '500', tipo: 'codigoItemCatalogo', codigo: catmat,
    dataResultado: 'true', dataCompraInicio: start, dataCompraFim: end,
  });
  const sourceUrl = `${comprasBase}/modulo-pesquisa-preco/1_consultarMaterial?${params}`;
  const payload = await fetchJson(sourceUrl, { timeout: 18000, retries: 2, ttl: 900000 });
  const seenPrices = new Set();
  const ranked = (payload.resultado || []).map((item) => {
    const description = item.descricaoDetalhadaItem || item.descricaoItem || catmatDescription;
    const offeredUnit = item.nomeUnidadeFornecimento || item.siglaUnidadeFornecimento || item.nomeUnidadeMedida || item.siglaUnidadeMedida || '';
    const match = materialSimilarity(query, catmatDescription, description, unit, offeredUnit);
    return {
      _source: item,
      descricao: description,
      valor: Number(item.precoUnitario),
      unidade: offeredUnit,
      orgao: item.nomeOrgao || item.nomeUasg || 'Órgão público',
      fornecedor: item.nomeFornecedor || '',
      data: item.dataResultado || item.dataCompra || '',
      tipo: 'Preço praticado',
      score: match.score,
      matchReasons: match.reasons,
      matchDetails: match.details,
    };
  }).filter((item) => {
    const key = `${item._source.idCompraItem || ''}:${item._source.idCompra || ''}:${item.valor}`;
    if (seenPrices.has(key)) return false;
    seenPrices.add(key);
    return item.valor > 0 && item.score >= minScore;
  })
    .sort((a, b) => b.score - a.score || a.valor - b.valor)
    .slice(0, Math.max(limit * 6, 30));

  const enriched = await Promise.all(ranked.map(async (item) => {
    try {
      const reference = await pncpReference(item._source);
      if (!reference) return null;
      const { _source, ...result } = item;
      return { ...result, ...reference };
    } catch {
      return null;
    }
  }));
  return enriched.filter(Boolean).slice(0, limit);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/og.png') {
      const binary = atob(ogImageBase64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new Response(bytes, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
    }
    if (url.pathname === '/api/catmat') {
      const query = (url.searchParams.get('q') || '').trim();
      if (query.length < 3) return json({ message: 'A descrição do item é muito curta para identificar o CATMAT.' }, 400);
      try {
        const items = await searchCatmat(query, Math.min(5, Number(url.searchParams.get('limit')) || 3));
        return json({ items });
      } catch {
        return json({ message: 'Não foi possível consultar o catálogo CATMAT agora. Tente novamente em alguns minutos.' }, 503);
      }
    }

    if (url.pathname === '/api/prices') {
      const input = {
        query: (url.searchParams.get('q') || '').trim(),
        unit: (url.searchParams.get('unit') || '').trim(),
        catmat: url.searchParams.get('catmat') || '',
        catmatDescription: url.searchParams.get('catmatDescription') || '',
        start: url.searchParams.get('start') || '',
        end: url.searchParams.get('end') || '',
        limit: Math.min(10, Number(url.searchParams.get('limit')) || 5),
        minScore: Number(url.searchParams.get('minScore')) || 65,
      };
      if (!input.query || !input.catmat || !/^\d{4}-\d{2}-\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end)) {
        return json({ message: 'Os dados da pesquisa estão incompletos.' }, 400);
      }
      try {
        const items = await searchPrices(input);
        return json({ items, message: items.length ? '' : 'Nenhum preço comparável foi localizado no PNCP para este CATMAT e período.' });
      } catch {
        return json({ message: 'O PNCP está demorando para responder. Aguarde um momento e tente novamente.' }, 503);
      }
    }

    if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('Não encontrado', { status: 404 });
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=UTF-8', 'cache-control': 'public, max-age=300' },
    });
  },
};
