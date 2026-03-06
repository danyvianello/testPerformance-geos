/**
 * Base URL y 3 arrays de endpoints para tests de performance.
 * Las URLs con bundle llevan ?d=BUNDLE_VERSION (o &d= si ya tienen query).
 */

export const BASE_URL = 'https://www.infobae.com';

/** Parámetro de bundle: se agrega como ?d=BUNDLE_VERSION (variable de entorno) */
export function addBundleParam(url, bundleVersion) {
  if (!bundleVersion) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}d=${encodeURIComponent(bundleVersion)}`;
}

/**
 * Array 1: Notas y secciones (España, Sociedad, Mundo)
 */
export const URLS_ARRAY_1 = [
  `${BASE_URL}/espana/2026/03/03/el-bce-avisa-de-que-el-conflicto-en-oriente-medio-amenaza-con-disparar-los-precios-energeticos-y-frenar-la-recuperacion-de-la-inflacion/`,
  `${BASE_URL}/sociedad/`,
  `${BASE_URL}/america/mundo/2026/03/03/en-vivo-israel-y-estados-unidos-atacan-iran/`,
];

/**
 * Array 2: Fotos, secciones
 */
export const URLS_ARRAY_2 = [
  `${BASE_URL}/fotos/2024/06/13/30-fotos-de-la-presentacion-de-el-precio-de-una-traicion-de-diego-fischer/?outputType=amp-type`,
  `${BASE_URL}/mundial-2026/`,
];

/**
 * Array 3: Homes por país (usados por todas las geos)
 */
export const URLS_ARRAY_3 = [
  `${BASE_URL}/?noredirect`,      // home Argentina
  `${BASE_URL}/espana/`,         // home España
  `${BASE_URL}/mexico/`,         // home México
  `${BASE_URL}/colombia/`,
  `${BASE_URL}/peru/`,
  `${BASE_URL}/estados-unidos/`,
];

/** Todas las URLs en un solo array para iterar (mismas URLs para todas las geos) */
export function getAllUrls() {
  return [...URLS_ARRAY_1, ...URLS_ARRAY_2, ...URLS_ARRAY_3];
}

export const GEOS = ['ARGENTINA', 'ESPANA', 'MEXICO', 'PERU', 'COLOMBIA', 'ESTADOS_UNIDOS'];
