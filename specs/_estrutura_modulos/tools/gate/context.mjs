/**
 * context.mjs — monta o contexto de um módulo para as regras do gate.
 * Lei dona: specs/arquitetura/04-regras.md
 *
 * O contexto é o ÚNICO ponto que toca o disco. Regra nenhuma lê arquivo — todas recebem
 * o contexto pronto. É o que mantém as regras testáveis e o gate rápido.
 *
 * Molde: pasta iniciada por "_" é um _template. Os marcadores (<modulo>, <modulo_snake>,
 * <MODULO>, <Modulo>) são substituídos EM MEMÓRIA por um id sintético, de modo que o molde
 * passe exatamente pelas mesmas regras que um módulo real (ADR-006). Nada é escrito de volta.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

// Gerado por ferramenta, nunca escrito por pessoa. Precisa cobrir TODO cache de linter e de
// runner: sem `.ruff_cache` aqui, rodar o linter faz o gate reprovar em seguida por
// "entrada nao prevista" — a verificacao brigando com a verificacao.
const NAO_PERCORRER = new Set([
  'node_modules', '.git', '.turbo', 'dist', 'build', 'coverage', 'generated',
  '__pycache__', '.venv', 'venv', '.pytest_cache', '.ruff_cache', '.mypy_cache',
  '.eslintcache', '.vite', '.next',
]);

// "Nao percorra o conteudo" e "nao conte como entrada da arvore" sao DUAS decisoes, e `generated/` as
// separa: o conteudo dela e saida de maquina — varre-lo faria `hardcode-url`, `limiar-funcao` e
// `log` julgarem HTML gerado —, mas a PASTA e item declarado da arvore (`01-modulo.md` §2, "so se
// generatesArtifact") e ja consta de `ENTRADAS_PERMITIDAS`. Se as duas decisoes voltarem a ser uma so, a
// pasta fica invisivel ao gate: entrada permitida que nunca chega a existir para regra nenhuma.
const CONTEUDO_IGNORADO_MAS_ENTRADA = new Set(['generated']);

const EXT_CODIGO = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
const ID_SINTETICO_DO_MOLDE = 'molde';

/**
 * A FIACAO — o codigo que mora na raiz do projeto, fora de `modules/`.
 *
 * Sao estas tres e mais nenhuma. `tools/` fica de fora de proposito: e o gate, que o template
 * instala e ninguem edita — varre-lo faria as regras de raiz julgarem o proprio verificador.
 * `modules/` fica de fora porque ja tem 58 regras suas.
 */
const PASTAS_DA_RAIZ = ['adapters', 'src', 'packages'];

/**
 * Le texto removendo o BOM (U+FEFF) e normalizando CRLF para LF.
 * Editor e shell do Windows gravam BOM por padrao, e `JSON.parse` rejeita — o manifesto ficaria
 * "invalido" por um caractere invisivel, MASCARANDO todas as regras que dependem dele.
 *
 * A normalizacao de EOL e defesa em profundidade, nao o conserto estrutural (esse e o
 * `.gitattributes` de cada binding, que forca `eol=lf` no checkout). Ela cobre o que o
 * `.gitattributes` nao alcanca: um clone que ainda nao foi renormalizado, ou uma copia de disco
 * feita fora do git (`create-project.mjs` copia bytes crus ANTES do primeiro commit). Toda regra
 * que compara texto lido daqui byte a byte contra saida de gerador (`lint-derivado`) depende de
 * os dois lados concordarem em EOL — sem isto, `core.autocrlf=true` (Windows) faz o gate
 * reprovar 121 dos 122 casos do autoteste so por causa da quebra de linha.
 */
