# Finanças do Casal

Controle de gastos de casal no navegador: uma aba para cada um, uma aba do casal,
investimentos, relatórios em PDF e um bot de WhatsApp opcional.

Feito para quem já controlava em planilha: cada aba tem os mesmos três painéis
— **débito/dinheiro/Pix**, **crédito** e **outros (cartão emprestado)** — cada um
com a sua SOMA no rodapé.

---

## Começar

**Não precisa instalar nada.** Abra o `index.html` com dois cliques e pronto.

Na primeira vez, o site pede para criar o acesso: nome do painel, nome de vocês
dois, e-mail e senha. Essa senha vale para os dois e é pedida toda vez que o
site abre.

> **Não existe "esqueci minha senha".** Não há servidor nem banco de dados: se a
> senha se perder, o acesso àquele painel se perde junto. Anote em lugar seguro.

### Três passos para o número do patrimônio ficar certo

1. **Ajustes › Saldo em conta** — diga quanto há hoje em cada conta e a partir
   de que data. É desse ponto que o app parte.
2. **Ajustes › Cartões** — cadastre com o dia do fechamento, para a compra cair
   na fatura certa.
3. **Lance o primeiro gasto** — pelo botão *Lançar*, pela tecla `N`, ou digitando
   direto na última linha de cada painel, como na planilha.

---

## Publicar

É um site estático: qualquer hospedagem serve.

### GitHub Pages

```bash
cd financas-casal
git init
git add .
git commit -m "Finanças do casal"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/financas-casal.git
git push -u origin main
```

Depois, em **Settings › Pages**, escolha a branch `main` e a pasta `/ (root)`.
Em poucos minutos fica no ar em `https://SEU-USUARIO.github.io/financas-casal/`.

### Netlify ou Vercel

Conecte o repositório do GitHub (assim o `.gitignore` é respeitado). Não há etapa
de build.

> **Não arraste a pasta inteira para o Netlify.** O arrastar ignora o
> `.gitignore`: o `bot/.env` — com o token do bot e as chaves do WhatsApp — iria
> junto e ficaria legível por qualquer um em `seu-site/bot/.env`. Se quiser
> arrastar, faça uma cópia da pasta **sem a subpasta `bot/`**. O site não precisa
> dela para funcionar.

Depois de publicar uma versão nova, se o navegador continuar mostrando a antiga,
use `Ctrl + F5`.

### Instalar no celular

Com o site no ar por HTTPS, abra no celular e use *Adicionar à tela de início*.
Ele abre em tela cheia, com ícone próprio, e funciona sem internet.

> **Cuidado ao publicar:** o endereço fica público. A senha protege a tela, mas
> não é uma barreira forte — qualquer pessoa com acesso ao navegador de vocês
> consegue ver os dados. Não coloque no ar nada que você não colocaria num papel
> na geladeira.

---

## Onde ficam os dados

Cada aparelho guarda uma cópia completa no **localStorage do navegador**, e o
app funciona sem internet.

**Para os dois celulares verem o mesmo painel, ligue a sincronização** — um
projeto gratuito no Firebase, uns 10 minutos: [SINCRONIZACAO.md](SINCRONIZACAO.md).
Os dados vão para a nuvem compactados e **criptografados no próprio aparelho**
(nem a senha nem os lançamentos chegam legíveis ao Google), e as mudanças dos
dois lados se juntam sem perder nada, mesmo lançando ao mesmo tempo.

Sem a sincronização ligada, cada aparelho é independente: o que se lança num não
aparece no outro, e limpar os dados do navegador apaga tudo daquele aparelho.

Com ou sem sincronização, vale baixar de vez em quando **Ajustes › Seus dados ›
Baixar backup (JSON)**. O app lembra a cada 30 dias.

Há também exportação em **CSV** na tela de Relatórios, que abre direto no Excel
e no Google Planilhas.

### Criptografar (opcional)

Em **Ajustes › Acesso e segurança** dá para guardar os dados embaralhados
(AES-GCM, chave derivada da senha). Aí nem com acesso ao navegador se lê o
conteúdo. Em troca: senha perdida, dados perdidos, sem recuperação. O app obriga
a baixar um backup antes de ligar.

---

## Como as contas são feitas

O ponto delicado é não contar o mesmo gasto duas vezes:

