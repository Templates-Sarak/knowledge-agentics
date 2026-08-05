/**
 * limiares.mjs — a FONTE ÚNICA dos limiares de escrita. Lei dona: specs/arquitetura/04-regras.md §4.7.
 *
 * Os números são LEI, não política de projeto, e é por isso que moram aqui e não em `config/`:
 *
 *   - o §4.7 do catálogo os ENUNCIA no texto da regra ("função com no máximo 40 linhas") e o §1 diz
 *     que o catálogo é a única fonte normativa. Se fossem configuráveis, a lei afirmaria um número
 *     que qualquer projeto poderia desmentir — e uma lei que o projeto reescreve não é lei;
 *   - o gate viaja DENTRO do módulo extraído, que sai sem o `config/` da raiz. Limiar que morasse
 *     lá deixaria de existir no primeiro `git init` do módulo novo.
 *
 * O que é de fato ajustável por projeto (cobertura mínima, severidade de CVE, qual ferramenta)
 * mora em `config/verificacao.json`, na raiz — e nada dali entra neste arquivo.
 *
 * Este módulo é a única fonte EXECUTÁVEL: `regras/escrita.mjs` o consome, e
 * `ferramentas/gerar-config-lint.mjs` gera a config do linter de cada linguagem a partir dele.
 * Assim o linter e o gate não podem divergir por edição de um só lado — que é o defeito que a
 * precedência do §7.2 ("onde o gate e o linter discordarem, o linter tem razão") tornaria invisível.
 */
export const LIMIARES = {
  /** Linhas de corpo de função. */
  linhasFuncao: 40,
  /** Profundidade de blocos de CONTROLE aninhados. */
  aninhamento: 3,
  /** Parâmetros por função. */
  parametros: 4,
};
