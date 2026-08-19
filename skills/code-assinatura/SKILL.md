---
name: code-assinatura
description: Detecta, tria e remove assinaturas/créditos de autoria não autorizados no código-fonte, e acerta os metadados de autoria (package.json, pyproject.toml). Use ao limpar assinaturas de IA/colaborador não autorizado ou ao padronizar o autor do projeto. NÃO acione proativamente.
---

# Skill: Assinaturas e Autoria

Dona única de **autoria e assinatura não autorizada**. Separada de `code-licenca` (licenciamento) e
`code-documentacao` (README/CODEOWNERS/CHANGELOG) — cada pilar da antiga `code-entrega` tem um dono
só, e esta é a que varre e limpa o que **não deveria estar assinado**.

## Quando usar

- Sob demanda, ao limpar assinaturas de IA/colaborador não autorizado ("Criado por ChatGPT", `@author`
  de terceiro) ou ao padronizar quem é o autor do projeto.
- Mutativa (remove conteúdo e edita metadados) → HITL obrigatório antes de remover.

## Workflow

1. **Varrer** — `python scripts/scan_assinaturas.py --raiz <projeto>`; a saída é candidato, não verdade.
2. **Triar** — cruze cada achado contra `scripts/config.json` (`autorizados`); descarte quem já está
   na lista.
3. **HITL** — apresente a lista triada (arquivo:linha:trecho) e pergunte: *"Remover estas N assinaturas
   não autorizadas? Além de {autor de `config.json`}, há outro colaborador a creditar?"* Aguarde.
4. **Limpar** — remova as linhas/blocos confirmados. **Nunca** toque `node_modules`/`vendor` nem
   licenciamento de terceiros.
5. **Acertar metadados** — `package.json:author`, `pyproject.toml` (`[project].authors`/
   `[tool.poetry].authors`) com o(s) nome(s) autorizado(s).
6. **Reportar** — o que foi removido e o que mudou nos metadados.

## Regras e limites

- **NUNCA** remova assinatura sem o HITL do passo 3.
- **NUNCA** toque `node_modules`/`vendor` nem remova licenciamento de terceiros — só o código-fonte
  do projeto.
- **NÃO** trate a saída de `scan_assinaturas.py` como verdade absoluta — são candidatos; confirme o
  contexto antes de remover.
- **NÃO** decida ou aplique licença — isso é da `code-licenca`.
- **NÃO** escreva `README`/`CODEOWNERS`/`CHANGELOG` — isso é da `code-documentacao`.

## Checklist "pronta"

- [ ] `scan_assinaturas.py` rodado e os achados triados contra `autorizados`?
- [ ] HITL feito e confirmado antes de qualquer remoção?
- [ ] Assinaturas não autorizadas removidas, sem tocar `node_modules`/`vendor`/terceiros?
- [ ] Metadados de autoria (`package.json`/`pyproject.toml`) corretos?
- [ ] Relatado o que foi removido/alterado?

## Referências (Camada 3 — leia sob demanda)

- `scripts/scan_assinaturas.py` + `scripts/config.json` — scanner de assinaturas não autorizadas
  (padrões de detecção + lista de nomes autorizados).
