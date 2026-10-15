const bundledData = require('./data/motorcycle-catalog.json');

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 30;
const POWERTRAINS = Object.freeze(['petrol', 'diesel', 'lpg', 'cng', 'hev', 'phev', 'ev']);

// Las fichas son de fabricante, no de un dataset con licencia: la atribución dice de dónde sale cada dato.
const ATTRIBUTION = Object.freeze({
  text: 'Depósitos según la ficha técnica oficial de cada fabricante (ver tankSourceUrl). Consumos estimados por cilindrada salvo que se indique lo contrario.',
  sources: Object.freeze([]),
});

/** Minúsculas, sin acentos y con cualquier separador convertido en un espacio. */
function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Consumo estimado por cilindrada (tabla `meta.consumptionDefaults`). */
function defaultConsumption(displacementCc, table) {
  const row = table.find((candidate) => candidate.maxCc === null || displacementCc <= candidate.maxCc);
  return row ? row.l100km : null;
}

/** Forma pública: como una ficha de coche, más `vehicleType` y el origen del consumo. */
function toPublicEntry(entry, consumptionTable) {
  const hasManufacturerConsumption = entry.consumptionSource === 'manufacturer';
  const { displacementCc, ...rest } = entry;
  return {
    ...rest,
    vehicleType: 'motorcycle',
    modelFamily: entry.model,
    consumptionL100km: hasManufacturerConsumption
      ? entry.consumptionL100km
      : defaultConsumption(displacementCc, consumptionTable),
    consumptionSource: hasManufacturerConsumption ? 'manufacturer' : 'estimated',
    displacementCc,
  };
}

/**
 * Catálogo de motos en memoria. Misma forma que el catálogo de coches de la API, para que el
 * asistente de alta use el mismo flujo: marca → modelo → año → motor.
 */
function createMotorcycleCatalog(data = bundledData) {
  const consumptionTable = data?.meta?.consumptionDefaults ?? [];
  const rawEntries = Array.isArray(data?.entries) ? data.entries : [];
  const entries = rawEntries.map((entry) => toPublicEntry(entry, consumptionTable));
  const index = entries.map((entry) => {
    const text = normalizeSearchText(`${entry.make} ${entry.model} ${entry.variant ?? ''}`);
    return { entry, words: text.split(' '), compact: text.replace(/ /g, '') };
  });

  function matchScore(item, tokens) {
    let score = 0;
    for (const token of tokens) {
      if (item.words.includes(token)) score += 3;
      else if (item.words.some((word) => word.startsWith(token))) score += 2;
      else if (item.compact.includes(token)) score += 1;
      else return 0;
    }
    return score;
  }

  function matchesYear(entry, year) {
    if (entry.yearFrom !== null && entry.yearFrom !== undefined && year < entry.yearFrom) {
      return false;
    }
    return entry.yearTo === null || entry.yearTo === undefined || year <= entry.yearTo;
  }

  /** Todas las palabras de `q` deben aparecer; ordena por calidad, luego por año más reciente. */
  function search({ q, powertrain, year, limit = DEFAULT_SEARCH_LIMIT } = {}) {
    const tokens = normalizeSearchText(q).split(' ').filter(Boolean);
    if (tokens.length === 0) return { total: 0, items: [] };

    const matches = [];
    index.forEach((item) => {
      if (powertrain && item.entry.powertrain !== powertrain) return;
      if (year !== undefined && !matchesYear(item.entry, year)) return;
      const score = matchScore(item, tokens);
      if (score > 0) matches.push({ item, score });
    });

    matches.sort(
      (a, b) =>
        b.score - a.score ||
        (b.item.entry.yearFrom ?? 0) - (a.item.entry.yearFrom ?? 0) ||
        a.item.entry.id.localeCompare(b.item.entry.id),
    );

    const capped = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);
    return {
      total: matches.length,
      items: matches.slice(0, capped).map(({ item }) => item.entry),
    };
  }

  function getById(id) {
    return entries.find((entry) => entry.id === id) ?? null;
  }

  const sameMake = (entry, make) => normalizeSearchText(entry.make) === normalizeSearchText(make);
  const sameModel = (entry, model) =>
    normalizeSearchText(entry.model).replace(/ /g, '') === normalizeSearchText(model).replace(/ /g, '');

  function listMakes() {
    const models = new Map();
    entries.forEach((entry) => {
      if (!models.has(entry.make)) models.set(entry.make, new Set());
      models.get(entry.make).add(entry.model);
    });
    return [...models]
      .map(([make, set]) => ({ make, models: set.size }))
      .sort((a, b) => a.make.localeCompare(b.make));
  }

  function listModels(make) {
    const families = new Map();
    entries
      .filter((entry) => sameMake(entry, make))
      .forEach((entry) => {
        const family = families.get(entry.model) ?? {
          model: entry.model,
          powertrains: new Set(),
          yearFrom: null,
          yearTo: null,
          open: false,
        };
        family.powertrains.add(entry.powertrain);
        if (family.yearFrom === null || entry.yearFrom < family.yearFrom) {
          family.yearFrom = entry.yearFrom;
        }
        if (entry.yearTo == null) family.open = true;
        else if (family.yearTo === null || entry.yearTo > family.yearTo) {
          family.yearTo = entry.yearTo;
        }
        families.set(entry.model, family);
      });
    return [...families.values()]
      .sort((a, b) => a.model.localeCompare(b.model))
      .map(({ model, powertrains, yearFrom, yearTo, open }) => ({
        model,
        powertrains: POWERTRAINS.filter((powertrain) => powertrains.has(powertrain)),
        yearFrom,
        yearTo: open ? null : yearTo,
      }));
  }

  /** Con `year` solo las vigentes; si ninguna lo es, todas con `yearFallback: true`. */
  function resolve({ make, model, year } = {}) {
    const matching = entries.filter((entry) => sameMake(entry, make) && sameModel(entry, model));
    const inYear =
      year === undefined ? matching : matching.filter((entry) => matchesYear(entry, year));
    const yearFallback = year !== undefined && inYear.length === 0 && matching.length > 0;
    const chosen = yearFallback ? matching : inYear;

    const groups = new Map();
    chosen
      .slice()
      .sort((a, b) => (b.yearFrom ?? 0) - (a.yearFrom ?? 0) || a.id.localeCompare(b.id))
      .forEach((entry) => {
        if (!groups.has(entry.powertrain)) groups.set(entry.powertrain, []);
        groups.get(entry.powertrain).push(entry);
      });

    return {
      yearFallback,
      options: POWERTRAINS.filter((powertrain) => groups.has(powertrain)).map((powertrain) => ({
        powertrain,
        entries: groups.get(powertrain),
      })),
    };
  }

  return { search, getById, listMakes, listModels, resolve, size: entries.length, meta: data?.meta ?? null };
}

module.exports = {
  ATTRIBUTION,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  POWERTRAINS,
  normalizeSearchText,
  createMotorcycleCatalog,
  defaultCatalog: createMotorcycleCatalog(bundledData),
};
