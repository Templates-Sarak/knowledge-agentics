/**
 * rules/data.mjs — família "Dados" do catálogo (specs/arquitetura/04-regras.md §4.3).
 * ids: non-public-schema, table-prefix, foreign-table, migrations, table-declared, rls,
 *      table-undeclared, schema-mirrors-migrations
 *
 * `migrations` le `conteudo` CRU de proposito — o `-- rollback` que ela procura E um comentario
 * SQL. As demais, quando julgam codigo, leem `codeText`. `table-undeclared` e
 * `schema-mirrors-migrations` tambem leem `conteudo` CRU, pelo mesmo motivo de `joinSql`: SQL
 * nao passa por `codeText`, e o comentario `-- rollback` (com os `drop table` comentados) e
 * dado, nao ruido — por isso as duas usam `withoutSqlComment` para distinguir DROP real de DROP
 * comentado, em vez de tratar o texto cru como se fosse so codigo.
 */
import { codeText } from '../text.mjs';

const MIGRATION_PATTERN = /^\d{4}-[a-z][a-z0-9]*(-[a-z0-9]+)+\.sql$/;

/** O laco de `achado` isolado do de `foreign-table.verificar` — so por isso o aninhamento cabe no
 * limiar que esta propria regra e as irmas do §4.7 cobram do codigo do usuario. Mensagem intacta:
 * o autoteste compara CONJUNTO DE IDS, e o texto e o conserto que o autor le. */
function foreignReferenceFindings(ctx, file, other) {
  // snake_case pelo mesmo motivo de `table-prefix`: a tabela do vizinho `nota-fiscal`
  // chama-se `nota_fiscal_*`. Procurar pelo id cru deixaria a regra CALADA exatamente sobre
  // os modulos com hifen — falso negativo silencioso, nao ausencia de risco.
  const findings = [];
  const pattern = new RegExp(`\\b${other.dirId.replace(/-/g, '_')}_[a-z][a-z0-9_]*`, 'g');
  for (const finding of new Set(codeText(file).match(pattern) ?? [])) {
    findings.push({
      modulo: ctx.dirId,
      mensagem: `${file.rel}: references a table owned by another module ("${finding}") — access its data through that module's API`,
    });
  }
  return findings;
}

