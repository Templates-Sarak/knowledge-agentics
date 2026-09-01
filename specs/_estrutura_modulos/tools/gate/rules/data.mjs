/**
 * rules/data.mjs — família "Dados" do catálogo (specs/arquitetura/04-regras.md §4.3).
 * ids: schema-nao-public, tabela-prefixo, tabela-alheia, migrations, tabela-declarada, rls,
 *      tabela-nao-declarada, schema-espelha-migrations
 *
 * `migrations` le `conteudo` CRU de proposito — o `-- rollback` que ela procura E um comentario
 * SQL. As demais, quando julgam codigo, leem `textoDeCodigo`. `tabela-nao-declarada` e
 * `schema-espelha-migrations` tambem leem `conteudo` CRU, pelo mesmo motivo de `juntarSql`: SQL
 * nao passa por `textoDeCodigo`, e o comentario `-- rollback` (com os `drop table` comentados) e
 * dado, nao ruido — por isso as duas usam `semComentarioSql` para distinguir DROP real de DROP
 * comentado, em vez de tratar o texto cru como se fosse so codigo.
 */
import { textoDeCodigo } from '../text.mjs';

const PADRAO_MIGRATION = /^\d{4}-[a-z][a-z0-9]*(-[a-z0-9]+)+\.sql$/;

/** O laco de `achado` isolado do de `tabela-alheia.verificar` — so por isso o aninhamento cabe no
 * limiar que esta propria regra e as irmas do §4.7 cobram do codigo do usuario. Mensagem intacta:
 * o autoteste compara CONJUNTO DE IDS, e o texto e o conserto que o autor le. */
function achadosDeReferenciaAlheia(ctx, arquivo, outro) {
  // snake_case pelo mesmo motivo de `tabela-prefixo`: a tabela do vizinho `nota-fiscal`
  // chama-se `nota_fiscal_*`. Procurar pelo id cru deixaria a regra CALADA exatamente sobre
  // os modulos com hifen — falso negativo silencioso, nao ausencia de risco.
  const achados = [];
  const padrao = new RegExp(`\\b${outro.idPasta.replace(/-/g, '_')}_[a-z][a-z0-9_]*`, 'g');
  for (const achado of new Set(textoDeCodigo(arquivo).match(padrao) ?? [])) {
    achados.push({
      modulo: ctx.idPasta,
      mensagem: `${arquivo.rel}: referencia a tabela de outro modulo ("${achado}") — o dado alheio vem pela api/ dele`,
    });
  }
  return achados;
}

