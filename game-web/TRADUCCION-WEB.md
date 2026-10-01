# Correcciones prioritarias de traducción y presentación

Revisión del 1 de octubre de 2026 sobre el cliente web v0.2.6. Estas
correcciones no constituyen una traducción completa del mundo ni una nueva
validación de todas las misiones en una partida real.

## Problemas corregidos

- El parche español había traducido nombres técnicos usados por
  `get(.invocation$, ...)`. Por ejemplo, Morgan consultaba `hechizo-quierd`
  aunque el NPC que contiene la invocación sigue llamándose `spell-wand`.
  La corrección restaura los identificadores originales y conserva el
  argumento literal `lurk` del ejemplo de transmutación. También restaura
  `help` en la condición del gestor de teletransportes.
- El extractor de traducciones protege las referencias técnicas y conserva
  los espacios de los fragmentos concatenados. Se revisan también los
  fragmentos de Ched que mezclaban idiomas o pegaban palabras al hechizo.
- El cliente web adapta las instrucciones conocidas del tutorial a sus
  controles reales: WASD/flechas, clic en personajes y criaturas, inventario
  con **I** o el botón lateral, y el botón **Equipar**. La adaptación se
  realiza al mostrar el diálogo; el cliente nativo conserva sus controles.
- El texto de NPC, opciones y chat interpreta el marcado admitido de Mana
  mediante elementos de texto de Angular. No se convierte el mensaje recibido
  en HTML ejecutable. Las opciones conservan sus índices originales. Se
  admiten negritas y colores `##`, teclas `###...;` y etiquetas de enlace
  `@@...|...@@`. Los enlaces web solo abren direcciones HTTP(S) válidas;
  los de objetos muestran el nombre conocido del inventario o `Objeto ID`,
  sin ofrecer acciones que esta web no implementa. Otros códigos, como los
  emoticonos `%%`, permanecen fuera de este cambio.
- Los paneles de mapa y objetivo se acomodan en pantallas estrechas y la
  superficie de juego deja de imponer una altura mínima que coloca los
  controles del diálogo por debajo de ventanas cortas.

## Actualizar una instalación

Desde una copia que ya contenga estos cambios, detén el servidor y la web,
y ejecuta:

```bash
./scripts/preparar-traduccion.sh --npc
./scripts/servidor.sh
```

En otra terminal de la misma instalación:

```bash
./scripts/juego-web.sh
```

Recarga el navegador con `Ctrl+Shift+R`. TMWA necesita reiniciarse para leer
las correcciones de los scripts NPC. El preparador admite tanto fuentes
originales como instalaciones ya traducidas; repetirlo no reaplica cambios.
Si encuentra un conflicto con una edición personal, se detiene y conserva
los archivos. Las cuentas, partidas y commits fijados de los submódulos no
se sustituyen. El empaquetador existente llama al mismo preparador.

## Alcance y comprobación manual

1. Habla con Sorfina y Tanisha: las instrucciones adaptadas deben indicar
   acciones que existen en esta web, sin mostrar los códigos de teclas.
2. Intenta hablar desde lejos: el aviso debe mostrar «Acércate» con formato,
   sin los caracteres `##B`.
3. Abre un menú y elige una opción después de una opción vacía: debe enviarse
   el mismo índice que antes de esta corrección.
4. Comprueba las instrucciones de magia de Morgan y Auldsbel tras reiniciar
   TMWA. La corrección de referencias se verifica automáticamente; la
   progresión completa de esas misiones requiere una partida real posterior.
5. Prueba una ventana de 1024 × 600 y otra de 390 px de ancho. Los textos
   largos deben poder desplazarse dentro del diálogo.

Los nombres originales de mapas y objetos permanecen en su idioma de origen.
También pueden quedar otros diálogos ingleses o traducciones automáticas
fuera de los casos revisados. Las comprobaciones anteriores no certifican
que todas las funciones del cliente nativo estén disponibles en la web.

## Validación automatizada del 1 de octubre de 2026

Ejecutada en Ubuntu 24.04.3, Node.js 24.19.0 y Chromium 153:

| Comprobación | Resultado |
| --- | --- |
| `npm test` en `game-web` | 46 pruebas satisfactorias |
| `npm run test:ui` en `game-web` | Compilación de producción y 27 pruebas satisfactorias |
| `python3 -m unittest discover -s scripts/tests -v` | 15 pruebas satisfactorias |
| Preparador `--npc` sobre los fuentes fijados | Aplicación y repetición satisfactorias |
| Auditoría de invocaciones | Las 63 referencias coinciden con los identificadores originales; 51 fueron restauradas |
| `bash -n scripts/preparar-traduccion.sh` y `git diff --check` | Sin errores |

Las regresiones añadidas cubren texto seguro, enlaces y claves malformadas,
índices de menú, adaptación exclusiva de los diálogos NPC, pantallas pequeñas,
referencias técnicas y conflictos del preparador. Las pruebas de protocolo
usan servidores TCP simulados; las del navegador usan respuestas WebSocket
simuladas y recursos originales. Estas comprobaciones son independientes
de la partida completa en Ubuntu 26.04 confirmada por el usuario el
29 de septiembre. No se generó un nuevo ZIP ni se cambió la versión.
