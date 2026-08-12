#!/usr/bin/env node
/**
 * verify-citations.mjs — prova que a campanha de rename (plan-3 Bloco AC) não deixa citação órfã
 * pra trás: todo NOME ANTIGO listado no inventário some do corpus depois do rename, e todo NOME NOVO
 * citado é real (existe de verdade — pasta, arquivo, chave de manifesto/env, símbolo do esqueleto).
 *
 *   node tests/verify-citations.mjs --antes      sanidade ANTES do rename: todo nome antigo do
 *                                                    inventário é citado no corpus, e a citação resolve
 *   node tests/verify-citations.mjs --depois      prova DEPOIS do rename: zero ocorrência de nome
 *                                                    antigo em qualquer arquivo do corpus, e todo nome
 *                                                    novo citado resolve
 *   node tests/verify-citations.mjs --autoteste   prova o núcleo com fixtures em memória
 *
 * INVENTÁRIO COMO ENTRADA (`rename-inventory.json`, mesma pasta): a lista FECHADA de nomes que a
 * campanha renomeia — pasta, arquivo de ferramenta, chave de manifesto/env, símbolo do esqueleto. Só é
 * candidato o que está nela; tudo o mais é FORA DE ESCOPO por construção, não exceção nem isenção —
 * simplesmente não é uma citação SOBRE ESTE TEMPLATE tratada por esta ferramenta. Falso positivo passa
 * a ser zero por desenho, não por heurística afinada: a Rodada AB tentou classificar "o que É uma
 * citação" por FORMA (caminho com barra, kebab-case perto da palavra "regra", identificador com
 * maiúscula interna) e mediu 360 achados numa base conforme — todos prosa legítima (vocabulário HTTP/
 * AST de terceiro, contraexemplo deliberado em ADR, instância hipotética de exemplo), nenhum órfão real.
 * O limite está declarado em `04-regras.md` §7.2, não escondido. O conteúdo do inventário é definido
 * pelo plan-3 Bloco AC — este arquivo só define o CONTRATO que ele preenche; começa vazio, e esse é o
 * estado correto (mesma disciplina de `config/conformidade.json` em cada binding).
 *
 * Fora de `tools/` DE PROPÓSITO — mesmo motivo e mesma pasta de `verify-map.mjs` e
 * `template-self-test.mjs` (D3, plan-2.md): ferramenta de quem MANTÉM a base, nunca de um projeto
 * gerado. `create-project.mjs` copia `tools/` inteiro para dentro de cada projeto — se este
 * arquivo morasse lá, o defeito que ele existe para caçar (citação apontando pro nome ERRADO depois do
 * rename) viajaria junto, verificando um alvo que não é mais o dele.
 *
 * DIFERENÇA DELIBERADA para `verify-map.mjs` (plan-2.1.md Bloco U): aquele confere o MAPA
 * INSTALADO num projeto gerado — um por projeto, por isso entra no Bloco K. Este confere a BASE — um
 * alvo só, que não nasce de novo a cada projeto. Por isso não entra no Bloco K: `--antes`/`--depois`
 * rodam uma vez por rename da base, não uma vez por projeto gerado.
 *
 * UM BUG DE AUTO-REFERÊNCIA vale registrar aqui — não é hipotético, aconteceu durante o desenvolvimento
 * desta própria ferramenta: `classificarLinhas` (abaixo) separa comentário de código pra montar o corpus
 * de símbolo da Classe `simbolo`, usando a MESMA regra de cerca `"""`/`'''` que `gate/context.mjs`
 * usa pra Python. Aplicada sem filtro de linguagem, essa regra confunde `['"""', "'''"]` — a própria
 * ferramenta ESCREVENDO os delimitadores como dado, em código JS real — com a ABERTURA de um docstring,
 * e o resto do arquivo inteiro vira "comentário" a partir dali; a mesma regra também quebra em Python
 * quando um docstring abre NO MEIO da linha (`VAR = '''`) se a checagem for restrita ao início da linha.
 * As primeiras medições desta ferramenta rodaram com essa corrupção silenciosa ativa — o corpus de
 * código estava sistematicamente menor do que deveria, e cada medição seguinte que reduzia o número de
 * achados podia estar consertando o discriminador OU só reduzindo o dano do bug, sem diferença visível
 * de fora. Corrigido restringindo a cerca a `ehPython` (JS/TS nunca têm essa sintaxe) e usando
 * `.includes()`, não `.startsWith()`, dentro do Python (docstring pode abrir no meio da linha). Lição:
 * uma ferramenta que lê a si mesma pra montar seu próprio corpus tem que se tratar como qualquer outro
 * arquivo do corpus — incluindo o risco de se autoconfundir com o texto que a descreve.
 *
 * NÚCLEO × CASCA, precedente de `verify-map.mjs`/`affected.mjs`: toda função de extração e
 * avaliação é pura (recebe texto/listas, nunca toca `fs`); só a casca (leitura de arquivo, varredura de
 * pasta, resolução contra disco/schema/corpus) toca disco. `--autoteste` prova o núcleo inteiro sem
 * escrever nada.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const RAIZ_TEMPLATE = resolve(AQUI, '..');
const RAIZ_BASE = resolve(RAIZ_TEMPLATE, '..', '..');
const BINDINGS = ['typescript', 'javascript', 'python'];
const CAMINHO_INVENTARIO = join(AQUI, 'rename-inventory.json');

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha até a marca "CASCA" toca `fs`.
// ================================================================================================

const ESCAPAR_REGEX = /[.*+?^${}()|[\]\\]/g;

/**
 * Toda linha (1-based) onde `nome` aparece como TOKEN INTEIRO — não como pedaço de um token maior.
 * `modulo` não casa dentro de `modules` (o `s` seguinte é fronteira violada); `create-module.mjs` casa
 * dentro de `tools/create-module.mjs` (a `/` anterior é fronteira válida). Fronteira é "não é letra,
 * dígito, `_`, `.` nem `-`" dos dois lados — cobre kebab-case (`pre-push`) e nome pontuado
 * (`modulo.json`) sem exigir que o delimitador seja espaço/crase: uma citação real nesta base aparece
 * tanto entre crases quanto NUA (mensagem de regra, caminho num exemplo de shell), e o inventário é uma
 * lista FECHADA — não há forma a discriminar, só o nome exato a achar ou não achar.
 */
