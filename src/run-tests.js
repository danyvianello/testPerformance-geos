/**
 * Test de performance tipo Lighthouse:
 * - 3 iteraciones por URL en mobile, 3 en desktop (sin bundle).
 * - 3 iteraciones por URL en mobile, 3 en desktop (con bundle).
 * - Promedio y letra de performance por cada combinación.
 * - Un reporte por geolocalización (ARGENTINA, ESPANA, MEXICO).
 *
 * Con PERF_CONCURRENCY > 1 usa Worker Threads (un Chrome por hilo) para evitar
 * errores de "performance mark" y reducir tiempo total.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import { getAllUrls } from './urls.js';
import { writeReportFiles } from './report-builder.js';
import { launchChrome, runUrlSummary, formatChromeErrorMessage } from './lighthouse-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

const BUNDLE_VERSION = process.env.BUNDLE_VERSION || '';
const GEO = (process.env.GEO || 'ARGENTINA').toUpperCase();
const ITERATIONS = Math.max(1, Math.min(5, parseInt(process.env.PERF_ITERATIONS, 10) || 3));
const FORM_FACTOR = (process.env.PERF_FORM_FACTOR || 'all').toLowerCase();
const CONCURRENCY = Math.max(1, Math.min(8, parseInt(process.env.PERF_CONCURRENCY, 10) || 1));

const runMobile = FORM_FACTOR === 'all' || FORM_FACTOR === 'mobile';
const runDesktop = FORM_FACTOR === 'all' || FORM_FACTOR === 'desktop';

const RETRY_MAX = 3;

/** Log por consola del resultado de una URL (sin/con bundle mobile/desktop). */
function logEntryResult(entry) {
  const s = entry.sinBundle;
  const c = entry.conBundle;
  console.log(`\n[${GEO}] URL: ${entry.url}`);
  console.log(`  Sin bundle - Mobile: ${s.mobile.average} (${s.mobile.letter}) | Desktop: ${s.desktop.average} (${s.desktop.letter})`);
  console.log(`  Con bundle - Mobile: ${c.mobile.average} (${c.mobile.letter}) | Desktop: ${c.desktop.average} (${c.desktop.letter})`);
}

/** Ejecuta en serie (CONCURRENCY=1): un Chrome, todas las URLs. */
async function runSerie(urls, report, startTime) {
  const chrome = await launchChrome();
  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const urlIndex = i + 1;
      const entry = await runUrlSummary(url, chrome, {
        bundleVersion: BUNDLE_VERSION,
        iterations: ITERATIONS,
        formFactor: FORM_FACTOR,
        runMobile,
        runDesktop,
        urlIndex,
        totalUrls: urls.length,
        onProgress(idx, total, u) {
          console.log(`\n[${GEO}] Procesando (${idx}/${total}): ${u}`);
        },
        onRetry(retryNum, u, err) {
          const delaySec = retryNum * 2;
          console.warn(`  [reintento ${retryNum}/${RETRY_MAX}] ${u.slice(0, 50)}… (${err?.message?.slice(0, 55) || err?.code}) — esperando ${delaySec}s`);
        },
      });
      report.summary.push(entry);
      logEntryResult(entry);
    }
  } finally {
    try {
      await chrome.kill();
    } catch (err) {
      console.warn('\n[aviso] No se pudo cerrar Chrome:', err.message);
    }
  }
}

/** Ejecuta en paralelo con Worker Threads: N workers, cada uno con su Chrome y su chunk de URLs. */
async function runWithWorkers(urls, report, startTime, sharedState) {
  const chunkSize = Math.ceil(urls.length / CONCURRENCY);
  const workerUrl = new URL('./run-tests-worker.js', import.meta.url);
  const workerConfig = {
    geo: GEO,
    bundleVersion: BUNDLE_VERSION,
    iterations: ITERATIONS,
    formFactor: FORM_FACTOR,
  };

  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, workerId) => {
      const start = workerId * chunkSize;
      const chunk = urls.slice(start, start + chunkSize);
      if (chunk.length === 0) return Promise.resolve();

      return new Promise((resolve, reject) => {
        const worker = new Worker(workerUrl, {
          type: 'module',
          env: process.env,
        });
        if (sharedState) sharedState.workers.push(worker);

        worker.on('message', (msg) => {
          if (msg.type === 'progress') {
            console.log(`\n[${GEO}] Procesando (${msg.urlIndex}/${msg.totalUrls}): ${msg.url}`);
          } else if (msg.type === 'retry') {
            console.warn(`  [reintento ${msg.retryNum}/${RETRY_MAX}] ${msg.url?.slice(0, 50)}… (${msg.message}) — esperando ${msg.retryNum * 2}s`);
          } else if (msg.type === 'entry') {
            report.summary.push(msg.entry);
            logEntryResult(msg.entry);
          } else if (msg.type === 'done') {
            resolve();
          } else if (msg.type === 'error') {
            const e = new Error(msg.error);
            if (msg.stack) e.stack = msg.stack;
            reject(e);
          }
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0 && !sharedState?.interrupted) reject(new Error(`Worker salió con código ${code}`));
          else resolve();
        });
        worker.postMessage({
          urls: chunk,
          startIndex: start + 1,
          totalUrls: urls.length,
          ...workerConfig,
        });
      });
    })
  );

  // Ordenar por el orden original de las URLs
  const urlOrder = new Map(urls.map((u, i) => [u, i]));
  report.summary.sort((a, b) => (urlOrder.get(a.url) ?? 0) - (urlOrder.get(b.url) ?? 0));
}

