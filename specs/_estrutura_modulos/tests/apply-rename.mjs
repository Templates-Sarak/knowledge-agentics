#!/usr/bin/env node
/**
 * apply-rename.mjs — aplica o inventário fechado (`rename-inventory.json`) como substituição de
 * texto, mas só onde a ocorrência é CAMINHO ou IDENTIFICADOR DE IMPORT — nunca onde é PROSA nem
 * identificador nu. Existe porque a rodada 1 (substituição de token inteiro sem distinção de
 * contexto) corrompeu prosa portuguesa; a rodada 2 (REFAZER) corrigiu contexto/tipo mas ainda
 * corrompeu quatro classes novas, cada uma medida pelo revisor contra o resultado da rodada 2:
 *
 *   node tests/apply-rename.mjs --fase AD.1 --relatorio                dry-run: só o relatório
 *   node tests/apply-rename.mjs --fase AD.1 --aplicar                  escreve, e imprime o relatório
 *   node tests/apply-rename.mjs --fase AD.1 --relatorio --gravar-recusas   grava as recusas atuais
 *       como novo baseline em `rename-refusals.json` — decisão explícita, nunca automática (Bloco AI)
 *   node tests/apply-rename.mjs --fase AD.1 --diferencial <arvore>     confere contra clone pristino
 *   node tests/apply-rename.mjs --autoteste                            prova o núcleo com fixtures
 *
 * A FRONTEIRA entre `--diferencial` e o artefato de recusas (`rename-refusals.json`, Bloco AI do
 * plan-3.md) é a fronteira entre duas perguntas diferentes, cada uma com o seu artefato — juntá-las
 * num relatório só foi o que permitiu ao AD.1 declarar "0 suspeitas" com um defeito dentro:
 *   - `--diferencial` prova NÃO CORROMPEU: nenhum token novo apareceu onde não devia (falso
 *     POSITIVO — prosa portuguesa que virou inglês por engano). Só olha linha que MUDOU no diff.
 *   - o artefato de recusas prova NÃO ESQUECEU: toda vez que o motor decidiu "isto pode não devesse
 *     mudar, decida você" (RECUSADO-*), alguém de fato decidiu — em vez de a recusa morrer no
 *     stdout do terminal de quem rodou o comando (falso NEGATIVO — referência que deveria ter
 *     mudado e não mudou, ou recusa que devia ter sido SUBSTITUI). `--relatorio`/`--aplicar` LEEM
 *     o artefato e reprovam recusa NOVA; só `--gravar-recusas` — decisão explícita — o atualiza.
 *
 * QUATRO CONSERTOS sobre a rodada 2 (REFAZER), cada um por um defeito medido pelo revisor:
 *
 * (a) MARCADOR DE COMENTÁRIO POR EXTENSÃO, não mais uma flag booleana `ehPython`. A rodada 2 tratava
 *     todo arquivo não-`.py` como se usasse `//` — então `.toml`, `.yaml`, `.gitignore`,
 *     `.prettierignore`, `.env.example`, `pre-commit`, `pre-push` nunca abriam comentário (o
 *     marcador `//` nunca aparece neles), a linha inteira caía em contexto CÓDIGO, e código
 *     substitui sempre. Resultado: 28 linhas de prosa portuguesa corrompidas nesses formatos.
 *     Agora `formatoDoArquivo()` mapeia extensão → marcador (`#` para py/toml/yaml/yml/gitignore/
 *     prettierignore/env.example/pre-commit/pre-push · `--` para sql · `//` para mjs/js/ts/tsx/jsx).
 *     `.json` não tem marcador (JSON não tem sintaxe de comentário — mas TEM strings, que continuam
 *     detectadas normalmente). Extensão sem marcador conhecido (inclui `.md`, novo nesta rodada) cai
 *     em `comentarioTotal`: a linha inteira é tratada como texto de comentário — substitui só dentro
 *     de crase ou token com barra/extensão, recusa por padrão o resto. É a leitura literal de
 *     "arquivo sem marcador conhecido: recusa por padrão".
 *
 * (b) ESCALAR YAML SEM ASPAS. `chave: valor sem aspas` num `.yaml`/`.yml` não é string (não tem
 *     aspas) nem comentário — caía em CÓDIGO e substituía cego. `title: <Modulo> — contrato
 *     publico` e `summary: Vivo e com as portas resolvidas` (openapi.yaml, contrato público de cada
 *     módulo) foram corrompidos assim. `valorYamlNaoAspeadoNaLinha()` reconhece a forma `chave: ...`
 *     sem aspas de abertura e trata o valor como se fosse conteúdo de STRING — mesma heurística de
 *     prosa (palavra ao redor, com/sem barra) que uma string de verdade já usa.
 *
 * (c) FRONTEIRA DE `arquivo` NO PONTO FINAL DE FRASE. A fronteira direita antiga (`[\w.-]`) tratava
 *     `.` como não-fronteira sempre — protege `modulo.json` de casar dentro de `modulo.json.bak`,
 *     mas também bloqueia `tools/gate/limiares.mjs.` (ponto final de frase, o caso mais comum em
 *     português) porque o `.` que seguia a extensão nunca fechava a fronteira. Agora a fronteira
 *     direita de `arquivo` é `(?![\w-])(?!\.\w)`: aceita ponto final (nada ou não-palavra depois),
 *     rejeita ponto seguido de mais nome (`.bak` depois de `.json` continua bloqueado — o arquivo é
 *     `modulo.json.bak`, não `modulo.json`).
 *
 * (d) `.md` NO ALVO, restrito por construção a `bindings/` + `tools/` + `tests/` — são as únicas três
 *     raízes que `arquivosAlvo()` varre; `doutrina/` nunca entra, sem precisar de exclusão extra.
 *     `tools/gate/README.md` cita `ferramentas/` 14 vezes e viaja para dentro de todo módulo criado.
 *
 * MAIS DOIS CONSERTOS estruturais, fora da lista de quatro mas exigidos no mesmo relatório:
 *
 * (e) LITERAIS PROTEGIDOS, POR LITERAL+PADRÃO-DE-LINHA. `papel: "dominio"` é VALOR de manifesto
 *     (enum `dominio|gateway|conector`), nunca renomeado em fase nenhuma — mas é sintaticamente
 *     idêntico a uma string-sem-espaço de verdade (`"repositorio": "memoria"`, que DEVE substituir).
 *     Medido ao investigar: proteger o literal INTEIRO (em toda ocorrência) quebra outro uso
 *     legítimo do MESMO bare-string — `'dominio'` também é o nome de `config/dominio.json`
 *     (`CONFIGS = ['api', 'dominio', ...]`, que TEM de substituir), e os ids de regra `'contrato'`/
 *     `'testes'` (ADR-009 decisão 6: id de regra fica português para sempre) colidem do mesmo jeito
 *     com segmento de caminho passado solto a `join(...)`. A proteção certa não é por literal — é
 *     por literal MAIS um padrão que aparece na mesma linha (`PAPEIS`/`papel` para valor de
 *     manifesto, `id:`/`regra:` para id de regra); `rename-inventory.json` só declara QUAIS
 *     literais são protegidos (com o motivo), o padrão de linha é tabela em código
 *     (`PADROES_DE_PROTECAO`) — é regra de classificação, não fato de nomenclatura.
 *
 * (f) IDENTIFICADOR NU EM CÓDIGO NÃO É ALVO DE AD.1. A rodada 2 substituía qualquer ocorrência em
 *     código-de-verdade (não string, não comentário) que casasse a fronteira — inclusive
 *     `let raiz = false`, `{ tudo, raiz, modulos }`, `grafo.modulos` (acesso de propriedade). ADR-009
 *     decisão 4: símbolo fica em português. O defeito não é ter renomeado pastas — é ter renomeado
 *     identificador nu junto. Em contexto código, só sobrevive dentro de um especificador de
 *     import/require — na prática, só o import pontilhado do Python (`from core.dominio import`),
 *     porque em JS/TS o especificador sempre está entre aspas (contexto STRING, já tratado à parte).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const RAIZ_TEMPLATE = resolve(AQUI, '..');
const RAIZ_BASE = resolve(RAIZ_TEMPLATE, '..', '..');
const CAMINHO_INVENTARIO = join(AQUI, 'rename-inventory.json');
// Irma do inventario (plan-3.md Bloco AI): a lista de RECUSAS deixa de ser so saida de console e
// vira artefato versionado, na MESMA disciplina de config/conformidade.json — comeca vazia/ausente,
// cresce so por decisao explicita (`--gravar-recusas`), nunca por heuristica.
const CAMINHO_RECUSAS = join(AQUI, 'rename-refusals.json');

// ================================================================================================
// NÚCLEO — puro. Nenhuma linha até a marca "CASCA" toca `fs` (exceto `--diferencial`, que chama
// `git diff --no-index`: é leitura de processo externo, não escrita, mesmo espírito de "casca").
// ================================================================================================

const ESCAPAR_REGEX = /[.*+?^${}()|[\]\\]/g;
const EXTENSOES_RECONHECIDAS = ['mjs', 'ts', 'tsx', 'js', 'jsx', 'py', 'json', 'yaml', 'yml', 'toml', 'sql', 'md'];
const RE_EXTENSAO = new RegExp(`\\.(${EXTENSOES_RECONHECIDAS.join('|')})$`);

/**
 * Regex de ocorrência para um `antigo`, pelo TIPO. `arquivo`: fronteira esquerda inclui `.`
 * (protege `modulo.json` de casar dentro de `modulo.json.bak`), fronteira direita aceita ponto
 * final de frase mas rejeita ponto seguido de mais nome — conserto (c). `pasta`/`simbolo`/`chave`:
 * `.` conta como fronteira dos dois lados — a MESMA forma acha caminho (`core/domain`), import
 * pontilhado (`from core.domain import x`) E acesso de propriedade de chave de manifesto
 * (`manifesto.nome`, `ctx.manifesto.envRequerido` — Bloco AD, resolução B2). `chave` não precisa
 * de regex própria: a diferença entre os três tipos não está em ACHAR a ocorrência — está em
 * `decidir()`, que decide SE aquela ocorrência substitui, por tipo e por fase.
 */
export function regexDoTipo(antigo, tipo) {
  const escapado = antigo.replace(ESCAPAR_REGEX, '\\$&');
  if (tipo === 'arquivo') {
    return new RegExp(`(?<![\\w.-])${escapado}(?![\\w-])(?!\\.\\w)`, 'g');
  }
  return new RegExp(`(?<![\\w-])${escapado}(?![\\w-])`, 'g');
}

/** Extrai toda string entre aspas (' " `) de uma linha, com escape — devolve `{ inicio, fim, conteudo }[]`
 * em ordem. Não distingue linguagem: aspas são aspas em JS/TS/JSON/Python/Markdown (crase = code
 * span) por igual o bastante para este fim. */
export function stringsDaLinha(linha) {
  const achados = [];
  const re = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(linha)) !== null) {
    achados.push({ inicio: m.index, fim: m.index + m[0].length, conteudo: m[0].slice(1, -1) });
  }
  return achados;
}

/** Início do comentário de LINHA pelo `marcador` (`#`/`--`/`//`, ou `null` se o formato não tem
 * sintaxe de comentário de linha — `.json`) — `-1` se não há, respeitando que o marcador DENTRO de
 * uma string não abre comentário. */
export function inicioComentarioDeLinha(linha, strings, marcador) {
  if (marcador === null) return -1;
  let posicao = linha.indexOf(marcador);
  while (posicao !== -1) {
    const dentroDeString = strings.some((s) => posicao > s.inicio && posicao < s.fim);
    if (!dentroDeString) return posicao;
    posicao = linha.indexOf(marcador, posicao + 1);
  }
  return -1;
}

/** Todo par de crases numa string de comentário — os spans (relativos ao comentário) que contam como
 * "dentro de crase" para a regra do delimitador. */
export function spansDeCrase(textoDoComentario) {
  const spans = [];
  const re = /`[^`]*`/g;
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(textoDoComentario)) !== null) spans.push({ inicio: m.index, fim: m.index + m[0].length });
  return spans;
}

/** O token mais largo (chars `[\w./-]`) contendo a posição `pos` em `texto` — usado para decidir se
 * uma ocorrência em comentário tem `/` ou extensão ao redor, mesmo quando `antigo` sozinho não tem. */
export function tokenAoRedor(texto, pos, tamanho) {
  const ehTokenChar = (c) => c !== undefined && /[\w./-]/.test(c);
  let inicio = pos;
  while (inicio > 0 && ehTokenChar(texto[inicio - 1])) inicio -= 1;
  let fim = pos + tamanho;
  while (fim < texto.length && ehTokenChar(texto[fim])) fim += 1;
  return texto.slice(inicio, fim);
}

function pareceCaminho(token) {
  return token.includes('/') || RE_EXTENSAO.test(token);
}

/**
 * Achado no Bloco AD.4 (revisão do revisor, `doutrina/adr/decisoes.md` §233/§237): dentro de UMA
 * crase só, um token da forma `antigo→novo` é uma TABELA DE MAPEAMENTO — documenta a tradução em si,
 * não cita o nome atual de nada. O lado ESQUERDO tem de ficar português SEMPRE, mesmo sem marcador de
 * proteção nenhum: é o próprio "antes" que o mapeamento existe para registrar. Sem este
 * reconhecimento, `` `ferramentas→tools` `` virava `` `tools→tools` `` — 11 dos 18 mapeamentos da
 * doutrina viraram identidade, porque o motor tratava a crase como citação NUA comum (substitui sem
 * proteção) em vez de mapeamento (lado esquerdo é histórico, nunca alvo).
 *
 * Mecanismo, não lista: reconhece a FORMA (`\S+→\S+` dentro de uma crase só, sem espaço em nenhum
 * lado), não os itens específicos — cobre qualquer tabela futura da mesma forma sem exigir marcador
 * novo por linha. O lado DIREITO é indiferente aqui de propósito: ele já é o nome novo (frequentemente
 * idêntico ao antigo, como `tools→tools`), então substituí-lo ou não dá no mesmo resultado — só o
 * esquerdo pode corromper.
 */
function ladoEsquerdoDeMapeamento(texto, posicao, tamanho) {
  const span = spansDeCrase(texto).find((s) => posicao >= s.inicio && posicao + tamanho <= s.fim);
  if (span === undefined) return false;
  const conteudo = texto.slice(span.inicio + 1, span.fim - 1);
  const m = conteudo.match(/^(\S+)→(\S+)$/);
  if (m !== null) {
    const fimDoLadoEsquerdo = span.inicio + 1 + m[1].length;
    return posicao + tamanho <= fimDoLadoEsquerdo;
  }
  // MESMA forma, seta FORA da crase (Bloco AD.4, achado ao verificar §233/§237: a tabela do ADR-009
  // também escreve `dentro de `ferramentas/` (→ `tools/`)` — duas crases, seta em prosa entre elas,
  // não uma só). Sem isto, `ferramentas/` (crase isolada, sem seta dentro) substitui normal — igual
  // qualquer caminho —, e a mesma crase que documenta "→ `tools/`" vira `tools/` (→ `tools/`),
  // identidade de novo. Reconhece: esta crase não tem seta dentro, mas é seguida (a poucos
  // caracteres, só espaço/parêntese) por uma seta e outra crase — é o lado esquerdo do MESMO par.
  if (/→/.test(conteudo)) return false;
  const resto = texto.slice(span.fim, span.fim + 12);
  if (!/^\s*\(?→/.test(resto)) return false;
  // Achado ao testar contra `doutrina/01-modulo.md`: um DIAGRAMA DE SEQUÊNCIA (`` `a` → `b` → `c` ``,
  // três ou mais elos, cada um sua própria crase) casa a MESMA forma "crase, seta, crase" em CADA elo
  // do meio — sem esta guarda, `core/dominio` no meio de `` `contrato/openapi.yaml` → `core/dominio` →
  // `api/src/routes` `` ficaria preso em português para sempre, achando que é o lado esquerdo de um
  // mapeamento. A DIFERENÇA real: um par de mapeamento é TERMINAL — depois do lado direito não vem
  // outra seta. Acha a crase seguinte (o lado direito deste par) e recusa reconhecer mapeamento se ELA
  // por sua vez também for seguida de seta — nesse caso é elo do meio de uma sequência, não um par.
  const proximaCrase = spansDeCrase(texto).find((s) => s.inicio >= span.fim);
  if (proximaCrase !== undefined) {
    const apósLadoDireito = texto.slice(proximaCrase.fim, proximaCrase.fim + 12);
    if (/^\s*\(?→/.test(apósLadoDireito)) return false;
  }
  return true;
}

/** A PALAVRA (delimitada por espaço, não por `[\w./-]`) contendo `pos` em `texto` — separa
 * `"node tools/gate/validate.mjs --todos"` (linha de comando: a STRING tem espaço, mas a PALAVRA do
 * match é caminho de verdade) de `"...o domain de negocio..."` (a palavra do match é só prosa). */
export function palavraAoRedor(texto, pos, tamanho) {
  let inicio = pos;
  while (inicio > 0 && !/\s/.test(texto[inicio - 1])) inicio -= 1;
  let fim = pos + tamanho;
  while (fim < texto.length && !/\s/.test(texto[fim])) fim += 1;
  return texto.slice(inicio, fim);
}

/** Conserto (b): a forma `chave: valor sem aspas` de uma linha YAML — devolve a região do VALOR
 * (`{ inicio, fim, conteudo }`, índices relativos à linha) ou `null` se a linha não é dessa forma,
 * ou se o valor já abre com aspas/âncora (`"`, `'`, `|`, `>`) — aí já é string ou bloco, não escalar
 * nu. Lista/mapeamento aninhado (`- valor`) fica fora de propósito: sem caso conhecido no template. */
