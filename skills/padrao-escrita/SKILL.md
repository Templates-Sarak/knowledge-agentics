---
name: padrao-escrita
description: Padrão-base de escrita e organização de código do ecossistema Sarak (clean code, limiares objetivos, zero hardcoded, modular microservice-ready). Use ao escrever, revisar ou organizar qualquer código, em qualquer linguagem — é a fonte de verdade que as demais skills referenciam.
---

# Skill: Padrão de Escrita e Organização

Define a **identidade** de como escrever código no ecossistema Sarak: princípios agnósticos de
linguagem (Nível 0) + organização de projeto microservice-ready (Nível 1). É a **fonte da verdade** —
toda outra skill e o `CLAUDE.md` **referenciam** este padrão, nunca o duplicam.

> Esta skill é provider-neutra. O gancho sempre-ativo de cada provedor (`CLAUDE.md` no Claude;
> `GEMINI.md` / `.agents/rules/` no Antigravity) apenas aponta para cá.

## Quando usar
- Proativa: ao **escrever, revisar ou organizar** qualquer código, em qualquer linguagem.
- Ao decidir onde colocar config, segredos, módulos, tabelas ou rotas.
- Ao criar uma skill nova (ela deve referenciar este padrão).

## Nível 0 — Identidade de escrita (qualquer linguagem)

**SRP** — módulo, arquivo e função com **uma** responsabilidade. Se o nome precisa de "e", divida.

**Limiares objetivos** (verificáveis, valem como regra dura):
- Função ≤ **40 linhas**.
- Aninhamento ≤ **3 níveis** — use **guard clauses** / early-return em vez de `if` aninhado.
- ≤ **4 parâmetros** — acima disso, agrupe em um objeto/struct.

**Zero hardcoded** — nenhum literal de configuração ou segredo no código:
- `config.json` (versionado, **por módulo**) → tunables **não-secretos**: limites, timeouts, feature flags, tamanhos de página, caminhos.
- `.env` (no `.gitignore`, com `.env.example` versionado) → **segredos e valores por-ambiente**: chaves, tokens, URLs de banco, hosts. Variáveis **prefixadas pelo módulo** dono (`ORDERS_DB_URL`, `USERS_JWT_SECRET`).

**Scripts** — uma responsabilidade por script; parametrizados por args/`config.json`; I/O claro (texto ou JSON).

**Erros** — tratados explicitamente (**nunca engolir exceção**); falhe cedo com mensagem acionável.

**Nomes** — descritivos e sem abreviação obscura; o nome revela a intenção.

**Testes** — toda nova funcionalidade vem com testes **na mesma entrega**; **caminhos críticos obrigatórios**; **meta de 80%** de cobertura do módulo (sinal de saúde, **não** gate dogmático). Testes ficam em `tests/` do módulo. Legado entra via testes de caracterização (skill `code-adequacao`).

**Validação + segurança na borda** — valide **todo input externo** na camada `api/` (antes do `domain/`); **queries parametrizadas** (nunca concatene SQL); nunca confie em input externo.

**Logging/observabilidade** — **logger estruturado** (sem `print`/`console.log`); níveis de log apropriados; nada de log com segredo.

**Tipagem nas fronteiras** — type hints / TS `strict` ao menos nas assinaturas públicas (`api/` e contratos).

**Documentação do contrato** — o `api/` de cada módulo é documentado (o que entra/sai); comentários explicam o **porquê**, não o **o quê**.

## Nível 1 — Organização (microservice-ready)

Estrutura **100% modular**: cada módulo é uma fatia vertical autossuficiente, desacoplada a ponto de
ser extraída como microsserviço. Detalhe completo (árvore + cada regra com exemplo) em
`references/PADRAO-ORGANIZACAO.md`; para nascer um módulo já nessa árvore, use `scripts/scaffold_modulo.py`.
Resumo dos inegociáveis:

