/**
 * spec.mjs — leitura do `contract/openapi.yaml`. Lei dona: specs/arquitetura/04-regras.md
 *
 * Vive fora de `rules/` porque DUAS famílias precisam dela: `Contrato` verifica a spec contra o
 * código do próprio módulo, e `Isolamento` (`consumes-contract`) verifica a spec do módulo DONO
 * contra o `consumes` de quem depende dele. Copiar o leitor para o segundo lugar faria a família
 * Isolamento divergir da Contrato sem ninguém notar — exatamente o defeito que o gate existe
 * para impedir.
 *
 * Como context.mjs, não toca o disco: recebe o texto (ou o contexto já montado) e devolve dado.
 */

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Equipara `:hash`, `{hash}` e `{id}` — a spec e o código nomeiam o parâmetro de jeitos diferentes. */
export function normalize(path) {
  return path.replace(/:[A-Za-z_]\w*/g, '{}').replace(/\{[^}]+\}/g, '{}');
}

/** O arquivo de contrato do módulo, ou `null` se ele não tiver. */
export function specOf(ctx) {
  return ctx.files.find((a) => a.rel === 'contract/openapi.yaml') ?? null;
}

/**
 * Mapa `caminho -> Set(MÉTODO)` do bloco `paths:`. Caminho é chave de recuo 2; método, de recuo 4.
 * Guardamos o caminho CRU (não normalizado) porque a mensagem de erro precisa citar o que está
 * escrito na spec, não uma forma canônica que o autor nunca digitou.
 */
export function specOperations(yaml) {
  const operations = new Map();
  let current = null;

  for (const line of insideOf(yaml, /^paths:\s*$/)) {
    const route = line.match(/^\s{2}(\/[^:\s]*):\s*$/);
    if (route !== null) {
      current = route[1];
      operations.set(current, new Set());
      continue;
    }
    const method = line.match(/^\s{4}([a-z]+):\s*$/);
    if (method !== null && current !== null && METHODS.includes(method[1])) {
      operations.get(current).add(method[1].toUpperCase());
    }
  }
  return operations;
}

/** Caminhos declarados sob `paths:`. */
export function specRoutes(yaml) {
  return new Set(specOperations(yaml).keys());
}

/**
 * `servers[0].url` — o prefixo em que o módulo atende. `null` se a spec não declarar.
 *
 * É aqui que o prefixo mora, e NÃO nas chaves de `paths:`: a spec declara `/api/v1/<module>` em
 * `servers` e os paths saem dele relativos (`/health`). Procurar `/api/v1/` no path reprovaria
 * todo contrato conforme.
 */
export function specServer(yaml) {
  let insideFirst = false;

  for (const line of insideOf(yaml, /^servers:\s*$/)) {
    const startsItem = /^\s*-(\s|$)/.test(line);
    // Só o PRIMEIRO item: `servers[0]` é o que a regra compara. Ao ver o segundo traço, para —
    // senão um servidor alternativo (staging, mock) responderia pelo prefixo do módulo.
    if (startsItem && insideFirst) return null;
    if (startsItem) insideFirst = true;
    if (!insideFirst) continue;

    // `url:` em QUALQUER linha do item, não só na do traço: `- description: local` seguido de
    // `  url: …` é bloco YAML ordinário, e exigir a URL no traço reprovava contrato correto.
    const matched = line.match(/^\s*(?:-\s*)?url:\s*(.+?)\s*$/);
    if (matched !== null) return withoutQuotes(matched[1]);
  }
  return null;
}

