#!/usr/bin/env node
/**
 * ci-security.mjs — estágio 0, FAIL-CLOSED. Duas perguntas, nenhuma delas o gate pode responder:
 *
 *   (a) o `.env` real está VERSIONADO?      — exige `git ls-files`
 *   (b) o que mudou introduziu um SEGREDO?  — exige ler o delta contra um baseline git
 *
 * `04-regras.md` §7.2, linha de `gitignore-segredo`: *"Não afirma que o .env está versionado — isso
 * exigiria git ls-files, e o gate não roda git de propósito... O .env que já foi commitado é do passo
 * de CI, fail-closed, e do hook cyber-git-seguro na fronteira do git."* Este arquivo é esse passo.
 *
 *   node tools/ci-security.mjs [--desde <ref>] [--json]
 *   node tools/ci-security.mjs --autoteste
 *
 * NÃO é regra de gate: compara ESTADO DO GIT (rastreados, delta), o gate não roda git de propósito.
 * Não tem id, não conta para o catálogo — ferramenta, como `contract-compatible.mjs`.
 *
 * ============================================================================================
 * NÚCLEO × CASCA, o mesmo precedente de `affected.mjs`/`contract-compatible.mjs`: núcleo recebe DADO
 * (lista de caminhos rastreados, pares {caminho, conteúdo} do delta), nunca toca `fs`/`child_process`.
 * A casca (`git`, `arquivosRastreados`, `arquivosMudados`, `lerConteudoAtual`) isola TODO acesso a
 * disco/git em pontos nomeados — `execFileSync` sempre com ARRAY de argumentos, nunca `shell: true`
 * (nome de pasta virando comando é o mesmo risco que `verify-commit.mjs` documenta).
 *
 * O DELTA REUSADO, NÃO INVENTADO: mesma forma de `contract-compatible.mjs` — `git diff --name-only
 * <ref>` —, que por sua vez já é a mesma pergunta de `affected.mjs:caminhosAlteradosDesde` (privada,
 * não exportada; `contract-compatible.mjs` resolve isso escrevendo a MESMA chamada em vez
 * de reimplementar o grafo — o precedente é literal, não análogo). Não é staged: este passo é CI, e
 * staged é conceito de working tree local (é o que `verify-commit.mjs:pre-commit` usa, porque ali
 * SIM há um índice local). Default `HEAD~1`, a mesma escolha e o mesmo argumento de
 * `contract-compatible.mjs`: CI é frequentemente HEAD destacado sem upstream configurado.
 *
 * DOIS VOCABULÁRIOS, NENHUM POR ENTROPIA — a lei 1 não aceita a direção de falso positivo que
 * entropia carrega (hash de teste, UUID de fixture, base64 de imagem inline). Vocabulário fechado
 * pega MENOS; o que ele não pega está declarado em `04-regras.md` §7.2, não escondido.
 *
 *   (1) NOME de chave — `PADRAO_CREDENCIAL`, importado de `rules/operation.mjs` (já exportado, já
 *       fechado, já base de `gateway-credencial`/`segredo-em-publico`). Uma lista, não duas: aqui ele
 *       vira "identificador com esse sufixo, ATRIBUÍDO a um literal" — o mesmo vocabulário, uma
 *       pergunta a mais (atribuição, não só nome).
 *   (2) VALOR de token — vocabulário NOVO, cópia (não import: skills não viajam para o projeto
 *       gerado) do catálogo canônico em `skills/cyber-segredos/scripts/config.json`. Só as formas
 *       com PREFIXO INEQUÍVOCO de fornecedor e o cabeçalho de chave privada — nenhuma delas requer
 *       entropia. Deliberadamente FORA (declarado, não esquecido): "Bearer Token" (`bearer\s+...`,
 *       genérico, sem prefixo de fornecedor), "Segredo atribuído" (`key\s*[:=]\s*'...'`, é
 *       exatamente o vocabulário (1) com sinal pior) e "String de conexão" (`<esquema>://<usuario>:<senha>@`,
 *       comum em EXEMPLO de documentação com credencial fake). Medido contra os três moldes
 *       conformes: zero achado nos nove padrões vendor-specific (varredura colada no relatório).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PADRAO_CREDENCIAL } from './gate/rules/operation.mjs';

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha daqui embaixo toca `fs`, `child_process` ou `process.env`.
// ================================================================================================

/** `.env` da raiz OU `modules/<qualquer>/.env` — a mesma pergunta que `gitignore-segredo` faz sobre o
 * arquivo de ignore, aqui sobre o que JÁ está no índice. */
