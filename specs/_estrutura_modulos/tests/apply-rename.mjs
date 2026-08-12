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
  ['dominio', ['PAPEIS', 'papel']],
  ['gateway', ['PAPEIS', 'papel']],
  ['conector', ['PAPEIS', 'papel']],
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
]);

/** `literaisProtegidos` é o `Map` acima (lido do inventário) — devolve `true` se o LITERAL está
 * marcado como SEMPRE protegido (`true`), como protegido-por-padrão-com-exceção-de-fase (objeto
 * `{ protegidoExceto }`, sem a exceção aplicada aqui — ver `protecaoSuspensaNestaFase`), ou se tem
 * lista de marcadores E a linha onde ele ocorreu bate um deles. */
export function protegidoNestaLinha(linha, nomeOcorrencia, literaisProtegidos) {
  const padroes = literaisProtegidos?.get(nomeOcorrencia);
  if (!padroes) return false;
  if (padroes === true) return true;
  if (Array.isArray(padroes)) return padroes.some((p) => linha.includes(p));
  return true; // objeto { protegidoExceto }: protegido POR PADRÃO — a exceção é do chamador.
}

/**
 * A FASE ATUAL é a declarada como exceção deste literal (Bloco AD, B3) — ele deixa de estar
 * protegido só agora, porque é ELE MESMO que está sendo renomeado nesta fase. Separada de
 * `protegidoNestaLinha` de propósito: a exceção tem de vetar TODA fonte de proteção por igual —
 * marcador de linha, `true` incondicional ou o bônus de `dentroDeArrayProtegido` — não só uma.
 */
