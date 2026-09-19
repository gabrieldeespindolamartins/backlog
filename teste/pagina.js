/* Carrega a pagina de verdade dentro do jsdom.
   Os testes clicam nos elementos; nada aqui simula o app. */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const RAIZ = path.join(__dirname, '..');

/* As fontes do Google e o CSS nao mudam comportamento e custariam rede a
   cada teste. O app.js entra embutido para nao depender de servidor. */
function montarHtml(){
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  return html
    .replace(/<link[^>]*>/g, '')
    .replace('<script src="app.js"></script>', '<script>\n' + app + '\n</script>');
}

/* o inicio do app e assincrono (le o armazenamento antes de desenhar),
   entao esperar um tique nao basta: espero a grade ter conteudo */
function esperar(janela, condicao, oque, limite = 60){
  return new Promise((ok, erro) => {
    let voltas = 0;
    const tentar = () => {
      if(condicao()) return ok();
      if(++voltas > limite) return erro(new Error('esperei demais por: ' + oque));
      janela.setTimeout(tentar, 5);
    };
    tentar();
  });
}

async function abrirPagina(){
  const dom = new JSDOM(montarHtml(), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    /* o jsdom nao traz estas duas. Sao do navegador, nao do app: sem elas
       a pagina nem carrega, e ai nao daria para testar nada. */
    beforeParse(janela){
      janela.matchMedia = consulta => ({
        media: consulta, matches: false,
        addListener(){}, removeListener(){},
        addEventListener(){}, removeEventListener(){}, onchange: null
      });
      janela.Element.prototype.animate = function(){
        return { finished: Promise.resolve(), cancel(){}, finish(){} };
      };
    }
  });
  const janela = dom.window;
  const doc = janela.document;

  const falhas = [];
  janela.addEventListener('error', ev => falhas.push(ev.message));

  await esperar(janela, () => doc.querySelectorAll('#grade .card').length > 0,
                'a grade desenhar');

  if(falhas.length) throw new Error('a pagina reclamou: ' + falhas.join(' | '));

  /* deixa o navegador processar o que ficou pendente (salvar, popstate) */
  const assentar = () => new Promise(r => janela.setTimeout(r, 10));

  return { dom, janela, doc, falhas, esperar: (c, o) => esperar(janela, c, o), assentar };
}

module.exports = { abrirPagina };
