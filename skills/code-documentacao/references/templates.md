# Templates — code-documentacao

Conteúdos estáticos e copiáveis para agilizar `CODEOWNERS` e `CONTRIBUTING.md`. O template do
`README.md` é `assets/README.template.md` (mais completo, cobre a anatomia inteira). Catálogo de
licenças e seu HITL são da `code-licenca` — não duplicados aqui.

## Template: CODEOWNERS

```text
# Garante que todo o código pertence ao autor listado,
# bloqueando merges de PRs automáticos/terceiros sem review dele.
*       @<NomeAutor/Username>
```

## Template: CONTRIBUTING.md

```markdown
# Contribuindo

Agradecemos o interesse em contribuir! Siga as diretrizes abaixo:

1. Crie um fork do repositório ou uma branch com sua feature: `feature/minha-feature`.
2. Certifique-se de que os testes passam e que o código segue o padrão de linters adotado (`padrao-escrita`).
3. Siga o padrão de *Conventional Commits* (ex: `feat: add nova func`, `fix: corrige bug no painel`).
4. Abra um Pull Request detalhando o que foi feito.

Qualquer alteração estrutural pode sofrer revisão do Codeowner do projeto antes do merge.
```
