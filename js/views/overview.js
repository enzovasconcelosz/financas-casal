/* ==========================================================================
   views/overview.js — painel do casal: patrimonio, fluxo e para onde vai
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var d = FC.dom, h = d.h, ic = d.ic, fmt = FC.fmt, ui = FC.ui, ch = FC.charts;

  function render(raiz, ctx) {
    var s = FC.store.get();
    var mes = ctx.mes;

    var r = FC.model.resumoCasal(s, mes);
    var pat = FC.model.patrimonio(s);
    var anterior = FC.model.resumoCasal(s, fmt.addMonths(mes, -1));
    var meses12 = fmt.lastMonths(mes, 12);
    var meses6 = fmt.lastMonths(mes, 6);

    var tela = h('div', { 'data-accent': s.config.acentoCasal || 'oceano' });

    /* ---------------------------- cabecalho ---------------------------- */
    tela.appendChild(h('div.page-head',
      h('div.page-head__t',
        h('h1', s.casal.nome),
        h('span.page-head__sub', 'Visão geral de ' + fmt.monthLabel(mes))
      ),
      h('div.page-head__actions',
        h('button.btn.btn--ghost.btn--sm', {
          type: 'button', onclick: function () { FC.app.irPara('#/relatorios'); }
        }, ic('file'), 'Relatório'),
        h('button.btn.btn--sm', {
          type: 'button', onclick: function () { FC.forms.lancamento({ mes: mes }); }
        }, ic('plus'), 'Lançar')
      )
    ));

    /* ---------------------------- patrimonio ---------------------------- */
    tela.appendChild(blocoPatrimonio(s, pat, meses12));

    /* ---------------------------- KPIs do mes ---------------------------- */
    var serieGastos = meses6.map(function (m) { return FC.model.resumoCasal(s, m).gastos; });
    var serieEntradas = meses6.map(function (m) { return FC.model.resumoCasal(s, m).entradas; });
    var media = FC.model.mediaGastos(s, mes, 3);

    tela.appendChild(h('div.grid.grid--kpi.mt-4',
      ui.kpi({
        rotulo: 'Entradas do mês', icone: 'arrowDown', cor: 'var(--pos)',
        valor: fmt.brl(r.entradas), classeValor: 'pos',
        rodape: h('div.row', ui.delta(FC.model.variacao(r.entradas, anterior.entradas)), h('span.dim', 'vs. anterior')),
        spark: ch.sparkline(serieEntradas, 'var(--pos)')
      }),
      ui.kpi({
        rotulo: 'Gastos do mês', icone: 'arrowUp', cor: 'var(--neg)',
        valor: fmt.brl(r.gastos),
        rodape: h('div.row', ui.delta(FC.model.variacao(r.gastos, anterior.gastos)), h('span.dim', 'vs. anterior')),
        spark: ch.sparkline(serieGastos, 'var(--neg)')
      }),
      ui.kpi({
        rotulo: 'Sobra do mês', icone: 'wallet',
        cor: r.sobra >= 0 ? 'var(--pos)' : 'var(--neg)',
        valor: fmt.brl(r.sobra),
        classeValor: r.sobra >= 0 ? 'pos' : 'neg',
        rodape: media > 0
          ? h('span.dim', 'média de gasto: ' + fmt.brl(media))
          : h('span.dim', 'entradas − gastos')
      }),
      ui.kpi({
        rotulo: 'Fatura do mês', icone: 'card', cor: 'var(--c3)',
        valor: fmt.brl(r.credito + r.outros),
        rodape: r.outros > 0
          ? h('span.dim', fmt.brl(r.outros) + ' são de terceiros')
          : h('span.dim', 'tudo de vocês')
      })
    ));

    /* ---------------------------- fluxo do ano ---------------------------- */
    var serie = FC.model.serieMensal(s, meses12);

    tela.appendChild(h('div.card.mt-4',
      h('div.card__head',
        h('div',
          h('div.card__title', 'Entrou e saiu'),
          h('div.card__sub', 'últimos 12 meses')
        ),
        h('div.card__tools',
          h('span.chip.chip--pos', 'entradas'),
          h('span.chip.chip--neg', 'gastos')
        )
      ),
      ch.barras({
        grupos: serie.map(function (x) { return { rotulo: x.rotulo, valores: [x.entradas, x.gastos] }; }),
        series: [
          { nome: 'Entradas', cor: 'var(--pos)' },
          { nome: 'Gastos', cor: 'var(--neg)' }
        ],
        linha: { nome: 'Sobra', cor: 'var(--c2)', dados: serie.map(function (x) { return x.sobra; }) },
        altura: 280
      })
    ));

    /* ---------------------------- categorias + comparativo ---------------------------- */
    var cats = FC.model.porCategoria(s, mes);

    tela.appendChild(h('div.grid.grid--wide.mt-4',
      h('div.card',
        h('div.card__head',
          h('div.card__title', 'Para onde foi o dinheiro'),
          h('div.card__tools',
            h('span.chip', fmt.monthLabel(mes, true)),
            h('button.btn.btn--ghost.btn--sm', {
              type: 'button', onclick: function () { FC.app.irPara('#/relatorios'); }
            }, 'Detalhar')
          )
        ),
        cats.itens.length
          ? h('div.grid.grid--2',
              ch.donut({ itens: cats.itens, centro: { k: 'Total', v: fmt.brl(cats.total) }, tamanho: 210, legenda: false }),
              ch.ranking(cats.itens, { limite: 7 })
            )
          : ui.vazio({
              titulo: 'Nenhum gasto em ' + fmt.monthLabel(mes, true),
              icone: 'pie',
              texto: 'Assim que vocês lançarem os gastos, o gráfico aparece aqui.',
              acao: h('button.btn.btn--sm', {
                type: 'button', onclick: function () { FC.forms.lancamento({ mes: mes }); }
              }, ic('plus'), 'Lançar o primeiro')
            })
      ),

      h('div.col', { style: { gap: 'var(--sp-4)' } },
        cardComparativo(s, mes, r),
        cardDica(s)
      )
    ));

    /* ---------------------------- terceiros / parcelas / calendario ---------------------------- */
    var terceiros = FC.model.porTerceiro(s).filter(function (t) { return t.aberto > 0; });
    var atualReal = fmt.thisMonth();
    var futuras = FC.model.previsaoFaturas(s, [1, 2, 3, 4, 5, 6].map(function (i) {
      return fmt.addMonths(atualReal, i);
    }), { tudo: true });
    var dias = FC.model.porDia(s, mes);

    tela.appendChild(h('div.grid.grid--3.mt-4',
      cardCalendario(s, mes, dias),
      cardTerceiros(s, terceiros),
      cardParcelas(s, futuras)
    ));

    /* ---------------------------- maiores gastos ---------------------------- */
    var maiores = FC.model.maioresGastos(s, mes, 8);
    if (maiores.length) {
      tela.appendChild(h('div.card.mt-4',
        h('div.card__head',
          h('div.card__title', 'Maiores gastos do mês'),
          h('div.card__sub', fmt.monthLabel(mes, true))
        ),
        h('div.tablewrap',
          h('table.tbl',
            h('thead', h('tr',
              h('th', 'Descrição'),
              h('th', 'Quem'),
              h('th', 'Categoria'),
              h('th', 'Forma'),
              h('th.num', 'Valor')
            )),
            h('tbody', maiores.map(function (l) {
              var p = FC.model.pessoa(s, l.pessoaId);
              return h('tr', {
                onclick: function () { FC.forms.lancamento({ id: l.id }); },
                style: { cursor: 'pointer' }
              },
                h('td', h('div.rowdesc',
                  h('div.rowdesc__txt', l.desc),
                  l.parcela ? h('span.chip', l.parcela.n + '/' + l.parcela.de) : null,
                  l.terceiroId ? h('span.chip.chip--warn', FC.model.nomeTerceiro(s, l.terceiroId)) : null
                )),
                h('td', p ? h('span.chip.chip--dot', {
                  style: { '--chip-color': ui.corDoAcento(p.acento) }
                }, p.apelido || p.nome) : '—'),
                h('td', h('span.chip.chip--dot', {
                  style: { '--chip-color': FC.model.corCategoria(s, l.categoriaId) }
                }, FC.model.nomeCategoria(s, l.categoriaId))),
                h('td.dim', FC.model.nomeMetodo(l.metodo)),
                h('td.num', { style: { fontWeight: '650' } }, fmt.brl(l.valor))
              );
            }))
          )
        )
      ));
    }

    d.mount(raiz, tela);
  }

  /* ======================================================================
     BLOCO DO PATRIMONIO
     ====================================================================== */
  function blocoPatrimonio(s, pat, meses) {
    var serie = FC.model.seriePatrimonio(s, meses);
    var valores = serie.map(function (x) { return x.total; });
    var primeiro = valores[0] || 0;
    var ultimo = valores[valores.length - 1] || 0;
    var v = FC.model.variacao(ultimo, primeiro);
    var positivo = pat.total >= 0;

    var partes = [
      { k: 'Em conta', v: pat.conta, cor: 'var(--c2)', icone: 'bank' },
      { k: 'Investido', v: pat.investido, cor: 'var(--c1)', icone: 'trend' },
      { k: 'A receber', v: pat.aReceber, cor: 'var(--c4)', icone: 'handCoins' },
      { k: 'Fatura em aberto', v: -pat.fatura, cor: 'var(--c5)', icone: 'card' },
      { k: 'Parcelas a vencer', v: -(pat.aVencer || 0), cor: 'var(--c3)', icone: 'calendar' }
    ];

    return h('div.card',
      h('div.grid.grid--wide', { style: { gap: 'var(--sp-5)' } },
        h('div.col', { style: { gap: 'var(--sp-4)' } },
          h('div',
            h('div.kpi__label', ic('coins'), h('span', 'Patrimônio do casal')),
            h('div', {
              style: {
                fontSize: 'var(--fs-3xl)', fontWeight: '700', letterSpacing: '-.03em',
                fontVariantNumeric: 'tabular-nums', marginTop: '6px',
                color: positivo ? 'var(--text)' : 'var(--neg)'
              }
            }, fmt.brl(pat.total)),
            h('div.row.mt-2',
              ui.delta(v),
              h('span.dim', { style: { fontSize: 'var(--fs-xs)' } },
                'em ' + meses.length + ' meses  ·  conta + investido + a receber − fatura')
            )
          ),

          h('div.col', { style: { gap: 'var(--sp-2)' } },
            partes.map(function (x) {
              return h('div.row',
                h('span', { style: { width: '9px', height: '9px', borderRadius: '99px', background: x.cor, flex: 'none' } }),
                h('span.grow.dim', { style: { fontSize: 'var(--fs-sm)' } }, x.k),
                h('span.num', {
                  style: {
                    fontSize: 'var(--fs-sm)', fontWeight: '650',
                    color: x.v < 0 ? 'var(--neg)' : 'var(--text)'
                  }
                }, fmt.brl(x.v))
              );
            })
          ),

          h('div.row.wrap', { style: { gap: 'var(--sp-2)' } },
            h('button.btn.btn--soft.btn--sm', {
              type: 'button', onclick: function () { FC.app.irPara('#/investimentos'); }
            }, ic('trend'), 'Investimentos'),
            h('button.btn.btn--ghost.btn--sm', {
              type: 'button', onclick: function () { FC.app.irPara('#/config'); }
            }, ic('bank'), 'Ajustar saldo em conta')
          )
        ),

        h('div',
          ch.area({
            rotulos: serie.map(function (x) { return x.rotulo; }),
            series: [
              { nome: 'Em conta', cor: 'var(--c2)', dados: serie.map(function (x) { return x.conta; }), tipo: 'linha' },
              { nome: 'Investido', cor: 'var(--c1)', dados: serie.map(function (x) { return x.investido; }), tipo: 'linha' },
              { nome: 'Total', cor: 'var(--accent)', dados: valores }
            ],
            altura: 230,
            minZero: false
          })
        )
      )
    );
  }

  /* ======================================================================
     COMPARATIVO ENTRE OS DOIS
     ====================================================================== */
  function cardComparativo(s, mes, r) {
    var pa = s.casal.pessoas[0], pb = s.casal.pessoas[1];
    var ra = r.porPessoa[0], rb = r.porPessoa[1];
    if (!ra || !rb) return h('div');

    var corA = ui.corDoAcento(pa.acento);
    var corB = ui.corDoAcento(pb.acento);

    return h('div.card',
      h('div.card__head',
        h('div.card__title', 'Um e outro'),
        h('div.card__sub', fmt.monthLabel(mes, true))
      ),
      h('div.row.row--between', { style: { marginBottom: 'var(--sp-3)' } },
        h('div.row', ui.avatar(pa, 'sm'), h('span', { style: { fontWeight: '620', fontSize: 'var(--fs-sm)' } }, pa.apelido || pa.nome)),
        h('div.row', h('span', { style: { fontWeight: '620', fontSize: 'var(--fs-sm)' } }, pb.apelido || pb.nome), ui.avatar(pb, 'sm'))
      ),
      ch.comparativo([
        { nome: 'Entradas', curto: 'entra', a: ra.entradas, b: rb.entradas },
        { nome: 'Débito/Pix', curto: 'déb', a: ra.debito, b: rb.debito },
        { nome: 'Crédito', curto: 'créd', a: ra.credito, b: rb.credito },
        { nome: 'Sobra', curto: 'sobra', a: Math.max(0, ra.sobra), b: Math.max(0, rb.sobra) }
      ], corA, corB),
      h('hr.hr--soft'),
      h('div.dl',
        h('dt', 'Gasto do casal'), h('dd', fmt.brl(r.gastos)),
        h('dt', 'Parte de ' + (pa.apelido || pa.nome)),
        h('dd', r.gastos > 0 ? fmt.pct((ra.gastos / r.gastos) * 100, 0) : '—'),
        h('dt', 'Parte de ' + (pb.apelido || pb.nome)),
        h('dd', r.gastos > 0 ? fmt.pct((rb.gastos / r.gastos) * 100, 0) : '—')
      )
    );
  }

  /* ======================================================================
     DICA + INDICADORES
     ====================================================================== */
  function cardDica(s) {
    if (!s.config.mostrarDicas) return h('div');

    var dica = FC.indicadores.dicaAtual();
    var ind = s.educacao.indicadores;
    var corpo = h('div');

    function pintar() {
      var dd = FC.indicadores.dicaAtual();
      d.mount(corpo, h('p.tip__txt', dd ? dd.d : ''));
    }

    var tip = h('div.tip',
      h('div.row',
        h('span.tip__tag', ic('bulb'), dica ? dica.t : 'Dica'),
        h('div.grow'),
        h('button.rowact', {
          type: 'button', title: 'Próxima dica', style: { opacity: 1 },
          onclick: function () {
            FC.indicadores.dicaSeguinte();
            var nova = FC.indicadores.dicaAtual();
            d.mount(corpo, h('p.tip__txt', nova ? nova.d : ''));
            var tag = tip.querySelector('.tip__tag');
            if (tag && nova) d.mount(tag, h('span', ic('bulb'), ' ' + nova.t));
          }
        }, ic('refresh'))
      ),
      corpo
    );
    pintar();

    return h('div.card',
      h('div.card__head',
        h('div.card__title', 'Educação financeira'),
        h('div.card__sub', 'conteúdo informativo')
      ),
      tip,
      h('div.ticker.mt-4',
        tickItem('Selic', fmt.pct(ind.selic.valor, 2) + ' a.a.', ind.selic.em),
        tickItem('Dólar', fmt.brl(ind.dolar.valor), ind.dolar.em),
        tickItem('CDI', fmt.pct(ind.cdi.valor, 2) + ' a.a.', ind.cdi.em)
      ),
      h('div.row.mt-2', { style: { justifyContent: 'space-between' } },
        h('span.dim', { style: { fontSize: '10px' } },
          ind.atualizadoEm
            ? 'atualizado ' + fmt.stampDateBR(ind.atualizadoEm)
            : 'valores de referência'),
        h('button.btn.btn--ghost.btn--sm', {
          type: 'button',
          onclick: function (e) {
            var b = e.currentTarget;
            d.mount(b, h('span.spinner'));
            FC.indicadores.atualizar().then(function (res) {
              if (res.selic || res.dolar) {
                ui.toast('Indicadores atualizados.', 'ok');
                FC.app.redesenhar();
              } else {
                ui.toast('Não consegui buscar agora. Os valores anteriores seguem na tela.', 'info', 5000);
                d.mount(b, h('span', ic('refresh'), ' Atualizar'));
              }
            });
          }
        }, ic('refresh'), 'Atualizar')
      ),
      h('p.dim', { style: { fontSize: '10px', marginTop: 'var(--sp-3)', lineHeight: '1.5' } }, s.educacao.avisoLegal)
    );
  }

  function tickItem(k, v, em) {
    /* o Banco Central publica a meta Selic com a data em que ela vale, que
       pode estar à frente de hoje — aí não faz sentido chamar de "referência" */
    var titulo = '';
    if (em) {
      titulo = em > fmt.todayISO()
        ? 'meta em vigor'
        : 'referência: ' + fmt.dateBR(em);
    }
    return h('div.ticker__item', { title: titulo },
      h('span.ticker__k', k),
      h('span.ticker__v', v)
    );
  }

  /* ======================================================================
     CARTOES MENORES
     ====================================================================== */
  function cardCalendario(s, mes, dias) {
    var total = fmt.sumBy(dias, function (x) { return x.total; });
    var comGasto = dias.filter(function (x) { return x.total > 0; }).length;

    return h('div.card',
      h('div.card__head',
        h('div.card__title', 'Dias do mês'),
        h('div.card__sub', comGasto + ' dias com gasto')
      ),
      total > 0
        ? h('div',
            ch.mapaCalor(dias, mes, 'var(--accent)'),
            h('div.heatscale.mt-2',
              h('span', 'menos'),
              h('span.heatscale__b', { style: { background: 'var(--surface-3)' } }),
              h('span.heatscale__b', { style: { background: 'color-mix(in srgb, var(--accent) 35%, var(--surface-3))' } }),
              h('span.heatscale__b', { style: { background: 'color-mix(in srgb, var(--accent) 65%, var(--surface-3))' } }),
              h('span.heatscale__b', { style: { background: 'var(--accent)' } }),
              h('span', 'mais')
            )
          )
        : ui.vazio({ titulo: 'Mês sem gastos', icone: 'calendar', texto: 'Nada lançado ainda.' })
    );
  }

  function cardTerceiros(s, terceiros) {
    return h('div.card',
      h('div.card__head',
        h('div.card__title', 'Quem está devendo'),
        h('div.card__sub', 'cartão emprestado')
      ),
      terceiros.length
        ? h('div.col',
            terceiros.map(function (t) {
              return h('div.row.row--between', { style: { padding: '6px 0' } },
                h('div.row',
                  h('span.lock__acc__av', { style: { width: '30px', height: '30px', fontSize: 'var(--fs-xs)' } },
                    fmt.initials(t.nome)),
                  h('div',
                    h('div', { style: { fontWeight: '600', fontSize: 'var(--fs-sm)' } }, t.nome),
                    h('div.dim', { style: { fontSize: 'var(--fs-xs)' } }, t.itens + (t.itens === 1 ? ' compra' : ' compras'))
                  )
                ),
                h('span.num', { style: { fontWeight: '680', color: 'var(--warn)' } }, fmt.brl(t.aberto))
              );
            }),
            h('hr.hr--soft'),
            h('div.row.row--between',
              h('span.dim', { style: { fontSize: 'var(--fs-sm)' } }, 'Total a receber'),
              h('span.num', { style: { fontWeight: '700' } },
                fmt.brl(terceiros.reduce(function (a, b) { return a + b.aberto; }, 0)))
            )
          )
        : ui.vazio({
            titulo: 'Ninguém devendo',
            icone: 'handCoins',
            texto: 'Quando alguém usar o cartão de vocês, marque a pessoa no lançamento.'
          })
    );
  }

  /** Próximos 6 meses: parcelas já lançadas + assinaturas (débito e crédito) */
  function cardParcelas(s, futuras) {
    var total = fmt.sumBy(futuras, function (p) { return p.total; });
    var max = Math.max.apply(null, futuras.map(function (p) { return p.total; }).concat([1]));
    var incompletos = FC.model.parcelasIncompletas(s).length;

    return h('div.card',
      h('div.card__head',
        h('div', h('div.card__title', 'Já comprometido'),
          h('div.card__sub', 'parcelas e assinaturas dos próximos 6 meses')),
        h('div.card__tools', h('button.btn.btn--ghost.btn--sm', {
          type: 'button', onclick: function () { FC.app.irPara('#/faturas'); }
        }, 'Detalhar'))
      ),
      total > 0
        ? h('div.col',
            h('div', { style: { fontSize: 'var(--fs-xl)', fontWeight: '700', fontVariantNumeric: 'tabular-nums' } }, fmt.brl(total)),
            futuras.map(function (p) {
              return h('div.row', { style: { gap: 'var(--sp-2)', padding: '3px 0' },
                title: 'parcelas ' + fmt.brl(p.parcelas) + ' · assinaturas ' + fmt.brl(p.assinaturas) + ' · outras ' + fmt.brl(p.avulsos) },
                h('span.dim', { style: { fontSize: 'var(--fs-xs)', width: '6ch' } }, p.rotulo),
                h('div.grow', h('div.bar', h('div.bar__stack', { style: { width: ((p.total / max) * 100) + '%' } },
                  h('div.bar__seg', { style: { width: (p.total ? p.parcelas / p.total * 100 : 0) + '%', background: 'var(--c3)' } }),
                  h('div.bar__seg', { style: { width: (p.total ? p.assinaturas / p.total * 100 : 0) + '%', background: 'var(--c2)' } }),
                  h('div.bar__seg', { style: { width: (p.total ? p.avulsos / p.total * 100 : 0) + '%', background: 'var(--c4)' } })
                ))),
                h('span.num', { style: { fontSize: 'var(--fs-xs)', fontWeight: '620', width: '9ch', textAlign: 'right' } }, fmt.brl(p.total))
              );
            }),
            h('div.legend',
              h('span.legend__i', h('span.legend__sw', { style: { background: 'var(--c3)' } }), 'parcelas'),
              h('span.legend__i', h('span.legend__sw', { style: { background: 'var(--c2)' } }), 'assinaturas')),
            incompletos ? h('div.note.note--warn.mt-2', ic('alert'),
              h('div', incompletos + (incompletos === 1 ? ' compra parcelada está' : ' compras parceladas estão') +
                ' sem as próximas parcelas lançadas. ',
                h('a', { href: '#/faturas', onclick: function (e) { e.preventDefault(); FC.app.irPara('#/faturas'); } }, 'Completar'))) : null
          )
        : ui.vazio({
            titulo: 'Nada comprometido',
            icone: 'calendar',
            texto: 'Compras parceladas e assinaturas aparecem aqui, mês a mês.',
            acao: incompletos ? h('button.btn.btn--sm', { type: 'button', onclick: function () { FC.app.irPara('#/faturas'); } },
              'Completar ' + incompletos + ' parcelamentos') : null
          })
    );
  }

  FC.viewVisao = { render: render };
})(typeof self !== 'undefined' ? self : this);
