/**
 * Ejecuta los tests de performance para las 3 geolocalizaciones en secuencia.
 * Genera un reporte por geo y al final un reporte combinado (guía MD + HTML).
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFinalReport } from './report-builder.js';
import { GEOS } from './urls.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

function runGeo(geo) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['src/run-tests.js'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env, GEO: geo },
      shell: true,
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`GEO=${geo} exit ${code}`))));
  });
}

/** Devuelve el path del JSON más reciente para una geo (ej. report-argentina-*.json). */
function getLatestReportPath(geo) {
  const prefix = `report-${geo.toLowerCase()}-`;
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const files = fs.readdirSync(REPORTS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(REPORTS_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? path.join(REPORTS_DIR, files[0].name) : null;
}

async function main() {
  for (const geo of GEOS) {
    await runGeo(geo);
  }

  const reports = [];
  for (const geo of GEOS) {
    const reportPath = getLatestReportPath(geo);
    if (reportPath) {
      const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      reports.push(data);
    }
  }

  if (reports.length === GEOS.length) {
    const { mdPath, htmlPath } = writeFinalReport(reports, REPORTS_DIR);
    console.log('\nReporte final (todas las geos):');
    console.log(`  Guía (MD):  ${mdPath}`);
    console.log(`  Guía (HTML): ${htmlPath}`);
  }

  console.log('\nTodas las geolocalizaciones completadas. Revisa la carpeta reports/.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
