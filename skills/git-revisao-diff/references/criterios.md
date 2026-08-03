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
| Go | `golangci-lint` — `funlen`, `nestif`, `gocyclo`, `errcheck` (o hook `padrao-limiares` já roda) |
| Java | `checkstyle` — `MethodLength`, `NestedIfDepth`, `ParameterNumber`, `EmptyCatchBlock` (idem) |
| **Qualquer outra** | **sem automação** — confira os limiares **lendo o diff**, e diga no relatório que a checagem foi humana |
- Função ≤ **40** linhas · aninhamento ≤ **3** · ≤ **4** parâmetros · guard clauses.

> **São dois eixos, não um.** A skill de **Nível 2** (idiomas documentados + validador Sarak próprio) existe
> só para TS/JS e Python. O **hook `padrao-limiares`** é outra coisa: cobra os mesmos limiares em `.py`,
> `.ts`/`.js`, `.go` e `.java`, e nunca dependeu das skills. Go e Java perderam o **idioma documentado**,
> não a **checagem de limiar**.
>
> Linguagem sem nenhum dos dois (Rust, C#, PHP…) fica no Nível 0 do `padrao-escrita`, aplicado à mão — e aí
> "não verifiquei por máquina" tem de aparecer no relatório, senão verde vira indistinguível de não-conferido.

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
