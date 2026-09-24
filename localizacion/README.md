# Diálogos de NPC en español

La traducción incluida es una **primera pasada automática** de diálogos,
opciones y mensajes visibles en `sources/serverdata/world/map/npc/`.
Se modificaron 424 archivos y 11 976 apariciones de texto. Requiere revisión
humana de estilo, pistas y contexto de las misiones antes de considerarse
definitiva.

## Preparar la traducción

Después de clonar este repositorio o descargar su ZIP desde GitHub, ejecuta
desde la raíz:

```bash
./scripts/preparar-fuentes.sh
```

El script obtiene las fuentes fijadas, reconstruye y verifica mediante SHA-256
`localizacion/npc-es.patch` y `localizacion/npc_es.json`, y aplica el parche a
los datos del servidor. Esos dos archivos reconstruidos aparecen en tu
carpeta local y están excluidos de Git porque el repositorio conserva sus
fragmentos comprimidos. Si el parche ya estaba aplicado, el script lo detecta.
Si habías modificado los mismos diálogos, Git se detendrá para que revises
tus cambios.

Desde 0.2.2 el ZIP completo incluye los 424 scripts NPC con el parche ya
aplicado. `scripts/empaquetar-completo.py` lo comprueba antes de crear el
archivo, y los scripts de instalación y arranque del servidor lo verifican
de nuevo. Esto corrige los ZIP 0.2.0/0.2.1, cuyos scripts NPC originales
permanecían en inglés hasta ejecutar la preparación.

Para recuperar únicamente el español de una instalación existente:

```bash
./scripts/preparar-traduccion.sh --npc
```

Después reinicia el servidor para que cargue los diálogos. El script no
actualiza submódulos, no cambia cuentas ni reemplaza configuraciones.
Acepta submódulos con `.git` como archivo o directorio y reconoce el parche
ya aplicado. Conserva catálogos locales modificados y archivos con conflictos;
si detecta alguno, se detiene e indica la ruta para que revises tus cambios.
`aplicar-parche-es.sh` utiliza este mismo procedimiento.

El catálogo JSON asigna a cada texto original en inglés la traducción usada.
`scripts/npc_es.py` permite comprobar coincidencias con una copia original y
aplicar el catálogo:

```bash
python3 scripts/npc_es.py \
  --npc-dir sources/serverdata/world/map/npc \
  --catalog localizacion/npc_es.json
```

## Alcance

Quedan en inglés algunas frases con formatos especiales (`%s`, `##B`,
`@@enlace@@`, etc.), nombres de personajes y textos que no se muestran
mediante llamadas directas a `mes`, `menu` y funciones equivalentes. Los
textos de reglas del juego se dejaron sin modificar. La interfaz del cliente
utiliza un catálogo independiente en `sources/mana/po/es.po`.

Para corregir un diálogo, edita el archivo NPC correspondiente y reinicia el
proceso del mapa. Si quieres conservar el cambio como parte del catálogo,
actualiza también `localizacion/npc_es.json`. Los archivos dentro de
`sources/serverdata` pertenecen a un submódulo: un `git status` en la raíz
mostrará ese submódulo como modificado después de aplicar la traducción.

## Verificación realizada

La comparación de los 424 scripts modificados confirmó que las órdenes,
etiquetas y flujo del programa conservaron su estructura; solo cambiaron
textos visibles y algunos espacios finales. `git diff --check` no detectó
errores de formato. También se comprobó que los parches reconstruidos
coinciden byte por byte con los originales preparados. Aún falta revisar las
misiones dentro del juego en Ubuntu 26.04.

Las fuentes y sus licencias originales se conservan. Esta traducción no es
una publicación oficial de The Mana World.
