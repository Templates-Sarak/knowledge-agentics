# Critérios de Revisão de Diff

Revise **só o que mudou** contra o `padrao-escrita`. Foco na mudança, não no repo (isso é `code-diagnostico`).

## Determinístico (o `revisar_diff.py` cobre)
- **Conflito de merge** (`<<<<<<<`/`>>>>>>>`) → bloqueio.
- **Breakpoint de debug** (`debugger;`, `pdb.set_trace`, `breakpoint()`, `dd(`) → bloqueio.
- **Log de debug** (`console.log`, `print(`, `System.out.print`, `fmt.Print`) → aviso (norma: logger estruturado, ver `obs-logs`).
- **Marcador pendente** (`TODO`/`FIXME`/`XXX`) e **teste pulado** (`.only`/`.skip`) → aviso.

## Limiares (rodar o validador da linguagem nos arquivos alterados)
| Linguagem | Validador |
|---|---|
| Python | `padrao-python/scripts/validate.py <arquivos>` |
| TS/JS | `padrao-typescript/scripts/validate.mjs <arquivos>` |
| Go | `padrao-go` → `golangci-lint` com `.golangci.yml` |
| Java | `padrao-java` → Checkstyle com `checkstyle.xml` |
- Função ≤ **40** linhas · aninhamento ≤ **3** · ≤ **4** parâmetros · guard clauses.

## Conformidade & clareza (julgamento, no que mudou)
- **SRP**: a mudança/função faz **uma** coisa? Nome precisa de "e"? → dividir.
- **Nomes**: revelam intenção, sem abreviação obscura.
- **Zero hardcoded**: literal de config/segredo novo? → `config.json`/`.env` (segredo é da `git-verificacao-commit`).
- **Borda**: input externo novo é validado na `api/`? query parametrizada (sem concatenar SQL)?
- **Testes**: funcionalidade nova vem **com testes** (norma §9)? (ver `test-unitario`)
- **Erros**: exceção tratada (não engolida)? log sem segredo?
- **Encapsulamento**: importou `domain/`/`data/` de outro módulo? → só pelo `api/`.

## Severidade
- **Bloqueio**: conflito de merge, breakpoint de debug, segredo (→ outra skill), violação dura de limiar em código crítico.
- **Aviso**: TODO, log de debug, teste pulado, melhoria de clareza — registrar, não impedir o commit.
