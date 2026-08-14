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

/**
 * banco -> dominio
 * @param {{ hash: string, titulo: string, status: string, created_at: string }} linha
 * @returns {import('../../../core/domain/index.js').Registro}
 */
export function rowToDomain(linha) {
  return {
    hash: linha.hash,
    titulo: linha.titulo,
    status: linha.status,
    criadoEm: linha.created_at,
  };
}

/**
 * dominio -> banco
 * @param {import('../../../core/domain/index.js').Registro} registro
 */
export function domainToRow(registro) {
  return {
    hash: registro.hash,
    titulo: registro.titulo,
    status: registro.status,
    created_at: registro.criadoEm,
  };
}

/**
 * dominio -> CONTRATO. A allowlist e esta funcao: o que nao esta escrito aqui nao e publicado.
 * Campo declarado em module.json:camposSensiveis nunca entra — ou entra mascarado.
 *
 * @param {import('../../../core/domain/index.js').Registro} registro
 */
export function toContract(registro) {
  return {
    hash: registro.hash,
    titulo: registro.titulo,
    status: registro.status,
    criadoEm: registro.criadoEm,
  };
}

/**
 * manifesto -> META publica (allowlist). `GET /meta` e rota SEM TOKEN (`publicRoutes`): o que nao
 * esta aqui e reconhecimento — schema do banco, nomes de chave de segredo, vocabulario de
 * `permissions`, `publicRoutes` e `sensitiveFields` nunca saem por esta rota.
 *
 * @param {{ id: string, name: string, version: string, role: string, basePath: string,
 *   webPath: string|null, navigation: object|null, exportsSummary: boolean }} manifesto
 */
export function toMeta(manifesto) {
  return {
    id: manifesto.id,
    name: manifesto.name,
    version: manifesto.version,
    role: manifesto.role,
    basePath: manifesto.basePath,
    webPath: manifesto.webPath,
    navigation: manifesto.navigation,
    exportsSummary: manifesto.exportsSummary,
  };
}

/** Envelope unico de colecao (specs/arquitetura/02-contrato-e-dados.md §3.1). */
export function toCollection(registros, pagina, tamanho, total) {
  return { itens: registros.map(toContract), pagina, tamanho, total };
}
