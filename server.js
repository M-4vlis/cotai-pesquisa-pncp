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
  ['arcondicionado', 'condicionador'], ['sanitario', 'sanitaria', 'hidraulica'], ['pne', 'acessibilidade', 'acessivel'],
  ['contra', 'sede'], ['refil', 'elemento', 'filtrante'], ['sulfite', 'papel', 'impressao'],
  ['lampada', 'bulbo'], ['copo', 'recipiente'], ['mascara', 'respirador'], ['mouse', 'apontador'],
  ['drywall', 'gesso', 'acartonado'], ['eletroduto', 'conduite'], ['cotovelo', 'joelho'],
  ['fio', 'cabo', 'condutor'], ['brita', 'pedra'], ['porcelanato', 'revestimento'],
  ['interruptor', 'acionador'], ['disjuntor', 'termomagnetico'], ['rolamento', 'mancal'],
];
const aliases = Object.fromEntries(aliasGroups.flatMap((group) => group.map((token) => [token, group.filter((value) => value !== token)])));
const stopTokens = new Set(['com', 'para', 'das', 'dos', 'uma', 'umas', 'uns', 'por', 'sem', 'tipo', 'modelo', 'unidade', 'unidades', 'uso', 'nome', 'referencia', 'de', 'da', 'do', 'e', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos']);
const lowValueTokens = new Set(['acabamento', 'completo', 'completa', 'superior', 'inferior', 'cromado', 'cromada', 'material', 'aplicacao', 'caracteristicas', 'adicionais', 'bitola', 'acionamento', 'aproximado', 'aproximada']);
const genericObjectTokens = new Set(['aquisicao', 'fornecimento', 'compra', 'contratacao', 'material', 'produto', 'item', 'peca', 'pecas', 'acessorio', 'acessorios', 'kit', 'conjunto', 'lote', 'base', 'acabamento', 'completo', 'completa', 'marca']);
const packagingTokens = new Set(['saco', 'sacos', 'balde', 'baldes', 'barra', 'barras', 'rolo', 'rolos', 'caixa', 'caixas', 'pacote', 'pacotes', 'embalagem', 'galão', 'galao', 'lata', 'latas']);
const accessoryTokens = new Set(['base', 'suporte', 'refil', 'tampa', 'reparo', 'adaptador', 'aplicador', 'maquina', 'equipamento', 'fixacao', 'parafuso', 'prego', 'porca', 'arruela', 'calha', 'capa', 'estojo']);
const colorTokens = new Set(['azul', 'amarelo', 'branco', 'branca', 'cinza', 'colorido', 'incolor', 'laranja', 'marrom', 'preto', 'preta', 'rosa', 'roxo', 'verde', 'vermelho', 'vermelha']);
const materialTokens = new Set(['aco', 'algodao', 'aluminio', 'borracha', 'ceramica', 'couro', 'inox', 'latex', 'madeira', 'metal', 'nitrilica', 'nitrilico', 'papel', 'plastico', 'poliester', 'polipropileno', 'pvc', 'tecido', 'vidro', 'vinil']);
const unitDefinitions = {
  mm: ['mm', 'milimetro', 'milimetros'], cm: ['cm', 'centimetro', 'centimetros'], m: ['m', 'metro', 'metros'],
  mm2: ['mm2'], m2: ['m2'], m3: ['m3'],
  ml: ['ml', 'mililitro', 'mililitros'], l: ['l', 'lt', 'litro', 'litros'], g: ['g', 'gr', 'grama', 'gramas'],
  kg: ['kg', 'quilo', 'quilos', 'quilograma', 'quilogramas'], w: ['w', 'watt', 'watts'], v: ['v', 'volt', 'volts'],
  a: ['a', 'ampere', 'amperes'], hz: ['hz'], kva: ['kva'], cv: ['cv'], bar: ['bar'], psi: ['psi'],
  deg: ['gra', 'grau', 'graus'],
  ah: ['ah', 'amperehora'], mah: ['mah'], gb: ['gb', 'gigabyte', 'gigabytes'], tb: ['tb', 'terabyte', 'terabytes'],
  pol: ['pol', 'polegada', 'polegadas'], mlm: ['milmicra'],
  un: ['un', 'und', 'unidade', 'unidades'], cx: ['cx', 'caixa', 'caixas'], pct: ['pct', 'pacote', 'pacotes'],
  fr: ['fr', 'frasco', 'frascos'], rl: ['rl', 'rolo', 'rolos'], par: ['par', 'pares'], resma: ['resma', 'resmas'],
};
const unitLookup = Object.fromEntries(Object.entries(unitDefinitions).flatMap(([unit, values]) => values.map((value) => [value, unit])));
const exclusiveAttributeGroups = [
  ['unipolar', 'monopolar', 'bipolar', 'tripolar', 'tetrapolar'],
  ['monofasico', 'bifasico', 'trifasico'],
  ['aci', 'acii', 'aciii'],
  ['curvaa', 'curvab', 'curvac'],
  ['fosco', 'semibrilho', 'brilhante'],
];

const domainConcepts = [
  { id: 'cimento-portland', patterns: [['cimento', 'portland'], ['cimento', 'cp']], terms: ['cimento portland', 'cimento'], pdms: [867], groups: [56], objects: ['cimento'] },
  { id: 'argamassa', patterns: [['argamassa']], terms: ['argamassa colante', 'argamassa'], pdms: [14331], groups: [56], objects: ['argamassa'] },
  { id: 'tinta-acrilica', patterns: [['tinta', 'acrilica']], terms: ['tinta acrilica', 'tinta'], pdms: [1501], groups: [80], objects: ['tinta'] },
  { id: 'massa-corrida', patterns: [['massa', 'corrida'], ['massa', 'pva']], terms: ['massa corrida', 'massa pva'], pdms: [1508], groups: [80], objects: ['massa'] },
  { id: 'telha', patterns: [['telha']], terms: ['telha fibrocimento', 'telha'], pdms: [813], groups: [56], objects: ['telha'] },
  { id: 'tijolo', patterns: [['tijolo']], terms: ['tijolo ceramico', 'tijolo'], pdms: [811], groups: [56], objects: ['tijolo'] },
  { id: 'areia', patterns: [['areia']], terms: ['areia construcao', 'areia'], pdms: [862], groups: [56], objects: ['areia'] },
  { id: 'brita', patterns: [['brita']], terms: ['brita construcao', 'brita'], pdms: [863], groups: [56], objects: ['brita'] },
  { id: 'drywall', patterns: [['drywall'], ['gesso', 'acartonado']], terms: ['placa gesso acartonado', 'gesso acartonado', 'drywall'], pdms: [7991], groups: [56], objects: ['placa', 'gesso'] },
  { id: 'joelho-hidraulico', patterns: [['joelho', 'pvc'], ['cotovelo', 'pvc']], terms: ['conexao hidraulica pvc', 'cotovelo pvc', 'joelho pvc'], pdms: [13546, 14211], groups: [47], objects: ['joelho', 'cotovelo', 'conexao'] },
  { id: 'tubo-pvc', patterns: [['tubo', 'pvc']], terms: ['tubo pvc', 'tubo conducao pvc'], groups: [47], objects: ['tubo'] },
  { id: 'torneira', patterns: [['torneira']], terms: ['torneira hidraulica', 'torneira'], pdms: [12820], groups: [45], objects: ['torneira'] },
  { id: 'disjuntor', patterns: [['disjuntor']], terms: ['disjuntor baixa tensao', 'disjuntor termomagnetico', 'disjuntor'], pdms: [4], groups: [59], objects: ['disjuntor'] },
  { id: 'cabo-eletrico', patterns: [['cabo', 'eletrico'], ['fio', 'eletrico']], terms: ['cabo eletrico flexivel', 'fio eletrico', 'cabo eletrico'], pdms: [4009, 7533], groups: [61], objects: ['cabo', 'fio'] },
  { id: 'eletroduto', patterns: [['eletroduto'], ['conduite']], terms: ['eletroduto pvc', 'eletroduto'], groups: [59], objects: ['eletroduto'] },
  { id: 'parafuso', patterns: [['parafuso']], terms: ['parafuso sextavado', 'parafuso'], pdms: [14522], groups: [53], objects: ['parafuso'] },
  { id: 'rolamento', patterns: [['rolamento']], terms: ['rolamento esfera', 'rolamento'], pdms: [11801], groups: [31], objects: ['rolamento'] },
  { id: 'correia', patterns: [['correia']], terms: ['correia transmissao', 'correia trapezoidal', 'correia'], pdms: [5892], groups: [30], objects: ['correia'] },
  { id: 'oleo-lubrificante', patterns: [['oleo', 'lubrificante'], ['lubrificante']], terms: ['oleo lubrificante', 'lubrificante'], pdms: [10198], groups: [91], objects: ['oleo', 'lubrificante'] },
  { id: 'eletrodo-solda', patterns: [['eletrodo', 'solda'], ['eletrodo', 'e6013'], ['eletrodo', 'e7018']], terms: ['eletrodo solda', 'eletrodo'], pdms: [1157], groups: [34], objects: ['eletrodo'] },
  { id: 'broca-concreto', patterns: [['broca', 'concreto'], ['broca', 'parede'], ['broca', 'widia']], terms: ['broca widia', 'broca concreto', 'broca'], pdms: [3908, 3879], groups: [51], objects: ['broca'] },
  { id: 'ferramenta', patterns: [['furadeira'], ['esmerilhadeira'], ['martelete'], ['serra', 'circular']], terms: ['ferramenta eletrica'], groups: [51], objects: [] },
  { id: 'revestimento', patterns: [['porcelanato'], ['piso', 'ceramico'], ['revestimento', 'ceramico']], terms: ['revestimento ceramico', 'porcelanato', 'piso ceramico'], groups: [56], objects: ['porcelanato', 'piso', 'revestimento'] },
  { id: 'impermeabilizante', patterns: [['impermeabilizante'], ['manta', 'asfaltica']], terms: ['impermeabilizante construcao', 'manta asfaltica'], groups: [56], objects: ['impermeabilizante', 'manta'] },
];

function baseTokens(value = '') {
  const prepared = String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ar\s*-?\s*condicionado/g, 'arcondicionado')
    .replace(/pen\s*-?\s*drive/g, 'pendrive')
    .replace(/ampere\s*-?\s*hora/g, 'amperehora')
    .replace(/\bcp\s*([ivx]+)\s*-?\s*([a-z])?\s*-?\s*(\d{2})\b/g, (_, roman, kind, strength) => `cp${roman}${kind || ''}${strength}`)
    .replace(/\bac\s*-?\s*(iii|ii|i)\b/g, 'ac$1')
    .replace(/\bcurva(?:\s+de)?(?:\s+disparo)?\s*[-:]?\s*([abc])\b/g, 'curva$1')
    .replace(/\b(?:numero|quantidade)\s+(?:de\s+)?polos?\s*:?\s*([1-4])\b/g, (_, poles) => ({ 1: 'unipolar', 2: 'bipolar', 3: 'tripolar', 4: 'tetrapolar' }[poles]))
    .replace(/\b(\d{1,2})\s*w\s*-?\s*(\d{1,2})\b/g, '$1w$2')
    .replace(/\be\s*-?\s*(\d{4})\b/g, 'e$1')
    .replace(/\b([a-z])\s*-\s*(\d{1,4})\b/g, '$1$2')
    .replace(/(\d+)\s*[.,\s]\s*(\d+)\s*\/\s*(\d+)/g, '$1_$2_$3')
    .replace(/(\d+)\s*\/\s*(\d+)/g, '$1_$2');
  return prepared.replace(/[^a-z0-9_ ]/g, ' ').split(/\s+/)
    .filter((token) => token.length > 1 && !stopTokens.has(token));
}

function normalize(value = '') {
  return [...new Set(baseTokens(value).flatMap((token) => [token, ...(aliases[token] || [])]))];
}

function matchedConcepts(value = '') {
  const tokens = new Set(baseTokens(value));
  const hasToken = (token) => tokens.has(token) || (token === 'cp' && [...tokens].some((valueToken) => /^cp[ivx]/.test(valueToken)));
  return domainConcepts.filter((concept) => concept.patterns.some((pattern) => pattern.every(hasToken)));
}

function conceptObjectTokens(value = '') {
  const concepts = matchedConcepts(value);
  const known = concepts.flatMap((concept) => concept.objects || []);
  if (known.length) return [...new Set(known)];
  return [...new Set(baseTokens(value).filter((token) => !genericObjectTokens.has(token)
    && !lowValueTokens.has(token) && !packagingTokens.has(token) && !unitLookup[token]
    && !/^\d/.test(token)))].slice(0, 3);
}

function objectIdentityScore(query, candidate) {
  const expected = conceptObjectTokens(query);
  if (!expected.length) return lateInteractionScore(query, candidate);
  const target = new Set(baseTokens(candidate));
  const scores = expected.map((token) => {
    if (target.has(token)) return 1;
    if ([...(aliases[token] || [])].some((alias) => target.has(alias))) return 0.88;
    if ([...target].some((other) => tokenAffinity(token, other) >= 0.94)) return 0.72;
    return 0;
  });
  if (matchedConcepts(query).length) return Math.round(Math.max(0, ...scores) * 100);
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / expected.length) * 100);
}

