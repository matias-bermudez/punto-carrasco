// Arma el sitio estático en _site/ a partir de src/ y los datos de los autos.
// Cada auto tiene su propia página (/autos/<slug>/) con su título, descripción y datos
// estructurados para Google. GitHub Actions lo corre en cada push a main, al guardar en el panel y cada 15 minutos.
//
// Los autos y los datos del negocio salen de Supabase (base compartida, concesionaria de js/config.js).
// Las fotos se bajan y se publican junto con la web, así las visitas no consumen el plan de Supabase.
//
//   node scripts/generar.js                       → para publicar
//   node scripts/generar.js --local               → para probar: python3 -m http.server 8832 -d _site
//   node scripts/generar.js --local --ejemplos    → con los autos de ejemplo de js/autos.js (sin Supabase)
//   SOLO_SI_CAMBIO=1 node scripts/generar.js      → no hace nada si los autos no cambiaron desde la última publicación
//   NEGOCIO_JSON=fila.json node scripts/generar.js --local  → prueba una fila de `negocios` sin tocar la base
//
// Sin dependencias, solo Node 18+.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const SRC = path.join(RAIZ, 'src');
const SALIDA = path.join(RAIZ, '_site');
const ESTATICOS = ['css', 'js', 'img', 'fonts'];

// Se cargan los mismos archivos que usa el navegador.
const ctx = vm.createContext({ window: {} });
const correr = (f) => vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f });
correr('js/config.js');
const C = ctx.window.PC_CONFIG;
const EJEMPLOS = process.argv.includes('--ejemplos');
const SUPABASE = !EJEMPLOS && !!(C.supabaseUrl && C.supabaseKey);

const SITIO = C.sitio.replace(/\/?$/, '/');
const BASE = process.argv.includes('--local') ? '/' : new URL(SITIO).pathname;
const HOY = new Date().toISOString().slice(0, 10);
const NOMBRE = 'Punto Carrasco Automóviles';
const TIPOS = ['auto', 'camioneta', 'utilitario'];

let PC, AUTOS, esc;

async function main() {
  // ---- Datos ----
  let filas = null;
  let negocio = null;
  if (SUPABASE) {
    negocio = await leerNegocio();
    Object.assign(C, configDeNegocio(negocio));
    filas = await leerSupabase();
    ctx.window.PC_AUTOS = filas.map(deFila).filter(Boolean);
  } else {
    correr('js/autos.js');
  }
  correr('js/common.js');
  PC = ctx.window.PC;
  esc = PC.esc;
  if (!SUPABASE) validar(PC.autos);

  const hash = crypto.createHash('sha256').update(JSON.stringify({ autos: filas || PC.autos, negocio })).digest('hex').slice(0, 16);
  if (process.env.SOLO_SI_CAMBIO) {
    const anterior = await fetch(SITIO + 'estado.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (anterior && anterior.hash === hash) {
      console.log('Los autos y los datos del negocio no cambiaron desde la última publicación, no hay nada para publicar.');
      salida('cambio', 'false');
      return;
    }
  }

  fs.rmSync(SALIDA, { recursive: true, force: true });
  for (const dir of ESTATICOS) fs.cpSync(path.join(RAIZ, dir), path.join(SALIDA, dir), { recursive: true });
  if (SUPABASE) {
    // Los datos del negocio de la base también los usa el navegador (formularios, mensajes de WhatsApp).
    // Se reescribe entero (no se agrega al final) para que el número viejo no quede en ningún archivo.
    escribir('js/config.js', '// Generado por scripts/generar.js: js/config.js + datos del negocio de Supabase.\nwindow.PC_CONFIG = ' + JSON.stringify(C, null, 2) + ';\n');
    await bajarFotos(PC.autos);
    // El navegador (filtros del catálogo, galería) usa estos mismos datos.
    escribir('js/autos.js', '// Generado por scripts/generar.js desde Supabase.\nwindow.PC_AUTOS = ' +
      JSON.stringify(PC.autos.map(({ _fotos, ...a }) => a), null, 1) + ';\n');
  } else {
    fs.cpSync(path.join(RAIZ, 'ejemplos'), path.join(SALIDA, 'ejemplos'), { recursive: true });
  }
  AUTOS = PC.recientes();

  generarPaginas();
  escribir('estado.json', JSON.stringify({ hash, generado: new Date().toISOString(), autos: AUTOS.length }) + '\n');
  salida('cambio', 'true');
  console.log(`Listo: ${AUTOS.length} autos (${SUPABASE ? 'Supabase' : 'js/autos.js'}). indexar=${C.indexar} → _site/`);
}

// ---- Supabase ----

function cabeceras() {
  // Las claves nuevas (sb_publishable_...) van solo en apikey; las viejas (anon, JWT) también en Authorization.
  const headers = { apikey: C.supabaseKey };
  if (!C.supabaseKey.startsWith('sb_')) headers.Authorization = 'Bearer ' + C.supabaseKey;
  return headers;
}

