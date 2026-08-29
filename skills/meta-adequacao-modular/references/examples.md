# Exemplos: meta-adequacao-modular

## 1. Caminho `sem-specs` — ponta a ponta

**Cenário.** Um ERP com `package.json` na raiz (`workspaces: ["Modulos/*"]`, `husky` + `lint-staged`
instalados) e módulos em `Modulos/Propostas/`, `Modulos/Contratos/` — nenhum `specs/`.

**Diagnóstico mecânico** (`diagnosticar_terreno.py --raiz <alvo> --modulos Propostas Contratos --json`,
rodado sobre um legado sintético construído só para validar esta skill — nenhum sistema real foi tocado):

```json
{
  "fase": "A",
  "caminho": "sem-specs",
  "sinais_sdd": [],
  "branch": { "atual": "", "e_padrao": false, "arvore_suja": null },
  "template_instalado": {
    "estado": "nao-instalado",
    "presentes": [],
    "faltando": ["adapters_memoria", "config_raiz", "gate", "githooks", "manifesto_raiz", "molde_modulo", "portas", "scaffolder"]
  },
  "colisao_raiz": ["package.json"],
  "geracao_antiga": [],
  "workspaces_legado": ["Modulos/*"],
  "hooks_legado": true,
  "modulos_candidatos": [
    {"pasta": "Propostas", "id_atual": "Propostas", "conforme": false, "id_sugerido": "propostas"},
    {"pasta": "Contratos", "id_atual": "Contratos", "conforme": false, "id_sugerido": "contratos"}
  ],
  "modulos_origem": "flag",
  "equivalentes_suspeitos": {}
}
```

**O que a skill faz com isto:**
- `fase: "A"` + `caminho: "sem-specs"` → confirma em uma linha e segue para o Passo 1 como **no-op
  declarado** (não havia `plan/`/`specs/` para sintetizar) e o Passo 2 como **instalação** de
  `specs/` (só `00-contexto.md`/`00-indice.md` recebem conteúdo real; os três universais são copiados).
- `sinais_sdd: []` confirma o lado negativo do tri-estado — nenhum nome de `specs/_estrutura_base/` foi
  achado sob `specs/` do alvo, então não há ambiguidade com `specs-divergentes` (exemplo 2).
- `template_instalado.estado: "nao-instalado"` → o Passo 3 instala o aparato inteiro (nenhuma das oito
  peças existe ainda) — é o caso comum de legado puro.
- `colisao_raiz: ["package.json"]` → HITL: mesclar `scripts`/`workspaces` na mão, nunca `--force`.
- `hooks_legado: true` → armadilha #3 (§4 do `workflow.md`): decidir com o usuário como o `husky`/
  `lint-staged` existentes convivem com o `pre-commit` do template.
- `modulos_candidatos` → o portão central de HITL: `Propostas`→`propostas`, `Contratos`→`contratos` —
  exatamente o caso medido em `CLAUDE.md` (`Earendel/ERP/Modulos/Propostas`, `Contratos`, `Projetos`),
  nenhum batendo `^[a-z][a-z0-9-]*$` de saída.
- Cada módulo aprovado no HITL recebe uma plan `xx-nn-modulo-<id>` com o template de renomeação de sete
  itens (`templates.md` §2) — prefixo de tabela e chaves de ambiente entram como decisão explícita
  (renomear × exceção), nunca herdados em silêncio.

## 2. Caminho `specs-divergentes` — ponta a ponta

**Cenário.** O mesmo ERP do exemplo 1, mas com um ano a mais de vida: alguém já começou a documentar o
projeto num vault próprio — `specs/INDEX.md` existe (mapa de leitura, escrito à mão) — mas nunca rodou
`meta-iniciar-repositorio`, então não há `specs/00-indice.md` nem `specs/plan/`. É o caminho mais comum em
legado maduro: specs **existem**, só não as canônicas.

**Fixture** (montada no scratchpad desta conversa — mesma árvore do exemplo 1, mais `specs/INDEX.md` com
duas linhas de prosa; nenhum sistema real foi tocado). **Saída real** de
`diagnosticar_terreno.py --raiz <alvo> --modulos Propostas Contratos --json`:

