/**
 * regras/dados.mjs — família "Dados" do catálogo (specs/arquitetura/04-regras.md §4.3).
 * ids: schema-nao-public, tabela-prefixo, tabela-alheia, migrations, rls
 */
const PADRAO_MIGRATION = /^\d{4}-[a-z][a-z0-9]*(-[a-z0-9]+)+\.sql$/;

export default [
  {
    id: 'schema-nao-public',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const schema = ctx.manifesto?.dados?.schema;
      if (schema === undefined || schema === '') return ['dados.schema nao declarado'];
      if (schema.toLowerCase() === 'public') return ['dados.schema e "public" — proibido (specs/arquitetura/02 §6.1)'];
      return [];
    },
  },
  {
    id: 'tabela-prefixo',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const dados = ctx.manifesto?.dados;
      if (dados === undefined) return [];
      const esperado = `${ctx.manifesto.id}_`;
      const achados = [];
      if (dados.prefixo !== esperado) {
        achados.push(`dados.prefixo "${dados.prefixo}" deveria ser "${esperado}"`);
      }
      for (const tabela of dados.tabelas ?? []) {
        if (!tabela.startsWith(esperado)) achados.push(`tabela "${tabela}" sem o prefixo "${esperado}"`);
      }
      return achados;
    },
  },
  {
    id: 'tabela-alheia',
    nivel: 'erro',
    escopo: 'global',
    verificar(contextos) {
      const achados = [];
      for (const ctx of contextos) {
        const alheios = contextos.filter((outro) => outro.idPasta !== ctx.idPasta);
        for (const arquivo of [...ctx.codigo, ...ctx.sql]) {
          if (arquivo.eTeste) continue;
          for (const outro of alheios) {
            const padrao = new RegExp(`\\b${outro.idPasta}_[a-z][a-z0-9_]*`, 'g');
            for (const achado of new Set(arquivo.conteudo.match(padrao) ?? [])) {
              achados.push({
                modulo: ctx.idPasta,
                mensagem: `${arquivo.rel}: referencia a tabela de outro modulo ("${achado}") — o dado alheio vem pela api/ dele`,
              });
            }
          }
        }
      }
      return achados;
    },
  },
  {
    id: 'migrations',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const migrations = ctx.sql.filter((a) => a.rel.startsWith('database/migrations/'));
      const achados = [];
      for (const migration of migrations) {
        const nome = migration.rel.split('/').pop();
        if (!PADRAO_MIGRATION.test(nome)) {
          achados.push(`database/migrations/${nome}: fora do padrao NNNN-verbo-objeto.sql`);
        }
        if (!/--\s*rollback/i.test(migration.conteudo)) {
          achados.push(`database/migrations/${nome}: sem bloco "-- rollback"`);
        }
      }
      const tabelas = ctx.manifesto?.dados?.tabelas ?? [];
      if (tabelas.length > 0 && migrations.length === 0) {
        achados.push('modulo declara tabelas mas nao tem database/migrations/');
      }
      return achados;
    },
  },
  {
    id: 'rls',
    nivel: 'aviso',
    escopo: 'modulo',
    verificar(ctx) {
      const sql = ctx.sql.map((a) => a.conteudo).join('\n').toLowerCase();
      return (ctx.manifesto?.dados?.tabelas ?? [])
        .filter((tabela) => {
          const padrao = new RegExp(`alter\\s+table[^;]*${tabela}[^;]*enable\\s+row\\s+level\\s+security`, 's');
          return !padrao.test(sql);
        })
        .map((tabela) => `tabela "${tabela}" sem ENABLE ROW LEVEL SECURITY no SQL do modulo`);
    },
  },
];