/** `"/api/v1/x"` e `'/api/v1/x'` são o mesmo valor que `/api/v1/x` — a aspa é sintaxe, não dado. */
function withoutQuotes(value) {
  return value.replace(/^(['"])([\s\S]*)\1$/, '$2');
}

/**
 * Quais leituras a spec declara e o leitor de bloco NÃO conseguiu fazer: `['paths']`,
 * `['servers']`, as duas, ou `[]` quando está tudo legível.
 *
 * O critério é verificável, não adivinhado: a seção existe no texto e a extração devolveu nada.
 * Não tentamos reconhecer *flow style* por sintaxe — tentamos ler, e concluímos pelo resultado.
 * Assim qualquer forma que o leitor não alcance cai aqui, não só a que previmos.
 *
 * Devolve QUAIS, e não um booleano, por duas razões: a mensagem precisa nomear a seção certa
 * (dizer "reescreva em bloco" para quem já está em bloco deixa o autor sem saída), e a regra que
 * só depende de `paths:` pode continuar verificando quando o ilegível é o `servers:`.
 *
 * Existe para que as regras parem de afirmar AUSÊNCIA quando a verdade é "não consegui ler".
 * Afirmar falsidade é pior que declarar cegueira: manda o autor apagar o que está certo.
 */
export function failedReads(yaml) {
  const failures = [];
  if (/^\s*paths\s*:/m.test(yaml) && specOperations(yaml).size === 0) failures.push('paths');
  if (/^\s*servers\s*:/m.test(yaml) && specServer(yaml) === null) failures.push('servers');
  return failures;
}

/**
 * Nomes de propriedade que o schema de UM status de UMA operação declara — seguindo `$ref` para
 * `components.schemas`. `null` quando a rota não está declarada (ou o leitor não a alcançou);
 * `Set` vazio quando ela existe e não declara propriedade nenhuma.
 *
 * Distinguir `null` de vazio é a diferença entre cegueira e ausência: rota inexistente é defeito da
 * regra `contract`, e afirmá-la aqui seria acusar duas vezes o mesmo — pior, com o conserto errado.
 *
 * Existe porque a leitura do ARQUIVO INTEIRO responde outra pergunta ("este nome sai em ALGUMA
 * resposta?") e aprovaria por acidente quem precisa cobrar a forma de UMA rota.
 */
export function responseProperties(yaml, route, method, status) {
  const routeSection = routeLines(yaml, route);
  if (routeSection === null) return null;
  const responseBlock = subBlock(
    subBlock(routeSection, new RegExp(`^\\s*${method.toLowerCase()}:\\s*$`)),
    new RegExp(`^\\s*['"]?${status}['"]?\\s*:\\s*$`),
  );
  const blocks = [responseBlock, ...schemaRefs(responseBlock).map((n) => componentSchema(yaml, n))];
  // Um Set por bloco, unidos no fim: concatenar as linhas antes de contar misturaria os recuos de
  // blocos independentes, e a pilha de `propertyNames` perderia o escopo de cada um.
  return new Set(blocks.flatMap((lines) => [...propertyNames(lines)]));
}

/** `/registros/{hash}` tem `{`, e a rota entra em `RegExp` — escapar é o que impede o literal virar sintaxe. */
function asLiteral(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Os codigos de status declarados em `responses:` de UMA operacao — as chaves de recuo mais fundo
 * sob `get:`/`post:`/etc., nao importa a que profundidade `responses:` mora (mesmo truque de
 * `responseProperties`: procura o PADRAO em vez de exigir o caminho exato ate ele — um `parameters:`
 * antes de `responses:` nao muda nada). `null` quando a rota/metodo nao existe — mesma semantica de
 * `responseProperties`, para o chamador nao confundir "nao declarado" com "declarado sem status".
 *
 * Escrita para `tools/contract-compatible.mjs` comparar RESPOSTA por status entre duas specs —
 * sem isto, ele teria que adivinhar quais status comparar, ou reescrever este parser.
 */
export function operationStatus(yaml, route, method) {
  const routeSection = routeLines(yaml, route);
  if (routeSection === null) return null;
  const methodBlock = subBlock(routeSection, new RegExp(`^\\s*${method.toLowerCase()}:\\s*$`));
  const codes = new Set();
  for (const line of methodBlock) {
    const matched = line.match(/^\s*['"]?(\d{3}|default)['"]?\s*:\s*$/);
    if (matched !== null) codes.add(matched[1]);
  }
  return codes;
}

/**
 * Os nomes em `required:` de UM schema — flow (`required: [a, b]`) ou bloco (`required:` seguido de
 * `- a` em linhas indentadas). Generaliza porque a mesma forma serve para qualquer lista escalar sob
 * uma chave; hoje so `requestRequired` a usa, mas o parser nao e especifico de `required`.
 */
function listValues(lines, key) {
  const flow = lines.find((l) => new RegExp(`^\\s*${key}:\\s*\\[[^\\]]*\\]\\s*$`).test(l));
  if (flow !== undefined) {
    const inside = flow.match(/\[([^\]]*)\]/)[1];
    return inside.split(',').map((v) => withoutQuotes(v.trim())).filter((v) => v !== '');
  }
  const block = subBlock(lines, new RegExp(`^\\s*${key}:\\s*$`));
  return block
    .map((l) => l.match(/^\s*-\s*(.+?)\s*$/))
    .filter((m) => m !== null)
    .map((m) => withoutQuotes(m[1]));
}

/**
 * Os campos OBRIGATORIOS do corpo de UMA requisicao — `required:` do schema em `requestBody`,
 * seguindo `$ref` como `responseProperties` ja faz para a resposta. `Set` vazio quando a
 * rota/metodo existe e nao tem `requestBody` (nada pode ser obrigatorio onde nao ha corpo — GET, por
 * exemplo); `null` so quando a propria rota/metodo nao existe.
 *
 * A direcao da compatibilidade AQUI e invertida em relacao a resposta, e por isso o leitor nao
 * reaproveita `responseProperties` como esta: aquele diz "todo nome presente", que basta para
 * resposta (campo novo e aditivo); para requisicao o que importa e so o SUBCONJUNTO obrigatorio —
 * campo opcional novo na entrada nao quebra ninguem, so o obrigatorio quebra. `requestBody: {
 * required: true, ... }` e um BOOLEANO da OpenAPI (o corpo inteiro e obrigatorio) e nao uma lista —
 * o regex de `listValues` exige colchete ou bloco `- item`, entao essa linha nao casa nunca.
 */
export function requestRequired(yaml, route, method) {
  const routeSection = routeLines(yaml, route);
  if (routeSection === null) return null;
  const methodBlock = subBlock(routeSection, new RegExp(`^\\s*${method.toLowerCase()}:\\s*$`));
  const bodyBlock = subBlock(methodBlock, /^\s*requestBody:\s*$/);
  if (bodyBlock.length === 0) return new Set();

  const blocks = [bodyBlock, ...schemaRefs(bodyBlock).map((n) => componentSchema(yaml, n))];
  const required = new Set();
  for (const block of blocks) {
    for (const name of listValues(block, 'required')) required.add(name);
  }
  return required;
}

/** As linhas de UMA rota dentro de `paths:` — dela até a próxima chave de recuo 2.
 * `null` se a rota não aparece, para o chamador não confundir "não declarada" com "sem conteúdo".
 */
function routeLines(yaml, route) {
  const lines = [];
  const opens = new RegExp(`^\\s{2}${asLiteral(route)}:\\s*$`);
  let inside = false;
  let found = false;

  for (const line of insideOf(yaml, /^paths:\s*$/)) {
    if (/^\s{2}\S/.test(line)) {
      if (inside) break;
      inside = opens.test(line);
      found = found || inside;
      continue;
    }
    if (inside) lines.push(line);
  }
  return found ? lines : null;
}

/** As linhas indentadas sob a PRIMEIRA chave que casa o padrão, dentro de um conjunto de linhas. */
function subBlock(lines, keyPattern) {
  const block = [];
  let baseIndent = null;

  for (const line of lines) {
    if (baseIndent === null) {
      if (keyPattern.test(line)) baseIndent = indentOf(line);
      continue;
    }
    if (line.trim() !== '' && indentOf(line) <= baseIndent) break;
    block.push(line);
  }
  return block;
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

/** Os schemas de `components` que o bloco referencia por `$ref`. */
function schemaRefs(lines) {
  return [...lines.join('\n').matchAll(/#\/components\/schemas\/(\w+)/g)].map((finding) => finding[1]);
}

/** As linhas de `components.schemas.<name>`. */
function componentSchema(yaml, name) {
  const schemas = subBlock(insideOf(yaml, /^components:\s*$/), /^\s*schemas:\s*$/);
  return subBlock(schemas, new RegExp(`^\\s*${asLiteral(name)}:\\s*$`));
}

/**
 * As chaves filhas de cada `properties:` do bloco. A pilha de recuos existe pelo aninhamento: sem
 * ela, entrar num `properties:` interno perderia o escopo externo e deixaria propriedade legítima
 * de fora do conjunto.
 */
function propertyNames(lines) {
  const names = new Set();
  const stack = [];

  for (const line of lines) {
    if (line.trim() === '') continue;
    const indent = indentOf(line);
    while (stack.length > 0 && indent <= stack[stack.length - 1]) stack.pop();
    const key = line.match(/^\s*([A-Za-z_]\w*)\s*:/);
    if (key !== null && stack.length > 0 && indent === stack[stack.length - 1] + 2) names.add(key[1]);
    if (/^\s*properties:\s*$/.test(line)) stack.push(indent);
  }
  return names;
}

/** As linhas do bloco de uma chave de recuo zero — dela até a próxima chave de recuo zero. */
function insideOf(yaml, keyPattern) {
  const lines = [];
  let inside = false;

  for (const line of yaml.split(/\r?\n/)) {
    if (keyPattern.test(line)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (/^\S/.test(line)) break;
    lines.push(line);
  }
  return lines;
}
