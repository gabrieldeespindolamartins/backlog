/* ciclo = vida real do jogo. ordem de exibicao e outra, definida em ORDEM. */
let aoExpandir = null;   /* preenchido pela ficha; usado pelo arraste */

const ESTADOS = ['indefinido','espera','jogando','pausado','finalizado'];
/* Os cinco status sao os mesmos em qualquer lista, porque descrevem
   estagios de progresso, nao assuntos. O que muda por tipo e a PALAVRA:
   'Jogando' num livro estaria errado, mas o estado e o mesmo. */
const NOMES_POR_TIPO = {
  jogos:  {indefinido:'Sem status', espera:'Em espera', jogando:'Jogando',
           pausado:'Pausado', finalizado:'Finalizado'},
  livros: {indefinido:'Sem status', espera:'Quero ler',  jogando:'Lendo',
           pausado:'Pausado', finalizado:'Lido'},
  telas:  {indefinido:'Sem status', espera:'Quero ver',  jogando:'Assistindo',
           pausado:'Pausado', finalizado:'Assistido'}
};

/* NOMES continua existindo para o resto do app, mas agora aponta para o
   tipo da lista aberta em vez de ser fixo */
let NOMES = NOMES_POR_TIPO.jogos;
function nomesDoTipo(tipo){ return NOMES_POR_TIPO[tipo] || NOMES_POR_TIPO.jogos; }
/* ordem pedida: jogando, espera, pausado, finalizado, sem status */
const ORDEM = {jogando:0, espera:1, pausado:2, finalizado:3, indefinido:4};

const ICONES = {
  jogando:    '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  espera:     '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
  pausado:    '<path d="M9 5v14M15 5v14"/>',
  finalizado: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  indefinido: '<path d="M9.2 9a2.9 2.9 0 115.6 1c0 1.9-2.8 2.2-2.8 4"/><circle cx="12" cy="17.6" r=".9" fill="currentColor" stroke="none"/>'
};
const svgMarca = s =>
  `<span class="marca" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONES[s]}</svg></span>`;

let filtro = null;          /* null = mostrar tudo */
let estiloMarca = 'canto';  /* preferencia de quem olha, nao do item */

/* Sem isso, um erro em qualquer ponto do arquivo deixa so a tela preta
   e nao ha como saber onde foi. */
function relatarFalha(texto){
  const cx = document.getElementById('erro-fatal');
  if(!cx) return;
  cx.hidden = false;
  cx.textContent = 'Falha: ' + texto;
}
window.addEventListener('error', ev => {
  relatarFalha((ev.message || 'erro') + '\nlinha ' + ev.lineno + ', coluna ' + ev.colno);
});
window.addEventListener('unhandledrejection', ev => {
  relatarFalha('promessa rejeitada — ' + (ev.reason && ev.reason.message || ev.reason));
});

/* ========== CAMADA DE DADOS: Claude ou navegador ========== */
let COFRE = 'nenhum';
async function detectarCofre(){
  if(typeof window.storage !== 'undefined' && window.storage){
    try{ await window.storage.set('bk:teste', '1'); COFRE = 'claude'; return; }catch(e){}
  }
  try{
    localStorage.setItem('bk:teste','1'); localStorage.removeItem('bk:teste');
    COFRE = 'navegador';
  }catch(e){ COFRE = 'nenhum'; }
}
async function guardar(k, v){
  const t = JSON.stringify(v);
  try{
    if(COFRE === 'claude'){ await window.storage.set(k, t); return true; }
    if(COFRE === 'navegador'){ localStorage.setItem(k, t); return true; }
  }catch(e){ console.error(e); }
  return false;
}
async function ler(k, padrao){
  try{
    if(COFRE === 'claude'){ const r = await window.storage.get(k); return r ? JSON.parse(r.value) : padrao; }
    if(COFRE === 'navegador'){ const b = localStorage.getItem(k); return b === null ? padrao : JSON.parse(b); }
  }catch(e){}
  return padrao;
}
const K_JOGOS = 'bk:jogos';               /* formato antigo, so para migrar */
const K_DADOS = 'bk:dados';               /* listas + jogos numa escrita so */
const K_CHAVE = 'bk:chave', K_ORDEM = 'bk:ordem',
      K_STATUS = 'bk:status', K_TOPO = 'bk:topo-indefinido',
      K_TMDB = 'bk:chave-tmdb';

/* a contagem de 'Sem status' no cabecalho e separada de o status existir:
   quem deixa muito jogo sem classificar nao quer esse numero na cara */
let topoIndefinido = true;

/* quais status esta lista usa. 'indefinido' nunca desliga: e onde
   todo jogo novo entra, e sem ele um jogo ficaria sem lugar. */
const PADRAO_USADOS = () => ({jogando:true, espera:true, pausado:true,
                              finalizado:true, indefinido:true});

/* Aponta para a configuracao da lista aberta. Nao existe configuracao
   'global' por tras: cada lista guarda a sua e pronto. Sem heranca,
   sem terceiro estado, sem dois lugares para conferir. */
let statusUsados = PADRAO_USADOS();
const usados = () => ESTADOS.filter(e => statusUsados[e]);

/* Chamada sempre que a lista aberta muda. Ela e o unico ponto onde
   'a configuracao da lista' vira 'a configuracao em uso'. */
function aplicarConfigDaLista(){
  const l = listas.find(x => x.id === ativa);
  const tipo = tipoDa(l);
  NOMES = nomesDoTipo(tipo);
  statusUsados = Object.assign(PADRAO_USADOS(), (l && l.status) || {});
  statusUsados.indefinido = true;          /* nunca desliga */
  topoIndefinido = (l && l.topoIndef !== undefined) ? l.topoIndef : true;
}

/* grava de volta na lista, que e onde a configuracao mora agora */
function guardarConfigDaLista(){
  const l = listas.find(x => x.id === ativa);
  if(!l) return;
  l.status = Object.assign({}, statusUsados);
  l.topoIndef = topoIndefinido;
}


/* ---------- tipos de lista ----------
   O tipo diz do que a lista trata. Ele existe para decidir tres coisas:
   o icone, o substantivo ('jogos'/'livros'/'títulos') e, mais adiante,
   qual fonte de dados consultar e quais status fazem sentido.
   Sem tipo, cada lista teria de ser configurada do zero. */
const TIPOS = {
  jogos:  { nome:'Jogos',            um:'jogo',    varios:'jogos' },
  livros: { nome:'Livros',           um:'livro',   varios:'livros' },
  /* 'add' existe separado de propósito: convite pode ser 'Adicionar filme',
     mas contar '3 filmes' numa lista com séries dentro seria falso. */
  telas:  { nome:'Filmes e séries',  um:'título',  varios:'títulos', add:'filme' }
};
const TIPO_PADRAO = 'jogos';

/* desenhados como traco, nao preenchidos: em 16px a silhueta e o que
   distingue, e tres formas bem diferentes leem melhor que tres detalhadas */
const ICONES_TIPO = {
  jogos:  '<path d="M7.5 8h9a4.5 4.5 0 014.4 5.4l-.8 3.9A2.6 2.6 0 0117.5 19c-.9 0-1.7-.5-2.2-1.3L14.4 16H9.6l-.9 1.7c-.4.8-1.3 1.3-2.2 1.3a2.6 2.6 0 01-2.6-2.1l-.8-3.9A4.5 4.5 0 017.5 8z"/><path d="M8 11v2.4M6.8 12.2h2.4M15.4 11.6h.01M17.4 13.4h.01"/>',
  livros: '<path d="M4 5.2A1.2 1.2 0 015.2 4H10a2.5 2.5 0 012 4V19a2.2 2.2 0 00-2-1.2H5.2A1.2 1.2 0 014 16.6z"/><path d="M20 5.2A1.2 1.2 0 0018.8 4H14a2.5 2.5 0 00-2 4V19a2.2 2.2 0 012-1.2h4.8a1.2 1.2 0 001.2-1.2z"/>',
  telas:  '<path d="M3.4 9.4h17.2v9.4a1.8 1.8 0 01-1.8 1.8H5.2a1.8 1.8 0 01-1.8-1.8z"/><path d="M3.9 9.4l-.5-2.6 16.9-3 .5 2.6z"/><path d="M8.6 5.1l1.6 3.6M13.6 4.2l1.6 3.6"/>'
};

function tipoDa(l){ return (l && TIPOS[l.tipo]) ? l.tipo : TIPO_PADRAO; }

function iconeTipo(tipo, classe){
  return '<svg class="' + (classe || '') + '" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' + ICONES_TIPO[tipo] + '</svg>';
}

/* o substantivo acompanha o tipo: 'Sem jogos' numa lista de livros
   e o tipo de detalhe que faz o app parecer emprestado de outro */
function palavra(tipo, n){
  const t = TIPOS[tipo] || TIPOS[TIPO_PADRAO];
  return n === 1 ? t.um : t.varios;
}

let listas = [];     /* [{id, nome, tipo}] */
let ativa  = null;   /* id da lista aberta */
let acervo = {};     /* {idDaLista: [jogos]} */

const novoId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);

function salvar(){
  acervo[ativa] = jogos;
  return guardar(K_DADOS, {listas, ativa, acervo});
}

let ordemManual = true;   /* manual e o padrao; status vira opcao no perfil */

/* ================== FONTES DE DADOS ==================
   Cada tipo de lista consulta um servico diferente. Em vez de espalhar 'if
   e jogos / se e livro' por toda a busca, cada fonte responde ao mesmo
   contrato e o resto do app nao precisa saber com quem esta falando:

     precisaChave  se exige credencial
     buscar(termo, chave)   -> [{id, titulo, ano, capa, sub}]
     detalhes(id, chave)    -> objeto de rotulo:valor, ou null

   'capa' vem sempre em pe (3:4) quando o servico oferece. A RAWG so
   entrega imagem deitada, por isso ela e a excecao comentada la embaixo. */

const FONTES = {
  /* ---------- jogos: RAWG ---------- */
  rawg: {
    nome: 'RAWG', site: 'https://rawg.io', precisaChave: true,
    ondePegar: 'rawg.io/apidocs',
    async buscar(termo, chave){
      const r = await fetch('https://api.rawg.io/api/games?key=' +
        encodeURIComponent(chave) + '&search=' + encodeURIComponent(termo) +
        '&page_size=8');
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      return (d.results || []).map(g => ({
        id: g.id,
        titulo: g.name,
        ano: g.released ? g.released.slice(0,4) : '',
        /* imagem deitada: serve de destaque e de capa provisoria */
        capa: g.background_image || null,
        deitada: true,
        sub: g.released ? g.released.slice(0,4) : '—'
      }));
    },
    async detalhes(id, chave){
      const r = await fetch('https://api.rawg.io/api/games/' + id +
        '?key=' + encodeURIComponent(chave));
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      return {
        ano: d.released ? d.released.slice(0,4) : '',
        generos: (d.genres || []).map(g => g.name).join(', '),
        plataformas: (d.platforms || []).map(p => p.platform.name).slice(0,5).join(', '),
        nota: d.rating || '',
        horas: d.playtime || ''
      };
    }
  },

  /* ---------- filmes e series: TMDB ---------- */
  tmdb: {
    nome: 'TMDB', site: 'https://www.themoviedb.org', precisaChave: true,
    ondePegar: 'themoviedb.org → Configurações → API',
    async buscar(termo, chave){
      /* multi busca filme e serie de uma vez: quem digita 'Cidade Invisivel'
         nao deveria precisar dizer antes se e filme ou serie */
      const r = await fetch('https://api.themoviedb.org/3/search/multi?api_key=' +
        encodeURIComponent(chave) + '&language=pt-BR&include_adult=false&query=' +
        encodeURIComponent(termo));
      if(r.status === 401) throw new Error('chave recusada pelo TMDB');
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      return (d.results || [])
        .filter(f => f.media_type === 'movie' || f.media_type === 'tv')
        .slice(0, 8)
        .map(f => {
          const data = f.release_date || f.first_air_date || '';
          return {
            id: f.media_type + '/' + f.id,
            titulo: f.title || f.name,
            ano: data ? data.slice(0,4) : '',
            capa: f.poster_path ? 'https://image.tmdb.org/t/p/w342' + f.poster_path : null,
            destaque: f.backdrop_path ? 'https://image.tmdb.org/t/p/w780' + f.backdrop_path : null,
            sub: (f.media_type === 'tv' ? 'série' : 'filme') + (data ? ' · ' + data.slice(0,4) : '')
          };
        });
    },
    async detalhes(id, chave){
      const r = await fetch('https://api.themoviedb.org/3/' + id +
        '?api_key=' + encodeURIComponent(chave) + '&language=pt-BR');
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const data = d.release_date || d.first_air_date || '';
      const saida = {
        ano: data ? data.slice(0,4) : '',
        generos: (d.genres || []).map(g => g.name).join(', '),
        nota: d.vote_average ? d.vote_average.toFixed(1) : ''
      };
      if(d.runtime) saida.duracao = d.runtime + ' min';
      if(d.number_of_seasons)
        saida.temporadas = d.number_of_seasons +
          (d.number_of_seasons === 1 ? ' temporada' : ' temporadas');
      if(d.overview) saida.sinopse = d.overview;
      return saida;
    }
  },

  /* ---------- livros: Open Library ---------- */
  openlibrary: {
    nome: 'Open Library', site: 'https://openlibrary.org', precisaChave: false,
    async buscar(termo){
      const r = await fetch('https://openlibrary.org/search.json?q=' +
        encodeURIComponent(termo) +
        '&fields=key,title,author_name,first_publish_year,cover_i&limit=8');
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      return (d.docs || []).map(l => ({
        id: l.key,                                  /* ex: /works/OL27448W */
        titulo: l.title,
        ano: l.first_publish_year ? String(l.first_publish_year) : '',
        capa: l.cover_i ? 'https://covers.openlibrary.org/b/id/' + l.cover_i + '-L.jpg' : null,
        sub: (l.author_name?.[0] || 'autor desconhecido') +
             (l.first_publish_year ? ' · ' + l.first_publish_year : '')
      }));
    },
    async detalhes(id){
      const r = await fetch('https://openlibrary.org' + id + '.json');
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const saida = {};
      /* a Open Library devolve a descricao ora como texto, ora como objeto */
      const desc = typeof d.description === 'string' ? d.description : d.description?.value;
      if(d.subjects?.length) saida.assuntos = d.subjects.slice(0,4).join(', ');
      if(desc) saida.sinopse = desc.slice(0, 400);
      return Object.keys(saida).length ? saida : null;
    }
  }
};

