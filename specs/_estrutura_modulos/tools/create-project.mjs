#!/usr/bin/env node
/**
 * create-project.mjs — instancia um projeto novo a partir do template.
 * Lei dona: specs/arquitetura/00-arquitetura.md §2
 *
 *   node tools/create-project.mjs <destino> [--binding typescript] [--escopo acme] [--forcar]
 *
 * O projeto nasce com a DOUTRINA e as FERRAMENTAS dentro dele — a verificabilidade viaja junto,
 * e nao depende de nenhum provedor de CI (ADR-005).
 *
 * A doutrina NAO vira arvore paralela: ela e a spec de arquitetura do projeto, e por isso e
 * instalada em `specs/arquitetura/` (as cinco leis) e `specs/adr/` (as decisoes do template).
 * Regra escrita em dois lugares e o defeito que este template existe para evitar — inclusive
 * entre a doutrina e o fluxo SDD que governa as specs.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_TEMPLATE = join(AQUI, '..');
const BINDINGS = ['typescript', 'javascript', 'python'];
/** Nome da decisao do template dentro de `specs/adr/` — a ancora das excecoes do gate. */
const ADR_DO_TEMPLATE = '000-decisoes-do-template.md';
/**
 * Pastas que delimitam a varredura de `<escopo>` num destino já povoado — SEM `tools/`.
 *
 * `tools/` é vendorizado — "ninguém edita" (a mesma razão de `generate-lint-config.mjs:IGNORADOS`
 * excluir `tools/` do linter da base). `create-module.mjs` (e este próprio arquivo) têm a string
 * `<escopo>` na PRÓPRIA LÓGICA de substituição, não como marcador a preencher: incluir `tools/` na
 * varredura reescreve essa lógica para o VALOR do escopo — `create-project.mjs destino --escopo
 * verif`, por exemplo, deixaria a cópia de `create-module.mjs` com `.replaceAll('verif', escopo)`
 * em vez de `.replaceAll('<escopo>', escopo)`, corrompendo a PRÓPRIA ferramenta: o próximo
 * `create-module.mjs <id>` rodado nesse projeto mutila qualquer `<id>` que contenha "verif" como
 * substring. Nenhum arquivo de `tools/` tem `<escopo>` como marcador de verdade — só como parte da
 * lógica —, então excluí-la não perde nada.
 */
const PASTAS_COM_MARCADOR_ESCOPO = ['modules', 'specs', 'packages', 'adapters', 'src', 'config'];

function abortar(mensagem) {
  process.stderr.write(`erro: ${mensagem}\n`);
  process.exit(1);
}

function lerOpcoes() {
  const brutos = process.argv.slice(2);
  const valorDe = (nome, padrao) => {
    const indice = brutos.indexOf(`--${nome}`);
    return indice === -1 ? padrao : brutos[indice + 1];
  };
  return {
    destino: brutos.find((a) => !a.startsWith('--')),
    binding: valorDe('binding', 'typescript'),
    escopo: valorDe('escopo', null),
    forcar: brutos.includes('--forcar'),
  };
}

function percorrer(pasta, acumulado = []) {
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) percorrer(caminho, acumulado);
    else acumulado.push(caminho);
  }
  return acumulado;
}

/**
 * Só o que este script instalou e pode ter `<escopo>` como marcador de verdade — nunca
 * `tools/` (ver `PASTAS_COM_MARCADOR_ESCOPO`). Percorrer o destino inteiro seria errado num
 * repositório já existente — `node_modules` e `.git` entrariam no laço.
 */
function arquivosComMarcadorEscopo(destino) {
  const deDentro = PASTAS_COM_MARCADOR_ESCOPO.map((p) => join(destino, p)).filter(existsSync).flatMap((p) => percorrer(p));
  const daRaiz = readdirSync(destino, { withFileTypes: true })
    .filter((entrada) => entrada.isFile())
    .map((entrada) => join(destino, entrada.name));
  return [...deDentro, ...daRaiz];
}

/** No esqueleto da raiz, só `<escopo>` é substituído — os demais marcadores são do módulo. */
function aplicarEscopo(arquivos, escopo) {
  for (const arquivo of arquivos) {
    const conteudo = readFileSync(arquivo, 'utf8');
    if (!conteudo.includes('<escopo>')) continue;
    writeFileSync(arquivo, conteudo.replaceAll('<escopo>', escopo), 'utf8');
  }
}

/**
 * Comando por binding — a ÚNICA coisa que diverge no mapa (`README.md` da doutrina). Node
 * (typescript/javascript) roda pelos scripts do `package.json`; Python tem o próprio comando
 * composto (`verificar.py`) e sobe pelo módulo `src.composicao`.
 */
