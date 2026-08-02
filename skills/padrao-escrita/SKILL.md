---
name: padrao-escrita
description: Padrão-base de escrita e organização de código do ecossistema Sarak (clean code, limiares objetivos, zero hardcoded, modular microservice-ready). Use ao escrever, revisar ou organizar qualquer código, em qualquer linguagem — é a fonte de verdade que as demais skills referenciam.
---

# Skill: Padrão de Escrita e Organização

Define a **identidade** de como escrever código no ecossistema Sarak. É a **porta de entrada** do padrão —
toda outra skill e o `CLAUDE.md` **referenciam** daqui, nunca duplicam.

> Esta skill é provider-neutra. O gancho sempre-ativo de cada provedor (`CLAUDE.md` no Claude;
> `GEMINI.md` / `.agents/rules/` no Antigravity) apenas aponta para cá.

## Os três níveis — quem é dono de quê

Cada regra do ecossistema tem **um** dono. Ninguém copia ninguém; quem não é dono, aponta.

| Nível | Assunto | Dono | Onde |
|---|---|---|---|
| **0** | escrita: SRP, limiares, zero hardcoded, segredos, erro, log, teste, nomes | **esta skill** (§ abaixo) | aqui |
| **1** | arquitetura de módulos: anatomia, manifesto, contrato, dados, isolamento | **catálogo de regras do template** | `specs/_estrutura_modulos/doutrina/04-regras.md` (vira `specs/arquitetura/04-regras.md` no projeto) |
| **2** | idiomas e linter de cada linguagem | `padrao-typescript` · `padrao-python` · `padrao-go` · `padrao-java` | skills irmãs |

**O Nível 1 tem verificador executável.** O gate do template (`ferramentas/gate/validar.mjs`) cobra as ~40
regras de arquitetura mecanicamente, e **repete** os quatro limiares de escrita do Nível 0 porque viaja com o
módulo extraído. Se os números divergirem, **esta skill está certa** — o catálogo é que está desatualizado.

## Quando usar
- Proativa: ao **escrever, revisar ou organizar** qualquer código, em qualquer linguagem.
- Ao decidir onde colocar config, segredos, tabelas ou rotas.
- Ao criar uma skill nova (ela deve referenciar este padrão).
- Para **criar módulo ou sistema modular**, a skill é a `code-modulo` — não improvise a estrutura aqui.

## Nível 0 — Identidade de escrita (qualquer linguagem)

**SRP** — módulo, arquivo e função com **uma** responsabilidade. Se o nome precisa de "e", divida.

**Limiares objetivos** (verificáveis, valem como regra dura):
- Função ≤ **40 linhas**.
- Aninhamento ≤ **3 níveis** — use **guard clauses** / early-return em vez de `if` aninhado.
- ≤ **4 parâmetros** — acima disso, agrupe em um objeto/struct.

**Zero hardcoded** — nenhum literal de configuração ou segredo no código. Dois destinos, e a fronteira entre
eles é **muda por ambiente?**, não "é sensível?":
- **Config versionada** → tunables **não-secretos**: limites, timeouts, feature flags, tamanhos de página. Valem para todos os ambientes.
- **`.env`** (no `.gitignore`, com `.env.example` versionado) → **segredos e valores por-ambiente**: chaves, tokens, URLs de banco, hosts. Variáveis **prefixadas pelo módulo** dono (`CATALOGO_DB_URL`).
- **Nunca** um default de infraestrutura embutido (`env['X'] ?? 'http://localhost:3000'`): falta de config **derruba o boot**, em vez de subir apontando para o lugar errado. Default só é legítimo para tunable.

> O **formato e o lugar exato** da config são do Nível 1 (no template: `config/` com um arquivo por assunto).

**Scripts** — uma responsabilidade por script; parametrizados por args/config; I/O claro (texto ou JSON).

**Erros** — tratados explicitamente (**nunca engolir exceção**); falhe cedo com mensagem acionável.

**Nomes** — descritivos e sem abreviação obscura; o nome revela a intenção.

**Testes** — toda nova funcionalidade vem com testes **na mesma entrega**; **caminhos críticos obrigatórios**. Testes ficam em `tests/` do módulo. Legado entra via testes de caracterização (skill `code-adequacao`).
- **Cobertura ~80% é alvo de equipe, e explicitamente NÃO é regra.** Medi-la exige **executar** os testes, e um gate estático não executa nada. Cobre-se em revisão e no comando `verificar` do projeto. Cobertura também não é meta em si: teste que existe só para subir número é peso morto.

**Validação + segurança na borda** — valide **todo input externo** na fronteira pública do módulo (a `api/`), antes da regra de negócio; **allowlist de campos** (payload com campo desconhecido é rejeitado, não ignorado); **queries parametrizadas** (nunca concatene SQL); nunca confie em input externo.

**Logging/observabilidade** — **logger estruturado** (sem `print`/`console.log`); níveis de log apropriados; nada de log com segredo.

**Tipagem nas fronteiras** — type hints / TS `strict` ao menos nas assinaturas públicas (`api/` e contratos).

