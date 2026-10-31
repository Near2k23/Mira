/**
 * Valida indice/fuentes.json y cada indice/titulos/*.json sin librerías.
 * La raíz sale de la ubicación del archivo (scripts/indice/, dos niveles abajo)
 * para que el mismo script funcione en esta plantilla y en la raíz del repo Mira.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(import.meta.dirname, '../..');

// Las mismas urls que arma la app (`urlDeSlug` en src/nativas de miraplus). Un sitio que va
// por API y no por url pública (doramasflix) no se puede comprobar así: se omite con aviso.
export const DOMINIOS = {
  animeav1: 'https://animeav1.com/media/{slug}',
  tioanime: 'https://tioanime.com/anime/{slug}',
};

// El guion va al final de la clase para que no forme un rango.
// Equivale a [a-z0-9-_/.]; el primer carácter tiene que ser letra o dígito.
const PATRON_SLUG = /^[a-z0-9][a-z0-9_/.-]*$/;
const PATRON_ID = /^[a-z0-9]+$/;
const PATRON_TEMPORADA = /^[1-9][0-9]*$/;

// Estos sitios resuelven por id de TMDB, así que su valor válido es {}.
// En cualquier otro sitio, {} quiere decir que falta el slug o las temporadas.
const SITIOS_SIN_SLUG = new Set(['embed69', 'vimeus']);

const CLAVES_RAIZ = new Set(['tmdb', 'tipo', 'categoria', 'titulo', 'fuentes', 'nota']);
const CLAVES_MOVIE = new Set(['slug']);
const CLAVES_TV = new Set(['temporadas', 'numeracion', 'desfase']);
const TIPOS = new Set(['tv', 'movie']);
const CATEGORIAS = new Set(['anime', 'dorama', 'tv', 'movie']);
const NUMERACIONES = new Set(['por-temporada', 'absoluta']);

function esObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function leerFuentes(raiz, errores) {
  const archivo = 'indice/fuentes.json';
  const ruta = path.join(raiz, 'indice', 'fuentes.json');
  let texto;
  try {
    texto = fs.readFileSync(ruta, 'utf8');
  } catch {
    errores.push({ archivo, mensaje: 'no existe' });
    return null;
  }

  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    errores.push({ archivo, mensaje: 'JSON inválido' });
    return null;
  }

  if (!esObjeto(datos)) {
    errores.push({ archivo, mensaje: 'debe ser un objeto' });
    return null;
  }

  const fallos = [];
  if (datos.version !== 1) fallos.push('version debe ser 1');

  const categorias = datos.categorias;
  const sitios = new Set();
  if (!esObjeto(categorias) || Object.keys(categorias).length === 0) {
    fallos.push('categorias debe ser un objeto no vacío');
  } else {
    for (const [categoria, lista] of Object.entries(categorias)) {
      if (!Array.isArray(lista) || lista.length === 0) {
        fallos.push(`categorias.${categoria} debe ser un array no vacío`);
        continue;
      }
      for (const id of lista) {
        if (typeof id !== 'string' || !PATRON_ID.test(id)) {
          fallos.push(`id de sitio inválido en "${categoria}": ${JSON.stringify(id)}`);
        } else {
          sitios.add(id);
        }
      }
    }
  }

  for (const mensaje of fallos) errores.push({ archivo, mensaje });
  // Con la lista rota no se puede decidir si un sitio existe.
  return fallos.length === 0 ? sitios : null;
}

function listarTitulos(raiz, errores) {
  const dir = path.join(raiz, 'indice', 'titulos');
  let entradas;
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    errores.push({ archivo: 'indice/titulos', mensaje: 'no existe el directorio' });
    return [];
  }
  return entradas
    .filter((entrada) => entrada.isFile() && entrada.name.endsWith('.json'))
    .map((entrada) => entrada.name)
    .sort();
}

function validarSlug(sitio, slug, fallos) {
  if (typeof slug !== 'string' || !PATRON_SLUG.test(slug)) {
    fallos.push(`sitio "${sitio}" slug ${JSON.stringify(slug)}: no cumple el patrón`);
  }
}

function validarTemporadas(sitio, temporadas, fallos) {
  if (!esObjeto(temporadas)) {
    fallos.push(`temporadas de "${sitio}" debe ser un objeto`);
    return;
  }
  const claves = Object.keys(temporadas);
  if (claves.length === 0) {
    fallos.push(`temporadas de "${sitio}" no puede estar vacío`);
    return;
  }
  for (const [clave, valor] of Object.entries(temporadas)) {
    if (!PATRON_TEMPORADA.test(clave)) {
      fallos.push(`clave desconocida "${clave}" en temporadas de "${sitio}"`);
    }
    if (Array.isArray(valor)) validarTramos(sitio, clave, valor, fallos);
    else validarSlug(sitio, valor, fallos);
  }
}

/**
 * Una temporada que el sitio publica como varios animes (Kimetsu T2: Tren Infinito, 7 cap., y
 * Distrito Rojo): tramos en orden, cada uno con su slug y cuántos capítulos cubre; el último
 * puede omitir `episodios` y se lleva el resto.
 */
