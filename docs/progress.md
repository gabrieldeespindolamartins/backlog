# Progresso

Versão atual: **v68**

## Estado atual

App de backlog compartilhado em HTML/CSS/JS puros. Listas com tipo
(jogos, livros, filmes e séries), status por lista, membros por lista,
busca em RAWG/TMDB/Open Library, backup em arquivo.

Toda mudança de dados repinta a tela por um caminho só: `aplicarEstado()`.
Nenhum ponto do app chama funções de repintura avulsas depois de mexer nos
dados. `desenhar()` reaproveita o nó de cada item (chaveado pelo próprio
objeto do item), então repintar tudo não recarrega imagem, não reinicia a
animação de entrada e não destrói o card que está sendo arrastado.
`aplicarEstado({entrada:true})` é o único jeito de pedir a animação de
estreia — antes ela era o padrão e teria disparado a cada repintura.

O foco e a rolagem sobrevivem à repintura (`preservandoFoco`): quando o
elemento focado é reconstruído, `marcarFoco`/`devolverFoco` o reencontram
pelo id ou pela posição dentro do container, e devolvem também a posição do
cursor em campo de texto.

Preparado para a próxima fase — dados chegando do servidor sozinhos: basta
mexer no estado e chamar `aplicarEstado()`.

## Buracos conhecidos

- `docs/CONTEXTO.md` e `docs/design-system.md` não existem no repositório,
  apesar de CLAUDE.md e README os citarem como leitura obrigatória.
- O arraste (reordenar e apagar) não tem teste: exige eventos de ponteiro e
  medidas de layout que o jsdom não fornece.

## Sessões

### v68 — repintura centralizada
- Mapeados os 21 pontos que repintavam à mão depois de mudar dados.
- Criado `aplicarEstado()`; `desenhar()` virou reconciliador de nós.
- `semEntrada` (global, com padrão perigoso) trocado por `{entrada:true}`.
- `renomearNaTela()` e os três remendos manuais de DOM foram removidos.
- Teste novo: `teste/repintura.js` (31 verificações, jsdom).
- Duplicação removida (`adicionar`, `chaveAtual`, `btn-buscar`, `btn-testar`);
  o `btn-testar` que ficou é o que testa as três fontes.
- Devolvido o `keydown` do campo de busca, perdido junto na remoção.

### v67 — separação em três arquivos
- `index.html`, `estilo.css` e `app.js` separados do arquivo único.
- Membros passaram a pertencer à lista, não ao app.
