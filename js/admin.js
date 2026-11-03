// Panel del dueño (/admin/): entrar, lista de autos, cargar/editar/borrar, fotos y datos del negocio.
// Los permisos los pone la base compartida: solo los emails de la tabla admins de esta automotora pueden escribir.
// La web pública no lee de acá en vivo: al guardar, la base le pide a GitHub que la vuelva a publicar.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const C = window.PC_CONFIG;
const PC = window.PC;
const BUCKET = 'fotos';
const MAX_FOTOS = 20;
// Base compartida: esta web solo ve y edita los autos de su automotora.
const CONCESIONARIA = C.concesionaria;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = PC.esc;

const EQUIPAMIENTO = ['Aire acondicionado', 'Dirección asistida', 'Pantalla', 'Vidrios eléctricos', '6 airbags', 'Cámara de retroceso',
  'Sensor de estacionamiento', 'Techo solar', 'Llantas de aleación', 'Cuero'];
const ESTADOS = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido' };

const form = $('#f-auto');
const fNeg = $('#f-negocio');
let sb;
let autos = [];
let filtro = 'todos';
// Editor: auto que se edita (null = nuevo), valores de los botones, fotos actuales (rutas en el bucket),
// las subidas en esta edición (se borran si se sale sin guardar) y las quitadas (se borran al guardar).
let actual = null;
let valores = {};
let equip = [];
let fotos = [];
let nuevas = [];
let quitadas = [];
let subiendo = 0;
let cambios = false;
let negocio = null;

if (!C.supabaseUrl || !C.supabaseKey) {
  $('#cargando').hidden = true;
  $('#sin-config').hidden = false;
} else {
  sb = createClient(C.supabaseUrl, C.supabaseKey);
  iniciar();
}

async function iniciar() {
  const { data } = await sb.auth.getSession();
  $('#cargando').hidden = true;
  if (data.session) await entrar(data.session);
  else vista('login');
}

// GitHub Pages deja que el navegador guarde cada página 10 minutos: desde el panel,
// los links a la web agregan ?v=<hora> para abrir siempre lo recién publicado.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-fresco]');
  if (!a) return;
  const url = new URL(a.href, location.href);
  url.searchParams.set('v', Date.now());
  a.href = url.toString();
});

