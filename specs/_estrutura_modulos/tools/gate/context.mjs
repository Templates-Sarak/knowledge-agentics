/**
 * context.mjs — monta o contexto de um módulo para as regras do gate.
 * Lei dona: specs/arquitetura/04-regras.md
 *
 * O contexto é o ÚNICO ponto que toca o disco. Regra nenhuma lê arquivo — todas recebem
 * o contexto pronto. É o que mantém as regras testáveis e o gate rápido.
 *
 * Molde: pasta iniciada por "_" é um _template. Os marcadores (<module>, <module_snake>,
 * <MODULE>, <Module>) são substituídos EM MEMÓRIA por um id sintético, de modo que o molde
 * passe exatamente pelas mesmas regras que um módulo real (ADR-006). Nada é escrito de volta.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Gerado por ferramenta, nunca escrito por pessoa. Precisa cobrir TODO cache de linter e de
// runner: sem `.ruff_cache` aqui, rodar o linter faz o gate reprovar em seguida por
// "entrada nao prevista" — a verificacao brigando com a verificacao.
const SKIP_WALK = new Set([
  'node_modules', '.git', '.turbo', 'dist', 'build', 'coverage', 'generated',
  '__pycache__', '.venv', 'venv', '.pytest_cache', '.ruff_cache', '.mypy_cache',
  '.eslintcache', '.vite', '.next',
]);

// "Nao percorra o conteudo" e "nao conte como entrada da arvore" sao DUAS decisoes, e `generated/` as
// separa: o conteudo dela e saida de maquina — varre-lo faria `hardcode-url`, `function-threshold` e
// `log` julgarem HTML gerado —, mas a PASTA e item declarado da arvore (`01-modulo.md` §2, "so se
// generatesArtifact") e ja consta de `ALLOWED_ENTRIES`. Se as duas decisoes voltarem a ser uma so, a
// pasta fica invisivel ao gate: entrada permitida que nunca chega a existir para regra nenhuma.
const IGNORED_CONTENT_BUT_ENTRY = new Set(['generated']);

const EXT_CODE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
const TEMPLATE_SYNTHETIC_ID = 'molde';

/**
 * A FIACAO — o codigo que mora na raiz do projeto, fora de `modules/`.
 *
 * Sao estas tres e mais nenhuma. `tools/` fica de fora de proposito: e o gate, que o template
 * instala e ninguem edita — varre-lo faria as regras de raiz julgarem o proprio verificador.
 * `modules/` fica de fora porque ja tem 60 regras suas.
 */
const ROOT_DIRS = ['adapters', 'src', 'packages'];

/**
 * Le texto removendo o BOM (U+FEFF) e normalizando CRLF para LF.
 * Editor e shell do Windows gravam BOM por padrao, e `JSON.parse` rejeita — o manifesto ficaria
 * "invalido" por um caractere invisivel, MASCARANDO todas as regras que dependem dele.
 *
 * A normalizacao de EOL e defesa em profundidade, nao o conserto estrutural (esse e o
 * `.gitattributes` de cada binding, que forca `eol=lf` no checkout). Ela cobre o que o
 * `.gitattributes` nao alcanca: um clone que ainda nao foi renormalizado, ou uma copia de disco
 * feita fora do git (`create-project.mjs` copia bytes crus ANTES do primeiro commit). Toda regra
 * que compara texto lido daqui byte a byte contra saida de gerador (`derived-lint`) depende de
 * os dois lados concordarem em EOL — sem isto, `core.autocrlf=true` (Windows) faz o gate
 * reprovar 121 dos 122 casos do autoteste so por causa da quebra de linha.
 */
function readText(path) {
  return readFileSync(path, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

/** Percorre a pasta do módulo, ignorando o que não é fonte. Devolve caminhos absolutos. */
function walk(dir, accumulated = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_WALK.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, accumulated);
      continue;
    }
    accumulated.push(path);
  }
  return accumulated;
}