export default [
  {
    id: 'schema-nao-public',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      const schema = ctx.manifesto?.data?.schema;
      if (schema === undefined || schema === '') return ['data.schema nao declarado'];
      if (schema.toLowerCase() === 'public') return ['data.schema e "public" — proibido (specs/arquitetura/02 §6.1)'];
      return [];
    },
  },
  {
    id: 'tabela-prefixo',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      const data = ctx.manifesto?.data;
      if (data === undefined) return [];
      // snake_case, NAO o id cru: identificador SQL nao aceita hifen sem aspas, e
      // `schema-manifesto` cobra `^[a-z][a-z0-9_]*$` em `data.tables[]`. Exigir aqui o id cru
      // tornava `nota-fiscal` IMPOSSIVEL — esta regra pedia `nota-fiscal_` e o schema proibia
      // o hifen na tabela que comeca por ele: duas regras do mesmo gate pedindo coisas
      // incompativeis. E a mesma conversao que `<module_snake>` faz no molde.
      const esperado = `${ctx.manifesto.id.replace(/-/g, '_')}_`;
      const achados = [];
      if (data.prefix !== esperado) {
        achados.push(`data.prefix "${data.prefix}" deveria ser "${esperado}"`);
      }
      for (const tabela of data.tables ?? []) {
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
          for (const outro of alheios) achados.push(...achadosDeReferenciaAlheia(ctx, arquivo, outro));
        }
      }
      return achados;
    },
  },
  {
    id: 'migrations',
    nivel: 'erro',
    escopo: 'module',
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
      const tabelas = ctx.manifesto?.data?.tables ?? [];
      if (tabelas.length > 0 && migrations.length === 0) {
        achados.push('modulo declara tabelas mas nao tem database/migrations/');
      }
      return achados;
    },
  },
  {
    /**
     * `data.tables` é declaração — sem esta regra, nada a confronta com o disco. O
     * `artefato-declarado` chega a justificar deixar `database/` de fora dizendo que *"quem declara
     * banco é `data.tables`"*, o que só é verdade se alguém cobrar isso. Esta regra cobra.
     *
     * A metade "declara tabelas e não tem `database/migrations/`" é do `migrations`, não desta
     * regra: quando NÃO HÁ SQL nenhum, esta regra cala. Sem isso, um módulo com tabelas e sem banco
     * receberia uma mensagem do `migrations` mais uma por tabela daqui — N+1 mensagens para um
     * conserto só.
     */
    id: 'tabela-declarada',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      const tabelas = ctx.manifesto?.data?.tables ?? [];
      // Ausencia TOTAL de SQL e do `migrations` — um defeito, uma mensagem.
      if (tabelas.length === 0 || ctx.sql.length === 0) return [];
      const sql = juntarSql(ctx);
      return tabelas
        .filter((tabela) => !criaTabela(sql, tabela))
        .map((tabela) => `tabela "${tabela}" declarada em data.tables e sem CREATE TABLE no SQL do`
          + ' modulo — declaracao sem consequencia: o schema real nao tem a tabela que o manifesto'
          + ' promete. Crie a migration, ou remova a tabela da declaracao');
    },
  },
  {
    id: 'rls',
    nivel: 'aviso',
    escopo: 'module',
    verificar(ctx) {
      const sql = juntarSql(ctx);
      return (ctx.manifesto?.data?.tables ?? [])
        // Tabela que NAO EXISTE no SQL e do `tabela-declarada`, e a fronteira e explicita: sem
        // isto, a tabela ausente cai aqui com a mensagem errada — "sem RLS", quando o problema e
        // que ela nao existe. Um defeito, uma mensagem, e a mensagem certa.
        .filter((tabela) => criaTabela(sql, tabela))
        .filter((tabela) => {
          const padrao = new RegExp(`alter\\s+table[^;]*${tabela}[^;]*enable\\s+row\\s+level\\s+security`, 's');
          return !padrao.test(sql);
        })
        .map((tabela) => `tabela "${tabela}" sem ENABLE ROW LEVEL SECURITY no SQL do modulo`);
    },
  },
  {
    /**
     * O espelho exato de `tabela-declarada`: aquela cobra "declarada e sem CREATE TABLE"; esta
     * cobra "CREATE TABLE e sem declaracao". Nenhuma tabela cai nas duas — uma tabela criada E
     * declarada nao interessa a nenhuma; uma so declarada e so a `tabela-declarada` a ve (esta so
     * enumera o que o SQL CRIA); uma so criada e so esta a ve. `rls` tambem fica de fora por
     * construcao: ela so itera `data.tables`, entao uma tabela criada e nao declarada nunca entra
     * no laco dela.
     */
    id: 'tabela-nao-declarada',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      const declaradas = new Set(ctx.manifesto?.data?.tables ?? []);
      const criadas = tabelasCriadas(juntarSql(ctx));
      return [...criadas]
        .filter((tabela) => !declaradas.has(tabela))
        .map((tabela) => `tabela "${tabela}" criada no SQL do modulo e ausente de data.tables — o`
          + ' schema real tem uma tabela que o manifesto nao reconhece. Declare a tabela em'
          + ' data.tables, ou remova-a do SQL');
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
     * `tabelasVivasAposMigrations` simular a SEQUENCIA — nunca `criadas - dropadas` como dois
     * conjuntos isolados: uma migration que cria X, outra que a derruba e uma terceira que a
     * recria produz um "criadas" e um "dropadas" com X nos dois, e a subtracao (sem ordem) some
     * com X mesmo que ele exista no schema final. Aplicar create/drop NA ORDEM das migrations —
     * pelo nome do arquivo, `NNNN-...` — e o que faz o estado bater com o que o "up" produz de
     * verdade. `semComentarioSql` entra pelo mesmo motivo de sempre: o bloco `-- rollback` do
     * molde comenta um `drop table` por tabela, e um extrator sobre o texto CRU contaria esses
     * tres DROPs como reais, esvaziando o conjunto de "vivas" mesmo no molde conforme.
     */
    id: 'schema-espelha-migrations',
    nivel: 'erro',
    escopo: 'module',
    verificar(ctx) {
      const migrations = ctx.sql.filter((a) => a.rel.startsWith('database/migrations/'));
      const schemaSql = ctx.sql.find((a) => a.rel === 'database/schema.sql');
      if (migrations.length === 0 || schemaSql === undefined) return [];

      const criadasNasMigrations = tabelasVivasAposMigrations(migrations);
      const criadasNoSchema = tabelasCriadas(schemaSql.conteudo.toLowerCase());

      const soNasMigrations = [...criadasNasMigrations].filter((t) => !criadasNoSchema.has(t));
      const soNoSchema = [...criadasNoSchema].filter((t) => !criadasNasMigrations.has(t));

      return [
        ...soNasMigrations.map((tabela) => `tabela "${tabela}": as migrations criam e o`
          + ' database/schema.sql nao tem — o espelho ficou para tras do resultado real do "up".'
          + ' Atualize database/schema.sql'),
        ...soNoSchema.map((tabela) => `tabela "${tabela}": database/schema.sql tem e nenhuma`
          + ' migration cria — o espelho promete uma tabela que "up" nunca produz. Corrija'
          + ' database/schema.sql ou a migration que deveria cria-la'),
      ];
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

/**
 * Remove comentário SQL de linha (`--` até o fim da linha) E de bloco (`/* *\/`) — o dialeto é
 * Postgres, que suporta os dois; quem não usa comentário de bloco é só o MOLDE. É o que separa
 * DROP real de DROP comentado no bloco `-- rollback`: sem a metade de linha,
 * `tabelasPeloVerbo(sql, 'drop')` sobre o texto CRU acharia os três `-- drop table if exists ...`
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
function semComentarioSql(sql) {
  let saida = '';
  let posicao = 0;
  while (posicao < sql.length) {
    if (sql.startsWith('--', posicao)) {
      const fimLinha = sql.indexOf('\n', posicao);
      if (fimLinha === -1) break;
      posicao = fimLinha;
      continue;
    }
    if (sql.startsWith('/*', posicao)) {
      const fimBloco = sql.indexOf('*/', posicao + 2);
      if (fimBloco === -1) break;
      posicao = fimBloco + 2;
      continue;
    }
    saida += sql[posicao];
    posicao += 1;
  }
  return saida;
}

