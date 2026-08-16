#!/usr/bin/env node
/**
 * run.mjs — o autoteste do gate. Lei dona: specs/arquitetura/04-regras.md §7.3
 *
 *   node tools/gate/tests/run.mjs [--binding typescript]
 *
 * Duas afirmações, e o gate só está saudável se as duas valerem:
 *   1. o molde CONFORME produz ZERO erro — senão o gate acusa o que não deve;
 *   2. cada mutação de `cases.mjs` produz o id esperado e **NENHUM id não declarado** — senão ou a
 *      regra não cobra nada, ou outra regra passa a acusar onde não devia.
 *
 * A mutação que cria um segundo defeito de verdade declara o co-achado em `tambem: [...]`. Declarar
 * é permitido; surpreender, não. Extra fora da lista REPROVA, e é assim que uma regra nova que
 * comece a acusar em cima de caso alheio derruba o autoteste em vez de entrar calada.
 *
 * `tambem` é lido como TETO, não como obrigação: o co-achado pode não aparecer num binding cujo
 * molde não tem a peça (o `web/` só existe em TS e JS). Exigir presença tornaria a lista falsa em
 * dois dos três bindings.
 *
 * Caso que muta arquivo de código declara um ALVO LÓGICO (`rotas`, `mappers`) e o trecho por
 * família de sintaxe (`{ js, py }`) — ver `ALVOS` e `FAMILIA_DE_SINTAXE` abaixo. É o que permite a
 * mesma regra ser provada nos três bindings, e não só naquele em que o caso foi escrito. Onde o
 * conteúdo é agnóstico (manifesto, `config/*.json`, `openapi.yaml`, SQL), nada disso é preciso.
 *
 * A segunda é a que importa mais: uma regra quebrada passa despercebida para sempre, porque
 * "verde" é indistinguível de "não verificou". Este runner torna as duas coisas distinguíveis.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { carregarContexto } from '../context.mjs';
import { analisar } from '../engine.mjs';
import { saidaDe } from '../../generate-lint-config.mjs';
import { CASOS } from './cases.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_TEMPLATE = join(AQUI, '..', '..', '..');

/**
 * Alvos LÓGICOS — o caso nomeia o PAPEL do arquivo, e o harness resolve o caminho de cada binding.
 *
 * Sem isto, o caso precisava fixar `api/src/routes/index.ts` e só rodava em TypeScript: a regra
 * valia nos três bindings e a prova dela, num só.
 */
const ALVOS = {
  rotas: {
    typescript: 'api/src/routes/index.ts',
    javascript: 'api/src/routes/index.js',
    python: 'api/src/rotas.py',
  },
  // Sobe da pasta do módulo para a raiz do PROJETO: é lá que moram os alvos das regras de escopo
  // `root` (`verificacao-declarada`, `lint-derivado`, `manifesto-raiz`, `env-raiz-declarado`), e
  // não dentro do módulo.
  lintRaiz: {
    typescript: '../../eslint.config.js',
    javascript: '../../eslint.config.js',
    python: '../../.ruff.toml',
  },
  // A raiz de composição — o arquivo da FIAÇÃO onde a chave de ambiente da raiz é lida de verdade.
  composicaoRaiz: {
    typescript: '../../src/composicao.ts',
    javascript: '../../src/composicao.js',
    python: '../../src/composicao.py',
  },
  // As outras duas pontas do diagrama de dependência. O caso muta o arquivo REAL da fiação, e não
  // um arquivo inventado ao lado: é o mesmo arquivo que o molde conforme mantém limpo, e é o que
  // torna o par "conforme passa / violado acusa" uma afirmação sobre a MESMA peça.
  adapterRaiz: {
    typescript: '../../adapters/memory/index.ts',
    javascript: '../../adapters/memory/index.js',
    python: '../../adapters/memory/__init__.py',
  },
  portasRaiz: {
    typescript: '../../packages/ports/index.ts',
    javascript: '../../packages/ports/index.js',
    python: '../../packages/ports/__init__.py',
  },
  mappers: {
    typescript: 'api/src/mappers/index.ts',
    javascript: 'api/src/mappers/index.js',
    python: 'api/src/mappers.py',
  },
  /**
   * A pasta de teste de tela. **Não declarada para o Python de propósito**, e o silêncio é o ponto:
   * aquele molde nasce sem `web/` e com `webPath: null`, então `testes-web` é vacuamente satisfeita
   * ali. Um caso que apenas apagasse a pasta (`removerPasta` usa `force`) não acharia nada no Python
   * e REPROVARIA por "nenhum achado" — culpando a regra por um molde que não tem a peça. Sem o alvo,
   * `removerPastaEm` estoura `SEM_COBERTURA` com o motivo, que é a verdade: ausência de cobertura,
   * nunca aprovação.
   */
  pastaTestesWeb: {
    typescript: 'tests/web',
    javascript: 'tests/web',
  },
};

