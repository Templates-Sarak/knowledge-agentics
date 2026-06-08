---
name: code-diagnostico
description: Diagnostica código legado contra o padrao-escrita (read-only) — varre um repo/módulo, classifica violações e gera um backlog priorizado em JSON. Use ao avaliar conformidade de código existente ou planejar uma adequação. NÃO modifica nada.
---

# Skill: Diagnóstico de Conformidade

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Varre código existente e mede a distância dele para o padrão Sarak, produzindo um **backlog priorizado**
de violações. É **somente leitura** — não corrige nada (isso é da `code-adequacao`). Serve sozinha
("quero saber o estado do código") ou como etapa de planejamento de uma adequação.

> O padrão de referência vive em `padrao-escrita` (`SKILL.md` + `references/PADRAO-ORGANIZACAO.md`)
> e nos inegociáveis do `CLAUDE.md`. Esta skill **aplica** esse padrão como critério — não o redefine.

## Quando usar
- Sob demanda, para avaliar a conformidade de um repo/módulo legado.
- Como passo de planejamento antes de uma adequação (gera o backlog que a remediação consome).
- Não é mutativa e não pede HITL (não altera arquivos).

## Workflow
Trate **um alvo por vez** (um repo ou um módulo).

1. **Delimitar o alvo** — identifique a raiz e os módulos (`backend/<m>`, `frontend/<m>`). Liste os arquivos de cada módulo.
2. **Varrer por dimensão** — para cada arquivo, classifique violações nas dimensões abaixo. Registre `arquivo:linha`, dimensão, severidade e risco de refatoração. **Use o validador da linguagem como motor das dimensões mecânicas** (limiares, logging, tipagem, segredos, hardcoded) e consuma o JSON; complemente à mão só o que exige julgamento. Validadores: Python → `padrao-python/scripts/validate.py`; TS/JS → `padrao-typescript/scripts/validate.mjs`.
3. **Avaliar cobertura de testes** — por módulo, verifique se há `tests/` cobrindo o comportamento; marque `cobertura: sem-testes | parcial | ok`. Sem testes eleva o risco de qualquer refatoração do módulo.
4. **Agrupar por módulo → arquivo** — consolide as violações na hierarquia módulo → arquivo → violações.
5. **Priorizar** — ordene o backlog por (risco asc, severidade desc): **quick wins primeiro** (segredos/hardcoded — alto valor, baixo risco), depois limiares/SRP, por último desacoplamento estrutural (alto risco).
6. **Emitir o backlog em JSON** — no formato de `references/backlog-format.md`. Para alimentar a adequação, **decomponha em `tarefas[]`** (átomo + ondas + `risco`-roteador em `references/decomposicao.md`). Esse JSON é o que a `code-adequacao`/orquestração consome.
7. **Resumir** — apresente um sumário legível (X módulos, N violações por dimensão, cobertura, top prioridades). Para uma **consultoria completa**, preencha `assets/auditoria.template.md`.

> **Em escala:** a varredura de um repo inteiro é orquestrada pelo command `/code1-auditar` (fan-out: um agente
> `code-auditor` por módulo, persistindo em `.sarak/audit/`). Esta skill é a **lógica e o formato** que eles aplicam.

> Detalhe de cada dimensão (o que detectar + como reconhecer) em `references/backlog-format.md`.

## Dimensões avaliadas (critério = padrao-escrita)
- **Segredos/hardcoded** — literais de config/segredo no código (deveriam estar em `config.json`/`.env`).
- **Limiares de clean code** — função > 40 linhas, aninhamento > 3, > 4 parâmetros, ausência de guard clauses.
- **SRP** — módulo/arquivo/função com mais de uma responsabilidade (nomes com "And", arquivos enormes).
- **Encapsulamento/acoplamento** — import de `domain/`/`data/` de outro módulo (deveria ser via `api/`).
- **Dados** — tabelas sem prefixo de módulo; JOIN/consulta cross-módulo.
- **Contrato de API** — rotas sem `/api/v1/`, com verbo no path, fora do plural kebab-case; payload fora de camelCase.
- **Cobertura de testes** — presença/ausência de testes por módulo/arquivo; marca módulos **sem testes** (alimenta o risco e a `code-adequacao`).
- **Validação/segurança** — input externo não validado na borda `api/`; SQL concatenado (não parametrizado).
- **Logging** — uso de `print`/`console.log` em vez de logger; exceção engolida; segredo em log.
- **Tipagem** — assinatura pública (`api/`/contrato) sem tipos.
- **Documentação de contrato** — `api/` do módulo sem documentação.

## Regras e limites
- **NUNCA** modifique arquivos — esta skill é estritamente read-only; remediação é da `code-adequacao`.
- **NÃO** redefina o padrão — use `padrao-escrita` como critério; em dúvida, leia-o, não improvise regra.
- **NÃO** marque como violação o que é escolha idiomática válida da linguagem (ex.: snake_case interno em Python) — o padrão permite.
- **NÃO** entregue backlog sem priorização — risco e severidade são obrigatórios para a remediação ser segura.
- **NÃO** saia do escopo: ao decidir *como* corrigir, pare — isso é da `code-adequacao`; aqui só se diagnostica.

## Checklist "pronta"
- [ ] O alvo e seus módulos foram delimitados (módulo → arquivo)?
- [ ] Cada violação tem `arquivo:linha`, dimensão, severidade e risco?
- [ ] Cada módulo tem o campo `cobertura` (sem-testes/parcial/ok) preenchido?
- [ ] Todas as 11 dimensões foram consideradas (incl. testes, validação, logging, tipagem, contrato)?
- [ ] O backlog está priorizado (quick wins de baixo risco primeiro)?
- [ ] O JSON segue o formato de `references/backlog-format.md`?
- [ ] Nenhum arquivo foi modificado?

## Referências (Camada 3 — leia sob demanda)
- `references/backlog-format.md` — esquema JSON do backlog + detalhe de detecção de cada dimensão.
- `references/decomposicao.md` — decomposição em `tarefas[]` + ondas + `risco` como roteador (o plano executável).
- `references/examples.md` — exemplo de diagnóstico bom (priorizado) × ruim (lista plana sem risco).
- `assets/auditoria.template.md` — template da consultoria de adequação (sumário, mapa, tarefas, ondas, recomendações).
