// Autos de ejemplo para probar en local:  node scripts/generar.js --local --ejemplos
// La web publicada usa los autos de la base (los carga el dueño desde /admin/) y el generador reescribe este archivo.
//
// id          único, va en la URL (/autos/<id>/): marca-modelo-versión-año, minúsculas y guiones
// modelo      sin la versión; version aparte (en la base: modelo = modelo + versión, extra.version)
// anio, km    null = "A consultar" / "Km a consultar"
// carroceria  'Hatchback' | 'Sedán' | 'SUV' | 'Pickup' | 'Monovolumen' | 'Utilitario' (filtro "Tipo")
// precio      número, sin puntos. null = "Consultar". moneda: 'USD' | 'UYU'
// cuotas      texto opcional bajo el precio, ej: 'o 36 cuotas de U$S 270'
// fotos       rutas a las fotos (4:3), la primera es la portada
window.PC_AUTOS = [
  {
    id: 'chevrolet-onix-lt-1-0-turbo-2021',
    marca: 'Chevrolet', modelo: 'Onix', version: 'LT 1.0 Turbo', anio: 2021, km: 45000,
    carroceria: 'Hatchback', combustible: 'Nafta', transmision: 'Manual', motor: '1.0 Turbo',
    color: 'Blanco', puertas: 5, duenos: 1,
    precio: 16900, moneda: 'USD', cuotas: '',
    reservado: false, destacado: true, ingreso: '2026-11-01',
    equipamiento: ['Aire acondicionado', 'Dirección asistida', 'Pantalla táctil con Android Auto y CarPlay', 'Vidrios y espejos eléctricos', '6 airbags', 'Control de estabilidad', 'Sensor de estacionamiento', 'Llantas de aleación'],
    descripcion: 'Único dueño, services en la agencia, cubiertas nuevas. Impecable, para ver.',
    fotos: ['ejemplos/chevrolet-onix-lt-1-0-turbo-2021/1.jpg']
  },
  {
    id: 'peugeot-208-active-1-2-2016',
    marca: 'Peugeot', modelo: '208', version: 'Active 1.2', anio: 2016, km: 78000,
    carroceria: 'Hatchback', combustible: 'Nafta', transmision: 'Manual', motor: '1.2',
    color: 'Blanco', puertas: 5, duenos: null,
    precio: 11900, moneda: 'USD', cuotas: '',
    reservado: false, destacado: true, ingreso: '2026-10-28',
    equipamiento: ['Aire acondicionado', 'Dirección asistida', 'Vidrios eléctricos'],
    descripcion: '',
    fotos: ['ejemplos/peugeot-208-active-1-2-2016/1.jpg']
  },
  {
    id: 'renault-sandero-1-6-expression-2017',
    marca: 'Renault', modelo: 'Sandero', version: '1.6 Expression', anio: 2017, km: 85000,
    carroceria: 'Hatchback', combustible: 'Nafta', transmision: 'Manual', motor: '1.6',
    color: 'Blanco', puertas: 5, duenos: null,
    precio: 10900, moneda: 'USD', cuotas: '',
    reservado: true, destacado: false, ingreso: '2026-10-20',
    equipamiento: [],
    descripcion: '',
    fotos: ['ejemplos/renault-sandero-1-6-expression-2017/1.jpg']
  }
];
