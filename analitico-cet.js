// ═══════════════════════════════════════════════════════════════════════
// MÓDULO ANALÍTICO CET — memória de cálculo + tabela ano a ano
// Compartilhado entre todos os simuladores Master Prime
//
// Uso:
//   1) Adicionar <script src="analitico-cet.js"></script> no HTML
//   2) Após calcular CET, chamar:
//        AnaliticoCet.set('parcela', { ...dados });
//        AnaliticoCet.set('prazo',   { ...dados });
//   3) Adicionar botão olho com onclick="AnaliticoCet.abrir('parcela')"
//      (ou 'prazo', 'p1_parcela', 'p2_prazo' etc — chaves livres)
//
// Dados esperados em set(chave, dados):
//   {
//     titulo:        'Pós contemplação · Redução de parcela',  // texto do header
//     credito:       100000,           // valor da carta de crédito
//     taxaAdm:       0.18,             // decimal (18% = 0.18)
//     fundo:         0.02,             // decimal
//     lanceProprios: 40000,            // R$
//     prazoEf:       100,              // prazo usado no expoente do CET
//     parcelaInicial:1200,             // R$
//     expectativa:   1,                // mês da contemplação
//     parcelaPos:    795.96,           // R$
//     prazoRestPos:  99,               // meses restantes pós contemplação
//     cetMensal:     0.0029,           // decimal (0,29% = 0.0029)
//     cetAnual:      0.0354,           // decimal (3,54% = 0.0354)
//   }
// ═══════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const STORE = {};

  function fmt(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function fmtPct(v, casas){ casas = casas==null?2:casas; return Number((v||0)*100).toLocaleString('pt-BR',{minimumFractionDigits:casas,maximumFractionDigits:casas}) + ' %'; }

  function ensureCss(){
    if (document.getElementById('analitico-cet-css')) return;
    const css = document.createElement('style');
    css.id = 'analitico-cet-css';
    css.textContent = `
      .ace-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:1000;align-items:center;justify-content:center;padding:20px;animation:aceFadeIn .15s ease;}
      .ace-overlay.aberto{display:flex;}
      @keyframes aceFadeIn{from{opacity:0}to{opacity:1}}
      .ace-box{background:#fff;border-radius:14px;width:100%;max-width:880px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(0,0,0,.30);animation:aceSlide .2s ease;overflow:hidden;font-family:'Inter',-apple-system,system-ui,sans-serif;color:#1F2937;}
      @keyframes aceSlide{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
      .ace-head{padding:20px 26px 16px;border-bottom:1px solid #E5E7EB;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;}
      .ace-title{font-size:17px;font-weight:700;color:#2D3F5E;letter-spacing:-.2px;}
      .ace-sub{font-size:12px;color:#6B7280;margin-top:3px;}
      .ace-close{background:transparent;border:1px solid #E5E7EB;width:30px;height:30px;border-radius:8px;cursor:pointer;color:#6B7280;display:flex;align-items:center;justify-content:center;}
      .ace-close:hover{background:#F3F4F6;border-color:#6B7280;}
      .ace-body{flex:1;overflow-y:auto;padding:16px 26px;}
      .ace-foot{padding:14px 26px;border-top:1px solid #E5E7EB;display:flex;justify-content:center;}
      .ace-btn{padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#2D3F5E;color:#fff;}
      .ace-btn:hover{background:#1E2D45;}

      .ace-mem{background:#FAFCFE;border:1px solid #E5E7EB;border-radius:10px;padding:16px 18px;margin-bottom:18px;}
      .ace-mem h4{font-size:12px;font-weight:700;color:#2D3F5E;text-transform:uppercase;letter-spacing:.5px;margin:0 0 12px;}
      .ace-mem-step{display:grid;grid-template-columns:1fr auto;gap:8px 14px;padding:7px 0;border-bottom:1px solid #E5E7EB;align-items:center;font-size:12.5px;}
      .ace-mem-step:last-child{border-bottom:none;padding-bottom:0;}
      .ace-mem-res{color:#2D3F5E;font-weight:700;font-family:'DM Mono',ui-monospace,monospace;}
      .ace-mem-step.dest{background:rgba(45,63,94,.04);margin:0 -18px;padding-left:18px;padding-right:18px;}
      .ace-mem-step.dest .ace-mem-res{font-size:14px;}

      .ace-tab{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;}
      .ace-tab thead th{background:#2D3F5E;color:#fff;padding:12px 14px;font-weight:600;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.6px;}
      .ace-tab thead th:first-child{border-top-left-radius:10px;}
      .ace-tab thead th:last-child{border-top-right-radius:10px;text-align:right;}
      .ace-tab thead th:not(:first-child):not(:last-child){text-align:right;}
      .ace-tab tbody td{padding:11px 14px;border-bottom:1px solid #E5E7EB;}
      .ace-tab tbody td:first-child{font-weight:600;color:#2D3F5E;}
      .ace-tab tbody td:not(:first-child){text-align:right;font-family:'DM Mono',ui-monospace,monospace;}
      .ace-tab tbody tr:hover{background:#F9FAFB;}
      .ace-tab tfoot td{background:#2D3F5E;color:#fff;padding:12px 14px;font-weight:700;font-size:12px;}
      .ace-tab tfoot td:first-child{text-align:left;border-bottom-left-radius:10px;}
      .ace-tab tfoot td:last-child{text-align:right;border-bottom-right-radius:10px;font-family:'DM Mono',ui-monospace,monospace;}

      .ace-eye{background:transparent;border:none;padding:2px;cursor:pointer;color:#2D3F5E;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;transition:background .15s;vertical-align:middle;}
      .ace-eye:hover{background:rgba(45,63,94,.10);}
    `;
    document.head.appendChild(css);
  }

  function ensureModal(){
    if (document.getElementById('aceModal')) return;
    ensureCss();
    const o = document.createElement('div');
    o.id = 'aceModal';
    o.className = 'ace-overlay';
    o.innerHTML = `
      <div class="ace-box" onclick="event.stopPropagation()">
        <div class="ace-head">
          <div>
            <div class="ace-title">Analítico</div>
            <div class="ace-sub" id="aceSub">Memória de cálculo ano a ano</div>
          </div>
          <button class="ace-close" onclick="AnaliticoCet.fechar()" title="Fechar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="ace-body">
          <div class="ace-mem" id="aceMem"></div>
          <table class="ace-tab">
            <thead>
              <tr>
                <th>Ano</th><th>Carta de crédito</th><th>Saldo devedor</th><th>Parcela</th><th>Total pago</th>
              </tr>
            </thead>
            <tbody id="aceBody"></tbody>
            <tfoot>
              <tr><td colspan="4">TOTAL</td><td id="aceTotal">R$ 0,00</td></tr>
            </tfoot>
          </table>
        </div>
        <div class="ace-foot">
          <button class="ace-btn" onclick="AnaliticoCet.fechar()">Fechar</button>
        </div>
      </div>
    `;
    o.addEventListener('click', () => AnaliticoCet.fechar());
    document.body.appendChild(o);
  }

  // SVG do olho — pode ser usado nos HTMLs com {{eyeIcon}}
  const SVG_EYE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';

  function eyeHTML(chave){
    return `<button type="button" class="ace-eye" onclick="AnaliticoCet.abrir('${chave}')" title="Ver memória de cálculo">${SVG_EYE}</button>`;
  }

  function set(chave, dados){
    STORE[chave] = dados;
  }

  function abrir(chave){
    const d = STORE[chave];
    if (!d || !d.credito) { alert('Preencha primeiro a simulação.'); return; }
    ensureModal();

    // Constrói parcelas mês a mês
    const parcelas = [];
    const exp = d.expectativa || 1;
    const parcIni = d.parcelaInicial || 0;
    const parcPos = d.parcelaPos || 0;
    const prazoRestPos = d.prazoRestPos || 0;
    for (let m = 1; m <= exp; m++) parcelas.push(parcIni);
    for (let m = 1; m <= prazoRestPos; m++) parcelas.push(parcPos);

    const totalGeral = parcelas.reduce((a,b)=>a+b, 0);

    // Agrupa por ano (Conkey style: saldo no INÍCIO do ano = total - acumulado - parc do mês 1)
    const anos = [];
    let pagoAcumulado = 0;
    for (let i = 0; i < parcelas.length; i += 12) {
      const slice = parcelas.slice(i, i+12);
      const totalAno = slice.reduce((a,b)=>a+b, 0);
      const parcelaMes1 = parcelas[i] || 0;
      const parcMensal = slice[slice.length-1] || parcPos;
      const saldoInicio = totalGeral - pagoAcumulado - parcelaMes1;
      anos.push({
        ano: anos.length+1,
        carta: d.credito,
        saldo: saldoInicio,
        parcela: parcMensal,
        total: totalAno
      });
      pagoAcumulado += totalAno;
    }

    // Memória de cálculo
    const taxaAdm = d.taxaAdm || 0;
    const fundo = d.fundo || 0;
    const lanceProp = d.lanceProprios || 0;
    const custo = d.credito * (taxaAdm + fundo);
    const disponivel = d.credito - lanceProp;
    const ratio = disponivel > 0 ? custo/disponivel : 0;
    const prazoEf = d.prazoEf || (exp + prazoRestPos);

    document.getElementById('aceMem').innerHTML = `
      <h4>Memória de cálculo do CET</h4>
      <div class="ace-mem-step">
        <span><strong>Custo</strong> = crédito × (taxa adm + fundo) = ${fmt(d.credito)} × ${fmtPct(taxaAdm + fundo, 2)}</span>
        <span class="ace-mem-res">${fmt(custo)}</span>
      </div>
      <div class="ace-mem-step">
        <span><strong>Disponível</strong> = crédito − lance próprios = ${fmt(d.credito)} − ${fmt(lanceProp)}</span>
        <span class="ace-mem-res">${fmt(disponivel)}</span>
      </div>
      <div class="ace-mem-step">
        <span><strong>Razão</strong> = custo / disponível = ${fmt(custo)} / ${fmt(disponivel)}</span>
        <span class="ace-mem-res">${ratio.toFixed(4)}</span>
      </div>
      <div class="ace-mem-step">
        <span><strong>CET mensal</strong> = (1 + razão)^(1/${prazoEf}) − 1</span>
        <span class="ace-mem-res">${fmtPct(d.cetMensal||0, 2)}</span>
      </div>
      <div class="ace-mem-step dest">
        <span><strong>CET anual</strong> = (1 + CET mensal)^12 − 1</span>
        <span class="ace-mem-res">${fmtPct(d.cetAnual||0, 2)}</span>
      </div>
    `;

    document.getElementById('aceBody').innerHTML = anos.map(a => `
      <tr>
        <td>${a.ano}</td>
        <td>${fmt(a.carta)}</td>
        <td>${fmt(a.saldo)}</td>
        <td>${fmt(a.parcela)}</td>
        <td>${fmt(a.total)}</td>
      </tr>
    `).join('');
    document.getElementById('aceTotal').textContent = fmt(totalGeral);
    document.getElementById('aceSub').textContent = (d.titulo||'') + ' · memória de cálculo ano a ano';
    document.getElementById('aceModal').classList.add('aberto');
  }

  function fechar(){
    const m = document.getElementById('aceModal');
    if (m) m.classList.remove('aberto');
  }

  // expõe global
  window.AnaliticoCet = { set, abrir, fechar, eyeHTML, SVG_EYE };
})();
