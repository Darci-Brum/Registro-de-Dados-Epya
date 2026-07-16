# EPYA Controle de Qualidade - Darci Brum

Sistema web para controle de qualidade, RDO, despesas, equipes, veículo, agenda, usuários e perfis, agora com integração ao Supabase.

## O que foi adicionado nesta versão

- Tela de login com Supabase Auth.
- Primeiro acesso para usuários pré-cadastrados pelo administrador.
- Perfis de acesso: `admin`, `analista` e `consulta`.
- Administrador principal: `DarciBrum3010@gmail.com`.
- Botão de tema claro/escuro na parte superior.
- Aba **Ponto e horas extras** com jornada fixa, lançamentos diários e gráficos por dia, semana e mês.
- Valores por hora separados para trabalho antes da entrada e após a saída, com totais financeiros por dia, semana e mês.
- Modo TV disponível na aba que estiver aberta, com atualização automática dos dados a cada dois minutos.
- Sincronização dos dados do site com tabelas do Supabase.
- Botões para atualizar dados do Supabase e enviar backup local para o banco.
- SQL completo com tabelas, RLS e funções de segurança.

## Configuração já preenchida no código

Projeto Supabase usado no `js/app.js`:

```js
SUPABASE_PROJECT_URL = 'https://eerebnizeuwxxqoxhjqh.supabase.co'
SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dvp7n399kM679L0dXf9R8w_1ih-WiWY'
```

> Observação: a chave publishable/anon pode ficar no front-end. Nunca coloque chave `service_role` no navegador.

## Como ativar o banco de dados

1. Abra o Supabase.
2. Entre no projeto `eerebnizeuwxxqoxhjqh`.
3. Vá em **SQL Editor**.
4. Copie e execute todo o conteúdo do arquivo `supabase_schema.sql`.
5. Vá em **Authentication > Users**.
6. Crie o usuário `DarciBrum3010@gmail.com` com uma senha.
7. Confirme o e-mail do usuário, caso a confirmação esteja ativada.
8. Abra o arquivo `index.html` e entre com o e-mail e senha criados.

## Como cadastrar outros usuários

1. Entre como `DarciBrum3010@gmail.com`.
2. Abra a aba **Usuários e perfis**.
3. Cadastre nome, e-mail, perfil e status.
4. O usuário cadastrado deve abrir a tela de login e clicar em **Primeiro acesso**.
5. Ele informa nome, e-mail cadastrado e cria a própria senha.

## Perfis disponíveis

- **Admin**: acessa tudo, cria usuários e edita dados.
- **Analista**: cria e edita RDO, despesas, equipes, veículo e agenda.
- **Consulta**: apenas visualiza os dados.

## Arquivos principais

- `index.html`: estrutura do sistema e tela de login.
- `css/styles.css`: tema visual, responsividade e modo claro/escuro.
- `js/app.js`: regras do sistema, Supabase Auth e operações no banco.
- `supabase_schema.sql`: tabelas, políticas RLS, funções e usuário admin inicial.
- `assets/epya-emblema.svg`: emblema visual inspirado na identidade EPYA.

## Observação sobre anexos

Os anexos pequenos continuam sendo salvos como JSON/base64 nas tabelas para facilitar o uso inicial. Para uso pesado em produção, o ideal é migrar anexos para o Supabase Storage e guardar apenas os links nas tabelas.

## Como publicar

Você pode subir a pasta em qualquer hospedagem estática, como Netlify, Vercel, GitHub Pages ou um servidor interno. O Supabase será o banco e sistema de autenticação.


## Exportação para Excel, PDF e WhatsApp

A versão atualizada inclui, na aba **Backup / Supabase**, três ações novas:

- **Baixar Excel completo**: gera um arquivo `.xlsx` com abas separadas para Dashboard, RDO, Despesas, Equipes, Veículo, Gastos do Veículo, Ponto/Horas Extras, Agenda e Usuários.
- **Baixar PDF do relatório**: gera um relatório PDF direto no navegador.
- **Enviar PDF pelo WhatsApp**: no celular, tenta abrir o compartilhamento nativo já com o PDF anexado. Em computadores, por segurança do navegador, o sistema baixa o PDF e abre o WhatsApp Web com uma mensagem pronta para você anexar o arquivo manualmente.

Essas funções usam bibliotecas públicas via CDN no final do `index.html`: SheetJS para Excel e jsPDF para PDF. Se o navegador estiver sem internet ou bloqueando CDN, os botões avisam que a biblioteca não carregou.

## Ponto e horas extras

Na aba **Ponto e horas extras**, cada usuário configura a própria entrada e saída fixas. O sistema calcula separadamente:

- tempo trabalhado antes da entrada prevista;
- tempo trabalhado depois da saída prevista;
- total de horas extras no dia, na semana e no mês;
- comparativos gráficos diários, semanais e mensais.
- valor por hora e total financeiro de cada tipo de hora extra.

O horário fixo e os valores por hora usados em cada lançamento ficam salvos junto ao ponto, então alterações futuras na jornada ou nas tarifas não mudam cálculos antigos. Os valores padrão podem ser ajustados em cada lançamento para representar exceções. A tela também possui exemplos explicativos e um botão para preencher sete dias úteis de demonstração.


## Atualização v6

- Login mais limpo e corporativo, usando a locomotiva cinza/laranja como fundo principal.
- Topo do painel com destaque maior para EPYA Infraestrutura.
- Menu lateral com ícones corporativos.
- Dashboard com cartões de indicadores mais profissionais.
- Gráficos mantidos para RDO, gastos e visitas às equipes.
