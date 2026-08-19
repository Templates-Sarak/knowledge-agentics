---
name: code-diagnostico
description: Diagnostica código legado contra o padrao-escrita (read-only) — varre um repo/módulo, classifica violações e gera um backlog priorizado em JSON. Use ao avaliar conformidade de código existente ou planejar uma adequação. NÃO modifica nada. NÃO acione proativamente.
---

# Skill: Diagnóstico de Conformidade

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Varre código existente e mede a distância dele para o padrão Sarak, produzindo um **backlog priorizado**
de violações. É **somente leitura** — não corrige nada (isso é da `code-adequacao`). Serve sozinha
("quero saber o estado do código") ou como etapa de planejamento de uma adequação.

> O padrão de referência tem três donos, e esta skill **aplica** os três sem redefinir nenhum:
> **Nível 0** em `padrao-escrita`; **Nível 1** (arquitetura de módulos) no catálogo
> `specs/_estrutura_modulos/doutrina/04-regras.md` — mapa em `padrao-escrita/references/PADRAO-ORGANIZACAO.md`;
> **Nível 2** na `padrao-<linguagem>`.

## Quando usar
- Sob demanda, para avaliar a conformidade de um repo/módulo legado.
- Como passo de planejamento antes de uma adequação (gera o backlog que a remediação consome).
- Não é mutativa e não pede HITL (não altera arquivos).

## Workflow
Trate **um alvo por vez** (um repo ou um módulo).

1. **Identificar a topologia — antes de procurar módulo.** Legado não tem uma forma só, e procurar
   `backend/<m>` num repositório que não a usa devolve **zero módulo e um verde falso**.

   | Topologia | Como reconhecer | Alvo da adequação |
   |---|---|---|
   | **template** | `modules/*/module.json` **e** `tools/gate/` | já é o alvo — ver §Atalho abaixo |
   | **modular-legado** | pasta por domínio: `backend/<m>`, `frontend/<m>`, `src/modules/<m>`, `apps/<m>`, `packages/<m>` | migrar para `modules/<m>/` |
   | **por-camadas** | `controllers/`, `services/`, `models/`, `repositories/` no topo | fatiar por domínio **antes** de qualquer outra coisa — é a violação-raiz |
   | **monólito simples** | sem separação reconhecível (script, lib, site) | **o Nível 1 não se aplica.** Diagnostique só Nível 0 e 2, e diga isso no relatório |

   Registre a topologia detectada no backlog (`topologia`). Sem ela, quem consome o plano não sabe se as
   tarefas são de refatoração interna ou de mudança de árvore.

2. **Delimitar o alvo** — liste os módulos conforme a topologia e os arquivos de cada um. Numa topologia
   `por-camadas` **não há módulos**: o alvo é o repositório inteiro, e o primeiro item do backlog é a fatia
   vertical que ainda não existe.
3. **Varrer por dimensão** — para cada arquivo, classifique violações nas dimensões abaixo. Registre `arquivo:linha`, dimensão, severidade e risco de refatoração. **Use o validador da linguagem como motor das dimensões mecânicas** (limiares, logging, tipagem, segredos, hardcoded) e consuma o JSON; complemente à mão só o que exige julgamento. Validadores: Python → `padrao-python/scripts/validate.py`; TS/JS → `padrao-typescript/scripts/validate.mjs`.
4. **Avaliar cobertura de testes** — por módulo, verifique se há `tests/` cobrindo o comportamento; marque `cobertura: sem-testes | parcial | ok`. Sem testes eleva o risco de qualquer refatoração do módulo.
5. **Agrupar por módulo → arquivo** — consolide as violações na hierarquia módulo → arquivo → violações.
6. **Priorizar** — ordene o backlog por (risco asc, severidade desc): **quick wins primeiro** (segredos/hardcoded — alto valor, baixo risco), depois limiares/SRP, por último desacoplamento estrutural (alto risco).
7. **Emitir o backlog em JSON** — no formato de `references/backlog-format.md`. Para alimentar a adequação, **decomponha em `tarefas[]`** (átomo + ondas + `risco`-roteador em `references/decomposicao.md`). Esse JSON é o que a `code-adequacao`/orquestração consome.
8. **Resumir** — apresente um sumário legível (X módulos, N violações por dimensão, cobertura, top prioridades). Para uma **consultoria completa**, preencha `assets/auditoria.template.md`.

> **Em escala:** a varredura de um repo inteiro é orquestrada pelo command `/code1-auditar` (fan-out: um agente
> `code-auditor` por módulo, persistindo em `.sarak/audit/`). Esta skill é a **lógica e o formato** que eles aplicam.

> Detalhe de cada dimensão (o que detectar + como reconhecer) em `references/backlog-format.md`.

## Atalho: alvo já na topologia `template`

Se o repositório tem `modules/*/module.json` e `tools/gate/`, **não refaça à mão o que o gate faz por
máquina**:

```
node tools/gate/validate.mjs --todos --json
```

Cada achado já vem com o **id da regra** — use-o direto como `regra` da violação. Depois, diagnostique **só o
que o gate declara não cobrir** (`04-regras.md` §7): cobertura de teste real, SRP e nomes com julgamento,
documentação de contrato, e campo sensível montado por indireção. Duplicar o gate produz backlog inflado e
achado que ninguém consegue reproduzir.

