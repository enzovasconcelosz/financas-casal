/* ==========================================================================
   crypto.js — senha (PBKDF2) e criptografia opcional do cofre (AES-GCM)

   Usa WebCrypto quando disponivel. Se o navegador nao expuser crypto.subtle
   (contexto nao seguro), cai para um SHA-256 em JS puro, so para a trava de
   acesso — nesse caso a criptografia do cofre fica indisponivel.
   ========================================================================== */
(function (root) {
  'use strict';
  var FC = (root.FC = root.FC || {});

  var subtle = (root.crypto && root.crypto.subtle) || null;
  var ITER = 150000;
  var ITER_FALLBACK = 20000;

  /* ----------------------------------------------------------------------
     SHA-256 em JS puro (fallback)
     ---------------------------------------------------------------------- */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function sha256Bytes(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = bytes.length;
    var withPad = new Uint8Array((((len + 8) >> 6) + 1) << 6);
    withPad.set(bytes);
    withPad[len] = 0x80;
    var bitLen = len * 8;
    var dv = new DataView(withPad.buffer);
    dv.setUint32(withPad.length - 4, bitLen >>> 0, false);
    dv.setUint32(withPad.length - 8, Math.floor(bitLen / 4294967296), false);

    var w = new Int32Array(64);
    for (var off = 0; off < withPad.length; off += 64) {
      var i;
      for (i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false);
      for (i = 16; i < 64; i++) {
        var g0 = w[i - 15], g1 = w[i - 2];
        var s0 = ((g0 >>> 7) | (g0 << 25)) ^ ((g0 >>> 18) | (g0 << 14)) ^ (g0 >>> 3);
        var s1 = ((g1 >>> 17) | (g1 << 15)) ^ ((g1 >>> 19) | (g1 << 13)) ^ (g1 >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], hh = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + hh) | 0;
    }
    var out = new Uint8Array(32);
    var ov = new DataView(out.buffer);
    for (var j = 0; j < 8; j++) ov.setInt32(j * 4, H[j], false);
    return out;
  }

  function utf8(str) {
    if (root.TextEncoder) return new TextEncoder().encode(str);
    var s = unescape(encodeURIComponent(str));
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  function concat(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0); out.set(b, a.length);
    return out;
  }

  function toHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      s += h.length === 1 ? '0' + h : h;
    }
    return s;
  }

  function fromHex(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  function toB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return root.btoa(s);
  }

  function fromB64(b64) {
    var s = root.atob(b64);
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function randomBytes(n) {
    var b = new Uint8Array(n);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(b);
    else for (var i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
  }

  /* fallback: derivacao iterada simples (nao e PBKDF2 real, mas encadeia SHA-256) */
  function slowHashJS(senha, saltBytes, iter) {
    var h = sha256Bytes(concat(saltBytes, utf8(senha)));
    for (var i = 0; i < iter; i++) h = sha256Bytes(concat(h, saltBytes));
    return h;
  }

  /* ----------------------------------------------------------------------
     API publica
     ---------------------------------------------------------------------- */

  function temSubtle() { return !!subtle; }

  function novoSalt() { return toHex(randomBytes(16)); }

  /** Deriva os bits da senha. Devolve Uint8Array(32). */
  function derivar(senha, saltHex, iter) {
    var saltBytes = fromHex(saltHex);
    if (subtle) {
      return subtle.importKey('raw', utf8(senha), { name: 'PBKDF2' }, false, ['deriveBits'])
        .then(function (key) {
          return subtle.deriveBits(
            { name: 'PBKDF2', salt: saltBytes, iterations: iter || ITER, hash: 'SHA-256' },
            key, 256
          );
        })
        .then(function (bits) { return new Uint8Array(bits); });
    }
    return Promise.resolve(slowHashJS(senha, saltBytes, iter || ITER_FALLBACK));
  }

  /** Cria o registro de senha para guardar {salt, hash, iter, algo} */
  function criarSenha(senha) {
    var salt = novoSalt();
    var iter = subtle ? ITER : ITER_FALLBACK;
    return derivar(senha, salt, iter).then(function (bits) {
      return { salt: salt, hash: toHex(bits), iter: iter, algo: subtle ? 'pbkdf2' : 'js' };
    });
  }

  /** Confere a senha contra o registro salvo (comparacao de tempo constante) */
  function conferirSenha(senha, reg) {
    if (!reg || !reg.salt || !reg.hash) return Promise.resolve(false);
    return derivar(senha, reg.salt, reg.iter).then(function (bits) {
      var a = toHex(bits), b = reg.hash;
      if (a.length !== b.length) return false;
      var dif = 0;
      for (var i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
      return dif === 0;
    });
  }

  /** Chave AES-GCM derivada da senha (para o cofre criptografado) */
  function chaveAES(senha, saltHex) {
    if (!subtle) return Promise.reject(new Error('Criptografia indisponivel neste navegador.'));
    return subtle.importKey('raw', utf8(senha), { name: 'PBKDF2' }, false, ['deriveKey'])
      .then(function (key) {
        return subtle.deriveKey(
          { name: 'PBKDF2', salt: fromHex(saltHex), iterations: ITER, hash: 'SHA-256' },
          key, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
      });
  }

  /** Objeto -> {iv, ct} em base64 */
  function cifrar(obj, senha, saltHex) {
    return chaveAES(senha, saltHex).then(function (key) {
      var iv = randomBytes(12);
      return subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, utf8(JSON.stringify(obj)))
        .then(function (ct) {
          return { v: 1, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
        });
    });
  }

  /** {iv, ct} -> objeto */
  function decifrar(pacote, senha, saltHex) {
    return chaveAES(senha, saltHex).then(function (key) {
      return subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(pacote.iv) }, key, fromB64(pacote.ct)
      );
    }).then(function (buf) {
      var txt = root.TextDecoder
        ? new TextDecoder().decode(buf)
        : String.fromCharCode.apply(null, new Uint8Array(buf));
      return JSON.parse(txt);
    });
  }

  /** Token aleatorio legivel (para o bot do WhatsApp) */
  function token(n) {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    var b = randomBytes(n || 28), s = '';
    for (var i = 0; i < b.length; i++) s += abc[b[i] % abc.length];
    return s;
  }

  /**
   * Forca da senha: 0 a 4, com um motivo em texto.
   * Heuristica simples e honesta — nao promete seguranca absoluta.
   */
  function forcaSenha(senha) {
    var s = String(senha || '');
    if (!s) return { nivel: 0, texto: '' };
    var pontos = 0;
    if (s.length >= 8) pontos++;
    if (s.length >= 12) pontos++;
    if (/[a-z]/.test(s) && /[A-Z]/.test(s)) pontos++;
    if (/\d/.test(s)) pontos++;
    if (/[^\w\s]/.test(s)) pontos++;
    if (/^(.)\1+$/.test(s)) pontos = 1;
    if (/^(123|abc|senha|password|qwerty)/i.test(s)) pontos = Math.min(pontos, 1);

    var nivel = Math.min(4, Math.max(1, Math.round(pontos * 0.8)));
    var textos = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'];
    return { nivel: nivel, texto: textos[nivel] };
  }

  FC.cripto = {
    temSubtle: temSubtle,
    novoSalt: novoSalt,
    criarSenha: criarSenha,
    conferirSenha: conferirSenha,
    cifrar: cifrar,
    decifrar: decifrar,
    token: token,
    forcaSenha: forcaSenha,
    toHex: toHex, fromHex: fromHex, toB64: toB64, fromB64: fromB64,
    sha256Hex: function (s) { return toHex(sha256Bytes(utf8(s))); }
  };
})(typeof self !== 'undefined' ? self : this);
