/**
 * Lógica compartida de Lighthouse: una URL, N iteraciones, sin/con bundle.
 * Usado por run-tests.js (serie o paralelo en main) y por run-tests-worker.js (un Chrome por hilo).
 */

import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { addBundleParam } from './urls.js';

const RETRY_MAX = 3;

function scoreToLetter(score) {
  if (score >= 90) return 'A';
  if (score >= 50) return score >= 80 ? 'B' : score >= 70 ? 'C' : 'D';
  return 'F';
}

export const CHROME_FLAGS = ['--headless', '--no-sandbox', '--disable-dev-shm-usage'];

export function launchChrome() {
  const opts = { chromeFlags: CHROME_FLAGS };
  if (process.env.CHROME_PATH) opts.chromePath = process.env.CHROME_PATH;
  return chromeLauncher.launch(opts);
}

/** Mensaje de error amigable cuando no se encuentra Chrome (reutilizado por run-tests y worker). */
export function formatChromeErrorMessage(err) {
  const msg = err?.message || String(err);
  if (msg.includes('No Chrome')) {
    return msg + ' Configurá CHROME_PATH en .env con la ruta a chrome.exe (p. ej. C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe).';
  }
  return msg;
}

/** Ejecuta Lighthouse una vez; reintenta si falla por performance mark. */
export async function runLighthouseOnce(url, formFactor, chrome, opts = {}, retryCount = 0) {
  const options = {
    port: chrome.port,
    formFactor,
    screenEmulation: formFactor === 'mobile'
      ? { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false }
      : { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
    throttling: formFactor === 'mobile'
      ? { rttMs: 150, throughputKbps: 1.6 * 1024, cpuSlowdownMultiplier: 4 }
      : { rttMs: 40, throughputKbps: 10 * 1024, cpuSlowdownMultiplier: 1 },
    output: 'json',
    logLevel: 'silent',
  };
  const config = {
    extends: 'lighthouse:default',
    settings: { onlyCategories: ['performance'] },
  };
  try {
    const runnerResult = await lighthouse(url, options, config);
    const score = runnerResult?.lhr?.categories?.performance?.score;
    return score != null ? Math.round(score * 100) : null;
  } catch (err) {
    const isMarkError = err?.message?.includes('performance mark') || err?.code === 'DOMException';
    if (isMarkError && retryCount < RETRY_MAX) {
      const delayMs = (retryCount + 1) * 2000;
      const onRetry = opts.onRetry;
      if (onRetry) onRetry(retryCount + 1, url, err);
      await new Promise((r) => setTimeout(r, delayMs));
      return runLighthouseOnce(url, formFactor, chrome, opts, retryCount + 1);
    }
    throw err;
  }
}

/** N iteraciones y devuelve { values, average, letter }. */
export async function runNTimes(url, formFactor, chrome, opts) {
  const iterations = opts.iterations ?? 3;
  const values = [];
  for (let i = 0; i < iterations; i++) {
    const score = await runLighthouseOnce(url, formFactor, chrome, opts);
    if (score != null) values.push(score);
  }
  const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return {
    values,
    average: average != null ? Math.round(average * 10) / 10 : null,
    letter: average != null ? scoreToLetter(average) : '-',
  };
}

/**
 * Para una URL: N runs sin bundle y N con bundle (mobile/desktop según opts).
 * opts: { bundleVersion, iterations, formFactor, runMobile, runDesktop, onProgress?, urlIndex?, totalUrls?, onRetry? }
 */
export async function runUrlSummary(url, chrome, opts = {}) {
  const { bundleVersion, runMobile, runDesktop, onProgress, urlIndex, totalUrls } = opts;
  if (onProgress && urlIndex != null && totalUrls != null) {
    onProgress(urlIndex, totalUrls, url);
  }
  const urlConBundle = addBundleParam(url, bundleVersion || '');
  const runnerOpts = { iterations: opts.iterations ?? 3, onRetry: opts.onRetry };

  const sinBundle = {
    mobile: runMobile ? await runNTimes(url, 'mobile', chrome, runnerOpts) : { values: [], average: null, letter: '-' },
    desktop: runDesktop ? await runNTimes(url, 'desktop', chrome, runnerOpts) : { values: [], average: null, letter: '-' },
  };
  const conBundle = {
    mobile: runMobile ? await runNTimes(urlConBundle, 'mobile', chrome, runnerOpts) : { values: [], average: null, letter: '-' },
    desktop: runDesktop ? await runNTimes(urlConBundle, 'desktop', chrome, runnerOpts) : { values: [], average: null, letter: '-' },
  };

  return {
    url,
    urlConBundle: bundleVersion ? urlConBundle : null,
    sinBundle,
    conBundle,
  };
}
