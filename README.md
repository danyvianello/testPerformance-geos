# Tests de performance (tipo Lighthouse)

Tests de performance iterando 3 veces por URL en **mobile** y 3 en **desktop**, con y sin parámetro de bundle, para **Argentina**, **España**, **México**, **Perú**, **Colombia** y **Estados Unidos**. Cada resumen se guarda en un archivo en `reports/`.

## Requisitos

- Node.js 18+
- Chrome/Chromium (para Lighthouse)

## Variables de entorno

Copia `.env.example` a `.env` y configura:

| Variable        | Descripción |
|----------------|-------------|
| `BUNDLE_VERSION` | Número o identificador del bundle a comparar. Se agrega a cada URL como `?d=BUNDLE_VERSION` (o `&d=...` si la URL ya tiene query). Ej: `123`, `prod`, `v2`. |
| `GEO`            | **Dejarla vacía.** `test:perf` corre las 6 geos. Para una sola: `test:perf:argentina`, `test:perf:espana`, `test:perf:mexico`, `test:perf:peru`, `test:perf:colombia` o `test:perf:estados_unidos`. |
| `PERF_ITERATIONS` | Iteraciones por dispositivo (1–5). Default: 3. Con `1` el test va mucho más rápido pero el promedio es una sola medición. |
| `PERF_FORM_FACTOR` | `all` \| `mobile` \| `desktop`. Default: `all`. Con `mobile` o `desktop` solo se mide ese dispositivo (~2× más rápido). |
| `PERF_CONCURRENCY` | Número de URLs en paralelo (1–8). Default: 1. Con `2` ~40–50% más rápido; con 4–6 en máquinas con 16+ GB RAM. |

**URL base:** `https://www.infobae.com/`. Todas las URLs de prueba usan este dominio; las que llevan bundle añaden `?d=<BUNDLE_VERSION>`.

## Cómo se ejecutan los tests

- Por cada URL:
  - **Sin bundle:** 3 corridas en mobile + 3 en desktop → se promedian y se asigna letra (A/B/C/D/F).
  - **Con bundle:** 3 corridas en mobile + 3 en desktop → mismo proceso.
- Es decir, cada URL se recorre **6 veces sin bundle** (3 mobile + 3 desktop) y **6 veces con bundle** (3 mobile + 3 desktop).
- Las letras de performance se calculan sobre el promedio de las 3 iteraciones por dispositivo.

## Scripts

```bash
# Instalar dependencias
npm install

# Test de performance sobre las 6 geos (Argentina, España, México, Perú, Colombia, Estados Unidos). Genera 6 reportes en reports/
npm run test:perf

# Solo una geo (útil para pruebas rápidas o una región concreta):
npm run test:perf:argentina
npm run test:perf:espana
npm run test:perf:mexico
npm run test:perf:peru
npm run test:perf:colombia
npm run test:perf:estados_unidos
```

### Medir desde cada país (VPN)

Las peticiones salen desde tu red. Para que cada reporte refleje **realmente** la red del país:

1. Conectá la VPN al país deseado (ej. Argentina).
2. Ejecutá el test de esa geo: `npm run test:perf:argentina`.
3. Cambiá la VPN al siguiente país y ejecutá `npm run test:perf:espana` (y luego México con `test:perf:mexico`).

Si corrés `npm run test:perf` sin cambiar VPN, los seis reportes se miden desde la misma ubicación; solo cambia el nombre del archivo.

### Dar más velocidad al test

Sin tocar workers (se mantiene 1 para no afectar resultados), podés acelerar así:

| Opción | Variable | Efecto |
|--------|----------|--------|
| URLs en paralelo | `PERF_CONCURRENCY=2` (o `3`) | 2–3 Chromes procesando URLs a la vez; tiempo total suele bajar ~40–50% (con 2). |
| Menos iteraciones | `PERF_ITERATIONS=1` (o `2`) | ~3× más rápido con 1 iteración; el “promedio” es una sola corrida (más variación). |
| Solo mobile o solo desktop | `PERF_FORM_FACTOR=mobile` o `PERF_FORM_FACTOR=desktop` | ~2× más rápido; se mide solo ese dispositivo. |
| Una sola geo | `npm run test:perf:argentina` (en vez de `test:perf`) | Menos tiempo; un solo reporte. |

### Paralelizar

Con `PERF_CONCURRENCY` se lanzan varias instancias de Chrome y se procesan varias URLs a la vez. El tiempo total baja de forma notable (con 4–6, en torno a la mitad o menos del tiempo de una sola).