function vista(nombre) {
  $('#v-login').hidden = nombre !== 'login';
  $('#app').hidden = nombre === 'login';
  for (const v of ['lista', 'editor', 'negocio']) $('#v-' + v).hidden = v !== nombre;
  document.body.dataset.vista = nombre;
  $$('[data-ir]').forEach((a) => {
    if (a.dataset.ir === nombre || (nombre === 'editor' && a.dataset.ir === 'lista')) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

function aviso(texto) {
  const t = $('#toast');
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => { t.hidden = true; }, 5000);
}

function error(el, texto) {
  el.textContent = texto || '';
  el.hidden = !texto;
}

// ---- Entrar ----

$('#mostrar-pass').addEventListener('click', (e) => {
  const p = $('#l-pass');
  p.type = p.type === 'password' ? 'text' : 'password';
  e.target.textContent = p.type === 'password' ? 'Mostrar' : 'Ocultar';
});

$('#f-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  error($('#login-error'));
  $('#l-pass').classList.remove('in--error');
  $('#entrar').disabled = true;
  const { data, error: err } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
  $('#entrar').disabled = false;
  if (err) {
    $('#l-pass').classList.add('in--error');
    return error($('#login-error'), 'El email o la contraseña no coinciden. Probá de nuevo.');
  }
  await entrar(data.session);
});

async function entrar(sesion) {
  const { data: puede } = await sb.rpc('puede_editar', { c: CONCESIONARIA });
  if (!puede) {
    await sb.auth.signOut();
    vista('login');
    return error($('#login-error'), 'Este usuario todavía no tiene permiso para editar Punto Carrasco.');
  }
  $('#hola').textContent = 'Hola, ' + ((sesion && sesion.user.email) || '').split('@')[0];
  await cargarLista();
  if (location.hash === '#negocio') abrirNegocio();
}

$$('[data-salir]').forEach((b) => b.addEventListener('click', async () => {
  if (!(await salirDelEditor())) return;
  await sb.auth.signOut();
  vista('login');
}));

$$('[data-ir]').forEach((a) => a.addEventListener('click', async (e) => {
  e.preventDefault();
  if (!(await salirDelEditor())) return;
  if (a.dataset.ir === 'negocio') abrirNegocio();
  else await cargarLista();
}));

// ---- Mis autos ----

async function cargarLista() {
  const [{ data, error: err }] = await Promise.all([
    sb.from('autos').select('*').eq('concesionaria', CONCESIONARIA).order('created_at', { ascending: false }),
    leerPublicacion()
  ]);
  if (err) return aviso('No se pudo cargar la lista: ' + err.message);
  autos = data;
  pintarLista();
  vista('lista');
  history.replaceState(null, '', '#autos');
}

// Cuándo se generó la web publicada (estado.json lo escribe scripts/generar.js).
// Un auto modificado después de eso todavía no se ve en la web.
let publicadoEn = null;
async function leerPublicacion() {
  try {
    const r = await fetch(C.sitio + 'estado.json?t=' + Date.now(), { cache: 'no-store' });
    publicadoEn = r.ok ? new Date((await r.json()).generado) : null;
  } catch {
    publicadoEn = null;
  }
}
const pendiente = (a) => publicadoEn && new Date(a.updated_at) > publicadoEn;

// Mientras haya cambios sin publicar, se vuelve a mirar cada 20 segundos.
let revision;
function revisarPublicacion() {
  clearTimeout(revision);
  if (!autos.some(pendiente)) return;
  revision = setTimeout(async () => {
    await leerPublicacion();
    if (!$('#v-lista').hidden) pintarLista();
    else revisarPublicacion();
  }, 20000);
}

function urlFoto(ruta, chica) {
  return sb.storage.from(BUCKET).getPublicUrl(chica ? ruta.replace(/\.jpg$/, '_m.jpg') : ruta).data.publicUrl;
}

const nombreDe = (a) => [a.marca, a.modelo].filter(Boolean).join(' ');
const kmDe = (a) => ((a.extra || {}).sin_km ? 'km a consultar' : PC.miles(a.km || 0) + ' km');

function pintarLista() {
  const cuenta = { todos: autos.length, disponible: 0, reservado: 0, vendido: 0, borrador: 0 };
  for (const a of autos) {
    cuenta[a.estado]++;
    if (!a.publicado) cuenta.borrador++;
  }
  const enWeb = autos.filter((a) => a.publicado && a.estado !== 'vendido').length;
  $('#resumen').textContent = `${autos.length === 1 ? '1 auto' : autos.length + ' autos'} · ${enWeb} en la web`;
  const tabs = [['todos', 'Todos'], ['disponible', 'Disponibles'], ['reservado', 'Reservados'], ['vendido', 'Vendidos']];
  if (cuenta.borrador) tabs.push(['borrador', 'Borradores']);
  $('#tabs').innerHTML = tabs.map(([k, t]) => `<button type="button" data-f="${k}" aria-pressed="${filtro === k}">${t} ${cuenta[k]}</button>`).join('');

  const q = $('#buscar').value.trim().toLowerCase();
  const lista = autos
    .filter((a) => filtro === 'todos' || (filtro === 'borrador' ? !a.publicado : a.estado === filtro))
    .filter((a) => !q || nombreDe(a).toLowerCase().includes(q));

  const cabecera = '<div class="p-item p-item--cab solo-compu" aria-hidden="true"><span>Auto</span><span>Año · km</span><span>Precio</span><span>Estado</span><span>Destacado</span><span></span></div>';
  $('#lista').innerHTML = lista.length ? cabecera + lista.map((a) => {
    const foto = a.fotos.length ? `<img src="${esc(urlFoto(a.fotos[0], true))}" alt="" loading="lazy">` : '<span class="p-item__sin">Sin fotos</span>';
    const notas = [
      a.publicado && pendiente(a) && '<span class="p-chip p-chip--warn">Publicándose en la web…</span>',
      !a.publicado && '<span class="p-chip">Borrador</span>'
    ].filter(Boolean).join('');
    const opciones = Object.entries(ESTADOS).map(([v, t]) => `<option value="${v}"${a.estado === v ? ' selected' : ''}>${t}</option>`).join('');
    const verWeb = a.publicado && a.estado !== 'vendido' ? `<a class="p-act solo-compu" href="${esc(C.sitio + 'autos/' + a.slug + '/')}" target="_blank" rel="noopener" data-fresco>Ver</a>` : '';
    return `<div class="p-item" data-id="${a.id}">
<div class="p-item__auto"><span class="p-item__foto">${foto}</span><span class="p-item__txt"><strong>${esc(nombreDe(a))}</strong><span class="meta solo-movil">${esc([a.anio || 'Año a consultar', kmDe(a)].join(' · '))}</span><strong class="p-item__precio solo-movil">${PC.precio(a)}</strong>${notas ? `<span class="p-item__notas">${notas}</span>` : ''}</span></div>
<span class="meta solo-compu">${esc([a.anio || 'Año a consultar', kmDe(a)].join(' · '))}</span>
<strong class="p-item__precio solo-compu">${PC.precio(a)}</strong>
<span class="p-item__estado"><label class="sr-only" for="est-${a.id}">Estado de ${esc(nombreDe(a))}</label><select id="est-${a.id}" class="p-pill p-pill--${a.estado}" data-estado>${opciones}</select></span>
<span class="p-item__dest"><button type="button" class="p-act" aria-pressed="${a.destacado}" data-destacar><svg width="16" height="16" viewBox="0 0 24 24" fill="${a.destacado ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>Destacado</button></span>
<span class="p-item__acc"><button type="button" class="p-act" data-editar>Editar</button>${verWeb}</span>
</div>`;
  }).join('') : `<p class="meta p-vacio">${autos.length ? 'No hay autos acá.' : 'Todavía no cargaste autos. Tocá “+ Agregar un auto” para subir el primero.'}</p>`;
  revisarPublicacion();
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  filtro = b.dataset.f;
  pintarLista();
});
$('#buscar').addEventListener('input', pintarLista);

