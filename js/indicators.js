/* ==========================================================================
   indicators.js — Selic e dolar

   Tenta atualizar em fontes publicas e gratuitas:
     Selic  -> Banco Central, serie 432 do SGS (meta Selic)
     Dolar  -> AwesomeAPI (cotacao comercial)

   Se a rede falhar (offline, CORS ao abrir por file://), mantem os valores
   guardados e mostra a data a que se referem. Nunca inventa numero.
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var fmt = FC.fmt;

  var URL_SELIC = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json';
  var URL_DOLAR = 'https://economia.awesomeapi.com.br/json/last/USD-BRL';

  function buscarJSON(url, ms) {
    if (!root.fetch) return Promise.reject(new Error('sem fetch'));
    var ctrl = root.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 7000);

    return root.fetch(url, { signal: ctrl ? ctrl.signal : undefined, cache: 'no-store' })
      .then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function (e) { clearTimeout(t); throw e; });
  }

  function buscarSelic() {
    return buscarJSON(URL_SELIC).then(function (dados) {
      if (!Array.isArray(dados) || !dados.length) throw new Error('resposta vazia');
      var d = dados[dados.length - 1];
      var v = parseFloat(String(d.valor).replace(',', '.'));
      if (!isFinite(v)) throw new Error('valor inválido');
      var p = String(d.data || '').split('/');
      return {
        valor: v,
        em: p.length === 3 ? (p[2] + '-' + p[1] + '-' + p[0]) : fmt.todayISO(),
        fonte: 'Banco Central (SGS 432)'
      };
    });
  }

  function buscarDolar() {
    return buscarJSON(URL_DOLAR).then(function (dados) {
      var d = dados && (dados.USDBRL || dados['USD-BRL']);
      if (!d) throw new Error('resposta inesperada');
      var v = parseFloat(d.bid);
      if (!isFinite(v)) throw new Error('valor inválido');
      var em = fmt.todayISO();
      if (d.create_date) em = String(d.create_date).slice(0, 10);
      else if (d.timestamp) em = fmt.isoOf(new Date(parseInt(d.timestamp, 10) * 1000));
      return { valor: v, em: em, fonte: 'AwesomeAPI', variacao: parseFloat(d.pctChange) || 0 };
    });
  }

  /**
   * Atualiza os indicadores no cofre. Nunca rejeita: devolve o que conseguiu.
   * @returns Promise<{selic:bool, dolar:bool, erro:string|null}>
   */
  function atualizar() {
    var s = FC.store.get();
    if (!s) return Promise.resolve({ selic: false, dolar: false, erro: 'sem sessão' });

    var res = { selic: false, dolar: false, erro: null };

    return Promise.all([
      buscarSelic().then(function (r) {
        FC.store.atualizar(function (st) {
          st.educacao.indicadores.selic = r;
          st.educacao.indicadores.cdi = {
            valor: Math.round((r.valor - 0.1) * 100) / 100,
            em: r.em,
            fonte: 'aproximação: Selic − 0,10 p.p.'
          };
          st.educacao.indicadores.poupanca = r.valor > 8.5
            ? { valor: 6.17, em: r.em, fonte: 'regra: 0,5% a.m. + TR (Selic acima de 8,5%)' }
            : { valor: Math.round(r.valor * 0.7 * 100) / 100, em: r.em, fonte: 'regra: 70% da Selic + TR' };
        }, true);
        res.selic = true;
      }).catch(function (e) { res.erro = e.message; }),

      buscarDolar().then(function (r) {
        FC.store.atualizar(function (st) { st.educacao.indicadores.dolar = r; }, true);
        res.dolar = true;
      }).catch(function (e) { res.erro = res.erro || e.message; })
    ]).then(function () {
      if (res.selic || res.dolar) {
        FC.store.atualizar(function (st) {
          st.educacao.indicadores.atualizadoEm = new Date().toISOString();
        });
      }
      return res;
    });
  }

  /** Atualiza no maximo uma vez a cada 6 horas */
  function atualizarSeVelho() {
    var s = FC.store.get();
    if (!s) return Promise.resolve(null);
    var em = s.educacao.indicadores.atualizadoEm;
    if (em && (Date.now() - new Date(em).getTime()) < 6 * 3600 * 1000) {
      return Promise.resolve(null);
    }
    return atualizar();
  }

  /** Dica do dia (gira sozinha a cada dia) */
  function dicaDoDia() {
    var s = FC.store.get();
    if (!s || !s.educacao.dicas.length) return null;
    var dias = Math.floor(Date.now() / 86400000);
    var i = dias % s.educacao.dicas.length;
    return s.educacao.dicas[i];
  }

  function dicaSeguinte() {
    var s = FC.store.get();
    if (!s || !s.educacao.dicas.length) return null;
    var i = ((s.educacao.dicaDoDia || 0) + 1) % s.educacao.dicas.length;
    FC.store.atualizar(function (st) { st.educacao.dicaDoDia = i; }, true);
    return s.educacao.dicas[i];
  }

  function dicaAtual() {
    var s = FC.store.get();
    if (!s || !s.educacao.dicas.length) return null;
    var i = s.educacao.dicaDoDia;
    if (i == null) {
      var dias = Math.floor(Date.now() / 86400000);
      i = dias % s.educacao.dicas.length;
    }
    return s.educacao.dicas[i % s.educacao.dicas.length];
  }

  FC.indicadores = {
    atualizar: atualizar,
    atualizarSeVelho: atualizarSeVelho,
    buscarSelic: buscarSelic,
    buscarDolar: buscarDolar,
    dicaDoDia: dicaDoDia,
    dicaSeguinte: dicaSeguinte,
    dicaAtual: dicaAtual
  };
})(typeof self !== 'undefined' ? self : this);