/** Substitui os marcadores do molde. Em módulo real devolve o texto intacto. */
function swapMarkers(text, isTemplate) {
  if (!isTemplate) return text;
  return text
    .replaceAll('<module_snake>', TEMPLATE_SYNTHETIC_ID.replace(/-/g, '_'))
    .replaceAll('<MODULE>', TEMPLATE_SYNTHETIC_ID.toUpperCase())
    .replaceAll('<Module>', 'Molde')
    .replaceAll('<module>', TEMPLATE_SYNTHETIC_ID)
    .replaceAll('<scope>', 'scope');
}

/**
 * Linhas que sao CODIGO de verdade — sem comentario de linha, bloco `/* *\/` nem docstring Python.
 * Sem isto, uma lei escrita num comentario ("nunca use `datetime.now()`") vira violacao dela
 * mesma. Conservador de proposito: linha com cerca de texto e descartada inteira.
 */
function extractCodeLines(content) {
  const lines = [];
  let inBlock = false;
  let fence = null;

  content.split(/\r?\n/).forEach((text, index) => {
    const clean = text.trim();
    if (fence !== null) {
      if (clean.includes(fence)) fence = null;
      return;
    }
    if (inBlock) {
      if (clean.includes('*/')) inBlock = false;
      return;
    }
    const quotes = ['"""', "'''"].find((delimiter) => clean.includes(delimiter));
    if (quotes !== undefined) {
      if ((clean.split(quotes).length - 1) % 2 === 1) fence = quotes;
      return;
    }
    if (clean.startsWith('/*')) {
      if (!clean.includes('*/')) inBlock = true;
      return;
    }
    if (clean.startsWith('//') || clean.startsWith('#') || clean.startsWith('*')) return;
    lines.push({ number: index + 1, text });
  });
  return lines;
}

function isTest(relPath) {
  const normalized = relPath.split(sep).join('/');
  return normalized.startsWith('tests/')
    || normalized.includes('/tests/')
    || /\.test\.|\.spec\.|_test\.py$/.test(normalized);
}

function buildFile(absolute, root, isTemplate) {
  const rel = relative(root, absolute).split(sep).join('/');
  const point = rel.lastIndexOf('.');
  const content = swapMarkers(readText(absolute), isTemplate);
  return {
    rel,
    abs: absolute,
    ext: point === -1 ? '' : rel.slice(point),
    content,
    codeLines: extractCodeLines(content),
    isTest: isTest(rel),
  };
}

/** Lê o manifesto já com marcadores trocados. Falha de leitura vira `erro`, não exceção. */
function readManifest(root, isTemplate) {
  const path = join(root, 'module.json');
  if (!existsSync(path)) return { manifest: null, error: 'module.json is missing' };
  try {
    const raw = swapMarkers(readText(path), isTemplate);
    return { manifest: JSON.parse(raw), error: null };
  } catch (cause) {
    return { manifest: null, error: `module.json is invalid — ${String(cause)}` };
  }
}

/** Lê os cinco config/*.json. Arquivo ausente ou inválido entra como `null` para a regra reportar. */
function readConfigs(root, isTemplate) {
  const topics = ['api', 'domain', 'security', 'ports', 'texts'];
  const configs = {};
  for (const topic of topics) {
    const path = join(root, 'config', `${topic}.json`);
    if (!existsSync(path)) {
      configs[topic] = { present: false, value: null };
      continue;
    }
    try {
      configs[topic] = { present: true, value: JSON.parse(swapMarkers(readText(path), isTemplate)) };
    } catch {
      configs[topic] = { present: true, value: null };
    }
  }
  return configs;
}

/**
 * Config do PROJETO — lida uma vez por raiz, não uma vez por módulo.
 *
 * Ponto próprio, e não mais um campo montado dentro de `loadContext`, porque o dado é por
 * PROJETO: num repositório com dez módulos, `loadContext` roda dez vezes e leria os mesmos
 * arquivos dez vezes. A memória é por caminho de raiz, então dois projetos no mesmo processo (o
 * autoteste cria um temporário por caso) não se confundem.
 */
const loadedProjects = new Map();

