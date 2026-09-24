# The Mana World para Ubuntu 26.04

Cliente **Mana**, servidor **TMWA** y datos del mundo para una partida local en
Ubuntu 26.04 x86_64. El cliente se conecta a `127.0.0.1` y la administración
se limita a esa dirección con una clave generada durante la instalación.
Incluye una primera traducción automática al español de los diálogos de NPC.

> **Estado:** las fuentes y los scripts se han preparado y comprobado, pero
> todavía falta probar la compilación completa y una sesión de juego en
> Ubuntu 26.04. La traducción de NPC necesita revisión de estilo y contexto.

## Obtener el proyecto

Necesitas Git, conexión a Internet y Ubuntu 26.04 x86_64 para ejecutar el
instalador. Clona los tres proyectos originales y sus submódulos:

```bash
git clone --recursive https://github.com/rodolfo99/The-Mana-World-Ubuntu-26.04.git
cd The-Mana-World-Ubuntu-26.04
./scripts/preparar-fuentes.sh
./scripts/instalar.sh
```

Ejecuta estos scripts con tu usuario habitual, **sin `sudo` delante**. Solo la
instalación de paquetes dentro de `instalar.sh` utiliza `sudo apt-get`.
El script `preparar-fuentes.sh` verifica y reconstruye el catálogo y el parche
español, y aplica las correcciones al cliente y a los diálogos. Se puede
volver a ejecutar: si un parche ya está aplicado, lo detecta. Si modificaste
los mismos archivos, Git detendrá el parche para que revises el conflicto.

**Si descargas «Download ZIP» desde GitHub:** ese ZIP contiene los scripts,
la documentación y los parches comprimidos, pero GitHub no incluye las fuentes
de los submódulos dentro de su ZIP. Descomprímelo, entra en la carpeta
`The-Mana-World-Ubuntu-26.04-main` y ejecuta
`./scripts/preparar-fuentes.sh` antes de instalar. El script descargará las
versiones fijadas del servidor, los datos y el cliente. Git e Internet siguen
siendo necesarios. El botón «Download ZIP» no equivale al antiguo paquete
completo de esta conversación.

La instalación compila el servidor y el cliente, genera los mapas y crea la
configuración local. No requiere PostgreSQL ni Docker. Deja los ejecutables en
`instalado/bin`, dentro **de esta copia** del proyecto.

## Iniciar el juego

En una terminal:

```bash
./scripts/servidor.sh
```

Cuando login (`6901`), personajes (`6122`) y mapa (`5122`) estén listos, abre
otra terminal en la misma carpeta:

```bash
./scripts/cliente.sh
```

El cliente apunta a `127.0.0.1:6901` y utiliza los gráficos y mapas locales.
Registra una cuenta desde Mana y crea un personaje. Detén el servidor con
`Ctrl+C` en su terminal. Esta configuración es para un solo equipo; para
jugar desde otro dispositivo también hay que configurar las direcciones
anunciadas por el servidor.

### Si falta el ejecutable `mana`

Cada copia tiene su propio `instalado/bin/mana`. Comprueba si la compilación
quedó en otra carpeta:

```bash
find "$HOME/Descargas" -type f -path '*/instalado/bin/mana' -executable -print
```

Si aparece una ruta, puedes utilizar ese cliente desde la copia actual:

```bash
MANA_BIN='/ruta/que/imprimio/find' ./scripts/cliente.sh
```

Si no aparece, compila solo el cliente después de instalar sus dependencias:

```bash
./scripts/instalar-cliente.sh
./scripts/cliente.sh
```

Este último script no instala paquetes ni recompila el servidor. Si la
compilación se detiene por una dependencia ausente, ejecuta `instalar.sh` y
revisa el primer error. `preparar-fuentes.sh` ya aplica la corrección de
CMake que permite generar traducciones en rutas con paréntesis, como una
carpeta terminada en `(2)`.

## Administración local

Con el servidor en marcha, abre una tercera terminal:

```bash
./scripts/admin.sh
```

`tmwa-admin` lee la clave de `sources/serverdata/login/conf/ladmin_local.conf`.
La instalación la genera de forma aleatoria, la sincroniza con
`login_local.conf`, limita el acceso a `127.0.0.1` y da permisos `600` a los
archivos que contienen la clave. No hay usuario ni contraseña de jugador
predefinidos: registra tu cuenta desde el cliente. Dentro de la consola
administrativa puedes consultar `help`, `list` y `help add`. Los niveles GM
se guardan en `sources/serverdata/login/save/gm_account.txt` y pueden requerir
volver a iniciar sesión para reflejarse.

### Panel gráfico en Angular

Con el servidor instalado y encendido, abre otra terminal y ejecuta:

```bash
./scripts/admin-web.sh
```

Abre **http://127.0.0.1:3010** en el navegador. El primer inicio ejecuta
`npm ci` y compila Angular; requiere Internet, npm y Node.js compatible
(22.22.3+, 24.15+ o 26+). Luego basta ejecutar el mismo script. Para detener
el panel, pulsa `Ctrl+C`; para cambiar el puerto, usa
`ADMIN_WEB_PORT=3011 ./scripts/admin-web.sh`. No necesita Docker ni una
contraseña adicional: el servicio local usa `tmwa-admin` y su configuración
privada. Solo escucha en `127.0.0.1` y no está diseñado para publicarse en
una red ni detrás de un proxy.

