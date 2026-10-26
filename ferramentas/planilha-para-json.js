#!/usr/bin/env node
/* ==========================================================================
   planilha-para-json.js — converte a planilha Gastos.xlsx no arquivo que o
   app importa (Ajustes › Seus dados › Importar JSON › "Atualizar com a planilha").

   Uso:
     node ferramentas/planilha-para-json.js "C:\caminho\Gastos.xlsx" [saida.json]

   O que ela entende (os três formatos que a planilha teve):
     - 2023-24: lista com colunas Pix/Débito, Crédito NuBank, Crédito BB, C6
                e um bloco "Gastos Pai/Mãe"
     - 2024-25: lista com Pix/Débito e Crédito NuBank + "Pai/Mãe"
     - 2025-26: três painéis lado a lado (débito, crédito, outros), um bloco
                por pessoa, com "Salário" em cima

   Garantias:
     - confere cada painel contra a linha SOMA da própria planilha
       (usando o model.js do app) e aborta se algo não bater;
     - ids fixos: rodar de novo com a planilha atualizada não duplica nada;
     - meses depois do mês atual são projeção e ficam de fora.

   Sem dependências: Node 18+.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');
const crypto = require('crypto');

const APP = path.resolve(__dirname, '..');
const ENTRADA = process.argv[2];
const SAIDA = process.argv[3] || path.join(path.dirname(ENTRADA || '.'), 'financas-casal-planilha.json');

if (!ENTRADA || !fs.existsSync(ENTRADA)) {
  console.error('\n  Uso: node ferramentas/planilha-para-json.js "caminho/Gastos.xlsx" [saida.json]\n');
  process.exit(1);
}

/* ------------------------------------------------ código do app */
const ctx = { console, Intl, Date, Math, JSON };
ctx.self = ctx;
vm.createContext(ctx);
for (const f of ['format.js', 'parser.js', 'seed.js', 'model.js']) {
  vm.runInContext(fs.readFileSync(path.join(APP, 'js', f), 'utf8'), ctx, { filename: f });
}
const FC = ctx.FC, fmt = FC.fmt;
const MES_ATUAL = fmt.thisMonth();

/* ======================================================================
   1. LER O .XLSX (zip + XML, sem bibliotecas)
   ====================================================================== */
function lerZip(buf) {
  let fim = buf.length - 22;
  while (fim >= 0 && buf.readUInt32LE(fim) !== 0x06054b50) fim--;
  if (fim < 0) throw new Error('Arquivo não é um .xlsx válido.');
  const qtd = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const arquivos = {};
  for (let i = 0; i < qtd; i++) {
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const nLen = buf.readUInt16LE(p + 28), xLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.slice(p + 46, p + 46 + nLen).toString('utf8');
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.slice(ini, ini + tamComp);
    arquivos[nome] = () => (metodo === 0 ? dados : zlib.inflateRawSync(dados)).toString('utf8');
    p += 46 + nLen + xLen + cLen;
  }
  return arquivos;
}

const desescapar = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const textoDe = xml => (xml.match(/<t[^>]*>[\s\S]*?<\/t>|<t[^>]*\/>/g) || [])
  .map(t => desescapar(t.replace(/<t[^>]*\/>/, '').replace(/^<t[^>]*>|<\/t>$/g, ''))).join('');
const attr = (tag, nome) => { const m = tag.match(new RegExp('\\s' + nome + '="([^"]*)"')); return m ? m[1] : null; };
const colNum = l => [...l].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const letra = c => { let s = ''; while (c) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = (c - 1 - r) / 26; } return s; };