async function leerSupabase() {
  const res = await fetch(`${C.supabaseUrl}/rest/v1/autos?select=*&concesionaria=eq.${encodeURIComponent(C.concesionaria)}&order=created_at.desc`, { headers: cabeceras() });
  if (!res.ok) throw new Error(`Supabase respondió ${res.status}: ${await res.text()}`);
  return res.json();
}

// Datos del negocio que el dueño edita desde el panel. Si no hay fila, se usa js/config.js tal cual.
async function leerNegocio() {
  if (process.env.NEGOCIO_JSON) return JSON.parse(fs.readFileSync(process.env.NEGOCIO_JSON, 'utf8'));
  const res = await fetch(`${C.supabaseUrl}/rest/v1/negocios?select=*&concesionaria=eq.${encodeURIComponent(C.concesionaria)}`, { headers: cabeceras() }).catch(() => null);
  if (!res || !res.ok) {
    console.warn(`Aviso: no se pudieron leer los datos del negocio (${res ? res.status : 'sin conexión'}), se usa js/config.js.`);
    return null;
  }
  return (await res.json())[0] || null;
}

// Fila de negocios → claves de PC_CONFIG. Columnas: whatsapp, telefono (el WhatsApp como se muestra),
// direccion, instagram, facebook. En extra: fijo, celular, ciudad, mapa, horarios, financiacion.
// Columna null = queda lo de config.js. En extra, un texto vacío = no se muestra.
function configDeNegocio(n) {
  if (!n) return {};
  const mapa = { whatsapp: 'whatsapp', telefono: 'whatsappLabel', direccion: 'direccion', instagram: 'instagram', facebook: 'facebook' };
  const c = Object.fromEntries(Object.entries(mapa).filter(([k]) => n[k]).map(([k, clave]) => [clave, n[k]]));
  const x = n.extra || {};
  const textos = { fijo: 'telefono', celular: 'celular', ciudad: 'ciudad', mapa: 'mapa', financiacion: 'financiacion' };
  for (const [k, clave] of Object.entries(textos)) if (typeof x[k] === 'string') c[clave] = x[k];
  if (x.horarios && typeof x.horarios === 'object') c.horarios = x.horarios;
  return c;
}

function tipoDe(carroceria) {
  return carroceria === 'Pickup' ? 'camioneta' : carroceria === 'Utilitario' ? 'utilitario' : 'auto';
}

// Fila de la base → mismo formato que js/autos.js. Si a un auto le falta algo, se saltea (no rompe la web).
function deFila(r) {
  if (r.publicado === false || r.estado === 'vendido') return null;
  // Año y km pueden faltar: "A consultar".
  const falta = ['slug', 'marca', 'modelo', 'combustible', 'transmision'].filter((k) => r[k] === null || r[k] === undefined || r[k] === '');
  if (falta.length) {
    console.warn(`Aviso: se saltea el auto ${r.id} (${r.marca} ${r.modelo}), falta: ${falta.join(', ')}`);
    return null;
  }
  const x = r.extra || {};
  // `modelo` en la base es modelo + versión; la versión sola queda en extra.version.
  const version = (x.version || '').trim();
  let modelo = r.modelo.trim();
  if (version && modelo.endsWith(' ' + version)) modelo = modelo.slice(0, -version.length - 1);
  const dir = `img/autos/${r.slug}/`;
  return {
    id: r.slug,
    marca: r.marca, modelo, version, anio: r.anio || null,
    // extra.sin_km: el dueño no sabe los km (campo vacío en el panel). Un 0 escrito es un 0 km.
    km: r.km || 0, sinKm: x.sin_km === true,
    carroceria: r.carroceria || '', tipo: TIPOS.includes(r.tipo) ? r.tipo : tipoDe(r.carroceria),
    combustible: r.combustible, transmision: r.transmision,
    motor: r.motor || null, color: r.color || null, puertas: r.puertas || null, duenos: r.duenos || null,
    precio: r.precio || null,
    moneda: r.moneda === 'UYU' ? 'UYU' : 'USD',
    cuotas: typeof x.cuotas === 'string' ? x.cuotas : '',
    reservado: r.estado === 'reservado',
    destacado: !!r.destacado,
    ingreso: r.created_at.slice(0, 10),
    actualizado: r.updated_at.slice(0, 10),
    equipamiento: r.equipamiento || [],
    descripcion: r.descripcion || '',
    fotos: [], miniaturas: [],
    // Rutas en el bucket; bajarFotos() completa fotos/miniaturas con las que se pudieron bajar.
    _fotos: (r.fotos || []).map((p) => ({ p, archivo: dir + path.posix.basename(p) }))
  };
}

// Las fotos no cambian nunca (nombre = uuid): se guardan en .cache/fotos/ y solo se bajan las nuevas.
// GitHub Actions conserva esa carpeta entre publicaciones (actions/cache), así no se gasta cupo de Supabase.
const CACHE_FOTOS = path.join(RAIZ, '.cache', 'fotos');