export function ehEnvReal(caminhoRastreado) {
  return caminhoRastreado === '.env' || /^modules\/[^/]+\/\.env$/.test(caminhoRastreado);
}

export function envVersionados(rastreados) {
  return rastreados.filter(ehEnvReal);
}

/** O sufixo de `PADRAO_CREDENCIAL` sem a âncora `$` — reusado, nunca reescrito. */
const SUFIXO_CREDENCIAL = PADRAO_CREDENCIAL.source.slice(0, -1);

/** Identificador terminado no sufixo fechado, ATRIBUÍDO a um literal — nunca uma leitura (`process.env.X`,
 * `os.environ["X"]`), porque essas não têm `[:=]` seguido de aspas logo depois do nome. */
export const CHAVE_CREDENCIAL_ATRIBUIDA = new RegExp(
  `[A-Za-z_][A-Za-z0-9_]*${SUFIXO_CREDENCIAL}\\s*[:=]\\s*['"\`][^'"\`\\s]{4,}['"\`]`,
);

/**
 * Valor de token com prefixo de fornecedor inequívoco, ou cabeçalho de chave privada. Cópia do
 * catálogo canônico `skills/cyber-segredos/scripts/config.json` — só as nove formas sem entropia e
 * com prefixo fechado; a origem e o corte estão no cabeçalho do arquivo.
 */