function abrirPlanilha(arquivo) {
  const z = lerZip(fs.readFileSync(arquivo));
  const wb = z['xl/workbook.xml']();
  const s1904 = /date1904="(1|true)"/.test(wb);
  const rels = {};
  (z['xl/_rels/workbook.xml.rels']().match(/<Relationship[^>]*>/g) || [])
    .forEach(r => { rels[attr(r, 'Id')] = attr(r, 'Target'); });
  const abas = (wb.match(/<sheet [^>]*>/g) || []).map(s => {
    let alvo = rels[attr(s, 'r:id')].replace(/^\//, '');
    if (!alvo.startsWith('xl/')) alvo = 'xl/' + alvo;
    return { nome: desescapar(attr(s, 'name')), arquivo: alvo };
  });

  const textos = z['xl/sharedStrings.xml'] ? (z['xl/sharedStrings.xml']().match(/<si>[\s\S]*?<\/si>/g) || []).map(textoDe) : [];

  const nativos = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
  const proprios = {};
  const st = z['xl/styles.xml'] ? z['xl/styles.xml']() : '';
  (st.match(/<numFmt [^>]*>/g) || []).forEach(f => {
    const cod = desescapar(attr(f, 'formatCode') || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '').toLowerCase();
    proprios[+attr(f, 'numFmtId')] = /[dy]|m{3,}/.test(cod);
  });
  const xfs = ((st.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [''])[0].match(/<xf [^>]*>/g) || [])
    .map(x => { const id = +(attr(x, 'numFmtId') || 0); return nativos.has(id) || !!proprios[id]; });

  function grade(aba) {
    const xml = z[aba.arquivo]();
    const cel = new Map(), formulas = {};
    const re = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m;
    while ((m = re.exec(xml))) {
      const tag = '<c ' + m[1] + '>', dentro = m[2] || '';
      const ref = attr(tag, 'r'), tipo = attr(tag, 't') || 'n', s = +(attr(tag, 's') || 0);
      const [, l, n] = ref.match(/([A-Z]+)(\d+)/);
      const f = dentro.match(/<f[^>]*>([\s\S]*?)<\/f>/);
      if (f) formulas[ref] = desescapar(f[1]);
      const v = (dentro.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let valor;
      if (tipo === 'inlineStr') valor = textoDe(dentro);
      else if (v === undefined) continue;
      else if (tipo === 's') valor = textos[+v];
      else if (tipo === 'b') valor = v === '1';
      else if (tipo === 'str' || tipo === 'e') valor = desescapar(v);
      else {
        const num = parseFloat(v);
        valor = xfs[s] && num > 0 && num < 2958466
          ? new Date((s1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)) + num * 864e5)
          : num;
      }
      if (valor === null || valor === undefined || (typeof valor === 'string' && !valor.trim())) continue;
      cel.set(+n + ',' + colNum(l), valor);
    }
    return { cel, formulas };
  }
  return { abas, grade };
}

/* ======================================================================
   2. EXTRAIR OS BLOCOS DE CADA ABA
   ====================================================================== */
const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, abril: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const norm = fmt.norm;

function mesDaAba(nome) {
  const m = norm(nome).match(/^([a-z]+?)(\d{2,4})$/);
  if (!m || !MESES[m[1]]) return null;
  const aa = +m[2] < 100 ? 2000 + +m[2] : +m[2];
  return aa + '-' + String(MESES[m[1]]).padStart(2, '0');
}

function rotuloColuna(txt) {
  const t = norm(txt);
  if (t.includes('pix') || t.includes('debito') || t === 'valor') return { metodo: 'debito', cartao: null };
  if (t.split(/\s+/).includes('bb')) return { metodo: 'credito', cartao: 'bb' };
  if (t === 'c6') return { metodo: 'credito', cartao: 'c6' };
  if (t.includes('nubank')) return { metodo: 'credito', cartao: 'nubank' };
  return null;
}
const ehSoma = v => typeof v === 'string' && /^(soma( parcial)?|total)$/.test(norm(v));
const pessoaDoTexto = t => (norm(t).includes('giovana') ? 'Giovana' : 'Enzo');

function extrairAba(aba, { cel, formulas }) {
  const mes = mesDaAba(aba.nome);
  const get = (l, c) => cel.get(l + ',' + c);
  const linhas = [...cel.keys()].map(k => +k.split(',')[0]);
  const maxLin = Math.max(...linhas);
  const ehCab = (l, c) => {
    const v = get(l, c), prox = get(l, c + 1);
    return typeof v === 'string' && norm(v).startsWith('gastos') && typeof prox === 'string' && !!rotuloColuna(prox);
  };
  const cabs = [...new Set([...cel.keys()].filter(k => { const [l, c] = k.split(',').map(Number); return ehCab(l, c); })
    .map(k => +k.split(',')[0]))].sort((a, b) => a - b);

  const reg = { aba: aba.nome, mes, blocos: [], salarios: [] };

  for (const lc of cabs) {
    const colsG = [...cel.keys()].map(k => k.split(',').map(Number)).filter(([l, c]) => l === lc && ehCab(l, c)).map(([, c]) => c).sort((a, b) => a - b);
    let pessoaLinha = null;
    for (const cg of colsG) {
      const txt = get(lc, cg), n = norm(txt);
      const ehOutros = n.includes('outros') || n.includes('pai/mae');
      if (!pessoaLinha && !ehOutros) pessoaLinha = pessoaDoTexto(txt);

      const cols = [];
      let c = cg + 1;
      while (typeof get(lc, c) === 'string' && rotuloColuna(get(lc, c))) { cols.push(Object.assign({ col: c, rotulo: get(lc, c) }, rotuloColuna(get(lc, c)))); c++; }
      /* coluna sem rótulo logo depois (dez/23 tem valores do BB assim) */
      if (get(lc, c) === undefined) {
        let tem = false;
        for (let l = lc + 1; l <= maxLin; l++) if (typeof get(l, c) === 'number' && get(l, cg) !== undefined) tem = true;
        if (tem) cols.push({ col: c, rotulo: '(sem rótulo)', metodo: 'credito', cartao: 'inferir' });
      }

      const bloco = { cabecalho: txt, linhaCab: lc, tipo: ehOutros ? 'outros' : 'proprio', pessoa: ehOutros ? null : pessoaDoTexto(txt),
        colunas: cols, itens: [], somas: {}, absorve: [] };

      for (let l = lc + 1; l <= maxLin; l++) {
        const desc = get(l, cg);
        if (ehSoma(desc)) {
          for (const cv of cols) {
            const v = get(l, cv.col);
            if (typeof v === 'number') bloco.somas[cv.col] = Math.round(v * 100) / 100;
            /* "=SUM(E4:E23)+H16+H8": células de outro bloco somadas a este total */
            const f = formulas[letra(cv.col) + l] || '';
            const mf = f.match(/^SUM\([A-Z]+\d+:[A-Z]+\d+\)((?:\+[A-Z]+\d+)+)$/);
            if (mf) bloco.absorve.push(...mf[1].match(/[A-Z]+\d+/g));
          }
          break;
        }
        if (cabs.includes(l)) break;
        let teveValor = false;
        for (const cv of cols) {
          const v = get(l, cv.col);
          if (typeof v === 'number') {
            teveValor = true;
            bloco.itens.push({ linha: l, col: cv.col, ref: letra(cv.col) + l, desc: typeof desc === 'string' ? desc : null,
              valor: Math.round(v * 100) / 100, metodo: cv.metodo, cartao: cv.cartao });
          }
        }
        if (!teveValor && typeof desc === 'string') bloco.itens.push({ linha: l, desc, valor: null });
      }
      reg.blocos.push(bloco);
    }
    reg.blocos.filter(b => b.linhaCab === lc && b.tipo === 'outros').forEach(b => { b.pessoa = pessoaLinha || 'Enzo'; });
  }

  /* salário: "Salário ..." na coluna A, valor em B; é do bloco logo abaixo */
  for (const [k, v] of cel) {
    const [l, c] = k.split(',').map(Number);
    if (c !== 1 || typeof v !== 'string' || !norm(v).startsWith('salario')) continue;
    const valor = get(l, 2);
    if (typeof valor !== 'number') continue;
    let dono = norm(v).includes('giovana') ? 'Giovana' : norm(v).includes('enzo') ? 'Enzo' : null;
    if (!dono) {
      const abaixo = cabs.find(x => x > l);
      const b = reg.blocos.find(x => x.linhaCab === abaixo && x.tipo === 'proprio');
      dono = b ? b.pessoa : 'Enzo';
    }
    reg.salarios.push({ linha: l, pessoa: dono, valor: Math.round(valor * 100) / 100 });
  }
  return reg;
}

/* ======================================================================
   3. INTERPRETAR: parcelas, datas, terceiros, categorias
   ====================================================================== */
const RE_DE = /\(?\s*\b(\d{1,2})\s+de\s+(\d{1,2})(?:\s+parcelas?)?\s*\)?/i;
const RE_NM = /\(?\s*\b(\d{1,2})\s*\/\s*(\d{1,2})\b\s*\)?/;
const RE_DIA = /\(\s*dia\s+(\d{1,2})\s*\)/i;
const RE_DDMMM = /[-(]?\s*\b(\d{1,2})\s*\/\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\b\s*\)?/i;
const RE_NOME = /^\s*([^\-–]{2,30}?)\s*[-–]\s+(.+)$/;
const semMarca = s => String(s || '').replace(/✅/g, ' ');
const blocoPaiMae = b => /pai\s*\/\s*m[aã]e/i.test(b.cabecalho);
const textoDoItem = (desc, b) => {
  if (b.tipo !== 'outros' || blocoPaiMae(b)) return desc;
  const m = semMarca(desc).match(RE_NOME);
  return m ? m[2] : desc;
};
const baseSerie = (desc, token) => norm(semMarca(desc).replace(token, ' ')).replace(/[^a-z0-9]+/g, ' ').trim();
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 14);