async function bajarFotos(autos) {
  const url = (p) => `${C.supabaseUrl}/storage/v1/object/public/fotos/${p.split('/').map(encodeURIComponent).join('/')}`;
  const bajar = async (p, destino) => {
    const cache = path.join(CACHE_FOTOS, p);
    if (!fs.existsSync(cache)) {
      const res = await fetch(url(p)).catch(() => null);
      if (!res || !res.ok) return false;
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      fs.writeFileSync(cache, Buffer.from(await res.arrayBuffer()));
    }
    const f = path.join(SALIDA, destino);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.copyFileSync(cache, f);
    return true;
  };
  const tareas = autos.flatMap((a) => a._fotos.map((f) => async () => {
    const chica = f.archivo.replace(/\.jpg$/, '_m.jpg');
    f.ok = await bajar(f.p, f.archivo);
    f.chica = f.ok && (await bajar(f.p.replace(/\.jpg$/, '_m.jpg'), chica)) ? chica : f.archivo;
    if (!f.ok) console.warn(`Aviso: no se pudo bajar la foto ${f.p} de ${a.id}`);
  }));
  // De a 6 descargas a la vez.
  const cola = tareas.slice();
  await Promise.all(Array.from({ length: 6 }, async () => { while (cola.length) await cola.shift()(); }));
  for (const a of autos) {
    const ok = a._fotos.filter((f) => f.ok);
    a.fotos = ok.map((f) => f.archivo);
    a.miniaturas = ok.map((f) => f.chica);
  }
}

function salida(clave, valor) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${clave}=${valor}\n`);
}

// ---- Plantillas: {{ clave.sub }} (sin escapar: se escapa al armar los datos) y {{> parcial }} ----

const parciales = {};
for (const f of fs.readdirSync(path.join(SRC, '_partials'))) {
  parciales[path.basename(f, '.html')] = fs.readFileSync(path.join(SRC, '_partials', f), 'utf8');
}

function render(tpl, datos) {
  return tpl.replace(/\{\{\s*(>\s*)?([\w.-]+)\s*\}\}/g, (_, parcial, clave) => {
    if (parcial) {
      if (!(clave in parciales)) throw new Error(`No existe el parcial ${clave}`);
      return render(parciales[clave], datos);
    }
    const v = clave.split('.').reduce((o, k) => (o == null ? undefined : o[k]), datos);
    if (v === undefined) throw new Error(`Falta el dato {{${clave}}}`);
    return String(v);
  });
}

function jsonld(...objs) {
  return objs.map((o) => '<script type="application/ld+json">' +
    JSON.stringify(o).replace(/</g, '\\u003c') + '</script>').join('\n');
}

// ?v=<hash del archivo>: cuando cambia un css/js, el navegador no usa la copia vieja (Pages cachea 10 min).
const versiones = {};
function v(rel) {
  versiones[rel] = versiones[rel] || crypto.createHash('sha1').update(fs.readFileSync(path.join(SALIDA, rel))).digest('hex').slice(0, 8);
  return versiones[rel];
}

function scripts(raiz, nombres) {
  return nombres.map((n) => `<script src="${raiz}js/${n}.js?v=${v(`js/${n}.js`)}" defer></script>`).join('\n');
}

const ICONOS = {
  wa: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 20.5l1.3-4A8.5 8.5 0 1 1 8 19.6z"/></svg>',
  tel: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg>',
  // Subrayado y círculo a mano del diseño.
  subrayado: '<svg class="trazo-sub" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M4 12 C 70 4, 170 16, 296 6" fill="none" stroke="#C8202B" stroke-width="4" stroke-linecap="round"/></svg>',
  circulo: '<svg class="trazo-circ" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><path d="M150 6 C 80 0, 8 10, 6 32 C 4 54, 90 58, 150 52 C 196 46, 200 14, 128 8" fill="none" stroke="#C8202B" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>'
};

// Datos del negocio ya armados para las plantillas (vacío = no se muestra).
function datosNegocio() {
  const tels = [C.telefono, C.whatsappLabel, C.celular].filter(Boolean);
  const horario = PC.horarioTexto();
  const ig = C.instagram ? `https://instagram.com/${encodeURIComponent(C.instagram)}` : '';
  const fb = !C.facebook ? '' : /^https?:/.test(C.facebook) ? C.facebook : `https://facebook.com/${encodeURIComponent(C.facebook)}`;
  const donde = [C.direccion, C.ciudad].filter(Boolean).join(', ');
  return {
    direccion: esc(C.direccion || ''),
    ciudad: esc(C.ciudad || ''),
    horario: esc(horario),
    // "Av. Giannattasio km 19.600 · Lunes a viernes de 9 a 19 · Sábados de 9 a 13"
    linea: esc([C.direccion, horario].filter(Boolean).join(' · ')),
    // Dirección en dos líneas: calle y ciudad.
    domicilio: [C.direccion, C.ciudad].filter(Boolean).map(esc).join('<br>'),
    telefonos: tels.map((t) => `<a href="${PC.telHref(t)}">${esc(t)}</a>`).join(' · '),
    telefonosLista: tels.map((t) => `<a href="${PC.telHref(t)}">${esc(t)}</a>`).join('<br>'),
    // Teléfono del encabezado y del pie: el fijo; si no hay, el WhatsApp.
    tel: esc(C.telefono || C.whatsappLabel),
    telHref: PC.telHref(C.telefono || C.whatsappLabel),
    instagram: ig ? `<a href="${ig}" target="_blank" rel="noopener">Instagram @${esc(C.instagram)}</a>` : '',
    instagramCorto: ig ? ` · <a href="${ig}" target="_blank" rel="noopener">@${esc(C.instagram)}</a>` : '',
    igHref: ig, fbHref: fb,
    maps: esc(C.mapa || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(donde || NOMBRE)),
    waze: esc('https://waze.com/ul?q=' + encodeURIComponent(donde || NOMBRE)),
    pie: esc(['Automóviles', C.direccion].filter(Boolean).join(' · '))
  };
}

