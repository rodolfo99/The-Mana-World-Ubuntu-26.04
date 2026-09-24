# Cliente jugable Angular para The Mana World (v0.2.0)

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
  servidores TCP simulados, sin modificar cuentas reales.

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