/** @type {[string, RegExp][]} */
export const VOCABULARIO_VALOR = [
  ['AWS Access Key', /AKIA[0-9A-Z]{16}/],
  ['GitHub Token', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['GitHub PAT fine-grained', /github_pat_[A-Za-z0-9_]{60,}/],
  ['Google API Key', /AIza[0-9A-Za-z_-]{35}/],
  ['Slack Token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Stripe Secret', /(?:sk|rk)_live_[0-9a-zA-Z]{20,}/],
  ['npm Token', /npm_[A-Za-z0-9]{36}/],
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/],
  ['Private Key', /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
];

/** `****` para trecho curto; senão os 4 primeiros + `...` + os 2 últimos — nunca o segredo inteiro. */
export function mascarar(trecho) {
  const limpo = trecho.trim();
  return limpo.length <= 8 ? '****' : `${limpo.slice(0, 4)}...${limpo.slice(-2)}`;
}

/**
 * Varre pares `{caminho, conteudo}` já lidos (a casca lê; o núcleo só olha texto) contra os DOIS
 * vocabulários. Um achado por LINHA (a primeira forma que casar) — várias mensagens para a mesma
 * linha não acrescentam conserto, só ruído (lei 2).
 */
export function varrerSegredos(arquivos) {
  const achados = [];
  for (const { caminho, conteudo } of arquivos) {
    conteudo.split(/\r?\n/).forEach((linha, indice) => {
      const numero = indice + 1;
      const porValor = VOCABULARIO_VALOR.find(([, padrao]) => padrao.test(linha));
      if (porValor !== undefined) {
        achados.push({ caminho, linha: numero, tipo: porValor[0], trecho: mascarar(linha.match(porValor[1])[0]) });
        return;
      }
      const casadoPorChave = linha.match(CHAVE_CREDENCIAL_ATRIBUIDA);
      if (casadoPorChave !== null) {
        achados.push({ caminho, linha: numero, tipo: 'chave de credencial atribuída', trecho: mascarar(casadoPorChave[0]) });
      }
    });
  }
  return achados;
}

// ================================================================================================
// CASCA — toca disco e git. `git()` é o ÚNICO ponto que roda `git` de verdade.
// ================================================================================================

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Mesmo raciocínio de `gate/context.mjs:acharRaizProjeto` — cópia, não import: fora de escopo. */
function acharRaiz(partida) {
  let atual = partida;
  for (let nivel = 0; nivel < 8; nivel += 1) {
    if (existsSync(join(atual, 'modules'))) return atual;
    const pai = join(atual, '..');
    if (relative(pai, atual) === '') break;
    atual = pai;
  }
  return partida;
}

const RAIZ = acharRaiz(AQUI);
const TAMANHO_MAX_BYTES = 2_000_000;

/** ÚNICO ponto que roda `git` de verdade. Array de argumentos — nunca `shell: true`. */
function git(args) {
  return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
}

/** `null` quando o git não responde (fora de repositório, índice corrompido) — a casca decide reprovar. */
function arquivosRastreados() {
  try {
    return git(['ls-files']).split(/\r?\n/).filter((l) => l.trim() !== '');
  } catch {
    return null;
  }
}

/**
 * O hash da ÁRVORE VAZIA — constante do Git, igual em todo repositório que existe (não precisa ser
 * alcançável por nenhum commit para funcionar como base de `git diff`). Comparar contra ela faz TODO
 * arquivo rastreado contar como delta — é "tudo", não "nada": mais verificação nunca fere o
 * fail-closed, menos verificação sim.
 */
const ARVORE_VAZIA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** A árvore vazia não é um commit — `^{commit}` reprovaria uma constante que é sempre válida por
 * definição, então ela nunca passa pela verificação normal. */
function refValida(ref) {
  if (ref === ARVORE_VAZIA) return true;
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Repositório com um commit só não tem `HEAD~1` — sem isto, o PRIMEIRO pipeline de todo repositório
 * Sarak nasce vermelho aqui (medido no teste real). `--desde` explícito
 * NUNCA é substituído em silêncio: só o DEFAULT cai para a árvore vazia quando não resolve — uma ref
 * que o usuário escolheu errada continua reprovando, para não esconder o erro dele.
 */
function refEfetiva(desde) {
  if (desde !== null) return desde;
  return refValida(REF_PADRAO) ? REF_PADRAO : ARVORE_VAZIA;
}

/** `null` quando a ref não resolve. Mesma forma de `contract-compatible.mjs` — não um terceiro mecanismo. */
function arquivosMudados(ref) {
  try {
    return git(['diff', '--name-only', '--no-renames', ref]).split(/\r?\n/).filter((l) => l.trim() !== '');
  } catch {
    return null;
  }
}

/** Conteúdo ATUAL do caminho (a árvore de trabalho, não o blob do delta) — `null` se sumiu, é
 * binário demais para valer a pena, ou maior que o teto. Erro de leitura nunca vira exceção aqui. */
function lerConteudoAtual(caminhoRelativo) {
  const alvo = join(RAIZ, caminhoRelativo);
  try {
    if (!existsSync(alvo) || statSync(alvo).size > TAMANHO_MAX_BYTES) return null;
    return readFileSync(alvo, 'utf8');
  } catch {
    return null;
  }
}

function gitleaksDisponivel() {
  try {
    execFileSync('gitleaks', ['version'], { cwd: RAIZ, encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

/** Segunda opinião, nunca a primeira: mesmo comando de `hooks/cyber-git-seguro.js` para o push
 * (`detect --log-opts <ref>..HEAD`) — precedente já testado nesta base, não uma invenção nova. */
function rodarGitleaks(ref) {
  try {
    execFileSync('gitleaks', ['detect', '--log-opts', `${ref}..HEAD`, '--redact', '--no-banner'], {
      cwd: RAIZ, encoding: 'utf8',
    });
    return { rodou: true, achados: false, saida: '' };
  } catch (erro) {
    // gitleaks sai != 0 tanto por ACHADO quanto por erro de uso — a saída é quem distingue.
    const saida = `${erro.stdout ?? ''}${erro.stderr ?? ''}`;
    return { rodou: true, achados: true, saida: saida.slice(0, 1500) };
  }
}

function coletarDelta(ref) {
  const caminhos = arquivosMudados(ref);
  if (caminhos === null) return null;
  return caminhos
    .map((caminho) => ({ caminho, conteudo: lerConteudoAtual(caminho) }))
    .filter((a) => a.conteudo !== null);
}

// ================================================================================================
// SAÍDA — as três situações do fail-closed nunca podem ser a mesma linha (lei 10).
// ================================================================================================

function analisar(ref) {
  const rastreados = arquivosRastreados();
  if (rastreados === null) {
    return { situacao: 'git-mudo', ref, compativel: false, envs: [], segredos: [], gitleaks: null };
  }
  if (!refValida(ref)) {
    return { situacao: 'ref-invalida', ref, compativel: false, envs: [], segredos: [], gitleaks: null };
  }

  const envs = envVersionados(rastreados);
  const delta = coletarDelta(ref);
  const deltaVazio = delta !== null && delta.length === 0;
  const segredos = delta === null ? [] : varrerSegredos(delta);
  const gitleaks = gitleaksDisponivel() ? rodarGitleaks(ref) : { rodou: false };

  return {
    situacao: deltaVazio ? 'delta-vazio' : 'comparado',
    ref,
    compativel: envs.length === 0 && segredos.length === 0 && !(gitleaks.rodou && gitleaks.achados),
    envs,
    segredos,
    gitleaks,
  };
}

function imprimirHumano(r) {
  if (r.situacao === 'git-mudo') {
    process.stdout.write('  x git nao respondeu (fora de repositorio, ou indice corrompido) — FAIL-CLOSED: nao da para provar ausencia de segredo\n');
    return;
  }
  if (r.situacao === 'ref-invalida') {
    process.stdout.write(`  x ref invalida ou inexistente: "${r.ref}" — FAIL-CLOSED: sem baseline nao ha o que comparar\n`);
    return;
  }
  const rotuloRef = r.ref === ARVORE_VAZIA ? `${r.ref} (arvore vazia — sem HEAD~1, repositorio novo)` : r.ref;
  process.stdout.write(`ci-seguranca: comparando com --desde ${rotuloRef}\n`);
  if (r.situacao === 'delta-vazio') {
    process.stdout.write('  delta vazio — nada mudou nesta execucao (diferente de "nao verifiquei": o git respondeu, e a resposta foi "nada")\n');
  }
  if (r.envs.length > 0) {
    for (const e of r.envs) process.stdout.write(`  x .env VERSIONADO: ${e} — segredo real rastreado pelo git\n`);
  } else {
    process.stdout.write('  ok   nenhum .env versionado\n');
  }
  if (r.segredos.length > 0) {
    for (const s of r.segredos) process.stdout.write(`  x ${s.caminho}:${s.linha}: ${s.tipo} — ${s.trecho}\n`);
  } else {
    process.stdout.write('  ok   nenhum segredo reconhecido no delta\n');
  }
  if (!r.gitleaks.rodou) {
    process.stdout.write('  !    gitleaks nao encontrado — segunda opiniao pulada (bonus, nao reprova por ausencia)\n');
  } else if (r.gitleaks.achados) {
    process.stdout.write(`  x gitleaks (segunda opiniao) achou algo:\n${r.gitleaks.saida}\n`);
  } else {
    process.stdout.write('  ok   gitleaks (segunda opiniao): nada\n');
  }
}

function imprimirJson(r) {
  process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
}

// ================================================================================================
// CLI
// ================================================================================================

const REF_PADRAO = 'HEAD~1';

function lerOpcoes(argv) {
  const opcoes = { desde: null, json: false, autoteste: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--autoteste') { opcoes.autoteste = true; continue; }
    if (argv[i] === '--json') { opcoes.json = true; continue; }
    if (argv[i] === '--desde') { opcoes.desde = argv[i + 1] ?? null; i += 1; continue; }
  }
  return opcoes;
}

function principal() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  if (opcoes.autoteste) return rodarAutoteste();

  const resultado = analisar(refEfetiva(opcoes.desde));
  if (opcoes.json) imprimirJson(resultado);
  else {
    imprimirHumano(resultado);
    process.stdout.write(`\nci-seguranca: ${resultado.compativel ? 'OK' : 'REPROVADO'}\n`);
  }
  return resultado.compativel ? 0 : 1;
}

// ================================================================================================
// AUTOTESTE — o núcleo puro contra fixtures em memória, mais entrada adversarial (lei 8).
// ================================================================================================

function casosDeAutoteste() {
  return [
    { nome: 'raiz .env rastreado: achado', rastreados: ['.env', 'src/x.ts'], esperado: ['.env'] },
    { nome: 'modules/x/.env rastreado: achado', rastreados: ['modules/pedidos/.env'], esperado: ['modules/pedidos/.env'] },
    { nome: '.env.example NAO e .env real', rastreados: ['.env.example', 'modules/x/.env.example'], esperado: [] },
    { nome: 'nada rastreado de sensivel: vazio', rastreados: ['src/x.ts', 'README.md'], esperado: [] },
  ];
}

/**
 * Estas duas fixtures precisam PARECER segredo de verdade para o vocabulário reconhecer — mas
 * `tools/` entra na própria varredura (`create-project.mjs` copia a pasta inteira para o
 * projeto gerado); medido: escritas literais, `ci-seguranca` acusa A SI MESMO, apontando estas
 * duas linhas. Por isso são MONTADAS em tempo de execução — o texto-FONTE deste arquivo nunca
 * contém o padrão contíguo, só o valor já concatenado em memória o contém. Nenhuma ofuscação:
 * mesmo motivo de um scanner de vírus não guardar a própria assinatura em texto puro dentro do
 * binário. O valor RESULTANTE, que os testes exercitam, é sempre o literal esperado.
 */
function montar(...partes) {
  return partes.join('');
}

const AWS_KEY_DE_TESTE = montar('AKIA', 'IOSFODNN7', 'EXAMPLE');
const CHAVE_DE_TESTE = montar('STRIPE_API', '_KEY');

function casosDeVarredura() {
  return [
    {
      nome: 'AWS Access Key: achado',
      arquivos: [{ caminho: 'a.ts', conteudo: `const k = "${AWS_KEY_DE_TESTE}";` }],
      esperadoTipo: 'AWS Access Key',
    },
    {
      nome: 'chave de credencial atribuida (via PADRAO_CREDENCIAL): achado',
      arquivos: [{ caminho: 'a.ts', conteudo: `const ${CHAVE_DE_TESTE} = "valor-real-aqui";` }],
      esperadoTipo: 'chave de credencial atribuída',
    },
    {
      nome: 'leitura de env (nao atribuicao): nao acusa',
      arquivos: [{ caminho: 'a.ts', conteudo: 'const x = process.env.MODULO_API_KEY;' }],
      esperadoTipo: null,
    },
    {
      nome: '.env.example com chave vazia: nao acusa',
      arquivos: [{ caminho: '.env.example', conteudo: 'MODULO_API_KEY=\n' }],
      esperadoTipo: null,
    },
    {
      nome: 'entrada ADVERSARIAL: "; echo INJETADO" como conteudo — nunca executa, so texto',
      arquivos: [{ caminho: 'a.ts', conteudo: 'const cmd = "; echo INJETADO";' }],
      esperadoTipo: null,
    },
    {
      nome: 'entrada ADVERSARIAL: "$(echo INJETADO)" como conteudo — nunca executa, so texto',
      arquivos: [{ caminho: 'a.ts', conteudo: 'const cmd = "$(echo INJETADO)";' }],
      esperadoTipo: null,
    },
    {
      nome: 'entrada ADVERSARIAL: "& echo INJETADO" como conteudo — nunca executa, so texto',
      arquivos: [{ caminho: 'a.ts', conteudo: 'const cmd = "& echo INJETADO";' }],
      esperadoTipo: null,
    },
  ];
}

function rodarAutoteste() {
  let falhas = 0;
  const registrar = (nome, ok, detalhe) => {
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${nome}\n`);
    if (!ok) {
      falhas += 1;
      if (detalhe !== undefined) process.stdout.write(`       ${detalhe}\n`);
    }
  };

  for (const caso of casosDeAutoteste()) {
    const obtido = envVersionados(caso.rastreados);
    const ok = JSON.stringify(obtido) === JSON.stringify(caso.esperado);
    registrar(caso.nome, ok, `esperado: ${JSON.stringify(caso.esperado)} obtido: ${JSON.stringify(obtido)}`);
  }

  for (const caso of casosDeVarredura()) {
    const achados = varrerSegredos(caso.arquivos);
    const ok = caso.esperadoTipo === null ? achados.length === 0 : achados.some((a) => a.tipo === caso.esperadoTipo);
    registrar(caso.nome, ok, `achados: ${JSON.stringify(achados)}`);
  }

  // Nenhum achado, em nenhum vocabulário, pode expor o segredo INTEIRO — só o mascarado. Verificado
  // por PROPRIEDADE (mais curto, tem "...", nunca contém o segredo inteiro), não comparando com um
  // segundo literal igual ao de `AWS_KEY_DE_TESTE` — reintroduziria o mesmo problema que este
  // conserto existe para resolver.
  const mascaradoDeVerdade = mascarar(AWS_KEY_DE_TESTE);
  const mascaramentoOk = mascaradoDeVerdade.includes('...')
    && mascaradoDeVerdade.length < AWS_KEY_DE_TESTE.length
    && !mascaradoDeVerdade.includes(AWS_KEY_DE_TESTE)
    && mascarar('curto') === '****';
  registrar('mascarar() nunca expoe o segredo inteiro', mascaramentoOk);

  const total = casosDeAutoteste().length + casosDeVarredura().length + 1;
  process.stdout.write(`\nautoteste: ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal());
}
