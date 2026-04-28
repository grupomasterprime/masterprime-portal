// Refresh portal_vendas_cache from OneDrive Excel via Microsoft Graph (app-only)
// Runs on GitHub Actions every 30 minutes.

const TENANT       = process.env.AZURE_TENANT_ID;
const CLIENT_ID    = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET= process.env.AZURE_CLIENT_SECRET;
const SB_URL       = process.env.SUPABASE_URL || 'https://jhwciwvgagnuxakukyob.supabase.co';
const SB_KEY       = process.env.SUPABASE_SERVICE_KEY;
const USER_UPN     = process.env.ONEDRIVE_USER_UPN  || 'allan@grupomasterprime.com.br';
const FILE_PATH    = process.env.ONEDRIVE_FILE_PATH || '/Allan/Administração Master Prime/Master Prime Porto Elite.xlsx';
const SHEET_NAME   = process.env.ONEDRIVE_SHEET     || 'Base de Vendas';
const ROW_COL      = process.env.SB_DATA_COLUMN     || 'linhas';

if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) { console.error('Missing AZURE_* envs'); process.exit(1); }
if (!SB_KEY) { console.error('Missing SUPABASE_SERVICE_KEY'); process.exit(1); }

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
  const sheet   = encodeURIComponent(SHEET_NAME);
  const r = await fetch(`${base}/worksheets('${sheet}')/usedRange`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Graph error: ' + JSON.stringify(j));
  const rows = j.values || j.text || [];
  if (rows.length < 2) throw new Error('Empty worksheet');
  return rows;
}

async function upsertCache(rows) {
  const payload = {
    id: 1,
    [ROW_COL]: rows,
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
    console.log('[1/3] Getting Azure app-only token...');
    const token = await getToken();
    console.log('[2/3] Reading worksheet "' + SHEET_NAME + '" from ' + FILE_PATH);
    const rows = await readExcel(token);
    console.log('       -> ' + rows.length + ' rows (' + (rows[0]||[]).length + ' cols)');
    console.log('[3/3] Upserting portal_vendas_cache...');
    await upsertCache(rows);
    console.log('OK - cache atualizado em ' + new Date().toISOString());
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  }
})();
