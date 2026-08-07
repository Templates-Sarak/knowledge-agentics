/**
 * regras/dados.mjs — família "Dados" do catálogo (specs/arquitetura/04-regras.md §4.3).
 * ids: schema-nao-public, tabela-prefixo, tabela-alheia, migrations, tabela-declarada, rls
 *
 * `migrations` le `conteudo` CRU de proposito — o `-- rollback` que ela procura E um comentario
 * SQL. As demais, quando julgam codigo, leem `textoDeCodigo`.
 */
import { textoDeCodigo } from '../texto.mjs';

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
            for (const achado of new Set(textoDeCodigo(arquivo).match(padrao) ?? [])) {
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
    /**
     * `dados.tabelas` é declaração, e até aqui nada a confrontava com o disco — o
     * `artefato-declarado` chega a justificar deixar `database/` de fora dizendo que *"quem declara
     * banco é `dados.tabelas`"*, o que só é verdade se alguém cobrar isso. Agora cobra.
     *
     * A metade "declara tabelas e não tem `database/migrations/`" já era do `migrations`, e continua
     * dele: quando NÃO HÁ SQL nenhum, esta regra cala. Sem isso, um módulo com tabelas e sem banco
     * receberia uma mensagem do `migrations` mais uma por tabela daqui — N+1 mensagens para um
     * conserto só.
     */
    id: 'tabela-declarada',
    nivel: 'erro',
    escopo: 'modulo',
    verificar(ctx) {
      const tabelas = ctx.manifesto?.dados?.tabelas ?? [];
      // Ausencia TOTAL de SQL e do `migrations` — um defeito, uma mensagem.
      if (tabelas.length === 0 || ctx.sql.length === 0) return [];
      const sql = juntarSql(ctx);
      return tabelas
        .filter((tabela) => !criaTabela(sql, tabela))
        .map((tabela) => `tabela "${tabela}" declarada em dados.tabelas e sem CREATE TABLE no SQL do`
          + ' modulo — declaracao sem consequencia: o schema real nao tem a tabela que o manifesto'
          + ' promete. Crie a migration, ou remova a tabela da declaracao');
    },
  },
  {
    id: 'rls',
    nivel: 'aviso',
    escopo: 'modulo',
    verificar(ctx) {
      const sql = juntarSql(ctx);
      return (ctx.manifesto?.dados?.tabelas ?? [])
        // Tabela que NAO EXISTE no SQL e do `tabela-declarada`, e a fronteira e explicita: sem
        // isto, a tabela ausente caia aqui com a mensagem errada — "sem RLS", quando o problema e
        // que ela nao existe. Um defeito, uma mensagem, e a mensagem certa.
        .filter((tabela) => criaTabela(sql, tabela))
        .filter((tabela) => {
          const padrao = new RegExp(`alter\\s+table[^;]*${tabela}[^;]*enable\\s+row\\s+level\\s+security`, 's');
          return !padrao.test(sql);
        })
        .map((tabela) => `tabela "${tabela}" sem ENABLE ROW LEVEL SECURITY no SQL do modulo`);
    },
  },
];

/** Todo o SQL do módulo, em minúsculas. Uma leitura, usada pelas duas regras que olham tabela. */
function juntarSql(ctx) {
  return ctx.sql.map((a) => a.conteudo).join('\n').toLowerCase();
}

/**
 * O SQL do módulo CRIA esta tabela? `[^;(]*` prende a busca dentro do próprio `create table`: não
 * atravessa o `;` do statement anterior nem entra na lista de colunas, então `create table x (…
 * y_id …)` não conta como criação de `y`.
 */
function criaTabela(sql, tabela) {
  return new RegExp(`create\\s+table[^;(]*${tabela}`, 's').test(sql);
}
