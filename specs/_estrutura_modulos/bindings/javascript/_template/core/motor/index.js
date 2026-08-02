// Motor do modulo <modulo>: geracao DETERMINISTICA do artefato publicavel.
// Lei dona: specs/arquitetura/01-modulo.md §2 (so existe se geraArtefato = true).
//
// Deterministico significa: mesma entrada, saida byte a byte identica. Por isso o instante e o
// identificador chegam prontos, de fora — `new Date()` e `Math.random()` sao proibidos aqui e o
// gate reprova (regra `determinismo`). E o que torna o motor testavel sem congelar relogio.

/**
 * Substitui marcadores `{{chave}}` do template pelos valores informados.
 * @param {string} template
 * @param {Record<string, string>} valores
 * @returns {string}
 */
function preencher(template, valores) {
  return template.replace(/\{\{(\w+)\}\}/g, (original, chave) => valores[chave] ?? original);
}

/**
 * Escapa o que vai para HTML. Artefato publicado nao pode virar vetor de injecao.
 * @param {string} texto
 * @returns {string}
 */
function escapar(texto) {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Gera o artefato de um registro. O `template` vem de core/templates/, lido pela borda —
 * o motor nao le arquivo, para continuar puro e testavel.
 *
 * @param {import('../dominio/index.js').Registro} registro
 * @param {string} template
 * @returns {string}
 */
export function gerarArtefato(registro, template) {
  return preencher(template, {
    hash: escapar(registro.hash),
    titulo: escapar(registro.titulo),
    status: escapar(registro.status),
    criadoEm: escapar(registro.criadoEm),
  });
}