function accessoryPenalty(query, candidate) {
  const source = new Set(baseTokens(query));
  const target = new Set(baseTokens(String(candidate).split(',')[0]));
  const unexpected = [...target].filter((token) => accessoryTokens.has(token) && !source.has(token));
  if (!unexpected.length) return 0;
  const identity = objectIdentityScore(query, candidate);
  return Math.min(42, unexpected.length * (identity >= 92 ? 18 : 21));
}

function extractIdentifiers(value = '') {
  return [...new Set(baseTokens(value).filter((token) => {
    if (unitLookup[token] || packagingTokens.has(token)) return false;
    if (/^(?:19|20)\d{2}$/.test(token)) return false;
    return /[a-z].*\d|\d.*[a-z]/.test(token) || /^\d{4,6}$/.test(token);
  }))];
}

function identifierCompatibility(query, candidate) {
  const requested = extractIdentifiers(query);
  if (!requested.length) return { score: 68, conflicts: 0, matched: 0, total: 0 };
  const offered = new Set(extractIdentifiers(candidate));
  const matched = requested.filter((token) => offered.has(token)).length;
  const missing = requested.length - matched;
  return {
    score: Math.round(((matched + (missing * 0.18)) / requested.length) * 100),
    conflicts: missing,
    matched,
    total: requested.length,
  };
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
  if (packagingTokens.has(token)) return 0.28;
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

function intentHeadTokens(value = '') {
  const plain = String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const prefix = plain.split(/\b(?:para|destinad[oa]s?|compativel|aplicacao|uso)\b/)[0] || plain;
  const tokens = baseTokens(prefix).filter((token) => !unitLookup[token] && !packagingTokens.has(token) && !/^\d/.test(token));
  const fallback = baseTokens(value).filter((token) => !unitLookup[token] && !packagingTokens.has(token) && !/^\d/.test(token));
  return [...new Set(tokens.length ? tokens : fallback)].slice(0, 4);
}

function intentHeadScore(query, candidate) {
  const heads = intentHeadTokens(query);
  if (!heads.length) return similarity(query, candidate);
  const target = new Set(normalize(candidate));
  const first = heads[0];
  const firstScore = Math.max(0, ...[first, ...(aliases[first] || [])]
    .flatMap((token) => [...target].map((other) => tokenAffinity(token, other))));
  const remaining = heads.slice(1);
  const remainingScore = remaining.length
    ? remaining.reduce((sum, token) => sum + Math.max(0, ...[token, ...(aliases[token] || [])]
      .flatMap((value) => [...target].map((other) => tokenAffinity(value, other)))), 0) / remaining.length
    : firstScore;
  return Math.round(((firstScore * 0.72) + (remainingScore * 0.28)) * 100);
}

function intentHeadPenalty(query, candidate) {
  const heads = intentHeadTokens(query);
  if (!heads.length) return 0;
  const target = new Set(normalize(candidate));
  const first = heads[0];
  const matched = [first, ...(aliases[first] || [])].some((token) => tokenMatches(token, target));
  return matched ? 0 : 24;
}

function headMatches(query, candidate) {
  const heads = anchorTokens(query);
  if (!heads.length) return similarity(query, candidate) >= 45;
  const target = new Set(normalize(candidate));
  return heads.some((head) => normalize(head).some((token) => tokenMatches(token, target)));
}

function primaryObjectMatches(query, candidate) {
  const primary = anchorTokens(query).slice(0, 2);
  if (!primary.length) return headMatches(query, candidate);
  const target = new Set(normalize(candidate));
  return primary.some((token) => [token, ...(aliases[token] || [])].some((value) => tokenMatches(value, target)));
}

function anchorTokens(value = '') {
  const tokens = baseTokens(value).filter((token) => !genericObjectTokens.has(token) && !lowValueTokens.has(token)
    && !packagingTokens.has(token) && !unitLookup[token] && !/^\d/.test(token));
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
  if (['mm2', 'm2'].includes(unit)) return 'area';
  if (unit === 'm3') return 'volume';
  if (['ml', 'l'].includes(unit)) return 'volume';
  if (['g', 'kg'].includes(unit)) return 'mass';
  if (['gb', 'tb'].includes(unit)) return 'storage';
  if (unit === 'deg') return 'angle';
  return unit;
}

function normalizedMeasure(value, unit) {
  const numeric = Number(String(value).replace(',', '.'));
  const factors = { mm: 1, cm: 10, m: 1000, pol: 25.4, mm2: 1, m2: 1000000, m3: 1000000, ml: 1, l: 1000, g: 1, kg: 1000, gb: 1, tb: 1000 };
  return { value: numeric * (factors[unit] || 1), family: unitFamily(unit), unit };
}

function extractMeasures(value = '') {
  const normalized = String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/°/g, ' grau ')
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
    if (distance <= 0.005) { points += 1; matched += 1; }
    else if (distance <= 0.025) { points += 0.92; matched += 1; }
    else if (distance <= 0.06) { points += 0.72; matched += 1; }
    else if (distance <= 0.12) { points += 0.48; matched += 1; }
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

function exclusiveAttributeConflicts(query, candidate) {
  const source = new Set(baseTokens(query));
  const target = new Set(baseTokens(candidate));
  return exclusiveAttributeGroups.reduce((conflicts, group) => {
    const requested = group.find((token) => source.has(token));
    const offered = group.find((token) => target.has(token));
    return conflicts + (requested && offered && requested !== offered ? 1 : 0);
  }, 0);
}

function variantConflictPenalty(query, candidate) {
  const plain = (value) => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const source = plain(query);
  const target = plain(candidate);
  let penalty = 0;
  if (/\b(?:reducao|redutor|reduzido)\b/.test(target) && !/\b(?:reducao|redutor|reduzido)\b/.test(source)) penalty += 18;
  if (/\bsem cabeca\b/.test(target) && !/\bsem cabeca\b/.test(source)) penalty += 28;
  if (/\bsextavad[oa] intern[oa]\b/.test(target) && !/\bintern[oa]\b/.test(source)) penalty += 14;
  if (/\brosca esquerda\b/.test(target) && !/\besquerda\b/.test(source)) penalty += 16;
  if (/\buso naval\b/.test(target) && !/\bnaval\b/.test(source)) penalty += 6;
  return penalty;
}

function constraintPenalty(query, candidate) {
  const specs = specificationCompatibility(query, candidate);
  const identifiers = identifierCompatibility(query, candidate);
  return (specs.conflicts * 14) + (identifiers.conflicts * 18)
    + (categoricalConflict(query, candidate, colorTokens) * 12)
    + (categoricalConflict(query, candidate, materialTokens) * 14)
    + (exclusiveAttributeConflicts(query, candidate) * 22)
    + accessoryPenalty(query, candidate)
    + variantConflictPenalty(query, candidate);
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
      if (attempt < retries) {
        const rateLimited = /upstream_(429|503)/.test(String(error?.message || error));
        const delay = (rateLimited ? 800 : 350) * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function mapConcurrent(items, limit, callback) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await callback(items[index], index);
    }
  }));
  return output;
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
    31: ['rolamento', 'mancal', 'engrenagem'],
    34: ['solda', 'eletrodo', 'maquina solda'],
    45: ['torneira', 'fechadura', 'dobradica', 'ferragem'],
    47: ['tubo', 'conexao', 'joelho', 'cotovelo', 'registro', 'hidraulica', 'pvc'],
    51: ['broca', 'furadeira', 'martelete', 'serra', 'esmerilhadeira', 'ferramenta'],
    53: ['parafuso', 'porca', 'arruela', 'prego', 'rebite'],
    56: ['cimento', 'argamassa', 'telha', 'tijolo', 'areia', 'brita', 'gesso', 'drywall', 'porcelanato', 'revestimento'],
    59: ['disjuntor', 'tomada', 'interruptor', 'eletroduto', 'quadro eletrico'],
    61: ['cabo eletrico', 'fio eletrico', 'condutor eletrico'],
    80: ['tinta', 'massa corrida', 'selador', 'verniz', 'impermeabilizante'],
    91: ['oleo', 'lubrificante', 'graxa'],
  };
  const tokens = new Set(normalize(query));
  const text = [...tokens].join(' ');
  const groups = Object.entries(map).filter(([, words]) => words.some((word) => text.includes(word))).map(([code]) => Number(code));
  const plumbing = ['descarga', 'canopla', 'vaso', 'sanitario', 'torneira', 'chuveiro', 'acoplada', 'hidraulica'];
  const valveParts = ['acabamento', 'base', 'kit', 'sede', 'reparo', 'botao'];
  if (plumbing.some((token) => tokens.has(token))) groups.push(45);
  if (tokens.has('valvula') && valveParts.some((token) => tokens.has(token))) groups.push(45);
  if (tokens.has('valvula') && !groups.includes(45)) groups.push(48);
  matchedConcepts(query).forEach((concept) => groups.push(...(concept.groups || [])));
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
  if (tokens.has('alcool') && (tokens.has('etilico') || tokens.has('70'))) preferred.push(2259);
  if (tokens.has('cafe')) preferred.push(911);
  if (tokens.has('arcondicionado')) preferred.push(13768);
  matchedConcepts(query).forEach((concept) => preferred.push(...(concept.pdms || [])));
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
    const identityScore = objectIdentityScore(query, nomePdm);
    const evidence = semanticEvidence(query, nomePdm);
    const preferredMatch = preferred.includes(codigoPdm);
    const groupMatch = groups.includes(Number(item.codigoGrupo));
    const score = Math.min(100, Math.round(
      (nameScore * 0.31) + (contextScore * 0.12) + (objectScore * 0.18) + (identityScore * 0.22)
      + ((item._rrf || 0) * 0.11) + (groupMatch ? 6 : 0) + (preferredMatch ? 30 : 0)
      - accessoryPenalty(query, nomePdm),
    ));
    return { ...item, codigoPdm, nomePdm, _score: score, _nameScore: nameScore, _objectScore: objectScore, _identityScore: identityScore, _evidence: evidence, _preferred: preferredMatch };
  }).filter((item) => {
    if (!item.codigoPdm || ((item.statusPDM === false || item.statusPdm === false) && !item._preferred)) return false;
    return item._preferred || item._identityScore >= 56 || item._objectScore >= 44 || item._nameScore >= 38 || item._score >= 42;
  }).sort((a, b) => b._score - a._score);
}