**RAM aproximada por nivel:**

| PERF_CONCURRENCY | Chromes | RAM estimada | Uso recomendado |
|------------------|---------|--------------|------------------|
| 4 | 4 | ~1,5–2,5 GB | **Recomendado en Windows** (más estable) |
| 6 | 6 | ~2,5–4 GB | Cómodo, más rápido |
| 8 | 8 | ~3–5 GB | Puede dar errores de Lighthouse en Windows (marks en paralelo) |

**Nota:** Con 8 instancias en paralelo, Lighthouse a veces lanza errores internos (`performance mark has not been set`) porque las marcas de tiempo son globales en el proceso. En Windows conviene usar **4 o 6**. Los avisos *"No se pudo cerrar Chrome limpiamente"* (EPERM) son normales y no afectan el reporte.

Podés combinar paralelismo y número de bundle en la misma línea:

**PowerShell (Windows):**
```powershell
$env:PERF_CONCURRENCY=6; $env:BUNDLE_VERSION=3844; npm run test:perf:espana
```

**CMD (Windows):**
```cmd
set PERF_CONCURRENCY=6 && set BUNDLE_VERSION=3844 && npm run test:perf:espana
```

**Bash / Git Bash / Linux / Mac:**
```bash
PERF_CONCURRENCY=6 BUNDLE_VERSION=3844 npm run test:perf:espana
```

Recomendación en Windows: usar `PERF_CONCURRENCY=4` o `6` en lugar de 8 para evitar fallos de Lighthouse. También podés fijar ambas variables en `.env` y ejecutar solo `npm run test:perf:argentina` (o la geo que quieras).

Atajo para prueba rápida (1 geo, 1 iteración, solo mobile):

```bash
npm run test:perf:fast
```

O con variables en `.env`: `PERF_ITERATIONS=1`, `PERF_FORM_FACTOR=mobile`, y ejecutar `npm run test:perf:argentina`.

## Reportes

Al finalizar cada test se generan **tres archivos** por geo en `reports/`:

| Archivo | Descripción |
|---------|-------------|
| `report-<geo>-<timestamp>.json` | Datos crudos para integración o scripts. |
| `report-<geo>-<timestamp>.md`  | **Guía en Markdown**: resumen por URL (tabla) + detalle por URL. |
| `report-<geo>-<timestamp>.html`| **Guía en HTML**: mismo contenido, listo para abrir en el navegador e **imprimir a PDF**. |

Si ejecutás `npm run test:perf` (las 6 geos), además se genera un **reporte final combinado**:

- `report-final-<timestamp>.md` y `report-final-<timestamp>.html` con todas las geolocalizaciones en un solo documento.

**Estructura de los reportes:** bloque de configuración (fecha, **número de bundle** tomado de `BUNDLE_VERSION`, iteraciones, dispositivos), tabla resumen por URL y detalle por URL.

**Tabla resumen:** columnas ordenadas por dispositivo (Con bundle Mobile → Sin bundle Mobile → Con bundle Desktop → Sin bundle Desktop), más dos columnas de tendencia:
- **Δ Mobile** y **Δ Desktop**: flecha verde ↑ si la performance mejoró con bundle, flecha roja ↓ si empeoró, guión − si no hubo cambio.

## URLs incluidas (3 arrays)

Las mismas URLs se usan para **todas las geos**. Los tres arrays se concatenan en un solo listado por ejecución.

**Array 1 (notas/secciones):**

- `/espana/2026/03/03/el-bce-avisa-de-que-el-conflicto-en-oriente-medio-...`
- `/sociedad/`
- `/america/mundo/2026/03/03/en-vivo-israel-y-estados-unidos-atacan-iran/`

**Array 2 (fotos, secciones):**

- `/fotos/2024/06/13/30-fotos-de-la-presentacion-de-el-precio-de-una-traicion-de-diego-fischer/?outputType=amp-type`
- `/mundial-2026/`

**Array 3 (homes por país):**

- `/?noredirect` (Argentina)
- `/espana/` (España)
- `/mexico/` (México)
- `/colombia/`
- `/peru/`
- `/estados-unidos/`

## Geolocalización

Lighthouse se ejecuta en tu máquina; la “geolocalización” es el valor de `GEO` con el que corres el script. Para medir desde cada país de forma real (red y latencia distintas), conviene ejecutar el mismo script desde un servidor o runner en cada país (por ejemplo una vez con `GEO=ARGENTINA` desde Argentina, etc.) o usar un servicio como WebPageTest con ubicaciones en AR/ES/MX/PE/CO/US.
