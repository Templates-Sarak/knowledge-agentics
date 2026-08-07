/**
 * texto.mjs — o texto de um arquivo **sem comentário nem docstring**. Lei dona:
 * specs/arquitetura/04-regras.md §7.2 ("Leitura de código: comentário não é código").
 *
 * Vive fora de `regras/` pelo mesmo argumento que `spec.mjs`, e aqui ele é mais forte: CINCO das
 * seis famílias precisam dela. Enquanto morava em `regras/isolamento.mjs`, a última a chegar —
 * `operacao.mjs`, que já é importada por `isolamento.mjs` (`SQL_FONTE`) — fechou um CICLO entre duas
 * famílias de regra. O ciclo funcionava por acidente (o `function` é içado, o `const` é usado só
 * dentro de `verificar`), e "funciona por acidente" não é acoplamento que se deixa escrito.
 *
 * O destino final dela não é um módulo: é um CAMPO em `arquivo`, ao lado de `conteudo` e
 * `linhasCodigo`, montado uma vez por `contexto.mjs` em vez de recalculado a cada regra. Isso é
 * conserto em `contexto.mjs`, que está fora do alcance deste bloco — registrado aqui para não ser
 * redescoberto.
 */

/**
 * O texto do arquivo sem comentário nem docstring — o que `conteudo` deveria ter sido em toda
 * regra que julga CÓDIGO.
 *
 * Uma implementação, e ela existe porque o mesmo defeito apareceu em oito lugares: oito cópias de
 * `.map((l) => l.texto).join('\n')` divergiriam no primeiro ajuste. Quem julga texto que NÃO é
 * código — `migrations` procurando `-- rollback`, `lerParesEnv` sobre `.env.example`, os leitores de
 * `openapi.yaml`, `juntarSql` — continua em `conteudo`, de propósito: ali o comentário é o dado.
 *
 * A junção por `\n` preserva os padrões ancorados por linha (`^`). Ela **não** preserva numeração:
 * as linhas de comentário são descartadas, então índice no texto juntado NÃO é número de linha do
 * arquivo. Quem relata posição ao autor percorre `arquivo.linhasCodigo` e usa o `numero` de cada
 * linha, que é o original — é o que toda regra faz hoje, e o que a próxima deve fazer.
 */
export function textoDeCodigo(arquivo) {
  return arquivo.linhasCodigo.map((linha) => linha.texto).join('\n');
}
