---
tipo: "processo"
titulo: "Contexto do Site — Briefing de Entrada"
dominio: "Governança de Specs (SDD)"
status: "🟢 Vigente"
tags: ["processo", "contexto", "sdd", "site"]
relacionados: ["[[00-knowledge]]", "[[00-indice]]", "[[00-backlog]]", "[[00-prompt-revisor]]", "[[00-prompt-executor]]"]
---

# 0. O que é este arquivo

Esta é a **porta de entrada de qualquer agente** neste site. Um agente que leu esta spec — e só ela — deve
saber: **que site é este**, **quais regras** governam qualquer alteração, **onde** está cada definição e
**como** se trabalha aqui.

> ⚠️ **Este arquivo é um molde com instruções embutidas.** Cada seção traz um bloco `> **Como escrever:**` (a
> instrução, que **permanece** no arquivo como contrato de manutenção) e um bloco `<!-- PREENCHER -->` (o
> conteúdo real, escrito pelo **agente revisor**). As §4, §5 e §6 já vêm preenchidas: valem para todo site.
>
> **Como ela é completada:** a skill `spec-site-fundacao` semeia a §1 e a §3 com as respostas da entrevista; a
> **primeira plan** do repositório completa o resto (§2 regras específicas, §7 fronteiras, §8 estado).

**Quem escreve/atualiza:** exclusivamente o **agente revisor** ([[00-prompt-revisor]]).
**Quando atualizar:** sempre que uma plan aprovada mudar stack, identidade visual, estrutura de rotas, dados
institucionais, metas de performance/a11y ou o mapa de roteamento. Nunca fora de uma plan.

---

# 1. Identidade do site

> **Como escrever:** 3 a 6 linhas, em prosa direta. Responda: **de quem é este site** (marca/empresa), **para
> que ele existe** (institucional, captação de lead, catálogo, portfólio, blog), **qual a ação que o visitante
> deve tomar** (a conversão), **quem é o público** e **o que este site NÃO é** (não é e-commerce, não é área
> logada, não é aplicação). Sem marketing. Um agente lê isto e para de supor.
>
> Detalhe de marca, persona e tom não vem aqui — vive em `arquitetura/01.02-tom-de-voz-e-copy.md`. Aqui é o
> resumo de uma respiração.

<!-- PREENCHER -->

---

# 2. Regras inegociáveis

> **Como escrever:** duas camadas. A primeira já está escrita (vale para todo site — **mantenha**); a segunda
> é o que só vale neste projeto: um componente que não se toca, uma biblioteca proibida, uma rota legada que
> precisa continuar respondendo, um limite de peso de página.
>
> **Regra de ouro: referencie, nunca duplique.** Cada regra abaixo tem uma spec dona — uma linha aqui, o
> detalhe lá.

**Universais do ecossistema** — `AGENTS.md` (raiz) + skill `padrao-escrita`: SRP; função ≤ 40 linhas;
aninhamento ≤ 3; ≤ 4 parâmetros; **zero hardcoded** (tunables em `config.json`, segredos só em `.env`).

**Universais de site:**
- **Nenhum token visual hardcoded.** Cor, fonte, espaçamento e raio vêm do design system definido em
  `arquitetura/01.01-identidade-visual.md`. Hex solto no componente é violação.
- **Nenhum texto visível fora do tom de voz** de `arquitetura/01.02-tom-de-voz-e-copy.md`. Copy inventado por
  agente é violação — e conteúdo institucional (números, promessas, credenciais) **nunca** é inventado.
- **Acessibilidade é requisito, não polimento:** o nível WCAG exigido em
  `arquitetura/02.03-acessibilidade-e-performance.md` vale para toda entrega — contraste, foco visível, navegação
  por teclado, `alt` real, hierarquia de headings, rótulo em todo campo.
- **Performance é orçamento, não meta:** os Core Web Vitals de `arquitetura/02.03` são limite de aceite. Imagem
  sem otimização/dimensão declarada e script de terceiro sem justificativa reprovam.
- **SEO não é opcional:** título, descrição, OG, `canonical` e JSON-LD conforme
  `arquitetura/01.03-dados-institucionais-seo.md`. **NAP consistente** em todo o site — divergir de `01.03` é defeito.
- **LGPD:** consentimento e páginas legais conforme `specs/03.05-paginas-legais-e-cookies.md`. Nenhum script de
  rastreio dispara antes do consentimento.
- **Estrutura de arquivos** conforme `arquitetura/02.02-estrutura-de-codigo.md`, inclusive a separação
  UI × conteúdo. Texto dentro de componente, quando `arquitetura/02.02` manda separar, é violação.

**Específicas deste site:**

