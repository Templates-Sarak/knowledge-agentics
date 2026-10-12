// Motor do modulo <module>: geracao DETERMINISTICA do artefato publicavel.
// Lei dona: specs/arquitetura/01-modulo.md §2 (so existe se generatesArtifact = true).
//
// Deterministico significa: mesma entrada, saida byte a byte identica. Por isso o instante e o
// identificador chegam prontos, de fora — `new Date()` e `Math.random()` sao proibidos aqui e o
// gate reprova (regra `determinism`). E o que torna o motor testavel sem congelar relogio.

/**
 * Substitui marcadores `{{key}}` do template pelos valores informados.
 * @param {string} template
 * @param {Record<string, string>} values
 * @returns {string}
 */
function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (original, key) => values[key] ?? original);
}

/**
 * Escapa o que vai para HTML. Artefato publicado nao pode virar vetor de injecao.
 * @param {string} text
 * @returns {string}
 */
function escape(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Gera o artefato de um registro. O `template` vem de core/templates/, lido pela borda —
 * o motor nao le arquivo, para continuar puro e testavel.
 *
 * @param {import('../domain/index.js').Entry} entry
 * @param {string} template
 * @returns {string}
 */
export function generateArtifact(entry, template) {
  return fill(template, {
    hash: escape(entry.hash),
    title: escape(entry.title),
    status: escape(entry.status),
    createdAt: escape(entry.createdAt),
  });
}