const RENAME_FILE = join(dirname(fileURLToPath(import.meta.url)), 'renamed-rules.json');

/**
 * `{ idAntigo: idNovo }` — a tabela do ADR-024 que viaja com o gate (`renamed-rules.json`, gerada pelo
 * `verify-catalog --check-renames`). Ausente ou ilegível vira `{}`: a regra que a usa só perde a DICA,
 * nunca a acusação de id desconhecido.
 */
function readRenames() {
  try {
    return JSON.parse(readText(RENAME_FILE)).renamed ?? {};
  } catch {
    return {};
  }
}

/** Os nomes que o gerador pode produzir. Ler os dois é mais barato que descobrir o binding aqui. */
const LINT_CONFIGS = ['eslint.config.js', '.ruff.toml'];

/** Lê o `project.json` da raiz. Ausência e JSON quebrado são estados declarados, não exceção. */
function readRootManifest(projectRoot) {
  const path = join(projectRoot, 'project.json');
  if (!existsSync(path)) return { present: false, value: null, error: null };
  try {
    return { present: true, value: JSON.parse(readText(path)), error: null };
  } catch (cause) {
    return { present: true, value: null, error: String(cause) };
  }
}

/**
 * O código da FIAÇÃO, e ele NAO entra em `ctx.arquivos` nem em `ctx.codigo` — essas duas coleções
 * são o material das regras de MODULO, cujos textos dizem literalmente "no código do módulo".
 * Deixar `adapters/memory/index.ts` cair ali faria `hardcode-url`, `log`, `function-threshold` e
 * `raw-output` acusarem em massa código correto, sob leis que não falam dele.
 *
 * Por isso o código da raiz mora aqui, num ponto do PROJETO, e só regra de escopo `root` o vê.
 */
function readRootCode(projectRoot) {
  return ROOT_DIRS
    .map((dir) => join(projectRoot, dir))
    .filter((dir) => existsSync(dir))
    .flatMap((dir) => walk(dir))
    .map((absolute) => buildFile(absolute, projectRoot, false))
    .filter((file) => EXT_CODE.has(file.ext));
}

/**
 * Os arquivos de container que a RAIZ de um projeto dockerizado declara (03-operacao.md §9.5, ADR-022).
 * O front tem os dele à parte: só entram quando algum módulo publica uma tela.
 */
export const CONTAINER_FILES = ['Dockerfile', '.dockerignore', 'compose.yml', 'deploy/.env.example'];
export const FRONT_FILES = ['front.Dockerfile', 'deploy/nginx.conf'];

/** `KEY=` de um `.env.example` — comentário e linha vazia ficam fora. */
const EXAMPLE_ENV_KEY = /^\s*([A-Za-z_][A-Za-z0-9_]*)=/;

/** Manifestos dos módulos REAIS (moldes `_*` não são publicados), ilegível = ausente. */
function readRealManifests(projectRoot) {
  const real = listModules(projectRoot).filter((dir) => !basename(dir).startsWith('_'));
  return real.flatMap((dir) => {
    try {
      return [{ dir, manifest: JSON.parse(readText(join(dir, 'module.json'))) }];
    } catch {
      return [];
    }
  });
}

/**
 * O que as regras de container precisam ver. Só leitura de disco: quem interpreta são as regras.
 * `temFront` é "algum módulo real declara `webPath` E tem `web/`" — webPath sem tela é defeito de
 * `web-declared`, e cobrá-lo de novo aqui daria duas mensagens para um conserto só.
 */