export function valorYamlNaoAspeadoNaLinha(linha) {
  const m = /^(\s*(?:-\s*)?[\w.$-]+:\s+)(.*)$/.exec(linha);
  if (!m) return null;
  const valor = m[2];
  if (valor === '' || /^["'|>#]/.test(valor)) return null;
  const inicio = m[1].length;
  return { inicio, fim: inicio + valor.length, conteudo: valor };
}

/** Import pontilhado do Python (`from core.dominio import x`, `import core.dominio`) — a ÚNICA forma
 * em que um especificador de import aparece em CÓDIGO (não-string) neste template; em JS/TS o
 * especificador é sempre uma string literal (contexto STRING, tratado à parte).
 *
 * Achado no `--diferencial`: `import\s+[\w.]+` sozinho TAMBÉM casa o início de `import contrato
 * from './rules/contract.mjs'` (JS/TS) — a mesma forma textual de `import core.dominio` (Python).
 * Sem o `(?!\s+from\b)`, a linha inteira virava "linha de import" e o BINDING NOME (`contrato`, um
 * identificador local, símbolo — deve ficar em português) substituía junto com o caminho, que já é
 * tratado à parte via contexto STRING. `from` depois do módulo é o discriminador: só existe nessa
 * posição em JS. */
export function ehLinhaDeImportPython(linha) {
  return /^\s*(from\s+[\w.]+\s+import\b|import\s+[\w.]+(?!\s+from\b)(?:\s|$))/.test(linha);
}

/** Conserto (e), forma final. `dominio`/`gateway`/`conector` (valor de `papel`) e `contrato`/`testes`
 * (id de regra, ADR decisão 6) são bare string-sem-espaço LEGÍTIMOS em OUTRO lugar: `'dominio'`
 * também é o nome do arquivo `config/dominio.json` (`CONFIGS = ['api', 'dominio', ...]`), e
 * `'contrato'`/`'testes'` também são segmento de caminho passado solto a `join(...)`
 * (`join('modulos', id, 'contrato', 'openapi.yaml')`). Proteger o LITERAL inteiro (em toda
 * ocorrência) quebraria essas substituições legítimas — a mesma classe de defeito que esta rodada
 * existe para consertar, só que ao contrário. A proteção é por LITERAL + PADRÃO-DE-LINHA: só recusa
 * quando a linha também contém um marcador de que aquele bare-string é valor de manifesto/id de
 * regra (`PAPEIS`, `papel`, `id:`, `regra:`), nunca pelo literal sozinho. */
const PADROES_DE_PROTECAO = new Map([
  // `dominio`/`conector` (Bloco AD.3, decisao 8 de decisoes.md): os VALORES do enum `papel`/`role`
  // NO MANIFESTO traduzem junto com a chave — "e o mesmo conceito da pasta homonima, nao uma
  // excecao". Ate AD.3 abrir, ficam protegidos (marcador `PAPEIS`/`papel`/`"role":` na linha) pelo
  // MESMO motivo de sempre — nao deixar a pasta `dominio→domain` (AD.1) corromper o default/enum
  // do manifesto antes da hora. EM AD.3, a protecao se SUSPENDE SO pro `"role":` do `module.json`
  // (aspas duplas — JSON) — o proprio valor vira alvo ali.
  //
  // `marcadoresSempre` (revisao pos-round do revisor, decisao #5): a CLI de `create-module.mjs`
  // aceita `--role dominio` — flag em ingles (decisao 5, superficie de CLI), VALOR em portugues
  // por decisao explicita, nao o manifesto. `const PAPEIS = [...]`/`valorDe('role', 'dominio')`
  // batem os MESMOS marcadores base (`PAPEIS`) que protegiam o valor do manifesto — sem separar
  // "sempre" de "com excecao", suspender por AD.3 suspendia a CLI tambem, e o `--aplicar` reescrevia
  // `PAPEIS` para ingles, quebrando a flag que o revisor acabou de aprovar em portugues. JS usa
  // aspas simples (`'role'`) e JSON usa aspas duplas (`"role":`) — os dois conjuntos de marcador
  // nunca colidem por construcao da linguagem, entao a separacao e livre de ambiguidade.
  ['dominio', {
    marcadores: ['PAPEIS', 'papel', "valorDe('role'", '"role":'],
    marcadoresSempre: ['PAPEIS', "valorDe('role'"],
    protegidoExceto: ['AD.3'],
  }],
  ['gateway', ['PAPEIS', 'papel']],
  ['conector', {
    marcadores: ['PAPEIS', 'papel', "valorDe('role'", '"role":'],
    marcadoresSempre: ['PAPEIS', "valorDe('role'"],
    protegidoExceto: ['AD.3'],
  }],
  ['contrato', ['id:', 'regra:']],
  ['testes', ['id:', 'regra:']],
  // 'portas' (chave de manifesto, fase AD.3 — Bloco AI, AI.5) NÃO tem marcador-de-linha confiável:
  // aparece em prosa de comentário, dentro de regex-como-string (generate-port-schemas.mjs), em
  // dict Python (composicao.py, test_config.py) e em JSON puro (modulo.json) — contextos demais
  // para um marcador só. E, diferente de 'contrato'/'testes', NENHUM uso NU (sem barra) de 'portas'
  // é substituição legítima FORA de AD.3 hoje: a única forma legítima é a PASTA, sempre com barra
  // (`core/portas/` → `core/ports/`), e essa forma já substitui ANTES de chegar aqui, via
  // `pareceCaminho`/`token`. Por isso `true` em vez de lista: protegido sempre que aparece NU, sem
  // exigir marcador.
  //
  // `protegidoExceto` (Bloco AD, resolução B3) — EM AD.3, `portas` DEIXA de ser colisão e vira o
  // próprio ALVO (chave de manifesto `portas→ports`). Proteger sem exceção faria o AD.3 nunca
  // conseguir renomear a própria chave que existe para renomear — e simplesmente REMOVER a proteção
  // faz o AD.1 (idempotência já fechada, AI.5) voltar a corromper `modulo.json`/`composicao.py`.
  // A saída é a mesma dos outros mecanismos fechados deste arquivo: FASE explícita, não heurística.
  // `contrato`/`testes` NÃO precisam disto — a proteção deles é por MARCADOR (`id:`/`regra:`), que
  // já discrimina "id de regra" (protege sempre) de "chave `consome[].contrato`" (sem marcador,
  // substitui) pelo CONTEXTO da linha, sem precisar saber qual fase está rodando.
  ['portas', { protegidoExceto: ['AD.3'] }],
  // Achado ao abrir doutrina/ (Bloco AD.4): 'verificar' nu, em doutrina, nunca cita o script `verify`
  // de UM binding — é o termo GENÉRICO que a prosa usa para "o comando de verificação local",
  // binding-agnóstico de propósito (TS/JS tem `npm run verify`, Python continua `verificar.py`; a
  // doutrina descreve os três de uma vez). Medido: toda ocorrência bare em doutrina/*.md é desta
  // forma — nenhuma diz "npm run verificar" (que substituiria certo). A mais perigosa é
  // `verificar.py`, citado 8 vezes: sem esta proteção, o item simbolo 'verificar'→'verify' casa
  // dentro do nome do arquivo (fronteira de tipo `simbolo` não é extension-aware como a de `arquivo`)
  // e corrompe o nome de um script Python que nunca foi renomeado. Protegido sempre (`true`) — não há
  // uso bare legítimo de 'verificar' esperando substituir em doutrina/ hoje.
  ['verificar', true],
  // `<modulo>`/`<MODULO>`/`<Modulo>` (Bloco AD.3) são o MARCADOR de template que
  // `create-module.mjs:substituir`/`context.mjs:trocarMarcadores` procuram e trocam pelo id/nome
  // reais — mecanismo de SCAFFOLDING, não vocabulário do manifesto, mesmo a palavra sendo a mesma
  // que `consome[].modulo` (a chave nested que ESTE item existe pra renomear). O marcador não é
  // código: desaparece no primeiro scaffold, e a fronteira da campanha (decisoes.md §233-243) não
  // fala dele porque ele não está em nenhum dos dois lados — nem árvore, nem conteúdo. DECISÃO DO
  // REVISOR (Bloco AD.3, revisão pós-round): a família fica UNIFORME em português — `<MODULO>` é a
  // convenção de prefixo de env documentada em toda a doutrina, e dividir só `<modulo>` para inglês
  // seria pior que o problema que motivou a proteção. Este marcador de linha (junto de
  // `dentroDeMarcadorDeTemplate`, no ramo 'string' de `decidir`, que vence a precedência de
  // `pareceCaminho` — ver o comentário lá) fecha os DOIS lados: `id: "<modulo>"` (sem barra, cai
  // aqui) e `basePath: "/api/v1/<modulo>"` (com barra, precisava do desvio de precedência).
  ['modulo', ['<modulo>', '<MODULO>', '<Modulo>']],
  // `permissoes` em `getattr(request.state, "permissoes", [])` (Bloco AD.3, achado na verificação
  // de pendências pós-round): `request.state.permissoes` é o MESMO conceito fora-de-escopo que
  // `req.permissoes` em TS/JS (Request aumentado, permissões da REQUISIÇÃO autenticada, nunca a
  // chave do manifesto) — protegido lá de graça, porque é acesso pontilhado sem base conhecida. A
  // forma Python (`getattr(obj, "string", default)`) LÊ o mesmo atributo por STRING, e string
  // sem espaço substitui por padrão (sem `IDENTIFICADORES_DE_MANIFESTO` pra consultar, esse
  // mecanismo só existe pro ramo 'codigo') — a ATRIBUIÇÃO (`request.state.permissoes = ...`,
  // pontilhada, sem base conhecida) ficava protegida OK, mas a LEITURA por `getattr` virava
  // "permissions", os dois lados do MESMO estado divergindo — toda checagem de permissão passava a
  // ler lista vazia, "permissao insuficiente" em toda rota autenticada (Bloco K, binding Python).
  // Marcador `request.state` (não `true` incondicional): `permissoes` continua substituindo em
  // TODO OUTRO contexto — `manifesto["permissoes"]`, `module.json:permissoes`, os 19 lugares que já
  // fecharam certo.
  ['permissoes', ['request.state']],
]);

/** `literaisProtegidos` é o `Map` acima (lido do inventário) — devolve `true` se o LITERAL está
 * marcado como SEMPRE protegido (`true`), como protegido-por-padrão-com-exceção-de-fase (objeto
 * `{ protegidoExceto }`, sem marcador — protege a linha inteira, exceção aplicada pelo chamador via
 * `protecaoSuspensaNestaFase`), como protegido-por-MARCADOR-com-exceção-de-fase (objeto
 * `{ marcadores, protegidoExceto }` — Bloco AD.3, ver `dominio`/`conector` em `PADROES_DE_PROTECAO`:
 * o enum de `papel` precisa das DUAS coisas ao mesmo tempo, marcador PORQUE `dominio` também
 * aparece como pasta/palavra comum fora de `papel:`, exceção de fase PORQUE o próprio valor do
 * enum é o alvo do AD.3, decisão 8 de `decisoes.md`), ou se tem lista NUA de marcadores (sem
 * exceção de fase nenhuma) E a linha onde ele ocorreu bate um deles. */
export function protegidoNestaLinha(linha, nomeOcorrencia, literaisProtegidos) {
  const padroes = literaisProtegidos?.get(nomeOcorrencia);
  if (!padroes) return false;
  if (padroes === true) return true;
  if (Array.isArray(padroes)) return padroes.some((p) => linha.includes(p));
  if (padroes.marcadores) return padroes.marcadores.some((p) => linha.includes(p));
  return true; // objeto { protegidoExceto } sem marcadores: protegido POR PADRÃO — a exceção é do chamador.
}

/**
 * `marcadoresSempre` (Bloco AD.3, revisão pós-round) — SUBCONJUNTO de `marcadores` que a exceção de
 * fase NUNCA suspende, mesmo quando outro marcador da MESMA entrada é suspendível. Achado com
 * `dominio`/`conector`: o VALOR do enum `papel`/`role` precisa suspender em AD.3 (decisão 8 —
 * `"role": "dominio"` em `module.json` vira `"domain"`), mas a CLI de `create-module.mjs`
 * (`const PAPEIS = [...]`, `valorDe('role', 'dominio')`) precisa continuar protegida SEMPRE — a
 * flag aceita valor português por decisão do revisor (`--role dominio`), não é o manifesto. Mesma
 * palavra, mesmo item, comportamento oposto por ARQUIVO — JSON usa `"role":` com aspas duplas, JS
 * usa `PAPEIS`/`valorDe(` sem essa forma, os dois conjuntos de marcador nunca colidem por
 * construção. Sem isto, suspender por fase suspendia a ENTRADA inteira — inclusive as linhas de
 * CLI que nunca deveriam suspender.
 */
export function protecaoSuspensaNestaFase(linha, nomeOcorrencia, literaisProtegidos, fase) {
  const padroes = literaisProtegidos?.get(nomeOcorrencia);
  if (padroes === true || padroes === undefined || Array.isArray(padroes)) return false;
  if (padroes.marcadoresSempre?.some((p) => linha.includes(p))) return false;
  return (padroes.protegidoExceto ?? []).includes(fase);
}

/**
 * O RECONHECEDOR POR NOME DA CONSTANTE (Bloco AI, AI.5) — `REGRAS_DE_EXTRACAO` (id de regra) e
 * `CAMPOS_OBRIGATORIOS` (chave de manifesto) são array/`Set` NUS: nenhum elemento tem `id:`/
 * `regra:`/`papel:` na própria linha para `protegidoNestaLinha` reconhecer. Em vez de mais um
 * marcador-de-linha (que exigiria editar CADA elemento), reconhece o BLOCO inteiro pela linha que
 * o abre — `const NOME = [` ou `const NOME = new Set([` — até a linha que fecha, sozinha (as duas
 * constantes hoje são só isso; se uma ficar de uma linha só, o reconhecedor de bloco não se aplica
 * e ela volta a precisar de marcador-de-linha, o comportamento de sempre).
 */
const CONSTANTES_COM_ARRAY_PROTEGIDO = ['REGRAS_DE_EXTRACAO', 'CAMPOS_OBRIGATORIOS'];
const RE_ABRE_ARRAY_PROTEGIDO = new RegExp(
  `\\b(?:export\\s+)?(?:const|let)\\s+(?:${CONSTANTES_COM_ARRAY_PROTEGIDO.join('|')})\\s*=\\s*(?:new Set\\()?\\[\\s*$`,
);
const RE_FECHA_ARRAY_PROTEGIDO = /^\s*\]\)?;?\s*$/;

/**
 * TERCEIRA FORMA (Bloco AD.3) — chave de manifesto como MEMBRO DE OBJETO/TIPO sem `.` na frente:
 * `m.manifesto((x) => ({ ...x, papel: 'x' }))`/`m.manifestoRaiz((x) => ({ ...x, envRequerido: [] }))`
 * (valor, `cases.mjs` — as DUAS funções do harness de teste, `tools/gate/tests/run.mjs:197,202`) e
 * `export interface Manifesto { papel: Papel }`/`interface ManifestoDescoberto {...}` (tipo,
 * `config.ts`/`composicao.ts`). Duas formas de GATILHO, um só reconhecedor: qualquer linha que
 * contenha `.manifesto(`/`.manifestoRaiz(` OU `interface <algo>Manifesto<algo> {` ABRE o bloco;
 * dali em diante toda chave nua encontrada é tratada como se estivesse precedida de `.`, até o
 * bloco fechar.
 *
 * `.manifestoRaiz(` só entrou depois de um FALHA real (Bloco AD.3, segunda rodada de `--aplicar`):
 * `\.manifesto\(` sozinho não casa `.manifestoRaiz(` (tem "Raiz" no meio, antes do `(`), então os
 * 4 `mutar: (m) => m.manifestoRaiz((x) => ({ ...x, envRequerido: ... }))` de `cases.mjs` ficaram
 * de fora do bloco — `x.envRequerido` continuou 'envRequerido' (base `x` não é
 * `IDENTIFICADORES_DE_MANIFESTO`, sem a bandeira de bloco não substitui) enquanto o `project.json`
 * de verdade já falava `requiredEnv` — `x.envRequerido is not iterable` no gate self-test.
 *
 * Por PROFUNDIDADE DE CHAVE, não por um booleano só (diferença deliberada do
 * `dentroDeArrayProtegido` acima): o corpo de `.manifesto((x) => ({...}))` tem objeto ANINHADO de
 * verdade (`consome: [{ modulo, contrato, porQue }]`) — um único par abre/fecha perderia a conta.
 * Contando `{` menos `}` de cada linha via `profundidadeDeManifesto` (abaixo, em
 * `classificarArquivo`), o bloco fecha exatamente na linha cujo saldo devolve a profundidade a 0,
 * nested ou não. `[a-z]` maiúsculo em `Mm` cobre `Manifesto`/`ManifestoDescoberto` com o mesmo
 * padrão — `\w*` dos dois lados pega qualquer prefixo/sufixo de identificador.
 */
