---
name: code-limpeza-projeto
description: Higieniza um projeto para produção — remove arquivos órfãos, código morto, backups e deps não usadas, e sanitiza segredos, sempre com HITL e Grep antes de deletar (detector = scripts/detectar_lixo.py). Use APENAS quando pedirem limpeza/faxina de projeto. NÃO acione proativamente.
---

# Skill: Limpeza de Projeto (Pré-Produção)

> **Dependência:** Esta skill aplica as regras definidas em `padrao-escrita`. Consulte-as antes de iniciar.

Faz a **faxina técnica** de um repositório antes de entrega/deploy: remove o ruído de desenvolvimento
(arquivos órfãos, backups, temporários, código morto, deps não usadas) e sanitiza segredos expostos,
deixando a base **Production Ready**. É **mutativa e destrutiva** → toda remoção passa por HITL e por um
`Grep` que prova que o alvo não tem referência viva.

> Higiene de repositório ≠ conformidade ao padrão. Adequar código ao padrão Sarak é da `code-adequacao`;
> diagnosticar violações é da `code-diagnostico`. Aqui só se **remove lixo** — não se refatora nem se
> corrige bug. Princípios globais em `CLAUDE.md`; padrão de escrita em `padrao-escrita`.

## Quando usar
- Sob demanda, antes de um merge para `main`, publicação ou deploy; ao fechar uma grande refatoração.
- Para auditoria periódica de segredos e peso do repositório.
- **Nunca durante** uma refatoração ativa — a limpeza é uma etapa isolada e atômica ("só deletar").
- Mutativa → passo HITL obrigatório por fase antes de qualquer remoção.

## Workflow
Três fases em ordem; **nada é removido sem o HITL da fase**. Detalhe em `references/workflow.md`.

1. **Levantamento determinístico** — rode `python scripts/detectar_lixo.py --raiz <projeto>` (saída JSON: arquivos de lixo, marcadores `TODO`/`console.log`, arquivos grandes). É o ponto de partida factual.
2. **Fase 1 — estrutural/espacial** — audite os maiores arquivos (`Bash` `ls -lhS` ou equivalente), localize pastas órfãs/backup (`old/`, `backup/`, `legacy/`) e temporários (`*.log`, `temp/`) com `Glob`, e prepare a atualização do `.gitignore`. **HITL:** Top-10 + órfãos + proposta de ignore → "⚠️ Confirma a remoção estrutural?".
3. **Fase 2 — analítica/segurança** — rode o linter/`depcheck` se houver (imports e deps mortas); busque segredos com `Grep` (`API_KEY`, `SECRET`, `PASSWORD`, `DATABASE_URL`, `.env`/`.pem` commitados); remova código comentado sem nota. **HITL:** segredos (mascarados) + deps a remover + código morto → "⚠️ Confirma a sanitização?".
4. **Fase 3 — verificação** — rode o build (`npm run build`/`go build`/etc.) e a suíte de testes para garantir que nada essencial saiu. **Vermelho = reverta** a remoção correspondente.
5. **Reportar** — liste todas as remoções (auditoria) no formato de `assets/checklist_limpeza.md`; segredos sempre mascarados.

## Regras e limites
- **NUNCA** delete sem `Grep` provando ausência de referência viva — uma única referência em produção proíbe a remoção.
- **NUNCA** escreva um segredo por extenso em log/relatório — mascare (`AKIA...XXXX`) e informe só arquivo + natureza.
- **NÃO** delete arquivos de infraestrutura (`.gitignore`, `docker-compose.yml`, `package.json`, `requirements.txt`) nem pastas críticas (`.git`, `.github`, `.vscode`, `.agents`) — audite o conteúdo, preserve o arquivo.
- **NÃO** remova dependência sem rodar o build logo após (detecção de uso dinâmico pode falhar).
- **NÃO** misture limpeza com correção de bug ou nova feature — registre o bug e mantenha a limpeza atômica.
- **NÃO** prossiga sem o HITL de cada fase — toda remoção precisa de confirmação explícita.
- **NÃO** saia do escopo: adequar ao padrão é da `code-adequacao`; diagnosticar é da `code-diagnostico`.

## Checklist "pronta"
- [ ] `detectar_lixo.py` rodado e a saída triada (lixo, marcadores, grandes)?
- [ ] Top-10 maiores auditados; órfãos/backups/temporários removidos só após HITL?
- [ ] `.gitignore` atualizado para cobrir os padrões de lixo encontrados?
- [ ] Segredos identificados e sanitizados (mascarados no relatório; movidos p/ `.env`)?
- [ ] Deps não usadas removidas **e** build verde logo após?
- [ ] Código morto/imports/comentários sem nota removidos só com `Grep` confirmando órfãos?
- [ ] Build e suíte de testes verdes ao final?
- [ ] Lista de todas as remoções documentada (auditoria)?

## Referências (Camada 3 — leia sob demanda)
- `references/workflow.md` — as 3 fases detalhadas, passo a passo, com os HITL.
- `scripts/detectar_lixo.py` + `scripts/config.json` — detector determinístico (padrões/limites no config, zero hardcoded).
- `assets/checklist_limpeza.md` — template do relatório/auditoria de limpeza.
