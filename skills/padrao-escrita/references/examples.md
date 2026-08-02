# Exemplos: padrao-escrita

Leia quando estiver em dúvida sobre como aplicar o padrão. O bom mostra um módulo desacoplado e
extraível; o ruim mostra os acoplamentos que impedem a futura separação.

> A anatomia completa é do Nível 1 (`PADRAO-ORGANIZACAO.md` → `04-regras.md`). Aqui o foco é o **contraste**:
> que cara tem uma violação, e o que exatamente ela custa.

---

## Exemplo bom — módulo `catalogo` autossuficiente

### Estrutura

```
modulos/catalogo/
├── modulo.json              id, papel, dados, portas, consome, camposSensiveis…
├── contrato/openapi.yaml    a FONTE do contrato — o código segue
├── config/
│   ├── api.json             { "paginaTamanhoMaximo": 100 }
│   ├── dominio.json         { "statusValidos": ["rascunho","vigente"] }
│   ├── seguranca.json       rate limit, CORS declarado, headers
│   ├── portas.json          { "repositorio": "postgres" }  ← único lugar com nome de fornecedor
│   └── textos.json          rótulos exibidos ao usuário
├── core/
│   ├── dominio/             tipos + validação
│   ├── portas/              o que preciso de INFRAESTRUTURA
│   └── gateways/            o que preciso de OUTRO MÓDULO — só HTTP
├── api/src/{index,config,logger}.ts  routes/  middlewares/  mapeadores/
├── web/src/{pages,components,hooks,api-client}/
├── database/{schema.sql,migrations/}  tabelas catalogo_*
└── tests/{dominio,contrato,web,fixtures}/
```

### Como consome outro módulo

```ts
// core/gateways/financeiro.ts        ✅ pasta separada: "falo com outro módulo" ≠ "falo com meu banco"
export async function buscarAliquotaVigente(deps: Deps): Promise<Aliquota> {
  const resposta = await fetch(`${deps.config.financeiroBaseUrl}/api/v1/financeiro/aliquotas/vigente`);
  if (!resposta.ok) throw new ErroDependenciaExterna('financeiro indisponivel');  // ✅ taxonomia fechada
  const bruto = await resposta.json();
  return { percentual: bruto.percentual, vigenteEm: bruto.vigenteEm };            // ✅ fatia mínima projetada
}
```

```jsonc
// modulo.json                        ✅ dependência DECLARADA — sem isso, o gate reprova
"consome": [
  { "modulo": "financeiro", "contrato": "GET /aliquotas/vigente", "porQue": "alíquota do mês na conciliação" }
]
```

### Como consome infraestrutura

```ts
// api/src/index.ts     ✅ RECEBE os adapters, nunca os cria — e nunca importa o SDK do fornecedor
export function montar(deps: DependenciasDoModulo) { … }
```

Trocar Postgres por Supabase é **editar uma linha** de `config/portas.json`. Se for preciso mais que isso,
a porta está mal desenhada.

### Regra de negócio

```ts
// core/dominio/item.ts
export function criarItem(entrada: EntradaItem, deps: Deps): Item {
  if (entrada.itens.length === 0) throw new ErroValidacao('pedido sem itens');   // ✅ guard clause
  if (entrada.itens.length > deps.config.dominio.itensMaximo) {                  // ✅ limite em config
    throw new ErroValidacao('itens acima do maximo');
  }
  return { hash: deps.geradorId.novo(), criadoEm: deps.relogio.agora(), ...entrada }; // ✅ portas: determinístico
}
```

**Por que está conforme:** depende do **contrato HTTP** de `financeiro` (não do schema dele), tabelas
prefixadas `catalogo_*`, nome de fornecedor só em `config/portas.json`, `relogio`/`geradorId` no lugar de
`new Date()`/`Math.random()`, e todos os testes rodam com adapters de memória — sem rede, sem banco. Extrair
o módulo é copiar a pasta e recortar as chaves `CATALOGO_*` do `.env`.

---

## Exemplo ruim — módulo `catalogo` acoplado

```ts
// modulos/catalogo/api/src/rotas.ts
import { buscarCliente } from '../../../financeiro/core/dominio/cliente';  // import lateral
import { Pool } from 'pg';                                                  // SDK do fornecedor dentro do módulo

const pool = new Pool({ connectionString: process.env.DB_URL ?? 'postgres://localhost:5432/app' });

export async function criarItemENotificarELogar(req, res, usuario, itens, opcoes, extra) {  // 6 params, 3 responsabilidades
  const linhas = await pool.query(
    `SELECT * FROM clientes JOIN financeiro_aliquotas ON ...`);   // JOIN cross-módulo, tabela sem prefixo
  if (usuario) {
    if (itens) {
      if (itens.length < 100) {                                    // aninhamento 4, número mágico
        try { await enviar(usuario); } catch (e) {}                // exceção engolida
        console.log('criado', usuario.cpf);                        // console + PII em log
      }
    }
  }
  res.json(linhas[0]);                                             // registro CRU do banco na resposta
}
```

Rota: `POST /api/criarItem` → `{ "user_id": "...", "order_items": [...] }`

**Por que é ruim — e qual regra do gate pega cada coisa:**

| Violação | Impacto | Regra |
|---|---|---|
| `import ../../financeiro/core/…` | acopla ao **interno** de outro módulo; extração vira refactor | `import-lateral` |
| `import { Pool } from 'pg'` | o módulo conhece o fornecedor; trocar de banco vira caçada | `sdk-fornecedor` |
| `?? 'postgres://localhost…'` | sobe apontando para o lugar errado em vez de falhar | `fallback-silencioso` |
| `JOIN financeiro_aliquotas` | banco vira acoplamento escondido; impossível separar | `tabela-alheia` |
| tabela `clientes` sem prefixo | não se sabe quem é dono; extração ambígua | `tabela-prefixo` |
| `criarItemENotificarELogar` | viola SRP — o "E" no nome denuncia 3 responsabilidades | Nível 0 |
| 6 parâmetros · aninhamento 4 · `100` mágico | ilegível e não configurável | `limiar-parametros`, `limiar-aninhamento`, `hardcode-numero` |
| `catch (e) {}` | falha some; o bug aparece longe da causa | `excecao-engolida` |
| `console.log(..., usuario.cpf)` | PII em log, burlando a redação automática | `log`, `sensivel-em-saida` |
| `res.json(linhas[0])` | publica coluna nova e PII por omissão | `saida-crua` |
| `POST /api/criarItem`, corpo `snake_case` | verbo no path, sem versão, casing do contrato errado | `contrato-sincronizado`, `payload-camelcase` |

**Consequência:** o módulo não pode ser extraído sem reescrever quem o consome — exatamente o que o padrão
microservice-ready existe para evitar. **E nada disso depende de alguém lembrar:** cada linha da tabela tem
um id de regra, e `validar.mjs` reprova com exit 1.