const autoDe = (el) => autos.find((a) => String(a.id) === el.closest('[data-id]').dataset.id);

$('#lista').addEventListener('click', async (e) => {
  if (e.target.closest('[data-editar]')) return abrir(autoDe(e.target));
  const d = e.target.closest('[data-destacar]');
  if (d) {
    const a = autoDe(d);
    d.disabled = true;
    const { error: err } = await sb.from('autos').update({ destacado: !a.destacado }).eq('id', a.id);
    if (err) return aviso('No se pudo guardar: ' + err.message);
    aviso(!a.destacado ? 'Destacado: sale arriba en el inicio.' : 'Ya no está destacado.');
    await cargarLista();
  }
});

$('#lista').addEventListener('change', async (e) => {
  if (!e.target.matches('[data-estado]')) return;
  const a = autoDe(e.target);
  const estado = e.target.value;
  const { error: err } = await sb.from('autos').update({ estado, extra: extraConEstado(a.extra, a.estado, estado) }).eq('id', a.id);
  if (err) return aviso('No se pudo guardar: ' + err.message);
  aviso(estado === 'vendido' ? 'Marcado como vendido: sale de la web.' : 'Guardado: ' + ESTADOS[estado] + '.');
  await cargarLista();
});

// La fecha de venta va en extra.vendido_el (YYYY-MM-DD).
function extraConEstado(extra, antes, ahora) {
  const x = Object.assign({}, extra);
  if (ahora === 'vendido' && (antes !== 'vendido' || !x.vendido_el)) x.vendido_el = new Date().toISOString().slice(0, 10);
  if (ahora !== 'vendido') delete x.vendido_el;
  return x;
}

$$('[data-nuevo]').forEach((b) => b.addEventListener('click', () => abrir(null)));

// ---- Editor ----

const BOTONES = { moneda: 'USD', estado: 'disponible', combustible: 'Nafta', transmision: 'Manual', carroceria: '' };

