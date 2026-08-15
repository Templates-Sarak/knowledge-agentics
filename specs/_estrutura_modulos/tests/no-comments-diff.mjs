#!/usr/bin/env node
/**
 * no-comments-diff.mjs — a prova mecânica de que uma limpeza de comentário não muda uma linha de
 * código executável: recebe a árvore de REFERÊNCIA (o commit gravado antes do primeiro comentário
 * removido) e a árvore ATUAL, e para todo arquivo de código presente dos DOIS lados exige
 * `textoDeCodigo(referência) === textoDeCodigo(atual)`, byte a byte. Diferença de um byte reprova,
 * nomeando arquivo e linha — não há "diferença aceitável" aqui, exceto a que está declarada na
 * CATRACA (ver mais abaixo).
 *
 *   node tests/no-comments-diff.mjs                    compara a árvore atual contra a linha de base
 *   node tests/no-comments-diff.mjs --gravar-linha-base grava o commit ATUAL (HEAD) como referência —
 *                                                        só faz sentido ANTES do primeiro comentário
 *                                                        tocado; escrita depois não tem contra o que
 *                                                        comparar. NÃO REGRAVAR para "resolver" uma
 *                                                        mudança de código autorizada — isso invalida
 *                                                        a prova para TUDO o mais que já foi comparado.
 *                                                        A saída para código autorizado é a CATRACA
 *                                                        (`no-comments-exceptions.json`)
 *   node tests/no-comments-diff.mjs --autoteste         prova o núcleo com fixtures em memória,
 *                                                        inclusive a contraprova por reversão
 *
 * A REFERÊNCIA É UM COMMIT, NÃO UMA SEGUNDA PASTA: `git show <commit>:<caminho>` lê o conteúdo
 * pristino direto do objeto git, sem precisar manter um segundo clone em disco — mesmo precedente de
 * `affected.mjs`/`contract-compatible.mjs` (`execFileSync('git', ...)`). A linha de base é gravada
 * ANTES do primeiro comentário removido: o hash do HEAD naquele momento, guardado em
 * `no-comments-baseline.json`.
 *
 * A CATRACA DE EXCEÇÃO DECLARADA (`no-comments-exceptions.json`, mesma disciplina de
 * `citation-baseline.json`): uma limpeza de comentário pode vir acompanhada de mudança de código de
 * VERDADE, autorizada por decisão explícita — e este próprio instrumento precisa estar registrado em
 * `run-all-selftests.mjs` para não virar `--autoteste` órfão. O instrumento não pode ficar cego a
 * mudanças autorizadas, mas também não pode deixar de nomeá-las: cada entrada da catraca nomeia
 * ARQUIVO + O QUE AUTORIZOU + O QUE MUDOU, é impressa à parte (nunca escondida) e o conjunto é EXATO
 * nos dois sentidos — arquivo que diverge sem entrada REPROVA (mudança sem autorização), entrada cujo
 * arquivo não diverge mais TAMBÉM reprova (exceção morta, a mesma poda que `citation-baseline.json`
 * já faz para achado resolvido).
 *
 * A EXCEÇÃO É POR IMPRESSÃO DIGITAL, NÃO POR ARQUIVO: autorizar por ARQUIVO cegaria o arquivo daí em
 * diante — uma vez que um arquivo tivesse uma entrada, QUALQUER mudança de código futura nele
 * passaria em silêncio, porque a catraca só perguntaria "existe entrada para este caminho?", nunca
 * "esta mudança específica é a que foi autorizada?". Cada entrada guarda `hashCodigo`: o hash de
 * `textoDeCodigo` do arquivo NO MOMENTO da autorização. Três estados, não dois: hash atual bate com o
 * da entrada → autorizada; não bate com o hash da entrada NEM com o hash da REFERÊNCIA → REPROVA, é
 * mudança nova sem autorização; hash atual volta a bater com a REFERÊNCIA → exceção morta (o arquivo
 * não diverge mais, já coberto por `mortas`). O hash é de `textoDeCodigo` (código sem comentário) —
 * comentário editado depois da autorização não invalida o hash, porque não muda o que ele mede.
 *
 * O QUE CONTA COMO "CÓDIGO": todo arquivo cuja extensão está em `ESTILOS_POR_EXTENSAO` — as três
 * sintaxes de comentário de linha que este template usa (`//` em TS/JS, `#` em Python, `--` em SQL)
 * mais bloco `/* *\/` e docstring Python `'''`/`"""`. Doutrina e skills (`.md`) ficam FORA — não são
 * código, e a regra que rege a edição delas é legível sem citação de plano, não esta. `.json` também
 * fica fora: não tem sintaxe de comentário nesta base.
 *
 * ARQUIVO REMOVIDO NÃO REPROVA: este arquivo só compara o que existe nos DOIS lados — remoção e
 * adição aparecem como informativo, nunca como falha.
 *
 * NÚCLEO × CASCA, precedente de `verify-map.mjs`/`affected.mjs`: `linhasDeCodigo`, `textoDeCodigo`,
 * `primeiraDivergencia`, `compararArquivo`, `compararArvore` e `reconciliarExcecoes` são puras —
 * nenhuma toca `fs` nem `child_process`. A CASCA só lê (disco, `git show` e a catraca) e escreve
 * (`--gravar-linha-base`).
 *
 * MESMA EXTRAÇÃO DE `gate/context.mjs:extrairLinhasDeCodigo` — copiada, não importada: este
 * arquivo mora em `tests/`, fora do alcance de `tools/gate/`, mesmo motivo de `verify-citations.mjs:
 * classificarLinhas`. A cópia é da REGRA (o que conta como comentário — lei dona: `specs/arquitetura/
 * 04-regras.md` §7.2), não da fonte de verdade. Estendida em DOIS eixos que o original não tinha:
 *
 *   1. despacho por extensão (TS/JS/Python continuam exatamente com a regra de sempre, SQL ganha o
 *      `--` que `EXT_CODIGO` de `context.mjs` nunca precisou);
 *   2. reconhecimento de cerca de docstring POSICIONAL, não por contagem de delimitador. O original
 *      testava `['"""', "'''"].find(d => limpa.includes(d))` — numa linha com OS DOIS delimitadores
 *      (`GERADOR_INDICE = '''"""texto"""`, `init_repo.py:35`), isso escolhe `"""` (achado primeiro no
 *      ARRAY, não no TEXTO), conta a PARIDADE do `"""` sozinho — que dá par nessa linha — e decide
 *      "não abre", quando quem abre de verdade é o `'''`. O fechamento real, adiante no arquivo, então
 *      é lido como uma ABERTURA nova, e tudo depois vira "comentário" até o fim do arquivo: 57 de 496
 *      linhas visíveis, falso verde sobre um identificador de comportamento mutado
 *      (`MARCADOR_HOOK_NOSSO`). A extração correta varre a linha por POSIÇÃO: com cerca fechada, o
 *      delimitador que aparece mais à ESQUERDA no texto é quem abre; o outro tipo, se aparecer depois,
 *      é dado dentro do que já abriu — nunca um segundo evento.
 *
 * CERCA QUE NUNCA FECHA NÃO PASSA EM SILÊNCIO: se o arquivo termina com uma cerca aberta,
 * `linhasDeCodigo` devolve isso explicitamente (`cercaAberta`) e `compararArquivo` REPROVA nomeando o
 * arquivo e a linha que abriu — nunca descarta o resto do arquivo calado. Essa categoria nunca passa
 * pela catraca: cerca sem fechar não é uma mudança de código para autorizar, é o sinal de que a
 * extração (ou o arquivo) tem um problema real.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, readFileSync, readdirSync, writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const RAIZ_TEMPLATE = resolve(AQUI, '..');
const RAIZ_BASE = resolve(RAIZ_TEMPLATE, '..', '..');
const CAMINHO_LINHA_BASE = join(AQUI, 'no-comments-baseline.json');
const CAMINHO_EXCECOES = join(AQUI, 'no-comments-exceptions.json');

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha até a marca "CASCA" toca `fs` nem `child_process`.
// ================================================================================================

/**
 * Estilo de comentário por extensão. `linha` é o(s) prefixo(s) de comentário de LINHA;
 * `blocoAsterisco` liga o bloco `/* *\/` (e, só na família JS, a linha órfã que começa com `*`,
 * continuação de bloco JSDoc — mesma tolerância de `gate/context.mjs`); `docstringPython` liga a
 * cerca `'''`/`"""`.
 */