// ruta: '' (inicio), 'autos/', 'autos/<id>/', '404.html'...
function pagina(plantilla, ruta, datos) {
  const prof = ruta.endsWith('/') ? ruta.split('/').length - 1 : 0;
  // El 404 se sirve en cualquier URL, por eso usa rutas absolutas.
  const raiz = ruta === '404.html' ? BASE : prof ? '../'.repeat(prof) : './';
  const n = datosNegocio();
  const d = Object.assign({
    raiz,
    v: { css: v('css/styles.css'), admin: v('js/admin.js') },
    canonical: SITIO + ruta,
    robots: C.indexar ? '<meta name="robots" content="index, follow, max-image-preview:large">' : '<meta name="robots" content="noindex">',
    ogTipo: 'website',
    ogImagen: SITIO + 'img/og.jpg',
    jsonld: '',
    nav: { autos: '', vende: '', donde: '' },
    claseBody: '',
    wa: { href: esc(PC.waUrl()) },
    icono: ICONOS,
    n,
    // Botón redondo del encabezado en el celular (al lado de "Menú").
    accionMovil: `<a class="ib" href="${n.telHref}" aria-label="Llamar al ${n.tel}">${ICONOS.tel}</a>`,
    hayAutos: AUTOS.length ? '' : ' hidden',
    verAutos: AUTOS.length ? `Ver los ${AUTOS.length === 1 ? 'autos' : AUTOS.length + ' autos'}` : 'Ver los autos',
    anio: new Date().getFullYear()
  }, datos);
  d.scripts = scripts(raiz, d.js || ['config', 'common']);
  const html = render(fs.readFileSync(path.join(SRC, plantilla), 'utf8'), d);
  escribir(ruta === '' || ruta.endsWith('/') ? ruta + 'index.html' : ruta, html);
}

function escribir(rel, contenido) {
  const f = path.join(SALIDA, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, contenido);
}

// ---- Datos estructurados (schema.org) ----

const NEGOCIO_ID = SITIO + '#negocio';
function negocioLd() {
  const sameAs = [datosNegocio().igHref, datosNegocio().fbHref].filter(Boolean);
  const horas = PC.horarioSchema();
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoDealer',
    '@id': NEGOCIO_ID,
    name: NOMBRE,
    description: 'Automotora sobre Av. Giannattasio, Ciudad de la Costa (Canelones). Autos usados con el precio a la vista, financiación y permutas.',
    url: SITIO,
    logo: SITIO + 'img/logo.png',
    image: SITIO + 'img/og.jpg',
    telephone: '+' + C.whatsapp,
    address: {
      '@type': 'PostalAddress',
      streetAddress: C.direccion || undefined,
      addressLocality: 'Ciudad de la Costa',
      addressRegion: 'Canelones',
      addressCountry: 'UY'
    },
    openingHours: horas.length ? horas : undefined,
    sameAs: sameAs.length ? sameAs : undefined
  };
}

function migas(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item }))
  };
}

function autoLd(a, url) {
  const fotos = (a.fotos || []).map((f) => SITIO + f);
  return {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: [PC.nombre(a), a.anio].filter(Boolean).join(' '),
    url,
    image: fotos.length ? fotos : undefined,
    description: a.descripcion || undefined,
    brand: { '@type': 'Brand', name: a.marca },
    model: PC.modeloCompleto(a),
    vehicleModelDate: a.anio ? String(a.anio) : undefined,
    bodyType: a.carroceria || undefined,
    itemCondition: 'https://schema.org/UsedCondition',
    mileageFromOdometer: a.sinKm ? undefined : { '@type': 'QuantitativeValue', value: a.km, unitCode: 'KMT' },
    fuelType: a.combustible,
    vehicleTransmission: a.transmision,
    vehicleEngine: a.motor ? { '@type': 'EngineSpecification', name: a.motor } : undefined,
    color: a.color || undefined,
    numberOfDoors: a.puertas || undefined,
    numberOfPreviousOwners: a.duenos || undefined,
    offers: a.precio ? {
      '@type': 'Offer',
      price: a.precio,
      priceCurrency: a.moneda === 'UYU' ? 'UYU' : 'USD',
      availability: a.reservado ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/UsedCondition',
      url,
      seller: { '@type': 'AutoDealer', '@id': NEGOCIO_ID, name: NOMBRE, url: SITIO }
    } : undefined
  };
}

