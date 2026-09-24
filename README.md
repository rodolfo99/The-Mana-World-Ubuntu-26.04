# The Mana World: cliente y servidor local para Ubuntu 26.04

Proyecto de desarrollo con el cliente **Mana** y el servidor **TMWA** con su
mundo, mapas, gráficos y scripts oficiales. Se compilan en tu propio Ubuntu
26.04 x86_64. La compilación requiere conexión a los repositorios de Ubuntu
para instalar dependencias. El juego queda configurado para **una sola
computadora**. La administración local está activada y limitada a
`127.0.0.1`, con contraseña aleatoria generada al instalar.

## Inicio rápido

```bash
git clone --recursive https://github.com/rodolfo99/The-Mana-World-Ubuntu-26.04.git
cd The-Mana-World-Ubuntu-26.04
./scripts/preparar-fuentes.sh
./scripts/instalar.sh
```

El repositorio fija las versiones originales del servidor TMWA, los datos del
mundo y el cliente Mana como submódulos Git. `preparar-fuentes.sh` reconstruye
el catálogo español y aplica las correcciones incluidas en este repositorio.
También admite la opción «Download ZIP» de GitHub: descomprime ese ZIP y
**ejecuta `./scripts/preparar-fuentes.sh`** antes de instalar. Esa descarga
no incluye por sí sola el contenido de los submódulos; el script lo obtiene
de los repositorios oficiales. Requiere Git y conexión a Internet.

Ejecuta el script como usuario normal, sin anteponer `sudo`. El instalador
comprueba Ubuntu 26.04 x86_64, instala dependencias con `sudo apt-get`,
compila TMWA y Mana, genera mapas, prepara archivos locales y configura la
administración. No necesitas PostgreSQL ni Docker.

En una terminal, inicia los tres procesos del servidor:

```bash
./scripts/servidor.sh
```

Espera a ver que login (6901), personajes (6122) y mapa (5122) estén listos.
En otra terminal, inicia el cliente:

```bash
./scripts/cliente.sh
```

Si el cliente indica que falta `instalado/bin/mana`, busca primero una
compilación en otra copia extraída del proyecto (por ejemplo una carpeta
con `(2)` en su nombre):

```bash
find "$HOME/Descargas" -type f -path '*/instalado/bin/mana' -executable -print
```

Si aparece en otra carpeta, desde esta copia puedes ejecutarla con
`MANA_BIN='/ruta/encontrada/instalado/bin/mana' ./scripts/cliente.sh`.
El cliente tomará los datos del juego de la copia actual. Si no aparece,
la instalación pudo detenerse antes de compilar Mana. Con las dependencias
ya instaladas, compila únicamente el cliente:

```bash
./scripts/instalar-cliente.sh
./scripts/cliente.sh
```

El script `instalar-cliente.sh` no reinstala el servidor ni las dependencias.
Si CMake indica una dependencia ausente, ejecuta de nuevo el instalador
completo y conserva el mensaje de error para diagnosticarla.

Si tu carpeta tiene paréntesis, como `The-Mana-World-Ubuntu-26.04(2)`, y
la generación de `locale/es/LC_MESSAGES/mana.mo` falla con
`/bin/sh: Syntax error: "(" unexpected`, usa la versión corregida de
`sources/mana/po/CMakeLists.txt` incluida en este paquete y vuelve a ejecutar
`./scripts/instalar-cliente.sh`. Este script configura CMake de nuevo y
reanuda la compilación. Los avisos sobre Allegro o SDL clásico en la
configuración de Guichan indican extensiones opcionales desactivadas;
el error de las traducciones se debía a la ruta con paréntesis.

En Mana elige registro para crear una cuenta y luego un personaje. El
servidor es `127.0.0.1:6901`; el script ya lo indica al cliente. Cierra el
servidor con `Ctrl+C` en su terminal. Para otro equipo de tu red hace falta
configurar las IP anunciadas en `login/conf/lan_support.conf` y
`world/conf/lan_support.conf`; la configuración incluida es local.

## Administración local

Con el servidor en marcha, abre una tercera terminal:

```bash
./scripts/admin.sh
```

La consola `tmwa-admin` lee la contraseña automáticamente desde
`sources/serverdata/login/conf/ladmin_local.conf`. La misma clave se
sincroniza con `login_local.conf`; ambos archivos reciben permiso `600`.
El servidor permite administrar desde `127.0.0.1` únicamente. La
contraseña no se imprime ni viene fijada en el ZIP.

Dentro de la consola administrativa:

```text
help
list
help add
```

La ayuda del propio programa muestra las demás órdenes y sus argumentos.
La administración gestiona cuentas; la asignación de nivel GM se guarda en
`sources/serverdata/login/save/gm_account.txt` y normalmente requiere
reiniciar sesión para reflejarse.

## Docker Compose (opcional, solo servidor)

Los autores ya incluyen un `docker-compose.yml` en
`sources/serverdata/`. Usa la imagen `ghcr.io/themanaworld/tmwa:latest`
y `network_mode: host`; el cliente gráfico Mana se ejecuta en Ubuntu.
Si quieres usar esta vía, prepara los datos sin compilar:

```bash
make -C sources/serverdata maps conf news
python3 scripts/configurar-local.py sources/serverdata
./scripts/docker-servidor.sh up
./scripts/docker-servidor.sh logs
./scripts/cliente.sh
```

El último comando necesita que antes hayas compilado Mana con
`./scripts/instalar.sh` o `./scripts/instalar-cliente.sh`, o que indiques
mediante `MANA_BIN` un cliente Mana compatible. Para detener y consultar:

