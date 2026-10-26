/* ==========================================================================
   views/settings.js — ajustes: pessoas, cartoes, categorias, bot, dados
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var d = FC.dom, h = d.h, ic = d.ic, fmt = FC.fmt, ui = FC.ui;

  function render(raiz, ctx) {
    var s = FC.store.get();
    var tela = h('div', { 'data-accent': s.config.acentoCasal || 'oceano' });

    tela.appendChild(h('div.page-head',
      h('div.page-head__t',
        h('h1', 'Ajustes'),
        h('span.page-head__sub', FC.store.conta().email)
      )
    ));

    tela.appendChild(h('div', { style: { marginBottom: 'var(--sp-4)' } }, secNuvem(s)));

    tela.appendChild(h('div.grid.grid--2',
      h('div.col', { style: { gap: 'var(--sp-4)' } },
        secCasal(s),
        secPessoas(s),
        secAparencia(s),
        secContas(s)
      ),
      h('div.col', { style: { gap: 'var(--sp-4)' } },
        secCartoes(s),
        secTerceiros(s),
        secCategorias(s)
      )
    ));

    tela.appendChild(h('div.grid.grid--2.mt-4',
      secBot(s),
      h('div.col', { style: { gap: 'var(--sp-4)' } },
        secDados(s),
        secSeguranca(s)
      )
    ));

    d.mount(raiz, tela);
  }

  function cartao(titulo, sub, corpo, ferramentas) {
    return h('div.card',
      h('div.card__head',
        h('div',
          h('div.card__title', titulo),
          sub ? h('div.card__sub', sub) : null
        ),
        ferramentas ? h('div.card__tools', ferramentas) : null
      ),
      corpo
    );
  }

  /* ---------------------------- casal ---------------------------- */

  function secCasal(s) {
    var inNome = h('input.input', {
      type: 'text', value: s.casal.nome, maxlength: '40',
      onchange: function () {
        var v = inNome.value.trim() || 'Nosso dinheiro';
        FC.store.atualizar(function (st) { st.casal.nome = v; });
        ui.toast('Nome atualizado.', 'ok');
      }
    });

    var paleta = h('div.swatches', FC.seed.ACENTOS.map(function (a) {
      var b = h('button.swatch', {
        type: 'button', title: a.nome,
        'aria-pressed': String(a.id === s.config.acentoCasal),
        onclick: function () {
          FC.store.atualizar(function (st) { st.config.acentoCasal = a.id; });
        }
      }, h('span.swatch__in', { style: { background: a.cor } }));
      return b;
    }));

    return cartao('O painel de vocês', 'nome e cor da aba do casal',
      h('div.col', { style: { gap: 'var(--sp-4)' } },
        ui.campo('Nome do painel', inNome),
        ui.campo('Cor da aba "Casal"', paleta)
      )
    );
  }

  /* ---------------------------- pessoas ---------------------------- */

  function secPessoas(s) {
    return cartao('As duas abas', 'nome, apelido, foto e cor',
      h('div.col', { style: { gap: 'var(--sp-2)' } },
        s.casal.pessoas.map(function (p) {
          return h('button.lock__acc', {
            type: 'button',
            onclick: function () { FC.forms.pessoa({ id: p.id }); }
          },
            ui.avatar(p),
            h('span.grow',
              h('div', { style: { fontWeight: '620' } }, p.apelido || p.nome),
              h('div.dim', { style: { fontSize: 'var(--fs-xs)' } },
                p.apelido ? p.nome : 'sem apelido')
            ),
            h('span.chip.chip--dot', { style: { '--chip-color': ui.corDoAcento(p.acento) } },
              nomeAcento(p.acento)),
            ic('chevRight')
          );
        })
      )
    );
  }

  function nomeAcento(id) {
    for (var i = 0; i < FC.seed.ACENTOS.length; i++) {
      if (FC.seed.ACENTOS[i].id === id) return FC.seed.ACENTOS[i].nome;
    }
    return id;
  }

  /* ---------------------------- aparencia ---------------------------- */

  function secAparencia(s) {
    return cartao('Aparência', null,
      h('div.col', { style: { gap: 'var(--sp-4)' } },
        ui.campo('Tema', ui.segmentado([
          { id: 'dark', nome: 'Escuro', icone: 'moon' },
          { id: 'light', nome: 'Claro', icone: 'bulb' },
          { id: 'sistema', nome: 'Do sistema', icone: 'gear' }
        ], s.config.tema, function (v) {
          FC.store.atualizar(function (st) { st.config.tema = v; }, true);
          FC.app.aplicarTema();
        }, 'seg--block')),

        ui.interruptor('Mostrar dicas de educação financeira', s.config.mostrarDicas, function (v) {
          FC.store.atualizar(function (st) { st.config.mostrarDicas = v; });
        })
      )
    );
  }

  /* ---------------------------- contas ---------------------------- */

  function secContas(s) {
    var pat = FC.model.patrimonio(s);

    return cartao('Saldo em conta', 'ponto de partida do patrimônio',
      h('div.col', { style: { gap: 'var(--sp-2)' } },
        s.contas.map(function (c) {
          var p = FC.model.pessoa(s, c.pessoaId);
          return h('button.lock__acc', {
            type: 'button',
            onclick: function () { FC.forms.saldoConta({ id: c.id }); }
          },
            h('span.lock__acc__av', ic('bank')),
            h('span.grow',
              h('div', { style: { fontWeight: '620' } }, c.nome),
              h('div.dim', { style: { fontSize: 'var(--fs-xs)' } },
                (p ? (p.apelido || p.nome) + ' · ' : '') + 'desde ' + fmt.dateBR(c.desde))
            ),
            h('span.num', { style: { fontWeight: '650' } }, fmt.brl(c.saldoInicial)),
            ic('chevRight')
          );
        }),
        h('hr.hr--soft'),
        h('div.row.row--between',
          h('span.dim', { style: { fontSize: 'var(--fs-sm)' } }, 'Saldo calculado hoje'),
          h('span.num', {
            style: { fontWeight: '700', color: pat.conta >= 0 ? 'var(--text)' : 'var(--neg)' }
          }, fmt.brl(pat.conta))
        ),
        h('p.dim', { style: { fontSize: 'var(--fs-xs)', lineHeight: '1.5' } },
          'O saldo de hoje parte do valor informado e soma as entradas, descontando o que saiu ' +
          'da conta: gastos no débito, Pix, dinheiro, pagamentos de fatura e aportes.')
      )
    );
  }

  /* ---------------------------- cartoes ---------------------------- */

  function secCartoes(s) {
    return cartao('Cartões', 'fechamento e vencimento',
      h('div.col', { style: { gap: 'var(--sp-2)' } },
        s.cartoes.length
          ? s.cartoes.map(function (c) {
              var p = FC.model.pessoa(s, c.pessoaId);
              return h('button.lock__acc', {
                type: 'button', onclick: function () { FC.forms.cartao({ id: c.id }); }
              },
                h('span.lock__acc__av', ic('card')),
                h('span.grow',
                  h('div', { style: { fontWeight: '620' } }, c.nome),
                  h('div.dim', { style: { fontSize: 'var(--fs-xs)' } },
                    (p ? (p.apelido || p.nome) + ' · ' : '') +
                    'fecha dia ' + c.fechamento + ' · vence dia ' + c.vencimento)
                ),
                ic('chevRight')
              );
            })
          : ui.vazio({ titulo: 'Nenhum cartão', icone: 'card', texto: 'Cadastre para o app saber em qual fatura a compra cai.' })
      ),
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: function () { FC.forms.cartao({}); } },
        ic('plus'), 'Novo')
    );
  }

  /* ---------------------------- terceiros ---------------------------- */

  function secTerceiros(s) {
    var resumo = FC.model.porTerceiro(s);
    var mapa = {};
    resumo.forEach(function (r) { mapa[r.id] = r; });

    return cartao('Quem usa o cartão de vocês', 'controle do que é para receber',
      h('div.col', { style: { gap: 'var(--sp-2)' } },
        s.terceiros.length
          ? s.terceiros.map(function (t) {
              var r = mapa[t.id] || { aberto: 0, itens: 0 };
              return h('button.lock__acc', {
                type: 'button', onclick: function () { FC.forms.terceiro({ id: t.id }); }
              },
                h('span.lock__acc__av', fmt.initials(t.nome)),
                h('span.grow',
                  h('div', { style: { fontWeight: '620' } }, t.nome),
                  h('div.dim', { style: { fontSize: 'var(--fs-xs)' } },
                    r.itens ? r.itens + (r.itens === 1 ? ' compra' : ' compras') : 'sem compras')
                ),
                r.aberto > 0
                  ? h('span.chip.chip--warn', fmt.brl(r.aberto))
                  : h('span.chip.chip--pos', 'em dia'),
                ic('chevRight')
              );
            })
          : ui.vazio({
              titulo: 'Ninguém cadastrado',
              icone: 'handCoins',
              texto: 'Cadastre quem costuma usar o cartão de vocês, como na coluna "Outros" da sua planilha.'
            })
      ),
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: function () { FC.forms.terceiro({}); } },
        ic('plus'), 'Nova')
    );
  }

  /* ---------------------------- categorias ---------------------------- */

  function secCategorias(s) {
    var uso = {};
    s.lancamentos.forEach(function (l) {
      if (l.categoriaId) uso[l.categoriaId] = (uso[l.categoriaId] || 0) + 1;
    });

    return cartao('Categorias', s.categorias.length + ' cadastradas',
      h('div.row.wrap', { style: { gap: 'var(--sp-2)' } },
        s.categorias.map(function (c) {
          return h('button.chip.chip-btn.chip--dot', {
            type: 'button',
            style: { '--chip-color': c.cor, height: '28px' },
            title: (uso[c.id] || 0) + ' lançamentos',
            onclick: function () { FC.forms.categoria({ id: c.id }); }
          }, c.nome);
        }),
        h('button.chip.chip-btn', {
          type: 'button', style: { height: '28px' },
          onclick: function () { FC.forms.categoria({}); }
        }, ic('plus', 'ico--sm'), 'Nova')
      )
    );
  }

  /* ---------------------------- bot do whatsapp ---------------------------- */

  function secBot(s) {
    var estado = h('div');

    var inUrl = h('input.input', {
      type: 'url', placeholder: 'https://seu-bot.exemplo.com', value: s.bot.url || ''
    });
    var inToken = h('input.input', {
      type: 'text', placeholder: 'token combinado com o servidor', value: s.bot.token || ''
    });

    function salvarBot(ativo) {
      FC.store.atualizar(function (st) {
        st.bot.url = inUrl.value.trim();
        st.bot.token = inToken.value.trim();
        if (ativo != null) st.bot.ativo = ativo;
      }, true);
    }

    var btnTestar = h('button.btn.btn--soft.btn--sm', {
      type: 'button',
      onclick: function () {
        salvarBot();
        if (!inUrl.value.trim() || !inToken.value.trim()) {
          return ui.toast('Preencha o endereço e o token.', 'err');
        }
        d.mount(btnTestar, h('span.spinner'));
        FC.sync.testar(inUrl.value.trim(), inToken.value.trim()).then(function (r) {
          d.mount(btnTestar, h('span', ic('sync'), ' Testar conexão'));
          d.mount(estado, h('div.note.note--ok', ic('check'),
            h('div', 'Servidor respondeu. ' + (r.pendentes != null ? r.pendentes + ' mensagens na fila.' : ''))));
          ui.toast('Conexão certa.', 'ok');
        }).catch(function (e) {
          d.mount(btnTestar, h('span', ic('sync'), ' Testar conexão'));
          d.mount(estado, h('div.note.note--danger', ic('alert'), h('div', e.message)));
        });
      }
    }, ic('sync'), 'Testar conexão');

    return cartao('Bot do WhatsApp', 'anotar gastos por mensagem',
      h('div.col', { style: { gap: 'var(--sp-4)' } },
        h('div.note', ic('info'),
          h('div',
            h('strong.note__title', 'Como funciona'),
            'O servidor do bot recebe a mensagem no WhatsApp, entende o que é e deixa na fila. ' +
            'Quando vocês abrem o site, ele busca a fila e mostra para conferir antes de gravar. ' +
            'Os dados continuam aqui no navegador. As instruções de instalação estão na pasta ' +
            h('code', 'bot/') + ' do projeto.')
        ),
        ui.campo('Endereço do servidor', inUrl),
        ui.campo('Token', inToken, 'O mesmo que está no arquivo .env do servidor'),
        estado,
        h('div.row.wrap',
          btnTestar,
          h('button.btn.btn--ghost.btn--sm', {
            type: 'button',
            onclick: function () {
              salvarBot();
              FC.sync.sincronizar().then(function (r) {
                ui.toast(r.novos ? r.novos + ' mensagens trazidas.' : 'Nada novo na fila.', 'ok');
                FC.app.atualizarBadge();
              }).catch(function (e) { ui.toast(e.message, 'err'); });
            }
          }, ic('inbox'), 'Buscar agora'),
          h('div.grow'),
          ui.interruptor('Ativo', s.bot.ativo, function (v) {
            salvarBot(v);
            if (v) FC.sync.iniciarPoll(); else FC.sync.pararPoll();
            ui.toast(v ? 'Bot ligado.' : 'Bot desligado.', 'ok');
          })
        ),
        s.bot.ultimaSync
          ? h('div.dim', { style: { fontSize: 'var(--fs-xs)' } },
              'Última busca: ' + fmt.stampBR(s.bot.ultimaSync))
          : null,
        h('hr.hr--soft'),
        h('button.btn.btn--ghost.btn--sm', {
          type: 'button', onclick: function () { FC.viewCaixa.colarTexto(); }
        }, ic('whats'), 'Colar mensagens à mão (sem servidor)')
      )
    );
  }

  /* ---------------------------- dados ---------------------------- */

  function secDados(s) {
    var kb = FC.store.tamanhoKB();
    var ultimo = s.meta.ultimoBackup;

    var inputArquivo = h('input', {
      type: 'file', accept: 'application/json,.json', style: { display: 'none' },
      onchange: function () {
        var f = inputArquivo.files && inputArquivo.files[0];
        if (!f) return;
        var leitor = new FileReader();
        leitor.onload = function () {
          var dados;
          try { dados = JSON.parse(leitor.result); }
          catch (e) { ui.toast('Arquivo não é um JSON válido.', 'err'); return; }
          perguntarImportacao(dados);
        };
        leitor.readAsText(f);
        inputArquivo.value = '';
      }
    });

    return cartao('Seus dados', kb + ' KB guardados neste navegador',
      h('div.col', { style: { gap: 'var(--sp-3)' } },
        h('div.note' + (ultimo ? '' : '.note--warn'), ic(ultimo ? 'info' : 'alert'),
          h('div',
            ultimo
              ? 'Último backup: ' + fmt.stampDateBR(ultimo) + '.'
              : 'Você ainda não baixou um backup. Se limpar os dados do navegador, tudo se perde.'
          )
        ),
        h('div.row.wrap',
          h('button.btn', { type: 'button', onclick: function () { FC.store.baixarBackup(); ui.toast('Backup salvo em Downloads.', 'ok'); } },
            ic('download'), 'Baixar backup (JSON)'),
          h('button.btn.btn--ghost', { type: 'button', onclick: function () { inputArquivo.click(); } },
            ic('upload'), 'Importar JSON'),
          inputArquivo
        ),
        h('p.dim', { style: { fontSize: 'var(--fs-xs)', lineHeight: '1.55' } },
          'O backup traz tudo: lançamentos, investimentos, fotos e ajustes. Guarde em um lugar ' +
          'seguro (nuvem, e-mail para você mesmo, pen drive). É o que permite levar os dados ' +
          'para outro navegador ou celular.'),
        h('hr.hr--soft'),
        h('button.btn.btn--danger-ghost.btn--sm', {
          type: 'button',
          onclick: function () {
            ui.confirmar({
              titulo: 'Apagar todos os lançamentos',
              texto: 'Isso zera lançamentos, investimentos e movimentações deste painel' +
                     (FC.nuvem.ligado() ? ', NOS DOIS APARELHOS (a sincronização leva a exclusão para o outro). ' : '. ') +
                     'As pessoas e os ajustes continuam. Não dá para desfazer.',
              ok: 'Apagar tudo', perigo: true
            }).then(function (sim) {
              if (!sim) return;
              FC.store.atualizar(function (st) {
                st.lancamentos = []; st.investimentos = []; st.movimentos = []; st.caixa = [];
              });
              ui.toast('Dados apagados.', 'ok');
            });
          }
        }, ic('trash'), 'Apagar todos os lançamentos')
      )
    );
  }

  function perguntarImportacao(dados) {
    var qtd = (dados.lancamentos || []).length;
    ui.modal({
      titulo: 'Importar backup',
      largura: 'slim',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        h('div', { style: { fontSize: 'var(--fs-md)', color: 'var(--text-2)' } },
          'O arquivo tem ' + qtd + ' lançamentos' +
          (dados._exportado ? ', exportado em ' + fmt.stampDateBR(dados._exportado.em) : '') + '.'),
        h('div.note.note--warn', ic('alert'),
          h('div', h('strong.note__title', 'Escolha com cuidado'),
            'Substituir apaga o que está aqui. Juntar mantém o atual e acrescenta o que faltar.'))
      ),
      acoes: function (c) {
        return [
          h('div.grow'),
          h('button.btn.btn--ghost', {
            type: 'button',
            onclick: function () {
              try {
                var r = FC.store.importar(dados, 'juntar');
                c.fechar();
                ui.toast('Importado: ' + r.lancamentos + ' lançamentos novos.', 'ok');
                FC.app.redesenhar();
              } catch (e) { ui.toast(e.message, 'err'); }
            }
          }, 'Juntar'),
          h('button.btn.btn--danger', {
            type: 'button',
            onclick: function () {
              try {
                FC.store.importar(dados, 'substituir');
                c.fechar();
                ui.toast('Dados substituídos.', 'ok');
                FC.app.redesenhar();
              } catch (e) { ui.toast(e.message, 'err'); }
            }
          }, 'Substituir tudo')
        ];
      }
    });
  }

  /* ---------------------------- seguranca ---------------------------- */

  /* ---------------------------- sincronização ---------------------------- */

  function secNuvem(s) {
    var st = FC.nuvem.status();
    var cfg = FC.nuvem.config();

    if (!st.configurado) {
      return cartao('Sincronização entre aparelhos', 'desligada',
        h('div.col', { style: { gap: 'var(--sp-3)' } },
          h('div.note.note--warn', ic('alert'), h('div',
            h('strong.note__title', 'Cada aparelho está com os próprios dados'),
            'Para os dois celulares verem o mesmo painel, ligue a sincronização: crie um projeto ' +
            'gratuito no Firebase e preencha o arquivo ', h('code', 'js/nuvem-config.js'),
            '. O passo a passo está em ', h('code', 'docs/SINCRONIZACAO.md'), ' (uns 10 minutos).')),
          h('details',
            h('summary', { style: { cursor: 'pointer', fontSize: 'var(--fs-sm)', color: 'var(--text-2)' } },
              'Testar neste aparelho sem publicar (colar a configuração aqui)'),
            formConfigLocal(cfg))
        ));
    }

    var ligado = st.ligado;
    var rotulo = { ok: 'sincronizado', sincronizando: 'sincronizando…', offline: 'sem internet', erro: 'com erro',
                   reentrar: 'precisa entrar de novo', desligado: 'parado' }[st.estado] || st.estado;

    if (!ligado) {
      var inSenha = h('input.input', { type: 'password', placeholder: 'Senha deste painel', autocomplete: 'current-password' });
      var btn = h('button.btn', {
        type: 'button',
        onclick: function () {
          d.mount(btn, h('span.spinner'));
          FC.nuvem.ativar(inSenha.value).then(function () {
            ui.toast('Sincronização ligada.', 'ok');
            FC.app.redesenhar();
          }).catch(function (e) {
            d.mount(btn, h('span', ic('sync'), ' Ligar'));
            ui.toast(e.message, 'err', 7000);
          });
        }
      }, ic('sync'), 'Ligar');
      return cartao('Sincronização entre aparelhos', 'projeto ' + cfg.projectId,
        h('div.col', { style: { gap: 'var(--sp-3)' } },
          h('div', { style: { fontSize: 'var(--fs-sm)', color: 'var(--text-2)', lineHeight: '1.55' } },
            'Este painel ainda está só neste aparelho. Ao ligar, ele vai para a nuvem (criptografado) e o ' +
            'outro celular passa a entrar com o mesmo e-mail (', h('strong', FC.store.conta().email), ') e a mesma senha.'),
          h('div.row', { style: { gap: 'var(--sp-2)' } }, h('div.grow', inSenha), btn)
        ));
    }

    return cartao('Sincronização entre aparelhos', rotulo,
      h('div.col', { style: { gap: 'var(--sp-3)' } },
        st.estado === 'reentrar' || st.estado === 'erro'
          ? h('div.note.note--danger', ic('alert'), h('div', st.erro || 'Erro na sincronização.'))
          : h('div.note.note--ok', ic('check'), h('div',
              h('strong.note__title', 'Os dois aparelhos veem o mesmo painel'),
              'Mudanças sobem em segundos e o outro aparelho confere a cada 20 segundos (ou ao abrir o app). ' +
              'Sem internet, tudo continua funcionando e sobe quando a conexão voltar.')),
        h('dl.dl',
          h('dt', 'Conta'), h('dd', FC.store.conta().email),
          h('dt', 'Última sincronização'), h('dd', st.ultimo ? fmt.stampBR(st.ultimo) : '—'),
          h('dt', 'Última gravação na nuvem'), h('dd', st.dispositivoRemoto || '—'),
          h('dt', 'Versão'), h('dd', s._sync ? String(s._sync.versao) : '—')
        ),
        h('div.row.wrap', { style: { gap: 'var(--sp-2)' } },
          h('button.btn.btn--soft.btn--sm', {
            type: 'button',
            onclick: function () {
              FC.nuvem.sincronizar().then(function (ok) {
                ui.toast(ok ? 'Sincronizado.' : (FC.nuvem.status().erro || 'Não consegui agora.'), ok ? 'ok' : 'err');
                FC.app.redesenhar();
              });
            }
          }, ic('sync'), 'Sincronizar agora'),
          h('div.grow'),
          h('button.btn.btn--ghost.btn--sm', {
            type: 'button',
            onclick: function () {
              ui.confirmar({
                titulo: 'Desligar este aparelho',
                texto: 'Este aparelho para de enviar e receber mudanças. Os dados que já estão aqui continuam, ' +
                       'e a nuvem e o outro aparelho não são afetados. Dá para ligar de novo depois.',
                ok: 'Desligar'
              }).then(function (sim) {
                if (!sim) return;
                FC.nuvem.desligar();
                ui.toast('Sincronização desligada neste aparelho.', 'ok');
                FC.app.redesenhar();
              });
            }
          }, 'Desligar este aparelho')
        )
      ));
  }

  /** Configuração colada no aparelho: útil para testar antes de publicar o nuvem-config.js */
  function formConfigLocal(cfg) {
    var area = h('textarea.textarea', {
      placeholder: '{ "apiKey": "AIza...", "projectId": "financas-casal-xxxx" }',
      style: { fontFamily: 'var(--font-num)', minHeight: '90px', marginTop: 'var(--sp-2)' }
    });
    return h('div.col', { style: { gap: 'var(--sp-2)' } },
      area,
      h('button.btn.btn--soft.btn--sm', {
        type: 'button', style: { alignSelf: 'flex-start' },
        onclick: function () {
          var txt = area.value.trim();
          /* aceita o JSON ou o trecho "const firebaseConfig = {...}" do console */
          var m = txt.match(/\{[\s\S]*\}/);
          var obj = null;
          try { obj = JSON.parse(m ? m[0] : txt); } catch (e) {
            var k = txt.match(/apiKey["']?\s*:\s*["']([^"']+)/), p = txt.match(/projectId["']?\s*:\s*["']([^"']+)/);
            if (k && p) obj = { apiKey: k[1], projectId: p[1] };
          }
          if (!obj || !obj.apiKey || !obj.projectId) { ui.toast('Não achei apiKey e projectId no texto.', 'err'); return; }
          FC.nuvem.salvarConfigLocal({ apiKey: obj.apiKey, projectId: obj.projectId });
          ui.toast('Configuração salva neste aparelho.', 'ok');
          FC.app.redesenhar();
        }
      }, ic('save'), 'Salvar neste aparelho')
    );
  }

  function secSeguranca(s) {
    var temCripto = FC.cripto.temSubtle();

    return cartao('Acesso e segurança', FC.store.conta().email,
      h('div.col', { style: { gap: 'var(--sp-3)' } },
        h('button.btn.btn--ghost.btn--block', { type: 'button', onclick: trocarSenha },
          ic('key'), 'Trocar a senha'),

        h('div.row.row--between', { style: { gap: 'var(--sp-3)' } },
          h('div.grow',
            h('div', { style: { fontWeight: '620', fontSize: 'var(--fs-md)' } }, 'Criptografar os dados'),
            h('div.dim', { style: { fontSize: 'var(--fs-xs)', lineHeight: '1.5' } },
              temCripto
                ? 'Guarda tudo embaralhado no navegador. Sem a senha, nem você recupera.'
                : 'Indisponível: este navegador não expõe as funções de criptografia neste endereço.')
          ),
          temCripto
            ? ui.interruptor('', s.config.criptografado, function (v) { alternarCripto(v); })
            : null
        ),

        h('hr.hr--soft'),

        h('div.note', ic('lock'),
          h('div',
            h('strong.note__title', 'Onde ficam os dados'),
            'Tudo é guardado no armazenamento local deste navegador, neste aparelho. ' +
            'Nada é enviado para servidor nenhum. Quem abrir o site em outro aparelho ' +
            'não vê estes dados — para isso, use o backup em JSON.')
        ),

        h('div.row.wrap',
          h('button.btn.btn--soft.btn--sm', {
            type: 'button',
            onclick: function () { FC.store.sair(); FC.app.aoSair(); }
          }, ic('logout'), 'Sair'),
          h('div.grow'),
          h('button.btn.btn--danger-ghost.btn--sm', { type: 'button', onclick: apagarAcesso },
            ic('trash'), 'Apagar este acesso')
        )
      )
    );
  }

  function trocarSenha() {
    var inAtual = h('input.input', { type: 'password', autocomplete: 'current-password', autofocus: true });
    var inNova = h('input.input', { type: 'password', autocomplete: 'new-password' });
    var inNova2 = h('input.input', { type: 'password', autocomplete: 'new-password' });
    var erro = h('div.field__err');

    ui.modal({
      titulo: 'Trocar a senha',
      largura: 'slim',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        ui.campo('Senha atual', inAtual),
        ui.campo('Nova senha', inNova),
        ui.campo('Repita a nova senha', inNova2),
        erro
      ),
      acoes: function (c) {
        return [
          h('div.grow'),
          h('button.btn.btn--ghost', { type: 'button', onclick: function () { c.fechar(); } }, 'Cancelar'),
          h('button.btn', {
            type: 'button',
            onclick: function () {
              erro.textContent = '';
              if (inNova.value !== inNova2.value) { erro.textContent = 'As senhas novas não batem.'; return; }
              /* com a nuvem ligada, troca lá também (o outro aparelho vai pedir a senha nova) */
              FC.nuvem.trocarSenha(inAtual.value, inNova.value).then(function () {
                c.fechar();
                ui.toast('Senha trocada.', 'ok');
              }).catch(function (e) { erro.textContent = e.message; });
            }
          }, ic('check'), 'Trocar')
        ];
      }
    });
  }

  function alternarCripto(ligar) {
    if (!ligar) {
      FC.store.atualizar(function (st) { st.config.criptografado = false; });
      FC.store.salvarAgora();
      ui.toast('Criptografia desligada.', 'ok');
      return;
    }

    ui.confirmar({
      titulo: 'Ligar a criptografia',
      perigo: true,
      texto: 'Os dados passam a ser guardados embaralhados, abertos só com a sua senha. ' +
             'Se a senha for perdida, não existe recuperação — nem por mim, nem por ninguém. ' +
             'Baixe um backup antes de continuar.',
      ok: 'Baixar backup e ligar',
      cancelar: 'Cancelar'
    }).then(function (sim) {
      if (!sim) { FC.app.redesenhar(); return; }
      FC.store.baixarBackup();
      FC.store.atualizar(function (st) { st.config.criptografado = true; });
      FC.store.salvarAgora().then(function () {
        ui.toast('Criptografia ligada. Backup baixado.', 'ok', 6000);
      });
    });
  }

  function apagarAcesso() {
    var conta = FC.store.conta();
    var inConfirma = h('input.input', { type: 'text', placeholder: 'APAGAR', autofocus: true });

    ui.modal({
      titulo: 'Apagar este acesso',
      largura: 'slim',
      corpo: h('div.col', { style: { gap: 'var(--sp-4)' } },
        h('div.note.note--danger', ic('alert'),
          h('div', 'Some tudo deste painel: lançamentos, investimentos, fotos e ajustes. ' +
                   'Não dá para desfazer.')),
        h('div', { style: { fontSize: 'var(--fs-md)' } }, 'Conta: ', h('strong', conta.email)),
        ui.campo('Escreva APAGAR para confirmar', inConfirma)
      ),
      acoes: function (c) {
        return [
          h('div.grow'),
          h('button.btn.btn--ghost', { type: 'button', onclick: function () { c.fechar(); } }, 'Cancelar'),
          h('button.btn.btn--danger', {
            type: 'button',
            onclick: function () {
              if (fmt.norm(inConfirma.value) !== 'apagar') {
                ui.toast('Escreva APAGAR para confirmar.', 'err');
                return;
              }
              FC.store.apagarConta(conta.id);
              c.fechar();
              FC.app.aoSair();
            }
          }, ic('trash'), 'Apagar para sempre')
        ];
      }
    });
  }

  FC.viewConfig = { render: render };
})(typeof self !== 'undefined' ? self : this);