function readContainer(projectRoot, rootManifest) {
  const read = (rel) => (existsSync(join(projectRoot, rel)) ? readText(join(projectRoot, rel)) : null);
  const modules = readRealManifests(projectRoot);
  const deployExample = read('deploy/.env.example');
  const exampleKeys = (deployExample ?? '').split('\n')
    .map((line) => line.match(EXAMPLE_ENV_KEY)?.[1])
    .filter((key) => key !== undefined);
  const manifestKeys = [rootManifest?.value, ...modules.map((m) => m.manifest)]
    .flatMap((manifest) => (Array.isArray(manifest?.requiredEnv) ? manifest.requiredEnv : []));
  return {
    present: [...CONTAINER_FILES, ...FRONT_FILES].filter((rel) => existsSync(join(projectRoot, rel))),
    compose: read('compose.yml'),
    composeModules: read('deploy/compose.modules.yml'),
    dockerignore: read('.dockerignore'),
    declaredKeys: [...new Set([...exampleKeys, ...manifestKeys])],
    hasFront: modules.some(({ dir, manifest }) => typeof manifest.webPath === 'string'
      && existsSync(join(dir, 'web'))),
  };
}

/** `{ presente, valor }` de um `config/<nome>` na raiz — `valor` fica `null` em JSON ilegível ou
 * ausente, e é a regra dona (não este leitor) quem decide a mensagem para cada caso. */
function readRootConfig(projectRoot, fileName) {
  const path = join(projectRoot, 'config', fileName);
  const config = { present: existsSync(path), value: null };
  if (config.present) {
    try {
      config.value = JSON.parse(readText(path));
    } catch {
      config.value = null;
    }
  }
  return config;
}

function readProject(projectRoot) {
  // "Raiz de projeto" é a pasta que tem `modules/` — a mesma definição de `findRootProjeto`. Sem
  // ela não há projeto: é módulo solto (extraído e ainda não religado) ou fixture, e cobrar
  // política de projeto de quem não é projeto seria falso positivo garantido.
  const isProject = existsSync(join(projectRoot, 'modules'));
  const check = readRootConfig(projectRoot, 'verification.json');
  const compliance = readRootConfig(projectRoot, 'compliance.json');

  const lintConfigs = {};
  for (const name of LINT_CONFIGS) {
    const target = join(projectRoot, name);
    lintConfigs[name] = existsSync(target) ? readText(target) : null;
  }

  // O `.gitignore` da raiz, cru. Quem interpreta é a regra `gitignore-secret` — aqui só se lê.
  const ignore = join(projectRoot, '.gitignore');
  const gitignore = existsSync(ignore) ? readText(ignore) : null;

  // O hook de pre-commit, cru. Quem interpreta é `pre-commit-installed` — aqui só se lê, pelo mesmo
  // motivo do `.gitignore` acima: regra nenhuma toca disco, então quem verifica a fiação do gate com
  // o git precisa que o CONTEÚDO chegue pelo contexto, não por um `existsSync` dentro da regra.
  const hook = join(projectRoot, '.githooks', 'pre-commit');
  const githooksPreCommit = existsSync(hook) ? readText(hook) : null;

  const rootManifest = readRootManifest(projectRoot);
  return {
    raiz: projectRoot,
    isProject,
    manifest: rootManifest,
    check,
    compliance,
    renamedRules: readRenames(),
    lintConfigs,
    gitignore,
    githooksPreCommit,
    container: readContainer(projectRoot, rootManifest),
    code: readRootCode(projectRoot),
  };
}

/** Config do projeto, memoizada por raiz. */
export function loadProject(projectRoot) {
  if (!loadedProjects.has(projectRoot)) loadedProjects.set(projectRoot, readProject(projectRoot));
  return loadedProjects.get(projectRoot);
}

/** Nome de pasta do módulo, já resolvido para o id sintético quando for molde. */
export function dirId(modulePath) {
  const name = basename(modulePath);
  return name.startsWith('_') ? TEMPLATE_SYNTHETIC_ID : name;
}

/**
 * Monta o contexto de UM módulo.
 * @param {string} root caminho da pasta do módulo
 * @param {string} projectRoot caminho da raiz do projeto (para resolver .env e vizinhos)
 */