// Tipo de carrocería: botones del panel = filtro "Tipo" del catálogo.
$('[data-campo="carroceria"]').innerHTML = PC.CARROCERIAS.map((c) => `<button type="button" class="p-chip-btn" data-v="${esc(c)}">${esc(c)}</button>`).join('');

function pintarBotones() {
  $$('#f-auto [data-campo]').forEach((g) => {
    g.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === valores[g.dataset.campo])));
  });
  $$('#f-auto [data-sw]').forEach((b) => b.setAttribute('aria-checked', String(!!valores[b.dataset.sw])));
}

$$('#f-auto [data-campo]').forEach((g) => g.addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  const k = g.dataset.campo;
  // El tipo se puede dejar sin elegir (tocando de nuevo).
  valores[k] = k === 'carroceria' && valores[k] === b.dataset.v ? '' : b.dataset.v;
  cambios = true;
  pintarBotones();
}));
$$('#f-auto [data-sw]').forEach((b) => b.addEventListener('click', () => {
  valores[b.dataset.sw] = !valores[b.dataset.sw];
  cambios = true;
  pintarBotones();
}));
form.addEventListener('input', () => { cambios = true; });

function pintarEquip() {
  const todos = [...EQUIPAMIENTO, ...equip.filter((e) => !EQUIPAMIENTO.includes(e))];
  $('#equip').innerHTML = todos.map((e) => `<button type="button" class="p-chip-btn" data-eq="${esc(e)}" aria-pressed="${equip.includes(e)}">${esc(e)}</button>`).join('');
}
$('#equip').addEventListener('click', (e) => {
  const b = e.target.closest('[data-eq]');
  if (!b) return;
  const v = b.dataset.eq;
  equip = equip.includes(v) ? equip.filter((x) => x !== v) : [...equip, v];
  cambios = true;
  pintarEquip();
});
function agregarEquip() {
  const v = $('#equip-otro').value.trim();
  if (v && !equip.includes(v)) equip.push(v);
  $('#equip-otro').value = '';
  cambios = true;
  pintarEquip();
}
$('#equip-agregar').addEventListener('click', agregarEquip);
$('#equip-otro').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregarEquip(); } });