/**
 * Famílias de SINTAXE — o segundo eixo, e o que faz o mapa de caminho não ser meia solução.
 *
 * Portar só o caminho seria pior que a lacuna: o caso deixaria de PULAR e passaria a rodar com um
 * trecho que a linguagem do molde não reconhece, a regra não acharia nada, e o autoteste anunciaria
 * cobertura onde não há — enquanto SEM COBERTURA, ao menos, se declara. TS e JS registram rota e
 * projetam saída do mesmo jeito, então compartilham o trecho `js`; Python tem o dele.
 */
const FAMILIA_DE_SINTAXE = { typescript: 'js', javascript: 'js', python: 'py' };

/**
 * Falta de trecho ou de alvo NUNCA vira aprovação silenciosa: vira SEM COBERTURA declarada, com o
 * motivo, do mesmo jeito que o `ENOENT` de um caso escrito para o molde de outro binding.
 */
function semCobertura(motivo) {
  const causa = /** @type {Error & {code: string}} */ (new Error(motivo));
  causa.code = 'SEM_COBERTURA';
  return causa;
}

/**
 * Irmã de `semCobertura`: a agulha de `substituir` não foi achada no arquivo. Diferente de
 * SEM_COBERTURA (o caso não se aplica a este binding), aqui o caso SE APLICA e a mutação falhou —
 * é reprovação do CASO, não ausência de cobertura, e por isso `verificarCaso` a trata como `FALHA`
 * comum: reprova só este caso, os demais continuam medidos.
 *
 * Quando a causa é DETECTÁVEL — agulha com `\n` literal contra um arquivo em CRLF — a mensagem
 * nomeia a causa provável em vez de deixar quem lê decifrar os sintomas de novo.
 */
function mutacaoInvalida(rel, de, conteudo) {
  const base = `substituir: texto nao encontrado em ${rel}: ${JSON.stringify(de)}`;
  const provavelmenteEol = de.includes('\n') && conteudo.includes('\r\n');
  const causa = /** @type {Error & {code: string}} */ (new Error(provavelmenteEol
    ? `${base} — o arquivo esta em CRLF e a agulha em LF; renormalize (git add --renormalize .)`
    : base));
  causa.code = 'MUTACAO_INVALIDA';
  return causa;
}

/** Trecho agnóstico entra como string; onde a sintaxe importa, como `{ js, py }`. */
function trechoDe(trechos, binding) {
  if (typeof trechos === 'string') return trechos;
  return trechos[binding] ?? trechos[FAMILIA_DE_SINTAXE[binding]] ?? null;
}

function lerJson(caminho) {
  return JSON.parse(readFileSync(caminho, 'utf8').replace(/^﻿/, ''));
}

function gravarJson(caminho, valor) {
  writeFileSync(caminho, `${JSON.stringify(valor, null, 2)}\n`, 'utf8');
}

/** Lê um JSON, aplica `transformar` e regrava — o núcleo comum de `manifesto`/`manifestoRaiz`/
 * `config` em `operacoes`, extraído para tirar `operacoes` do limiar de linhas sem mudar nada do
 * que cada operação faz. */
function transformarJson(caminho, transformar) {
  gravarJson(caminho, transformar(lerJson(caminho)));
}

