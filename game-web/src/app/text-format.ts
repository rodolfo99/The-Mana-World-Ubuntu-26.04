/** Safe text-only representation of Mana's BrowserBox markup.
 * Sources: mana/src/gui/widgets/browserbox.cpp and resources/theme.cpp.
 * Templates interpolate every label; this module never produces HTML.
 */
export interface TextPart {
  text: string;
  bold: boolean;
  color: string | null;
  href?: string;
  itemId?: number;
}

// Preserve Mana's color families, using shades readable on our dark panels.
export const MANA_COLORS: Readonly<Record<string, string>> = Object.freeze({
  '0': '#eaf0e9', '1': '#ffaaa0', '2': '#a3d9a5', '3': '#9ac6ff',
  '4': '#ffc08a', '5': '#f4df89', '6': '#f4b5d4', '7': '#cfb4f3',
  '8': '#b8c2bd', '9': '#d4b397',
});

const WEB_CONTROLS: Readonly<Record<string, string>> = Object.freeze({
  MoveUp: 'W / ↑', MoveDown: 'S / ↓', MoveLeft: 'A / ←', MoveRight: 'D / →',
  TargetNPC: 'clic en el personaje', Talk: 'clic en el personaje o botón Hablar',
  TargetMonster: 'clic en el monstruo', TargetAttack: 'clic en el monstruo o Espacio con un objetivo seleccionado',
  Target: 'botón Detener', Pickup: 'clic en el objeto del suelo',
  WindowInventory: 'I', Chat: 'Enter', WindowChat: 'panel Diario y chat',
});

export function webControlLabel(key: string): string {
  const name = key.replace(/^key/, '');
  return Object.hasOwn(WEB_CONTROLS, name) ? WEB_CONTROLS[name]! : 'control no disponible en este cliente web';
}

function safeHref(value: string): string | undefined {
  // No relative URLs, application schemes, credentials or control characters.
  if (!/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/u.test(value)) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password)
      return url.href;
  } catch { /* A malformed link remains a harmless text label. */ }
  return undefined;
}

export function parseTmwText(text: string, itemName: (id: number) => string | undefined = () => undefined): TextPart[] {
  const parts: TextPart[] = [];
  let bold = false;
  let color: string | null = null;
  let previousColor: string | null = null;
  const append = (value: string, link?: Pick<TextPart, 'href' | 'itemId'>): void => {
    if (!value) return;
    const previous = parts.at(-1);
    if (previous && previous.href === link?.href && previous.itemId === link?.itemId && previous.bold === bold && previous.color === color)
      previous.text += value;
    else parts.push({ text: value, bold, color, ...link });
  };
  // Link captions may themselves contain formatting. Process them with the same
  // scanner, but do not recursively recognize links inside a caption.
  const scan = (value: string, allowLinks: boolean, link?: Pick<TextPart, 'href' | 'itemId'>): void => {
    let position = 0;
    while (position < value.length) {
      const rest = value.slice(position);
      const key = /^###([^;\r\n]+);/.exec(rest);
      if (key) {
        append(webControlLabel(key[1]!), link);
        position += key[0].length;
        continue;
      }
      if (rest.startsWith('###')) {
        // An incomplete key token is literal text, not a color code beginning
        // at the second '#'. Preserve it without swallowing its first letter.
        append('###', link);
        position += 3;
        continue;
      }
      const markup = /^##([0-9A-Za-z<>])/.exec(rest);
      if (markup) {
        const code = markup[1]!;
        if (code === 'B') bold = true;
        else if (code === 'b') bold = false;
        else if (code === '<') { previousColor = color; color = '#a9d8eb'; }
        else if (code === '>') color = previousColor;
        else color = MANA_COLORS[code] ?? null;
        position += markup[0].length;
        continue;
      }
      const anchor = allowLinks ? /^@@([^|\r\n]*)\|([^\r\n]*?)@@/.exec(rest) : null;
      if (anchor) {
        const target = anchor[1]!;
        const numeric = /^\d+$/.test(target) ? Number(target) : undefined;
        const itemId = numeric !== undefined && Number.isSafeInteger(numeric) && numeric > 0 && numeric <= 65535 ? numeric : undefined;
        const href = itemId === undefined ? safeHref(target) : undefined;
        const caption = anchor[2] || (itemId === undefined ? target || 'Enlace' : itemName(itemId) || `Objeto ${itemId}`);
        scan(caption, false, { ...(href ? { href } : {}), ...(itemId !== undefined ? { itemId } : {}) });
        position += anchor[0].length;
        continue;
      }
      const character = value[position]!;
      append(character, link);
      position++;
      // BrowserBox resets formatting for each row.
      if (character === '\n') { bold = false; color = null; previousColor = null; }
    }
  };
  scan(text, true);
  return parts;
}
