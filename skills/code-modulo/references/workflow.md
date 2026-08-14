# Workflow Detalhado: code-modulo

Versão expandida do workflow do `SKILL.md`. Leia quando precisar do detalhe de um passo.

- **§A — Fluxo A**, iniciar um sistema modular (o projeto ainda não tem `modules/`).
- **§B — Fluxo B**, criar um módulo (o projeto já adotou o template). Trate **um módulo por vez**.

O Fluxo A termina chamando o Fluxo B, uma vez por módulo inicial.

---

# §A — Iniciar um sistema modular

## A1: Confirmar o terreno

**Objetivo:** não sobrescrever trabalho alheio.

O `create-project` **aborta** se o destino já tem `modules/`, e também se já tem os arquivos de raiz do
binding (`package.json`, `pyproject.toml`, `tsconfig.json`, `jsconfig.json`, `.gitignore`, `verificar.py`).

| Situação | O que fazer |
|---|---|
| Diretório vazio ou repositório recém-criado | siga |
| Já tem `modules/` | é o **Fluxo B**, não este |
| Já tem `package.json`/`pyproject.toml` de um projeto em andamento | **pare e pergunte.** `--forcar` sobrescreve; o `.gitignore` é mesclado, mas o manifesto de pacote **não** |

## A2: Entrevista

§0 de `references/templates.md` (entrevista do Fluxo A). Não pergunte o que dá para ler: se há um repositório git, o **nome** e o
**escopo** saem do nome da pasta e do remoto.

**O que detectar:**
- `data.schema` = `public` → recuse; é erro de gate sem exceção possível.
- Escopo com maiúscula ou espaço → package inválido.
- Binding `python` com pedido de tela → o binding Python nasce backend-only; a tela é um módulo TS.
- Só um módulo planejado → pergunte se é mesmo modular. Um módulo só não precisa de federação.

## A3: HITL — plano

A árvore que será criada, a lista de módulos com papel, as decisões que virarão ADR, e **o que não será
tocado**. Aguarde confirmação explícita.

## A4: Instanciar

```
node <template>/tools/create-project.mjs <destino> --binding <b> --escopo <e>
```

Nasce com: `tools/` (o gate), `packages/ports`, `adapters/memory` (**obrigatório** — é o que permite
testar sem rede), `src/composicao`, `modules/_template`, e a doutrina em `specs/arquitetura/` mais
`specs/adr/000-decisoes-do-template.md`.

**O que detectar:** exit ≠ 0 → leia a mensagem; ela nomeia a colisão.

## A5: Registrar as decisões do projeto

Estas são **decisões**, não configuração — vão para `specs/adr/NNN-*.md`, não para um comentário:

| Decisão | Por que precisa estar escrita |
|---|---|
| Idioma das pastas (misto EN ou PT puro) | o gate cobra **consistência**, não a escolha — sem o registro, não há o que ser consistente com |
| Topologia de schema (único ou por módulo) | muda o custo de separar depois; e `data.schema` de todo módulo depende dela |
| `ui.modo` padrão (`proprio` ou `kit`) | `kit` proíbe importar a lib de UI bruta; adotar depois é campanha |

## A6: Criar cada módulo

Repita o **§B** para cada módulo inicial. Ordem: domínios primeiro, `gateway` quando houver serviço externo
pago, e o `conector` **por último** — ele agrega os outros e precisa que existam.

## A7: Verificar

```
node tools/gate/validate.mjs --todos          # inclui import-lateral e consome-ciclo
npm run verificar                             # ou: python verificar.py
```

O `--todos` é o único que enxerga as duas regras **globais**. Rodar só o gate por módulo deixa passar
exatamente o acoplamento que a arquitetura existe para impedir.

---

# §B — Criar um módulo

## Passo 1: Confirmar o terreno

**Objetivo:** garantir que o projeto adotou o template antes de escrever qualquer arquivo.

1. Glob por `tools/create-module.mjs`, `tools/gate/validate.mjs`, `specs/arquitetura/04-regras.md` e `modules/`.
2. Leia `specs/arquitetura/01-modulo.md` (anatomia e manifesto) e `specs/arquitetura/04-regras.md` (catálogo normativo).
3. Liste `modules/` para conhecer os módulos vizinhos — você vai precisar deles no campo `consumes`.

