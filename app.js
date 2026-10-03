const dbName = 'cotai-local';
const storeName = 'state';
let state = { items: [], results: [], settings: {} };

const $ = (id) => document.getElementById(id);
const fields = ['resultCount', 'minScore', 'startDate', 'endDate', 'proxyUrl'];

function db() { return new Promise((resolve, reject) => { const r = indexedDB.open(dbName, 1); r.onupgradeneeded = () => r.result.createObjectStore(storeName); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
async function save() { const d = await db(); const tx = d.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(state, 'current'); }
async function load() { const d = await db(); const tx = d.transaction(storeName, 'readonly'); const r = tx.objectStore(storeName).get('current'); r.onsuccess = () => { if (r.result) { state = r.result; fields.forEach(id => { if (state.settings?.[id] !== undefined) $(id).value = state.settings[id]; }); renderItems(); renderResults(); } }; }
function persistSettings() { state.settings = Object.fromEntries(fields.map(id => [id, $(id).value])); save(); }
function esc(v='') { const d = document.createElement('div'); d.textContent = v; return d.innerHTML; }
function normalize(text='') { return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w => w.length > 2 && !['com','para','das','dos','uma','com'].includes(w)); }
function renderItems() { const body = $('itemsBody'); body.innerHTML = state.items.map(i => `<tr><td>${esc(i.descricao)}</td><td>${esc(i.unidade || '—')}</td><td>${esc(i.quantidade || '—')}</td></tr>`).join(''); $('itemSummary').classList.toggle('hidden', state.items.length > 0); $('itemsWrap').classList.toggle('hidden', !state.items.length); if(state.items.length) $('itemSummary').textContent = `${state.items.length} item(ns) mantido(s) neste navegador.`; }
function parseRows(rows) { const keys = Object.keys(rows[0] || {}); const match = (...terms) => keys.find(k => terms.includes(k.toLowerCase().trim())); const desc = match('descricao','descrição','item','produto'); const unit = match('unidade','unidade de fornecimento','und'); const qty = match('quantidade','qtd','qtde'); if (!desc) throw new Error('A planilha precisa de uma coluna “descricao” ou “descrição”.'); return rows.filter(r => r[desc]).map(r => ({ descricao: String(r[desc]).trim(), unidade: unit ? String(r[unit] || '').trim() : '', quantidade: qty ? String(r[qty] || '').trim() : '' })); }
async function importFile(file) { try { let rows; if (file.name.toLowerCase().endsWith('.csv')) { const text = await file.text(); const lines = text.split(/\r?\n/).filter(Boolean); const headers = lines.shift().split(/[;,]/).map(x => x.trim()); rows = lines.map(line => Object.fromEntries(headers.map((h,i) => [h,line.split(/[;,]/)[i]?.trim()]))); } else { const data = await file.arrayBuffer(); const wb = XLSX.read(data); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }); } state.items = parseRows(rows); state.results=[]; await save(); renderItems(); renderResults(); status(`${state.items.length} item(ns) importado(s).`); } catch (e) { status(e.message || 'Não foi possível ler a planilha.'); } }
function score(query, candidate) { const a = new Set(normalize(query)), b = new Set(normalize(candidate)); const common = [...a].filter(x => b.has(x)).length; return a.size ? Math.round(100 * common / a.size) : 0; }
function demoCandidates(item) { const examples = [
  ['Papel A4 75 g/m², resma 500 folhas', 27.90, 'Resma', 'Prefeitura Municipal de Exemplo', '2026-08-12'],
  ['Material de expediente conforme especificação', 31.50, 'Unidade', 'Secretaria Estadual de Administração', '2026-07-03'],
  ['Aquisição de papel sulfite A4 branco', 25.40, 'Resma', 'Universidade Pública Federal', '2026-06-18'],
  ['Fornecimento de materiais diversos', 39.90, 'Caixa', 'Câmara Municipal de Exemplo', '2026-05-25'],
  ['Papel para impressão A4', 28.70, 'Resma', 'Instituto Federal de Exemplo', '2026-04-19']
];
  return examples.map((e,n) => ({descricao:e[0], valor:e[1], unidade:e[2], orgao:e[3], data:e[4], tipo:'Preço homologado', score:score(item.descricao,e[0]), link:'https://pncp.gov.br/app/editais', simulated:true, id:n}));
}
async function pncpCandidates(item) {
  const proxy = $('proxyUrl').value.trim();
  if (proxy) {
    const url = `${proxy.replace(/\/$/,'')}/search?query=${encodeURIComponent(item.descricao)}`;
    const response = await fetch(url); if (!response.ok) throw new Error(`Consulta PNCP indisponível (${response.status}).`); return response.json();
  }
  const today = new Date();
  const end = $('endDate').value || today.toISOString().slice(0,10);
  const start = $('startDate').value || new Date(today.setMonth(today.getMonth()-6)).toISOString().slice(0,10);
  const compact = (date) => date.replaceAll('-','');
  const base = 'https://pncp.gov.br/api/consulta/v1';
  const url = `${base}/contratacoes/publicacao?dataInicial=${compact(start)}&dataFinal=${compact(end)}&pagina=1&tamanhoPagina=50`;
  let contracts;
  try {
    const response = await fetch(url); if (!response.ok) throw new Error(String(response.status));
    const body = await response.json(); contracts = body.data || body.content || [];
  } catch {
    throw new Error('O PNCP não aceitou a consulta direta deste navegador. Configure o proxy PNCP para concluir a pesquisa.');
  }
  const terms = normalize(item.descricao);
  const likely = contracts.filter(c => terms.some(t => String(c.objetoCompra || c.objeto || '').toLowerCase().includes(t))).slice(0, 12);
  const batches = await Promise.all(likely.map(async c => {
    const cnpj = c.orgaoEntidade?.cnpj || c.cnpjOrgao || c.cnpj;
    const year = c.anoCompra || c.ano;
    const sequence = c.sequencialCompra || c.sequencial;
    if (!cnpj || !year || sequence === undefined) return [];
    try {
      const r = await fetch(`${base}/orgaos/${cnpj}/compras/${year}/${sequence}/itens`);
      if (!r.ok) return [];
      const items = await r.json();
      return (Array.isArray(items) ? items : items.data || []).map(x => ({
        descricao: x.descricao || x.descricaoItem || '', valor: Number(x.valorUnitarioEstimado ?? x.valorUnitario ?? 0),
        unidade: x.unidadeMedida || x.unidadeFornecimento || '', orgao: c.orgaoEntidade?.razaoSocial || c.orgaoEntidade?.nome || 'Órgão público',
        data: c.dataPublicacaoPncp || c.dataPublicacao, tipo: 'Preço estimado',
        link: `https://pncp.gov.br/app/editais/${cnpj}/${year}/${sequence}`
      })).filter(x => x.valor > 0);
    } catch { return []; }
  }));
  return batches.flat();
}
async function search() { if (!state.items.length) return status('Importe uma planilha ou use o exemplo antes de pesquisar.'); persistSettings(); $('searchButton').disabled=true; $('searchButton').textContent='Pesquisando…'; state.results=[]; try { const limit=Number($('resultCount').value), min=Number($('minScore').value); for (let i=0;i<state.items.length;i++) { status(`Pesquisando item ${i+1} de ${state.items.length}…`); let found=await pncpCandidates(state.items[i]); found=found.map(x=>({...x, score:x.score ?? score(state.items[i].descricao,x.descricao)})).filter(x=>x.score>=min).sort((a,b)=>b.score-a.score || a.valor-b.valor).slice(0,limit); state.results.push({item:state.items[i],found}); } await save(); renderResults(); status('Pesquisa concluída. Confirme cada resultado no PNCP antes de usá-lo.'); } catch(e) { status(e.message || 'A pesquisa não pôde ser concluída.'); } finally { $('searchButton').disabled=false; $('searchButton').textContent='Pesquisar preços'; } }
function money(n) { return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n); }
function renderResults(){ const sec=$('resultsSection'), list=$('resultsList'); list.innerHTML=''; sec.classList.toggle('hidden',!state.results.length); state.results.forEach(group=>{ const wrap=document.createElement('div'); wrap.className='result-group'; wrap.innerHTML=`<h3>${esc(group.item.descricao)}</h3>`; if(!group.found.length) wrap.innerHTML+='<p class="empty">Nenhum resultado atingiu a similaridade mínima.</p>'; group.found.forEach(r=>{const node=$('resultTemplate').content.cloneNode(true); node.querySelector('.score').textContent=`${r.score}% similar`; node.querySelector('h3').textContent=r.descricao; node.querySelector('.source-description').textContent=r.simulated?'Exemplo visual — conecte o proxy PNCP para dados reais.':r.descricao; node.querySelector('.price').textContent=money(r.valor); node.querySelector('.unit').textContent=r.unidade||'—'; node.querySelector('.agency').textContent=r.orgao||'—'; node.querySelector('.date').textContent=r.data?new Date(r.data+'T12:00:00').toLocaleDateString('pt-BR'):'—'; node.querySelector('.price-type').textContent=r.tipo||'—'; node.querySelector('.evidence').href=r.link||'https://pncp.gov.br/app/editais'; wrap.append(node); }); list.append(wrap); }); }
function status(text){$('status').textContent=text;}
function sample(){state.items=[{descricao:'Papel A4, 75 g/m², resma com 500 folhas',unidade:'Resma',quantidade:'20'},{descricao:'Caneta esferográfica azul, ponta média',unidade:'Unidade',quantidade:'100'}];state.results=[];save();renderItems();renderResults();status('Exemplo carregado.');}
function csv(){const rows=[['Item pesquisado','Descrição encontrada','Similaridade','Preço','Unidade','Órgão','Data','Tipo','Link']];state.results.forEach(g=>g.found.forEach(r=>rows.push([g.item.descricao,r.descricao,`${r.score}%`,r.valor,r.unidade,r.orgao,r.data,r.tipo,r.link])));const blob=new Blob([rows.map(x=>x.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='cotai-resultados.csv';a.click();URL.revokeObjectURL(a.href);}
$('fileInput').addEventListener('change',e=>e.target.files[0]&&importFile(e.target.files[0])); $('sampleButton').onclick=sample; $('searchButton').onclick=search; $('exportButton').onclick=csv; $('clearButton').onclick=async()=>{state={items:[],results:[],settings:{}};await save();renderItems();renderResults();status('Dados locais removidos.');}; fields.forEach(id=>$(id).addEventListener('change',persistSettings));
load();
