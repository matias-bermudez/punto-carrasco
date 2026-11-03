// Helpers compartidos. Se usan en el navegador y también en scripts/generar.js,
// que arma las páginas en el servidor con estas mismas funciones.
// Todo se expone en window.PC.
(function () {
  var C = window.PC_CONFIG;
  var AUTOS = window.PC_AUTOS || [];
  var EN_NAVEGADOR = typeof document !== 'undefined';
  // Prefijo relativo hasta la raíz del sitio ('./', '../', '../../'), lo pone el generador en <body data-raiz>.
  var RAIZ = EN_NAVEGADOR && document.body ? document.body.getAttribute('data-raiz') || './' : './';
  var MSG_GENERICO = 'Hola Punto Carrasco! Te escribo desde la web.';

  // Tipos de carrocería (filtro "Tipo" del catálogo y selector del panel).
  var CARROCERIAS = ['Hatchback', 'Sedán', 'Pickup', 'SUV', 'Monovolumen', 'Utilitario'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function raiz(r) { return r == null ? RAIZ : r; }
  function miles(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  // moneda: 'USD' (por defecto) o 'UYU'.
  function precio(a) { return a.precio ? (a.moneda === 'UYU' ? '$ ' : 'U$S ') + miles(a.precio) : 'Consultar'; }
  // Para ordenar y filtrar autos con precios en distintas monedas.
  function enDolares(a) { return a.precio ? (a.moneda === 'UYU' ? a.precio / ((C && C.dolar) || 40) : a.precio) : null; }
  function modeloCompleto(a) { return [a.modelo, a.version].filter(Boolean).join(' '); }
  function nombre(a) { return a.marca + ' ' + modeloCompleto(a); }
  // Año y km pueden faltar (el dueño no los sabe): "A consultar", nunca "0 km".
  function anioTxt(a) { return a.anio ? String(a.anio) : 'Año a consultar'; }
  function kmTxt(a) { return a.sinKm ? 'Km a consultar' : miles(a.km || 0) + ' km'; }
  function meta(a) { return [anioTxt(a), kmTxt(a), a.transmision].filter(Boolean).join(' · '); }
  function autoUrl(a, r) { return raiz(r) + 'autos/' + encodeURIComponent(a.id) + '/'; }
  function waUrl(text) { return 'https://wa.me/' + C.whatsapp + '?text=' + encodeURIComponent(text || MSG_GENERICO); }
  // "2683 3862" o "099 130 633" → "tel:+59826833862".
  function telHref(label) { return 'tel:+598' + String(label || '').replace(/\D/g, '').replace(/^598/, '').replace(/^0/, ''); }
  function buscar(id) { return AUTOS.filter(function (a) { return a.id === id; })[0]; }
  function slug(s) {
    return String(s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // Mensajes de WhatsApp: texto plano, con el link a la ficha al final.
  function linkFicha(a) { return C.sitio.replace(/\/?$/, '/') + 'autos/' + a.id + '/'; }
  function msgInteresa(a) {
    var que = [nombre(a), a.anio].filter(Boolean).join(' ') + (a.precio ? ' (' + precio(a) + ')' : '');
    return 'Hola Punto Carrasco! Me interesa el ' + que + ' que vi en la web. ¿Sigue disponible?\n' + linkFicha(a);
  }
  function msgVer(a) {
    return 'Hola! Quiero ir a ver el ' + [a.marca, a.modelo, a.version, a.anio].filter(Boolean).join(' ') + '. ¿Cuándo puedo pasar?\n' + linkFicha(a);
  }

  // ---- Horarios: { semana: ['9:00', '19:00'], sabado: [...], domingo: null } ----
  function hora(h) { return String(h || '').trim().replace(/^0(\d)/, '$1').replace(/:00$/, ''); }
  function rango(r) { return r && r[0] && r[1] ? hora(r[0]) + ' a ' + hora(r[1]) : ''; }
  var DIAS = [['semana', 'Lunes a viernes', 'Mo-Fr'], ['sabado', 'Sábados', 'Sa'], ['domingo', 'Domingos', 'Su']];
  // Filas de "Horarios": [['Lunes a viernes', '9 a 19 h'], ['Domingos', null] (cerrado)].
  function horarioFilas(h) {
    h = h || C.horarios;
    if (!h) return [];
    return DIAS.map(function (d) { return [d[1], rango(h[d[0]]) ? rango(h[d[0]]) + ' h' : null]; });
  }
  // "Lunes a viernes de 9 a 19 · Sábados de 9 a 13"
  function horarioTexto(h) {
    h = h || C.horarios;
    if (!h) return '';
    return DIAS.filter(function (d) { return rango(h[d[0]]); })
      .map(function (d) { return d[1] + ' de ' + rango(h[d[0]]); }).join(' · ');
  }
  // Para Google: "Mo-Fr 09:00-19:00"
  function horarioSchema(h) {
    h = h || C.horarios;
    if (!h) return [];
    var hh = function (x) { var p = String(x).trim().split(':'); return ('0' + p[0]).slice(-2) + ':' + ((p[1] || '00') + '0').slice(0, 2); };
    return DIAS.filter(function (d) { return rango(h[d[0]]); })
      .map(function (d) { return d[2] + ' ' + hh(h[d[0]][0]) + '-' + hh(h[d[0]][1]); });
  }

  // ---- Fotos ----

  // Dibujo cuando el auto todavía no tiene fotos: el trazo del techo del logo.
  function sinFoto() {
    return '<svg class="sinfoto" viewBox="0 0 700 525" aria-hidden="true">' +
      '<path d="M6 160 C 70 158, 110 150, 170 104 C 240 50, 360 22, 500 26 C 590 30, 640 70, 676 112 C 694 134, 680 152, 630 156" transform="translate(70 170) scale(.8)" fill="none" stroke="#C8202B" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M60 312 L 640 312" stroke="#B9B2A6" stroke-width="3" stroke-linecap="round"/>' +
      '<text x="350" y="400" text-anchor="middle" font-family="Caveat, cursive" font-weight="700" font-size="46" fill="#B3121F">foto en camino</text></svg>';
  }
  // Foto i del auto (o el dibujo si no tiene). o: { raiz, alt, eager, chica (miniatura, para tarjetas) }
  function foto(a, i, o) {
    o = o || {};
    var lista = o.chica && a.miniaturas && a.miniaturas.length ? a.miniaturas : a.fotos;
    var src = lista && lista[i || 0];
    if (!src) return sinFoto();
    return '<img src="' + esc(raiz(o.raiz) + src) + '" alt="' + esc(o.alt || nombre(a) + (a.color ? ' ' + a.color.toLowerCase() : '')) + '"' +
      (o.eager ? ' fetchpriority="high"' : ' loading="lazy"') + '>';
  }

  // ---- Tarjetas ----

  var SELLO = '<span class="stamp">Reservado</span>';
  // Catálogo (y parecidos en la ficha). o: { raiz, h: 'h2' | 'h3' }
  function card(a, o) {
    o = o || {};
    var h = o.h || 'h2';
    return '<a class="card card--cat' + (a.reservado ? ' is-res' : '') + '" href="' + autoUrl(a, o.raiz) + '">' +
      '<div class="ph">' + foto(a, 0, { raiz: o.raiz, chica: true }) + (a.reservado ? SELLO : '') + '</div>' +
      '<div class="card__body"><div class="card__txt">' +
      '<p class="mk">' + esc(a.marca) + '</p>' +
      '<' + h + ' class="card__t">' + esc(a.modelo) + (a.version ? ' <span>' + esc(a.version) + '</span>' : '') + '</' + h + '>' +
      '<p class="meta">' + esc(meta(a)) + '</p></div>' +
      '<div class="card__precio"><p class="price">' + precio(a) + '</p>' +
      (a.cuotas ? '<p class="meta card__cuota">' + esc(a.cuotas) + '</p>' : '') + '</div>' +
      '</div></a>';
  }
  // Fila con foto chica a la izquierda (destacados del inicio).
  function cardFila(a, o) {
    o = o || {};
    return '<a class="card card--fila' + (a.reservado ? ' is-res' : '') + '" href="' + autoUrl(a, o.raiz) + '">' +
      '<div class="ph">' + foto(a, 0, { raiz: o.raiz, chica: true }) + '</div>' +
      '<div class="card__body"><p class="mk">' + esc(a.marca) + '</p>' +
      '<h3 class="card__t">' + esc(modeloCompleto(a)) + '</h3>' +
      '<p class="meta">' + esc([anioTxt(a), kmTxt(a)].join(' · ')) + '</p>' +
      '<p class="price">' + precio(a) + '</p></div></a>';
  }
  // La grande del inicio.
  function cardGrande(a, o) {
    o = o || {};
    return '<a class="card card--grande' + (a.reservado ? ' is-res' : '') + '" href="' + autoUrl(a, o.raiz) + '">' +
      '<div class="ph">' + foto(a, 0, { raiz: o.raiz }) + (a.reservado ? SELLO : '') + '</div>' +
      '<div class="card__body"><div class="card__txt">' +
      '<p class="mk">' + esc(a.marca) + '</p>' +
      '<h3 class="card__t">' + esc(modeloCompleto(a)) + '</h3>' +
      '<p class="meta">' + esc([anioTxt(a), kmTxt(a), a.combustible, a.transmision].filter(Boolean).join(' · ')) + '</p></div>' +
      '<div class="card__precio"><p class="price">' + precio(a) + '</p>' +
      (a.cuotas ? '<p class="meta">' + esc(a.cuotas) + '</p>' : '') + '</div>' +
      '</div></a>';
  }

  // Más nuevos primero.
  function recientes() {
    return AUTOS.slice().sort(function (a, b) { return (b.ingreso || '').localeCompare(a.ingreso || ''); });
  }

  if (EN_NAVEGADOR) {
    // Menú del celular.
    var toggle = document.querySelector('.menu-btn');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var abierto = document.body.classList.toggle('menu-abierto');
        toggle.setAttribute('aria-expanded', String(abierto));
        toggle.textContent = abierto ? 'Cerrar' : 'Menú';
      });
      document.querySelectorAll('#menu a').forEach(function (a) {
        a.addEventListener('click', function () {
          document.body.classList.remove('menu-abierto');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.textContent = 'Menú';
        });
      });
    }
  }

  window.PC = {
    config: C, autos: AUTOS, CARROCERIAS: CARROCERIAS,
    esc: esc, miles: miles, precio: precio, enDolares: enDolares, nombre: nombre, modeloCompleto: modeloCompleto,
    anioTxt: anioTxt, kmTxt: kmTxt, meta: meta, autoUrl: autoUrl, waUrl: waUrl, telHref: telHref, buscar: buscar, slug: slug,
    msgInteresa: msgInteresa, msgVer: msgVer, recientes: recientes,
    horarioFilas: horarioFilas, horarioTexto: horarioTexto, horarioSchema: horarioSchema,
    sinFoto: sinFoto, foto: foto, card: card, cardFila: cardFila, cardGrande: cardGrande
  };
})();
