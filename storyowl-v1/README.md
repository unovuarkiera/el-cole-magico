# StoryOwl V1 — Arquitectura Industrial

> Sistema paralelo al V0. No toca ningún archivo de producción.

## Estructura

```
storyowl-v1/
├── backend/           — Servidor Express + workers
├── pdf-engine/        — Motor PDF server-side (300dpi, Gelato-ready)
├── prompts/           — Sistema de prompts (spreads, character bible, historia)
├── storage/           — Cloudinary + Supabase
├── gelato/            — API client Gelato
├── frontend/          — Nueva UI V1
├── shared/            — Constantes y LANGS multiidioma
└── config/            — Especificaciones Gelato 20x20
```

## Decisiones técnicas definitivas

| Concepto | Decisión |
|----------|----------|
| Formato libro | 20×20 cm tapa dura |
| Proveedor | Gelato |
| Páginas | 30 |
| Imágenes | Spreads dobles 2048×1024 |
| Diseño | Opción B (franja de texto inferior) |
| PDF | Server-side, 300dpi, bleed 3mm |
| Storage | Cloudinary (imágenes) + Supabase (PDFs) |
| Cola | BullMQ + Upstash Redis |
| Email | Resend.com |

## Estructura de páginas (30 páginas)

| # | Contenido | Generación |
|---|-----------|------------|
| 1 | Portada | IA (1024×1024) |
| 2 | Guarda inicial | Código (color sólido) |
| 3 | Dedicatoria | Código |
| 4-21 | Historia (9 spreads = 18 páginas) | IA (2048×1024 × 9) |
| 22 | FIN | Código |
| 23 | Contraportada interior | Código |
| 24-30 | Guardas / padding Gelato | Código |

**Total llamadas IA: 10** (vs 17 en V0) — **ahorro 41%**

## Modelo de preview

| Fase | Imágenes generadas | Calidad | Coste |
|------|-------------------|---------|-------|
| Preview gratuita | Portada + 2 spreads | low | ~€0.12 |
| Libro completo (tras pago) | 7 spreads restantes | medium | ~€0.49 |

## Setup local

```bash
# 1. Instalar dependencias
cd storyowl-v1
npm install

# 2. Configurar variables de entorno
cp .env.example .env.v1
# Editar .env.v1 con tus claves

# 3. Arrancar (puerto 3001, no interfiere con V0 en 3000)
npm start
```

## Despliegue en Render (paralelo a V0)

1. Crear nuevo Web Service en Render
2. Conectar al mismo repositorio GitHub
3. **Branch:** `storyowl-v1`
4. **Root Directory:** `storyowl-v1`
5. **Build Command:** `npm install`
6. **Start Command:** `node backend/server.js`
7. **Plan:** Starter ($7/mes) — disco persistente, sin sleep
8. Añadir variables de entorno (las de .env.example)

**URL de pruebas:** `storyowl-v1.onrender.com`  
**Producción actual:** `el-cole-magico.onrender.com` ← INTACTO

## Cómo funciona el pipeline V1

```
Usuario rellena formulario
    ↓
POST /v1/generate (SSE)
    ↓
Claude → historia completa 18 páginas
    ↓
gpt-image-2 → portada + 2 spreads (low quality, preview)
    ↓
PDF preview server-side con watermark → base64 al frontend
    ↓
Usuario ve preview → CTA pago
    ↓ (tras pago Stripe)
gpt-image-2 → 7 spreads restantes (medium quality)
    ↓
PDF completo 300dpi, 30 páginas, bleed 3mm → Supabase Storage
    ↓
Email automático con link de descarga (Resend)
    ↓ (si libro físico)
Gelato API → pedido automático → impresión y envío
```

## Rama Git

```bash
# El sistema V0 sigue en main, intacto
git checkout main        # V0 producción — NUNCA TOCAR
git checkout storyowl-v1 # V1 desarrollo paralelo
```

## Estado de desarrollo

- [x] Estructura de carpetas
- [x] Especificaciones Gelato 20x20
- [x] Sistema de prompts (spreads, character bible, historia)
- [x] Worker de historia (Claude)
- [x] Worker de imágenes (spreads dobles)
- [x] Motor PDF (composer.js, todas las páginas)
- [x] Worker de PDF
- [x] Ruta /v1/generate con SSE
- [x] Sistema multiidioma completo
- [ ] Storage Cloudinary
- [ ] Storage Supabase
- [ ] Stripe
- [ ] Email Resend
- [ ] Gelato API
- [ ] Frontend V1
- [ ] Tests end-to-end