| Situação | O que acontece |
|---|---|
| Gasto no débito, Pix ou dinheiro | sai da conta no dia |
| Gasto no crédito | vira fatura; **não** sai da conta ainda |
| Pagamento da fatura | sai da conta, mas **não** conta como gasto novo |
| Gasto de terceiro no cartão | entra na fatura, fica fora dos seus gastos, e vira "a receber" |

Por isso, no painel de débito você vê os dois números: a **soma** (tudo que saiu
da conta, igual à sua planilha) e, embaixo, quanto daquilo foi **gasto do mês** e
quanto foi **pagamento de fatura**.

O patrimônio do casal é:

```
saldo em conta  +  investido  +  a receber  −  fatura em aberto
```

E pode ficar negativo, se a fatura em aberto passar do resto.

### Cartão emprestado

Quando alguém usa o cartão de vocês, marque a pessoa no campo **Quem usou**. O
gasto sai dos seus totais, entra na fatura (porque você precisa pagar) e aparece
como "a receber" até você marcar o ✓ de acertado — que é a coluna *Outros* da
sua planilha, com a *SOMA PARCIAL*.

### Fatura

No painel de crédito, **Marcar fatura como paga** faz duas coisas: marca os itens
daquela fatura como pagos e lança a saída do dinheiro da conta, numa linha só.
Exatamente o que você fazia escrevendo "Fatura nubank ago/26" no débito.

---

## Recursos

**Abas** — nome, apelido, foto e cor por pessoa (Ajustes ou botão *Editar aba*).
A cor tinge os painéis e os gráficos daquela aba.

**Mês a mês** — setas na barra de cima, ou clique no nome do mês para o
calendário. `←` e `→` também andam. Um ponto marca os meses que já têm dados.

**Parcelas** — no lançamento, escolha *Parcelado*: o app cria as parcelas nos
meses seguintes. Dá para informar o **total da compra** (a última parcela fecha o
centavo) ou o **valor de cada parcela**, e **começar de uma parcela no meio**
("estou na 3 de 10"). Vale para cartão e também para carnê, boleto e
financiamento no débito/Pix. Ao editar uma parcela, dá para levar a mudança às
parcelas seguintes.

**Assinaturas** — escolha *Todo mês* no lançamento, ou cadastre em *Faturas ›
Assinaturas*. Nos meses futuros elas aparecem como **previstas** (tracejadas nos
painéis) e entram na previsão das faturas; quando o mês chega, viram lançamento de
verdade sozinhas, e você pode ajustar só aquele mês. Se o gasto já estiver lançado
no mês, ele é adotado, não duplicado. Encerrar mantém o histórico.

**Faturas futuras** — a aba *Faturas* mostra os próximos 12 meses: quanto de cada
fatura já está comprometido com parcelas e assinaturas, por pessoa e por cartão
(ou incluindo débito/Pix). Lista também os parcelamentos em andamento e:

- **completa parcelas que faltam** — compras como "Dentista 2/6" que só têm a
  parcela do mês lançada (comum no histórico importado da planilha) não entram na
  previsão até as próximas serem lançadas; *Completar* faz isso com o valor da última;
- **sugere assinaturas** — gastos com o mesmo nome e valor estável em 3 dos
  últimos 4 meses (Spotify, seguro, plano de celular).

O patrimônio desconta separadamente a *fatura em aberto* (até o mês atual) e as
*parcelas a vencer* (já lançadas para os meses seguintes). Assinaturas futuras não
entram no patrimônio: ainda não são dívida.

**Investimentos** — cadastre cada aplicação e registre aporte, resgate e
rendimento. O saldo sai dessas movimentações. Tem donut de alocação, evolução da
carteira e o rendimento sobre o aportado.

**Relatórios** — filtra por período, pessoa, categoria e forma de pagamento.
Exporta **PDF** (baixa o arquivo) ou **Imprimir** (funciona sem internet, e o
navegador oferece "Salvar como PDF"). E **CSV** para planilha.

**Educação financeira** — 26 dicas gerais que giram por dia, mais Selic, CDI e
dólar. Os indicadores se atualizam sozinhos no Banco Central (série SGS 432) e na
AwesomeAPI; sem internet, ficam os últimos valores com a data. É conteúdo
informativo, não recomendação de investimento.

**Temas** — claro e escuro, pelo botão do sol/lua ou em Ajustes (com a opção de
seguir o sistema).

