# Exemplos — generalização de módulo

Camada 3 da skill `code-generalizacao-modulo`. Um caso feito certo, o mesmo caso feito errado, e o
impacto de cada desvio. O exemplo é **identidade** (empresas × usuários × papéis, autenticação
terceirizada a adapter), porque é o caso onde as três colunas do mapa são mais fáceis de confundir.

---

## O caso

Um módulo de identidade construído dentro de um sistema de gestão de um ramo específico. Ele já
funciona: cadastra organizações, usuários e papéis, autentica, autoriza rotas por permissão, e delega
a verificação de credencial a um provedor externo.

---

## ✅ Feito certo

### Passo 1 — inventário (trecho da saída)

```
Contrato ....... 11 endpoints: GET /health, GET /meta, GET /resumo, POST /sessoes, ...
Tabelas ........ loja_empresas, loja_usuarios, loja_papeis, loja_usuario_papel, loja_convites
Ambiente ....... LOJA_DB_URL, LOJA_API_PORT, LOJA_AUTH_ISSUER, LOJA_SMTP_URL
Portas ......... repository, clock, idGenerator, notifier
Consumes ....... catalogo

Lexico candidato a NEGOCIO (top 8):
   412x  loja          88x  vendedor        61x  checkout       44x  comissao
   37x   convite       31x  papel           22x  assinatura     14x  plano
```

### Passo 2 — mapa de capacidade

| Coluna | Itens | Raciocínio |
|---|---|---|
| **Núcleo** | organização, usuário, papel, vínculo usuário↔papel, convite, sessão, permissão | um sistema de qualquer ramo precisaria de todos |
| **Especialização → sai** | `vendedor` (papel específico), `comissao`, `checkout` | são o ramo, e nenhum outro projeto quer |
| **Especialização → ponto de extensão** | `papel` com nome fixo → **catálogo de papéis configurável**; `plano/assinatura` → **política de limites por porta** | todo projeto quer, cada um do seu jeito |
| **Infraestrutura → porta** | provedor de identidade, envio de e-mail do convite, banco, relógio, gerador de id | trocar o fornecedor não pode tocar o domínio |
| **Corte declarado** | `consumes: catalogo` | o módulo lia o catálogo só para nomear o vendedor — informação do ramo; some |

**A decisão que salva o entregável:** `vendedor` **sai**, mas "papel com nome fixo em código" vira
**catálogo configurável**. Apagar os dois deixaria o próximo projeto reescrevendo papéis do zero;
manter os dois traria o ramo junto.

**Multi-tenancy fica.** Separar dados por organização é *forma*, e é genérica. O que sai é o
*significado* — chamar a organização de "loja" e assumir que ela vende.

### Passo 3 — identidade

`id: identidade` · escopo `@acme` · tabelas `identidade_organizacoes`, `identidade_usuarios`,
`identidade_papeis`, `identidade_usuario_papel`, `identidade_convites` · env `IDENTIDADE_*` ·
permissões `identidade:ler`, `identidade:escrever` · `role: domain` · `consumes: []`.

Note o que **não** aconteceu: `loja_empresas` não virou `store_companies`. O nome saiu da capacidade
("organização"), não de uma tradução da origem.

### Passos 4–6 — repositório, ADR, código

```
init_repo.py --target ../modulo-identidade --name "Identidade" --binding typescript \
             --escopo acme --modulos identidade:domain --git-init
```

ADR: *"a verificação de credencial é uma porta (`core/ports/autenticador`) porque cada consumidor
decide o próprio provedor"*. Nenhuma frase sobre onde o módulo nasceu.

Contrato antes do código, com exemplos neutros (`organizacao-exemplo`, não o nome de um cliente).
Migration nova, com `-- rollback`. Fixtures inventadas.

### Passo 7 — os seis degraus

```
--- Verificacao do entregavel: identidade ---
  1. conforme                     verde
  2. extraivel                    verde
  3. funciona sem infra           verde
  4. o schema funciona            verde
  5. cumpre o contrato            verde
  6. e generico                   verde

[OK] APROVADO — os 6 degraus verdes
```

**Resultado:** o módulo sobe em qualquer projeto, o consumidor escolhe o provedor de identidade, e
nada no repositório diz de onde a capacidade veio.

---

## ❌ Feito errado (o mesmo caso)

| Desvio | O que parecia | O que custou |
|---|---|---|
| **Copiou `modules/loja-usuarios/` e renomeou a pasta** | "economizei um dia" | comentários, fixtures e exemplos do ramo espalhados; a limpeza virou caça a strings que nunca termina, e o degrau 6 acusou 40 ocorrências em arquivos que ninguém tinha aberto |
| **Traduziu os nomes**: `loja_empresas` → `store_companies` | "agora está em inglês, está genérico" | o negócio inteiro sobreviveu em outra língua, e passou pela denylist escrita em português |
| **Apagou tudo que era "de negócio", inclusive `papel`** | "fiquei só com o essencial" | o módulo entrega usuários sem autorização; o primeiro consumidor reescreveu papéis do zero — a capacidade que justificava a destilação |
| **Manteve `consumes: catalogo`** | "depois eu resolvo" | o módulo não sobe sozinho: sem o vizinho, o gateway não tem URL base. O degrau 2 (`--extraction`) reprovou, e o conserto foi redesenho |
| **Deixou o SDK do provedor de identidade dentro do módulo** | "é o provedor que a gente usa" | o consumidor seguinte usava outro; o módulo teve de ser aberto e refeito, que é exatamente o que o padrão de portas existe para evitar |
| **Copiou a migration com o `INSERT` de seed** | "os dados de exemplo ajudam" | nomes e e-mails reais de clientes da origem versionados num repositório novo — vazamento de negócio e de PII na mesma linha |
| **Aceitou gate verde como entrega** | "o gate passou, está pronto" | o gate é estático e nunca roda o módulo; a migration tinha erro de sintaxe e o `/resumo` devolvia campo fora do contrato. Os degraus 4 e 5 pegariam os dois |
| **Versionou a `denylist-origem.txt` dentro do repo novo** | "assim fica junto do projeto" | um arquivo listando o nome da origem, dentro do entregável — o `verificar_entregavel.py` recusa antes de varrer, e a razão é o próprio degrau 6 |

---

## A regra que resume os oito desvios

**Nada da origem atravessa como arquivo — só como conhecimento.** Cada desvio acima é a mesma falha
em roupa diferente: alguém deixou um pedaço da origem viajar sem passar pela decisão do mapa de
capacidade. O que passa pelo mapa vira núcleo, ponto de extensão ou porta. O que não passa, não entra.
