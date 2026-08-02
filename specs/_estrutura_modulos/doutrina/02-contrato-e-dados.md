---
tipo: "doutrina"
titulo: "Contrato e Dados — a API Pública, o Erro, o Schema e a Migration"
status: "🟢 Vigente"
tags: ["api", "contrato", "rest", "openapi", "banco", "migrations"]
relacionados: ["[[00-arquitetura]]", "[[01-modulo]]", "[[03-operacao]]", "[[04-regras]]"]
---

# 1. Propósito

A `api/` é a **única** superfície pública de um módulo: é por ela que o front dele, o conector e qualquer outro
módulo obtêm dado. Se ela vazar detalhe interno, o isolamento vira encenação.

Esta lei define a forma do contrato, a identidade dos registros, a forma dos dados no banco e como o schema evolui.

# 2. Forma das rotas

- Prefixo `/api/v1/<modulo>` (= `modulo.json:rotaBase`), recursos no **plural kebab-case**, **sem verbo** no
  path. A ação é o método HTTP: `POST /api/v1/catalogo`, nunca `/criarItem`.
- Filtro por query string; paginação `?pagina=&tamanho=`, com padrão e teto em `config/api.json`.
- O identificador na URL é o **hash universal** (§4), nunca o `id` interno do banco.

**Endpoints obrigatórios em todo módulo:**

| Rota | Papel |
|---|---|
| `GET <rotaBase>/health` | vivo? portas resolvidas? |
| `GET <rotaBase>/meta` | ecoa o `modulo.json` — é por aqui que o sistema descobre o módulo |
| `GET <rotaBase>/resumo` | contagem e indicadores que o conector agrega |

O conector consome **apenas** esses três — nunca endpoint específico de um módulo.

> **Atenção de segurança.** `/meta` devolve topologia interna (nomes de tabelas, de variáveis e de permissões).
> Enquanto o sistema não tiver autenticação, ela é rota pública por necessidade; assim que houver login, ela
> deve sair de `rotasPublicas` ou passar a devolver uma projeção reduzida.

# 3. Caixa e projeção

- **O banco fala `snake_case`; o contrato fala `camelCase`.** A conversão é explícita, num mapeador em
  `api/src/mapeadores/`, nas duas direções.
- **Projeção de saída é obrigatória:** a resposta é montada campo a campo por **allowlist**. Devolver o
  registro cru do banco é **proibido** — é o que impede vazar coluna nova, campo livre ou PII.
- Campo listado em `modulo.json:camposSensiveis` nunca aparece em resposta, log ou OpenAPI.

**Projeção dupla, quando o dado é sensível.** Uma projeção monta a listagem (sem o dado sensível) e outra monta
o detalhe, com o campo **mascarado** quando ele precisa aparecer. Dado que não precisa sair não entra sequer no
tipo de domínio.

**A consequência que se aceita de propósito:** campo novo exige tocar em dois lugares — schema e mapeador.
Esquecer o segundo faz o campo simplesmente não aparecer. É falha silenciosa, e é papel do teste de contrato
pegá-la. O inverso — publicar por omissão — seria pior.

## 3.1 Envelope e taxonomia de erro

Sucesso devolve o recurso, ou `{ itens, pagina, tamanho, total }` em coleção. Erro devolve **sempre** a mesma forma:

```json
{ "erro": { "codigo": "VALIDACAO", "mensagem": "parametro \"pagina\" deve ser inteiro >= 1", "requestId": "..." } }
```

| Código | HTTP | Uso |
|---|---|---|
| `VALIDACAO` | 400 | input externo malformado |
| `NAO_AUTENTICADO` | 401 | token ausente ou inválido |
| `NAO_AUTORIZADO` | 403 | claims sem a permissão |
| `NAO_ENCONTRADO` | 404 | recurso inexistente |
| `CONFLITO` | 409 | violação de unicidade ou de estado |
| `LIMITE_EXCEDIDO` | 429 | rate limit, com `Retry-After` |
| `DEPENDENCIA_EXTERNA` | 502 | falha de adapter ou de gateway |
| `INTERNO` | 500 | exceção não prevista |

A taxonomia é **fechada** e vive em `packages/portas`. **A mensagem ao cliente é genérica e estável; o detalhe
vai só para o log**, correlacionado pelo `requestId`. Mensagem de fornecedor nunca chega ao browser.

## 3.2 Validação na borda

Todo input externo é validado **na `api/`, antes do `core/dominio`**: schema por rota, **allowlist de campos**
(payload com campo desconhecido é rejeitado, não ignorado) e limite de tamanho de corpo vindo de `config/api.json`.

Erro de domínio é erro do **cliente**, não falha interna: a borda traduz a exceção de validação do domínio para
`VALIDACAO` (400).

# 4. Hash universal — a única cola entre módulos

Quando registros de módulos diferentes pertencem ao mesmo evento de negócio, o vínculo é um **hash**: um
identificador curto, guardado como **valor** em cada módulo.

- É a **única cola permitida entre módulos**: sem foreign key, sem JOIN, sem tabela compartilhada. O vínculo
  é um valor, não uma dependência — e é isso que mantém cada módulo extraível.