```json
{
  "fase": "A",
  "caminho": "specs-divergentes",
  "sinais_sdd": ["INDEX.md"],
  "branch": { "atual": "", "e_padrao": false, "arvore_suja": null },
  "template_instalado": {
    "estado": "nao-instalado",
    "presentes": [],
    "faltando": ["adapters_memoria", "config_raiz", "gate", "githooks", "manifesto_raiz", "molde_modulo", "portas", "scaffolder"]
  },
  "colisao_raiz": ["package.json"],
  "geracao_antiga": [],
  "workspaces_legado": ["Modulos/*"],
  "hooks_legado": true,
  "modulos_candidatos": [
    {"pasta": "Propostas", "id_atual": "Propostas", "conforme": false, "id_sugerido": "propostas"},
    {"pasta": "Contratos", "id_atual": "Contratos", "conforme": false, "id_sugerido": "contratos"}
  ],
  "modulos_origem": "flag",
  "equivalentes_suspeitos": {}
}
```

Tudo fora de `caminho`/`sinais_sdd` é idêntico ao exemplo 1 — o que muda é só o que `specs/` contém, e é
exatamente por isso que o tri-estado existe: as duas árvores de código são o mesmo legado, mas exigem
Passo 1/2 diferentes.

**O que a skill faz com isto:**
- `caminho: "specs-divergentes"` → **não** instala `_estrutura_base/` por cima do que já existe.
  `sinais_sdd: ["INDEX.md"]` é o insumo: o revisor lê esse arquivo antes de decidir qualquer coisa.
- **Passo 1 — regra de absorção** (`workflow.md` §1): nada em `specs/INDEX.md` é apagado antes de ter
  destino escrito. Cada conteúdo divergente vira, individualmente: absorvido numa spec fixa canônica, uma
  plan `xx-nn-specs-<assunto>`, ou resíduo declarado a apagar **depois** de confirmado — nunca antes.
- **Passo 2 — `INDEX.md` ≠ `00-indice.md`** (`workflow.md` §2): os dois nomes existem em
  `specs/_estrutura_base/` e respondem perguntas diferentes — `INDEX.md` é o **mapa de leitura** (ordem em
  que se lê o vault), `00-indice.md` é a **fila de execução** das plans (`proximo_numero_plan` no
  frontmatter). Uma plan que "renomeasse" `INDEX.md` para `00-indice.md` apagaria o mapa de leitura
  achando que estava só corrigindo um nome — o erro que esta nota, e o checklist de `templates.md` item 7,
  existem para não deixar acontecer.
- Dali em diante — `template_instalado`, `colisao_raiz`, `hooks_legado`, `modulos_candidatos` — o Passo 3
  em diante segue **idêntico** ao exemplo 1: o tri-estado só muda o Passo 1/2, nunca o resto do fluxo.

## 3. Caminho `com-specs` — ponta a ponta

**Cenário.** Um sistema já iniciado com `meta-iniciar-repositorio` há um ano, com `specs/00-indice.md` e
`specs/plan/` populados, mas duas specs em `arquitetura/` descrevem uma rota que o código não tem mais (foi
removida numa correção de bug sem plan de atualização de spec).

**O que muda em relação ao exemplo 1:**
- Passo 1 **não** é no-op: se houver alguma `🟢 Aprovada` pendente de síntese, ela é sintetizada primeiro
  (nesta mesma conversa) e, na mesma ação, remove a plan e a linha do índice — `plan/` fica só com o que
  está ativo.
- Passo 2 é o trabalho de maior valor: cada spec de `arquitetura/` é conferida contra o código real. A rota
  removida gera uma plan `xx-nn-specs-arquitetura-api` (não uma edição direta) que **atualiza** a spec para
  refletir o sistema como ele é hoje.
- O restante do fluxo (Passo 3 em diante) é idêntico aos exemplos 1 e 2 — a régua entra antes da execução
  do mesmo jeito, e a Fase B usa o mesmo critério mecânico.

## 4. As três fases do diagnóstico mecânico, no mesmo legado sintético

