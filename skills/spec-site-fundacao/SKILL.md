---
name: spec-site-fundacao
description: Entrevista HITL que define o alicerce de um projeto de Site (institucional/marketing) e instala a estrutura base de specs. Use ao iniciar um site novo, ou quando pedirem a fundação de um projeto de site. NÃO acione proativamente.
---

# Skill: Fundação de Site (Wizard)

Entrevistador focado em extrair as definições iniciais de um site e materializá-las instalando a
estrutura `_estrutura_base_site` no projeto-alvo.

## Quando usar

- Ao iniciar o projeto de um site.
- Sob demanda, quando o usuário quiser "definir a base do site", "iniciar a documentação do site"
  ou "criar as fundações do site".

## Workflow

1. **Entrevista estruturada (HITL obrigatório)**
   - **Ferramenta:** Diálogo (chat).
   - **Ação:** PARE a execução e faça exatamente as perguntas abaixo, num único bloco amigável.
     Não gere nenhum documento antes que o usuário responda:
     1. **Stack tecnológica:** qual a stack base do site (HTML/CSS, React/Next.js, Tailwind etc.) e provedor de hospedagem?
     2. **Identidade e design:** qual a paleta de cores principal, tipografia e estilo geral do site (sério, moderno, minimalista)?
     3. **Tom de voz e copy:** qual a principal mensagem que o site deve passar e qual o tom de voz (formal, descontraído, persuasivo)?
     4. **Dados SEO/institucionais:** qual o nome da marca, palavras-chave principais e dados de contato (NAP)?
     5. **Estrutura de páginas:** além de Home e Contato, quais páginas principais (Sobre, Serviços, Blog)?
     6. **Orquestração de navegação:** o site precisará de rotas complexas, sub-abas ou suporte a múltiplos idiomas (i18n)?
     7. **Orquestração de descoberta:** o site depende de tráfego orgânico (Google), busca local (GEO) ou otimização para IA (AEO)?
     8. **Orquestração de detalhamento:** o usuário quer detalhar toda a arquitetura de pastas (ex.: DDD), UI e infraestrutura técnica agora mesmo?
2. **Orquestrar especialistas (roteamento dinâmico)**
   - **Ação:** Com base nas respostas das perguntas 6, 7 e 8, invoque ou recomende imediatamente:
     - Sim na P6 (navegação/i18n) → acione `/site-organizacao` para o mapa de rotas.
     - Sim na P7 (tráfego/SEO/IA) → acione `/site-seo` para a estratégia técnica de descobrimento.
     - Sim na P8 (detalhamento arquitetural) → acione `/site-criacao` para aprofundar as decisões estruturais.
3. **Copiar a estrutura base**
   - **Ação:** Copie a estrutura **inteira** de `_estrutura_base_site` para `specs/` do
     projeto-alvo, **preservando a hierarquia exatamente como está na origem**. Nada é renomeado,
     movido nem descartado — a estrutura é o contrato do ciclo SDD. Um `copytree` recursivo
     resolve; copiando arquivo a arquivo, siga a tabela:

     | Origem (`_estrutura_base_site/`) | Destino (no projeto) | O que é |
     |---|---|---|
     | `00-contexto.md`, `00-indice.md`, `00-knowledge.md`, `00-prompt-revisor.md`, `00-prompt-executor.md` | `specs/00-*.md` | **Specs de processo — obrigatórias.** É por elas que qualquer agente se contextualiza |
     | `README.md`, `INDEX.md` | `specs/` | Manual e bússola do diretório |
     | `arquitetura/01`…`06` | `specs/arquitetura/` | Stack, identidade visual, tom de voz, SEO/NAP, a11y/performance, estrutura de código |
     | `specs/06`…`10` | **`specs/specs/`** | Layout global, Home, páginas internas, formulários, páginas legais |
     | `_templates/*.md` | `specs/_templates/` | Moldes, incluindo `template-plan.md` |
     | `adr/` (vazia) | `specs/adr/` | ADRs — decisões imutáveis |
     | `plan/` (vazia) | `specs/plan/` | **Fila de execução** — abriga toda plan (`plan-NN-<slug>.md`) do nascimento ao expurgo. Sem subpasta |

     > ⚠️ **As specs `06`–`10` vão para `specs/specs/`, NUNCA para `specs/plan/`.** A pasta `plan/`
     > é a fila de execução do ciclo SDD e só recebe arquivos `plan-NN-<slug>.md` escritos pelo
     > agente revisor. Despejar spec de conteúdo ali corrompe o índice de execução.
4. **Preencher os arquivos iniciais**
   - **Ferramenta:** `Write`.
   - **Ação:** Preencha, com as respostas da entrevista, **apenas as specs fixas** — as 6 de
     `specs/arquitetura/` e as 5 de `specs/specs/`. Adapte os moldes aos requisitos reais.
   - **Ação:** No `specs/00-contexto.md`, preencha **somente** a §1 (Identidade do site) e a §3
     (Stack e arquitetura em uma página) a partir das mesmas respostas. Mantenha intactos os
     blocos `> **Como escrever:**` e os demais `<!-- PREENCHER -->` — eles são o contrato de
     manutenção da spec, completado depois pelo agente revisor.
   - **NÃO** altere `00-indice.md`, `00-knowledge.md`, `00-prompt-revisor.md` nem
     `00-prompt-executor.md`: são **universais**, idênticas em todos os projetos.
5. **Entrega**
   - Informe ao usuário que a fundação do site foi documentada: specs fixas populadas
     (`arquitetura/` + `specs/`), specs de processo instaladas (`00-*`) e o ciclo SDD pronto
     (`plan/` vazia, aguardando a primeira plan).
   - Indique os próximos passos: `site-criacao` para aprofundar o detalhamento, e uma **primeira
     plan** do agente revisor para completar o `00-contexto.md` (§2 específicas, §7 fronteiras, §8 estado).

## Regras e limites

- **NÃO** adivinhe as informações de marca e identidade — o HITL (as perguntas do passo 1) é inegociável.
- **NÃO** grave arquivo markdown fora da estrutura de seções proposta pelos originais de `_estrutura_base_site`.
- **NÃO** crie nenhum arquivo em `specs/plan/`. A pasta nasce **vazia**: só o agente revisor escreve
  plans, e só no formato `plan-NN-<slug>.md`.
- **NÃO** omita as specs de processo (`00-*`). Sem elas o projeto nasce sem o ciclo SDD e nenhum
  agente consegue se contextualizar.
- **NÃO** commite. Entregue os arquivos no worktree — quem commita é o usuário.

## Checklist "pronta"

- [ ] As 8 perguntas do passo 1 foram feitas e respondidas antes de qualquer arquivo ser gerado?
- [ ] Especialistas (site-organizacao/site-seo/site-criacao) invocados ou recomendados conforme as respostas 6-8?
- [ ] `_estrutura_base_site` copiada inteira para `specs/`, com a hierarquia preservada — specs `06`-`10` em `specs/specs/`, nunca em `specs/plan/`?
- [ ] Specs fixas (`arquitetura/` 01-06 + `specs/` 06-10) preenchidas com as respostas da entrevista?
- [ ] `00-contexto.md` só com §1 e §3 preenchidas; blocos `<!-- PREENCHER -->` e `> **Como escrever:**` intactos?
- [ ] `00-indice.md`, `00-knowledge.md`, `00-prompt-revisor.md`, `00-prompt-executor.md` intocados?
- [ ] `specs/plan/` permanece vazia?
- [ ] Nada commitado — entregue apenas no worktree?
