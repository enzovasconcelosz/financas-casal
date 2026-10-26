/* ==========================================================================
   teste-parser.js — confere se o interpretador entende as mensagens

   Rode com:  node teste-parser.js
   Não precisa de WhatsApp nem de servidor no ar.
   ========================================================================== */

'use strict';
const parser = require('../js/parser.js');

const casos = [
  { msg: '35,90 mercado',                          espera: { tipo: 'gasto', valor: 35.90, metodo: 'debito', cat: 'Mercado' } },
  { msg: 'gastei 89,90 na farmacia no credito',    espera: { tipo: 'gasto', valor: 89.90, metodo: 'credito', cat: 'Saúde' } },
  { msg: 'enzo 150 combustivel debito',            espera: { tipo: 'gasto', valor: 150, metodo: 'debito', cat: 'Transporte' } },
  { msg: '461,24 terno casamento credito 4/4',     espera: { tipo: 'gasto', valor: 461.24, parcela: '4/4', cat: 'Casamento' } },
  { msg: '158,18 tenis',                           espera: { tipo: 'gasto', valor: 158.18, cat: 'Vestuário' } },
  { msg: '120 tenis de presente',                  espera: { tipo: 'gasto', valor: 120, cat: 'Presentes' } },
  { msg: '39,90 notebook credito @pai',            espera: { tipo: 'gasto', valor: 39.90, terceiro: 'pai' } },
  { msg: 'recebi 4518,74 salario',                 espera: { tipo: 'receita', valor: 4518.74 } },
  { msg: 'aporte 500 tesouro selic',               espera: { tipo: 'aporte', valor: 500 } },
  { msg: 'resgatei 200 do cdb',                    espera: { tipo: 'resgate', valor: 200 } },
  { msg: 'R$ 1.234,56 dentista credito 2/6',       espera: { tipo: 'gasto', valor: 1234.56, parcela: '2/6' } },
  { msg: 'ontem 25 uber',                          espera: { tipo: 'gasto', valor: 25, cat: 'Transporte' } },
  { msg: 'saldo',                                  espera: { tipo: 'saldo' } },
  { msg: 'ajuda',                                  espera: { tipo: 'ajuda' } },
  { msg: 'oi tudo bem',                            espera: { ok: false } }
];

const ctx = {
  pessoas: [
    { id: 'p1', nome: 'Enzo', apelido: '' },
    { id: 'p2', nome: 'Giovana', apelido: '' }
  ],
  categorias: [],
  terceiros: [{ id: 't1', nome: 'Pai' }],
  investimentos: [
    { id: 'i1', nome: 'Tesouro Selic 2029' },
    { id: 'i2', nome: 'CDB Casamento' }
  ]
};

let passou = 0, falhou = 0;

console.log('\n  Testando o interpretador de mensagens\n  ' + '-'.repeat(52) + '\n');

for (const caso of casos) {
  const r = parser.interpretar(caso.msg, ctx);
  const e = caso.espera;
  const erros = [];

  if (e.ok === false) {
    if (r.ok) erros.push('devia ter falhado, mas aceitou');
  } else {
    if (r.tipo !== e.tipo) erros.push(`tipo: esperava ${e.tipo}, veio ${r.tipo}`);
    if (e.valor != null && r.valor !== e.valor) erros.push(`valor: esperava ${e.valor}, veio ${r.valor}`);
    if (e.metodo && r.metodo !== e.metodo) erros.push(`forma: esperava ${e.metodo}, veio ${r.metodo}`);
    if (e.cat && r.categoriaTexto !== e.cat) erros.push(`categoria: esperava ${e.cat}, veio ${r.categoriaTexto}`);
    if (e.parcela) {
      const p = r.parcela ? `${r.parcela.n}/${r.parcela.de}` : null;
      if (p !== e.parcela) erros.push(`parcela: esperava ${e.parcela}, veio ${p}`);
    }
    if (e.terceiro && String(r.terceiroTexto).toLowerCase() !== e.terceiro) {
      erros.push(`terceiro: esperava ${e.terceiro}, veio ${r.terceiroTexto}`);
    }
  }

  if (erros.length) {
    falhou++;
    console.log(`  ✗ "${caso.msg}"`);
    erros.forEach(x => console.log(`      ${x}`));
  } else {
    passou++;
    console.log(`  ✓ "${caso.msg}"`);
  }
}

console.log('\n  ' + '-'.repeat(52));
console.log(`  ${passou} passaram, ${falhou} falharam\n`);

if (falhou === 0) {
  console.log('  Exemplo de resposta que o bot manda de volta:\n');
  console.log(parser.confirmacao(parser.interpretar('enzo 461,24 terno casamento credito 4/4', ctx))
    .split('\n').map(l => '    ' + l).join('\n'));
  console.log('');
}

process.exit(falhou ? 1 : 0);
