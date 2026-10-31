/**
 * Arma indice/catalogo.json a partir de los títulos ya validados.
 * Si TMDB falla no escribe nada: un catálogo público a medias se vería
 * como si el título no tuviera ficha.
 * Si el contenido no cambió, no toca el archivo: así `generado` se queda
 * quieto y el workflow solo hace commit cuando hay una diferencia real.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, validarTitulos } from './validar.mjs';

const LIMITE = 4;

function presente(valor) {
  // En Actions un secret no definido llega como cadena vacía.
  return typeof valor === 'string' && valor.length > 0;
}

function credencial() {
  if (presente(process.env.TMDB_TOKEN)) return { token: process.env.TMDB_TOKEN };
  if (presente(process.env.TMDB_API_KEY)) return { clave: process.env.TMDB_API_KEY };
  return null;
}

function anioDe(fecha) {
  if (typeof fecha !== 'string' || fecha.length < 4) return null;
  const anio = Number(fecha.slice(0, 4));
  return Number.isInteger(anio) ? anio : null;
}

// El catálogo lo baja cada app: con decenas de miles de títulos, la sinopsis entera lo haría
// pesar decenas de MB. El inicio solo muestra unas líneas; la ficha pide la completa a TMDB.
const MAX_RESUMEN = 220;
function recortar(texto) {
  if (texto.length <= MAX_RESUMEN) return texto;
  const corte = texto.lastIndexOf(' ', MAX_RESUMEN);
  return `${texto.slice(0, corte > 0 ? corte : MAX_RESUMEN)}…`;
}

function entrada(datos, campos) {
  return {
    tmdb: datos.tmdb,
    tipo: datos.tipo,
    categoria: datos.categoria,
    titulo: campos.titulo,
    anio: campos.anio,
    poster: campos.poster,
    backdrop: campos.backdrop,
    resumen: campos.resumen,
    puntaje: campos.puntaje,
    generos: campos.generos,
    idioma: campos.idioma,
  };
}

function entradaSinFicha(datos) {
  return entrada(datos, {
    titulo: datos.titulo,
    anio: null,
    poster: null,
    backdrop: null,
    resumen: '',
    puntaje: null,
    generos: [],
    idioma: null,
  });
}

async function pedirTmdb(datos, cred) {
  const url = new URL(`https://api.themoviedb.org/3/${datos.tipo}/${datos.tmdb}`);
  url.searchParams.set('language', 'es-MX');
  const headers = { accept: 'application/json' };
  if (cred.token) headers.authorization = `Bearer ${cred.token}`;
  else url.searchParams.set('api_key', cred.clave);

  let respuesta;
  try {
    respuesta = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  } catch {
    const error = new Error('red');
    error.publico = 'TMDB error de red';
    throw error;
  }

  if (!respuesta.ok) {
    await respuesta.body?.cancel().catch(() => {});
    const error = new Error('http');
    error.publico = `TMDB ${respuesta.status}`;
    throw error;
  }

  let cuerpo;
  try {
    cuerpo = await respuesta.json();
  } catch {
    const error = new Error('json');
    error.publico = 'TMDB error de red';
    throw error;
  }

  const crudo = datos.tipo === 'movie' ? cuerpo.title : cuerpo.name;
  const fecha = datos.tipo === 'movie' ? cuerpo.release_date : cuerpo.first_air_date;
  return entrada(datos, {
    titulo: typeof crudo === 'string' && crudo.length > 0 ? crudo : datos.titulo,
    anio: anioDe(fecha),
    poster: typeof cuerpo.poster_path === 'string' ? cuerpo.poster_path : null,
    backdrop: typeof cuerpo.backdrop_path === 'string' ? cuerpo.backdrop_path : null,
    resumen: typeof cuerpo.overview === 'string' ? recortar(cuerpo.overview) : '',
    puntaje: typeof cuerpo.vote_average === 'number' && cuerpo.vote_count > 0 ? Math.round(cuerpo.vote_average * 10) / 10 : null,
    generos: Array.isArray(cuerpo.genres) ? cuerpo.genres.map((g) => g.id) : [],
    idioma: typeof cuerpo.original_language === 'string' ? cuerpo.original_language : null,
  });
}

async function enPool(items, tarea) {
  const salida = new Array(items.length);
  let indice = 0;

  async function trabajador() {
    while (indice < items.length) {
      const actual = indice;
      indice += 1;
      salida[actual] = await tarea(items[actual]);
    }
  }

  // Cuatro a la vez, con un índice compartido: no hace falta una librería de colas.
  const trabajadores = Math.min(LIMITE, items.length);
  await Promise.all(Array.from({ length: trabajadores }, () => trabajador()));
  return salida;
}

function igualSinGenerado(previo, nuevo) {
  if (!previo || typeof previo !== 'object') return false;
  const antes = JSON.stringify({ version: previo.version, titulos: previo.titulos });
  const ahora = JSON.stringify({ version: nuevo.version, titulos: nuevo.titulos });
  return antes === ahora;
}

function ordenar(a, b) {
  const porCategoria = a.categoria.localeCompare(b.categoria, 'es');
  if (porCategoria !== 0) return porCategoria;
  const porTitulo = a.titulo.localeCompare(b.titulo, 'es');
  if (porTitulo !== 0) return porTitulo;
  return a.tmdb - b.tmdb;
}

const { errores, titulos } = await validarTitulos({ raiz: RAIZ, red: false });
if (errores.length > 0) {
  for (const { archivo, mensaje } of errores) {
    console.log(`ERROR ${archivo}: ${mensaje}`);
  }
  process.exit(1);
}

const destino = path.join(RAIZ, 'indice', 'catalogo.json');
let previo = null;
try {
  previo = JSON.parse(fs.readFileSync(destino, 'utf8'));
} catch {
  previo = null;
}

// Lo que ya se pidió a TMDB (trae `resumen`) se reutiliza: con miles de títulos, pedirlos todos
// en cada push tardaría minutos. Solo se piden los nuevos y los que salieron sin ficha.
const yaPedidos = new Map(
  (previo?.titulos ?? []).filter((t) => typeof t.resumen === 'string' && t.poster).map((t) => [`${t.tipo}-${t.tmdb}`, t]),
);
const reutilizada = (datos) => {
  const t = yaPedidos.get(`${datos.tipo}-${datos.tmdb}`);
  return t ? { ...t, categoria: datos.categoria, resumen: recortar(t.resumen) } : null;
};

const cred = credencial();
let entradas;
let conDatos = 0;

if (!cred) {
  console.log('AVISO: sin TMDB_TOKEN ni TMDB_API_KEY: catálogo sin años ni carteles');
  entradas = titulos.map(({ datos }) => reutilizada(datos) ?? entradaSinFicha(datos));
} else {
  const fallos = [];
  entradas = await enPool(titulos, async ({ archivo, datos }) => {
    const antes = reutilizada(datos);
    if (antes) return antes;
    try {
      return await pedirTmdb(datos, cred);
    } catch (error) {
      // Nunca el mensaje crudo: puede traer la URL con api_key.
      fallos.push({ archivo, mensaje: error.publico || 'TMDB error de red' });
      return null;
    }
  });
  if (fallos.length > 0) {
    fallos.sort((a, b) => a.archivo.localeCompare(b.archivo, 'es'));
    for (const { archivo, mensaje } of fallos) {
      console.log(`ERROR ${archivo}: ${mensaje}`);
    }
    process.exit(1);
  }
  conDatos = entradas.length;
}

entradas.sort(ordenar);

const nuevo = {
  version: 1,
  generado: new Date().toISOString(),
  titulos: entradas,
};

if (igualSinGenerado(previo, nuevo)) {
  console.log('Catálogo sin cambios');
} else {
  // Un título por línea: pesa la mitad que con sangría y el diff sigue siendo legible.
  const lineas = nuevo.titulos.map((t) => `    ${JSON.stringify(t)}`).join(',\n');
  fs.writeFileSync(
    destino,
    `{\n  "version": ${nuevo.version},\n  "generado": ${JSON.stringify(nuevo.generado)},\n  "titulos": [\n${lineas}\n  ]\n}\n`,
  );
  console.log(`Catálogo: ${entradas.length} títulos (${conDatos} con datos de TMDB) -> indice/catalogo.json`);
}