- Toda tabela de metadados tem a coluna `hash`, com índice único quando o hash identificar um registro só.
- Nenhum módulo gera hash fora da porta `geradorId`.
- Nenhuma rota expõe o `id` interno do banco.

**Colisão é decisão de projeto, não acidente.** Se o espaço de valores for pequeno, gerar sem consultar o banco
antes de inserir torna a colisão provável pelo paradoxo do aniversário. Ou o gerador consulta antes, ou o
espaço é grande o bastante, ou a colisão tem comportamento definido — mas isso precisa estar escrito.

# 5. Versão e compatibilidade

`v1` é estável. Acrescentar campo opcional ou rota nova é compatível; remover ou renomear campo, mudar tipo,
apertar validação ou mudar semântica **não é** — exige `/api/v2/` convivendo com `v1` por uma janela de
depreciação anunciada no `openapi.yaml`.

**O `contrato/openapi.yaml` é a fonte do contrato**, versionado junto do código. Rota que existe no código e
não na spec, ou o contrário, é divergência que o gate pega.

Mudança de contrato afeta quem declarou `consome` do seu módulo — **consulte o grafo antes**, não depois.
Remover uma rota, renomeá-la ou trocar o método dela quebra quem depende: a regra `consome-contrato`
(`specs/arquitetura/04-regras.md` §4.2) confere cada `consome` contra a spec do dono e reprova no consumidor.
Ela cobra a **rota**; compatibilidade do payload continua sendo leitura humana (§7.2).

# 6. Dados

## 6.1 Posse e fronteira

- Schema **nunca** `public`. Um schema por módulo ou schema único é decisão do projeto, declarada em
  `dados.schema`.
- Toda tabela é **prefixada pelo módulo dono** (`catalogo_metadados`) e declarada em `dados.tabelas`. Nome
  genérico sem prefixo (`clientes`, `logs`) é proibido — o prefixo é o que sustenta o isolamento no schema
  único, e o que evita renomeação no dia de separar.
- **Só o dono lê e escreve** nas suas tabelas. **Proibido JOIN, view ou foreign key cruzando módulos.**
- O acesso é sempre pela porta `repositorio`; nenhum SQL de fornecedor dentro do módulo, e a query é **sempre
  parametrizada** no adapter.

## 6.2 Forma

- Tabelas e colunas em `snake_case`.
- Toda tabela tem `id`, `hash`, `created_at` e `updated_at`.
- **Coluna dedicada para o que se consulta.** Campo livre (JSON) só para o que é genuinamente livre — valor,
  data e status são colunas, porque precisam ser consultáveis.
- Campo com PII é declarado em `camposSensiveis` e nunca sai por projeção.

## 6.3 Migrations

- Numeração sequencial e imutável: `NNNN-verbo-objeto.sql`. **Migration publicada não se edita** — corrige-se
  com outra.
- Toda migration é **reversível**: o bloco `-- rollback` acompanha, e o gate exige que ele exista.
- Mudança destrutiva usa **expand-contract**: adiciona → migra dado → passa a ler o novo → só então remove o
  antigo, em migrations separadas.
- `schema.sql` reflete o estado alvo depois da última migration.
- **Toda alteração de schema é HITL:** aprovação explícita antes de rodar em ambiente com dado real. O fluxo
  seguro é a skill `db-migrations`.

## 6.4 Trilha de auditoria

Toda escrita registra `hash`, `acao`, `sujeito`, `campos_alterados`, `request_id` e `ocorrido_em` em
`<modulo>_auditoria`, tabela **append-only** do próprio módulo, implementada pela porta `auditoria`.

**Não confunda com log.** O log é operacional e efêmero (stdout, para diagnosticar); a trilha é registro
**durável e consultável** de negócio, que responde "quem mudou o status deste registro em março". O `requestId`
é o que liga um ao outro.

**A trilha guarda o NOME dos campos alterados, nunca o valor** — senão a auditoria recria exatamente o
vazamento que a projeção de saída evita. Quem precisa do valor consulta o registro; quem precisa saber que ele
mudou consulta a trilha.

O `REVOKE UPDATE, DELETE` na migration é o que torna o *append-only* real, e não uma promessa do código.

# 7. O artefato publicado

Módulo com `geraArtefato: true` produz saída publicável em `gerados/`. Distinto do código: é o que se entrega
ao cliente final.

| Regra | Detalhe |
|---|---|
| **Superfície pública mínima** | a pasta publicada contém só arquivos de apresentação. Nenhum arquivo de metadado é publicável |
| **Defesa em profundidade** | a config de publicação reescreve qualquer `*.json` para 404 |
| **Sem indexação** | `X-Robots-Tag: noindex, nofollow` em todas as respostas |
| **Artefato publicado é imutável** | é proibido alterar, reformatar ou regerar um artefato já publicado. URL viva é compromisso com o cliente |
| **Nome de pasta não muda** | a URL é o caminho relativo; renomear quebra o link já enviado |
| **Caminho derivado do hash** | validado por regex, sem path traversal, sem listagem de diretório |