/* qual fonte serve cada tipo de lista */
const FONTE_DO_TIPO = { jogos:'rawg', telas:'tmdb', livros:'openlibrary' };

function fonteDaLista(l){ return FONTES[FONTE_DO_TIPO[tipoDa(l)]]; }
function fonteAtiva(){ return fonteDaLista(listas.find(x => x.id === ativa)); }
function nomeFonteAtiva(){ return FONTE_DO_TIPO[tipoDa(listas.find(x => x.id === ativa))]; }

let chaveRAWG = '';
let chaveTMDB = '';

/* a chave certa para a fonte certa. Open Library nao usa nenhuma. */
function chaveDaFonte(nome){
  return nome === 'rawg' ? chaveRAWG : nome === 'tmdb' ? chaveTMDB : '';
}

const PADRAO = [
  {t:'Hollow Knight',        s:'jogando',    por:'Giulia'},
  {t:'It Takes Two',         s:'jogando',    por:'Gabriel'},
  {t:'Stardew Valley',       s:'finalizado', por:'Giulia'},
  {t:'Baldur\u2019s Gate 3', s:'indefinido', por:'Gabriel'},
  {t:'Overcooked! 2',        s:'finalizado', por:'Giulia'},
  {t:'Elden Ring',           s:'espera',     por:'Gabriel'},
  {t:'Outer Wilds',          s:'pausado',    por:'Gabriel'},
  {t:'Celeste',              s:'finalizado', por:'Giulia'},
  {t:'Hades',                s:'indefinido', por:'Gabriel'},
];

let jogos = PADRAO.map(j => ({...j}));

const grade = document.getElementById('grade');
const lista = document.getElementById('lista');
const btnGrade = document.getElementById('btn-grade');
const btnLista = document.getElementById('btn-lista');


let fimDaEstreia = null;
let semEntrada = false;   /* redesenho depois de arrastar nao repete a entrada */

function desenhar(opcoes){
  const soLista = opcoes && opcoes.soLista;
  const soGrade = opcoes && opcoes.soGrade;
  const estreia = !semEntrada;
  /* so mexe no container que esta sendo redesenhado.
     marcar a grade como estreia sem redesenha-la faria os cards
     ja existentes tocarem a animacao de entrada de novo. */
  if(!soLista) grade.classList.toggle('estreando', estreia);
  if(!soGrade) lista.classList.toggle('estreando', estreia);
  /* a estreia dura o tempo da propria animacao e sai de cena.
     se a classe ficasse, qualquer reordenacao futura reanimaria tudo. */
  clearTimeout(fimDaEstreia);
  if(estreia) fimDaEstreia = setTimeout(() => {
    grade.classList.remove('estreando');
    lista.classList.remove('estreando');
  }, 900);
  if(soLista) grade.classList.remove('estreando');
  if(soGrade) lista.classList.remove('estreando');
  if(!soLista) grade.innerHTML = '';
  if(!soGrade) lista.innerHTML = '';

  const visiveis = jogos
    .map((j,i) => ({j,i}))
    .filter(o => !filtro || o.j.s === filtro);
  if(!ordemManual) visiveis.sort((a,b) => ORDEM[a.j.s] - ORDEM[b.j.s]);

  if(!visiveis.length){
    if(!soLista) grade.innerHTML = '<p class="vazio">Nenhum jogo com esse status.</p>';
    if(!soGrade) lista.innerHTML = '<p class="vazio">Nenhum jogo com esse status.</p>';
  }

  visiveis.forEach(({j,i}, pos) => {
    const ordem = pos;
    const atraso = semEntrada ? 'animation:none' : `animation-delay:${ordem*28}ms`;
    const rotulo = `${j.t}, ${NOMES[j.s]}. Tocar para mudar.`;

    const card = document.createElement('button');
    const img = imagemGrade(j);
    card.className = `card st-${j.s}${img ? '' : ' sem-capa'}`;
    card.setAttribute('style', atraso);
    card.setAttribute('aria-label', rotulo);
    card.dataset.i = i;
    card.innerHTML = `
      <div class="capa${img ? ' tem-imagem esqueleto' : ''}">
        <span class="arte">${j.t}</span>
        ${img ? `<img src="${img}" alt="" loading="lazy" onload="this.parentNode.classList.remove('esqueleto')" onerror="this.parentNode.classList.remove('tem-imagem','esqueleto');this.remove()">` : ''}
        <span class="lombada"></span>
        ${svgMarca(j.s)}
      </div>
      <div class="titulo">${j.t}</div>`;
    /* le o indice AGORA, do proprio elemento. capturar o 'i' da criacao
       deixa o clique apontando para o jogo errado depois de uma troca. */
    card.onclick = () => abrirFicha(+card.dataset.i);
    if(!soLista) grade.appendChild(card);

    const linha = document.createElement('button');
    linha.className = `linha st-${j.s}`;
    linha.setAttribute('style', atraso);
    linha.setAttribute('aria-label', rotulo);
    linha.dataset.i = i;
    linha.innerHTML = `
      <div class="mini${imagemGrade(j) ? ' esqueleto' : ''}">
        ${imagemGrade(j) ? `<img src="${imagemGrade(j)}" alt="" loading="lazy" onload="this.parentNode.classList.remove('esqueleto')" onerror="this.parentNode.classList.remove('esqueleto');this.remove()">` : ''}
        <span class="lombada"></span>
      </div>
      <div class="info">
        <div class="nome">${j.t}</div>
        <div class="sub">adicionado por ${j.por}</div>
      </div>
      <div class="etiqueta"><span class="ponto"></span>${NOMES[j.s]}</div>`;
    linha.onclick = () => abrirFicha(+linha.dataset.i);
    if(!soGrade) lista.appendChild(linha);
  });

  contar();
  semEntrada = false;
  varrerEsqueletos();
}

/* rede de seguranca: se a imagem ja estava em cache, o navegador pode nao
   disparar 'load', e o brilho ficaria rodando para sempre — o que parece
   defeito, nao espera. */
function varrerEsqueletos(){
  document.querySelectorAll('.esqueleto img').forEach(im => {
    if(im.complete && im.naturalWidth) im.parentNode.classList.remove('esqueleto');
  });
}

function contar(){
  let visiveis = 0;
  ESTADOS.forEach(e => {
    const qt = jogos.filter(j => j.s === e).length;
    const el = document.getElementById('n-'+e);
    if(el) el.textContent = qt;

    /* Um zero quase nao carrega informacao. Escondo o status vazio em vez
       de pedir para a pessoa configurar isso: o app ja sabe a resposta.
       O filtro ativo fica mesmo zerado, senao ele sumiria sob os proprios pes. */
    const btn = document.querySelector(`.metrica[data-f="${e}"]`);
    if(btn){
      const mostrar = statusUsados[e]
                 && (e !== 'indefinido' || topoIndefinido)
                 && (qt > 0 || filtro === e);
      btn.classList.toggle('oculta', !mostrar);
      if(mostrar) visiveis++;
    }
  });
  document.querySelector('.metricas').style.setProperty('--colunas', visiveis || 1);

  document.querySelectorAll('.metrica').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.f === filtro));
  });
}

/* metricas sao os filtros: tocar liga, tocar de novo desliga */
document.querySelectorAll('.metrica').forEach(b => {
  b.onclick = () => {
    filtro = (filtro === b.dataset.f) ? null : b.dataset.f;
    desenhar();
  };
});

/* preferencia de exibicao da marca — por pessoa, nao pelo item.
   o controle mora no perfil; aqui so o valor inicial. */
document.body.dataset.marca = estiloMarca;
document.body.dataset.aba = 'listas';

let emGrade = true;
function modo(ehGrade){
  if(ehGrade === emGrade) return;
  emGrade = ehGrade;
  btnGrade.setAttribute('aria-pressed', ehGrade);
  btnLista.setAttribute('aria-pressed', !ehGrade);

  const sai = ehGrade ? lista : grade;
  const entra = ehGrade ? grade : lista;
  if(SEM_ANIMACAO){
    sai.classList.add('escondido');
    entra.classList.remove('escondido');
    return;
  }
  /* o que sai afunda e desbota; o que entra sobe. as duas coisas
     acontecem juntas, entao a troca le como um movimento so. */
  sai.classList.add('saindo');
  setTimeout(() => {
    sai.classList.remove('saindo');
    sai.classList.add('escondido');
    entra.classList.remove('escondido');
    entra.classList.add('chegando');
    setTimeout(() => entra.classList.remove('chegando'), 300);
  }, 150);
}
btnGrade.onclick = () => modo(true);
btnLista.onclick = () => modo(false);


/* ================== FICHA DO JOGO ================== */

const ficha = document.getElementById('ficha');
/* qual imagem vai em cada lugar. cai na outra quando a preferida falta,
   entao um jogo com uma imagem so continua aparecendo nos dois lugares. */
const imagemGrade = j => j.capa || j.destaque || null;
const imagemFicha = j => j.destaque || j.capa || null;

function pintarCapaFicha(){
  const url = imagemFicha(jogos[iAberto]);
  const alvo = document.getElementById('f-capa');
  alvo.classList.toggle('esqueleto', !!url);
  alvo.innerHTML = url
    ? `<img src="${url}" alt="" onload="this.parentNode.classList.remove('esqueleto')" onerror="this.parentNode.classList.remove('esqueleto');this.remove()">`
    : '<span class="sem">sem imagem</span>';
}

const folhaFicha = ficha.querySelector('.folha');
let iAberto = null;

function abrirFicha(i){
  if(bloquearClique) return;
  iAberto = i;
  const j = jogos[i];

  pintarTituloFicha();
  pintarCapaFicha();
  document.getElementById('f-por').textContent = 'Adicionado por ' + j.por;

  pintarCabecalho();
  fecharChips();
  document.getElementById('f-dados').innerHTML = '';
  limparFicha();
  abrirFolha(ficha);

  /* busco agora, com a folha ainda fechada. se os dados chegassem durante a
     expansao, a altura mudaria no meio do caminho e o movimento travaria. */
  pintarDados(j);
  buscarDetalhes(i);
}