const RE_ABRE_BLOCO_DE_MANIFESTO = /\.manifesto(?:Raiz)?\(|interface\s+\w*[Mm]anifesto\w*\s*\{/;

/**
 * ACESSO DE PROPRIEDADE (B2) por BASE CONHECIDA, não por "tem ponto antes" cru (Bloco AD.3,
 * achado ao estender `chave` para `tools/`/`tests/` — ver `itemAplicaAoArquivo`). Medido no corpus
 * inteiro (bindings/ + tools/ + tests/) ANTES de estender a fronteira: `nome`/`permissoes`/
 * `descricao`/`rotaBase` também aparecem em ACESSO DE PROPRIEDADE de objetos que NÃO são o
 * manifesto — `caso.nome` (nome do caso de teste, dezenas de ocorrências em `tools/*.mjs`/
 * `tests/*.mjs`), `req.permissoes`/`claims.permissoes`/`state.permissoes` (permissões da
 * REQUISIÇÃO autenticada, middlewares TS/JS/Python), `corpo.rotaBase` (asserção de teste de
 * contrato sobre a RESPOSTA HTTP) — mesma palavra, objeto diferente, "tem `.` antes" sozinho não
 * distingue. `IDENTIFICADORES_DE_MANIFESTO` é a lista FECHADA (por medição, não suposição) de
 * quem, hoje, no template inteiro, segura de verdade o manifesto ou algo derivado dele em acesso
 * pontilhado: `manifesto`/`ctx.manifesto` (as ~40 regras do gate), `modulo` (variável de laço em
 * `composicao.ts/js`, iterando módulos já carregados), `valor` (`projeto.manifesto.valor`, o
 * conteúdo destructurado do `project.json`), `opcoes` (`create-module.mjs`, as flags de CLI que
 * espelham os mesmos campos). Fora desta lista, RECUSA — o mesmo default seguro de sempre: perder
 * uma substituição legítima ainda não medida é resolvível (autoteste "3a forma" acrescenta caso
 * novo); substituir `caso.nome` por `caso.name` em silêncio corrompe um campo de teste sem ninguém
 * notar, e É EXATAMENTE a classe de defeito que motivou excluir `tools/`/`tests/` de `chave` em
 * primeiro lugar — só reabrimos a fronteira DEPOIS de fechar este buraco.
 */
const IDENTIFICADORES_DE_MANIFESTO = ['manifesto', 'modulo', 'valor', 'opcoes'];

/**
 * A BASE conhecida pode estar em QUALQUER SEGMENTO da cadeia pontilhada antes de `pos`, não só no
 * imediatamente anterior — achado real (Bloco AD.3, segunda rodada de `--aplicar`):
 * `manifesto.data.tabelas`/`ctx.manifesto?.data?.tabelas` têm `data` (não `manifesto`) como base
 * IMEDIATA de `tabelas`, e só checar o segmento imediato deixava esses dois de fora (`dados.tabelas`
 * não corrigido em `create-module.mjs`/`data.mjs`, mesmo com `manifesto` presente dois segmentos
 * atrás). Caminha a cadeia inteira (`a?.b?.c?.` — identificadores separados por `.`, cada um com
 * `?` opcional antes do ponto) e aceita se QUALQUER segmento bate `IDENTIFICADORES_DE_MANIFESTO` —
 * `caso.nome`/`req.permissoes` continuam recusando: a cadeia deles é só `['caso']`/`['req']`, nenhum
 * segmento bate a lista, então nada muda para o achado original que justificou a lista fechada.
 *
 * COLCHETE (Bloco AD.3, achado ao estender pra f-string Python): `manifesto['prefixo']` — a forma
 * NORMAL de acesso em Python (nunca `manifesto.prefixo`) — não tem `.` nenhum antes de `prefixo`,
 * só aspa+colchete. Fora de f-string isso já substituía pelo ramo 'string' comum (a aspa simples
 * vira sua PRÓPRIA string, conteúdo "prefixo" bate inteiro). DENTRO de f-string, a interpolação
 * inteira vira 'codigo' (ver `ehFString`), e aí só o ramo de cadeia decide — sem reconhecer
 * colchete, TODO acesso Python dentro de f-string recusaria, mesmo com base `manifesto`.
 */
function baseConhecidaNaCadeia(linha, pos) {
  const antes = linha.slice(0, pos);
  if (linha[pos - 1] === '.') {
    const m = /(?:[A-Za-z_$][\w$]*\??\.)+$/.exec(antes);
    if (!m) return false;
    const segmentos = m[0].split('.').map((s) => s.replace(/\?$/, '')).filter(Boolean);
    return segmentos.some((s) => IDENTIFICADORES_DE_MANIFESTO.includes(s));
  }
  if (linha[pos - 1] === "'" || linha[pos - 1] === '"') {
    const m = /([A-Za-z_$][\w$]*)\[['"]$/.exec(antes);
    return m !== null && IDENTIFICADORES_DE_MANIFESTO.includes(m[1]);
  }
  return false;
}

/**
 * BUG REAL (Bloco AD.3, achado rodando `--aplicar` pela primeira vez com itens `chave`):
 * `` `${nome}.schema.json` `` corrompeu `carregarEsquema` pra `${name}` — `nome` (o PARÂMETRO)
 * ficou intacto, só a referência dentro do template literal virou `name`, uma variável que não
 * existe. Raiz do defeito: `palavraAoRedor` (ramo 'string' de `decidir`) anda até o primeiro
 * ESPAÇO EM BRANCO dos dois lados pra decidir se o match é "a string inteira" — mas
 * `${nome}.schema.json` não tem espaço nenhum, então a palavra "ao redor" vira o span INTEIRO
 * (`${nome}.schema.json`), que bate `contexto.conteudo` por igual, e o heurístico de
 * string-sem-espaço (pensado pra `"nome"` sozinho entre aspas) trata isso como substituição seg
 * ura. Confirmado um segundo caso, arquivo diferente: `` `${prefixo}${sufixo}` `` virou
 * `` `${prefix}${sufixo}` `` com a declaração `const { schema, prefixo }` intocada — mesmo padrão.
 *
 * A FORMA, não o caso: `${...}` dentro de crase é CÓDIGO (uma expressão JS interpolada), não
 * conteúdo de string — mistura sintaxe de string com sintaxe de identificador, e é exatamente essa
 * mistura que confunde `palavraAoRedor`. Corrigido tratando qualquer ocorrência DENTRO de um
 * `${...}` de uma crase como tipo `'codigo'` (mesmas regras de `manifesto.nome`/`chave` nua de
 * sempre — precisa de `baseConhecidaDeManifesto` ou `dentroDeBlocoDeManifesto` pra substituir),
 * nunca como `'string'`. Não-aninhado de propósito (`[^}]*` — sem caso de `${a[${b}]}` no corpus
 * medido); crase SEM `$` continua 100% pelo ramo `'string'` de sempre, comportamento inalterado.
 */
function regioesDeInterpolacao(conteudo, comCifrao) {
  const regioes = [];
  const re = comCifrao ? /\$\{[^}]*\}/g : /\{[^}]*\}/g;
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(conteudo)) !== null) {
    regioes.push({ inicio: m.index, fim: m.index + m[0].length });
  }
  return regioes;
}

/**
 * F-STRING PYTHON (Bloco AD.3, achado numa TERCEIRA rodada de `--aplicar` — mesma classe do bug de
 * `${nome}` em crase, achado numa forma que a correção da crase não cobria): `f"{data['prefix']}"`
 * tem o MESMO problema — `{...}` sem espaço em branco vira "a string inteira" pro heurístico de
 * string-sem-espaço, e substitui `prefixo`/`dados` dentro da interpolação mesmo quando a variável
 * do lado de fora (`dados = ...`) não foi renomeada, corrompendo `adapters/postgres/__init__.py` e
 * `scripts/migrations.py` (`f"{dados['prefixo']}migrations"` virou `f"{data['prefix']}migrations"`
 * — `data` nunca foi definida). Interpolação Python não tem `$` (`{expr}`, não `${expr}`) — por
 * isso `regioesDeInterpolacao` ganhou o parâmetro `comCifrao`, e só entra neste ramo quando o
 * caractere ANTES da aspa de abertura é `f`/`F` (aceita só o prefixo simples — `rf"..."`/`fr"..."`
 * não têm caso conhecido no corpus medido).
 */
function ehFString(linha, inicioDaString) {
  const antes = linha[inicioDaString - 1];
  return antes === 'f' || antes === 'F';
}

/**
 * A DECISÃO — dado onde a ocorrência caiu, devolve `{ decisao: 'substitui'|'recusa', classe }`.
 *
 * `tipoItem === 'arquivo'` SEMPRE substitui, em qualquer contexto — nome composto com extensão
 * (`empacotar.mjs`) já é o marcador inequívoco; não existe frase portuguesa comum que o contenha
 * por acaso.
 *
 * `contexto.tipo` é `'string' | 'comentario' | 'codigo'`. Para `'string'`: `contexto.conteudo` é o
 * texto INTEIRO entre aspas (ou, pelo conserto (b), o valor YAML sem aspas) — quem decide é a
 * PALAVRA do match, não a string toda; `protegido` (conserto (e), já resolvido pelo chamador via
 * `protegidoNestaLinha`) recusa uma string-sem-espaço cujo literal+linha bate um marcador de
 * manifesto/id-de-regra protegido. Para `'comentario'`: mesma forma, mas o alvo é o token de
 * `[\w./-]`. Para `'codigo'`: histórico (AD.1, "conserto f") é só sobreviver dentro de um
 * especificador de import — identificador nu fica. `fase` (Bloco AD, resolução B1) estreita isso:
 * fora de AD.1, o item pode SER o próprio símbolo/chave aparecendo nu — ver comentário no ramo.
 */
export function decidir(contexto, nomeOcorrencia, tipoItem, protegido, fase, dentroDeBlocoDeManifesto = false) {
  if (tipoItem === 'arquivo') return { decisao: 'substitui', classe: 'caminho' };
  if (contexto.tipo === 'string') {
    const palavra = palavraAoRedor(contexto.conteudo, contexto.posicao, contexto.tamanho);
    // MARCADOR DE TEMPLATE (Bloco AD.3, revisão pós-round — decisão do revisor: a família
    // `<modulo>`/`<MODULO>`/`<Modulo>` fica UNIFORME em português, nunca vira `<module>`): sem
    // este desvio, `pareceCaminho` (linha abaixo) tinha PRECEDÊNCIA sobre a proteção sempre que o
    // marcador caía dentro de um valor "parece caminho" (`"/api/v1/<modulo>"`, tem barra) —
    // `basePath`/`webPath` viravam `<module>` enquanto `id`/`data.prefix` (sem barra) ficavam
    // `<modulo>`, os dois convivendo no MESMO `module.json` por um critério (bateu `pareceCaminho`
    // ou não) que ninguém infere lendo. O marcador não é código — desaparece no primeiro scaffold
    // — e a família tem TRÊS grafias (`<MODULO>` é a convenção de prefixo de env, documentada em
    // toda a doutrina): dividir só `<modulo>` seria pior que o problema. Verificado pelos
    // colchetes IMEDIATOS (`<` antes, `>` depois) — não pelo marcador de linha, porque a proteção
    // tem de vencer `pareceCaminho` ANTES dele decidir, não depois.
    const dentroDeMarcadorDeTemplate = contexto.conteudo[contexto.posicao - 1] === '<'
      && contexto.conteudo[contexto.posicao + contexto.tamanho] === '>';
    if (dentroDeMarcadorDeTemplate) {
      if (protegido) return { decisao: 'recusa', classe: 'RECUSADO-LITERAL-PROTEGIDO' };
      return { decisao: 'substitui', classe: 'string-sem-espaco' };
    }
    if (pareceCaminho(palavra)) return { decisao: 'substitui', classe: 'caminho' };
    if (palavra === contexto.conteudo) {
      if (protegido) return { decisao: 'recusa', classe: 'RECUSADO-LITERAL-PROTEGIDO' };
      return { decisao: 'substitui', classe: 'string-sem-espaco' };
    }
    // Achado pelo revisor (rodada AD.1, achado 6 da mesma classe): uma STRING que É uma linha de
    // import Python inteira (`'from core.motor import gerar_artefato\n'`, fixture escrevendo
    // codigo Python de dentro de uma ferramenta JS) tem espaço — cai aqui — mas nao e prosa, e
    // import de verdade, so que dentro de aspas em vez de bare. Achar cada ocorrencia à mão (5
    // vezes na rodada anterior) nao fecha a classe; reconhecer a FORMA fecha. `contexto.conteudo`
    // já é a linha Python completa (a string INTEIRA, não um trecho), entao o mesmo reconhecedor
    // de import bare serve sem modificação.
    if (ehLinhaDeImportPython(contexto.conteudo.trim())) return { decisao: 'substitui', classe: 'identificador' };
    return { decisao: 'recusa', classe: 'RECUSADO-POR-PROSA' };
  }
  if (contexto.tipo === 'comentario') {
    const dentroDeCrase = spansDeCrase(contexto.texto)
      .some((s) => contexto.posicao >= s.inicio && contexto.posicao + contexto.tamanho <= s.fim);
    const token = tokenAoRedor(contexto.texto, contexto.posicao, contexto.tamanho);
    // Mapeamento `antigo→novo` numa crase só (Bloco AD.4) — precedência MÁXIMA no ramo comentário:
    // o lado esquerdo é histórico por definição, nunca alvo, mesmo quando `pareceCaminho`/`protegido`
    // diriam substitui. Ver `ladoEsquerdoDeMapeamento`.
    if (ladoEsquerdoDeMapeamento(contexto.texto, contexto.posicao, contexto.tamanho)) {
      return { decisao: 'recusa', classe: 'RECUSADO-MAPEAMENTO' };
    }
    // Caminho de verdade (barra/extensão) SEMPRE substitui, protegido ou não — mesma precedência
    // do ramo 'string' acima (`pareceCaminho` antes do `protegido`): é o que mantém
    // `join('modulos', id, 'contrato', 'openapi.yaml')` substituindo enquanto `id: 'contrato'`
    // recusa. Só o token NU (sem barra/extensão) dentro de crase consulta `protegido` — antes
    // disto, crase sempre substituía cego, e foi assim que `generate-port-schemas.mjs` corrompeu
    // `"portas"` embutido em comentário/regex seis vezes (Bloco AI, AI.5).
    //
    // EXCEÇÃO ESTREITA (Bloco AD.4, doutrina/): `verificar.py` — o script Python nunca renomeado —
    // tem EXTENSÃO (`RE_EXTENSAO` casa `.py`) sem barra nenhuma, então `pareceCaminho` o confunde
    // com um caminho de verdade e substituiria cego para `verify.py`, um arquivo que não existe.
    // Restrita a `nomeOcorrencia === 'verificar'` de propósito — generalizar para "protegido +
    // parece-caminho-sem-barra" abriria um caso novo: `contrato`/`testes` são protegidos por
    // MARCADOR de linha (não sempre), e uma linha com o marcador E, em outro ponto, um caminho de
    // verdade tipo `contrato.json` perderia a substituição legítima por um efeito colateral do
    // marcador estar em outro lugar da mesma linha.
    if (nomeOcorrencia === 'verificar' && protegido && !token.includes('/') && RE_EXTENSAO.test(token)) {
      return { decisao: 'recusa', classe: 'RECUSADO-LITERAL-PROTEGIDO' };
    }
    if (pareceCaminho(token)) return { decisao: 'substitui', classe: 'caminho' };
    if (dentroDeCrase) {
      if (protegido) return { decisao: 'recusa', classe: 'RECUSADO-LITERAL-PROTEGIDO' };
      return { decisao: 'substitui', classe: 'caminho' };
    }
    return { decisao: 'recusa', classe: 'RECUSADO-POR-PROSA' };
  }
  // 'codigo' — Bloco AD, resolução B1/B2.
  if (contexto.linhaEhImport) return { decisao: 'substitui', classe: 'identificador' };
  // AD.1 (`pasta`, e `simbolo`/`modulos`/`memoria` que também são AD.1): identificador nu SEMPRE
  // recusa — é o "conserto f" original, e mexer nele quebraria a idempotência já fechada do AD.1
  // (AI.5). A checagem vem ANTES de olhar `tipoItem`/`protegido` de propósito: nenhum item de AD.1
  // muda de comportamento aqui, ponto final — só fases DEPOIS de AD.1 chegam nas linhas abaixo.
  if (fase === 'AD.1') return { decisao: 'recusa', classe: 'RECUSADO-IDENTIFICADOR-NU' };
  // AD.2 (`simbolo`, nome de função): o item É o próprio símbolo aparecendo nu — declaração
  // (`function paraContrato`) e chamada (`paraContrato(x)`) nunca vêm precedidas de `.`. Substitui
  // sem mais restrição — é exatamente o que a fase existe para renomear.
  //
  // AD.3 (`chave`, campo de manifesto): palavra COMUM (`nome`, `dados`, `id`...) com risco real de
  // colidir com variável local sem nenhuma relação com manifesto. Só substitui em ACESSO DE
  // PROPRIEDADE cuja BASE é uma das `IDENTIFICADORES_DE_MANIFESTO` (`manifesto.nome`,
  // `ctx.manifesto.envRequerido`, `modulo.rotaBase`) — `.` antes sozinho NÃO basta (`caso.nome`,
  // `req.permissoes` também têm `.` antes, e não são o manifesto; ver `baseConhecidaNaCadeia`).
  // Bare fica recusado mesmo em AD.3. Python não usa esta forma (chave sempre é string, ramo
  // 'string' acima).
  //
  // TERCEIRA FORMA (Bloco AD.3): chave nua como MEMBRO DE OBJETO/TIPO — `{ consome: [] }`,
  // `interface Manifesto { papel: Papel }`. Não é acesso de propriedade (não tem `.` antes) nem
  // declaração de variável solta: é um IDENTIFICADOR-CHAVE dentro de um bloco de valor/tipo de
  // manifesto reconhecido pela casca (`dentroDeBlocoDeManifesto`, contagem de profundidade de chave
  // desde `.manifesto(` ou `interface \w*Manifesto\w*`). Dentro do bloco, mesmo sem `.` antes, é
  // TÃO seguro quanto `baseConhecidaDeManifesto` — é exatamente aí que `nome`/`descricao` de
  // `cases.mjs` teriam colidido se o bloco não fosse reconhecido, e é por isso que a casca só liga
  // esta bandeira dentro do escopo estreito do reconhecedor, nunca em qualquer `{`.
  if (tipoItem === 'chave' && !contexto.baseConhecidaDeManifesto && !dentroDeBlocoDeManifesto) {
    return { decisao: 'recusa', classe: 'RECUSADO-IDENTIFICADOR-NU' };
  }
  if (protegido) return { decisao: 'recusa', classe: 'RECUSADO-LITERAL-PROTEGIDO' };
  return { decisao: 'substitui', classe: 'identificador' };
}

/**
 * Varre UMA linha atrás de ocorrências de `antigo` (pelo regex do `tipo`) e devolve cada uma já
 * classificada — `{ coluna, classe, decisao }[]`. `formato` é `{ marcador, yaml }` (ver
 * `formatoDoArquivo`); comentário de bloco/docstring fica fora deste núcleo por linha — a casca
 * trata via `emBloco`/`cerca` antes de chamar (mesmo padrão de `classificarLinhas` em
 * verify-citations.mjs), sinalizando com `jaEmComentario`.
 *
 * `dentroDeArrayProtegido` (Bloco AI, AI.5) — a casca sinaliza que a linha está dentro do array/Set
 * de uma das `CONSTANTES_COM_ARRAY_PROTEGIDO`: todo literal que TAMBÉM está em `literaisProtegidos`
 * fica protegido aqui, mesmo sem o marcador de linha (`id:`/`regra:`/`papel:`) que
 * `protegidoNestaLinha` exige — é o reconhecedor por NOME DA CONSTANTE, não por marcador na mesma
 * linha, que `REGRAS_DE_EXTRACAO`/`CAMPOS_OBRIGATORIOS` (arrays NUS) precisam.
 *
 * `fase` (Bloco AD, resolução B1/B2/B3) — default `'AD.1'`, o comportamento histórico, para toda
 * chamada existente (autoteste, principalmente) continuar EXATAMENTE como antes sem precisar
 * mudar uma linha. Só quem processa uma fase de verdade (`classificarArquivo`, via `item.fase`)
 * passa outra coisa.
 *
 * `dentroDeBlocoDeManifesto` (Bloco AD.3, TERCEIRA FORMA) — mesmo espírito de
 * `dentroDeArrayProtegido`: a casca sinaliza, por contagem de profundidade de chave desde a linha
 * que abriu `.manifesto(`/`interface \w*Manifesto\w*`, que esta linha está dentro do bloco. Só
 * afeta `tipoItem === 'chave'` sem `baseConhecidaDeManifesto` — ver `decidir`.
 */