// ---- Páginas ----

function generarPaginas() {
  generarInicio();
  generarCatalogo();
  for (const a of AUTOS) generarAuto(a);
  generarVende();
  generarDonde();

  // 404 (GitHub Pages lo sirve para cualquier URL que no exista, ej. un auto vendido)
  pagina('404.html', '404.html', {
    titulo: 'Página no encontrada | Punto Carrasco Automóviles',
    descripcion: 'La página no existe o el auto ya se vendió. Mirá los autos disponibles en Punto Carrasco.',
    robots: '<meta name="robots" content="noindex">',
    accionMovil: '',
    waBusco: esc(PC.waUrl('Hola! Busco un auto que vi y ya no está en la web.'))
  });

  // Panel del dueño
  pagina('admin.html', 'admin/', {
    titulo: 'Panel · Punto Carrasco Automóviles',
    descripcion: 'Panel del dueño de Punto Carrasco Automóviles.',
    robots: '<meta name="robots" content="noindex, nofollow">',
    js: ['config', 'common']
  });

  // sitemap.xml y robots.txt
  const urls = [
    [SITIO, HOY, '1.0'],
    [SITIO + 'autos/', HOY, '0.9'],
    ...AUTOS.map((a) => [SITIO + `autos/${a.id}/`, a.actualizado || a.ingreso || HOY, '0.8']),
    [SITIO + 'vende-tu-auto/', HOY, '0.7'],
    [SITIO + 'donde-estamos/', HOY, '0.6']
  ];
  escribir('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(([loc, lastmod, prio]) => `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><priority>${prio}</priority></url>`).join('\n') +
    '\n</urlset>\n');
  escribir('robots.txt', `User-agent: *\nAllow: /\nDisallow: ${BASE}admin/\n\nSitemap: ${SITIO}sitemap.xml\n`);
  // Cloudflare Pages: el panel y estado.json sin caché (el panel compara estado.json para avisar "Publicándose…").
  escribir('_headers', `${BASE}admin/*\n  Cache-Control: no-cache\n  X-Robots-Tag: noindex, nofollow\n\n` +
    `${BASE}estado.json\n  Cache-Control: no-cache\n  Access-Control-Allow-Origin: *\n`);
}

function generarInicio() {
  const raiz = './';
  // Arriba, el último que entró ("recién llegado"); abajo, los destacados (y si faltan, los más nuevos).
  const [nuevo, ...resto] = AUTOS;
  const marcados = [...resto.filter((a) => a.destacado), ...resto.filter((a) => !a.destacado)].slice(0, 4);
  const [grande, ...chicos] = marcados;
  const n = datosNegocio();

  const hero = nuevo
    ? `<a class="hero__foto ph" href="${PC.autoUrl(nuevo, raiz)}" tabindex="-1" aria-hidden="true">${PC.foto(nuevo, 0, { raiz, eager: true })}</a>
<a class="hero__card" href="${PC.autoUrl(nuevo, raiz)}">
<span class="mk">${esc([nuevo.marca, nuevo.anio].filter(Boolean).join(' · '))}</span>
<span class="hero__modelo">${esc(PC.modeloCompleto(nuevo))}</span>
<span class="circ"><span class="price">${PC.precio(nuevo)}</span>${ICONOS.circulo}</span>
</a>
<p class="hand hero__nota">recién llegado ↑</p>`
    : `<a class="hero__foto ph hero__vacio" href="${esc(PC.waUrl('Hola Punto Carrasco! ¿Qué autos tienen hoy?'))}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true"><img src="${raiz}img/logo.png" alt="" width="528" height="264"><span class="hand">preguntanos qué hay hoy</span></a>
<a class="hero__card" href="${esc(PC.waUrl('Hola Punto Carrasco! ¿Qué autos tienen hoy?'))}" target="_blank" rel="noopener">
<span class="mk">Autos usados</span>
<span class="hero__modelo">¿Qué auto buscás?</span>
<span class="circ"><span class="price">Escribinos</span>${ICONOS.circulo}</span>
</a>
<p class="hand hero__nota">entran seguido ↑</p>`;

  const destacados = grande
    ? `<section class="sec" aria-labelledby="dest">
<div class="sec__head">
<h2 id="dest" class="t">Los que marcamos esta semana</h2>
<a class="sec__link solo-compu" href="${raiz}autos/">${esc(AUTOS.length === 1 ? 'Ver el auto' : `Ver los ${AUTOS.length} autos`)} →</a>
</div>
<div class="dest${chicos.length ? '' : ' dest--solo'}">
${PC.cardGrande(grande, { raiz })}
${chicos.length ? `<div class="dest__col">${chicos.map((a) => PC.cardFila(a, { raiz })).join('\n')}</div>` : ''}
</div>
</section>`
    : nuevo ? '' : `<section class="sec vacio" aria-labelledby="dest">
<p class="hand">¿Buscás algo en particular?</p>
<h2 id="dest" class="t">Preguntanos qué autos hay hoy</h2>
<p class="vacio__txt">Estamos subiendo el stock a la web. Mientras tanto, escribinos y te pasamos los autos que tenemos, con fotos y precio.</p>
<div class="botones">
<a class="btn wa" href="${esc(PC.waUrl('Hola Punto Carrasco! ¿Qué autos tienen hoy?'))}" target="_blank" rel="noopener">${ICONOS.wa}Preguntar por WhatsApp</a>
${n.igHref ? `<a class="btn" href="${n.igHref}" target="_blank" rel="noopener">Ver Instagram @${esc(C.instagram)}</a>` : ''}
</div>
</section>`;

  pagina('index.html', '', {
    titulo: 'Autos usados en Ciudad de la Costa | Punto Carrasco Automóviles',
    descripcion: 'Automotora sobre Av. Giannattasio, Ciudad de la Costa: autos usados con el precio a la vista, financiación y permutas. Escribinos por WhatsApp y vení a verlo.',
    jsonld: jsonld(negocioLd(), { '@context': 'https://schema.org', '@type': 'WebSite', name: NOMBRE, url: SITIO, inLanguage: 'es-UY' }),
    claseBody: ' con-barra',
    hero,
    destacados,
    financiacion: C.financiacion ? `<p class="fin__cond">${esc(C.financiacion)}</p>` : '',
    waCuota: esc(PC.waUrl('Hola Punto Carrasco! Quiero consultar la cuota de un auto.')),
    horarioDonde: n.horario ? `<p class="donde__hor">${n.horario.replace(/ · /g, '<br>')}</p>` : ''
  });
}