const ESTILOS_POR_EXTENSAO = {
  '.ts': { linha: ['//'], blocoAsterisco: true, docstringPython: false },
  '.tsx': { linha: ['//'], blocoAsterisco: true, docstringPython: false },
  '.js': { linha: ['//'], blocoAsterisco: true, docstringPython: false },
  '.jsx': { linha: ['//'], blocoAsterisco: true, docstringPython: false },
  '.mjs': { linha: ['//'], blocoAsterisco: true, docstringPython: false },
  '.cjs': { linha: ['//'], blocoAsterisco: true, docstringPython: false },
  '.py': { linha: ['#'], blocoAsterisco: false, docstringPython: true },
  '.sql': { linha: ['--'], blocoAsterisco: false, docstringPython: false },
};

const DELIMITADORES_DOCSTRING = ['"""', "'''"];

function extensaoDe(caminho) {
  const ponto = caminho.lastIndexOf('.');
  return ponto === -1 ? '' : caminho.slice(ponto).toLowerCase();
}

/** Só arquivo de extensão conhecida entra na comparação — o resto (`.md`, `.json`, `.yaml`, …) não
 * tem sintaxe de comentário declarada aqui e fica fora por definição, não por descuido. */
export function extensaoSuportada(caminho) {
  return Object.hasOwn(ESTILOS_POR_EXTENSAO, extensaoDe(caminho));
}

/**
 * Avança o reconhecimento de cerca de docstring por UMA linha, a partir do estado (`cercaInicial`,
 * `null` ou o delimitador aberto) com que a linha começou. POSICIONAL: com a cerca fechada, procura os
 * DOIS delimitadores e usa o que aparece mais à ESQUERDA no texto — nunca "o primeiro do array" nem "a
 * paridade de um delimitador sozinho" (ver o cabeçalho do arquivo). Com a cerca aberta, só o
 * delimitador QUE ABRIU fecha; o outro tipo, se aparecer no meio, é dado, nunca um evento de cerca —
 * docstring Python não aninha.
 *
 * Devolve `{ cerca, tocouCerca }`: `cerca` é o estado ao FIM da linha (`null` ou o delimitador ainda
 * aberto); `tocouCerca` é `true` sempre que a linha teve qualquer evento de cerca — entrar já aberta,
 * abrir, fechar, ou permanecer aberta — porque uma linha assim é DESCARTADA inteira (mesma regra
 * conservadora de `gate/context.mjs`: "linha com cerca de texto é descartada inteira", mesmo quando o
 * delimitador fecha e reabre no meio, caso `x = """abc"""` — fixture (c) do revisor).
 */
export function avancarCerca(limpa, cercaInicial) {
  let cerca = cercaInicial;
  let pos = 0;
  let tocouCerca = cercaInicial !== null;
  for (;;) {
    if (cerca === null) {
      const indices = DELIMITADORES_DOCSTRING
        .map((delimitador) => ({ delimitador, indice: limpa.indexOf(delimitador, pos) }))
        .filter((c) => c.indice !== -1);
      if (indices.length === 0) break;
      const proximo = indices.reduce((a, b) => (a.indice <= b.indice ? a : b));
      cerca = proximo.delimitador;
      pos = proximo.indice + 3;
      tocouCerca = true;
    } else {
      const iFecha = limpa.indexOf(cerca, pos);
      if (iFecha === -1) { pos = limpa.length; break; }
      cerca = null;
      pos = iFecha + 3;
      tocouCerca = true;
    }
  }
  return { cerca, tocouCerca };
}

/**
 * O texto do arquivo sem comentário nem docstring, como `{ linhas, cercaAberta }`. `linhas` é uma
 * lista de `{ numero, texto }` — `numero` é a linha 1-based do ORIGINAL, preservada para o relatório
 * apontar `arquivo:linha` de verdade mesmo depois de linhas de comentário serem descartadas.
 * `cercaAberta` é `null` quando o arquivo termina com toda cerca fechada; senão
 * `{ delimitador, linha }`, a linha onde a cerca que sobrou ABRIU — nunca silencioso (item (d) da
 * revisão D1): um arquivo que termina em cerca aberta é sinal de problema, não comentário comum.
 *
 * `{ linhas: null, cercaAberta: null }` quando a extensão não tem estilo declarado (a CASCA já filtra
 * antes de chegar aqui; o núcleo não assume isso e devolve em vez de estourar).
 */
