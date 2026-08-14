---
name: test-api-contrato
description: Testa o contrato de API onde o gate estático não alcança — conformidade em runtime da resposta real contra o schema do openapi.yaml, mock de consumidor derivado do contrato e compatibilidade de payload entre versões. Use ao montar contract testing provider/consumer ou antes de mudar schema de um módulo consumido. NÃO acione proativamente.
---

# Skill: Contract Testing (o que o gate não pode cobrar)

> **Dependência:** aplica `padrao-escrita` (Nível 0). A norma de contrato (rota, nomenclatura, projeção)
> é **Nível 1** e vive em `specs/arquitetura/04-regras.md` §4.5 — na base, em
> `specs/_estrutura_modulos/doutrina/04-regras.md`. Esta skill **não a reenuncia**.

O contrato de um módulo é o `contract/openapi.yaml` dele. Boa parte da conformidade já é **cobrada por
máquina, estaticamente**, pelo gate do template. Esta skill existe para a metade que um verificador
estático não consegue afirmar: **o que exige executar o app ou julgar compatibilidade**.

Aditiva (cria testes de contrato) → HITL leve. Teste ativo **só no próprio app ou staging autorizado**.

## O gate já faz isto — não repita

| Regra do gate | O que já é cobrado, sem executar nada |
|---|---|
| `contrato` | o `contract/openapi.yaml` existe, é legível e declara `/health`, `/meta`, `/resumo` |
| `rota-nomenclatura` | `servers[0].url` = `basePath`; segmento sem verbo (PT e EN); kebab-case; parâmetro camelCase |
| `contrato-sincronizado` | as rotas do código e as do `paths:` coincidem **nos dois sentidos** |
| `projecao-contrato` | todo campo que o mapeador projeta está declarado em algum schema de **resposta** |
| `consome-contrato` | quem declara `consumes` aponta para rota e método que o dono realmente declara |

```
node tools/gate/validate.mjs <caminho-do-modulo>     # antes de escrever teste nenhum
```

**Rodar esta skill não substitui o gate, e o gate não substitui esta skill.** Se o gate está vermelho,
conserte-o primeiro: teste de contrato sobre spec inválida mede a coisa errada.

## Onde o gate para — e por que esta skill existe

O `04-regras.md` §7.2 declara o limite em voz alta, na linha do `consome-contrato`:

> mudança de forma **dentro** do schema (tipo alterado, campo que virou opcional, enum que perdeu valor)
> passa — a regra lê o caminho e o método, nunca o corpo.

Daí sai o escopo desta skill, e só ele:

1. **Conformidade em runtime** — a resposta **real** do app bate com o schema declarado? O gate compara
   texto; só executar responde isso.
2. **Consumidor contra mock do contrato** — o consumidor depende do que o contrato **garante**, e não do
   que a implementação do provider hoje devolve por acaso.
3. **Compatibilidade de payload entre versões** — tipo alterado, campo que virou obrigatório, enum que
   perdeu valor. É julgamento sobre duas versões do schema, não leitura de uma.

## Anatomia do módulo (para não procurar no lugar errado)

```
modules/<modulo>/
  contract/openapi.yaml     <- O CONTRATO mora aqui, nao em api/
  api/                      <- a borda que implementa o contrato (rotas, mapeadores, middlewares)
  core/{domain,engine,ports,gateways,templates}
  config/  database/  tests/  web/
```

O contrato é `contract/openapi.yaml`. `api/` é quem o **implementa**; `core/` é interno e nunca aparece
no contrato. Consumidor fala com o `api/` do provider via `core/gateways/` — nunca com o `core/` dele.

## Quando usar
- Ao montar contract testing provider/consumer num módulo que já passa no gate.
- **Antes** de alterar schema de um módulo que alguém declara em `consumes` — é a mudança que o gate deixa passar.
- Antes de extrair um módulo como serviço, para provar que o contrato se sustenta sozinho.

## Workflow

Um módulo por vez. Matriz e ferramentas em `references/contract-testing.md`; leitura da spec do molde
em `references/openapi-basico.md`.

1. **Gate verde primeiro** — `node tools/gate/validate.mjs <modulo>`. Vermelho? Pare e conserte lá.
   Estrutura, nomenclatura e projeção não são trabalho desta skill.
2. **Ler o contrato** — `contract/openapi.yaml`: rotas, schemas de resposta, taxonomia de erro. Identifique
   quem consome o módulo (`grep` por `"module": "<id>"` nos `consumes` dos outros `module.json`).
3. **Provider — conformidade em runtime** — valide a resposta **real** contra o schema, no próprio app:
   asserção de schema nos testes de `tests/`, ou `schemathesis` contra `localhost`. Divergência → conserte
   o lado errado (código **ou** spec), nunca silencie.
4. **Consumer — mock derivado do contrato** — o test double do provider sai da **spec**, não da
   implementação. É isso que faz o teste do consumidor quebrar quando o provider muda de forma.
5. **Compatibilidade de payload** — compare o schema novo com o em uso: tipo alterado, campo que virou
   obrigatório, enum que perdeu valor, campo removido. Todos são **breaking** e o gate não os vê.
6. **Versionar quando for breaking** — `/api/v2/` convivendo com `v1` por uma janela anunciada no
   `openapi.yaml` (`02-contrato-e-dados.md` §5). Aditivo e opcional fica na `v1`.
7. **HITL — plano** — apresente: divergências provider/consumer, incompatibilidades de payload achadas,
   a correção proposta e se há breaking change. → "⚠️ Confirma?" **Aguarde.** Depois aplique, re-teste e
   reporte antes/depois.

## Regras e limites
- **NÃO** reenuncie norma de Nível 1 (prefixo, verbo no path, kebab-case, camelCase) — ela é do
  `04-regras.md` §4.5 e já tem verificador. Aponte para lá.
- **NUNCA** derive o mock do consumidor da **implementação** do provider — só do contrato. Mock copiado
  da implementação passa a testar o acidente, não a promessa.
- **NÃO** teste contrato com o gate vermelho — a spec ainda não é fonte confiável.
- **NÃO** introduza breaking change em versão em uso — versione, ou faça a mudança aditiva e opcional.
- **NUNCA** rode teste ativo fora do **próprio app ou alvo autorizado**.
- **NÃO** aplique correção sem o HITL do passo 7.
- **NÃO** saia do escopo: **segurança** da API (authz, IDOR, rate limit, CORS) é da `cyber-api`; **regra de
  negócio** é da `test-unitario`; estrutura e nomenclatura são do gate.

## Checklist "pronta"
- [ ] Gate verde no módulo **antes** de escrever teste de contrato?
- [ ] Resposta real do provider validada contra o schema do `contract/openapi.yaml`, executando?
- [ ] Cada consumidor testado contra mock **derivado do contrato**, não da implementação?
- [ ] Mudança de schema comparada com a versão em uso (tipo, obrigatoriedade, enum, remoção)?
- [ ] Breaking change versionado, com `v1` convivendo pela janela anunciada?
- [ ] HITL apresentado; antes/depois reportado; teste ativo só no próprio app?

## Referências (Camada 3 — leia sob demanda)
- `references/contract-testing.md` — matriz provider/consumer, ferramentas por binding, e o que cada teste cobre.
- `references/openapi-basico.md` — como ler o `contract/openapi.yaml` do template e o que o gate já garante nele.
- **A spec de referência é a do molde**, nunca uma cópia local:
  `specs/_estrutura_modulos/bindings/<binding>/_template/contract/openapi.yaml`.