function cuando(fecha) {
  const d = new Date(fecha);
  const hoy = new Date().toDateString() === d.toDateString();
  return (hoy ? 'hoy' : d.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' })) + ' ' + d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
}

function abrir(a) {
  actual = a;
  form.reset();
  error($('#ed-error'));
  cerrarMenuFoto();
  const x = (a && a.extra) || {};
  valores = Object.assign({}, BOTONES, { destacado: false, publicado: true });
  fotos = a ? a.fotos.slice() : [];
  equip = a ? (a.equipamiento || []).slice() : [];
  nuevas = [];
  quitadas = [];
  if (a) {
    for (const k of Object.keys(BOTONES)) if (a[k]) valores[k] = a[k];
    valores.destacado = !!a.destacado;
    valores.publicado = a.publicado !== false;
    // `modelo` en la base es modelo + versión; la versión sola queda en extra.version.
    const version = (x.version || '').trim();
    form.modelo.value = version && a.modelo.endsWith(' ' + version) ? a.modelo.slice(0, -version.length - 1) : a.modelo;
    form.version.value = version;
    form.marca.value = a.marca || '';
    form.anio.value = a.anio || '';
    // Km vacío = "a consultar" (extra.sin_km); si no, se muestra aunque sea 0.
    form.km.value = x.sin_km ? '' : PC.miles(a.km || 0);
    form.precio.value = a.precio ? PC.miles(a.precio) : '';
    form.cuotas.value = x.cuotas || '';
    for (const k of ['motor', 'color', 'puertas', 'duenos', 'descripcion']) form[k].value = a[k] == null ? '' : a[k];
  }
  $('#ed-titulo').textContent = a ? [a.marca, a.modelo].join(' ') : 'Agregar un auto';
  const enWeb = a && a.publicado && a.estado !== 'vendido';
  for (const id of ['#ed-ver', '#ed-ver-m']) {
    $(id).hidden = !enWeb;
    if (a) $(id).href = C.sitio + 'autos/' + a.slug + '/';
  }
  const guardado = a ? 'Guardado ' + cuando(a.updated_at) : '';
  $('#ed-guardado').textContent = guardado;
  $('#ed-guardado-m').textContent = a ? 'Último guardado: ' + cuando(a.updated_at) : '';
  $('#borrar').hidden = !a;
  pintarBotones();
  pintarEquip();
  pintarFotos();
  cambios = false;
  vista('editor');
  history.replaceState(null, '', '#auto');
}

// Al salir del editor sin guardar: confirmar y borrar las fotos subidas en esta edición.
async function salirDelEditor() {
  if ($('#v-editor').hidden) return true;
  if ((cambios || nuevas.length) && !confirm('¿Salir sin guardar los cambios?')) return false;
  await borrarArchivos(nuevas);
  nuevas = [];
  cambios = false;
  return true;
}
$$('[data-volver]').forEach((b) => b.addEventListener('click', async () => {
  if (await salirDelEditor()) await cargarLista();
}));
window.addEventListener('beforeunload', (e) => {
  if (!$('#v-editor').hidden && (cambios || nuevas.length)) e.preventDefault();
});

const digitos = (s) => String(s || '').replace(/\D/g, '');
const entero = (s) => (digitos(s) ? Number(digitos(s)) : null);
const tipoDe = (c) => (c === 'Pickup' ? 'camioneta' : c === 'Utilitario' ? 'utilitario' : 'auto');

function datosDelForm() {
  const v = (k) => form[k].value.trim();
  const version = v('version');
  const sinKm = !digitos(v('km'));
  // Se conservan los datos de extra que este panel no maneja.
  const extra = extraConEstado(actual && actual.extra, actual && actual.estado, valores.estado);
  if (version) extra.version = version; else delete extra.version;
  if (v('cuotas')) extra.cuotas = v('cuotas'); else delete extra.cuotas;
  if (sinKm) extra.sin_km = true; else delete extra.sin_km;
  return {
    marca: v('marca'),
    modelo: [v('modelo'), version].filter(Boolean).join(' '),
    anio: entero(v('anio')),
    km: sinKm ? 0 : entero(v('km')),
    carroceria: valores.carroceria || null,
    tipo: tipoDe(valores.carroceria),
    combustible: valores.combustible,
    transmision: valores.transmision,
    motor: v('motor') || null,
    color: v('color') || null,
    puertas: entero(v('puertas')),
    duenos: entero(v('duenos')),
    // Se escriben como en Uruguay ("16.900", "U$S 16.900"): se toman solo los dígitos.
    precio: entero(v('precio')),
    moneda: valores.moneda,
    estado: valores.estado,
    destacado: !!valores.destacado,
    publicado: !!valores.publicado,
    equipamiento: equip,
    descripcion: v('descripcion') || null,
    fotos,
    extra
  };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error($('#ed-error'));
  if (subiendo) return error($('#ed-error'), 'Esperá a que terminen de subir las fotos.');
  const fila = datosDelForm();
  const falta = [['marca', 'la marca'], ['modelo', 'el modelo']].filter(([k]) => !fila[k]).map(([, t]) => t);
  if (falta.length) return error($('#ed-error'), 'Falta ' + falta.join(' y ') + '.');
  const max = new Date().getFullYear() + 1;
  if (fila.anio !== null && (fila.anio < 1950 || fila.anio > max)) return error($('#ed-error'), `El año tiene que estar entre 1950 y ${max}.`);

  $$('button[form="f-auto"]').forEach((b) => { b.disabled = true; });
  // El slug es la URL del auto (/autos/<slug>/): marca-modelo-año. Se mantiene mientras no cambien
  // esos datos; si cambian, se actualiza. Si ya existe otro igual, se le agrega -2, -3...
  const base = PC.slug([fila.marca, fila.modelo, fila.anio].filter(Boolean).join(' '));
  const mismo = actual && (actual.slug === base || /^-\d+$/.test(actual.slug.slice(base.length)) && actual.slug.startsWith(base));
  let err;
  for (let n = 1; n < 20; n++) {
    const slug = mismo ? actual.slug : n === 1 ? base : `${base}-${n}`;
    ({ error: err } = actual
      ? await sb.from('autos').update({ ...fila, slug }).eq('id', actual.id)
      : await sb.from('autos').insert({ ...fila, slug, concesionaria: CONCESIONARIA }));
    if (!err || err.code !== '23505' || mismo) break;
  }
  $$('button[form="f-auto"]').forEach((b) => { b.disabled = false; });
  if (err) return error($('#ed-error'), 'No se pudo guardar: ' + err.message);

  await borrarArchivos(quitadas);
  nuevas = [];
  cambios = false;
  aviso(fila.estado === 'vendido' ? 'Guardado. Como está vendido, sale de la web en un par de minutos.' : 'Guardado. En un par de minutos se ve en la web.');
  await cargarLista();
});