/** Operações que um caso pode aplicar sobre a cópia do molde. */
function operacoes(raiz, binding) {
  const acrescentar = (rel, conteudo) => {
    const caminho = join(raiz, rel);
    writeFileSync(caminho, readFileSync(caminho, 'utf8') + conteudo, 'utf8');
  };
  return {
    escrever: (rel, conteudo) => writeFileSync(join(raiz, rel), conteudo, 'utf8'),
    acrescentar,
    /**
     * Acrescenta num alvo LÓGICO, resolvendo caminho e sintaxe pelo binding. É a operação que
     * torna um caso portável nos dois eixos de uma vez.
     */
    acrescentarEm: (alvo, trechos) => {
      const rel = ALVOS[alvo]?.[binding];
      if (rel === undefined) throw semCobertura(`o binding "${binding}" nao declara o alvo "${alvo}"`);
      const trecho = trechoDe(trechos, binding);
      if (trecho === null) throw semCobertura(`o caso nao tem trecho de "${alvo}" para a sintaxe de "${binding}"`);
      acrescentar(rel, trecho);
    },
    /**
     * `String.replace(agulha)` que nao acha devolve a string IGUAL, em silencio — a mutacao vira
     * noop e o caso reporta "nenhum achado", apontando a REGRA quando o defeito esta na MUTACAO
     * Lanca `MUTACAO_INVALIDA` em vez de aceitar noop: quem escreve um caso
     * novo com agulha errada (typo, `\n` que o molde nao tem mais) descobre no proprio `substituir`,
     * nao tres camadas depois — e so ESTE caso reprova, os outros continuam medidos.
     */
    substituir: (rel, de, para) => {
      const caminho = join(raiz, rel);
      const conteudo = readFileSync(caminho, 'utf8');
      if (!conteudo.includes(de)) throw mutacaoInvalida(rel, de, conteudo);
      writeFileSync(caminho, conteudo.replace(de, para), 'utf8');
    },
    remover: (rel) => rmSync(join(raiz, rel), { force: true }),
    removerPasta: (rel) => rmSync(join(raiz, rel), { recursive: true, force: true }),
    /**
     * Remove uma pasta por alvo LÓGICO. Diferente de `removerPasta`, ela EXIGE que o binding declare
     * o alvo: onde o molde não tem a peça, o caso vira SEM COBERTURA declarada em vez de apagar o
     * nada e depois cobrar da regra um achado que não poderia existir.
     */
    removerPastaEm: (alvo) => {
      const rel = ALVOS[alvo]?.[binding];
      if (rel === undefined) throw semCobertura(`o binding "${binding}" nao declara o alvo "${alvo}"`);
      rmSync(join(raiz, rel), { recursive: true, force: true });
    },
    manifesto: (transformar) => transformarJson(join(raiz, 'module.json'), transformar),
    /** O manifesto da RAIZ (`project.json`), que fica dois níveis acima da pasta do módulo. */
    manifestoRaiz: (transformar) => transformarJson(join(raiz, '..', '..', 'project.json'), transformar),
    config: (assunto, transformar) => transformarJson(join(raiz, 'config', `${assunto}.json`), transformar),
  };
}

/**
 * A RAIZ do projeto temporário — `config/` e a config de lint gerada, como `create-project.mjs` as
 * instala.
 *
 * O fixture já tem `modules/`, e por isso é um projeto aos olhos do gate; só que um projeto
 * INCOMPLETO, sem nada do que a raiz carrega. `verificacao-declarada` e `lint-derivado` olham para
 * fora do módulo, e acusariam em TODO caso um fixture que ficasse assim incompleto.
 * O conserto é o fixture ficar fiel ao projeto real, nunca a regra deixar de cobrar.
 */
function montarRaizDoProjeto(temporario, binding) {
  const raiz = join(RAIZ_TEMPLATE, 'bindings', binding, 'root');
  cpSync(join(raiz, 'config'), join(temporario, 'config'), { recursive: true });
  const { nome } = saidaDe(binding);
  cpSync(join(raiz, nome), join(temporario, nome));
  // O `.gitignore` é da raiz e `gitignore-segredo` o lê: sem ele aqui, a regra acusaria em TODO
  // caso — de novo o fixture sendo um projeto incompleto, não a regra estando errada.
  cpSync(join(raiz, '.gitignore'), join(temporario, '.gitignore'));
  // O manifesto da raiz, pelo mesmo motivo: `manifesto-raiz` o exige em todo projeto.
  cpSync(join(raiz, 'project.json'), join(temporario, 'project.json'));
  // O hook de pre-commit, pelo mesmo motivo: `pre-commit-instalado` o exige em todo projeto, e sem
  // copiá-lo aqui o fixture voltaria a ser um projeto incompleto — a mesma classe de defeito que as
  // duas linhas acima já corrigiram para `.gitignore` e `project.json`.
  cpSync(join(raiz, '.githooks'), join(temporario, '.githooks'), { recursive: true });
  // A FIAÇÃO. Ela entra por duas razões, e a segunda é a que importa mais: `env-raiz-declarado`
  // precisa de código de raiz para ter o que ler, E este é o único lugar onde se prova, caso a
  // caso, que carregar o código da raiz NÃO fez regra de módulo nenhuma passar a enxergá-lo.
  for (const pasta of ['adapters', 'src', 'packages']) {
    cpSync(join(raiz, pasta), join(temporario, pasta), { recursive: true });
  }
}

