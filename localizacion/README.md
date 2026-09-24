# Traducción española de NPC

Esta versión incluye una **primera pasada automática** sobre los diálogos,
respuestas y mensajes visibles en los scripts de `world/map/npc`.
Se modificaron 424 archivos y 11 976 apariciones de textos. El catálogo
editable está en `npc_es.json`: cada clave es el texto original en inglés
y cada valor, el español usado. La traducción automática necesita revisión
de estilo, nombres propios, pistas y contexto de misiones antes de
considerarse definitiva.

Quedan en inglés algunas frases con formatos especiales (`%s`, `##B`,
`@@enlace@@`, etc.), nombres de personajes y textos que no se muestran
mediante llamadas directas a `mes`/`menu` y funciones equivalentes.
Los textos de reglas del juego también se dejaron sin modificar para no
presentar como actual una traducción de reglas que el proyecto mantiene
deshabilitada. La interfaz del cliente tiene su catálogo independiente
`sources/mana/po/es.po`.

## Aplicar a una instalación anterior

Con el servidor detenido, conserva una copia de tus personajes y cuentas:

```bash
./scripts/respaldo.sh
```

Extrae el ZIP de parche en la raíz de la instalación
`The-Mana-World-Ubuntu-26.04/` y ejecuta:

```bash
./scripts/aplicar-parche-es.sh
./scripts/servidor.sh
```

El script comprueba el parche antes de aplicarlo. Si ya está aplicado,
no lo vuelve a insertar. Si editaste los mismos archivos NPC, se detiene
para que puedas resolver tus cambios con cuidado.

## Editar una traducción

Para esta versión basta modificar el texto español en el archivo NPC
correspondiente y reiniciar el servidor. Si quieres conservar la mejora
en el catálogo, cambia también el valor de la frase inglesa en
`npc_es.json`. `scripts/npc_es.py` permite inspeccionar cuántas cadenas
del catálogo coinciden con una copia original y aplicar el catálogo:

```bash
python3 scripts/npc_es.py \
  --npc-dir sources/serverdata/world/map/npc \
  --catalog localizacion/npc_es.json
```

## Comprobaciones hechas

- Comparamos los scripts antes y después: todas las modificaciones,
  salvo espacios finales retirados de una línea, quedaron dentro de
  literales de texto; las órdenes y etiquetas del programa son idénticas.
- `git diff --check` no detecta errores de formato.
- No se ejecutó el cliente ni el servidor sobre Ubuntu 26.04 desde el
  entorno de preparación. Revisa en el juego las misiones que utilices.

Las fuentes y sus licencias originales se conservan. Esta traducción no
es una publicación oficial de The Mana World.
