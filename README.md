# Índice verificado

Índice que dice, por cada título de TMDB, en qué sitio está y con qué slug. La app Mira lo lee desde `https://raw.githubusercontent.com/Near2k23/Mira/main/indice/`.

## Agregar un título

Copia un ejemplo de `indice/titulos/` y nómbralo `${tipo}-${tmdb}.json` (por ejemplo `tv-96162.json`). Ajusta `tmdb`, `tipo`, `categoria` y `titulo`, y pon los sitios.

Una película lleva el slug del sitio:

```json
"animeav1": { "slug": "kimetsu-no-yaiba-mugen-ressha-hen" }
```

Una serie lleva el slug de cada temporada:

```json
"doramasflix": { "temporadas": { "1": "vincenzo" } }
```

## Numeración absoluta

Algunos sitios juntan todos los episodios seguidos en la temporada 1. Márcalo con `"numeracion": "absoluta"`:

```json
"tioanime": {
  "numeracion": "absoluta",
  "temporadas": { "1": "kimetsu-no-yaiba-tv" }
}
```

Si omites `numeracion`, se asume `"por-temporada"`.

## Desfase

En TMDB la temporada 2 empieza en el episodio 1, pero en el sitio la numeración sigue y empieza en el 27. El episodio del sitio es el episodio de TMDB más el desfase:

```json
"desfase": { "2": 26 }
```

### Una temporada que el sitio publica como varios animes

Pasa mucho en anime: la temporada 2 de TMDB de Kimetsu son dos animes en los sitios (Tren Infinito, 7 capítulos, y Distrito Rojo). En vez de un slug, una lista de tramos en orden; cada tramo dice cuántos capítulos de la temporada cubre y el último puede omitirlo:

```json
"2": [
  { "slug": "kimetsu-no-yaiba-mugen-ressha-hen", "episodios": 7 },
  { "slug": "kimetsu-no-yaiba-yuukaku-hen" }
]
```

El capítulo 8 de la temporada 2 de TMDB es el 1 del segundo tramo.

**Ojo con las películas del mismo arco:** en los sitios suele haber una versión TV y una película con casi el mismo slug (`kimetsu-no-yaiba-mugen-ressha-hen` es la TV; la película es `kimetsu-no-yaiba-movie-mugen-ressha-hen`). Valida siempre con `--red` y abre la página si dudas.

## embed69 y vimeus

Esos sitios no necesitan slug ni entrada: la app los busca directo por el id de TMDB en cualquier título. Para que una película o serie de esos sitios salga en el inicio y el catálogo, basta con crear su archivo; si quieres, puedes listarlos como recordatorio (no cambia nada):

```json
"embed69": {}
```

doramasflix no tiene página pública por slug (la app lo pide a su API), así que `--red` no lo comprueba.

## Validar

```bash
node scripts/indice/validar.mjs
node scripts/indice/validar.mjs --red
node --test test/validar.test.mjs
```

## Catálogo

`indice/catalogo.json` lo genera el workflow al hacer push a `main`. El repositorio necesita el secret `TMDB_API_KEY`. No lo edites a mano.
