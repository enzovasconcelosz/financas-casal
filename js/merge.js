/* ==========================================================================
   merge.js — mesclagem de 3 vias para a sincronização entre aparelhos

   base   = o último estado que os dois lados concordaram (último sync)
   local  = o que este aparelho tem agora
   remoto = o que está na nuvem agora

   Regra, para cada lançamento, categoria, cartão... (pelo id):
     - só um lado mudou desde a base  -> fica a mudança desse lado
     - os dois mudaram o mesmo item   -> mescla campo a campo; se os dois
                                         mexeram no MESMO campo, vale o local
     - um apagou e o outro editou     -> a edição sobrevive
     - os dois criaram coisas novas   -> fica tudo

   Assim o Enzo lança no celular dele e a Giovana no dela, ao mesmo tempo,
   e nada se perde. Roda no navegador (FC.merge) e no Node (testes).
   ========================================================================== */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  var FC = (raiz.FC = raiz.FC || {});
  FC.merge = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* campos que são de cada aparelho e não viajam para a nuvem */
  var LOCAIS = {
    config: ['tema', 'criptografado', 'travarAoFechar'],
    /* carimbo de "salvei agora": se viajasse, cada salvamento viraria mudança
       e os dois aparelhos ficariam reenviando um para o outro sem parar */
    meta: ['atualizadoEm']
  };
  /* campo interno: guarda a base da sincronização dentro do próprio cofre */
  var CAMPO_SYNC = '_sync';

  function ehObjeto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /** JSON com chaves em ordem: dois objetos iguais dão o mesmo texto */
  function estavel(v) {
    if (Array.isArray(v)) return '[' + v.map(estavel).join(',') + ']';
    if (ehObjeto(v)) {
      return '{' + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort()
        .map(function (k) { return JSON.stringify(k) + ':' + estavel(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  function igual(a, b) {
    if (a === b) return true;
    if (a === undefined || b === undefined) return false;
    return estavel(a) === estavel(b);
  }

  /** lista em que todo item é objeto com id: dá para mesclar item a item */
  function listaComId(arr) {
    return Array.isArray(arr) && arr.every(function (x) { return ehObjeto(x) && x.id != null; });
  }

  function porId(arr) {
    var m = {};
    (arr || []).forEach(function (x) { m[x.id] = x; });
    return m;
  }

  function mesclarLista(b, l, r) {
    var mb = porId(b), ml = porId(l), mr = porId(r);
    /* ordem: a do remoto, depois os novos do local */
    var ids = [];
    var visto = {};
    (r || []).concat(l || []).concat(b || []).forEach(function (x) {
      if (!visto[x.id]) { visto[x.id] = true; ids.push(x.id); }
    });

    var out = [];
    ids.forEach(function (id) {
      var v = mesclar3(mb[id], ml[id], mr[id]);
      if (v !== undefined) out.push(v);
    });
    return out;
  }

  /**
   * Mescla um valor qualquer. undefined = "não existe" (apagado ou nunca criado).
   */
  function mesclar3(b, l, r) {
    if (igual(l, r)) return l;
    if (igual(l, b)) return r;          // só o remoto mudou (ou apagou)
    if (igual(r, b)) return l;          // só o local mudou (ou apagou)

    /* os dois mudaram */
    if (l === undefined) return r;      // apagou aqui, editou lá: fica a edição
    if (r === undefined) return l;

    if (listaComId(l) && listaComId(r) && (b === undefined || listaComId(b))) {
      return mesclarLista(b || [], l, r);
    }
    if (ehObjeto(l) && ehObjeto(r)) {
      var bo = ehObjeto(b) ? b : {};
      var chaves = {};
      Object.keys(bo).concat(Object.keys(l), Object.keys(r)).forEach(function (k) { chaves[k] = true; });
      var o = {};
      Object.keys(chaves).forEach(function (k) {
        var v = mesclar3(bo[k], l[k], r[k]);
        if (v !== undefined) o[k] = v;
      });
      return o;
    }
    return l;                           // mesmo campo nos dois lados: vale o local
  }

  /** Cópia do cofre sem o que é só deste aparelho (é isso que vai para a nuvem) */
  function paraNuvem(cofre) {
    if (!cofre) return cofre;
    var c = JSON.parse(JSON.stringify(cofre));
    delete c[CAMPO_SYNC];
    Object.keys(LOCAIS).forEach(function (sec) {
      if (c[sec]) LOCAIS[sec].forEach(function (k) { delete c[sec][k]; });
    });
    return c;
  }

  /** Devolve ao resultado os campos deste aparelho que estavam em `local` */
  function restaurarLocais(resultado, local) {
    Object.keys(LOCAIS).forEach(function (sec) {
      if (!local || !local[sec]) return;
      resultado[sec] = resultado[sec] || {};
      LOCAIS[sec].forEach(function (k) {
        if (local[sec][k] !== undefined) resultado[sec][k] = local[sec][k];
      });
    });
    return resultado;
  }

  /**
   * Mescla cofres inteiros.
   * @param base   último estado sincronizado (ou null na primeira vez)
   * @param local  cofre deste aparelho
   * @param remoto cofre da nuvem
   * @returns cofre mesclado, já com os campos locais deste aparelho
   */
  function mesclarCofres(base, local, remoto) {
    var b = base ? paraNuvem(base) : undefined;
    var l = paraNuvem(local);
    var r = paraNuvem(remoto);
    var m = b === undefined ? mesclarSemBase(l, r) : mesclar3(b, l, r);
    return restaurarLocais(m, local);
  }

  /**
   * Sem base (primeira vez que dois aparelhos com dados se encontram):
   * junta as listas sem apagar nada; nos campos simples vale o remoto.
   */
  function mesclarSemBase(l, r) {
    if (listaComId(l) && listaComId(r)) {
      var ml = porId(l), mr = porId(r), out = [], visto = {};
      r.concat(l).forEach(function (x) {
        if (visto[x.id]) return;
        visto[x.id] = true;
        out.push(mr[x.id] && ml[x.id] ? mesclarSemBase(ml[x.id], mr[x.id]) : x);
      });
      return out;
    }
    if (ehObjeto(l) && ehObjeto(r)) {
      var o = {};
      Object.keys(l).concat(Object.keys(r)).forEach(function (k) {
        if (k in o) return;
        o[k] = !(k in r) ? l[k] : !(k in l) ? r[k] : mesclarSemBase(l[k], r[k]);
      });
      return o;
    }
    return r === undefined ? l : r;
  }

  /** Há algo no local que o remoto ainda não tem? */
  function temNovidade(local, remoto) {
    return !igual(paraNuvem(local), paraNuvem(remoto));
  }

  return {
    mesclar3: mesclar3,
    mesclarCofres: mesclarCofres,
    paraNuvem: paraNuvem,
    restaurarLocais: restaurarLocais,
    temNovidade: temNovidade,
    igual: igual,
    estavel: estavel,
    CAMPO_SYNC: CAMPO_SYNC
  };
});