function construir(abas) {
  /* séries de parcelas: "Dentista 1/6", "2/6"... em meses diferentes */
  const series = {};
  for (const a of abas) for (const b of a.blocos) for (const it of b.itens) {
    if (!it.desc) continue;
    const t = textoDoItem(it.desc, b), m = semMarca(t).match(RE_NM);
    if (m) (series[baseSerie(t, m[0]) + '|' + m[2]] = series[baseSerie(t, m[0]) + '|' + m[2]] || new Set()).add(+m[1]);
  }

  function ehParcela(m, desc, mesAba) {
    const n = +m[1], de = +m[2];
    if (/^0\d/.test(m[1]) || /^0\d/.test(m[2])) return false;     // "05/10": data
    if (n < 1 || n > de) return false;                             // "28/05": data
    if (de > 12) return true;                                      // "15/48": parcela
    const s = series[baseSerie(desc, m[0]) + '|' + m[2]];
    if (s && s.size >= 2) return true;
    const mm = +mesAba.slice(5);
    return ![mm, (mm % 12) + 1, ((mm + 10) % 12) + 1].includes(de); // "11/12" em dezembro: data
  }

  function dataValida(dia, mes, mesAba, largo) {
    let ano = +mesAba.slice(0, 4);
    const mA = +mesAba.slice(5);
    if (mes - mA > 6) ano--;
    if (mA - mes > 6) ano++;
    const d = new Date(ano, mes - 1, dia);
    if (d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
    const ini = new Date(+mesAba.slice(0, 4), mA - 1, 1), fim = new Date(+mesAba.slice(0, 4), mA, 0);
    const antes = largo ? 45 : 7, depois = largo ? 40 : 7;
    if (d < new Date(ini - antes * 864e5) || d > new Date(+fim + depois * 864e5)) return null;
    return fmt.isoOf(d);
  }

  function interpretar(raw, mesAba, largo) {
    let s = semMarca(raw), parcela = null, data = null, m = s.match(RE_DE);
    if (m && +m[1] >= 1 && +m[1] <= +m[2]) { parcela = { n: +m[1], de: +m[2] }; s = s.replace(m[0], ' '); }
    else if ((m = s.match(RE_NM)) && ehParcela(m, raw, mesAba)) { parcela = { n: +m[1], de: +m[2] }; s = s.replace(m[0], ' '); }
    if ((m = s.match(RE_DIA))) { const d = dataValida(+m[1], +mesAba.slice(5), mesAba, largo); if (d) { data = d; s = s.replace(m[0], ' '); } }
    if (!data && (m = s.match(RE_DDMMM))) { const d = dataValida(+m[1], MESES[m[2].toLowerCase().slice(0, 3)], mesAba, largo); if (d) { data = d; s = s.replace(m[0], ' '); } }
    if (!data && (m = s.match(RE_NM))) { const d = dataValida(+m[1], +m[2], mesAba, largo); if (d) { data = d; s = s.replace(m[0], ' '); } }
    s = s.replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–]+|[\s\-–]+$/g, '').trim();
    return { desc: s ? s[0].toUpperCase() + s.slice(1) : '', parcela, data };
  }

  /* ---------------- cofre base */
  const cofre = FC.seed.novoCofre('Enzo', 'Giovana', 'Nosso dinheiro');
  const [pE, pG] = cofre.casal.pessoas;
  const idPessoa = n => (n === 'Giovana' ? pG.id : pE.id);
  const ctxCat = { categorias: cofre.categorias.map(c => ({ id: c.id, nome: c.nome })) };
  const categoriaDe = desc => { const r = FC.parser.interpretar('1 ' + desc, ctxCat); return (r && r.ok && r.categoriaId) || null; };

  /* vencimentos tirados da aba jan/2024; fechamento estimado 7 dias antes */
  const cartoes = {};
  const cartao = (chave, nome, pessoa, venc) => (cartoes[chave] = cartoes[chave] || {
    id: 'card_pl_' + chave, nome, pessoaId: idPessoa(pessoa), fechamento: ((venc - 8 + 31) % 31) + 1, vencimento: venc, cor: 'var(--c3)' }).id;
  const idCartao = (tipo, pessoa, desc) => {
    if (tipo === 'inferir') tipo = /\bbb\b/i.test(desc || '') ? 'bb' : /\bc6\b/i.test(desc || '') ? 'c6' : 'nubank';
    if (tipo === 'bb') return cartao('bb', 'BB Enzo', 'Enzo', 28);
    if (tipo === 'c6') return cartao('c6', 'C6 Enzo', 'Enzo', 15);
    return pessoa === 'Giovana' ? cartao('nuG', 'Nubank Giovana', 'Giovana', 14) : cartao('nuE', 'Nubank Enzo', 'Enzo', 14);
  };
  const terceiros = {};
  const idTerceiro = nome => (terceiros[norm(nome)] = terceiros[norm(nome)] || { id: 'ter_pl_' + hash(norm(nome)), nome, obs: '' }).id;

  /* o ✅ nos "outros" só passou a ser usado a partir de certo mês; antes, sem marca = acertado */
  let corteOk = '9999-99';
  for (const a of abas) if (a.mes <= MES_ATUAL) for (const b of a.blocos) {
    if (b.tipo === 'outros' && b.itens.some(i => /✅/.test(i.desc || '')) && a.mes < corteOk) corteOk = a.mes;
  }

  const lancamentos = [];
  const rel = { futuros: 0, semValor: [], absorvidos: [], aReceber: [], semCategoria: 0 };

  for (const a of abas) {
    const mes = a.mes;
    if (mes > MES_ATUAL) { rel.futuros += a.blocos.reduce((t, b) => t + b.itens.filter(i => i.valor != null).length, 0); continue; }
    const passado = mes < MES_ATUAL;
    const absorve = new Set(a.blocos.flatMap(b => b.absorve));

    for (const s of a.salarios) {
      lancamentos.push({ id: 'pl_' + hash(a.aba + '|sal|' + s.linha), tipo: 'receita', data: mes + '-01', mes, desc: 'Salário',
        valor: s.valor, pessoaId: idPessoa(s.pessoa), metodo: 'pix', cartaoId: null, categoriaId: null, terceiroId: null,
        pago: true, reembolsado: false, parcela: null, obs: 'Da planilha (aba ' + a.aba + ')', origem: 'planilha', criadoEm: mes + '-01T00:00:00.000Z' });
    }

    for (const b of a.blocos) for (const it of b.itens) {
      if (it.valor == null) { rel.semValor.push(a.aba + ': ' + it.desc.trim()); continue; }
      const ok = /✅/.test(it.desc || '');
      let raw = it.desc || '', terceiro = null;

      if (b.tipo === 'outros') {
        const m = blocoPaiMae(b) ? null : semMarca(raw).match(RE_NOME);
        if (m) { terceiro = m[1].trim().replace(/^./, c => c.toUpperCase()); raw = m[2]; }
        else if (blocoPaiMae(b)) terceiro = /\bpai\b/i.test(raw) ? 'Pai' : (/\bmae\b/.test(norm(raw)) ? 'Mãe' : 'Pai/Mãe');
        else terceiro = 'Outros';
      }

      const info = interpretar(raw, mes, it.metodo === 'credito');
      let desc = info.desc || '(sem descrição)';
      const tipo = b.tipo === 'proprio' && it.metodo === 'debito' && /^fatura/.test(norm(desc)) ? 'fatura' : 'gasto';
      let obs = 'Da planilha (aba ' + a.aba + ')';

      /* fev/26: a fórmula da SOMA do crédito incluía estes "outros": viraram gasto próprio */
      if (b.tipo === 'outros' && absorve.has(it.ref)) {
        rel.absorvidos.push(`${a.aba}: ${terceiro} - ${desc}`);
        desc += ' (' + terceiro + ')';
        obs += '. Estava em "Outros", mas a SOMA do crédito incluía este valor.';
        terceiro = null;
      }

      let parcela = null;
      if (info.parcela) {
        const inicio = fmt.addMonths(mes, -(info.parcela.n - 1));
        parcela = { n: info.parcela.n, de: info.parcela.de,
          grupoId: 'grp_pl_' + hash(norm(desc) + '|' + (terceiro || '') + '|' + info.parcela.de + '|' + inicio) };
      }
      const reembolsado = terceiro ? (ok || mes < corteOk) : false;
      const categoriaId = tipo === 'fatura' ? null : categoriaDe(desc);
      if (!categoriaId && tipo !== 'fatura') rel.semCategoria++;
      if (terceiro && !reembolsado) rel.aReceber.push(`${a.aba}: ${terceiro} - ${desc} ${fmt.brl(it.valor)}`);

      lancamentos.push({
        id: 'pl_' + hash(a.aba + '|' + it.ref),
        tipo, data: info.data || (mes + '-01'), mes, desc, valor: it.valor,
        pessoaId: idPessoa(b.pessoa),
        metodo: it.metodo === 'debito' ? 'debito' : 'credito',
        cartaoId: it.metodo === 'debito' ? null : idCartao(it.cartao, b.pessoa, it.desc),
        categoriaId, terceiroId: terceiro ? idTerceiro(terceiro) : null,
        pago: tipo === 'fatura' ? true : (ok || passado),
        reembolsado, parcela, obs, origem: 'planilha', criadoEm: mes + '-01T00:00:00.000Z'
      });
    }
  }

  cofre.lancamentos = lancamentos;
  cofre.cartoes = Object.values(cartoes);
  cofre.terceiros = Object.values(terceiros).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
  cofre.meta.mesInicial = abas.map(a => a.mes).sort()[0];
  return { cofre, rel, corteOk };
}

