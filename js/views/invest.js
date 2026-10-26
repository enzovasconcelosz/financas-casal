/* ==========================================================================
   views/invest.js — carteira de investimentos e movimentacoes
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var d = FC.dom, h = d.h, ic = d.ic, fmt = FC.fmt, ui = FC.ui, ch = FC.charts;

  var filtroDono = 'todos';

  function render(raiz, ctx) {
    var s = FC.store.get();
    var mes = ctx.mes;
    var cart = FC.model.carteira(s);
    var meses12 = fmt.lastMonths(mes, 12);
    var serie = FC.model.serieInvestido(s, meses12);
    var movs = FC.model.movimentosDoMes(s, mes);

    var tela = h('div', { 'data-accent': s.config.acentoCasal || 'oceano' });

    /* ---------------------------- cabecalho ---------------------------- */
    tela.appendChild(h('div.page-head',
      h('div.page-head__t',
        h('h1', 'Investimentos'),
        h('span.page-head__sub',
          cart.itens.length
            ? cart.itens.length + (cart.itens.length === 1 ? ' aplicação' : ' aplicações')
            : 'nenhuma aplicação cadastrada')
      ),
      h('div.page-head__actions',
        h('button.btn.btn--ghost.btn--sm', {
          type: 'button', onclick: function () { FC.forms.investimento({}); }
        }, ic('plus'), 'Novo investimento'),
        h('button.btn.btn--sm', {
          type: 'button', onclick: function () { FC.forms.movimento({}); }
        }, ic('coins'), 'Movimentar')
      )
    ));

    if (!cart.itens.length) {
      tela.appendChild(h('div.card',
        ui.vazio({
          titulo: 'Comece registrando onde o dinheiro está',
          icone: 'piggy',
          texto: 'Cadastre cada aplicação (poupança, CDB, Tesouro, ações…) e depois registre ' +
                 'os aportes e resgates. O saldo e os gráficos saem dessas movimentações.',
          acao: h('button.btn', { type: 'button', onclick: function () { FC.forms.investimento({}); } },
            ic('plus'), 'Cadastrar investimento')
        })
      ));
      d.mount(raiz, tela);
      return;
    }

    /* ---------------------------- KPIs ---------------------------- */
    var serieVals = serie.map(function (x) { return x.total; });
    var varSerie = FC.model.variacao(serieVals[serieVals.length - 1], serieVals[0]);

    tela.appendChild(h('div.grid.grid--kpi',
      ui.kpi({
        rotulo: 'Total investido', icone: 'trend', cor: 'var(--c1)',
        valor: fmt.brl(cart.total),
        rodape: h('div.row', ui.delta(varSerie), h('span.dim', 'em 12 meses')),
        spark: ch.sparkline(serieVals, 'var(--c1)')
      }),
      ui.kpi({
        rotulo: 'Total aportado', icone: 'arrowUp', cor: 'var(--c2)',
        valor: fmt.brl(cart.aportado),
        rodape: h('span.dim', 'dinheiro que vocês colocaram')
      }),
      ui.kpi({
        rotulo: 'Rendimento', icone: 'coins',
        cor: cart.ganho >= 0 ? 'var(--pos)' : 'var(--neg)',
        valor: fmt.brl(cart.ganho),
        classeValor: cart.ganho >= 0 ? 'pos' : 'neg',
        rodape: h('span.dim', 'o que foi registrado como rendimento')
      }),
      ui.kpi({
        rotulo: 'Sobre o aportado', icone: 'chart',
        cor: cart.ganhoPct >= 0 ? 'var(--pos)' : 'var(--neg)',
        valor: fmt.pct(cart.ganhoPct, 2),
        classeValor: cart.ganhoPct >= 0 ? 'pos' : 'neg',
        rodape: h('span.dim', 'rendimento ÷ aportes')
      })
    ));

    /* ---------------------------- evolucao + alocacao ---------------------------- */
    tela.appendChild(h('div.grid.grid--wide.mt-4',
      h('div.card',
        h('div.card__head',
          h('div.card__title', 'Evolução da carteira'),
          h('div.card__sub', 'últimos 12 meses')
        ),
        ch.area({
          rotulos: serie.map(function (x) { return x.rotulo; }),
          series: [{ nome: 'Investido', cor: 'var(--c1)', dados: serieVals }],
          altura: 250, legenda: false
        })
      ),
      h('div.card',
        h('div.card__head', h('div.card__title', 'Onde está o dinheiro')),
        ch.donut({
          itens: cart.itens.map(function (i) { return { nome: i.nome, total: i.saldo, cor: i.cor }; }),
          centro: { k: 'Carteira', v: fmt.brl(cart.total) },
          tamanho: 210
        })
      )
    ));

    /* ---------------------------- por tipo ---------------------------- */
    var porTipo = {};
    cart.itens.forEach(function (i) {
      if (!porTipo[i.tipo]) porTipo[i.tipo] = { nome: i.tipo, total: 0, cor: i.cor };
      porTipo[i.tipo].total += i.saldo;
    });
    var listaTipos = Object.keys(porTipo).map(function (k) { return porTipo[k]; })
      .sort(function (a, b) { return b.total - a.total; });
    listaTipos.forEach(function (t) { t.pct = cart.total > 0 ? (t.total / cart.total) * 100 : 0; });

    /* ---------------------------- tabela da carteira ---------------------------- */
    tela.appendChild(h('div.grid.grid--wide.mt-4',
      h('div.card.card--flush',
        h('div.card__head.card__head--flush',
          h('div.card__title', 'Aplicações'),
          h('div.card__tools',
            ui.segmentado([
              { id: 'todos', nome: 'Todos' },
              { id: s.casal.pessoas[0].id, nome: s.casal.pessoas[0].apelido || s.casal.pessoas[0].nome },
              { id: s.casal.pessoas[1].id, nome: s.casal.pessoas[1].apelido || s.casal.pessoas[1].nome },
              { id: 'casal', nome: 'Casal' }
            ], filtroDono, function (v) { filtroDono = v; FC.app.redesenhar(); })
          )
        ),
        h('div.tablewrap', tabelaCarteira(s, cart))
      ),
      h('div.card',
        h('div.card__head', h('div.card__title', 'Por tipo')),
        ch.ranking(listaTipos, { limite: 8 })
      )
    ));

    /* ---------------------------- movimentacoes ---------------------------- */
    tela.appendChild(h('div.card.mt-4',
      h('div.card__head',
        h('div',
          h('div.card__title', 'Movimentações de ' + fmt.monthLabel(mes)),
          h('div.card__sub',
            'aportes ' + fmt.brl(movs.aportes) +
            '  ·  resgates ' + fmt.brl(movs.resgates) +
            '  ·  rendimentos ' + fmt.brl(movs.rendimentos))
        ),
        h('div.card__tools',
          h('button.btn.btn--soft.btn--sm', {
            type: 'button', onclick: function () { FC.forms.movimento({ tipo: 'aporte' }); }
          }, ic('plus'), 'Aporte'),
          h('button.btn.btn--ghost.btn--sm', {
            type: 'button', onclick: function () { FC.forms.movimento({ tipo: 'resgate' }); }
          }, ic('minus'), 'Resgate')
        )
      ),
      movs.itens.length
        ? h('div.tablewrap', tabelaMovimentos(s, movs.itens))
        : ui.vazio({
            titulo: 'Nenhuma movimentação em ' + fmt.monthLabel(mes, true),
            icone: 'coins',
            texto: 'Registre aportes, resgates e rendimentos para acompanhar a carteira.'
          })
    ));

    d.mount(raiz, tela);
  }

  /* ---------------------------- tabelas ---------------------------- */

  function tabelaCarteira(s, cart) {
    var itens = cart.itens.filter(function (i) {
      if (filtroDono === 'todos') return true;
      return i.pessoaId === filtroDono;
    });

    if (!itens.length) {
      return ui.vazio({ titulo: 'Nada nesse filtro', icone: 'filter' });
    }

    return h('table.tbl',
      h('thead', h('tr',
        h('th', 'Aplicação'),
        h('th', 'De quem'),
        h('th.num', 'Aportado'),
        h('th.num', 'Rendimento'),
        h('th.num', 'Saldo'),
        h('th.num', '%'),
        h('th', '')
      )),
      h('tbody', itens.map(function (i) {
        return h('tr',
          h('td',
            h('div.rowdesc',
              h('span', { style: { width: '9px', height: '9px', borderRadius: '99px', background: i.cor, flex: 'none' } }),
              h('div', { style: { minWidth: 0 } },
                h('div.rowdesc__txt', i.nome),
                h('div.rowdesc__sub', i.tipo + (i.inv.instituicao ? ' · ' + i.inv.instituicao : ''))
              )
            )
          ),
          h('td.dim', { style: { fontSize: 'var(--fs-sm)' } }, i.dono),
          h('td.num', fmt.brl(i.aportes)),
          h('td.num' + (i.ganho > 0 ? '.pos' : (i.ganho < 0 ? '.neg' : '')), fmt.brl(i.ganho)),
          h('td.num', { style: { fontWeight: '680' } }, fmt.brl(i.saldo)),
          h('td.num.dim', fmt.pct(i.pct, 0)),
          h('td.tight',
            h('div.rowacts',
              h('button.rowact', {
                type: 'button', title: 'Movimentar',
                onclick: function () { FC.forms.movimento({ investimentoId: i.id }); }
              }, ic('coins')),
              h('button.rowact', {
                type: 'button', title: 'Histórico',
                onclick: function () { historico(s, i); }
              }, ic('list')),
              h('button.rowact', {
                type: 'button', title: 'Editar',
                onclick: function () { FC.forms.investimento({ id: i.id }); }
              }, ic('pencil'))
            )
          )
        );
      })),
      h('tfoot', h('tr', { style: { borderTop: '1.5px solid var(--line)' } },
        h('td', { colspan: '2', style: { fontWeight: '700' } }, 'Total'),
        h('td.num', { style: { fontWeight: '700' } }, fmt.brl(cart.aportado)),
        h('td.num', { style: { fontWeight: '700' }, class: cart.ganho >= 0 ? 'pos' : 'neg' }, fmt.brl(cart.ganho)),
        h('td.num', { style: { fontWeight: '700' } }, fmt.brl(cart.total)),
        h('td', ''), h('td', '')
      ))
    );
  }

  var NOME_MOV = {
    aporte: { txt: 'Aporte', cor: 'var(--pos)', ico: 'arrowUp' },
    resgate: { txt: 'Resgate', cor: 'var(--neg)', ico: 'arrowDown' },
    rendimento: { txt: 'Rendimento', cor: 'var(--c2)', ico: 'trend' },
    ajuste: { txt: 'Ajuste', cor: 'var(--text-2)', ico: 'pencil' }
  };

  function tabelaMovimentos(s, itens) {
    return h('table.tbl',
      h('thead', h('tr',
        h('th', 'Data'),
        h('th', 'Aplicação'),
        h('th', 'O que foi'),
        h('th.num', 'Valor'),
        h('th', '')
      )),
      h('tbody', itens.map(function (m) {
        var inv = FC.model.investimento(s, m.investimentoId);
        var meta = NOME_MOV[m.tipo] || NOME_MOV.ajuste;
        return h('tr',
          h('td.dim', fmt.dateBR(m.data)),
          h('td',
            h('div.rowdesc',
              inv ? h('span', { style: { width: '8px', height: '8px', borderRadius: '99px', background: inv.cor, flex: 'none' } }) : null,
              h('div.rowdesc__txt', inv ? inv.nome : 'Removido'),
              m.origem === 'whatsapp' ? h('span.chip.chip--info', ic('whats', 'ico--sm')) : null
            ),
            m.obs ? h('div.rowdesc__sub', m.obs) : null
          ),
          h('td', h('span.chip.chip--dot', { style: { '--chip-color': meta.cor } }, meta.txt)),
          h('td.num', { style: { fontWeight: '650', color: meta.cor } },
            (m.tipo === 'resgate' ? '− ' : '+ ') + fmt.brl(Math.abs(m.valor))),
          h('td.tight', h('div.rowacts',
            h('button.rowact', {
              type: 'button', title: 'Editar',
              onclick: function () { FC.forms.movimento({ id: m.id }); }
            }, ic('pencil'))
          ))
        );
      }))
    );
  }

  /* ---------------------------- historico de um investimento ---------------------------- */

  function historico(s, item) {
    var movs = s.movimentos
      .filter(function (m) { return m.investimentoId === item.id; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });

    var acumulado = [];
    var saldo = 0;
    movs.slice().reverse().forEach(function (m) {
      var v = Number(m.valor) || 0;
      if (m.tipo === 'resgate') saldo -= v; else saldo += v;
      acumulado.push({ data: m.data, saldo: fmt.round2(saldo) });
    });

    FC.ui.modal({
      titulo: item.nome,
      sub: item.tipo + ' · ' + item.dono + ' · saldo ' + fmt.brl(item.saldo),
      largura: 'wide',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        acumulado.length > 1
          ? ch.area({
              rotulos: acumulado.map(function (x) { return fmt.dateShort(x.data); }),
              series: [{ nome: 'Saldo', cor: item.cor, dados: acumulado.map(function (x) { return x.saldo; }) }],
              altura: 190, legenda: false
            })
          : null,
        h('div.dl',
          h('dt', 'Aportes'), h('dd', fmt.brl(item.aportes)),
          h('dt', 'Resgates'), h('dd', fmt.brl(item.resgates)),
          h('dt', 'Rendimentos'), h('dd', fmt.brl(item.rendimentos)),
          h('dt', 'Saldo atual'), h('dd', fmt.brl(item.saldo))
        ),
        h('hr.hr'),
        movs.length
          ? h('div.tablewrap', tabelaMovimentos(s, movs))
          : ui.vazio({ titulo: 'Sem movimentações', icone: 'coins' })
      ),
      acoes: function (c) {
        return [
          h('button.btn.btn--soft.btn--sm', {
            type: 'button',
            onclick: function () { c.fechar(); FC.forms.movimento({ investimentoId: item.id }); }
          }, ic('plus'), 'Movimentar'),
          h('div.grow'),
          h('button.btn.btn--ghost', { type: 'button', onclick: function () { c.fechar(); } }, 'Fechar')
        ];
      }
    });
  }

  FC.viewInvest = { render: render };
})(typeof self !== 'undefined' ? self : this);