const MARCADORES_DE_COMANDO = {
  typescript: { '<comando-verificar>': 'npm run verify', '<comando-iniciar>': 'npm run start' },
  javascript: { '<comando-verificar>': 'npm run verify', '<comando-iniciar>': 'npm run start' },
  python: { '<comando-verificar>': 'python verificar.py', '<comando-iniciar>': 'python -m src.composicao' },
};

/** Substitui os marcadores de comando do mapa pelo comando real do binding — precedente de `<modulo>`
 * em `create-module.mjs`: uma fonte só, marcador substituído na instalação. */
function aplicarComandosDoMapa(caminhoReadme, binding) {
  if (!existsSync(caminhoReadme)) return;
  let conteudo = readFileSync(caminhoReadme, 'utf8');
  for (const [marcador, comando] of Object.entries(MARCADORES_DE_COMANDO[binding])) {
    conteudo = conteudo.replaceAll(marcador, comando);
  }
  writeFileSync(caminhoReadme, conteudo, 'utf8');
}

/**
 * A doutrina entra como spec de arquitetura; as decisões do template, como o ADR 000 do projeto.
 * `README.md` (o mapa) viaja junto — é um arquivo comum dentro de `doutrina/`,
 * copiado pelo mesmo laço dos outros cinco, e só ele carrega marcador de comando por binding.
 */
function instalarDoutrina(destino, binding) {
  const origem = join(RAIZ_TEMPLATE, 'doutrina');
  const arquitetura = join(destino, 'specs', 'arquitetura');
  const adr = join(destino, 'specs', 'adr');
  mkdirSync(arquitetura, { recursive: true });
  mkdirSync(adr, { recursive: true });
  for (const entrada of readdirSync(origem, { withFileTypes: true })) {
    if (entrada.isFile()) cpSync(join(origem, entrada.name), join(arquitetura, entrada.name));
  }
  cpSync(join(origem, 'adr', 'decisoes.md'), join(adr, ADR_DO_TEMPLATE));
  aplicarComandosDoMapa(join(arquitetura, 'README.md'), binding);
}

/**
 * Cache de ferramenta que a execução LOCAL do binding Python deixa dentro da própria árvore fonte
 * (`ruff`, `pytest`, `mypy`, o interpretador) — nunca versionado (o `.gitignore` do binding já o
 * cobre), mas o template é copiado do DISCO de quem roda `create-project.mjs`, não de um clone limpo,
 * e é ali que a garantia "projeto novo nasce limpo" tem de valer: sem este filtro, `__pycache__/`
 * viaja sem controle nenhum (medido dentro de um `_template` gerado localmente).
 */
const LIXO_DE_EXECUCAO = new Set(['__pycache__', '.ruff_cache', '.pytest_cache', '.mypy_cache']);

/** `filter` de `cpSync`: `false` pula a entrada (e, em pasta, tudo dentro dela). */
function naoELixoDeExecucao(origem) {
  const nome = basename(origem);
  return !LIXO_DE_EXECUCAO.has(nome) && !nome.endsWith('.pyc');
}

function copiarTemplate(destino, binding) {
  instalarDoutrina(destino, binding);
  const semLixo = { recursive: true, filter: naoELixoDeExecucao };
  cpSync(join(RAIZ_TEMPLATE, 'tools'), join(destino, 'tools'), semLixo);
  cpSync(join(RAIZ_TEMPLATE, 'bindings', binding, 'root'), destino, semLixo);
  cpSync(join(RAIZ_TEMPLATE, 'bindings', binding, '_template'), join(destino, 'modules', '_template'), semLixo);
  // `adapters/_template`: o molde que `create-adapter.mjs` copia. Markers só em
  // comentário/string (nunca em posição de tipo/identificador) — o mesmo cuidado de `modules/_template`
  // —, então fica seguro parado dentro de `adapters/`, incluído por `tsconfig.json:include`.
  cpSync(join(RAIZ_TEMPLATE, 'bindings', binding, '_adapter'), join(destino, 'adapters', '_template'), semLixo);
}

/**
 * Arquivos de raiz do binding que o destino já possui. Sobrescrever um `package.json` alheio
 * apaga trabalho sem aviso — e o destino, agora, pode ser um repositório em andamento.
 */
function colisoesDeRaiz(destino, binding) {
  return readdirSync(join(RAIZ_TEMPLATE, 'bindings', binding, 'root'), { withFileTypes: true })
    .filter((entrada) => entrada.isFile())
    .map((entrada) => entrada.name)
    .filter((nome) => existsSync(join(destino, nome)));
}

/** O `.gitignore` do esqueleto sobrescreve o do destino na cópia — este é o valor de antes. */
function lerGitignore(destino) {
  const alvo = join(destino, '.gitignore');
  return existsSync(alvo) ? readFileSync(alvo, 'utf8') : null;
}