export function linhasDeCodigo(conteudo, caminho) {
  const estilo = ESTILOS_POR_EXTENSAO[extensaoDe(caminho)];
  if (estilo === undefined) return { linhas: null, cercaAberta: null };

  const linhas = [];
  let emBloco = false;
  let cerca = null;
  let linhaDeAbertura = null;
  let linhaDeAberturaBloco = null;

  conteudo.split(/\r?\n/).forEach((texto, indice) => {
    const limpa = texto.trim();
    if (estilo.docstringPython) {
      const cercaAntes = cerca;
      const resultado = avancarCerca(limpa, cerca);
      cerca = resultado.cerca;
      if (cercaAntes === null && cerca !== null) linhaDeAbertura = indice + 1;
      if (cerca === null) linhaDeAbertura = null;
      if (resultado.tocouCerca) return;
    }
    if (emBloco) {
      if (limpa.includes('*/')) { emBloco = false; linhaDeAberturaBloco = null; }
      return;
    }
    if (limpa.startsWith('/*')) {
      if (!limpa.includes('*/')) { emBloco = true; linhaDeAberturaBloco = indice + 1; }
      return;
    }
    if (estilo.linha.some((prefixo) => limpa.startsWith(prefixo))) return;
    if (estilo.blocoAsterisco && limpa.startsWith('*')) return;
    linhas.push({ numero: indice + 1, texto });
  });

  // Mesma guarda dos dois lados: docstring Python tem `cerca`; bloco `/* */` da família JS tem
  // `emBloco`. Um arquivo termina com QUALQUER UM aberto é o mesmo problema — "cerca de texto que
  // nunca fecha" —, e a revisão D1 já provou que "extração que se perde e segue calada" é falso
  // verde. `emBloco` nunca fica `true` ao mesmo tempo que `cerca !== null` (um estilo só liga um dos
  // dois — `docstringPython` XOR `blocoAsterisco`/`/* */`), então as duas checagens não colidem.
  const cercaAberta = cerca !== null ? { delimitador: cerca, linha: linhaDeAbertura }
    : (emBloco ? { delimitador: '/*', linha: linhaDeAberturaBloco } : null);
  return { linhas, cercaAberta };
}

/** O texto de código juntado por `\n` — o que compara byte a byte. Mesma forma de `gate/text.mjs:
 * textoDeCodigo`: preserva os padrões ancorados por linha (`^`), NÃO preserva numeração (por isso
 * `linhasDeCodigo` guarda `numero` à parte, para o relatório). */
export function textoDeCodigo(linhas) {
  return linhas.map((linha) => linha.texto).join('\n');
}

/** O hash de `textoDeCodigo` de um lado — a impressão digital que a catraca guarda por entrada.
 * SHA-256, determinístico: mesmo texto, mesmo hash, sempre — é matemática pura sobre a
 * string, não toca `fs`/`child_process`/relógio. */
