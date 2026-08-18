# Módulo `<modulo>`

Fatia vertical autossuficiente do domínio **<Modulo>**. A fronteira física de pastas **é** a fronteira de
dependência: extrair este módulo é copiar esta pasta, os adapters que ele declara, e recortar as chaves
`<MODULO>_*` do `.env` da raiz. Nenhum import muda.

> **Não copie esta pasta à mão.** Use `node tools/create-module.mjs <id>` — ele substitui os marcadores,
> ajusta o manifesto, cria o `.env` com o ponteiro e roda o gate. Módulo manual nasce sem manifesto e com nome
> divergente, e o gate não consegue consertar isso sozinho.

**Leis donas:** `specs/arquitetura/01-modulo.md` (anatomia, manifesto, portas,
gateways) · `specs/arquitetura/02-contrato-e-dados.md` (API, erro, schema) ·
`specs/arquitetura/03-operacao.md` (segurança, log, teste, extração) ·
`specs/arquitetura/04-regras.md` (**o catálogo — a única fonte normativa**).

## Marcadores

| Marcador | Vira | Aparece em |
|---|---|---|
| `<modulo>` | id em kebab-case (`catalogo`) | pastas, rotas, prefixo de tabela, package |
| `<MODULO>` | id em MAIÚSCULA (`CATALOGO`) | variáveis de ambiente |
| `<Modulo>` | rótulo humano (`Catalogo`) | manifesto, textos |
| `<escopo>` | escopo dos packages (`acme`) | nome do package, schema do banco |

Módulo que **não gera artefato** descarta `core/engine`, `core/templates`, `database/` e `generated/`
(`--sem-artefato`). Módulo sem tela descarta `web/` (`--sem-web`). **Descartar é permitido; renomear, não.**

## Anatomia

```
module.json      identidade + contrato — o sistema DESCOBRE o módulo por aqui
contract/        openapi.yaml — a FONTE do contrato; o código segue
config/          5 arquivos, um por assunto. Zero valor literal no código
core/            engine interna, sem I/O
  domain/       tipos + validação
  ports/        o que preciso de INFRAESTRUTURA
  gateways/      o que preciso de OUTROS MÓDULOS — só HTTP
  engine/         geração determinística do artefato
api/src/         a única superfície pública
web/src/         front — consome só /api/v1/<modulo>
database/        schema.sql + migrations das tabelas <modulo_snake>_*
tests/           domain/ contract/ web/ fixtures/ — sem rede, sem banco
```

## As regras que este molde já cabeia

- **Zero hardcoded:** nenhuma URL, porta, timeout, limite ou rótulo literal. Segredo no `.env`; tunable em
  `config/`; texto em `config/textos.json`.
- **Falha rápida:** env ou config ausente **derruba o boot**. `process.env['X'] ?? 'http://localhost'` é violação.
- **Infraestrutura desacoplada:** o módulo fala com `core/ports`, nunca com fornecedor. O nome do provedor só
  aparece em `config/ports.json` — trocar de banco é editar uma linha de JSON.
- **Módulo alheio desacoplado:** dado de outro módulo vem por `core/gateways/`, só HTTP, declarado em `consumes`.
- **Contrato primeiro:** `contract/openapi.yaml` antes do código, com `/health`, `/meta` e `/resumo`.
- **Saída por allowlist:** a resposta é montada campo a campo no mapeador. Devolver registro cru é proibido.
- **Deny by default:** toda rota exige token, exceto as de `publicRoutes`.
- **Log estruturado** com `requestId` e redação automática de campo sensível. `console.*` é proibido.
- **Determinismo:** `Math.random()` e `new Date()` proibidos em `core/` — use `geradorId` e `relogio`.
- **Dados:** tabela `<modulo_snake>_*` no schema declarado (**nunca** `public`), RLS ligada, trilha append-only.

## Comandos

```
npm test                     testes do módulo, sem rede e sem banco
npm run tipos                tsc --noEmit
npm run validar              o gate de conformidade neste módulo
npm run validar:extracao     este módulo vira microsserviço hoje?
```

## Checklist antes de dizer "pronto"

- [ ] `npm run validar` passa.
- [ ] `module.json` reflete o que o código usa (tabelas, env, portas, `consumes`, permissões).
- [ ] Rotas do código == `contract/openapi.yaml`; `/health`, `/meta` e `/resumo` respondendo.
- [ ] Nenhum literal de config ou segredo; nenhum `process.env` fora de `api/src/config.ts`.
- [ ] Nenhum campo sensível em resposta, log ou OpenAPI.
- [ ] Testes verdes, sem rede.
- [ ] `npm run validar:extracao` sem erro — o módulo vira microsserviço hoje.