function validarTramos(sitio, temporada, tramos, fallos) {
  if (tramos.length === 0) {
    fallos.push(`temporada ${temporada} de "${sitio}": los tramos no pueden estar vacíos`);
    return;
  }
  tramos.forEach((tramo, i) => {
    const donde = `temporada ${temporada} de "${sitio}", tramo ${i + 1}`;
    if (!esObjeto(tramo)) {
      fallos.push(`${donde}: debe ser { "slug", "episodios" }`);
      return;
    }
    for (const k of Object.keys(tramo)) {
      if (k !== 'slug' && k !== 'episodios') fallos.push(`${donde}: clave desconocida "${k}"`);
    }
    validarSlug(sitio, tramo.slug, fallos);
    const ultimo = i === tramos.length - 1;
    if (tramo.episodios === undefined ? !ultimo : !(Number.isInteger(tramo.episodios) && tramo.episodios > 0)) {
      fallos.push(`${donde}: "episodios" debe ser un entero mayor que 0 (solo el último tramo puede omitirlo)`);
    }
  });
}

function validarDesfase(sitio, desfase, fallos) {
  if (!esObjeto(desfase)) {
    fallos.push(`desfase de "${sitio}" debe ser un objeto`);
    return;
  }
  for (const [clave, valor] of Object.entries(desfase)) {
    if (!PATRON_TEMPORADA.test(clave)) {
      fallos.push(`clave desconocida "${clave}" en desfase de "${sitio}"`);
    }
    if (!Number.isInteger(valor)) {
      fallos.push(`desfase de "${sitio}" temporada "${clave}" debe ser un entero`);
    }
  }
}

function validarFuente(sitio, valor, tipo, fallos) {
  if (!esObjeto(valor)) {
    fallos.push(`sitio "${sitio}": debe ser un objeto`);
    return;
  }

  const claves = Object.keys(valor);
  if (SITIOS_SIN_SLUG.has(sitio)) {
    if (claves.length !== 0) fallos.push(`sitio "${sitio}" debe ser {}`);
    return;
  }
  if (claves.length === 0) {
    fallos.push(`sitio "${sitio}": falta slug o temporadas`);
    return;
  }
  if (tipo !== 'movie' && tipo !== 'tv') return;

  const permitidas = tipo === 'movie' ? CLAVES_MOVIE : CLAVES_TV;
  for (const clave of claves) {
    if (!permitidas.has(clave)) fallos.push(`clave desconocida "${clave}" en "${sitio}"`);
  }

  if (tipo === 'movie') {
    if (!Object.hasOwn(valor, 'slug')) fallos.push(`sitio "${sitio}": falta slug`);
    else validarSlug(sitio, valor.slug, fallos);
    return;
  }

  if (!Object.hasOwn(valor, 'temporadas')) fallos.push(`sitio "${sitio}": falta temporadas`);
  else validarTemporadas(sitio, valor.temporadas, fallos);

  if (Object.hasOwn(valor, 'numeracion') && !NUMERACIONES.has(valor.numeracion)) {
    fallos.push(`numeracion de "${sitio}" debe ser "por-temporada" o "absoluta"`);
  }
  if (Object.hasOwn(valor, 'desfase')) validarDesfase(sitio, valor.desfase, fallos);
}

