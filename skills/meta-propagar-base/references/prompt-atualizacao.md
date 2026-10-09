# Molde — prompt de atualização direta

Entregue **na conversa**, em bloco ` ````md `, ao usuário, que o leva a **outra** conversa (o executor).
Prompt nunca vira arquivo. É a **via direta** do `00-prompt-revisor` do repositório (§6): não há plan, então o
bloco carrega a instrução inteira — a forma (objetivo, escopo, referências, pronto quando) é a de lá; este
molde só preenche os campos da propagação. Uma tarefa por prompt: **um repositório** (monorepo: o grupo).

Preencha o que está entre `<…>` com o que o `--relatorio` e o `--plano --id <id>` mostraram. Tire as
`--incluir-*` se o usuário não as pediu naquela execução.

````md
Leia specs/00-prompt-executor.md e execute a tarefa abaixo.

**Não há plan para esta tarefa** — a instrução completa é este bloco. Cumpra o
ritual de leitura (§2) pulando o passo 1, e entregue o resumo da §5 **nesta
conversa**, não em arquivo.

**Objetivo:** levar ao repositório a atualização mecânica da base Sarak
(<id do sistema>, base <commit curto>), sem tocar arquivo personalizado.

**Dentro do escopo:** o que o comando abaixo escreve, e só isso — <N> da base,
<N> `tools/` por política, <N> novos (lista completa em `--plano --id <id>`),
mais o carimbo `.sarak/base.json` e o manifesto `.sarak/propagacao-<curto>.json`.
**Fora do escopo:** qualquer outro arquivo; molde personalizado (`00-contexto`,
`00-indice`, `00-backlog`, `panorama/00-planejamento`), `specs/specs/`,
`specs/arquitetura/` fora dos nomes reservados, `specs/adr/` (exceto o 000),
`specs/plan/` e o código. Não crie branch: trabalhe no branch corrente.

**Referências:** skill `meta-propagar-base` (`SKILL.md`); a base em
<caminho absoluto da base>.

**Comando** (worktree do repositório limpo; rode da raiz da base):
`python <caminho da base>/skills/meta-propagar-base/scripts/propagar.py --aplicar --id <id> [--id <outro, se monorepo>] [--incluir-divergentes] [--incluir-adicionar?]`

**Pronto quando:**
- o comando terminou sem `[ERRO]`;
- `propagar.py --plano --id <id>` não mostra mais `adicionar`, `substituir`
  nem `substituir-politica`;
- `git status`/`git diff` só têm o que estava em "Dentro do escopo" —
  nenhum molde personalizado alterado (`git diff` vazio neles);
- `.sarak/base.json` gravado e o gate (se modular) reportado;
- o que ficou como `pendente` (conflito, divergente, `adicionar?`, `bloqueado`,
  lacunas) listado no resumo, **sem tentar resolver**.

**Entregue:** o resumo da §5 com a saída completa do comando, o `git diff --stat`
e as pendências. **Não commite** nem dê push. Não use `--desfazer` por conta
própria: se algo estiver errado, pare e reporte.
````

Depois da execução, o revisor (quem escreveu o prompt) confere o "Pronto quando" **ele mesmo**, no
repositório — `--plano --id`, `git diff`, os moldes intactos, o carimbo — e só então o usuário commita. Se
reprovar, o prompt de correção é o da §6 do `00-prompt-revisor`, com os achados no texto.