/* ======================================================================
   4. CONFERIR CONTRA AS SOMAS DA PLANILHA (com o model.js do app)
   ====================================================================== */
function conferir(abas, cofre) {
  const [pE, pG] = cofre.casal.pessoas;
  const idPessoa = n => (n === 'Giovana' ? pG.id : pE.id);
  const falhas = [];
  let ok = 0;
  const confere = (rot, esp, obt) => (Math.abs(esp - obt) < 0.015 ? ok++ : falhas.push(`${rot}: planilha ${esp.toFixed(2)}, convertido ${obt.toFixed(2)}`));

  for (const a of abas) {
    if (a.mes > MES_ATUAL) continue;
    for (const nome of ['Enzo', 'Giovana']) {
      const blocos = a.blocos.filter(b => b.pessoa === nome);
      if (!blocos.length) continue;
      const pn = FC.model.paineis(cofre, a.mes, idPessoa(nome));
      const soma = (tipo, metodo) => blocos.filter(b => b.tipo === tipo).reduce((t, b) => t + b.colunas
        .filter(c => !metodo || c.metodo === metodo)
        .reduce((u, c) => u + (c.col in b.somas ? b.somas[c.col] : b.itens.filter(i => i.col === c.col && i.valor != null).reduce((v, i) => v + i.valor, 0)), 0), 0);
      const refsAbs = new Set(a.blocos.flatMap(b => b.absorve));
      const absorvido = blocos.filter(b => b.tipo === 'outros').flatMap(b => b.itens).filter(i => refsAbs.has(i.ref)).reduce((t, i) => t + i.valor, 0);

      confere(`${a.aba} ${nome} débito/Pix`, soma('proprio', 'debito'), pn.totalDebito + pn.totalFaturas);
      confere(`${a.aba} ${nome} crédito`, soma('proprio', 'credito'), pn.totalCredito);
      confere(`${a.aba} ${nome} outros`, soma('outros') - absorvido, pn.totalOutros);
      confere(`${a.aba} ${nome} salário`, a.salarios.filter(s => s.pessoa === nome).reduce((t, s) => t + s.valor, 0), pn.totalReceitas);
    }
  }
  return { ok, falhas };
}

