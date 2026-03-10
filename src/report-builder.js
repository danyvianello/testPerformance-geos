/**
 * Genera reportes en formato guía: Markdown y HTML (para imprimir/PDF).
 * Sigue un modelo de resumen ejecutivo + tabla + detalle por URL.
 */

import fs from 'fs';
import path from 'path';

/** Formato de fecha y horario para reportes (es-AR). Fecha incluye aclaración UTC-3. */
function formatReportMeta(timestamp) {
  const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const dateStr = ts.toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' });
  return {
    date: `${dateStr} (UTC-3)`,
    horario: ts.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
  };
}

/** Formato de duración en ms a "X min Y s" o "Z s". */
function formatDuration(durationMs) {
  if (durationMs == null || durationMs < 0) return '—';
  const min = Math.floor(durationMs / 60000);
  const sec = Math.round((durationMs % 60000) / 1000);
  return min > 0 ? `${min} min ${sec} s` : `${sec} s`;
}

/**
 * Acorta la URL para mostrar en tablas (solo path después del dominio).
 */
function shortLabel(url) {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '/ (home)' : u.pathname;
    return path.length > 50 ? path.slice(0, 47) + '…' : path;
  } catch {
    return url.slice(0, 50);
  }
}

function cell(avg, letter) {
  if (avg == null && letter === '-') return '—';
  return `${avg != null ? avg : '—'} (${letter})`;
}

const ARROW_STYLE = 'font-size: 25px;';

/** SVG flecha ancha sólida (estilo ⇧/⇩) hacia arriba o abajo; fill currentColor. */
function arrowSvg(direction) {
  const pathUp = 'M12 2L4 12h4v10h8V12h4L12 2z';
  const pathDown = 'M12 22l8-10h-4V2H8v10H4l8 10z';
  const d = direction === 'up' ? pathUp : pathDown;
  return `<svg class="arrow-solid" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
}

/** Flecha según si mejoró (con bundle > sin bundle) o empeoró. Devuelve HTML o texto para MD. */
function trendArrow(sinAvg, conAvg, format = 'html') {
  if (sinAvg == null || conAvg == null) return format === 'html' ? `<span style="${ARROW_STYLE}">—</span>` : '—';
  const improved = conAvg > sinAvg;
  const same = conAvg === sinAvg;
  if (format === 'html') {
    if (same) return `<span style="color:#666; ${ARROW_STYLE}">−</span>`;
    return improved
      ? `<span class="arrow-wrap arrow-up" style="${ARROW_STYLE}" title="Mejoró con bundle">${arrowSvg('up')}</span>`
      : `<span class="arrow-wrap arrow-down" style="${ARROW_STYLE}" title="Empeoró con bundle">${arrowSvg('down')}</span>`;
  }
  if (same) return '−';
  return improved ? '⇧' : '⇩';
}

/** Devuelve 'up' | 'down' | 'same' para el título de columna Δ según mayoría de la columna. */
function majorityTrend(summary, getSin, getCon) {
  let up = 0, down = 0;
  for (const entry of summary) {
    const sin = getSin(entry), con = getCon(entry);
    if (sin == null || con == null) continue;
    if (con > sin) up++;
    else if (con < sin) down++;
  }
  if (up >= down && up > 0) return 'up';
  if (down > up) return 'down';
  return 'same';
}

const BG_IMPROVED = '#95E6AC';
const BG_WORSENED = '#F7BEBE';
const BG_EQUAL = '#D5D5D5';

/** Clase de fondo: comparado con el siguiente en la fila (par con/sin). Menor → rojo, mayor → verde, igual → gris. */
function avgCellClass(sinAvg, conAvg) {
  if (sinAvg == null || conAvg == null) return '';
  if (conAvg > sinAvg) return 'cell-improved';
  if (conAvg < sinAvg) return 'cell-worsened';
  return 'cell-equal';
}

/**
 * Genera el contenido Markdown del reporte (modelo guía).
 */
export function buildMarkdown(report) {
  const { geo, bundleVersion, timestamp, iterationsPerDevice, formFactor, summary, durationMs } = report;
  const { date } = formatReportMeta(timestamp);
  const durationStr = formatDuration(durationMs);

  let md = '';
  md += `# Reporte de performance – ${geo}\n\n`;
  md += `**Fecha:** ${date}  \n`;
  md += `**Duración del test:** ${durationStr}  \n`;
  md += `**Número de bundle:** ${bundleVersion || '—'}  \n`;
  md += `**Iteraciones por dispositivo:** ${iterationsPerDevice}  \n`;
  md += `**Dispositivos:** ${formFactor === 'all' ? 'Mobile y Desktop' : formFactor}\n\n`;
  md += `---\n\n`;

  md += `## Resumen por URL\n\n`;
  md += `| URL | Con bundle (Mobile) | Sin bundle (Mobile) | Con bundle (Desktop) | Sin bundle (Desktop) | Δ Mobile | Δ Desktop |\n`;
  md += `|-----|--------------------|---------------------|----------------------|----------------------|----------|----------|\n`;

  for (const entry of summary) {
    const s = entry.sinBundle;
    const c = entry.conBundle;
    const cm = cell(c.mobile.average, c.mobile.letter);
    const m = cell(s.mobile.average, s.mobile.letter);
    const cd = cell(c.desktop.average, c.desktop.letter);
    const d = cell(s.desktop.average, s.desktop.letter);
    const arrowM = trendArrow(s.mobile.average, c.mobile.average, 'md');
    const arrowD = trendArrow(s.desktop.average, c.desktop.average, 'md');
    md += `| ${shortLabel(entry.url)} | ${cm} | ${m} | ${cd} | ${d} | ${arrowM} | ${arrowD} |\n`;
  }

  md += `\n---\n\n## Detalle por URL\n\n`;

  for (const entry of summary) {
    md += `### ${shortLabel(entry.url)}\n\n`;
    md += `- **URL:** ${entry.url}\n`;
    if (entry.urlConBundle) md += `- **URL con bundle:** ${entry.urlConBundle}\n`;
    md += `- **Sin bundle** – Mobile: ${entry.sinBundle.mobile.values.join(', ') || '—'} → Promedio: ${entry.sinBundle.mobile.average ?? '—'} (${entry.sinBundle.mobile.letter})\n`;
    md += `- **Sin bundle** – Desktop: ${entry.sinBundle.desktop.values.join(', ') || '—'} → Promedio: ${entry.sinBundle.desktop.average ?? '—'} (${entry.sinBundle.desktop.letter})\n`;
    md += `- **Con bundle** – Mobile: ${entry.conBundle.mobile.values.join(', ') || '—'} → Promedio: ${entry.conBundle.mobile.average ?? '—'} (${entry.conBundle.mobile.letter})\n`;
    md += `- **Con bundle** – Desktop: ${entry.conBundle.desktop.values.join(', ') || '—'} → Promedio: ${entry.conBundle.desktop.average ?? '—'} (${entry.conBundle.desktop.letter})\n\n`;
  }

  return md;
}

