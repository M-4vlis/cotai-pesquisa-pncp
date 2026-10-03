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

function normalize(value = '') {
  const aliases = {
    a4: ['210', '297', 'copia'], sulfite: ['papel', 'copia'], resma: ['papel'],
    esferografica: ['caneta'], notebook: ['computador', 'microcomputador'], laptop: ['computador', 'microcomputador'],
    cadeira: ['mobiliario'], mesa: ['mobiliario'], armario: ['mobiliario'],
  };
  const stop = new Set(['com', 'para', 'das', 'dos', 'uma', 'uns', 'por', 'sem', 'tipo', 'modelo', 'unidade', 'unidades']);
  const base = String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((token) => token.length > 1 && !stop.has(token));
  return [...new Set(base.flatMap((token) => [token, ...(aliases[token] || [])]))];
}

function similarity(query, candidate) {
  const source = normalize(query);
  const target = new Set(normalize(candidate));
  if (!source.length) return 0;
  let matched = 0;
  let weight = 0;
  source.forEach((token) => {
    const tokenWeight = /\d/.test(token) ? 1.4 : 1;
    weight += tokenWeight;
    if (target.has(token) || [...target].some((value) => value.length > 4 && (value.startsWith(token) || token.startsWith(value)))) matched += tokenWeight;
  });
  return Math.min(100, Math.round((matched / weight) * 100));
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
      const value = await response.json();
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
  const text = normalize(query).join(' ');
  return Object.entries(map).filter(([, words]) => words.some((word) => text.includes(word))).map(([code]) => Number(code));
}

async function searchCatmat(query, limit) {
  const classes = await getClasses();
  const groups = hintedGroups(query);
  const eligible = groups.length ? classes.filter((item) => groups.includes(Number(item.codigoGrupo))) : classes;
  const rankedClasses = eligible.map((item) => ({ ...item, _score: similarity(query, `${item.nomeGrupo} ${item.nomeClasse}`) }))
    .sort((a, b) => b._score - a._score).slice(0, groups.length ? 6 : 4);

  const pdmPages = await Promise.all(rankedClasses.map((item) => fetchJson(
    `${comprasBase}/modulo-material/3_consultarPdmMaterial?pagina=1&tamanhoPagina=500&codigoClasse=${item.codigoClasse}&statusPdm=true`,
    { ttl: 86400000 },
  ).catch(() => ({ resultado: [] }))));
  let pdms = pdmPages.flatMap((page) => page.resultado || []);
  const preferredPdm = [];
  const normalized = normalize(query);
  if (normalized.includes('papel') && (normalized.includes('copia') || normalized.includes('a4'))) preferredPdm.push(19746);
  if (normalized.includes('caneta') && normalized.includes('esferografica')) preferredPdm.push(99);
  pdms = pdms.map((item) => ({ ...item, _score: similarity(query, item.nomePdm) + (preferredPdm.includes(Number(item.codigoPdm)) ? 80 : 0) }))
    .sort((a, b) => b._score - a._score).slice(0, 8);

  const itemPages = await Promise.all(pdms.map((item) => fetchJson(
    `${comprasBase}/modulo-material/4_consultarItemMaterial?pagina=1&tamanhoPagina=500&codigoPdm=${item.codigoPdm}&statusItem=true`,
    { ttl: 86400000 },
  ).catch(() => ({ resultado: [] }))));
  const seen = new Set();
  return itemPages.flatMap((page) => page.resultado || []).map((item) => ({
    codigoItem: item.codigoItem,
    descricaoItem: item.descricaoItem || item.nomePdm,
    codigoPdm: item.codigoPdm,
    nomePdm: item.nomePdm,
    score: similarity(query, `${item.nomePdm || ''} ${item.descricaoItem || ''}`),
  })).filter((item) => {
    if (!item.codigoItem || seen.has(item.codigoItem)) return false;
    seen.add(item.codigoItem);
    return true;
  }).sort((a, b) => b.score - a.score).slice(0, limit);
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

async function searchPrices({ query, catmat, catmatDescription, start, end, limit, minScore }) {
  const params = new URLSearchParams({
    pagina: '1', tamanhoPagina: '100', tipo: 'codigoItemCatalogo', codigo: catmat,
    dataResultado: 'true', dataCompraInicio: start, dataCompraFim: end,
  });
  const sourceUrl = `${comprasBase}/modulo-pesquisa-preco/1_consultarMaterial?${params}`;
  const payload = await fetchJson(sourceUrl, { timeout: 18000, retries: 2, ttl: 900000 });
  return (payload.resultado || []).map((item) => {
    const description = item.descricaoDetalhadaItem || item.descricaoItem || catmatDescription;
    const textScore = similarity(`${query} ${catmatDescription}`, description);
    const evidence = new URLSearchParams({
      pagina: '1', tamanhoPagina: '10', tipo: 'codigoItemCatalogo', codigo: catmat,
      idCompra: String(item.idCompra), dataResultado: 'true', dataCompraInicio: start, dataCompraFim: end,
    });
    return {
      descricao: description,
      valor: Number(item.precoUnitario),
      unidade: item.nomeUnidadeFornecimento || item.siglaUnidadeFornecimento || item.nomeUnidadeMedida || item.siglaUnidadeMedida || '',
      orgao: item.nomeOrgao || item.nomeUasg || 'Órgão público',
      fornecedor: item.nomeFornecedor || '',
      data: item.dataResultado || item.dataCompra || '',
      tipo: 'Preço praticado',
      score: Math.min(100, Math.max(90, textScore)),
      link: `${comprasBase}/modulo-pesquisa-preco/1_consultarMaterial?${evidence}`,
    };
  }).filter((item) => item.valor > 0 && item.score >= minScore)
    .sort((a, b) => b.score - a.score || a.valor - b.valor).slice(0, limit);
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
