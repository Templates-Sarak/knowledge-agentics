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
 * @returns {import('../../../core/dominio/index.js').Registro}
 */
export function linhaParaDominio(linha) {
  return {
    hash: linha.hash,
    titulo: linha.titulo,
    status: linha.status,
    criadoEm: linha.created_at,
  };
}

/**
 * dominio -> banco
 * @param {import('../../../core/dominio/index.js').Registro} registro
 */
export function dominioParaLinha(registro) {
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
 *
 * @param {import('../../../core/dominio/index.js').Registro} registro
 */
export function paraContrato(registro) {
  return {
    hash: registro.hash,
    titulo: registro.titulo,
    status: registro.status,
    criadoEm: registro.criadoEm,
  };
}

/**
 * manifesto -> META publica (allowlist). `GET /meta` e rota SEM TOKEN (`rotasPublicas`): o que nao
 * esta aqui e reconhecimento — schema do banco, nomes de chave de segredo, vocabulario de
 * `permissoes`, `rotasPublicas` e `camposSensiveis` nunca saem por esta rota (plan-2.md N.1).
 *
 * @param {{ id: string, nome: string, versao: string, papel: string, rotaBase: string,
 *   rotaWeb: string|null, navegacao: object|null, exportaResumo: boolean }} manifesto
 */
export function paraMeta(manifesto) {
  return {
    id: manifesto.id,
    nome: manifesto.nome,
    versao: manifesto.versao,
    papel: manifesto.papel,
    rotaBase: manifesto.rotaBase,
    rotaWeb: manifesto.rotaWeb,
    navegacao: manifesto.navegacao,
    exportaResumo: manifesto.exportaResumo,
  };
}

/** Envelope unico de colecao (specs/arquitetura/02-contrato-e-dados.md §3.1). */
export function paraColecao(registros, pagina, tamanho, total) {
  return { itens: registros.map(paraContrato), pagina, tamanho, total };
}