function queryVariants(query) {
  const cleaned = baseTokens(query).join(' ').slice(0, 180);
  const raw = String(query).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  const anchors = anchorTokens(query).slice(0, 7);
  const objects = conceptObjectTokens(query).slice(0, 3);
  const expanded = [...new Set(objects.flatMap((token) => [token, ...(aliases[token] || [])]))].slice(0, 6).join(' ');
  const conceptTerms = matchedConcepts(query).flatMap((concept) => concept.terms || []);
  const objectSingles = objects.filter((token) => token.length >= 3);
  return [...new Set([
    ...conceptTerms,
    objects.join(' '),
    ...objectSingles,
    anchors.slice(0, 2).join(' '),
    anchors.slice(0, 3).join(' '),
    expanded,
    anchors.join(' '),
    raw,
    cleaned,
  ].filter((term) => term.length >= 2))].slice(0, 10);
}

async function officialPdmLists(query, maxTerms = 6) {
  const terms = queryVariants(query).slice(0, maxTerms);
  const payloads = await Promise.all(terms.map((term) => fetchJson(
    `${catalogoBase}/material/v1/palavra?palavra=${encodeURIComponent(term)}&apenasAtivos=nao`,
    { timeout: 18000, retries: 1, ttl: 86400000 },
  ).catch(() => [])));
  return payloads.map((payload) => (Array.isArray(payload) ? payload : []).map((item) => ({ ...item, _official: true })));
}