function printPartialSummaryAndExit(report, urls, startTime) {
  const n = report.summary.length;
  const total = urls.length;
  console.log(`\n--- Interrumpido (Ctrl+C). URLs completadas: ${n}/${total} ---`);
  if (n > 0) {
    console.log('\nResultados hasta el momento:');
    for (const entry of report.summary) logEntryResult(entry);
    const elapsedMs = Date.now() - startTime;
    report.durationMs = elapsedMs;
    const reportPath = path.join(REPORTS_DIR, `report-${GEO.toLowerCase()}-partial-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    const { mdPath, htmlPath } = writeReportFiles(report, reportPath);
    console.log(`\nReporte parcial guardado: ${reportPath}`);
  }
  const elapsedMs = Date.now() - startTime;
  console.log(`\nTiempo hasta interrupción: ${Math.round(elapsedMs / 1000)} s`);
  process.exit(130);
}

async function main() {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const urls = getAllUrls();
  const startTime = Date.now();

  const report = {
    geo: GEO,
    bundleVersion: BUNDLE_VERSION || '(sin variable)',
    timestamp: new Date().toISOString(),
    iterationsPerDevice: ITERATIONS,
    formFactor: FORM_FACTOR,
    summary: [],
  };

  const useWorkers = CONCURRENCY > 1;
  const sharedState = useWorkers ? { workers: [], interrupted: false } : null;

  if (useWorkers && sharedState) {
    process.on('SIGINT', () => {
      if (sharedState.interrupted) return;
      sharedState.interrupted = true;
      console.log('\n\nDeteniendo workers (Ctrl+C)...');
      for (const w of sharedState.workers) {
        try { w.terminate(); } catch (_) {}
      }
      printPartialSummaryAndExit(report, urls, startTime);
    });
  }

  console.log(`\n[${GEO}] Iniciando tests: ${urls.length} URLs${useWorkers ? ` (paralelo: ${CONCURRENCY} workers)` : ' (serie)'}`);

  try {
    if (useWorkers) {
      await runWithWorkers(urls, report, startTime, sharedState);
    } else {
      await runSerie(urls, report, startTime);
    }
  } catch (err) {
    if (sharedState?.interrupted) {
      printPartialSummaryAndExit(report, urls, startTime);
    }
    throw err;
  }

  const elapsedMs = Date.now() - startTime;
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const elapsedSec = Math.round((elapsedMs % 60000) / 1000);
  const totalTimeStr = elapsedMin > 0 ? `${elapsedMin} min ${elapsedSec} s` : `${elapsedSec} s`;
  const avgPerUrlMs = urls.length ? elapsedMs / urls.length : 0;
  const avgPerUrlSec = Math.round(avgPerUrlMs / 1000);

  console.log(`\n[Tiempo] Total: ${totalTimeStr} | Promedio por URL: ~${avgPerUrlSec} s (${urls.length} URLs)`);

  report.durationMs = elapsedMs;
  const reportPath = path.join(REPORTS_DIR, `report-${GEO.toLowerCase()}-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  const { mdPath, htmlPath } = writeReportFiles(report, reportPath);
  console.log(`\nReportes guardados:`);
  console.log(`  JSON: ${reportPath}`);
  console.log(`  Guía (MD):  ${mdPath}`);
  console.log(`  Guía (HTML): ${htmlPath} (abrir e imprimir a PDF si lo necesitás)`);
}

main().catch((err) => {
  console.error(formatChromeErrorMessage(err));
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