/** `[GLOBAL|LOCAL] {TEMPORARY|TEMP}` e `UNLOGGED` entram ENTRE `create` e `table`, nunca depois —
 * é a forma real da cláusula Postgres, não um detalhe de regex. Sem isto, `create temp table x`
 * e `create unlogged table x` escapavam inteiros do extrator (medido). */
const MODIFICADOR_CREATE = '(?:temp(?:orary)?\\s+|unlogged\\s+)?';

/** `[if [not] exists] [schema.]tabela`, com ou sem aspas — a forma que sobra depois do
 * verbo+modificador, comum a `create table` e `drop table`. */
const NOME_TABELA_SQL = '(?:if\\s+(?:not\\s+)?exists\\s+)?(?:(?:"[^"]+"|[a-z_][a-z0-9_]*)\\.)?"?([a-z_][a-z0-9_]*)"?';

/**
 * Nomes de tabela que aparecem depois de `create table` ou `drop table`. O identificador pode vir
 * cru (`create table x`) ou entre aspas duplas, com ou sem schema qualificando-o
 * (`"escopo"."molde_metadados"`) — a forma que `<escopo>`/`<module_snake>` produzem depois de
 * substituídos. `sql` já chega em minúsculas (`juntarSql`) e sem comentário (`semComentarioSql`).
 */
function tabelasPeloVerbo(sql, verbo) {
  const padrao = new RegExp(`${verbo}\\s+${MODIFICADOR_CREATE}table\\s+${NOME_TABELA_SQL}`, 'gs');
  return new Set([...sql.matchAll(padrao)].map((m) => m[1]));
}

/** Todo nome de tabela que o SQL (já sem comentário) cria — usada por `tabela-nao-declarada` e
 * pela metade "schema.sql" de `schema-espelha-migrations`. */
function tabelasCriadas(sql) {
  return tabelasPeloVerbo(semComentarioSql(sql), 'create');
}

/** `create`/`drop table` de um SQL, na ORDEM em que aparecem no texto — o dado que
 * `tabelasVivasAposMigrations` precisa para simular a sequência, que um par de `Set`s (criadas,
 * dropadas) não guarda. */
function eventosDeTabela(sql) {
  const padrao = new RegExp(`(create|drop)\\s+${MODIFICADOR_CREATE}table\\s+${NOME_TABELA_SQL}`, 'gs');
  return [...sql.matchAll(padrao)].map((m) => ({ verbo: m[1], tabela: m[2] }));
}

/**
 * As tabelas que SOBREVIVEM depois de aplicar toda migration NA ORDEM (pelo nome do arquivo,
 * `NNNN-...` — a mesma ordem que `up` aplica) — nunca `criadas - dropadas` como dois conjuntos
 * isolados: uma migration que cria X, outra que a derruba e uma terceira que a recria produz um
 * "criadas" e um "dropadas" com X nos dois, e a subtração sem ordem some com X mesmo que ele
 * exista no schema final (falso positivo medido, corrigido por esta função). DROP comentado no
 * bloco `-- rollback` não conta — `semComentarioSql` já removeu o comentário antes de
 * `eventosDeTabela` procurar.
 */
function tabelasVivasAposMigrations(migrations) {
  const ordenadas = [...migrations].sort((a, b) => a.rel.localeCompare(b.rel));
  const vivas = new Set();
  for (const migration of ordenadas) {
    const semComentario = semComentarioSql(migration.conteudo.toLowerCase());
    for (const { verbo, tabela } of eventosDeTabela(semComentario)) {
      if (verbo === 'create') vivas.add(tabela);
      else vivas.delete(tabela);
    }
  }
  return vivas;
}
