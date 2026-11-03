# Punto Carrasco Automóviles — web

Web de **Punto Carrasco Automóviles** (Av. Giannattasio, Ciudad de la Costa, Canelones). Hasta el lanzamiento queda con `indexar: false` (noindex).
Sigue las reglas de la Plataforma Automotoras (`~/Proyectos/plataforma-automotoras/README.md`); implementación de referencia: DN (`~/Proyectos/DNAutos`).

- Repo: https://github.com/matias-bermudez/punto-carrasco (público, GitHub Pages con fuente GitHub Actions)
- Web: https://punto-carrasco.pages.dev/
- Seguimiento: issues del repo. Los commits cierran issues con `Closes #N`.
- Base compartida: `concesionaria: 'punto-carrasco'`. Workflow que publica: `publicar.yml`.

Probar en local (el resto de los puertos los usan otros proyectos):
`node scripts/generar.js --local --ejemplos && python3 -m http.server 8832 -d _site` → http://localhost:8832
Sin `--ejemplos` lee la base (sin autos cargados se ve el estado vacío). Probar una fila de `negocios`: `NEGOCIO_JSON=fila.json`.
Capturas: Playwright de `/Users/matibermudez/Proyectos/TapStore-listas/node_modules/playwright`, `devices['iPhone 13']` y escritorio 1440.

| Archivo | Qué es |
|---|---|
| `js/config.js` | WhatsApp, fijo, otro celular, dirección, horarios, redes, financiación, Supabase, `sitio`, `indexar`. La fila de `negocios` lo pisa al publicar |
| `js/autos.js` | Autos de ejemplo para probar en local (fotos en `ejemplos/`). Al publicar se reescribe con los de la base |
| `js/common.js` | Helpers compartidos navegador/generador (`window.PC`): precios, año/km a consultar, horarios, tarjetas, mensajes de WhatsApp |
| `src/*.html`, `src/_partials/` | Plantillas: `{{ dato }}` (sin escapar: el generador escapa) y `{{> parcial }}` |
| `scripts/generar.js` | Lee autos y negocio, baja fotos, arma páginas, JSON-LD, sitemap, robots, estado.json |
| `js/catalogo.js`, `ficha.js`, `vende.js` | Filtros del catálogo, galería de la ficha, formulario de Vendé o permutá |
| `src/admin.html`, `js/admin.js` | Panel (supabase-js 2.45.4): mis autos, editor con "Sacar foto", "Datos del negocio" |
| `css/styles.css`, `fonts/` | Estilos (tokens en `:root`, celular hasta 899 px; panel al final) y fuentes del diseño (Figtree, Instrument Serif, Caveat, OFL) |
| `diseno/` | Diseño original (Claude Design) desempaquetado: `desempaquetar.py`, `sitio.html` y cada pantalla en `paginas/` |

URLs: `/`, `/autos/` (filtros en la URL: `tipo`, `comb`, `caja`, `desde`, `hasta`, `orden`), `/autos/<slug>/`, `/vende-tu-auto/` (acepta `?objetivo=permutar&auto=<slug>`), `/donde-estamos/`, `404.html`, `/admin/`.

Datos en `autos.extra`: `version` (`modelo` = modelo + versión), `sin_km`, `cuotas` (texto bajo el precio), `vendido_el`.
`tipo` se deriva de `carroceria` (Pickup → camioneta, Utilitario → utilitario, el resto auto).
Datos del negocio (tabla `negocios`): `whatsapp`, `telefono` (el WhatsApp como se muestra), `direccion`, `horario` (texto), `instagram`, `facebook`;
en `extra`: `fijo`, `celular`, `ciudad`, `mapa`, `horarios` (`{semana: ['9:00', '19:00'], sabado, domingo}`, null = cerrado), `financiacion`.

## Registro

- 2026-11-02: web armada a partir del diseño (issues #1–#10): inicio, catálogo, ficha, vendé o permutá, dónde estamos, 404, panel con datos del negocio, SEO y publicación con Actions. Arranca sin autos en la base.
- Pendiente: alta de `punto-carrasco` en `concesionarias` (con `repo` y `workflow`), sumar el repo al token de publicación y crear el usuario del panel.