- **Módulo = domínio**; pasta por módulo com o **mesmo nome** (kebab-case) em `backend/` e `frontend/`.
- **Encapsulamento**: um módulo só acessa o `api/` (contrato público) de outro — **nunca** `domain/`/`data/`.
- **Comunicação**: contrato + **adaptador** — chamada local hoje; virar HTTP/fila depois mexe só no adaptador.
- **Dados**: banco compartilhado disciplinado; **toda tabela prefixada pelo módulo dono** (`orders_items`); **proibido** ler/JOIN tabela de outro módulo — pegue o dado pelo contrato.
- **`config.json` por módulo**; `.env` único na raiz com vars prefixadas por módulo.
- **API**: REST, `/api/v1/`, recursos no **plural em kebab-case**, **sem verbos** no path; filtros via query. Contrato em **camelCase** (backend converte snake↔camel na borda).
- **`shared/`**: só contratos/tipos (DTOs) — **zero lógica**.
- **Nomes**: pastas/módulos em kebab-case; arquivos no idioma da linguagem (snake_case em Python, PascalCase em componentes).

## Regras e limites
- **NÃO** deixe literal de config/segredo no código — vai para `config.json` ou `.env`.
- **NUNCA** versione segredos — `.env` no `.gitignore`; só `.env.example` é commitado.
- **NÃO** importe internals (`domain/`/`data/`) de outro módulo — só o `api/` dele.
- **NUNCA** faça JOIN/consulta direta em tabela de outro módulo — busque pelo contrato do dono.
- **NÃO** coloque lógica de negócio em `shared/` — só contratos/tipos.
- **NÃO** crie função > 40 linhas, com > 3 níveis de aninhamento ou > 4 parâmetros — refatore.
- **NÃO** dê a um script mais de uma responsabilidade.
- **NÃO** entregue funcionalidade nova sem testes (caminhos críticos cobertos) na mesma entrega.
- **NUNCA** concatene SQL nem confie em input externo — valide na borda `api/` e use queries parametrizadas.
- **NÃO** use `print`/`console.log` para log — use logger estruturado; **nunca** logue segredo.
- **NÃO** saia do escopo: refatoração de clean code aplica-se aqui; arquitetura nova fora do padrão deve ser discutida, não improvisada.

## Checklist "conforme ao padrão"
- [ ] Nenhum literal de configuração/segredo no código (estão em `config.json`/`.env`)?
- [ ] `.env` no `.gitignore`, `.env.example` presente, variáveis prefixadas por módulo?
- [ ] Cada função ≤ 40 linhas, ≤ 3 níveis de aninhamento, ≤ 4 parâmetros, com guard clauses?
- [ ] Cada módulo é autossuficiente e só consome o `api/` (contrato) dos outros?
- [ ] Tabelas prefixadas pelo módulo dono; sem acesso cross-módulo a tabelas?
- [ ] Pastas de módulo iguais entre `backend/` e `frontend/` (kebab-case)?
- [ ] Rotas REST `/api/v1/`, plural kebab-case, sem verbos; contrato em camelCase?
- [ ] `shared/` contém só contratos/tipos (sem lógica)?
- [ ] Funcionalidade nova acompanha testes (caminhos críticos), em `tests/` do módulo, mirando ~80%?
- [ ] Input externo validado na borda `api/` e queries parametrizadas (sem SQL concatenado)?
- [ ] Logger estruturado (sem `print`/`console.log`), sem segredo em log, sem exceção engolida?
- [ ] Assinaturas públicas tipadas e contrato (`api/`) documentado?

## Referências (Camada 3 — leia sob demanda)
- `references/PADRAO-ORGANIZACAO.md` — Nível 1 detalhado: árvore-padrão e cada regra com exemplo.
- `references/examples.md` — módulo bem desacoplado (bom) × módulo acoplado (ruim).
- `scripts/scaffold_modulo.py` + `scripts/config.json` — gera o esqueleto de um módulo (backend/frontend) na árvore-padrão; estrutura (subpastas/arquivos) definida no `config.json`, zero hardcoded.
- `assets/config_modulo.json` — template copiável do `config.json` de um módulo (tunables não-secretos).
