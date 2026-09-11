// ═══════════════════════════════════════════════════════════════════════
// EVOLUÇÃO DA PARCELA — bloco OPCIONAL dos simuladores dedicados
// (Porto, Itaú, Bradesco, Santander) e do Modo Investidor.
//
// Pedido do Paulo (11/09/2026): ver quanto fica cada parcela ao longo do
// prazo e o valor da última, considerando o INCC. Os dedicados simulam a
// preço de hoje e são validados centavo a centavo contra os simuladores
// oficiais das administradoras, então este bloco é SÓ LEITURA: pega os
// valores que a tela já mostra, aplica o % de reajuste que o usuário
// digitar e abre a tabela ano a ano / mês a mês do Analítico compartilhado
// (analitico-cet.js). Nenhum número do simulador é alterado.
//
// Uso em cada página (depois de carregar analitico-cet.js):
//   <script src="analitico-cet.js"></script>
//   <script src="evolucao-parcela.js"></script>
//   <script>
//     EvolucaoParcela.init({
//       montarApos: '#id-de-um-elemento',   // o card entra logo depois dele
//       titulo: 'Porto Imóvel',
//       ler: function(){                     // lê o que a TELA mostra
//         return {
//           credito: 300000,                 // carta de crédito
//           preInicial: 3785,                // parcela dos primeiros meses (com adesão) — opcional
//           qtdIniciais: 3,                  // quantos meses pagam a preInicial — opcional
//           preDemais: 1785,                 // demais parcelas até contemplar
//           contempla: 12,                   // mês da contemplação (0/NaN = sem contemplação)
//           prazo: 200,                      // prazo total
//           parcelaPos: 1398.83,             // parcela pós-contemplação exibida
//           prazoRest: 188,                  // prazo restante exibido
//         };
//       }
//     });
//   </script>
// ═══════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

  function ensureCss(){
    if (document.getElementById('evolucao-parcela-css')) return;
    const css = document.createElement('style');
    css.id = 'evolucao-parcela-css';
    css.textContent = `
      .evo-card{background:#fff;border:1px solid #E5E7EB;border-radius:10px;margin-top:14px;overflow:hidden;font-family:inherit;}
      .evo-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 16px;cursor:pointer;user-select:none;}
      .evo-head:hover{background:#F9FAFB;}
      .evo-titulo{font-size:11.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#2D3F5E;display:flex;align-items:center;gap:8px;}
      .evo-chev{display:inline-block;width:0;height:0;border-left:5px solid #9CA3AF;border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .15s;}
      .evo-card.aberto .evo-chev{transform:rotate(90deg);}
      .evo-tag{font-size:9.5px;font-weight:600;color:#6B7280;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:4px;padding:2px 7px;letter-spacing:.5px;}
      .evo-body{display:none;padding:0 16px 14px;border-top:1px solid #F3F4F6;}
      .evo-card.aberto .evo-body{display:block;}
      .evo-linha{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;margin-top:12px;}
      .evo-campo label{display:block;font-size:10.5px;font-weight:600;color:#6B7280;letter-spacing:.4px;text-transform:uppercase;margin-bottom:4px;}
      .evo-campo input{width:130px;padding:8px 10px;border:1px solid #D1D5DB;border-radius:7px;font-size:13px;color:#1F2937;}
      .evo-campo input:focus{outline:none;border-color:#2D3F5E;}
      .evo-btn{padding:9px 16px;border-radius:7px;border:1px solid #2D3F5E;background:#2D3F5E;color:#fff;font-size:12.5px;font-weight:600;cursor:pointer;}
      .evo-btn:hover{background:#1E2D45;}
      .evo-indices{font-size:11px;color:#6B7280;margin-top:8px;display:none;}
      .evo-indices a{font-weight:600;text-decoration:underline;color:inherit;cursor:pointer;}
      .evo-nota{font-size:10.5px;color:#9CA3AF;margin-top:10px;font-style:italic;}
    `;
    document.head.appendChild(css);
  }

  // Índices oficiais (acumulado 12m) da API pública do BCB — mesmos do Modo
  // Investidor: INCC 192, IPCA 433, IGP-M 189. Uma busca por página.
  let _indicesPromise = null;
  function buscarIndices(){
    if (_indicesPromise) return _indicesPromise;
    const SERIES = [ { nome: 'INCC', sgs: 192 }, { nome: 'IPCA', sgs: 433 }, { nome: 'IGP-M', sgs: 189 } ];
    _indicesPromise = Promise.all(SERIES.map(s =>
      fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + s.sgs + '/dados/ultimos/12?formato=json')
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => {
          if (!Array.isArray(d) || d.length < 12) return null;
          const acc = d.reduce((a, x) => a * (1 + parseFloat(String(x.valor).replace(',', '.')) / 100), 1);
          return { nome: s.nome, pct: (acc - 1) * 100 };
        }).catch(() => null)
    )).then(rs => rs.filter(x => x && isFinite(x.pct)));
    return _indicesPromise;
  }

  function pctDoCampo(input){
    const n = parseFloat(String(input.value).replace('%','').replace(',', '.').trim());
    return isFinite(n) && n > 0 ? n/100 : 0;
  }

  function init(cfg){
    if (!cfg || typeof cfg.ler !== 'function') return;
    ensureCss();
    const alvo = typeof cfg.montarApos === 'string' ? document.querySelector(cfg.montarApos) : cfg.montarApos;
    if (!alvo) return;

    const card = document.createElement('section');
    card.className = 'evo-card';
    card.innerHTML = `
      <div class="evo-head">
        <span class="evo-titulo"><span class="evo-chev"></span>Evolução da parcela</span>
        <span class="evo-tag">PROJEÇÃO OPCIONAL</span>
      </div>
      <div class="evo-body">
        <div class="evo-linha">
          <div class="evo-campo">
            <label>% Reajuste anual</label>
            <input type="text" class="evo-reajuste" placeholder="ex.: 5,00 %" inputmode="decimal">
          </div>
          <button type="button" class="evo-btn">Ver evolução mês a mês</button>
        </div>
        <div class="evo-indices"></div>
        <div class="evo-nota">Projeção informativa com o reajuste digitado (deixe vazio pra ver sem reajuste). Não altera nenhum valor do simulador.</div>
      </div>`;
    alvo.parentNode.insertBefore(card, alvo.nextSibling);

    card.querySelector('.evo-head').addEventListener('click', () => card.classList.toggle('aberto'));

    // Chips de reajuste — clicou, aplica no campo.
    // chipsFixos (opcional no init): atalhos de % fixo do produto, ex. grupos
    // Itaú pré-fixados 3% e 5%. Aparecem na hora, sem depender da API do BCB.
    // Os índices oficiais (INCC/IPCA/IGP-M, acumulado 12m) entram quando chegam.
    const campoReaj = card.querySelector('.evo-reajuste');
    const divInd = card.querySelector('.evo-indices');
    const fixos = (Array.isArray(cfg.chipsFixos) ? cfg.chipsFixos : []).filter(f => f && isFinite(f.pct));
    function _chip(nome, pct){ return '<a data-pct="' + Number(pct).toFixed(2) + '">' + nome + '</a>'; }
    function renderChips(indicesBcb){
      const partes = [];
      if (fixos.length) partes.push('Clique p/ aplicar: ' + fixos.map(f => _chip(f.nome, f.pct)).join(' · '));
      if (indicesBcb && indicesBcb.length) partes.push((fixos.length ? '' : 'Clique p/ aplicar: ') + 'Acumulado 12m (Banco Central): ' + indicesBcb.map(x =>
        _chip(x.nome + ' ' + x.pct.toFixed(2).replace('.', ',') + '%', x.pct)).join(' · '));
      if (!partes.length) return;
      divInd.innerHTML = partes.join('<br>');
      divInd.style.display = 'block';
      divInd.querySelectorAll('a').forEach(a => a.addEventListener('click', ev => {
        ev.preventDefault();
        campoReaj.value = a.dataset.pct.replace('.', ',') + ' %';
      }));
    }
    renderChips(null);
    buscarIndices().then(ok => renderChips(ok));

    card.querySelector('.evo-btn').addEventListener('click', () => abrir(cfg, campoReaj));
  }

  function abrir(cfg, campoReaj){
    if (!window.AnaliticoCet) return;
    let dados;
    try { dados = cfg.ler(); } catch(e) { dados = null; }
    if (!dados || !(dados.credito > 0) || !(dados.prazo > 0)) {
      alert('Preencha primeiro a simulação.');
      return;
    }
    const reaj = pctDoCampo(campoReaj);
    const prazo = Math.round(dados.prazo);
    const contempla = (dados.contempla > 0 && dados.parcelaPos > 0) ? Math.min(Math.round(dados.contempla), prazo) : 0;
    const qtdIni = Math.max(0, Math.round(dados.qtdIniciais || 0));
    const preIni = dados.preInicial > 0 ? dados.preInicial : (dados.preDemais || 0);
    const preDem = dados.preDemais > 0 ? dados.preDemais : preIni;

    // Fluxo mês a mês: reajuste incide JÁ no mês do aniversário (mesma convenção
    // Conkey usada em todos os simuladores da casa).
    const arr = [];
    let pIni = preIni, pDem = preDem, pPos = dados.parcelaPos || 0;
    const mesesPre = contempla > 0 ? contempla : prazo;
    for (let m = 1; m <= mesesPre; m++) {
      if (reaj > 0 && m % 12 === 0) { pIni *= (1 + reaj); pDem *= (1 + reaj); }
      arr.push(m <= qtdIni ? pIni : pDem);
    }
    if (contempla > 0) {
      const rest = Math.max(0, Math.round(dados.prazoRest != null ? dados.prazoRest : (prazo - contempla)));
      // posPrimeira: 1ª parcela pós-contemplação diferente das demais
      // (Bradesco: a 1ª pós mantém o valor da inicial e a redução vem na 2ª)
      let pPos1 = dados.posPrimeira > 0 ? dados.posPrimeira : null;
      for (let m = contempla + 1; m <= contempla + rest; m++) {
        if (reaj > 0 && m % 12 === 0) { pPos *= (1 + reaj); if (pPos1) pPos1 *= (1 + reaj); }
        arr.push(m === contempla + 1 && pPos1 ? pPos1 : pPos);
      }
    }
    if (!arr.length) { alert('Preencha primeiro a simulação.'); return; }

    const primeira = arr[0];
    const ultima = arr[arr.length - 1];
    const naContempla = contempla > 0 ? arr[Math.min(contempla, arr.length) - 1] : null;
    const total = arr.reduce((a,b) => a + b, 0);
    const reajTxt = reaj > 0
      ? (reaj*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' % ao ano'
      : 'sem reajuste';

    const memoriaHtml = `
      <h4>Projeção da parcela — ${reajTxt}</h4>
      <div class="ace-mem-step">
        <span><strong>1.</strong> Parcela de hoje (1º mês):</span>
        <span class="ace-mem-res">${fmt(primeira)}</span>
      </div>
      ${naContempla != null ? `
      <div class="ace-mem-step">
        <span><strong>2.</strong> Parcela no mês da contemplação (mês ${contempla}):</span>
        <span class="ace-mem-res">${fmt(naContempla)}</span>
      </div>` : ''}
      <div class="ace-mem-step dest">
        <span><strong>${naContempla != null ? 3 : 2}.</strong> Última parcela projetada (mês ${arr.length}):</span>
        <span class="ace-mem-res">${fmt(ultima)}</span>
      </div>
      <div class="ace-mem-step">
        <span><strong>${naContempla != null ? 4 : 3}.</strong> Total projetado das ${arr.length} parcelas:</span>
        <span class="ace-mem-res">${fmt(total)}</span>
      </div>
      <div class="ace-mem-step" style="border-bottom:none;font-size:11.5px;color:#6B7280;font-style:italic;padding-top:10px;">
        <span>Projeção informativa: aplica o reajuste digitado sobre os valores que o simulador mostra hoje. Clique num ano da tabela pra abrir o mês a mês.</span>
        <span></span>
      </div>`;

    AnaliticoCet.set('evolucao_dedicado', {
      titulo: (typeof cfg.titulo === 'function' ? cfg.titulo() : cfg.titulo) || 'Evolução da parcela',
      credito: dados.credito,
      parcelaInicial: primeira,
      expectativa: contempla > 0 ? contempla : 1,
      contemplacaoMes: contempla > 0 ? contempla : -1,
      parcelaPos: dados.parcelaPos || 0,
      prazoRestPos: Math.max(0, arr.length - (contempla > 0 ? contempla : 0)),
      reajuste: reaj,
      tipoReajuste: reaj > 0 ? 'cota-anual' : '',
      period: 12,
      parcelas: arr,
      memoriaHtml: memoriaHtml,
    });
    AnaliticoCet.abrir('evolucao_dedicado');
  }

  // Helpers de leitura pros callers: "R$ 1.398,83" -> 1398.83 · "188 meses" -> 188
  function num(t){
    const s = String(t == null ? '' : t).replace(/\./g,'').replace(',', '.').replace(/[^0-9.]/g,'');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function int(t){
    const n = parseInt(String(t == null ? '' : t).replace(/\D/g,''), 10);
    return isFinite(n) ? n : 0;
  }

  window.EvolucaoParcela = { init, num, int };
})();