function generarCatalogo() {
  const monedas = new Set(AUTOS.map((a) => a.moneda));
  const n = datosNegocio();
  // Filtros del diseño, más lo que haya en el stock y no esté en la lista.
  const opciones = (base, campo) => [...base, ...new Set(AUTOS.map((a) => a[campo]).filter((v) => v && !base.includes(v)))];
  const chips = (valores, todos) => (todos ? ['<button class="chip" type="button" data-v="" aria-pressed="true">Todos</button>'] : [])
    .concat(valores.map((v) => `<button class="chip" type="button" data-v="${esc(v)}" aria-pressed="false">${esc(v)}</button>`)).join('');
  pagina('autos.html', 'autos/', {
    titulo: 'Autos usados en venta | Punto Carrasco Automóviles',
    descripcion: 'Todos los autos usados de Punto Carrasco, en Av. Giannattasio (Ciudad de la Costa), con el precio a la vista. Filtrá por tipo, combustible, caja y precio.',
    jsonld: jsonld(migas([['Inicio', SITIO], ['Todos los autos', SITIO + 'autos/']])),
    nav: { autos: ' aria-current="page"', vende: '', donde: '' },
    js: ['config', 'autos', 'common', 'catalogo'],
    accionMovil: `<a class="ib ib--wa" href="${esc(PC.waUrl())}" target="_blank" rel="noopener" aria-label="WhatsApp">${ICONOS.wa}</a>`,
    conteo: esc(conteo(AUTOS.length, monedas)),
    grilla: AUTOS.map((a) => PC.card(a, { raiz: '../' })).join('\n'),
    chips: {
      tipo: chips(opciones(PC.CARROCERIAS.filter((c) => c !== 'Utilitario' || AUTOS.some((a) => a.carroceria === c)), 'carroceria'), true),
      comb: chips(opciones(['Nafta', 'Diésel', 'Híbrido'], 'combustible')),
      caja: chips(opciones(['Manual', 'Automática'], 'transmision'))
    },
    sinAutos: AUTOS.length ? ' hidden' : '',
    waBusco: esc(PC.waUrl('Hola! Estoy buscando un auto: ')),
    waStock: esc(PC.waUrl('Hola Punto Carrasco! ¿Qué autos tienen hoy?')),
    igBoton: n.igHref ? `<a class="btn" href="${n.igHref}" target="_blank" rel="noopener">Ver Instagram @${esc(C.instagram)}</a>` : ''
  });
}

// "9 autos · precios en dólares"
function conteo(total, monedas) {
  const n = total === 1 ? '1 auto' : total + ' autos';
  const m = monedas.size === 1 ? (monedas.has('UYU') ? ' · precios en pesos' : ' · precios en dólares') : '';
  return total ? n + m : 'Todavía no hay autos publicados';
}