export function ocorrenciasDoNome(nome, texto) {
  const re = new RegExp(`(?<![\\w.-])${nome.replace(ESCAPAR_REGEX, '\\$&')}(?![\\w.-])`);
  const linhas = [];
  texto.split(/\r?\n/).forEach((linha, indice) => {
    if (re.test(linha)) linhas.push(indice + 1);
  });
  return linhas;
}

/**
 * `--antes`: o nome ANTIGO de UM item do inventário precisa (1) ser citado em algum lugar do corpus —
 * senão o item não descreve nada real, é entrada de inventário errada — e (2) quando citado, RESOLVER
 * (a checagem concreta é `resolveAntigo`, calculada pela casca antes de chamar esta função pura, porque
 * depende de disco/schema/corpus de código). Devolve a lista de achados; vazio é sucesso.
 */
export function avaliarAntes(item, corpus, resolveAntigo) {
  const ocorrencias = corpus.flatMap(({ arquivo, texto }) => (
    ocorrenciasDoNome(item.antigo, texto).map((linha) => ({ arquivo, linha }))
  ));
  if (ocorrencias.length === 0) {
    return [{ item, nome: item.antigo, motivo: 'nao-citado-hoje' }];
  }
  if (!resolveAntigo) {
    return ocorrencias.map((oc) => ({ ...oc, item, nome: item.antigo, motivo: 'citado-mas-nao-resolve' }));
  }
  return [];
}

/**
 * `--depois`: (1) ZERO ocorrência do nome ANTIGO em qualquer arquivo do corpus — nomeando arquivo:linha
 * de cada uma que sobrar — e (2) se o nome NOVO é citado em algum lugar, essa citação RESOLVE
 * (`resolveNovo`, mesma origem de `resolveAntigo` acima). Nome novo nunca citado não é falha aqui —
 * "todo nome novo citado resolve" pressupõe citação; ausência de citação é outra pergunta, fora do
 * contrato pedido.
 */
export function avaliarDepois(item, corpus, resolveNovo) {
  const achados = [];
  for (const { arquivo, texto } of corpus) {
    for (const linha of ocorrenciasDoNome(item.antigo, texto)) {
      achados.push({ arquivo, linha, item, nome: item.antigo, motivo: 'nome-antigo-ainda-presente' });
    }
  }
  const citadoNovo = corpus.some(({ texto }) => ocorrenciasDoNome(item.novo, texto).length > 0);
  if (citadoNovo && !resolveNovo) {
    achados.push({ item, nome: item.novo, motivo: 'nome-novo-citado-mas-nao-resolve' });
  }
  return achados;
}

/** Achata um JSON Schema em nomes de chave — bare (`schema`) e path-completo (`dados.schema`). Desce
 * em `properties` e em `items.properties` (arrays de objeto, como `consome`). Usada pra resolver item
 * de tipo `chave` (manifesto/env). */
