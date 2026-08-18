# `plugin/` — o sincronizador de IDEs

> **Escopo.** Tudo nesta pasta é **local à base**. Nada daqui viaja para um projeto gerado: na criação
> de um sistema ou de um módulo, viajam apenas `specs/` e o template (`specs/_estrutura_modulos/`).
> O que estiver aqui vale para a máquina que hospeda o `knowledge-agentics`, e só.

| Arquivo | O que é |
|---|---|
| `sync_ide.py` | espelha a base para o cache do Claude e para o Antigravity, e **gera** a tabela de rotas |
| `sarak_routing_table.md` | a tabela de rotas — **gerada** por `sync_ide.py`, e versionada de propósito (§1) |
| `setup_env.py` | preparo de ambiente |

---

## 1. A tabela de rotas usa caminho ABSOLUTO, e é versionada

*Decidido em 2026-08-15. Levantado como defeito numa revisão, examinado, e **mantido**.*

`sarak_routing_table.md` é gerada com ~40 caminhos absolutos. Isso é **necessário, não acidental** — e
a leitura que a chamou de defeito errava em dois pontos:

**A tabela não é lida de dentro do repositório.** O `sync_ide.py` instrui o usuário a colar, **uma
única vez**, nas *Regras Globais* de cada IDE, a frase *"leia o arquivo de rotas centralizado em
`<caminho absoluto>`"*. Nesse contexto o diretório de trabalho é **o projeto-alvo**, nunca a base.
Caminho relativo resolveria contra o projeto errado e falharia **em silêncio** — sem erro nenhum,
apenas skills que "não existem".

> **Não torne os caminhos relativos.** Isso quebra Antigravity e GPT, e quebra sem avisar.

**Versionar a saída é redundante, não incorreto.** O uso real é local e multi-agente (Claude,
Antigravity, GPT) numa máquina só; o `sync_ide.py` regenera a tabela a cada execução.

## 2. A lacuna: mover a base não tem verificador

Se a pasta da base mudar de lugar, rodar o `sync_ide.py` regenera a tabela — **mas a frase colada nas
Regras Globais de cada IDE continua apontando para o endereço antigo, e nada detecta isso.** O sintoma
é o pior possível: o agente não acha a tabela e segue **sem o roteamento, sem avisar**.

> **Mover a base exige recolar a frase nas IDEs, à mão.** É o único passo do fluxo sem verificador, e
> está escrito aqui porque lacuna conhecida é aceitável — lacuna escondida não.

## 3. Como rodar

```bash
cd plugin
python sync_ide.py --target all          # Claude + Antigravity
python sync_ide.py --target antigravity  # só o Antigravity
```

O `.git/hooks/pre-commit` local já roda `--target all` a cada commit. Esse hook vive em `.git/hooks/`,
que **não é versionado**: clone novo, outra máquina ou runner de CI não o têm, e ali o cache fica
parado até alguém rodar o script à mão.
