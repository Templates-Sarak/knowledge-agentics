---
tipo: "manual"
titulo: "specs/arquitetura/ — o mapa"
status: "🟢 Vigente"
tags: ["indice", "mapa", "arquitetura", "onboarding"]
---

# specs/arquitetura/ — o mapa

> **A lei deste arquivo:** toda linha abaixo é um **ponteiro** (`§`) ou um **comando**. Apagar este
> arquivo inteiro não faz nenhuma regra desaparecer — só torna mais difícil achá-la. O texto normativo
> mora nos outros cinco arquivos desta pasta (`00-arquitetura.md` … `04-regras.md`); este só aponta.

## 1. Qual seção responde a qual pergunta

| Pergunta | Onde |
|---|---|
| O sistema por inteiro — as quatro peças e as fronteiras | `00-arquitetura.md` |
| Como um módulo é por dentro — árvore, manifesto, portas, gateways | `01-modulo.md` §1–§7 |
| **Como crio um módulo novo** | `01-modulo.md` §8 |
| **Como altero um módulo que já existe** — a seção mais usada, o diário | `01-modulo.md` §9 |
| … campo novo no contrato | `01-modulo.md` §9.1 |
| … rota nova | `01-modulo.md` §9.2 |
| … infraestrutura nova (porta) | `01-modulo.md` §9.3 |
| … dependência de outro módulo (gateway) | `01-modulo.md` §9.4 |
| … variável de ambiente | `01-modulo.md` §9.5 |
| … tabela nova | `01-modulo.md` §9.6 |
| … tela nova | `01-modulo.md` §9.7 |
| Forma da API, do erro, do schema, da migration | `02-contrato-e-dados.md` |
| Segurança, log, erro, teste, extração, camadas de custo | `03-operacao.md` |
| **O catálogo de regras — o que o gate cobra, e por quê** | `04-regras.md` |
| As decisões congeladas deste projeto (o template em si) | `../adr/000-decisoes-do-template.md` |

## 2. O laço

```sh
<comando-verificar>                        gate + env + schemas + forma + limiares + tipos + testes
<comando-iniciar>                          sobe o sistema — um processo, uma porta
git config core.hooksPath .githooks        ativa os hooks (config LOCAL — cada clone repete)
```

`pre-commit` (segundos) cobra o gate nos módulos **afetados** pelo staged, mais `.env.example` em dia,
schemas de portas, forma e limiares. `pre-push` (dezenas de segundos) cobra tipos e testes dos
afetados. Nenhum dos dois cobra sozinho: `git commit --no-verify` fura por desenho do próprio git —
quem cobra sem esse furo é o CI (`03-operacao.md` §7).

## 3. A ordem ao criar módulo

```sh
node tools/create-module.mjs <id> --role domain|gateway|connector --binding <b> [--sem-artefato]
```

Depois do scaffold, a ordem de preenchimento e o motivo dela estão em `01-modulo.md` §8 —
**contrato primeiro**, por decisão registrada ali mesmo.

**Com o plugin `sarak` instalado:** a skill `code-modulo` conduz esse fluxo inteiro com HITL.
**Sem o plugin** (este mapa, sozinho): `01-modulo.md` §8 para criar e §9 para alterar bastam — estão
ao lado, na mesma pasta.

## 4. Os erros que o gate mais pega — cada um com o nome da regra que cobra

| Erro comum | Regra |
|---|---|
| importar outro módulo em vez de declarar `consumes` (HTTP) | `import-lateral` |
| importar um adapter dentro do módulo — o adapter é injetado | `import-adapter` |
| porta, permissão ou tabela usada e não declarada no manifesto | `porta-declarada` / `permissao-literal` / `tabela-declarada` |
| rota no código sem contrato, ou no contrato sem código | `contrato-sincronizado` |
| default silencioso de ambiente (`process.env.X ?? 3000`) | `fallback-silencioso` |
| campo na resposta que nenhum schema do contrato declara | `projecao-contrato` |
| SQL montado por concatenação ou interpolação | `sql-concatenado` |
| `console.log`/`print` no lugar do logger estruturado | `log` |
| função acima de 40 linhas, aninhamento acima de 3, mais de 4 parâmetros | `limiar-funcao` / `limiar-aninhamento` / `limiar-parametros` |

O catálogo inteiro — todas as regras, nível e escopo de cada uma: `04-regras.md`.

## 5. Com e sem o plugin `sarak`

**Com o plugin:** as skills conduzem o fluxo com HITL — `code-modulo` (create/alterar módulo),
`meta-iniciar-repositorio` (repositório inteiro). Este mapa continua valendo: é o que as skills leem
por baixo, não um caminho paralelo a elas.

**Sem o plugin** (só este repositório, sem skill nenhuma instalada): os blocos 1–4 acima bastam — ache
a pergunta no bloco 1, rode o comando do bloco 2, siga a ordem do bloco 3, reconheça o erro pelo
bloco 4.
