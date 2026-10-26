/* ==========================================================================
   views/person.js — aba de cada conjuge

   Reproduz o formato da planilha: entradas em cima e tres paineis lado a
   lado (debito/dinheiro/Pix, credito, terceiros), cada um com a sua SOMA.
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var d = FC.dom, h = d.h, ic = d.ic, fmt = FC.fmt, ui = FC.ui, ch = FC.charts;

  function render(raiz, ctx) {
    var s = FC.store.get();
    var mes = ctx.mes;
    var p = FC.model.pessoa(s, ctx.pessoaId);
    if (!p) { d.mount(raiz, ui.vazio({ titulo: 'Pessoa não encontrada' })); return; }

    var cor = ui.corDoAcento(p.acento);
    var r = FC.model.resumoPessoa(s, mes, p.id);
    var pn = r.paineis;

    var tela = h('div', { 'data-accent': p.acento });

    /* ---------------------------- cabecalho ---------------------------- */
    tela.appendChild(h('div.page-head',
      h('div.row', { style: { gap: 'var(--sp-4)' } },
        ui.avatar(p, 'lg'),
        h('div.page-head__t',
          h('h1', p.apelido || p.nome),
          h('span.page-head__sub', fmt.monthLabel(mes))
        )
      ),
      h('div.page-head__actions',
        h('button.btn.btn--ghost.btn--sm', {
          type: 'button', onclick: function () { FC.forms.pessoa({ id: p.id }); }
        }, ic('pencil'), 'Editar aba'),
        h('button.btn.btn--sm', {
          type: 'button',
          onclick: function () { FC.forms.lancamento({ pessoaId: p.id, mes: mes }); }
        }, ic('plus'), 'Lançar')
      )
    ));

    /* ---------------------------- mês futuro ---------------------------- */
    if (mes > fmt.thisMonth()) {
      var qtdPrev = pn.credito.concat(pn.debito).filter(function (l) { return l.previsto; }).length;
      tela.appendChild(h('div.note', { style: { marginBottom: 'var(--sp-4)' } }, ic('calendar'), h('div.grow',
        h('strong.note__title', 'Mês que ainda não chegou'),
        'Aqui estão as parcelas já lançadas' + (qtdPrev ? ' e ' + qtdPrev + (qtdPrev === 1 ? ' assinatura prevista' : ' assinaturas previstas') : '') +
        '. As previstas viram lançamento sozinhas quando o mês começar. ',
        h('a', { href: '#/faturas', onclick: function (e) { e.preventDefault(); FC.app.irPara('#/faturas'); } }, 'Ver faturas futuras')
      )));
    }

    /* ---------------------------- indicadores ---------------------------- */
    var mesesSerie = fmt.lastMonths(mes, 6);
    var serieGasto = mesesSerie.map(function (m) { return FC.model.resumoPessoa(s, m, p.id).gastos; });
    var anterior = FC.model.resumoPessoa(s, fmt.addMonths(mes, -1), p.id);

    tela.appendChild(h('div.grid.grid--kpi',
      ui.kpi({
        rotulo: 'Entradas', icone: 'arrowDown', cor: 'var(--pos)',
        valor: fmt.brl(r.entradas),
        classeValor: r.entradas > 0 ? 'pos' : '',
        rodape: h('button.btn.btn--ghost.btn--sm', {
          type: 'button',
          onclick: function () { FC.forms.lancamento({ pessoaId: p.id, mes: mes, tipo: 'receita' }); }
        }, ic('plus'), 'Registrar entrada')
      }),
      ui.kpi({
        rotulo: 'Gastos do mês', icone: 'arrowUp', cor: cor,
        valor: fmt.brl(r.gastos),
        rodape: h('div.row', ui.delta(FC.model.variacao(r.gastos, anterior.gastos)),
                  h('span.dim', 'vs. mês anterior')),
        spark: ch.sparkline(serieGasto, cor)
      }),
      ui.kpi({
        rotulo: 'Sobra', icone: 'wallet', cor: r.sobra >= 0 ? 'var(--pos)' : 'var(--neg)',
        valor: fmt.brl(r.sobra),
        classeValor: r.sobra >= 0 ? 'pos' : 'neg',
        rodape: h('span.dim', 'entradas − gastos do mês')
      }),
      ui.kpi({
        rotulo: 'A receber', icone: 'handCoins', cor: 'var(--warn)',
        valor: fmt.brl(r.aReceber),
        rodape: h('span.dim', r.aReceber > 0 ? 'cartão emprestado' : 'ninguém devendo')
      })
    ));

    /* ---------------------------- entradas ---------------------------- */
    if (pn.receitas.length) {
      tela.appendChild(h('div.card.mt-4',
        h('div.card__head',
          h('div.card__title', 'Entradas de ' + (p.apelido || p.nome)),
          h('div.card__tools', h('span.chip.chip--pos', fmt.brl(pn.totalReceitas)))
        ),
        h('div.tablewrap', tabelaSimples(pn.receitas, mes, 'receita'))
      ));
    }

    /* ---------------------------- os tres paineis ---------------------------- */

    /* O pagamento de fatura aparece junto do débito, como na planilha: foi
       dinheiro que saiu da conta. Mas ele não conta como gasto do mês, senão
       a compra seria contada duas vezes (uma no crédito, outra na fatura). */
    var itensSaida = pn.debito.concat(pn.faturas).sort(function (a, b) {
      return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0);
    });
    var totalSaida = fmt.round2(pn.totalDebito + pn.totalFaturas);

    tela.appendChild(h('div.grid.grid--panels.mt-4',
      painel({
        titulo: 'Débito / Dinheiro / Pix',
        icone: 'cash',
        itens: itensSaida,
        total: totalSaida,
        cor: 'var(--accent)',
        fundo: 'var(--accent-soft)',
        linha: 'var(--accent-line)',
        mes: mes, pessoa: p, metodo: 'debito',
        vazio: 'Nenhum gasto no débito, dinheiro ou Pix neste mês.',
        rodapeExtra: pn.totalFaturas > 0
          ? h('div.col', { style: { gap: '3px', fontSize: 'var(--fs-xs)', color: 'var(--text-2)' } },
              h('div.row.row--between',
                h('span', 'Sendo pagamento de fatura'),
                h('span.num', fmt.brl(pn.totalFaturas))),
              h('div.row.row--between', { style: { fontWeight: '650' } },
                h('span', 'Gastos do mês nesta forma'),
                h('span.num', fmt.brl(pn.totalDebito))))
          : null
      }),
      painel({
        titulo: 'Crédito',
        icone: 'card',
        itens: pn.credito,
        total: pn.totalCredito,
        cor: 'var(--accent-2)',
        fundo: 'var(--accent2-soft)',
        linha: 'var(--accent2-line)',
        mes: mes, pessoa: p, metodo: 'credito',
        vazio: 'Nada no cartão nesta fatura.',
        extra: pn.credito.length && mes <= fmt.thisMonth() ? h('button.btn.btn--soft.btn--sm.btn--block', {
          type: 'button',
          onclick: function () { FC.forms.pagarFatura({ mes: mes, pessoaId: p.id }); }
        }, ic('check'), 'Marcar fatura como paga') : null,
        rodapeExtra: pn.totalOutros > 0
          ? h('div.row.row--between', { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-2)', fontWeight: '600' } },
              h('span', 'Fatura cheia (com terceiros)'),
              h('span.num', fmt.brl(pn.totalCredito + pn.totalOutros)))
          : null
      }),
      painel({
        titulo: 'Outros (cartão emprestado)',
        icone: 'handCoins',
        itens: pn.outros,
        total: pn.totalOutros,
        cor: 'var(--accent-3)',
        fundo: 'var(--accent3-soft)',
        linha: 'var(--accent3-line)',
        mes: mes, pessoa: p, metodo: 'credito', terceiro: true,
        rotuloSoma: 'Soma parcial',
        vazio: 'Ninguém usou o cartão de vocês neste mês.'
      })
    ));

    /* ---------------------------- analise ---------------------------- */
    var cats = FC.model.porCategoria(s, mes, { pessoaId: p.id });

    tela.appendChild(h('div.grid.grid--2.mt-4',
      h('div.card',
        h('div.card__head',
          h('div.card__title', 'Para onde foi'),
          h('div.card__sub', fmt.monthLabel(mes, true))
        ),
        cats.itens.length
          ? ch.donut({ itens: cats.itens, centro: { k: 'Gasto', v: fmt.brl(cats.total) }, tamanho: 200 })
          : ui.vazio({ titulo: 'Sem gastos neste mês', icone: 'pie', texto: 'Lance o primeiro gasto para ver o gráfico.' })
      ),
      h('div.card',
        h('div.card__head',
          h('div.card__title', 'Evolução dos gastos'),
          h('div.card__sub', 'últimos 6 meses')
        ),
        ch.area({
          rotulos: mesesSerie.map(function (m) { return fmt.monthLabel(m, true); }),
          series: [{ nome: p.apelido || p.nome, cor: cor, dados: serieGasto }],
          altura: 220, legenda: false
        })
      )
    ));

    d.mount(raiz, tela);
  }

  /* ======================================================================
     PAINEL (a "tabelinha" da planilha)
     ====================================================================== */
  function painel(op) {
    var itens = op.itens;
    var estilo = {
      '--panel-bg': op.fundo,
      '--panel-line': op.linha
    };

    var corpo = itens.length
      ? h('div.tablewrap', tabela(itens, op))
      : ui.vazio({ titulo: 'Vazio', texto: op.vazio, icone: op.icone });

    return h('div.panel', { style: estilo },
      h('div.panel__head',
        ic(op.icone),
        h('span.panel__title', op.titulo),
        h('span.panel__count', itens.length ? itens.length + (itens.length === 1 ? ' item' : ' itens') : '')
      ),
      h('div.panel__body', corpo),
      linhaRapida(op),
      op.extra ? h('div', { style: { padding: '0 var(--sp-3) var(--sp-3)' } }, op.extra) : null,
      h('div.panel__foot',
        h('span.panel__foot__label', op.rotuloSoma || 'Soma'),
        h('span.panel__foot__value', fmt.brl(op.total))
      ),
      op.rodapeExtra ? h('div', { style: { padding: 'var(--sp-2) var(--sp-4)', borderTop: '1px solid var(--line-soft)' } }, op.rodapeExtra) : null
    );
  }

  /* ---------------------------- tabela de lancamentos ---------------------------- */

  function tabela(itens, op) {
    var s = FC.store.get();

    return h('table.tbl.tbl--sheet',
      h('tbody',
        itens.map(function (l) {
          var chips = [];

          if (l.categoriaId) {
            chips.push(h('span.chip.chip--dot', {
              style: { '--chip-color': FC.model.corCategoria(s, l.categoriaId) }
            }, FC.model.nomeCategoria(s, l.categoriaId)));
          }
          if (l.parcela) {
            chips.push(h('span.chip', l.parcela.n + '/' + l.parcela.de));
          }
          if (l.terceiroId && !op.terceiro) {
            chips.push(h('span.chip.chip--warn', FC.model.nomeTerceiro(s, l.terceiroId)));
          }
          if (l.origem === 'whatsapp') {
            chips.push(h('span.chip.chip--info', ic('whats', 'ico--sm')));
          }
          if (l.tipo === 'fatura') {
            chips.push(h('span.chip.chip--info', ic('card', 'ico--sm'), 'pagamento de fatura'));
          }
          if (l.previsto) {
            chips.push(h('span.chip.chip--info', ic('refresh', 'ico--sm'), 'prevista'));
          } else if (l.recorrenteId) {
            chips.push(h('span.chip', ic('refresh', 'ico--sm'), 'assinatura'));
          }

          /* assinatura prevista: ainda não existe de verdade — sem check, e editar abre a assinatura */
          if (l.previsto) {
            return h('tr', { style: { opacity: .75 } },
              h('td.tight', h('span.check', { title: 'Prevista: vira lançamento quando o mês chegar', style: { borderStyle: 'dashed' } })),
              h('td', h('div.rowdesc', h('div', { style: { minWidth: 0 } },
                h('div.rowdesc__txt', { title: l.desc, style: { fontStyle: 'italic' } }, l.desc),
                h('div.rowdesc__sub', h('span', fmt.dateShort(l.data)),
                  h('span', { style: { marginLeft: '6px', display: 'inline-flex', gap: '4px', flexWrap: 'wrap', verticalAlign: 'middle' } }, chips))
              ))),
              h('td.num.tight', { style: { fontWeight: '620' } }, fmt.brl(l.valor)),
              h('td.tight', h('div.rowacts',
                h('button.rowact', { type: 'button', title: 'Editar assinatura',
                  onclick: function () { FC.forms.assinatura({ id: l.recorrenteId }); } }, ic('pencil'))
              ))
            );
          }

          var marcado = op.terceiro ? l.reembolsado : l.pago;

          return h('tr' + (marcado ? '.is-settled' : ''), { dataset: { id: l.id } },
            h('td.tight',
              ui.check(marcado, function (v) {
                FC.store.atualizar(function (st) {
                  for (var i = 0; i < st.lancamentos.length; i++) {
                    if (st.lancamentos[i].id === l.id) {
                      if (op.terceiro) st.lancamentos[i].reembolsado = v;
                      else st.lancamentos[i].pago = v;
                    }
                  }
                }, true);
                if (FC.app) FC.app.redesenhar();
              }, op.terceiro ? 'Marcar como acertado' : 'Marcar como pago')
            ),
            h('td',
              h('div.rowdesc',
                h('div', { style: { minWidth: 0 } },
                  h('div.rowdesc__txt', { title: l.desc }, l.desc),
                  h('div.rowdesc__sub',
                    h('span', fmt.dateShort(l.data)),
                    chips.length ? h('span', { style: { marginLeft: '6px', display: 'inline-flex', gap: '4px', flexWrap: 'wrap', verticalAlign: 'middle' } }, chips) : null
                  )
                )
              )
            ),
            h('td.num.tight', { style: { fontWeight: '620' } }, fmt.brl(l.valor)),
            h('td.tight',
              h('div.rowacts',
                h('button.rowact', {
                  type: 'button', title: 'Editar',
                  onclick: function () { FC.forms.lancamento({ id: l.id }); }
                }, ic('pencil')),
                h('button.rowact.rowact--danger', {
                  type: 'button', title: 'Excluir',
                  onclick: function () { FC.forms.apagarLancamento(l); }
                }, ic('trash'))
              )
            )
          );
        })
      )
    );
  }

  function tabelaSimples(itens, mes, tipo) {
    return h('table.tbl',
      h('tbody', itens.map(function (l) {
        return h('tr',
          h('td', h('div.rowdesc',
            ic(tipo === 'receita' ? 'arrowDown' : 'arrowUp'),
            h('div.rowdesc__txt', l.desc)
          )),
          h('td.num.tight.dim', fmt.dateShort(l.data)),
          h('td.num.tight' + (tipo === 'receita' ? '.pos' : ''), { style: { fontWeight: '650' } }, fmt.brl(l.valor)),
          h('td.tight', h('div.rowacts',
            h('button.rowact', {
              type: 'button', title: 'Editar',
              onclick: function () { FC.forms.lancamento({ id: l.id }); }
            }, ic('pencil')),
            h('button.rowact.rowact--danger', {
              type: 'button', title: 'Excluir',
              onclick: function () { FC.forms.apagarLancamento(l); }
            }, ic('trash'))
          ))
        );
      }))
    );
  }

  /* ---------------------------- linha de lancamento rapido ---------------------------- */

  function linhaRapida(op) {
    var inDesc = h('input.input', { type: 'text', placeholder: 'Descrição…', maxlength: '80' });
    var inValor = h('input.input.input--money', { type: 'text', inputmode: 'decimal', placeholder: '0,00' });

    function enviar() {
      var ok = FC.forms.lancamentoRapido({
        desc: inDesc.value,
        valorTexto: inValor.value,
        pessoaId: op.pessoa.id,
        metodo: op.metodo,
        mes: op.mes,
        terceiroId: op.terceiro ? primeiroTerceiro() : null
      });
      if (ok) {
        inDesc.value = '';
        inValor.value = '';
        if (FC.app) FC.app.redesenhar();
        setTimeout(function () {
          var novo = document.querySelector('[data-painel-foco="' + op.metodo + op.pessoa.id + '"] input');
          if (novo) novo.focus();
        }, 30);
      }
    }

    function primeiroTerceiro() {
      var s = FC.store.get();
      if (s.terceiros.length) return s.terceiros[0].id;
      var novo = { id: fmt.uid('ter'), nome: 'Outra pessoa', obs: '' };
      FC.store.atualizar(function (st) { st.terceiros.push(novo); }, true);
      return novo.id;
    }

    function aoTeclar(e) {
      if (e.key === 'Enter') { e.preventDefault(); enviar(); }
    }
    inDesc.addEventListener('keydown', aoTeclar);
    inValor.addEventListener('keydown', aoTeclar);

    return h('div.quickrow', {
      dataset: { painelFoco: op.metodo + op.pessoa.id },
      title: 'Digite e aperte Enter, como na planilha'
    },
      inDesc,
      inValor,
      h('button.quickrow__go', { type: 'button', title: 'Adicionar', onclick: enviar }, ic('plus'))
    );
  }

  FC.viewPessoa = { render: render };
})(typeof self !== 'undefined' ? self : this);
