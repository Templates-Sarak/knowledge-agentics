"""
scaffold_skill.py — gera o esqueleto determinístico de uma skill nova no padrão de 3 camadas.

Uso:
    python scaffold_skill.py <skill-name> [--dir <destino>] [--with-script]

Argumentos:
    skill-name      Nome da skill em kebab-case com prefixo de área (ex.: code-review).
    --dir           Diretório onde a pasta da skill será criada. Padrão: diretório atual.
    --with-script   Também cria scripts/<skill-name>.py (stub). Por padrão scripts/ não é criado.

Retorno:
    Imprime um JSON com {"skill": <nome>, "path": <caminho>, "created": [arquivos criados]}.
    Sai com código != 0 (e mensagem em stderr) se o nome for inválido ou a pasta já existir.

Regras (CLAUDE.md): zero hardcoded (nome e destino vêm de argumentos), zero segredos,
responsabilidade única (só gera estrutura — não valida conteúdo nem escreve lógica de skill).
"""
import argparse
import json
import re
import sys
from pathlib import Path

# Padrão de nome exigido pela skill meta-create-skill: kebab-case com prefixo de área.
# Vocabulário FECHADO de prefixos (ver SKILL.md "Convenção de nomes"). Amplie quando a área ganhar tração.
PADRAO_NOME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
PREFIXO_PROIBIDO = "skill-"
PREFIXOS_VALIDOS = ("padrao-", "code-", "test-", "db-", "deploy-", "otimizacao-", "obs-", "site-", "api-", "git-", "cyber-", "meta-")


def validar_nome(nome: str) -> None:
    """Garante kebab-case com prefixo de área válido. Levanta ValueError com a razão se inválido."""
    if not PADRAO_NOME.match(nome):
        raise ValueError(
            f"nome inválido: '{nome}'. Use kebab-case minúsculo "
            f"(ex.: 'code-review') — sem maiúsculas, espaços ou underscores."
        )
    if nome.startswith(PREFIXO_PROIBIDO):
        raise ValueError(
            f"nome inválido: '{nome}'. Não use o prefixo redundante '{PREFIXO_PROIBIDO}' "
            f"— escolha um prefixo de área: {', '.join(PREFIXOS_VALIDOS)}."
        )
    if not nome.startswith(PREFIXOS_VALIDOS):
        raise ValueError(
            f"nome inválido: '{nome}'. Falta um prefixo de área válido "
            f"({', '.join(PREFIXOS_VALIDOS)}) — ex.: 'code-review'."
        )


def conteudo_skill_md(nome: str) -> str:
    """Stub do SKILL.md denso (Camada 2) com as seções-padrão e placeholders."""
    return f"""---
name: {nome}
description: [O QUE faz, 1 frase] + [QUANDO/gatilhos: "Use ao…"]. [SE sob demanda: "Use APENAS quando o usuário solicitar explicitamente. NÃO acione proativamente."]
---

# Skill: [Nome Descritivo]

[1–2 linhas: o que a skill faz e o que a diferencia.]

> Padrões globais em `CLAUDE.md`; estrutura/contratos em `PADRAO-ORGANIZACAO.md`. Referencie, não duplique.

## Quando usar
- [Situação que dispara o uso]
- [Como é acionada: proativa ao detectar X / sob demanda / por command]

## Workflow
Trate **um [item] por vez**.

1. **[Passo]** — [ferramenta + ação + output/critério].
2. **[Passo]** — [ação]. _(detalhe em `references/workflow.md`)_
3. **[Passo HITL]** — se modifica algo, apresente o Plano de Execução e aguarde confirmação.

## Regras e limites
- **NÃO** [proibição] — [justificativa].
- **NUNCA** [proibição] — [justificativa].
- **NÃO** saia do escopo: ao detectar problema do tipo [X], registre e passe para `[skill]`.

## Checklist "pronta"
- [ ] A `description` tem o quê + quando/gatilhos (+ trava, se sob demanda)?
- [ ] Cada passo é acionável (ferramenta + ação + critério)?
- [ ] [Item verificável]

## Referências (Camada 3 — leia sob demanda)
- `references/workflow.md` — workflow detalhado com antes/depois.
- `references/templates.md` — templates de preenchimento. *(remova se não houver)*
- `references/examples.md` — exemplo bom e ruim. *(remova se não houver)*
"""


