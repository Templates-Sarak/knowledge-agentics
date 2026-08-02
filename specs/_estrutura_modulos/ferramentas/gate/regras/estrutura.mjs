/**
 * regras/estrutura.mjs — família "Estrutura" do catálogo (specs/arquitetura/04-regras.md §4.1).
 * ids: manifesto, schema-manifesto, estrutura, estrutura-estrita, web-declarado, testes
 */
import { carregarEsquema, validar } from '../esquema.mjs';

const CAMPOS_OBRIGATORIOS = [
  'id', 'nome', 'versao', 'descricao', 'papel', 'binding', 'rotaBase', 'rotaWeb',
  'dados', 'envRequerido', 'portas', 'consome', 'ui', 'permissoes',
  'rotasPublicas', 'camposSensiveis', 'navegacao', 'exportaResumo', 'geraArtefato',
];

const PAPEIS = ['dominio', 'gateway', 'conector'];
const BINDINGS = ['typescript', 'javascript', 'python'];

const ENTRADAS_PERMITIDAS = new Set([
  'modulo.json', 'package.json', 'pyproject.toml', 'requirements.txt', 'README.md',
  '.env', '.env.example', '.gitignore', 'package-lock.json', 'node_modules',
  'tsconfig.json', 'jsconfig.json', 'vitest.config.ts', 'vitest.config.js',
  'eslint.config.mjs', 'eslint.config.js',
  'contrato', 'config', 'core', 'api', 'web', 'database', 'tests', 'gerados',
]);

const CONFIGS = ['api', 'dominio', 'seguranca', 'portas', 'textos'];

/** Existe ao menos um arquivo sob o prefixo informado? */
export function temArquivoEm(ctx, prefixo) {
  return ctx.arquivos.some((a) => a.rel.startsWith(prefixo));
}

function conferirIdentidade(manifesto, ctx) {
  const achados = [];
  if (manifesto.id !== ctx.idPasta) {
    achados.push(`id "${manifesto.id}" difere do nome da pasta "${ctx.idPasta}"`);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(manifesto.id ?? '')) {
    achados.push(`id "${manifesto.id}" nao e kebab-case minusculo`);
  }
  const rotaEsperada = `/api/v1/${manifesto.id}`;
  if (manifesto.rotaBase !== rotaEsperada) {
    achados.push(`rotaBase "${manifesto.rotaBase}" deveria ser "${rotaEsperada}"`);
  }
  return achados;
}

function conferirVocabulario(manifesto) {
  const achados = [];
  if (!PAPEIS.includes(manifesto.papel)) {
    achados.push(`papel "${manifesto.papel}" fora do vocabulario (${PAPEIS.join(', ')})`);
  }
  if (!BINDINGS.includes(manifesto.binding)) {
    achados.push(`binding "${manifesto.binding}" fora do vocabulario (${BINDINGS.join(', ')})`);
  }
  return achados;
}

export default [
  {
    id: 'manifesto',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      if (ctx.manifestoErro !== null) return [ctx.manifestoErro];
      const manifesto = ctx.manifesto;
      const faltando = CAMPOS_OBRIGATORIOS.filter((campo) => manifesto[campo] === undefined);
      if (faltando.length > 0) return [`campos ausentes no manifesto: ${faltando.join(', ')}`];
      return [...conferirIdentidade(manifesto, ctx), ...conferirVocabulario(manifesto)];
    },
  },
  {
    id: 'schema-manifesto',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      // Sem manifesto legivel, a regra `manifesto` ja reprovou — nao empilhamos ruido em cima.
      if (ctx.manifesto === null) return [];
      return validar(ctx.manifesto, carregarEsquema('modulo'), 'modulo.json');
    },
  },
  {
    id: 'estrutura',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      if (!temArquivoEm(ctx, 'contrato/openapi.yaml')) achados.push('contrato/openapi.yaml ausente');
      if (!temArquivoEm(ctx, 'api/')) achados.push('api/ ausente');
      if (!temArquivoEm(ctx, 'tests/')) achados.push('tests/ ausente');
      for (const assunto of CONFIGS) {
        if (!ctx.configs[assunto].presente) achados.push(`config/${assunto}.json ausente`);
      }
      return achados;
    },
  },
  {
    id: 'estrutura-estrita',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      return ctx.entradasRaiz
        .filter((nome) => !ENTRADAS_PERMITIDAS.has(nome))
        .map((nome) => `entrada nao prevista na raiz do modulo: "${nome}" — a arvore e fechada`);
    },
  },
  {
    id: 'web-declarado',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      if (ctx.manifesto?.rotaWeb == null) return [];
      const paginas = ctx.arquivos.filter((a) => a.rel.startsWith('web/src/pages/') && !a.eTeste);
      if (paginas.length === 0) return ['rotaWeb declarada mas web/src/pages nao tem pagina real'];
      return [];
    },
  },
  {
    id: 'testes',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const achados = [];
      if (!temArquivoEm(ctx, 'tests/dominio/')) achados.push('tests/dominio/ vazio ou ausente');
      if (!temArquivoEm(ctx, 'tests/contrato/')) achados.push('tests/contrato/ vazio ou ausente');
      return achados;
    },
  },
];
