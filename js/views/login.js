/* ==========================================================================
   views/login.js — tela de bloqueio: entrar ou criar o acesso do casal
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var d = FC.dom, h = d.h, ic = d.ic, fmt = FC.fmt, ui = FC.ui;

  var modo = 'entrar';   // 'entrar' | 'criar'
  var modoEscolhido = false;
  var ocupado = false;

  function render() {
    var corpo = d.$('#lockBody');
    var sub = d.$('#lockSub');
    if (!corpo) return;

    desenharOnda();

    var contas = FC.store.listarContas();
    var nuvem = FC.nuvem && FC.nuvem.configurado();
    /* com a nuvem, aparelho novo normalmente ENTRA num painel que já existe */
    if (!contas.length && !nuvem && !modoEscolhido) modo = 'criar';

    sub.textContent = modo === 'criar'
      ? 'Crie o acesso de vocês dois'
      : (nuvem && !contas.length ? 'Entre com o e-mail e a senha do casal' : 'Digite a senha para ver os painéis');

    d.mount(corpo, modo === 'criar' ? formCriar(contas) : formEntrar(contas));
  }

  /* ---------------------------- ENTRAR ---------------------------- */

  function formEntrar(contas) {
    var erro = h('div.field__err');

    var inEmail = h('input.input', {
      type: 'email', placeholder: 'seu@email.com', autocomplete: 'username',
      value: FC.store.ultimoEmail()
    });

    var inSenha = h('input.input', {
      type: 'password', placeholder: 'Sua senha', autocomplete: 'current-password',
      autofocus: true
    });

    var btnOlho = h('button.iconbtn.iconbtn--ghost', {
      type: 'button', tabindex: '-1', title: 'Mostrar senha',
      style: { position: 'absolute', right: '2px', top: '2px' },
      onclick: function () {
        inSenha.type = inSenha.type === 'password' ? 'text' : 'password';
        d.mount(btnOlho, ic(inSenha.type === 'password' ? 'eye' : 'eyeOff'));
        inSenha.focus();
      }
    }, ic('eye'));

    var btnEntrar = h('button.btn.btn--lg.btn--block', { type: 'submit' }, ic('unlock'), 'Entrar');

    var form = h('form.col', {
      style: { gap: 'var(--sp-4)' },
      onsubmit: function (e) {
        e.preventDefault();
        if (ocupado) return;

        var email = inEmail.value.trim();
        var senha = inSenha.value;
        if (!email || !senha) {
          erro.textContent = 'Preencha o e-mail e a senha.';
          return;
        }

        ocupado = true;
        erro.textContent = '';
        d.mount(btnEntrar, h('span.spinner'));

        FC.nuvem.entrar(email, senha).then(function () {
          FC.app.aoEntrar();
        }).catch(function (e2) {
          ocupado = false;
          erro.textContent = e2.message;
          d.mount(btnEntrar, h('span', ic('unlock'), ' Entrar'));
          inSenha.value = '';
          inSenha.focus();
          form.animate(
            [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' },
             { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }],
            { duration: 240 }
          );
        });
      }
    },
      contas.length > 1 ? h('div.lock__accounts',
        contas.map(function (c) {
          return h('button.lock__acc', {
            type: 'button',
            onclick: function () { inEmail.value = c.email; inSenha.focus(); }
          },
            h('span.lock__acc__av', fmt.initials(c.nome || c.email)),
            h('span.grow',
              h('div', { style: { fontWeight: '620' } }, c.nome || 'Painel'),
              h('div.dim', { style: { fontSize: 'var(--fs-xs)' } }, c.email)
            ),
            ic('chevRight')
          );
        })
      ) : null,

      ui.campo('E-mail', inEmail),
      ui.campo('Senha', h('div', { style: { position: 'relative' } }, inSenha, btnOlho)),
      erro,
      btnEntrar,

      h('div.lock__switch',
        'Primeira vez aqui? ',
        h('a', {
          href: '#', onclick: function (e) { e.preventDefault(); modo = 'criar'; modoEscolhido = true; render(); }
        }, 'Criar um acesso')
      )
    );

    return form;
  }

  /* ---------------------------- CRIAR ---------------------------- */

  function formCriar(contas) {
    var erro = h('div.field__err');

    var inCasal = h('input.input', { type: 'text', placeholder: 'Ex.: Nosso dinheiro', maxlength: '40', autofocus: true });
    var inA = h('input.input', { type: 'text', placeholder: 'Nome de um', maxlength: '30' });
    var inB = h('input.input', { type: 'text', placeholder: 'Nome do outro', maxlength: '30' });
    var inEmail = h('input.input', { type: 'email', placeholder: 'email@exemplo.com', autocomplete: 'username' });
    var inSenha = h('input.input', { type: 'password', placeholder: 'Mínimo 6 caracteres', autocomplete: 'new-password' });
    var inSenha2 = h('input.input', { type: 'password', placeholder: 'Repita a senha', autocomplete: 'new-password' });

    var medidor = h('div.pwmeter',
      h('div.pwmeter__b'), h('div.pwmeter__b'), h('div.pwmeter__b'), h('div.pwmeter__b')
    );
    var forcaTxt = h('span.field__hint', 'Essa senha vale para os dois.');

    inSenha.addEventListener('input', function () {
      var f = FC.cripto.forcaSenha(inSenha.value);
      Array.prototype.forEach.call(medidor.children, function (b, i) {
        b.className = 'pwmeter__b' + (i < f.nivel ? ' on-' + f.nivel : '');
      });
      forcaTxt.textContent = f.texto ? 'Força: ' + f.texto : 'Essa senha vale para os dois.';
    });

    var btnCriar = h('button.btn.btn--lg.btn--block', { type: 'submit' }, ic('heart'), 'Criar nosso painel');

    var form = h('form.col', {
      style: { gap: 'var(--sp-4)' },
      onsubmit: function (e) {
        e.preventDefault();
        if (ocupado) return;

        erro.textContent = '';
        if (inSenha.value !== inSenha2.value) {
          erro.textContent = 'As senhas não são iguais.';
          inSenha2.focus();
          return;
        }
        if (inSenha.value.length < 6) {
          erro.textContent = 'A senha precisa de pelo menos 6 caracteres.';
          inSenha.focus();
          return;
        }

        ocupado = true;
        d.mount(btnCriar, h('span.spinner'));

        FC.nuvem.criarConta({
          email: inEmail.value.trim(),
          senha: inSenha.value,
          nomeCasal: inCasal.value.trim() || 'Nosso dinheiro',
          nomeA: inA.value.trim() || 'Pessoa 1',
          nomeB: inB.value.trim() || 'Pessoa 2'
        }).then(function () {
          FC.app.aoEntrar(true);
        }).catch(function (e2) {
          ocupado = false;
          erro.textContent = e2.message;
          d.mount(btnCriar, h('span', ic('heart'), ' Criar nosso painel'));
        });
      }
    },
      h('div.fgrid.fgrid--1', ui.campo('Nome do painel', inCasal)),
      h('div.fgrid',
        ui.campo('Uma pessoa', inA),
        ui.campo('A outra', inB)
      ),
      h('hr.hr--soft'),
      ui.campo('E-mail de acesso', inEmail, 'Serve para identificar o painel de vocês'),
      ui.campo('Senha', h('div', inSenha, medidor), null),
      forcaTxt,
      ui.campo('Confirme a senha', inSenha2),
      erro,

      FC.nuvem && FC.nuvem.configurado()
        ? h('div.note', ic('lock'),
            h('div',
              h('strong.note__title', 'Um acesso para os dois aparelhos'),
              'Crie só uma vez, num celular. No outro, use "Entrar" com o mesmo e-mail e senha. ' +
              'Os dados vão para a nuvem criptografados com a senha: sem ela, ninguém lê — ' +
              'e não existe "esqueci minha senha".'))
        : h('div.note.note--warn', ic('alert'),
            h('div',
              h('strong.note__title', 'Guarde bem a senha'),
              'Não existe "esqueci minha senha" aqui: tudo fica só neste navegador, sem servidor. ' +
              'Se perder a senha, o acesso a este painel se perde junto.'
            )
          ),

      btnCriar,

      contas.length || (FC.nuvem && FC.nuvem.configurado()) ? h('div.lock__switch',
        'Já criaram o painel em outro aparelho? ',
        h('a', { href: '#', onclick: function (e) { e.preventDefault(); modo = 'entrar'; modoEscolhido = true; render(); } }, 'Entrar')
      ) : null
    );

    return form;
  }

  /* ---------------------------- fundo animado ---------------------------- */

  function desenharOnda() {
    var p = d.$('#lockWave');
    if (!p) return;

    var W = 1200, H = 600;
    var pontos = [];
    var y = H * 0.62;
    var seed = 7;

    function aleatorio() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    for (var x = 0; x <= W; x += 24) {
      y += (aleatorio() - 0.46) * 38;
      y = fmt.clamp(y, H * 0.22, H * 0.86);
      pontos.push([x, y]);
    }

    var dd = 'M' + pontos.map(function (pt) { return pt[0] + ',' + pt[1]; }).join('L');
    p.setAttribute('d', dd);

    var comp = p.getTotalLength ? p.getTotalLength() : 3000;
    p.style.strokeDasharray = comp;
    p.style.strokeDashoffset = comp;
    p.animate(
      [{ strokeDashoffset: comp }, { strokeDashoffset: 0 }],
      { duration: 2600, easing: 'ease-out', fill: 'forwards' }
    );
  }

  FC.viewLogin = { render: render, set modo(v) { modo = v; } };
})(typeof self !== 'undefined' ? self : this);