def conteudo_workflow_md(nome: str) -> str:
    return f"""# Workflow Detalhado: {nome}

Versão expandida do workflow do `SKILL.md`. Leia quando precisar do detalhe de um passo.
Trate **um [item] por vez**.

## Passo 1: [Nome]
**Objetivo:** [o que alcança]
1. [Ação atômica com ferramenta declarada]

**O que detectar:**
- [Sintoma]

**Como corrigir:**
1. [Ação concreta]

**Antes:**
```
[estado com problema]
```

**Depois:**
```
[estado corrigido]
```
"""


def conteudo_templates_md(nome: str) -> str:
    return f"""# Templates de Preenchimento: {nome}

[Blocos copiáveis dos outputs que esta skill produz. Placeholders em [colchetes].
Remova este arquivo (e seu ponteiro no SKILL.md) se a skill não produz output.]
"""


def conteudo_examples_md(nome: str) -> str:
    return f"""# Exemplos: {nome}

## Exemplo bom
### Cenário
[contexto]
### Antes
[com problema]
### Depois
[corrigido]

## Exemplo ruim
### Estado incorreto
[errado]
**Por que é ruim:**
| Problema | Impacto |
|----------|---------|
| [violação] | [impacto] |
"""


def conteudo_script_stub(nome: str) -> str:
    return f'''"""
{nome}.py — [o que faz em uma frase].

Uso:
    python {nome}.py <alvo> [--config config.json]

Retorno:
    [o que imprime/gera].

Regras (CLAUDE.md): zero hardcoded, zero segredos, responsabilidade única.
"""
import argparse
import json
from pathlib import Path


def executar(alvo: Path) -> list:
    """Faz UMA coisa. Retorna estrutura clara para o agente consumir."""
    return []


def main() -> None:
    parser = argparse.ArgumentParser(description="[descrição]")
    parser.add_argument("alvo", help="Caminho a processar")
    args = parser.parse_args()
    print(json.dumps(executar(Path(args.alvo)), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
'''


def criar_skill(nome: str, destino: Path, com_script: bool) -> dict:
    """Cria a estrutura da skill. Levanta FileExistsError se a pasta-alvo já existir."""
    raiz = destino / nome
    if raiz.exists():
        raise FileExistsError(f"a pasta já existe: {raiz}")

    arquivos = {
        raiz / "SKILL.md": conteudo_skill_md(nome),
        raiz / "references" / "workflow.md": conteudo_workflow_md(nome),
        raiz / "references" / "templates.md": conteudo_templates_md(nome),
        raiz / "references" / "examples.md": conteudo_examples_md(nome),
    }
    if com_script:
        arquivos[raiz / "scripts" / f"{nome}.py"] = conteudo_script_stub(nome)

    criados = []
    for caminho, conteudo in arquivos.items():
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_text(conteudo, encoding="utf-8")
        criados.append(str(caminho))

    return {"skill": nome, "path": str(raiz), "created": criados}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Gera o esqueleto de uma skill nova no padrão de 3 camadas."
    )
    parser.add_argument("skill_name", help="Nome em kebab-case com prefixo de área (ex.: code-review)")
    parser.add_argument("--dir", default=".", help="Diretório de destino (padrão: atual)")
    parser.add_argument(
        "--with-script", action="store_true", help="Também cria scripts/<nome>.py (stub)"
    )
    args = parser.parse_args()

    try:
        validar_nome(args.skill_name)
        resultado = criar_skill(args.skill_name, Path(args.dir), args.with_script)
    except (ValueError, FileExistsError) as erro:
        print(f"erro: {erro}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
