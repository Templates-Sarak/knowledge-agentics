# Workflow detalhado — generalização de módulo

Camada 3 da skill `code-generalizacao-modulo`. O `SKILL.md` resolve o caminho comum sozinho; este
arquivo é o mergulho: o que detectar em cada passo, como decidir quando o caso é ambíguo, e as
armadilhas que só aparecem quando já é tarde.

---

## §0 — Pré-condições: por que a origem precisa estar estável

Os quatro sinais do passo 0 não são burocracia. Cada um responde a um modo de falha diferente:

| Sinal | O que impede |
|---|---|
| `validate.mjs modules/<origem>` verde | destilar de um módulo que já viola a lei — os defeitos viajam junto, agora sem a origem para consertá-los |
| `--extraction` verde | descobrir só no fim que a origem tinha porta sem adapter ou gateway sem env — o inventário sai incompleto e ninguém percebe |
| `verificar` da origem verde | generalizar comportamento que talvez nem funcione; o módulo genérico herdaria o bug, com testes novos que o consagram |
| `docker info` responde | chegar aos degraus 4 e 5 sem ambiente e ser tentado a "deixar para depois" |

**Módulo em construção é o caso mais comum e o mais caro.** Um módulo que ainda vai mudar de forma
produz um mapa de capacidade que envelhece antes de virar código. A resposta certa é *"termine a
origem primeiro"*, dita cedo, não um entregável que precisa ser refeito.

Origem em outra máquina ou sem o gate instalado: **não vale improvisar**. Sem gate, não há como
afirmar que a fronteira do módulo é real — e a skill inteira depende dessa fronteira existir.

---

## §1 — Inventário: o que o script vê e o que ele não vê

```
python scripts/inventariar_origem.py --modulo <caminho-do-modulo> --json
```

Ele lê `module.json`, `contract/openapi.yaml`, `database/**.sql` e `.env.example`, e varre o código
atrás de identificadores. **Não lê o `.env` real** (segredo não entra em inventário) e **não julga**.

**O léxico é o insumo que só existe por máquina.** A saída lista, por frequência, os identificadores
que não estão no vocabulário genérico. Frequência não é veredito: `checkout` com 200 ocorrências é
tão candidato quanto `sazonalidade` com 3. O que a lista garante é que ninguém *esqueça* de decidir
sobre um termo — e o termo esquecido é sempre o mesmo tipo: o que virou nome de função ou de coluna e
parece técnico dentro do contexto de origem.

**Vocabulário do projeto.** Se o alvo é PT puro ou tem jargão técnico próprio, estenda com
`--vocabulario <arquivo>` (uma palavra por linha) em vez de ignorar a lista na leitura — o que se
ignora uma vez, ignora-se sempre.

**Parse raso, declarado.** O OpenAPI é lido por regex na seção `paths:`, sem resolver `$ref`. Serve
para listar a superfície. Contrato de verdade se valida em runtime, no degrau 5.

---

## §2 — O mapa de capacidade: como classificar sem errar

Cada item do inventário cai em **uma** coluna. As perguntas que resolvem os casos difíceis:

- **"Um sistema de outro ramo precisaria disso?"** Sim → núcleo. Não → especialização.
- **"Isso é a FORMA ou o SIGNIFICADO?"** Separar dados por organização é forma (núcleo); chamar a
  organização de "loja" e assumir que ela vende é significado (especialização).
- **"Trocar o fornecedor mudaria isto de lugar?"** Sim → infraestrutura, vira porta.

**A terceira decisão, que quase sempre falta:** especialização não tem um destino só. Ela **sai** ou
**vira ponto de extensão**. Sai o que é do negócio e ninguém mais quer; vira ponto de extensão o que
todo projeto vai querer, cada um do seu jeito — campo extra por entidade, política configurável,
callback de validação. Apagar o segundo grupo custa tanto quanto carregar o negócio junto: o próximo
projeto reescreve o que você tinha na mão.

**Ponto de extensão é porta ou config declarada.** Nunca um desvio condicional por tipo guardado no
código "por enquanto" — o "por enquanto" é o negócio de origem sobrevivendo escondido.

**Armadilha medida:** o `consumes` da origem é onde o acoplamento se disfarça de arquitetura. "O
módulo consulta o módulo de clientes" parece dependência legítima até a pergunta certa: *o dado
consultado é insumo (entra por parâmetro/claim) ou é responsabilidade (vira porta)?* A terceira
resposta — "é do negócio e some" — é legítima e precisa ser dita em voz alta, nunca silenciosa.

---

## §3 — Identidade: derivar, nunca traduzir

Sete itens, todos decididos no portão: `id` (kebab-case), nome da capacidade, escopo dos packages,
prefixo de tabela (`<id>_`), prefixo de env (`<ID>_`), permissões (`<id>:ler`, `<id>:escrever`) e
`basePath`.

