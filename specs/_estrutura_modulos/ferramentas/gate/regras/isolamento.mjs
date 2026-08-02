/**
 * regras/isolamento.mjs — família "Isolamento" do catálogo (specs/arquitetura/04-regras.md §4.2).
 * ids: import-lateral, import-adapter, sdk-fornecedor, gateway-http, gateway-declarado, consome-ciclo
 *
 * É a família que sustenta a extraibilidade. Se ela passa, o módulo sai da pasta sem refactor.
 */

const SDKS_FORNECEDOR = [
  '@supabase/', 'pg', 'mysql', 'mysql2', 'aws-sdk', '@aws-sdk/', 'firebase',
  'firebase-admin', 'oracledb', 'mongodb', 'mongoose', 'openai', 'redis', 'ioredis',
  'psycopg2', 'boto3', 'sqlalchemy', 'pymongo',
];

// Captura o alvo de `import ... from 'X'`, `require('X')`, `import('X')` e `from X import` (Python).
const PADROES_IMPORT = [
  /from\s+['"]([^'"]+)['"]/g,
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*(?:from|import)\s+([A-Za-z0-9_.]+)/gm,
];

/** Todos os alvos de import de um arquivo, sem duplicata. */
export function importesDe(arquivo) {
  const alvos = new Set();
  for (const padrao of PADROES_IMPORT) {
    for (const achado of arquivo.conteudo.matchAll(padrao)) alvos.add(achado[1]);
  }
  return [...alvos];
}

/** Um import relativo que sobe acima da raiz do módulo saiu da fronteira. */
function saiDoModulo(arquivoRel, alvo) {
  if (!alvo.startsWith('.')) return false;
  const partes = arquivoRel.split('/').slice(0, -1).concat(alvo.split('/'));
  let profundidade = 0;
  for (const parte of partes) {
    if (parte === '..') profundidade -= 1;
    else if (parte !== '.' && parte !== '') profundidade += 1;
    if (profundidade < 0) return true;
  }
  return false;
}

function ehPacoteDeModulo(alvo, idsVizinhos) {
  const casado = alvo.match(/^@[^/]+\/([^/]+)/);
  if (casado === null) return null;
  const base = casado[1].replace(/-(api|web|core)$/, '');
  return idsVizinhos.includes(base) ? base : null;
}

function raizDoPacote(alvo) {
  if (alvo.startsWith('@')) return alvo.split('/').slice(0, 2).join('/');
  return alvo.split('/')[0].split('.')[0];
}

export default [
  {
    id: 'import-lateral',
    nivel: 'erro',
    escopo: 'global',
    verificar(contextos) {
      const ids = contextos.map((c) => c.idPasta);
      const achados = [];
      for (const ctx of contextos) {
        for (const arquivo of ctx.codigo) {
          for (const alvo of importesDe(arquivo)) {
            const vizinho = ehPacoteDeModulo(alvo, ids.filter((id) => id !== ctx.idPasta));
            if (vizinho !== null) {
              achados.push({ modulo: ctx.idPasta, mensagem: `${arquivo.rel}: importa o modulo "${vizinho}" ("${alvo}")` });
            }
            if (saiDoModulo(arquivo.rel, alvo)) {
              achados.push({ modulo: ctx.idPasta, mensagem: `${arquivo.rel}: caminho relativo sai da pasta do modulo ("${alvo}")` });
            }
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'import-adapter',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of ctx.codigo) {
        // Teste é a raiz de composição dele mesmo: montar o adapter de memória ali é legítimo.
        if (arquivo.eTeste) continue;
        for (const alvo of importesDe(arquivo)) {
          if (/(^|\/)adapters?\//.test(alvo) || /^@[^/]+\/adapter-/.test(alvo)) {
            achados.push(`${arquivo.rel}: importa adapter ("${alvo}") — o adapter e INJETADO, nunca importado`);
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'sdk-fornecedor',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      for (const arquivo of ctx.codigo) {
        for (const alvo of importesDe(arquivo)) {
          const raiz = raizDoPacote(alvo);
          const casado = SDKS_FORNECEDOR.find((sdk) => raiz === sdk || alvo.startsWith(sdk));
          if (casado !== undefined) {
            achados.push(`${arquivo.rel}: SDK de fornecedor "${alvo}" dentro do modulo — use uma porta`);
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'gateway-http',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const proibidos = /\b(select\s+.*\bfrom\b|insert\s+into|update\s+\w+\s+set|delete\s+from|createClient|new\s+Pool|\.query\()/i;
      return ctx.codigo
        .filter((a) => a.rel.startsWith('core/gateways/') && proibidos.test(a.conteudo))
        .map((a) => `${a.rel}: gateway fala com banco — gateway e HTTP sobre o contrato do outro modulo`);
    },
  },
  {
    id: 'gateway-declarado',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      // Barril da pasta (index.*/__init__.py) documenta o slot; nao e um gateway.
      const BARRIS = ['index', '__init__'];
      const consumidos = (ctx.manifesto?.consome ?? []).map((c) => c.modulo);
      const arquivos = ctx.codigo
        .filter((a) => a.rel.startsWith('core/gateways/'))
        .map((a) => a.rel.split('/').pop().replace(/\.[^.]+$/, ''))
        .filter((nome) => !BARRIS.includes(nome));

      const achados = arquivos
        .filter((nome) => !consumidos.includes(nome))
        .map((nome) => `core/gateways/${nome}: sem entrada em modulo.json:consome`);

      return achados.concat(
        consumidos
          .filter((modulo) => !arquivos.includes(modulo))
          .map((modulo) => `consome declara "${modulo}" mas nao existe core/gateways/${modulo}`),
      );
    },
  },
  {
    id: 'consome-ciclo',
    nivel: 'erro',
    escopo: 'global',
    verificar(contextos) {
      const grafo = new Map(
        contextos.map((c) => [c.idPasta, (c.manifesto?.consome ?? []).map((x) => x.modulo)]),
      );
      const achados = [];
      for (const inicio of grafo.keys()) {
        const caminho = buscarCiclo(grafo, inicio);
        if (caminho !== null) achados.push({ modulo: inicio, mensagem: `ciclo em consome: ${caminho.join(' -> ')}` });
      }
      return achados;
    },
  },
];

/** Busca em profundidade a partir de `inicio`, devolvendo o caminho do ciclo que volta a ele. */
function buscarCiclo(grafo, inicio) {
  const pilha = [[inicio, [inicio]]];
  const vistos = new Set();
  while (pilha.length > 0) {
    const [atual, caminho] = pilha.pop();
    for (const vizinho of grafo.get(atual) ?? []) {
      if (vizinho === inicio) return [...caminho, inicio];
      if (vistos.has(vizinho)) continue;
      vistos.add(vizinho);
      pilha.push([vizinho, [...caminho, vizinho]]);
    }
  }
  return null;
}
