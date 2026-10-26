/* ==========================================================================
   model.js — regras de calculo (tudo derivado dos lancamentos)

   Como o dinheiro e contado, para nao contar duas vezes:
     - gasto no debito/pix/dinheiro  -> sai da conta no dia
     - gasto no credito              -> vira fatura; so sai da conta quando
                                        a fatura e paga (lancamento tipo 'fatura')
     - gasto de terceiro no cartao   -> entra na fatura, mas nao e gasto nosso;
                                        vira "a receber" ate ser reembolsado
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var fmt = FC.fmt;
  var round2 = fmt.round2;

  var METODOS = [
    { id: 'debito',   nome: 'Débito',   icone: 'card' },
    { id: 'pix',      nome: 'Pix',      icone: 'pix' },
    { id: 'dinheiro', nome: 'Dinheiro', icone: 'cash' },
    { id: 'credito',  nome: 'Crédito',  icone: 'card' }
  ];

  function nomeMetodo(id) {
    for (var i = 0; i < METODOS.length; i++) if (METODOS[i].id === id) return METODOS[i].nome;
    return id || '—';
  }

  /* ---------------------------- buscas simples ---------------------------- */

  function pessoa(s, id) {
    var ps = s.casal.pessoas;
    for (var i = 0; i < ps.length; i++) if (ps[i].id === id) return ps[i];
    return null;
  }
  function nomePessoa(s, id) {
    var p = pessoa(s, id);
    return p ? (p.apelido || p.nome) : '—';
  }
  function categoria(s, id) {
    for (var i = 0; i < s.categorias.length; i++) if (s.categorias[i].id === id) return s.categorias[i];
    return null;
  }
  function nomeCategoria(s, id) {
    var c = categoria(s, id);
    return c ? c.nome : 'Sem categoria';
  }
  function corCategoria(s, id) {
    var c = categoria(s, id);
    return c ? c.cor : 'var(--text-3)';
  }
  function terceiro(s, id) {
    for (var i = 0; i < s.terceiros.length; i++) if (s.terceiros[i].id === id) return s.terceiros[i];
    return null;
  }
  function nomeTerceiro(s, id) {
    var t = terceiro(s, id);
    return t ? t.nome : '—';
  }
  function cartao(s, id) {
    for (var i = 0; i < s.cartoes.length; i++) if (s.cartoes[i].id === id) return s.cartoes[i];
    return null;
  }
  function investimento(s, id) {
    for (var i = 0; i < s.investimentos.length; i++) if (s.investimentos[i].id === id) return s.investimentos[i];
    return null;
  }

  /* ---------------------------- filtros ---------------------------- */

  function doMes(s, mes) {
    return s.lancamentos.filter(function (l) { return l.mes === mes; });
  }

  function ateOMes(s, mes) {
    return s.lancamentos.filter(function (l) { return l.mes <= mes; });
  }

  function daPessoa(lista, pessoaId) {
    return lista.filter(function (l) { return l.pessoaId === pessoaId; });
  }

  function ehGastoProprio(l) {
    return l.tipo === 'gasto' && !l.terceiroId;
  }
  function ehTerceiro(l) {
    return l.tipo === 'gasto' && !!l.terceiroId;
  }
  function ehCredito(l) {
    return l.metodo === 'credito';
  }
  function ehCaixa(l) {
    return l.metodo !== 'credito';
  }

  /**
   * Os tres paineis da planilha, para uma pessoa em um mes.
   * debito  -> gastos proprios fora do cartao
   * credito -> gastos proprios no cartao
   * outros  -> gastos de terceiros (cartao emprestado)
   */
  function paineis(s, mes, pessoaId) {
    /* meses futuros mostram também as assinaturas previstas (marcadas como previsto) */
    var lista = daPessoa(doMes(s, mes).concat(previstos(s, mes)), pessoaId);

    var debito = lista.filter(function (l) { return ehGastoProprio(l) && ehCaixa(l); });
    var credito = lista.filter(function (l) { return ehGastoProprio(l) && ehCredito(l); });
    var outros = lista.filter(ehTerceiro);
    var receitas = lista.filter(function (l) { return l.tipo === 'receita'; });
    var faturas = lista.filter(function (l) { return l.tipo === 'fatura'; });

    var ordenar = function (a, b) {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      return (a.criadoEm || '') < (b.criadoEm || '') ? -1 : 1;
    };

    return {
      debito: debito.sort(ordenar),
      credito: credito.sort(ordenar),
      outros: outros.sort(ordenar),
      receitas: receitas.sort(ordenar),
      faturas: faturas.sort(ordenar),
      totalDebito: fmt.sumBy(debito, function (l) { return l.valor; }),
      totalCredito: fmt.sumBy(credito, function (l) { return l.valor; }),
      totalOutros: fmt.sumBy(outros, function (l) { return l.valor; }),
      totalReceitas: fmt.sumBy(receitas, function (l) { return l.valor; }),
      totalFaturas: fmt.sumBy(faturas, function (l) { return l.valor; })
    };
  }

  /** Resumo de uma pessoa no mes */
  function resumoPessoa(s, mes, pessoaId) {
    var p = paineis(s, mes, pessoaId);
    var entradas = p.totalReceitas;
    var gastos = round2(p.totalDebito + p.totalCredito);
    var faturaTotal = round2(p.totalCredito + p.totalOutros);
    var saiuDaConta = round2(p.totalDebito + p.totalFaturas);

    return {
      paineis: p,
      entradas: entradas,
      debito: p.totalDebito,
      credito: p.totalCredito,
      outros: p.totalOutros,
      pagouFatura: p.totalFaturas,
      gastos: gastos,
      faturaTotal: faturaTotal,
      saiuDaConta: saiuDaConta,
      sobra: round2(entradas - gastos),
      sobraCaixa: round2(entradas - saiuDaConta),
      aReceber: fmt.sumBy(p.outros.filter(function (l) { return !l.reembolsado; }), function (l) { return l.valor; })
    };
  }

  /** Resumo do casal no mes */
  function resumoCasal(s, mes) {
    var pessoas = s.casal.pessoas;
    var porPessoa = pessoas.map(function (p) {
      var r = resumoPessoa(s, mes, p.id);
      r.pessoa = p;
      return r;
    });

    var somar = function (campo) {
      return round2(porPessoa.reduce(function (t, r) { return t + r[campo]; }, 0));
    };

    return {
      porPessoa: porPessoa,
      entradas: somar('entradas'),
      debito: somar('debito'),
      credito: somar('credito'),
      outros: somar('outros'),
      pagouFatura: somar('pagouFatura'),
      gastos: somar('gastos'),
      faturaTotal: somar('faturaTotal'),
      saiuDaConta: somar('saiuDaConta'),
      sobra: somar('sobra'),
      sobraCaixa: somar('sobraCaixa'),
      aReceber: somar('aReceber')
    };
  }

  /* ---------------------------- patrimonio global ---------------------------- */

  /**
   * Saldo em conta = saldo declarado na data de corte
   *                + entradas desde entao
   *                - o que saiu da conta desde entao.
   */
  function saldoEmConta(s, ateData) {
    /* sem data: ate hoje. Parcela de carne lancada para marco nao sai da conta hoje. */
    var limite = ateData || fmt.todayISO();
    var total = 0;

    s.contas.forEach(function (c) {
      total += Number(c.saldoInicial) || 0;
      var desde = c.desde || '0000-01-01';

      s.lancamentos.forEach(function (l) {
        if (l.pessoaId !== c.pessoaId) return;
        if (l.data < desde || l.data > limite) return;

        if (l.tipo === 'receita') total += Number(l.valor) || 0;
        else if (l.tipo === 'fatura') total -= Number(l.valor) || 0;
        else if (l.tipo === 'gasto' && ehCaixa(l)) total -= Number(l.valor) || 0;
      });

      // movimentos de investimento mexem no caixa
      s.movimentos.forEach(function (m) {
        var inv = investimento(s, m.investimentoId);
        if (!inv) return;
        var dono = inv.pessoaId === 'casal' ? null : inv.pessoaId;
        if (dono && dono !== c.pessoaId) return;
        if (!dono && c.pessoaId !== s.casal.pessoas[0].id) return; // investimento do casal sai da 1a conta
        if (m.data < desde || m.data > limite) return;

        if (m.tipo === 'aporte') total -= Number(m.valor) || 0;
        else if (m.tipo === 'resgate') total += Number(m.valor) || 0;
      });
    });

    return round2(total);
  }

  /** Total investido hoje (aportes + rendimentos - resgates) */
  function totalInvestido(s, ateData) {
    var limite = ateData || fmt.todayISO();
    var total = 0;
    s.movimentos.forEach(function (m) {
      if (m.data > limite) return;
      var v = Number(m.valor) || 0;
      if (m.tipo === 'aporte' || m.tipo === 'rendimento') total += v;
      else if (m.tipo === 'resgate') total -= v;
      else if (m.tipo === 'ajuste') total += v; // ajuste pode ser negativo
    });
    return round2(total);
  }

  /** Fatura ainda em aberto: credito nao pago ate o mes atual */
  function faturaEmAberto(s) {
    var atual = fmt.thisMonth();
    return fmt.sumBy(
      s.lancamentos.filter(function (l) {
        return l.tipo === 'gasto' && ehCredito(l) && !l.pago && l.mes <= atual;
      }),
      function (l) { return l.valor; }
    );
  }

  /** Parcelas no cartao que ja estao lancadas para os proximos meses (divida assumida) */
  function parcelasAVencer(s) {
    var atual = fmt.thisMonth();
    return fmt.sumBy(
      s.lancamentos.filter(function (l) {
        return l.tipo === 'gasto' && ehCredito(l) && !l.pago && l.mes > atual;
      }),
      function (l) { return l.valor; }
    );
  }

  /** Quanto terceiros ainda devem */
  function aReceberTotal(s) {
    return fmt.sumBy(
      s.lancamentos.filter(function (l) { return ehTerceiro(l) && !l.reembolsado; }),
      function (l) { return l.valor; }
    );
  }

  /** Quanto cada terceiro deve */
  function porTerceiro(s) {
    var mapa = {};
    s.lancamentos.filter(ehTerceiro).forEach(function (l) {
      var k = l.terceiroId;
      if (!mapa[k]) mapa[k] = { id: k, nome: nomeTerceiro(s, k), aberto: 0, pago: 0, itens: 0 };
      mapa[k].itens++;
      if (l.reembolsado) mapa[k].pago += Number(l.valor) || 0;
      else mapa[k].aberto += Number(l.valor) || 0;
    });
    return Object.keys(mapa).map(function (k) {
      mapa[k].aberto = round2(mapa[k].aberto);
      mapa[k].pago = round2(mapa[k].pago);
      mapa[k].total = round2(mapa[k].aberto + mapa[k].pago);
      return mapa[k];
    }).sort(function (a, b) { return b.aberto - a.aberto; });
  }

  /** O numero global que o casal quer ver */
  function patrimonio(s) {
    var conta = saldoEmConta(s);
    var investido = totalInvestido(s);
    var receber = aReceberTotal(s);
    var fatura = faturaEmAberto(s);
    var aVencer = parcelasAVencer(s);
    return {
      conta: conta,
      investido: investido,
      aReceber: receber,
      fatura: fatura,
      aVencer: aVencer,
      total: round2(conta + investido + receber - fatura - aVencer)
    };
  }

  /* ---------------------------- series para graficos ---------------------------- */

  function serieMensal(s, meses) {
    return meses.map(function (m) {
      var r = resumoCasal(s, m);
      return {
        mes: m,
        rotulo: fmt.monthLabel(m, true),
        entradas: r.entradas,
        gastos: r.gastos,
        debito: r.debito,
        credito: r.credito,
        sobra: r.sobra,
        porPessoa: r.porPessoa.map(function (p) {
          return { id: p.pessoa.id, nome: p.pessoa.apelido || p.pessoa.nome, gastos: p.gastos, entradas: p.entradas };
        })
      };
    });
  }

  /** Evolucao do patrimonio no fim de cada mes */
  function seriePatrimonio(s, meses) {
    return meses.map(function (m) {
      var fim = m + '-' + fmt.pad(fmt.daysInMonth(m));
      var conta = saldoEmConta(s, fim);
      var inv = totalInvestido(s, fim);
      return {
        mes: m,
        rotulo: fmt.monthLabel(m, true),
        conta: conta,
        investido: inv,
        total: round2(conta + inv)
      };
    });
  }

  /** Gasto por categoria no mes (ou no periodo) */
  function porCategoria(s, mes, opcoes) {
    opcoes = opcoes || {};
    var lista = mes ? doMes(s, mes) : s.lancamentos.slice();

    lista = lista.filter(function (l) {
      if (l.tipo !== 'gasto') return false;
      if (!opcoes.incluirTerceiros && l.terceiroId) return false;
      if (opcoes.pessoaId && l.pessoaId !== opcoes.pessoaId) return false;
      if (opcoes.metodo === 'caixa' && ehCredito(l)) return false;
      if (opcoes.metodo === 'credito' && !ehCredito(l)) return false;
      if (opcoes.de && l.mes < opcoes.de) return false;
      if (opcoes.ate && l.mes > opcoes.ate) return false;
      return true;
    });

    var mapa = {};
    lista.forEach(function (l) {
      var k = l.categoriaId || 'sem';
      if (!mapa[k]) {
        mapa[k] = {
          id: k,
          nome: l.categoriaId ? nomeCategoria(s, k) : 'Sem categoria',
          cor: l.categoriaId ? corCategoria(s, k) : 'var(--text-3)',
          total: 0, qtd: 0
        };
      }
      mapa[k].total += Number(l.valor) || 0;
      mapa[k].qtd++;
    });

    var itens = Object.keys(mapa).map(function (k) {
      mapa[k].total = round2(mapa[k].total);
      return mapa[k];
    }).sort(function (a, b) { return b.total - a.total; });

    var soma = fmt.sumBy(itens, function (i) { return i.total; });
    itens.forEach(function (i) { i.pct = soma > 0 ? (i.total / soma) * 100 : 0; });
    return { itens: itens, total: soma };
  }

  /** Maiores gastos do mes */
  function maioresGastos(s, mes, n) {
    return doMes(s, mes)
      .filter(function (l) { return l.tipo === 'gasto'; })
      .sort(function (a, b) { return b.valor - a.valor; })
      .slice(0, n || 6);
  }

  /** Gasto por dia do mes (mapa de calor) */
  function porDia(s, mes) {
    var dias = fmt.daysInMonth(mes);
    var arr = [];
    for (var i = 1; i <= dias; i++) arr.push({ dia: i, total: 0, qtd: 0 });

    doMes(s, mes).forEach(function (l) {
      if (l.tipo !== 'gasto' || l.terceiroId) return;
      var d = parseInt(String(l.data).slice(8, 10), 10);
      if (d >= 1 && d <= dias) {
        arr[d - 1].total += Number(l.valor) || 0;
        arr[d - 1].qtd++;
      }
    });
    arr.forEach(function (a) { a.total = round2(a.total); });
    return arr;
  }

  /* ---------------------------- investimentos ---------------------------- */

  function saldoInvestimento(s, investimentoId, ateData) {
    var limite = ateData || '9999-12-31';
    var aportes = 0, resgates = 0, rendimentos = 0, ajustes = 0;

    s.movimentos.forEach(function (m) {
      if (m.investimentoId !== investimentoId || m.data > limite) return;
      var v = Number(m.valor) || 0;
      if (m.tipo === 'aporte') aportes += v;
      else if (m.tipo === 'resgate') resgates += v;
      else if (m.tipo === 'rendimento') rendimentos += v;
      else if (m.tipo === 'ajuste') ajustes += v;
    });

    var investido = round2(aportes - resgates);
    var saldo = round2(aportes - resgates + rendimentos + ajustes);
    var ganho = round2(rendimentos + ajustes);
    return {
      aportes: round2(aportes),
      resgates: round2(resgates),
      rendimentos: round2(rendimentos),
      ajustes: round2(ajustes),
      investido: investido,
      saldo: saldo,
      ganho: ganho,
      ganhoPct: aportes > 0 ? (ganho / aportes) * 100 : 0
    };
  }

  function carteira(s) {
    var itens = s.investimentos.map(function (inv) {
      var sd = saldoInvestimento(s, inv.id);
      return {
        inv: inv,
        id: inv.id,
        nome: inv.nome,
        tipo: inv.tipo,
        cor: inv.cor,
        pessoaId: inv.pessoaId,
        dono: inv.pessoaId === 'casal' ? 'Casal' : nomePessoa(s, inv.pessoaId),
        saldo: sd.saldo,
        investido: sd.investido,
        ganho: sd.ganho,
        ganhoPct: sd.ganhoPct,
        aportes: sd.aportes,
        resgates: sd.resgates,
        rendimentos: sd.rendimentos
      };
    }).sort(function (a, b) { return b.saldo - a.saldo; });

    var total = fmt.sumBy(itens, function (i) { return i.saldo; });
    itens.forEach(function (i) { i.pct = total > 0 ? (i.saldo / total) * 100 : 0; });

    var ganhoTotal = fmt.sumBy(itens, function (i) { return i.ganho; });
    var aportadoTotal = fmt.sumBy(itens, function (i) { return i.aportes; });

    return {
      itens: itens,
      total: total,
      ganho: ganhoTotal,
      aportado: aportadoTotal,
      ganhoPct: aportadoTotal > 0 ? (ganhoTotal / aportadoTotal) * 100 : 0
    };
  }

  function serieInvestido(s, meses) {
    return meses.map(function (m) {
      var fim = m + '-' + fmt.pad(fmt.daysInMonth(m));
      return {
        mes: m,
        rotulo: fmt.monthLabel(m, true),
        total: totalInvestido(s, fim)
      };
    });
  }

  /** Aportes e resgates do mes */
  function movimentosDoMes(s, mes) {
    var lista = s.movimentos.filter(function (m) { return fmt.monthKey(m.data) === mes; });
    return {
      itens: lista.sort(function (a, b) { return a.data < b.data ? 1 : -1; }),
      aportes: fmt.sumBy(lista.filter(function (m) { return m.tipo === 'aporte'; }), function (m) { return m.valor; }),
      resgates: fmt.sumBy(lista.filter(function (m) { return m.tipo === 'resgate'; }), function (m) { return m.valor; }),
      rendimentos: fmt.sumBy(lista.filter(function (m) { return m.tipo === 'rendimento'; }), function (m) { return m.valor; })
    };
  }

  /* ---------------------------- parcelas ---------------------------- */

  /** mesma data, N meses depois (31/01 + 1 mês = 28/02) */
  function dataMaisMeses(iso, n) {
    var mes = fmt.addMonths(fmt.monthKey(iso), n);
    var dia = Math.min(parseInt(String(iso).slice(8, 10), 10) || 1, fmt.daysInMonth(mes));
    return mes + '-' + fmt.pad(dia);
  }

  /**
   * Gera os lancamentos de uma compra parcelada.
   * `base.mes` / `base.data` sao os da parcela `primeira`; as seguintes caem
   * nos meses seguintes.
   *   op.primeira     1 por padrao; 3 = "ja estou na 3a parcela"
   *   op.valorParcela se informado, cada parcela vale isso;
   *                   senao base.valor e o TOTAL da compra, dividido por `de`
   *                   (a ultima parcela absorve o centavo que sobra)
   */
  function gerarParcelas(base, de, op) {
    op = op || {};
    var primeira = fmt.clamp(op.primeira || 1, 1, de);
    var grupoId = op.grupoId || fmt.uid('grp');
    var valorParcela = op.valorParcela != null ? round2(op.valorParcela) : round2(base.valor / de);
    var ultima = op.valorParcela != null ? valorParcela : round2(base.valor - valorParcela * (de - 1));
    var itens = [];

    for (var n = primeira; n <= de; n++) {
      var k = n - primeira;
      var l = Object.assign({}, base);
      l.id = fmt.uid('lan');
      l.valor = n === de ? ultima : valorParcela;
      l.mes = fmt.addMonths(base.mes, k);
      l.data = dataMaisMeses(base.data || (base.mes + '-01'), k);
      l.parcela = { n: n, de: de, grupoId: grupoId };
      l.criadoEm = new Date().toISOString();
      if (k > 0) l.pago = false;
      itens.push(l);
    }
    return itens;
  }

  /** Lancamentos irmaos de uma parcela */
  function irmaosDaParcela(s, l) {
    if (!l.parcela || !l.parcela.grupoId) return [l];
    return s.lancamentos.filter(function (x) {
      return x.parcela && x.parcela.grupoId === l.parcela.grupoId;
    }).sort(function (a, b) { return a.parcela.n - b.parcela.n; });
  }

  /**
   * Compras parceladas, agrupadas. `viva` = a ultima parcela lancada e do mes
   * passado para frente (um grupo que parou em 2025 nao e "em andamento").
   */
  function parcelamentos(s) {
    var atual = fmt.thisMonth();
    var grupos = {};
    s.lancamentos.forEach(function (l) {
      if (l.tipo !== 'gasto' || !l.parcela || !l.parcela.grupoId) return;
      (grupos[l.parcela.grupoId] = grupos[l.parcela.grupoId] || []).push(l);
    });

    return Object.keys(grupos).map(function (g) {
      var itens = grupos[g].sort(function (a, b) { return a.parcela.n - b.parcela.n; });
      var ult = itens[itens.length - 1];
      var de = ult.parcela.de;
      var futuras = itens.filter(function (l) { return l.mes > atual; });
      return {
        grupoId: g,
        desc: ult.desc,
        pessoaId: ult.pessoaId,
        metodo: ult.metodo,
        cartaoId: ult.cartaoId,
        terceiroId: ult.terceiroId,
        de: de,
        nMax: ult.parcela.n,
        valorParcela: ult.valor,
        ultimoMes: ult.mes,
        itens: itens,
        noMesAtual: itens.filter(function (l) { return l.mes === atual; })[0] || null,
        futuras: futuras.length,
        restante: fmt.sumBy(futuras, function (l) { return l.valor; }),
        faltamLancar: de - ult.parcela.n,
        viva: ult.mes >= fmt.addMonths(atual, -1),
        fimPrevisto: fmt.addMonths(ult.mes, de - ult.parcela.n)
      };
    });
  }

  /** Grupos vivos que ainda nao tem todas as parcelas lancadas ("Dentista 2/6" sem a 3/6) */
  function parcelasIncompletas(s) {
    return parcelamentos(s).filter(function (g) { return g.viva && g.faltamLancar > 0; });
  }

  /** Lancamentos que faltam para fechar um parcelamento (mesmo valor da ultima) */
  function completarParcelas(s, grupoId) {
    var g = parcelamentos(s).filter(function (x) { return x.grupoId === grupoId; })[0];
    if (!g || g.faltamLancar <= 0) return [];
    var ult = g.itens[g.itens.length - 1];
    var base = Object.assign({}, ult, {
      mes: fmt.addMonths(ult.mes, 1),
      data: dataMaisMeses(ult.data || (ult.mes + '-01'), 1),
      pago: false, reembolsado: false, origem: 'web', recorrenteId: null,
      obs: 'Parcela prevista (continuação de ' + ult.parcela.n + '/' + g.de + ')'
    });
    return gerarParcelas(base, g.de, { primeira: ult.parcela.n + 1, valorParcela: ult.valor, grupoId: grupoId })
      .map(function (l) { l.pago = false; return l; });
  }

  /* ---------------------------- assinaturas (recorrentes) ----------------------------
     Uma assinatura e um molde. Nos meses futuros ela aparece como "prevista"
     (so na tela e nas previsoes). Quando o mes chega, vira lancamento de
     verdade (materializar), e ai pode ser editada so naquele mes.
     ---------------------------------------------------------------------------- */

  function recorrente(s, id) {
    var lista = s.recorrentes || [];
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  function recorrenteAtivo(r, mes) {
    return r.inicio <= mes && (!r.fim || mes <= r.fim);
  }

  function lancamentoDaRecorrente(r, mes, previsto) {
    var dia = Math.min(r.dia || 1, fmt.daysInMonth(mes));
    return {
      /* id fixo por assinatura+mês: se os dois aparelhos lançarem o mesmo mês,
         a sincronização reconhece que é o mesmo lançamento */
      id: (previsto ? 'prev_' : 'lan_') + r.id + '_' + mes,
      tipo: 'gasto',
      data: mes + '-' + fmt.pad(dia),
      mes: mes,
      desc: r.desc,
      valor: r.valor,
      pessoaId: r.pessoaId,
      metodo: r.metodo,
      cartaoId: r.metodo === 'credito' ? r.cartaoId : null,
      categoriaId: r.categoriaId,
      terceiroId: null,
      pago: false,
      reembolsado: false,
      parcela: null,
      recorrenteId: r.id,
      previsto: !!previsto,
      obs: previsto ? 'Assinatura prevista' : 'Assinatura (lançada automaticamente)',
      origem: 'assinatura',
      /* data fixa (e não "agora"): os dois aparelhos geram o item idêntico */
      criadoEm: mes + '-01T00:00:00.000Z'
    };
  }

  /** Assinaturas previstas para um mes futuro (nao estao gravadas) */
  function previstos(s, mes) {
    if (!s.recorrentes || !s.recorrentes.length || mes <= fmt.thisMonth()) return [];
    return s.recorrentes
      /* mês já lançado de verdade não aparece de novo como previsto */
      .filter(function (r) { return recorrenteAtivo(r, mes) && (!r.ultimoMes || mes > r.ultimoMes); })
      .map(function (r) { return lancamentoDaRecorrente(r, mes, true); });
  }

  /**
   * Transforma em lancamento real as assinaturas dos meses que ja chegaram.
   * Se naquele mes ja existir um gasto igual digitado a mao (mesma pessoa e
   * mesma descricao), adota esse em vez de duplicar. Muda `s`; devolve quantos criou.
   */
  function materializar(s, ate) {
    ate = ate || fmt.thisMonth();
    var criados = 0;
    (s.recorrentes || []).forEach(function (r) {
      var mes = r.ultimoMes ? fmt.addMonths(r.ultimoMes, 1) : r.inicio;
      if (mes < r.inicio) mes = r.inicio;
      var limite = r.fim && r.fim < ate ? r.fim : ate;
      var alvo = fmt.norm(r.desc);
      while (mes <= limite) {
        var igual = s.lancamentos.filter(function (l) {
          return l.mes === mes && l.tipo === 'gasto' && !l.parcela &&
                 l.pessoaId === r.pessoaId && (l.recorrenteId === r.id || (!l.recorrenteId && fmt.norm(l.desc) === alvo));
        })[0];
        if (igual) igual.recorrenteId = r.id;
        else { s.lancamentos.push(lancamentoDaRecorrente(r, mes, false)); criados++; }
        r.ultimoMes = mes;
        mes = fmt.addMonths(mes, 1);
      }
    });
    return criados;
  }

  /**
   * Gastos que se repetem (mesma pessoa e descricao em pelo menos 3 dos
   * ultimos 4 meses) e ainda nao viraram assinatura: Spotify, plano de saude...
   */
  function sugestoesAssinaturas(s) {
    var atual = fmt.thisMonth();
    var meses = fmt.lastMonths(atual, 4);
    var ja = {};
    (s.recorrentes || []).forEach(function (r) { ja[r.pessoaId + '|' + fmt.norm(r.desc)] = true; });

    var mapa = {};
    s.lancamentos.forEach(function (l) {
      if (l.tipo !== 'gasto' || l.parcela || l.terceiroId || l.recorrenteId || meses.indexOf(l.mes) < 0) return;
      var k = l.pessoaId + '|' + fmt.norm(l.desc);
      if (ja[k]) return;
      var m = mapa[k] = mapa[k] || { meses: {}, ultimo: null, valores: [] };
      m.meses[l.mes] = true;
      m.valores.push(Math.abs(Number(l.valor) || 0));
      if (!m.ultimo || l.mes >= m.ultimo.mes) m.ultimo = l;
    });

    /* assinatura tem valor estável: combustível e lanche se repetem, mas variam */
    function estavel(vals) {
      var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
      return min > 0 && max / min <= 1.25;
    }

    return Object.keys(mapa)
      .filter(function (k) { return Object.keys(mapa[k].meses).length >= 3 && estavel(mapa[k].valores); })
      .map(function (k) {
        var l = mapa[k].ultimo;
        return { desc: l.desc, valor: l.valor, pessoaId: l.pessoaId, metodo: l.metodo, cartaoId: l.cartaoId,
                 categoriaId: l.categoriaId, meses: Object.keys(mapa[k].meses).length, ultimaVez: l.mes };
      })
      .sort(function (a, b) { return b.valor - a.valor; });
  }

  /* ---------------------------- previsao de faturas ---------------------------- */

  /**
   * Quanto vai cair em cada mes: o que ja esta lancado (parcelas, compras com
   * data futura) + assinaturas previstas.
   *   filtro.pessoaId / filtro.cartaoId
   *   filtro.tudo = true inclui debito/Pix (carne, boleto, assinatura no debito);
   *                 senao so o que entra na fatura do cartao
   */
  function previsaoFaturas(s, meses, filtro) {
    filtro = filtro || {};
    return meses.map(function (mes) {
      var itens = doMes(s, mes).concat(previstos(s, mes)).filter(function (l) {
        if (l.tipo !== 'gasto') return false;
        if (!filtro.tudo && !ehCredito(l)) return false;
        if (filtro.pessoaId && l.pessoaId !== filtro.pessoaId) return false;
        if (filtro.cartaoId && l.cartaoId !== filtro.cartaoId) return false;
        return true;
      });
      var tipoDe = function (l) {
        if (l.parcela) return 'parcela';
        if (l.recorrenteId || l.previsto) return 'assinatura';
        return 'avulso';
      };
      var soma = function (t) {
        return fmt.sumBy(itens.filter(function (l) { return tipoDe(l) === t; }), function (l) { return l.valor; });
      };
      var r = {
        mes: mes,
        rotulo: fmt.monthLabel(mes, true),
        parcelas: soma('parcela'),
        assinaturas: soma('assinatura'),
        avulsos: soma('avulso'),
        itens: itens.map(function (l) { return Object.assign({ tipoPrev: tipoDe(l) }, l); })
          .sort(function (a, b) { return b.valor - a.valor; })
      };
      r.total = round2(r.parcelas + r.assinaturas + r.avulsos);
      return r;
    });
  }

  /** Parcelas que ainda vao cair nos proximos meses */
  function parcelasFuturas(s, mes) {
    var lista = s.lancamentos.filter(function (l) {
      return l.tipo === 'gasto' && l.parcela && l.mes > mes;
    });
    var porMes = {};
    lista.forEach(function (l) {
      porMes[l.mes] = round2((porMes[l.mes] || 0) + (Number(l.valor) || 0));
    });
    return {
      total: fmt.sumBy(lista, function (l) { return l.valor; }),
      qtd: lista.length,
      porMes: porMes,
      itens: lista.sort(function (a, b) { return a.mes < b.mes ? -1 : 1; })
    };
  }

  /* ---------------------------- comparacoes ---------------------------- */

  function variacao(atual, anterior) {
    if (!anterior) return { pct: null, dir: 'flat', dif: round2(atual) };
    var dif = round2(atual - anterior);
    var pct = (dif / Math.abs(anterior)) * 100;
    return { pct: pct, dif: dif, dir: dif > 0.005 ? 'up' : (dif < -0.005 ? 'down' : 'flat') };
  }

  /** Media de gasto dos ultimos n meses (sem contar o mes corrente) */
  function mediaGastos(s, mes, n) {
    var meses = fmt.lastMonths(fmt.addMonths(mes, -1), n || 3);
    var vals = meses.map(function (m) { return resumoCasal(s, m).gastos; })
                    .filter(function (v) { return v > 0; });
    if (!vals.length) return 0;
    return round2(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
  }

  /** Meses que ja tem algum lancamento, do mais novo para o mais velho */
  function mesesComDados(s) {
    var set = {};
    s.lancamentos.forEach(function (l) { set[l.mes] = true; });
    s.movimentos.forEach(function (m) { set[fmt.monthKey(m.data)] = true; });
    var arr = Object.keys(set).sort();
    if (!arr.length) arr = [fmt.thisMonth()];
    return arr.reverse();
  }

  FC.model = {
    METODOS: METODOS, nomeMetodo: nomeMetodo,
    pessoa: pessoa, nomePessoa: nomePessoa,
    categoria: categoria, nomeCategoria: nomeCategoria, corCategoria: corCategoria,
    terceiro: terceiro, nomeTerceiro: nomeTerceiro,
    cartao: cartao, investimento: investimento,
    doMes: doMes, ateOMes: ateOMes, daPessoa: daPessoa,
    ehGastoProprio: ehGastoProprio, ehTerceiro: ehTerceiro, ehCredito: ehCredito, ehCaixa: ehCaixa,
    paineis: paineis, resumoPessoa: resumoPessoa, resumoCasal: resumoCasal,
    saldoEmConta: saldoEmConta, totalInvestido: totalInvestido,
    faturaEmAberto: faturaEmAberto, aReceberTotal: aReceberTotal, porTerceiro: porTerceiro,
    patrimonio: patrimonio,
    serieMensal: serieMensal, seriePatrimonio: seriePatrimonio, serieInvestido: serieInvestido,
    porCategoria: porCategoria, maioresGastos: maioresGastos, porDia: porDia,
    saldoInvestimento: saldoInvestimento, carteira: carteira, movimentosDoMes: movimentosDoMes,
    gerarParcelas: gerarParcelas, irmaosDaParcela: irmaosDaParcela, parcelasFuturas: parcelasFuturas,
    dataMaisMeses: dataMaisMeses, parcelamentos: parcelamentos, parcelasIncompletas: parcelasIncompletas,
    completarParcelas: completarParcelas, parcelasAVencer: parcelasAVencer,
    recorrente: recorrente, recorrenteAtivo: recorrenteAtivo, previstos: previstos, materializar: materializar,
    sugestoesAssinaturas: sugestoesAssinaturas, previsaoFaturas: previsaoFaturas,
    variacao: variacao, mediaGastos: mediaGastos, mesesComDados: mesesComDados
  };
})(typeof self !== 'undefined' ? self : this);