**O que detectar:**
- Falta `tools/create-module.mjs` ou `modules/` → o projeto **não** adotou o template: e o Fluxo A, nao este.
- Existe `Modules/` com maiúscula, ou `src/modules/` → estrutura antiga, não adequada.

**Como corrigir:** **pare e reporte.** Criar o módulo numa estrutura não adequada gera um módulo que nasce
fora do padrão e vira dívida no dia da adequação. Adequar o projeto é campanha à parte.

---

## Passo 2: Coletar a identidade

**Objetivo:** fixar os campos que **não podem mudar depois** sem quebrar rota, tabela e env.

| Campo | Regra | Consequência de errar |
|---|---|---|
| `id` | kebab-case minúsculo, singular ou plural conforme o domínio | é pasta + package + `basePath` + prefixo de tabela + prefixo de env. Mudar depois = renomear tudo |
| `role` (CLI: `--role`, digitado em PT) | `dominio` \| `gateway` \| `conector` — gravado no manifesto como `domain`\|`gateway`\|`connector` | só `gateway` pode declarar credencial de serviço externo pago |
| `binding` | `typescript` \| `javascript` \| `python` | define o molde e o conjunto de regras de linguagem |
| `generatesArtifact` | `true` só se o módulo produz saída publicável | `false` descarta `core/engine`, `core/templates` e `generated/` |
| `webPath` | `/<id>` ou `null` | `null` descarta `web/`; se declarado, o gate exige página real |
| `ui.modo` | `proprio` \| `kit` | `kit` proíbe importar a lib de UI bruta fora do `ui-kit` |

**O que detectar:**
- `id` com maiúscula, underscore ou acento → reprova no scaffold.
- `id` que já existe em `modules/` → o scaffold aborta.
- `id` genérico (`core`, `comum`, `utils`) → não é domínio de negócio; é sinal de que a fronteira está errada.

---

## Passo 3: HITL — plano

**Objetivo:** o usuário aprova a fronteira do módulo **antes** de existir arquivo.

Monte o bloco de `references/templates.md` e aguarde confirmação explícita. Não prossiga com silêncio nem com
resposta ambígua.

**O que detectar no próprio plano:**
- Tabela sem o prefixo `<id>_` → renomeie antes de criar.
- `consumes` apontando para módulo que também consome este → **ciclo**; o gate reprova. Resolva a direção agora.
- Porta declarada sem adapter correspondente → o módulo não sobe.

---

## Passo 4: Scaffold determinístico

**Objetivo:** materializar a árvore canônica sem digitar caminho à mão.

```
node tools/create-module.mjs <id> --binding <b> --role <p> [--sem-artefato]
```

O script copia o molde do binding, substitui os marcadores (`<modulo>`, `<MODULO>`, `<Modulo>`), ajusta o
manifesto, cria o `.env` com o ponteiro `ENV_RAIZ` e roda o gate ao final.

**O que detectar:** exit ≠ 0. O scaffold já valida o que criou — pendência aqui é do molde, não sua.

**Antes:**
```
modules/
├── _template/
└── conector/
```

**Depois:**
```
modules/
├── _template/
├── conector/
└── catalogo/          ← árvore completa, manifesto preenchido, gate verde
```

---

## Passo 5: Declarar no manifesto

**Objetivo:** o módulo se declara; o sistema o **descobre**. Nada é registrado em código compartilhado.

Preencha `module.json` conforme `references/templates.md`. Regra que atravessa tudo: **não declarado, não existe.**

**O que detectar:**
- Tabela usada no código e ausente de `data.tables` → o gate varre **uso**, não só declaração.
- Chave `<MODULO>_*` lida no código e ausente de `requiredEnv` → erro.
- `data.schema` igual a `public` → erro, sem exceção.
- Permissão de outro módulo declarada aqui → o módulo declara **só o que possui**.

---

## Passo 6: Contrato antes do código

**Objetivo:** a spec manda; o código segue.

Escreva `contract/openapi.yaml` com os três endpoints obrigatórios e os recursos do domínio.

