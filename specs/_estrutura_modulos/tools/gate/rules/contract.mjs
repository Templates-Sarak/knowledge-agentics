/**
 * rules/contract.mjs — família "Contrato" do catálogo (specs/arquitetura/04-regras.md §4.5).
 * ids: contract, route-naming, synchronized-contract, contract-projection, payload-camelcase,
 *      sensitive-output, sensitive-in-output, mapper-naming, exported-summary, raw-output
 *
 * O `contract/openapi.yaml` é a FONTE. Estas regras existem para que ele não seja ficção: o que
 * está na spec existe no código, o que está no código existe na spec, e nada sensível vaza.
 *
 * A leitura da spec mora em `../spec.mjs`, compartilhada com `consumes-contract` (Isolamento).
 *
 * Os dois extratores que julgam CODIGO — `codeRoutes` e `projectionKeys` — leem
 * `codeText`, nunca `arquivo.conteudo`. Sobre o texto cru, um comentario que DOCUMENTA a lei
 * ("`paraContrato` nunca deve projetar `{ cpf }`") vira a violacao que ele proibe, e uma rota
 * desativada citada em comentario vira rota fora do contrato. Quem le a SPEC continua em
 * `spec.conteudo`, de proposito: em YAML nao ha comentario a descontar do que importa aqui.
 */
import {
  failedReads, normalize, responseProperties, specRoutes, specServer, specOf,
} from '../spec.mjs';
import { codeText } from '../text.mjs';
import { LOG_CALL_VERBS } from './operation.mjs';

const REQUIRED = ['/health', '/meta', '/summary'];

/**
 * A forma que o leitor de bloco aceita, por seção. É o que falta numa mensagem que só diz
 * "não verifiquei": o autor precisa saber o que editar, e citar só *flow style* manda quem já
 * está em bloco refazer o que já fez.
 */
const ACCEPTED_SHAPE = {
  paths: 'under "paths:", each route is a key indented EXACTLY 2 spaces on its own line '
    + '("  /records:") and each method a key indented EXACTLY 4 spaces ("    get:"); the reader '
    + 'does not recognize other valid YAML indentation',
  servers: 'under "servers:", the FIRST item declares "url:" either on the dash line '
    + '("  - url: /api/v1/<module>") or another line in the same item; single or double quotes are accepted',
};

/**
 * A mensagem de spec ilegível, e o único lugar que a escreve. Dona: a regra `contract`.
 *
 * Nomeia a seção que falhou, e não uma causa: a detecção é agnóstica de propósito, e a mensagem
 * tem de ser fiel a isso. *Flow style* entra como a causa mais provável, não como a única —
 * `paths:` indentado com 4 espaços é bloco válido e chega aqui pelo mesmo caminho, e o autor que
 * lesse "reescreva em bloco" ficaria sem saída, exatamente o que esta mensagem existe para evitar.
 */
function unreadableMessage(failures) {
  return `contract/openapi.yaml is present but unreadable by the gate: parsing extracted nothing from "${failures.join('" and "')}". `
    + 'The gate reads block-style YAML without external dependencies, so it can travel with an extracted module and run without installation. '
    + `Flow style ({...} on one line) is common, but not the only cause. Accepted form: ${failures.map((f) => ACCEPTED_SHAPE[f]).join('; ')}.`;
}

/**
 * Verbos que não podem ser SEGMENTO de path — a ação é o método HTTP (02-contrato-e-dados §2).
 * Inline como `VENDOR_SDKS`: é vocabulário NORMATIVO fechado, parte da regra, não tunable de
 * projeto — mudá-lo é mudar a lei, e a lei não mora em config.
 *
 * Critério de inclusão: a palavra nomeia uma AÇÃO que o método HTTP já expressa. Substantivo de
 * recurso fica de fora, mesmo quando parece verbo — por isso `busca`, `lista` e `resumo` não
 * estão aqui, e `buscar`, `listar` estão. Os dois idiomas entram porque a doutrina manda rota em
 * português (§3.1 "Idioma") e a comparação é por segmento inteiro, nunca substring.
 */
const FORBIDDEN_VERBS = new Set([
  // inglês
  'get', 'post', 'put', 'patch', 'delete', 'create', 'update', 'remove', 'list',
  'fetch', 'find', 'search', 'add', 'edit', 'new', 'save', 'send',
  // português
  'criar', 'atualizar', 'remover', 'deletar', 'apagar', 'excluir', 'listar', 'buscar',
  'procurar', 'pesquisar', 'adicionar', 'editar', 'novo', 'nova', 'obter', 'consultar',
  'salvar', 'gravar', 'alterar', 'cadastrar', 'inserir', 'enviar', 'gerar',
]);

