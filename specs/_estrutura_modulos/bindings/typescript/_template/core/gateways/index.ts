// Gateways do modulo <modulo>: o que ele precisa de OUTROS MODULOS.
// Lei dona: specs/arquitetura/01-modulo.md §6.  Decisao: ADR-002 (specs/adr/000-decisoes-do-template.md).
//
// PORTA e infraestrutura (banco, storage, auth). GATEWAY e outro modulo.
// Sao riscos diferentes, por isso moram em pastas diferentes — e o gate cobra regras diferentes:
//
//   - arquivo aqui fala EXCLUSIVAMENTE HTTP (regra `gateway-http`);
//     nenhum SQL, nenhuma conexao, nenhum acesso a tabela — nem a propria;
//   - cada arquivo aqui TEM entrada em module.json:consome (regra `gateway-declarado`);
//   - o grafo de `consumes` nao pode ter ciclo (regra `consome-ciclo`);
//   - a URL base vem de .env, nunca literal (regra `hardcode-url`).
//
// Este modulo nasce sem gateway (`consumes: []`). Para acrescentar um, crie
// `core/gateways/<outro>.ts` seguindo a forma abaixo e declare-o no manifesto.
//
//   // core/gateways/financeiro.ts
//   import type { Registro } from '../domain/index.js';
//
//   export interface FinanceGateway {
//     obterAliquotaVigentePct(): Promise<number>;
//   }
//
//   export function createFinanceGateway(baseUrl: string): FinanceGateway {
//     return {
//       async obterAliquotaVigentePct(): Promise<number> {
//         const resposta = await fetch(`${baseUrl}/aliquotas/vigente`);
//         if (!resposta.ok) throw new ErroDeGateway('financeiro', `HTTP ${resposta.status}`);
//         const { valor } = (await resposta.json()) as { valor: number };
//         return valor;   // projete SO a fatia que voce declarou precisar
//       },
//     };
//   }

/** Falha ao falar com outro modulo. A borda a traduz para DEPENDENCIA_EXTERNA (502). */
export class ErroDeGateway extends Error {
  constructor(
    public readonly modulo: string,
    motivo: string,
  ) {
    super(`gateway "${modulo}" indisponivel: ${motivo}`);
    this.name = 'ErroDeGateway';
  }
}
