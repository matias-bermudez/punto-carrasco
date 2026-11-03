// Datos del negocio. Los campos vacíos no se muestran en la web.
// Al publicar, la fila de la tabla `negocios` (la edita el dueño en el panel, "Datos del negocio") pisa estos valores.
//
// whatsapp: hoy el número de prueba (091 969 322). El del negocio se carga desde el panel.
window.PC_CONFIG = {
  whatsapp: '59891969322',      // código de país + número, sin 0 ni espacios
  whatsappLabel: '091 969 322',
  telefono: '2683 3862',        // fijo (negocios.extra.fijo)
  celular: '099 130 633',       // otro celular (negocios.extra.celular)
  direccion: 'Av. Giannattasio km 19.600',
  ciudad: 'Ciudad de la Costa, Canelones',
  mapa: '',                     // link de Google Maps; vacío = se busca la dirección
  // Horarios: [desde, hasta]; null = cerrado.
  horarios: {
    semana: ['9:00', '19:00'],
    sabado: ['9:00', '13:00'],
    domingo: null
  },
  instagram: 'puntocarrasco',
  facebook: '',                 // link o usuario
  // Condiciones de financiación (financiera, cuotas, entrega, papeles). Vacío = no se muestra el párrafo.
  financiacion: '',
  dolar: 40,                    // pesos por dólar, aproximado: solo para ordenar y filtrar autos en distintas monedas

  // Supabase: base compartida de la Plataforma Automotoras. `concesionaria` = id de esta automotora en la base.
  // La clave es la pública (publishable): puede ir en el código, los permisos los pone la base.
  supabaseUrl: 'https://dfunhdfvtmsmjdzpnhas.supabase.co',
  supabaseKey: 'sb_publishable_4Q-GxNAtPB894PRurMLwkQ_2NRVIjWg',
  concesionaria: 'punto-carrasco',

  // URL pública del sitio, con / al final. Si se compra dominio, cambiarla acá.
  sitio: 'https://punto-carrasco.pages.dev/',

  // false = Google no indexa la web (meta noindex). Pasar a true al lanzar.
  indexar: false
};
