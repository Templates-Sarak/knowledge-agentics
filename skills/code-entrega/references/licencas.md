# Catálogo de Licenças

Material do **passo 2 (HITL)**: apresente a tabela-resumo, explique os trade-offs e ajude o usuário a
escolher. Cada licença tem um **SPDX id** (usado no `package.json`) e uma URL canônica para o texto completo.

## Tabela-resumo (mostre esta no HITL)

| Licença | SPDX | Tipo | Uso comercial | Patente | Exige abrir derivados? | Quando escolher |
|---|---|---|---|---|---|---|
| MIT | `MIT` | Permissiva | ✅ | ❌ | ❌ | Padrão simples para lib/projeto aberto; máxima adoção. |
| Apache-2.0 | `Apache-2.0` | Permissiva | ✅ | ✅ (grant) | ❌ | Como MIT, mas com proteção explícita de patentes. |
| BSD-3-Clause | `BSD-3-Clause` | Permissiva | ✅ | ❌ | ❌ | Permissiva + cláusula anti-endosso do nome do autor. |
| MPL-2.0 | `MPL-2.0` | Copyleft fraco | ✅ | ✅ | Só os **arquivos** alterados | Quer manter os *seus* arquivos abertos, mas permitir uso em produto fechado. |
| GPL-3.0 | `GPL-3.0-or-later` | Copyleft forte | ✅ | ✅ | ✅ (todo o derivado) | Software distribuído que deve permanecer livre. |
| AGPL-3.0 | `AGPL-3.0-or-later` | Copyleft forte + rede | ✅ | ✅ | ✅ (incl. uso via **SaaS/rede**) | SaaS que quer obrigar abertura mesmo sem distribuir binário. |
| Unlicense | `Unlicense` | Domínio público | ✅ | ❌ | ❌ | Abrir mão de todos os direitos; sem qualquer condição. |
| Proprietária | `UNLICENSED` | Fechada | Restrito | — | ❌ | Código privado; todos os direitos reservados. |

> Recomendações rápidas: **lib/SDK aberta** → MIT ou Apache-2.0 (Apache se patentes importam); **app SaaS
> que quer copyleft** → AGPL-3.0; **produto/código privado** → Proprietária; **abrir mão total** → Unlicense.

## Onde vai o copyright (importante na hora de aplicar)
- **Corpo do `LICENSE` leva a linha de copyright** → MIT, BSD-3-Clause, Proprietária. Preencha `[ANO]`/`[NOME]`.
- **`LICENSE` é texto fixo verbatim; copyright vai nos headers/README** → Apache-2.0, MPL-2.0, GPL-3.0, AGPL-3.0.
  - Apache-2.0: corpo verbatim + apêndice/headers com `Copyright [ANO] [NOME]`.
  - GPL-3.0 / AGPL-3.0: corpo verbatim; em cada arquivo o cabeçalho-padrão recomendado pela FSF com autor/ano.
  - MPL-2.0: corpo verbatim; arquivos cobertos referenciam a MPL no header.
- **Unlicense**: texto fixo, sem nome.

## Templates e fontes
- Curtas (prontas em `assets/licenses/`): `MIT.txt`, `BSD-3-Clause.txt`, `Unlicense.txt`, `Proprietary.txt`.
- Longas (escrever verbatim da fonte oficial):
  - Apache-2.0 → https://www.apache.org/licenses/LICENSE-2.0.txt
  - MPL-2.0 → https://www.mozilla.org/media/MPL/2.0/index.txt
  - GPL-3.0 → https://www.gnu.org/licenses/gpl-3.0.txt
  - AGPL-3.0 → https://www.gnu.org/licenses/agpl-3.0.txt

> SPDX id no `package.json`: use o da tabela. Proprietária = `"license": "UNLICENSED"` e `"private": true`.
