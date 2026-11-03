// Filtros y orden del catálogo. Las tarjetas ya vienen armadas por scripts/generar.js;
// acá se vuelven a dibujar con los mismos datos (js/autos.js) cada vez que cambia un filtro.
(function () {
  var PC = window.PC;
  if (!PC.autos.length) return;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var ORDENES = {
    recientes: function (a, b) { return (b.ingreso || '').localeCompare(a.ingreso || ''); },
    'precio-asc': function (a, b) { return (PC.enDolares(a) || Infinity) - (PC.enDolares(b) || Infinity); },
    'precio-desc': function (a, b) { return (PC.enDolares(b) || 0) - (PC.enDolares(a) || 0); },
    // Los "km a consultar" van al final.
    km: function (a, b) { return (a.sinKm ? Infinity : a.km) - (b.sinKm ? Infinity : b.km); }
  };
  var CAMPOS = { tipo: 'carroceria', comb: 'combustible', caja: 'transmision' };

  // Los filtros viven en la URL para poder compartir o volver (/autos/?tipo=SUV&hasta=15000).
  var params = new URLSearchParams(location.search);
  var numero = function (s) { var d = String(s || '').replace(/\D/g, ''); return d ? Number(d) : null; };
  var estado = {
    tipo: params.get('tipo') || '', comb: params.get('comb') || '', caja: params.get('caja') || '',
    desde: numero(params.get('desde')), hasta: numero(params.get('hasta')),
    orden: ORDENES[params.get('orden')] ? params.get('orden') : 'recientes'
  };

  var grilla = $('#grilla');
  var conteo = $('#conteo');
  var sinRes = $('#sin-resultados');
  var tags = $('#tags');
  var pmin = $('#pmin');
  var pmax = $('#pmax');
  var ordenes = [$('#orden'), $('#orden-m')];
  var monedas = PC.autos.reduce(function (s, a) { s[a.moneda] = 1; return s; }, {});
  var enMoneda = Object.keys(monedas).length === 1 ? (monedas.UYU ? ' · precios en pesos' : ' · precios en dólares') : '';

  function lista() {
    return PC.autos.filter(function (a) {
      for (var k in CAMPOS) if (estado[k] && a[CAMPOS[k]] !== estado[k]) return false;
      var usd = PC.enDolares(a);
      if (estado.desde && (usd === null || usd < estado.desde)) return false;
      if (estado.hasta && (usd === null || usd > estado.hasta)) return false;
      return true;
    }).sort(ORDENES[estado.orden]);
  }

  function texto(k) {
    if (k === 'desde') return 'Desde U$S ' + PC.miles(estado.desde);
    if (k === 'hasta') return 'Hasta U$S ' + PC.miles(estado.hasta);
    return estado[k];
  }
  var activos = function () { return ['tipo', 'comb', 'caja', 'desde', 'hasta'].filter(function (k) { return estado[k]; }); };

  // "Hola! Busco una pickup diésel hasta U$S 8.000"
  function busco() {
    var t = estado.tipo ? (estado.tipo === 'Pickup' ? 'una ' : 'un ') + estado.tipo.toLowerCase() : 'un auto';
    var partes = [t, estado.comb.toLowerCase(), estado.caja.toLowerCase(),
      estado.desde ? 'desde U$S ' + PC.miles(estado.desde) : '', estado.hasta ? 'hasta U$S ' + PC.miles(estado.hasta) : ''];
    return 'Hola! Busco ' + partes.filter(Boolean).join(' ');
  }

  function render() {
    var autos = lista();
    grilla.innerHTML = autos.map(function (a) { return PC.card(a); }).join('');
    grilla.hidden = !autos.length;
    sinRes.hidden = autos.length > 0;
    conteo.textContent = (autos.length === 1 ? '1 auto' : autos.length + ' autos') + enMoneda;
    $('#ver-filtrados').textContent = autos.length ? (autos.length === 1 ? 'Ver el auto' : 'Ver los ' + autos.length + ' autos') : 'No hay autos con esos filtros';
    $('#wa-busco').href = PC.waUrl(busco());

    $$('[data-filtro]').forEach(function (g) {
      var k = g.getAttribute('data-filtro');
      g.querySelectorAll('[data-v]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === estado[k])); });
    });
    var act = activos();
    tags.hidden = !act.length;
    tags.innerHTML = act.map(function (k) {
      return '<button class="tag" type="button" data-quitar="' + k + '" aria-label="Quitar filtro ' + PC.esc(texto(k)) + '">' + PC.esc(texto(k)) + ' <span aria-hidden="true">✕</span></button>';
    }).join('');
    ordenes.forEach(function (s) { s.value = estado.orden; });
    if (document.activeElement !== pmin) pmin.value = estado.desde ? PC.miles(estado.desde) : '';
    if (document.activeElement !== pmax) pmax.value = estado.hasta ? PC.miles(estado.hasta) : '';

    var p = new URLSearchParams();
    ['tipo', 'comb', 'caja', 'desde', 'hasta'].forEach(function (k) { if (estado[k]) p.set(k, estado[k]); });
    if (estado.orden !== 'recientes') p.set('orden', estado.orden);
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }

  $$('[data-filtro]').forEach(function (g) {
    g.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (!b) return;
      var k = g.getAttribute('data-filtro');
      var v = b.getAttribute('data-v');
      // Tocar el que ya está elegido lo saca (salvo "Todos").
      estado[k] = estado[k] === v ? '' : v;
      render();
    });
  });
  tags.addEventListener('click', function (e) {
    var b = e.target.closest('[data-quitar]');
    if (!b) return;
    estado[b.getAttribute('data-quitar')] = b.getAttribute('data-quitar') in CAMPOS ? '' : null;
    render();
  });
  $('#borrar-filtros').addEventListener('click', function () {
    estado.tipo = estado.comb = estado.caja = '';
    estado.desde = estado.hasta = null;
    render();
  });
  [[pmin, 'desde'], [pmax, 'hasta']].forEach(function (x) {
    x[0].addEventListener('input', function () { estado[x[1]] = numero(x[0].value); render(); });
    x[0].addEventListener('blur', function () { x[0].value = estado[x[1]] ? PC.miles(estado[x[1]]) : ''; });
  });
  ordenes.forEach(function (s) {
    s.addEventListener('change', function () { estado.orden = s.value; render(); });
  });

  // Filtros del celular: pantalla completa.
  var abrir = $('#abrir-filtros');
  function filtros(abierto) {
    document.body.classList.toggle('filtros-abiertos', abierto);
    abrir.setAttribute('aria-expanded', String(abierto));
    if (!abierto) abrir.focus();
  }
  abrir.addEventListener('click', function () { filtros(true); });
  $('#cerrar-filtros').addEventListener('click', function () { filtros(false); });
  $('#ver-filtrados').addEventListener('click', function () { filtros(false); window.scrollTo(0, 0); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('filtros-abiertos')) filtros(false);
  });

  render();
})();
