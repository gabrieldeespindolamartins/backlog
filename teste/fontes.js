/* Confirma que cada tipo de lista busca na fonte certa e que o
   diagnostico testa as tres — o bloco duplicado quebrava justamente isso. */
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz,'index.html'),'utf8')
  .replace('<link rel="stylesheet" href="estilo.css">','<style></style>');
const app = fs.readFileSync(path.join(raiz,'app.js'),'utf8');
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if(e.type!=='not-implemented') console.log('ERRO:',(e.detail&&e.detail.message)||e); });
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  {runScripts:'outside-only',pretendToBeVisual:true,url:'https://t.local/',virtualConsole:vc});
const w = dom.window;
w.localStorage.setItem('bk:dados', JSON.stringify({
  listas:[{id:'a',nome:'Jogos',tipo:'jogos'},{id:'b',nome:'Ver',tipo:'telas'},{id:'c',nome:'Ler',tipo:'livros'}],
  ativa:'a', acervo:{a:[],b:[],c:[]}}));
w.localStorage.setItem('bk:chave', JSON.stringify('KR'));
w.localStorage.setItem('bk:chave-tmdb', JSON.stringify('KT'));
w.document.open(); w.document.write(html); w.document.close();
w.matchMedia = () => ({matches:false,addEventListener(){},addListener(){}});
if(!w.Element.prototype.animate)
  w.Element.prototype.animate = () => ({finished:Promise.resolve(),cancel(){},onfinish:null});
const urls = [];
w.fetch = async u => { urls.push(u); return {ok:true,status:200,json:async()=>({results:[],docs:[]})}; };
w.eval(app);
const d = w.document, clique = el => el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const espera = ms => new Promise(r=>setTimeout(r,ms));
let falhas = 0;
const conferir = (nome, ok) => { console.log((ok?'  ok  ':'FALHA') + '  ' + nome); if(!ok) falhas++; };
(async () => {
  await espera(700);
  for(const [id, marca] of [['a','api.rawg.io'],['b','api.themoviedb.org'],['c','openlibrary.org']]){
    w.eval("trocarLista('"+id+"')"); await espera(200);
    clique(d.getElementById('abrir')); await espera(150);
    d.getElementById('busca').value = 'teste';
    urls.length = 0;
    clique(d.getElementById('btn-buscar')); await espera(250);
    conferir('lista ' + id + ' busca em ' + marca, (urls[0]||'').includes(marca));
    w.eval('fecharFolha(modal)'); await espera(200);
  }
  urls.length = 0;
  clique(d.getElementById('btn-testar')); await espera(600);
  conferir('diagnostico chama as tres fontes', urls.length === 3);
  console.log(falhas ? '\n' + falhas + ' falha(s)' : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