export function ocorrenciasClassificadasNaLinha(
  linha, antigo, tipo, formato, jaEmComentario, literaisProtegidos, dentroDeArrayProtegido = false,
  fase = 'AD.1', dentroDeBlocoDeManifesto = false,
) {
  const re = regexDoTipo(antigo, tipo);
  const strings = jaEmComentario ? [] : stringsDaLinha(linha);
  const inicioComentario = jaEmComentario ? 0 : inicioComentarioDeLinha(linha, strings, formato.marcador);
  const linhaEhImport = ehLinhaDeImportPython(linha);
  const valorYaml = formato.yaml && !jaEmComentario ? valorYamlNaoAspeadoNaLinha(linha) : null;
  const achados = [];
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(linha)) !== null) {
    const pos = m.index;
    const emComentario = jaEmComentario || (inicioComentario !== -1 && pos >= inicioComentario);
    let contexto;
    if (emComentario) {
      const textoComentario = jaEmComentario ? linha : linha.slice(inicioComentario);
      const posicaoRelativa = jaEmComentario ? pos : pos - inicioComentario;
      contexto = { tipo: 'comentario', texto: textoComentario, posicao: posicaoRelativa, tamanho: antigo.length };
    } else {
      const stringEnvolvente = strings.find((s) => pos >= s.inicio && pos + antigo.length <= s.fim);
      const posicaoNaCrase = stringEnvolvente ? pos - (stringEnvolvente.inicio + 1) : -1;
      const ehCrase = stringEnvolvente !== undefined && linha[stringEnvolvente.inicio] === '`';
      const ehFStringPython = stringEnvolvente !== undefined && !ehCrase
        && ehFString(linha, stringEnvolvente.inicio);
      const ehInterpolacaoDeCrase = stringEnvolvente !== undefined
        && (ehCrase || ehFStringPython)
        && regioesDeInterpolacao(stringEnvolvente.conteudo, ehCrase)
          .some((r) => posicaoNaCrase >= r.inicio && posicaoNaCrase + antigo.length <= r.fim);
      if (stringEnvolvente && !ehInterpolacaoDeCrase) {
        contexto = {
          tipo: 'string',
          conteudo: stringEnvolvente.conteudo,
          posicao: posicaoNaCrase,
          tamanho: antigo.length,
        };
      } else if (stringEnvolvente && ehInterpolacaoDeCrase) {
        contexto = {
          tipo: 'codigo',
          linhaEhImport,
          baseConhecidaDeManifesto: baseConhecidaNaCadeia(linha, pos),
        };
      } else if (valorYaml && pos >= valorYaml.inicio && pos + antigo.length <= valorYaml.fim) {
        contexto = {
          tipo: 'string',
          conteudo: valorYaml.conteudo,
          posicao: pos - valorYaml.inicio,
          tamanho: antigo.length,
        };
      } else {
        // `baseConhecidaDeManifesto` (B2, endurecido no Bloco AD.3): só importa pro ramo 'codigo'
        // de 'chave' — `manifesto.nome` tem `.` imediatamente antes de `nome` E a base é
        // `manifesto` (lista fechada `IDENTIFICADORES_DE_MANIFESTO`); `const nome = x` não tem
        // ponto nenhum, `caso.nome`/`req.permissoes` têm ponto mas base FORA da lista. Barato de
        // calcular sempre, ignorado pelos outros tipos.
        contexto = {
          tipo: 'codigo',
          linhaEhImport,
          baseConhecidaDeManifesto: baseConhecidaNaCadeia(linha, pos),
        };
      }
    }
    const protegidoBase = protegidoNestaLinha(linha, antigo, literaisProtegidos)
      || (dentroDeArrayProtegido && (literaisProtegidos?.has(antigo) ?? false));
    // B3: a fase ATUAL sendo a exceção declarada do literal veta TODA fonte de proteção acima —
    // marcador, `true` incondicional ou o bônus de array — não só uma.
    const protegido = protegidoBase && !protecaoSuspensaNestaFase(linha, antigo, literaisProtegidos, fase);
    const { decisao, classe } = decidir(contexto, antigo, tipo, protegido, fase, dentroDeBlocoDeManifesto);
    achados.push({ coluna: pos, decisao, classe });
  }
  return achados;
}

/** Aplica as substituições de UMA linha na ORDEM DECRESCENTE de coluna (senão os índices das
 * anteriores deslocam). Só as marcadas `decisao: 'substitui'`. */
export function aplicarNaLinha(linha, ocorrencias, antigo, novo) {
  let resultado = linha;
  const emOrdem = [...ocorrencias].filter((o) => o.decisao === 'substitui').sort((a, b) => b.coluna - a.coluna);
  for (const oc of emOrdem) {
    resultado = resultado.slice(0, oc.coluna) + novo + resultado.slice(oc.coluna + antigo.length);
  }
  return resultado;
}

// ================================================================================================
// CASCA — toca disco.
// ================================================================================================

const IGNORAR_NA_VARREDURA = new Set(['node_modules', '.git', '__pycache__', '.venv', 'dist', 'generated', '.ruff_cache', '.mypy_cache']);
// Conserto (d): `.md` entra no alvo. `arquivosAlvo()` só varre bindings/tools/tests — `doutrina/`
// nunca é visitada, então a restrição "md só fora de doutrina" é automática, não uma exclusão extra.
const EXT_ALVO = ['.mjs', '.ts', '.tsx', '.js', '.jsx', '.py', '.json', '.yaml', '.yml', '.toml', '.sql', '.md',
  '.gitignore', '.prettierignore', '.env.example', 'pre-commit', 'pre-push'];

// Achado ao rodar --relatorio pela primeira vez: `pre-commit`/`pre-push`/`.gitignore`/
// `.prettierignore` não têm conceito de "identificador de código" NENHUM — fora de comentário, todo
// conteúdo é um padrão de glob ou um comando de shell citando caminho de verdade
// (`node ferramentas/verificar-commit.mjs`, `**/gerados/*`, `ferramentas/`), nunca uma variável a
// proteger. O conserto (f) (identificador nu não é alvo) presumia que "código" sempre tem semântica
// de identificador — falso para esses quatro formatos. Tratá-los como `comentarioTotal` (mesmo
// mecanismo do conserto (a) para extensão desconhecida) resolve certo: token com barra/extensão
// substitui, o resto recusa — sem inventar uma terceira regra.
const NOMES_COMENTARIO_TOTAL = new Set(['pre-commit', 'pre-push']);
const SUFIXOS_COMENTARIO_TOTAL = ['.gitignore', '.prettierignore'];
const MARCADOR_POR_SUFIXO = [
  ['.py', '#'], ['.toml', '#'], ['.yaml', '#'], ['.yml', '#'], ['.env.example', '#'],
  ['.sql', '--'],
  ['.mjs', '//'], ['.ts', '//'], ['.tsx', '//'], ['.js', '//'], ['.jsx', '//'],
];

/** Conserto (a): marcador de comentário POR EXTENSÃO, não mais uma flag `ehPython`. `.json` não tem
 * sintaxe de comentário (`marcador: null`, mas strings continuam detectadas — sem risco de prosa
 * fora de string em JSON válido). `pre-commit`/`pre-push`/`.gitignore`/`.prettierignore` caem em
 * `comentarioTotal` de propósito (achado acima). Extensão fora de toda lista (inclui `.md`) cai no
 * mesmo `comentarioTotal` pelo motivo original: "arquivo sem marcador conhecido: recusa por padrão". */
export function formatoDoArquivo(caminho) {
  const nome = caminho.split(/[\\/]/).pop();
  if (NOMES_COMENTARIO_TOTAL.has(nome) || SUFIXOS_COMENTARIO_TOTAL.some((s) => nome.endsWith(s))) {
    return { marcador: null, comentarioTotal: true, yaml: false, ehPython: false };
  }
  if (nome.endsWith('.json')) return { marcador: null, comentarioTotal: false, yaml: false, ehPython: false };
  for (const [sufixo, marcador] of MARCADOR_POR_SUFIXO) {
    if (nome.endsWith(sufixo)) {
      return { marcador, comentarioTotal: false, yaml: sufixo === '.yaml' || sufixo === '.yml', ehPython: sufixo === '.py' };
    }
  }
  return { marcador: null, comentarioTotal: true, yaml: false, ehPython: false };
}

// Território de manifesto real (fase AD.3) — NUNCA entra numa rodada AD.1. A exclusão de
// `modulo.json` (achado do revisor, Bloco AI AI.5) NUNCA foi sobre o arquivo citar o PRÓPRIO NOME
// — era contra o CONTEÚDO dele colidir com item de pasta de OUTRA fase: `"portas"` é chave de
// manifesto (AD.3) e, ao mesmo tempo, texto idêntico ao item pasta `portas→ports` do AD.1. Uma
// reescrita anterior tirou esta linha com a justificativa errada ("não cita a si mesmo por nome")
// e `--aplicar --fase AD.1` voltou a corromper `"portas"` nos três `_template/modulo.json`.
// `projeto.json` fica de fora da exclusão: não tem `portas` no vocabulário hoje (medido).
//
// FASE-CONDICIONAL agora (Bloco AD.3, mesmo `arquivo` git-mv'd para `module.json` neste round):
// a exclusão acima protegia o CONTEÚDO do arquivo de AD.1/AD.2 — mas AD.3 É a fase que existe pra
// reescrever esse conteúdo (as 19 chaves). Blanket exclusion sem exceção de fase deixaria AD.3
// incapaz de tocar o próprio arquivo que criou pra renomear — B3 de novo, um nível acima (fase do
// ARQUIVO, não do literal). `modulo.schema.json`/`projeto.schema.json` NÃO precisam da mesma
// exceção: já foram git-mv'd para `module.schema.json`/`project.schema.json` e reescritos à mão
// este round (achado no `generate-port-schemas.mjs`, ver histórico), então o path antigo nunca
// mais existe pra esta regex casar — mantidas aqui só por documentação do que já foi coberto.
const RE_MODULO_JSON = /(^|[\\/])modulo\.json$/;
const CAMINHOS_EXCLUIDOS_SEMPRE = [
  /(^|[\\/])modulo\.schema\.json$/,
  /(^|[\\/])projeto\.schema\.json$/,
  // Auto-referência: as fixtures do autoteste PRECISAM conter os nomes antigos de verdade (é o que
  // prova a classificação), então este arquivo comeria seus próprios dados de teste se se varresse.
  /(^|[\\/])apply-rename\.mjs$/,
  // O MESMO problema, pior: a coluna `antigo` de CADA item É o nome velho — string sem espaço,
  // exatamente a forma que a regra do delimitador aceita. Sem esta exclusão a primeira rodada real
  // reescreveu os 50 itens para `antigo === novo`, destruindo o mapeamento.
  /(^|[\\/])rename-inventory\.json$/,
  // O MESMO problema, terceira vez (Bloco AI): o artefato de recusas guarda `antigo` E `contexto` —
  // a linha ORIGINAL de cada recusa, citando o nome velho de verdade. Sem esta exclusão, gravar o
  // artefato faz a PRÓPRIA GRAVAÇÃO aparecer como centenas de recusas novas na rodada seguinte —
  // achado rodando `--relatorio` duas vezes seguidas logo depois de `--gravar-recusas`.
  /(^|[\\/])rename-refusals\.json$/,
];

function caminhoExcluido(caminho, fase) {
  if (RE_MODULO_JSON.test(caminho) && fase !== 'AD.3') return true;
  return CAMINHOS_EXCLUIDOS_SEMPRE.some((re) => re.test(caminho));
}

function arquivos(pasta, acc = []) {
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    if (IGNORAR_NA_VARREDURA.has(entrada.name)) continue;
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) arquivos(caminho, acc);
    else if (EXT_ALVO.some((ext) => entrada.name.endsWith(ext))) acc.push(caminho);
  }
  return acc;
}

// `funcionamento-esperado.md` mora na RAIZ DA BASE (irmão de `plan-3.md`), fora de `doutrina/` — mas
// ao contrário de um plano (registro histórico, Bloco AD.5), é documentação VIVA: descreve o template
// que existe HOJE, não uma decisão datada. Achado no Bloco AD.4 (checagem de drift pedida pelo
// revisor): nunca foi varrido por nenhuma fase — nem `arquivosAlvo()` descia na raiz da base, nem
// `verify-citations.mjs` o alcança (não é `doutrina/`, nem `skills/`) — e por isso sobreviveu com
// vocabulário de ANTES do AD.1 inteiro (`ferramentas/`, `raiz/`, `modulos/`, `portas/`, `motor/`,
// `dominio/`, `npm run verificar`/`iniciar`). Incluído aqui por nome explícito, não por varrer a raiz
// inteira — a raiz da base também tem os planos, que este arquivo NÃO é.
const ARQUIVOS_DE_DOC_VIVA_NA_RAIZ = ['funcionamento-esperado.md'];

function arquivosAlvo(fase) {
  const brutos = [
    ...arquivos(join(RAIZ_TEMPLATE, 'bindings')),
    ...arquivos(join(RAIZ_TEMPLATE, 'tools')),
    ...arquivos(join(RAIZ_TEMPLATE, 'tests')),
    ...arquivos(join(RAIZ_TEMPLATE, 'doutrina')),
    ...ARQUIVOS_DE_DOC_VIVA_NA_RAIZ.map((nome) => join(RAIZ_BASE, nome)).filter((c) => existsSync(c)),
  ];
  return brutos.filter((c) => !caminhoExcluido(c.split('\\').join('/'), fase));
}

/** O inventário declara QUAIS literais são protegidos (com o motivo, para auditoria); o PADRÃO de
 * linha que decide QUANDO a proteção vale é código (`PADROES_DE_PROTECAO`), não dado — é regra de
 * classificação, não fato de nomenclatura. Item do inventário sem padrão conhecido é erro de
 * configuração, não silêncio: falha alto e cedo. */
function lerInventario() {
  const bruto = JSON.parse(readFileSync(CAMINHO_INVENTARIO, 'utf8'));
  const literaisProtegidos = new Map();
  for (const { valor } of bruto.literaisProtegidos ?? []) {
    const padroes = PADROES_DE_PROTECAO.get(valor);
    if (!padroes) throw new Error(`literaisProtegidos: "${valor}" nao tem padrao de linha declarado em PADROES_DE_PROTECAO`);
    literaisProtegidos.set(valor, padroes);
  }
  return { itens: bruto.itens ?? [], literaisProtegidos };
}

/** Classifica TODAS as ocorrências de um item numa linha, respeitando bloco/docstring já aberto por
 * linha anterior. `formato.comentarioTotal` pula a máquina de estado inteira: toda linha é
 * comentário (conserto (a), extensão sem marcador conhecido). */
export function classificarArquivo(texto, item, formato, literaisProtegidos) {
  const linhas = texto.split(/\r?\n/);
  const porLinha = [];
  if (formato.comentarioTotal) {
    linhas.forEach((linha) => {
      porLinha.push(ocorrenciasClassificadasNaLinha(linha, item.antigo, item.tipo, formato, true, literaisProtegidos, false, item.fase, false));
    });
    return { linhas, porLinha };
  }
  let emBloco = false;
  let cerca = null;
  // AI.5: array/Set de uma CONSTANTES_COM_ARRAY_PROTEGIDO — do `const X = [`/`new Set([` que abre
  // até o `]`/`]);` que fecha, sozinho na linha (as duas constantes hoje são só isso). Abre ANTES
  // de classificar a própria linha de abertura (que não tem literal, mas não custa) e fecha DEPOIS
  // da linha de fechamento, pelo mesmo motivo.
  let dentroDeArrayProtegido = false;
  // AD.3: profundidade do bloco `.manifesto(`/`interface ...Manifesto... {` — ver
  // `RE_ABRE_BLOCO_DE_MANIFESTO`. `dentroDeBlocoDeManifesto` desta linha é lido ANTES de atualizar
  // a profundidade (mesma ordem de `dentroDeArrayProtegido` acima: abre conta na própria linha de
  // abertura), e só soma/subtrai chaves quando já dentro do bloco OU quando esta linha é quem abre
  // — chave solta em código comum, fora de qualquer `.manifesto(`/`interface Manifesto`, nunca
  // mexe na profundidade.
  let profundidadeDeManifesto = 0;
  linhas.forEach((linha) => {
    const limpa = linha.trim();
    if (RE_ABRE_ARRAY_PROTEGIDO.test(linha)) dentroDeArrayProtegido = true;
    const dentroDeBlocoDeManifesto = profundidadeDeManifesto > 0 || RE_ABRE_BLOCO_DE_MANIFESTO.test(linha);
    if (dentroDeBlocoDeManifesto) {
      const saldoDeChaves = (linha.match(/\{/g) ?? []).length - (linha.match(/\}/g) ?? []).length;
      profundidadeDeManifesto = Math.max(0, profundidadeDeManifesto + saldoDeChaves);
    }
    if (cerca !== null) {
      porLinha.push(ocorrenciasClassificadasNaLinha(linha, item.antigo, item.tipo, formato, true, literaisProtegidos, dentroDeArrayProtegido, item.fase, dentroDeBlocoDeManifesto));
      if (limpa.includes(cerca)) cerca = null;
      return;
    }
    if (emBloco) {
      porLinha.push(ocorrenciasClassificadasNaLinha(linha, item.antigo, item.tipo, formato, true, literaisProtegidos, dentroDeArrayProtegido, item.fase, dentroDeBlocoDeManifesto));
      if (limpa.includes('*/')) emBloco = false;
      return;
    }
    const aspas = formato.ehPython ? ['"""', "'''"].find((d) => limpa.includes(d)) : undefined;
    if (aspas !== undefined) {
      porLinha.push(ocorrenciasClassificadasNaLinha(linha, item.antigo, item.tipo, formato, true, literaisProtegidos, dentroDeArrayProtegido, item.fase, dentroDeBlocoDeManifesto));
      if ((limpa.split(aspas).length - 1) % 2 === 1) cerca = aspas;
      return;
    }
    if (formato.marcador === '//' && limpa.startsWith('/*')) {
      porLinha.push(ocorrenciasClassificadasNaLinha(linha, item.antigo, item.tipo, formato, true, literaisProtegidos, dentroDeArrayProtegido, item.fase, dentroDeBlocoDeManifesto));
      if (!limpa.includes('*/')) emBloco = true;
      return;
    }
    porLinha.push(ocorrenciasClassificadasNaLinha(linha, item.antigo, item.tipo, formato, false, literaisProtegidos, dentroDeArrayProtegido, item.fase, dentroDeBlocoDeManifesto));
    if (dentroDeArrayProtegido && RE_FECHA_ARRAY_PROTEGIDO.test(linha)) dentroDeArrayProtegido = false;
  });
  return { linhas, porLinha };
}

