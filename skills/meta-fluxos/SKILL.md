---
name: meta-fluxos
description: Executa um fluxo da base Sarak pelo nome do command, lendo e seguindo commands/<nome>.md num harness que não carrega commands (Codex). Use quando o usuário pedir um fluxo por nome — /code1-auditar, /code2-caracterizar, /code3-adequar, /code-entregar, /cyber1-auditar, /cyber2-adequar, /git1-auditar, /git2-adequar, /deploy-vercel, /deploy-docker, /site-organizar, /site-seo ou /meta-criar-skill. NÃO acione proativamente.
---

# Skill: Fluxos (roteador de commands)

Torna os fluxos de `commands/` alcançáveis num harness que não os carrega: resolve o arquivo do command
pedido, lê o command inteiro e o segue **como escrito**. A orquestração vive no command; aqui só se roteia.

> **Fonte única = o command.** Esta skill não copia passo nenhum dele (README da base, §4.0 princípio 1).
> Um fluxo que muda, muda no próprio `commands/<nome>.md` — nunca aqui.

## Quando usar
- O usuário pede um fluxo pelo nome (`/code1-auditar`, "roda o cyber1-auditar", "faz o git2-adequar") e o
  harness **não** carrega `commands/` — no Codex o plugin expõe só skills e specs.
- Sob demanda: os fluxos são mutativos ou de varredura. Nunca por iniciativa própria.

## Workflow
Trate **um fluxo por vez**.

1. **Harness** — *julgamento, sem ferramenta.* Verifique se o harness carrega commands nativamente (o Claude
   Code carrega). **Critério:** se carrega, não use esta skill — diga ao usuário para digitar `/<nome>` e pare.
2. **Resolver o arquivo** — *listagem de arquivos.* O command fica em `commands/<nome>.md`, na **raiz do
   plugin**, ao lado de `skills/` — dois níveis acima do diretório desta skill. O caminho é pista resolvida a
   partir de onde a skill foi carregada, nunca prefixado com `skills/` nem placeholder literal (README da base, §4.0
   princípio 6). **Critério:** arquivo ausente → **liste** os `commands/*.md` existentes e pergunte qual.
   Não improvise um fluxo.
3. **Ler o command inteiro** — *leitura.* Frontmatter e corpo, até o fim, antes da primeira ação.
   **Critério:** você conhece os Portões de HITL, o `allowed-tools` e os agents citados antes de começar.
4. **Executar como escrito** — *as ferramentas que o command permite.* Só estas traduções, nenhuma outra:
   - `$1`/`$2`/`$ARGUMENTS` → os argumentos do pedido do usuário; vazio = o padrão que o command define.
   - `allowed-tools` do frontmatter → **limite**: o que não está listado não é usado. Vale em especial para
     "read-only" e "não modifique o código-fonte".
   - "via `Task`" / "dispare o agente `<papel>`" → um **subagente** do harness, instruído com o conteúdo de
     `agents/<papel>.md` (mesma raiz do plugin), com o `tools` desse agent como limite. Sem mecanismo de
     subagente: execute o papel **na thread principal, em sequência**, com os mesmos limites, e retenha só
     o resumo compacto que o agent devolveria.
   - `model:` → ignorado.
   - script de outra skill (`<skill>/scripts/<arquivo>`) → resolvido a partir de `skills/`, na mesma raiz.
5. **HITL** — *resposta ao usuário.* Em todo Portão / "⚠️ Confirma?" do command, apresente o que ele manda
   apresentar e **pare**. **Critério:** só siga com a aprovação explícita do usuário nesta conversa.

## Regras e limites
- **NÃO** copie passos de um command para esta skill — duas fontes divergem; a skill só roteia.
- **NUNCA** pule um Portão de HITL nem presuma aprovação — há fluxo que reescreve histórico (`git2-adequar`).
- **NÃO** amplie ferramentas além do `allowed-tools` do command ou do `tools` do agent — o limite é parte do
  contrato; sem ele, "read-only" deixa de ser verdade.
- **NUNCA** execute um command que não existe nem reconstrua um fluxo de memória — liste e pergunte.
- **NÃO** use esta skill onde commands carregam nativamente (Claude Code) — o `/<nome>` nativo é o caminho.

## Checklist
- [ ] Harness sem commands confirmado (senão, usuário mandado ao `/<nome>` nativo)?
- [ ] `commands/<nome>.md` resolvido a partir da raiz do plugin e lido inteiro antes de agir?
- [ ] Argumentos, `allowed-tools`, agents e scripts traduzidos como no passo 4 — e nada além?
- [ ] Todo Portão de HITL parou e esperou o usuário?