```bash
./scripts/docker-servidor.sh down
./scripts/docker-servidor.sh ps
```

Compose emplea puertos del **host** (6901, 6122, 5122) y persiste los datos
en `sources/serverdata`. No ejecutes a la vez los servidores nativo y
Docker. La imagen `:latest` puede cambiar: si buscas compilación
reproducible usa el servidor nativo de este ZIP.

## Archivos, desarrollo y mantenimiento

| Ruta | Contenido |
| --- | --- |
| `sources/tmwa` | Fuentes del servidor y repositorio Git con etiquetas; necesario para CMake |
| `sources/serverdata` | Configuración, mapas, misiones, submódulos de cliente y herramientas |
| `sources/mana` | Fuentes del cliente SDL2 y Guichan |
| `instalado/bin` | Binarios locales tras compilar |
| `sources/serverdata/login/save` | Cuentas y permisos GM |
| `sources/serverdata/world/save` | Personajes |
| `sources/serverdata/world/map/save` | Estado del mapa, si se genera |
| `respaldos` | Copias hechas con `scripts/respaldo.sh` |

Para conservar cuentas y personajes, **detén primero el servidor** y
ejecuta `./scripts/respaldo.sh`. Para restaurar, detén el servidor y extrae
tu copia desde `sources/serverdata/` conservando las rutas del archivo.
El repositorio no contiene cuentas personales; las crea tu instalación local.

Si editas mapas `.tmx` de `client-data/maps`, regenera las colisiones
servidor con `make -C sources/serverdata maps` y reinicia el servidor.
Para scripts NPC, edita `world/map/npc` y reinicia el proceso del mapa.
La opción `-d` del cliente carga los gráficos y mapas locales. El
`update_host` del servidor se deja vacío para evitar mezclar sus archivos
con las actualizaciones públicas.

## Español y traducciones

El instalador compila Mana con soporte de traducciones y con el catálogo
español de `sources/mana/po/es.po`. En el cliente abre **Setup → Interface →
Language**, elige **Español** y reinicia el cliente para aplicar el cambio.
En una instalación que use el idioma español del sistema también puede
seleccionarse automáticamente. Puedes probar `LANGUAGE=es
./scripts/cliente.sh`; si ya elegiste otro idioma en los ajustes, la
preferencia del cliente tiene prioridad.

El catálogo de Mana traduce su interfaz (menús, inventario, mensajes del
cliente). Los textos de NPC se han traducido directamente en
`sources/serverdata/world/map/npc/`. Consulta
`localizacion/README.md` para el alcance, las frases pendientes y la
revisión necesaria de esta primera pasada. Los identificadores, las
variables y la lógica de las misiones se conservaron.

## Diagnóstico

```bash
./scripts/diagnostico.sh
```

- Si falta `cmake` o alguna biblioteca, comprueba que la instalación de
  paquetes terminó sin errores y que tienes habilitado `universe` en Ubuntu.
- Si el servidor no arranca, verifica sus mensajes y que 6901, 6122 y 5122
  estén libres. `ss -ltn` muestra los puertos ocupados.
- Si el cliente se conecta al login y se desconecta al elegir personaje,
  comprueba que `tmwa-char` y `tmwa-map` arrancaron. Los archivos
  `lan_support.conf` anuncian `127.0.0.1`.
- Si no se ven mapas o sprites, comprueba la ruta
  `sources/serverdata/client-data` y vuelve a ejecutar el instalador.
- Si `tmwa-admin` indica contraseña o IP incorrecta, vuelve a ejecutar
  `python3 scripts/configurar-local.py sources/serverdata` con el servidor
  apagado. Es idempotente y conserva la clave ya generada.
- En equipos con poca RAM reduce compilaciones simultáneas:
  `JOBS=2 ./scripts/instalar.sh`.

**Alcance de la verificación:** en Ubuntu 24.04 del entorno de preparación
se completaron la compilación de TMWA con CMake, la generación de mapas y
configuraciones, la sintaxis de scripts y la verificación de claves
administrativas. La prueba de ejecución se detuvo porque el entorno solo
permite ejecutarse como root y TMWA rechaza root por diseño. No se pudieron
instalar las dependencias del cliente ni ejecutar Docker aquí. La sesión
gráfica y el arranque completo en Ubuntu 26.04 quedan por validar en tu PC.

## Procedencia y licencias

Fuentes oficiales descargadas el 24 de septiembre de 2026:

| Pieza | Repositorio | Commit incluido |
| --- | --- | --- |
| TMWA | <https://github.com/themanaworld/tmwa> | `fe83504049c2` |
| Datos del servidor | <https://github.com/themanaworld/tmwa-server-data> | `394c167597b4` |
| Datos del cliente | <https://git.themanaworld.org/tmw/clientdata> | `b3b082bfe15a` |
| Herramientas | <https://git.themanaworld.org/tmw/tools> | `9757be2a5eed` |
| Mana | <https://git.themanaworld.org/mana/mana> | `6c1e41d28f22` |
| Guichan | <https://github.com/darkbitsorg/guichan> | `c30941892acb` |

Cada fuente conserva sus archivos `COPYING`, licencias y autorías. Esta
colección y sus scripts no son una distribución oficial del proyecto.
El código del servidor y los datos poseen licencias distintas entre sí y
algunos recursos mantienen atribuciones propias; consulta los archivos
de cada repositorio si redistribuyes una versión modificada.

Referencia de instalación del proyecto:
<https://wiki.themanaworld.org/wiki/Setting_up_a_server>.
