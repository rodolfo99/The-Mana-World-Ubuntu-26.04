# Cliente jugable Angular para The Mana World (v0.2.6)

Esta aplicación es independiente de `admin-web/`. Conserva el servidor TMWA
y los datos del mundo de este repositorio; un servicio Node local convierte
paquetes del protocolo TMWA a eventos WebSocket para Angular. El navegador
renderiza los mapas TMX, tilesets TSX y sprites del submódulo `client-data`.
No usa la contraseña administrativa ni el proceso `tmwa-admin`.

## Inicio rápido en Ubuntu 26.04

Desde un clon con submódulos:

```bash
git clone --recursive https://github.com/rodolfo99/The-Mana-World-Ubuntu-26.04.git
cd The-Mana-World-Ubuntu-26.04
./scripts/preparar-fuentes.sh
./scripts/instalar.sh
```

Si descargaste el ZIP **completo** de esta versión, extrae el archivo y
entra en su carpeta. Ya contiene las fuentes, recursos y metadatos Git
necesarios para compilar; ejecuta los dos últimos comandos de arriba.
`instalar.sh` instala las bibliotecas del sistema con `sudo apt-get` y
compila el servidor y el cliente nativo. Aún se necesita conexión para
paquetes de Ubuntu y dependencias npm.

Arranca el juego en dos terminales, con tu usuario habitual:

```bash
./scripts/servidor.sh
./scripts/juego-web.sh
```

Abre **http://127.0.0.1:3020** en el mismo equipo. La primera ejecución
instala dependencias con `npm ci` y compila Angular. El servidor TMWA usa
6901 (acceso), 6122 (personajes) y 5122 (mapa). Cambia el puerto de la web
con `GAME_WEB_PORT=3021 ./scripts/juego-web.sh` si 3020 está ocupado.
Node.js compatible: 22.22.3+, 24.15+ o 26+.

## Actualizar a 0.2.6: gráficos originales de NPC

