// Refresh portal_vendas_cache from OneDrive Excel via Microsoft Graph (app-only)
// Runs on GitHub Actions every 30 minutes.
//
// IMPORTANT: writes to column "dados" with PRE-PARSED objects in the same shape
// as the dashboard expects (matches loadDataFromOneDrive parsing).

const TENANT       = process.env.AZURE_TENANT_ID;
const CLIENT_ID    = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET= process.env.AZURE_CLIENT_SECRET;
const SB_URL       = process.env.SUPABASE_URL || 'https://jhwciwvgagnuxakukyob.supabase.co';
const SB_KEY       = process.env.SUPABASE_SERVICE_KEY;
const USER_UPN     = process.env.ONEDRIVE_USER_UPN  || 'allan@grupomasterprime.com.br';
const FILE_PATH    = process.env.ONEDRIVE_FILE_PATH || '/Allan/Administração Master Prime/Master Prime Porto Elite.xlsx';
const SHEET_NAME   = process.env.ONEDRIVE_SHEET     || 'Base de Vendas';

if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) { console.error('Missing AZURE_* envs'); process.exit(1); }
if (!SB_KEY) { console.error('Missing SUPABASE_SERVICE_KEY'); process.exit(1); }

const stripDiacritics = s => s.toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

async function getToken() {
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Token error: ' + JSON.stringify(j));
  return j.access_token;
}

async function readExcel(token) {
  const encPath = encodeURIComponent(FILE_PATH).replace(/%2F/g, '/');
  const base    = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(USER_UPN)}/drive/root:${encPath}:/workbook`;
  // 1. find sheet
  const wsR = await fetch(`${base}/worksheets`, { headers: { Authorization: `Bearer ${token}` }});
  const wsJ = await wsR.json();
  if (!wsR.ok) throw new Error('Worksheets list: ' + JSON.stringify(wsJ));
  const sheet = (wsJ.value||[]).find(w => w.name === SHEET_NAME)?.name || (wsJ.value||[])[0]?.name;
  if (!sheet) throw new Error('No worksheets found');
  // 2. usedRange
  const r = await fetch(`${base}/worksheets('${encodeURIComponent(sheet)}')/usedRange`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const j = await r.json();
  if (!r.ok) throw new Error('usedRange: ' + JSON.stringify(j));
  const rows = j.values || j.text || [];
  if (rows.length < 2) throw new Error('Empty worksheet');
  return rows;
}

// Parse rows -> array of dashboard objects (mirrors dashboard_vendas.html parser)
function parseRows(rows) {
  const headers = rows[0].map(h => (h||'').toString().trim().toUpperCase());
  const norm    = h => stripDiacritics(h).toUpperCase();

  const iAdm       = headers.indexOf('ADMINISTRADORA');
  const iAno       = headers.indexOf('ANO');
  const iSit       = headers.findIndex(h => h && norm(h.toString()) === 'SITUACAO');
  const iContrato  = headers.indexOf('CONTRATO');
  const iGrupo     = headers.indexOf('GRUPO');
  const iCota      = headers.indexOf('COTA');
  const iVenc      = headers.indexOf('VENC.');
  const iTipo      = headers.indexOf('TIPO');
  const iCredito   = headers.indexOf('CREDITO');
  const iConsultor = headers.indexOf('CONSULTOR RESPONSAVEL');
  const iData      = headers.indexOf('DATA DA VENDA');
  const iMes       = headers.findIndex(h => h && norm(h.toString()) === 'MES');
  const iStatus    = headers.indexOf('STATUS');
  const iCpf       = headers.indexOf('CPF/CNPJ');
  const iCliente   = headers.indexOf('NOME DO CLIENTE');

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[iCredito]) continue;
    let credito = row[iCredito];
    if (typeof credito === 'string') credito = credito.replace(/[R$\s.]/g,'').replace(',', '.');
    credito = parseFloat(credito);
    if (isNaN(credito) || credito <= 0) continue;

    const get = (i) => i >= 0 ? (row[i]||'').toString().trim() : '';
    const adm       = get(iAdm);
    const ano       = get(iAno);
    const sit       = get(iSit);
    const contrato  = get(iContrato);
    const grupo     = get(iGrupo);
    const cota      = get(iCota);
    const tipo      = get(iTipo);
    const status    = iStatus >= 0 ? get(iStatus).toUpperCase() : '';
    const cliente   = get(iCliente);
    const dataVenda = get(iData);

    out.push({
      adm, ano, sit, contrato, grupo, cota, tipo, status, cliente, dataVenda,
      grupoCota: (grupo||'') + '/' + (cota||''),
      cpf: get(iCpf),
      sitRaw: sit,
      credito,
      consultor: get(iConsultor),
      data: dataVenda,
      mes: get(iMes)
    });
  }
  return out;
}

async function upsertCache(dados) {
  const payload = {
    id: 1,
    dados,
    atualizado_em: new Date().toISOString(),
    atualizado_por: 'github_actions'
  };
  const r = await fetch(`${SB_URL}/rest/v1/portal_vendas_cache`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase upsert failed (${r.status}): ${txt}`);
  }
}

(async () => {
  try {
    console.log('[1/4] Getting Azure app-only token...');
    const token = await getToken();
    console.log('[2/4] Reading worksheet "' + SHEET_NAME + '" from ' + FILE_PATH);
    const rows = await readExcel(token);
    console.log('       -> ' + rows.length + ' raw rows (' + (rows[0]||[]).length + ' cols)');
    console.log('[3/4] Parsing rows into dashboard shape...');
    const dados = parseRows(rows);
    console.log('       -> ' + dados.length + ' valid sale records');
    console.log('[4/4] Upserting portal_vendas_cache...');
    await upsertCache(dados);
    console.log('OK - cache atualizado em ' + new Date().toISOString());
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  }
})();
