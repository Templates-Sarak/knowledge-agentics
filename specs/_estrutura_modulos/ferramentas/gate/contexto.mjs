/**
 * contexto.mjs — monta o contexto de um módulo para as regras do gate.
 * Lei dona: specs/arquitetura/04-regras.md
 *
 * O contexto é o ÚNICO ponto que toca o disco. Regra nenhuma lê arquivo — todas recebem
 * o contexto pronto. É o que mantém as regras testáveis e o gate rápido.
 *
 * Molde: pasta iniciada por "_" é um _template. Os marcadores (<modulo>, <MODULO>, <Modulo>)
 * são substituídos EM MEMÓRIA por um id sintético, de modo que o molde passe exatamente pelas
 * mesmas regras que um módulo real (ADR-006). Nada é escrito de volta.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

// Gerado por ferramenta, nunca escrito por pessoa. Precisa cobrir TODO cache de linter e de
// runner: sem `.ruff_cache` aqui, rodar o linter fazia o gate reprovar em seguida por
// "entrada nao prevista" — a verificacao brigando com a verificacao.
const NAO_PERCORRER = new Set([
  'node_modules', '.git', '.turbo', 'dist', 'build', 'coverage', 'gerados',
  '__pycache__', '.venv', 'venv', '.pytest_cache', '.ruff_cache', '.mypy_cache',
  '.eslintcache', '.vite', '.next',
]);

// "Nao percorra o conteudo" e "nao conte como entrada da arvore" sao DUAS decisoes, e `gerados/` as
// separa: o conteudo dela e saida de maquina — varre-lo faria `hardcode-url`, `limiar-funcao` e
// `log` julgarem HTML gerado —, mas a PASTA e item declarado da arvore (`01-modulo.md` §2, "so se
// geraArtefato") e ja consta de `ENTRADAS_PERMITIDAS`. Enquanto as duas decisoes eram uma so, a
// pasta era invisivel ao gate: entrada permitida que nunca chegava a existir para regra nenhuma.
const CONTEUDO_IGNORADO_MAS_ENTRADA = new Set(['gerados']);

const EXT_CODIGO = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
const ID_SINTETICO_DO_MOLDE = 'molde';

/**
 * Le texto removendo o BOM (U+FEFF).
 * Editor e shell do Windows gravam BOM por padrao, e `JSON.parse` rejeita — o manifesto ficaria
 * "invalido" por um caractere invisivel, MASCARANDO todas as regras que dependem dele.
 */
function lerTexto(caminho) {
  return readFileSync(caminho, 'utf8').replace(/^﻿/, '');
}

/** Percorre a pasta do módulo, ignorando o que não é fonte. Devolve caminhos absolutos. */
function percorrer(pasta, acumulado = []) {
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    if (NAO_PERCORRER.has(entrada.name)) continue;
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) {
      percorrer(caminho, acumulado);
      continue;
    }
    acumulado.push(caminho);
  }
  return acumulado;
}

/** Substitui os marcadores do molde. Em módulo real devolve o texto intacto. */
function trocarMarcadores(texto, eMolde) {
  if (!eMolde) return texto;
  return texto
    .replaceAll('<MODULO>', ID_SINTETICO_DO_MOLDE.toUpperCase())
    .replaceAll('<Modulo>', 'Molde')
    .replaceAll('<modulo>', ID_SINTETICO_DO_MOLDE)
    .replaceAll('<escopo>', 'escopo');
}

/**
 * Linhas que sao CODIGO de verdade — sem comentario de linha, bloco `/* *\/` nem docstring Python.
 * Sem isto, uma lei escrita num comentario ("nunca use `datetime.now()`") vira violacao dela
 * mesma. Conservador de proposito: linha com cerca de texto e descartada inteira.
 */
function extrairLinhasDeCodigo(conteudo) {
  const linhas = [];
  let emBloco = false;
  let cerca = null;

  conteudo.split(/\r?\n/).forEach((texto, indice) => {
    const limpa = texto.trim();
    if (cerca !== null) {
      if (limpa.includes(cerca)) cerca = null;
      return;
    }
    if (emBloco) {
      if (limpa.includes('*/')) emBloco = false;
      return;
    }
    const aspas = ['"""', "'''"].find((delimitador) => limpa.includes(delimitador));
    if (aspas !== undefined) {
      if ((limpa.split(aspas).length - 1) % 2 === 1) cerca = aspas;
      return;
    }
    if (limpa.startsWith('/*')) {
      if (!limpa.includes('*/')) emBloco = true;
      return;
    }
    if (limpa.startsWith('//') || limpa.startsWith('#') || limpa.startsWith('*')) return;
    linhas.push({ numero: indice + 1, texto });
  });
  return linhas;
}

function ehTeste(relativo) {
  const normalizado = relativo.split(sep).join('/');
  return normalizado.startsWith('tests/')
    || normalizado.includes('/tests/')
    || /\.test\.|\.spec\.|_test\.py$/.test(normalizado);
}