/**
 * `raw-output` — duas metades, duas âncoras. Inverter as DUAS ("qualquer identificador em
 * `return`, em qualquer lugar") falha o critério de reversão do bloco: medido contra o molde de
 * referência SEM MUTAÇÃO NENHUMA, produz 14 identificadores exigindo isenção — muito acima do teto
 * de ~6. A causa é a âncora, não o raio: `return <id>` sem escopo casa qualquer função que devolve
 * uma variável, não só resposta HTTP.
 *
 * MAPEADOR — vocabulário fechado. Nunca teve queixa; não muda.
 */
const RETURN_MAPPER_PATTERN = /return\s+(linha|linhas|row|rows)\s*$/;

/**
 * BORDA, TS/JS — `.json(<identificador>)` acusa SEMPRE, sem lista de isentos. Seguro por
 * construção: só existe onde uma resposta HTTP está de fato sendo montada, e a captura exige um
 * identificador PURO — `res.json({ total })` (objeto literal) e `res.json(paraContrato(x))`
 * (chamada de projeção) não casam porque o próximo caractere não é `)`.
 */
const JSON_EDGE_PATTERN = /\.json\(\s*([A-Za-z_]\w*)\s*\)/;

/** BORDA, Python — só dentro de handler decorado (`@router.<verbo>`). Python não tem `.json(...)`:
 * a borda É o `return` do handler, e só a indentação separa "dentro do handler" de "fora dele"
 * (`return router`, ao fim de `criar_rotas`, está no MESMO recuo do decorator — precisa calar). */