export function hashDeTexto(texto) {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

/** A primeira linha de CÓDIGO (não comentário) onde `antes` e `depois` divergem — `null` quando as
 * duas sequências de texto são idênticas. Cobre também divergência de TAMANHO (linha de código
 * acrescentada ou removida no meio do que deveria ser só corte de comentário): a linha que falta de
 * um lado aparece como `'(linha ausente)'`, e o número relatado é o do lado que ainda tem linha ali. */
export function primeiraDivergencia(linhasAntes, linhasDepois) {
  const total = Math.max(linhasAntes.length, linhasDepois.length);
  for (let indice = 0; indice < total; indice += 1) {
    const antes = linhasAntes[indice];
    const depois = linhasDepois[indice];
    if ((antes?.texto ?? null) === (depois?.texto ?? null)) continue;
    return {
      linha: depois?.numero ?? antes?.numero ?? null,
      antes: antes?.texto ?? '(linha ausente)',
      depois: depois?.texto ?? '(linha ausente)',
    };
  }
  return null;
}

/**
 * O veredito de UM arquivo. Três formas:
 *   `{ ok: true, caminho }`                                            código idêntico
 *   `{ ok: false, tipo: 'cerca-aberta', caminho, linha, motivo }`      cerca de comentário — docstring
 *                                                                       Python OU bloco `/* *\/` da
 *                                                                       família JS — nunca fecha de um
 *                                                                       dos dois lados. Nunca passa
 *                                                                       pela catraca (não é uma
 *                                                                       mudança de código para
 *                                                                       autorizar, é problema)
 *   `{ ok: false, tipo: 'codigo-mudou', caminho, linha, antes, depois,
 *      hashReferencia, hashAtual }`                                    a primeira linha divergente,
 *                                                                       nomeada e localizada — mais o
 *                                                                       hash de cada lado, o que a
 *                                                                       catraca casa por IMPRESSÃO
 *                                                                       DIGITAL, não por arquivo
 * Extensão sem estilo declarado é `ok` por vacuidade — a CASCA nunca deveria oferecer um desses aqui,
 * mas núcleo puro não confia, testa.
 */
export function compararArquivo(caminho, conteudoAntes, conteudoDepois) {
  const antes = linhasDeCodigo(conteudoAntes, caminho);
  const depois = linhasDeCodigo(conteudoDepois, caminho);
  if (antes.linhas === null || depois.linhas === null) return { ok: true, caminho };

  const ladoComCercaAberta = antes.cercaAberta !== null ? { lado: 'REFERÊNCIA', cerca: antes.cercaAberta }
    : (depois.cercaAberta !== null ? { lado: 'ATUAL', cerca: depois.cercaAberta } : null);
  if (ladoComCercaAberta !== null) {
    return {
      ok: false,
      tipo: 'cerca-aberta',
      caminho,
      linha: ladoComCercaAberta.cerca.linha,
      motivo: `cerca de comentário ${JSON.stringify(ladoComCercaAberta.cerca.delimitador)} abre e nunca `
        + `fecha até o fim do arquivo (lado ${ladoComCercaAberta.lado})`,
    };
  }

  const textoAntes = textoDeCodigo(antes.linhas);
  const textoDepois = textoDeCodigo(depois.linhas);
  if (textoAntes === textoDepois) return { ok: true, caminho };
  const divergencia = primeiraDivergencia(antes.linhas, depois.linhas);
  return {
    ok: false,
    tipo: 'codigo-mudou',
    caminho,
    linha: divergencia.linha,
    antes: divergencia.antes,
    depois: divergencia.depois,
    hashReferencia: hashDeTexto(textoAntes),
    hashAtual: hashDeTexto(textoDepois),
  };
}

/**
 * O veredito da ÁRVORE inteira. `antesPorCaminho`/`atualPorCaminho` são `Map<caminho, conteudo>`.
 * `divergentes`: arquivo presente dos dois lados cujo código mudou (ou cuja cerca não fecha) — o que
 * reprova, antes da catraca. `removidos`: arquivo que a referência tinha e o atual não tem mais —
 * informativo, remoção declarada não é código mudado. `novos`: arquivo que só existe no
 * atual — informativo, sem "antes" contra o que comparar.
 */
export function compararArvore(antesPorCaminho, atualPorCaminho) {
  const comuns = [...antesPorCaminho.keys()].filter((c) => atualPorCaminho.has(c)).sort();
  const removidos = [...antesPorCaminho.keys()].filter((c) => !atualPorCaminho.has(c)).sort();
  const novos = [...atualPorCaminho.keys()].filter((c) => !antesPorCaminho.has(c)).sort();
  const resultados = comuns.map((c) => compararArquivo(c, antesPorCaminho.get(c), atualPorCaminho.get(c)));
  return {
    divergentes: resultados.filter((r) => r.ok === false),
    removidos,
    novos,
    comparados: comuns.length,
  };
}

/**
 * A CATRACA — reconcilia `divergentes` (só os de `tipo: 'codigo-mudou'`, cada um já com `hashAtual`;
 * `cerca-aberta` nunca chega aqui, ver o cabeçalho do arquivo) contra `no-comments-exceptions.json`.
 * Mesma disciplina de `verify-citations.mjs:compararComLinhaBase`, mas o conjunto tem de ser EXATO nos
 * dois sentidos, não só "achado novo reprova".
 *
 * CASADA POR HASH, NÃO POR ARQUIVO — autorizar por ARQUIVO cegaria o arquivo dali em diante, porque
 * a pergunta seria só "existe entrada para este caminho?". A pergunta é "existe entrada cujo
 * `hashCodigo` bate com o `hashAtual` desta divergência?" —
 * `semExcecao` é o acidente (código mudou para um estado que NENHUMA entrada autorizou, mesmo que o
 * arquivo já tenha outra entrada para uma mudança ANTERIOR); `mortas` é a exceção cujo arquivo voltou
 * a bater com a referência (não diverge mais) — sem podar isso, a catraca vira uma lista que só cresce
 * e para de significar "autorizado", igual uma citação nunca resolvida em `citation-baseline.json`.
 * `autorizadas` é informativo: sempre impressa, nunca escondida.
 */
export function reconciliarExcecoes(divergentes, excecoes) {
  const arquivosDivergentes = new Set(divergentes.map((d) => d.caminho));
  const autorizadas = [];
  const semExcecao = [];
  for (const d of divergentes) {
    const bateComAlgumaEntrada = excecoes.some((e) => e.arquivo === d.caminho && e.hashCodigo === d.hashAtual);
    (bateComAlgumaEntrada ? autorizadas : semExcecao).push(d);
  }
  return {
    semExcecao,
    autorizadas,
    mortas: excecoes.filter((e) => !arquivosDivergentes.has(e.arquivo)),
  };
}

// ================================================================================================
// CASCA — toca disco e `child_process`. Nomeado por O QUE toca.
// ================================================================================================

// Mesmo conjunto de `gate/context.mjs:NAO_PERCORRER` — cache de linter/runner e artefato de build
// nunca são "código do template", e um objeto git nunca contém `node_modules` de qualquer forma;
// o filtro aqui protege o lado ATUAL (disco), que pode ter essas pastas geradas localmente.
const IGNORAR = new Set([
  'node_modules', '.git', '.turbo', 'dist', 'build', 'coverage', 'generated',
  '__pycache__', '.venv', 'venv', '.pytest_cache', '.ruff_cache', '.mypy_cache',
  '.eslintcache', '.vite', '.next',
]);

/** Remove BOM e normaliza CRLF → LF — mesma defesa de `gate/context.mjs:lerTexto`. Sem isto, um
 * checkout Windows com `core.autocrlf=true` faria toda linha do lado ATUAL divergir do lado
 * REFERÊNCIA só por quebra de linha, e o diff acusaria "código mudou" onde só o EOL mudou. */
function normalizar(conteudo) {
  return conteudo.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function git(args) {
  return execFileSync('git', args, { cwd: RAIZ_BASE, encoding: 'utf8' });
}

function caminhoTemSegmentoIgnorado(caminhoRelativo) {
  return caminhoRelativo.split('/').some((segmento) => IGNORAR.has(segmento));
}

/** Varre o disco a partir de `RAIZ_BASE`, devolvendo `Map<caminhoRelativo, conteudo>` de todo
 * arquivo de extensão suportada — o lado ATUAL da comparação. */
function arvoreAtual() {
  const mapa = new Map();
  const pilha = [RAIZ_BASE];
  while (pilha.length > 0) {
    const pasta = pilha.pop();
    for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
      if (IGNORAR.has(entrada.name)) continue;
      const caminho = join(pasta, entrada.name);
      if (entrada.isDirectory()) {
        pilha.push(caminho);
        continue;
      }
      if (!extensaoSuportada(entrada.name)) continue;
      const rel = relative(RAIZ_BASE, caminho).split('\\').join('/');
      mapa.set(rel, normalizar(readFileSync(caminho, 'utf8')));
    }
  }
  return mapa;
}

/** Lê a árvore de um commit pelo objeto git — `Map<caminhoRelativo, conteudo>` de todo arquivo de
 * extensão suportada rastreado ali. O lado REFERÊNCIA da comparação. */
function arvoreNoCommit(commit) {
  const listagem = git(['ls-tree', '-r', '--name-only', commit]);
  const caminhos = listagem.split('\n')
    .filter((linha) => linha !== '')
    .filter((caminho) => extensaoSuportada(caminho) && !caminhoTemSegmentoIgnorado(caminho));
  const mapa = new Map();
  for (const caminho of caminhos) {
    mapa.set(caminho, normalizar(git(['show', `${commit}:${caminho}`])));
  }
  return mapa;
}

/** Lê `no-comments-baseline.json` — `null` quando ausente ou sem `commit` (estado inválido: rode
 * `--gravar-linha-base` antes de comparar). */
function commitDeReferencia() {
  if (!existsSync(CAMINHO_LINHA_BASE)) return null;
  const bruto = JSON.parse(readFileSync(CAMINHO_LINHA_BASE, 'utf8').replace(/^\uFEFF/, ''));
  return bruto.commit ?? null;
}

/** Lê `no-comments-exceptions.json` — ausente é lista vazia (mesma disciplina de
 * `config/conformidade.json`: começar vazio é o estado correto). */
function lerExcecoes() {
  if (!existsSync(CAMINHO_EXCECOES)) return [];
  const bruto = JSON.parse(readFileSync(CAMINHO_EXCECOES, 'utf8').replace(/^\uFEFF/, ''));
  return bruto.excecoes ?? [];
}

/** Grava o HEAD atual como referência — decisão EXPLÍCITA, só quando `--gravar-linha-base` está no
 * argv. Só faz sentido rodar isto UMA VEZ, antes do primeiro comentário tocado; rodar de novo depois
 * de editar comentário move a régua e o critério de aceite perde o sentido. Para uma mudança de
 * código AUTORIZADA (inclusive o registro deste próprio arquivo em `run-all-selftests.mjs`), a saída
 * é a catraca (`no-comments-exceptions.json`), nunca regravar isto. */
function gravarLinhaBase() {
  const commit = git(['rev-parse', 'HEAD']).trim();
  const conteudo = {
    _comentario: 'Commit de REFERÊNCIA do no-comments-diff — a árvore ANTES do primeiro comentário '
      + 'removido por uma limpeza de comentário. Gravado uma única vez, com '
      + '--gravar-linha-base; regravar depois de já ter editado comentário invalida a prova (a '
      + 'ferramenta passaria a comparar a árvore editada contra ela mesma). Mudança de código '
      + 'AUTORIZADA (inclusive o registro deste arquivo em run-all-selftests.mjs) se declara em '
      + 'no-comments-exceptions.json, nunca regravando isto.',
    commit,
  };
  writeFileSync(CAMINHO_LINHA_BASE, `${JSON.stringify(conteudo, null, 2)}\n`, 'utf8');
  process.stdout.write(`\ngravado: commit ${commit} como linha de base em `
    + `${relative(RAIZ_BASE, CAMINHO_LINHA_BASE).split('\\').join('/')}\n`);
}

function formatarDivergencia(d) {
  if (d.tipo === 'cerca-aberta') {
    return `  ${d.caminho}:${d.linha ?? '?'}\n      ${d.motivo}\n`;
  }
  return `  ${d.caminho}:${d.linha ?? '?'}\n`
    + `      antes : ${JSON.stringify(d.antes)}\n`
    + `      depois: ${JSON.stringify(d.depois)}\n`;
}

function formatarExcecao(e) {
  return `  ${e.arquivo} — Bloco ${e.bloco}: ${e.oQueMudou}\n`;
}

function rodarComparacao() {
  const commit = commitDeReferencia();
  if (commit === null) {
    process.stderr.write('no-comments-baseline.json ausente ou sem commit — rode primeiro:\n'
      + '  node tests/no-comments-diff.mjs --gravar-linha-base\n');
    return 1;
  }

  const antes = arvoreNoCommit(commit);
  const atual = arvoreAtual();
  const {
    divergentes, removidos, novos, comparados,
  } = compararArvore(antes, atual);

  const cercaQuebrada = divergentes.filter((d) => d.tipo === 'cerca-aberta');
  const mudancasDeCodigo = divergentes.filter((d) => d.tipo === 'codigo-mudou');
  const excecoes = lerExcecoes();
  const { semExcecao, autorizadas, mortas } = reconciliarExcecoes(mudancasDeCodigo, excecoes);

  if (removidos.length > 0) {
    process.stdout.write(`\n=== removido(s) desde a linha de base (${removidos.length}) — informativo, `
      + 'remoção declarada não reprova ===\n');
    for (const r of removidos) process.stdout.write(`  ${r}\n`);
  }
  if (novos.length > 0) {
    process.stdout.write(`\n=== novo(s) desde a linha de base (${novos.length}) — informativo, sem `
      + '"antes" contra o que comparar ===\n');
    for (const n of novos) process.stdout.write(`  ${n}\n`);
  }
  if (autorizadas.length > 0) {
    process.stdout.write(`\n=== mudança de código AUTORIZADA pela catraca (${autorizadas.length}) — `
      + 'informativo, declarada em no-comments-exceptions.json ===\n');
    for (const a of autorizadas) process.stdout.write(formatarDivergencia(a));
  }
  if (cercaQuebrada.length > 0) {
    process.stdout.write(`\n=== CERCA DE COMENTÁRIO NUNCA FECHA (${cercaQuebrada.length}) — docstring `
      + "Python ou bloco /* */, nunca passa pela catraca ===\n");
    for (const d of cercaQuebrada) process.stdout.write(formatarDivergencia(d));
  }
  if (semExcecao.length > 0) {
    process.stdout.write(`\n=== CÓDIGO MUDOU SEM EXCEÇÃO — não é só comentário (${semExcecao.length}) `
      + '===\n');
    for (const d of semExcecao) process.stdout.write(formatarDivergencia(d));
  }
  if (mortas.length > 0) {
    process.stdout.write(`\n=== EXCEÇÃO MORTA — declarada mas o arquivo não diverge mais `
      + `(${mortas.length}) ===\n`);
    for (const e of mortas) process.stdout.write(formatarExcecao(e));
  }

  const reprova = cercaQuebrada.length > 0 || semExcecao.length > 0 || mortas.length > 0;
  process.stdout.write(reprova
    ? `\nno-comments-diff: REPROVADO — ${cercaQuebrada.length} cerca(s) quebrada(s), `
      + `${semExcecao.length} sem exceção, ${mortas.length} exceção(ões) morta(s)\n`
    : `\nno-comments-diff: OK — ${comparados} arquivo(s) comparado(s) contra ${commit}, `
      + `${autorizadas.length} autorizada(s) pela catraca, zero mudança de código sem explicação\n`);
  return reprova ? 1 : 0;
}

// ================================================================================================
// AUTOTESTE — núcleo puro contra fixtures em memória, sem tocar disco nem `child_process`.
// ================================================================================================

function casosDeAutoteste() {
  return [
    // linhasDeCodigo — as três sintaxes de comentário de linha. A extração só reconhece comentário de
    // LINHA INTEIRA (a linha, aparada, começa com o prefixo) — mesma regra de `gate/context.mjs:
    // extrairLinhasDeCodigo`: comentário à direita do código (`codigo; // nota`) fica DENTRO da linha
    // de código, não é removido. É herdado, não uma lacuna nova desta ferramenta — e é conservador na
    // direção certa: se um comentário à direita for tocado, a linha inteira diverge e REPROVA, nunca
    // passa em silêncio. Os fixtures abaixo usam comentário em linha própria, a forma predominante
    // nesta base e a que os Blocos BB-BF de fato editam.
    { nome: 'linhasDeCodigo: TS remove linha de comentario "//" propria e mantem o codigo', fn: () => {
      const r = linhasDeCodigo('// era assim\nconst a = 1;\nconst b = 2;', 'x.ts');
      return textoDeCodigo(r.linhas) === 'const a = 1;\nconst b = 2;' && r.cercaAberta === null;
    } },
    { nome: 'linhasDeCodigo: Python remove linha de comentario "#" propria e mantem o codigo', fn: () => {
      const r = linhasDeCodigo('# nota\nvalor = 1\noutro = 2', 'x.py');
      return textoDeCodigo(r.linhas) === 'valor = 1\noutro = 2' && r.cercaAberta === null;
    } },
    { nome: 'linhasDeCodigo: SQL remove comentario "--" e mantem o codigo', fn: () => {
      const r = linhasDeCodigo('-- comentario solto\nCREATE TABLE x (id int);', 'x.sql');
      return textoDeCodigo(r.linhas) === 'CREATE TABLE x (id int);';
    } },
    // bloco /* */ e docstring — a outra sintaxe
    { nome: 'linhasDeCodigo: bloco /* */ de varias linhas some inteiro (TS)', fn: () => {
      const r = linhasDeCodigo('const a = 1;\n/* bloco\n   de varias\n   linhas */\nconst b = 2;', 'x.ts');
      return textoDeCodigo(r.linhas) === 'const a = 1;\nconst b = 2;';
    } },
    { nome: 'linhasDeCodigo: docstring Python de varias linhas some inteiro', fn: () => {
      const py = 'def f():\n    """\n    explica f\n    """\n    return 1';
      const r = linhasDeCodigo(py, 'x.py');
      return textoDeCodigo(r.linhas) === 'def f():\n    return 1' && r.cercaAberta === null;
    } },
    { nome: 'linhasDeCodigo: SQL nao reconhece docstring Python (aspas triplas sao dado, nao cerca)', fn: () => {
      const r = linhasDeCodigo("SELECT '\"\"\"' AS x;", 'x.sql');
      return textoDeCodigo(r.linhas) === "SELECT '\"\"\"' AS x;";
    } },
    // fronteira entre familias — um prefixo de uma sintaxe nao risca codigo de outra
    { nome: 'linhasDeCodigo: "--" no INICIO de linha em TS e codigo real (decremento), nao comentario', fn: () => {
      const r = linhasDeCodigo('--contador;', 'x.ts');
      return textoDeCodigo(r.linhas) === '--contador;';
    } },
    { nome: 'linhasDeCodigo: "#" no INICIO de linha em TS (campo privado) e codigo real, nao comentario', fn: () => {
      const r = linhasDeCodigo('#segredo = 1;', 'x.ts');
      return textoDeCodigo(r.linhas) === '#segredo = 1;';
    } },
    // extensaoSuportada
    { nome: 'extensaoSuportada: .ts/.py/.sql sim, .md/.json nao', fn: () => (
      extensaoSuportada('a.ts') && extensaoSuportada('a.py') && extensaoSuportada('a.sql')
      && !extensaoSuportada('a.md') && !extensaoSuportada('a.json')
    ) },

    // ============================================================================================
    // D1 — cerca de docstring POSICIONAL, os quatro fixtures exigidos pela revisão
    // ============================================================================================
    { nome: 'D1(a): "X = \'\'\'\\"\\"\\"algo\\"\\"\\"" abre a cerca \'\'\' (o \'\'\' vem antes na linha, nao o """)', fn: () => {
      const r = linhasDeCodigo('X = \'\'\'"""algo"""\ndeveria_sumir = 1', 'x.py');
      return r.cercaAberta !== null && r.cercaAberta.delimitador === "'''" && r.cercaAberta.linha === 1
        && r.linhas.length === 0;
    } },
    { nome: 'D1(b): "X = \\"\\"\\"\'\'\'algo\'\'\'" abre a cerca """ (simetrico ao (a))', fn: () => {
      const r = linhasDeCodigo('X = """\'\'\'algo\'\'\'\ndeveria_sumir = 1', 'x.py');
      return r.cercaAberta !== null && r.cercaAberta.delimitador === '"""' && r.cercaAberta.linha === 1
        && r.linhas.length === 0;
    } },
    { nome: 'D1(c): \'x = """abc"""\' fecha na mesma linha — nao deixa cerca aberta, mas a linha some (regra conservadora)', fn: () => {
      const r = linhasDeCodigo('x = """abc"""\ncodigo_real = 1', 'x.py');
      return r.cercaAberta === null && textoDeCodigo(r.linhas) === 'codigo_real = 1';
    } },
    { nome: 'D1(d): cerca aberta ate o EOF NUNCA passa em silencio — linhasDeCodigo reporta cercaAberta com a linha que abriu', fn: () => {
      const r = linhasDeCodigo("a = 1\nB = '''nunca fecha\nresto do arquivo", 'x.py');
      return r.cercaAberta !== null && r.cercaAberta.delimitador === "'''" && r.cercaAberta.linha === 2;
    } },
    { nome: 'D1(d): compararArquivo REPROVA a cerca aberta, tipo cerca-aberta, nomeando a linha que abriu — nunca ok:true', fn: () => {
      const r = compararArquivo('x.py', 'a = 1', "a = 1\nB = '''nunca fecha\nresto");
      return r.ok === false && r.tipo === 'cerca-aberta' && r.linha === 2;
    } },
    { nome: 'D1 regressao real (init_repo.py:35 GERADOR_INDICE): mistura \'\'\'/""" na MESMA linha nao rouba o resto do arquivo', fn: () => {
      const py = "GERADOR_INDICE = '''\"\"\"gerar_indice.py\"\"\"\nimport os\n'''\nCODIGO_REAL = 2";
      const r = linhasDeCodigo(py, 'x.py');
      return r.cercaAberta === null && textoDeCodigo(r.linhas) === 'CODIGO_REAL = 2';
    } },
    { nome: 'D1 regressao real (scaffold_skill.py:150 return f\'\'\'"""): mesmo padrao mutado em outra forma (f-string) nao rouba o resto', fn: () => {
      const py = "def g():\n    return f'''\"\"\"\n    conteudo\n    \"\"\"\n'''\nCODIGO_REAL = 3";
      const r = linhasDeCodigo(py, 'x.py');
      return r.cercaAberta === null && textoDeCodigo(r.linhas).includes('CODIGO_REAL = 3')
        && textoDeCodigo(r.linhas).includes('def g():');
    } },

    // ============================================================================================
    // A guarda de cerca aberta cobre a docstring Python E o bloco `/* */` da família JS — sem esta
    // simetria, um bloco `/* */` aberto até o EOF na família JS passaria batido.
    // ============================================================================================
    { nome: 'bloco /* */ aberto ate o EOF (familia JS) tambem reporta cercaAberta, simetrico a docstring', fn: () => {
      const r = linhasDeCodigo('const a=1;\n/* nunca fecha\nconst b=2;', 'x.mjs');
      return r.cercaAberta !== null && r.cercaAberta.delimitador === '/*' && r.cercaAberta.linha === 2
        && textoDeCodigo(r.linhas) === 'const a=1;';
    } },
    { nome: 'compararArquivo REPROVA o bloco /* */ aberto, tipo cerca-aberta, nomeando a linha que abriu', fn: () => {
      const r = compararArquivo('x.mjs', 'const a=1;', 'const a=1;\n/* nunca fecha\nconst b=2;');
      return r.ok === false && r.tipo === 'cerca-aberta' && r.linha === 2;
    } },
    { nome: 'bloco /* */ que FECHA normalmente nao deixa cercaAberta (nao regrediu o caso comum)', fn: () => {
      const r = linhasDeCodigo('const a=1;\n/* fecha\n   normal */\nconst b=2;', 'x.mjs');
      return r.cercaAberta === null && textoDeCodigo(r.linhas) === 'const a=1;\nconst b=2;';
    } },

    // compararArquivo — o caso central: so comentario mudou
    { nome: 'compararArquivo: texto do comentario mudou (linha propria) -> ok', fn: () => (
      compararArquivo('x.ts', '// era assim\nconst a = 1;', '// agora e assado\nconst a = 1;').ok === true
    ) },
    { nome: 'compararArquivo: comentario REMOVIDO por completo (o caso de uso real do plano) -> ok', fn: () => (
      compararArquivo('x.ts', '// nota\nconst a = 1;\nconst b = 2;', 'const a = 1;\nconst b = 2;').ok === true
    ) },
    // CONTRAPROVA POR REVERSAO — verde que nao sabe ficar vermelho nao provou nada
    { nome: 'CONTRAPROVA: identificador mudou dentro de arquivo que so deveria ter perdido comentario -> REPROVA nomeando a linha', fn: () => {
      const r = compararArquivo('x.ts', '// nota\nconst total = 1;\nreturn total;', 'const soma = 1;\nreturn total;');
      return r.ok === false && r.tipo === 'codigo-mudou' && r.linha === 1
        && r.antes === 'const total = 1;' && r.depois === 'const soma = 1;';
    } },
    { nome: 'CONTRAPROVA: linha de codigo REMOVIDA junto do comentario -> REPROVA nomeando a linha certa', fn: () => {
      const r = compararArquivo('x.py', 'a = 1\n# nota\nb = 2\nc = 3', 'a = 1\nc = 3');
      return r.ok === false && r.tipo === 'codigo-mudou' && r.linha === 2 && r.antes === 'b = 2' && r.depois === 'c = 3';
    } },
    // compararArvore — remocao e adicao sao informativas, nunca reprovam
    { nome: 'compararArvore: arquivo removido (so no lado antes) -> informativo, nao reprova, nao entra em comparados', fn: () => {
      const r = compararArvore(new Map([['x.ts', 'const a = 1;']]), new Map());
      return r.divergentes.length === 0 && r.removidos.length === 1 && r.removidos[0] === 'x.ts' && r.comparados === 0;
    } },
    { nome: 'compararArvore: arquivo novo (so no lado atual) -> informativo, nao reprova, nao entra em comparados', fn: () => {
      const r = compararArvore(new Map(), new Map([['y.ts', 'const a = 1;']]));
      return r.divergentes.length === 0 && r.novos.length === 1 && r.novos[0] === 'y.ts' && r.comparados === 0;
    } },
    { nome: 'compararArvore: arquivo presente dos dois lados com codigo mudado -> entra em divergentes', fn: () => {
      const r = compararArvore(
        new Map([['x.ts', 'const a = 1;']]),
        new Map([['x.ts', 'const a = 2;']]),
      );
      return r.divergentes.length === 1 && r.divergentes[0].caminho === 'x.ts' && r.comparados === 1;
    } },
    { nome: 'compararArvore: um arquivo so-comentario ao lado de um arquivo com codigo mudado -> so o segundo reprova', fn: () => {
      const r = compararArvore(
        new Map([['a.ts', '// nota\nconst x = 1;'], ['b.ts', 'const y = 1;']]),
        new Map([['a.ts', 'const x = 1;'], ['b.ts', 'const y = 2;']]),
      );
      return r.divergentes.length === 1 && r.divergentes[0].caminho === 'b.ts' && r.comparados === 2;
    } },
    // primeiraDivergencia
    { nome: 'primeiraDivergencia: sequencias identicas -> null', fn: () => (
      primeiraDivergencia([{ numero: 1, texto: 'a' }], [{ numero: 1, texto: 'a' }]) === null
    ) },
    { nome: 'primeiraDivergencia: acha a PRIMEIRA linha que diverge, nao a ultima', fn: () => {
      const d = primeiraDivergencia(
        [{ numero: 1, texto: 'a' }, { numero: 2, texto: 'b' }, { numero: 4, texto: 'c' }],
        [{ numero: 1, texto: 'a' }, { numero: 2, texto: 'X' }, { numero: 4, texto: 'Y' }],
      );
      return d.linha === 2 && d.antes === 'b' && d.depois === 'X';
    } },

    // ============================================================================================
    // D2 — a CATRACA de exceção declarada
    // ============================================================================================
    { nome: 'reconciliarExcecoes: hash atual bate com o hash da entrada -> autorizada, nao reprova', fn: () => {
      const divergentes = [{ caminho: 'a.py', tipo: 'codigo-mudou', hashAtual: 'hash-x' }];
      const excecoes = [{ arquivo: 'a.py', bloco: 'BF', oQueMudou: 'caminho corrigido', hashCodigo: 'hash-x' }];
      const r = reconciliarExcecoes(divergentes, excecoes);
      return r.semExcecao.length === 0 && r.autorizadas.length === 1 && r.mortas.length === 0;
    } },
    { nome: 'reconciliarExcecoes: arquivo diverge SEM entrada nenhuma -> semExcecao (o acidente que a catraca pega)', fn: () => {
      const r = reconciliarExcecoes([{ caminho: 'a.py', tipo: 'codigo-mudou', hashAtual: 'hash-x' }], []);
      return r.semExcecao.length === 1 && r.autorizadas.length === 0 && r.mortas.length === 0;
    } },
    { nome: 'reconciliarExcecoes: entrada autorizada mas o arquivo NAO diverge mais -> exececao MORTA, reprova', fn: () => {
      const r = reconciliarExcecoes([], [{ arquivo: 'a.py', bloco: 'BF', oQueMudou: 'caminho corrigido', hashCodigo: 'hash-x' }]);
      return r.mortas.length === 1 && r.semExcecao.length === 0 && r.autorizadas.length === 0;
    } },
    { nome: 'reconciliarExcecoes: mistura — um autorizado (hash bate), um sem excecao, uma morta, todos ao mesmo tempo', fn: () => {
      const divergentes = [
        { caminho: 'autorizado.py', tipo: 'codigo-mudou', hashAtual: 'hash-a' },
        { caminho: 'acidente.ts', tipo: 'codigo-mudou', hashAtual: 'hash-b' },
      ];
      const excecoes = [
        { arquivo: 'autorizado.py', bloco: 'BF', oQueMudou: 'x', hashCodigo: 'hash-a' },
        { arquivo: 'ja-nao-diverge.py', bloco: 'BG', oQueMudou: 'y', hashCodigo: 'hash-c' },
      ];
      const r = reconciliarExcecoes(divergentes, excecoes);
      return r.autorizadas.length === 1 && r.autorizadas[0].caminho === 'autorizado.py'
        && r.semExcecao.length === 1 && r.semExcecao[0].caminho === 'acidente.ts'
        && r.mortas.length === 1 && r.mortas[0].arquivo === 'ja-nao-diverge.py';
    } },
    // Exceção por ARQUIVO cegaria o arquivo daí em diante — por isso a catraca casa por HASH.
    { nome: 'arquivo TEM entrada, mas o hash atual NAO bate com o hash da entrada NEM com a referencia -> semExcecao, REPROVA (o defeito que a catraca por arquivo escondia)', fn: () => {
      const divergentes = [{ caminho: 'verify-citations.mjs', tipo: 'codigo-mudou', hashAtual: 'hash-mutado-de-novo' }];
      const excecoes = [{ arquivo: 'verify-citations.mjs', bloco: 'X', oQueMudou: 'mudanca autorizada anterior', hashCodigo: 'hash-autorizado-anterior' }];
      const r = reconciliarExcecoes(divergentes, excecoes);
      return r.semExcecao.length === 1 && r.semExcecao[0].caminho === 'verify-citations.mjs' && r.autorizadas.length === 0;
    } },
    { nome: 'DUAS entradas no mesmo arquivo, de autorizacoes diferentes — hash atual bate com QUALQUER uma das duas -> autorizada', fn: () => {
      const divergentes = [{ caminho: 'run-all-selftests.mjs', tipo: 'codigo-mudou', hashAtual: 'hash-da-segunda' }];
      const excecoes = [
        { arquivo: 'run-all-selftests.mjs', bloco: 'X', oQueMudou: 'x', hashCodigo: 'hash-da-primeira' },
        { arquivo: 'run-all-selftests.mjs', bloco: 'Y', oQueMudou: 'y', hashCodigo: 'hash-da-segunda' },
      ];
      const r = reconciliarExcecoes(divergentes, excecoes);
      return r.autorizadas.length === 1 && r.semExcecao.length === 0;
    } },
    // hashDeTexto
    { nome: 'hashDeTexto: determinístico — mesmo texto, mesmo hash', fn: () => (
      hashDeTexto('const a = 1;') === hashDeTexto('const a = 1;')
    ) },
    { nome: 'hashDeTexto: textos diferentes, hashes diferentes', fn: () => (
      hashDeTexto('const a = 1;') !== hashDeTexto('const a = 2;')
    ) },
    // compararArquivo carrega hashReferencia/hashAtual reais (não fixture) para codigo-mudou
    { nome: 'compararArquivo: codigo-mudou carrega hashReferencia e hashAtual, diferentes entre si', fn: () => {
      const r = compararArquivo('x.ts', 'const a = 1;', 'const a = 2;');
      return r.hashReferencia === hashDeTexto('const a = 1;') && r.hashAtual === hashDeTexto('const a = 2;')
        && r.hashReferencia !== r.hashAtual;
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
  process.stdout.write(`\nautoteste (no-comments-diff): ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

function principal() {
  const argv = process.argv.slice(2);
  if (argv.includes('--autoteste')) return rodarAutoteste();
  if (argv.includes('--gravar-linha-base')) {
    gravarLinhaBase();
    return 0;
  }
  return rodarComparacao();
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal();
}