**Traduzir é a falha silenciosa.** `pedido_usuario` → `order_user` mantém o negócio inteiro, só que
em inglês — e passa por qualquer denylist escrita na língua da origem. O teste é semântico: *este
nome faria sentido num sistema que nunca vendeu nada?* Se a resposta depende do ramo, o nome é da
especialização, e a decisão é do passo 2, não deste.

O `id` do módulo é o mesmo em pasta, package, `basePath`, prefixo de tabela e prefixo de env — a
regra é da lei (`04-regras.md`), e o gate cobra.

---

## §4 — O repositório: um módulo, um repo

```
python meta-iniciar-repositorio/scripts/init_repo.py --target <repo> --name "<capacidade>" \
       --binding <typescript|javascript|python> --escopo <escopo> --modulos <id>:<role> --git-init
```

**Por que repositório próprio, e não uma pasta numa biblioteca comum.** A unidade de verificação do
template é o módulo, e o repo instanciado traz `tools/` (gate), `packages/ports`, `adapters/memory`,
`src/composicao` e `specs/arquitetura/` ao redor dele. Ou seja: o procedimento de extração da
doutrina (`03-operacao.md` §6) já vem executado. O módulo de prateleira chega **verificável** no
destino, não apenas copiável — e continua verificável depois de copiado.

**`role`:** `domain` na esmagadora maioria; `gateway` só se a capacidade for embrulhar um fornecedor
externo pago. **`connector` nunca** — ele agrega outros módulos, e aqui não há outros.

**Colisão:** se o `init_repo.py` abortar por `package.json` existente, **pare e pergunte**. `--forcar`
sobrescreve manifesto, e essa decisão é do usuário.

---

## §5 — ADR de desenho, sem procedência

O mapa do passo 2 é conhecimento caro e some se não for escrito. Ele vira ADR no repo novo — mas
escrito como **decisão**, não como **história**:

- ✅ *"A autenticação é uma porta (`core/ports/autenticador`) porque cada consumidor decide o próprio
  provedor; o módulo nunca conhece o fornecedor."*
- ❌ *"A autenticação virou porta porque no sistema de origem ela estava acoplada ao provedor X."*

A segunda forma é procedência, viaja na cópia e vaza a origem — exatamente o que o degrau 6 procura.

---

## §6 — Escrever: contrato primeiro, e a ordem que evita retrabalho

`contract/openapi.yaml` **antes** de qualquer rota, com `/health`, `/meta`, `/resumo` e **exemplos
neutros** (o exemplo do contrato é o lugar clássico onde o nome da empresa de origem sobrevive).

Depois: `core/domain` → `api/src/routes` → `api/src/mappers` (saída por allowlist) → `database/`
(migration nova, com `-- rollback`) → `web/` → `tests/`.

**A migration é nova, sempre.** Copiar a da origem traz nome de tabela, coluna de negócio e — pior —
seed com dado real. Dado real em seed é vazamento de negócio e de dado pessoal ao mesmo tempo;
suspeita de PII vai para `cyber-dados` antes de qualquer coisa.

**Fixture é inventada.** Nome de cliente real em teste sobrevive a todas as revisões porque ninguém
lê fixture.

---

## §7 — Os seis degraus, e a denylist que não pode morar dentro do repo

```
python scripts/verificar_entregavel.py --repo <repo> --modulo <id> --denylist <arquivo-fora-do-repo>
```

**A denylist fica FORA do repositório verificado** — o script recusa uma que esteja sob `--repo`,
antes de varrer. Um arquivo listando os termos da origem, versionado dentro do entregável, **é** o
vazamento que o degrau 6 existe para pegar. Guarde-a no diretório de trabalho da conversa.

**Os degraus 4 e 5 são declarados, não adivinhados.** O script lê `config/verificacao.json` do repo
verificado (molde em `templates.md`) para saber qual compose subir e quais comandos rodar. Sem essa
declaração, os dois degraus voltam como `NAO EXECUTADO` — e `NAO EXECUTADO` **reprova**. É a regra
central: gate verde prova conformidade estática, nunca funcionamento, e tratar um pelo outro já fez,
num sistema real, um comando de extração "passar" sem ter rodado um teste sequer.

Ambiente efêmero é **um só** para os dois degraus: sobe, roda schema, roda contrato, derruba com
`down -v` mesmo se algo falhar no meio.

---

## As armadilhas, em uma linha cada

1. **Copiar "só um arquivinho"** da origem — é sempre o que traz o vocabulário junto.
2. **Traduzir nomes** em vez de derivá-los da capacidade — o negócio sobrevive em outra língua.
3. **Denylist só com o nome da empresa** — falta o léxico do passo 2, que é onde o negócio mora.
4. **Denylist dentro do repo** — o script recusa, e a razão é o próprio degrau 6.
5. **Aceitar gate verde como "funciona"** — o gate nunca roda o módulo, por contrato.
6. **Migration/seed/fixture herdados** — vazamento de negócio e de PII na mesma linha.
7. **`consumes` sobrevivente** — módulo sozinho no repo que declara consumir alguém nunca sobe.
8. **Especialização apagada em vez de virar ponto de extensão** — o próximo projeto reescreve.