| Rota | Papel |
|---|---|
| `GET <basePath>/health` | vivo? portas resolvidas? |
| `GET <basePath>/meta` | ecoa o manifesto — é por aqui que o sistema descobre o módulo |
| `GET <basePath>/resumo` | contagem e indicadores que o conector agrega |

**O que detectar:**
- Verbo no path (`/criarItem`) → a ação é o método HTTP.
- Recurso no singular ou em camelCase → plural kebab-case.
- Campo de `sensitiveFields` aparecendo em schema de **resposta** → erro de gate.

---

## Passo 7: Preencher nesta ordem

**Objetivo:** cada camada nasce sobre a anterior já pronta, sem retrabalho.

1. **`core/domain`** — tipos + validação. Sem I/O, sem `new Date()`, sem `Math.random()` (use as portas
   `relogio` e `geradorId`).
2. **`api/src/routes`** — valide a entrada na **borda**, exija permissão, monte a resposta pelo mapeador,
   lance o erro da taxonomia fechada (nunca `res.status(...)` ad hoc).
3. **`api/src/mappers`** — `linhaParaDominio`, `dominioParaLinha` e a **projeção de saída por allowlist**.
   O campo só é publicado se alguém o acrescentar deliberadamente aqui.
4. **`database/`** — `schema.sql` (estado alvo) + `migrations/0001-cria-<entidade>.sql` com bloco `-- rollback`.
5. **`web/src/pages`** — a tela com os três estados (`loading`, `empty`, `error`); estado em `hooks/`, acesso em
   `api-client/` por caminho relativo.
6. **`tests/`** — `domain/`, `contract/`, `web/`, tudo com adapters de memória.

**O que detectar:**
- `import` de `@<escopo>/<outro-modulo>` ou caminho relativo saindo da pasta → **import lateral**, erro.
- SDK de fornecedor dentro do módulo → erro; o SDK só existe no adapter.
- Cliente HTTP de outro módulo fora de `core/gateways/` → a pasta declara a fronteira; fora dela, o nome mente.

**Antes (errado):**
```ts
// modules/pedidos/database/adaptador/adaptadorCatalogo.ts
import { pool } from '<sdk-do-fornecedor>'
const { rows } = await pool.query('SELECT preco FROM catalogo_precos WHERE item = $1')
```

**Depois (certo):**
```ts
// modules/pedidos/core/gateways/catalogo.ts
export function criarGatewayCatalogo(baseUrl: string): CatalogoGateway {
  return {
    async obterPrecoVigente(hash: string): Promise<number> {
      const resposta = await fetch(`${baseUrl}/itens/${hash}/preco-vigente`)
      if (!resposta.ok) throw new ErroDeGateway('catalogo', `HTTP ${resposta.status}`)
      const { valor } = await resposta.json()
      return valor   // projete SO a fatia que voce declarou precisar
    },
  }
}
```

---

## Passo 8: Sincronizar ambiente

**Objetivo:** o que o módulo exige e o que está documentado nunca divergirem.

```
node tools/sync-env.mjs
```

Regenera o `.env.example` do módulo (a partir de `requiredEnv`) e o da raiz (união de todos).
Depois, preencha os **valores reais** no `.env` da **raiz**.

**O que detectar:**
- `.env.example` editado à mão → será sobrescrito; a fonte é o manifesto.
- Segredo real no `.env` do módulo → ele só aceita `ENV_RAIZ` e overrides não-secretos.
- Chave de **outro** módulo lida aqui → cada módulo lê apenas as suas.

---

## Passo 9: Gate verde

**Objetivo:** o módulo nasce conforme e provadamente extraível.

```
node tools/gate/validate.mjs modules/<id>
node tools/gate/validate.mjs --extracao modules/<id>
```

O segundo comando responde a pergunta que justifica a arquitetura inteira: **este módulo vira microsserviço
hoje?** Toda porta declarada tem adapter, o `.env` resolve isolado, os testes passam sem rede.

**O que detectar:** exit ≠ 0. Corrija pelo `id` da regra na saída — cada id tem entrada em `specs/arquitetura/04-regras.md`.

**NÃO** entregue com o gate vermelho e **NÃO** registre exceção para fazer passar. Exceção exige motivo escrito
e decisão ratificada no `specs/adr/000-decisoes-do-template.md`.
