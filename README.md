# @gasolinaradar/vehicle-catalog

Catálogo curado de motos para el alta de vehículos por ficha: búsqueda, marcas, modelos y
resolución por año y tren motriz. Misma forma que el catálogo de coches de la API, para que el
asistente de alta use el mismo flujo.

```js
const { defaultCatalog } = require('@gasolinaradar/vehicle-catalog');

defaultCatalog.search({ q: 'cb500f' });
defaultCatalog.listMakes();
defaultCatalog.listModels('BMW');
defaultCatalog.resolve({ make: 'Honda', model: 'CB500F', year: 2025 });
```

## Datos

`src/data/motorcycle-catalog.json` es la única fuente de los datos. Cada ficha lleva:

- `tankLiters` y `tankSourceUrl`: el depósito viene de la ficha oficial del fabricante. Revisa
  `tankNote`: los fabricantes mezclan galones, litros, depósito total y útil.
- `consumptionL100km` solo cuando el fabricante lo publica (`consumptionSource: "manufacturer"`).
  En el resto, el consumo es una **estimación** por cilindrada (`meta.consumptionDefaults`) y se
  expone como `consumptionSource: "estimated"`.
- `meta.reviewed`: `false` hasta que una persona revise las fichas.

Las fichas no vienen de un dataset con licencia; son datos de fabricante. Antes de publicar el
paquete hay que decidir su licencia.

## Añadir una moto

1. Busca la ficha oficial del fabricante y anota el depósito y la URL.
2. Añade la entrada a `src/data/motorcycle-catalog.json` con un `id` `moto-<marca>-<modelo>-<año>`.
3. `npm test`.

## Tests

```
npm test
```
