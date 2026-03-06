/**
 * Test de performance tipo Lighthouse:
 * - 3 iteraciones por URL en mobile, 3 en desktop (sin bundle).
 * - 3 iteraciones por URL en mobile, 3 en desktop (con bundle).
 * - Promedio y letra de performance por cada combinación.
 * - Un reporte por geolocalización (ARGENTINA, ESPANA, MEXICO).
 */

import 'dotenv/config';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllUrls, addBundleParam } from './urls.js';
import { writeReportFiles } from './report-builder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

const BUNDLE_VERSION = process.env.BUNDLE_VERSION || '';
const GEO = (process.env.GEO || 'ARGENTINA').toUpperCase();
const ITERATIONS = Math.max(1, Math.min(5, parseInt(process.env.PERF_ITERATIONS, 10) || 3));
const FORM_FACTOR = (process.env.PERF_FORM_FACTOR || 'all').toLowerCase();

/** Convierte score 0-100 a letra (estilo Lighthouse) */
function scoreToLetter(score) {
  if (score >= 90) return 'A';
  if (score >= 50) return score >= 80 ? 'B' : score >= 70 ? 'C' : 'D';
  return 'F';
}

/** Ejecuta Lighthouse una vez y devuelve performance score 0-100 */
async function runLighthouseOnce(url, formFactor, chrome) {
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
  const runnerResult = await lighthouse(url, options, config);
  const score = runnerResult?.lhr?.categories?.performance?.score;
  return score != null ? Math.round(score * 100) : null;
}

/** Ejecuta N veces (PERF_ITERATIONS) y devuelve { values, average, letter } */
async function runNTimes(url, formFactor, chrome) {
  const values = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const score = await runLighthouseOnce(url, formFactor, chrome);
    if (score != null) values.push(score);
  }
  const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return {
    values,
    average: average != null ? Math.round(average * 10) / 10 : null,
    letter: average != null ? scoreToLetter(average) : '-',
  };
}

const runMobile = FORM_FACTOR === 'all' || FORM_FACTOR === 'mobile';
const runDesktop = FORM_FACTOR === 'all' || FORM_FACTOR === 'desktop';

/** Para una URL: N runs sin bundle (mobile y/o desktop) y N con bundle */
async function runUrlSummary(url, chrome) {
  const urlSinBundle = url;
  const urlConBundle = addBundleParam(url, BUNDLE_VERSION);

  const sinBundle = {
    mobile: runMobile ? await runNTimes(urlSinBundle, 'mobile', chrome) : { values: [], average: null, letter: '-' },
    desktop: runDesktop ? await runNTimes(urlSinBundle, 'desktop', chrome) : { values: [], average: null, letter: '-' },
  };
  const conBundle = {
    mobile: runMobile ? await runNTimes(urlConBundle, 'mobile', chrome) : { values: [], average: null, letter: '-' },
    desktop: runDesktop ? await runNTimes(urlConBundle, 'desktop', chrome) : { values: [], average: null, letter: '-' },
  };

  return {
    url,
    urlConBundle: BUNDLE_VERSION ? urlConBundle : null,
    sinBundle,
    conBundle,
  };
}

async function main() {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const urls = getAllUrls();
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'] });

  const report = {
    geo: GEO,
    bundleVersion: BUNDLE_VERSION || '(sin variable)',
    timestamp: new Date().toISOString(),
    iterationsPerDevice: ITERATIONS,
    formFactor: FORM_FACTOR,
    summary: [],
  };

  try {
    for (const url of urls) {
      console.log(`\n[${GEO}] URL: ${url}`);
      const entry = await runUrlSummary(url, chrome);
      report.summary.push(entry);
      const s = entry.sinBundle;
      const c = entry.conBundle;
      console.log(`  Sin bundle - Mobile: ${s.mobile.average} (${s.mobile.letter}) | Desktop: ${s.desktop.average} (${s.desktop.letter})`);
      console.log(`  Con bundle - Mobile: ${c.mobile.average} (${c.mobile.letter}) | Desktop: ${c.desktop.average} (${c.desktop.letter})`);
    }
  } finally {
    await chrome.kill();
  }

  const reportPath = path.join(REPORTS_DIR, `report-${GEO.toLowerCase()}-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  const { mdPath, htmlPath } = writeReportFiles(report, reportPath);
  console.log(`\nReportes guardados:`);
  console.log(`  JSON: ${reportPath}`);
  console.log(`  Guía (MD):  ${mdPath}`);
  console.log(`  Guía (HTML): ${htmlPath} (abrir e imprimir a PDF si lo necesitás)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
