# Padrão de Organização (Nível 1) — o mapa

**Este documento não descreve mais a organização de módulos. Ele diz onde ela está descrita.**

Até a versão anterior, a anatomia de módulo vivia aqui *e* no template de módulos. Regra escrita em dois
lugares diverge, e o agente que a lê escolhe a errada em silêncio — por isso a descrição saiu daqui e ficou
onde há **verificador executável**.

---

## 1. A fonte

| Camada | Onde, na base Sarak | Onde, no projeto instanciado |
|---|---|---|
| **A lei** (5 documentos) | `specs/_estrutura_modulos/doutrina/` | `specs/arquitetura/` |
| **As decisões** (ADR-001..007) | `specs/_estrutura_modulos/doutrina/adr/decisoes.md` | `specs/adr/000-decisoes-do-template.md` |
| **O verificador** | `specs/_estrutura_modulos/ferramentas/gate/` | `ferramentas/gate/` |
| **Os moldes por linguagem** | `specs/_estrutura_modulos/bindings/<linguagem>/` | — (já materializados) |

**`04-regras.md` é a única fonte normativa do Nível 1.** Regra que não está lá não é regra; regra que não
pode ser verificada por máquina não entra lá.

---

## 2. Qual lei responde a quê

| Sua pergunta | Lei | Seção |
|---|---|---|
| De que peças o sistema é feito? Onde estão as fronteiras? | `00-arquitetura.md` | §3, §4 |
| Qual a diferença entre módulo, adapter, package e raiz de composição? | `00-arquitetura.md` | §3 |
| Como um módulo é por dentro? Qual a árvore? | `01-modulo.md` | §2 |
| O que declaro no `modulo.json`? | `01-modulo.md` | §3 |
| Onde ponho cada valor de configuração? Como funciona o `.env`? | `01-modulo.md` | §4 |
| Como desacoplo infraestrutura (banco, storage, auth)? | `01-modulo.md` | §5 |
| Como pego dado de **outro módulo**? | `01-modulo.md` | §6 |
| Como crio um módulo? Como altero um que já existe? | `01-modulo.md` | §8, §9 |
| Qual a forma das rotas, do erro, da paginação? | `02-contrato-e-dados.md` | §2, §3 |
| Como o contrato OpenAPI se relaciona com o código? | `02-contrato-e-dados.md` | §5 |
| Como modelo tabelas, migrations e trilha de auditoria? | `02-contrato-e-dados.md` | §6 |
| Segurança da API: auth, CORS, rate limit, headers? | `03-operacao.md` | §2 |
| Log, erro e teste em execução? | `03-operacao.md` | §3, §4, §5 |
| Como provo que um módulo já pode virar microsserviço? | `03-operacao.md` | §6 |
| **Qual é a regra exata, e o que a verifica?** | **`04-regras.md`** | **§4** |
| Nomenclatura canônica (pasta, rota, tabela, env, permissão)? | `04-regras.md` | §3.1 |
| O que o gate **não** consegue verificar? | `04-regras.md` | §7 |
| Por que foi decidido assim? | `adr/decisoes.md` | ADR-001..007 |

---

## 3. O princípio, em uma frase

> **A fronteira física de pastas É a fronteira de dependência.**

Cada módulo é uma fatia vertical autossuficiente: dono do próprio front, da própria API, do próprio motor e
da própria fatia de banco. Extrair um módulo é **copiar uma pasta e recortar as chaves `<MODULO>_*` do
`.env`** — nunca reescrever import. Tudo no Nível 1 existe para sustentar essa frase.

As quatro fronteiras que a tornam verdadeira, cada uma com regra de gate própria:

| Fronteira | O que garante | Regras que a cobram |
|---|---|---|
| **Código** | nenhum módulo importa outro; lógica de negócio nunca é compartilhada — duplica-se | `import-lateral`, `import-adapter` |
| **Infraestrutura** | o módulo declara o que precisa; quem fornece é escolhido fora dele | `sdk-fornecedor`, `schema-config` |
| **Módulo alheio** | dado de outro módulo vem por HTTP, declarado — nunca por import ou tabela | `gateway-http`, `gateway-declarado`, `consome-ciclo` |
| **Dados** | schema nunca `public`, tabela sempre prefixada, sem JOIN/FK cruzando módulos | `schema-nao-public`, `tabela-prefixo`, `tabela-alheia` |

---

## 4. Como trabalhar

| Quero… | Faça |
|---|---|
| Criar um sistema modular do zero | skill **`code-modulo`** (Fluxo A) — ou `/sarak:meta-iniciar-repositorio`, que faz a inicialização completa |
| Criar um módulo num projeto que já adota o template | skill **`code-modulo`** (Fluxo B) |
| Saber se o que escrevi está conforme | `node ferramentas/gate/validar.mjs <caminho-do-modulo>` |
| Verificar o repositório inteiro | `node ferramentas/gate/validar.mjs --todos` |
| Saber se um módulo já pode virar serviço | `node ferramentas/gate/validar.mjs --extracao <caminho>` |
| Adequar um projeto **legado** que não segue o template | skill `code-diagnostico` → `code-adequacao` |

**Ninguém cria módulo copiando a pasta do molde à mão.** Módulo manual nasce sem manifesto e com nome
divergente — as duas coisas que quebram o gate e que ele não consegue consertar sozinho.

---

## 5. Projeto que não adota o template

O Nível 1 pressupõe o template de módulos instalado. Num repositório que não o adota — um script, uma
biblioteca, um site — **o Nível 1 simplesmente não se aplica**, e o padrão em vigor é o Nível 0 (`SKILL.md`)
mais a `padrao-<linguagem>`.

Não improvise uma "versão reduzida" da anatomia: meia estrutura modular dá o custo da modularidade sem a
extraibilidade que a justifica.
