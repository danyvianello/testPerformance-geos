/**
 * Genera reportes en formato guía: Markdown y HTML (para imprimir/PDF).
 * Sigue un modelo de resumen ejecutivo + tabla + detalle por URL.
 */

import fs from 'fs';
import path from 'path';

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

/** Flecha según si mejoró (con bundle > sin bundle) o empeoró. Devuelve HTML o texto para MD. */
function trendArrow(sinAvg, conAvg, format = 'html') {
  if (sinAvg == null || conAvg == null) return format === 'html' ? '<span>—</span>' : '—';
  const improved = conAvg > sinAvg;
  const same = conAvg === sinAvg;
  if (format === 'html') {
    if (same) return '<span style="color:#666">−</span>';
    return improved
      ? '<span style="color:#0a0" title="Mejoró con bundle">↑</span>'
      : '<span style="color:#c00" title="Empeoró con bundle">↓</span>';
  }
  if (same) return '−';
  return improved ? '↑' : '↓';
}

/**
 * Genera el contenido Markdown del reporte (modelo guía).
 */
export function buildMarkdown(report) {
  const { geo, bundleVersion, timestamp, iterationsPerDevice, formFactor, summary } = report;
  const date = new Date(timestamp).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' });
  const horario = new Date(timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  let md = '';
  md += `# Reporte de performance – ${geo}\n\n`;
  md += `**Fecha:** ${date}  \n`;
  md += `**Horario del test:** ${horario}  \n`;
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
  const { geo, bundleVersion, timestamp, iterationsPerDevice, formFactor, summary } = report;
  const date = new Date(timestamp).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' });
  const horario = new Date(timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  const rows = summary.map((entry) => {
    const s = entry.sinBundle;
    const c = entry.conBundle;
    const arrowM = trendArrow(s.mobile.average, c.mobile.average, 'html');
    const arrowD = trendArrow(s.desktop.average, c.desktop.average, 'html');
    return `
    <tr>
      <td>${shortLabel(entry.url)}</td>
      <td>${cell(c.mobile.average, c.mobile.letter)}</td>
      <td>${cell(s.mobile.average, s.mobile.letter)}</td>
      <td>${cell(c.desktop.average, c.desktop.letter)}</td>
      <td>${cell(s.desktop.average, s.desktop.letter)}</td>
      <td>${arrowM}</td>
      <td>${arrowD}</td>
    </tr>`;
  }).join('');

  const detailSections = summary.map((entry) => {
    const s = entry.sinBundle;
    const c = entry.conBundle;
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
          <tr><td>Con bundle – Mobile</td><td>${c.mobile.values.join(', ') || '—'}</td><td>${c.mobile.average ?? '—'}</td><td>${c.mobile.letter}</td></tr>
          <tr><td>Con bundle – Desktop</td><td>${c.desktop.values.join(', ') || '—'}</td><td>${c.desktop.average ?? '—'}</td><td>${c.desktop.letter}</td></tr>
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
    @media print { body { padding: 0; } .meta { background: #eee; } }
  </style>
</head>
<body>
  <h1>Reporte de performance – ${geo}</h1>
  <div class="meta">
    <p><strong>Fecha:</strong> ${date}</p>
    <p><strong>Horario del test:</strong> ${horario}</p>
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
        <th>Δ Mobile</th>
        <th>Δ Desktop</th>
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
  const now = new Date();
  const date = now.toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' });
  const horario = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

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