export function chavesDoSchema(schema, prefixo = '') {
  const chaves = new Set();
  const propriedades = schema?.properties ?? schema?.items?.properties;
  if (propriedades === undefined) return chaves;
  for (const [nome, sub] of Object.entries(propriedades)) {
    chaves.add(nome);
    const caminho = prefixo === '' ? nome : `${prefixo}.${nome}`;
    chaves.add(caminho);
    for (const filha of chavesDoSchema(sub, nome)) chaves.add(filha);
  }
  return chaves;
}

const RE_PALAVRA_DE_CODIGO = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;

/**
 * Todo identificador que aparece em CÓDIGO real (função declarada, chave de objeto, campo de
 * interface/dataclass, parâmetro, nome importado — qualquer um). PURA: recebe texto já filtrado pra só
 * código (comentário fora — quem filtra é `classificarLinhas`, na casca), devolve o conjunto de
 * palavras. Usada pra resolver item de tipo `simbolo`: o novo nome precisa aparecer em CÓDIGO de
 * verdade, não só ser mencionado num comentário que ninguém atualizou.
 */
export function extrairPalavrasDeCodigo(textoDeCodigo) {
  const palavras = new Set();
  for (const m of textoDeCodigo.matchAll(RE_PALAVRA_DE_CODIGO)) palavras.add(m[0]);
  return palavras;
}

/**
 * TABELA base↔projeto de `funcionamento-esperado.md` §1 (não é heurística — é a mesma tradução que a
 * doutrina já declara): a doutrina descreve o PROJETO GERADO na maior parte da prosa, e um caminho
 * nessa forma não existe na base porque a base é a fonte, não a saída instalada.
 *
 *   | Na base                    | No projeto gerado    |
 *   |-----------------------------|-----------------------|
 *   | `doutrina/`                 | `specs/arquitetura/`  |
 *   | `bindings/<b>/_template/`   | `modules/<id>/`       |
 *
 * Dado um nome na forma do PROJETO, devolve a forma equivalente na BASE. `modules/<id>/resto` perde
 * `<id>` de propósito: o id é o nome escolhido no projeto gerado, não existe na base — o que existe é o
 * CONTEÚDO do molde, já uma das raízes de resolução.
 */
export function visaoDaBase(nome) {
  const semArquitetura = nome.match(/^specs\/arquitetura(?:\/(.*))?$/);
  if (semArquitetura !== null) return `doutrina/${semArquitetura[1] ?? ''}`.replace(/\/$/, '');
  const semModulo = nome.match(/^modules\/[^/]+\/?(.*)$/);
  if (semModulo !== null) return semModulo[1];
  return null;
}

/**
 * Mesma extração de comentário de `gate/context.mjs:extrairLinhasDeCodigo` — aqui separada nas DUAS
 * metades que ela distingue, comentário e código, num único passo (evita duas implementações do mesmo
 * estado divergindo no primeiro ajuste). Copiada (não importada) porque este arquivo mora fora do
 * alcance de `tools/gate/` por D3, e a cópia é da REGRA, não da fonte de verdade sobre o que é
 * comentário (que continua sendo só o gate — ver `04-regras.md` §7.2, "comentário não é código").
 *
 * UM DESVIO deliberado do original: a cerca `"""`/`'''` (docstring Python, pode abrir NO MEIO da linha
 * — `VAR = '''`) só é procurada quando `ehPython` é verdadeiro — JS/TS não têm essa sintaxe, os três
 * caracteres ali são só conteúdo de string comum. Ver o bug de auto-referência descrito no cabeçalho do
 * arquivo: sem esse filtro, esta própria ferramenta corrompe seu próprio corpus.
 *
 * Linha que NÃO é da metade pedida vira string vazia, nunca é removida — preserva o índice de linha
 * 1-based do arquivo original nas duas metades, para que `arquivo:linha` no relatório aponte pro lugar
 * certo.
 */
export function classificarLinhas(conteudo, ehPython = false) {
  const linhas = conteudo.split(/\r?\n/);
  const comentario = new Array(linhas.length).fill('');
  const codigo = new Array(linhas.length).fill('');
  let emBloco = false;
  let cerca = null;
  linhas.forEach((texto, indice) => {
    const limpa = texto.trim();
    if (cerca !== null) {
      comentario[indice] = texto;
      if (limpa.includes(cerca)) cerca = null;
      return;
    }
    if (emBloco) {
      comentario[indice] = texto;
      if (limpa.includes('*/')) emBloco = false;
      return;
    }
    const aspas = ehPython ? ['"""', "'''"].find((delimitador) => limpa.includes(delimitador)) : undefined;
    if (aspas !== undefined) {
      comentario[indice] = texto;
      if ((limpa.split(aspas).length - 1) % 2 === 1) cerca = aspas;
      return;
    }
    if (limpa.startsWith('/*')) {
      comentario[indice] = texto;
      if (!limpa.includes('*/')) emBloco = true;
      return;
    }
    if (limpa.startsWith('//') || limpa.startsWith('#') || limpa.startsWith('*')) {
      comentario[indice] = texto;
    } else {
      codigo[indice] = texto;
    }
  });
  return { comentario: comentario.join('\n'), codigo: codigo.join('\n') };
}

