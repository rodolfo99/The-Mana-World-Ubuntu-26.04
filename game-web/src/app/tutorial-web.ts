/**
 * Web-control equivalents for literal tutorial messages in the pinned files
 * world/map/npc/029-2/{sorfina,tanisha,morgan}.txt. These are full-sentence
 * matches, not a translator: quest prose, player names, invocation strings and
 * protocol identifiers must pass through unchanged. Apply to NPC display text
 * before parsing its TMW formatting, never to player chat or outgoing input.
 *
 * Controls are defined by AppComponent.onKey/onCanvasPointerDown and the
 * inventory/target buttons in app.component.html. Unsupported native windows
 * are stated explicitly rather than assigning them a nonexistent web shortcut.
 */
const tutorialLines = new Map<string, string>([
  // Sorfina: walking, talking and equipping the tutorial clothes.
  ['Press [###keyMoveUp;] to move up, press [###keyMoveDown;] to move down,',
    'Pulsa W o ↑ para subir, S o ↓ para bajar,'],
  ['press [###keyMoveLeft;] to move left, press [###keyMoveRight;] to move right',
    'A o ← para ir a la izquierda, D o → para ir a la derecha'],
  ['o haga clic en el lugar al que desea ir.',
    'o haz clic en el lugar al que quieras ir.'],
  ['To interact with things in your environment or talk to NPCs you can either click on it or press [###keyTargetNPC;] to focus and [###keyTalk;] to talk/activate.',
    'Haz clic en un personaje u objeto interactivo del mapa para hablar o interactuar. Acércate si está demasiado lejos.'],
  ['Para interactuar con las cosas en su entorno o hablar con los NPCs puede hacer clic en él o presionar N para enfocarse y T para hablar/activar.',
    'Haz clic en un personaje u objeto interactivo del mapa para hablar o interactuar. Acércate si está demasiado lejos.'],
  ['Press [###keyWindowInventory;] or click on the Inventory button in the bar at the upper right corner to open your bag.',
    'Al terminar la conversación, pulsa I o el botón Inventario del panel lateral para abrir tu mochila.'],
  ['Puede abrir su inventario pulsando F3 o haciendo clic en el botón "Inventario" en la barra en la esquina superior derecha.',
    'Al terminar la conversación, pulsa I o el botón Inventario del panel lateral para abrir tu mochila.'],
  ['Una vez que dejemos de hablar, haga doble clic en la ropa para equipar.',
    'Una vez que dejemos de hablar, abre el Inventario y pulsa Equipar junto a cada prenda.'],
  ['Después de terminar de hablar, haga clic en la ropa y pulse el botón de equipación.',
    'Después de terminar de hablar, abre el Inventario y pulsa Equipar junto a cada prenda.'],
  ['Talk to me again after you get dressed. You can either click on me, or press [###keyTargetNPC;] to focus on me and [###keyTalk;] to talk.',
    'Cuando te hayas vestido, vuelve a hacer clic en mí para hablar.'],
  ['Creo que esto te ayudará un poco. Para obtener más información, presione el botón Configurar y ver los controles en la pestaña Keyboard. También puedes cambiarlos como quieras.',
    'Creo que esto te ayudará un poco. Pulsa Controles en el panel lateral para consultar cómo jugar. Las teclas no se pueden reasignar en este cliente web.'],
  ['Or you can press [###keyTargetNPC;] to focus on the nearest person and then press [###keyTalk;] to talk.',
    'Acércate y haz clic en la persona con la que quieras hablar.'],
  ['If you want to talk to other adventurers, press [###keyChat;] to open your chat window.',
    'Para hablar con otros aventureros, termina esta conversación y pulsa Enter o haz clic en el campo del chat del panel lateral.'],
  ["After pressing [###keyChat;] type '/whisper [name] [message]' or just use /w, for short. Same thing.",
    'Este cliente web todavía no permite enviar susurros privados.'],
  ['O puede hacer clic derecho en alguien y elegir la opción de susurrar.',
    'El clic derecho tampoco abre un menú de susurros en este cliente.'],
  ['Press [###keyWindowChat;] to show and hide your chat window.',
    'El chat permanece visible en el panel lateral.'],
  ['Press [###keyWindowInventory;] to open your inventory.',
    'Al terminar la conversación, pulsa I o el botón Inventario del panel lateral para abrir tu mochila.'],
  ['Al colocar el cursor sobre un elemento, puede ver una caja con alguna información sobre ese artículo.',
    'Cada objeto del Inventario muestra su nombre, imagen y cantidad.'],
  ['Para usar o equipar un artículo, seleccionelo haciendo doble clic en él.',
    'Para usar o equipar un objeto, pulsa Usar o Equipar junto a ese objeto en el Inventario.'],
  ['Seleccione el elemento y luego pulse Use o Equip también funciona.',
    'Si ya está equipado, el botón Quitar permite desequiparlo.'],
  ['Press [###keyWindowShortcut;] or click the Shortcut button in the bar at the upper right to open your shortcut window.',
    'Este cliente web no tiene una ventana para asignar objetos a atajos numéricos.'],
  ['Puede seleccionar el elemento que desea poner en un atajo con el ratón y luego hacer clic en la posición en la ventana de acceso directo que desea colocar.',
    'Para acceder a tus objetos, termina la conversación y abre el Inventario con I o su botón en el panel lateral.'],
  ['Ahora puede utilizar o equipar/unequip pulsando el número del atajo.',
    'Usa los botones Usar, Equipar o Quitar del objeto.'],

  // Tanisha: clicking starts an attack and selects the target; Space and Atacar
  // act on that selected monster. Stop is a button, not keyTarget.
  ['Press [###keyTargetMonster;] to focus on a monster. With [###keyTargetAttack;] you can focus and start attacking the same time.',
    'Haz clic en un monstruo para seleccionarlo y empezar a atacar. Con ese objetivo seleccionado, también puedes pulsar Espacio o el botón Atacar.'],
  ['Press [###keyTargetMonster;] to focus on a monster. With [###keyTargetAttack;] you can focus and attack.',
    'Haz clic en un monstruo para seleccionarlo y empezar a atacar. Con ese objetivo seleccionado, también puedes pulsar Espacio o el botón Atacar.'],
  ['Pero también funciona para hacer clic en el monstruo con el ratón.',
    'Cierra la conversación antes de atacar.'],
  ['If you press the [###keyTarget;], you can abort your attack.',
    'Pulsa Detener en el panel del objetivo para dejar de atacar.'],
  ['If you press the [###keyTarget;] button, you can abort your attack.',
    'Pulsa Detener en el panel del objetivo para dejar de atacar.'],
  ['Sometimes dead monsters leave some useful things. You can pick them up by pressing [###keyPickup;] or clicking on the items with your mouse.',
    'A veces los monstruos derrotados dejan objetos útiles. Haz clic en los objetos del suelo para recogerlos.'],
  ['Sometimes dead monsters leave some useful things. You can pick them up with pressing [###keyPickup;] or clicking on the items with your mouse.',
    'A veces los monstruos derrotados dejan objetos útiles. Haz clic en los objetos del suelo para recogerlos.'],
  ['Press [###keyWindowStatus;] or click the Status button in the bar at the upper right to see your status window. There you can distribute your points on six different properties.',
    'Este cliente web todavía no tiene una ventana para repartir puntos de atributos. Para asignarlos, utiliza un cliente nativo compatible.'],
  ['If you feel exhausted from battle you can sit down by pressing [###keyBeingSit;] to recover faster.',
    'Este cliente web todavía no tiene un control para sentarse. Si necesitas curarte, puedes volver a hablar con Sorfina.'],

  // Morgan: only this fixed instruction changes. The actual invocation is
  // supplied by the server on another line and must never be translated.
  ['Para lanzar un hechizo abrir la ventana de chat, escriba la invocación y pulse enter.',
    'Para lanzar el hechizo, cierra esta conversación, pulsa Enter o haz clic en el campo del chat, escribe la invocación exactamente y pulsa Enter para enviarla.'],
]);

export function adaptNpcText(text: string): string {
  // Work per mes line and preserve quote boundaries, whitespace and line ends.
  // A substring in unrelated prose must not accidentally become a control hint.
  return text.split(/(\r?\n)/).map(line => {
    const match = /^(\s*)(.*?)(\s*)$/.exec(line);
    if (!match) return line;
    let sentence = match[2];
    const opening = sentence.startsWith('"') ? '"' : '';
    if (opening) sentence = sentence.slice(1);
    const closing = sentence.endsWith('"') ? '"' : '';
    if (closing) sentence = sentence.slice(0, -1);
    const replacement = tutorialLines.get(sentence);
    return replacement === undefined ? line : `${match[1]}${opening}${replacement}${closing}${match[3]}`;
  }).join('');
}