$('#borrar').addEventListener('click', async () => {
  if (!confirm(`¿Borrar ${actual.marca} ${actual.modelo}? No se puede deshacer.\n\nSi se vendió, mejor cambiá el estado a "Vendido".`)) return;
  const { error: err } = await sb.from('autos').delete().eq('id', actual.id);
  if (err) return error($('#ed-error'), 'No se pudo borrar: ' + err.message);
  await borrarArchivos([...actual.fotos, ...nuevas]);
  nuevas = [];
  cambios = false;
  aviso('Auto borrado.');
  await cargarLista();
});

// ---- Fotos ----

let fotoMenu = null;

function pintarFotos() {
  $('#fotos-cuenta').textContent = `${fotos.length} de ${MAX_FOTOS}`;
  $('#fotos').innerHTML = fotos.map((ruta, i) => `
<div class="p-tile${i === 0 ? ' p-tile--portada' : ''}" draggable="true" data-i="${i}">
<img src="${esc(urlFoto(ruta, true))}" alt="Foto ${i + 1}${i === 0 ? ', portada' : ''}">
${i === 0 ? '<span class="p-tile__portada">Portada</span>' : `<span class="p-tile__n">${i + 1}</span>`}
<button type="button" class="p-tile__m" data-menu="${i}" aria-label="Opciones de la foto ${i + 1}">⋯</button>
</div>`).join('');
}

function cerrarMenuFoto() {
  fotoMenu = null;
  $('#menu-foto').hidden = true;
}

$('#fotos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-menu]');
  if (!b) return;
  fotoMenu = Number(b.dataset.menu);
  $('#menu-foto-t').textContent = `Foto ${fotoMenu + 1} · opciones`;
  $('#menu-foto [data-foto="portada"]').hidden = fotoMenu === 0;
  $('#menu-foto [data-foto="antes"]').hidden = fotoMenu === 0;
  $('#menu-foto [data-foto="despues"]').hidden = fotoMenu === fotos.length - 1;
  $('#menu-foto').hidden = false;
  $('#menu-foto button:not([hidden])').focus();
});

function mover(de, a) {
  const [f] = fotos.splice(de, 1);
  fotos.splice(a, 0, f);
  cambios = true;
  pintarFotos();
}

$('#menu-foto').addEventListener('click', (e) => {
  const b = e.target.closest('[data-foto]');
  if (!b || fotoMenu === null) return;
  const i = fotoMenu;
  const accion = b.dataset.foto;
  if (accion === 'portada') mover(i, 0);
  if (accion === 'antes') mover(i, i - 1);
  if (accion === 'despues') mover(i, i + 1);
  if (accion === 'borrar') {
    const [r] = fotos.splice(i, 1);
    // Si se subió en esta edición se borra ya; si no, al guardar.
    if (nuevas.includes(r)) {
      nuevas = nuevas.filter((x) => x !== r);
      borrarArchivos([r]);
    } else quitadas.push(r);
    cambios = true;
    pintarFotos();
  }
  cerrarMenuFoto();
});

