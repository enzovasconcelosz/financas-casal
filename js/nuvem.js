/* ==========================================================================
   nuvem.js — sincronização entre aparelhos (Firebase, plano gratuito)

   Como funciona:
     - O casal usa UM acesso (e-mail + senha). Os dois celulares entram nele.
     - O cofre inteiro vai para UM documento do Firestore, compactado e
       CRIPTOGRAFADO no aparelho (AES-GCM, chave tirada da senha). O Google
       só guarda um bloco embaralhado.
     - Nem a senha vai para o Google: o login do Firebase usa uma senha
       derivada (PBKDF2) da senha de vocês, e a chave dos dados é outra.
     - A cada mudança, e a cada 20 s, o aparelho confere a versão na nuvem e
       faz a mesclagem de 3 vias (merge.js). Escrita com pré-condição: se o
       outro aparelho gravou no meio, mescla de novo e tenta outra vez.

   Fala com o Firebase por REST (sem SDK): Identity Toolkit para login e
   Firestore REST para o documento. Os endereços são configuráveis para os
   testes com um servidor falso.
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});
  var fmt = FC.fmt, cripto = FC.cripto, merge = FC.merge;
  var subtle = root.crypto && root.crypto.subtle;

  var K_CFG = 'fc:nuvem:config';       // configuração digitada no aparelho (opcional)
  var K_LIG = 'fc:nuvem:ligacao:';     // + id da conta -> { uid, email, refreshToken }
  var K_CHAVE = 'fc:nuvem:chave:';     // + id da conta -> chave da sessão (sessionStorage)
  var K_DISP = 'fc:dispositivo';
  var ITER = 150000;
  var POLL_MS = 20000;
  var ESPERA_MS = 2500;
  var LIMITE_DOC = 900 * 1024;         // o Firestore aceita até 1 MiB por documento

  /* ======================================================================
     CONFIGURAÇÃO
     ====================================================================== */
  function config() {
    var local = null;
    try { local = JSON.parse(localStorage.getItem(K_CFG) || 'null'); } catch (e) {}
    var c = Object.assign({}, root.FC_NUVEM || {}, local || {});
    c.authUrl = (c.authUrl || 'https://identitytoolkit.googleapis.com').replace(/\/+$/, '');
    c.tokenUrl = (c.tokenUrl || 'https://securetoken.googleapis.com').replace(/\/+$/, '');
    c.firestoreUrl = (c.firestoreUrl || 'https://firestore.googleapis.com').replace(/\/+$/, '');
    return c;
  }
  function configurado() { var c = config(); return !!(c.apiKey && c.projectId && subtle); }
  function salvarConfigLocal(obj) {
    if (obj) localStorage.setItem(K_CFG, JSON.stringify(obj));
    else localStorage.removeItem(K_CFG);
  }

  function dispositivo() {
    var id = localStorage.getItem(K_DISP);
    if (!id) { id = fmt.uid('disp'); try { localStorage.setItem(K_DISP, id); } catch (e) {} }
    var ua = navigator.userAgent || '';
    var so = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Navegador';
    var nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '';
    return { id: id, nome: so + (nav ? ' · ' + nav : '') };
  }

  /* ======================================================================
     ESTADO (mostrado no topo e nos Ajustes)
     ====================================================================== */
  var st = { estado: 'desligado', ultimo: null, erro: null, dispositivoRemoto: null };
  var ouvintes = [];
  function status() { return Object.assign({}, st, { configurado: configurado(), ligado: !!ligacao() }); }
  function aoMudarStatus(fn) { ouvintes.push(fn); }
  function definir(estado, erro) {
    st.estado = estado;
    st.erro = erro || null;
    ouvintes.forEach(function (fn) { try { fn(status()); } catch (e) {} });
  }

  /* ======================================================================
     ERROS
     ====================================================================== */
  function Erro(codigo, msg) { var e = new Error(msg || codigo); e.codigo = codigo; return e; }

  var MSG = {
    INVALID_LOGIN_CREDENTIALS: 'E-mail ou senha incorretos.',
    INVALID_PASSWORD: 'E-mail ou senha incorretos.',
    EMAIL_NOT_FOUND: 'E-mail ou senha incorretos.',
    EMAIL_EXISTS: 'Este e-mail já tem um painel na nuvem. Use "Entrar" com a senha dele.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Muitas tentativas. Espere alguns minutos.',
    OPERATION_NOT_ALLOWED: 'O login por e-mail não está ativado no Firebase (veja o passo a passo).',
    ADMIN_ONLY_OPERATION: 'Criação de contas desligada no Firebase. Crie o acesso antes de desligar.',
    PERMISSION_DENIED: 'O Firebase recusou o acesso. Confira as regras do Firestore (passo a passo).',
    REDE: 'Sem conexão com a nuvem agora.'
  };
  function mensagem(e) { return MSG[e.codigo] || e.message || 'Erro na sincronização.'; }

  function ehErroDeLogin(e) {
    return /INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND/.test(e.codigo || '');
  }

  /* ======================================================================
     REST
     ====================================================================== */
  function pedir(url, op) {
    return fetch(url, op).catch(function () { throw Erro('REDE'); }).then(function (r) {
      return r.text().then(function (txt) {
        var corpo = null;
        try { corpo = txt ? JSON.parse(txt) : null; } catch (e) {}
        if (r.ok) return corpo;
        var err = corpo && corpo.error;
        var codigo = err ? (typeof err.message === 'string' && /^[A-Z_]+/.test(err.message)
          ? err.message.split(/[\s:]/)[0] : (err.status || 'HTTP_' + r.status)) : 'HTTP_' + r.status;
        if (err && (err.status === 'FAILED_PRECONDITION' || err.status === 'ABORTED' || err.status === 'ALREADY_EXISTS')) codigo = 'CONFLITO';
        if (r.status === 404 || (err && err.status === 'NOT_FOUND')) codigo = 'NAO_EXISTE';
        if (err && err.status === 'PERMISSION_DENIED') codigo = 'PERMISSION_DENIED';
        if (r.status === 401 || (err && err.status === 'UNAUTHENTICATED')) codigo = 'UNAUTHENTICATED';
        throw Erro(codigo, (err && err.message) || ('HTTP ' + r.status));
      });
    });
  }

  function auth(acao, corpo) {
    var c = config();
    return pedir(c.authUrl + '/v1/accounts:' + acao + '?key=' + encodeURIComponent(c.apiKey), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ returnSecureToken: true }, corpo))
    });
  }

  function trocarToken(refreshToken) {
    var c = config();
    return pedir(c.tokenUrl + '/v1/token?key=' + encodeURIComponent(c.apiKey), {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken)
    });
  }

  function urlDoc(uid) {
    var c = config();
    return c.firestoreUrl + '/v1/projects/' + encodeURIComponent(c.projectId) +
           '/databases/(default)/documents/cofres/' + encodeURIComponent(uid);
  }

  function paraCampos(obj) {
    var f = {};
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (typeof v === 'number') f[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
      else if (typeof v === 'boolean') f[k] = { booleanValue: v };
      else f[k] = { stringValue: String(v) };
    });
    return f;
  }
  function deCampos(fields) {
    var o = {};
    Object.keys(fields || {}).forEach(function (k) {
      var v = fields[k];
      o[k] = 'integerValue' in v ? parseInt(v.integerValue, 10)
           : 'doubleValue' in v ? v.doubleValue
           : 'booleanValue' in v ? v.booleanValue
           : v.stringValue;
    });
    return o;
  }

  /**
   * Faz o pedido com o token; se o Firebase disser que o token não vale mais
   * (senha trocada em outro aparelho), descarta e tenta renovar uma vez.
   * Se a renovação também falhar, token() devolve REENTRAR.
   */
  function comToken(fazer) {
    return token().then(fazer).catch(function (e) {
      if (e.codigo !== 'UNAUTHENTICATED') throw e;
      sessao.idToken = null; sessao.expira = 0;
      return token().then(fazer);
    });
  }

  function lerDoc(soVersao) {
    return comToken(function (t) {
      var url = urlDoc(sessao.uid) + (soVersao ? '?mask.fieldPaths=versao&mask.fieldPaths=dispositivo' : '');
      return pedir(url, { headers: { Authorization: 'Bearer ' + t } });
    }).then(function (doc) {
      return { campos: deCampos(doc.fields), updateTime: doc.updateTime };
    }).catch(function (e) {
      if (e.codigo === 'NAO_EXISTE') return null;
      throw e;
    });
  }

  /** grava com pré-condição: só se ninguém gravou depois de `updateTime` */
  function gravarDoc(campos, updateTime) {
    return comToken(function (t) {
      var pre = updateTime
        ? 'currentDocument.updateTime=' + encodeURIComponent(updateTime)
        : 'currentDocument.exists=false';
      return pedir(urlDoc(sessao.uid) + '?' + pre, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: paraCampos(campos) })
      });
    }).then(function (doc) { return { updateTime: doc.updateTime }; });
  }

  /* ======================================================================
     SESSÃO NA NUVEM
     ====================================================================== */
  var sessao = { uid: null, idToken: null, expira: 0, refreshToken: null };

  function chaveConta() { var c = FC.store.conta(); return c ? c.id : null; }
  function ligacao(contaId) {
    var id = contaId || chaveConta();
    if (!id) return null;
    try { return JSON.parse(localStorage.getItem(K_LIG + id) || 'null'); } catch (e) { return null; }
  }
  function gravarLigacao(contaId, lig) {
    if (lig) localStorage.setItem(K_LIG + contaId, JSON.stringify(lig));
    else localStorage.removeItem(K_LIG + contaId);
  }

  function guardarSessao(resp) {
    sessao.uid = resp.localId || resp.user_id || sessao.uid;
    sessao.idToken = resp.idToken || resp.id_token;
    sessao.refreshToken = resp.refreshToken || resp.refresh_token || sessao.refreshToken;
    sessao.expira = Date.now() + (parseInt(resp.expiresIn || resp.expires_in, 10) || 3600) * 1000;
    var id = chaveConta();
    var lig = id && ligacao(id);
    if (lig) { lig.refreshToken = sessao.refreshToken; gravarLigacao(id, lig); }
  }

  function token() {
    if (sessao.idToken && Date.now() < sessao.expira - 60000) return Promise.resolve(sessao.idToken);
    if (!sessao.refreshToken) return Promise.reject(Erro('SEM_SESSAO', 'Entre de novo para sincronizar.'));
    return trocarToken(sessao.refreshToken).then(function (r) {
      guardarSessao(r);
      return sessao.idToken;
    }).catch(function (e) {
      if (/TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_NOT_FOUND|USER_DISABLED|INVALID_ID_TOKEN/.test(e.codigo || '')) {
        throw Erro('REENTRAR', 'A senha foi trocada em outro aparelho. Bloqueie e entre de novo com a senha nova.');
      }
      throw e;
    });
  }

  /* ======================================================================
     CRIPTOGRAFIA
     ====================================================================== */
  function utf8(s) { return new TextEncoder().encode(s); }

  function pbkdf2(senha, saltBytes, bits) {
    return subtle.importKey('raw', utf8(senha), { name: 'PBKDF2' }, false, ['deriveBits'])
      .then(function (k) {
        return subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: ITER, hash: 'SHA-256' }, k, bits);
      });
  }

  /** senha que vai para o login do Firebase: derivada, não é a de vocês */
  function segredoLogin(email, senha) {
    var salt = utf8('financas-casal|login|' + fmt.norm(email));
    return pbkdf2(senha, salt, 256).then(function (b) { return cripto.toHex(new Uint8Array(b)); });
  }

  /** chave AES dos dados (outra derivação, com salt guardado junto do documento) */
  function derivarChave(senha, saltHex) {
    return pbkdf2('dados|' + senha, cripto.fromHex(saltHex), 256).then(function (bits) {
      return subtle.importKey('raw', bits, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    });
  }

  var chave = null;       // CryptoKey da sessão
  var saltDados = null;   // hex, o mesmo guardado no documento

  function guardarChaveNaSessao() {
    var id = chaveConta();
    if (!id || !chave) return Promise.resolve();
    return subtle.exportKey('raw', chave).then(function (raw) {
      try {
        sessionStorage.setItem(K_CHAVE + id, JSON.stringify({ k: cripto.toB64(new Uint8Array(raw)), salt: saltDados }));
      } catch (e) {}
    });
  }
  function recuperarChaveDaSessao() {
    var id = chaveConta();
    var s = null;
    try { s = JSON.parse(sessionStorage.getItem(K_CHAVE + id) || 'null'); } catch (e) {}
    if (!s) return Promise.resolve(false);
    return subtle.importKey('raw', cripto.fromB64(s.k), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
      .then(function (k) { chave = k; saltDados = s.salt; return true; });
  }

  function comprimir(texto) {
    if (!root.CompressionStream) return Promise.resolve({ bytes: utf8(texto), z: false });
    var s = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(s).arrayBuffer().then(function (b) { return { bytes: new Uint8Array(b), z: true }; });
  }
  function descomprimir(bytes, z) {
    if (!z) return Promise.resolve(new TextDecoder().decode(bytes));
    var s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(s).text();
  }

  function empacotar(cofre, versao) {
    var texto = JSON.stringify(merge.paraNuvem(cofre));
    return comprimir(texto).then(function (c) {
      var iv = root.crypto.getRandomValues(new Uint8Array(12));
      return subtle.encrypt({ name: 'AES-GCM', iv: iv }, chave, c.bytes).then(function (ct) {
        var d = dispositivo();
        var campos = {
          formato: 1, versao: versao, salt: saltDados, iv: cripto.toB64(iv),
          ct: cripto.toB64(new Uint8Array(ct)), z: c.z,
          atualizadoEm: new Date().toISOString(), dispositivo: d.nome, dispositivoId: d.id
        };
        if (campos.ct.length > LIMITE_DOC) {
          throw Erro('GRANDE', 'Os dados passaram do limite de um documento do Firebase (1 MB). Apague fotos grandes ou fale comigo.');
        }
        return campos;
      });
    });
  }

  function desempacotar(campos, chaveUsada) {
    return subtle.decrypt({ name: 'AES-GCM', iv: cripto.fromB64(campos.iv) }, chaveUsada || chave, cripto.fromB64(campos.ct))
      .catch(function () { throw Erro('CHAVE', 'Não consegui abrir os dados da nuvem com essa senha.'); })
      .then(function (b) { return descomprimir(new Uint8Array(b), campos.z); })
      .then(function (txt) { return JSON.parse(txt); });
  }

  /* ======================================================================
     SINCRONIZAÇÃO
     ====================================================================== */
  var rodando = false, deNovo = false, timerPoll = null, timerEspera = null;

  function pronto() { return !!(sessao.refreshToken && chave && FC.store.conectado()); }
  function copia(x) { return JSON.parse(JSON.stringify(x)); }

  function sincronizar() {
    if (!pronto()) return Promise.resolve(false);
    if (rodando) { deNovo = true; return Promise.resolve(false); }
    rodando = true;
    definir('sincronizando');

    function tentativa(n) {
      var local0 = copia(FC.store.get());
      var sync = local0._sync || null;

      return lerDoc(false).then(function (doc) {
        if (!doc) {
          /* nuvem vazia: este aparelho manda o que tem */
          return empacotar(local0, 1).then(function (campos) {
            return gravarDoc(campos, null);
          }).then(function (r) { aplicar(local0, local0, 1, r.updateTime, null); });
        }

        var versao = doc.campos.versao || 0;
        st.dispositivoRemoto = doc.campos.dispositivo || null;
        if (sync && versao === sync.versao && !merge.temNovidade(local0, sync.base)) {
          return;   // nada mudou em lado nenhum
        }
        var obterRemoto = sync && versao === sync.versao
          ? Promise.resolve(sync.base)
          : desempacotar(doc.campos);

        return obterRemoto.then(function (remoto) {
          var mesclado = merge.mesclarCofres(sync ? sync.base : null, local0, remoto);
          if (!merge.temNovidade(mesclado, remoto)) {
            aplicar(local0, mesclado, versao, doc.updateTime, remoto);
            return;
          }
          return empacotar(mesclado, versao + 1).then(function (campos) {
            return gravarDoc(campos, doc.updateTime);
          }).then(function (r) {
            aplicar(local0, mesclado, versao + 1, r.updateTime, mesclado);
          });
        });
      }).catch(function (e) {
        if (e.codigo === 'CONFLITO' && n < 5) return tentativa(n + 1);   // o outro gravou no meio
        throw e;
      });
    }

    return tentativa(1).then(function () {
      st.ultimo = new Date().toISOString();
      definir('ok');
      return true;
    }).catch(function (e) {
      console.warn('[nuvem]', e);
      definir(e.codigo === 'REDE' ? 'offline' : (e.codigo === 'REENTRAR' || e.codigo === 'CHAVE') ? 'reentrar' : 'erro', mensagem(e));
      return false;
    }).then(function (r) {
      rodando = false;
      if (deNovo) { deNovo = false; agendar(500); }
      return r;
    });
  }

  /**
   * Aplica o resultado. Se o usuário mexeu em algo DURANTE o sync, essas
   * mudanças são mescladas por cima (base = o que foi usado no sync).
   */
  function aplicar(local0, mesclado, versao, updateTime, baseNuvem) {
    var agora = FC.store.get();
    var mexeuNoMeio = merge.temNovidade(agora, local0);
    var final = mexeuNoMeio ? merge.mesclarCofres(local0, agora, mesclado) : copia(mesclado);
    final._sync = { base: merge.paraNuvem(baseNuvem || mesclado), versao: versao, updateTime: updateTime };

    if (merge.temNovidade(final, agora)) FC.store.aplicarDaNuvem(final);
    else FC.store.gravarSync(final._sync);

    if (mexeuNoMeio) agendar(300);
  }

  function agendar(ms) {
    clearTimeout(timerEspera);
    timerEspera = setTimeout(sincronizar, ms == null ? ESPERA_MS : ms);
  }

  /** consulta só a versão; se mudou, sincroniza */
  function conferir() {
    if (!pronto() || document.hidden || rodando) return;
    var sync = FC.store.get()._sync;
    lerDoc(true).then(function (doc) {
      if (!doc || !sync || doc.campos.versao !== sync.versao) sincronizar();
      else if (st.estado !== 'ok') definir('ok');
    }).catch(function (e) {
      definir(e.codigo === 'REDE' ? 'offline' : e.codigo === 'REENTRAR' ? 'reentrar' : 'erro', mensagem(e));
    });
  }

  var ligouEventos = false;
  function iniciar() {
    if (!ligouEventos) {
      ligouEventos = true;
      FC.store.aoAlterar(function () { if (pronto()) agendar(); });
      root.addEventListener('online', function () { if (pronto()) sincronizar(); });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) conferir(); });
    }
    clearInterval(timerPoll);
    timerPoll = setInterval(conferir, POLL_MS);
    return sincronizar();
  }

  function parar(esquecerChave) {
    clearInterval(timerPoll);
    clearTimeout(timerEspera);
    /* ao bloquear a conta já saiu: apaga qualquer chave guardada na sessão */
    if (esquecerChave) {
      try {
        Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf(K_CHAVE) === 0) sessionStorage.removeItem(k); });
      } catch (e) {}
    }
    chave = null; saltDados = null;
    sessao = { uid: null, idToken: null, expira: 0, refreshToken: null };
    definir('desligado');
  }

  /* ======================================================================
     LIGAR UM ACESSO À NUVEM
     ====================================================================== */
  function prepararSessao(lig) {
    sessao.uid = lig.uid;
    sessao.refreshToken = lig.refreshToken;
  }

  /** Depois de autenticar: deixa este aparelho pronto (ligação + chave) */
  function concluirLigacao(contaId, email, resp, senha, salt) {
    gravarLigacao(contaId, { uid: resp.localId, email: email, refreshToken: resp.refreshToken });
    guardarSessao(resp);
    saltDados = salt;
    return derivarChave(senha, salt).then(function (k) { chave = k; return guardarChaveNaSessao(); });
  }

  /**
   * Entrar (tela de bloqueio). Usa a trava local quando dá; senão, a nuvem:
   *   - 2º aparelho: o e-mail ainda não existe aqui
   *   - a senha foi trocada no outro aparelho
   */
  function entrar(email, senha) {
    var temLocal = !!FC.store.acharConta(email);

    var tentarLocal = temLocal ? FC.store.conferirSenhaLocal(email, senha) : Promise.resolve(false);
    return tentarLocal.then(function (ok) {
      if (ok) {
        return FC.store.entrar(email, senha).then(function () {
          ligarEmSegundoPlano(email, senha);
        });
      }
      if (!configurado()) {
        return FC.store.entrar(email, senha);   // mensagem de erro de sempre
      }
      return entrarPelaNuvem(email, senha);
    });
  }

  function entrarPelaNuvem(email, senha) {
    var resp;
    return segredoLogin(email, senha).then(function (seg) {
      return auth('signInWithPassword', { email: email, password: seg });
    }).catch(function (e) {
      if (ehErroDeLogin(e)) {
        throw new Error(FC.store.acharConta(email) ? 'Senha incorreta.' : 'E-mail ou senha incorretos (nem neste aparelho, nem na nuvem).');
      }
      if (e.codigo === 'REDE') throw new Error('Sem internet: não consegui buscar o painel na nuvem.');
      throw new Error(mensagem(e));
    }).then(function (r) {
      resp = r;
      guardarSessao(r);
      return lerDoc(false);
    }).then(function (doc) {
      if (!doc) throw new Error('Esse acesso existe, mas ainda não há dados na nuvem. Abra o painel no primeiro aparelho para enviar.');
      return derivarChave(senha, doc.campos.salt).then(function (k) {
        chave = k; saltDados = doc.campos.salt;
        return desempacotar(doc.campos).then(function (remoto) { return { doc: doc, remoto: remoto }; });
      });
    }).then(function (x) {
      /* se este aparelho tinha mudanças ainda não enviadas, junta */
      var antigo = FC.store.lerCofreBruto(email);
      var cofre = antigo
        ? merge.mesclarCofres(antigo._sync ? antigo._sync.base : null, antigo, x.remoto)
        : merge.restaurarLocais(copia(x.remoto), { config: { tema: localStorage.getItem('fc:tema') || 'dark' } });
      cofre._sync = { base: merge.paraNuvem(x.remoto), versao: x.doc.campos.versao, updateTime: x.doc.updateTime };
      return FC.store.criarContaLocal(email, senha, cofre);
    }).then(function (conta) {
      return concluirLigacao(conta.id, email, resp, senha, saltDados);
    }).then(function () {
      iniciar();
    });
  }

  /** Depois de entrar pela trava local: reconecta (ou liga, se o e-mail já existe na nuvem) */
  function ligarEmSegundoPlano(email, senha) {
    if (!configurado()) return;
    var conta = FC.store.conta();
    var lig = ligacao(conta.id);

    if (lig) {
      prepararSessao(lig);
      lerDoc(false).then(function (doc) {
        var salt = doc ? doc.campos.salt : (saltDados || cripto.novoSalt());
        saltDados = salt;
        return derivarChave(senha, salt);
      }).then(function (k) {
        chave = k;
        return guardarChaveNaSessao();
      }).then(iniciar).catch(function (e) {
        definir(e.codigo === 'REDE' ? 'offline' : e.codigo === 'REENTRAR' ? 'reentrar' : 'erro', mensagem(e));
      });
      return;
    }

    /* ainda não ligado: se o e-mail já tiver painel na nuvem com essa senha, liga */
    segredoLogin(email, senha).then(function (seg) {
      return auth('signInWithPassword', { email: email, password: seg });
    }).then(function (resp) {
      return ligarComEscolha(conta, email, senha, resp);
    }).catch(function () { definir('desligado'); });
  }

  /**
   * Liga a conta local a uma conta da nuvem que já existe.
   * Se os dois lados têm dados e nunca sincronizaram, pergunta o que fazer.
   */
  function ligarComEscolha(conta, email, senha, resp) {
    guardarSessao(resp);
    return lerDoc(false).then(function (doc) {
      var local = FC.store.get();
      if (!doc) {
        return concluirLigacao(conta.id, email, resp, senha, cripto.novoSalt()).then(iniciar);
      }
      return derivarChave(senha, doc.campos.salt).then(function (k) {
        chave = k; saltDados = doc.campos.salt;
        return desempacotar(doc.campos);
      }).then(function (remoto) {
        var localVazio = !local.lancamentos.length;
        var escolha = localVazio ? Promise.resolve('nuvem') : perguntarComoJuntar(remoto, local);
        return escolha.then(function (modo) {
          if (!modo) { parar(); return; }
          var cofre;
          if (modo === 'nuvem') cofre = merge.restaurarLocais(copia(remoto), local);
          else if (modo === 'juntar') cofre = merge.mesclarCofres(null, local, remoto);
          else cofre = copia(local);   // 'enviar': este aparelho manda
          /* base = nuvem atual: o que for diferente sai como mudança deste aparelho */
          cofre._sync = { base: merge.paraNuvem(remoto), versao: doc.campos.versao, updateTime: doc.updateTime };
          FC.store.aplicarDaNuvem(cofre);
          return concluirLigacao(conta.id, email, resp, senha, doc.campos.salt).then(iniciar);
        });
      });
    });
  }

  function perguntarComoJuntar(remoto, local) {
    var h = FC.dom.h, ic = FC.dom.ic;
    return new Promise(function (ok) {
      var respondido = false;
      FC.ui.modal({
        titulo: 'Já existem dados na nuvem',
        sub: 'este aparelho também tem lançamentos',
        largura: 'slim',
        corpo: h('div.col', { style: { gap: 'var(--sp-3)' } },
          h('dl.dl',
            h('dt', 'Na nuvem'), h('dd', remoto.lancamentos.length + ' lançamentos'),
            h('dt', 'Neste aparelho'), h('dd', local.lancamentos.length + ' lançamentos')),
          h('div.note', ic('info'), h('div',
            h('strong.note__title', 'Na dúvida, use os da nuvem'),
            'Se este é o segundo aparelho, os dados certos são os que já estão na nuvem. ' +
            '"Juntar" soma os dois lados sem apagar nada: bom se os dois aparelhos lançaram coisas ' +
            'diferentes, mas duplica se cada um criou o painel do zero.'))
        ),
        acoes: function (c) {
          var b = function (txt, modo, cls) {
            return h('button.btn' + (cls || ''), { type: 'button', onclick: function () { respondido = true; c.fechar(); ok(modo); } }, txt);
          };
          return [b('Mandar os deste', 'enviar', '.btn--ghost.btn--sm'), h('div.grow'),
                  b('Juntar', 'juntar', '.btn--soft'), b('Usar os da nuvem', 'nuvem')];
        },
        aoFechar: function () { if (!respondido) ok(null); }
      });
    });
  }

  /** Criar acesso (tela de bloqueio): cria na nuvem e aqui */
  function criarConta(dados) {
    if (!configurado()) return FC.store.criarConta(dados);
    var email = String(dados.email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Promise.reject(new Error('E-mail inválido.'));
    if (String(dados.senha || '').length < 6) return Promise.reject(new Error('A senha precisa de pelo menos 6 caracteres.'));
    if (FC.store.acharConta(email)) return Promise.reject(new Error('Já existe um acesso com esse e-mail neste navegador.'));

    var resp;
    return segredoLogin(email, dados.senha).then(function (seg) {
      return auth('signUp', { email: email, password: seg });
    }).catch(function (e) {
      throw new Error(e.codigo === 'REDE' ? 'Sem internet: para criar o acesso compartilhado é preciso estar online.' : mensagem(e));
    }).then(function (r) {
      resp = r;
      return FC.store.criarConta(dados);
    }).then(function (conta) {
      return concluirLigacao(conta.id, email, resp, dados.senha, cripto.novoSalt()).then(function () {
        iniciar();
        return conta;
      });
    });
  }

  /** Ajustes: ligar um painel que só existia neste aparelho */
  function ativar(senha) {
    var conta = FC.store.conta();
    if (!conta) return Promise.reject(new Error('Ninguém conectado.'));
    if (!configurado()) return Promise.reject(new Error('Falta configurar o Firebase.'));
    var seg;
    return FC.store.conferirSenhaLocal(conta.email, senha).then(function (ok) {
      if (!ok) throw new Error('Senha incorreta.');
      return segredoLogin(conta.email, senha);
    }).then(function (s) {
      seg = s;
      return auth('signInWithPassword', { email: conta.email, password: seg }).catch(function (e) {
        if (!ehErroDeLogin(e)) throw e;
        return auth('signUp', { email: conta.email, password: seg }).catch(function (e2) {
          if (e2.codigo === 'EMAIL_EXISTS') {
            throw new Error('Este e-mail já está na nuvem com outra senha. Entre com aquela senha, ou use outro e-mail.');
          }
          throw e2;
        });
      });
    }).then(function (resp) {
      return ligarComEscolha(conta, conta.email, senha, resp);
    }).catch(function (e) { throw new Error(e.codigo ? mensagem(e) : e.message); });
  }

  /** Ajustes: este aparelho para de sincronizar (os dados locais ficam) */
  function desligar() {
    var id = chaveConta();
    parar(true);
    if (id) gravarLigacao(id, null);
    FC.store.gravarSync(undefined);
  }

  /**
   * Troca de senha com a nuvem ligada: sincroniza, troca o login do Firebase
   * e regrava os dados com a chave nova. O outro aparelho vai pedir a senha nova.
   */
  function trocarSenha(atual, nova) {
    var conta = FC.store.conta();
    if (!ligacao() || !pronto()) return FC.store.trocarSenha(atual, nova);
    var novoSalt = cripto.novoSalt();
    var novaChave;

    return FC.store.conferirSenhaLocal(conta.email, atual).then(function (ok) {
      if (!ok) throw new Error('A senha atual não confere.');
      if (String(nova || '').length < 6) throw new Error('A nova senha precisa de 6 caracteres ou mais.');
      return sincronizar();
    }).then(function (ok) {
      if (!ok) throw new Error('Não consegui falar com a nuvem agora. Tente com internet.');
      return Promise.all([token(), segredoLogin(conta.email, nova), derivarChave(nova, novoSalt)]);
    }).then(function (x) {
      novaChave = x[2];
      return auth('update', { idToken: x[0], password: x[1] });
    }).then(function (resp) {
      guardarSessao(resp);
      var antiga = chave, antigoSalt = saltDados;
      chave = novaChave; saltDados = novoSalt;
      var cofre = FC.store.get();
      return empacotar(cofre, cofre._sync.versao + 1).then(function (campos) {
        return gravarDoc(campos, cofre._sync.updateTime);
      }).then(function (r) {
        var s = cofre._sync;
        FC.store.gravarSync({ base: s.base, versao: s.versao + 1, updateTime: r.updateTime });
        return guardarChaveNaSessao();
      }).catch(function (e) { chave = antiga; saltDados = antigoSalt; throw e; });
    }).then(function () {
      return FC.store.trocarSenha(atual, nova);
    });
  }

  /** Recarregou a página (F5) com a sessão aberta: retoma sem pedir senha */
  function retomar() {
    if (!configurado()) return;
    var lig = ligacao();
    if (!lig) return;
    prepararSessao(lig);
    recuperarChaveDaSessao().then(function (ok) {
      if (ok) iniciar();
      else definir('reentrar', 'Bloqueie e entre de novo para voltar a sincronizar.');
    });
  }

  FC.nuvem = {
    config: config, configurado: configurado, salvarConfigLocal: salvarConfigLocal,
    status: status, aoMudarStatus: aoMudarStatus,
    entrar: entrar, criarConta: criarConta, ativar: ativar, desligar: desligar,
    trocarSenha: trocarSenha, retomar: retomar, sincronizar: sincronizar, parar: parar,
    ligado: function () { return !!ligacao(); },
    /* para os testes */
    _segredoLogin: segredoLogin
  };
})(typeof self !== 'undefined' ? self : this);
