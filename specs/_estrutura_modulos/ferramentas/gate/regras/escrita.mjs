/**
 * regras/escrita.mjs — família "Escrita" do catálogo (specs/arquitetura/04-regras.md §4.7).
 * ids: limiar-funcao, limiar-aninhamento, limiar-parametros, excecao-engolida
 *
 * Por que no gate e não só no linter: o gate viaja com o módulo e roda sem `npm install`. Delegar
 * 100% ao ESLint/Ruff significa que num repositório sem linter instalado estes limites não são
 * cobrados por ninguém — que era exatamente o estado do template antes desta família existir.
 *
 * O linter continua sendo a verificação PROFUNDA (complexidade ciclomática, tipos, regras de
 * idioma). Aqui ficam os quatro limiares que dá para medir por estrutura de bloco, de forma
 * conservadora: na dúvida, esta família não acusa.
 */
const MAX_LINHAS_FUNCAO = 40;
const MAX_ANINHAMENTO = 3;
const MAX_PARAMETROS = 4;

const EXT_CHAVES = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Só arquivos de produção da linguagem pedida. Teste tem outra economia e fica de fora. */
function arquivosDe(ctx, chaves) {
  return ctx.codigo.filter((a) => !a.eTeste && EXT_CHAVES.has(a.ext) === chaves);
}

function contarChaves(texto) {
  const semTexto = texto.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '');
  const abre = (semTexto.match(/[{[(]/g) ?? []).length;
  const fecha = (semTexto.match(/[}\])]/g) ?? []).length;
  return abre - fecha;
}