function generarAuto(a) {
  const ruta = `autos/${a.id}/`;
  const url = SITIO + ruta;
  const raiz = '../../';
  const nombre = PC.nombre(a);
  const titulo = [nombre, a.anio].filter(Boolean).join(' ');
  const fotos = a.fotos || [];
  const chicas = a.miniaturas || fotos;
  const n = datosNegocio();

  const thumbs = fotos.map((f, i) => `<button class="thumb" type="button" data-i="${i}" aria-label="Foto ${i + 1}" aria-current="${i === 0}"><img src="${esc(raiz + (chicas[i] || f))}" alt="" loading="lazy"></button>`).join('');
  const puntos = fotos.map((_, i) => `<span class="dot${i === 0 ? ' is-on' : ''}"></span>`).join('');

  const datos = [
    ['Año', a.anio || 'A consultar'], ['Kilómetros', a.sinKm ? 'A consultar' : PC.miles(a.km)],
    ['Combustible', a.combustible], ['Caja', a.transmision], ['Motor', a.motor], ['Tipo', a.carroceria],
    ['Puertas', a.puertas], ['Color', a.color], ['Dueños', a.duenos]
  ].filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`).join('');

  const tilde = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13 C 6 15, 8 18, 9 20 C 12 12, 16 7, 22 3" fill="none" stroke="#C8202B" stroke-width="2.6" stroke-linecap="round"/></svg>';
  const equip = a.equipamiento.length ? `<section class="ficha__equip" aria-labelledby="equip">
<h2 id="equip" class="t">Equipamiento</h2>
<ul class="equip${a.equipamiento.length > 6 ? ' equip--corto' : ''}" id="equip-lista">${a.equipamiento.map((e) => `<li class="eq">${tilde}${esc(e)}</li>`).join('')}</ul>
${a.equipamiento.length > 6 ? `<button type="button" class="ver-mas solo-movil" id="equip-mas">Ver los ${a.equipamiento.length} ítems</button>` : ''}
</section>` : '';

  const desc = a.descripcion ? `<section class="ficha__desc nota" aria-labelledby="desc">
<h2 id="desc" class="hand">Lo que te cuenta Punto Carrasco</h2>
<p>${esc(a.descripcion).replace(/\n/g, '<br>')}</p>
</section>` : '';

  // Parecidos: primero los del mismo tipo de carrocería.
  const otros = AUTOS.filter((o) => o.id !== a.id)
    .sort((x, y) => (y.carroceria === a.carroceria) - (x.carroceria === a.carroceria))
    .slice(0, 3);
  const parecidos = otros.length ? `<section class="par" aria-labelledby="par">
<div class="sec__head sec__head--par">
<h2 id="par" class="t">Parecidos, por si acaso</h2>
<a class="sec__link solo-compu" href="${raiz}autos/">Ver todos →</a>
</div>
<div class="par__grilla">${otros.map((o) => PC.card(o, { raiz, h: 'h3' })).join('\n')}</div>
</section>` : '';

  const interesa = PC.msgInteresa(a);
  const cuota = a.cuotas ? `<p class="ficha__cuota">${esc(a.cuotas)}</p>\n<p class="meta ficha__nota">Cuota orientativa: te la confirmamos por WhatsApp.</p>` : '';

  pagina('auto.html', ruta, {
    titulo: esc(`${titulo} · ${PC.precio(a)} | Punto Carrasco`),
    descripcion: esc(`${titulo} en venta en Ciudad de la Costa: ${[a.sinKm ? '' : PC.kmTxt(a), a.combustible, a.transmision].filter(Boolean).join(', ')}. ` +
      `${PC.precio(a)}. Escribinos por WhatsApp o vení a verlo a Punto Carrasco, Av. Giannattasio.`),
    ogTipo: 'product',
    ogImagen: fotos.length ? SITIO + fotos[0] : SITIO + 'img/og.jpg',
    jsonld: jsonld(autoLd(a, url), migas([['Inicio', SITIO], ['Todos los autos', SITIO + 'autos/'], [titulo, url]])),
    nav: { autos: ' aria-current="page"', vende: '', donde: '' },
    claseBody: ' con-barra pag-ficha',
    js: ['config', 'autos', 'common', 'ficha'],
    a: {
      id: esc(a.id), nombre: esc(nombre), marca: esc(a.marca), modelo: esc(a.modelo),
      modeloCompleto: esc(PC.modeloCompleto(a)), corto: esc([a.modelo, (a.version || '').split(' ')[0], a.anio].filter(Boolean).join(' ')),
      mk: esc([a.marca, a.anio, a.sinKm ? '' : PC.kmTxt(a)].filter(Boolean).join(' · ')),
      precio: PC.precio(a)
    },
    reservado: a.reservado ? '<span class="stamp">Reservado</span>' : '',
    clasePh: a.reservado ? ' is-res' : '',
    galeria: {
      principal: PC.foto(a, 0, { raiz, eager: true, alt: nombre + ', foto 1' }),
      total: fotos.length,
      contador: fotos.length > 1 ? `<span class="galeria__cont" id="g-cont">1 / ${fotos.length}</span>` : '',
      flechas: fotos.length > 1 ? '<button class="gbtn gbtn--prev" type="button" aria-label="Foto anterior">‹</button><button class="gbtn gbtn--sig" type="button" aria-label="Foto siguiente">›</button>' : '',
      thumbs: fotos.length > 1 ? `<div class="thumbs" id="thumbs">${thumbs}</div>` : '',
      puntos: fotos.length > 1 ? `<div class="dots solo-movil" aria-hidden="true">${puntos}</div>` : '',
      ayuda: fotos.length ? `<p class="meta galeria__ayuda solo-movil">${fotos.length > 1 ? `Deslizá para ver las ${fotos.length} fotos · tocá para ampliar` : 'Tocá para ampliar'}</p>` : ''
    },
    cuota,
    datos,
    equip,
    desc,
    parecidos,
    interesa: esc(PC.waUrl(interesa)),
    interesaTexto: esc(interesa.split('\n')[0]),
    verPersona: esc(PC.waUrl(PC.msgVer(a))),
    llama: C.telefono ? `<p class="meta ficha__llama solo-compu">o llamá al <a href="${n.telHref}">${n.tel}</a></p>` : '',
    estaEn: n.linea ? `<p class="meta ficha__esta">Está en ${n.linea}</p>` : ''
  });
}

function generarVende() {
  pagina('vende.html', 'vende-tu-auto/', {
    titulo: 'Vendé o permutá tu auto | Punto Carrasco Automóviles',
    descripcion: 'Contanos marca, año, kilómetros y qué buscás a cambio. Te respondemos por WhatsApp con una propuesta. Punto Carrasco, Av. Giannattasio, Ciudad de la Costa.',
    jsonld: jsonld(migas([['Inicio', SITIO], ['Vendé o permutá', SITIO + 'vende-tu-auto/']])),
    nav: { autos: '', vende: ' aria-current="page"', donde: '' },
    claseBody: ' con-barra',
    accionMovil: '',
    js: ['config', 'autos', 'common', 'vende']
  });
}

function generarDonde() {
  const n = datosNegocio();
  const filas = PC.horarioFilas().map(([dia, h]) => `<div class="row"><span>${dia}</span>${h ? `<strong>${esc(h)}</strong>` : '<span class="meta">Cerrado</span>'}</div>`).join('\n');
  const flecha = '<span class="big__fl" aria-hidden="true">›</span>';
  const big = (href, etiqueta, valor, nuevo) => `<a class="big" href="${href}"${nuevo ? ' target="_blank" rel="noopener"' : ''}><span class="big__txt"><span class="mk">${etiqueta}</span><strong>${valor}</strong></span>${flecha}</a>`;
  const hablemos = [
    big(esc(PC.waUrl()), 'WhatsApp', esc(C.whatsappLabel), true),
    C.celular && big(PC.telHref(C.celular), 'Celular', esc(C.celular)),
    C.telefono && big(PC.telHref(C.telefono), 'Teléfono', esc(C.telefono))
  ].filter(Boolean).join('\n');
  const redes = [
    n.igHref && big(n.igHref, 'Instagram', '@' + esc(C.instagram), true),
    n.fbHref && big(esc(n.fbHref), 'Facebook', esc(C.facebook.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')), true)
  ].filter(Boolean).join('\n');

  pagina('donde.html', 'donde-estamos/', {
    titulo: 'Dónde estamos: Av. Giannattasio, Ciudad de la Costa | Punto Carrasco',
    descripcion: `Punto Carrasco Automóviles: ${[C.direccion, C.ciudad].filter(Boolean).join(', ')}. Horarios, teléfonos, WhatsApp y cómo llegar con Google Maps o Waze.`,
    jsonld: jsonld(negocioLd(), migas([['Inicio', SITIO], ['Dónde estamos', SITIO + 'donde-estamos/']])),
    nav: { autos: '', vende: '', donde: ' aria-current="page"' },
    claseBody: ' con-barra',
    accionMovil: '',
    lineaDir: esc([C.direccion, C.ciudad].filter(Boolean).join(' · ')),
    horarios: filas ? `<section aria-labelledby="hor">\n<h2 id="hor" class="t">Horarios</h2>\n${filas}\n</section>` : '',
    hablemos,
    redes: redes ? `<section aria-labelledby="red">\n<h2 id="red" class="t">Redes</h2>\n${redes}\n</section>` : ''
  });
}

// ---- Validación de js/autos.js: mejor que falle acá y no que se publique roto ----

function validar(autos) {
  const ids = new Set();
  for (const a of autos) {
    const quien = a.id || `${a.marca} ${a.modelo}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.id || '')) throw new Error(`${quien}: el id tiene que ser minúsculas y guiones (ej. chevrolet-onix-lt-2021)`);
    if (ids.has(a.id)) throw new Error(`${a.id}: id repetido`);
    ids.add(a.id);
    for (const campo of ['marca', 'modelo', 'combustible', 'transmision']) {
      if (a[campo] === undefined || a[campo] === '') throw new Error(`${a.id}: falta "${campo}"`);
    }
    a.tipo = a.tipo || tipoDe(a.carroceria);
    a.equipamiento = a.equipamiento || [];
    for (const f of a.fotos || []) {
      if (!fs.existsSync(path.join(RAIZ, f))) throw new Error(`${a.id}: no existe la foto ${f}`);
    }
  }
}

main().catch((e) => {
  console.error('Error: ' + e.message);
  process.exit(1);
});
