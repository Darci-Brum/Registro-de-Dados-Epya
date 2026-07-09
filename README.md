# EPYA Controle de Qualidade - Darci Brum

Sistema web estático para controle operacional de inspeção de qualidade, RDO, despesas, equipes, veículo, agenda e perfis de usuários.

## Como abrir

1. Extraia o arquivo `.zip`.
2. Abra `index.html` no navegador.
3. O sistema salva os dados no próprio navegador usando `localStorage`.
4. Para evitar bloqueios de arquivos locais, também é possível rodar com um servidor simples:

```bash
python -m http.server 8080
```

Depois acesse `http://localhost:8080`.

## O que já está pronto

- Dashboard com indicadores e gráfico mensal.
- Aba de RDO com anexos, ocorrências, segurança e qualidade.
- Aba de despesas mensais com comprovantes e exportação CSV.
- Aba de colaboradores/equipes de encarregados.
- Aba de controle do carro: modelo, placa, odômetro e gastos.
- Agenda com lembrete por data e hora.
- Perfis de usuários: administrador, inspetor, encarregado e consulta.
- Backup/importação JSON.
- Layout responsivo com identidade visual inspirada na EPYA.
- Arquivo SQL para Supabase.

## Importante sobre anexos e lembretes

No modo local, arquivos pequenos são salvos dentro do navegador. Para uso real em produção, use Supabase Storage.

Os lembretes funcionam enquanto o site estiver aberto. O navegador precisa permitir notificações. Para alertas mesmo com o site fechado, será necessário backend, PWA com service worker avançado ou automação externa.

## Como migrar para Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute o arquivo `supabase_schema.sql`.
4. Crie os usuários pelo Supabase Auth.
5. Cadastre cada usuário na tabela `profiles` com o papel correto.
6. Substitua, no `js/app.js`, as funções `loadState`, `saveState`, `upsert` e `removeItem` por chamadas ao Supabase.
7. Envie anexos para o bucket `epya-anexos`.

## Segurança

O controle de usuários dentro desta versão local é apenas organizacional. Ele não protege dados de verdade. Para permissões reais, use Supabase Auth + RLS, conforme o SQL incluso.

## Personalização da marca

Não foi localizado, junto ao pacote, um manual oficial de identidade com códigos HEX públicos. Por isso a paleta foi montada com amarelo, preto e cinza escuro inspirados na presença visual pública da EPYA.