/** Assinaturas de função em linguagem de chaves e em Python. */
const INICIO_FUNCAO = [
  /\bfunction\s+\w+\s*\(/,
  /\b(?:export\s+)?(?:async\s+)?function\b/,
  /\b\w+\s*\([^)]*\)\s*(?::\s*[^={]+)?\s*(?:=>\s*)?\{\s*$/,
  /^\s*(?:async\s+)?def\s+\w+\s*\(/,
];

function ehInicioDeFuncao(texto) {
  return INICIO_FUNCAO.some((padrao) => padrao.test(texto));
}

/** Mede o tamanho de cada função por profundidade de bloco (chaves) ou por recuo (Python). */
function medirFuncoes(arquivo) {
  const ehPython = arquivo.ext === '.py';
  const medidas = [];
  let atual = null;

  for (const { numero, texto } of arquivo.linhasCodigo) {
    if (atual !== null) {
      const recuo = texto.length - texto.trimStart().length;
      const acabou = ehPython ? recuo <= atual.recuo : (atual.profundidade += contarChaves(texto)) <= 0;
      atual.linhas += 1;
      if (acabou) {
        medidas.push(atual);
        atual = null;
        continue;
      }
    }
    if (atual === null && ehInicioDeFuncao(texto)) {
      atual = {
        inicio: numero,
        linhas: 0,
        recuo: texto.length - texto.trimStart().length,
        profundidade: ehPython ? 1 : contarChaves(texto),
      };
    }
  }
  if (atual !== null) medidas.push(atual);
  return medidas;
}

/** Conta parâmetros da assinatura, tolerando genéricos e valores default simples. */
function contarParametros(texto) {
  const abre = texto.indexOf('(');
  if (abre === -1) return 0;
  let profundidade = 0;
  let atual = '';
  const partes = [];

  for (const caractere of texto.slice(abre)) {
    if ('([{<'.includes(caractere)) profundidade += 1;
    if (')]}>'.includes(caractere)) {
      profundidade -= 1;
      if (profundidade === 0) break;
    }
    if (caractere === ',' && profundidade === 1) {
      partes.push(atual);
      atual = '';
      continue;
    }
    if (profundidade >= 1) atual += caractere;
  }
  partes.push(atual);
  return partes.map((p) => p.replace('(', '').trim()).filter((p) => p !== '' && p !== 'self' && p !== 'cls').length;
}

// Só estes abrem "aninhamento". Objeto literal, JSX, callback e bloco de função NAO sao
// aninhamento de controle — contá-los foi o que gerou falso positivo na primeira versão desta regra.
const CONTROLE = /^\s*(?:\}\s*)?(?:if|else|for|while|switch|do|try|catch|finally)\b/;
const CONTROLE_PY = /^\s*(?:if|elif|else|for|while|with|try|except|finally)\b/;

/** Profundidade de blocos de CONTROLE em linguagem de chaves, por pilha. */
function aninhamentoPorChaves(linhas) {
  const pilha = [];
  const achados = [];

  for (const { numero, texto } of linhas) {
    const semTexto = texto.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '');
    const ehControle = CONTROLE.test(texto);
    let primeiraAbertura = true;

    // O maximo DENTRO da linha, nao o saldo no fim dela: `if (a) { return 1; }` abre e fecha na
    // mesma linha, e era exatamente esse caso que escapava quando so o saldo final era medido.
    let maximo = pilha.filter(Boolean).length;
    for (const caractere of semTexto) {
      if (caractere === '{') {
        pilha.push(ehControle && primeiraAbertura);
        primeiraAbertura = false;
        maximo = Math.max(maximo, pilha.filter(Boolean).length);
      }
      if (caractere === '}') pilha.pop();
    }
    if (maximo > MAX_ANINHAMENTO) achados.push({ numero, profundidade: maximo });
  }
  return achados;
}

/** Profundidade de blocos de CONTROLE em Python, pelos recuos onde um controle abriu. */
function aninhamentoPython(linhas) {
  const abertos = [];
  const achados = [];

  for (const { numero, texto } of linhas) {
    const recuo = texto.length - texto.trimStart().length;
    while (abertos.length > 0 && recuo <= abertos[abertos.length - 1]) abertos.pop();
    if (abertos.length > MAX_ANINHAMENTO) achados.push({ numero, profundidade: abertos.length });
    if (CONTROLE_PY.test(texto) && texto.trimEnd().endsWith(':')) abertos.push(recuo);
  }
  return achados;
}

export default [
  {
    id: 'limiar-funcao',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of [...arquivosDe(ctx, true), ...arquivosDe(ctx, false)]) {
        for (const medida of medirFuncoes(arquivo)) {
          if (medida.linhas > MAX_LINHAS_FUNCAO) {
            achados.push(`${arquivo.rel}:${medida.inicio}: funcao com ${medida.linhas} linhas (limiar ${MAX_LINHAS_FUNCAO})`);
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'limiar-aninhamento',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        const medir = arquivo.ext === '.py' ? aninhamentoPython : aninhamentoPorChaves;
        for (const { numero, profundidade } of medir(arquivo.linhasCodigo)) {
          achados.push(`${arquivo.rel}:${numero}: aninhamento ${profundidade} (limiar ${MAX_ANINHAMENTO}) — use guard clause`);
        }
      }
      return achados;
    },
  },
  {
    id: 'limiar-parametros',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        for (const { numero, texto } of arquivo.linhasCodigo) {
          if (!ehInicioDeFuncao(texto)) continue;
          const total = contarParametros(texto);
          if (total > MAX_PARAMETROS) {
            achados.push(`${arquivo.rel}:${numero}: ${total} parametros (limiar ${MAX_PARAMETROS}) — agrupe num objeto`);
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'excecao-engolida',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const vazio = [
        /catch\s*(?:\([^)]*\))?\s*\{\s*\}/,
        /except[^:]*:\s*pass\s*$/,
        /catch\s*(?:\([^)]*\))?\s*\{\s*$/,
      ];
      const achados = [];
      for (const arquivo of ctx.codigo) {
        if (arquivo.eTeste) continue;
        const linhas = arquivo.linhasCodigo;
        linhas.forEach(({ numero, texto }, indice) => {
          if (vazio[0].test(texto) || vazio[1].test(texto)) {
            achados.push(`${arquivo.rel}:${numero}: excecao engolida — trate, traduza ou deixe subir`);
            return;
          }
          // `catch {` seguido direto de `}` na proxima linha de codigo.
          if (vazio[2].test(texto) && linhas[indice + 1]?.texto.trim() === '}') {
            achados.push(`${arquivo.rel}:${numero}: excecao engolida — trate, traduza ou deixe subir`);
          }
        });
      }
      return achados;
    },
  },
];