/**
 * `simbolo`/`chave` são vocabulário do ESQUELETO — decisão 3/8 do Bloco AC. `tools/` E `tests/`
 * são ferramental de quem MANTÉM A BASE (nunca do projeto gerado — mesmo raciocínio da decisão 4,
 * "ferramental vendorizado", estendido a `tests/` pelo mesmo motivo que já vale para
 * `verify-map.mjs`/`template-self-test.mjs`: moram fora de `tools/` só por não entrarem no Bloco K
 * por binding, não porque sejam do esqueleto). Achado ao rodar `--relatorio --fase AD.2`
 * (plan-3.md Bloco AD, Rodada 1): sem esta fronteira, o item `lerTexto`/`rodarAutoteste` casava
 * DENTRO de `tests/verify-citations.mjs`/`verify-map.mjs` — funções da PRÓPRIA base que só
 * coincidem de nome com as do molde, nunca deveriam substituir. `pasta`/`arquivo` continuam
 * varrendo tudo: são caminho/estrutura compartilhados entre a base e o projeto gerado (AD.1 já
 * prova isso fechado).
 *
 * `doutrina/` entra na MESMA fronteira que `bindings/`, não na de `tools/`/`tests/` — achado ao
 * abrir o Bloco AD.4: `doutrina/*.md` nunca DECLARA função nenhuma (é prosa, sempre
 * `comentarioTotal`), então o risco que motivou a fronteira acima — nome de função da PRÓPRIA base
 * coincidindo por acaso com nome do molde — não existe aqui. O que existe é CITAÇÃO: `criarApp`/
 * `resolverDependencias`, entre crases, continuavam em português mesmo depois do AD.2 porque esta
 * função barrava `simbolo` fora de `bindings/`, e `doutrina/` nunca foi `bindings/`.
 *
 * `ARQUIVOS_DE_DOC_VIVA_NA_RAIZ` (`funcionamento-esperado.md`) pelo MESMO motivo de `doutrina/`: é
 * prosa que cita o template, nunca código que o declara — sem risco de colisão de nome com função da
 * base. Comparação por item da lista (não por prefixo de pasta, que não existe pra um arquivo solto
 * na raiz).
 *
 * CORREÇÃO À NOTA ACIMA (Bloco AD.3): "tools/ nunca vai pro projeto gerado" está ERRADO para
 * `tools/` — medido em `create-project.mjs`: `cpSync(join(RAIZ_TEMPLATE, 'tools'), ...)` copia
 * `tools/` inteiro pro projeto gerado (`tests/` continua nunca copiado, essa metade da nota
 * segue valendo). Não muda a conclusão de `simbolo` — o risco ali é NOME DE FUNÇÃO coincidindo por
 * acaso com o de uma função da própria base, ida ou não ao projeto gerado é irrelevante pra esse
 * risco — só corrige o FATO citado como motivo.
 *
 * `chave`, ao contrário de `simbolo`, ganha fronteira PRÓPRIA aqui (Bloco AD.3): `tools/gate/
 * rules/*.mjs` (as ~40 regras que leem `ctx.manifesto.<chave>`) e `tools/gate/tests/cases.mjs` (a
 * maior concentração da TERCEIRA FORMA, `.manifesto((x) => ({...}))`) SÃO o consumidor primário das
 * 19 chaves do manifesto — excluí-los deixaria a citação viva pelo próprio motivo que a campanha
 * existe pra fechar. O que motivou excluir `tools/`/`tests/` de `simbolo` (nome de função colidindo
 * à toa) tem CONTRAPARTE PRÓPRIA pra `chave` — `caso.nome`/`req.permissoes`/`state.permissoes`/
 * `corpo.rotaBase`, medido no corpus inteiro — mas essa é resolvida na origem, por
 * `IDENTIFICADORES_DE_MANIFESTO` (base do acesso pontilhado) e `dentroDeBlocoDeManifesto` (terceira
 * forma), não pela fronteira de arquivo: `decidir()` já recusa essas ocorrências onde quer que
 * apareçam. Por isso `chave` não filtra por pasta nenhuma — a rede de segurança está na decisão,
 * não no arquivo.
 */
export function itemAplicaAoArquivo(item, caminho) {
  if (item.tipo === 'chave') return true;
  if (item.tipo !== 'simbolo') return true;
  const raizBindings = join(RAIZ_TEMPLATE, 'bindings') + sep;
  const raizDoutrina = join(RAIZ_TEMPLATE, 'doutrina') + sep;
  const docsVivasNaRaiz = new Set(ARQUIVOS_DE_DOC_VIVA_NA_RAIZ.map((nome) => join(RAIZ_BASE, nome)));
  return caminho.startsWith(raizBindings) || caminho.startsWith(raizDoutrina) || docsVivasNaRaiz.has(caminho);
}

function processarArquivo(caminho, itensTodos, literaisProtegidos, aplicar) {
  const textoOriginal = readFileSync(caminho, 'utf8');
  const formato = formatoDoArquivo(caminho);
  let linhasAtuais = textoOriginal.split(/\r?\n/);
  const registros = [];
  const itens = itensTodos.filter((item) => itemAplicaAoArquivo(item, caminho));

  for (const item of itens) {
    const { porLinha } = classificarArquivo(linhasAtuais.join('\n'), item, formato, literaisProtegidos);
    linhasAtuais = linhasAtuais.map((linha, indice) => {
      const ocorrencias = porLinha[indice] ?? [];
      for (const oc of ocorrencias) {
        registros.push({ arquivo: caminho, linha: indice + 1, classe: oc.classe, antigo: item.antigo, novo: item.novo, contexto: linha.trim().slice(0, 140) });
      }
      return aplicar ? aplicarNaLinha(linha, ocorrencias, item.antigo, item.novo) : linha;
    });
  }

  if (aplicar && linhasAtuais.join('\n') !== textoOriginal.replace(/\r\n/g, '\n')) {
    writeFileSync(caminho, linhasAtuais.join('\n'), 'utf8');
  }
  return registros;
}

function relatarRegistros(fase, itensCount, alvosCount, registros, rotulo) {
  const porClasse = {};
  for (const r of registros) porClasse[r.classe] = (porClasse[r.classe] ?? 0) + 1;

  process.stdout.write(`\n=== apply-rename --fase ${fase} ${rotulo} ===\n`);
  process.stdout.write(`itens do inventario nesta fase: ${itensCount}\n`);
  process.stdout.write(`arquivos varridos: ${alvosCount}\n`);
  process.stdout.write('totais por classificacao:\n');
  for (const [classe, n] of Object.entries(porClasse).sort()) process.stdout.write(`  ${classe}: ${n}\n`);

  const recusas = registros.filter((r) => r.classe.startsWith('RECUSADO'));
  process.stdout.write(`\n=== RECUSAS (${recusas.length}) — lista completa ===\n`);
  for (const r of recusas) {
    process.stdout.write(`  ${relative(RAIZ_BASE, r.arquivo).split('\\').join('/')}:${r.linha} [${r.antigo}] (${r.classe}) ${r.contexto}\n`);
  }
}

// ================================================================================================
// O ARTEFATO DE RECUSAS (Bloco AI, plan-3.md) — falso NEGATIVO, não falso positivo.
//
// `--diferencial` e `verify-citations --depois` prova "não corrompeu" (prosa que virou inglês por
// engano). Nenhum dos dois prova "não esqueceu": uma RECUSA é o próprio motor dizendo "isto pode
// não devesse ter mudado, decida você" — e até aqui essa decisão só existia no stdout de quem
// rodou o comando, descartada no instante seguinte. Foi assim que `create-module.mjs:162`
// (`'from core.motor import gerar_artefato\n'`, um import Python DENTRO de uma string JS — sem
// `/` para o heurístico de caminho reconhecer, então RECUSADO-POR-PROSA) sobreviveu às duas redes:
// a recusa foi impressa, ninguém olhou, e só o Bloco K, três passos adiante, provou que ESTA
// recusa específica devia ter sido um conserto manual, não um silêncio.
// ================================================================================================

function lerRecusasSalvas() {
  if (!existsSync(CAMINHO_RECUSAS)) return [];
  const bruto = JSON.parse(readFileSync(CAMINHO_RECUSAS, 'utf8'));
  return bruto.recusas ?? [];
}

/** Identidade de uma recusa: os quatro campos que, juntos, dizem "é a MESMA recusa de antes".
 * Qualquer um mudando — a linha se moveu, o token mudou, a própria classificação mudou — conta
 * como recusa DIFERENTE, nunca a mesma revista. Não inclui `contexto`: o texto ao redor pode
 * mudar por um motivo alheio (outra linha da mesma função foi editada) sem que a recusa em si
 * tenha mudado de natureza. */
function chaveDaRecusa(r) {
  return `${r.fase}\u0000${r.arquivo}\u0000${r.linha}\u0000${r.antigo}\u0000${r.classe}`;
}

/** As recusas ATUAIS desta fase, no formato do artefato (caminho relativo à raiz do repositório,
 * barra normal — o mesmo formato que `relatarRegistros` já imprime). */
function recusasDaFase(fase, registros) {
  return registros
    .filter((r) => r.classe.startsWith('RECUSADO'))
    .map((r) => ({
      fase,
      arquivo: relative(RAIZ_BASE, r.arquivo).split('\\').join('/'),
      linha: r.linha,
      antigo: r.antigo,
      classe: r.classe,
      contexto: r.contexto,
    }));
}

/** `novas`: recusa atual que o artefato salvo não conhece — exige revisão humana antes de
 * `--gravar-recusas` aceitar. `resolvidas`: recusa que o artefato salvo tinha e que sumiu (a
 * linha virou SUBSTITUI, ou o trecho não existe mais) — boa notícia, só informativa, nunca reprova. */
function compararRecusas(fase, atuais, salvasTodas) {
  const salvas = salvasTodas.filter((s) => s.fase === fase);
  const chavesSalvas = new Set(salvas.map(chaveDaRecusa));
  const chavesAtuais = new Set(atuais.map(chaveDaRecusa));
  return {
    novas: atuais.filter((r) => !chavesSalvas.has(chaveDaRecusa(r))),
    resolvidas: salvas.filter((r) => !chavesAtuais.has(chaveDaRecusa(r))),
  };
}

function relatarComparacaoDeRecusas(novas, resolvidas) {
  if (resolvidas.length > 0) {
    process.stdout.write(`\n=== recusas RESOLVIDAS desde o artefato salvo (${resolvidas.length}) — informativo ===\n`);
    for (const r of resolvidas) process.stdout.write(`  ${r.arquivo}:${r.linha} [${r.antigo}] (${r.classe})\n`);
  }
  if (novas.length === 0) {
    process.stdout.write(`\nrecusas NOVAS vs. ${relative(RAIZ_BASE, CAMINHO_RECUSAS).split('\\').join('/')}: 0 — nada a revisar\n`);
    return;
  }
  process.stdout.write(`\n=== recusas NOVAS vs. ${relative(RAIZ_BASE, CAMINHO_RECUSAS).split('\\').join('/')} (${novas.length}) — REVISÃO OBRIGATÓRIA ===\n`);
  for (const r of novas) {
    process.stdout.write(`  ${r.arquivo}:${r.linha} [${r.antigo}] (${r.classe}) ${r.contexto}\n`);
  }
  process.stdout.write('\nCada uma acima é ou (a) prosa legítima nunca vista nesta forma — revise e rode de\n'
    + 'novo com --gravar-recusas para aceitar, ou (b) uma referência que deveria ter virado SUBSTITUI e\n'
    + 'não virou — conserte a ORIGEM (o inventário, a classificação, ou o arquivo), nunca este artefato.\n');
}

/** Escreve o artefato: substitui SÓ as entradas desta fase pelas recusas atuais, preservando as
 * de outras fases intactas. É a decisão explícita — nunca chamada por `--relatorio`/`--aplicar`
 * sozinhos, só quando `--gravar-recusas` está no argv, o mesmo padrão de `--aplicar` exigir opt-in. */
function gravarRecusas(fase, atuais) {
  const salvasTodas = lerRecusasSalvas().filter((s) => s.fase !== fase);
  const recusas = [...salvasTodas, ...atuais].sort((a, b) => chaveDaRecusa(a).localeCompare(chaveDaRecusa(b)));
  const conteudo = {
    _comentario: 'Lista VERSIONADA das recusas que apply-rename.mjs ja revisou e aceitou — mesma '
      + 'disciplina de config/conformidade.json (04-regras.md): comeca vazia, cresce so por decisao '
      + 'explicita (--gravar-recusas), nunca por heuristica. --relatorio/--aplicar comparam as recusas '
      + 'ATUAIS contra esta lista: recusa NOVA (arquivo+linha+antigo+classe ausente daqui) reprova e '
      + 'exige revisao humana. Fecha o que --diferencial e verify-citations --depois nao cobrem: falso '
      + 'NEGATIVO — referencia que devia mudar e nao mudou, ou recusa que deveria ter sido um SUBSTITUI '
      + 'de verdade (plan-3.md Bloco AI). Aqueles provam "nao corrompeu"; isto prova "nao esqueceu".',
    _exemplo: {
      fase: 'AD.1', arquivo: 'specs/_estrutura_modulos/bindings/python/root/src/composicao.py', linha: 86,
      antigo: 'portas', classe: 'RECUSADO-LITERAL-PROTEGIDO',
      contexto: 'for porta in modulo["portas"]:',
    },
    recusas,
  };
  writeFileSync(CAMINHO_RECUSAS, `${JSON.stringify(conteudo, null, 2)}\n`, 'utf8');
  process.stdout.write(`\ngravado: ${recusas.filter((r) => r.fase === fase).length} recusa(s) da fase `
    + `${fase} aceitas em ${relative(RAIZ_BASE, CAMINHO_RECUSAS).split('\\').join('/')}\n`);
}

/**
 * AI.4 — a invariante que faltava. "Não esqueceu de revisar" (o artefato de recusas) e "não sobrou
 * nada por fazer" são DUAS perguntas — reinjetar o defeito histórico em `create-module.mjs` mostrou
 * que a primeira sozinha deixa passar: a ocorrência aparece nos "totais por classificacao"
 * (`identificador: 1`), mas nada LISTA nem REPROVA por ela. `pendentesDaFase` é a segunda pergunta:
 * todo registro cuja decisão é `substitui` (qualquer classe que NÃO comece com `RECUSADO`) e que
 * `--relatorio` (dry-run) ainda encontra na árvore é trabalho não feito — para uma fase que já foi
 * aplicada e commitada, isso só pode significar regressão. Só faz sentido em modo `--relatorio`:
 * em `--aplicar`, os mesmos registros SÃO exatamente o que acabou de ser escrito, o estado desejado
 * sendo alcançado, não uma pendência.
 */
function pendentesDaFase(fase, registros) {
  return registros
    .filter((r) => !r.classe.startsWith('RECUSADO'))
    .map((r) => ({
      fase,
      arquivo: relative(RAIZ_BASE, r.arquivo).split('\\').join('/'),
      linha: r.linha,
      antigo: r.antigo,
      classe: r.classe,
      contexto: r.contexto,
    }));
}

function relatarPendencias(pendentes) {
  if (pendentes.length === 0) {
    process.stdout.write('\npendencias (substituicao ainda nao aplicada nesta arvore): 0\n');
    return;
  }
  process.stdout.write(`\n=== PENDENCIAS — substituicao NAO aplicada (${pendentes.length}) ===\n`);
  for (const p of pendentes) {
    process.stdout.write(`  ${p.arquivo}:${p.linha} [${p.antigo}] (${p.classe}) ${p.contexto}\n`);
  }
  process.stdout.write('\nCada uma acima e um nome ANTIGO que o motor decidiu SUBSTITUIR mas que ainda\n'
    + 'esta na arvore, sem terem sido escritas — rode --aplicar, ou se a fase ja foi aplicada e\n'
    + 'commitada, investigue: e regressao (plan-3.md Bloco AI, AI.4).\n');
}

function rodar(fase, aplicar, gravar) {
  const { itens: todosItens, literaisProtegidos } = lerInventario();
  const itens = todosItens.filter((i) => i.fase === fase);
  if (itens.length === 0) {
    process.stdout.write(`nenhum item do inventario na fase ${fase}\n`);
    return 0;
  }
  const alvos = arquivosAlvo(fase);
  const registros = alvos.flatMap((caminho) => processarArquivo(caminho, itens, literaisProtegidos, aplicar));
  relatarRegistros(fase, itens.length, alvos.length, registros, aplicar ? '(APLICADO)' : '(dry-run)');

  const atuais = recusasDaFase(fase, registros);
  const { novas, resolvidas } = compararRecusas(fase, atuais, lerRecusasSalvas());
  relatarComparacaoDeRecusas(novas, resolvidas);
  if (gravar) gravarRecusas(fase, atuais);

  // Pendencia so faz sentido em dry-run: em --aplicar os mesmos registros acabaram de ser escritos.
  const pendentes = aplicar ? [] : pendentesDaFase(fase, registros);
  relatarPendencias(pendentes);

  const reprovaPorRecusaNova = !gravar && novas.length > 0;
  const reprovaPorPendencia = pendentes.length > 0;
  return reprovaPorRecusaNova || reprovaPorPendencia ? 1 : 0;
}

// ================================================================================================
// --diferencial — conserto (PASSO 4): confere o resultado escrito contra um clone pristino do
// commit-base, invertendo o inventário caminho a caminho. Para cada linha que MUDOU no diff, marca
// toda ocorrência de um token NOVO cercada de espaço em branco dos dois lados — depois do conserto
// (f) (identificador nu não é mais alvo em código), um token novo cercado de espaço só pode ter
// entrado ali por PROSA (substituição indevida), nunca por uma substituição legítima: caminho e
// identificador de import são sempre delimitados por `/`, `.`, aspas ou início/fim de token, não por
// espaço em branco puro dos dois lados.
// ================================================================================================

/** Achado ao rodar pela primeira vez: `_template/tests/contract/config.test.js` tem DOIS segmentos
 * renomeáveis (`tests` de `testes`→`tests` a nível de BASE, `contract` de `contrato`→`contract`) —
 * mas o `tests` por-módulo (convenção do framework, sempre em inglês) NUNCA foi `testes` no
 * pristino, só o `tests`/`testes` da FERRAMENTA da base é que mudou. Inverter TODO segmento
 * renomeável de uma vez (candidato único) erra: produz `testes/contrato/...`, que não existe —
 * "tests" ali nunca foi português. Não é substituição cega segmento-a-segmento junto; é
 * combinatória: cada segmento tenta [invertido, original], testa as combinações até achar o par
 * real. Poucos segmentos renomeáveis por caminho (no máximo 3-4) — o produto cartesiano é barato. */
function candidatosDeSegmento(segmento, itensFisicos) {
  const item = itensFisicos.find((i) => i.novo === segmento);
  return item ? [item.antigo, segmento] : [segmento];
}

function* combinacoes(listasPorSegmento, indice = 0, atual = []) {
  if (indice === listasPorSegmento.length) {
    yield atual.join('/');
    return;
  }
  for (const opcao of listasPorSegmento[indice]) {
    yield* combinacoes(listasPorSegmento, indice + 1, [...atual, opcao]);
  }
}

/** Acha o caminho pristino correspondente a um caminho do resultado, testando toda combinação de
 * segmento-invertido/segmento-original até achar uma que exista no disco pristino. */
function caminhoPristino(caminhoRelativo, raizPristina, itensFisicos) {
  const segmentos = caminhoRelativo.split('/');
  const listasPorSegmento = segmentos.map((s) => candidatosDeSegmento(s, itensFisicos));
  for (const candidato of combinacoes(listasPorSegmento)) {
    const caminhoAbs = join(raizPristina, 'specs', '_estrutura_modulos', candidato);
    if (existsSync(caminhoAbs)) return caminhoAbs;
  }
  return null;
}