/* ======================================================================
   EXECUÇÃO
   ====================================================================== */
const pl = abrirPlanilha(ENTRADA);
const abas = [], ignoradas = [];
for (const aba of pl.abas) {
  if (!mesDaAba(aba.nome)) { ignoradas.push(aba.nome); continue; }
  abas.push(extrairAba(aba, pl.grade(aba)));
}
abas.sort((x, y) => (x.mes < y.mes ? -1 : 1));

const { cofre, rel, corteOk } = construir(abas);
const conf = conferir(abas, cofre);

console.log('\n  Planilha: ' + path.basename(ENTRADA));
console.log('  abas lidas: ' + abas.length + ' (' + abas[0].mes + ' a ' + abas[abas.length - 1].mes + ')' + (ignoradas.length ? ' | ignoradas: ' + ignoradas.join(', ') : ''));
console.log('  mês atual: ' + MES_ATUAL + ' — ' + rel.futuros + ' itens de meses futuros ficaram de fora (projeção)');
console.log('  conferência com as SOMAs: ' + conf.ok + ' batem, ' + conf.falhas.length + ' diferem');
conf.falhas.forEach(f => console.log('    ✗ ' + f));

if (conf.falhas.length) {
  console.error('\n  Nada foi gravado: a conversão não bate com a planilha. Me mostre essas linhas.\n');
  process.exit(2);
}