function lerTexto(caminho) {
  return readFileSync(caminho, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
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
    .replaceAll('<modulo_snake>', ID_SINTETICO_DO_MOLDE.replace(/-/g, '_'))
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
  const caminho = join(raiz, 'module.json');
  if (!existsSync(caminho)) return { manifesto: null, erro: 'module.json ausente' };
  try {
    const bruto = trocarMarcadores(lerTexto(caminho), eMolde);
    return { manifesto: JSON.parse(bruto), erro: null };
  } catch (causa) {
    return { manifesto: null, erro: `module.json invalido — ${String(causa)}` };
  }
}

/** Lê os cinco config/*.json. Arquivo ausente ou inválido entra como `null` para a regra reportar. */
function lerConfigs(raiz, eMolde) {
  const assuntos = ['api', 'domain', 'seguranca', 'ports', 'textos'];
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

/**
 * Config do PROJETO — lida uma vez por raiz, não uma vez por módulo.
 *
 * Ponto próprio, e não mais um campo montado dentro de `carregarContexto`, porque o dado é por
 * PROJETO: num repositório com dez módulos, `carregarContexto` roda dez vezes e leria os mesmos
 * arquivos dez vezes. A memória é por caminho de raiz, então dois projetos no mesmo processo (o
 * autoteste cria um temporário por caso) não se confundem.
 */
const projetosLidos = new Map();

/** Os nomes que o gerador pode produzir. Ler os dois é mais barato que descobrir o binding aqui. */
const CONFIGS_DE_LINT = ['eslint.config.js', '.ruff.toml'];

/** Lê o `project.json` da raiz. Ausência e JSON quebrado são estados declarados, não exceção. */
function lerManifestoDaRaiz(raizProjeto) {
  const caminho = join(raizProjeto, 'project.json');
  if (!existsSync(caminho)) return { presente: false, valor: null, erro: null };
  try {
    return { presente: true, valor: JSON.parse(lerTexto(caminho)), erro: null };
  } catch (causa) {
    return { presente: true, valor: null, erro: String(causa) };
  }
}

/**
 * O código da FIAÇÃO, e ele NAO entra em `ctx.arquivos` nem em `ctx.codigo` — essas duas coleções
 * são o material das regras de MODULO, cujos textos dizem literalmente "no código do módulo".
 * Deixar `adapters/memory/index.ts` cair ali faria `hardcode-url`, `log`, `limiar-funcao` e
 * `saida-crua` acusarem em massa código correto, sob leis que não falam dele.
 *
 * Por isso o código da raiz mora aqui, num ponto do PROJETO, e só regra de escopo `root` o vê.
 */
function lerCodigoDaRaiz(raizProjeto) {
  return PASTAS_DA_RAIZ
    .map((pasta) => join(raizProjeto, pasta))
    .filter((pasta) => existsSync(pasta))
    .flatMap((pasta) => percorrer(pasta))
    .map((absoluto) => montarArquivo(absoluto, raizProjeto, false))
    .filter((arquivo) => EXT_CODIGO.has(arquivo.ext));
}

/** `{ presente, valor }` de um `config/<nome>` na raiz — `valor` fica `null` em JSON ilegível ou
 * ausente, e é a regra dona (não este leitor) quem decide a mensagem para cada caso. */
function lerConfigDaRaiz(raizProjeto, nomeArquivo) {
  const caminho = join(raizProjeto, 'config', nomeArquivo);
  const config = { presente: existsSync(caminho), valor: null };
  if (config.presente) {
    try {
      config.valor = JSON.parse(lerTexto(caminho));
    } catch {
      config.valor = null;
    }
  }
  return config;
}

function lerProjeto(raizProjeto) {
  // "Raiz de projeto" é a pasta que tem `modules/` — a mesma definição de `acharRaizProjeto`. Sem
  // ela não há projeto: é módulo solto (extraído e ainda não religado) ou fixture, e cobrar
  // política de projeto de quem não é projeto seria falso positivo garantido.
  const ehProjeto = existsSync(join(raizProjeto, 'modules'));
  const verificacao = lerConfigDaRaiz(raizProjeto, 'verificacao.json');
  const conformidade = lerConfigDaRaiz(raizProjeto, 'conformidade.json');

  const configsDeLint = {};
  for (const nome of CONFIGS_DE_LINT) {
    const alvo = join(raizProjeto, nome);
    configsDeLint[nome] = existsSync(alvo) ? lerTexto(alvo) : null;
  }

  // O `.gitignore` da raiz, cru. Quem interpreta é a regra `gitignore-segredo` — aqui só se lê.
  const ignore = join(raizProjeto, '.gitignore');
  const gitignore = existsSync(ignore) ? lerTexto(ignore) : null;

  // O hook de pre-commit, cru. Quem interpreta é `pre-commit-instalado` — aqui só se lê, pelo mesmo
  // motivo do `.gitignore` acima: regra nenhuma toca disco, então quem verifica a fiação do gate com
  // o git precisa que o CONTEÚDO chegue pelo contexto, não por um `existsSync` dentro da regra.
  const hook = join(raizProjeto, '.githooks', 'pre-commit');
  const githooksPreCommit = existsSync(hook) ? lerTexto(hook) : null;

  return {
    raiz: raizProjeto,
    ehProjeto,
    manifesto: lerManifestoDaRaiz(raizProjeto),
    verificacao,
    conformidade,
    configsDeLint,
    gitignore,
    githooksPreCommit,
    codigo: lerCodigoDaRaiz(raizProjeto),
  };
}

/** Config do projeto, memoizada por raiz. */
export function carregarProjeto(raizProjeto) {
  if (!projetosLidos.has(raizProjeto)) projetosLidos.set(raizProjeto, lerProjeto(raizProjeto));
  return projetosLidos.get(raizProjeto);
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
    // Config do PROJETO (política de verificação, config do linter). Chega pelo contexto porque
    // regra nenhuma toca disco; memoizada por raiz, então N módulos não custam N leituras.
    projeto: carregarProjeto(raizProjeto),
    arquivos,
    codigo: arquivos.filter((a) => EXT_CODIGO.has(a.ext)),
    sql: arquivos.filter((a) => a.ext === '.sql'),
    // Artefato de build e cache de runtime nao contam como "entrada da arvore" — sao gerados,
    // nao escritos. Sem este filtro, `__pycache__` e `node_modules` reprovariam estrutura-estrita.
    // `generated/` e a excecao declarada: conteudo fora, presenca dentro (ver o Set acima).
    entradasRaiz: readdirSync(raiz, { withFileTypes: true })
      .map((e) => e.name)
      .filter((nome) => !NAO_PERCORRER.has(nome) || CONTEUDO_IGNORADO_MAS_ENTRADA.has(nome)),
  };
}

/** Lista as pastas de `modules/` que têm manifesto — inclusive os moldes. */
export function listarModulos(raizProjeto) {
  const base = join(raizProjeto, 'modules');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((nome) => statSync(join(base, nome)).isDirectory())
    .filter((nome) => existsSync(join(base, nome, 'module.json')))
    .map((nome) => join(base, nome));
}

/** Sobe a partir de um caminho até achar a raiz do projeto (a que tem `modules/`). */
export function acharRaizProjeto(partida) {
  let atual = partida;
  for (let nivel = 0; nivel < 8; nivel += 1) {
    if (existsSync(join(atual, 'modules'))) return atual;
    const pai = join(atual, '..');
    if (relative(pai, atual) === '') break;
    atual = pai;
  }
  return partida;
}

const PADRAO_ID_ADR = /^ADR-\d+$/;
const PADRAO_TITULO_ADR = /^##\s+(ADR-\d+)\b/gm;

/**
 * Os ids de ADR que `specs/adr/*.md` do PROJETO realmente declara em título — nunca os da base. É
 * contra este conjunto que `decisao` é resolvida (04-regras.md §6): qualquer string passava antes
 * (fail-open no arquivo de maior privilégio do gate — é a exceção que desliga regra).
 */
function idsDeAdrDeclarados(raizProjeto) {
  const pasta = join(raizProjeto, 'specs', 'adr');
  if (!existsSync(pasta)) return new Set();
  const ids = new Set();
  for (const nome of readdirSync(pasta).filter((n) => n.endsWith('.md'))) {
    for (const [, id] of lerTexto(join(pasta, nome)).matchAll(PADRAO_TITULO_ADR)) ids.add(id);
  }
  return ids;
}

/**
 * Sem `decisao`, sem forma de ADR (`ADR-NNN`), ou ADR que não existe em `specs/adr/`: invalida.
 * Nome `porqueInvalida` de propósito — `excecao.motivo` já é o campo do USUÁRIO (por que a exceção
 * existe); reusar o nome sobrescreveria esse campo no spread abaixo.
 */
function porqueInvalida(decisao, idsValidos) {
  if (!decisao) return 'sem campo "decisao"';
  if (!PADRAO_ID_ADR.test(decisao)) return `"decisao" nao tem a forma "ADR-NNN": "${decisao}"`;
  if (!idsValidos.has(decisao)) return `"${decisao}" nao existe em specs/adr/`;
  return null;
}

/** Exceções nominais ratificadas (specs/arquitetura/04-regras.md §6). `decisao` precisa resolver a
 * um ADR de verdade em `specs/adr/` — string qualquer não basta (era o fail-open). */
export function carregarExcecoes(raizProjeto) {
  const caminho = join(raizProjeto, 'config', 'conformidade.json');
  if (!existsSync(caminho)) return { validas: [], invalidas: [] };
  try {
    const { excecoes = [] } = JSON.parse(lerTexto(caminho));
    const idsValidos = idsDeAdrDeclarados(raizProjeto);
    const validas = [];
    const invalidas = [];
    for (const excecao of excecoes) {
      const porque = porqueInvalida(excecao.decisao, idsValidos);
      if (porque === null) validas.push(excecao);
      else invalidas.push({ ...excecao, porqueInvalida: porque });
    }
    return { validas, invalidas };
  } catch {
    return { validas: [], invalidas: [] };
  }
}
