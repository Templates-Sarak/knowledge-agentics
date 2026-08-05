# Plano — verificação completa do template de módulos

> Documento de acompanhamento. Marque o item ao aprovar a plan correspondente.
>
> **Objetivo:** template reprodutível e **auto-verificável**, com todos os insumos de verificação
> (gate estático + lint + testes) prontos antes de montar o pipeline de CI/CD.

**Regra permanente:** toda regra nova exige, por `04-regras.md` §7.3, um **caso de teste próprio**
em `ferramentas/gate/testes/casos.mjs` e uma **linha no catálogo** (§4.x), mais o limite conhecido
no §7.2 quando houver. Regra sem caso não entra.

---

## Estado

| Métrica | Valor |
|---|---|
| Regras no catálogo | **48** |
| Regras com caso de teste próprio | **48** — cobertura total |
| Bindings | `typescript` · `javascript` · `python` — gate verde nos três |
| Autoteste | `58/58` (TS) · `58/58` (JS) · `56/56` (PY) |

**Meta ao fim de todos os blocos:** ~64 regras, todas com caso, cobertura uniforme entre bindings.

---

## Concluído

- [x] Importação do template para `specs/_estrutura_modulos/`, doutrina virando `specs/arquitetura/`
- [x] Três níveis com um dono cada (N0 `padrao-escrita` · N1 `04-regras.md` · N2 `padrao-<linguagem>`)
- [x] Gate honesto sobre os próprios limites (§7.2 reescrito, sem limite morto nem escondido)
- [x] Autoteste exige **igualdade** de ids — extra não declarado reprova (`tambem` como teto)
- [x] Coerência da base cobrada por máquina (`ponteiros.py`: citado→existe **e** existe→indexado)
- [x] `padrao-go` / `padrao-java` aposentadas sem perder norma
- [x] `test-api-contrato` reposicionada no que o gate estático não alcança
- [x] Campos órfãos do manifesto: `geraArtefato`, `ui`, `exportaResumo` → 4 regras novas

---

## Bloco A — Fundação

> Destrava B, C, D e G. Nada lê limiar antes disto existir.
>
> **Decisões tomadas:** os limiares 40/3/4 são **lei**, não política — vivem em
> `ferramentas/gate/limiares.mjs`, dentro do gate, e por isso viajam com o módulo extraído. O
> `verificacao.json` guarda só o que é ajustável por projeto. A config do linter é **gerada e
> versionada**, com a deriva cobrada por regra.

### A.1 — a camada  ✅ **concluído**
- [x] `ferramentas/gate/limiares.mjs` — fonte única; `escrita.mjs` consome
- [x] `config/verificacao.json` + schema *(cobertura, severidade de CVE, ferramenta por linguagem)*
- [x] `ferramentas/gerar-config-lint.mjs` — determinístico, com `--conferir` (exit 1 na divergência)
- [x] eslint (flat config) em TS/JS com as 5 regras que espelham o gate
- [x] `.ruff.toml` na raiz; `[tool.ruff]` **removido** do pyproject do módulo — declarar ali
      *sombreia* a raiz e devolve os limiares ao default do ruff
- [x] Formatador: `prettier` e `ruff format`, em `--check` no `verificar`
- [x] `verificar` dos 3 bindings: gate → env → **formato** → **lint** → tipos → testes
- [x] `criar-projeto.mjs` instala tudo

**Achado:** 32 arquivos do molde Python e 20 de TS/JS estavam fora de formato — nunca houve
formatador no template. Moldes reformatados.

**Limite conhecido:** módulo extraído fica sem `.ruff.toml` até ser religado a um esqueleto. O piso
do gate não cai (os limiares viajam em `ferramentas/gate/`); a A.3 fecha a janela.

### A.2 — as regras que cobram a camada  ⟵ **próximo**
- [ ] `verificacao-declarada` — o arquivo existe e conforma ao schema
- [ ] `lint-derivado` — a config do linter deriva de `limiares.mjs`; divergência reprova
      *(o `--conferir` do gerador já é o gancho)*

### A.3 — config de lint **por módulo**, gerada do manifesto
- [ ] `import-lateral`, `import-adapter`, `sdk-fornecedor`, `env-fora-do-carregador` no eslint,
      com os caminhos derivados de cada `modulo.json` — AST resolve alias, re-export e import
      dinâmico; regex não. **Continuam também no gate**, como piso de extração
- [ ] Fecha a janela do módulo extraído: o módulo passa a carregar a própria config
- [ ] Exige decidir se `.ruff.toml` entra em `ENTRADAS_PERMITIDAS` (`regras/estrutura.mjs`)

---

## Bloco B — Segurança  *(8 regras)*

- [ ] `gitignore-segredo` — `.gitignore` cobre `.env` e `modulos/*/.env`
- [ ] `rota-publica-autenticada` — rota fora de `rotasPublicas` passa pelo middleware de auth
- [ ] `segredo-no-front` — chave sem prefixo público (`NEXT_PUBLIC_`/`VITE_`) usada em `web/`
- [ ] `entrada-allowlist` — update não aceita o corpo inteiro *(simétrico ao `saida-crua`)*
- [ ] `cookie-seguro` — cookie de sessão com `HttpOnly`, `Secure`, `SameSite`
- [ ] `token-em-armazenamento` — token de auth em `localStorage`/`sessionStorage`
- [ ] `random-inseguro` — `Math.random`/`random` gerando token ou segredo
- [ ] `sql-concatenado` — SQL montado por concatenação/interpolação

