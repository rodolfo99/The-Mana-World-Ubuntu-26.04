# Cliente jugable Angular para The Mana World (v0.2.3)

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

## Actualizar a 0.2.3: movimiento y diálogos NPC

Detén el servidor y la web con `Ctrl+C` en sus terminales. Desde **la carpeta
de tu instalación actual**, ejecuta:

```bash
git fetch origin main
git restore --source=origin/main -- game-web scripts localizacion README.md
./scripts/preparar-traduccion.sh --npc
./scripts/servidor.sh
```

En otra terminal de **esa misma carpeta**:

```bash
./scripts/juego-web.sh
```

Abre http://127.0.0.1:3020 y recarga con `Ctrl+Shift+R`. El pie muestra
`WEB 0.2.3`. El arranque web comprueba también los parches NPC e indica la
carpeta de datos. Es necesario reiniciar TMWA: los diálogos se cargan en
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
git fetch origin main
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
git fetch origin main
git restore --source=origin/main -- game-web
./scripts/juego-web.sh
```

Estos comandos descargan y sustituyen los archivos de `game-web/`; si hiciste
cambios propios en ese directorio, guárdalos antes. El script recompila la web.
Recarga `http://127.0.0.1:3020` con `Ctrl+Shift+R`. El servidor TMWA puede
seguir encendido; no hace falta repetir la instalación de sus binarios.

El ZIP completo 0.2.0 incluía metadatos Git, por lo que también admite esos
comandos. Si obtuviste una copia sin Git, utiliza el ZIP completo 0.2.3.

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
| Movimiento | WASD, flechas o clic; las coordenadas se envían a TMWA. |
| Chat | Mensajes del mapa recibidos y enviados al servidor. |
| NPC | Hablar, continuar, elegir opción y responder texto o número. |
| Combate | Seleccionar monstruo, atacar y detener ataque; TMWA decide el resultado. |
| Inventario | Ver objetos por ID y cantidad, usar, equipar y quitar. |

Un NPC puede combinar varios sprites con tintes y equipamiento; esta versión
lo marca en el mapa con un indicador hasta implementar esa composición.
Los objetos se muestran por ID porque aún no se ha incorporado su nombre e
icono de `items.xml`. Las imágenes base de jugador y la criatura Maggot se
cargan desde los datos originales. Algunas opciones avanzadas del cliente
nativo, como comercio, almacenamiento, misiones y efectos complejos, siguen
fuera de esta versión.

## Arquitectura y archivos

- `src/`: interfaz Angular y renderizador Canvas 2D. Carga `/assets/maps/*.tmx`,
  `/assets/tilesets/*.tsx` y las imágenes con el mismo origen.
- `backend/server.mjs`: servidor HTTP y WebSocket **solo en 127.0.0.1**; sirve
  una lista cerrada de tipos de archivo desde `client-data`. Rechaza orígenes
  y destinos TCP que no correspondan a esta instalación local.
- `backend/protocol.mjs`: lee la tabla oficial de longitudes del submódulo
  Mana fijado por el proyecto y arma/desarma los paquetes del protocolo.
- `backend/session.mjs`: conecta sucesivamente con login, personajes y mapa;
  valida las órdenes enviadas por el navegador.
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

Validación de 0.2.3: nueve pruebas del protocolo/pasarela, diez de navegador
y cuatro del preparador de español. Se comprueban el ACK de `close2`, la
cancelación de menús, el movimiento después de cerrar, la salida de la cama
con flechas y ratón, y que escribir en el chat no mueva al personaje.
Las pruebas de español verifican repetición,
metadatos Git de submódulos y conservación de cuentas y cambios personales:

```bash
# Desde la raíz del proyecto
python3 -m unittest discover -s scripts/tests -v
```

Estas comprobaciones no sustituyen una partida real con los tres procesos
TMWA en Ubuntu 26.04. Se compiló TMWA para contrastar el protocolo, pero no
se pudo ejecutar aquí: el entorno solo ofrece `root` y TMWA exige un usuario
normal. Las pruebas TCP utilizan servidores simulados, y las de navegador
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
