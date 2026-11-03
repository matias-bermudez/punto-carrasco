# Punto Carrasco Automóviles — web

Sitio de Punto Carrasco Automóviles (Av. Giannattasio, Ciudad de la Costa): autos usados con el precio a la vista, ficha de cada auto, vendé o permutá y dónde estamos, todo coordinado por WhatsApp. El dueño carga los autos y los datos del negocio desde el panel (`/admin/`).

**Web:** https://punto-carrasco.pages.dev/

## Cómo funciona

- La web es estática. `scripts/generar.js` (Node, sin dependencias) arma todas las páginas, una por auto, con SEO.
- Los autos, las fotos y los datos del negocio viven en Supabase. La web no lo consulta en vivo: GitHub Actions regenera y publica en cada push, cada vez que se guarda algo en el panel y, como respaldo, cada 15 minutos si hubo cambios.

## Probar en local

```sh
node scripts/generar.js --local --ejemplos   # con los autos de ejemplo de js/autos.js
python3 -m http.server 8832 -d _site          # → http://localhost:8832
```