## Dimensões avaliadas — por princípio, não por nome de pasta

Legado não usa o nosso vocabulário de pastas. Cada dimensão descreve o **princípio violado**; a coluna
"como aparece" traz a forma típica em cada topologia.

| # | Dimensão | O princípio | Como aparece |
|---|---|---|---|
| 1 | **Segredos/hardcoded** | valor de config ou segredo embutido no código | literal de URL/timeout/chave; `env['X'] ?? 'http://localhost'` |
| 2 | **Limiares** | função > 40 linhas, aninhamento > 3, > 4 parâmetros, sem guard clause | mecânico — vem do validador da linguagem |
| 3 | **SRP** | uma unidade com mais de uma responsabilidade | nome com "And"/"E"; arquivo enorme; função que faz I/O e regra |
| 4 | **Encapsulamento** | um domínio alcança o **interno** de outro em vez do contrato dele | `import` de qualquer caminho interno da fatia alheia; import relativo saindo da própria; no template, o legítimo é HTTP por `core/gateways/` declarado em `consumes` (regras `import-lateral`, `gateway-http`, `gateway-declarado`) |
| 5 | **Infraestrutura acoplada** | o domínio conhece o fornecedor | SDK (`pg`, `@supabase/*`, `aws-sdk`) importado dentro da regra de negócio, sem porta |
| 6 | **Dados** | tabela sem dono declarado; leitura de dado alheio pelo banco | tabela sem prefixo de módulo; JOIN/FK cruzando domínios; schema `public` |
| 7 | **Contrato de API** | a superfície pública não é estável nem descritível | rota sem `/api/v1/`, verbo no path, recurso fora do plural kebab-case, payload fora de camelCase; registro cru na resposta |
| 8 | **Cobertura de testes** | não há rede para refatorar em cima | ausência de `tests/`; teste que exige rede/banco para rodar |
| 9 | **Validação/segurança** | input externo entra sem ser validado na borda | validação dentro da regra (ou ausente); SQL concatenado |
| 10 | **Logging** | evento não é observável, ou vaza | `print`/`console.log`; exceção engolida; segredo ou PII em log |
| 11 | **Tipagem** | a fronteira pública não tem contrato | assinatura pública sem tipo; `any` na borda |
| 12 | **Documentação de contrato** | quem consome precisa ler o código para saber o que entra e sai | superfície pública sem OpenAPI nem documento equivalente |

**A dimensão 5 é nova** e costuma ser a de maior risco no legado: ela é a diferença entre "trocar de banco é
editar uma linha de config" e "trocar de banco é um projeto".

## Regras e limites
- **NUNCA** modifique arquivos — esta skill é estritamente read-only; remediação é da `code-adequacao`.
- **NUNCA** reporte "zero violações" sem antes declarar a **topologia**: nenhum módulo encontrado quase sempre
  significa que a topologia é outra, não que o código está conforme. Verde por não ter procurado é o pior
  resultado possível deste diagnóstico.
- **NUNCA** duplique o gate num projeto que já o tem — consuma o `--json` dele e complemente só as lacunas.
- **NÃO** aplique o Nível 1 a repositório que não é sistema modular (script, lib, site): diga que não se
  aplica e diagnostique Nível 0 e 2.
- **NÃO** redefina o padrão — use `padrao-escrita` (N0) e `04-regras.md` (N1) como critério; em dúvida, leia-os.
- **NÃO** marque como violação o que é escolha idiomática válida da linguagem (ex.: snake_case interno em Python) — o padrão permite.
- **NÃO** entregue backlog sem priorização — risco e severidade são obrigatórios para a remediação ser segura.
- **NÃO** saia do escopo: ao decidir *como* corrigir, pare — isso é da `code-adequacao`; aqui só se diagnostica.

## Checklist "pronta"
- [ ] A **topologia** foi identificada e registrada no backlog?
- [ ] Se nenhum módulo foi encontrado, isso foi **explicado** (topologia `por-camadas` / monólito) e não
      reportado como conformidade?
- [ ] Topologia `template`: o gate rodou com `--json` e o diagnóstico cobriu **só** o que ele declara não cobrir?
- [ ] O alvo e seus módulos foram delimitados (módulo → arquivo)?
- [ ] Cada violação tem `arquivo:linha`, dimensão, severidade e risco?
- [ ] Cada módulo tem o campo `cobertura` (sem-testes/parcial/ok) preenchido?
- [ ] Todas as 12 dimensões foram consideradas (incl. infraestrutura acoplada, testes, logging, contrato)?
- [ ] O backlog está priorizado (quick wins de baixo risco primeiro)?
- [ ] O JSON segue o formato de `references/backlog-format.md`?
- [ ] Nenhum arquivo foi modificado?

## Referências (Camada 3 — leia sob demanda)
- `references/backlog-format.md` — esquema JSON do backlog + detalhe de detecção de cada dimensão.
- `references/decomposicao.md` — decomposição em `tarefas[]` + ondas + `risco` como roteador (o plano executável).
- `references/examples.md` — exemplo de diagnóstico bom (priorizado) × ruim (lista plana sem risco).
- `assets/auditoria.template.md` — template da consultoria de adequação (sumário, mapa, tarefas, ondas, recomendações).