export function protecaoSuspensaNestaFase(nomeOcorrencia, literaisProtegidos, fase) {
  const padroes = literaisProtegidos?.get(nomeOcorrencia);
  if (padroes === true || padroes === undefined || Array.isArray(padroes)) return false;
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
export function decidir(contexto, nomeOcorrencia, tipoItem, protegido, fase) {
  if (tipoItem === 'arquivo') return { decisao: 'substitui', classe: 'caminho' };
  if (contexto.tipo === 'string') {
    const palavra = palavraAoRedor(contexto.conteudo, contexto.posicao, contexto.tamanho);
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
    // Caminho de verdade (barra/extensão) SEMPRE substitui, protegido ou não — mesma precedência
    // do ramo 'string' acima (`pareceCaminho` antes do `protegido`): é o que mantém
    // `join('modulos', id, 'contrato', 'openapi.yaml')` substituindo enquanto `id: 'contrato'`
    // recusa. Só o token NU (sem barra/extensão) dentro de crase consulta `protegido` — antes
    // disto, crase sempre substituía cego, e foi assim que `generate-port-schemas.mjs` corrompeu
    // `"portas"` embutido em comentário/regex seis vezes (Bloco AI, AI.5).
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
  // PROPRIEDADE (precedido de `.` — `manifesto.nome`, `ctx.manifesto.envRequerido`); bare fica
  // recusado mesmo em AD.3. Python não usa esta forma (chave sempre é string, ramo 'string' acima).
  if (tipoItem === 'chave' && !contexto.precedidoDePonto) {
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
 */
export function ocorrenciasClassificadasNaLinha(
  linha, antigo, tipo, formato, jaEmComentario, literaisProtegidos, dentroDeArrayProtegido = false,
  fase = 'AD.1',
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
      if (stringEnvolvente) {
        contexto = {
          tipo: 'string',
          conteudo: stringEnvolvente.conteudo,
          posicao: pos - (stringEnvolvente.inicio + 1),
          tamanho: antigo.length,
        };
      } else if (valorYaml && pos >= valorYaml.inicio && pos + antigo.length <= valorYaml.fim) {
        contexto = {
          tipo: 'string',
          conteudo: valorYaml.conteudo,
          posicao: pos - valorYaml.inicio,
          tamanho: antigo.length,
        };
      } else {
        // `precedidoDePonto` (B2): só importa pro ramo 'codigo' de 'chave' — `manifesto.nome` tem
        // `.` imediatamente antes de `nome`; `const nome = x` não tem. Barato de calcular sempre,
        // ignorado pelos outros tipos.
        contexto = { tipo: 'codigo', linhaEhImport, precedidoDePonto: linha[pos - 1] === '.' };
      }
    }
    const protegidoBase = protegidoNestaLinha(linha, antigo, literaisProtegidos)
      || (dentroDeArrayProtegido && (literaisProtegidos?.has(antigo) ?? false));
    // B3: a fase ATUAL sendo a exceção declarada do literal veta TODA fonte de proteção acima —
    // marcador, `true` incondicional ou o bônus de array — não só uma.
    const protegido = protegidoBase && !protecaoSuspensaNestaFase(antigo, literaisProtegidos, fase);
    const { decisao, classe } = decidir(contexto, antigo, tipo, protegido, fase);
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
const CAMINHOS_EXCLUIDOS = [
  /(^|[\\/])modulo\.json$/,
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

function arquivos(pasta, acc = []) {
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    if (IGNORAR_NA_VARREDURA.has(entrada.name)) continue;
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) arquivos(caminho, acc);
    else if (EXT_ALVO.some((ext) => entrada.name.endsWith(ext))) acc.push(caminho);
  }
  return acc;
}

function arquivosAlvo() {
  const brutos = [
    ...arquivos(join(RAIZ_TEMPLATE, 'bindings')),
    ...arquivos(join(RAIZ_TEMPLATE, 'tools')),
    ...arquivos(join(RAIZ_TEMPLATE, 'tests')),
  ];
  return brutos.filter((c) => !CAMINHOS_EXCLUIDOS.some((re) => re.test(c.split('\\').join('/'))));
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
function classificarArquivo(texto, item, formato, literaisProtegidos) {
  const linhas = texto.split(/\r?\n/);
  const porLinha = [];
  if (formato.comentarioTotal) {
    linhas.forEach((linha) => {
      porLinha.push(ocorrenciasClassificadasNaLinha(linha, item.antigo, item.tipo, formato, true, literaisProtegidos, false, item.fase));
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
  linhas.forEach((linha) => {
    const limpa = linha.trim();
    if (RE_ABRE_ARRAY_PROTEGIDO.test(linha)) dentroDeArrayProtegido = true;
    if (cerca !== null) {
      porLinha.push(ocorrenciasClassificadasNaLinha(linha, item.antigo, item.tipo, formato, true, literaisProtegidos, dentroDeArrayProtegido, item.fase));
      if (limpa.includes(cerca)) cerca = null;
      return;
    }
    if (emBloco) {
      porLinha.push(ocorrenciasClassificadasNaLinha(linha, item.antigo, item.tipo, formato, true, literaisProtegidos, dentroDeArrayProtegido, item.fase));
      if (limpa.includes('*/')) emBloco = false;
      return;
    }
    const aspas = formato.ehPython ? ['"""', "'''"].find((d) => limpa.includes(d)) : undefined;
    if (aspas !== undefined) {
      porLinha.push(ocorrenciasClassificadasNaLinha(linha, item.antigo, item.tipo, formato, true, literaisProtegidos, dentroDeArrayProtegido, item.fase));
      if ((limpa.split(aspas).length - 1) % 2 === 1) cerca = aspas;
      return;
    }
    if (formato.marcador === '//' && limpa.startsWith('/*')) {
      porLinha.push(ocorrenciasClassificadasNaLinha(linha, item.antigo, item.tipo, formato, true, literaisProtegidos, dentroDeArrayProtegido, item.fase));
      if (!limpa.includes('*/')) emBloco = true;
      return;
    }
    porLinha.push(ocorrenciasClassificadasNaLinha(linha, item.antigo, item.tipo, formato, false, literaisProtegidos, dentroDeArrayProtegido, item.fase));
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
 */
function itemAplicaAoArquivo(item, caminho) {
  if (item.tipo !== 'simbolo' && item.tipo !== 'chave') return true;
  const raizBindings = join(RAIZ_TEMPLATE, 'bindings') + sep;
  return caminho.startsWith(raizBindings);
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
  const alvos = arquivosAlvo();
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
  const alvos = arquivosAlvo();
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
      protecaoSuspensaNestaFase('portas', PROTEGIDOS_PORTAS, 'AD.3') === true
    ) },
    { nome: 'B3: protecaoSuspensaNestaFase("portas", AD.1) e false — protegido continua fora do alvo', fn: () => (
      protecaoSuspensaNestaFase('portas', PROTEGIDOS_PORTAS, 'AD.1') === false
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