// ================================================================================================
// CASCA — toca disco. Nomeado por O QUE toca: leitura, varredura, resolução de caminho/schema/corpus.
// ================================================================================================

function lerTexto(caminho) {
  return readFileSync(caminho, 'utf8').replace(/^﻿/, '');
}

/** As raízes contra as quais um nome de tipo `pasta`/`arquivo` pode resolver, na ORDEM em que valem a
 * pena tentar — a base primeiro, depois cada binding (`_template` antes de `root`). */
function raizesDeResolucao() {
  const raizes = [RAIZ_TEMPLATE, RAIZ_BASE];
  for (const binding of BINDINGS) {
    raizes.push(join(RAIZ_TEMPLATE, 'bindings', binding, '_template'));
    raizes.push(join(RAIZ_TEMPLATE, 'bindings', binding, 'root'));
  }
  return raizes;
}

const IGNORAR_NA_VARREDURA = new Set(['node_modules', '.git', '__pycache__', '.venv', 'dist', 'generated']);

/** Todo nome-base (arquivo ou pasta) sob `pasta`, recursivo — o índice contra o qual um nome SEM barra
 * (citado por nome, não por caminho completo — convenção medida nesta base) resolve. */
function indiceDeNomesBase(pasta, nomes = new Set()) {
  if (!existsSync(pasta)) return nomes;
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    if (IGNORAR_NA_VARREDURA.has(entrada.name)) continue;
    nomes.add(entrada.name);
    if (entrada.isDirectory()) indiceDeNomesBase(join(pasta, entrada.name), nomes);
  }
  return nomes;
}

/**
 * Nome de tipo `pasta`/`arquivo` resolve se existir sob QUALQUER raiz, na forma literal OU na forma
 * traduzida pela tabela base↔projeto (`visaoDaBase`), OU se for um nome-base presente no índice.
 */
function caminhoResolve(nome, raizes, indiceNomes) {
  const semBarraFinal = nome.replace(/\/$/, '');
  if (raizes.some((raiz) => existsSync(join(raiz, semBarraFinal)))) return true;
  if (!semBarraFinal.includes('/') && indiceNomes.has(semBarraFinal)) return true;
  const traduzido = visaoDaBase(semBarraFinal);
  if (traduzido !== null) return caminhoResolve(traduzido, raizes, indiceNomes);
  return false;
}

/** Anda a árvore, filtrando por extensão — mesma forma de `ponteiros.py:_caminhos_dos_alvos`. */
function arquivosSob(pasta, extensoes) {
  if (!existsSync(pasta)) return [];
  const achados = [];
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    if (IGNORAR_NA_VARREDURA.has(entrada.name)) continue;
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) {
      achados.push(...arquivosSob(caminho, extensoes));
    } else if (extensoes.some((ext) => entrada.name.endsWith(ext))) {
      achados.push(caminho);
    }
  }
  return achados;
}

const EXT_DOUTRINA = ['.md'];
const EXT_FONTE = ['.mjs', '.ts', '.tsx', '.js', '.jsx', '.py'];

/** `specs/_estrutura_modulos/doutrina/**\/*.md` + `specs/_estrutura_modulos/README.md`. */
function arquivosDeDoutrina() {
  const doutrina = arquivosSob(join(RAIZ_TEMPLATE, 'doutrina'), EXT_DOUTRINA);
  const readme = join(RAIZ_TEMPLATE, 'README.md');
  return existsSync(readme) ? [...doutrina, readme] : doutrina;
}

/** `bindings/**`, `tools/**` (inclui `gate/rules/*.mjs` — mensagem de regra é código real, já
 * coberta aqui, sem precisar de extração separada), `tests/**`. */
function arquivosDeFonte() {
  return [
    ...arquivosSob(join(RAIZ_TEMPLATE, 'bindings'), EXT_FONTE),
    ...arquivosSob(join(RAIZ_TEMPLATE, 'tools'), EXT_FONTE),
    ...arquivosSob(join(RAIZ_TEMPLATE, 'tests'), EXT_FONTE),
  ];
}