const ROUTER_DECORATOR_PATTERN = /^(\s*)@router\.(get|post|put|patch|delete)\(/;
const IDENTIFIER_RETURN_PATTERN = /^\s*return\s+([A-Za-z_][\w.]*)\s*$/;

function pythonEdgeFindings(file) {
  const lines = file.codeLines;
  const findings = [];
  for (let i = 0; i < lines.length; i += 1) {
    const decorator = ROUTER_DECORATOR_PATTERN.exec(lines[i].text);
    if (decorator === null) continue;
    const decoratorIndent = decorator[1].length;
    // a linha seguinte nao-branca e a assinatura (`async def ...:`), no MESMO recuo do decorator —
    // o corpo do handler so comeca depois dela.
    let bodyStart = i + 1;
    while (bodyStart < lines.length && lines[bodyStart].text.trim() === '') bodyStart += 1;
    bodyStart += 1;
    for (let j = bodyStart; j < lines.length; j += 1) {
      const { number, text } = lines[j];
      if (text.trim() === '') continue;
      const indent = text.length - text.trimStart().length;
      if (indent <= decoratorIndent) break; // dedent: saiu do corpo do handler
      if (RETURN_MAPPER_PATTERN.test(text)) continue; // ja contado pelo mapeador, nao duplicar
      const returned = IDENTIFIER_RETURN_PATTERN.exec(text);
      if (returned === null) continue;
      findings.push(`${file.rel}:${number}: returns "${returned[1]}" raw in the response — build the output `
        + 'in the mapper using an allowlist (object literal or projection call)');
    }
  }
  return findings;
}

function fileRawOutputFindings(file) {
  const findings = [];
  for (const { number, text } of file.codeLines) {
    const edge = JSON_EDGE_PATTERN.exec(text);
    if (edge !== null) {
      findings.push(`${file.rel}:${number}: returns "${edge[1]}" raw in the response — build the output `
        + 'in the mapper using an allowlist (object literal or projection call)');
      continue;
    }
    if (RETURN_MAPPER_PATTERN.test(text)) {
      findings.push(`${file.rel}:${number}: returns a raw record — build the output in the mapper using an allowlist`);
    }
  }
  if (file.rel.endsWith('.py')) findings.push(...pythonEdgeFindings(file));
  return findings;
}

/** Rotas registradas no código, em qualquer binding. Normaliza `:hash` e `{hash}` para `{}`. */
function codeRoutes(ctx) {
  const patterns = [
    /\b(?:router|app)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g,
    /@\w*router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g,
  ];
  const routes = new Set();
  for (const file of ctx.code) {
    if (file.isTest || !/^api\//.test(file.rel)) continue;
    const text = codeText(file);
    for (const pattern of patterns) {
      for (const finding of text.matchAll(pattern)) routes.add(normalize(finding[2]));
    }
  }
  return routes;
}

/** Recorta um bloco YAML por nome de chave, devolvendo o texto indentado sob ela. */
function blockOf(yaml, keyPattern) {
  const snippets = [];
  let inside = false;
  let baseIndent = 0;

  for (const line of yaml.split(/\r?\n/)) {
    const indent = line.length - line.trimStart().length;
    if (keyPattern.test(line)) {
      inside = true;
      baseIndent = indent;
      continue;
    }
    if (inside && line.trim() !== '' && indent <= baseIndent) inside = false;
    if (inside) snippets.push(line);
  }
  return snippets.join('\n');
}

/**
 * Texto de tudo que sai numa RESPOSTA — incluindo os schemas de `components` alcançados por
 * `$ref` de dentro de `responses:`. Sem seguir o `$ref`, um campo sensível descrito num schema
 * compartilhado passa despercebido, que é o caso mais comum num contrato bem escrito.
 */
function responseSnippets(yaml) {
  const direct = blockOf(yaml, /^\s*responses:\s*$/);
  const components = blockOf(yaml, /^\s*schemas:\s*$/);
  const referenced = new Set(
    [...direct.matchAll(/#\/components\/schemas\/(\w+)/g)].map((finding) => finding[1]),
  );

  const parts = [direct];
  for (const name of referenced) {
    parts.push(blockOf(components, new RegExp(`^\\s*${name}:\\s*$`)));
  }
  return parts.join('\n');
}

/**
 * Nomes de propriedade declarados em schema de RESPOSTA — as chaves filhas de cada `properties:`.
 *
 * Reusa `responseSnippets`, então schema de REQUISIÇÃO fica de fora de graça: `NovoRegistro` é
 * alcançado por `$ref` de dentro de `requestBody:`, nunca de `responses:`, e não entra no texto.
 *
 * A pilha de recuos existe para o aninhamento (`Erro.erro.codigo`): sem ela, entrar num
 * `properties:` interno perde o escopo externo, e propriedade legítima fica fora do conjunto —
 * vira falso positivo, a direção de erro que esta regra não pode ter.
 */
function allResponseProperties(yaml) {
  const names = new Set();
  const stack = [];

  for (const line of responseSnippets(yaml).split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    while (stack.length > 0 && indent <= stack[stack.length - 1]) stack.pop();
    const key = line.match(/^\s*([A-Za-z_]\w*)\s*:/);
    if (key !== null && stack.length > 0 && indent === stack[stack.length - 1] + 2) {
      names.add(key[1]);
    }
    if (/^\s*properties:\s*$/.test(line)) stack.push(indent);
  }
  return names;
}

/** `servers[0].url` da spec confere com o `basePath` do manifesto. */
function checkServer(ctx, yaml) {
  const expected = ctx.manifest?.basePath ?? null;
  // Manifesto ausente ou sem rotaBase e do `manifest`/`manifest-schema` — nao acusamos duas vezes.
  if (expected === null) return [];
  const declared = specServer(yaml);
  if (declared === null) return ['contract/openapi.yaml does not declare servers[0].url — the module prefix is implicit'];
  if (declared !== expected) {
    return [`contract/openapi.yaml: servers[0].url "${declared}" does not match manifest basePath "${expected}"`];
  }
  return [];
}

/**
 * O verbo do segmento, ou `null`. Compara **palavra inteira** do kebab, nunca substring: por isso
 * `criar-item` e `listar-registros` caem (a palavra `criar` é um token), e `postagens` e
 * `novidades` NÃO caem (`post` e `new` não são token nenhum ali). Substring pegaria os dois.
 */
function verbInSegment(segment) {
  return segment.toLowerCase().split('-').find((word) => FORBIDDEN_VERBS.has(word)) ?? null;
}

/** Cada segmento de um path: verbo proibido, kebab-case, e camelCase dentro de `{}`. */
function checkSegments(route) {
  const findings = [];
  for (const segment of route.split('/').filter((s) => s !== '')) {
    const param = segment.match(/^\{(.*)\}$/);
    const verb = param === null ? verbInSegment(segment) : null;
    if (param !== null && !/^[a-z][A-Za-z0-9]*$/.test(param[1])) {
      findings.push(`route "${route}": parameter "{${param[1]}}" is not camelCase`);
    } else if (verb !== null) {
      findings.push(`route "${route}": segment "${segment}" contains the verb "${verb}" — the action belongs to the HTTP method, not the path`);
    } else if (param === null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)) {
      findings.push(`route "${route}": segment "${segment}" is not lowercase kebab-case`);
    }
  }
  return findings;
}

/**
 * Fim (exclusivo) do trecho que abre em `inicio`, contando profundidade de chaves.
 * `-1` quando o texto acaba sem fechar.
 */
function balancedEnd(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Palavras que têm a FORMA de um sítio de definição sem definir nada — controle de fluxo (JS/PY) e
 * o próprio `return`. A exclusão mora aqui, dentro do reconhecedor único: o sítio nomeado nunca
 * busca controle de fluxo, porque nenhuma dessas palavras casa `PROJECTION_NAME_PATTERN`. Com os dois
 * lados lendo a MESMA lista de candidatos, ela só precisa existir uma vez.
 */
const CONTROL_WORDS = new Set([
  'if', 'for', 'while', 'switch', 'case', 'default', 'catch', 'do', 'else', 'elif', 'try',
  'except', 'finally', 'with', 'return',
]);

/**
 * UM reconhecedor de "sítio de definição", nunca dois: um SÍTIO nomeado (confirmar que um nome
 * casado, `paraGama`, é definição e não referência) e um FECHADOR (achar QUALQUER definição vizinha
 * para fechar a janela) separados podem divergir na fronteira — sítio LARGO (identificador no
 * início de linha lógica, sem olhar o que vem depois) e fechador ESTREITO (exigia `identificador(`
 * depois), por exemplo, faz toda forma que o primeiro aceita e o segundo não virar falso positivo
 * sobre código correto. Consumido nos dois lados a partir da MESMA lista de candidatos, a
 * divergência deixa de ser possível por CONSTRUÇÃO, em vez de precisar ser notada de novo a cada
 * sintaxe nova.
 *
 * Um candidato casa de duas formas, sem olhar o que vem DEPOIS do nome:
 *   - precedido de palavra-chave (`function`/`def`/`const`/`let`/`var`/`class`, com `export`/
 *     `default`/`async` opcionais antes dela);
 *   - identificador no INÍCIO da linha lógica (nada antes dele na linha, além de espaço).
 * A segunda forma é a LARGA: aceita, da mesma maneira, método de objeto/classe (`name(...)`),
 * propriedade-arrow (`name: (...) => ({…})`) e atribuição de módulo em Python
 * (`name = lambda r: {...}`) — é o que fecha a janela também num `name: (...)`. `class` entra na
 * lista de palavras-chave: sem ela, `export class X { … }` é invisível ao reconhecedor, e a janela
 * de uma função de topo ANTES da classe atravessa a declaração inteira sem nada em recuo zero para
 * fechá-la.
 *
 * O guarda de RECUO (na chamadora, `nextDefinitionInIndent`) é o que torna a largura segura: uma
 * chave de objeto devolvido em várias linhas (`hash: registro.hash,`) também casa a forma larga, mas
 * está SEMPRE mais indentada que o sítio que abriu a janela — nunca fecha nada.
 */
const DEFINITION_SITE_PATTERN =
  /^([ \t]*)(?:(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|def|const|let|var|class)\s+)?([A-Za-z_]\w*)/gm;

/** Todo candidato a sítio de definição do arquivo, na ordem em que aparece — a fonte única que
 * `definitionSites` (filtra por NOME) e `nextDefinitionInIndent` (filtra por RECUO) consomem. */
function definitionCandidates(content) {
  const candidates = [];
  for (const m of content.matchAll(DEFINITION_SITE_PATTERN)) {
    const name = m[2];
    if (CONTROL_WORDS.has(name)) continue;
    candidates.push({ index: m.index + m[1].length, indent: m[1].length, name });
  }
  return candidates;
}

/** Só os candidatos cujo NOME casa `padraoNome` (ex.: `PROJECTION_NAME_PATTERN`) — os sítios de
 * DEFINIÇÃO da projeção, nunca uma referência: `registros.map(paraContrato)` nunca é candidato,
 * porque o nome não está no início da linha lógica ali. */
function definitionSites(content, namePattern) {
  const matchesName = new RegExp(namePattern.source);
  return definitionCandidates(content).filter((c) => matchesName.test(c.name));
}

/** `return {`, `return ({` (TS/JS/Python), `=> ({` (arrow com retorno implícito de objeto) ou
 * `lambda ...: {` — o mesmo retorno implícito, forma Python. */
const OBJECT_RETURN_PATTERN = /\breturn\s*\(?\s*\{|=>\s*\(\s*\{|\blambda\b[^:{}]*:\s*\{/g;

/** A próxima definição (qualquer nome) de recuo `<= recuoMaximo`, estritamente depois de
 * `apartirDe`, ou fim do arquivo. */
function nextDefinitionInIndent(content, fromIndex, maxIndent) {
  for (const candidate of definitionCandidates(content)) {
    if (candidate.index <= fromIndex) continue;
    if (candidate.indent <= maxIndent) return candidate.index;
  }
  return content.length;
}

/**
 * O texto de cada projeção, por JANELA + BALANCEAMENTO — não mais "a primeira `{` depois do nome".
 *
 * Para cada sítio de definição, a janela de busca vai do nome até a PRÓXIMA definição de recuo igual
 * ou menor (ou fim do arquivo): não é preciso saber onde a função termina, só que a busca pare antes
 * da definição vizinha — de topo para função de módulo, de método para método de classe. Dentro da
 * janela, cada `return {`/`return ({`/`=> ({` abre uma região balanceada — uma função de projeção com
 * dois `return` (detalhe e resumo) rende DUAS regiões, de propósito.
 *
 * Mata de graça o falso positivo do objeto intermediário (`const interno = { … }` dentro da função):
 * não está em posição de `return` nem de `=>`, então nunca casa `OBJECT_RETURN_PATTERN` — nenhuma
 * guarda nova precisou ser escrita para isso.
 */
function projectionRegions(content, namePattern) {
  const regions = [];
  for (const { index: windowStart, indent: siteIndent } of definitionSites(content, namePattern)) {
    const windowEnd = nextDefinitionInIndent(content, windowStart, siteIndent);
    const window = content.slice(windowStart, windowEnd);
    for (const occurrence of window.matchAll(OBJECT_RETURN_PATTERN)) {
      const opening = windowStart + occurrence.index + occurrence[0].length - 1;
      const end = balancedEnd(content, opening);
      if (end !== -1) regions.push(content.slice(opening, end));
    }
  }
  return regions;
}

/**
 * Chaves de objeto literal devolvidas pela projeção de saída do mapeador, **sem repetir o par
 * (arquivo, chave)**.
 *
 * A mensagem das três consumidoras nomeia arquivo e campo, e mais nada — a região não guarda número
 * de linha. Duas regiões que projetam o mesmo campo produziam, então, a MESMA frase duas vezes, e a
 * segunda não dizia ao autor nada que a primeira já não dissesse: um defeito, uma mensagem. Um
 * mapeador com projeção de detalhe e de resumo publicando o mesmo campo é o caso ordinário disso.
 *
 * Aqui, e não em cada regra: `projectionDivergences` já tem o `vistos` dela; as outras duas
 * teriam de ganhar cópias — três guardas para um dado que nasce duplicado num lugar só.
 */
/** O laco de `achado` isolado do de `projectionKeys` — so por isso o aninhamento cabe no limiar
 * que esta propria regra cobra do codigo do usuario (04-regras.md §4.7). */
function regionKeys(file, region, seen) {
  const keys = [];
  // Chave apos `{` ou `,` — nao apenas no inicio da linha. Objeto escrito numa linha so
  // (`{ hash: x, criado_em: y }`) escaparia inteiro se a extracao exigisse inicio de linha.
  // A regiao COMECA na `{`, entao a primeira chave tem o mesmo delimitador que as demais.
  for (const finding of region.matchAll(/[{,]\s*["']?([A-Za-z_]\w*)["']?\s*:/g)) {
    const pair = `${file.rel}|${finding[1]}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    keys.push({ key: finding[1], arquivo: file.rel });
  }
  return keys;
}

/**
 * O nome de uma função de PROJEÇÃO DE SAÍDA, pela convenção que a doutrina agora exige
 * (02-contrato-e-dados.md §3): começa com `to` seguido de maiúscula (`toContract`, `toMeta`,
 * `toCollection`) em TS/JS, ou `to_` em Python. Direção BANCO fica de fora por CONSTRUÇÃO, não por
 * lista: `rowToDomain`/`domainToRow` têm "To"/"to" no MEIO do nome, nunca no início — `\b` garante
 * que o casador não pare no meio de um identificador maior.
 */
const PROJECTION_NAME_PATTERN = /\bto[A-Z]\w*|\bto_\w+/g;

function projectionKeys(ctx) {
  const seen = new Set();
  const keys = [];
  for (const file of ctx.code) {
    if (file.isTest || !/mapper/i.test(file.rel)) continue;
    for (const region of projectionRegions(codeText(file), PROJECTION_NAME_PATTERN)) {
      keys.push(...regionKeys(file, region, seen));
    }
  }
  return keys;
}

/**
 * Chaves projetadas que nenhum schema de resposta declara. UMA direção só, de propósito.
 *
 * A inversa (propriedade declarada e nunca projetada) parece simétrica e não é: `/health`,
 * `/meta` e `/summary` são montadas pela própria `api/`, e o schema `Erro` pelo tratador de erro —
 * nenhum deles passa pelo mapeador. Cobrá-la daria falso positivo garantido nos três moldes.
 */
function projectionDivergences(projected, declared) {
  const seen = new Set();
  const findings = [];
  for (const { key, arquivo: file } of projected) {
    // Chave fora de camelCase e do `payload-camelcase`. Ela JAMAIS estara no contrato (que fala
    // camelCase por regra), entao acusa-la aqui daria dois erros para um defeito so — e o segundo
    // apontaria para o conserto errado ("declare no contrato" em vez de "renomeie o campo").
    if (!/^[a-z][A-Za-z0-9]*$/.test(key)) continue;
    if (declared.has(key) || seen.has(key)) continue;
    seen.add(key);
    findings.push(`${file}: field "${key}" is projected in the output but is not declared in any openapi.yaml response schema`);
  }
  return findings;
}

/** O laco de `campo` isolado do de `sensitive-in-output.verificar` — mesma tecnica de
 * `regionKeys`, para o aninhamento caber no limiar (04-regras.md §4.7). */
function sensitiveFieldFindingsInLine(file, number, text, sensitive) {
  const findings = [];
  for (const field of sensitive) {
    if (new RegExp(`\\b${field}\\b`).test(text)) {
      findings.push(`${file.rel}:${number}: sensitive field "${field}" is referenced in a log call`);
    }
  }
  return findings;
}

/**
 * `mapper-naming` — a convenção de nome do mapeador (§3, `to*`/
 * `*To*`) tem lei, mas nenhum outro verificador a cobra: `contract-projection`, `payload-camelcase` e
 * `sensitive-in-output` só ENXERGAM função cujo nome já casa `PROJECTION_NAME_PATTERN` — uma função de
 * saída chamada `buildResponse` ou `serialize` nunca é sítio de projeção para as três, e um campo
 * sensível publicado por ela escapa das três, inclusive da que existe para bloquear PII.
 *
 * Esta regra é a fronteira: julga só o NOME de toda função EXPORTADA de nível de módulo num
 * arquivo de mapeador — nunca o conteúdo da projeção (`contract-projection`) nem o caixa
 * (`payload-camelcase`). Por isso não tem heurística: nome bate um dos dois moldes, ou reprova.
 *
 * Método de classe e propriedade de objeto (`chaveDeCache` — casos "metodo de classe que NAO
 * publica" e "propriedade-arrow que NAO publica" de `cases.mjs`)
 * ficam FORA — não são "função exportada", é a classe/objeto que carrega o `export`. É o mesmo
 * limite, já declarado, do extrator de projeção (§7.2): esta regra fecha a lacuna do NOME solto,
 * não a da forma sintática.
 */
const FUNCTION_EXPORT_PATTERN = /^export\s+(?:async\s+)?function\s+([A-Za-z_]\w*)/gm;
const ARROW_CONST_EXPORT_PATTERN = /^export\s+const\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\(/gm;
const PYTHON_DEF_PATTERN = /^def\s+([A-Za-z_]\w*)\s*\(/gm;

/** Nome de SAÍDA (`toContract`/`to_contract`) — mesma âncora de `PROJECTION_NAME_PATTERN`, sem o `\b`
 * global: aqui o nome inteiro já está isolado pela extração, não precisa casar dentro de texto. */
function isOutputName(name) {
  return /^to[A-Z]\w*$/.test(name) || /^to_\w+$/.test(name);
}

/** Nome de conversão de BANCO (`rowToDomain`/`row_to_domain`) — "To"/"_to_" no MEIO do nome, nunca
 * no início (isso já é `isOutputName`). */
function isDatabaseConversionName(name) {
  return /[a-z0-9]To[A-Z]\w*$/.test(name) || (/_to_/.test(name) && !name.startsWith('to_'));
}

/** Toda função EXPORTADA de nível de módulo, num arquivo de mapeador — TS/JS: `export function` e
 * `export const <nome> = (` (arrow); Python: `def <nome>(` no nível zero de recuo, e "exportado" é
 * "público" pela convenção do próprio código-base (prefixo `_` = privado, mesmo critério de
 * `scripts/migrations.py`). Método/propriedade dentro de classe ou objeto nunca casa `^` — a âncora
 * de início de linha já os exclui, porque vêm indentados. */
function mapperExportedFunctions(file) {
  const text = codeText(file);
  const names = [];
  if (file.rel.endsWith('.py')) {
    for (const m of text.matchAll(PYTHON_DEF_PATTERN)) {
      if (!m[1].startsWith('_')) names.push(m[1]);
    }
    return names;
  }
  for (const m of text.matchAll(FUNCTION_EXPORT_PATTERN)) names.push(m[1]);
  for (const m of text.matchAll(ARROW_CONST_EXPORT_PATTERN)) names.push(m[1]);
  return names;
}

export default [
  {
    id: 'contract',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const spec = specOf(ctx);
      if (spec === null) return ['contract/openapi.yaml is missing'];
      // DONA de "spec ilegivel": esta regra ja e a dona de o contrato existir e servir de fonte.
      // Ilegivel e da mesma classe que ausente — o arquivo esta la e nao pode ser usado.
      // UMA mensagem mesmo quando as duas leituras falham: e um defeito so, com um conserto so.
      const failures = failedReads(spec.content);
      if (failures.length > 0) return [unreadableMessage(failures)];
      return REQUIRED
        .filter((route) => !spec.content.includes(`${route}:`))
        .map((route) => `contract/openapi.yaml does not declare the required route "${route}"`);
    },
  },
  {
    id: 'route-naming',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const spec = specOf(ctx);
      // Spec ausente OU ilegivel e do `contract`; acusar aqui tambem so duplica o mesmo defeito.
      if (spec === null) return [];

      // Silencio SEPARADO por secao: `servers:` ilegivel nao cega a checagem de nome das rotas,
      // que so depende de `paths:`. Silenciar as duas juntas jogaria fora verificacao que da para
      // fazer — e o gate so deve deixar de verificar o que realmente nao conseguiu ler.
      const failures = failedReads(spec.content);
      const findings = failures.includes('servers') ? [] : checkServer(ctx, spec.content);
      if (failures.includes('paths')) return findings;
      return findings.concat([...specRoutes(spec.content)].flatMap(checkSegments));
    },
  },
  {
    id: 'synchronized-contract',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const spec = specOf(ctx);
      // Spec ausente OU com `paths:` ilegivel e do `contract`. Sem este silencio, uma spec que o
      // leitor nao alcanca faria esta regra AFIRMAR que toda rota do codigo falta no contrato —
      // falsidade, nao cegueira. So `paths:` importa aqui: `servers:` nao entra na comparacao.
      if (spec === null || failedReads(spec.content).includes('paths')) return [];
      const inSpec = new Set([...specRoutes(spec.content)].map(normalize));
      const routesInCode = codeRoutes(ctx);

      // Nao achar rota nenhuma nao e conformidade — e cegueira. Dizer isso em voz alta e o que
      // impede a regra de "passar" num framework cujo registro de rota ela nao sabe ler.
      if (routesInCode.size === 0) {
        const hasApi = ctx.code.some((a) => !a.isTest && /^api\//.test(a.rel));
        return hasApi
          ? ['could not extract routes from the code — this rule did NOT verify anything in this module']
          : [];
      }

      const findings = [];
      for (const route of routesInCode) {
        if (!inSpec.has(route)) findings.push(`route "${route}" exists in the code but not in contract/openapi.yaml`);
      }
      for (const route of inSpec) {
        if (!routesInCode.has(route)) findings.push(`route "${route}" exists in contract/openapi.yaml but not in the code`);
      }
      return findings;
    },
  },
  {
    id: 'contract-projection',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const spec = specOf(ctx);
      // Spec ausente OU com `paths:` ilegivel e do `contract`; acusar aqui so duplica o defeito.
      // Sem isto, spec que o leitor nao alcanca zera `declaradas` e a regra acusaria TODO campo
      // projetado. Os schemas de resposta vivem dentro de `paths:`; `servers:` nao afeta isto.
      if (spec === null || failedReads(spec.content).includes('paths')) return [];

      const projected = projectionKeys(ctx);
      const hasMapper = ctx.code.some((a) => !a.isTest && /mapper/i.test(a.rel));
      if (projected.length === 0) {
        return hasMapper
          ? ['could not extract a projection from the mapper — this rule did NOT verify anything in this module']
          : [];
      }

      const declared = allResponseProperties(spec.content);
      if (declared.size === 0) {
        return ['could not extract a response-schema property from openapi.yaml — this rule did NOT verify anything in this module'];
      }
      return projectionDivergences(projected, declared);
    },
  },
  {
    id: 'payload-camelcase',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const findings = [];
      for (const { key, arquivo: file } of projectionKeys(ctx)) {
        if (!/^[a-z][A-Za-z0-9]*$/.test(key)) {
          findings.push(`${file}: field "${key}" in the projection is not camelCase — the contract uses camelCase`);
        }
      }
      const spec = specOf(ctx);
      if (spec === null) return findings;
      for (const finding of responseSnippets(spec.content).matchAll(/^\s{6,}([a-z_][\w]*)\s*:\s*\{\s*type:/gm)) {
        if (/_/.test(finding[1])) {
          findings.push(`contract/openapi.yaml: response property "${finding[1]}" is snake_case — use camelCase`);
        }
      }
      return findings;
    },
  },
  {
    id: 'sensitive-output',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const sensitive = ctx.manifest?.sensitiveFields ?? [];
      const spec = specOf(ctx);
      if (sensitive.length === 0 || spec === null) return [];
      const response = responseSnippets(spec.content);
      return sensitive
        .filter((field) => new RegExp(`\\b${field}\\b`).test(response))
        .map((field) => `sensitive field "${field}" appears in an openapi.yaml response schema`);
    },
  },
  {
    id: 'sensitive-in-output',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const sensitive = new Set(ctx.manifest?.sensitiveFields ?? []);
      if (sensitive.size === 0) return [];
      const findings = [];

      for (const { key, arquivo: file } of projectionKeys(ctx)) {
        if (sensitive.has(key)) {
          findings.push(`${file}: sensitive field "${key}" appears in the output projection — omit it or publish a masked value`);
        }
      }
      // O logger REDIGE por nome; citar o campo direto numa chamada de log burla a redacao.
      for (const file of ctx.code) {
        if (file.isTest) continue;
        for (const { number, text } of file.codeLines) {
          if (!LOG_CALL_VERBS.test(text)) continue;
          findings.push(...sensitiveFieldFindingsInLine(file, number, text, sensitive));
        }
      }
      return findings;
    },
  },
  {
    id: 'mapper-naming',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const findings = [];
      for (const file of ctx.code) {
        if (file.isTest || !/mapper/i.test(file.rel)) continue;
        for (const name of mapperExportedFunctions(file)) {
          if (isOutputName(name) || isDatabaseConversionName(name)) continue;
          findings.push(`${file.rel}: exported function "${name}" does not follow the mapper naming convention `
            + '(output: to<Something>/to_<something>; database: <something>To<Something>/<something>_to_<something>) — '
            + 'rename it or move it out of the mapper');
        }
      }
      return findings;
    },
  },
  {
    id: 'exported-summary',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      // UMA direcao so, como `contract-projection`: `false` nao proibe nada. O modulo que nao entra
      // no dashboard pode ter `total` no `/summary` dele sem que isso seja defeito de coisa alguma.
      if (ctx.manifest?.exportsSummary !== true) return [];

      const spec = specOf(ctx);
      // Spec ausente OU com `paths:` ilegivel e do `contract`. Sem este silencio, "nao consegui ler"
      // viraria "nao declara" — afirmar ausencia do que nao se leu manda apagar o que esta certo.
      if (spec === null || failedReads(spec.content).includes('paths')) return [];

      const declared = responseProperties(spec.content, '/summary', 'get', '200');
      // `/summary` ausente da spec e do `contract`, que ja a cobra como rota obrigatoria.
      if (declared === null || declared.has('total')) return [];
      return ['exportsSummary: true, but the GET /summary 200 schema does not declare "total" — the cross-module aggregator '
        + 'composes results without a fixed module list and only understands the minimum shape. Declare integer "total" '
        + 'in the /summary response, or set exportsSummary to false'];
    },
  },
  {
    id: 'input-allowlist',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      // A simetrica da `raw-output`, na direcao da ENTRADA (02-contrato-e-dados §3.2: "allowlist de
      // campos — payload com campo desconhecido e rejeitado, nao ignorado").
      //
      // NAO proibe o corpo de ser passado adiante: o molde faz `criar(req.body as unknown, ...)`, e
      // a funcao chamada e justamente quem aplica a allowlist. Proibir a passagem acusaria o codigo
      // CORRETO. O que se proibe e o corpo virar entidade sem passar por ninguem — as tres formas
      // em que isso acontece.
      const patterns = [
        // 1. Espalhar o corpo dentro de um objeto/entidade: `{ ...req.body }`, `{**corpo}`.
        /\{\s*\*{2}\s*(?:req(?:uest)?\.)?(?:body|corpo)\b|\.{3}\s*(?:req(?:uest)?\.)?(?:body|corpo)\b/,
        // 2. Corpo direto ao repositorio: `repositorio.inserir(req.body)`.
        /\b(?:repositorio|repository|repo)\.\w+\(\s*(?:req(?:uest)?\.)?(?:body|corpo)\s*[,)]/,
        // 3. Atribuicao em massa sobre uma entidade ja existente.
        /Object\.assign\([^,)]+,\s*(?:req(?:uest)?\.)?(?:body|corpo)\b/,
      ];
      const findings = [];
      for (const file of ctx.code) {
        if (file.isTest) continue;
        for (const { number, text } of file.codeLines) {
          if (patterns.some((pattern) => pattern.test(text))) {
            findings.push(`${file.rel}:${number}: the request body becomes an entity without an allowlist`
              + ' — build the input field by field and reject unknown fields instead of ignoring them');
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'raw-output',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const findings = [];
      for (const file of ctx.code) {
        if (file.isTest) continue;
        findings.push(...fileRawOutputFindings(file));
      }
      return findings;
    },
  },
];