Esta versión incorpora la [PR #5](https://github.com/rodolfo99/The-Mana-World-Ubuntu-26.04/pull/5):
composición de NPC con las capas, tintes y variantes originales de `npcs.xml`.
Conserva el marcador cuando falta información o una función no está soportada.
Incluye las mejoras previas de inventario, movimiento y diálogos. Consulta
[las reglas verificadas y los límites](NPC-RENDERING.md).

Detén **el cliente web** con `Ctrl+C`. Desde **la carpeta de tu instalación
actual**, guarda antes cualquier cambio propio en `game-web`, `scripts`,
`localizacion` y `README.md`: los siguientes comandos sustituyen esas rutas.

```bash
git fetch --no-recurse-submodules origin main
git restore --source=origin/main -- game-web scripts localizacion README.md
./scripts/juego-web.sh
```

El arranque instala las dependencias del lockfile con `npm ci` y recompila
Angular al detectar los archivos actualizados. Recarga http://127.0.0.1:3020
con `Ctrl+Shift+R` y comprueba que el pie indique `WEB 0.2.6`. El reinicio de
la pasarela vuelve a leer `items.xml`, `npcs.xml` y sus inclusiones.

La actualización conserva las cuentas, personajes y configuraciones de
`sources/serverdata`; no cambia los commits fijados de los submódulos ni
requiere recompilar o reiniciar TMWA al venir de 0.2.4/0.2.5. Si vienes de una
versión con NPC todavía en inglés, sigue también [la recuperación del español](#recuperar-el-español-y-corregir-el-ratón-022)
y reinicia el servidor desde esa misma instalación.

Para generar el ZIP completo, sigue [el empaquetado de v0.2.6](../README.md#empaquetar-v026)
en un clon separado. El nombre por defecto y la carpeta interna son
`The-Mana-World-Ubuntu-26.04-angular-v0.2.6`; el archivo termina en `.zip`.
El ZIP automático de GitHub sigue sin incluir los submódulos.

## Actualizar a 0.2.5: nombres e iconos del inventario

La versión 0.2.5 incorporó la [PR #3](https://github.com/rodolfo99/The-Mana-World-Ubuntu-26.04/pull/3):
nombres e iconos originales del inventario, con ID visible y fallbacks cuando
faltan datos. Esta mejora se conserva en 0.2.6. Para actualizar desde una
instalación anterior, utiliza [los pasos actuales](#actualizar-a-026-gráficos-originales-de-npc).

## Actualizar a 0.2.4: velocidad del ratón

El cliente colocaba al personaje en el destino al recibir la aceptación de
caminar (`0x0087`), aunque TMWA apenas comenzaba el recorrido. Ahora conserva
el origen y el destino, reconstruye la ruta con las colisiones del mapa y
anima tanto al personaje como a la cámara. Usa el retraso por casilla que
envía TMWA (`0x00b0`, `SP::SPEED`): 150 ms por defecto y 1,4 veces ese valor
en diagonal. Los clics consecutivos y las flechas conservan el avance; las
correcciones de posición y los traslados cancelan la caminata anterior.

Detén **el cliente web** con `Ctrl+C`. Desde la carpeta de tu instalación
actual, ejecuta:

```bash
git fetch --no-recurse-submodules origin main
git restore --source=origin/main -- game-web scripts localizacion README.md
./scripts/juego-web.sh
```

Recarga http://127.0.0.1:3020 con `Ctrl+Shift+R` y comprueba que el pie indique
`WEB 0.2.6` al actualizar desde el `main` actual. No requiere recompilar TMWA.
Estos comandos conservan las cuentas y personajes de `sources/serverdata`;
guarda antes tus modificaciones propias
en las rutas que se actualizan. Si todavía usabas datos NPC en inglés de una
versión anterior, reinicia también `./scripts/servidor.sh` desde esa misma
carpeta para que lea los diálogos traducidos.

La primera puerta del tutorial sigue las condiciones del servidor: termina
las indicaciones de Sorfina o confirma que quieres omitir el tutorial. La
salida `(44,31)` de `029-2` lleva a otra habitación del **mismo mapa**, en
`(112,85)`; por eso el identificador del mapa permanece igual. Tras completar
la parte de Tanisha, la salida `(114,93)` lleva al exterior `029-1`, en
`(32,100)`.

## Actualizar a 0.2.3: movimiento y diálogos NPC

Detén el servidor y la web con `Ctrl+C` en sus terminales. Desde **la carpeta
de tu instalación actual**, ejecuta:

```bash
git fetch --no-recurse-submodules origin main
git restore --source=origin/main -- game-web scripts localizacion README.md
./scripts/preparar-traduccion.sh --npc
./scripts/servidor.sh
```

En otra terminal de **esa misma carpeta**:

```bash
./scripts/juego-web.sh
```

Abre http://127.0.0.1:3020 y recarga con `Ctrl+Shift+R`. El pie muestra
`WEB 0.2.6` al actualizar desde el `main` actual. El arranque web comprueba
también los parches NPC e indica la carpeta de datos. Es necesario reiniciar
TMWA: los diálogos se cargan en
memoria al arrancar. Si sigues ejecutando el servidor desde otra copia,
seguirá utilizando sus propios NPC y cuentas.

No hace falta recompilar TMWA. Estos comandos conservan las cuentas,
personajes y configuraciones de `sources/serverdata`, pero actualizan las
rutas indicadas: guarda antes cualquier cambio personal en ellas. Los
catálogos reconstruidos y los diálogos modificados que entren en conflicto
se conservan y se informa del problema.

Correcciones de esta versión:

- `0x00b6` pide mostrar **Cerrar**; ya no oculta la página. El clic envía
  `0x0146`, necesario para continuar los scripts `close2` y liberar al jugador.
- Cancelar un menú, también con `Esc`, envía `0x00b8` con la opción 255.
  Las peticiones de texto o número deben responderse; TMWA no permite
  cancelarlas con un cierre genérico.
- Se acumulan las líneas `mes` de cada página y se atienden las órdenes
  explícitas de limpiar o cerrar el diálogo (`0x0212`). Los textos largos
  tienen desplazamiento dentro del cuadro.
- Una parada de otro personaje (`0x0088`) ya no cambia la posición del jugador.
  Se solicitan también los nombres de los NPC.
- Flechas y ratón se prueban en el mapa original `029-2`. En la casilla
  inicial de la cama (`22,24`) hay obstáculos arriba y abajo: sal primero a
  la derecha o a la izquierda. Si una casilla está bloqueada, aparece un aviso.

El ZIP incluye los 424 scripts del parche español aplicado, además de los
avisos «Acércate para hablar» y «Acércate, por favor». La traducción del mundo
sigue siendo parcial: algunos nombres, reglas, avisos de bienvenida y textos
con formato especial conservan el inglés; véase [el alcance](../localizacion/README.md).

## Recuperar el español y corregir el ratón (0.2.2)

Los ZIP 0.2.0/0.2.1 incluían los fragmentos del parche de español, pero los
datos del servidor permanecían en inglés si no se ejecutaba la preparación.
El ZIP 0.2.2 se genera después de aplicar los 424 scripts NPC traducidos.
`instalar.sh`, `servidor.sh` y el arranque Docker también comprueban el parche.

Para actualizar la misma instalación, detén el servidor y el cliente web con
`Ctrl+C` en sus terminales. Desde la raíz del proyecto:

```bash
git fetch --no-recurse-submodules origin main
git restore --source=origin/main -- game-web scripts localizacion README.md
./scripts/preparar-traduccion.sh
./scripts/servidor.sh
```

En otra terminal de esa misma carpeta:

```bash
./scripts/juego-web.sh
```

Recarga el navegador con `Ctrl+Shift+R`. La actualización conserva las cuentas,
personajes y configuraciones en `sources/serverdata`; sustituye los archivos
del cliente y scripts indicados, por lo que debes guardar tus modificaciones
propias en esas rutas si las hubiera. No requiere recompilar TMWA. Si el
preparador detecta un catálogo o diálogo modificado que entra en conflicto,
se detiene y conserva ese archivo para revisión.

El mapa ahora observa los cambios de tamaño de su Canvas, incluido el ancho
que ocupa la barra lateral al entrar. Convierte las coordenadas del puntero
al espacio usado para dibujar y selecciona las zonas visibles de sprites,
marcadores y nombres. Un clic en suelo contiguo a un NPC ya no selecciona el
NPC por proximidad. Los cuadros informativos dejan pasar el clic; un diálogo
abierto bloquea las órdenes al mapa. Las opciones vacías de menús NPC quedan
ocultas sin cambiar el índice que espera el servidor.

El alcance de la traducción sigue siendo el [documentado para los NPC](../localizacion/README.md).
El contenido excluido del catálogo, las reglas y algunos nombres originales
pueden seguir en inglés.

## Actualizar una instalación 0.2.0 que queda en «Conectando…»

Detén el cliente web con `Ctrl+C`. Desde la raíz de la instalación, ejecuta:

```bash
git fetch --no-recurse-submodules origin main
git restore --source=origin/main -- game-web
./scripts/juego-web.sh
```

Estos comandos descargan y sustituyen los archivos de `game-web/`; si hiciste
cambios propios en ese directorio, guárdalos antes. El script recompila la web.
Recarga `http://127.0.0.1:3020` con `Ctrl+Shift+R`. El servidor TMWA puede
seguir encendido; no hace falta repetir la instalación de sus binarios.

El ZIP completo 0.2.0 incluía metadatos Git, por lo que también admite esos
comandos. Si obtuviste una copia sin Git, genera el ZIP completo 0.2.6
siguiendo [las instrucciones de empaquetado](../README.md#empaquetar-v026).

La causa corregida era la actualización de la interfaz: Angular 22 utiliza
por defecto detección de cambios sin Zone.js y estrategia OnPush. Los eventos
WebSocket y el resultado asíncrono de cargar el mapa ahora llaman a
`ChangeDetectorRef.markForCheck()`. Se retiró Zone.js del cliente de juego.
Referencia: [documentación oficial de Angular](https://angular.dev/guide/zoneless).

El formulario muestra el estado y el motivo de rechazo junto al botón. Por
ejemplo, si la cuenta no existe, selecciona **Crear cuenta**; si la contraseña
es incorrecta, vuelve a introducirla. También se informa cuando no hay servidor
de personajes o la cuenta ya está conectada. Las esperas de acceso, lista de
personajes, creación, selección y entrada al mapa tienen un límite de 15 segundos.

## Funciones de esta versión

| Función | Uso |
| --- | --- |
| Acceso y registro | Inicia sesión o crea cuenta usando la convención `_M`/`_F` de Mana. |
| Personajes | Elige uno existente o crea uno con los seis atributos iniciales en 5. |
| Mundo | Carga el mapa real del servidor y sus capas, muestra jugadores, NPC y criaturas. |
| Movimiento | WASD, flechas o clic; recorre las casillas a la velocidad indicada por TMWA. |
| Chat | Mensajes del mapa recibidos y enviados al servidor. |
| NPC | Hablar, continuar, elegir opción y responder texto o número. |
| Combate | Seleccionar monstruo, atacar y detener ataque; TMWA decide el resultado. |
| Inventario | Ver nombres e iconos originales, ID y cantidad; usar, equipar y quitar. |

Los NPC con definiciones compatibles en `npcs.xml` se dibujan con sus capas,
tintes, variantes y desplazamientos originales, incluido el equipamiento ya
declarado en esas capas. No se superponen los slots de equipo de jugador.
Si falta una definición, XML, PNG o paleta necesaria, o aparece una función
no soportada, se conserva el indicador completo. También se mantiene durante
la carga: nunca se muestra una composición parcial. Los píxeles visibles y
el nombre siguen permitiendo hablar con el NPC.
Consulta [la semántica de los paquetes, las reglas y el alcance](NPC-RENDERING.md).
Las imágenes base de jugador y la criatura Maggot se cargan desde los datos
originales. Algunas opciones avanzadas del cliente
nativo, como comercio, almacenamiento, misiones y efectos complejos, siguen
fuera de esta versión.

El renderizado de NPC forma parte de 0.2.6. Para incorporarlo a una
instalación existente, sigue [la actualización desde main](#actualizar-a-026-gráficos-originales-de-npc).
El reinicio de la pasarela recarga el catálogo sin recompilar TMWA.

## Nombres e iconos del inventario

Al iniciar la pasarela web se lee `sources/serverdata/client-data/items.xml`
y sus `<include name="…"/>`, con rutas relativas a `client-data`, como en el
cliente nativo. El catálogo se mantiene en memoria y se une por ID a **cada**
actualización del inventario. No altera los espacios, cantidades, equipamiento
ni las órdenes enviadas a TMWA. No requiere descargar ni copiar otros recursos.

- El nombre proviene exclusivamente del atributo `name`; se conserva el idioma
  original, sin traducciones ni nombres inventados. El ID sigue visible.
- `image` se resuelve bajo `graphics/items/`. Solo se sirven como iconos PNG
  existentes dentro de ese directorio, mediante `/assets/graphics/items/…`.
  El sufijo `|…` de Mana describe tintes: se usa el **archivo base original**;
  esta mejora todavía no aplica los tintes, por lo que variantes de color pueden
  compartir apariencia aunque tengan nombres distintos.
- Sin nombre se muestra `Objeto <ID>`. Sin icono, o si su descarga falla, aparece
  `✦`. Los fallbacks son independientes y los botones siguen funcionando.
  Un icono fallido no se vuelve a solicitar en cada actualización; recarga la
  página después de reparar el recurso.
- Un catálogo ausente o dañado no impide iniciar la pasarela. Se omiten los
  archivos inválidos y se conservan las ramas válidas. No se buscan sustitutos
  en Internet ni se usan nombres de archivo como nombres de objetos.

La lectura utiliza el parser XML estricto `saxes`, rechaza DTD y entidades
personalizadas, URLs, rutas absolutas, rutas codificadas y recorridos `..`.
Comprueba las rutas reales para impedir escapes mediante enlaces simbólicos.
Cada archivo se procesa una vez; los ciclos y repeticiones no se expanden.
Los límites son 16 niveles de inclusiones, 4,096 referencias XML, 256 KiB por
archivo, 16 MiB en total y 64 niveles de anidamiento XML. Solo se aceptan IDs
de inventario entre 1 y 65,535 y nombres de hasta 256 caracteres. Los nombres
se muestran como texto de Angular, nunca como HTML.

Después de actualizar estos archivos, detén y vuelve a iniciar
`./scripts/juego-web.sh` y recarga la página. El script instala la dependencia
añadida y recompila la interfaz cuando detecta cambios. También debes reiniciar
la pasarela si modificas `items.xml` o sus inclusiones: el catálogo es una
instantánea por proceso. No requiere recompilar ni reiniciar TMWA.

## Arquitectura y archivos

- `src/`: interfaz Angular y renderizador Canvas 2D. Carga `/assets/maps/*.tmx`,
  `/assets/tilesets/*.tsx` y las imágenes con el mismo origen.
- `src/app/movement.ts`: rutas entre casillas transitables y animación continua
  según la velocidad del servidor, con conservación del avance al cambiar destino.
- `backend/server.mjs`: servidor HTTP y WebSocket **solo en 127.0.0.1**; sirve
  una lista cerrada de tipos de archivo desde `client-data`. Rechaza orígenes
  y destinos TCP que no correspondan a esta instalación local.
- `backend/protocol.mjs`: lee la tabla oficial de longitudes del submódulo
  Mana fijado por el proyecto y arma/desarma los paquetes del protocolo.
- `backend/session.mjs`: conecta sucesivamente con login, personajes y mapa;
  valida las órdenes enviadas por el navegador.
- `backend/item-metadata.mjs`: carga el catálogo original de forma acotada,
  valida sus rutas y añade únicamente nombre e icono a los eventos de inventario.
- `tests/`: prueba de paquetes fragmentados y flujo completo frente a tres
  servidores TCP simulados, errores de autenticación y tiempos de espera;
  pruebas de la interfaz con Chromium, sin modificar cuentas reales.

Los puertos de TMWA son TCP propios del juego; su panel `admin-web/` utiliza
otro servicio y no sirve como pasarela de partidas. El servicio web nunca
acepta del navegador una IP o un puerto TCP de destino. Las credenciales de
jugador se envían por WebSocket **local** y se descartan al enviar el paquete
de acceso. Usa el cliente solo en este equipo; no publiques ni redirijas el
puerto 3020.

## Desarrollo y pruebas

```bash
# Desde la raíz, para las tablas del protocolo y los recursos de integración
git submodule update --init sources/mana sources/serverdata
git -C sources/serverdata submodule update --init client-data
cd game-web
npm ci
npm test
npm run build
node backend/server.mjs
```

Para verificar también la interfaz en un navegador:

```bash
npx playwright install chromium --only-shell
npm run test:ui
```

`test:ui` compila Angular y comprueba respuestas WebSocket demoradas, rechazo
de acceso y desconexión. Usa respuestas simuladas y carga el mapa original
`029-2` desde los recursos locales; comprueba que la vista cambie sin otro clic.
El navegador puede indicarse con `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` y el
puerto de pruebas con `GAME_WEB_TEST_PORT` (31320 por defecto).
La suite de NPC usa `NPC_WEB_TEST_PORT` (31321 por defecto). `test:ui` ejecuta
ambas suites; sus servidores solo escuchan en `127.0.0.1`.

Las pruebas de NPC comprueban las dos familias de los cinco paquetes,
campos de apariencia, HP, direcciones, mensajes fragmentados y clasificación
de NPC/portal/jugador. En Chromium cargan las seis capas de Sorfina y una
variante de atlas originales; verifican tintes exactos, herencia de imágenes,
offsets XML, clics sobre píxeles/nombres, transparencias, archivos faltantes,
cambios de aspecto y descargas tardías tras retirar un NPC o cambiar de mapa.
El [informe de renderizado](NPC-RENDERING.md#validación) registra el alcance.

Las pruebas de inventario (`tests/item-metadata.test.mjs`) cubren inclusiones
recursivas, nombres e imágenes del catálogo original, escapes XML, campos
ausentes, IDs desconocidos, archivos dañados, ciclos, DTD, rutas maliciosas,
enlaces simbólicos y límites de lectura. También verifican altas, bajas,
cantidades, equipamiento y comandos por espacio. Las pruebas de navegador
comprueban los iconos reales, el fallback de descarga, la presentación segura
de nombres y la actualización de los botones sin clics adicionales.

Validación de v0.2.6 (2026-09-28): `npm test` pasó las 35 pruebas y
`npm run test:ui` pasó las 23 pruebas, con compilación de producción. Las
cuatro pruebas del preparador de español también pasaron. Se verificó con
datos temporales el nombre y la carpeta de empaquetado v0.2.6, las exclusiones
y el rechazo de salidas dentro del repositorio. No se generó un ZIP completo
en esta validación. Los submódulos mantienen sus commits fijados.

Validación previa de v0.2.5 (2026-09-28): `npm test` pasó las 24 pruebas y
`npm run build` generó la compilación de producción. `npm run test:ui` pasó
las 15 pruebas, incluidas las tres de inventario añadidas en la PR #3.
Se ejecutaron en Ubuntu 24.04 con Node.js 24.19.0 y Chromium 153 mediante
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Las cuatro pruebas del preparador de
español también pasaron. Se verificó el empaquetador con datos temporales:
nombre y carpeta v0.2.5, exclusiones de datos locales y rechazo de una salida
dentro del repositorio. Esta comprobación no genera el paquete completo de
distribución ni modifica los submódulos de la instalación.

Validación previa de 0.2.4: quince pruebas de protocolo, pasarela y movimiento, doce
de navegador y cuatro del preparador de español. Se comprueban la velocidad
por casilla, las diagonales y colisiones, los clics consecutivos y las flechas,
el traslado entre habitaciones de `029-2` y a `029-1`, el ACK de `close2`, la
cancelación de menús, la salida de la cama y que escribir en el chat no mueva
al personaje.
Las pruebas de español verifican repetición,
metadatos Git de submódulos y conservación de cuentas y cambios personales:

```bash
# Desde la raíz del proyecto
python3 -m unittest discover -s scripts/tests -v
```

**Partida real:** el usuario confirmó el 29 de septiembre de 2026 una partida
real completa en Ubuntu 26.04. Esta confirmación es independiente de las
suites automatizadas documentadas arriba.

Se compiló TMWA previamente para contrastar el protocolo, pero no se pudo
ejecutar en aquel entorno de pruebas: solo ofrecía `root` y TMWA exige un
usuario normal. Las pruebas TCP utilizan servidores simulados, y las de navegador
utilizan los recursos originales con respuestas WebSocket simuladas.

El backend requiere que estén inicializados los submódulos `sources/mana` y
`sources/serverdata/client-data`. Para desarrollo del repositorio ejecuta
`git submodule update --init --recursive`. Una sesión real con Ubuntu 26.04
requiere que los tres procesos de TMWA estén activos. Si un mapa no aparece,
confirma que el nombre recibido exista en `client-data/maps/`.

## Procedencia

El código TMWA, Mana y los recursos conservan sus licencias y atribuciones
originales. Para redistribuir gráficos y música, consulta
`sources/serverdata/client-data/license.md` y los archivos `COPYING` de los
submódulos. La tabla del protocolo se lee de la copia fijada de Mana para
mantener compatible el puente con este proyecto.