/** Vizinho mínimo, para as regras globais (import lateral, tabela alheia, ciclo). */
function criarVizinho(pastaModulos, molde, consome) {
  const raiz = join(pastaModulos, 'vizinho');
  cpSync(molde, raiz, { recursive: true });
  const caminho = join(raiz, 'module.json');
  const manifesto = lerJson(caminho);
  manifesto.id = 'vizinho';
  manifesto.basePath = '/api/v1/vizinho';
  manifesto.webPath = '/vizinho';
  manifesto.data = { schema: 'escopo', prefix: 'vizinho_', tables: ['vizinho_metadados'] };
  manifesto.permissions = ['vizinho:ler', 'vizinho:escrever'];
  // `/resumo` e obrigatoria em todo modulo: o vizinho fecha o ciclo sem violar `consome-contrato`.
  manifesto.consumes = consome ? [{ module: 'molde', contract: 'GET /resumo', why: 'ciclo' }] : [];
  gravarJson(caminho, manifesto);
  return raiz;
}

/** Monta um projeto temporário com o molde (e opcionalmente um vizinho), roda o gate e limpa. */
function rodarCaso(binding, caso) {
  const temporario = mkdtempSync(join(tmpdir(), 'gate-teste-'));
  try {
    const modulos = join(temporario, 'modules');
    const molde = join(RAIZ_TEMPLATE, 'bindings', binding, '_template');
    const alvo = join(modulos, '_template');
    cpSync(molde, alvo, { recursive: true });
    montarRaizDoProjeto(temporario, binding);

    if (caso?.mutar !== undefined) caso.mutar(operacoes(alvo, binding));

    const pastas = [alvo];
    if (caso?.exigeVizinho === true) pastas.push(criarVizinho(modulos, molde, caso.vizinhoConsome === true));

    const contextos = pastas.map((p) => carregarContexto(p, temporario));
    const alvoCtx = contextos.filter((c) => c.raiz === alvo);
    return analisar(contextos, alvoCtx, {});
  } finally {
    rmSync(temporario, { recursive: true, force: true });
  }
}

function verificarConforme(binding) {
  const erros = rodarCaso(binding, null).filter((a) => a.nivel === 'erro');
  if (erros.length === 0) return { ok: true, rotulo: 'molde conforme produz zero erro' };
  return {
    ok: false,
    rotulo: 'molde conforme produz zero erro',
    detalhe: erros.map((e) => `[${e.regra}] ${e.mensagem}`).join('\n      '),
  };
}

/**
 * O caso passa a poder afirmar mais que o id — `{ arquivo?, contem?, vezes? }`, os três opcionais
 * Sem eles, `null` sempre: nenhum caso existente muda de comportamento.
 *
 * O harness hoje só compara CONJUNTO DE IDS: se uma regra acusasse a linha errada, ou o arquivo
 * errado, ou o número errado de vezes, ela sairia sob o MESMO id e o autoteste passaria do mesmo
 * jeito — "verde" indistinguível de "verificou a coisa certa". `arquivo`/`contem` restringem QUAL
 * achado, entre os de `caso.regra`, conta; `vezes` afirma QUANTOS — sem ele, um só já basta (a
 * mesma tolerância de hoje).
 */
