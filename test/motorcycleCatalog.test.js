const assert = require('node:assert');
const { test } = require('node:test');
const { createMotorcycleCatalog, defaultCatalog } = require('../src/index');

test('búsqueda devuelve fichas de motocicleta con depósito y consumo', () => {
  const { total, items } = defaultCatalog.search({ q: 'cb500f', limit: 5 });

  assert.equal(total, 1);
  assert.equal(items[0].id, 'moto-honda-cb500f-2024');
  assert.equal(items[0].vehicleType, 'motorcycle');
  assert.equal(items[0].tankLiters, 17);
  assert.equal(items[0].tankSource, 'manufacturer');
  // 471 cc: tramo de 400 a 700 cc, sin consumo oficial.
  assert.equal(items[0].consumptionL100km, 4);
  assert.equal(items[0].consumptionSource, 'estimated');
});

test('una ficha con consumo oficial conserva ese consumo', () => {
  const entry = defaultCatalog.getById('moto-bmw-g-310-r-2024');

  assert.equal(entry.consumptionL100km, 3.5);
  assert.equal(entry.consumptionSource, 'manufacturer');
});

test('la búsqueda ignora mayúsculas, acentos y separadores', () => {
  assert.equal(defaultCatalog.search({ q: 'G310R' }).items[0].id, 'moto-bmw-g-310-r-2024');
  assert.equal(defaultCatalog.search({ q: 'MT 07' }).items[0].id, 'moto-yamaha-mt-07-2024');
});

test('una búsqueda sin texto útil no devuelve nada', () => {
  assert.deepEqual(defaultCatalog.search({ q: '  ' }), { total: 0, items: [] });
});

test('filtrar por tren motriz sin fichas eléctricas devuelve vacío', () => {
  assert.equal(defaultCatalog.search({ q: 'honda', powertrain: 'ev' }).total, 0);
});

test('marcas y modelos salen del mismo catálogo', () => {
  const bmw = defaultCatalog.listMakes().find((row) => row.make === 'BMW');
  assert.deepEqual(bmw, { make: 'BMW', models: 2 });
  assert.deepEqual(
    defaultCatalog.listModels('BMW').map((row) => row.model),
    ['G 310 R', 'R 1250 GS'],
  );
  assert.deepEqual(defaultCatalog.listModels('Marca inventada'), []);
});

test('resolve avisa con yearFallback cuando el año no está vigente', () => {
  const inYear = defaultCatalog.resolve({ make: 'Honda', model: 'CB500F', year: 2025 });
  assert.equal(inYear.yearFallback, false);
  assert.equal(inYear.options[0].powertrain, 'petrol');

  const fallback = defaultCatalog.resolve({ make: 'Honda', model: 'CB500F', year: 2010 });
  assert.equal(fallback.yearFallback, true);
  assert.equal(fallback.options[0].entries[0].id, 'moto-honda-cb500f-2024');
});

test('un catálogo creado con datos propios usa su tabla de consumo', () => {
  const custom = createMotorcycleCatalog({
    meta: {
      consumptionDefaults: [
        { maxCc: 200, l100km: 1.5 },
        { maxCc: null, l100km: 9 },
      ],
    },
    entries: [
      {
        id: 'moto-test-chica-2024',
        make: 'Test',
        model: 'Chica',
        variant: null,
        displacementCc: 125,
        yearFrom: 2024,
        yearTo: null,
        powertrain: 'petrol',
        fuelKey: 'gasolina95e5',
        tankLiters: 8,
        tankSource: 'manufacturer',
        tankSourceUrl: 'https://example.test/ficha',
      },
    ],
  });

  assert.equal(custom.getById('moto-test-chica-2024').consumptionL100km, 1.5);
  assert.equal(custom.size, 1);
});