export default [
  {
    id: 'non-public-schema',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const schema = ctx.manifest?.data?.schema;
      if (schema === undefined || schema === '') return ['data.schema is not declared'];
      if (schema.toLowerCase() === 'public') return ['data.schema is "public" — this is not allowed (specs/arquitetura/02 §6.1)'];
      return [];
    },
  },
  {
    id: 'table-prefix',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const data = ctx.manifest?.data;
      if (data === undefined) return [];
      // snake_case, NAO o id cru: identificador SQL nao aceita hifen sem aspas, e
      // `manifest-schema` cobra `^[a-z][a-z0-9_]*$` em `data.tables[]`. Exigir aqui o id cru
      // tornava `nota-fiscal` IMPOSSIVEL — esta regra pedia `nota-fiscal_` e o schema proibia
      // o hifen na tabela que comeca por ele: duas regras do mesmo gate pedindo coisas
      // incompativeis. E a mesma conversao que `<module_snake>` faz no molde.
      const expected = `${ctx.manifest.id.replace(/-/g, '_')}_`;
      const findings = [];
      if (data.prefix !== expected) {
        findings.push(`data.prefix "${data.prefix}" should be "${expected}"`);
      }
      for (const table of data.tables ?? []) {
        if (!table.startsWith(expected)) findings.push(`table "${table}" is missing the prefix "${expected}"`);
      }
      return findings;
    },
  },
  {
    id: 'foreign-table',
    nivel: 'erro',
    escopo: 'global',
    check(contexts) {
      const findings = [];
      for (const ctx of contexts) {
        const foreign = contexts.filter((other) => other.dirId !== ctx.dirId);
        for (const file of [...ctx.code, ...ctx.sql]) {
          if (file.isTest) continue;
          for (const other of foreign) findings.push(...foreignReferenceFindings(ctx, file, other));
        }
      }
      return findings;
    },
  },
  {
    id: 'migrations',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const migrations = ctx.sql.filter((a) => a.rel.startsWith('database/migrations/'));
      const findings = [];
      for (const migration of migrations) {
        const name = migration.rel.split('/').pop();
        if (!MIGRATION_PATTERN.test(name)) {
          findings.push(`database/migrations/${name}: does not follow the NNNN-verb-object.sql naming pattern`);
        }
        if (!/--\s*rollback/i.test(migration.content)) {
          findings.push(`database/migrations/${name}: is missing a "-- rollback" block`);
        }
      }
      const tables = ctx.manifest?.data?.tables ?? [];
      if (tables.length > 0 && migrations.length === 0) {
        findings.push('module declares tables but has no database/migrations/');
      }
      return findings;
    },
  },
  {
    /**
     * `data.tables` é declaração — sem esta regra, nada a confronta com o disco. O
     * `artifact-declared` chega a justificar deixar `database/` de fora dizendo que *"quem declara
     * banco é `data.tables`"*, o que só é verdade se alguém cobrar isso. Esta regra cobra.
     *
     * A metade "declara tabelas e não tem `database/migrations/`" é do `migrations`, não desta
     * regra: quando NÃO HÁ SQL nenhum, esta regra cala. Sem isso, um módulo com tabelas e sem banco
     * receberia uma mensagem do `migrations` mais uma por tabela daqui — N+1 mensagens para um
     * conserto só.
     */
    id: 'table-declared',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const tables = ctx.manifest?.data?.tables ?? [];
      // Ausencia TOTAL de SQL e do `migrations` — um defeito, uma mensagem.
      if (tables.length === 0 || ctx.sql.length === 0) return [];
      const sql = joinSql(ctx);
      return tables
        .filter((table) => !createsTable(sql, table))
        .map((table) => `table "${table}" is declared in data.tables but has no CREATE TABLE statement in the module`);
    },
  },
  {
    id: 'rls',
    nivel: 'aviso',
    escopo: 'module',
    check(ctx) {
      const sql = joinSql(ctx);
      return (ctx.manifest?.data?.tables ?? [])
        // Tabela que NAO EXISTE no SQL e do `table-declared`, e a fronteira e explicita: sem
        // isto, a tabela ausente cai aqui com a mensagem errada — "sem RLS", quando o problema e
        // que ela nao existe. Um defeito, uma mensagem, e a mensagem certa.
        .filter((table) => createsTable(sql, table))
        .filter((table) => {
          const pattern = new RegExp(`alter\\s+table[^;]*${table}[^;]*enable\\s+row\\s+level\\s+security`, 's');
          return !pattern.test(sql);
        })
        .map((table) => `table "${table}" has no ENABLE ROW LEVEL SECURITY statement in the module SQL`);
    },
  },
  {
    /**
     * O espelho exato de `table-declared`: aquela cobra "declarada e sem CREATE TABLE"; esta
     * cobra "CREATE TABLE e sem declaracao". Nenhuma tabela cai nas duas — uma tabela criada E
     * declarada nao interessa a nenhuma; uma so declarada e so a `table-declared` a ve (esta so
     * enumera o que o SQL CRIA); uma so criada e so esta a ve. `rls` tambem fica de fora por
     * construcao: ela so itera `data.tables`, entao uma tabela criada e nao declarada nunca entra
     * no laco dela.
     */
    id: 'table-undeclared',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const declared = new Set(ctx.manifest?.data?.tables ?? []);
      const created = createdTables(joinSql(ctx));
      return [...created]
        .filter((table) => !declared.has(table))
        .map((table) => `table "${table}" is created in module SQL but is missing from data.tables`);
    },
  },
  {
    /**
     * Compara CONJUNTO DE NOMES — nunca coluna, tipo, default, constraint, indice ou RLS: isso
     * exigiria um parser de `CREATE TABLE` (specs/arquitetura/04-regras.md §7.2, "database/schema.sql
     * continua nao verificado..."). O que sobra descoberto continua la, so que estreito: a forma
     * de cada tabela, nunca a existencia dela.
     *
     * `descontando os DROP TABLE reais` (specs/arquitetura/02-contrato-e-dados.md §6.3) e o motivo de
     * `liveTablesAfterMigrations` simular a SEQUENCIA — nunca `criadas - dropadas` como dois
     * conjuntos isolados: uma migration que cria X, outra que a derruba e uma terceira que a
     * recria produz um "criadas" e um "dropadas" com X nos dois, e a subtracao (sem ordem) some
     * com X mesmo que ele exista no schema final. Aplicar create/drop NA ORDEM das migrations —
     * pelo nome do arquivo, `NNNN-...` — e o que faz o estado bater com o que o "up" produz de
     * verdade. `withoutSqlComment` entra pelo mesmo motivo de sempre: o bloco `-- rollback` do
     * molde comenta um `drop table` por tabela, e um extrator sobre o texto CRU contaria esses
     * tres DROPs como reais, esvaziando o conjunto de "vivas" mesmo no molde conforme.
     */
    id: 'schema-mirrors-migrations',
    nivel: 'erro',
    escopo: 'module',
    check(ctx) {
      const migrations = ctx.sql.filter((a) => a.rel.startsWith('database/migrations/'));
      const schemaSql = ctx.sql.find((a) => a.rel === 'database/schema.sql');
      if (migrations.length === 0 || schemaSql === undefined) return [];

      const createdInMigrations = liveTablesAfterMigrations(migrations);
      const createdInSchema = createdTables(schemaSql.content.toLowerCase());

      const onlyInMigrations = [...createdInMigrations].filter((t) => !createdInSchema.has(t));
      const onlyInSchema = [...createdInSchema].filter((t) => !createdInMigrations.has(t));

      return [
        ...onlyInMigrations.map((table) => `table "${table}": migrations create it, but database/schema.sql does not reflect the result of "up". Update database/schema.sql`),
        ...onlyInSchema.map((table) => `table "${table}": database/schema.sql declares it, but no migration creates it. Update database/schema.sql or the migration that should create it`),
      ];
    },
  },
];

