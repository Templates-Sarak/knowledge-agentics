# Comentários — a norma por trás da prática

Camada 3 de `padrao-escrita`. A cláusula do corpo (§ "Nível 0") é uma frase — *"comentários explicam
o porquê, não o quê"*. Este arquivo **descreve o que o repositório já faz**, lendo os próprios
arquivos que praticam o padrão (`tests/verify-catalog.mjs`, `doutrina/04-regras.md`,
`tests/run-all-selftests.mjs`) — não inventa estilo novo. Hoje a norma se reproduz só por imitação
do arquivo vizinho; este documento é a primeira vez que ela fica escrita.

## Cobrança: metade é máquina, metade é leitura humana

**Nenhuma parte desta norma tem verificador hoje.** `validate.py`/`validate.mjs` (`padrao-python`/
`padrao-typescript`) não mencionam docstring nem comentário; o catálogo do template só cita
comentário para **excluí-lo** da contagem de linhas (`04-regras.md`, regra `limiar-funcao`: *"função
com no máximo 40 linhas de código (sem brancos, comentários e docstrings)"*) e para que os
extratores de código não confundam um exemplo documentado com uma violação real (`04-regras.md`
§7, "Leitura de código: comentário não é código"). Pela lei do próprio repo (`04-regras.md` §1,
lei 2): **regra sem verificação não se cobra em revisão — é recomendação, não regra dura.** Esta
norma inteira está nessa categoria. Não é lacuna escondida: é **pendência declarada**, no mesmo
sentido que `run-all-selftests.mjs` declara os scripts sem `--autoteste`. Não se implementa
verificador nesta rodada.

## Cabeçalho de arquivo — quando é obrigatório

**Obrigatório** em script, ferramenta ou verificador (qualquer `.py`/`.mjs`/`.js` em `scripts/`,
`tools/`, `tests/`). **Não obrigatório** em código de aplicação comum (um componente, uma rota) —
ali o nome do arquivo e a função já dizem o que é; cabeçalho ali é ruído.

O cabeçalho de um script declara, nesta ordem:
1. **Propósito** — uma frase do que o arquivo faz.
2. **Lei dona** — a norma que ele aplica ou verifica, se houver uma (`verify-catalog.mjs`: *"Lei
   dona: nenhuma — ferramenta de manutenção do TEMPLATE"*; `audit_base.py` não declara porque não
   aplica nenhuma lei específica — é o próprio verificador).
3. **Como se roda** — a linha de comando, com as flags que importam (`--autoteste`, argumentos
   posicionais).

## O porquê, não o quê

A regra central. Um comentário que descreve o que o código já diz por si é peso morto; um
comentário que registra a decisão **não óbvia** por trás dele é o que evita que alguém desfaça essa
decisão sem saber que ela existia.

**❌ Ruim** (parafraseia):
```python
# incrementa contador
contador += 1
```

**✅ Bom** (justifica uma decisão não óbvia):
```python
# Este arquivo DEFINE os padroes de segredo — varre-lo faz cada padrao casar consigo mesmo e
# reportar um vazamento que nao existe. Auto-deteccao e falso positivo, nao achado.
eu_mesmo = os.path.abspath(__file__)
```
(exemplo real, `scan_segredos.py` — o comentário existe porque sem ele alguém "corrigiria" a
auto-exclusão achando que é um bug.)

## Limite declarado

O que a unidade **não** cobre, escrito no próprio arquivo — nunca prometido implicitamente. Padrão
observado em `verify-catalog.mjs` (*"Limite declarado, não escondido: a checagem de contagem só
varre `tools/**`, nunca `.md`"*) e em `run-all-selftests.mjs` (bloco `PENDÊNCIA DECLARADA`, que
nomeia os scripts sem `--autoteste` em vez de deixar a ausência implícita). A alternativa —
silêncio sobre a lacuna — é o defeito que este próprio arquivo existe para não repetir.

## Docstring por linguagem

- **Python** — `"""…"""` no topo do módulo, para scripts/ferramentas (ver cabeçalho acima). Função
  interna comum **não** precisa de docstring própria — só quando o comportamento não é óbvio pela
  assinatura (ex.: por que um `None` de retorno significa "fail-closed", não "vazio").
- **TS/JS** — bloco `/** … */` (JSDoc) no mesmo papel; usa-se `@param`/`@returns` só quando o tipo
  já declarado na assinatura não é suficiente para entender a forma dos dados.
- Nenhuma das duas linguagens exige docstring em função privada/local óbvia — exigir isso produz
  ruído, não clareza.

## O que não comentar

- **Código óbvio** — o que a função/variável já diz pelo nome.
- **Código morto comentado** — um bloco desativado com `// ...` ou `# ...` é lixo versionado, não
  documentação; apague (o histórico do Git é o arquivo). Precedente: o workflow de
  `code-limpeza-projeto` já trata "código comentado sem nota" como item a remover na varredura de
  higiene — a mesma regra vale por escrito, não só na faxina.
- **Changelog em comentário** (`// alterado em 2026-01-01 por fulano: ...`) — isso é mensagem de
  commit, não comentário de código; duplica o que `git log`/`git blame` já respondem melhor.

## Marcadores (`TODO`/`FIXME`)

Política de uso — não redefina a checagem: `git-revisao-diff` (`scripts/revisar_diff.py`) já marca
`TODO`/`FIXME` presentes no diff staged como **aviso**, não bloqueio. Um `TODO` é aceitável para
sinalizar trabalho pendente **explícito e rastreável** — nunca como substituto de implementar a
parte difícil. `TODO` sem contexto ("TODO: consertar isso") é pior que nenhum: não diz o que falta
nem por quê.

## Idioma

Conteúdo de comentário é **português** — mesma régua do `04-regras.md` §3.1 ("Idioma"): a **árvore**
de arquivos (pastas, nomes de arquivo, chaves de manifesto) é inglês; o **conteúdo** — e comentário
é conteúdo — é português. Esta seção **referencia** aquela regra, não a copia; o texto normativo
completo (as exceções deliberadas, os símbolos vendorizados) mora só lá.