/** `skills/**\/SKILL.md` e `skills/**\/references/*.md` QUE CITAM o template — o sinal é mencionar o
 * caminho da base ou uma das duas ferramentas de entrada do template. */
const SINAIS_DE_TEMPLATE = ['specs/_estrutura_modulos', 'create-module.mjs', 'create-project.mjs'];

function arquivosDeSkills() {
  const todos = arquivosSob(join(RAIZ_BASE, 'skills'), ['.md']).filter((caminho) => {
    const rel = relative(RAIZ_BASE, caminho).split('\\').join('/');
    return rel.endsWith('/SKILL.md') || rel.includes('/references/');
  });
  return todos.filter((caminho) => {
    const texto = lerTexto(caminho);
    return SINAIS_DE_TEMPLATE.some((sinal) => texto.includes(sinal));
  });
}

/** `skills/<nome>/` a partir de um `SKILL.md`/`references/*.md` dentro dela — raiz pra achar os
 * `scripts/**` DA MESMA skill (uma skill que cita o template também cita, com frequência, funções dos
 * seus próprios scripts, e essas precisam entrar no corpus). */
function raizDaSkill(caminho) {
  const partes = relative(RAIZ_BASE, caminho).split(/[\\/]/);
  return join(RAIZ_BASE, partes[0], partes[1]);
}

/** `scripts/**` de cada skill que cita o template — mesma extensão de fonte que `arquivosDeFonte`. */
function arquivosDeScriptsDeSkills(arquivosSkill) {
  const raizes = new Set(arquivosSkill.map(raizDaSkill));
  return [...raizes].flatMap((raiz) => arquivosSob(join(raiz, 'scripts'), EXT_FONTE));
}

/** `plan.md`/`plan-2*.md`/`plan-3*.md` na raiz da base — REGISTRO HISTÓRICO da campanha, nunca alvo
 * de citação (Bloco AD.5). Padrão explícito, não um `endsWith('.md')` genérico: um plano cita o nome
 * ANTIGO porque é o nome que existia quando aquele parágrafo foi escrito, e é isso que um registro
 * deve fazer — reescrevê-lo pra acompanhar o rename destruiria a própria razão de existir. */
const RE_ARQUIVO_DE_PLANO = /^plan(-\d+(\.\d+)?)?\.md$/;

/** Acha os planos NA RAIZ da base (não desce em subpasta — um `plan.md` dentro de `skills/` não é
 * este tipo de registro). Existe para a exclusão abaixo ser uma DECISÃO auditável: sem esta função,
 * os planos já ficam fora do corpus porque nenhuma das outras (`arquivosDeDoutrina`,
 * `arquivosDeFonte`, `arquivosDeSkills`) desce na raiz da base — um ACIDENTE de cobertura de
 * varredura, não uma lista. Achando-os aqui e excluindo-os explicitamente embaixo, a exclusão
 * sobrevive o dia em que alguém estender o corpus pra cobrir a raiz da base por outro motivo. */
function arquivosDePlanos() {
  if (!existsSync(RAIZ_BASE)) return [];
  return readdirSync(RAIZ_BASE, { withFileTypes: true })
    .filter((entrada) => entrada.isFile() && RE_ARQUIVO_DE_PLANO.test(entrada.name))
    .map((entrada) => join(RAIZ_BASE, entrada.name));
}

/** O corpus inteiro — todo arquivo onde uma citação (nome antigo ou novo) pode aparecer — como
 * `{ arquivo, texto }` bruto, sem separar comentário de código: `--depois` quer ZERO ocorrência de nome
 * antigo em QUALQUER lugar, comentário incluído (um comentário parado no nome velho é rot igual).
 *
 * Os planos (`arquivosDePlanos`) são achados e DESCARTADOS aqui, por decisão (Bloco AD.5) — não
 * porque nenhuma das fontes acima os alcance. */
function corpusBruto() {
  const arquivosSkill = arquivosDeSkills();
  const excluidos = new Set(arquivosDePlanos());
  const caminhos = [
    ...arquivosDeDoutrina(),
    ...arquivosDeFonte(),
    ...arquivosSkill,
    ...arquivosDeScriptsDeSkills(arquivosSkill),
  ].filter((caminho) => !excluidos.has(caminho));
  return caminhos.map((caminho) => ({ arquivo: relative(RAIZ_BASE, caminho).split('\\').join('/'), texto: lerTexto(caminho) }));
}

