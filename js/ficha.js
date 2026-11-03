// Galería de la ficha (flechas, miniaturas, deslizar, ampliar), compartir y "Ver los N ítems".
// El resto de la página ya viene armado por scripts/generar.js.
(function () {
  var PC = window.PC;
  var $ = function (s) { return document.querySelector(s); };
  var foto = $('#foto');
  var a = PC.buscar(foto.getAttribute('data-auto'));

  var mas = $('#equip-mas');
  if (mas) {
    mas.addEventListener('click', function () {
      $('#equip-lista').classList.add('equip--todo');
      mas.hidden = true;
    });
  }

  var compartir = $('#compartir');
  compartir.addEventListener('click', function () {
    var datos = { title: document.title, url: location.href.split('?')[0] };
    if (navigator.share) return navigator.share(datos).catch(function () {});
    if (navigator.clipboard) navigator.clipboard.writeText(datos.url).then(function () { compartir.setAttribute('aria-label', 'Link copiado'); });
  });

  if (!a || !a.fotos || !a.fotos.length) return;
  var fotos = a.fotos;
  var total = fotos.length;
  var actual = 0;
  var nombre = PC.nombre(a);
  var src = function (i) { return PC.esc(document.body.getAttribute('data-raiz') + fotos[i]); };

  function mostrar(i) {
    actual = (i + total) % total;
    var img = foto.querySelector('img');
    img.src = document.body.getAttribute('data-raiz') + fotos[actual];
    img.alt = nombre + ', foto ' + (actual + 1);
    var cont = $('#g-cont');
    if (cont) cont.textContent = (actual + 1) + ' / ' + total;
    document.querySelectorAll('.thumb').forEach(function (t, j) { t.setAttribute('aria-current', String(j === actual)); });
    document.querySelectorAll('.dot').forEach(function (d, j) { d.classList.toggle('is-on', j === actual); });
    if (visor) pintarVisor();
  }

  // Deslizar con el dedo (en la foto y en la foto ampliada).
  function deslizar(el, alTocar) {
    var x0 = null, y0 = null;
    el.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      var dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) mostrar(actual + (dx < 0 ? 1 : -1));
      else if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && alTocar) { e.preventDefault(); alTocar(); }
    });
  }

  foto.addEventListener('click', function (e) {
    var b = e.target.closest('.gbtn');
    if (b) return mostrar(actual + (b.classList.contains('gbtn--sig') ? 1 : -1));
    abrirVisor();
  });
  deslizar(foto, abrirVisor);
  var thumbs = $('#thumbs');
  if (thumbs) {
    thumbs.addEventListener('click', function (e) {
      var t = e.target.closest('.thumb');
      if (t) mostrar(Number(t.getAttribute('data-i')));
    });
  }
  document.addEventListener('keydown', function (e) {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowRight') mostrar(actual + 1);
    if (e.key === 'ArrowLeft') mostrar(actual - 1);
    if (e.key === 'Escape' && visor) cerrarVisor();
  });

  // ---- Foto ampliada ----
  var visor = null;
  var volverA = null;
  function pintarVisor() {
    visor.querySelector('img').src = src(actual).replace(/&amp;/g, '&');
    visor.querySelector('img').alt = nombre + ', foto ' + (actual + 1);
    var c = visor.querySelector('.galeria__cont');
    if (c) c.textContent = (actual + 1) + ' / ' + total;
  }
  function abrirVisor() {
    if (visor) return;
    volverA = document.activeElement;
    visor = document.createElement('div');
    visor.className = 'visor';
    visor.setAttribute('role', 'dialog');
    visor.setAttribute('aria-modal', 'true');
    visor.setAttribute('aria-label', 'Fotos de ' + nombre);
    visor.innerHTML = '<button class="ib visor__cerrar" type="button">Cerrar</button><img alt="">' +
      (total > 1 ? '<button class="gbtn gbtn--prev" type="button" aria-label="Foto anterior">‹</button><button class="gbtn gbtn--sig" type="button" aria-label="Foto siguiente">›</button><span class="galeria__cont"></span>' : '');
    document.body.appendChild(visor);
    document.body.style.overflow = 'hidden';
    visor.addEventListener('click', function (e) {
      var b = e.target.closest('.gbtn');
      if (b) return mostrar(actual + (b.classList.contains('gbtn--sig') ? 1 : -1));
      if (e.target.tagName !== 'IMG') cerrarVisor();
    });
    deslizar(visor);
    pintarVisor();
    visor.querySelector('.visor__cerrar').focus();
  }
  function cerrarVisor() {
    visor.remove();
    visor = null;
    document.body.style.overflow = '';
    if (volverA) volverA.focus();
  }
})();
