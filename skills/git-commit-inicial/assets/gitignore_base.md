# Template: `.gitignore` inicial

`.gitignore` mínimo a aplicar **antes do primeiro commit**, para nunca versionar segredos,
dependências ou detritos. Adapte por stack `[LINGUAGEM_DO_PROJETO]`.

```gitignore
# Segredos e ambiente (NUNCA versionar)
.env
.env.*
!.env.example
*.pem
*.key

# Dependências
node_modules/
.venv/
venv/
__pycache__/

# Build e saída
dist/
build/
.next/
out/
*.log

# Sistema e editor
.DS_Store
Thumbs.db
.vscode/
.idea/

# Temporários
tmp/
temp/
*.tmp
```

> Antes do `commit inicial`, confirme com `git status --ignored` que `.env` e `node_modules/`
> estão ignorados. O gate por commit é da `git-verificacao-commit`; a auditoria do histórico
> é da `git-especialista-repositorio`.