function verificarAfirmacaoFina(caso, achados) {
  if (caso.arquivo === undefined && caso.contem === undefined && caso.vezes === undefined) return null;

  const daRegra = achados.filter((a) => a.regra === caso.regra);
  const casados = daRegra.filter((a) => (
    (caso.arquivo === undefined || a.mensagem.includes(caso.arquivo))
    && (caso.contem === undefined || a.mensagem.includes(caso.contem))
  ));

  if (casados.length === 0) {
    const oQueFaltou = [
      caso.arquivo !== undefined ? `arquivo "${caso.arquivo}"` : null,
      caso.contem !== undefined ? `texto "${caso.contem}"` : null,
    ].filter((x) => x !== null).join(' e ');
    return `nenhum achado de "${caso.regra}" tem ${oQueFaltou} — achados da regra: `
      + (daRegra.map((a) => a.mensagem).join(' | ') || '(nenhum)');
  }
  if (caso.vezes !== undefined && casados.length !== caso.vezes) {
    return `esperava ${caso.vezes} achado(s) casando arquivo/contem, achou ${casados.length}: `
      + casados.map((a) => a.mensagem).join(' | ');
  }
  return null;
}

function verificarCaso(binding, caso) {
  const rotulo = `${caso.regra} — ${caso.descricao}`;
  let achados;
  try {
    achados = rodarCaso(binding, caso);
  } catch (causa) {
    // O caso mexe num arquivo que este binding nao tem (ex.: `web/` num molde Python), ou nao
    // declara trecho para a sintaxe dele. Isso e AUSENCIA DE COBERTURA, nao aprovacao — por isso
    // conta separado, aparece na saida e diz o MOTIVO, para lacuna nao se confundir com conformidade.
    if (causa?.code === 'ENOENT') {
      return { pulado: true, rotulo, motivo: 'o molde deste binding nao tem o arquivo que o caso muta' };
    }
    if (causa?.code === 'SEM_COBERTURA') return { pulado: true, rotulo, motivo: causa.message };
    // A agulha de `substituir` nao foi achada: o CASO se aplica a este binding e a mutacao falhou —
    // reprova so ele, no vocabulario comum de FALHA, sem cegar os demais.
    if (causa?.code === 'MUTACAO_INVALIDA') return { ok: false, rotulo, detalhe: causa.message };
    throw causa;
  }
  const ids = new Set(achados.map((a) => a.regra));
  const permitidos = new Set([caso.regra, ...(caso.tambem ?? [])]);
  const extras = [...ids].filter((id) => !permitidos.has(id));

  if (!ids.has(caso.regra)) {
    return {
      ok: false,
      rotulo,
      detalhe: ids.size === 0 ? 'nenhum achado' : `acusou: ${[...ids].join(', ')}`,
    };
  }
  if (extras.length > 0) {
    return {
      ok: false,
      rotulo,
      detalhe: `id NAO declarado: ${extras.join(', ')} — se o co-achado for legitimo, declare em `
        + '`tambem: [...]`; se nao for, o caso ou a regra e que precisa de conserto',
    };
  }

  const semAfirmacaoFina = verificarAfirmacaoFina(caso, achados);
  if (semAfirmacaoFina !== null) return { ok: false, rotulo, detalhe: semAfirmacaoFina };

  return { ok: true, rotulo };
}

function principal() {
  const argumentos = process.argv.slice(2);
  const indice = argumentos.indexOf('--binding');
  const binding = indice === -1 ? 'typescript' : argumentos[indice + 1];

  const resultados = [verificarConforme(binding), ...CASOS.map((caso) => verificarCaso(binding, caso))];
  const falhas = resultados.filter((r) => r.ok !== true && r.pulado !== true);
  const pulados = resultados.filter((r) => r.pulado === true);

  for (const resultado of resultados) {
    const marca = resultado.ok === true ? 'ok   ' : (resultado.pulado === true ? 'pula ' : 'FALHA');
    process.stdout.write(`  ${marca} ${resultado.rotulo}\n`);
    if (resultado.pulado === true) process.stdout.write(`       SEM COBERTURA: ${resultado.motivo}\n`);
    if (resultado.ok !== true && resultado.pulado !== true) {
      process.stdout.write(`       ${resultado.detalhe}\n`);
    }
  }

  const executados = resultados.length - pulados.length;
  const cobertas = new Set(CASOS.map((c) => c.regra));
  process.stdout.write(`\nbinding ${binding}: ${executados - falhas.length}/${executados} ok`);
  if (pulados.length > 0) {
    process.stdout.write(`, ${pulados.length} SEM COBERTURA neste binding (caso escrito para outro)`);
  }
  process.stdout.write(` — ${cobertas.size} regras com caso de teste\n`);
  return falhas.length > 0 ? 1 : 0;
}

process.exit(principal());