/**
 * Reinsere as linhas que o `.gitignore` do destino tinha a mais. Regra de projeto alheio não se
 * perde num scaffold: o esqueleto acrescenta o que falta, nunca apaga o que já era decisão de alguém.
 */
function mesclarGitignore(destino, anterior) {
  if (anterior === null) return;
  const alvo = join(destino, '.gitignore');
  const atual = readFileSync(alvo, 'utf8');
  const faltantes = anterior
    .split('\n')
    .map((linha) => linha.trimEnd())
    .filter((linha) => linha !== '' && !atual.includes(linha));
  if (faltantes.length === 0) return;
  writeFileSync(alvo, `${atual.trimEnd()}\n\n# --- preservado do projeto ---\n${faltantes.join('\n')}\n`, 'utf8');
}

function principal() {
  const opcoes = lerOpcoes();
  if (opcoes.destino === undefined) abortar('uso: create-project.mjs <destino> [--binding b] [--escopo e]');
  if (!BINDINGS.includes(opcoes.binding)) abortar(`binding "${opcoes.binding}" invalido — use ${BINDINGS.join(', ')}`);

  const destino = resolve(process.cwd(), opcoes.destino);
  if (existsSync(join(destino, 'modules'))) abortar(`ja existe um projeto em ${destino}`);

  const molde = join(RAIZ_TEMPLATE, 'bindings', opcoes.binding, '_template');
  if (!existsSync(molde)) abortar(`binding "${opcoes.binding}" ainda nao tem molde`);

  const colisoes = existsSync(destino) ? colisoesDeRaiz(destino, opcoes.binding) : [];
  if (colisoes.length > 0 && !opcoes.forcar) {
    abortar(`o destino ja tem ${colisoes.join(', ')} — mova-os, ou use --forcar para sobrescrever`);
  }

  const escopo = opcoes.escopo ?? basename(destino).toLowerCase();
  mkdirSync(join(destino, 'modules'), { recursive: true });
  const gitignoreAnterior = lerGitignore(destino);
  copiarTemplate(destino, opcoes.binding);
  mesclarGitignore(destino, gitignoreAnterior);
  aplicarEscopo(arquivosComMarcadorEscopo(destino), escopo);

  process.stdout.write(`projeto criado em ${destino} (binding ${opcoes.binding}, escopo "${escopo}")\n`);
  process.stdout.write('  doutrina instalada em specs/arquitetura/ e specs/adr/000-decisoes-do-template.md\n');
  if (colisoes.length > 0) process.stdout.write(`  ATENCAO: sobrescrito por --forcar: ${colisoes.join(', ')}\n`);
  // O `pip` que `python -m venv` instala vem do interpretador do SISTEMA, nunca do template, e
  // pode trazer CVE propria — medido com pip 25.2 (6 CVEs): sem o upgrade, `ci:dependencias`
  // reprova mesmo com o projeto inteiro em dia. `--upgrade pip` entra no passo 1, antes do install
  // de verdade, para o projeto nao nascer vermelho num passo que nem e dependencia DELE.
  const instalar = opcoes.binding === 'python'
    ? 'python -m venv .venv && .venv/Scripts/activate (ou source .venv/bin/activate) && pip install --upgrade pip && pip install -e ".[dev]"'
    : 'npm install';
  const verificar = opcoes.binding === 'python' ? 'python verificar.py' : 'npm run verify';
  process.stdout.write('  linter e formatador instalados: a config do linter e GERADA de'
    + ' tools/gate/thresholds.mjs (nao a edite a mao)\n');
  process.stdout.write('\nproximos passos:\n');
  process.stdout.write(`  1. ${instalar}\n`);
  process.stdout.write('  2. node tools/create-module.mjs <id>\n');
  process.stdout.write('  3. preencher o .env da raiz com os valores reais\n');
  process.stdout.write(`  4. ${verificar}   (gate, env, formato, lint, tipos, testes)\n`);
  process.stdout.write('  5. git config core.hooksPath .githooks   (ativa pre-commit e pre-push;'
    + ' e config LOCAL, cada clone ativa o proprio — ver specs/arquitetura/03-operacao.md §7.1)\n');
  process.stdout.write('  6. no PRIMEIRO commit (so uma vez): git update-index --chmod=+x'
    + ' .githooks/pre-commit .githooks/pre-push\n');
  process.stdout.write('     (medido: em Windows com "core.filemode=false" — o default comum —'
    + ' "git add" grava o hook SEM o bit de execucao. Sem ele, git no Linux/macOS PULA o hook em'
    + ' silencio, sem erro nenhum: "verde" fica indistinguivel de "nao rodou". Rode uma vez e'
    + ' o commit ja sai com o bit certo)\n');
}

principal();
