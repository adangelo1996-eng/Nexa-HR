/**
 * Dataset statico (nessuna API esterna): regioni e comuni per suggerimenti in anagrafica.
 * Estendibile sostituendo/integrando l’elenco comuni (coerenza verificabile con ISTAT).
 */

export const IT_REGION_NAMES = [
  "Abruzzo",
  "Basilicata",
  "Calabria",
  "Campania",
  "Emilia-Romagna",
  "Friuli-Venezia Giulia",
  "Lazio",
  "Liguria",
  "Lombardia",
  "Marche",
  "Molise",
  "Piemonte",
  "Puglia",
  "Sardegna",
  "Sicilia",
  "Toscana",
  "Trentino-Alto Adige",
  "Umbria",
  "Valle d'Aosta",
  "Veneto"
] as const;

export type ItRegionName = (typeof IT_REGION_NAMES)[number];

/** Comuni campione per regione (capoluoghi + centri principali); normalizzazione lato input. */
export const IT_SAMPLE_COMUNI_BY_REGION: Record<string, readonly string[]> = {
  Abruzzo: ["L'Aquila", "Pescara", "Chieti", "Teramo", "Sulmona"],
  Basilicata: ["Potenza", "Matera", "Policoro", "Melfi"],
  Calabria: ["Catanzaro", "Reggio Calabria", "Cosenza", "Crotone", "Vibo Valentia"],
  Campania: ["Napoli", "Salerno", "Caserta", "Avellino", "Benevento", "Pompei"],
  "Emilia-Romagna": ["Bologna", "Modena", "Parma", "Reggio nell'Emilia", "Rimini", "Ferrara"],
  "Friuli-Venezia Giulia": ["Trieste", "Udine", "Pordenone", "Gorizia"],
  Lazio: ["Roma", "Latina", "Frosinone", "Viterbo", "Rieti"],
  Liguria: ["Genova", "La Spezia", "Savona", "Sanremo"],
  Lombardia: ["Milano", "Monza", "Bergamo", "Brescia", "Como", "Varese", "Pavia"],
  Marche: ["Ancona", "Pesaro", "Macerata", "Ascoli Piceno", "Fermo"],
  Molise: ["Campobasso", "Isernia", "Termoli"],
  Piemonte: ["Torino", "Novara", "Alessandria", "Asti", "Cuneo"],
  Puglia: ["Bari", "Brindisi", "Foggia", "Lecce", "Taranto", "Barletta"],
  Sardegna: ["Cagliari", "Sassari", "Olbia", "Nuoro", "Oristano"],
  Sicilia: ["Palermo", "Catania", "Messina", "Siracusa", "Trapani", "Ragusa"],
  Toscana: ["Firenze", "Pisa", "Siena", "Lucca", "Arezzo", "Prato"],
  "Trentino-Alto Adige": ["Trento", "Bolzano", "Merano", "Rovereto"],
  Umbria: ["Perugia", "Terni", "Foligno", "Spoleto"],
  "Valle d'Aosta": ["Aosta", "Saint-Vincent"],
  Veneto: ["Venezia", "Verona", "Padova", "Vicenza", "Treviso", "Belluno"]
};

export function itComuniDatalistOptionsForRegion(regionTrimmed: string): string[] {
  const r = regionTrimmed.trim();
  if (!r) {
    return [...new Set(Object.values(IT_SAMPLE_COMUNI_BY_REGION).flat())].sort((a, b) =>
      a.localeCompare(b, "it")
    );
  }
  const key = Object.keys(IT_SAMPLE_COMUNI_BY_REGION).find((k) => k.toLowerCase() === r.toLowerCase());
  const list = key ? IT_SAMPLE_COMUNI_BY_REGION[key] ?? [] : [];
  return [...list];
}