<!-- PREENCHER -->

---

# 3. Stack e arquitetura em uma página

> **Como escrever:** o mínimo para orientar, com ponteiro para o detalhe. Inclua:
> - **Stack**: framework e versão, estratégia de renderização (SSG/SSR/ISR), CSS, gerenciador de pacotes,
>   hospedagem/domínio, CMS ou fonte de conteúdo, i18n (se houver).
> - **Camada de padrão da linguagem**: qual skill `padrao-*` se aplica (site normalmente `padrao-typescript`).
> - **Mapa de rotas**: tabela `rota → página → spec dona`. Se o site tem muitas rotas, aponte para a spec de
>   navegação em vez de listar tudo.
> - **Comandos vitais**: instalar, rodar em dev, buildar, rodar teste/lint, auditar (Lighthouse/a11y) —
>   copiáveis e verificados.
>
> Cada item aponta para a spec de `arquitetura/` que o detalha. Esta seção é o índice, não o tratado.

<!-- PREENCHER -->

---

# 4. Mapa de roteamento — "que spec eu leio para esta tarefa?"

> **Como escrever:** a tabela abaixo já cobre a estrutura padrão de um site — **mantenha e ajuste**. Acrescente
> uma linha por tipo de tarefa recorrente que este site tenha e que não esteja prevista (blog, área de
> downloads, integração com CRM, i18n). Remova o que não existir. Caminhos relativos a `specs/`.
>
> As specs fixas são numeradas por **família** (`FF.NN-<slug>.md`); o catálogo é [[00-planejamento]] §1 —
> aponte para ele, nunca copie as famílias aqui.
> **Ponteiro órfão é defeito**: toda spec citada tem de existir.

| Tipo de tarefa | Leia antes (specs fixas) | Capacidade |
|---|---|---|
| Alterar seção/conteúdo da Home | `specs/03.02-pagina-home.md` + `arquitetura/01.01` + `arquitetura/01.02` | [[00-knowledge]] |
| Header, footer, menu mobile, navegação | `specs/03.01-layout-global-e-nav.md` + `arquitetura/02.02` | `site-organizacao` |
| Criar página interna ou hub/catálogo | `specs/03.03-paginas-internas-e-hub.md` + `arquitetura/02.02` | `site-organizacao` |
| Criar/alterar rota, sub-aba, i18n | `specs/03.01-layout-global-e-nav.md` + `arquitetura/02.02` | `site-organizacao` |
| Formulário, validação, captura de lead | `specs/03.04-formularios-e-contato.md` + `specs/03.05` (consentimento) | `cyber-api` |
| Escrever ou revisar texto visível | `arquitetura/01.02-tom-de-voz-e-copy.md` | — |
| Cor, fonte, espaçamento, componente visual | `arquitetura/01.01-identidade-visual.md` | — |
| Meta tags, JSON-LD, sitemap, robots, GEO/AEO | `arquitetura/01.03-dados-institucionais-seo.md` | `site-seo` |
| Imagem, fonte, bundle, LCP/CLS | `arquitetura/02.03-acessibilidade-e-performance.md` | `otimizacao-nivel-1` |
| Contraste, foco, `aria`, navegação por teclado | `arquitetura/02.03-acessibilidade-e-performance.md` | `site-organizacao` |
| Organização de pastas, componentes, dados | `arquitetura/02.02-estrutura-de-codigo.md` | `padrao-typescript` |
| Stack, build, deploy, hospedagem, domínio | `arquitetura/02.01-stack-tecnologica.md` | `deploy-vercel` |
| Cookies, política de privacidade, LGPD | `specs/03.05-paginas-legais-e-cookies.md` | `cyber-dados` |

<!-- PREENCHER: linhas específicas deste site -->

---

# 5. Como se trabalha aqui (ciclo SDD)