const PENA = '<svg class="pena" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.8a2.1 2.1 0 013 3L8 18.3l-4 1 1-4z"/></svg>';

function pintarTituloFicha(){
  const el = document.getElementById('f-titulo');
  el.innerHTML = '';
  el.append(jogos[iAberto].t);
  el.insertAdjacentHTML('beforeend', PENA);
}

/* troca o texto no card e na lista sem reconstruir a tela */
function renomearNaTela(i, novo){
  const card = grade.querySelector(`.card[data-i="${i}"]`);
  if(card){
    const t = card.querySelector('.titulo');
    if(t) t.textContent = novo;
    const a = card.querySelector('.arte');
    if(a) a.textContent = novo;
    card.setAttribute('aria-label', `${novo}, ${NOMES[jogos[i].s]}. Tocar para ver.`);
  }
  semEntrada = true;
  desenhar({soLista:true});
}

/* ---- edicao: um botao, uma folha, tudo que altera o jogo ---- */

const medit = document.getElementById('medit');
const eTitulo = document.getElementById('e-titulo');

document.getElementById('f-editar').onclick = () => {
  const j = jogos[iAberto];
  eTitulo.value = j.t;
  pintarPrevias();
  abrirFolha(medit);
};
document.getElementById('e-fechar').onclick = () => fecharFolha(medit);
medit.onclick = e => { if(e.target === medit) fecharFolha(medit); };

function pintarPrevias(){
  const j = jogos[iAberto];
  const por = (el, url) => {
    el.style.backgroundImage = url ? `url("${url}")` : '';
    el.classList.toggle('vazia', !url);
  };
  por(document.getElementById('e-prev-destaque'), j.destaque || null);
  por(document.getElementById('e-prev-capa'), j.capa || null);
}

/* o titulo salva ao sair do campo: sem botao de confirmar, sem estado extra */
eTitulo.addEventListener('change', salvarTitulo);
eTitulo.addEventListener('blur', salvarTitulo);
function salvarTitulo(){
  if(iAberto === null) return;
  const novo = eTitulo.value.trim();
  if(!novo || novo === jogos[iAberto].t) return;
  jogos[iAberto].t = novo;
  renomearNaTela(iAberto, novo);
  pintarTituloFicha();
  salvar();
}

document.getElementById('e-apagar').onclick = async () => {
  const i = iAberto, j = jogos[i];
  if(!confirm(`Remover "${j.t}" da lista?`)) return;
  jogos.splice(i, 1);
  fecharFolha(medit);
  fecharFolha(ficha);
  semEntrada = true;
  desenhar();
  await salvar();
  desfazer(j, i);
};

/* ---- detalhes: chegam quando a folha e expandida ---- */

/* Animar altura exige um numero, nao 'auto'. Entao: mede onde esta,
   trava esse valor, muda o conteudo, mede onde vai dar, e anima entre os dois. */
function animarAltura(mudar){
  const f = folhaFicha;
  const antes = f.getBoundingClientRect().height;
  f.style.height = '';
  mudar();
  const depois = f.getBoundingClientRect().height;
  if(Math.abs(depois - antes) < 1){ f.style.height = ''; return; }
  f.style.height = antes + 'px';
  void f.offsetHeight;          /* obriga o navegador a assumir o valor de partida */
  f.style.height = depois + 'px';
  const fim = ev => {
    if(ev.target !== f || ev.propertyName !== 'height') return;
    f.style.height = '';
    f.removeEventListener('transitionend', fim);
  };
  f.addEventListener('transitionend', fim);
}

aoExpandir = () => animarAltura(() => folhaFicha.classList.add('expandida'));
const aoEncolher = () => animarAltura(() => folhaFicha.classList.remove('expandida'));

/* tocar na dica faz o mesmo que puxar: gesto nunca deve ser o unico caminho */
document.getElementById('f-dica-puxar').onclick = () => aoExpandir();

function pintarCabecalho(){
  const j = jogos[iAberto];

  /* marca de status: mesmo icone e mesma cor do card */
  const m = document.getElementById('f-marca');
  m.style.background = `var(--${j.s})`;
  m.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONES[j.s]}</svg>`;
  m.setAttribute('aria-label', 'Status: ' + NOMES[j.s] + '. Tocar para trocar.');

  pintarEstrelas();
}

const ESTRELA = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z"/></svg>';

function pintarEstrelas(){
  const nota = jogos[iAberto].nota || 0;
  const alvo = document.getElementById('f-estrelas');
  alvo.innerHTML = '';
  for(let n = 1; n <= 5; n++){
    /* quanto desta estrela esta preenchido: cheia, metade ou nada */
    const preenchida = Math.max(0, Math.min(1, nota - (n - 1)));
    const b = document.createElement('button');
    b.setAttribute('aria-label', `${n} de 5`);
    b.innerHTML = `<span class="fundo">${ESTRELA}</span>`
                + `<span class="frente" style="width:${preenchida * 19}px">${ESTRELA}</span>`;
    /* primeiro toque da meia, o segundo completa, o terceiro limpa */
    b.onclick = () => {
      if(nota === n - 0.5)   darNota(n);
      else if(nota === n)    darNota(0);
      else                   darNota(n - 0.5);
    };
    alvo.appendChild(b);
  }
}

function trocarStatus(novo){
  const i = iAberto;
  if(jogos[i].s === novo) return;
  jogos[i].s = novo;
  pintarCabecalho();

  /* atualiza o card na grade sem reconstruir nada */
  const card = grade.querySelector(`.card[data-i="${i}"]`);
  if(card && ordemManual && !filtro){
    card.className = `card st-${novo}${imagemGrade(jogos[i]) ? '' : ' sem-capa'}`;
    const m = card.querySelector('.marca');
    if(m) m.outerHTML = svgMarca(novo);
    semEntrada = true;
    desenhar({soLista:true});
  }else{
    semEntrada = true;
    desenhar();
  }
  salvar();
}

function darNota(n){
  jogos[iAberto].nota = n;
  pintarEstrelas();
  salvar();
}

const mstatus = document.getElementById('mstatus');

function pintarOpcoesStatus(){
  const j = jogos[iAberto];
  const caixa = document.getElementById('ms-caixa');
  caixa.innerHTML = '';

  /* 'Sem status' nao vira opcao: tocar de novo no status atual ja limpa.
     Uma acao a menos na lista e o mesmo resultado. */
  const lista = ESTADOS.filter(e =>
    e !== 'indefinido' && (statusUsados[e] || j.s === e));

  lista.forEach(e => {
    const atual = j.s === e;
    const b = document.createElement('button');
    b.className = 'ms-op';
    b.dataset.s = e;
    b.setAttribute('aria-pressed', String(atual));
    b.innerHTML = `
      <span class="ms-bola" style="background:var(--${e})"></span>
      <span class="ms-nome">${NOMES[e]}</span>
      <svg class="ms-marca" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.5 5.5L20 7"/></svg>`;
    b.onclick = () => {
      /* tocar no que ja esta marcado devolve o jogo para 'Sem status' */
      trocarStatus(atual ? 'indefinido' : e);
      fecharFolha(mstatus);
    };
    caixa.appendChild(b);
  });

  document.getElementById('ms-nota').textContent = j.s === 'indefinido'
    ? 'Este jogo está sem status.'
    : 'Toque no status marcado para removê-lo.';
}

document.getElementById('f-marca').onclick = () => {
  pintarOpcoesStatus();
  abrirFolha(mstatus);
};
document.getElementById('ms-fechar').onclick = () => fecharFolha(mstatus);
mstatus.onclick = e => { if(e.target === mstatus) fecharFolha(mstatus); };

/* nao existe mais painel embutido para fechar, mas varios pontos ainda chamam */
function fecharChips(){}

/* rotulos das linhas da ficha. Cada fonte devolve um conjunto diferente de
   campos; a ordem aqui e a ordem em que aparecem, e o que a fonte nao
   mandou simplesmente nao vira linha. */
const ROTULOS = {
  ano:'Lançamento', generos:'Gêneros', plataformas:'Plataformas',
  duracao:'Duração', temporadas:'Temporadas', assuntos:'Assuntos',
  nota:'Nota', horas:'Tempo médio', sinopse:'Sinopse'
};
const ORDEM_DADOS = ['ano','generos','plataformas','duracao','temporadas',
                     'assuntos','horas','nota','sinopse'];

function pintarDados(j){
  const alvo = document.getElementById('f-dados');
  const d = j.detalhes;
  const nomeF = j.fonte || 'rawg';
  const fonte = FONTES[nomeF] || FONTES.rawg;

  if(!d){
    const podeBuscar = j.rid && (!fonte.precisaChave || chaveDaFonte(nomeF));
    alvo.innerHTML = podeBuscar
      ? '<p class="f-carregando">Buscando informações…</p>'
      : '<p class="f-carregando">Sem informações extras. Itens adicionados pela busca trazem ano, gêneros e mais.</p>';
    return;
  }

  const linha = (r, v) => v ? `<div class="f-linha"><span class="r">${r}</span><span class="v">${v}</span></div>` : '';
  alvo.innerHTML = ORDEM_DADOS.map(k => {
    let v = d[k];
    if(!v) return '';
    if(k === 'nota')  v = v + (nomeF === 'tmdb' ? ' / 10 no TMDB' : ' / 5 na RAWG');
    if(k === 'horas') v = v + ' horas';
    return linha(ROTULOS[k], v);
  }).join('');
}

async function buscarDetalhes(i){
  const j = jogos[i];
  if(j.detalhes || !j.rid) return;
  /* itens antigos nao tem 'fonte' gravada; naquela epoca so existia RAWG */
  const nomeF = j.fonte || 'rawg';
  const fonte = FONTES[nomeF];
  if(!fonte) return;
  const chave = chaveDaFonte(nomeF);
  if(fonte.precisaChave && !chave) return;
  try{
    const d = await fonte.detalhes(j.rid, chave);
    if(!d) return;
    j.detalhes = d;
    if(iAberto === i) pintarDados(j);
    salvar();
  }catch(e){
    if(iAberto === i)
      document.getElementById('f-dados').innerHTML =
        '<p class="f-carregando">Não consegui buscar as informações: ' + e.message + '</p>';
  }
}

document.getElementById('f-fechar').onclick = () => fecharFolha(ficha);
ficha.onclick = e => { if(e.target === ficha) fecharFolha(ficha); };


/* ================== ADICIONAR ================== */

const modal  = document.getElementById('modal');
const campoB = document.getElementById('busca');
const avisoB = document.getElementById('aviso-busca');
const caixaR = document.getElementById('resultados');

document.getElementById('abrir').onclick = () => {
  if(document.body.classList.contains('arrastando')) return;
  /* nao volto para as listas aqui: history.back() e assincrono e
     acabaria fechando a folha que estamos abrindo agora. */
  limparAdd();
  /* o titulo e o exemplo do campo seguem o tipo: 'Adicionar jogo' numa
     lista de filmes e o tipo de descuido que denuncia tela reaproveitada */
  const tp = tipoDa(listas.find(x => x.id === ativa));
  const um = (TIPOS[tp] || TIPOS[TIPO_PADRAO]).add || palavra(tp, 1);
  document.getElementById('add-titulo').textContent = 'Adicionar ' + um;
  campoB.placeholder = 'nome do ' + um;
  document.getElementById('abrir').setAttribute('aria-label', 'Adicionar ' + um);
  abrirFolha(modal);
  caixaR.innerHTML = ''; campoB.value = '';
  avisoB.textContent = '';
  const f = fonteAtiva();
  document.getElementById('aviso-sem-chave').textContent =
    (f.precisaChave && !chaveDaFonte(nomeFonteAtiva()))
      ? 'Sem a chave da ' + f.nome + ' você adiciona pelo título, mas sem capa. ' +
        'A chave fica em Perfil → Fontes de dados.'
      : '';
  campoB.focus();
};
const fechar = () => fecharFolha(modal);
document.getElementById('fechar').onclick = fechar;
modal.onclick = e => { if(e.target === modal) fechar(); };

document.getElementById('btn-chave').onclick = async () => {
  chaveRAWG = document.getElementById('chave').value.trim();
  const ok = await guardar(K_CHAVE, chaveRAWG);
  document.getElementById('aviso-chave').textContent =
    ok ? 'Chave guardada neste dispositivo.' : 'Não consegui guardar a chave aqui.';
};