async function directPreferredPdms(query) {
  const codes = preferredPdms(query);
  const pages = await Promise.all(codes.map((codigoPdm) => fetchJson(
    `${comprasBase}/modulo-material/3_consultarPdmMaterial?pagina=1&tamanhoPagina=20&codigoPdm=${codigoPdm}`,
    { timeout: 18000, retries: 2, ttl: 86400000 },
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
  const concepts = matchedConcepts(query);
  const hasKnownPdms = concepts.some((concept) => (concept.pdms || []).length);
  const [officialLists, preferred] = await Promise.all([
    officialPdmLists(query, hasKnownPdms ? 2 : 6).catch(() => []),
    directPreferredPdms(query),
  ]);
  const retrievalLists = [preferred.map((item) => ({ ...item, _preferredSource: true })), ...officialLists];
  let pdms = rankPdms(query, fusePdmLists(retrievalLists));
  const hasPreferredPdm = pdms.some((pdm) => pdm._preferred);
  if ((!hasPreferredPdm && pdms.length < 8) || (pdms[0]?._score || 0) < 58) {
    const hierarchical = await hierarchicalPdms(query).catch(() => []);
    pdms = rankPdms(query, fusePdmLists([...retrievalLists, hierarchical]));
  }
  if (hasKnownPdms) {
    const preferredPdmsRanked = pdms.filter((pdm) => pdm._preferred);
    const complementaryPdms = pdms.filter((pdm) => !pdm._preferred).slice(0, Math.max(0, 6 - preferredPdmsRanked.length));
    pdms = [...preferredPdmsRanked, ...complementaryPdms].slice(0, 6);
  } else pdms = pdms.slice(0, 10);
  if (!pdms.length) return [];

  const firstPages = await mapConcurrent(pdms, 5, async (pdm) => {
    const itemUrl = `${comprasBase}/modulo-material/4_consultarItemMaterial?pagina=1&tamanhoPagina=500&codigoPdm=${pdm.codigoPdm}&statusItem=true`;
    let page;
    try {
      page = await fetchJson(itemUrl, { timeout: 18000, retries: 2, ttl: 86400000 });
    } catch {
      if (pdm._preferred) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        page = await fetchJson(itemUrl, { timeout: 20000, retries: 2, ttl: 86400000 }).catch(() => ({ resultado: [] }));
      } else page = { resultado: [] };
    }
    return { pdm, page };
  });
  const overflowRequests = firstPages.flatMap(({ pdm, page }, pdmIndex) => {
    const pageLimit = pdm._preferred ? 8 : (pdmIndex < 5 ? 4 : (pdmIndex < 9 ? 2 : 1));
    const totalPages = Math.min(pageLimit, Number(page.totalPaginas) || 1);
    return Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => fetchJson(
      `${comprasBase}/modulo-material/4_consultarItemMaterial?pagina=${index + 2}&tamanhoPagina=500&codigoPdm=${pdm.codigoPdm}&statusItem=true`,
      { ttl: 86400000 },
    ).then((extra) => ({ pdm, page: extra })).catch(() => ({ pdm, page: { resultado: [] } })));
  });
  const overflowPages = await mapConcurrent(overflowRequests, 6, (request) => request);
  const itemPages = [...firstPages, ...overflowPages];
  const seen = new Set();
  const scoredItems = itemPages.flatMap(({ pdm, page }) => (page.resultado || []).map((item) => ({ item, pdm }))).map(({ item, pdm }) => {
    const description = `${item.nomePdm || ''} ${item.descricaoItem || ''}`;
    const lexical = similarity(query, description);
    const objectScore = lateInteractionScore(anchorTokens(query).slice(0, 5).join(' '), description);
    const identityScore = objectIdentityScore(query, description);
    const headScore = intentHeadScore(query, description);
    const specs = specificationCompatibility(query, description);
    const identifiers = identifierCompatibility(query, description);
    const evidence = semanticEvidence(query, description);
    const score = Math.min(100, Math.max(0, Math.round(
      (lexical * 0.17) + (pdm._score * 0.14) + (objectScore * 0.10) + (identityScore * 0.18)
      + (headScore * 0.23) + (specs.score * 0.10) + (identifiers.score * 0.08)
      - constraintPenalty(query, description) - intentHeadPenalty(query, description),
    )));
    const reasons = [];
    if (objectScore >= 75) reasons.push('objeto principal compatível');
    if (specs.total && specs.matched) reasons.push('medidas compatíveis');
    if (phraseScore(query, description) >= 35) reasons.push('descrição próxima');
    if (identifiers.total && identifiers.matched) reasons.push('referencia exata');
    if (headScore >= 72) reasons.push('tipo de item compatível');
    return {
      codigoItem: item.codigoItem,
      descricaoItem: item.descricaoItem || item.nomePdm,
      codigoPdm: item.codigoPdm,
      nomePdm: item.nomePdm,
      score,
      confidence: score >= 78 ? 'alta' : (score >= 60 ? 'boa' : 'possível'),
      reasons,
      _headMatch: headMatches(query, description),
      _primaryMatch: primaryObjectMatches(query, description),
      _identityScore: identityScore,
      _headScore: headScore,
      _semanticMatch: pdm._preferred || objectScore >= 48 || (pdm._objectScore >= 50 && lexical >= 34),
      _preferredPdm: pdm._preferred,
      _officialPdm: Boolean(pdm._official),
    };
  });
  const items = scoredItems.filter((item) => {
    if (!item.codigoItem || seen.has(item.codigoItem)) return false;
    seen.add(item.codigoItem);
    const threshold = item._preferredPdm ? 30 : (item._officialPdm ? 34 : 40);
    const domainMatch = matchedConcepts(query).length ? item._identityScore >= 70 : item._primaryMatch;
    const bestAvailable = item._preferredPdm || item._headScore >= 62 || (item._semanticMatch && item.score >= 44);
    return (domainMatch || bestAvailable) && item.score >= Math.min(threshold, 32);
  }).sort((a, b) => b.score - a.score).slice(0, limit)
    .map(({ _headMatch, _primaryMatch, _identityScore, _headScore, _semanticMatch, _preferredPdm, _officialPdm, ...item }) => item);
  return items;
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
  const identityScore = objectIdentityScore(query, candidate);
  const specs = specificationCompatibility(query, candidate);
  const identifiers = identifierCompatibility(query, candidate);
  const unitScore = unitCompatibility(requestedUnit, offeredUnit);
  const score = Math.min(100, Math.max(0, Math.round(
    (queryScore * 0.27) + (catalogScore * 0.20) + (objectScore * 0.12) + (identityScore * 0.18)
    + (specs.score * 0.09) + (identifiers.score * 0.08) + (unitScore * 0.06)
    - constraintPenalty(query, candidate),
  )));
  const reasons = [];
  if (catalogScore >= 72) reasons.push('mesmo material CATMAT');
  if (objectScore >= 75) reasons.push('objeto compatÃ­vel');
  if (specs.total && specs.matched) reasons.push('medidas compatÃ­veis');
  if (unitScore === 100) reasons.push('unidade compatÃ­vel');
  return {
    score,
    reasons,
    details: { query: queryScore, catalog: catalogScore, object: objectScore, identity: identityScore, specifications: specs.score, identifiers: identifiers.score, unit: unitScore },
  };
}

async function searchPrices({ query, unit, catmat, catmatDescription, catmatScore = 0, start, end, limit, minScore }) {
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
    const catalogConfidence = Math.min(100, Math.max(0, Number(catmatScore) || 0));
    const verifiedScore = catalogConfidence
      ? Math.min(100, Math.round((catalogConfidence * 0.66) + (match.score * 0.34) + 8))
      : match.score;
    const reasons = [...match.reasons];
    if (catalogConfidence) reasons.unshift('CATMAT confirmado no registro');
    return {
      _source: item,
      descricao: description,
      valor: Number(item.precoUnitario),
      unidade: offeredUnit,
      orgao: item.nomeOrgao || item.nomeUasg || 'Órgão público',
      fornecedor: item.nomeFornecedor || '',
      data: item.dataResultado || item.dataCompra || '',
      tipo: 'Preço praticado',
      score: verifiedScore,
      matchReasons: reasons,
      matchDetails: { ...match.details, catalogCandidate: catalogConfidence, descriptionScore: match.score },
    };
  }).filter((item) => {
    const key = `${item._source.idCompraItem || ''}:${item._source.idCompra || ''}:${item.valor}`;
    if (seenPrices.has(key)) return false;
    seenPrices.add(key);
    return item.valor > 0 && item.score >= minScore;
  })
    .sort((a, b) => b.score - a.score || a.valor - b.valor)
    .slice(0, Math.max(limit * 6, 30));

  const enriched = await mapConcurrent(ranked, 5, async (item) => {
    try {
      const reference = await pncpReference(item._source);
      if (!reference) return null;
      const { _source, ...result } = item;
      return { ...result, ...reference };
    } catch {
      return null;
    }
  });
  return enriched.filter(Boolean).slice(0, limit);
}

