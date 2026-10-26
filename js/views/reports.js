/* ==========================================================================
   views/reports.js — relatorios com filtro, tabela e exportacao
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var d = FC.dom, h = d.h, ic = d.ic, fmt = FC.fmt, ui = FC.ui, ch = FC.charts;

  var filtro = {
    periodo: 'mes',       // mes | 3 | 6 | 12 | ano | personalizado
    de: null, ate: null,
    pessoaId: 'todos',
    metodo: 'todos',      // todos | caixa | credito
    categoriaId: 'todas',
    incluirTerceiros: true,
    tipo: 'gasto',        // gasto | receita | tudo
    ordenar: 'data'
  };

  function periodoAtual(mes) {
    if (filtro.periodo === 'mes') return { de: mes, ate: mes };
    if (filtro.periodo === 'ano') return { de: mes.slice(0, 4) + '-01', ate: mes.slice(0, 4) + '-12' };
    if (filtro.periodo === 'personalizado') {
      return { de: filtro.de || mes, ate: filtro.ate || mes };
    }
    var n = parseInt(filtro.periodo, 10) || 1;
    return { de: fmt.addMonths(mes, -(n - 1)), ate: mes };
  }

  function filtrar(s, mes) {
    var per = periodoAtual(mes);
    return s.lancamentos.filter(function (l) {
      if (l.mes < per.de || l.mes > per.ate) return false;
      if (filtro.tipo === 'gasto' && l.tipo !== 'gasto') return false;
      if (filtro.tipo === 'receita' && l.tipo !== 'receita') return false;
      if (filtro.pessoaId !== 'todos' && l.pessoaId !== filtro.pessoaId) return false;
      if (filtro.metodo === 'caixa' && l.metodo === 'credito') return false;
      if (filtro.metodo === 'credito' && l.metodo !== 'credito') return false;
      if (filtro.categoriaId !== 'todas' && l.categoriaId !== filtro.categoriaId) return false;
      if (!filtro.incluirTerceiros && l.terceiroId) return false;
      return true;
    }).sort(function (a, b) {
      if (filtro.ordenar === 'valor') return b.valor - a.valor;
      if (filtro.ordenar === 'desc') return a.desc.localeCompare(b.desc, 'pt-BR');
      return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0);
    });
  }

  function render(raiz, ctx) {
    var s = FC.store.get();
    var mes = ctx.mes;
    var per = periodoAtual(mes);
    var itens = filtrar(s, mes);

    var total = fmt.sumBy(itens, function (l) { return l.valor; });
    var doCasal = fmt.sumBy(itens.filter(function (l) { return !l.terceiroId; }), function (l) { return l.valor; });
    var deTerceiros = fmt.round2(total - doCasal);
    var meses = fmt.diffMonths(per.de, per.ate) + 1;

    var tela = h('div', { 'data-accent': s.config.acentoCasal || 'oceano' });

    tela.appendChild(h('div.page-head',
      h('div.page-head__t',
        h('h1', 'Relatórios'),
        h('span.page-head__sub', rotuloPeriodo(per) + '  ·  ' + itens.length + ' lançamentos')
      ),
      h('div.page-head__actions',
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: function () { exportarCSV(s, itens, per); } },
          ic('download'), 'CSV'),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: function () { FC.pdf.imprimir(receita(s, mes, itens, per)); } },
          ic('print'), 'Imprimir'),
        h('button.btn.btn--sm', { type: 'button', onclick: function () { FC.pdf.exportar(receita(s, mes, itens, per)); } },
          ic('file'), 'Baixar PDF')
      )
    ));

    /* ---------------------------- filtros ---------------------------- */
    tela.appendChild(cardFiltros(s, mes));

    /* ---------------------------- resumo ---------------------------- */
    tela.appendChild(h('div.grid.grid--kpi.mt-4',
      ui.kpi({
        rotulo: filtro.tipo === 'receita' ? 'Total de entradas' : 'Total no período',
        icone: 'coins', cor: 'var(--accent)',
        valor: fmt.brl(total),
        rodape: h('span.dim', itens.length + ' lançamentos')
      }),
      ui.kpi({
        rotulo: 'Média por mês', icone: 'chart', cor: 'var(--c2)',
        valor: fmt.brl(meses > 0 ? total / meses : 0),
        rodape: h('span.dim', meses + (meses === 1 ? ' mês' : ' meses'))
      }),
      ui.kpi({
        rotulo: 'Do casal', icone: 'users', cor: 'var(--c1)',
        valor: fmt.brl(doCasal),
        rodape: h('span.dim', 'sem os gastos de terceiros')
      }),
      ui.kpi({
        rotulo: 'De terceiros', icone: 'handCoins', cor: 'var(--warn)',
        valor: fmt.brl(deTerceiros),
        rodape: h('span.dim', 'cartão emprestado')
      })
    ));

    /* ---------------------------- graficos ---------------------------- */
    var cats = FC.model.porCategoria(s, null, {
      de: per.de, ate: per.ate,
      pessoaId: filtro.pessoaId === 'todos' ? null : filtro.pessoaId,
      metodo: filtro.metodo === 'todos' ? null : filtro.metodo,
      incluirTerceiros: filtro.incluirTerceiros
    });

    var mesesLista = [];
    for (var m = per.de; m <= per.ate; m = fmt.addMonths(m, 1)) {
      mesesLista.push(m);
      if (mesesLista.length > 36) break;
    }
    var serie = FC.model.serieMensal(s, mesesLista);

    if (filtro.tipo !== 'receita') {
      tela.appendChild(h('div.grid.grid--wide.mt-4',
        h('div.card',
          h('div.card__head', h('div.card__title', 'Gasto por categoria')),
          h('div.grid.grid--2',
            ch.donut({ itens: cats.itens, centro: { k: 'Total', v: fmt.brl(cats.total) }, tamanho: 200, legenda: false }),
            ch.ranking(cats.itens, { limite: 10 })
          )
        ),
        h('div.card',
          h('div.card__head', h('div.card__title', 'Mês a mês')),
          ch.barras({
            grupos: serie.map(function (x) { return { rotulo: x.rotulo, valores: [x.gastos] }; }),
            series: [{ nome: 'Gastos', cor: 'var(--neg)' }],
            altura: 240, legenda: false
          })
        )
      ));
    }

    /* ---------------------------- tabela ---------------------------- */
    tela.appendChild(h('div.card.card--flush.mt-4',
      h('div.card__head.card__head--flush',
        h('div.card__title', 'Lançamentos'),
        h('div.card__tools',
          h('select.select', {
            style: { width: 'auto', height: '32px' },
            onchange: function (e) { filtro.ordenar = e.target.value; FC.app.redesenhar(); }
          },
            h('option', { value: 'data', selected: filtro.ordenar === 'data' }, 'Por data'),
            h('option', { value: 'valor', selected: filtro.ordenar === 'valor' }, 'Por valor'),
            h('option', { value: 'desc', selected: filtro.ordenar === 'desc' }, 'Por descrição')
          )
        )
      ),
      itens.length
        ? h('div.tablewrap', tabela(s, itens, total))
        : ui.vazio({
            titulo: 'Nada encontrado',
            icone: 'search',
            texto: 'Nenhum lançamento bate com esses filtros. Tente ampliar o período.'
          })
    ));

    d.mount(raiz, tela);
  }

  /* ---------------------------- filtros ---------------------------- */

  function cardFiltros(s, mes) {
    function mudar(campo, valor) {
      filtro[campo] = valor;
      FC.app.redesenhar();
    }

    var selPessoa = h('select.select', {
      onchange: function (e) { mudar('pessoaId', e.target.value); }
    },
      h('option', { value: 'todos', selected: filtro.pessoaId === 'todos' }, 'Os dois'),
      s.casal.pessoas.map(function (p) {
        return h('option', { value: p.id, selected: filtro.pessoaId === p.id }, p.apelido || p.nome);
      })
    );

    var selCategoria = h('select.select', {
      onchange: function (e) { mudar('categoriaId', e.target.value); }
    },
      h('option', { value: 'todas', selected: filtro.categoriaId === 'todas' }, 'Todas as categorias'),
      s.categorias.map(function (c) {
        return h('option', { value: c.id, selected: filtro.categoriaId === c.id }, c.nome);
      })
    );

    var selPeriodo = h('select.select', {
      onchange: function (e) { mudar('periodo', e.target.value); }
    },
      h('option', { value: 'mes', selected: filtro.periodo === 'mes' }, 'Mês selecionado'),
      h('option', { value: '3', selected: filtro.periodo === '3' }, 'Últimos 3 meses'),
      h('option', { value: '6', selected: filtro.periodo === '6' }, 'Últimos 6 meses'),
      h('option', { value: '12', selected: filtro.periodo === '12' }, 'Últimos 12 meses'),
      h('option', { value: 'ano', selected: filtro.periodo === 'ano' }, 'Ano de ' + mes.slice(0, 4)),
      h('option', { value: 'personalizado', selected: filtro.periodo === 'personalizado' }, 'Escolher período')
    );

    var blocoDatas = filtro.periodo === 'personalizado'
      ? h('div.fgrid',
          ui.campo('De', h('input.input', {
            type: 'month', value: filtro.de || mes,
            onchange: function (e) { filtro.de = e.target.value; FC.app.redesenhar(); }
          })),
          ui.campo('Até', h('input.input', {
            type: 'month', value: filtro.ate || mes,
            onchange: function (e) { filtro.ate = e.target.value; FC.app.redesenhar(); }
          }))
        )
      : null;

    return h('div.card',
      h('div.row.wrap', { style: { gap: 'var(--sp-3)', alignItems: 'flex-end' } },
        h('div', { style: { minWidth: '180px', flex: '1 1 180px' } }, ui.campo('Período', selPeriodo)),
        h('div', { style: { minWidth: '150px', flex: '1 1 150px' } }, ui.campo('De quem', selPessoa)),
        h('div', { style: { minWidth: '180px', flex: '1 1 180px' } }, ui.campo('Categoria', selCategoria)),
        h('div', { style: { flex: '1 1 auto' } },
          ui.campo('Tipo', ui.segmentado([
            { id: 'gasto', nome: 'Gastos' },
            { id: 'receita', nome: 'Entradas' },
            { id: 'tudo', nome: 'Tudo' }
          ], filtro.tipo, function (v) { mudar('tipo', v); }))
        ),
        h('div', { style: { flex: '1 1 auto' } },
          ui.campo('Forma', ui.segmentado([
            { id: 'todos', nome: 'Todas' },
            { id: 'caixa', nome: 'Débito/Pix' },
            { id: 'credito', nome: 'Crédito' }
          ], filtro.metodo, function (v) { mudar('metodo', v); }))
        )
      ),
      blocoDatas,
      h('div.row.mt-4', { style: { gap: 'var(--sp-4)' } },
        ui.interruptor('Incluir gastos de terceiros', filtro.incluirTerceiros, function (v) {
          mudar('incluirTerceiros', v);
        }),
        h('div.grow'),
        h('button.btn.btn--ghost.btn--sm', {
          type: 'button',
          onclick: function () {
            filtro.periodo = 'mes'; filtro.pessoaId = 'todos'; filtro.metodo = 'todos';
            filtro.categoriaId = 'todas'; filtro.incluirTerceiros = true; filtro.tipo = 'gasto';
            FC.app.redesenhar();
          }
        }, ic('refresh'), 'Limpar filtros')
      )
    );
  }

  /* ---------------------------- tabela ---------------------------- */

  function tabela(s, itens, total) {
    return h('table.tbl',
      h('thead', h('tr',
        h('th', 'Data'),
        h('th', 'Descrição'),
        h('th', 'Quem'),
        h('th', 'Categoria'),
        h('th', 'Forma'),
        h('th.num', 'Valor')
      )),
      h('tbody', itens.map(function (l) {
        var p = FC.model.pessoa(s, l.pessoaId);
        return h('tr', {
          style: { cursor: 'pointer' },
          onclick: function () { FC.forms.lancamento({ id: l.id }); }
        },
          h('td.dim.nowrap', fmt.dateBR(l.data)),
          h('td',
            h('div.rowdesc',
              h('div.rowdesc__txt', l.desc),
              l.parcela ? h('span.chip', l.parcela.n + '/' + l.parcela.de) : null,
              l.terceiroId ? h('span.chip.chip--warn', FC.model.nomeTerceiro(s, l.terceiroId)) : null,
              l.tipo === 'receita' ? h('span.chip.chip--pos', 'entrada') : null
            )
          ),
          h('td.nowrap', p ? h('span.chip.chip--dot', {
            style: { '--chip-color': ui.corDoAcento(p.acento) }
          }, p.apelido || p.nome) : '—'),
          h('td.nowrap', h('span.chip.chip--dot', {
            style: { '--chip-color': FC.model.corCategoria(s, l.categoriaId) }
          }, FC.model.nomeCategoria(s, l.categoriaId))),
          h('td.dim.nowrap', FC.model.nomeMetodo(l.metodo)),
          h('td.num.nowrap', { style: { fontWeight: '650' } }, fmt.brl(l.valor))
        );
      })),
      h('tfoot', h('tr', { style: { borderTop: '1.5px solid var(--line)' } },
        h('td', { colspan: '5', style: { fontWeight: '700' } }, 'Total'),
        h('td.num', { style: { fontWeight: '700', fontSize: 'var(--fs-lg)' } }, fmt.brl(total))
      ))
    );
  }

  function rotuloPeriodo(per) {
    if (per.de === per.ate) return fmt.monthLabel(per.de);
    return fmt.monthLabel(per.de, true) + ' até ' + fmt.monthLabel(per.ate, true);
  }

  /* ---------------------------- receita do PDF ---------------------------- */

  function receita(s, mes, itens, per) {
    var total = fmt.sumBy(itens, function (l) { return l.valor; });
    var r = FC.model.resumoCasal(s, mes);
    var pat = FC.model.patrimonio(s);

    var cats = FC.model.porCategoria(s, null, {
      de: per.de, ate: per.ate,
      pessoaId: filtro.pessoaId === 'todos' ? null : filtro.pessoaId,
      incluirTerceiros: filtro.incluirTerceiros
    });

    var secoes = [];

    /* resumo do mes por pessoa */
    secoes.push({
      titulo: 'Resumo de ' + fmt.monthLabel(mes),
      colunas: ['Pessoa', 'Entradas', 'Débito/Pix', 'Crédito', 'Terceiros', 'Sobra'],
      colunasNumero: [1, 2, 3, 4, 5],
      linhas: r.porPessoa.map(function (x) {
        return [
          x.pessoa.apelido || x.pessoa.nome,
          fmt.brl(x.entradas), fmt.brl(x.debito), fmt.brl(x.credito),
          fmt.brl(x.outros), fmt.brl(x.sobra)
        ];
      }),
      totais: ['Casal', fmt.brl(r.entradas), fmt.brl(r.debito), fmt.brl(r.credito),
               fmt.brl(r.outros), fmt.brl(r.sobra)]
    });

    /* categorias */
    if (cats.itens.length) {
      secoes.push({
        titulo: 'Gasto por categoria',
        colunas: ['Categoria', 'Lançamentos', 'Total', '% do período'],
        colunasNumero: [1, 2, 3],
        linhas: cats.itens.map(function (c) {
          return [c.nome, String(c.qtd), fmt.brl(c.total), fmt.pct(c.pct, 1)];
        }),
        totais: ['Total', String(itens.length), fmt.brl(cats.total), '100,0%']
      });
    }

    /* terceiros */
    var terc = FC.model.porTerceiro(s).filter(function (t) { return t.total > 0; });
    if (terc.length) {
      secoes.push({
        titulo: 'Cartão emprestado',
        colunas: ['Pessoa', 'Compras', 'Já acertado', 'Em aberto'],
        colunasNumero: [1, 2, 3],
        linhas: terc.map(function (t) {
          return [t.nome, String(t.itens), fmt.brl(t.pago), fmt.brl(t.aberto)];
        })
      });
    }

    /* carteira */
    var cart = FC.model.carteira(s);
    if (cart.itens.length) {
      secoes.push({
        titulo: 'Investimentos',
        colunas: ['Aplicação', 'Tipo', 'De quem', 'Aportado', 'Rendimento', 'Saldo'],
        colunasNumero: [3, 4, 5],
        linhas: cart.itens.map(function (i) {
          return [i.nome, i.tipo, i.dono, fmt.brl(i.aportes), fmt.brl(i.ganho), fmt.brl(i.saldo)];
        }),
        totais: ['Total', '', '', fmt.brl(cart.aportado), fmt.brl(cart.ganho), fmt.brl(cart.total)]
      });
    }

    /* próximas faturas: parcelas já lançadas + assinaturas previstas */
    var prox = FC.model.previsaoFaturas(s, [1, 2, 3, 4, 5, 6].map(function (i) {
      return fmt.addMonths(fmt.thisMonth(), i);
    }), {});
    if (prox.some(function (p) { return p.total > 0; })) {
      secoes.push({
        titulo: 'Próximas faturas do cartão (já comprometido)',
        colunas: ['Mês', 'Parcelas', 'Assinaturas', 'Outras', 'Total'],
        colunasNumero: [1, 2, 3, 4],
        linhas: prox.map(function (p) {
          return [fmt.monthLabel(p.mes), fmt.brl(p.parcelas), fmt.brl(p.assinaturas), fmt.brl(p.avulsos), fmt.brl(p.total)];
        }),
        totais: ['6 meses', fmt.brl(fmt.sumBy(prox, function (p) { return p.parcelas; })),
                 fmt.brl(fmt.sumBy(prox, function (p) { return p.assinaturas; })),
                 fmt.brl(fmt.sumBy(prox, function (p) { return p.avulsos; })),
                 fmt.brl(fmt.sumBy(prox, function (p) { return p.total; }))]
      });
    }

    /* lancamentos */
    secoes.push({
      titulo: 'Lançamentos do período',
      quebrarAntes: true,
      colunas: ['Data', 'Descrição', 'Quem', 'Categoria', 'Forma', 'Valor'],
      colunasNumero: [5],
      estilosColuna: { 0: { cellWidth: 17 }, 5: { cellWidth: 22 } },
      linhas: itens.map(function (l) {
        return [
          fmt.dateBR(l.data),
          l.desc + (l.parcela ? ' (' + l.parcela.n + '/' + l.parcela.de + ')' : '') +
                   (l.terceiroId ? ' [' + FC.model.nomeTerceiro(s, l.terceiroId) + ']' : ''),
          FC.model.nomePessoa(s, l.pessoaId),
          FC.model.nomeCategoria(s, l.categoriaId),
          FC.model.nomeMetodo(l.metodo),
          fmt.brl(l.valor)
        ];
      }),
      totais: ['', '', '', '', 'Total', fmt.brl(total)]
    });

    return {
      titulo: s.casal.nome,
      subtitulo: 'Relatório de ' + rotuloPeriodo(per).toLowerCase(),
      arquivo: 'relatorio-' + per.de + (per.de !== per.ate ? '-a-' + per.ate : '') + '.pdf',
      kpis: [
        { k: 'Patrimônio', v: fmt.brl(pat.total), sinal: pat.total >= 0 ? 'pos' : 'neg' },
        { k: 'Em conta', v: fmt.brl(pat.conta) },
        { k: 'Investido', v: fmt.brl(pat.investido) },
        { k: 'Cartão a pagar', v: fmt.brl(pat.fatura + (pat.aVencer || 0)), sinal: pat.fatura > 0 ? 'neg' : null },
        { k: 'Entradas do mês', v: fmt.brl(r.entradas), sinal: 'pos' },
        { k: 'Gastos do mês', v: fmt.brl(r.gastos) },
        { k: 'Sobra do mês', v: fmt.brl(r.sobra), sinal: r.sobra >= 0 ? 'pos' : 'neg' },
        { k: 'A receber', v: fmt.brl(pat.aReceber) }
      ],
      secoes: secoes,
      rodape: s.casal.nome + ' — relatório gerado pelo próprio navegador, sem enviar dados para fora'
    };
  }

  /* ---------------------------- CSV ---------------------------- */

  function exportarCSV(s, itens, per) {
    var linhas = [['Data', 'Mes', 'Tipo', 'Descricao', 'Pessoa', 'Categoria', 'Forma',
                   'Terceiro', 'Parcela', 'Pago', 'Valor']];

    itens.forEach(function (l) {
      linhas.push([
        fmt.dateBR(l.data),
        l.mes,
        l.tipo,
        l.desc,
        FC.model.nomePessoa(s, l.pessoaId),
        FC.model.nomeCategoria(s, l.categoriaId),
        FC.model.nomeMetodo(l.metodo),
        l.terceiroId ? FC.model.nomeTerceiro(s, l.terceiroId) : '',
        l.parcela ? l.parcela.n + '/' + l.parcela.de : '',
        l.pago ? 'sim' : 'nao',
        String(l.valor).replace('.', ',')
      ]);
    });

    var csv = linhas.map(function (ln) {
      return ln.map(function (c) {
        var t = String(c == null ? '' : c);
        return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
      }).join(';');
    }).join('\r\n');

    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'lancamentos-' + per.de + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    ui.toast('CSV salvo. Abre direto no Excel e no Google Planilhas.', 'ok', 5000);
  }

  FC.viewRelatorios = { render: render, receita: receita };
})(typeof self !== 'undefined' ? self : this);