/** Devolve os HUNKS do diff (`-U0`) como `{ menos: string[], mais: string[] }[]` — as linhas REMOVIDAS
 * e ADICIONADAS de cada bloco contíguo de mudança, sem o prefixo `-`/`+`. Hunk, não linha isolada:
 * um `+` só é suspeito se o token não já estivesse no `-` PAREADO — uma linha pode mudar por um
 * motivo (`ferramentas/empacotar.mjs` → `tools/package.mjs`) e conter, ILESO, um token que por
 * coincidência É IGUAL a um `novo` de outro item (`tests` como *loanword* de prosa em
 * `package.json`, nada a ver com a pasta `testes`→`tests`) — comparar linha inteira contra linha
 * inteira, não só "existe o token na linha nova", evita esse falso-positivo. */
function hunksDoDiff(caminhoPristinoAbs, caminhoAtualAbs) {
  let saida;
  try {
    saida = execFileSync('git', ['diff', '--no-index', '--no-color', '-U0', caminhoPristinoAbs, caminhoAtualAbs], { encoding: 'utf8' });
  } catch (erro) {
    // git diff --no-index sai 1 quando ha diferenca — nao e falha, a saida esta em stdout.
    saida = erro.stdout ?? '';
  }
  const linhas = saida.split('\n');
  const hunks = [];
  let atual = null;
  for (const l of linhas) {
    if (l.startsWith('@@')) {
      atual = { menos: [], mais: [] };
      hunks.push(atual);
    } else if (atual !== null && l.startsWith('-') && !l.startsWith('---')) {
      atual.menos.push(l.slice(1));
    } else if (atual !== null && l.startsWith('+') && !l.startsWith('+++')) {
      atual.mais.push(l.slice(1));
    }
  }
  return hunks;
}

function linhaContemTokenCercado(linha, token) {
  const re = new RegExp(`(?:^|\\s)${token.replace(ESCAPAR_REGEX, '\\$&')}(?:$|\\s)`);
  return re.test(linha);
}

/** Todo token de um `novo` de item PASTA/SIMBOLO (nunca ARQUIVO — nome+extensão substitui sempre,
 * por design, e É whitespace-bounded legitimamente em headers que citam a si mesmos, ex.:
 * `* package.mjs — compila...`; suspeita ali seria ruído, não sinal) cercado de whitespace numa
 * linha ADICIONADA do hunk, que NÃO aparecia (cercado do mesmo jeito) em NENHUMA linha REMOVIDA do
 * MESMO hunk — se já estava lá antes, sobreviveu ileso, não foi esta campanha que o colocou. */
function tokensNovosCercadosDeEspaco(hunk, itens) {
  const itensDeIdentificador = itens.filter((i) => i.tipo === 'pasta' || i.tipo === 'simbolo');
  const achados = [];
  for (const linha of hunk.mais) {
    for (const item of itensDeIdentificador) {
      if (!linhaContemTokenCercado(linha, item.novo)) continue;
      const jaExistiaAntes = hunk.menos.some((m) => linhaContemTokenCercado(m, item.novo));
      if (jaExistiaAntes) continue;
      achados.push({ token: item.novo, contexto: linha.trim().slice(0, 140) });
    }
  }
  return achados;
}

function rodarDiferencial(fase, raizPristina) {
  const { itens: todosItens } = lerInventario();
  const itens = todosItens.filter((i) => i.fase === fase);
  const itensFisicos = itens.filter((i) => i.tipo === 'pasta' || i.tipo === 'arquivo');
  if (itens.length === 0) {
    process.stdout.write(`nenhum item do inventario na fase ${fase}\n`);
    return 0;
  }
  const alvos = arquivosAlvo(fase);
  let suspeitas = 0;
  let semPar = 0;
  process.stdout.write(`\n=== apply-rename --fase ${fase} --diferencial ${raizPristina} ===\n`);
  for (const caminho of alvos) {
    const relativoTemplate = relative(RAIZ_TEMPLATE, caminho).split(sep).join('/');
    const pristino = caminhoPristino(relativoTemplate, raizPristina, itensFisicos);
    if (pristino === null) {
      semPar += 1;
      continue;
    }
    const hunks = hunksDoDiff(pristino, caminho);
    for (const hunk of hunks) {
      const achados = tokensNovosCercadosDeEspaco(hunk, itens);
      for (const a of achados) {
        suspeitas += 1;
        process.stdout.write(`  SUSPEITA ${relative(RAIZ_BASE, caminho).split('\\').join('/')} [${a.token}] ${a.contexto}\n`);
      }
    }
  }
  process.stdout.write(`\narquivos sem par pristino (novos, fora do diferencial): ${semPar}\n`);
  process.stdout.write(`linhas suspeitas (token novo cercado de espaco): ${suspeitas}\n`);
  return suspeitas === 0 ? 0 : 1;
}

// ================================================================================================
// AUTOTESTE
// ================================================================================================

const FMT_JS = { marcador: '//', comentarioTotal: false, yaml: false, ehPython: false };
const FMT_PY = { marcador: '#', comentarioTotal: false, yaml: false, ehPython: true };
const FMT_JSON = { marcador: null, comentarioTotal: false, yaml: false, ehPython: false };
const FMT_YAML = { marcador: '#', comentarioTotal: false, yaml: true, ehPython: false };
const FMT_TOML = { marcador: '#', comentarioTotal: false, yaml: false, ehPython: false };
const FMT_MD = { marcador: null, comentarioTotal: true, yaml: false, ehPython: false };
const PROTEGIDOS_PAPEL = new Map([
  ['dominio', PADROES_DE_PROTECAO.get('dominio')],
  ['gateway', PADROES_DE_PROTECAO.get('gateway')],
  ['conector', PADROES_DE_PROTECAO.get('conector')],
  ['contrato', PADROES_DE_PROTECAO.get('contrato')],
  ['testes', PADROES_DE_PROTECAO.get('testes')],
]);
const PROTEGIDOS_PORTAS = new Map([['portas', PADROES_DE_PROTECAO.get('portas')]]);
const PROTEGIDOS_MODULO = new Map([['modulo', PADROES_DE_PROTECAO.get('modulo')]]);

