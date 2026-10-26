/* ==========================================================================
   sync.js — caixa de entrada do WhatsApp

   O site continua guardando tudo no proprio navegador. O servidor do bot
   e so um "correio": recebe a mensagem no WhatsApp, interpreta e deixa na
   fila. Quando o site abre, busca a fila, mostra para conferir e grava aqui.

   Contrato com o servidor (ver pasta bot/):
     GET  <url>/api/inbox?token=..&desde=..   -> { itens: [...] }
     POST <url>/api/inbox/ack   {token, ids}  -> { ok: true }
     POST <url>/api/resumo      {token, resumo} -> { ok: true }
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var fmt = FC.fmt;

  var timerPoll = null;
  var sincronizando = false;

  function config() {
    var s = FC.store.get();
    return (s && s.bot) || { url: '', token: '', ativo: false };
  }

  function configurado() {
    var c = config();
    return !!(c.ativo && c.url && c.token);
  }

  function urlBase() {
    return String(config().url || '').replace(/\/+$/, '');
  }

  function pedir(caminho, opcoes) {
    if (!root.fetch) return Promise.reject(new Error('Navegador sem fetch.'));
    var ctrl = root.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 12000);

    return root.fetch(urlBase() + caminho, Object.assign({
      signal: ctrl ? ctrl.signal : undefined,
      headers: { 'Content-Type': 'application/json' }
    }, opcoes || {})).then(function (r) {
      clearTimeout(t);
      if (r.status === 401) throw new Error('Token recusado pelo servidor.');
      if (!r.ok) throw new Error('Servidor respondeu ' + r.status + '.');
      return r.json();
    }).catch(function (e) {
      clearTimeout(t);
      if (e.name === 'AbortError') throw new Error('O servidor não respondeu a tempo.');
      throw e;
    });
  }

  /** Testa a conexao com o servidor do bot */
  function testar(url, token) {
    var base = String(url || '').replace(/\/+$/, '');
    return root.fetch(base + '/api/ping?token=' + encodeURIComponent(token))
      .then(function (r) {
        if (r.status === 401) throw new Error('Token incorreto.');
        if (!r.ok) throw new Error('Servidor respondeu ' + r.status + '.');
        return r.json();
      });
  }

  /**
   * Busca a fila e guarda na caixa local.
   * @returns Promise<{novos:number}>
   */
  function sincronizar(silencioso) {
    if (!configurado()) {
      return Promise.reject(new Error('Bot do WhatsApp não configurado.'));
    }
    if (sincronizando) return Promise.resolve({ novos: 0 });
    sincronizando = true;

    var c = config();
    var desde = c.ultimaSync ? '&desde=' + encodeURIComponent(c.ultimaSync) : '';

    return pedir('/api/inbox?token=' + encodeURIComponent(c.token) + desde)
      .then(function (resposta) {
        var itens = (resposta && resposta.itens) || [];
        var novos = 0;
        var ids = [];

        FC.store.atualizar(function (s) {
          var jaTem = {};
          s.caixa.forEach(function (x) { jaTem[x.id] = true; });

          itens.forEach(function (it) {
            if (jaTem[it.id]) return;
            s.caixa.push({
              id: it.id,
              texto: it.texto || '',
              de: it.de || '',
              nomeDe: it.nomeDe || '',
              em: it.em || new Date().toISOString(),
              origem: 'whatsapp',
              estado: 'pendente'
            });
            ids.push(it.id);
            novos++;
          });
          s.bot.ultimaSync = new Date().toISOString();
        });

        if (ids.length) {
          pedir('/api/inbox/ack', {
            method: 'POST',
            body: JSON.stringify({ token: c.token, ids: ids })
          }).catch(function () { /* se falhar, o filtro por id evita duplicar */ });
        }

        enviarResumo().catch(function () {});
        sincronizando = false;
        if (!silencioso && FC.app) FC.app.redesenhar();
        return { novos: novos };
      })
      .catch(function (e) {
        sincronizando = false;
        throw e;
      });
  }

  /** Manda um resumo curto para o bot poder responder "saldo" no WhatsApp */
  function enviarResumo() {
    if (!configurado()) return Promise.resolve();
    var s = FC.store.get();
    if (!s) return Promise.resolve();

    var mes = FC.app ? FC.app.mes() : fmt.thisMonth();
    var r = FC.model.resumoCasal(s, mes);
    var p = FC.model.patrimonio(s);

    return pedir('/api/resumo', {
      method: 'POST',
      body: JSON.stringify({
        token: config().token,
        resumo: {
          mes: fmt.monthLabel(mes),
          entradas: r.entradas,
          gastos: r.gastos,
          debito: r.debito,
          credito: r.credito,
          sobra: r.sobra,
          patrimonio: p.total,
          investido: p.investido,
          conta: p.conta,
          fatura: p.fatura,
          aReceber: p.aReceber,
          pessoas: r.porPessoa.map(function (x) {
            return { nome: x.pessoa.apelido || x.pessoa.nome, gastos: x.gastos };
          }),
          em: new Date().toISOString()
        }
      })
    });
  }

  /** Liga a busca automatica enquanto o site estiver aberto */
  function iniciarPoll() {
    pararPoll();
    if (!configurado()) return;
    timerPoll = setInterval(function () {
      if (document.hidden) return;
      sincronizar(true).then(function (r) {
        if (r.novos > 0) {
          FC.ui.toast(
            r.novos + (r.novos === 1 ? ' lançamento novo' : ' lançamentos novos') + ' no WhatsApp',
            'info', 5000,
            { texto: 'Ver', fn: function () { FC.app.irPara('#/caixa'); } }
          );
          FC.app.atualizarBadge();
        }
      }).catch(function () { /* silencioso */ });
    }, 60000);
  }

  function pararPoll() {
    if (timerPoll) { clearInterval(timerPoll); timerPoll = null; }
  }

  /* ---------------------------- caixa local ---------------------------- */

  function pendentes() {
    var s = FC.store.get();
    if (!s) return [];
    return s.caixa.filter(function (x) { return x.estado === 'pendente'; });
  }

  /** Contexto que o interpretador usa para casar nomes cadastrados */
  function contextoParser() {
    var s = FC.store.get();
    if (!s) return {};
    return {
      pessoas: s.casal.pessoas.map(function (p) {
        return { id: p.id, nome: p.nome, apelido: p.apelido };
      }),
      categorias: s.categorias.map(function (c) { return { id: c.id, nome: c.nome }; }),
      terceiros: s.terceiros.map(function (t) { return { id: t.id, nome: t.nome }; }),
      investimentos: s.investimentos.map(function (i) { return { id: i.id, nome: i.nome }; }),
      hoje: fmt.todayISO()
    };
  }

  /** Acrescenta texto colado a mao na caixa (sem precisar de servidor) */
  function adicionarTextoLocal(texto, de) {
    var linhas = String(texto || '').split(/\n+/).map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 1; });
    if (!linhas.length) return 0;

    FC.store.atualizar(function (s) {
      linhas.forEach(function (l) {
        s.caixa.push({
          id: fmt.uid('cx'),
          texto: l,
          de: de || '',
          nomeDe: de || 'Colado no site',
          em: new Date().toISOString(),
          origem: 'manual',
          estado: 'pendente'
        });
      });
    });
    return linhas.length;
  }

  function descartar(id) {
    FC.store.atualizar(function (s) {
      for (var i = 0; i < s.caixa.length; i++) {
        if (s.caixa[i].id === id) { s.caixa[i].estado = 'descartado'; break; }
      }
    });
  }

  function marcarAceito(id) {
    FC.store.atualizar(function (s) {
      for (var i = 0; i < s.caixa.length; i++) {
        if (s.caixa[i].id === id) { s.caixa[i].estado = 'aceito'; break; }
      }
    }, true);
  }

  function limparResolvidos() {
    FC.store.atualizar(function (s) {
      s.caixa = s.caixa.filter(function (x) { return x.estado === 'pendente'; });
    });
  }

  FC.sync = {
    config: config, configurado: configurado, testar: testar,
    sincronizar: sincronizar, enviarResumo: enviarResumo,
    iniciarPoll: iniciarPoll, pararPoll: pararPoll,
    pendentes: pendentes, contextoParser: contextoParser,
    adicionarTextoLocal: adicionarTextoLocal,
    descartar: descartar, marcarAceito: marcarAceito, limparResolvidos: limparResolvidos
  };
})(typeof self !== 'undefined' ? self : this);