function chavesDeManifesto() {
  const moduloSchema = JSON.parse(lerTexto(join(RAIZ_TEMPLATE, 'tools', 'gate', 'schemas', 'modulo.schema.json')));
  const projetoSchema = JSON.parse(lerTexto(join(RAIZ_TEMPLATE, 'tools', 'gate', 'schemas', 'projeto.schema.json')));
  return new Set([...chavesDoSchema(moduloSchema), ...chavesDoSchema(projetoSchema)]);
}

/** Todo identificador presente em CÓDIGO real (não comentário) de `bindings/**`, `tools/**`,
 * `tests/**` e dos `scripts/**` das skills que citam o template — o universo contra o qual um nome de
 * tipo `simbolo` resolve. */
function palavrasDeCodigo() {
  const arquivosSkill = arquivosDeSkills();
  const palavras = new Set();
  for (const caminho of [...arquivosDeFonte(), ...arquivosDeScriptsDeSkills(arquivosSkill)]) {
    const { codigo } = classificarLinhas(lerTexto(caminho), caminho.endsWith('.py'));
    for (const palavra of extrairPalavrasDeCodigo(codigo)) palavras.add(palavra);
  }
  return palavras;
}

/** Monta o contexto de resolução uma vez — reusado por todo item do inventário. */
function contextoDeResolucao() {
  return {
    raizes: raizesDeResolucao(),
    indiceNomes: indiceDeNomesBase(RAIZ_TEMPLATE),
    chavesDeManifesto: chavesDeManifesto(),
    palavrasDeCodigo: palavrasDeCodigo(),
  };
}

/** Resolve UM nome contra a realidade, pelo `tipo` declarado no item do inventário. */
function resolveNome(tipo, nome, contexto) {
  if (tipo === 'pasta' || tipo === 'arquivo') return caminhoResolve(nome, contexto.raizes, contexto.indiceNomes);
  if (tipo === 'chave') return contexto.chavesDeManifesto.has(nome);
  if (tipo === 'simbolo') return contexto.palavrasDeCodigo.has(nome);
  return false;
}

/** Lê `rename-inventory.json` — mesma disciplina de `config/conformidade.json`: começa vazio, e
 * esse é o estado correto. Conteúdo real é definido pelo plan-3 Bloco AC, não por esta ferramenta. */
function lerInventario() {
  const bruto = JSON.parse(lerTexto(CAMINHO_INVENTARIO));
  return { itens: bruto.itens ?? [] };
}

function rodarAntes(inventario, corpus, contexto) {
  const achados = [];
  for (const item of inventario.itens) {
    achados.push(...avaliarAntes(item, corpus, resolveNome(item.tipo, item.antigo, contexto)));
  }
  return achados;
}

function rodarDepois(inventario, corpus, contexto) {
  const achados = [];
  for (const item of inventario.itens) {
    achados.push(...avaliarDepois(item, corpus, resolveNome(item.tipo, item.novo, contexto)));
  }
  return achados;
}

// ================================================================================================
// AUTOTESTE — núcleo puro contra fixtures em memória.
// ================================================================================================