**Documentação do contrato** — o `api/` de cada módulo é documentado (o que entra/sai); comentários explicam o **porquê**, não o **o quê**.

## Nível 1 — Organização (microservice-ready)

**Esta skill não é dona destas regras e não as descreve.** A fonte é o catálogo do template de módulos:

| Onde | O quê |
|---|---|
| `specs/_estrutura_modulos/doutrina/04-regras.md` | **o catálogo normativo** — ~40 regras, cada uma com id e verificador |
| `doutrina/00-arquitetura.md` · `01-modulo.md` · `02-contrato-e-dados.md` · `03-operacao.md` | por que a regra existe e como trabalhar dentro dela |
| `ferramentas/gate/validar.mjs` | **o verificador** — a regra é cobrada por máquina, não por memória |

No projeto instanciado, essas leis vivem em `specs/arquitetura/`; as decisões, em `specs/adr/`.
Mapa de qual lei responde a quê: `references/PADRAO-ORGANIZACAO.md`.

O princípio que sustenta todas elas, e a única coisa que esta skill afirma sobre o Nível 1:

> **A fronteira física de pastas É a fronteira de dependência.** Cada módulo é uma fatia vertical
> autossuficiente — dono do próprio front, da própria API, do próprio motor e da própria fatia de banco.
> Extrair um módulo é **copiar uma pasta e recortar chaves de `.env`**, nunca reescrever import.

**Não monte essa estrutura à mão.** Módulo manual nasce sem manifesto e com nome divergente — as duas coisas
que reprovam no gate e que o gate não conserta sozinho. A porta é a skill **`code-modulo`**.

## Regras e limites
- **NÃO** deixe literal de config/segredo no código — vai para a config versionada ou o `.env`.
- **NUNCA** versione segredos — `.env` no `.gitignore`; só `.env.example` é commitado.
- **NUNCA** use default de infraestrutura (`env['X'] ?? 'http://localhost'`) — falta de config derruba o boot.
- **NÃO** crie função > 40 linhas, com > 3 níveis de aninhamento ou > 4 parâmetros — refatore.
- **NUNCA** engula exceção (`catch {}`, `except: pass`) — trate, traduza ou deixe subir.
- **NÃO** dê a um script mais de uma responsabilidade.
- **NÃO** entregue funcionalidade nova sem testes (caminhos críticos cobertos) na mesma entrega.
- **NUNCA** concatene SQL nem confie em input externo — valide na borda pública e use queries parametrizadas.
- **NÃO** use `print`/`console.log` para log — use logger estruturado; **nunca** logue segredo.
- **NÃO** reescreva aqui uma regra de arquitetura de módulos — ela é do `04-regras.md`. Regra em dois lugares
  diverge, e o agente que a lê escolhe a errada em silêncio.
- **NÃO** saia do escopo: refatoração de clean code aplica-se aqui; arquitetura nova fora do padrão deve ser discutida, não improvisada.

## Checklist "conforme ao padrão"

**Nível 0 — a leitura humana, sempre:**
- [ ] Nenhum literal de configuração/segredo no código (estão na config versionada ou no `.env`)?
- [ ] `.env` no `.gitignore`, `.env.example` presente, variáveis prefixadas pelo módulo dono?
- [ ] Nenhum default de infraestrutura embutido — falta de config derruba o boot?
- [ ] Cada função ≤ 40 linhas, ≤ 3 níveis de aninhamento, ≤ 4 parâmetros, com guard clauses?
- [ ] Nenhuma exceção engolida; falha cedo com mensagem acionável?
- [ ] Funcionalidade nova acompanha testes (caminhos críticos), em `tests/` do módulo?
- [ ] Input externo validado na borda pública, com allowlist, e queries parametrizadas?
- [ ] Logger estruturado (sem `print`/`console.log`), sem segredo em log?
- [ ] Assinaturas públicas tipadas e contrato (`api/`) documentado?

**Nível 1 — a verificação por máquina.** Não confira de cabeça o que o gate cobra melhor:
- [ ] `node ferramentas/gate/validar.mjs <caminho-do-modulo>` verde?
- [ ] `node ferramentas/gate/validar.mjs --todos` verde (inclui `import-lateral` e `consome-ciclo`)?
- [ ] Projeto **sem** o template de módulos? Então o Nível 1 não se aplica — só a lista acima vale.

**Nível 2 — o validador da linguagem:** `padrao-typescript` · `padrao-python` · `padrao-go` · `padrao-java`.

## Referências (Camada 3 — leia sob demanda)
- `references/PADRAO-ORGANIZACAO.md` — **mapa** do Nível 1: qual lei do template responde a cada assunto.
- `references/examples.md` — módulo bem desacoplado (bom) × módulo acoplado (ruim).

> **Aposentados nesta versão:** `scripts/scaffold_modulo.py` (+ `scripts/config.json`) e
> `assets/config_modulo.json`. Substitutos: `ferramentas/criar-modulo.mjs` do template, conduzido pela skill
> **`code-modulo`**; e o `config/` de cinco arquivos com JSON Schema em `ferramentas/gate/schemas/`.