document.getElementById('btn-chave-tmdb').onclick = async () => {
  chaveTMDB = document.getElementById('chave-tmdb').value.trim();
  const ok = await guardar(K_TMDB, chaveTMDB);
  document.getElementById('aviso-chave-tmdb').textContent =
    ok ? 'Chave guardada neste dispositivo.' : 'Não consegui guardar a chave aqui.';
};

async function adicionar(titulo, capa, rid, destaque, deitada){
  /* guardo de qual fonte veio o id: sem isso, ao abrir a ficha o app nao
     saberia a quem perguntar os detalhes de um item de outra lista. */
  jogos.push({t:titulo, s:'indefinido', por:'Gabriel',
              capa: deitada ? capa : (capa || null),
              destaque: destaque || capa || null,
              rid: rid || null,
              fonte: rid ? nomeFonteAtiva() : null});
  fechar(); desenhar(); await salvar();
}

/* o campo aberto manda sobre o que ficou guardado: quem acabou de colar
   a chave espera que ela valha antes de tocar em Salvar */
function chaveAtual(){
  const digitada = document.getElementById('chave').value.trim();
  if(digitada) chaveRAWG = digitada;
  const dt = document.getElementById('chave-tmdb').value.trim();
  if(dt) chaveTMDB = dt;
  return chaveDaFonte(nomeFonteAtiva());
}

document.getElementById('btn-buscar').onclick = async () => {
  const termo = campoB.value.trim();
  if(!termo){ avisoB.textContent = 'Digite um nome.'; return; }

  const nomeF = nomeFonteAtiva();
  const fonte = FONTES[nomeF];
  const chave = chaveDaFonte(nomeF);

  const manual = (t, nota) => {
    const b = document.createElement('button');
    b.className = 'res';
    b.innerHTML = `<span class="semimg"></span><span class="n">Adicionar "${t}" sem capa` +
      (nota ? `<span class="a">${nota}</span>` : '') + `</span><span class="mais">+</span>`;
    b.onclick = () => adicionar(t, null);
    caixaR.appendChild(b);
  };

  if(fonte.precisaChave && !chave){
    avisoB.textContent = 'Sem a chave da ' + fonte.nome +
      '. Cadastre em Perfil → Fontes de dados para buscar capas, ou adicione só pelo título:';
    caixaR.innerHTML = '';
    manual(termo);
    return;
  }

  avisoB.textContent = 'Buscando…'; caixaR.innerHTML = '';
  try{
    const achados = await fonte.buscar(termo, chave);
    avisoB.textContent = achados.length ? '' : 'Nada encontrado.';
    achados.forEach(a => {
      const b = document.createElement('button');
      b.className = 'res';
      b.innerHTML = (a.capa ? `<img src="${a.capa}" alt="">` : `<span class="semimg"></span>`)
        + `<span class="n">${a.titulo}<span class="a">${a.sub || a.ano || '—'}</span></span>`
        + `<span class="mais">+</span>`;
      b.onclick = () => adicionar(a.titulo, a.capa, a.id, a.destaque, a.deitada);
      caixaR.appendChild(b);
    });
    manual(termo, 'nenhum resultado serve');
  }catch(e){
    avisoB.textContent = 'Busca falhou: ' + e.message
      + (location.protocol === 'https:' ? '' : ' — abrindo o arquivo direto do celular o navegador costuma bloquear a chamada. Teste pelo Claude ou hospedado.');
    manual(termo);
  }
};

document.getElementById('btn-testar').onclick = async () => {
  const d = document.getElementById('diag');
  chaveAtual();                       /* puxa o que estiver nos campos */
  const linhas = ['origem: ' + location.protocol + '//' + (location.host || '(arquivo local)')];
  d.textContent = linhas.join('\n');

  const testes = [
    ['RAWG',          'rawg',        'hades'],
    ['TMDB',          'tmdb',        'bacurau'],
    ['Open Library',  'openlibrary', 'torto arado']
  ];

  for(const [rotulo, nomeF, termo] of testes){
    const fonte = FONTES[nomeF];
    const chave = chaveDaFonte(nomeF);
    if(fonte.precisaChave && !chave){
      linhas.push(rotulo + ': sem chave, nem tentei');
      d.textContent = linhas.join('\n');
      continue;
    }
    linhas.push(rotulo + ': chamando...');
    d.textContent = linhas.join('\n');
    try{
      const t0 = performance.now();
      const r = await fonte.buscar(termo, chave);
      linhas[linhas.length - 1] = rotulo + ': ' + r.length + ' resultados em ' +
        Math.round(performance.now() - t0) + 'ms' +
        (r.length ? ' (1º: ' + r[0].titulo + ')' : '');
    }catch(e){
      linhas[linhas.length - 1] = rotulo + ': ERRO — ' + e.message +
        (e instanceof TypeError ? ' (erro de rede sem status costuma ser bloqueio de origem)' : '');
    }
    d.textContent = linhas.join('\n');
  }
};

async function adicionar(titulo, capa, rid, destaque, deitada){
  /* guardo de qual fonte veio o id: sem isso, ao abrir a ficha o app nao
     saberia a quem perguntar os detalhes de um item de outra lista. */
  jogos.push({t:titulo, s:'indefinido', por:'Gabriel',
              capa: deitada ? capa : (capa || null),
              destaque: destaque || capa || null,
              rid: rid || null,
              fonte: rid ? nomeFonteAtiva() : null});
  fechar(); desenhar(); await salvar();
}

/* o campo aberto manda sobre o que ficou guardado: quem acabou de colar
   a chave espera que ela valha antes de tocar em Salvar */
function chaveAtual(){
  const digitada = document.getElementById('chave').value.trim();
  if(digitada) chaveRAWG = digitada;
  const dt = document.getElementById('chave-tmdb').value.trim();
  if(dt) chaveTMDB = dt;
  return chaveDaFonte(nomeFonteAtiva());
}

document.getElementById('btn-buscar').onclick = async () => {
  const termo = campoB.value.trim();
  if(!termo){ avisoB.textContent = 'Digite um nome.'; return; }

  const nomeF = nomeFonteAtiva();
  const fonte = FONTES[nomeF];
  const chave = chaveDaFonte(nomeF);

  const manual = (t, nota) => {
    const b = document.createElement('button');
    b.className = 'res';
    b.innerHTML = `<span class="semimg"></span><span class="n">Adicionar "${t}" sem capa` +
      (nota ? `<span class="a">${nota}</span>` : '') + `</span><span class="mais">+</span>`;
    b.onclick = () => adicionar(t, null);
    caixaR.appendChild(b);
  };

  if(fonte.precisaChave && !chave){
    avisoB.textContent = 'Sem a chave da ' + fonte.nome +
      '. Cadastre em Perfil → Fontes de dados para buscar capas, ou adicione só pelo título:';
    caixaR.innerHTML = '';
    manual(termo);
    return;
  }

  avisoB.textContent = 'Buscando…'; caixaR.innerHTML = '';
  try{
    const achados = await fonte.buscar(termo, chave);
    avisoB.textContent = achados.length ? '' : 'Nada encontrado.';
    achados.forEach(a => {
      const b = document.createElement('button');
      b.className = 'res';
      b.innerHTML = (a.capa ? `<img src="${a.capa}" alt="">` : `<span class="semimg"></span>`)
        + `<span class="n">${a.titulo}<span class="a">${a.sub || a.ano || '—'}</span></span>`
        + `<span class="mais">+</span>`;
      b.onclick = () => adicionar(a.titulo, a.capa, a.id, a.destaque, a.deitada);
      caixaR.appendChild(b);
    });
    manual(termo, 'nenhum resultado serve');
  }catch(e){
    avisoB.textContent = 'Busca falhou: ' + e.message
      + (location.protocol === 'https:' ? '' : ' — abrindo o arquivo direto do celular o navegador costuma bloquear a chamada. Teste pelo Claude ou hospedado.');
    manual(termo);
  }
};

