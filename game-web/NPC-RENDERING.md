# Renderizado de NPC con los recursos originales

Esta mejora compone la animación **stand** de los NPC que se pueden resolver
por completo desde los datos fijados. Forma parte de la versión 0.2.6 y
conserva los commits de los submódulos. No incorpora gráficos, nombres, capas
ni tintes inventados.

## Fuentes de las reglas

- Mana: `6c1e41d28f2274a4aede383f2e331b2130ef34b9`.
- Datos del servidor: `394c167597b4b76ced2f4b5333a5e5f77959258d`.
- `client-data`: `b3b082bfe15a3ce581e8855349465937e1fd1fc8`.

| Regla | Fuente fijada |
| --- | --- |
| Campos, clasificación y uso del equipo | [`beinghandler.cpp`](../sources/mana/src/net/tmwa/beinghandler.cpp): `process`, `typeFromJob`; [`being.cpp`](../sources/mana/src/being.cpp): `setType`, `updatePlayerSprites` |
| Longitudes y coordenadas | [`network.cpp`](../sources/mana/src/net/tmwa/network.cpp), [`messagein.cpp`](../sources/mana/src/net/tmwa/messagein.cpp), [`protocol.h`](../sources/mana/src/net/tmwa/protocol.h) |
| Catálogo y orden de capas | [`npcdb.cpp`](../sources/mana/src/resources/npcdb.cpp), [`settingsmanager.cpp`](../sources/mana/src/resources/settingsmanager.cpp), [`actorsprite.cpp`](../sources/mana/src/actorsprite.cpp): `setupSpriteDisplay` |
| Variantes, inclusiones, imágenes, frames y direcciones | [`spritedef.cpp`](../sources/mana/src/resources/spritedef.cpp), [`spritedef.h`](../sources/mana/src/resources/spritedef.h), [`sprite.cpp`](../sources/mana/src/sprite.cpp) |
| Tintes | [`dye.cpp`](../sources/mana/src/resources/dye.cpp): `instantiate`, `update`, `getColor(int, ...)` |
| Anclaje y composición | [`compoundsprite.cpp`](../sources/mana/src/compoundsprite.cpp), [`actorsprite.cpp`](../sources/mana/src/actorsprite.cpp), [`configuration.h`](../sources/mana/src/configuration.h): `spriteOffsetY = 16` |
| Capas y colores concretos | [`npcs.xml`](../sources/serverdata/client-data/npcs.xml), [`npc154.xml`](../sources/serverdata/client-data/npcs/npc154.xml), sus inclusiones y PNG |

## Las dos familias de paquetes

Los offsets siguientes cuentan desde el opcode de dos bytes. Los campos de
equipo son enteros de 16 bits little-endian; sexo es un byte y HP es de 32 bits.
El lector recorre los campos en el orden del cliente nativo y exige la longitud
correcta antes de publicar el evento.

| Campo | `0x0078` | `0x007b` | `0x01d8` / `0x01d9` | `0x01da` |
| --- | --- | --- | --- | --- |
| Longitud | 54 | 60 | 54 / 53 | 60 |
| `job` | 14 | 14 | 14 | 14 |
| Pelo / arma | 16 / 18 | 16 / 18 | 16 / 18 | 16 / 18 |
| `headBottom` / escudo | 20 / 22 | 20 / 26 | 22 / 20 | 22 / 20 |
| `headTop` / `headMid` | 24 / 26 | 28 / 30 | 24 / 26 | 28 / 30 |
| Color de pelo | 28 | 32 | 28 | 32 |
| Campo en posición de color de ropa | 30: **zapatos** | 34: **zapatos** | 30: color de ropa, sin aplicar | 34: color de ropa, sin aplicar |
| HP / HP máximo | 32 / 36 | 36 / 40 | No existen aquí | No existen aquí |
| Sexo | 45 | 49 | 45 | 49 |
| Coordenadas | 46: posición + dirección | 50: origen/destino | 46: posición + dirección | 50: origen/destino |

`0x007b` inserta el tick tras `headBottom`; `0x01da` lo inserta después de
`headBottom` y del escudo. La segunda familia contiene información de gremio,
emblema y otros campos donde la primera lleva HP; esos bytes **no son HP**.
Tampoco se inventa un slot de zapatos para `0x01d8/9/a`.

El evento conserva `appearance` con pelo, color, arma, escudo, `headBottom`,
`headMid`, `headTop`, sexo, opciones de estado y, según la familia, `shoes` o
`clothesColor`. En Mana, pelo se convierte a un ID de sprite negativo; los
otros slots corresponden a pantalón, camisa, sombrero, zapatos, arma y escudo
del **jugador**, con las reglas de `items.xml`. **No son las capas de los NPC**:
`Being::updatePlayerSprites` retorna inmediatamente cuando no es un jugador.

