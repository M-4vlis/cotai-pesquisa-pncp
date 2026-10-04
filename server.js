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

const aliases = {
  a4: ['210', '297', 'sulfite', 'branco'], sulfite: ['papel', 'impressao'], resma: ['papel'],
  esferografica: ['caneta'], notebook: ['computador', 'microcomputador'], laptop: ['computador', 'microcomputador'],
  pne: ['acessibilidade'], sanitaria: ['hidraulica'], sanitario: ['hidraulica'],
  contra: ['sede'], refrigerador: ['geladeira'], geladeira: ['refrigerador'],
  celular: ['telefone', 'smartphone'], smartphone: ['telefone', 'celular'],
  condicionador: ['climatizador'], toner: ['cartucho'], pen: ['pendrive'],
};
const stopTokens = new Set(['com', 'para', 'das', 'dos', 'uma', 'uns', 'por', 'sem', 'tipo', 'modelo', 'unidade', 'unidades', 'uso', 'nome', 'referencia', 'de', 'da', 'do', 'e']);
const lowValueTokens = new Set(['acabamento', 'completo', 'superior', 'inferior', 'cromado', 'cromada', 'material', 'aplicacao', 'caracteristicas', 'adicionais', 'bitola', 'polegada', 'polegadas', 'acionamento']);
const genericObjectTokens = new Set(['aquisicao', 'fornecimento', 'compra', 'contratacao', 'material', 'produto', 'item', 'peca', 'pecas', 'acessorio', 'acessorios', 'kit', 'conjunto', 'lote', 'base', 'acabamento', 'completo']);
const unrequestedConstraints = new Set(['colorido', 'rosa', 'vermelho', 'verde', 'amarelo', 'preto', 'branco', 'offset', 'couche', 'personalizado', 'couro', 'revestimento', 'gravacao', 'silk', 'grip', 'automatico', 'eletrico', 'sensor', 'mictorio']);

function baseTokens(value = '') {
  const prepared = String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d+)\s*[.,\s]\s*(\d+)\s*\/\s*(\d+)/g, '$1_$2_$3')
    .replace(/(\d+)\s*\/\s*(\d+)/g, '$1_$2');
  return prepared.replace(/[^a-z0-9_ ]/g, ' ').split(/\s+/)
    .filter((token) => token.length > 1 && !stopTokens.has(token));
}

function normalize(value = '') {
  return [...new Set(baseTokens(value).flatMap((token) => [token, ...(aliases[token] || [])]))];
}

function tokenMatches(token, targets) {
  return targets.has(token) || [...targets].some((value) => token.length > 4 && value.length > 4 && (value.startsWith(token) || token.startsWith(value)));
}

function similarity(query, candidate) {
  const source = normalize(query);
  const target = new Set(normalize(candidate));
  if (!source.length) return 0;
  let matched = 0;
  let weight = 0;
  source.forEach((token) => {
    const tokenWeight = lowValueTokens.has(token) ? 0.35 : (/\d/.test(token) ? 1.25 : 1);
    weight += tokenWeight;
    if (tokenMatches(token, target)) matched += tokenWeight;
  });
  return Math.min(100, Math.round((matched / weight) * 100));
}

function headMatches(query, candidate) {
  const heads = anchorTokens(query);
  if (!heads.length) return similarity(query, candidate) >= 45;
  const target = new Set(normalize(candidate));
  return heads.some((head) => normalize(head).some((token) => tokenMatches(token, target)));
}

