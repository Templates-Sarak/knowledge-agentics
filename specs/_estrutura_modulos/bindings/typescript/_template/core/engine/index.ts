// Motor do modulo <module>: geracao DETERMINISTICA do artefato publicavel.
// Lei dona: specs/arquitetura/01-modulo.md §2 (so existe se generatesArtifact = true).
//
// Deterministico significa: mesma entrada, saida byte a byte identica. Por isso o instante e o
// identificador chegam prontos, de fora — `new Date()` e `Math.random()` sao proibidos aqui e o
// gate reprova (regra `determinism`). E o que torna o motor testavel sem congelar relogio.

import type { Entry } from '../domain/index.js';

/** Substitui marcadores `{{key}}` do template pelos valores informados. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (original, key: string) => values[key] ?? original);
}

/** Escapa o que vai para HTML. Artefato publicado nao pode virar vetor de injecao. */
function escape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Gera o artefato de um registro. O `template` vem de core/templates/, lido pela borda —
 * o motor nao le arquivo, para continuar puro e testavel.
 */
export function generateArtifact(entry: Entry, template: string): string {
  return fill(template, {
    hash: escape(entry.hash),
    title: escape(entry.title),
    status: escape(entry.status),
    createdAt: escape(entry.createdAt),
  });
}
