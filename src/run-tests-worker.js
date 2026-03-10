/**
 * Worker que procesa un chunk de URLs con un solo Chrome en su propio hilo.
 * Evita conflictos de "performance mark" al aislar cada ejecución de Lighthouse.
 */

import { parentPort } from 'worker_threads';
import { launchChrome, runUrlSummary, formatChromeErrorMessage } from './lighthouse-runner.js';

parentPort.on('message', async (msg) => {
  const { urls, startIndex, totalUrls, geo, bundleVersion, iterations, formFactor } = msg;
  const runMobile = formFactor === 'all' || formFactor === 'mobile';
  const runDesktop = formFactor === 'all' || formFactor === 'desktop';

  let chrome;
  try {
    chrome = await launchChrome();
  } catch (err) {
    parentPort.postMessage({
      type: 'error',
      error: formatChromeErrorMessage(err),
      stack: err?.stack,
    });
    return;
  }

  const entries = [];
  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const urlIndex = startIndex + i;
      const entry = await runUrlSummary(url, chrome, {
        bundleVersion,
        iterations,
        formFactor,
        runMobile,
        runDesktop,
        urlIndex,
        totalUrls,
        onProgress(idx, total, u) {
          parentPort.postMessage({ type: 'progress', urlIndex: idx, totalUrls: total, url: u });
        },
        onRetry(retryNum, u, err) {
          parentPort.postMessage({
            type: 'retry',
            retryNum,
            url: u,
            message: err?.message?.slice(0, 55) || err?.code,
          });
        },
      });
      entries.push(entry);
      parentPort.postMessage({ type: 'entry', entry });
    }
  } finally {
    try {
      await chrome.kill();
    } catch (_) {}
  }

  parentPort.postMessage({ type: 'done' });
});