/** Todo o SQL do módulo, em minúsculas. Uma leitura, usada pelas duas regras que olham tabela. */
function joinSql(ctx) {
  return ctx.sql.map((a) => a.content).join('\n').toLowerCase();
}

/**
 * O SQL do módulo CRIA esta tabela? `[^;(]*` prende a busca dentro do próprio `create table`: não
 * atravessa o `;` do statement anterior nem entra na lista de colunas, então `create table x (…
 * y_id …)` não conta como criação de `y`.
 */
function createsTable(sql, table) {
  return new RegExp(`create\\s+table[^;(]*${table}`, 's').test(sql);
}

/**
 * Remove comentário SQL de linha (`--` até o fim da linha) E de bloco (`/* *\/`) — o dialeto é
 * Postgres, que suporta os dois; quem não usa comentário de bloco é só o MOLDE. É o que separa
 * DROP real de DROP comentado no bloco `-- rollback`: sem a metade de linha,
 * `tablesByVerb(sql, 'drop')` sobre o texto CRU acharia os três `-- drop table if exists ...`
 * do rollback do molde como DROPs de verdade; sem a metade de bloco, um `CREATE TABLE` citado
 * dentro de `/* ... *\/` entraria no conjunto como se fosse real.
 *
 * Varre caractere a caractere (não linha a linha, como a versão anterior) porque um comentário de
 * bloco atravessa `\n` — cortar por linha não alcançaria o meio dele. **Limite conhecido, não
 * corrigido**: comentário de bloco ANINHADO (Postgres aceita `/* /* *\/ *\/`) fecha no primeiro
 * `*\/`, não no último — forma que este projeto não usa. Também não entende `--` DENTRO de um
 * literal de string (`'a--b'`): a linha inteira depois do `--` desaparece, inclusive um
 * `CREATE TABLE` real que viesse depois na MESMA linha — falso negativo assumido, registrado em
 * `04-regras.md` §7.2.
 */
