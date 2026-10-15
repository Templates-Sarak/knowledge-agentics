# Git e GitHub — a Fase D (publicação)

Padrão de mercado, sem reescrever histórico: **tag anotada + branch de integração**. O corte é um commit
a mais (squash do `marco-0`), nunca um commit único substituindo a história.

## Pré-voo

```
python scripts/check_publish.py --root <alvo> --json
```

| checagem | por quê |
|---|---|
| `version-aligned` | a tag precisa cair num commit com `package.json` já em `1.0.0` |
| `tag-free` | `v1.0.0` não pode existir |
| `changelog-section` | a Release (e o leitor) usam a seção `1.0.0` |
| `tag-triggers-deploy` | workflow com `on: push: tags` ou `on: release` **faz deploy** ao criar a tag |
| `develop-in-ci` | workflows costumam filtrar só `main`; `develop` precisa de `pull_request`/`push` |
| `gh-auth`, `branch-protection` | `gh` autenticado; proteção de branch pode não existir no plano (repo privado Free) |

`fail` bloqueia. `warn`/`unknown` exigem leitura e decisão do usuário — `unknown` nunca é `pass`.

## A ordem (um HITL por ato que sai da máquina)

1. **PR** `marco-0` → `main`, corpo = `assets/relatorio-marco-0.md` (o relatório vive no PR, porque os
   commits da branch somem no squash):
   `gh pr create --base main --head marco-0 --title "chore: marco-0" --body-file <relatorio.md>`
2. **Squash merge** — um commit `chore: marco-0` na `main`, desfazível com um único `git revert`:
   `gh pr merge <n> --squash`
3. **Tag anotada** sobre esse commit, depois de `git switch main && git pull`:
   `git tag -a v1.0.0 -m "marco-0: primeira versão em produção"` · `git push origin v1.0.0`
4. **`develop`** a partir do mesmo commit — todo trabalho posterior nasce nela:
   `git switch -c develop` · `git push -u origin develop`
5. **Proteção da `main`** (default, protegida; integração por PR vinda da `develop`). Leia o plano antes:
   repositório privado em plano Free **não** tem branch protection — declare a lacuna, não finja. Dev solo:
   sem *review* obrigatório (ou com bypass de admin), senão o PR trava. Aplique por `gh api -X PUT
   repos/{owner}/{repo}/branches/main/protection` com o corpo que o usuário aprovar.
6. **Release** (opcional, oferecida): `gh release create v1.0.0 --title "v1.0.0" --notes-file <trecho do
   CHANGELOG>`. Tag é só ponteiro; a Release é a página com notas, selo *Latest* e gancho `on: release`.
   Pouco valor em repositório interno sem consumidores — **proponha, não imponha**.

## O que a skill não faz

- Reescrever histórico, `force push`, apagar branch remota, ou publicar sem o HITL do ato.
- Criar a tag antes de revisar os workflows de tag/release.
- Alterar secrets das Actions ou rotacionar credenciais.

## Depois

Comunique o time: a `develop` é a base de trabalho; `main` só recebe PR. Branches antigas e PRs abertos
continuam válidos (o histórico não mudou).
