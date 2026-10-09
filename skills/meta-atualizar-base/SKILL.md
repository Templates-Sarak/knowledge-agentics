---
name: meta-atualizar-base
description: Atualiza a Fonte da Verdade do ecossistema Sarak (Git) e propaga as alterações aos três provedores (Claude Code, Codex e Antigravity) — roda o sincronizador global de IDEs e orienta a atualização do plugin no Codex. Use APENAS quando pedirem para atualizar a base, sincronizar os agentes/skills, ou espalhar uma mudança recente. NÃO acione proativamente.
---

# Skill: Atualizar Base (Sincronização Global)

Esta skill orquestra a distribuição de novas features, correções ou ajustes de estrutura (novas skills, comandos ou agentes) para o repositório mestre e, em seguida, injeta-os nos "cérebros" locais dos provedores (Claude Code, Codex e Antigravity).

> **Dependência:** Esta skill depende estritamente da integridade estrutural verificada pela skill irmã `meta-verificacao-base`.

## Quando usar
- O usuário acabou de criar uma nova skill ou subagente e quer publicá-lo para uso imediato.
- O usuário pediu para "sincronizar", "atualizar o cérebro", "espalhar as mudanças" ou "fazer deploy das skills".
- Use APENAS quando o usuário solicitar explicitamente. NÃO acione proativamente.

## Workflow

1. **Gate: Integridade do Ecossistema**
   - **Ferramenta:** terminal
   - **Ação:** No diretório raiz do `knowledge-agentics`, valide que tudo foi criado dentro do padrão rodando a auditoria da skill irmã:
     ```bash
     python skills/meta-verificacao-base/scripts/audit_base.py --raiz .
     ```
   - **Critério:** Se o script apontar **qualquer** erro estrutural (YAML, vazamentos, contratos quebrados), **PARE/ABORTE** o processo imediatamente e notifique o usuário para correção. Nunca propague uma base quebrada.

2. **Sincronização Local (IDEs)**
   - **Ferramenta:** terminal
   - **Ação:** Na raiz do repositório, dispare o roteador global:
     ```bash
     python plugin/sync_ide.py --target all
     ```
   - **Critério:** O log deve confirmar a cópia para `plugins/sarak` (Antigravity) e a geração de
     `plugin/sarak_routing_table.md` — **o único artefato que o `sync_ide.py` gera**.

3. **Codex**
   - **Ferramenta:** Texto (instrução ao usuário — HITL; o agente não opera o app)
   - **Ação:** O Codex **não** é alcançado pelo `sync_ide.py`: ele lê o plugin `sarak` **instalado pelo app**.
     Instrua o usuário a atualizar o plugin no app e abrir uma conversa nova.
   - **Critério:** Se a instalação vem de um repositório remoto, a mudança precisa estar **no remoto antes**
     da atualização — senão o app reinstala a versão antiga. Se `hooks/hooks.json` mudou, a instrução inclui
     **confiar nos hooks de novo** no app: sem isso, nenhum hook roda. O passo termina na instrução ao usuário.

4. **Gate de Roteamento**
   - **Ferramenta:** Texto (Resposta ao usuário)
   - **Ação:** Mostre ao usuário o caminho **absoluto** de `plugin/sarak_routing_table.md`, instruindo-o a
     atualizar as Regras Globais dos LLMs caso haja comandos (`/`) novos na versão recém atualizada.
   - **A frase colada nas IDEs guarda o caminho ABSOLUTO da base.** Se a base tiver mudado de lugar, o
     `sync_ide.py` regenera a tabela mas a frase continua apontando para o endereço antigo, e **nada
     detecta isso** — o agente simplesmente segue sem roteamento. Nesse caso, mande recolar a frase.
     Contexto e motivo: `plugin/README.md`.

## Regras
- **NÃO** modifique regras ou lógica interna das IDEs nesta skill, a responsabilidade é apenas garantir que o pipeline de sincronização rode.

## Checklist
- [ ] Sincronizador `sync_ide.py` executado sem erros?
- [ ] Usuário instruído a atualizar o plugin no Codex (com o remoto já atualizado, se a instalação vem dele) e a confiar nos hooks de novo se `hooks/hooks.json` mudou?
- [ ] Caminho absoluto de `plugin/sarak_routing_table.md` disponibilizado ao usuário na resposta final?
