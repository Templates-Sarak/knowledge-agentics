# Catálogo de Fornecedores (Infra de Performance)

Referência do **passo 3** do `otimizacao-nivel-3`. Preços/limites **mudam** — trate como orientação, não
cotação; confirme no site do fornecedor antes do HITL de faturamento. Muitos têm tier grátis generoso.

## Por gargalo

| Gargalo | Categoria | Opções | Para quê |
|---|---|---|---|
| Mídia pesada / sem CDN | **Image CDN** | Cloudinary, Imgix, Vercel Image Optimization | transformar/entregar imagem otimizada em tempo real, por dispositivo |
| TTFB alto / lógica central | **Edge computing** | Vercel Edge Functions, Cloudflare Workers | rodar lógica (auth/geo/personalização) perto do usuário |
| DB central distante | **DB na borda / cache global** | Upstash (Redis), Turso (libSQL), Cloudflare KV/D1 | dados/cache com latência baixa global |
| HTML dinâmico lento | **Render híbrido** | ISR (Next), Edge Rendering | servir HTML quase estático, revalidado |
| Distribuição global | **CDN / cache** | Cloudflare, Vercel/Fastly | cache de borda com políticas avançadas |
| API repetindo computação | **Cache gerenciado** | Upstash/Redis, Memcached gerenciado | cachear resposta/consulta cara, baixa latência |
| Leitura sobrecarrega o DB | **Read replicas / DB gerenciado** | RDS/Neon/PlanetScale (replicas), autoscaling | escalar leitura sem mexer no schema |
| Trabalho síncrono pesado | **Fila / worker** | SQS, Cloud Tasks, BullMQ/Redis | tirar do caminho da request (async/background) |

## Notas de integração
- **Vercel (Edge/ISR/Image/env):** a configuração de deploy é da skill `deploy-vercel` — aqui se decide e integra; lá se publica.
- **Chaves/segredos:** sempre no `.env` (vars prefixadas por módulo, ex.: `CLOUDINARY_API_KEY`), `.env.example` versionado — ver `padrao-escrita`.
- **Custo:** estime por tráfego aproximado e cheque o tier grátis; só leve ao HITL números que você confirmou na fonte.

> Faixas de custo são voláteis e por isso **não** são fixadas aqui — confirme no fornecedor na hora da proposta.