Los NPC son los jobs 46–1000; los monstruos, 1001–2000. El job 45 es un portal
y no crea un actor visible. Se preserva también la clasificación nativa de
jugadores (hasta 25 y 4001–4049), evitando tratarlos como NPC o monstruos.
Las direcciones de posición se traducen desde S, SW, W, NW, N, NE, E y SE.
Los paquetes de movimiento solo aportan origen/destino: la orientación se
deduce de ese desplazamiento, y el actor se coloca en el destino como antes.
Esta mejora no implementa interpolación de movimiento remoto.

## Composición implementada

La pasarela lee `npcs.xml` y sus inclusiones locales `<include name="…"/>` al
arrancar. Por cada aparición publica las referencias de sprites del `job`
en su orden original. Una definición posterior del mismo ID reemplaza la
anterior, incluso si está vacía. Sorfina corresponde al job 154 en
`world/map/npc/029-2/sorfina.txt`: usa seis capas, no una lista de equipo inferida.

El navegador resuelve los XML y PNG bajo `graphics/sprites/` y aplica:

- Orden de `<sprite>` de `npcs.xml`, incluyendo ropa y pelo ya definidos allí.
- `variants` y `variant_offset` para frames declarados en ese XML. Las
  inclusiones `<include file="…"/>` son relativas a `graphics/sprites/` y
  reinician variante y paletas. El primer `imageset` con un nombre prevalece,
  permitiendo que las animaciones incluidas usen la imagen del XML exterior.
- Frames y secuencias ascendentes de `stand`, con su duración (75 ms por
  defecto). Un delay cero detiene la animación en ese frame, como en Mana.
- Direcciones específicas; una diagonal cae a su componente vertical y una
  dirección ausente a la primera del enum nativo, incluyendo `default`.
- Anclaje al centro de la casilla con el desplazamiento vertical original
  de 16 píxeles. Cada imagen se centra por su propia anchura y se alinea por
  abajo; se suman los offsets del `imageset` y del frame.
- Paletas incrustadas de canales R/G/Y/B/M/C/W, sustitución de placeholders,
  interpolación entera desde negro y recoloración solo de canales puros,
  conservando alpha. Una plantilla de canales sin paletas mantiene el PNG
  sin teñir, como el `adult-head` de Sorfina en Mana. No se inventa una paleta.

El NPC 200 prueba el caso de atlas: `npcs.xml` declara explícitamente
`npcs/2006__npcs.xml`, variante 5, con frames de 50×80. No se elige una
posición del atlas por heurística.

Las capas se dibujan solo cuando **todas** están listas. Los clics usan los
píxeles con alpha de cada capa y la etiqueta; una zona transparente permite
seleccionar el suelo. Un cambio de job reemplaza la composición; las cargas
tardías no recrean actores retirados ni actores de un mapa anterior.

## Fallback y límites

Se conserva el marcador existente ante catálogo desconocido o vacío,
definiciones con `particlefx`, XML/PNG ausentes o inválidos, referencias
inseguras, tintes incompatibles, paletas necesarias incompletas, frames fuera
del atlas o instrucciones no soportadas en `stand` (`end`, `jump`, `goto`,
`label`, etc.). También se usa para NPC sentados/muertos o con opciones de
estado activas. No se presenta un cuerpo incompleto ni se sustituye una
imagen ausente por otra aproximada.

No se implementan efectos de partículas, acciones especiales, cambios de
apariencia mediante otros opcodes, composición de equipo de jugadores ni
reglas de sustitución de capas de `items.xml`. Las animaciones distintas de
`stand` se dejan fuera de este cambio.

Las lecturas rechazan DTD, URLs, traversal y enlaces simbólicos que salgan de
los recursos servidos. Hay límites de archivos, profundidad, frames y memoria
decodificada. Las promesas, imágenes y fallos se comparten dentro del mapa:
un PNG fallido no se solicita en cada frame. Entrar a otro mapa renueva la
caché, y recargar permite reintentar después de reparar los recursos.

## Validación

Entorno: Ubuntu 24.04.3, Node.js 24.19.0, Chromium 153.0.8010.0.

```bash
cd game-web
npm test
npm run build
# Instalar Chromium de Playwright una vez, o indicar un ejecutable compatible:
npx playwright install chromium --only-shell
npm run test:ui
```

- `npm test`: 35 pruebas de protocolo, sesión, movimiento y catálogos; incluye
  cinco layouts con valores distintos por slot, paquetes truncados y
  fragmentados, clasificación, fallback de estados, orden y tintes.
- `npm run test:ui`: 23 pruebas; 8 específicas de NPC y las 15 regresiones
  previas. Prueba XML/PNG originales, colores exactos, variantes, offsets,
  archivos fallidos, clics y cargas tardías en la aplicación compilada.
- Build de producción de Angular y revisión visual de Sorfina en Chromium.

Las pruebas usan paquetes/respuestas simulados y recursos originales. **Aún
no se ha validado una partida real completa en Ubuntu 26.04** con los tres
procesos TMWA. Estos resultados no afirman equivalencia visual completa con
todas las funciones del cliente nativo.
