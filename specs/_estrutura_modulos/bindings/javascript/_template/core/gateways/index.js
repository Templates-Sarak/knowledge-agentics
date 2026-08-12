// Gateways do modulo <modulo>: o que ele precisa de OUTROS MODULOS.
// Lei dona: specs/arquitetura/01-modulo.md §6.  Decisao: ADR-002 (specs/adr/000-decisoes-do-template.md).
//
// PORTA e infraestrutura (banco, storage, auth). GATEWAY e outro modulo.
// Sao riscos diferentes, por isso moram em pastas diferentes — e o gate cobra regras diferentes:
//
//   - arquivo aqui fala EXCLUSIVAMENTE HTTP (regra `gateway-http`);
//     nenhum SQL, nenhuma conexao, nenhum acesso a tabela — nem a propria;
//   - cada arquivo aqui TEM entrada em modulo.json:consome (regra `gateway-declarado`);
//   - o grafo de `consome` nao pode ter ciclo (regra `consome-ciclo`);
//   - a URL base vem de .env, nunca literal (regra `hardcode-url`).
//
// Este modulo nasce sem gateway (`consome: []`). Para acrescentar um, crie
// `core/gateways/<outro>.js` seguindo a forma abaixo e declare-o no manifesto.
//
//   // core/gateways/catalogo.js
//   import { ErroDeGateway } from './index.js';
//
//   export function createCatalogGateway(baseUrl) {
//     return {
//       async obterPrecoVigente(hash) {
//         const resposta = await fetch(`${baseUrl}/itens/${hash}/preco-vigente`);
//         if (!resposta.ok) throw new ErroDeGateway('catalogo', `HTTP ${resposta.status}`);
//         const { valor } = await resposta.json();
//         return valor;   // projete SO a fatia que voce declarou precisar
//       },
//     };
//   }

/** Falha ao falar com outro modulo. A borda a traduz para DEPENDENCIA_EXTERNA (502). */
export class ErroDeGateway extends Error {
  /**
   * @param {string} modulo
   * @param {string} motivo
   */
  constructor(modulo, motivo) {
    super(`gateway "${modulo}" indisponivel: ${motivo}`);
    this.name = 'ErroDeGateway';
    this.modulo = modulo;
  }
}
