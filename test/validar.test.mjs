import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validarTitulos } from '../scripts/indice/validar.mjs';

// test/ queda un nivel bajo la raíz, aquí y cuando se copie a Mira.
const RAIZ = path.resolve(import.meta.dirname, '..');

test('los tres ejemplos de la plantilla son válidos', async () => {
  const { errores, titulos } = await validarTitulos({ raiz: RAIZ });
  assert.equal(errores.length, 0);
  assert.deepEqual(
    titulos.map((titulo) => titulo.archivo).sort(),
    [
      'indice/titulos/movie-635302.json',
      'indice/titulos/tv-85937.json',
      'indice/titulos/tv-96162.json',
    ],
  );
});

test('rechaza sitio desconocido, slug en mayúsculas y nombre de archivo', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mira-indice-'));
  try {
    const titulos = path.join(tmp, 'indice', 'titulos');
    fs.mkdirSync(titulos, { recursive: true });
    fs.copyFileSync(
      path.join(RAIZ, 'indice', 'fuentes.json'),
      path.join(tmp, 'indice', 'fuentes.json'),
    );

    fs.writeFileSync(
      path.join(titulos, 'movie-1.json'),
      `${JSON.stringify({
        tmdb: 1,
        tipo: 'movie',
        categoria: 'movie',
        titulo: 'x',
        fuentes: { sitiofalso: { slug: 'x' } },
      })}\n`,
    );
    fs.writeFileSync(
      path.join(titulos, 'movie-2.json'),
      `${JSON.stringify({
        tmdb: 2,
        tipo: 'movie',
        categoria: 'anime',
        titulo: 'x',
        fuentes: { animeav1: { slug: 'Kimetsu-No' } },
      })}\n`,
    );
    fs.writeFileSync(
      path.join(titulos, 'tv-3.json'),
      `${JSON.stringify({
        tmdb: 4,
        tipo: 'tv',
        categoria: 'tv',
        titulo: 'x',
        fuentes: { embed69: {} },
      })}\n`,
    );

    const { errores } = await validarTitulos({ raiz: tmp });
    const de = (nombre) => errores.filter((error) => error.archivo === `indice/titulos/${nombre}`);

    assert.ok(de('movie-1.json').some((error) => error.mensaje.includes('desconocido')));
    assert.ok(de('movie-2.json').some((error) => error.mensaje.includes('Kimetsu-No')));
    assert.ok(de('tv-3.json').some((error) => error.mensaje.includes('nombre')));
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }
});

test('los tramos: solo el último puede omitir los episodios', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mira-indice-'));
  try {
    const titulos = path.join(tmp, 'indice', 'titulos');
    fs.mkdirSync(titulos, { recursive: true });
    fs.copyFileSync(path.join(RAIZ, 'indice', 'fuentes.json'), path.join(tmp, 'indice', 'fuentes.json'));
    const serie = (tmdb, tramos) => ({
      tmdb,
      tipo: 'tv',
      categoria: 'anime',
      titulo: 'x',
      fuentes: { animeav1: { temporadas: { '2': tramos } } },
    });
    fs.writeFileSync(path.join(titulos, 'tv-10.json'), JSON.stringify(serie(10, [{ slug: 'a', episodios: 7 }, { slug: 'b' }])));
    fs.writeFileSync(path.join(titulos, 'tv-11.json'), JSON.stringify(serie(11, [{ slug: 'a' }, { slug: 'b' }])));

    const { errores } = await validarTitulos({ raiz: tmp });
    assert.equal(errores.filter((e) => JSON.stringify(e).includes("tv-10.json")).length, 0);
    assert.ok(errores.some((e) => JSON.stringify(e).includes("tv-11.json") && JSON.stringify(e).includes("episodios")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