export function loadContext(root, projectRoot) {
  const isTemplate = basename(root).startsWith('_');
  const { manifest, error } = readManifest(root, isTemplate);
  const files = walk(root).map((abs) => buildFile(abs, root, isTemplate));

  return {
    raiz: root,
    projectRoot,
    isTemplate,
    dirId: dirId(root),
    manifest,
    errorManifest: error,
    configs: readConfigs(root, isTemplate),
    // Config do PROJETO (política de verificação, config do linter). Chega pelo contexto porque
    // regra nenhuma toca disco; memoizada por raiz, então N módulos não custam N leituras.
    project: loadProject(projectRoot),
    files,
    code: files.filter((a) => EXT_CODE.has(a.ext)),
    sql: files.filter((a) => a.ext === '.sql'),
    // Artefato de build e cache de runtime nao contam como "entrada da arvore" — sao gerados,
    // nao escritos. Sem este filtro, `__pycache__` e `node_modules` reprovariam strict-structure.
    // `generated/` e a excecao declarada: conteudo fora, presenca dentro (ver o Set acima).
    rootEntries: readdirSync(root, { withFileTypes: true })
      .map((e) => e.name)
      .filter((name) => !SKIP_WALK.has(name) || IGNORED_CONTENT_BUT_ENTRY.has(name)),
  };
}

/** Lista as pastas de `modules/` que têm manifesto — inclusive os moldes. */
export function listModules(projectRoot) {
  const base = join(projectRoot, 'modules');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((name) => statSync(join(base, name)).isDirectory())
    .filter((name) => existsSync(join(base, name, 'module.json')))
    .map((name) => join(base, name));
}

/** Sobe a partir de um caminho até achar a raiz do projeto (a que tem `modules/`). */
export function findProjectRoot(start) {
  let current = start;
  for (let level = 0; level < 8; level += 1) {
    if (existsSync(join(current, 'modules'))) return current;
    const parent = join(current, '..');
    if (relative(parent, current) === '') break;
    current = parent;
  }
  return start;
}

const ADR_ID_PATTERN = /^ADR-\d+$/;
const ADR_TITLE_PATTERN = /^##\s+(ADR-\d+)\b/gm;

/**
 * Os ids de ADR que `specs/adr/*.md` do PROJETO realmente declara em título — nunca os da base. É
 * contra este conjunto que `decisao` é resolvida (04-regras.md §6): qualquer string passava antes
 * (fail-open no arquivo de maior privilégio do gate — é a exceção que desliga regra).
 */
function declaredAdrIds(projectRoot) {
  const dir = join(projectRoot, 'specs', 'adr');
  if (!existsSync(dir)) return new Set();
  const ids = new Set();
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    for (const [, id] of readText(join(dir, name)).matchAll(ADR_TITLE_PATTERN)) ids.add(id);
  }
  return ids;
}

/**
 * Sem `decision`, sem forma de ADR (`ADR-NNN`), ou ADR que não existe em `specs/adr/`: invalida.
 * Nome `invalidBecause` de propósito — `excecao.reason` já é o campo do USUÁRIO (por que a exceção
 * existe); reusar o nome sobrescreveria esse campo no spread abaixo.
 */
function invalidBecause(decision, validIds) {
  if (!decision) return 'missing "decision" field';
  if (!ADR_ID_PATTERN.test(decision)) return `"decision" must use the form "ADR-NNN": "${decision}"`;
  if (!validIds.has(decision)) return `"${decision}" does not exist in specs/adr/`;
  return null;
}

/** Exceções nominais ratificadas (specs/arquitetura/04-regras.md §6). `decision` precisa resolver a
 * um ADR de verdade em `specs/adr/` — string qualquer não basta (era o fail-open). */
export function loadExceptions(projectRoot) {
  const path = join(projectRoot, 'config', 'compliance.json');
  if (!existsSync(path)) return { valid: [], invalid: [] };
  try {
    const { exceptions: exceptions = [] } = JSON.parse(readText(path));
    const validIds = declaredAdrIds(projectRoot);
    const valid = [];
    const invalid = [];
    for (const exception of exceptions) {
      const because = invalidBecause(exception.decision, validIds);
      if (because === null) valid.push(exception);
      else invalid.push({ ...exception, invalidBecause: because });
    }
    return { valid, invalid };
  } catch {
    return { valid: [], invalid: [] };
  }
}
