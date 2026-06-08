# Plano de Otimização (Nível 1 — Custo Zero) — [PÁGINA / ROTA]

**Baseline medida:** LCP [x] s · CLS [x] · INP [x] ms · TBT [x] ms · bundle [x] KB

## 🖼️ Ativos visuais
- [ ] Converter [ARQUIVOS] para `.webp`/`.avif`.
- [ ] `loading="lazy"` em imagens fora da dobra.
- [ ] `fetchpriority="high"` na imagem LCP.
- [ ] `width`/`height` explícitos (evita CLS).

## 💾 Cache e fontes
- [ ] Cache SWR/React Query para [API].
- [ ] `font-display: swap` + `preconnect` em [FONTE].

## 📦 Bundle
- [ ] Code-splitting na rota [ROTA] (`next/dynamic`/`React.lazy`).
- [ ] Imports nomeados / remover lib não usada [LIB].

---
**Ganho estimado:** peso −[x] KB · LCP −[x] s · CLS −[x].
> Será **confirmado por re-medição** após aplicar (não vale estimativa).

⚠️ Confirma a aplicação dessas otimizações de custo zero?
