/*
 * Compatibility no-op for static hosting.
 * HUB Arquivos IFBA starts js-dos with workerThread:false, so cross-origin
 * isolation is not required. This file only prevents legacy js-dos probes from
 * producing a 404 when an older cached player still requests it.
 */
