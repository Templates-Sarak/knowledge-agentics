---
name: meta-atualizar-base
description: Atualiza a Fonte da Verdade do ecossistema Sarak (Git) e roda o sincronizador global de IDEs para espelhar as alterações para os terminais (Antigravity e Claude). Use APENAS quando pedirem para atualizar a base, sincronizar os agentes/skills, ou espalhar uma mudança recente. NÃO acione proativamente.
---

# Skill: Atualizar Base (Sincronização Global)

Esta skill orquestra a distribuição de novas features, correções ou ajustes de estrutura (novas skills, comandos ou agentes) para o repositório mestre e, em seguida, injeta-os nos "cérebros" locais dos provedores (Antigravity e Claude Code).

> **Dependência:** Esta skill depende estritamente da integridade estrutural verificada pela skill irmã `meta-verificacao-base`.

## Quando usar
- O usuário acabou de criar uma nova skill ou subagente e quer publicá-lo para uso imediato.
- O usuário pediu para "sincronizar", "atualizar o cérebro", "espalhar as mudanças" ou "fazer deploy das skills".
- Use APENAS quando o usuário solicitar explicitamente. NÃO acione proativamente.

## Workflow

1. **Gate: Integridade do Ecossistema**
   - **Ferramenta:** `run_command`
   - **Ação:** No diretório raiz do `X-Skills`, valide que tudo foi criado dentro do padrão rodando a auditoria da skill irmã:
     ```bash
     python skills/meta-verificacao-base/scripts/audit_base.py
     ```
   - **Critério:** Se o script apontar **qualquer** erro estrutural (YAML, vazamentos, contratos quebrados), **PARE/ABORTE** o processo imediatamente e notifique o usuário para correção. Nunca propague uma base quebrada.

2. **Sincronização Local (IDEs)**
   - **Ferramenta:** `run_command`
   - **Ação:** Na raiz do repositório, dispare o roteador global:
     ```bash
     python plugin/sync_ide.py --target all
     ```
   - **Critério:** O log deve confirmar cópia para `plugins/sarak` (Antigravity) e a geração de `antigravity_rules.txt` e `claude_instructions.txt`.

3. **Gate de Roteamento**
   - **Ferramenta:** Texto (Resposta ao usuário)
   - **Ação:** Mostre ao usuário o link/caminho absoluto dos arquivos gerados (`plugin/antigravity_rules.txt` e `plugin/claude_instructions.txt`), instruindo-o a atualizar as regras globais dos LLMs caso haja comandos (`/`) novos na versão recém atualizada.

## Regras
- **NÃO** modifique regras ou lógica interna das IDEs nesta skill, a responsabilidade é apenas garantir que o pipeline de sincronização rode.

## Checklist
- [ ] Sincronizador `sync_ide.py` executado sem erros?
- [ ] Instruções de rotas (`.txt`) disponibilizadas ao usuário na resposta final?
