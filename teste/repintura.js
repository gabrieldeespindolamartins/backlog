/* Verifica que a tela reflete os dados depois de mudar status e de trocar
   de lista, sem que nenhum ponto do app peca a repintura pedaco a pedaco.
   Roda com: node teste/repintura.js */

const { abrirPagina } = require('./pagina');

let passou = 0;
const erros = [];

function conferir(oque, real, esperado){
  if(real === esperado){ passou++; console.log('  ok   ' + oque); return; }
  erros.push(oque + '\n         esperado: ' + JSON.stringify(esperado) +
                    '\n         veio:     ' + JSON.stringify(real));
  console.log('  FALHA ' + oque);
}

const texto = el => (el ? el.textContent.trim() : '(elemento ausente)');

(async () => {
  const { doc, janela, falhas, assentar } = await abrirPagina();

  const cards  = () => [...doc.querySelectorAll('#grade .card')];
  const linhas = () => [...doc.querySelectorAll('#lista .linha')];
  const card = t => cards().find(c => texto(c.querySelector('.titulo')) === t);
  const conta = e => texto(doc.getElementById('n-' + e));

  console.log('\nestado inicial');
  conferir('a grade tem os 9 itens do padrao', cards().length, 9);
  conferir('a lista detalhada tem os mesmos 9', linhas().length, 9);
  conferir('o nome da lista aparece no topo',
           texto(doc.getElementById('nome-lista')), 'Meus jogos');
  conferir('"Jogando" conta 2', conta('jogando'), '2');
  conferir('"Em espera" conta 1', conta('espera'), '1');
  conferir('Elden Ring esta em espera',
           card('Elden Ring').className.includes('st-espera'), true);

  /* ---------- mudar o status de um item ---------- */
  console.log('\nmudar o status pela ficha');
  const antes = card('Elden Ring');
  antes.click();                                   /* abre a ficha */
  doc.getElementById('f-marca').click();           /* abre a folha de status */

  const opcao = [...doc.querySelectorAll('#ms-caixa .ms-op')]
    .find(b => texto(b.querySelector('.ms-nome')) === 'Jogando');
  conferir('a folha de status oferece "Jogando"', !!opcao, true);
  opcao.click();
  await assentar();

  const depois = card('Elden Ring');
  conferir('o card e o mesmo elemento (nao foi reconstruido)', depois === antes, true);
  conferir('o card virou "jogando"', depois.className.includes('st-jogando'), true);
  conferir('o card nao ficou com o status velho',
           depois.className.includes('st-espera'), false);
  conferir('a linha da lista detalhada acompanhou',
           texto(linhas().find(l => texto(l.querySelector('.nome')) === 'Elden Ring')
                        .querySelector('.etiqueta')), 'Jogando');
  conferir('"Jogando" passou a contar 3', conta('jogando'), '3');
  conferir('"Em espera" zerou', conta('espera'), '0');
  conferir('a marca do card trocou de icone',
           depois.querySelector('.marca svg').innerHTML.includes('M8 5v14l11-7z'), true);

  /* ---------- o foco sobrevive a repintura ---------- */
  console.log('\nfoco preservado');
  const estrela = doc.querySelectorAll('#f-estrelas button')[3];
  estrela.focus();
  conferir('o foco esta na 4a estrela', doc.activeElement === estrela, true);
  estrela.click();                                 /* darNota -> repinta tudo */
  await assentar();
  conferir('depois de repintar o foco continua numa estrela',
           doc.activeElement.closest('#f-estrelas') !== null, true);
  conferir('e continua na 4a',
           [...doc.querySelectorAll('#f-estrelas button')].indexOf(doc.activeElement), 3);

  doc.getElementById('f-fechar').click();
  await assentar();

  /* ---------- trocar de lista ---------- */
  console.log('\ntrocar de lista');
  doc.getElementById('btn-trocar').click();
  const tipoLivros = [...doc.querySelectorAll('#ls-tipos .ls-tipo')]
    .find(b => texto(b) === 'Livros');
  tipoLivros.click();
  await assentar();
  doc.getElementById('ls-nome').value = 'Ler em 2026';
  doc.getElementById('ls-criar').click();
  await assentar();

  conferir('o topo mostra a lista nova',
           texto(doc.getElementById('nome-lista')), 'Ler em 2026');
  conferir('a lista nova esta vazia na grade', cards().length, 0);
  conferir('a lista nova esta vazia na lista detalhada', linhas().length, 0);
  conferir('as contagens zeraram', conta('jogando'), '0');
  conferir('o resumo de status seguiu a lista nova',
           texto(doc.getElementById('p-status-v')), 'todos os cinco');

  /* o tipo manda no vocabulario. Ninguem pediu para repintar a tela de
     status: ela ficou em dia porque a repintura e uma so. */
  const rotulos = [...doc.querySelectorAll('#st-caixa .st-txt b')].map(texto);
  conferir('a tela de status fala de livro, nao de jogo',
           rotulos.join(', '), 'Sem status, Quero ler, Lendo, Pausado, Lido');

  doc.getElementById('btn-trocar').click();
  const voltar = [...doc.querySelectorAll('#ls-caixa .lst-nome')]
    .find(el => texto(el) === 'Meus jogos');
  conferir('a folha lista as duas listas',
           doc.querySelectorAll('#ls-caixa .lst-item').length, 2);
  voltar.click();
  await assentar();

  conferir('voltamos para "Meus jogos"',
           texto(doc.getElementById('nome-lista')), 'Meus jogos');
  conferir('os 9 itens voltaram', cards().length, 9);
  conferir('e o status mudado continua valendo',
           card('Elden Ring').className.includes('st-jogando'), true);
  conferir('as contagens voltaram com ele', conta('jogando'), '3');

  /* ---------- filtrar ---------- */
  console.log('\nfiltrar pelo topo');
  doc.querySelector('.metrica[data-f="finalizado"]').click();
  await assentar();
  conferir('a grade mostra so os finalizados', cards().length, 3);
  conferir('a lista detalhada tambem', linhas().length, 3);
  doc.querySelector('.metrica[data-f="finalizado"]').click();
  await assentar();
  conferir('tocar de novo desliga o filtro', cards().length, 9);

  if(falhas.length) erros.push('a pagina lancou erro: ' + falhas.join(' | '));

  console.log('\n' + passou + ' verificacoes passaram, ' + erros.length + ' falharam');
  if(erros.length){
    erros.forEach(e => console.log('\n  * ' + e));
    janela.close();
    process.exit(1);
  }
  janela.close();
})().catch(e => { console.error('\nquebrou: ' + e.stack); process.exit(1); });