// Arrastrar para ordenar (compu).
let arrastrada = null;
$('#fotos').addEventListener('dragstart', (e) => {
  const t = e.target.closest('.p-tile');
  if (!t) return;
  arrastrada = Number(t.dataset.i);
  e.dataTransfer.effectAllowed = 'move';
});
$('#fotos').addEventListener('dragover', (e) => { if (arrastrada !== null) e.preventDefault(); });
$('#fotos').addEventListener('drop', (e) => {
  const t = e.target.closest('.p-tile');
  if (!t || arrastrada === null) return;
  e.preventDefault();
  mover(arrastrada, Number(t.dataset.i));
  arrastrada = null;
});
$('#fotos').addEventListener('dragend', () => { arrastrada = null; });

// Dos entradas: la galería (varias a la vez) y la cámara del celular (una por vez, se sube al sacarla).
for (const id of ['#f-fotos', '#f-camara']) {
  $(id).addEventListener('change', (e) => {
    const archivos = [...e.target.files];
    e.target.value = '';
    subirFotos(archivos);
  });
}

async function subirFotos(archivos) {
  const lugar = MAX_FOTOS - fotos.length - subiendo;
  if (archivos.length > lugar) {
    aviso(`Entran hasta ${MAX_FOTOS} fotos por auto.`);
    archivos = archivos.slice(0, Math.max(0, lugar));
  }
  if (!archivos.length) return;
  const estado = $('#subiendo');
  subiendo += archivos.length;
  let hechas = 0;
  for (const archivo of archivos) {
    estado.hidden = false;
    estado.textContent = `Subiendo foto ${++hechas} de ${archivos.length}…`;
    try {
      const ruta = `${CONCESIONARIA}/${crypto.randomUUID()}.jpg`;
      const [grande, chica] = await Promise.all([achicar(archivo, 1600, 0.82), achicar(archivo, 640, 0.78)]);
      for (const [r, blob] of [[ruta, grande], [ruta.replace(/\.jpg$/, '_m.jpg'), chica]]) {
        const { error: err } = await sb.storage.from(BUCKET).upload(r, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
        if (err) throw err;
      }
      fotos.push(ruta);
      nuevas.push(ruta);
      cambios = true;
      pintarFotos();
    } catch (err) {
      aviso(`No se pudo subir ${archivo.name}: ${err.message || err}`);
    }
    subiendo--;
  }
  estado.hidden = true;
}

// Recorta la foto a 4:3 (al medio) y la achica a JPG de ~200 KB, respetando la orientación.
async function achicar(archivo, ancho, calidad) {
  const img = await decodificar(archivo);
  const w = img.width;
  const h = img.height;
  const [cw, ch] = w / h > 4 / 3 ? [Math.round(h * 4 / 3), h] : [w, Math.round(w * 3 / 4)];
  const k = Math.min(1, ancho / cw);
  const c = document.createElement('canvas');
  c.width = Math.round(cw * k);
  c.height = Math.round(ch * k);
  c.getContext('2d').drawImage(img, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', calidad));
  if (!blob) throw new Error('formato de imagen no soportado');
  return blob;
}

// createImageBitmap con orientación no anda en todos los Safari: si falla, se usa un <img>
// (los navegadores ya lo giran según la foto).
async function decodificar(archivo) {
  try {
    return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(archivo);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function borrarArchivos(rutas) {
  if (!rutas.length) return;
  await sb.storage.from(BUCKET).remove(rutas.flatMap((r) => [r, r.replace(/\.jpg$/, '_m.jpg')]));
}

// ---- Datos del negocio ----
// Se guardan en la tabla `negocios`; al publicar pisan a config.js en toda la web.
// Columnas: whatsapp, telefono (el WhatsApp como se muestra), direccion, horario (texto), instagram, facebook.
// En extra: fijo, celular, ciudad, mapa, horarios ({ semana: ['9:00', '19:00'], ... }), financiacion.

const DIAS = ['semana', 'sabado', 'domingo'];

async function abrirNegocio() {
  error($('#neg-error'));
  const { data } = await sb.from('negocios').select('*').eq('concesionaria', CONCESIONARIA).maybeSingle();
  negocio = data;
  const x = (data && data.extra) || {};
  // Sin fila todavía: se muestra lo que hoy publica la web (config.js).
  const de = (col, clave) => (data && data[col]) || C[clave] || '';
  const ex = (k, clave) => (typeof x[k] === 'string' ? x[k] : C[clave] || '');
  fNeg.whatsapp.value = de('telefono', 'whatsappLabel');
  fNeg.fijo.value = ex('fijo', 'telefono');
  fNeg.celular.value = ex('celular', 'celular');
  fNeg.direccion.value = de('direccion', 'direccion');
  fNeg.ciudad.value = ex('ciudad', 'ciudad');
  fNeg.mapa.value = ex('mapa', 'mapa');
  const horarios = x.horarios || C.horarios || {};
  for (const d of DIAS) {
    fNeg[d + '-d'].value = (horarios[d] && horarios[d][0]) || '';
    fNeg[d + '-h'].value = (horarios[d] && horarios[d][1]) || '';
  }
  fNeg.instagram.value = de('instagram', 'instagram') ? '@' + de('instagram', 'instagram') : '';
  fNeg.facebook.value = de('facebook', 'facebook');
  fNeg.financiacion.value = ex('financiacion', 'financiacion');
  vista('negocio');
  history.replaceState(null, '', '#negocio');
}

// "095 496 461", "+598 95 496 461" o "2683 3862" → { whatsapp: '59895496461', telefono: '095 496 461' }.
function telefonoUY(texto) {
  let d = texto.replace(/\D/g, '');
  if (d.startsWith('598')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (!/^[0-9]{8}$/.test(d)) return null;
  const telefono = d.startsWith('9') ? `0${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}` : `${d.slice(0, 4)} ${d.slice(4)}`;
  return { whatsapp: '598' + d, telefono };
}

// "9", "9.30", "930" o "9:30" → "9:00" / "9:30".
function hora(s) {
  const m = String(s).trim().match(/^(\d{1,2})(?:[:.h ]?(\d{2}))?$/);
  if (!m || Number(m[1]) > 24 || Number(m[2] || 0) > 59) return null;
  return Number(m[1]) + ':' + (m[2] || '00');
}

fNeg.addEventListener('submit', async (e) => {
  e.preventDefault();
  error($('#neg-error'));
  const tel = telefonoUY(fNeg.whatsapp.value);
  if (!tel) return error($('#neg-error'), 'El WhatsApp tiene que ser un número de Uruguay, por ejemplo 095 496 461.');
  // Los otros teléfonos se guardan con el mismo formato si son de Uruguay; si no, como se escribieron.
  const formato = (s) => (s.trim() ? (telefonoUY(s) || { telefono: s.trim() }).telefono : '');
  const horarios = {};
  for (const d of DIAS) {
    const [desde, hasta] = [fNeg[d + '-d'].value, fNeg[d + '-h'].value];
    if (!desde.trim() && !hasta.trim()) { horarios[d] = null; continue; }
    const r = [hora(desde), hora(hasta)];
    if (!r[0] || !r[1]) return error($('#neg-error'), 'Revisá los horarios: escribí la hora como 9:00 o 19:30 (vacío = cerrado).');
    horarios[d] = r;
  }
  const extra = Object.assign({}, negocio && negocio.extra, {
    fijo: formato(fNeg.fijo.value),
    celular: formato(fNeg.celular.value),
    ciudad: fNeg.ciudad.value.trim(),
    mapa: fNeg.mapa.value.trim(),
    horarios,
    financiacion: fNeg.financiacion.value.trim()
  });
  const fila = {
    concesionaria: CONCESIONARIA,
    ...tel,
    direccion: fNeg.direccion.value.trim() || null,
    horario: PC.horarioTexto(horarios) || null,
    instagram: fNeg.instagram.value.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '') || null,
    facebook: fNeg.facebook.value.trim() || null,
    extra
  };
  $$('button[form="f-negocio"], #guardar-negocio').forEach((b) => { b.disabled = true; });
  const { error: err } = await sb.from('negocios').upsert(fila, { onConflict: 'concesionaria' });
  $$('button[form="f-negocio"], #guardar-negocio').forEach((b) => { b.disabled = false; });
  if (err) return error($('#neg-error'), 'No se pudo guardar: ' + err.message);
  negocio = fila;
  aviso('Guardado. En un par de minutos se actualiza en toda la web.');
});