function anchorTokens(value = '') {
  const tokens = baseTokens(value).filter((token) => !genericObjectTokens.has(token) && !lowValueTokens.has(token) && !/^\d/.test(token));
  return [...new Set(tokens.flatMap((token) => [token, ...(aliases[token] || [])]))];
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

function constraintPenalty(query, candidate) {
  const source = new Set(normalize(query));
  const target = new Set(normalize(candidate));
  return [...unrequestedConstraints].reduce((penalty, token) => penalty + (target.has(token) && !source.has(token) ? 7 : 0), 0);
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

function rankPdms(query, items) {
  const preferred = preferredPdms(query);
  const groups = hintedGroups(query);
  const seen = new Set();
  return items.map((item) => {
    const codigoPdm = pdmCode(item);
    const nomePdm = item.nomePdm || item.descricaoPDM || '';
    const classification = `${nomePdm} ${item.nomeClasse || item.descricaoClasse || ''} ${item.nomeGrupo || item.descricaoGrupo || ''}`;
    const nameScore = similarity(query, nomePdm);
    const contextScore = similarity(query, classification);
    const evidence = semanticEvidence(query, nomePdm);
    const preferredMatch = preferred.includes(codigoPdm);
    const groupMatch = groups.includes(Number(item.codigoGrupo));
    const score = Math.min(100, Math.round(
      (nameScore * 0.68) + (contextScore * 0.17) + Math.min(15, evidence.matched * 5)
      + (groupMatch ? 8 : 0) + (item._official ? 5 : 0) + (preferredMatch ? 60 : 0),
    ));
    return { ...item, codigoPdm, nomePdm, _score: score, _evidence: evidence, _preferred: preferredMatch };
  }).filter((item) => {
    if (!item.codigoPdm || seen.has(item.codigoPdm) || item.statusPDM === false || item.statusPdm === false) return false;
    seen.add(item.codigoPdm);
    return item._preferred || (item._evidence.matched > 0 && item._score >= 24) || item._score >= 38;
  }).sort((a, b) => b._score - a._score);
}

async function officialPdms(query) {
  const cleaned = baseTokens(query).join(' ').slice(0, 180);
  if (cleaned.length < 2) return [];
  const focused = baseTokens(query)
    .filter((token) => !genericObjectTokens.has(token) && !lowValueTokens.has(token) && !/^\d/.test(token))
    .slice(0, 7).join(' ');
  const terms = [...new Set([focused, cleaned].filter((term) => term.length >= 2))];
  const payloads = await Promise.all(terms.map((term) => fetchJson(
    `${catalogoBase}/material/v1/palavra?palavra=${encodeURIComponent(term)}&apenasAtivos=nao`,
    { timeout: 18000, retries: 1, ttl: 86400000 },
  ).catch(() => [])));
  return payloads.flatMap((payload) => (Array.isArray(payload) ? payload : []))
    .map((item) => ({ ...item, _official: true }));
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
  const [official, preferred] = await Promise.all([
    officialPdms(query).catch(() => []),
    directPreferredPdms(query),
  ]);
  let pdms = rankPdms(query, [...preferred, ...official]);
  if (pdms.length < 8) {
    const hierarchical = await hierarchicalPdms(query);
    pdms = rankPdms(query, [...preferred, ...official, ...hierarchical]);
  }
  pdms = pdms.slice(0, 12);
  if (!pdms.length) return [];

  const itemPages = await Promise.all(pdms.map(async (pdm) => ({ pdm, page: await fetchJson(
    `${comprasBase}/modulo-material/4_consultarItemMaterial?pagina=1&tamanhoPagina=500&codigoPdm=${pdm.codigoPdm}&statusItem=true`,
    { ttl: 86400000 },
  ).catch(() => ({ resultado: [] })) })));
  const seen = new Set();
  return itemPages.flatMap(({ pdm, page }) => (page.resultado || []).map((item) => ({ item, pdm }))).map(({ item, pdm }) => {
    const description = `${item.nomePdm || ''} ${item.descricaoItem || ''}`;
    const lexical = similarity(query, description);
    const evidence = semanticEvidence(query, description);
    const score = Math.min(100, Math.max(0, Math.round(
      (lexical * 0.7) + (pdm._score * 0.3) + Math.min(18, evidence.matched * 6) - constraintPenalty(query, description),
    )));
    return {
      codigoItem: item.codigoItem,
      descricaoItem: item.descricaoItem || item.nomePdm,
      codigoPdm: item.codigoPdm,
      nomePdm: item.nomePdm,
      score,
      _headMatch: headMatches(query, description),
      _semanticMatch: pdm._preferred || (pdm._evidence.matched > 0 && (pdm._score >= 28 || lexical >= 35)),
      _preferredPdm: pdm._preferred,
      _officialPdm: Boolean(pdm._official),
    };
  }).filter((item) => {
    if (!item.codigoItem || seen.has(item.codigoItem)) return false;
    seen.add(item.codigoItem);
    const threshold = item._preferredPdm ? 30 : (item._officialPdm ? 32 : 40);
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

async function searchPrices({ query, catmat, catmatDescription, start, end, limit, minScore }) {
  const params = new URLSearchParams({
    pagina: '1', tamanhoPagina: '100', tipo: 'codigoItemCatalogo', codigo: catmat,
    dataResultado: 'true', dataCompraInicio: start, dataCompraFim: end,
  });
  const sourceUrl = `${comprasBase}/modulo-pesquisa-preco/1_consultarMaterial?${params}`;
  const payload = await fetchJson(sourceUrl, { timeout: 18000, retries: 2, ttl: 900000 });
  const ranked = (payload.resultado || []).map((item) => {
    const description = item.descricaoDetalhadaItem || item.descricaoItem || catmatDescription;
    const textScore = similarity(`${query} ${catmatDescription}`, description);
    return {
      _source: item,
      descricao: description,
      valor: Number(item.precoUnitario),
      unidade: item.nomeUnidadeFornecimento || item.siglaUnidadeFornecimento || item.nomeUnidadeMedida || item.siglaUnidadeMedida || '',
      orgao: item.nomeOrgao || item.nomeUasg || 'Órgão público',
      fornecedor: item.nomeFornecedor || '',
      data: item.dataResultado || item.dataCompra || '',
      tipo: 'Preço praticado',
      score: Math.min(100, Math.max(90, textScore)),
    };
  }).filter((item) => item.valor > 0 && item.score >= minScore)
    .sort((a, b) => b.score - a.score || a.valor - b.valor)
    .slice(0, Math.max(limit * 4, 20));

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
