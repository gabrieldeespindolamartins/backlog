# Backlog compartilhado

App web para acompanhar jogos, livros, filmes e séries — sozinho ou
compartilhado com outra pessoa.

HTML, CSS e JavaScript puros. Sem framework e sem etapa de build: abrir o
`index.html` no navegador já funciona.

## Rodar

```
python3 -m http.server 8000
```

E abrir `http://localhost:8000`. Servir por HTTP em vez de abrir o arquivo
direto importa: aberto como arquivo local, o navegador bloqueia as chamadas
às APIs.

## Chaves de API

Ficam guardadas no aparelho, em Perfil → Fontes de dados. Não estão no
código e não devem entrar. Livros (Open Library) não precisa de chave.

## Testes

```
npm i -D jsdom
node teste/nome-do-teste.js
```

Os testes carregam a página de verdade e clicam nos elementos.

## Documentação

- `CLAUDE.md` — instruções para trabalho com Claude Code
- `docs/CONTEXTO.md` — decisões de produto e o motivo de cada uma
- `docs/design-system.md` — tokens visuais
- `docs/progress.md` — onde o projeto parou