> **Seção universal — mantenha como está.** Só acrescente desvios reais deste projeto (por exemplo: "toda plan
> que altera copy publicado exige aprovação do cliente antes da execução").

**Toda e qualquer alteração passa pelo revisor.** Nada é alterado "direto no código" — mas nem toda alteração
vira arquivo. O revisor **tria** cada demanda ([[00-prompt-revisor]] §4):

| A demanda deixa verdade documentada para trás? | Via | O que nasce |
|---|---|---|
| **Sim** — identidade visual, copy publicado, rota, regra de formulário, SEO | **plan** | `plan-FF.NN` + linha no [[00-indice]] |
| **Não** — typo, `alt` faltando, link quebrado, imagem sem otimizar | **prompt direto** | nada; a instrução vive só na conversa |

A via direta encurta a **papelada**, nunca a **verificação**: o executor trabalha igual e o revisor confere o
diff linha por linha do mesmo jeito. O ciclo abaixo é o da **plan**; a via direta salta os passos de síntese
e expurgo, porque não há verdade a transportar.

```
revisor escreve  specs/plan/plan-FF.NN-<slug>.md  +  linha no 00-indice
      ↓
executor lê  00-prompt-executor  +  plan-FF.NN  e executa
      ↓
alterações ficam no worktree (nenhum agente commita)
      ↓
revisor VERIFICA diretamente (não confia no resumo do executor)
      ├─ reprovado → prompt de correção → executor corrige → repete
      └─ aprovado  → status 🟢 + revisor PROPÕE a síntese
      ↓
usuário AUTORIZA → revisor sintetiza nas specs fixas (adr/ · arquitetura/ · specs/),
acrescenta o bloco `## Síntese` e então REMOVE a plan e a linha do índice
      ↓
usuário commita — código, spec fixa e a remoção da plan na mesma unidade
```

**A plan é temporária**: vive em `specs/plan/` enquanto o trabalho está aberto e **some no ato da síntese**.
Não há estado "sintetizada aguardando limpeza" — o rastro passa a viver no Git. Por isso o [[00-indice]] tem
tamanho limitado pelo trabalho em andamento, e não pela idade do site.

Achado fora do escopo, em qualquer ponto, desce para o [[00-backlog]] — **nunca** vira plan nova no meio do
caminho.

| Papel | Spec de entrada | Pode escrever | Nunca faz |
|---|---|---|---|
| **Revisor** | [[00-prompt-revisor]] | plans, `00-indice`, `00-backlog`, specs fixas (na síntese autorizada), prompts | tocar código · commitar |
| **Executor** | [[00-prompt-executor]] | código + resumo (na plan, ou na conversa) | criar/alterar outras specs · commitar · mover ou remover plan |
| **Usuário** | — | qualquer coisa | — (é quem commita, autoriza a síntese e promove itens do backlog) |

> **Nenhum agente commita e nenhum agente adiciona co-autoria.** A única exceção é solicitação expressa do
> usuário naquela conversa — e, mesmo então, sem `Co-Authored-By` e sem qualquer outra marca de autoria de
> agente na mensagem.

<!-- PREENCHER: desvios específicos deste projeto, se houver -->

---

# 6. Capacidades disponíveis

> **Seção universal — não preencha.** Skills, commands, agents e hooks **não vivem neste repositório**: vêm da
> base Sarak instalada no agente. O catálogo e as regras de roteamento estão em [[00-knowledge]].

Antes de escolher **como** fazer algo, leia **[[00-knowledge]]**. Para site, as capacidades mais frequentes
são `site-organizacao` (rotas, abas, a11y), `site-seo` (indexação, GEO, AEO), `site-criacao` (detalhamento
arquitetural), `otimizacao-nivel-1` (Core Web Vitals), `deploy-vercel` e `padrao-typescript`.

---

# 7. Fronteiras — o que nunca fazer neste site

> **Como escrever:** bullets no imperativo negativo, cada um com o **porquê** em meia linha. Só o que é
> específico deste projeto. Tipos de item que costumam aparecer em site: dado institucional que só o cliente
> altera (CNPJ, endereço, telefone); número/promessa que não pode ser inventado; rota publicada que não pode
> mudar de endereço sem redirect; script de terceiro que não pode ser adicionado; asset gerado que não se
> edita à mão; domínio/DNS que ninguém toca sem autorização.

<!-- PREENCHER -->

---

# 8. Estado e pendências conhecidas

> **Como escrever:** o que um agente descobriria do jeito difícil. Página ainda não construída, conteúdo
> provisório (*lorem*/placeholder) que não pode ir para produção, imagem pendente do cliente, integração
> mockada, dívida de a11y aceita com prazo. **Datas sempre absolutas** (`2026-08-01`). Item resolvido sai
> daqui — histórico é `git` e `adr/`.

<!-- PREENCHER -->

---

# 9. Contrato de manutenção desta spec

- **Alvo de tamanho:** ≤ 220 linhas preenchidas. Estourou? O conteúdo pertence a uma spec de `arquitetura/`
  ou `specs/` — mova e aponte.
- **Referencie, nunca duplique.** Esta spec é um **mapa**, não território.
- **Ponteiro órfão é defeito.** Toda spec citada existe; todo comando citado roda.
- **Só o revisor edita**, e só no contexto de uma plan aprovada.
- **Sincronia obrigatória:** se uma plan mudou stack, identidade, rota ou regra, a mesma plan atualiza esta
  spec. Contexto desatualizado é pior que contexto ausente — o agente confia nele.
