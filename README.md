# Backlog — versão web

Página única, sem backend. Os dados ficam no `localStorage` do navegador
de quem usa. A chave da RAWG é digitada pela própria pessoa e também fica
só no navegador dela — nunca entra no código.

## Publicar no Vercel

1. Crie um repositório no GitHub e suba esta pasta (`index.html`, `manifest.json`).
2. Em vercel.com, "Add New… → Project" e importe o repositório.
3. Framework Preset: **Other**. Sem build command, sem output directory.
4. Deploy. Sai um endereço `.vercel.app`.

Cada `git push` republica sozinho.

## Usar no celular

Abra o endereço, menu do navegador → "Adicionar à tela inicial".
Abre em tela cheia, sem barra de endereço.

## Limites conhecidos

- Dados presos a um navegador. Trocou de aparelho, começa vazio.
  Use Exportar/Importar em Configuração para mover.
- Não é compartilhado. Cada pessoa tem a própria lista.
  Compartilhar exige banco de dados — é o próximo passo.
- Janela anônima bloqueia o armazenamento; o app avisa com uma faixa.

## Quando entrar o Supabase

Toda a persistência está isolada num bloco só, no início do `<script>`,
marcado como CAMADA DE DADOS. São quatro funções: `guardar`, `ler`,
`salvarJogos` e `carregar`. O resto do app não sabe de onde os dados vêm.
Trocar `localStorage` por chamadas ao Supabase mexe só ali.