cofre._origem = 'planilha';
cofre._geradoEm = new Date().toISOString();
fs.writeFileSync(SAIDA, JSON.stringify(cofre, null, 2), 'utf8');

const porAno = {};
cofre.lancamentos.forEach(l => { porAno[l.mes.slice(0, 4)] = (porAno[l.mes.slice(0, 4)] || 0) + 1; });
console.log('  lançamentos: ' + cofre.lancamentos.length + '  ' + JSON.stringify(porAno));
console.log('  com parcela: ' + cofre.lancamentos.filter(l => l.parcela).length +
            ' | de terceiros: ' + cofre.lancamentos.filter(l => l.terceiroId).length +
            ' | sem categoria: ' + rel.semCategoria);
if (rel.semValor.length) console.log('  linhas sem valor (puladas): ' + rel.semValor.join(' | '));
if (rel.absorvidos.length) console.log('  "outros" contados como gasto próprio (pela fórmula da SOMA): ' + rel.absorvidos.join(' | '));
if (rel.aReceber.length) console.log('  ficaram "a receber" (sem ✅ desde ' + corteOk + '): ' + rel.aReceber.join(' | '));
console.log('\n  ✓ ' + SAIDA);
console.log('  No app: Ajustes › Seus dados › Importar JSON › "Atualizar com a planilha"\n');