**WhatsApp** — veja a pasta [`bot/`](../bot/README.md). E mesmo sem servidor:
*Caixa de entrada › Colar mensagem* usa o mesmo interpretador.

### Atalhos de teclado

| Tecla | O quê |
|---|---|
| `N` | novo lançamento |
| `←` `→` | mês anterior / próximo |
| `1`–`7` | pular entre as abas |
| `L` | bloquear |
| `Esc` | fechar a janela aberta |
| `Enter` | salvar o formulário / a linha rápida |

---

## Vários painéis no mesmo navegador

Cada e-mail é um painel separado, com senha própria e dados próprios. Quem entra
com um e-mail vê só o painel daquele e-mail. Dá para ter o painel do casal e um
pessoal no mesmo navegador, sem um enxergar o outro.

---

## Como o projeto é feito

HTML, CSS e JavaScript puros. Sem framework, sem build, sem `npm install`.
Os gráficos são SVG escritos à mão.

```
financas-casal/
├── index.html
├── manifest.webmanifest      instalar como app no celular
├── sw.js                     funcionar sem internet
├── css/
│   ├── tokens.css            cores, temas e paletas por pessoa
│   ├── base.css              reset e elementos
│   ├── layout.css            topo, abas, grades, nav do celular
│   ├── components.css        cartões, tabelas, formulários, modais
│   ├── charts.css            gráficos
│   └── print.css             relatório impresso
├── js/
│   ├── format.js             dinheiro, datas e meses em pt-BR
│   ├── dom.js                mini biblioteca de DOM e ícones
│   ├── crypto.js             senha (PBKDF2) e criptografia opcional
│   ├── parser.js             interpretador de mensagens (site + bot)
│   ├── seed.js               categorias, dicas e indicadores iniciais
│   ├── store.js              contas, cofre e localStorage
│   ├── merge.js              mesclagem de 3 vias entre aparelhos
│   ├── nuvem.js              sincronização com o Firebase (REST, criptografada)
│   ├── nuvem-config.js       apiKey e projectId do SEU Firebase
│   ├── model.js              todas as regras de cálculo
│   ├── ui.js                 modais, avisos, peças reaproveitadas
│   ├── charts.js             área, barras, donut, sparkline, mapa de calor
│   ├── indicators.js         Selic e dólar
│   ├── sync.js               caixa de entrada do WhatsApp
│   ├── pdf.js                relatório em PDF e impressão
│   ├── forms.js              janelas de cadastro
│   ├── views/                uma tela por arquivo
│   └── app.js                rotas, abas e navegação por mês
└── bot/                      servidor de WhatsApp (opcional)
```

A única dependência externa é a biblioteca de PDF (jsPDF), buscada de CDN só
quando você clica em *Baixar PDF*. Sem internet, o botão *Imprimir* faz o mesmo
trabalho.

### Mexer no código

- **Categorias padrão** e **dicas**: `js/seed.js`
- **Cores das abas**: `ACENTOS` em `js/seed.js` e os blocos `[data-accent]` em `css/tokens.css`
- **Vocabulário do WhatsApp**: `SINONIMOS` em `js/parser.js` (vale para o site e para o bot)
- **Regras de cálculo**: `js/model.js`, que é o único lugar onde os números são decididos

Depois de mexer, troque a `VERSAO` no `sw.js` para o navegador buscar os arquivos
novos em vez do cache.

---

## Limites conhecidos

- O localStorage tem cerca de 5 MB por site. Fotos de perfil são reduzidas para
  320px antes de guardar, mas milhares de lançamentos com anotação longa podem
  chegar perto do limite. O app avisa se isso acontecer.
- O saldo em conta parte da data que você informar. Meses anteriores a essa data
  mostram o mesmo valor de partida no gráfico de patrimônio — não há como o app
  saber o que havia antes.
- A previsão só enxerga o que está lançado ou cadastrado: compras que ainda vão
  acontecer (mercado, combustível) não entram. É o piso da fatura, não o valor final.
- "Completar parcelas" repete o valor da última parcela. Se as próximas tiverem
  valor diferente (juros, arredondamento da loja), ajuste editando e marcando
  *aplicar às parcelas seguintes*.
- Os indicadores dependem de APIs públicas gratuitas. Se saírem do ar ou mudarem
  de formato, o app mantém os últimos valores e mostra a data — não inventa
  número.