function casosDeAutoteste() {
  return [
    // seis casos exigidos pela rodada REFAZER (delimitador por contexto/tipo).
    { nome: 'RECUSA: "descricao": "...o dominio de negocio..." (prosa com espaco, JSON)', fn: () => {
      const linha = '  "descricao": "Descreva em uma linha o dominio de negocio deste modulo.",';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'pasta', FMT_JSON, false);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-POR-PROSA';
    } },
    { nome: "RECUSA: porQue: 'deriva de contrato' (prosa com espaco, codigo JS)", fn: () => {
      const linha = "        consome: [{ modulo: 'vizinho', contrato: 'GET /x', porQue: 'deriva de contrato' }],";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'contrato', 'pasta', FMT_JS, false);
      // 'contrato' aparece 2x: a chave `contrato:` (codigo, sem import -> RECUSA-IDENTIFICADOR-NU
      // apos o conserto (f)) e a string 'deriva de contrato' (prosa -> RECUSADO-POR-PROSA).
      const chave = oc.find((o) => o.decisao === 'recusa' && o.classe === 'RECUSADO-IDENTIFICADOR-NU');
      const prosa = oc.find((o) => o.decisao === 'recusa' && o.classe === 'RECUSADO-POR-PROSA');
      return oc.length === 2 && chave !== undefined && prosa !== undefined;
    } },
    { nome: 'RECUSA: $comentario "...chave da raiz..." (prosa com espaco, JSON)', fn: () => {
      const linha = '  "$comentario": "Prefixo RAIZ_ reservado: e o que distingue chave da raiz de chave de modulo.",';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'raiz', 'pasta', FMT_JSON, false);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-POR-PROSA';
    } },
    { nome: "SUBSTITUI: 'modulos/[a-z]*' (string sem espaco, caminho, JSON)", fn: () => {
      const linha = '  "workspaces": ["modules/*", "modulos/[a-z]*"],';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'modulos', 'simbolo', FMT_JSON, false);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'caminho';
    } },
    { nome: 'SUBSTITUI: grafo.modulos deixou de ser o caso — agora e RECUSA (conserto f, identificador nu)', fn: () => {
      const linha = '  for (const [id, { consome }] of grafo.modulos) {';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'modulos', 'simbolo', FMT_JS, false);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    { nome: 'SUBSTITUI: from core.dominio import (import pontilhado Python, unico caso de import em codigo)', fn: () => {
      const linha = 'from core.dominio import ErroDeValidacao, montar_registro';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'pasta', FMT_PY, false);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'identificador';
    } },
    // 6a instancia da mesma classe (achado pelo revisor, tools/create-module.mjs:162): import
    // pontilhado Python dentro de uma STRING JS (fixture escrevendo/removendo codigo Python de
    // dentro de uma ferramenta) — tem espaco, cai em contexto STRING, mas E import de verdade.
    // Achar caso a caso nao fecha a classe; reconhecer a FORMA (`ehLinhaDeImportPython` aplicado ao
    // conteudo da string) fecha.
    { nome: 'SUBSTITUI: "from core.motor import gerar_artefato\\n" — import pontilhado Python DENTRO DE STRING JS (.replace de fixture)', fn: () => {
      const linha = "    .replace('from core.motor import gerar_artefato\\n', '')";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'motor', 'pasta', FMT_JS, false);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'identificador';
    } },
    { nome: 'RECUSA: "...o motor testavel sem congelar o relogio..." — prosa real com espaco, NAO e forma de import', fn: () => {
      const linha = "      // ...o motor testavel sem congelar o relogio...";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'motor', 'pasta', FMT_JS, false, undefined);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-POR-PROSA';
    } },
    { nome: "RECUSA: import contrato from './rules/contract.mjs' — o BINDING (identificador nu), nao a linha inteira, e o alvo de recusa (achado no --diferencial: 'import X' sozinho tambem casa JS, so python bare-import nao tem 'from' DEPOIS do modulo)", fn: () => {
      const linha = "import contrato from './rules/contract.mjs';";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'contrato', 'pasta', FMT_JS, false);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },

    // fronteira por tipo: arquivo casa o nome inteiro com extensao.
    { nome: 'ARQUIVO: contrato.mjs casa dentro de ./rules/contrato.mjs (string com barra = caminho)', fn: () => {
      const linha = "import contrato from './rules/contrato.mjs';";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'contrato.mjs', 'arquivo', FMT_JS, false);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'caminho';
    } },
    { nome: 'PASTA: fronteira ainda protege modulo dentro de modulos (nao regressao)', fn: () => {
      const linha = 'os modulos do projeto';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'modulo', 'pasta', FMT_MD, false);
      return oc.length === 0;
    } },

    // (a) marcador de comentario por extensao — os tres casos exigidos.
    { nome: 'RECUSA (a): .ruff.toml "as mesmas regras (`eTeste`)" — # e o marcador do TOML, nao //', fn: () => {
      const linha = '# usa as mesmas regras (`eTeste`) do projeto principal';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'eTeste', 'simbolo', FMT_TOML, false);
      // dentro de crase, DENTRO DE COMENTARIO -> substitui (a regra de crase vale). O caso critico
      // e que a linha seja RECONHECIDA como comentario pelo marcador certo, nao que ela recuse tudo.
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'caminho';
    } },
    { nome: 'RECUSA (a): pyproject.toml "A raiz entra no sys.path" (prosa em comentario TOML, sem crase/barra)', fn: () => {
      const linha = '# A raiz entra no sys.path automaticamente pelo pytest.';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'raiz', 'pasta', FMT_TOML, false);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-POR-PROSA';
    } },
    { nome: 'RECUSA (a): pre-commit "gate nos modulos AFETADOS" (prosa em comentario shell, marcador #)', fn: () => {
      const linha = '# roda o gate nos modulos AFETADOS pelo commit';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'modulos', 'simbolo', { marcador: '#', comentarioTotal: false, yaml: false, ehPython: false }, false);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-POR-PROSA';
    } },
    { nome: 'RECUSA (a): .prettierignore "# pasta de dominio gerada" — comentario reconhecido pelo marcador #, nao codigo cego', fn: () => {
      const linha = '# pasta de dominio gerada, nao versionada';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'pasta', { marcador: '#', comentarioTotal: false, yaml: false, ehPython: false }, false);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-POR-PROSA';
    } },

    // (b) escalar YAML sem aspas.
    { nome: 'RECUSA (b): title: <Modulo> — contrato publico (escalar YAML sem aspas, openapi.yaml)', fn: () => {
      const linha = '  title: <Modulo> — contrato publico';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'contrato', 'pasta', FMT_YAML, false);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-POR-PROSA';
    } },
    { nome: 'RECUSA (b): summary: Vivo e com as portas resolvidas (escalar YAML sem aspas)', fn: () => {
      const linha = '  summary: Vivo e com as portas resolvidas';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'portas', 'pasta', FMT_YAML, false);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-POR-PROSA';
    } },
    { nome: 'SUBSTITUI (b): $ref: contrato/openapi.yaml (escalar YAML sem aspas, mas E caminho)', fn: () => {
      const linha = '  $ref: contrato/openapi.yaml';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'contrato', 'pasta', FMT_YAML, false);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'caminho';
    } },

    // (c) fronteira de arquivo no ponto final de frase — os tres casos exigidos.
    { nome: 'SUBSTITUI (c): tools/gate/limiares.mjs. (ponto final de frase, .prettierignore-like)', fn: () => {
      const linha = 'confira tools/gate/limiares.mjs. Nada mais a fazer.';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'limiares.mjs', 'arquivo', FMT_MD, false);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'caminho';
    } },
    { nome: 'SUBSTITUI (c): GERADO por tools/sincronizar-env.mjs. (gerador escreve isso em todo .env.example)', fn: () => {
      const linha = '# GERADO por tools/sincronizar-env.mjs. Nao edite a mao.';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'sincronizar-env.mjs', 'arquivo', { marcador: '#', comentarioTotal: false, yaml: false, ehPython: false }, false);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'caminho';
    } },
    { nome: 'RECUSA (c): modulo.json.bak nao regride — ponto seguido de mais nome continua bloqueado', fn: () => {
      const linha = 'arquivo modulo.json.bak encontrado';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'modulo.json', 'arquivo', FMT_MD, false);
      return oc.length === 0;
    } },

    // (d) .md no alvo — comentarioTotal (extensao sem marcador conhecido).
    { nome: 'SUBSTITUI (d): `ferramentas/gate/validar.mjs` em README.md (crase = code span, comentarioTotal)', fn: () => {
      const linha = 'Rode `ferramentas/gate/validar.mjs` para conferir.';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'ferramentas', 'pasta', FMT_MD, true);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'caminho';
    } },
    { nome: 'RECUSA (d): prosa solta em README.md (sem crase, sem barra) recusa por padrao', fn: () => {
      const linha = 'As ferramentas deste projeto vivem em outro repositorio.';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'ferramentas', 'pasta', FMT_MD, true);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-POR-PROSA';
    } },

    // achado alem do pedido, no dry-run real: pre-commit/pre-push/.gitignore/.prettierignore nao
    // tem identificador de codigo NENHUM — fora de comentario e sempre padrao de glob ou comando de
    // shell citando caminho de verdade. formatoDoArquivo() os trata como comentarioTotal (mesmo
    // mecanismo do conserto (a)); os tres casos abaixo sao os que o --relatorio pegou quebrados.
    { nome: 'SUBSTITUI: node ferramentas/verify-commit.mjs pre-commit (pre-commit, comando de shell, sem #)', fn: () => {
      const linha = 'node ferramentas/verificar-commit.mjs pre-commit || exit 1';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'ferramentas', 'pasta', formatoDoArquivo('pre-commit'), true);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'caminho';
    } },
    { nome: 'SUBSTITUI: **/gerados/* (.gitignore, padrao de glob, sem #)', fn: () => {
      const linha = '**/gerados/*';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'gerados', 'pasta', formatoDoArquivo('x/.gitignore'), true);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'caminho';
    } },
    { nome: 'SUBSTITUI: ferramentas/ (.prettierignore, padrao de glob de pasta, sem #)', fn: () => {
      const linha = 'ferramentas/';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'ferramentas', 'pasta', formatoDoArquivo('x/.prettierignore'), true);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'caminho';
    } },

    // (e) literais protegidos — valor de manifesto homonimo de pasta.
    { nome: 'RECUSA (e): const PAPEIS = [\'dominio\', \'gateway\', \'conector\'] — literal protegido de manifesto', fn: () => {
      const linha = "const PAPEIS = ['dominio', 'gateway', 'conector'];";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'pasta', FMT_JS, false, PROTEGIDOS_PAPEL);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-LITERAL-PROTEGIDO';
    } },
    { nome: "RECUSA (e): papel: valorDe('papel', 'dominio') — default do manifesto, mesmo literal protegido", fn: () => {
      const linha = "    papel: valorDe('papel', 'dominio'),";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'pasta', FMT_JS, false, PROTEGIDOS_PAPEL);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-LITERAL-PROTEGIDO';
    } },
    { nome: "SUBSTITUI (e): 'memoria' string-sem-espaco continua substituindo — nao esta protegida", fn: () => {
      const linha = '  "repositorio": "memoria"';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'memoria', 'pasta', FMT_JSON, false, PROTEGIDOS_PAPEL);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'string-sem-espaco';
    } },
    // achado alem do pedido: proteger o LITERAL inteiro quebraria uso legitimo do MESMO bare-string
    // em outro lugar (nome de arquivo de config, segmento de caminho) — a protecao tem de ser por
    // literal+padrao-de-linha, nunca pelo literal sozinho.
    { nome: "RECUSA (e): id: 'contrato' — id de regra (ADR decisao 6), protegido por padrao de linha", fn: () => {
      const linha = "    id: 'contrato',";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'contrato', 'pasta', FMT_JS, false, PROTEGIDOS_PAPEL);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-LITERAL-PROTEGIDO';
    } },
    { nome: "RECUSA (e): regra: 'testes' — id de regra referenciado em caso de teste, mesmo padrao", fn: () => {
      const linha = "    regra: 'testes',";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'testes', 'pasta', FMT_JS, false, PROTEGIDOS_PAPEL);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-LITERAL-PROTEGIDO';
    } },
    { nome: "SUBSTITUI (e): join('modulos', id, 'contrato', 'openapi.yaml') — MESMO literal 'contrato', mas e segmento de caminho, nao id de regra (sem 'id:'/'regra:' na linha)", fn: () => {
      const linha = "  const caminho = join(RAIZ, 'modulos', id, 'contrato', 'openapi.yaml');";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'contrato', 'pasta', FMT_JS, false, PROTEGIDOS_PAPEL);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'string-sem-espaco';
    } },
    { nome: "SUBSTITUI (e): join(RAIZ_TEMPLATE, 'testes') — MESMO literal 'testes', mas e nome de pasta sendo montado, nao id de regra", fn: () => {
      const linha = "    ...arquivosSob(join(RAIZ_TEMPLATE, 'testes'), EXT_FONTE),";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'testes', 'pasta', FMT_JS, false, PROTEGIDOS_PAPEL);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'string-sem-espaco';
    } },

    // (f) identificador nu em codigo nao e alvo — os tres casos exigidos.
    { nome: "SUBSTITUI (f): import x from './rules/contract.mjs' (string com barra, contexto ja era STRING)", fn: () => {
      const linha = "import x from './rules/contract.mjs';";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'contract.mjs', 'arquivo', FMT_JS, false);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'caminho';
    } },
    { nome: 'RECUSA (f): let raiz = false; (identificador nu, sem import)', fn: () => {
      const linha = 'let raiz = false;';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'raiz', 'pasta', FMT_JS, false);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    { nome: 'RECUSA (f): return { tudo: false, raiz, modulos } (atalho de objeto, sem import)', fn: () => {
      const linha = 'return { tudo: false, raiz, modulos };';
      const ocRaiz = ocorrenciasClassificadasNaLinha(linha, 'raiz', 'pasta', FMT_JS, false);
      const ocModulos = ocorrenciasClassificadasNaLinha(linha, 'modulos', 'simbolo', FMT_JS, false);
      return ocRaiz.length === 1 && ocRaiz[0].decisao === 'recusa' && ocRaiz[0].classe === 'RECUSADO-IDENTIFICADOR-NU'
        && ocModulos.length === 1 && ocModulos[0].decisao === 'recusa' && ocModulos[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },

    // aplicarNaLinha: aplica so o marcado substitui, preserva o resto.
    { nome: 'aplicarNaLinha: substitui so o marcado substitui, preserva o resto', fn: () => {
      const linha = "consome: [{ modulo: 'vizinho', contrato: 'GET /x', porQue: 'deriva de contrato' }]";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'contrato', 'pasta', FMT_JS, false);
      const resultado = aplicarNaLinha(linha, oc, 'contrato', 'contract');
      return resultado === linha; // nenhuma das duas ocorrencias substitui (chave e identificador nu, string e prosa)
    } },

    // O artefato de recusas (Bloco AI, plan-3.md) — nucleo puro, sem tocar CAMINHO_RECUSAS.
    { nome: 'compararRecusas: recusa atual identica a uma salva NAO conta como nova', fn: () => {
      const r = { fase: 'AD.1', arquivo: 'a.mjs', linha: 10, antigo: 'ferramentas', classe: 'RECUSADO-POR-PROSA', contexto: 'x' };
      const { novas, resolvidas } = compararRecusas('AD.1', [r], [r]);
      return novas.length === 0 && resolvidas.length === 0;
    } },
    { nome: 'compararRecusas: recusa atual ausente do artefato salvo E nova', fn: () => {
      const r = { fase: 'AD.1', arquivo: 'a.mjs', linha: 10, antigo: 'ferramentas', classe: 'RECUSADO-POR-PROSA', contexto: 'x' };
      const { novas, resolvidas } = compararRecusas('AD.1', [r], []);
      return novas.length === 1 && novas[0].arquivo === 'a.mjs' && novas[0].linha === 10 && resolvidas.length === 0;
    } },
    { nome: 'compararRecusas: recusa salva ausente das atuais e RESOLVIDA, nunca reprova', fn: () => {
      const salva = { fase: 'AD.1', arquivo: 'a.mjs', linha: 10, antigo: 'ferramentas', classe: 'RECUSADO-POR-PROSA', contexto: 'x' };
      const { novas, resolvidas } = compararRecusas('AD.1', [], [salva]);
      return novas.length === 0 && resolvidas.length === 1 && resolvidas[0].linha === 10;
    } },
    { nome: 'compararRecusas: mesma linha, CLASSE diferente da salva conta como nova (identidade e o tuplo inteiro)', fn: () => {
      const salva = { fase: 'AD.1', arquivo: 'a.mjs', linha: 10, antigo: 'ferramentas', classe: 'RECUSADO-POR-PROSA', contexto: 'x' };
      const atual = { ...salva, classe: 'RECUSADO-IDENTIFICADOR-NU' };
      const { novas, resolvidas } = compararRecusas('AD.1', [atual], [salva]);
      return novas.length === 1 && resolvidas.length === 1; // a antiga sumiu (resolvida), a nova classe e outra recusa
    } },
    { nome: 'compararRecusas: recusa salva de OUTRA fase nao protege a mesma linha nesta fase', fn: () => {
      const salvaDeOutraFase = { fase: 'AD.2', arquivo: 'a.mjs', linha: 10, antigo: 'ferramentas', classe: 'RECUSADO-POR-PROSA', contexto: 'x' };
      const atualDestaFase = { ...salvaDeOutraFase, fase: 'AD.1' };
      const { novas } = compararRecusas('AD.1', [atualDestaFase], [salvaDeOutraFase]);
      return novas.length === 1; // fase e parte da chave — nao ha "credito" entre fases
    } },

    // pendentesDaFase (Bloco AI, AI.4) — nucleo puro, sem tocar disco nem rodar --relatorio de verdade.
    { nome: 'pendentesDaFase: registro RECUSADO-* nao e pendencia', fn: () => {
      const registros = [{ arquivo: 'a.mjs', linha: 5, classe: 'RECUSADO-POR-PROSA', antigo: 'x', contexto: 'y' }];
      return pendentesDaFase('AD.1', registros).length === 0;
    } },
    { nome: 'pendentesDaFase: registro SUBSTITUI (classe sem RECUSADO) e pendencia, nomeando arquivo e linha', fn: () => {
      const registros = [{ arquivo: 'tools/create-module.mjs', linha: 184, classe: 'identificador', antigo: 'motor', contexto: 'from core.motor import x' }];
      const pendentes = pendentesDaFase('AD.1', registros);
      return pendentes.length === 1 && pendentes[0].linha === 184 && pendentes[0].antigo === 'motor';
    } },
    { nome: 'pendentesDaFase: mistura recusa+substitui conta so o substitui', fn: () => {
      const registros = [
        { arquivo: 'a.mjs', linha: 1, classe: 'RECUSADO-IDENTIFICADOR-NU', antigo: 'x', contexto: 'y' },
        { arquivo: 'a.mjs', linha: 2, classe: 'caminho', antigo: 'x', contexto: 'y' },
      ];
      return pendentesDaFase('AD.1', registros).length === 1;
    } },

    // Bloco AD, B1/B2/B3 — a ferramenta desbloqueada para AD.2/AD.3, sem regredir o AD.1.
    { nome: 'B1: identificador nu de simbolo RECUSA em AD.1 (fase default) — idempotencia do AD.1 intacta', fn: () => {
      const linha = 'const alvos = [...resultado.modulos];';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'modulos', 'simbolo', FMT_JS, false);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    { nome: 'B1: identificador nu de simbolo SUBSTITUI em AD.2 — e o proprio simbolo sendo renomeado', fn: () => {
      const linha = 'function paraContrato(registro) {';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'paraContrato', 'simbolo', FMT_JS, false, undefined, false, 'AD.2');
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'identificador';
    } },
    { nome: 'B2: chave BARE (sem ponto antes) RECUSA mesmo em AD.3 — risco de colisao com variavel local', fn: () => {
      const linha = 'const nome = arquivo.split("/").pop();';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'nome', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    { nome: 'B2: chave em ACESSO DE PROPRIEDADE (precedida de ".") SUBSTITUI em AD.3', fn: () => {
      const linha = 'return manifesto.nome;';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'nome', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'identificador';
    } },
    { nome: 'B2: mesmo acesso de propriedade RECUSA em AD.1 (fase nao autoriza identificador nu de jeito nenhum)', fn: () => {
      const linha = 'return manifesto.nome;';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'nome', 'chave', FMT_JS, false);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    { nome: 'B3: protecaoSuspensaNestaFase("portas", AD.3) e true — a fase alvo suspende a protecao', fn: () => (
      protecaoSuspensaNestaFase('', 'portas', PROTEGIDOS_PORTAS, 'AD.3') === true
    ) },
    { nome: 'B3: protecaoSuspensaNestaFase("portas", AD.1) e false — protegido continua fora do alvo', fn: () => (
      protecaoSuspensaNestaFase('', 'portas', PROTEGIDOS_PORTAS, 'AD.1') === false
    ) },
    { nome: 'B3: "portas" nu RECUSA em AD.1 (protecao normal — nao regrediu o AI.5)', fn: () => {
      const linha = 'for porta in modulo["portas"]:';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'portas', 'chave', FMT_PY, false, PROTEGIDOS_PORTAS);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-LITERAL-PROTEGIDO';
    } },
    { nome: 'B3: "portas" nu SUBSTITUI em AD.3 — e o proprio alvo, protecao suspensa', fn: () => {
      const linha = 'for porta in modulo["portas"]:';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'portas', 'chave', FMT_PY, false, PROTEGIDOS_PORTAS, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'string-sem-espaco';
    } },
    { nome: 'B3: array-context ("portas" dentro de CAMPOS_OBRIGATORIOS) tambem respeita a excecao de AD.3', fn: () => {
      const linha = "  'dados', 'envRequerido', 'portas', 'consome', 'ui', 'permissoes',";
      const emAD1 = ocorrenciasClassificadasNaLinha(linha, 'portas', 'chave', FMT_JS, false, PROTEGIDOS_PORTAS, true, 'AD.1');
      const emAD3 = ocorrenciasClassificadasNaLinha(linha, 'portas', 'chave', FMT_JS, false, PROTEGIDOS_PORTAS, true, 'AD.3');
      return emAD1.length === 1 && emAD1[0].decisao === 'recusa'
        && emAD3.length === 1 && emAD3[0].decisao === 'substitui';
    } },
    // B3 COMBINADO (Bloco AD.3, decisao 8 de decisoes.md): "dominio"/"conector" precisam de
    // MARCADOR (protegem so perto de "papel"/"PAPEIS", nao em qualquer lugar) E de excecao de fase
    // (o proprio VALOR do enum e alvo do AD.3) ao mesmo tempo — o shape novo de PADROES_DE_PROTECAO.
    { nome: 'B3 combinado: papel: "dominio" (string, marcador "papel" na linha) RECUSA em AD.1 — nao regride o comportamento historico', fn: () => {
      const linha = "  papel: valorDe('papel', 'dominio'),";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'pasta', FMT_JS, false, PROTEGIDOS_PAPEL);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-LITERAL-PROTEGIDO';
    } },
    { nome: 'B3 combinado: MESMA linha SUBSTITUI em AD.3 — o proprio valor do enum e o alvo, protecao suspensa', fn: () => {
      const linha = "  papel: valorDe('papel', 'dominio'),";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'chave', FMT_JS, false, PROTEGIDOS_PAPEL, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'string-sem-espaco';
    } },
    { nome: 'B3 combinado: "core/dominio/" (SEM marcador "papel" na linha) SUBSTITUI em AD.1 normalmente — marcador nao aparece, protecao nunca entra', fn: () => {
      const linha = "join(RAIZ_TEMPLATE, 'core', 'dominio')";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'pasta', FMT_JS, false, PROTEGIDOS_PAPEL);
      return oc.length === 1 && oc[0].decisao === 'substitui';
    } },
    { nome: 'B3 combinado: "conector" segue o MESMO par marcador+excecao que "dominio" — RECUSA em AD.1, SUBSTITUI em AD.3', fn: () => {
      const linha = "  papel: 'conector',";
      const emAD1 = ocorrenciasClassificadasNaLinha(linha, 'conector', 'pasta', FMT_JS, false, PROTEGIDOS_PAPEL);
      const emAD3 = ocorrenciasClassificadasNaLinha(linha, 'conector', 'chave', FMT_JS, false, PROTEGIDOS_PAPEL, false, 'AD.3');
      return emAD1.length === 1 && emAD1[0].decisao === 'recusa'
        && emAD3.length === 1 && emAD3[0].decisao === 'substitui';
    } },
    // FALHA REAL (Bloco AD.3, revisao pos-round — decisao #5 do revisor): suspender por fase
    // suspendia a ENTRADA inteira, inclusive a CLI de create-module.mjs, que precisa continuar
    // protegida mesmo em AD.3 (a flag aceita "--role dominio", valor em portugues por decisao
    // explicita). `marcadoresSempre` fecha isso sem tocar o valor do manifesto, que continua
    // suspendendo normal.
    { nome: 'marcadoresSempre: "const PAPEIS = [\'dominio\', ...]" (CLI de create-module.mjs) RECUSA em AD.3 — nao suspende mesmo sendo o alvo da fase', fn: () => {
      const linha = "const PAPEIS = ['dominio', 'gateway', 'conector'];";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'chave', FMT_JS, false, PROTEGIDOS_PAPEL, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-LITERAL-PROTEGIDO';
    } },
    { nome: 'marcadoresSempre: "role: valorDe(\'role\', \'dominio\')" (default da CLI) RECUSA em AD.3 pelo mesmo motivo', fn: () => {
      const linha = "  role: valorDe('role', 'dominio'),";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'chave', FMT_JS, false, PROTEGIDOS_PAPEL, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-LITERAL-PROTEGIDO';
    } },
    { nome: 'marcadoresSempre: \'"role": "dominio"\' (module.json, aspas duplas — JSON) SUBSTITUI em AD.3 — o valor do manifesto continua suspendendo normal', fn: () => {
      const linha = '  "role": "dominio",';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'chave', FMT_JSON, false, PROTEGIDOS_PAPEL, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'string-sem-espaco';
    } },
    { nome: 'marcadoresSempre: mesma linha de module.json RECUSA fora de AD.3 (AD.1) — protecao normal, sem exceto', fn: () => {
      const linha = '  "role": "dominio",';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'pasta', FMT_JSON, false, PROTEGIDOS_PAPEL);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-LITERAL-PROTEGIDO';
    } },
    // TERCEIRA FORMA (Bloco AD.3): chave nua como membro de objeto/tipo, sem "." na frente — o
    // `RECUSADO-IDENTIFICADOR-NU` de B2 acima é o comportamento CORRETO fora de um bloco de
    // manifesto reconhecido; estes provam que DENTRO do bloco (`dentroDeBlocoDeManifesto`) a mesma
    // chave substitui, e que o reconhecedor de bloco (`classificarArquivo`, via
    // `RE_ABRE_BLOCO_DE_MANIFESTO`) acerta a profundidade em exemplo real, aninhado, do `cases.mjs`.
    { nome: 'AD.3 3a forma: chave nua DENTRO de bloco de manifesto (flag simulada) SUBSTITUI mesmo sem ponto', fn: () => {
      const linha = "m.manifesto((x) => ({ ...x, papel: 'inventado' }));";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'papel', 'chave', FMT_JS, false, undefined, false, 'AD.3', true);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'identificador';
    } },
    { nome: 'AD.3 3a forma: mesma chave nua SEM a flag de bloco continua RECUSANDO — a prova inversa (nome/descricao de teste nunca tocam)', fn: () => {
      const linha = "m.manifesto((x) => ({ ...x, papel: 'inventado' }));";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'papel', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    { nome: 'AD.3 3a forma: descricao: NO NIVEL EXTERNO do caso de teste (fora de .manifesto) RECUSA — nunca deve tocar campo de teste', fn: () => {
      const item = { antigo: 'descricao', tipo: 'chave', fase: 'AD.3' };
      const texto = [
        '{',
        "  regra: 'consome-ciclo',",
        "  descricao: 'ciclo no grafo de consome',",
        '  mutar: (m) => {',
        '    m.manifesto((x) => ({',
        '      ...x,',
        "      consome: [{ modulo: 'vizinho', contrato: 'GET /resumo', porQue: 'ciclo' }],",
        "      envRequerido: [...x.envRequerido, 'VIZINHO_URL'],",
        '    }));',
        '  },',
        '},',
      ].join('\n');
      const { porLinha } = classificarArquivo(texto, item, FMT_JS, undefined);
      const achadosDescricao = porLinha[2];
      return achadosDescricao.length === 1 && achadosDescricao[0].decisao === 'recusa'
        && achadosDescricao[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    { nome: 'AD.3 3a forma: modulo/contrato/porQue DENTRO do objeto aninhado de consome (linha 7, profundidade 2) SUBSTITUEM — classificarArquivo real, sem simular a flag', fn: () => {
      const texto = [
        '{',
        "  regra: 'consome-ciclo',",
        "  descricao: 'ciclo no grafo de consome',",
        '  mutar: (m) => {',
        '    m.manifesto((x) => ({',
        '      ...x,',
        "      consome: [{ modulo: 'vizinho', contrato: 'GET /resumo', porQue: 'ciclo' }],",
        "      envRequerido: [...x.envRequerido, 'VIZINHO_URL'],",
        '    }));',
        '  },',
        '},',
      ].join('\n');
      const linhaAninhada = texto.split('\n')[6];
      const itemModulo = { antigo: 'modulo', tipo: 'chave', fase: 'AD.3' };
      const { porLinha: porLinhaModulo } = classificarArquivo(texto, itemModulo, FMT_JS, undefined);
      const okModulo = porLinhaModulo[6].length === 1 && porLinhaModulo[6][0].decisao === 'substitui';
      // Esta linha tem DUAS ocorrencias de "envRequerido": a chave nua (`envRequerido:`, 3a forma —
      // precisa da flag de bloco) e o acesso de propriedade (`x.envRequerido`, B2 normal, ponto na
      // frente). As duas devem substituir, por motivos diferentes — prova que a 3a forma nao
      // atrapalha o caminho ja existente que convivia na MESMA linha.
      const itemEnv = { antigo: 'envRequerido', tipo: 'chave', fase: 'AD.3' };
      const { porLinha: porLinhaEnv } = classificarArquivo(texto, itemEnv, FMT_JS, undefined);
      const okEnv = porLinhaEnv[7].length === 2 && porLinhaEnv[7].every((oc) => oc.decisao === 'substitui');
      return okModulo && okEnv && linhaAninhada.includes('modulo:');
    } },
    // FALHA REAL (Bloco AD.3, segunda rodada de --aplicar): `.manifestoRaiz(` nao casava
    // `RE_ABRE_BLOCO_DE_MANIFESTO` (só via `.manifesto(` exato) — os 4 `mutar:` de cases.mjs que
    // usam `m.manifestoRaiz((x) => ({ ...x, envRequerido: [...x.envRequerido, ...] }))` ficaram
    // fora do bloco, `x.envRequerido` continuou 'envRequerido' enquanto o `project.json` real já
    // falava `requiredEnv` — `x.envRequerido is not iterable` no gate self-test.
    { nome: 'AD.3 3a forma: .manifestoRaiz( TAMBEM abre o bloco (nao so .manifesto() exato) — achado real no gate self-test', fn: () => {
      const texto = [
        '{',
        "  regra: 'env-raiz-declarado',",
        "  descricao: 'chave de ambiente da raiz sem leitor',",
        '  mutar: (m) => {',
        '    m.manifestoRaiz((x) => ({',
        '      ...x,',
        "      envRequerido: [...x.envRequerido, 'RAIZ_SEM_LEITOR'],",
        '    }));',
        '  },',
        '},',
      ].join('\n');
      const item = { antigo: 'envRequerido', tipo: 'chave', fase: 'AD.3' };
      const { porLinha } = classificarArquivo(texto, item, FMT_JS, undefined);
      return porLinha[6].length === 2 && porLinha[6].every((oc) => oc.decisao === 'substitui');
    } },
    { nome: 'AD.3 3a forma: interface Manifesto {...} — membro nu de declaracao de tipo SUBSTITUI dentro do bloco', fn: () => {
      const texto = [
        'export interface Manifesto {',
        '  id: string;',
        '  papel: Papel;',
        '  portas: Porta[];',
        '}',
        '',
        'export function ler(): Manifesto {',
        '  const papel = 1;',
        '  return papel;',
        '}',
      ].join('\n');
      const item = { antigo: 'papel', tipo: 'chave', fase: 'AD.3' };
      const { porLinha } = classificarArquivo(texto, item, FMT_JS, undefined);
      const dentroDaInterface = porLinha[2].length === 1 && porLinha[2][0].decisao === 'substitui';
      // Fora da interface (corpo de funcao, linha 7/8), "papel" bare continua RECUSANDO — a
      // profundidade fechou em "}" (linha 4) e nao vaza para o resto do arquivo.
      const foraDaInterface = porLinha[7].length === 1 && porLinha[7][0].decisao === 'recusa';
      return dentroDaInterface && foraDaInterface;
    } },
    // BASE CONHECIDA (Bloco AD.3, achado ao medir o corpus inteiro antes de estender `chave` para
    // tools/tests): "tem ponto antes" sozinho nao basta — a base do acesso importa. Provam as DUAS
    // direcoes com exemplos REAIS do template (tools/*.mjs, bindings/*/middlewares).
    { nome: 'AD.3 base conhecida: caso.nome (nome do CASO DE TESTE, tools/*.mjs) RECUSA — base "caso" fora da lista', fn: () => {
      const linha = '    registrar(caso.nome, avaliarResultado(caso.resultado).ok === caso.esperado);';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'nome', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    { nome: 'AD.3 base conhecida: req.permissoes (permissoes da REQUISICAO, middleware) RECUSA — base "req" fora da lista', fn: () => {
      const linha = "    if (!req.permissoes?.includes(permissao)) {";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'permissoes', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    { nome: 'AD.3 base conhecida: claims.permissoes/state.permissoes (claims do JWT, nao o manifesto) RECUSAM', fn: () => {
      const linha = '    request.state.permissoes = claims.get("permissoes", [])';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'permissoes', 'chave', FMT_PY, false, undefined, false, 'AD.3');
      // "state.permissoes" (acesso) e "claims.get" (chamada, sem ponto antes de "permissoes" nesta
      // ocorrencia) — a occorrencia de acesso de propriedade e so a primeira; a segunda esta dentro
      // de aspas (ramo 'string', ja coberto por outra logica). Aqui so garantimos que NENHUMA
      // ocorrencia de codigo (nao-string) substitui.
      return oc.filter((o) => o.classe !== 'string-sem-espaco' && o.decisao === 'substitui').length === 0;
    } },
    { nome: 'AD.3 base conhecida: corpo.rotaBase (asserção de teste sobre resposta HTTP) RECUSA — base "corpo" fora da lista', fn: () => {
      const linha = '    expect(corpo.rotaBase).toBe(ROTA_BASE);';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'rotaBase', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    { nome: 'AD.3 base conhecida: modulo.rotaBase/modulo.portas (variavel de laco em composicao.ts) SUBSTITUEM — base "modulo" permitida', fn: () => {
      const linha1 = '  for (const porta of modulo.portas) {';
      const oc1 = ocorrenciasClassificadasNaLinha(linha1, 'portas', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      const linha2 = '    porRota.set(modulo.rotaBase, [...(porRota.get(modulo.rotaBase) ?? []), modulo.id]);';
      const oc2 = ocorrenciasClassificadasNaLinha(linha2, 'rotaBase', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc1.length === 1 && oc1[0].decisao === 'substitui'
        && oc2.length === 2 && oc2.every((o) => o.decisao === 'substitui');
    } },
    { nome: 'AD.3 base conhecida: projeto.manifesto.valor?.envRequerido (conteudo destructurado do project.json) SUBSTITUI — base "valor" permitida', fn: () => {
      const linha = '      const declaradas = projeto.manifesto.valor?.envRequerido;';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'envRequerido', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'identificador';
    } },
    { nome: 'AD.3 base conhecida: opcoes.papel/manifesto.papel = opcoes.papel (create-module.mjs, flag de CLI) SUBSTITUEM — base "opcoes" permitida', fn: () => {
      const linha = '  manifesto.papel = opcoes.papel;';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'papel', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 2 && oc.every((o) => o.decisao === 'substitui');
    } },
    // FALHA REAL (Bloco AD.3, segunda rodada de --aplicar): base conhecida so no segmento
    // IMEDIATO antes do ponto nao bastava — `manifesto.data.tabelas`/`ctx.manifesto?.data?.tabelas`
    // tem `data` (nao `manifesto`) como base imediata de `tabelas`, e `dados.tabelas` (create-
    // module.mjs:124, data.mjs) ficou sem substituir mesmo com `manifesto` dois segmentos atras.
    // `baseConhecidaNaCadeia` caminha a cadeia inteira; estes provam a forma nos dois sentidos.
    { nome: 'AD.3 cadeia: manifesto.data.tabelas (base imediata "data", nao "manifesto") SUBSTITUI — cadeia inteira, nao so o segmento imediato', fn: () => {
      const linha = '    manifesto.data.tabelas = [];';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'tabelas', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'identificador';
    } },
    { nome: 'AD.3 cadeia: ctx.manifesto?.data?.tabelas (optional chaining nos dois pontos) SUBSTITUI — a declaracao local bare (mesma linha) continua RECUSANDO', fn: () => {
      const linha = '      const tabelas = ctx.manifesto?.data?.tabelas ?? [];';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'tabelas', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      const declaracaoLocal = oc[0];
      const acessoPontilhado = oc[1];
      return oc.length === 2
        && declaracaoLocal.decisao === 'recusa' && declaracaoLocal.classe === 'RECUSADO-IDENTIFICADOR-NU'
        && acessoPontilhado.decisao === 'substitui' && acessoPontilhado.classe === 'identificador';
    } },
    { nome: 'AD.3 cadeia: caso.filho.nome (NENHUM segmento bate a lista) continua RECUSANDO — cadeia mais longa nao contorna a protecao', fn: () => {
      const linha = '  return caso.filho.nome;';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'nome', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    // FALHA REAL (Bloco AD.3, segundo --aplicar): "<modulo>" e o MARCADOR de create-module.mjs, nao
    // chave de manifesto — sem protecao, sobrevivia so nos ~60 cabecalhos de comentario prosa
    // (recusa por prosa mesmo), mas substituia dentro de string-sem-espaco de verdade
    // ("<modulo>_auditoria" em SQL), corrompendo database/schema.sql/module.json em desacordo com
    // os cabecalhos — create-module.mjs:substituir passou a procurar "<module>", que so existia em
    // METADE dos arquivos. Protegido agora pelo marcador com colchetes nos dois sentidos.
    { nome: 'AD.3 marcador: "<modulo>_auditoria" (SQL, string sem espaco — RECUSARIA sem protecao) RECUSA', fn: () => {
      const linha = 'alter table "<escopo>"."<modulo>_auditoria" enable row level security;';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'modulo', 'chave', FMT_JS, false, PROTEGIDOS_MODULO, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-LITERAL-PROTEGIDO';
    } },
    // FALHA REAL (Bloco AD.3, medida pelo revisor: 108 arquivos com <modulo>, 22 com <module>,
    // convivendo dentro do MESMO module.json): dentro de um valor "parece caminho" (tem barra —
    // basePath/webPath), pareceCaminho tinha PRECEDENCIA sobre a protecao — o marcador de linha
    // sozinho nao bastava, porque decidir() nunca chegava a consulta-lo. `dentroDeMarcadorDeTemplate`
    // (colchetes IMEDIATOS `<`/`>`) intercepta ANTES de pareceCaminho rodar.
    { nome: 'AD.3 marcador: "/api/v1/<modulo>" (basePath, TEM barra — pareceCaminho tinha precedencia sobre a protecao) RECUSA', fn: () => {
      const linha = '  "basePath": "/api/v1/<modulo>",';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'modulo', 'chave', FMT_JS, false, PROTEGIDOS_MODULO, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-LITERAL-PROTEGIDO';
    } },
    { nome: 'AD.3 marcador: "/<modulo>" (webPath, mesma forma) RECUSA — os dois campos ficam consistentes, nao so um', fn: () => {
      const linha = '  "webPath": "/<modulo>",';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'modulo', 'chave', FMT_JS, false, PROTEGIDOS_MODULO, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-LITERAL-PROTEGIDO';
    } },
    { nome: 'AD.3 marcador: "join(RAIZ_TEMPLATE, \'modulo\')" (string comum, SEM colchetes < >) continua substituindo normal — o desvio nao vaza pra fora do marcador', fn: () => {
      const linha = "  return join(RAIZ_TEMPLATE, 'modulo', 'contract');";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'modulo', 'chave', FMT_JS, false, PROTEGIDOS_MODULO, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'string-sem-espaco';
    } },
    { nome: 'AD.3 marcador: "<MODULO>_DB_URL" (uppercase) NEM CASA o item "modulo" (case-sensitive) — protecao e so redundancia defensiva pro caso maiusculo', fn: () => {
      const linha = "const chave = '<MODULO>_DB_URL';";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'modulo', 'chave', FMT_JS, false, PROTEGIDOS_MODULO, false, 'AD.3');
      return oc.length === 0;
    } },
    { nome: 'AD.3 marcador: consome[].modulo (chave de manifesto de verdade, SEM colchetes) continua SUBSTITUINDO — protecao nao vaza pra fora do marcador', fn: () => {
      const linha = "      consome: [{ modulo: 'vizinho', contrato: 'GET /resumo', porQue: 'ciclo' }],";
      const item = { antigo: 'modulo', tipo: 'chave', fase: 'AD.3' };
      const texto = [
        '  mutar: (m) => {',
        '    m.manifesto((x) => ({',
        '      ...x,',
        linha,
        '    }));',
        '  },',
      ].join('\n');
      const { porLinha } = classificarArquivo(texto, item, FMT_JS, PROTEGIDOS_MODULO);
      return porLinha[3].length === 1 && porLinha[3][0].decisao === 'substitui';
    } },
    // BUG REAL corrigido (Bloco AD.3): interpolacao de crase (`${nome}...`) sem espaco em branco
    // era tratada como "string inteira" e substituia a chave nua SEM o `.`/bloco que a protegeria
    // em qualquer outro lugar do codigo — corrompeu `carregarEsquema` (schema.mjs) e um adapter
    // Postgres de verdade antes de ser achado e corrigido. As quatro provam a forma, nao o caso.
    { nome: 'AD.3 bug de interpolacao: `${nome}.schema.json` (crase, SEM espaco) RECUSA — nome nu dentro de ${...} nao e "string inteira"', fn: () => {
      const linha = '  const bruto = readFileSync(join(PASTA, `${nome}.schema.json`), "utf8");';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'nome', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    { nome: 'AD.3 bug de interpolacao: `${prefixo}${sufixo}` (duas interpolacoes coladas, zero espaco) RECUSA as duas', fn: () => {
      const linha = '  return { pool, nome: qualifiedName(schema, `${prefixo}${sufixo}`) };';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'prefixo', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    { nome: 'AD.3 bug de interpolacao: `${manifesto.nome}` (interpolacao, mas COM ponto/base conhecida) SUBSTITUI normalmente', fn: () => {
      const linha = '  process.stdout.write(`modulo: ${manifesto.nome}`);';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'nome', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'identificador';
    } },
    { nome: 'AD.3 bug de interpolacao: crase SEM `$` (string-sem-espaco de verdade) continua pelo ramo antigo, sem regressao', fn: () => {
      const linha = '  const chave = `nome`;';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'nome', 'chave', FMT_JS, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'string-sem-espaco';
    } },
    // FALHA REAL (Bloco AD.3, terceira rodada de --aplicar): a mesma classe do bug de `${nome}` em
    // crase, achada numa forma que a correcao da crase nao cobria — f-string Python (`{...}`, sem
    // `$`) tem o MESMO problema. Corrompeu `adapters/postgres/__init__.py`/`scripts/migrations.py`:
    // `f"{dados['prefixo']}migrations"` virou `f"{data['prefix']}migrations"` — `data` nunca foi
    // definida ali, so `dados` (que ficou de fora por ser identificador nu, sem base conhecida).
    { nome: 'AD.3 bug de f-string: `f"{dados[\'prefixo\']}migrations"` (Python, SEM espaco) RECUSA — dados/prefixo nus dentro de {} nao sao "string inteira"', fn: () => {
      const linha = '    tabela = f"{dados[\'prefixo\']}migrations"';
      const ocDados = ocorrenciasClassificadasNaLinha(linha, 'dados', 'chave', FMT_PY, false, undefined, false, 'AD.3');
      const ocPrefixo = ocorrenciasClassificadasNaLinha(linha, 'prefixo', 'chave', FMT_PY, false, undefined, false, 'AD.3');
      return ocDados.length === 1 && ocDados[0].decisao === 'recusa' && ocDados[0].classe === 'RECUSADO-IDENTIFICADOR-NU'
        && ocPrefixo.length === 1 && ocPrefixo[0].decisao === 'recusa' && ocPrefixo[0].classe === 'RECUSADO-IDENTIFICADOR-NU';
    } },
    { nome: 'AD.3 bug de f-string: `f"{manifesto[\'prefixo\']}"` (base conhecida DENTRO da interpolacao) SUBSTITUI normalmente', fn: () => {
      const linha = '    tabela = f"{manifesto[\'prefixo\']}migrations"';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'prefixo', 'chave', FMT_PY, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'identificador';
    } },
    { nome: 'AD.3 bug de f-string: string Python SEM prefixo `f` (string-sem-espaco de verdade) continua pelo ramo antigo, sem regressao', fn: () => {
      const linha = "    chave = 'prefixo'";
      const oc = ocorrenciasClassificadasNaLinha(linha, 'prefixo', 'chave', FMT_PY, false, undefined, false, 'AD.3');
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'string-sem-espaco';
    } },
    { nome: 'AD.3 fronteira de arquivo: item chave APLICA a tools/gate/rules (as ~40 regras leitoras) — rede de seguranca e na decisao, nao na pasta', fn: () => {
      const item = { tipo: 'chave' };
      const caminhoRegra = join(RAIZ_TEMPLATE, 'tools', 'gate', 'rules', 'structure.mjs');
      const caminhoCases = join(RAIZ_TEMPLATE, 'tools', 'gate', 'tests', 'cases.mjs');
      return itemAplicaAoArquivo(item, caminhoRegra) === true && itemAplicaAoArquivo(item, caminhoCases) === true;
    } },
    { nome: 'AD.3 fronteira de arquivo: item simbolo continua RESTRITO a bindings/doutrina/docs-viva — nao regrediu o achado do AD.2', fn: () => {
      const item = { tipo: 'simbolo' };
      const caminhoTools = join(RAIZ_TEMPLATE, 'tools', 'gate', 'rules', 'structure.mjs');
      const caminhoBindings = join(RAIZ_TEMPLATE, 'bindings', 'typescript', '_template', 'api', 'src', 'config.ts');
      return itemAplicaAoArquivo(item, caminhoTools) === false && itemAplicaAoArquivo(item, caminhoBindings) === true;
    } },
    // Mapeamento `antigo→novo` numa crase so (Bloco AD.4, achado do revisor em decisoes.md §233/§237).
    { nome: 'RECUSADO-MAPEAMENTO: lado esquerdo de `ferramentas→tools` (crase unica) recusa mesmo sem marcador de protecao', fn: () => {
      const linha = 'Pastas estruturais (12) — `ferramentas→tools` `dominio→domain` `portas→ports`.';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'ferramentas', 'pasta', FMT_MD, true);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-MAPEAMENTO';
    } },
    { nome: 'SUBSTITUI: `core/dominio/` (crase sem seta) continua caminho normal — mapeamento nao se aplica sem seta', fn: () => {
      const linha = 'A regra de negocio mora em `core/dominio/`.';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'pasta', FMT_MD, true);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'caminho';
    } },
    { nome: 'RECUSADO-MAPEAMENTO: par `X` (→ `Y`) com seta FORA da crase (duas crases) tambem recusa o lado esquerdo', fn: () => {
      const linha = 'Simbolos dentro de `ferramentas/` (→ `tools/`) | portugues';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'ferramentas', 'pasta', FMT_MD, true);
      return oc.length === 1 && oc[0].decisao === 'recusa' && oc[0].classe === 'RECUSADO-MAPEAMENTO';
    } },
    { nome: 'SUBSTITUI: diagrama de SEQUENCIA (tres+ elos, `a` → `b` → `c`) nao e par de mapeamento — elo do meio substitui normal', fn: () => {
      const linha = 'ordem: `contrato/openapi.yaml` → `core/dominio` → `api/src/routes` → `tests/`.';
      const oc = ocorrenciasClassificadasNaLinha(linha, 'dominio', 'pasta', FMT_MD, true);
      return oc.length === 1 && oc[0].decisao === 'substitui' && oc[0].classe === 'caminho';
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
  process.stdout.write(`\nautoteste (apply-rename): ${total - falhas}/${total} ok\n`);
  return falhas === 0 ? 0 : 1;
}

// ================================================================================================
// CLI
// ================================================================================================

function principal() {
  const argv = process.argv.slice(2);
  if (argv.includes('--autoteste')) return rodarAutoteste();
  const indiceFase = argv.indexOf('--fase');
  const fase = indiceFase === -1 ? null : argv[indiceFase + 1];
  if (fase === null) {
    process.stderr.write('uso: node tests/apply-rename.mjs --fase AD.1 --relatorio\n'
      + '     node tests/apply-rename.mjs --fase AD.1 --aplicar\n'
      + '     node tests/apply-rename.mjs --fase AD.1 --relatorio --gravar-recusas   aceita as recusas atuais como novo baseline\n'
      + '     node tests/apply-rename.mjs --fase AD.1 --diferencial <arvore-pristina>\n'
      + '     node tests/apply-rename.mjs --autoteste\n');
    return 1;
  }
  const indiceDiferencial = argv.indexOf('--diferencial');
  if (indiceDiferencial !== -1) {
    const raizPristina = argv[indiceDiferencial + 1];
    if (!raizPristina) {
      process.stderr.write('--diferencial exige o caminho da arvore pristina\n');
      return 1;
    }
    return rodarDiferencial(fase, resolve(raizPristina));
  }
  return rodar(fase, argv.includes('--aplicar'), argv.includes('--gravar-recusas'));
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal();
}
