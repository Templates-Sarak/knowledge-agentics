# Schema.org, GEO Local e AEO/GSO

Referência dos passos 3, 6 e 7 de `site-seo`. Templates JSON-LD prontos em `assets/`.

## Tipos JSON-LD (quando usar cada um)

| Tipo | Quando | Campos-chave |
|---|---|---|
| `Organization` | todo site | name, url, logo, sameAs (perfis sociais) |
| `LocalBusiness` | negócio com endereço físico | name, image, **NAP**, geo (lat/long), openingHours |
| `BreadcrumbList` | páginas em hierarquia | itemListElement (reflete as rotas da `site-organizacao`) |
| `FAQPage` | páginas com perguntas | mainEntity (Question → acceptedAnswer) — captura featured snippets/IA |
| `Product` / `Article` | e-commerce / blog | conforme o conteúdo |

Injete como `<script type="application/ld+json">` no `<head>` (ou fim do `<body>`). Valide no
**Rich Results Test** (search.google.com/test/rich-results) e no validador do schema.org.

## GEO local
- **NAP (Name, Address, Phone) idêntico** em todas as referências do site (rodapé, contato, schema).
- `LocalBusiness` com `geo` (coordenadas) e `openingHoursSpecification`.
- Páginas por localidade (`/[servico]/[cidade]`) **só com conteúdo real e único** — cidade trocada e vazia é spam.
- Google Business Profile consistente com o site (fora do código, mas alinhe os dados).

## AEO/GSO (motores de resposta de IA)
- **Chunks:** parágrafos temáticos curtos sob subtítulos claros — fáceis de citar.
- **Pirâmide invertida:** a resposta direta vem **primeiro**, o detalhe depois.
- **Estruture dados:** tabelas e listas para comparativos/preços/specs (raspáveis).
- **Texto limpo:** fatos-chave (preços, serviços, locais) em texto, **nunca** só em imagem.
- `FAQPage` schema reforça a captura de respostas.

> Performance (CWV) afeta ranqueamento, mas é da `otimizacao-nivel-1`. Aqui só se referencia.
