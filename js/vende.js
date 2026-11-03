// "Vendé o permutá": arma el mensaje de WhatsApp con lo que se completa y lo muestra antes de mandarlo.
// Desde la ficha de un auto: /vende-tu-auto/?objetivo=permutar&auto=<slug> deja elegido "Otro auto" con ese auto.
(function () {
  var PC = window.PC;
  var $ = function (s) { return document.querySelector(s); };
  var form = $('#f-vende');
  var estado = { deuda: '', modo: '' };

  var params = new URLSearchParams(location.search);
  if (params.get('objetivo') === 'permutar') estado.modo = 'permuta';
  if (params.get('objetivo') === 'vender') estado.modo = 'vender';
  var deseado = params.get('auto') && PC.buscar(params.get('auto'));
  if (deseado) {
    estado.modo = 'permuta';
    form.cambio.value = [PC.nombre(deseado), deseado.anio].filter(Boolean).join(' ');
  }

  function val(n) { return form[n].value.trim(); }

  function mensaje() {
    var quiero = estado.modo === 'permuta' ? 'permutar' : estado.modo === 'vender' ? 'vender' : 'vender o permutar';
    var auto = [val('marca'), val('modelo')].filter(Boolean).join(' ');
    var anio = val('anio');
    var km = val('km');
    var lineas = ['Hola Punto Carrasco! Quiero ' + quiero + ' mi auto:'];
    if (auto || anio) lineas.push('• ' + [auto, anio && 'año ' + anio].filter(Boolean).join(', '));
    if (km) lineas.push('• ' + km + ' km');
    if (estado.deuda) lineas.push('• Deuda: ' + estado.deuda);
    if (estado.modo === 'vender') lineas.push('• Busco a cambio: plata');
    if (estado.modo === 'permuta') lineas.push('• Busco a cambio: ' + (val('cambio') || 'otro auto'));
    var soy = [val('nombre') && 'Soy ' + val('nombre'), val('cel') && 'mi celular es ' + val('cel')].filter(Boolean).join(', ');
    if (soy) lineas.push('', soy.charAt(0).toUpperCase() + soy.slice(1) + '.');
    return lineas.join('\n');
  }

  function render() {
    document.querySelectorAll('.seg[data-campo]').forEach(function (g) {
      var k = g.getAttribute('data-campo');
      g.querySelectorAll('[data-v]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === estado[k])); });
    });
    $('#f-cambio').hidden = estado.modo !== 'permuta';
    var m = mensaje();
    $('#globo').textContent = m;
    $('#enviar').href = $('#enviar-m').href = PC.waUrl(m);
  }

  document.querySelectorAll('.seg[data-campo]').forEach(function (g) {
    g.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (!b) return;
      estado[g.getAttribute('data-campo')] = b.getAttribute('data-v');
      render();
    });
  });
  form.addEventListener('input', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  // Km como en Uruguay: 98.000
  form.km.addEventListener('blur', function () {
    var d = form.km.value.replace(/\D/g, '');
    form.km.value = d ? PC.miles(Number(d)) : '';
    render();
  });

  render();
})();
