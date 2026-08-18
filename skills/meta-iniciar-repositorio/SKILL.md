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
2. projeto modular              tools/ · packages/ports · adapters/memory · src/composicao
                                · modules/_template · specs/arquitetura/ (as 5 leis)
                                · specs/adr/000-decisoes-do-template.md
3. specs/ do fluxo SDD          00-contexto · 00-indice · 00-knowledge · prompts · _templates · plan/
4. base da linguagem            specs/arquitetura/00-base-<binding>.md
5. primeiros módulos            um por vez; o `conector` por último
6. .agents/ + hooks de git      gate de segredos + auto-índice (script), COMPOSTO com o
                                pre-commit/pre-push do template de módulos (§1 do gate) — nunca um
                                substituindo o outro
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
| Primeiros módulos e o papel de cada um | mínimo um `domain`; um `connector` se houver mais de um módulo com tela — id sugerido: `hub` |

**Sem binding** (repositório que não é um sistema modular — um site, uma lib, uma base de conhecimento):
rode sem `--binding`. O script instala só `specs/` e `.agents/`, e o Nível 1 não se aplica.

### 2. HITL — plano
Apresente: alvo, binding, escopo, módulos com papel, **o que será criado** e **o que não será tocado**.
→ "⚠️ Confirma a inicialização de `<alvo>`?" **Aguarde.**

### 3. Executar
```bash
python skills/meta-iniciar-repositorio/scripts/init_repo.py \
  --target "<caminho-alvo>" --name "<nome>" \
  --binding <typescript|javascript|python> --escopo <escopo> \
  --modulos <id>:<role>[:artefato] [<id>:<role>[:artefato]...] --git-init
```

Cada módulo é `<id>:<role>[:artefato]` — o sufixo de papel é **obrigatório**
(`role` em `domain`\|`gateway`\|`connector`, o vocabulário do próprio manifesto). Sem ele, o script
recusa com a forma correta na mensagem, nunca adivinha pelo nome. `:artefato` só é aceito para
`domain` — `gateway`/`connector` nunca geram artefato, por arquitetura. Se o sistema tiver um módulo
agregador (menu + `/resumo` cross-módulo), o id sugerido é `hub`: `catalogo:domain hub:connector`.

O script **cria o diretório-alvo** se ele ainda não existir — não precisa de
`mkdir` manual antes. Ele mesmo recusa (`[ERRO] Alvo recusado`) raiz do sistema de arquivos e a pasta
HOME, como backstop do que a entrevista já confirmou — mas essa checagem mecânica nunca substitui a
confirmação HITL do passo 1, que continua obrigatória.

**Se o script abortar por colisão** (`o destino ja tem package.json, ...`): **pare e pergunte**. `--forcar`
sobrescreve o manifesto de pacote do projeto — o `.gitignore` é mesclado, mas o `package.json` **não**.
Essa decisão é do usuário, nunca sua.

### 4. Verificar
O próprio script roda `validate.mjs --todos` ao final. Rode também o comando composto do binding
(`npm run verify` ou `python verificar.py`) e **leia a saída**. Gate vermelho → corrija antes de entregar.

Confira também que o `.githooks/pre-commit` saiu **composto**, não sobrescrito — o passo 6 do script
(`instalar_hooks_git`) já compõe sozinho via `compor_pre_commit` (núcleo puro, provado por
`python init_repo.py --autoteste`), então isto é conferência, não ação manual:

```bash
grep -c "^node tools/verify-commit.mjs" <alvo>/.githooks/pre-commit             # == 1: gate de conformidade do template
grep -c "^\"\$PY\" .githooks/verificar_commit.py" <alvo>/.githooks/pre-commit   # == 1: gate de segredos
```

Ancorado na **invocação**, não em qualquer menção ao nome do arquivo — o hook também comenta
`tools/verify-commit.mjs` em prosa, e um `grep` sem âncora conta o comentário junto. Os dois
têm de dar exatamente 1 — zero é hook não composto; mais de 1 é hook duplicado (composição rodou mais
de uma vez sobre o mesmo arquivo).

### 5. Handoff

**Se rodou com `--binding`** (projeto modular): o passo 2 já instalou o `.githooks/pre-commit` e o
`.githooks/pre-push` do TEMPLATE (a fiação das três camadas, `specs/arquitetura/03-operacao.md` §7.1), e
o passo 6 do script (`instalar_hooks_git`) já os **compôs** com o próprio (gate de segredos + auto-índice
de `.agents/`) via `compor_pre_commit` — segredo primeiro (fail-closed), conformidade depois, idempotente.
Nenhuma ação manual aqui: o passo 5 já confirmou as duas marcas presentes.

**Sem `--binding`**: o passo 2 nunca rodou, não há hook de template para compor, e o `.githooks/pre-commit`
que o script escreve já é o final — nada a fazer aqui.

1. Explique que o `pre-commit` mantém o índice de `.agents/`, barra segredo no staged e — em projeto
   modular — roda o gate nos módulos afetados; o `pre-push` (só em projeto modular) roda tipos e testes.
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
- **NÃO** crie módulo copiando pasta à mão — sempre pelo `create-module.mjs` (é o que o script faz).
- **NÃO encerre com o gate vermelho.**

## Checklist "pronta"
- [ ] Alvo confirmado pelo usuário, com caminho absoluto?
- [ ] HITL com plano explícito antes de qualquer arquivo criado?
- [ ] Binding dentro do vocabulário (`typescript` \| `javascript` \| `python`), ou modo sem-binding assumido?
- [ ] Nenhuma colisão sobrescrita sem autorização?
- [ ] `specs/arquitetura/` com as 5 leis + a base da linguagem, e **nenhuma** pasta `doutrina/` na raiz?
- [ ] `specs/adr/000-decisoes-do-template.md` presente?
- [ ] Módulos criados, cada um com manifesto e contrato?
- [ ] `.agents/` com `gerar_indice.py`, `core.hooksPath` apontando para `.githooks`, e — em projeto
      modular — `.githooks/pre-commit` com o gate de segredos **e** `verify-commit.mjs` do template
      compostos (nunca um sobrescrevendo o outro), `.githooks/pre-push` intacto?
- [ ] `validate.mjs --todos` verde?
- [ ] Pendências de HITL comunicadas (`.env`, `00-contexto.md`, ADRs, primeiro commit)?