function casosDeAutoteste() {
  const contexto = {
    raizes: [RAIZ_TEMPLATE],
    indiceNomes: new Set(['validate.mjs']),
    chavesDeManifesto: new Set(['envRequerido']),
    palavrasDeCodigo: new Set(['montarRegistro']),
  };
  return [
    // ocorrenciasDoNome — a fronteira de token
    { nome: 'ocorrenciasDoNome: acha token inteiro, com a linha certa', fn: () => {
      const ls = ocorrenciasDoNome('doutrina', 'linha 1\nver `doutrina/README.md` aqui\n');
      return ls.length === 1 && ls[0] === 2;
    } },
    { nome: 'ocorrenciasDoNome: NAO acha "modulo" dentro de "modulos" (fronteira violada)', fn: () => (
      ocorrenciasDoNome('modulo', 'os modulos do projeto').length === 0
    ) },
    { nome: 'ocorrenciasDoNome: acha nome kebab-case inteiro (pre-push)', fn: () => (
      ocorrenciasDoNome('pre-push', 'nao exige `pre-push` aqui').length === 1
    ) },
    { nome: 'ocorrenciasDoNome: acha nome com barra dentro de caminho maior (basename)', fn: () => (
      ocorrenciasDoNome('create-module.mjs', 'rode `tools/create-module.mjs` agora').length === 1
    ) },
    { nome: 'ocorrenciasDoNome: NAO acha "modulo.json" dentro de "modulo.json.bak"', fn: () => (
      ocorrenciasDoNome('modulo.json', 'arquivo modulo.json.bak encontrado').length === 0
    ) },
    { nome: 'ocorrenciasDoNome: acha em varias linhas', fn: () => (
      ocorrenciasDoNome('doutrina', 'doutrina aqui\nnada\ndoutrina ali').length === 2
    ) },
    // avaliarAntes
    { nome: 'avaliarAntes: citado e resolve -> vazio', fn: () => (
      avaliarAntes({ antigo: 'doutrina', novo: 'doctrine', tipo: 'pasta' }, [{ arquivo: 'x.md', texto: '`doutrina`' }], true).length === 0
    ) },
    { nome: 'avaliarAntes: citado mas NAO resolve -> achado com arquivo:linha', fn: () => {
      const r = avaliarAntes({ antigo: 'doutrina', novo: 'doctrine', tipo: 'pasta' }, [{ arquivo: 'x.md', texto: '`doutrina`' }], false);
      return r.length === 1 && r[0].arquivo === 'x.md' && r[0].linha === 1 && r[0].motivo === 'citado-mas-nao-resolve';
    } },
    { nome: 'avaliarAntes: nunca citado -> achado nao-citado-hoje, sem arquivo', fn: () => {
      const r = avaliarAntes({ antigo: 'fantasma', novo: 'fantasma2', tipo: 'pasta' }, [{ arquivo: 'x.md', texto: 'nada aqui' }], true);
      return r.length === 1 && r[0].motivo === 'nao-citado-hoje' && r[0].arquivo === undefined;
    } },
    // avaliarDepois
    { nome: 'avaliarDepois: sem nome antigo, novo nao citado -> vazio', fn: () => (
      avaliarDepois({ antigo: 'doutrina', novo: 'doctrine', tipo: 'pasta' }, [{ arquivo: 'x.md', texto: 'nada aqui' }], true).length === 0
    ) },
    { nome: 'avaliarDepois: nome antigo restante -> achado nomeando arquivo:linha', fn: () => {
      const r = avaliarDepois({ antigo: 'doutrina', novo: 'doctrine', tipo: 'pasta' }, [{ arquivo: 'x.md', texto: 'ainda usa `doutrina` aqui' }], true);
      return r.length === 1 && r[0].arquivo === 'x.md' && r[0].linha === 1 && r[0].motivo === 'nome-antigo-ainda-presente';
    } },
    { nome: 'avaliarDepois: novo citado mas NAO resolve -> achado', fn: () => {
      const r = avaliarDepois({ antigo: 'doutrina', novo: 'doctrine', tipo: 'pasta' }, [{ arquivo: 'x.md', texto: '`doctrine`' }], false);
      return r.length === 1 && r[0].motivo === 'nome-novo-citado-mas-nao-resolve';
    } },
    { nome: 'avaliarDepois: novo NUNCA citado nao e falha (fora do contrato pedido)', fn: () => (
      avaliarDepois({ antigo: 'doutrina', novo: 'doctrine', tipo: 'pasta' }, [{ arquivo: 'x.md', texto: 'nada aqui' }], false).length === 0
    ) },
    // resolução por tipo (tocam disco de verdade, mesmo precedente de sempre nesta base)
    { nome: 'resolveNome pasta: existe no disco', fn: () => resolveNome('pasta', 'doutrina', contexto) === true },
    { nome: 'resolveNome pasta: nao existe', fn: () => resolveNome('pasta', 'pasta-fantasma-xyz', contexto) === false },
    { nome: 'resolveNome arquivo: por nome-base no indice', fn: () => resolveNome('arquivo', 'validate.mjs', contexto) === true },
    { nome: 'resolveNome chave: existe no schema', fn: () => resolveNome('chave', 'envRequerido', contexto) === true },
    { nome: 'resolveNome chave: nao existe', fn: () => resolveNome('chave', 'chaveFantasma', contexto) === false },
    { nome: 'resolveNome simbolo: existe no corpus de codigo', fn: () => resolveNome('simbolo', 'montarRegistro', contexto) === true },
    { nome: 'resolveNome simbolo: nao existe', fn: () => resolveNome('simbolo', 'funcaoFantasma', contexto) === false },
    { nome: 'resolveNome: tipo desconhecido nunca resolve', fn: () => resolveNome('tipo-invalido', 'doutrina', contexto) === false },
    // visaoDaBase / caminhoResolve — tabela base<->projeto
    { nome: 'visaoDaBase traduz specs/arquitetura/X para doutrina/X', fn: () => visaoDaBase('specs/arquitetura/04-regras.md') === 'doutrina/04-regras.md' },
    { nome: 'visaoDaBase traduz specs/arquitetura bare para doutrina', fn: () => visaoDaBase('specs/arquitetura') === 'doutrina' },
    { nome: 'visaoDaBase remove <id> de modules/<id>/resto', fn: () => visaoDaBase('modules/catalogo/core/domain') === 'core/domain' },
    { nome: 'visaoDaBase devolve null pra nome fora da tabela', fn: () => visaoDaBase('dist/relatorio.json') === null },
    { nome: 'resolveNome pasta: resolve so na visao do projeto (specs/arquitetura) via tabela', fn: () => resolveNome('pasta', 'specs/arquitetura', contexto) === true },
    // chavesDoSchema
    { nome: 'chavesDoSchema: achata bare e dotted', fn: () => {
      const chaves = chavesDoSchema({ properties: { dados: { properties: { schema: { type: 'string' } } } } });
      return chaves.has('dados') && chaves.has('schema') && chaves.has('dados.schema');
    } },
    // extrairPalavrasDeCodigo
    { nome: 'extrairPalavrasDeCodigo: pega chave de objeto, campo, nome importado (nao so declaracao)', fn: () => {
      const palavras = extrairPalavrasDeCodigo("import { existsSync } from 'node:fs';\nconst obj = { geradorId: () => 1 };\ninterface X { criadoEm: string }");
      return palavras.has('existsSync') && palavras.has('geradorId') && palavras.has('criadoEm');
    } },
    // classificarLinhas — inclui o bug de auto-referencia registrado no cabecalho
    { nome: 'classificarLinhas: separa comentario de codigo', fn: () => {
      const { comentario, codigo } = classificarLinhas('// cita `funcaoFantasma` aqui\nconst funcaoReal = () => 1;');
      return comentario.includes('funcaoFantasma') && !codigo.includes('funcaoFantasma') && codigo.includes('funcaoReal');
    } },
    { nome: 'classificarLinhas: `"""` como DADO em JS (ehPython=false) nao abre cerca (bug de auto-referencia)', fn: () => {
      const { codigo } = classificarLinhas('const aspas = [\'"""\', "\'\'\'"];\nconst funcaoDepois = () => 1;', false);
      return codigo.includes('funcaoDepois');
    } },
    { nome: 'classificarLinhas: docstring Python que ABRE NO MEIO da linha (VAR = \'\'\') fecha corretamente', fn: () => {
      const py = "TEXTO = '''\nlinha de conteudo\n'''\n\ndef depois():\n    pass\n";
      const { comentario, codigo } = classificarLinhas(py, true);
      return comentario.includes('linha de conteudo') && codigo.includes('def depois');
    } },
  ];
}