function montarArquivo(absoluto, raiz, eMolde) {
  const rel = relative(raiz, absoluto).split(sep).join('/');
  const ponto = rel.lastIndexOf('.');
  const conteudo = trocarMarcadores(lerTexto(absoluto), eMolde);
  return {
    rel,
    abs: absoluto,
    ext: ponto === -1 ? '' : rel.slice(ponto),
    conteudo,
    linhasCodigo: extrairLinhasDeCodigo(conteudo),
    eTeste: ehTeste(rel),
  };
}

/** Lê o manifesto já com marcadores trocados. Falha de leitura vira `erro`, não exceção. */
function lerManifesto(raiz, eMolde) {
  const caminho = join(raiz, 'modulo.json');
  if (!existsSync(caminho)) return { manifesto: null, erro: 'modulo.json ausente' };
  try {
    const bruto = trocarMarcadores(lerTexto(caminho), eMolde);
    return { manifesto: JSON.parse(bruto), erro: null };
  } catch (causa) {
    return { manifesto: null, erro: `modulo.json invalido — ${String(causa)}` };
  }
}

/** Lê os cinco config/*.json. Arquivo ausente ou inválido entra como `null` para a regra reportar. */
function lerConfigs(raiz, eMolde) {
  const assuntos = ['api', 'dominio', 'seguranca', 'portas', 'textos'];
  const configs = {};
  for (const assunto of assuntos) {
    const caminho = join(raiz, 'config', `${assunto}.json`);
    if (!existsSync(caminho)) {
      configs[assunto] = { presente: false, valor: null };
      continue;
    }
    try {
      configs[assunto] = { presente: true, valor: JSON.parse(trocarMarcadores(lerTexto(caminho), eMolde)) };
    } catch {
      configs[assunto] = { presente: true, valor: null };
    }
  }
  return configs;
}

/** Nome de pasta do módulo, já resolvido para o id sintético quando for molde. */
export function idDaPasta(caminhoModulo) {
  const nome = basename(caminhoModulo);
  return nome.startsWith('_') ? ID_SINTETICO_DO_MOLDE : nome;
}

/**
 * Monta o contexto de UM módulo.
 * @param {string} raiz caminho da pasta do módulo
 * @param {string} raizProjeto caminho da raiz do projeto (para resolver .env e vizinhos)
 */
export function carregarContexto(raiz, raizProjeto) {
  const eMolde = basename(raiz).startsWith('_');
  const { manifesto, erro } = lerManifesto(raiz, eMolde);
  const arquivos = percorrer(raiz).map((abs) => montarArquivo(abs, raiz, eMolde));

  return {
    raiz,
    raizProjeto,
    eMolde,
    idPasta: idDaPasta(raiz),
    manifesto,
    manifestoErro: erro,
    configs: lerConfigs(raiz, eMolde),
    arquivos,
    codigo: arquivos.filter((a) => EXT_CODIGO.has(a.ext)),
    sql: arquivos.filter((a) => a.ext === '.sql'),
    // Artefato de build e cache de runtime nao contam como "entrada da arvore" — sao gerados,
    // nao escritos. Sem este filtro, `__pycache__` e `node_modules` reprovariam estrutura-estrita.
    // `gerados/` e a excecao declarada: conteudo fora, presenca dentro (ver o Set acima).
    entradasRaiz: readdirSync(raiz, { withFileTypes: true })
      .map((e) => e.name)
      .filter((nome) => !NAO_PERCORRER.has(nome) || CONTEUDO_IGNORADO_MAS_ENTRADA.has(nome)),
  };
}

/** Lista as pastas de `modulos/` que têm manifesto — inclusive os moldes. */
export function listarModulos(raizProjeto) {
  const base = join(raizProjeto, 'modulos');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((nome) => statSync(join(base, nome)).isDirectory())
    .filter((nome) => existsSync(join(base, nome, 'modulo.json')))
    .map((nome) => join(base, nome));
}

/** Sobe a partir de um caminho até achar a raiz do projeto (a que tem `modulos/`). */
export function acharRaizProjeto(partida) {
  let atual = partida;
  for (let nivel = 0; nivel < 8; nivel += 1) {
    if (existsSync(join(atual, 'modulos'))) return atual;
    const pai = join(atual, '..');
    if (relative(pai, atual) === '') break;
    atual = pai;
  }
  return partida;
}

/** Exceções nominais ratificadas (specs/arquitetura/04-regras.md §6). Sem `decisao`, a exceção é inválida. */
export function carregarExcecoes(raizProjeto) {
  const caminho = join(raizProjeto, 'config', 'conformidade.json');
  if (!existsSync(caminho)) return { validas: [], invalidas: [] };
  try {
    const { excecoes = [] } = JSON.parse(lerTexto(caminho));
    return {
      validas: excecoes.filter((e) => e.decisao),
      invalidas: excecoes.filter((e) => !e.decisao),
    };
  } catch {
    return { validas: [], invalidas: [] };
  }
}
