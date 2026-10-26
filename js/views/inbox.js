/* ==========================================================================
   views/inbox.js — caixa de entrada: mensagens viram lancamentos
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var d = FC.dom, h = d.h, ic = d.ic, fmt = FC.fmt, ui = FC.ui;

  function render(raiz, ctx) {
    var s = FC.store.get();
    var pendentes = FC.sync.pendentes();
    var ctxParser = FC.sync.contextoParser();

    var tela = h('div', { 'data-accent': s.config.acentoCasal || 'oceano' });

    tela.appendChild(h('div.page-head',
      h('div.page-head__t',
        h('h1', 'Caixa de entrada'),
        h('span.page-head__sub',
          pendentes.length
            ? pendentes.length + (pendentes.length === 1 ? ' mensagem esperando' : ' mensagens esperando')
            : 'nada esperando conferência')
      ),
      h('div.page-head__actions',
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: colarTexto },
          ic('whats'), 'Colar mensagem'),
        FC.sync.configurado()
          ? h('button.btn.btn--sm', {
              type: 'button',
              onclick: function (e) {
                var b = e.currentTarget;
                d.mount(b, h('span.spinner'));
                FC.sync.sincronizar().then(function (r) {
                  ui.toast(r.novos ? r.novos + ' mensagens trazidas.' : 'Nada novo na fila.', 'ok');
                  FC.app.redesenhar();
                }).catch(function (e2) {
                  ui.toast(e2.message, 'err');
                  FC.app.redesenhar();
                });
              }
            }, ic('sync'), 'Buscar no bot')
          : h('button.btn.btn--ghost.btn--sm', {
              type: 'button', onclick: function () { FC.app.irPara('#/config'); }
            }, ic('gear'), 'Configurar bot')
      )
    ));

    if (!pendentes.length) {
      tela.appendChild(h('div.card',
        ui.vazio({
          titulo: 'Tudo conferido',
          icone: 'check',
          texto: 'As mensagens que chegam pelo WhatsApp aparecem aqui para vocês conferirem ' +
                 'antes de entrar no painel.',
          acao: h('button.btn.btn--sm', { type: 'button', onclick: colarTexto },
            ic('whats'), 'Colar uma mensagem')
        })
      ));
      tela.appendChild(cardAjuda());
      d.mount(raiz, tela);
      return;
    }

    /* só entram na ação em massa as mensagens que não deixam dúvida */
    var prontos = pendentes.filter(function (it) {
      var r = interpretarItem(it, ctxParser);
      if (!r.ok) return false;
      if (r.tipo === 'aporte' || r.tipo === 'resgate') return !!r.investimentoId;
      if (r.tipo === 'ajuda' || r.tipo === 'saldo') return false;
      return !!r.pessoaId;
    });

    if (prontos.length > 1) {
      tela.appendChild(h('div.note.note--ok', ic('check'),
        h('div.grow',
          h('strong.note__title', prontos.length + ' mensagens estão completas'),
          'Têm valor, descrição e a pessoa identificada.'),
        h('button.btn.btn--sm', {
          type: 'button',
          onclick: function () {
            var n = 0;
            prontos.forEach(function (it) {
              var r = interpretarItem(it, ctxParser);
              if (gravar(r, it)) n++;
            });
            ui.toast(n + ' lançamentos criados.', 'ok');
            FC.app.redesenhar();
            FC.app.atualizarBadge();
          }
        }, 'Confirmar todas')
      ));
    }

    tela.appendChild(h('div.col.mt-4', { style: { gap: 'var(--sp-3)' } },
      pendentes.map(function (it) { return cartaoMensagem(s, it, ctxParser); })
    ));

    tela.appendChild(cardAjuda());
    d.mount(raiz, tela);
  }

  /* ---------------------------- interpretacao de cada mensagem ---------------------------- */

  /**
   * Interpreta a mensagem como ela era QUANDO FOI ENVIADA:
   *   - "hoje"/"ontem" contam a partir do dia do envio, não do dia em que
   *     vocês abrem o site para confirmar;
   *   - se o texto não diz de quem é, usa quem mandou (cada um escreve do
   *     próprio celular, então o remetente já responde isso).
   */
  function interpretarItem(item, ctxBase) {
    var ctx = Object.assign({}, ctxBase);
    if (item.em && !isNaN(new Date(item.em))) ctx.hoje = fmt.isoOf(new Date(item.em));

    var r = FC.parser.interpretar(item.texto, ctx);
    var ehInvest = r.tipo === 'aporte' || r.tipo === 'resgate';

    if (r.ok && !r.pessoaId && !ehInvest && item.nomeDe) {
      var p = pessoaPeloRemetente(item.nomeDe);
      if (p) {
        r.pessoaId = p.id;
        r.pessoaTexto = p.apelido || p.nome;
        r.pessoaPeloRemetente = true;
        r.avisos = (r.avisos || []).filter(function (a) { return a.indexOf('Sem nome') < 0; });
      }
    }
    return r;
  }

  /** "Enzo Vasconcelos" ou "enzo" acham a pessoa Enzo; emoji e acento não atrapalham */
  function pessoaPeloRemetente(nomeDe) {
    var s = FC.store.get();
    var alvo = fmt.norm(nomeDe).replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/)[0];
    if (!alvo) return null;
    for (var i = 0; i < s.casal.pessoas.length; i++) {
      var p = s.casal.pessoas[i];
      var primeiro = fmt.norm(p.nome).split(/\s+/)[0];
      if (alvo === primeiro || (p.apelido && alvo === fmt.norm(p.apelido))) return p;
    }
    return null;
  }

  /* ---------------------------- cartao de cada mensagem ---------------------------- */

  function cartaoMensagem(s, item, ctxParser) {
    var r = interpretarItem(item, ctxParser);

    var quando = item.em ? fmt.stampBR(item.em) : '';
    var deQuem = item.nomeDe || item.de || 'WhatsApp';

    if (!r.ok || r.tipo === 'ajuda' || r.tipo === 'saldo') {
      return h('div.card',
        h('div.row.row--between',
          h('div.row',
            ic(item.origem === 'whatsapp' ? 'whats' : 'file'),
            h('div',
              h('div', { style: { fontWeight: '620' } }, '"' + fmt.truncate(item.texto, 60) + '"'),
              h('div.dim', { style: { fontSize: 'var(--fs-xs)' } }, deQuem + ' · ' + quando)
            )
          ),
          h('button.btn.btn--ghost.btn--sm', {
            type: 'button',
            onclick: function () { FC.sync.descartar(item.id); FC.app.redesenhar(); FC.app.atualizarBadge(); }
          }, 'Descartar')
        ),
        h('div.note.note--warn.mt-2', ic('alert'),
          h('div', r.erro || 'Isso parece um comando, não um lançamento. Pode descartar.'))
      );
    }

    var ehInvest = r.tipo === 'aporte' || r.tipo === 'resgate';

    var chips = [];
    if (r.pessoaTexto) {
      var p = FC.model.pessoa(s, r.pessoaId);
      chips.push(h('span.chip.chip--dot', {
        style: { '--chip-color': p ? ui.corDoAcento(p.acento) : 'var(--accent)' }
      }, r.pessoaTexto));
    } else if (!ehInvest) {
      chips.push(h('span.chip.chip--warn', ic('alert', 'ico--sm'), 'sem pessoa'));
    }
    if (r.metodo) chips.push(h('span.chip', FC.parser.NOME_METODO[r.metodo] || r.metodo));
    if (r.categoriaTexto) chips.push(h('span.chip.chip--dot', {
      style: { '--chip-color': r.categoriaId ? FC.model.corCategoria(s, r.categoriaId) : 'var(--text-3)' }
    }, r.categoriaTexto));
    if (r.terceiroTexto) chips.push(h('span.chip.chip--warn', ic('handCoins', 'ico--sm'), r.terceiroTexto));
    if (r.parcela) chips.push(h('span.chip', r.parcela.n + '/' + r.parcela.de));
    chips.push(h('span.chip', fmt.dateBR(r.dataISO)));

    var corValor = r.tipo === 'receita' || r.tipo === 'aporte' ? 'var(--pos)' :
                   (r.tipo === 'resgate' ? 'var(--warn)' : 'var(--text)');

    var rotuloTipo = {
      gasto: 'Gasto', receita: 'Entrada', aporte: 'Aporte', resgate: 'Resgate'
    }[r.tipo] || r.tipo;

    /* seletor de pessoa quando o bot não identificou */
    var selPessoa = null;
    if (!r.pessoaId && !ehInvest) {
      selPessoa = h('select.select', { style: { height: '34px', maxWidth: '190px' } },
        h('option', { value: '' }, 'De quem é?'),
        s.casal.pessoas.map(function (pp) {
          return h('option', { value: pp.id }, pp.apelido || pp.nome);
        })
      );
    }

    /* seletor de investimento quando o nome citado não bate com nenhum */
    var selInvest = null;
    if (ehInvest && !r.investimentoId) {
      selInvest = h('select.select', { style: { height: '34px', maxWidth: '230px' } },
        h('option', { value: '' }, 'Em qual investimento?'),
        s.investimentos.map(function (iv) {
          return h('option', { value: iv.id }, iv.nome);
        })
      );
    }

    return h('div.card',
      h('div.row.row--between', { style: { alignItems: 'flex-start', gap: 'var(--sp-3)' } },
        h('div.grow', { style: { minWidth: 0 } },
          h('div.row', { style: { gap: 'var(--sp-2)' } },
            h('span.chip.chip--info', ic(item.origem === 'whatsapp' ? 'whats' : 'file', 'ico--sm'), rotuloTipo),
            h('span.dim', { style: { fontSize: 'var(--fs-xs)' } }, deQuem + ' · ' + quando)
          ),
          h('div', {
            style: { fontSize: 'var(--fs-lg)', fontWeight: '650', marginTop: '6px' }
          }, r.descricao),
          h('div.row.wrap.mt-2', { style: { gap: '5px' } }, chips),
          h('div.dim', { style: { fontSize: 'var(--fs-xs)', marginTop: '8px', fontStyle: 'italic' } },
            '"' + item.texto + '"')
        ),
        h('div', { style: { textAlign: 'right', flex: 'none' } },
          h('div.num', {
            style: { fontSize: 'var(--fs-xl)', fontWeight: '700', color: corValor }
          }, fmt.brl(r.valor))
        )
      ),

      r.avisos && r.avisos.length
        ? h('div.note.note--warn.mt-2', ic('info'), h('div', r.avisos.join(' ')))
        : null,

      h('div.row.wrap.mt-4', { style: { gap: 'var(--sp-2)' } },
        selPessoa,
        selInvest,
        h('div.grow'),
        h('button.btn.btn--ghost.btn--sm', {
          type: 'button',
          onclick: function () {
            FC.sync.descartar(item.id);
            FC.app.redesenhar();
            FC.app.atualizarBadge();
          }
        }, 'Descartar'),
        h('button.btn.btn--soft.btn--sm', {
          type: 'button',
          onclick: function () { abrirNoFormulario(r, item); }
        }, ic('pencil'), 'Revisar'),
        h('button.btn.btn--sm', {
          type: 'button',
          onclick: function () {
            if (selPessoa && selPessoa.value) r.pessoaId = selPessoa.value;
            if (selInvest && selInvest.value) r.investimentoId = selInvest.value;
            if (!r.pessoaId && !ehInvest) {
              ui.toast('Diga de quem é o gasto.', 'err');
              if (selPessoa) selPessoa.focus();
              return;
            }
            if (ehInvest && !r.investimentoId) {
              ui.toast('Escolha o investimento.', 'err');
              if (selInvest) selInvest.focus();
              return;
            }
            if (gravar(r, item)) {
              ui.toast('Lançado: ' + fmt.brl(r.valor), 'ok');
              FC.app.redesenhar();
              FC.app.atualizarBadge();
            }
          }
        }, ic('check'), 'Confirmar')
      )
    );
  }

  /* ---------------------------- gravar ---------------------------- */

  function gravar(r, item) {
    var s = FC.store.get();

    if (r.tipo === 'aporte' || r.tipo === 'resgate') {
      var invId = r.investimentoId;
      if (!invId) {
        ui.toast(
          s.investimentos.length
            ? 'Escolha em qual investimento entra esse valor.'
            : 'Cadastre o investimento antes de registrar o aporte.',
          'err', 5000
        );
        return false;
      }
      FC.store.atualizar(function (st) {
        st.movimentos.push({
          id: fmt.uid('mov'),
          investimentoId: invId,
          tipo: r.tipo,
          data: r.dataISO,
          valor: r.valor,
          obs: item ? 'Pelo WhatsApp: ' + item.texto : '',
          origem: 'whatsapp',
          criadoEm: new Date().toISOString()
        });
      }, true);
      if (item) FC.sync.marcarAceito(item.id);
      return true;
    }

    /* categoria: cria se veio um nome novo do interpretador */
    var categoriaId = r.categoriaId;
    if (!categoriaId && r.categoriaTexto) {
      var achou = null;
      s.categorias.forEach(function (c) {
        if (fmt.norm(c.nome) === fmt.norm(r.categoriaTexto)) achou = c.id;
      });
      categoriaId = achou;
    }

    /* terceiro: cria se veio um nome novo */
    var terceiroId = r.terceiroId;
    if (!terceiroId && r.terceiroTexto) {
      var novoT = { id: fmt.uid('ter'), nome: fmt.titleCase(r.terceiroTexto), obs: 'criado pelo WhatsApp' };
      FC.store.atualizar(function (st) { st.terceiros.push(novoT); }, true);
      terceiroId = novoT.id;
    }

    var metodo = r.metodo || (r.tipo === 'receita' ? 'pix' : 'debito');
    var mes = metodo === 'credito' && r.tipo === 'gasto'
      ? mesDaFatura(s, r.pessoaId, r.dataISO)
      : fmt.monthKey(r.dataISO);

    var base = {
      id: fmt.uid('lan'),
      tipo: r.tipo === 'receita' ? 'receita' : 'gasto',
      data: r.dataISO,
      mes: mes,
      desc: r.descricao,
      valor: r.valor,
      pessoaId: r.pessoaId,
      metodo: metodo,
      cartaoId: cartaoDe(s, r.pessoaId, metodo),
      categoriaId: categoriaId,
      terceiroId: terceiroId,
      pago: false,
      reembolsado: false,
      parcela: null,
      obs: item ? 'Pelo WhatsApp: ' + item.texto : '',
      origem: 'whatsapp',
      criadoEm: new Date().toISOString()
    };

    FC.store.atualizar(function (st) {
      if (r.parcela && r.parcela.de > 1 && metodo === 'credito') {
        /* a mensagem diz "4/4": lanca as que faltam a partir desta */
        var restantes = r.parcela.de - r.parcela.n + 1;
        var grupoId = fmt.uid('grp');
        for (var i = 0; i < restantes; i++) {
          var p = Object.assign({}, base);
          p.id = fmt.uid('lan');
          p.mes = fmt.addMonths(mes, i);
          p.parcela = { n: r.parcela.n + i, de: r.parcela.de, grupoId: grupoId };
          st.lancamentos.push(p);
        }
      } else {
        st.lancamentos.push(base);
      }
    }, true);

    if (item) FC.sync.marcarAceito(item.id);
    return true;
  }

  function cartaoDe(s, pessoaId, metodo) {
    if (metodo !== 'credito') return null;
    for (var i = 0; i < s.cartoes.length; i++) {
      if (s.cartoes[i].pessoaId === pessoaId) return s.cartoes[i].id;
    }
    return null;
  }

  function mesDaFatura(s, pessoaId, dataISO) {
    var mes = fmt.monthKey(dataISO);
    var c = null;
    for (var i = 0; i < s.cartoes.length; i++) {
      if (s.cartoes[i].pessoaId === pessoaId) { c = s.cartoes[i]; break; }
    }
    if (!c || !c.fechamento) return mes;
    var dia = parseInt(String(dataISO).slice(8, 10), 10);
    return dia > c.fechamento ? fmt.addMonths(mes, 1) : mes;
  }

  function abrirNoFormulario(r, item) {
    FC.sync.marcarAceito(item.id);
    if (r.tipo === 'aporte' || r.tipo === 'resgate') {
      FC.forms.movimento({ tipo: r.tipo, investimentoId: r.investimentoId });
    } else {
      FC.forms.lancamento({
        tipo: r.tipo === 'receita' ? 'receita' : 'gasto',
        valor: r.valor,
        desc: r.descricao,
        pessoaId: r.pessoaId || undefined,
        metodo: r.metodo || 'debito',
        categoriaId: r.categoriaId || undefined,
        terceiroId: r.terceiroId || undefined,
        mes: fmt.monthKey(r.dataISO)
      });
    }
    FC.app.atualizarBadge();
  }

  /* ---------------------------- colar texto ---------------------------- */

  function colarTexto() {
    var area = h('textarea.textarea', {
      placeholder: '35,90 mercado\n89,90 farmacia credito\nenzo 150 combustivel debito',
      style: { minHeight: '150px', fontFamily: 'var(--font-num)' },
      autofocus: true
    });

    ui.modal({
      titulo: 'Colar mensagens',
      sub: 'uma por linha',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        h('div.note', ic('info'),
          h('div', 'Funciona sem servidor nenhum: copie a conversa do WhatsApp, cole aqui e ' +
                   'confira antes de virar lançamento.')),
        area
      ),
      acoes: function (c) {
        return [
          h('div.grow'),
          h('button.btn.btn--ghost', { type: 'button', onclick: function () { c.fechar(); } }, 'Cancelar'),
          h('button.btn', {
            type: 'button',
            onclick: function () {
              var n = FC.sync.adicionarTextoLocal(area.value);
              c.fechar();
              if (n) {
                ui.toast(n + (n === 1 ? ' mensagem adicionada.' : ' mensagens adicionadas.'), 'ok');
                FC.app.irPara('#/caixa');
                FC.app.atualizarBadge();
              } else {
                ui.toast('Nada para adicionar.', 'info');
              }
            }
          }, ic('check'), 'Adicionar')
        ];
      }
    });
  }

  /* ---------------------------- ajuda ---------------------------- */

  function cardAjuda() {
    var exemplos = [
      { txt: '35,90 mercado', o: 'gasto simples, no débito' },
      { txt: 'gastei 89,90 na farmacia no credito', o: 'com forma de pagamento' },
      { txt: 'enzo 150 combustivel debito', o: 'dizendo de quem é' },
      { txt: '461,24 terno casamento credito 4/4', o: 'compra parcelada' },
      { txt: '39,90 notebook credito @pai', o: 'cartão emprestado para alguém' },
      { txt: 'recebi 4518,74 salario', o: 'entrada de dinheiro' },
      { txt: 'aporte 500 tesouro selic', o: 'investimento' },
      { txt: 'ontem 25 uber', o: 'outra data' }
    ];

    return h('div.card.mt-4',
      h('div.card__head',
        h('div',
          h('div.card__title', 'Como escrever a mensagem'),
          h('div.card__sub', 'vale no WhatsApp e no "colar mensagem"')
        )
      ),
      h('div.tablewrap',
        h('table.tbl',
          h('tbody', exemplos.map(function (e) {
            return h('tr',
              h('td', h('code', {
                style: {
                  background: 'var(--surface-3)', padding: '3px 8px',
                  borderRadius: '6px', fontSize: 'var(--fs-sm)'
                }
              }, e.txt)),
              h('td.dim', e.o)
            );
          }))
        )
      ),
      h('p.dim', { style: { fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-3)', lineHeight: '1.55' } },
        'A ordem das palavras não importa muito. O que o interpretador procura é o valor, ' +
        'a forma de pagamento, o nome de vocês e palavras conhecidas de categoria.')
    );
  }

  FC.viewCaixa = { render: render, colarTexto: colarTexto, gravar: gravar };
})(typeof self !== 'undefined' ? self : this);
