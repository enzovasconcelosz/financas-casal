/* ==========================================================================
   views/forecast.js — faturas futuras, parcelamentos e assinaturas
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var d = FC.dom, h = d.h, ic = d.ic, fmt = FC.fmt, ui = FC.ui, ch = FC.charts;

  var filtro = { pessoaId: '', escopo: 'cartao', cartaoId: '' };
  var mesAberto = null;
  var verEncerradas = false;

  var COR = { parcela: 'var(--c3)', assinatura: 'var(--c2)', avulso: 'var(--c4)' };
  var NOME = { parcela: 'Parcela', assinatura: 'Assinatura', avulso: 'Compra lançada' };

  function render(raiz) {
    var s = FC.store.get();
    var atual = fmt.thisMonth();
    var meses = [];
    for (var i = 0; i < 12; i++) meses.push(fmt.addMonths(atual, i));

    var f = { pessoaId: filtro.pessoaId || null, cartaoId: filtro.cartaoId || null, tudo: filtro.escopo === 'tudo' };
    var prev = FC.model.previsaoFaturas(s, meses, f);
    if (!mesAberto || meses.indexOf(mesAberto) < 0) mesAberto = meses[1];

    var proximos6 = prev.slice(1, 7);
    var media6 = proximos6.length ? fmt.round2(fmt.sumBy(proximos6, function (p) { return p.total; }) / proximos6.length) : 0;
    var ativas = (s.recorrentes || []).filter(function (r) { return FC.model.recorrenteAtivo(r, fmt.addMonths(atual, 1)); });
    var custoMensal = fmt.sumBy(ativas.filter(function (r) {
      return (!f.pessoaId || r.pessoaId === f.pessoaId) && (f.tudo || r.metodo === 'credito');
    }), function (r) { return r.valor; });
    var aVencer = fmt.sumBy(prev.slice(1), function (p) { return p.parcelas; });

    var tela = h('div', { 'data-accent': s.config.acentoCasal || 'oceano' });

    tela.appendChild(h('div.page-head',
      h('div.page-head__t',
        h('h1', 'Faturas futuras'),
        h('span.page-head__sub', 'parcelas e assinaturas dos próximos 12 meses')
      ),
      h('div.page-head__actions',
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: function () { FC.forms.assinatura({}); } },
          ic('refresh'), 'Nova assinatura'),
        h('button.btn.btn--sm', {
          type: 'button',
          onclick: function () { FC.forms.lancamento({ mes: atual, metodo: 'credito', repeticao: 'parcelado' }); }
        }, ic('plus'), 'Compra parcelada')
      )
    ));

    tela.appendChild(barraFiltros(s));

    /* ---------------- indicadores ---------------- */
    tela.appendChild(h('div.grid.grid--kpi.mt-4',
      ui.kpi({ rotulo: (f.tudo ? 'Compromissos de ' : 'Fatura de ') + fmt.monthLabel(atual, true), icone: 'card', cor: 'var(--c3)',
        valor: fmt.brl(prev[0].total), rodape: h('span.dim', 'o que já está lançado no mês') }),
      ui.kpi({ rotulo: 'Próxima: ' + fmt.monthLabel(meses[1], true), icone: 'calendar', cor: 'var(--accent)',
        valor: fmt.brl(prev[1].total),
        rodape: h('span.dim', fmt.brl(prev[1].parcelas) + ' parcelas · ' + fmt.brl(prev[1].assinaturas) + ' assinaturas') }),
      ui.kpi({ rotulo: 'Média dos próximos 6', icone: 'chart', cor: 'var(--c2)', valor: fmt.brl(media6),
        rodape: h('span.dim', 'sem contar compras que ainda vão acontecer') }),
      ui.kpi({ rotulo: 'Assinaturas por mês', icone: 'refresh', cor: 'var(--c6)', valor: fmt.brl(custoMensal),
        rodape: h('span.dim', fmt.brl(custoMensal * 12) + ' por ano · ' + ativas.length + ' ativas') })
    ));

    /* ---------------- gráfico ---------------- */
    tela.appendChild(h('div.card.mt-4',
      h('div.card__head',
        h('div', h('div.card__title', 'Quanto já está comprometido'),
          h('div.card__sub', 'parcelas a vencer: ' + fmt.brl(aVencer))),
        h('div.card__tools', h('span.dim', { style: { fontSize: 'var(--fs-xs)' } }, 'clique numa barra para detalhar'))
      ),
      (function () {
        var g = ch.barras({
          grupos: prev.map(function (p) { return { rotulo: p.rotulo, valores: [p.parcelas, p.assinaturas, p.avulsos] }; }),
          series: [
            { nome: 'Parcelas', cor: COR.parcela },
            { nome: 'Assinaturas', cor: COR.assinatura },
            { nome: 'Compras lançadas', cor: COR.avulso }
          ],
          empilhado: true, altura: 250
        });
        /* cada coluna leva ao detalhe daquele mês */
        var alvos = g.querySelectorAll('rect');
        Array.prototype.forEach.call(alvos, function (r, i) {
          if (!meses[i]) return;
          r.style.cursor = 'pointer';
          r.addEventListener('click', function () { mesAberto = meses[i]; FC.app.redesenhar(); });
        });
        return g;
      })()
    ));

    /* ---------------- detalhe do mês ---------------- */
    tela.appendChild(cardDetalhe(s, prev, meses, atual));

    /* ---------------- parcelamentos e assinaturas ---------------- */
    tela.appendChild(h('div.grid.grid--2.mt-4',
      cardParcelamentos(s, atual),
      h('div.col', { style: { gap: 'var(--sp-4)' } },
        cardAssinaturas(s, atual),
        cardSugestoes(s)
      )
    ));

    d.mount(raiz, tela);
  }

  /* ======================================================================
     FILTROS
     ====================================================================== */
  function barraFiltros(s) {
    var selCartao = h('select.select', {
      style: { width: 'auto', minWidth: '170px' },
      onchange: function (e) { filtro.cartaoId = e.target.value; FC.app.redesenhar(); }
    },
      h('option', { value: '' }, 'Todos os cartões'),
      s.cartoes.map(function (c) { return h('option', { value: c.id, selected: c.id === filtro.cartaoId }, c.nome); })
    );

    return h('div.card',
      h('div.row.wrap', { style: { gap: 'var(--sp-3)', alignItems: 'flex-end' } },
        ui.campo('De quem', ui.segmentado(
          [{ id: '', nome: 'Os dois' }].concat(s.casal.pessoas.map(function (p) { return { id: p.id, nome: p.apelido || p.nome }; })),
          filtro.pessoaId, function (v) { filtro.pessoaId = v; FC.app.redesenhar(); })),
        ui.campo('O que entra', ui.segmentado(
          [{ id: 'cartao', nome: 'Só fatura do cartão' }, { id: 'tudo', nome: 'Tudo (inclui débito/Pix)' }],
          filtro.escopo, function (v) { filtro.escopo = v; if (v === 'tudo') filtro.cartaoId = ''; FC.app.redesenhar(); })),
        filtro.escopo === 'cartao' ? ui.campo('Cartão', selCartao) : null
      )
    );
  }

  /* ======================================================================
     DETALHE DE UM MÊS
     ====================================================================== */
  function cardDetalhe(s, prev, meses, atual) {
    var p = prev[meses.indexOf(mesAberto)] || prev[1];

    var chips = h('div.row.wrap', { style: { gap: '5px' } },
      prev.map(function (x) {
        return h('button.chip.chip-btn', {
          type: 'button', 'aria-pressed': String(x.mes === p.mes),
          onclick: function () { mesAberto = x.mes; FC.app.redesenhar(); }
        }, x.rotulo + ' · ' + fmt.brlShort(x.total));
      }));

    var tabela = p.itens.length
      ? h('div.tablewrap', h('table.tbl',
          h('thead', h('tr', h('th', 'Descrição'), h('th', 'Tipo'), h('th', 'Quem'), h('th', 'Onde'), h('th.num', 'Valor'))),
          h('tbody', p.itens.map(function (l) {
            var pes = FC.model.pessoa(s, l.pessoaId);
            var cartao = l.cartaoId ? FC.model.cartao(s, l.cartaoId) : null;
            return h('tr', {
              style: { cursor: 'pointer' },
              onclick: function () {
                if (l.previsto) FC.forms.assinatura({ id: l.recorrenteId });
                else FC.forms.lancamento({ id: l.id });
              }
            },
              h('td', h('div.rowdesc',
                h('div.rowdesc__txt', l.desc),
                l.parcela ? h('span.chip', l.parcela.n + '/' + l.parcela.de) : null,
                l.previsto ? h('span.chip.chip--info', 'prevista') : null,
                l.terceiroId ? h('span.chip.chip--warn', FC.model.nomeTerceiro(s, l.terceiroId)) : null
              )),
              h('td', h('span.chip.chip--dot', { style: { '--chip-color': COR[l.tipoPrev] } }, NOME[l.tipoPrev])),
              h('td', pes ? h('span.chip.chip--dot', { style: { '--chip-color': ui.corDoAcento(pes.acento) } }, pes.apelido || pes.nome) : '—'),
              h('td.dim.nowrap', cartao ? cartao.nome : FC.model.nomeMetodo(l.metodo)),
              h('td.num', { style: { fontWeight: '650' } }, fmt.brl(l.valor))
            );
          })),
          h('tfoot', h('tr', { style: { borderTop: '1.5px solid var(--line)' } },
            h('td', { colspan: '4', style: { fontWeight: '700' } }, 'Total de ' + fmt.monthLabel(p.mes)),
            h('td.num', { style: { fontWeight: '700', fontSize: 'var(--fs-lg)' } }, fmt.brl(p.total))
          ))
        ))
      : ui.vazio({ titulo: 'Nada previsto em ' + fmt.monthLabel(p.mes, true), icone: 'calendar',
          texto: 'Compras parceladas e assinaturas aparecem aqui assim que forem cadastradas.' });

    return h('div.card.card--flush.mt-4',
      h('div.card__head.card__head--flush', { style: { flexDirection: 'column', alignItems: 'stretch', gap: 'var(--sp-3)' } },
        h('div.row.row--between',
          h('div.card__title', (p.mes === atual ? 'Este mês: ' : '') + fmt.monthLabel(p.mes)),
          h('div.row', { style: { gap: '5px' } },
            p.parcelas ? h('span.chip.chip--dot', { style: { '--chip-color': COR.parcela } }, fmt.brl(p.parcelas)) : null,
            p.assinaturas ? h('span.chip.chip--dot', { style: { '--chip-color': COR.assinatura } }, fmt.brl(p.assinaturas)) : null,
            p.avulsos ? h('span.chip.chip--dot', { style: { '--chip-color': COR.avulso } }, fmt.brl(p.avulsos)) : null
          )
        ),
        chips
      ),
      tabela
    );
  }

  /* ======================================================================
     PARCELAMENTOS EM ANDAMENTO
     ====================================================================== */
  function cardParcelamentos(s, atual) {
    var lista = FC.model.parcelamentos(s).filter(function (g) {
      if (filtro.pessoaId && g.pessoaId !== filtro.pessoaId) return false;
      return g.viva && (g.futuras > 0 || g.faltamLancar > 0 || g.noMesAtual);
    }).sort(function (a, b) { return a.fimPrevisto < b.fimPrevisto ? 1 : -1; });
    var incompletos = lista.filter(function (g) { return g.faltamLancar > 0; });

    return h('div.card',
      h('div.card__head',
        h('div', h('div.card__title', 'Parcelamentos em andamento'),
          h('div.card__sub', lista.length + (lista.length === 1 ? ' compra' : ' compras'))),
        incompletos.length ? h('div.card__tools',
          h('button.btn.btn--soft.btn--sm', { type: 'button', onclick: FC.forms.completarTodasParcelas },
            ic('plus'), 'Completar ' + incompletos.length)) : null
      ),
      incompletos.length ? h('div.note.note--warn', { style: { marginBottom: 'var(--sp-3)' } }, ic('alert'),
        h('div', incompletos.length + (incompletos.length === 1 ? ' compra tem' : ' compras têm') +
          ' parcelas que ainda não foram lançadas nos próximos meses — por isso não entram na previsão. ' +
          '"Completar" lança as que faltam com o valor da última.')) : null,
      lista.length
        ? h('div.col', { style: { gap: 'var(--sp-3)' } }, lista.map(function (g) {
            var nAtual = g.noMesAtual ? g.noMesAtual.parcela.n : Math.min(g.nMax, g.de);
            var pes = FC.model.pessoa(s, g.pessoaId);
            return h('div', { style: { cursor: 'pointer' }, onclick: function () { FC.forms.lancamento({ id: g.itens[g.itens.length - 1].id }); } },
              h('div.row.row--between', { style: { gap: 'var(--sp-2)' } },
                h('div', { style: { minWidth: 0 } },
                  h('div.ellipsis', { style: { fontWeight: '620', fontSize: 'var(--fs-sm)' } }, g.desc),
                  h('div.dim', { style: { fontSize: 'var(--fs-xs)' } },
                    (pes ? (pes.apelido || pes.nome) + ' · ' : '') + fmt.brl(g.valorParcela) + '/mês · até ' + fmt.monthLabel(g.fimPrevisto, true))
                ),
                h('div', { style: { textAlign: 'right', flex: 'none' } },
                  h('div.num', { style: { fontWeight: '680', fontSize: 'var(--fs-sm)' } }, nAtual + '/' + g.de),
                  g.faltamLancar > 0
                    ? h('button.btn.btn--ghost.btn--sm', {
                        type: 'button', style: { height: '24px', marginTop: '2px' },
                        onclick: function (e) { e.stopPropagation(); FC.forms.lancarParcelasQueFaltam(g.grupoId); }
                      }, '+ ' + g.faltamLancar + ' que faltam')
                    : h('div.dim', { style: { fontSize: 'var(--fs-xs)' } }, 'falta ' + fmt.brl(g.restante))
                )
              ),
              h('div.mt-2', ui.barra((nAtual / g.de) * 100, COR.parcela))
            );
          }))
        : ui.vazio({ titulo: 'Nenhuma compra parcelada em andamento', icone: 'card',
            texto: 'No lançamento, escolha "Parcelado" para dividir a compra pelos próximos meses.' })
    );
  }

  /* ======================================================================
     ASSINATURAS
     ====================================================================== */
  function cardAssinaturas(s, atual) {
    var todas = (s.recorrentes || []).filter(function (r) { return !filtro.pessoaId || r.pessoaId === filtro.pessoaId; });
    var ativas = todas.filter(function (r) { return !r.fim || r.fim > atual; })
      .sort(function (a, b) { return b.valor - a.valor; });
    var encerradas = todas.filter(function (r) { return r.fim && r.fim <= atual; });

    function linha(r) {
      var pes = FC.model.pessoa(s, r.pessoaId);
      var cartao = r.cartaoId ? FC.model.cartao(s, r.cartaoId) : null;
      return h('div.row.row--between', {
        style: { cursor: 'pointer', padding: '6px 0', opacity: r.fim && r.fim <= atual ? .55 : 1 },
        onclick: function () { FC.forms.assinatura({ id: r.id }); }
      },
        h('div', { style: { minWidth: 0 } },
          h('div.ellipsis', { style: { fontWeight: '620', fontSize: 'var(--fs-sm)' } }, r.desc),
          h('div.dim', { style: { fontSize: 'var(--fs-xs)' } },
            (pes ? (pes.apelido || pes.nome) + ' · ' : '') + (cartao ? cartao.nome : FC.model.nomeMetodo(r.metodo)) +
            ' · dia ' + (r.dia || 1) + (r.fim ? ' · até ' + fmt.monthLabel(r.fim, true) : ''))
        ),
        h('span.num', { style: { fontWeight: '680', fontSize: 'var(--fs-sm)' } }, fmt.brl(r.valor))
      );
    }

    return h('div.card',
      h('div.card__head',
        h('div', h('div.card__title', 'Assinaturas'),
          h('div.card__sub', fmt.brl(fmt.sumBy(ativas, function (r) { return r.valor; })) + ' por mês')),
        h('div.card__tools', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: function () { FC.forms.assinatura({}); } },
          ic('plus'), 'Nova'))
      ),
      ativas.length
        ? h('div.col', { style: { gap: 0 } }, ativas.map(linha))
        : ui.vazio({ titulo: 'Nenhuma assinatura', icone: 'refresh',
            texto: 'Cadastre o que se repete todo mês (streaming, plano de saúde, academia) para entrar nas faturas futuras.' }),
      encerradas.length ? h('div.mt-2',
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: function () { verEncerradas = !verEncerradas; FC.app.redesenhar(); } },
          ic(verEncerradas ? 'chevUp' : 'chevDown'), encerradas.length + ' encerradas'),
        verEncerradas ? h('div.col', { style: { gap: 0 } }, encerradas.map(linha)) : null
      ) : null
    );
  }

  /* ======================================================================
     SUGESTÕES A PARTIR DO HISTÓRICO
     ====================================================================== */
  function cardSugestoes(s) {
    var lista = FC.model.sugestoesAssinaturas(s).filter(function (x) { return !filtro.pessoaId || x.pessoaId === filtro.pessoaId; });
    if (!lista.length) return h('div');

    function adicionarTodas() {
      var criados = 0;
      FC.store.atualizar(function (st) {
        lista.forEach(function (x) {
          st.recorrentes.push({
            id: fmt.uid('rec'), desc: x.desc, valor: x.valor, pessoaId: x.pessoaId, metodo: x.metodo,
            cartaoId: x.metodo === 'credito' ? x.cartaoId : null, categoriaId: x.categoriaId, dia: 1,
            inicio: fmt.thisMonth(), fim: null, ultimoMes: null, criadoEm: new Date().toISOString()
          });
        });
        criados = FC.model.materializar(st);
      });
      ui.toast(lista.length + ' assinaturas criadas' + (criados ? ' (' + criados + ' lançadas neste mês)' : '') + '.', 'ok');
    }

    return h('div.card',
      h('div.card__head',
        h('div', h('div.card__title', 'Parece assinatura'),
          h('div.card__sub', 'gastos que se repetiram em 3 dos últimos 4 meses')),
        h('div.card__tools', h('button.btn.btn--soft.btn--sm', { type: 'button', onclick: adicionarTodas }, 'Adicionar todas'))
      ),
      h('div.col', { style: { gap: 0 } }, lista.map(function (x) {
        var pes = FC.model.pessoa(s, x.pessoaId);
        return h('div.row.row--between', { style: { padding: '6px 0', gap: 'var(--sp-2)' } },
          h('div', { style: { minWidth: 0 } },
            h('div.ellipsis', { style: { fontWeight: '620', fontSize: 'var(--fs-sm)' } }, x.desc),
            h('div.dim', { style: { fontSize: 'var(--fs-xs)' } },
              (pes ? (pes.apelido || pes.nome) + ' · ' : '') + FC.model.nomeMetodo(x.metodo) + ' · em ' + x.meses + ' meses')
          ),
          h('div.row', { style: { flex: 'none' } },
            h('span.num', { style: { fontWeight: '650', fontSize: 'var(--fs-sm)' } }, fmt.brl(x.valor)),
            h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: function () { FC.forms.assinatura({ sugestao: x }); } },
              ic('plus'))
          )
        );
      }))
    );
  }

  FC.viewFaturas = { render: render };
})(typeof self !== 'undefined' ? self : this);
