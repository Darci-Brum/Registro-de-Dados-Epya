# Ferrovia Engenharia — Site institucional premium

Projeto em **HTML, CSS e JavaScript puro**, pronto para publicar no **GitHub Pages**.

## O que vem no projeto

- `index.html` — página institucional moderna e corporativa.
- `controle.html` — área de controle operacional com:
  - controle de equipes;
  - abastecimentos;
  - gastos mensais;
  - KPIs;
  - gráficos;
  - formulários para novos lançamentos;
  - exportação CSV.
- `css/style.css` — identidade visual premium com preto, grafite, cinza claro e amarelo/dourado.
- `js/app.js` — menu mobile, header fixo e navegação.
- `js/data.js` — dados demonstrativos editáveis.
- `js/controle.js` — lógica do dashboard operacional.
- `assets/` — logo e imagens vetoriais de ferrovia, trilhos, viadutos e manutenção.

## Como editar os dados

Edite o arquivo:

```txt
js/data.js
```

Você pode trocar nomes de equipes, locais, supervisores, gastos e abastecimentos.

A página `controle.html` também permite adicionar abastecimentos e gastos direto pelo navegador. Esses lançamentos são salvos via `localStorage`, ou seja, ficam no navegador usado.

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos deste projeto para o repositório.
3. Vá em **Settings**.
4. Acesse **Pages**.
5. Em **Build and deployment**, escolha:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
6. Salve e aguarde o link do GitHub Pages.

## Observação

Os nomes, indicadores, clientes e dados de controle são demonstrativos. Troque pelos dados reais da sua empresa antes de publicar oficialmente.
