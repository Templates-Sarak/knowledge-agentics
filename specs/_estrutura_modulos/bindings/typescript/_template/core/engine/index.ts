// Motor do modulo <modulo>: geracao DETERMINISTICA do artefato publicavel.
// Lei dona: specs/arquitetura/01-modulo.md §2 (so existe se geraArtefato = true).
//
// Deterministico significa: mesma entrada, saida byte a byte identica. Por isso o instante e o
// identificador chegam prontos, de fora — `new Date()` e `Math.random()` sao proibidos aqui e o
// gate reprova (regra `determinismo`). E o que torna o motor testavel sem congelar relogio.

import type { Registro } from '../domain/index.js';

/** Substitui marcadores `{{chave}}` do template pelos valores informados. */
function preencher(template: string, valores: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (original, chave: string) => valores[chave] ?? original);
}

/** Escapa o que vai para HTML. Artefato publicado nao pode virar vetor de injecao. */
function escapar(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Gera o artefato de um registro. O `template` vem de core/templates/, lido pela borda —
 * o motor nao le arquivo, para continuar puro e testavel.
 */
export function gerarArtefato(registro: Registro, template: string): string {
  return preencher(template, {
    hash: escapar(registro.hash),
    titulo: escapar(registro.titulo),
    status: escapar(registro.status),
    criadoEm: escapar(registro.criadoEm),
  });
}
