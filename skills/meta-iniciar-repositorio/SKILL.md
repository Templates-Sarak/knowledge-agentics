---
name: meta-iniciar-repositorio
description: Inicialização completa de um repositório Sarak — git, projeto modular (template de módulos), specs do fluxo SDD, primeiros módulos, .agents/ e hook de pre-commit, com gate verde ao final. Use APENAS quando pedirem para iniciar/preparar um repositório para o ecossistema Sarak. NÃO acione proativamente.
---

# Skill: Iniciar Repositório

Leva um diretório vazio (ou um repositório existente) a **Sarak-ready completo**: versionado, com a
arquitetura de módulos instalada, o fluxo SDD montado, os primeiros módulos criados e o gate verde.

> **Fonte normativa da arquitetura:** `specs/_estrutura_modulos/doutrina/04-regras.md` — que este fluxo
> instala no projeto como `specs/arquitetura/04-regras.md`. **Não duplique regra aqui.**
> A criação de módulo em si é da skill **`code-modulo`**; esta orquestra o repositório inteiro.

## Quando usar
- Ao iniciar um repositório, instalar o Sarak num cliente, ou preparar um projeto para IA.
- **Mutativa** (cria dezenas de arquivos e roda `git init`) → **HITL obrigatório** antes de executar.

## O que o fluxo monta, na ordem

```
1. git init                     (se não houver .git)
2. projeto modular              ferramentas/ · packages/portas · adapters/memoria · src/composicao
                                · modulos/_template · specs/arquitetura/ (as 5 leis)
                                · specs/adr/000-decisoes-do-template.md
3. specs/ do fluxo SDD          00-contexto · 00-indice · 00-knowledge · prompts · _templates · plan/
4. base da linguagem            specs/arquitetura/00-base-<binding>.md
5. primeiros módulos            um por vez; o `conector` por último
6. .agents/ + hook pre-commit   gate de segredos + auto-índice
7. gate --todos                 não encerra vermelho
```

**A doutrina não vira árvore paralela.** Ela é a spec de arquitetura do projeto e cai dentro de `specs/`.
Se você vir uma pasta `doutrina/` na raiz do alvo, algo rodou errado.

## Workflow

### 1. Entrevista (HITL) — pergunte só o que não dá para inferir

| Pergunta | Observação |
|---|---|
| Caminho absoluto do repositório-alvo | confirme que não é raiz de sistema nem pasta suspeita |
| Nome oficial do sistema | se houver git com remoto, proponha o nome do repo e peça só confirmação |
| **Binding**: `typescript` \| `javascript` \| `python` | **não há binding para Go/Java** — ver Limites |
| Escopo dos packages (`@acme`) | derive do nome do sistema e confirme |
| Primeiros módulos e o papel de cada um | mínimo um `dominio`; `conector` se houver mais de um módulo com tela |
| Apontamento de horas via MCP? | se sim, provedor (`clockify` \| `toggl`) |

**Sem binding** (repositório que não é um sistema modular — um site, uma lib, uma base de conhecimento):
rode sem `--binding`. O script instala só `specs/` e `.agents/`, e o Nível 1 não se aplica.

### 2. Projeto de horas (se aplicável)
Acione o MCP correspondente (`clockify-sarak` / `toggl-sarak`) com `create_project`, `name` = nome do
sistema. Guarde o `project_id` retornado.

### 3. HITL — plano
Apresente: alvo, binding, escopo, módulos com papel, **o que será criado** e **o que não será tocado**.
→ "⚠️ Confirma a inicialização de `<alvo>`?" **Aguarde.**

### 4. Executar
```bash
python skills/meta-iniciar-repositorio/scripts/init_repo.py \
  --target "<caminho-alvo>" --name "<nome>" \
  --binding <typescript|javascript|python> --escopo <escopo> \
  --modulos <id> [<id>...] --git-init \
  [--time-provider <p> --time-project-id <id>]
```

**Se o script abortar por colisão** (`o destino ja tem package.json, ...`): **pare e pergunte**. `--forcar`
sobrescreve o manifesto de pacote do projeto — o `.gitignore` é mesclado, mas o `package.json` **não**.
Essa decisão é do usuário, nunca sua.

### 5. Verificar
O próprio script roda `validar.mjs --todos` ao final. Rode também o comando composto do binding
(`npm run verificar` ou `python verificar.py`) e **leia a saída**. Gate vermelho → corrija antes de entregar.

### 6. Handoff
1. Explique que o `pre-commit` mantém o índice de `.agents/` e barra segredo no staged.
2. Aponte os pendentes de HITL: `.env` da raiz, `specs/00-contexto.md`, ADRs do projeto.
3. Engate o fluxo seguinte: **`spec-fundacao`** (entrevista dos ADRs) e, para módulos adicionais,
   **`code-modulo`**. O primeiro commit e o remoto são da **`git-commit-inicial`**.

## Regras e limites
- **NUNCA** rode o script num diretório não confirmado pelo usuário (raiz do SO, `~`, pasta de outro projeto).
- **NUNCA** exclua arquivo pré-existente. O script só acrescenta ou mescla — e aborta quando não consegue.
- **NUNCA** use `--forcar` sem autorização explícita: ele sobrescreve `package.json`/`pyproject.toml`.
- **NUNCA** commite nem crie remoto por conta própria — é irreversível e externo. Isso é `git-commit-inicial`.
- **NÃO** aceite `go` ou `java` como binding: **não existe molde de módulo** para eles — nem doutrina, nem
  gate, nem camada de escrita. Sistema modular nasce em `typescript`, `javascript` ou `python`.
- **NÃO** crie módulo copiando pasta à mão — sempre pelo `criar-modulo` (é o que o script faz).
- **NÃO encerre com o gate vermelho.**

## Checklist "pronta"
- [ ] Alvo confirmado pelo usuário, com caminho absoluto?
- [ ] HITL com plano explícito antes de qualquer arquivo criado?
- [ ] Binding dentro do vocabulário (`typescript` \| `javascript` \| `python`), ou modo sem-binding assumido?
- [ ] Nenhuma colisão sobrescrita sem autorização?
- [ ] `specs/arquitetura/` com as 5 leis + a base da linguagem, e **nenhuma** pasta `doutrina/` na raiz?
- [ ] `specs/adr/000-decisoes-do-template.md` presente?
- [ ] Módulos criados, cada um com manifesto e contrato?
- [ ] `.agents/` com `gerar_indice.py`, e `core.hooksPath` apontando para `.githooks`?
- [ ] `validar.mjs --todos` verde?
- [ ] Pendências de HITL comunicadas (`.env`, `00-contexto.md`, ADRs, primeiro commit)?