function rodarAutoteste() {
  let falhas = 0;
  for (const caso of casosDeAutoteste()) {
    let ok;
    try {
      ok = caso.fn() === true;
    } catch (causa) {
      ok = false;
      process.stdout.write(`       excecao: ${causa instanceof Error ? causa.message : String(causa)}\n`);
    }
    process.stdout.write(`  ${ok ? 'ok   ' : 'FALHA'} ${caso.nome}\n`);
    if (!ok) falhas += 1;
  }
  const total = casosDeAutoteste().length;
  process.stdout.write(`\nautoteste (verificar-citacoes): ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

function formatarAchado(a) {
  const alvo = a.arquivo !== undefined ? `${a.arquivo}:${a.linha}` : '(sem ocorrência)';
  return `  ${alvo} -> \`${a.nome}\` [${a.motivo}] (item: ${a.item.antigo} -> ${a.item.novo})`;
}

function rodar(modo) {
  const inventario = lerInventario();
  if (inventario.itens.length === 0) {
    process.stdout.write(
      'rename-inventory.json vazio — nada a conferir. Estado correto antes do plan-3 Bloco AC\n'
      + 'popular a lista fechada de renomes.\n',
    );
    return 0;
  }
  const corpus = corpusBruto();
  const contexto = contextoDeResolucao();
  const achados = modo === 'antes' ? rodarAntes(inventario, corpus, contexto) : rodarDepois(inventario, corpus, contexto);
  process.stdout.write(`${achados.map(formatarAchado).join('\n')}\n`);
  process.stdout.write(achados.length === 0
    ? `\n--${modo}: OK — ${inventario.itens.length} item(ns) do inventário, nenhum achado\n`
    : `\n--${modo}: REPROVADO — ${achados.length} achado(s)\n`);
  return achados.length === 0 ? 0 : 1;
}

function principal() {
  const argv = process.argv.slice(2);
  if (argv.includes('--autoteste')) return rodarAutoteste();
  if (argv.includes('--antes')) return rodar('antes');
  if (argv.includes('--depois')) return rodar('depois');
  process.stderr.write('uso: node tests/verify-citations.mjs --antes\n'
    + '     node tests/verify-citations.mjs --depois\n'
    + '     node tests/verify-citations.mjs --autoteste\n');
  return 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal();
}
