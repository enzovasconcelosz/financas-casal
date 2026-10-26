<div align="center">

<img src="assets/icon.svg" width="88" alt="Finanças do Casal">

# Finanças do Casal

**O controle de gastos do casal, do jeito da planilha — só que melhor.**

Uma aba para cada um, uma aba do casal, cartão, investimentos e a previsão das próximas faturas.

![HTML](https://img.shields.io/badge/HTML%2FCSS%2FJS-puro-1ecb8b)
![Sem build](https://img.shields.io/badge/build-nenhum-38bdf8)
![PWA](https://img.shields.io/badge/instala-no%20celular-a78bfa)
![Criptografado](https://img.shields.io/badge/dados-criptografados-f5b544)

</div>

---

## O que tem

- 🧾 **Painéis como na planilha** — débito/Pix, crédito e "outros" (cartão emprestado), cada um com a sua soma
- 💳 **Parcelado e assinaturas** — lance 10x e as parcelas aparecem nos meses seguintes
- 🔮 **Faturas futuras** — quanto de cada fatura já está comprometido
- 📈 **Investimentos** — aportes, resgates, rendimento e alocação
- 💰 **Patrimônio do casal** — conta + investido + a receber − fatura
- 📄 **Relatórios** em PDF e CSV
- 📱 **Sincroniza os dois celulares**, com os dados criptografados no próprio aparelho
- 💬 **Lança pelo WhatsApp** (opcional): `35,90 mercado credito`
- 🌗 Tema claro e escuro, funciona sem internet

## Como usar

Abra o `index.html` — não precisa instalar nada.

Para publicar e usar no celular, basta qualquer hospedagem de site estático, como o
**GitHub Pages**: *Settings › Pages › branch `main`*.

Para os dois celulares verem os mesmos dados, siga o
[guia de sincronização](docs/SINCRONIZACAO.md) (Firebase gratuito, uns 10 minutos).

## Documentação

| | |
|---|---|
| [Manual completo](docs/MANUAL.md) | todos os recursos, como as contas são feitas, atalhos |
| [Sincronização](docs/SINCRONIZACAO.md) | ligar os dois celulares |
| [Bot do WhatsApp](bot/README.md) | anotar gastos por mensagem |

## Privacidade

Os dados ficam no aparelho. Com a sincronização ligada, vão para a nuvem
**criptografados com a senha de vocês** — nem o Google consegue ler.
Não existe "esqueci minha senha": guardem-na bem e façam backup de vez em quando.