---

## Bloco C — Testes  *(3 regras)*

- [ ] `testes-web` — módulo com `rotaWeb` tem `tests/web/` não-vazio
- [ ] `testes-integracao` — módulo com `dados.tabelas` não-vazio tem `tests/integracao/` não-vazio
- [ ] `testes-gateway` — todo arquivo em `core/gateways/` tem teste com mock derivado do contrato
      *(fecha o triângulo `gateway ⟷ consome ⟷ teste`)*

`tests/contrato/` = API interna **e** externa; externa com dados mockados.

---

## Bloco D — Campos do manifesto ainda órfãos

- [ ] `permissoes` — declarada e nunca usada, e o inverso *(análogo ao `config-morta`)*
- [ ] `navegacao` — toda entrada aponta para página real *(análogo ao `web-declarado`)*
- [ ] `portas` — verificar se o campo do **manifesto** tem verificador semântico
      *(as ocorrências encontradas são do `config/portas.json`, que é outra coisa)*

`rotasPublicas` está no Bloco B como `rota-publica-autenticada`.

---

## Bloco E — Cobertura do próprio gate  ✅ **concluído**

- [x] Caso próprio para `config-valida`
- [x] Caso próprio para `config-morta`
- [x] Caso próprio para `env-fora-do-carregador`
- [x] Caso próprio para `rls`
- [x] **Alvo lógico + família de sintaxe** — o caso nomeia `rotas`/`mapeadores` (o harness resolve o
      caminho) e declara o trecho por família (`js`/`py`). Resolver só o caminho seria pior que a
      lacuna: o caso deixaria de pular sem testar nada
- [x] `contrato-sincronizado`, `payload-camelcase` e `saida-crua` passam a rodar nos **três** bindings
- [x] Alvo inexistente **lança** `SEM_COBERTURA` com o motivo, nunca vira aprovação

**Resultado:** 44 → 48 regras com caso, cobertura total do catálogo. SEM COBERTURA restante (1·1·3) é
legítima — o molde do binding não tem a peça (`web/` no Python; mapeador Python em TS/JS).

---

## Bloco F — Insumos de CI que **não** são regras de gate

> Construir **junto do pipeline**, não antes: o formato de saída é ditado pelo consumidor.

- [ ] `ferramentas/afetados.mjs` — arquivo alterado → módulo → consumidores transitivos.
      **Maior retorno da lista**: sem ele o CI roda tudo a cada commit
- [ ] Detector de breaking change de contrato *(precisa de baseline git — fora do gate por isso)*
- [ ] `dependencia-fixada` — lockfile presente *(reavaliar: talvez seja regra de gate)*
- [ ] Passo de build — TS/JS não têm script `build`; `tsc --noEmit` não produz artefato
- [ ] Migrations executáveis — sobem e descem contra banco efêmero
- [ ] Estágio 0: `gitleaks` + `git ls-files` procurando `.env` versionado — **fail-closed**
- [ ] Audit de dependência — fail-open, severidade vinda da política

---

## Bloco G — Hooks dentro do template

- [ ] Os 5 hooks + `hooks.json` instalados pelo `criar-projeto.mjs`
- [ ] Lendo `config/verificacao.json` do projeto, não `hooks/config.json` da base

---

## Bloco H — Dívidas registradas

- [ ] `criar-modulo.mjs --sem-artefato` remove `core/motor` e deixa `tests/dominio` importando dele
      — módulo nasce com teste quebrado. O caso análogo `--sem-web` é tratado corretamente
- [ ] Caso 2 do autoteste: `schema-manifesto` × `manifesto` acusam o mesmo `papel` inválido.
      Declarado como par, não resolvido — decidir qual cala é definir a fronteira das duas
- [ ] §7.2 — acrescentar *"ou rota obrigatória ausente"* ao parágrafo da exceção de silêncio
- [ ] **`bindings/python/_template/tests/` não tem `__init__.py`** — `from tests.fixtures import …`
      não resolve e os testes do molde Python não rodam. O conserto é um arquivo vazio
- [ ] §7.2 — registrar o limite do módulo extraído sem `.ruff.toml` *(hoje só no comentário do
      pyproject do molde)*
- [ ] `plugin/sarak_routing_table.md` — regenera no próximo `sync_ide.py` *(ação do usuário)*

---

## Ordem de dependência

```
A  fundação          ← obrigatoriamente primeiro
B  segurança      ┐
C  testes         ├ independentes entre si; leem a política de A
D  campos órfãos  ┘
E  cobertura        independente de tudo — antecipar rende
F  insumos de CI    junto do pipeline, não antes
G  hooks            depende de A
H  dívidas          a qualquer momento
```

---

## Fora deste plano

- **Pipeline CI/CD** — montado depois, quando todos os insumos existirem
- **Ambiente por estágio** — decidido: **não se modela no template**. `envRequerido` é o contrato,
  `.env.example` a forma versionada, e o ambiente real injeta por processo, que já está no topo da
  cascata da ADR-004. `fallback-silencioso` garante que chave faltando derruba o boot
- **Cobertura de teste como gate de merge** — critério de CI, nunca regra do catálogo (§1, lei 2)