function withoutSqlComment(sql) {
  let output = '';
  let position = 0;
  while (position < sql.length) {
    if (sql.startsWith('--', position)) {
      const lineEnd = sql.indexOf('\n', position);
      if (lineEnd === -1) break;
      position = lineEnd;
      continue;
    }
    if (sql.startsWith('/*', position)) {
      const blockEnd = sql.indexOf('*/', position + 2);
      if (blockEnd === -1) break;
      position = blockEnd + 2;
      continue;
    }
    output += sql[position];
    position += 1;
  }
  return output;
}

/** `[GLOBAL|LOCAL] {TEMPORARY|TEMP}` e `UNLOGGED` entram ENTRE `create` e `table`, nunca depois —
 * é a forma real da cláusula Postgres, não um detalhe de regex. Sem isto, `create temp table x`
 * e `create unlogged table x` escapavam inteiros do extrator (medido). */
const CREATE_MODIFIER = '(?:temp(?:orary)?\\s+|unlogged\\s+)?';

/** `[if [not] exists] [schema.]tabela`, com ou sem aspas — a forma que sobra depois do
 * verbo+modificador, comum a `create table` e `drop table`. */
const SQL_TABLE_NAME = '(?:if\\s+(?:not\\s+)?exists\\s+)?(?:(?:"[^"]+"|[a-z_][a-z0-9_]*)\\.)?"?([a-z_][a-z0-9_]*)"?';

/**
 * Nomes de tabela que aparecem depois de `create table` ou `drop table`. O identificador pode vir
 * cru (`create table x`) ou entre aspas duplas, com ou sem schema qualificando-o
 * (`"escopo"."molde_metadados"`) — a forma que `<escopo>`/`<module_snake>` produzem depois de
 * substituídos. `sql` já chega em minúsculas (`joinSql`) e sem comentário (`withoutSqlComment`).
 */
function tablesByVerb(sql, verb) {
  const pattern = new RegExp(`${verb}\\s+${CREATE_MODIFIER}table\\s+${SQL_TABLE_NAME}`, 'gs');
  return new Set([...sql.matchAll(pattern)].map((m) => m[1]));
}

/** Todo nome de tabela que o SQL (já sem comentário) cria — usada por `table-undeclared` e
 * pela metade "schema.sql" de `schema-mirrors-migrations`. */
function createdTables(sql) {
  return tablesByVerb(withoutSqlComment(sql), 'create');
}

/** `create`/`drop table` de um SQL, na ORDEM em que aparecem no texto — o dado que
 * `liveTablesAfterMigrations` precisa para simular a sequência, que um par de `Set`s (criadas,
 * dropadas) não guarda. */
function tableEvents(sql) {
  const pattern = new RegExp(`(create|drop)\\s+${CREATE_MODIFIER}table\\s+${SQL_TABLE_NAME}`, 'gs');
  return [...sql.matchAll(pattern)].map((m) => ({ verb: m[1], table: m[2] }));
}

/**
 * As tabelas que SOBREVIVEM depois de aplicar toda migration NA ORDEM (pelo nome do arquivo,
 * `NNNN-...` — a mesma ordem que `up` aplica) — nunca `criadas - dropadas` como dois conjuntos
 * isolados: uma migration que cria X, outra que a derruba e uma terceira que a recria produz um
 * "criadas" e um "dropadas" com X nos dois, e a subtração sem ordem some com X mesmo que ele
 * exista no schema final (falso positivo medido, corrigido por esta função). DROP comentado no
 * bloco `-- rollback` não conta — `withoutSqlComment` já removeu o comentário antes de
 * `tableEvents` procurar.
 */
function liveTablesAfterMigrations(migrations) {
  const sorted = [...migrations].sort((a, b) => a.rel.localeCompare(b.rel));
  const live = new Set();
  for (const migration of sorted) {
    const withoutComment = withoutSqlComment(migration.content.toLowerCase());
    for (const { verb, table } of tableEvents(withoutComment)) {
      if (verb === 'create') live.add(table);
      else live.delete(table);
    }
  }
  return live;
}