/**
 * Genera el HTML del reporte (estilo guía, imprimible/PDF).
 */
export function buildHtml(report) {
  const { geo, bundleVersion, timestamp, iterationsPerDevice, formFactor, summary, durationMs } = report;
  const { date } = formatReportMeta(timestamp);
  const durationStr = formatDuration(durationMs);

  const majorityMobile = majorityTrend(summary, (e) => e.sinBundle.mobile.average, (e) => e.conBundle.mobile.average);
  const majorityDesktop = majorityTrend(summary, (e) => e.sinBundle.desktop.average, (e) => e.conBundle.desktop.average);

  const thDeltaMobile = majorityMobile === 'up'
    ? `<span class="th-delta th-delta-up" title="Mayoría mejoró">${arrowSvg('up')}</span>`
    : majorityMobile === 'down'
      ? `<span class="th-delta th-delta-down" title="Mayoría empeoró">${arrowSvg('down')}</span>`
      : '<span class="th-delta">−</span>';
  const thDeltaDesktop = majorityDesktop === 'up'
    ? `<span class="th-delta th-delta-up" title="Mayoría mejoró">${arrowSvg('up')}</span>`
    : majorityDesktop === 'down'
      ? `<span class="th-delta th-delta-down" title="Mayoría empeoró">${arrowSvg('down')}</span>`
      : '<span class="th-delta">−</span>';

  const rows = summary.map((entry) => {
    const s = entry.sinBundle;
    const c = entry.conBundle;
    const arrowM = trendArrow(s.mobile.average, c.mobile.average, 'html');
    const arrowD = trendArrow(s.desktop.average, c.desktop.average, 'html');
    const classConMobile = avgCellClass(s.mobile.average, c.mobile.average);
    const classConDesktop = avgCellClass(s.desktop.average, c.desktop.average);
    return `
    <tr>
      <td>${shortLabel(entry.url)}</td>
      <td class="${classConMobile}">${cell(c.mobile.average, c.mobile.letter)}</td>
      <td>${cell(s.mobile.average, s.mobile.letter)}</td>
      <td class="${classConDesktop}">${cell(c.desktop.average, c.desktop.letter)}</td>
      <td>${cell(s.desktop.average, s.desktop.letter)}</td>
      <td>${arrowM}</td>
      <td>${arrowD}</td>
    </tr>`;
  }).join('');

  const detailSections = summary.map((entry) => {
    const s = entry.sinBundle;
    const c = entry.conBundle;
    const classConMobile = avgCellClass(s.mobile.average, c.mobile.average);
    const classConDesktop = avgCellClass(s.desktop.average, c.desktop.average);
    return `
    <section class="detail-section">
      <h3>${shortLabel(entry.url)}</h3>
      <p class="url-full">${entry.url}</p>
      ${entry.urlConBundle ? `<p class="url-full">Con bundle: ${entry.urlConBundle}</p>` : ''}
      <table class="detail-table">
        <thead><tr><th>Contexto</th><th>Valores</th><th>Promedio</th><th>Letra</th></tr></thead>
        <tbody>
          <tr><td>Sin bundle – Mobile</td><td>${s.mobile.values.join(', ') || '—'}</td><td>${s.mobile.average ?? '—'}</td><td>${s.mobile.letter}</td></tr>
          <tr><td>Sin bundle – Desktop</td><td>${s.desktop.values.join(', ') || '—'}</td><td>${s.desktop.average ?? '—'}</td><td>${s.desktop.letter}</td></tr>
          <tr><td>Con bundle – Mobile</td><td>${c.mobile.values.join(', ') || '—'}</td><td class="${classConMobile}">${c.mobile.average ?? '—'}</td><td>${c.mobile.letter}</td></tr>
          <tr><td>Con bundle – Desktop</td><td>${c.desktop.values.join(', ') || '—'}</td><td class="${classConDesktop}">${c.desktop.average ?? '—'}</td><td>${c.desktop.letter}</td></tr>
        </tbody>
      </table>
    </section>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte de performance – ${geo}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 1.5rem; color: #222; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
    h2 { font-size: 1.2rem; margin-top: 1.5rem; }
    h3 { font-size: 1rem; margin-top: 1rem; }
    .meta { background: #f5f5f5; padding: 0.75rem 1rem; border-radius: 6px; margin: 1rem 0; }
    .meta p { margin: 0.25rem 0; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #333; color: #fff; }
    tr:nth-child(even) { background: #f9f9f9; }
    .url-full { font-size: 0.8rem; color: #555; word-break: break-all; }
    .detail-section { margin-top: 1.5rem; }
    .detail-table { font-size: 0.85rem; }
    .cell-improved { background: #95E6AC !important; }
    .cell-worsened { background: #F7BEBE !important; }
    .cell-equal { background: #D5D5D5 !important; }
    .arrow-solid { display: inline-block; vertical-align: middle; }
    .arrow-wrap.arrow-up { color: #0a0; }
    .arrow-wrap.arrow-down { color: #c00; }
    .th-delta-cell .th-delta { font-size: 1.1em; margin-left: 0.2rem; display: inline-block; min-width: 10px; text-align: center; }
    .th-delta-cell .arrow-solid { width: 20px; height: 20px; }
    .th-delta-up { color: #0a0; }
    .th-delta-down { color: #c00; }
    .th-delta:not(.th-delta-up):not(.th-delta-down) { color: #ccc; }
    @media print { body { padding: 0; } .meta { background: #eee; } }
  </style>
</head>
<body>
  <h1>Reporte de performance – ${geo}</h1>
  <div class="meta">
    <p><strong>Fecha:</strong> ${date}</p>
    <p><strong>Duración del test:</strong> ${durationStr}</p>
    <p><strong>Número de bundle:</strong> ${bundleVersion || '—'}</p>
    <p><strong>Iteraciones por dispositivo:</strong> ${iterationsPerDevice}</p>
    <p><strong>Dispositivos:</strong> ${formFactor === 'all' ? 'Mobile y Desktop' : formFactor}</p>
  </div>

  <h2>Resumen por URL</h2>
  <table>
    <thead>
      <tr>
        <th>URL</th>
        <th>Con bundle (Mobile)</th>
        <th>Sin bundle (Mobile)</th>
        <th>Con bundle (Desktop)</th>
        <th>Sin bundle (Desktop)</th>
        <th class="th-delta-cell"> Mobile ${thDeltaMobile}</th>
        <th class="th-delta-cell"> Desktop ${thDeltaDesktop}</th>
      </tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>

  <h2>Detalle por URL</h2>
  ${detailSections}
</body>
</html>`;
}

/**
 * Escribe los archivos de reporte (.json ya lo escribe run-tests).
 * Genera .md y .html con el mismo nombre base que reportPath (ej. report-argentina-123).
 */
export function writeReportFiles(report, reportPathJson) {
  const base = reportPathJson.replace(/\.json$/i, '');
  const mdPath = `${base}.md`;
  const htmlPath = `${base}.html`;

  fs.writeFileSync(mdPath, buildMarkdown(report), 'utf8');
  fs.writeFileSync(htmlPath, buildHtml(report), 'utf8');

  return { mdPath, htmlPath };
}

/**
 * Genera un reporte final combinado (todas las geos) en HTML y MD.
 * reports: array de report objects [{ geo, ... }, ...]
 */
export function buildFinalReport(reports) {
  const { date, horario } = formatReportMeta(new Date());

  let md = `# Reporte final de performance – Todas las geolocalizaciones\n\n`;
  md += `**Fecha:** ${date}\n\n`;
  md += `**Horario del test:** ${horario}\n\n`;
  md += `---\n\n`;

  let htmlSections = '';

  for (const report of reports) {
    const { geo, bundleVersion, iterationsPerDevice, formFactor, summary } = report;
    md += `## ${geo}\n\n`;
    md += `| URL | Con bundle (Mobile) | Sin bundle (Mobile) | Con bundle (Desktop) | Sin bundle (Desktop) | Δ Mobile | Δ Desktop |\n`;
    md += `|-----|--------------------|---------------------|----------------------|----------------------|----------|----------|\n`;

    const rows = summary.map((entry) => {
      const s = entry.sinBundle;
      const c = entry.conBundle;
      const arrowM = trendArrow(s.mobile.average, c.mobile.average, 'html');
      const arrowD = trendArrow(s.desktop.average, c.desktop.average, 'html');
      return `<tr><td>${shortLabel(entry.url)}</td><td>${cell(c.mobile.average, c.mobile.letter)}</td><td>${cell(s.mobile.average, s.mobile.letter)}</td><td>${cell(c.desktop.average, c.desktop.letter)}</td><td>${cell(s.desktop.average, s.desktop.letter)}</td><td>${arrowM}</td><td>${arrowD}</td></tr>`;
    }).join('');

    for (const entry of summary) {
      const s = entry.sinBundle;
      const c = entry.conBundle;
      const arrowM = trendArrow(s.mobile.average, c.mobile.average, 'md');
      const arrowD = trendArrow(s.desktop.average, c.desktop.average, 'md');
      md += `| ${shortLabel(entry.url)} | ${cell(c.mobile.average, c.mobile.letter)} | ${cell(s.mobile.average, s.mobile.letter)} | ${cell(c.desktop.average, c.desktop.letter)} | ${cell(s.desktop.average, s.desktop.letter)} | ${arrowM} | ${arrowD} |\n`;
    }
    md += `\n`;

    htmlSections += `
    <section class="geo-section">
      <h2>${geo}</h2>
      <table>
        <thead><tr><th>URL</th><th>Con bundle (Mobile)</th><th>Sin bundle (Mobile)</th><th>Con bundle (Desktop)</th><th>Sin bundle (Desktop)</th><th>Δ Mobile</th><th>Δ Desktop</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte final de performance</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 1.5rem; color: #222; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
    h2 { font-size: 1.2rem; margin-top: 2rem; }
    .meta { background: #f5f5f5; padding: 0.75rem 1rem; border-radius: 6px; margin: 1rem 0; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #333; color: #fff; }
    tr:nth-child(even) { background: #f9f9f9; }
    .geo-section { margin-top: 2rem; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Reporte final de performance – Todas las geolocalizaciones</h1>
  <div class="meta">
    <p><strong>Fecha:</strong> ${date}</p>
    <p><strong>Horario del test:</strong> ${horario}</p>
  </div>
  ${htmlSections}
</body>
</html>`;

  return { md, html };
}

/**
 * Escribe el reporte final combinado. Debe llamarse con el array de report objects (en orden ARGENTINA, ESPANA, MEXICO).
 */
export function writeFinalReport(reports, reportsDir) {
  const { md, html } = buildFinalReport(reports);
  const base = path.join(reportsDir, `report-final-${Date.now()}`);
  const mdPath = `${base}.md`;
  const htmlPath = `${base}.html`;
  fs.writeFileSync(mdPath, md, 'utf8');
  fs.writeFileSync(htmlPath, html, 'utf8');
  return { mdPath, htmlPath };
}