El panel permite listar cuentas por rango, consultar niveles GM y jugadores
en línea, buscar ID y datos de una cuenta, asignar nivel GM, bloquear o
desbloquear cuentas y enviar avisos globales. Confirma las acciones que
modifican datos. Los avisos aceptan únicamente caracteres ASCII porque
`tmwa-admin` rechaza comandos con caracteres de control o no ASCII. Para
crear cuentas, cambiar contraseñas y otras operaciones usa `./scripts/admin.sh`
o el registro del cliente. Consulta [la guía del panel](admin-web/README.md).

## Español

El cliente incorpora el catálogo `sources/mana/po/es.po`. En Mana selecciona
**Setup → Interface → Language → Español** y reinicia el cliente. También
puedes probar `LANGUAGE=es ./scripts/cliente.sh` si no has elegido otro idioma
en los ajustes.

Después de `preparar-fuentes.sh`, los diálogos traducidos están en
`sources/serverdata/world/map/npc/`. Se modificaron 424 archivos y 11 976
apariciones de textos. El catálogo editable queda en
`localizacion/npc_es.json`; `localizacion/npc-es.patch` permite aplicar esa
misma traducción a las fuentes originales. Es una primera pasada automática:
quedan frases especiales en inglés y conviene revisar pistas, nombres y
contexto de misiones. Consulta [la documentación de localización](localizacion/README.md).

## Docker Compose (opcional, solo servidor)

Tras `preparar-fuentes.sh`, puedes utilizar el `docker-compose.yml` incluido
por el proyecto original de datos del servidor. Requiere Docker y el plugin
`docker compose`; el cliente gráfico se ejecuta en Ubuntu:

```bash
make -C sources/serverdata maps conf news
python3 scripts/configurar-local.py sources/serverdata
./scripts/docker-servidor.sh up
./scripts/docker-servidor.sh logs
```

Para el cliente necesitas compilar Mana con `instalar-cliente.sh` (y disponer
de sus dependencias) o indicar `MANA_BIN` a un cliente compatible. Para detener
el servidor de Compose, usa `./scripts/docker-servidor.sh down`. No ejecutes
simultáneamente el servidor nativo y el contenedor: ambos usan los puertos
`6901`, `6122` y `5122`. La imagen del Compose original emplea `:latest` y
puede cambiar con el tiempo.

## Datos y mantenimiento

| Ruta | Contenido |
| --- | --- |
| `sources/tmwa` | Servidor original, con su historial y etiquetas Git |
| `sources/serverdata` | Cuentas, personajes, mapas y scripts NPC |
| `sources/mana` | Cliente Mana y Guichan |
| `scripts/` | Preparación, instalación, arranque y diagnóstico |
| `admin-web/` | Interfaz Angular y servicio de administración local |
| `localizacion/` | Parches y catálogo español reconstruidos al preparar |
| `instalado/` | Binarios locales tras compilar |
| `respaldos/` | Copias de cuentas y personajes |

Detén el servidor antes de respaldar:

```bash
./scripts/respaldo.sh
```

Para restaurar, detén el servidor y extrae la copia conservando las rutas
dentro de `sources/serverdata/`. Las cuentas y contraseñas generadas por tu
instalación no forman parte de este repositorio. Si cambias scripts NPC,
reinicia el proceso del mapa; si modificas mapas `.tmx`, vuelve a generar las
colisiones con `make -C sources/serverdata maps`.

## Diagnóstico y alcance de las pruebas

```bash
./scripts/diagnostico.sh
```

- Si falla la descarga de fuentes, repite `./scripts/preparar-fuentes.sh` y
  conserva el primer error de Git.
- Si `apt-get` falla, resuelve la dependencia indicada antes de compilar.
- Si el cliente abre pero no entra al mundo, comprueba que los tres procesos
  del servidor estén activos y que los puertos `6901`, `6122` y `5122` estén
  libres. `ss -ltn` permite revisarlos.
- Si falta memoria al compilar, prueba `JOBS=2 ./scripts/instalar.sh`.
- Si cambias de copia del proyecto, recuerda que `instalado/` pertenece a la
  copia en que compilaste.

Durante la preparación se comprobó la compilación de TMWA, la generación de
mapas y configuraciones, la sintaxis de los scripts, la reconstrucción de los
parches y un clon público del repositorio. Las pruebas locales se realizaron
en un entorno Ubuntu 24.04; el cliente gráfico, Docker y la sesión completa
en Ubuntu 26.04 siguen pendientes de verificación en un equipo con ese sistema.

## Procedencia y licencias

Las fuentes se fijan mediante submódulos Git:

| Proyecto | Origen | Commit |
| --- | --- | --- |
| TMWA | [themanaworld/tmwa](https://github.com/themanaworld/tmwa) | `fe83504049c2` |
| Datos del servidor | [themanaworld/tmwa-server-data](https://github.com/themanaworld/tmwa-server-data) | `394c167597b4` |
| Mana | [mana/mana](https://github.com/mana/mana) | `6c1e41d28f22` |

Cada proyecto y recurso conserva sus propias licencias y autorías. Este
repositorio es una adaptación comunitaria; no es una distribución oficial de
The Mana World. Consulta los archivos `COPYING` y licencias de los submódulos
antes de redistribuir modificaciones.