function candidatePool(candidates) {
  const valid = candidates.filter((candidate) => candidate && /^\d+$/.test(String(candidate.codigoItem || '')))
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  if (!valid.length) return [];
  const topScore = Number(valid[0].score) || 0;
  const eligible = valid.filter((candidate) => (Number(candidate.score) || 0) >= Math.max(30, topScore - 26)).slice(0, 8);
  const selected = [eligible[0]];
  const pdms = new Set([String(eligible[0].codigoPdm || '')]);
  eligible.slice(1).forEach((candidate) => {
    const pdm = String(candidate.codigoPdm || '');
    if (selected.length < 4 && pdm && !pdms.has(pdm)) {
      selected.push(candidate);
      pdms.add(pdm);
    }
  });
  eligible.forEach((candidate) => {
    if (selected.length < 4 && !selected.some((item) => String(item.codigoItem) === String(candidate.codigoItem))) selected.push(candidate);
  });
  return selected;
}

async function resolvePrices({ query, unit, candidates, start, end, limit, minScore }) {
  const pool = candidatePool(candidates);
  if (!pool.length) return { selected: null, alternatives: [], items: [], evaluations: [], message: 'Nenhum CATMAT compatível foi localizado.' };
  const evaluations = await mapConcurrent(pool, 2, async (candidate) => {
    try {
      const items = await searchPrices({
        query,
        unit,
        catmat: String(candidate.codigoItem),
        catmatDescription: candidate.descricaoItem || candidate.nomePdm || '',
        catmatScore: Number(candidate.score) || 0,
        start,
        end,
        limit,
        minScore,
      });
      const bestPriceScore = items.length ? Math.max(...items.map((item) => Number(item.score) || 0)) : 0;
      const coverage = Math.min(100, Math.round((items.length / Math.max(1, limit)) * 100));
      const resolutionScore = Math.round(((Number(candidate.score) || 0) * 0.58) + (bestPriceScore * 0.27) + (coverage * 0.15));
      return { candidate, items, bestPriceScore, coverage, resolutionScore, error: '' };
    } catch {
      return { candidate, items: [], bestPriceScore: 0, coverage: 0, resolutionScore: Math.round((Number(candidate.score) || 0) * 0.58), error: 'Consulta temporariamente indisponível' };
    }
  });
  const topSemanticScore = Math.max(...evaluations.map((evaluation) => Number(evaluation.candidate.score) || 0));
  const withEvidence = evaluations.filter((evaluation) => evaluation.items.length
      && (Number(evaluation.candidate.score) || 0) >= Math.max(38, topSemanticScore - 14))
    .sort((a, b) => b.resolutionScore - a.resolutionScore || (Number(b.candidate.score) || 0) - (Number(a.candidate.score) || 0));
  const selectedEvaluation = withEvidence[0] || evaluations[0];
  const selected = selectedEvaluation.candidate;
  const alternatives = candidates.filter((candidate) => String(candidate.codigoItem) !== String(selected.codigoItem));
  const topCandidate = candidates[0];
  const selectionReason = selectedEvaluation.items.length
    ? (String(selected.codigoItem) === String(topCandidate?.codigoItem) ? 'Melhor correspondência confirmada no PNCP' : 'Alternativa mais compatível com preços no PNCP')
    : 'Melhor correspondência do catálogo; sem preço no período';
  const failed = evaluations.filter((evaluation) => evaluation.error).length;
  const message = selectedEvaluation.items.length
    ? ''
    : (failed === evaluations.length
      ? 'O PNCP não respondeu às tentativas desta pesquisa. Tente novamente em alguns minutos.'
      : `Nenhum preço comparável foi localizado após testar ${evaluations.length} CATMAT no período.`);
  return {
    selected: { ...selected, selectionReason },
    alternatives,
    items: selectedEvaluation.items,
    evaluations: evaluations.map((evaluation) => ({
      codigoItem: evaluation.candidate.codigoItem,
      score: evaluation.candidate.score,
      priceCount: evaluation.items.length,
      resolutionScore: evaluation.resolutionScore,
    })),
    testedCatmats: evaluations.length,
    message,
  };
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
        const items = await searchCatmat(query, Math.min(8, Number(url.searchParams.get('limit')) || 5));
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
        catmatScore: Number(url.searchParams.get('catmatScore')) || 0,
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

    if (url.pathname === '/api/resolve-prices' && request.method === 'POST') {
      let input;
      try { input = await request.json(); } catch { return json({ message: 'Os dados da pesquisa são inválidos.' }, 400); }
      const safe = {
        query: String(input.query || '').trim().slice(0, 500),
        unit: String(input.unit || '').trim().slice(0, 40),
        candidates: Array.isArray(input.candidates) ? input.candidates.slice(0, 8) : [],
        start: String(input.start || ''),
        end: String(input.end || ''),
        limit: Math.min(10, Math.max(1, Number(input.limit) || 5)),
        minScore: Math.min(100, Math.max(30, Number(input.minScore) || 65)),
      };
      if (!safe.query || !safe.candidates.length || !/^\d{4}-\d{2}-\d{2}$/.test(safe.start) || !/^\d{4}-\d{2}-\d{2}$/.test(safe.end)) {
        return json({ message: 'Os dados da pesquisa estão incompletos.' }, 400);
      }
      try {
        return json(await resolvePrices(safe));
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
