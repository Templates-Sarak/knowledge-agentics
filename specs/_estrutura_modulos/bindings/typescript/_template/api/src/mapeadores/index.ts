// Mapeadores do modulo <modulo>. Lei dona: specs/arquitetura/02-contrato-e-dados.md §3.
//
// Duas responsabilidades, e so estas:
//   1. FRONTEIRA DE CAIXA — o banco fala snake_case, o contrato fala camelCase. A conversao e
//      explicita, nas duas direcoes. Nunca implicita, nunca no ORM.
//   2. PROJECAO DE SAIDA POR ALLOWLIST — a resposta e montada CAMPO A CAMPO. Devolver o registro
//      cru e proibido (regra `saida-crua`): e o que impede vazar coluna nova ou PII adicionada
//      depois por quem nao pensou na borda.
//
// A consequencia aceita de proposito: campo novo exige tocar aqui TAMBEM. Esquecer faz o campo
// nao aparecer — falha silenciosa que o teste de contrato pega. O inverso, publicar por omissao,
// seria pior.

import type { Registro } from '../../../core/dominio/index.js';

/** Linha crua do banco. Nunca sai desta camada. */
export interface LinhaRegistro {
  hash: string;
  titulo: string;
  status: string;
  created_at: string;
}

/** banco -> dominio */
export function linhaParaDominio(linha: LinhaRegistro): Registro {
  return {
    hash: linha.hash,
    titulo: linha.titulo,
    status: linha.status,
    criadoEm: linha.created_at,
  };
}

/** dominio -> banco */
export function dominioParaLinha(registro: Registro): LinhaRegistro {
  return {
    hash: registro.hash,
    titulo: registro.titulo,
    status: registro.status,
    created_at: registro.criadoEm,
  };
}

/**
 * dominio -> CONTRATO. A allowlist e esta funcao: o que nao esta escrito aqui nao e publicado.
 * Campo declarado em modulo.json:camposSensiveis nunca entra — ou entra mascarado.
 */
export function paraContrato(registro: Registro): Record<string, unknown> {
  return {
    hash: registro.hash,
    titulo: registro.titulo,
    status: registro.status,
    criadoEm: registro.criadoEm,
  };
}

/** Envelope unico de colecao (specs/arquitetura/02-contrato-e-dados.md §3.1). */
export function paraColecao(
  registros: Registro[],
  pagina: number,
  tamanho: number,
  total: number,
): Record<string, unknown> {
  return { itens: registros.map(paraContrato), pagina, tamanho, total };
}