document.getElementById('btn-testar').onclick = async () => {
  const d = document.getElementById('diag');
  const k = chaveAtual();
  const linhas = [];
  linhas.push('origem: ' + location.protocol + '//' + (location.host || '(arquivo local)'));
  linhas.push('chave no campo: ' + (k ? k.length + ' caracteres (não mostro o valor)' : 'VAZIA'));
  if(!k){ d.textContent = linhas.join('\n') + '\nsem chave, nem tentei buscar'; return; }

  const url = 'https://api.rawg.io/api/games?key=' + encodeURIComponent(k) + '&search=hades&page_size=1';
  linhas.push('chamando a RAWG...');
  d.textContent = linhas.join('\n');
  try{
    const r = await fetch(url);
    linhas.push('resposta HTTP: ' + r.status + ' ' + r.statusText);
    const txt = await r.text();
    linhas.push('tamanho do corpo: ' + txt.length + ' bytes');
    const limpo = txt.slice(0, 140).replace(/key=[^&"]+/g, 'key=***');
    linhas.push('inicio: ' + limpo);
  }catch(e){
    linhas.push('ERRO: ' + e.name + ' — ' + e.message);
    linhas.push('erro de rede sem status costuma ser bloqueio de origem (CORS)');
  }
  d.textContent = linhas.join('\n');
};

campoB.addEventListener('keydown', e => { if(e.key === 'Enter') document.getElementById('btn-buscar').click(); });


/* ================== ARRASTAR A FOLHA PARA FECHAR ================== */

/* Pilha de folhas ligada ao historico do navegador.
   Cada folha aberta empilha um estado; o botao voltar do telefone
   dispara popstate e fecha so a folha do topo, sem sair da pagina. */
const pilhaFolhas = [];

/* empilha qualquer coisa que o botao voltar deva desfazer:
   uma folha, uma pagina, o que vier. */
function empilhar(el, fechar){
  pilhaFolhas.push({el, fechar});
  history.pushState({n: pilhaFolhas.length}, '');
}

function abrirFolha(modalEl){
  const folha = modalEl.querySelector('.folha');
  folha.classList.remove('expandida');
  folha.style.height = '';   /* nenhuma folha reabre com altura travada */
  folha.classList.add('entrando');
  modalEl.classList.remove('escondido');
  setTimeout(() => folha.classList.remove('entrando'), 320);

  empilhar(modalEl, () => modalEl.classList.add('escondido'));
}

/* todo fechamento passa por aqui, para o historico nao sair de sincronia */
function fecharFolha(modalEl){
  const topo = pilhaFolhas[pilhaFolhas.length - 1];
  if(topo && topo.el === modalEl){ history.back(); return; }
  const i = pilhaFolhas.findIndex(x => x.el === modalEl);
  if(i > -1) pilhaFolhas.splice(i, 1);
  modalEl.classList.add('escondido');
}

/* O historico diz em que profundidade estamos; a pilha se ajusta ate la.
   Contar um passo por evento quebrava com history.go(-2), que dispara
   um evento so e deixava a tela e o historico fora de sincronia. */
window.addEventListener('popstate', ev => {
  const alvo = (ev.state && ev.state.n) || 0;
  while(pilhaFolhas.length > alvo){
    const t = pilhaFolhas.pop();
    if(t) t.fechar();
  }
});

function folhaArrastavel(modalEl, fechar, expansivel){
  const folha = modalEl.querySelector('.folha');
  let y0 = 0, dy = 0, ativo = false;

  folha.addEventListener('pointerdown', ev => {
    /* so comeca se a folha ja estiver no topo do seu proprio rolamento,
       senao o gesto pertence a rolagem do conteudo */
    if(folha.scrollTop > 0) return;
    if(ev.target.closest('input, textarea')) return;
    y0 = ev.clientY; dy = 0; ativo = true;
    folha.classList.add('puxando');
    folha.classList.remove('voltando');
  });

  folha.addEventListener('pointermove', ev => {
    if(!ativo) return;
    dy = ev.clientY - y0;

    /* puxar para cima: so vale se a folha puder expandir e ainda nao expandiu */
    if(dy < 0){
      if(expansivel && !folha.classList.contains('expandida')){
        folha.style.transform = `translateY(${Math.max(dy, -70) * 0.5}px)`;
        return;
      }
      /* senao, a origem acompanha o dedo para nao criar zona morta */
      y0 = ev.clientY;
      dy = 0;
      folha.style.transform = '';
      modalEl.style.background = '';
      return;
    }
    if(folha.scrollTop > 0){ terminar(true); return; }
    folha.style.transform = `translateY(${dy}px)`;
    modalEl.style.background = `rgba(0,0,0,${Math.max(0, .62 - dy/700)})`;
    /* passou do ponto de nao retorno: o fundo clareia mais rapido */
    if(expansivel && folha.classList.contains('expandida'))
      modalEl.style.background =
        `rgba(0,0,0,${Math.max(0, .62 - dy/(window.innerHeight*0.75))})`;
  });

  function terminar(cancelar){
    if(!ativo) return;
    ativo = false;
    folha.classList.remove('puxando');
    folha.classList.add('voltando');

    /* puxou para cima o bastante: expande em vez de fechar */
    if(expansivel && dy < -45 && !cancelar){
      folha.style.transform = '';
      modalEl.style.background = '';
      if(typeof aoExpandir === 'function') aoExpandir();
      else folha.classList.add('expandida');
      return;
    }

    /* estando expandida, a distancia decide quantos niveis desfazer:
       um puxao curto volta ao tamanho normal, um puxao longo fecha tudo. */
    if(expansivel && folha.classList.contains('expandida') && !cancelar){
      const fechaTudo = dy > window.innerHeight * 0.40;
      if(fechaTudo){
        folha.style.transform = 'translateY(110%)';
        modalEl.style.background = 'rgba(0,0,0,0)';
        setTimeout(() => {
          folha.classList.remove('expandida');
          fechar(); limpar();
        }, 200);
        return;
      }
      if(dy > 80){
        folha.style.transform = '';
        modalEl.style.background = '';
        if(typeof aoEncolher === 'function') aoEncolher();
        else folha.classList.remove('expandida');
        return;
      }
    }

    const longe = dy > 110;
    if(longe && !cancelar){
      folha.style.transform = 'translateY(110%)';
      modalEl.style.background = 'rgba(0,0,0,0)';
      setTimeout(() => { fechar(); limpar(); }, 200);
    }else{
      folha.style.transform = '';
      modalEl.style.background = '';
    }
  }

  function limpar(){
    folha.style.transform = '';
    folha.style.height = '';   /* senao a folha reabre com a altura antiga presa */
    folha.classList.remove('voltando');
    modalEl.style.background = '';
  }

  folha.addEventListener('pointerup', () => terminar(false));
  folha.addEventListener('pointercancel', () => terminar(true));

  /* impede a pagina de rolar enquanto a folha esta sendo puxada */
  folha.addEventListener('touchmove', ev => {
    if(!ativo) return;
    const puxandoParaCima = dy < 0 && expansivel && !folha.classList.contains('expandida');
    /* sem isso o navegador assume o gesto como rolagem, dispara pointercancel
       e a expansao nunca chega a acontecer */
    if(dy > 0 || puxandoParaCima) ev.preventDefault();
  }, {passive:false});

  return limpar;
}




/* ================== LISTAS ================== */

const mlistas = document.getElementById('mlistas');
const lsCaixa = document.getElementById('ls-caixa');
const lsNome  = document.getElementById('ls-nome');
const lsAviso = document.getElementById('ls-aviso');

function pintarNomeLista(){
  const l = listas.find(x => x.id === ativa);
  document.getElementById('nome-lista').textContent = l ? l.nome : 'Backlog';
  document.getElementById('tipo-ic').innerHTML = iconeTipo(tipoDa(l));
}

function pintarListas(){
  lsCaixa.innerHTML = '';
  listas.forEach(l => {
    const qt = (l.id === ativa ? jogos : (acervo[l.id] || [])).length;
    const el = document.createElement('div');
    el.className = 'lst-item' + (l.id === ativa ? ' ativa' : '');
    const tp = tipoDa(l);
    el.innerHTML = `<span class="marcador"></span>
      <span class="lst-ic">${iconeTipo(tp)}</span>
      <span class="lst-nome">${l.nome}</span>
      <span class="lst-qt">${qt} ${palavra(tp, qt)}</span>
      <button class="lst-lapis" aria-label="Renomear ${l.nome}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.8a2.1 2.1 0 013 3L8 18.3l-4 1 1-4z"/></svg>
      </button>
      <button class="apagar" aria-label="Apagar ${l.nome}">&#10005;</button>`;
    el.querySelector('.lst-nome').onclick  = () => trocarLista(l.id);
    el.querySelector('.lst-qt').onclick    = () => trocarLista(l.id);
    el.querySelector('.lst-lapis').onclick = e => { e.stopPropagation(); renomearLista(l.id, el); };
    el.querySelector('.apagar').onclick    = e => { e.stopPropagation(); apagarLista(l.id); };
    lsCaixa.appendChild(el);
  });
}

/* renomear acontece na propria linha: sair da folha para outra tela
   por causa de um campo de texto e caro para uma acao tao pequena */
function renomearLista(id, linha){
  const l = listas.find(x => x.id === id);
  if(!l || linha.classList.contains('renomeando')) return;
  lsAviso.textContent = '';
  linha.classList.add('renomeando');

  const alvo = linha.querySelector('.lst-nome');
  const campo = document.createElement('input');
  campo.className = 'lst-campo';
  campo.value = l.nome;
  campo.setAttribute('aria-label', 'Novo nome da lista');
  alvo.replaceWith(campo);
  campo.focus();
  campo.select();

  let encerrado = false;
  const encerrar = async guardarNome => {
    if(encerrado) return;
    encerrado = true;
    const novo = campo.value.trim();
    if(guardarNome && novo && novo !== l.nome){
      l.nome = novo;
      await salvar();
      pintarNomeLista();
    }
    pintarListas();
  };
  campo.onblur = () => encerrar(true);
  campo.onkeydown = e => {
    if(e.key === 'Enter'){ e.preventDefault(); campo.blur(); }
    if(e.key === 'Escape'){ encerrado = false; campo.onblur = null; encerrar(false); }
  };
}

async function trocarLista(id){
  if(id === ativa){ fecharFolha(mlistas); return; }
  acervo[ativa] = jogos;
  ativa = id;
  jogos = acervo[id] || [];
  filtro = null;
  /* a lista nova tem configuracao propria: nomes de status e quais
     aparecem mudam junto com ela */
  aplicarConfigDaLista();
  fecharFolha(mlistas);
  pintarNomeLista();
  pintarAvatares();
  pintarStatus(); pintarChaveTopo(); pintarResumoStatus();
  semEntrada = false;      /* lista nova merece a animacao de entrada */
  desenhar();
  await salvar();
}

async function apagarLista(id){
  if(listas.length === 1){
    lsAviso.textContent = 'Esta é sua única lista — crie outra antes de apagar.';
    return;
  }
  const l = listas.find(x => x.id === id);
  const qt = (acervo[id] || []).length;
  const ok = await confirmar({
    titulo: `Apagar "${l.nome}"?`,
    texto: qt
      ? `Os ${qt} ${palavra(tipoDa(l), qt)} dentro dela vão junto. Não dá para desfazer.`
      : 'A lista está vazia. Não dá para desfazer.',
    botao: 'Apagar', perigo: true
  });
  if(!ok) return;

  listas = listas.filter(x => x.id !== id);
  delete acervo[id];
  if(ativa === id){
    ativa = listas[0].id;
    jogos = acervo[ativa] || [];
    aplicarConfigDaLista();
    pintarNomeLista();
    pintarAvatares();
    semEntrada = true;
    desenhar();
  }
  pintarListas();
  lsAviso.textContent = '';
  await salvar();
}

let tipoNovo = TIPO_PADRAO;

function pintarTiposNovos(){
  const caixa = document.getElementById('ls-tipos');
  caixa.innerHTML = '';
  Object.keys(TIPOS).forEach(t => {
    const b = document.createElement('button');
    b.className = 'ls-tipo';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(t === tipoNovo));
    b.innerHTML = iconeTipo(t) + '<span>' + TIPOS[t].nome + '</span>';
    b.onclick = () => {
      tipoNovo = t;
      pintarTiposNovos();
      /* o exemplo do campo acompanha o tipo, senao 'ex: Jogar sozinho'
         numa lista de livros parece que o app nao entendeu a escolha */
      lsNome.placeholder = t === 'livros' ? 'ex: Ler em 2026'
                         : t === 'telas'  ? 'ex: Ver com a Giulia'
                         : 'ex: Jogar sozinho';
    };
    caixa.appendChild(b);
  });
}

document.getElementById('ls-criar').onclick = async () => {
  const nome = lsNome.value.trim();
  if(!nome){ lsAviso.textContent = 'Dê um nome à lista.'; return; }
  const id = novoId();
  listas.push({id, nome, tipo: tipoNovo, membros: ['eu']});
  acervo[id] = [];
  lsNome.value = '';
  lsAviso.textContent = '';
  await trocarLista(id);
};
lsNome.addEventListener('keydown', e => {
  if(e.key === 'Enter') document.getElementById('ls-criar').click();
});

document.getElementById('btn-trocar').onclick = () => {
  lsAviso.textContent = ''; lsNome.value = '';
  tipoNovo = TIPO_PADRAO;
  pintarTiposNovos();
  pintarListas();
  limparListas();
  abrirFolha(mlistas);
};
document.getElementById('ls-fechar').onclick = () => fecharFolha(mlistas);
mlistas.onclick = e => { if(e.target === mlistas) fecharFolha(mlistas); };

const limparListas = folhaArrastavel(mlistas, () => fecharFolha(mlistas));

/* ================== MEMBROS ==================
   Membros pertencem a lista, nao ao app: voce compartilha listas
   diferentes com pessoas diferentes. Uma lista sua sozinho e o caso
   normal, nao a excecao. */

const PESSOAS = {
  eu:     { nome:'Você',   classe:'eu'    },
  giulia: { nome:'Giulia', classe:'outro' }
};

function membrosDa(l){
  /* quem nao tem a propriedade e lista antiga: voce e a Giulia */
  return (l && l.membros) ? l.membros : ['eu','giulia'];
}

function pintarAvatares(){
  const l = listas.find(x => x.id === ativa);
  const btn = document.getElementById('btn-membros');
  btn.innerHTML = membrosDa(l)
    .map(m => '<div class="avatar ' + (PESSOAS[m] || PESSOAS.eu).classe + '"></div>')
    .join('');
  btn.setAttribute('aria-label',
    'Membros da lista: ' + membrosDa(l).map(m => (PESSOAS[m] || {}).nome).join(', '));
}

function pintarMembros(){
  const l = listas.find(x => x.id === ativa);
  const caixa = document.getElementById('mb-lista');
  const atuais = membrosDa(l);
  document.getElementById('mb-qual').innerHTML =
    'Quem participa de <b>' + (l ? l.nome : '') + '</b>. Cada lista tem os seus.';

  caixa.innerHTML = '';
  Object.keys(PESSOAS).forEach(id => {
    const dentro = atuais.includes(id);
    const dono = id === 'eu';
    const qt = jogos.filter(j => j.por === PESSOAS[id].nome ||
                                 (id === 'eu' && j.por === 'Gabriel')).length;
    const el = document.createElement('div');
    el.className = 'mb-item' + (dentro ? '' : ' fora');
    el.innerHTML = `
      <span class="avatar ${PESSOAS[id].classe} mb-av"></span>
      <span class="mb-info"><span class="mb-nome">${PESSOAS[id].nome}</span>
        <span class="mb-sub">${dono ? 'criou a lista' : (dentro
          ? qt + ' ' + palavra(tipoDa(l), qt) + ' ' + (qt === 1 ? 'adicionado' : 'adicionados')
          : 'não participa desta lista')}</span></span>` +
      (dono ? '<span class="mb-tag">dono</span>'
            : '<button class="st-chave" aria-pressed="' + dentro + '" aria-label="Giulia nesta lista"></button>');
    if(!dono) el.querySelector('.st-chave').onclick = () => alternarMembro(id);
    caixa.appendChild(el);
  });
}

async function alternarMembro(id){
  const l = listas.find(x => x.id === ativa);
  const atuais = membrosDa(l).slice();
  const i = atuais.indexOf(id);
  if(i >= 0){
    /* sair da lista nao apaga o que a pessoa adicionou: os itens ficam,
       so deixam de ter dono visivel */
    atuais.splice(i, 1);
  }else{
    atuais.push(id);
  }
  l.membros = atuais;
  await salvar();
  pintarMembros(); pintarAvatares();
}

const mmembros = document.getElementById('mmembros');
document.getElementById('btn-membros').onclick = () => {
  pintarMembros(); limparMembros(); abrirFolha(mmembros);
};
document.getElementById('mb-fechar').onclick = () => fecharFolha(mmembros);
mmembros.onclick = e => { if(e.target === mmembros) fecharFolha(mmembros); };

document.getElementById('mb-add').onclick = () => {
  document.getElementById('mb-convite').classList.remove('escondido');
};
document.getElementById('mb-copiar').onclick = async () => {
  const campo = document.getElementById('mb-link');
  try{
    await navigator.clipboard.writeText(campo.value);
    document.getElementById('mb-copiar').textContent = 'Copiado';
    setTimeout(() => { document.getElementById('mb-copiar').textContent = 'Copiar'; }, 1600);
  }catch(e){
    campo.select();   /* sem permissao de area de transferencia, ao menos seleciona */
  }
};

const limparMembros = folhaArrastavel(mmembros, () => fecharFolha(mmembros));

/* ================== TROCAR A CAPA ================== */

const mcapa = document.getElementById('mcapa');
const cAviso = document.getElementById('c-aviso');
const cRes   = document.getElementById('c-resultados');
const cLinha = document.getElementById('c-busca-linha');

/* 'capa' = a de pe, na grade. 'destaque' = a larga, nos detalhes. */
let alvoImagem = 'capa';
const ROTULO = {capa:'Capa da grade (3:4)', destaque:'Imagem de destaque (16:9)'};

function abrirCapa(qual){
  alvoImagem = qual;
  document.getElementById('c-titulo').textContent = ROTULO[qual];
  document.getElementById('c-remover-txt').textContent =
    qual === 'capa' ? 'Remover capa' : 'Remover destaque';
  cAviso.textContent = '';
  cRes.innerHTML = '';
  cLinha.classList.add('escondido');
  limparCapa();
  abrirFolha(mcapa);
}
document.getElementById('e-btn-capa').onclick = () => abrirCapa('capa');
document.getElementById('e-btn-destaque').onclick = () => abrirCapa('destaque');
document.getElementById('c-fechar').onclick = () => fecharFolha(mcapa);
mcapa.onclick = e => { if(e.target === mcapa) fecharFolha(mcapa); };

async function aplicarCapa(url){
  jogos[iAberto][alvoImagem] = url;
  pintarPrevias();
  pintarCapaFicha();

  /* atualiza o card na grade sem reconstruir a tela toda */
  const naGrade = imagemGrade(jogos[iAberto]);
  const card = grade.querySelector(`.card[data-i="${iAberto}"]`);
  if(card){
    const capa = card.querySelector('.capa');
    const img  = capa.querySelector('img');
    if(naGrade){
      card.classList.remove('sem-capa');
      capa.classList.add('tem-imagem');
      if(img) img.src = naGrade;
      else capa.insertAdjacentHTML('afterbegin', `<img src="${naGrade}" alt="">`);
    }else{
      card.classList.add('sem-capa');
      capa.classList.remove('tem-imagem');
      if(img) img.remove();
    }
  }
  semEntrada = true;
  desenhar({soLista:true});
  fecharFolha(mcapa);
  await salvar();
}

/* ---- do dispositivo ---- */

const cInput = document.getElementById('c-input');
document.getElementById('c-arquivo').onclick = () => cInput.click();

cInput.onchange = () => {
  const arq = cInput.files && cInput.files[0];
  if(!arq) return;
  cAviso.textContent = 'Preparando a imagem…';
  const leitor = new FileReader();
  leitor.onload = () => encolher(leitor.result)
    .then(pequena => aplicarCapa(pequena))
    .catch(e => { cAviso.textContent = 'Não consegui ler a imagem: ' + e.message; });
  leitor.onerror = () => { cAviso.textContent = 'Falha ao ler o arquivo.'; };
  leitor.readAsDataURL(arq);
  cInput.value = '';
};

/* a foto do celular tem vários megabytes. guardar assim estoura o
   armazenamento em poucos jogos, entao reduzo antes de salvar. */
function encolher(dataUrl, largura = 500){
  return new Promise((ok, erro) => {
    const im = new Image();
    im.onload = () => {
      const escala = Math.min(1, largura / im.naturalWidth);
      const c = document.createElement('canvas');
      c.width  = Math.round(im.naturalWidth  * escala);
      c.height = Math.round(im.naturalHeight * escala);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    im.onerror = () => erro(new Error('formato não reconhecido'));
    im.src = dataUrl;
  });
}

/* ---- buscar na RAWG ---- */

document.getElementById('c-rawg').onclick = () => {
  cLinha.classList.remove('escondido');
  const campo = document.getElementById('c-busca');
  campo.value = jogos[iAberto].t;
  campo.focus();
  cAviso.textContent = chaveAtual() ? '' : 'Cole a chave da RAWG no modal de adicionar primeiro.';
};

document.getElementById('c-buscar').onclick = async () => {
  const termo = document.getElementById('c-busca').value.trim();
  const chave = chaveAtual();
  if(!chave){ cAviso.textContent = 'Sem chave da RAWG.'; return; }
  if(!termo){ cAviso.textContent = 'Digite um nome.'; return; }

  cAviso.textContent = 'Buscando…';
  cRes.innerHTML = '';
  try{
    const r = await fetch('https://api.rawg.io/api/games?key=' + encodeURIComponent(chave)
      + '&search=' + encodeURIComponent(termo) + '&page_size=9');
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const comCapa = (d.results || []).filter(g => g.background_image);
    cAviso.textContent = comCapa.length ? 'Toque na capa que você quer.' : 'Nenhuma capa encontrada.';
    const caixa = document.createElement('div');
    caixa.className = 'c-res';
    comCapa.forEach(g => {
      const b = document.createElement('button');
      b.innerHTML = `<img src="${g.background_image}" alt="${g.name}">`;
      b.onclick = () => aplicarCapa(g.background_image);
      caixa.appendChild(b);
    });
    cRes.appendChild(caixa);
  }catch(e){
    cAviso.textContent = 'Busca falhou: ' + e.message;
  }
};

/* ---- remover ---- */
document.getElementById('c-remover').onclick = () => aplicarCapa(null);

const limparCapa = folhaArrastavel(mcapa, () => fecharFolha(mcapa));
const limparEdit = folhaArrastavel(medit, () => fecharFolha(medit));

const limparFicha = folhaArrastavel(ficha, () => fecharFolha(ficha), true);
const limparAdd   = folhaArrastavel(modal, () => fecharFolha(modal));

/* ================== ARRASTAR ================== */

const central = document.getElementById('abrir');
const tabbar  = document.querySelector('.tabbar');
const ICONE_MAIS   = central.innerHTML;
const ICONE_LIXO   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9.5 7V5h5v2M6.5 7l1 12.5h9L17.5 7"/></svg>';

/* o arraste vale nos dois modos: muda o container e o seletor, o resto e igual */
const area = () => emGrade ? grade : lista;
const ITEM = '.card, .linha';

let bloquearClique = false;
let seg = null;      /* temporizador do toque longo */
let arr = null;      /* {i, el, voando, dx, dy} */

function pegar(card, ev){
  /* voa o CARD inteiro: capa, titulo e o fundo arredondado */
  const r = card.getBoundingClientRect();
  const voando = document.createElement('div');
  voando.className = 'voando';
  const copia = card.cloneNode(true);
  copia.classList.remove('fantasma');
  copia.classList.add('copia');
  copia.style.width  = r.width + 'px';
  copia.style.height = r.height + 'px';
  voando.appendChild(copia);
  document.body.appendChild(voando);
  /* espera um quadro para o navegador registrar a escala 1 antes de crescer */
  requestAnimationFrame(() => copia.classList.add('erguido'));

  arr = {
    i: +card.dataset.i,
    el: card,
    voando,
    copia,
    dx: ev.clientX - r.left,
    dy: ev.clientY - r.top,
    escala: 1.09,
    ultimo: null,
    esperaAte: 0,
    naLixeira: false
  };
  card.classList.add('fantasma');
  document.body.classList.add('arrastando');
  central.innerHTML = ICONE_LIXO;
  central.classList.add('lixeira');
  tabbar.classList.add('zona');
  if(navigator.vibrate) navigator.vibrate(14);
  mover(ev);
}


/* FLIP: mede a posicao antes, deixa o DOM mudar, mede de novo
   e anima do lugar antigo para o novo. O navegador faz o resto. */
const SEM_ANIMACAO = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function comAnimacao(mudar){
  if(SEM_ANIMACAO){ mudar(); return; }

  const cards = [...area().querySelectorAll(ITEM)];
  const antes = new Map(cards.map(c => [c, c.getBoundingClientRect()]));

  mudar();

  cards.forEach(c => {
    if(arr && c === arr.el) return;          /* o que voce segura nao desliza */
    const a = antes.get(c), d = c.getBoundingClientRect();
    const dx = a.left - d.left, dy = a.top - d.top;
    if(!dx && !dy) return;
    c.animate(
      [{transform:`translate(${dx}px, ${dy}px)`}, {transform:'none'}],
      {duration:210, easing:'cubic-bezier(.2,.75,.25,1)'}
    );
  });
}

function mover(ev){
  if(!arr) return;
  arr.voando.style.transform =
    `translate(${ev.clientX - arr.dx}px, ${ev.clientY - arr.dy}px)`;

  const naLixeira = ev.clientY > window.innerHeight - 84;
  if(naLixeira !== arr.naLixeira){
    arr.naLixeira = naLixeira;
    central.classList.toggle('perto', naLixeira);
    tabbar.classList.toggle('quente', naLixeira);
    arr.copia.classList.toggle('condenado', naLixeira);
    arr.copia.classList.toggle('erguido', !naLixeira);
    if(naLixeira && navigator.vibrate) navigator.vibrate(18);
  }
  if(naLixeira){ arr.ultimo = null; return; }

  /* o card inteiro vale como alvo: capa, titulo e o espaco entre eles */
  const sob = document.elementFromPoint(ev.clientX, ev.clientY);
  const outro = sob && sob.closest ? sob.closest(ITEM) : null;

  if(!outro || outro === arr.el){ arr.ultimo = null; return; }
  if(outro === arr.ultimo) return;
  if(Date.now() < arr.esperaAte) return;   /* evita ida e volta em looping */

  arr.ultimo   = outro;
  arr.esperaAte = Date.now() + 180;

  /* TROCA: os dois permutam de lugar. o resto da grade fica parado. */
  comAnimacao(() => {
    const caixa = arr.el.parentNode;
    const marcador = document.createComment('');
    caixa.insertBefore(marcador, arr.el);
    caixa.insertBefore(arr.el, outro);
    caixa.insertBefore(outro, marcador);
    marcador.remove();
  });

  if(navigator.vibrate) navigator.vibrate(6);
}

async function soltar(ev){
  clearTimeout(seg); seg = null;
  if(!arr) return;

  const apagou = ev && ev.clientY > window.innerHeight - 84;
  const iOriginal = +arr.el.dataset.i;
  const voando = arr.voando, copiaEl = arr.copia, alvoEl = arr.el;

  /* a copia encolhe de volta antes de sair de cena.
     no caso de apagar, encolhe ate sumir. */
  const encerrar = () => {
    if(SEM_ANIMACAO){ voando.remove(); alvoEl.classList.remove('fantasma'); return; }
    if(apagou){
      /* sai voando para o centro da lixeira enquanto encolhe */
      const lata = central.getBoundingClientRect();
      copiaEl.classList.remove('condenado','erguido');
      voando.style.transition = 'transform .26s cubic-bezier(.5,0,.75,0)';
      voando.style.transform  =
        `translate(${lata.left + lata.width/2 - 26}px, ${lata.top + lata.height/2 - 26}px)`;
      copiaEl.classList.add('sumindo');
      if(navigator.vibrate) navigator.vibrate([12, 40, 22]);
      setTimeout(() => voando.remove(), 280);
      return;
    }
    /* pousa: desliza ate a posicao final do card e volta ao tamanho normal */
    const destino = alvoEl.getBoundingClientRect();
    voando.style.transition = 'transform .19s cubic-bezier(.2,.85,.3,1)';
    voando.style.transform  = `translate(${destino.left}px, ${destino.top}px)`;
    copiaEl.classList.remove('erguido');
    setTimeout(() => {
      voando.remove();
      alvoEl.classList.remove('fantasma');
    }, 190);
  };

  document.body.classList.remove('arrastando');
  central.innerHTML = ICONE_MAIS;
  central.classList.remove('lixeira','perto');
  tabbar.classList.remove('zona','quente');
  arr = null;
  bloquearClique = true;
  setTimeout(() => { bloquearClique = false; }, 320);

  if(apagou){
    encerrar();
    const removido = jogos[iOriginal];
    jogos.splice(iOriginal, 1);
    semEntrada = true;
    desenhar(); await salvar();
    desfazer(removido, iOriginal);
    return;
  }

  /* le a ordem final direto da tela e reescreve os dados */
  const cards  = [...area().querySelectorAll(ITEM)];
  const naTela = cards.map(el => +el.dataset.i);
  const vagas  = [...naTela].sort((a,b) => a - b);   /* funciona mesmo com filtro ligado */
  const copia  = jogos.slice();
  naTela.forEach((iAntigo, pos) => { jogos[vagas[pos]] = copia[iAntigo]; });

  /* a grade JA esta na ordem certa na tela.
     reconstruir tudo so recarregaria as imagens e faria piscar.
     entao corrijo os indices no lugar e redesenho apenas a lista. */
  cards.forEach((el, pos) => { el.dataset.i = vagas[pos]; });

  if(!ordemManual){ ordemManual = true; atualizarOrdem(); }
  semEntrada = true;
  /* o container que voce arrastou ja esta certo na tela; redesenhar
     ele so recarregaria as imagens. entao redesenho o outro. */
  desenhar(emGrade ? {soLista:true} : {soGrade:true});
  encerrar();          /* so agora: precisa da posicao final ja definida */
  await salvar();
}

function desfazer(jogo, i){
  const antigo = document.querySelector('.toast');
  if(antigo) antigo.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>"${jogo.t}" removido</span><button>Desfazer</button>`;
  t.querySelector('button').onclick = async () => {
    jogos.splice(i, 0, jogo);
    t.remove(); desenhar(); await salvar();
  };
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

function ligarArraste(caixa, seletor){
caixa.addEventListener('pointerdown', ev => {
  const card = ev.target.closest(seletor);
  if(!card) return;
  const inicio = {x: ev.clientX, y: ev.clientY};
  const cancelar = e2 => {
    if(Math.hypot(e2.clientX - inicio.x, e2.clientY - inicio.y) > 10){
      clearTimeout(seg); seg = null;
      document.removeEventListener('pointermove', cancelar);
    }
  };
  document.addEventListener('pointermove', cancelar);
  seg = setTimeout(() => {
    document.removeEventListener('pointermove', cancelar);
    card.setPointerCapture && card.setPointerCapture(ev.pointerId);
    pegar(card, ev);
  }, 420);
});
caixa.addEventListener('contextmenu', ev => { if(arr) ev.preventDefault(); });
}
ligarArraste(grade, '.card');
ligarArraste(lista, '.linha');

document.addEventListener('pointermove', ev => { if(arr) mover(ev); });
document.addEventListener('pointerup', soltar);
document.addEventListener('pointercancel', soltar);
/* impede a pagina de rolar enquanto arrasta */
document.addEventListener('touchmove', ev => { if(arr) ev.preventDefault(); }, {passive:false});
/* o menu do sistema no toque longo ja e barrado dentro de ligarArraste */

/* ================== ORDEM ================== */

function atualizarOrdem(){
  pintarPerfil();
  guardar(K_ORDEM, ordemManual);
}

/* ================== PERFIL E CONFIGURAÇÕES ================== */

/* ---- navegacao por paginas ----
   uma pilha propria. o botao voltar do telefone desfaz um nivel por vez,
   igual as folhas, porque tudo passa pela mesma pilha de historico. */
const tabPerfil = document.getElementById('tab-perfil');
const tabListas = document.getElementById('tab-listas');
const trilha = ['pg-listas'];

let saindoAgora = null;
function pintarPagina(sentido){
  const atual = trilha[trilha.length - 1];
  const anterior = document.querySelector('.pagina.ativa');

  /* limpa uma saida que ainda estivesse rodando, senao duas se acumulam */
  if(saindoAgora){
    clearTimeout(saindoAgora.t);
    saindoAgora.el.classList.remove('ativa','saindo','s-adiante','s-atras');
    saindoAgora = null;
  }

  document.querySelectorAll('.pagina').forEach(s => s.classList.remove('ativa','adiante','atras'));
  const el = document.getElementById(atual);
  el.classList.add('ativa');

  /* a pagina que sai continua visivel por um instante, presa no topo da
     tela, para as duas se cruzarem. sem isso a antiga some seca. */
  /* so anima a saida perto do topo: presa em position:fixed, uma pagina
     rolada saltaria para o inicio antes de sair, e o salto e pior que a falta. */
  if(sentido && anterior && anterior !== el && !SEM_ANIMACAO && window.scrollY < 40){
    anterior.classList.add('ativa','saindo', sentido === 'adiante' ? 's-adiante' : 's-atras');
    const t = setTimeout(() => {
      anterior.classList.remove('ativa','saindo','s-adiante','s-atras');
      saindoAgora = null;
    }, 380);
    saindoAgora = {el:anterior, t};
  }
  const naLista = atual === 'pg-listas';
  document.body.dataset.aba = naLista ? 'listas' : 'perfil';
  tabPerfil.setAttribute('aria-current', naLista ? 'false' : 'page');
  tabListas.setAttribute('aria-current', naLista ? 'page' : 'false');
  return el;
}

function irPara(id){
  if(trilha[trilha.length - 1] === id) return;
  trilha.push(id);
  pintarPagina('adiante').classList.add('adiante');
  window.scrollTo(0, 0);
  empilhar({pagina:id}, () => { trilha.pop(); pintarPagina('atras').classList.add('atras'); });
}

/* volta um nivel usando o historico, para nao sair de sincronia */
function voltarPagina(){
  if(trilha.length > 1) history.back();
}

/* volta ate a raiz de uma vez: encontra a primeira pagina empilhada
   e desfaz dali para cima, folhas abertas no meio inclusive */
function irParaRaiz(){
  if(trilha.length <= 1) return;
  const i = pilhaFolhas.findIndex(x => x.el && x.el.pagina);
  if(i < 0) return;
  history.go(-(pilhaFolhas.length - i));
}

document.querySelectorAll('[data-vai]').forEach(b => {
  b.onclick = () => {
    pintarPerfil();
    if(b.dataset.vai === 'pg-status') pintarStatus();
    irPara(b.dataset.vai);
  };
});
document.querySelectorAll('[data-volta]').forEach(b => { b.onclick = voltarPagina; });

tabPerfil.onclick = () => { pintarPerfil(); irPara('pg-perfil'); };
tabListas.onclick = irParaRaiz;
pintarPagina();

/* ---- gesto de borda ----
   puxar da borda direita para dentro avanca para o Perfil;
   puxar da borda esquerda para dentro volta um nivel.
   so nas bordas, para nao roubar o toque longo dos cards. */
/* a faixa e larga porque a borda arredondada do telefone come os
   primeiros pixels. nao briga com o card: mover mais de 10px ja
   cancela o toque longo, entao parado pega o card e deslizando faz o gesto. */
const BORDA = 44;
const CURSO = 78;
let bd = null;

/* o gesto so comeca se tiver para onde ir. dar arrasto sem destino
   e pior que nao ter gesto: parece defeito. */
function destinoDaBorda(lado){
  const atual = trilha[trilha.length - 1];
  if(lado === 'dir') return atual === 'pg-listas' ? 'perfil' : null;
  return trilha.length > 1 ? 'voltar' : null;
}

/* espaco vazio = nada interativo sob o dedo. ali o unico gesto
   concorrente e a rolagem, que e vertical — da para separar sozinho. */
const espacoVazio = alvo =>
  !alvo.closest('button, a, input, textarea, select, .modal, .toast');

document.addEventListener('pointerdown', ev => {
  if(arr || document.querySelector('.modal:not(.escondido)')) return;

  const naBorda = ev.clientX > window.innerWidth - BORDA || ev.clientX < BORDA;
  const vazio = espacoVazio(ev.target);
  /* sobre um card, so a faixa lateral vale: o miolo pertence ao card */
  if(!naBorda && !vazio) return;

  bd = {x0:ev.clientX, y0:ev.clientY, lado:null, destino:null,
        valeu:false, vivo:false, deVazio:vazio && !naBorda};
});

document.addEventListener('pointermove', ev => {
  if(!bd) return;
  const dx = ev.clientX - bd.x0, dy = ev.clientY - bd.y0;
  if(Math.abs(dx) < 6 && Math.abs(dy) < 6) return;   /* ainda nao deu para saber */
  if(Math.abs(dy) > Math.abs(dx)){ bd = null; return; }

  /* o lado nasce da direcao do dedo, nao de onde ele encostou */
  if(!bd.lado){
    bd.lado = dx < 0 ? 'dir' : 'esq';
    bd.destino = destinoDaBorda(bd.lado);
    if(!bd.destino){ bd = null; return; }
  }
  const anda = bd.lado === 'dir' ? -dx : dx;
  if(anda < 0){ bd = null; return; }

  if(!bd.vivo && anda > 8){
    bd.vivo = true;
    clearTimeout(seg); seg = null;          /* o card nao vai junto */
  }
  if(!bd.vivo) return;

  const passou = anda > CURSO;
  if(passou !== bd.valeu){
    bd.valeu = passou;
    if(passou && navigator.vibrate) navigator.vibrate(9);
  }

  const el = document.getElementById(trilha[trilha.length - 1]);
  const puxao = Math.min(anda, CURSO) * .3;
  el.style.transform = `translateX(${bd.lado === 'dir' ? -puxao : puxao}px)`;
});

function encerrarBorda(){
  if(!bd) return;
  const el = document.getElementById(trilha[trilha.length - 1]);
  el.style.transition = 'transform .2s ease';
  el.style.transform = '';
  setTimeout(() => { el.style.transition = ''; }, 220);
  const {destino, valeu} = bd;
  bd = null;
  if(!valeu) return;
  if(destino === 'perfil'){ pintarPerfil(); irPara('pg-perfil'); }
  else voltarPagina();
}
document.addEventListener('pointerup', encerrarBorda);
document.addEventListener('pointercancel', encerrarBorda);
document.addEventListener('touchmove', ev => {
  if(bd && bd.vivo) ev.preventDefault();
}, {passive:false});


/* ---------- backup: uma copia do que esta no aparelho ----------
   A chave da RAWG fica de fora de proposito: credencial nao entra em
   arquivo que o dono vai mandar por WhatsApp para si mesmo. */
const CHAVES_BACKUP = [K_DADOS, K_ORDEM, K_STATUS, K_TOPO];

async function montarBackup(){
  const conteudo = {};
  for(const k of CHAVES_BACKUP){
    const v = await ler(k, null);
    if(v !== null) conteudo[k] = v;
  }
  return { app:'backlog', formato:1, salvo_em:new Date().toISOString(), conteudo };
}

function resumoBackup(pacote){
  const d = pacote?.conteudo?.[K_DADOS];
  if(!d?.listas) return null;
  const linhas = d.listas.map(l => {
    const n = (d.acervo?.[l.id] || []).length;
    return `${l.nome} — ${n} ${n === 1 ? 'jogo' : 'jogos'}`;
  });
  return linhas;
}

document.getElementById('btn-exportar').onclick = async () => {
  const aviso = document.getElementById('aviso-backup');
  try{
    const pacote = await montarBackup();
    const nome = 'backlog-' + new Date().toISOString().slice(0,10) + '.json';
    const url = URL.createObjectURL(new Blob([JSON.stringify(pacote, null, 2)],
      { type:'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click();
    a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    const r = resumoBackup(pacote) || [];
    aviso.textContent = 'Cópia salva: ' + nome + ' (' + r.length +
      (r.length === 1 ? ' lista)' : ' listas)');
    aviso.className = 'aviso ok';
  }catch(e){
    aviso.textContent = 'Não consegui gerar o arquivo: ' + e.message;
    aviso.className = 'aviso ruim';
  }
};

document.getElementById('btn-importar').onclick = () =>
  document.getElementById('arq-importar').click();

document.getElementById('arq-importar').onchange = async ev => {
  const aviso = document.getElementById('aviso-backup');
  const arq = ev.target.files?.[0];
  ev.target.value = '';                     /* permite escolher o mesmo arquivo de novo */
  if(!arq) return;
  try{
    const pacote = JSON.parse(await arq.text());
    if(pacote?.app !== 'backlog' || !pacote?.conteudo?.[K_DADOS])
      throw new Error('Este arquivo não é uma cópia do app.');

    const linhas = resumoBackup(pacote);
    const ok = await confirmar({
      titulo: 'Restaurar cópia?',
      texto: 'O arquivo tem:\n\n' + linhas.join('\n') +
             '\n\nIsso substitui tudo o que está no aparelho agora. ' +
             'Não dá para desfazer.',
      botao: 'Restaurar', perigo: true
    });
    if(!ok) return;

    for(const k of CHAVES_BACKUP){
      if(k in pacote.conteudo) await guardar(k, pacote.conteudo[k]);
    }
    aviso.textContent = 'Restaurado. Recarregando…';
    aviso.className = 'aviso ok';
    setTimeout(() => location.reload(), 700);
  }catch(e){
    aviso.textContent = 'Não deu para restaurar: ' + e.message;
    aviso.className = 'aviso ruim';
  }
};

function pintarPerfil(){
  const o = document.getElementById('p-ordem-b');
  if(!o) return;
  o.textContent = ordemManual ? 'Manual' : 'Status';
  document.getElementById('p-ordem-v').textContent = ordemManual
    ? 'você decide a posição arrastando'
    : 'agrupa por jogando, espera, pausado…';
  document.getElementById('p-marca-b').textContent = estiloMarca === 'canto' ? 'Canto' : 'Barra';
  document.getElementById('p-marca-v').textContent = estiloMarca === 'canto'
    ? 'ícone no canto da capa'
    : 'faixa colorida no topo da capa';
}

document.getElementById('p-ordem').onclick = () => {
  ordemManual = !ordemManual;
  atualizarOrdem();
  semEntrada = true;
  desenhar();
};
/* Uma folha de confirmacao propria: devolve uma promessa, entao quem
   chama espera a resposta como esperaria o confirm() do navegador. */
const mconf = document.getElementById('mconf');
let responderConf = null;

function confirmar({titulo, texto, botao = 'Confirmar', perigo = false}){
  document.getElementById('cf-titulo').textContent = titulo;
  document.getElementById('cf-texto').textContent  = texto;
  const sim = document.getElementById('cf-sim');
  sim.textContent = botao;
  sim.classList.toggle('perigo', perigo);
  abrirFolha(mconf);
  return new Promise(r => { responderConf = r; });
}

function fecharConf(resposta){
  if(!responderConf) return;
  const r = responderConf;
  responderConf = null;
  fecharFolha(mconf);
  r(resposta);
}
document.getElementById('cf-sim').onclick = () => fecharConf(true);
document.getElementById('cf-nao').onclick = () => fecharConf(false);
mconf.onclick = e => { if(e.target === mconf) fecharConf(false); };

/* ---- status usados ---- */

const NOTA_ST = {
  jogando:'no que voces estao jogando agora',
  espera:'na fila para começar',
  pausado:'começou e parou',
  finalizado:'terminado',
  indefinido:'onde todo jogo novo entra',
};

/* conta em todas as listas, nao so na aberta: desligar um status
   esconderia jogos de outra lista sem a pessoa perceber */
function jogosComStatus(e){
  acervo[ativa] = jogos;
  return jogos.filter(j => j.s === e).length;
}

function pintarStatus(){
  const caixa = document.getElementById('st-caixa');
  if(!caixa) return;

  /* Nao existe seletor de lista aqui de proposito: voce chega nesta tela
     a partir da lista aberta, entao 'qual lista' ja foi respondido pelo
     caminho. O aviso abaixo so torna isso visivel. */
  const l = listas.find(x => x.id === ativa);
  document.getElementById('st-qual').innerHTML =
    'Configurando <b>' + (l ? l.nome : '') + '</b>. Cada lista tem os seus. ' +
    'Desligue os que você não usa — eles somem da ficha e do topo.';

  pintarCopiarStatus();
  caixa.innerHTML = '';
  ESTADOS.forEach(e => {
    const qt = jogosComStatus(e);
    const fixo = e === 'indefinido';
    const linha = document.createElement('div');
    linha.className = 'st-linha';
    linha.innerHTML = `
      <span class="st-bola" style="background:var(--${e})"></span>
      <span class="st-txt"><b>${NOMES[e]}</b><span>${
        fixo ? 'sempre ativo — ' + NOTA_ST[e]
             : qt ? `${qt} ${palavra(tipoDa(listas.find(x => x.id === ativa)), qt)} ${qt === 1 ? 'usa' : 'usam'} este status`
                  : NOTA_ST[e]}</span></span>
      <button class="st-chave" aria-pressed="${!!statusUsados[e]}"
              aria-label="${NOMES[e]}" ${fixo ? 'disabled' : ''}></button>`;
    if(!fixo){
      linha.querySelector('.st-chave').onclick = () => alternarStatus(e, qt);
    }
    caixa.appendChild(linha);
  });
}

function pintarCopiarStatus(){
  const caixa = document.getElementById('st-copiar');
  if(!caixa) return;
  caixa.innerHTML = '';
  const outras = listas.filter(l => l.id !== ativa);
  if(!outras.length){
    caixa.innerHTML = '<p class="p-nota">Você só tem esta lista.</p>';
    return;
  }
  outras.forEach(l => {
    const b = document.createElement('button');
    b.className = 'ms-op';
    const ligados = ESTADOS.filter(e => (l.status || {})[e] && e !== 'indefinido').length;
    b.innerHTML = '<span class="lst-ic">' + iconeTipo(tipoDa(l)) + '</span>' +
      '<span class="ms-nome">' + l.nome +
      '<span class="st-sub">' + ligados + ' status ligados</span></span>';
    b.onclick = () => copiarStatusDe(l);
    caixa.appendChild(b);
  });
}

async function copiarStatusDe(origem){
  const alvo = listas.find(x => x.id === ativa);
  /* copiar pode desligar status que esta em uso aqui: mesmo aviso de
     sempre, porque o efeito e o mesmo de desligar na mao */
  const perdidos = ESTADOS.filter(e =>
    e !== 'indefinido' && statusUsados[e] && !(origem.status || {})[e]
    && jogos.some(j => j.s === e));

  const ok = await confirmar({
    titulo: `Copiar de "${origem.nome}"?`,
    texto: perdidos.length
      ? `Isso desliga ${perdidos.map(e => '"' + NOMES[e] + '"').join(', ')} aqui, e os `
        + `itens que usam ${perdidos.length === 1 ? 'esse status' : 'esses status'} `
        + `passam para "Sem status". Não dá para desfazer.`
      : 'A configuração de status desta lista passa a ser igual à de '
        + `"${origem.nome}". Depois disso as duas seguem separadas.`,
    botao: 'Copiar', perigo: perdidos.length > 0
  });
  if(!ok) return;

  statusUsados = Object.assign(PADRAO_USADOS(), origem.status || {});
  statusUsados.indefinido = true;
  topoIndefinido = origem.topoIndef !== undefined ? origem.topoIndef : true;
  perdidos.forEach(e => jogos.forEach(j => { if(j.s === e) j.s = 'indefinido'; }));
  if(!statusUsados[filtro]) filtro = null;
  acervo[ativa] = jogos;
  guardarConfigDaLista();
  await salvar();
  aplicarConfigDaLista();
  pintarStatus(); pintarChaveTopo(); pintarResumoStatus();
  semEntrada = true; desenhar(); contar();
}

/* Desligar um status com jogos e permitido: em vez de travar e mandar a
   pessoa arrumar tudo na mao, eu aviso o que vai acontecer e faco. */
async function alternarStatus(e, qt){
  if(statusUsados[e] && qt > 0){
    const ok = await confirmar({
      titulo: `Desligar "${NOMES[e]}"?`,
      texto: `${qt} ${palavra(tipoDa(listas.find(x => x.id === ativa)), qt)} ${qt === 1 ? 'usa' : 'usam'} este status. `
           + `${qt === 1 ? 'Ele vai passar' : 'Eles vão passar'} para "Sem status". `
           + `Religar depois não desfaz isso.`,
      botao: 'Desligar', perigo: true,
    });
    if(!ok) return;
    /* so a lista aberta: a configuracao e dela, entao o efeito tambem e */
    jogos.forEach(j => { if(j.s === e) j.s = 'indefinido'; });
    acervo[ativa] = jogos;
    if(filtro === e) filtro = null;
    await salvar();
    semEntrada = true;
    desenhar();
  }
  statusUsados[e] = !statusUsados[e];
  guardarConfigDaLista();
  await salvar();
  pintarStatus(); pintarResumoStatus(); contar();
}

const chaveTopo = document.getElementById('st-topo');
chaveTopo.onclick = async () => {
  topoIndefinido = !topoIndefinido;
  /* se estava filtrando por ele, o filtro sai junto: senao a pessoa
     ficaria filtrada por um botao que nao existe mais na tela */
  if(!topoIndefinido && filtro === 'indefinido'){ filtro = null; semEntrada = true; desenhar(); }
  guardarConfigDaLista();
  await salvar();
  pintarChaveTopo(); contar();
};
function pintarChaveTopo(){
  chaveTopo.setAttribute('aria-pressed', String(topoIndefinido));
}

function pintarResumoStatus(){
  const el = document.getElementById('p-status-v');
  if(!el) return;
  const n = usados().length;
  el.textContent = n === ESTADOS.length ? 'todos os cinco' : `${n} de ${ESTADOS.length} ativos`;
}

document.getElementById('p-marca').onclick = () => {
  estiloMarca = estiloMarca === 'canto' ? 'barra' : 'canto';
  document.body.dataset.marca = estiloMarca;
  pintarPerfil();
};

/* ================== INÍCIO ================== */

(async () => {
  await detectarCofre();
  const d = await ler(K_DADOS, null);
  let renomeou = false;
  if(d && d.listas && d.listas.length){
    listas = d.listas;
    acervo = d.acervo || {};
    ativa  = acervo[d.ativa] !== undefined ? d.ativa : listas[0].id;
    /* quem ja tinha a lista com o nome antigo recebe o novo uma unica vez */
    const l = listas.find(x => x.nome === 'Coop com a Giulia');
    if(l){ l.nome = 'Meus jogos'; renomeou = true; }
    /* tudo o que existia antes do tipo era jogo. Marcar uma vez evita
       ficar adivinhando o tipo em cada tela pelo resto da vida do app. */
    listas.forEach(x => { if(!TIPOS[x.tipo]){ x.tipo = TIPO_PADRAO; renomeou = true; } });
  }else{
    /* migra quem ja usava a versao de lista unica, sem perder nada */
    const antigos = await ler(K_JOGOS, null);
    const id = novoId();
    listas = [{id, nome:'Meus jogos', tipo:TIPO_PADRAO}];
    acervo = {[id]: (antigos && antigos.length) ? antigos : PADRAO.map(j => ({...j}))};
    ativa  = id;
  }
  jogos = acervo[ativa] || [];
  if(renomeou) await salvar();
  pintarNomeLista();
  chaveRAWG   = await ler(K_CHAVE, '');
  chaveTMDB   = await ler(K_TMDB, '');
  ordemManual = await ler(K_ORDEM, true);
  /* migracao: o que estava numa gaveta unica vira propriedade de cada
     lista, uma vez so. As chaves antigas ficam para tras sem drama. */
  const stAntigo = await ler(K_STATUS, null);
  const topoAntigo = await ler(K_TOPO, null);
  let migrou = false;
  listas.forEach(l => {
    if(!l.status){
      l.status = Object.assign(PADRAO_USADOS(), stAntigo || {});
      l.status.indefinido = true;
      migrou = true;
    }
    if(l.topoIndef === undefined){
      l.topoIndef = topoAntigo === null ? true : topoAntigo;
      migrou = true;
    }
  });
  if(migrou) await salvar();
  aplicarConfigDaLista();
  pintarAvatares();
  pintarChaveTopo();
  pintarResumoStatus();
  if(chaveRAWG) document.getElementById('chave').value = chaveRAWG;
  if(chaveTMDB) document.getElementById('chave-tmdb').value = chaveTMDB;
  atualizarOrdem();
  desenhar();
})();