function validarArchivo(raiz, nombre, sitios) {
  const archivo = `indice/titulos/${nombre}`;
  const ruta = path.join(raiz, 'indice', 'titulos', nombre);
  const fallos = [];

  let datos;
  try {
    datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    return { archivo, fallos: ['JSON inválido'], datos: null };
  }

  if (!esObjeto(datos)) {
    return { archivo, fallos: ['debe ser un objeto'], datos: null };
  }

  for (const clave of Object.keys(datos)) {
    if (!CLAVES_RAIZ.has(clave)) fallos.push(`clave desconocida "${clave}"`);
  }

  const tmdbOk = Number.isInteger(datos.tmdb) && datos.tmdb >= 1;
  if (!tmdbOk) fallos.push('tmdb debe ser un entero mayor que 0');
  if (!TIPOS.has(datos.tipo)) fallos.push('tipo debe ser "tv" o "movie"');
  if (!CATEGORIAS.has(datos.categoria)) {
    fallos.push('categoria debe ser "anime", "dorama", "tv" o "movie"');
  }
  if (typeof datos.titulo !== 'string' || datos.titulo.length === 0) {
    fallos.push('titulo debe ser un texto no vacío');
  }
  if (Object.hasOwn(datos, 'nota') && typeof datos.nota !== 'string') {
    fallos.push('nota debe ser un texto');
  }

  if (tmdbOk && TIPOS.has(datos.tipo)) {
    const esperado = `${datos.tipo}-${datos.tmdb}.json`;
    if (nombre !== esperado) fallos.push(`el nombre del archivo debe ser ${esperado}`);
  }

  if (!esObjeto(datos.fuentes) || Object.keys(datos.fuentes).length === 0) {
    fallos.push('fuentes debe ser un objeto no vacío');
  } else {
    for (const [sitio, valor] of Object.entries(datos.fuentes)) {
      if (!PATRON_ID.test(sitio)) {
        fallos.push(`id de sitio inválido "${sitio}"`);
        continue;
      }
      if (sitios && !sitios.has(sitio)) {
        fallos.push(`sitio desconocido "${sitio}" (no está en fuentes.json)`);
      }
      validarFuente(sitio, valor, datos.tipo, fallos);
    }
  }

  return { archivo, fallos, datos };
}

async function cerrar(respuesta) {
  try {
    await respuesta.body?.cancel();
  } catch {
    // El estado ya está leído; cerrar solo evita seguir descargando.
  }
}

async function estadoUrl(url) {
  let estadoHead = null;
  try {
    const head = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    await cerrar(head);
    if (head.ok) return { ok: true, status: head.status };
    estadoHead = head.status;
  } catch {
    estadoHead = null;
  }

  // Muchos sitios rechazan HEAD. Si no hubo 2xx, se prueba con GET.
  try {
    const get = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    await cerrar(get);
    if (get.ok) return { ok: true, status: get.status };
    return { ok: false, status: get.status };
  } catch {
    if (estadoHead !== null) return { ok: false, status: estadoHead };
    return { ok: false, status: null };
  }
}

function slugsDe(tipo, valor) {
  if (tipo === 'movie') return [valor.slug];
  return Object.values(valor.temporadas).flatMap((v) => (Array.isArray(v) ? v.map((t) => t.slug) : [v]));
}

async function comprobarRed(titulos, avisos, errores) {
  for (const titulo of titulos) {
    for (const [sitio, valor] of Object.entries(titulo.datos.fuentes)) {
      const plantilla = DOMINIOS[sitio];
      if (!plantilla) {
        avisos.push(`${titulo.archivo}: sitio ${sitio} sin dominio en la tabla, se omite`);
        continue;
      }
      for (const slug of slugsDe(titulo.datos.tipo, valor)) {
        const url = plantilla.replaceAll('{slug}', slug);
        const estado = await estadoUrl(url);
        if (estado.ok) continue;
        const detalle = estado.status == null
          ? 'no responde (timeout o error de red)'
          : `responde ${estado.status}`;
        errores.push({
          archivo: titulo.archivo,
          mensaje: `sitio "${sitio}" slug "${slug}": ${detalle}`,
        });
      }
    }
  }
}

export async function validarTitulos({ raiz = RAIZ, red = false } = {}) {
  const errores = [];
  const avisos = [];
  const titulos = [];

  const sitios = leerFuentes(raiz, errores);
  for (const nombre of listarTitulos(raiz, errores)) {
    const resultado = validarArchivo(raiz, nombre, sitios);
    for (const mensaje of resultado.fallos) errores.push({ archivo: resultado.archivo, mensaje });
    if (resultado.fallos.length === 0) {
      titulos.push({ archivo: resultado.archivo, datos: resultado.datos });
    }
  }

  // Con errores locales la red no aporta: el índice ya no se puede publicar.
  if (red && errores.length === 0) await comprobarRed(titulos, avisos, errores);

  return { errores, avisos, titulos };
}

const invocacion = process.argv[1];
const esEntrada = typeof invocacion === 'string'
  && fileURLToPath(import.meta.url) === path.resolve(invocacion);

if (esEntrada) {
  const red = process.argv.includes('--red');
  const { errores, avisos, titulos } = await validarTitulos({ red });
  for (const { archivo, mensaje } of errores) {
    console.log(`ERROR ${archivo}: ${mensaje}`);
  }
  for (const texto of avisos) {
    console.log(`AVISO: ${texto}`);
  }
  if (errores.length > 0) {
    console.log(`FALLO: ${errores.length} errores`);
    process.exit(1);
  }
  console.log(`OK: ${titulos.length} títulos válidos`);
}