Prova de que `fase` reage ao estado real de `specs/plan/`, e não a uma leitura estática — rodada três vezes
sobre o mesmo legado sintético do exemplo 1, sem tocar em nenhum sistema real:

| Estado de `specs/plan/` | `fase` retornada |
|---|---|
| nenhuma plan `xx-*` | `"A"` |
| `xx-01-modulo-propostas.md` presente, `status: "🔴 A executar"` | `"EM_ANDAMENTO"` |
| a mesma plan já sintetizada (logo, **removida** do disco) | `"B"` |

Isto é o que impede a skill de reabrir o planejamento em cima de uma campanha ainda ativa, e de tentar
conferir (Fase B) uma campanha que nunca chegou a rodar.

## 5. O que "pronto" parece na Fase B

Depois da execução (fora desta skill), uma segunda conversa — revisor diferente — roda o critério do §7 do
`SKILL.md` e produz o relatório de `templates.md` §6. Um veredito **reprovado** típico: `validate.mjs
--all` verde, mas `specs/plan/` ainda tem uma `xx-04-modulo-contratos` em `🟡 Em execução` — a Fase B para
aqui e devolve para `/code3-adequar` terminar, sem fingir que a campanha encerrou.

## 6. O alvo NÃO é legado — projeto 100% gerado pelo template

**Cenário.** A skill é invocada contra um repositório produzido só por
`create-project.mjs --binding typescript --scope acme` + `create-module.mjs catalogo --role domain` —
zero código escrito à mão, gate já verde. **Saída real** do diagnóstico sobre essa árvore:

```json
{
  "fase": "A",
  "caminho": "specs-divergentes",
  "sinais_sdd": ["adr", "arquitetura"],
  "branch": { "atual": "", "e_padrao": false, "arvore_suja": null },
  "template_instalado": {
    "estado": "completo",
    "presentes": ["adapters_memoria", "config_raiz", "gate", "githooks", "manifesto_raiz", "molde_modulo", "portas", "scaffolder"],
    "faltando": []
  },
  "colisao_raiz": [],
  "geracao_antiga": [],
  "workspaces_legado": [],
  "hooks_legado": false,
  "modulos_candidatos": [
    {"pasta": "catalogo", "id_atual": "catalogo", "conforme": true, "id_sugerido": "catalogo"}
  ],
  "modulos_origem": "varredura",
  "equivalentes_suspeitos": {}
}
```

**Um fato medido nesta conversa, não um defeito:** `caminho` sai `"specs-divergentes"`, não `"sem-specs"`.
`create-project.mjs` já copia `specs/adr/000-decisoes-do-template.md` e `specs/arquitetura/` — dois nomes de
`SINAIS_SDD` — mas **não** instala `specs/00-indice.md`/`specs/plan/` (isso é `meta-iniciar-repositorio`/
`spec-fundacao`, um passo à parte). Um projeto recém-gerado pelo template, sozinho, **sempre** vai cair em
`specs-divergentes` por este diagnóstico — é a classificação correta do que está ali, não um alarme falso.

**O que a skill faz com isto:**
- `modulos_candidatos` **não** vem vazio — o único candidato (`catalogo`) já está `conforme: true`, sem
  `id_sugerido` divergente. É esse fato, não a lista vazia, que diz "nada a renomear aqui": `estado ==
  "completo"` **e** todo candidato já conforme **e** `colisao_raiz`/`workspaces_legado` vazios é o mesmo
  sinal de "para e pergunta" que um `modulos_candidatos: []` daria — o revisor confirma com o usuário se
  aponta para o alvo errado, ou se a campanha já terminou, exatamente como o `SKILL.md` já manda.
- `colisao_raiz: []` e `workspaces_legado: []` — **antes da correção que motivou este script**, o mesmo
  repositório produzia `colisao_raiz: [".gitignore", "package.json"]` e `workspaces_legado:
  ["modules/[a-z]*", "packages/*", "adapters/*"]`: os próprios arquivos do template, acusados como se
  fossem legado colidindo — o defeito que apontava o usuário para o portão de HITL mais caro (`--force`)
  sobre um repositório que já estava pronto.
