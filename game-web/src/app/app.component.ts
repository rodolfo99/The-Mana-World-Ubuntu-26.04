import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameEntity, WorldRenderer } from './world-renderer';

interface Character { id: number; name: string; slot: number; level: number; hp: number; maxHp: number; sex: string }
interface Item { slot: number; id: number; amount: number; equipped?: boolean }
interface Message { from: string; text: string; type: 'system' | 'player' | 'error' }
interface Dialog { id: number; text: string; choices: string[]; next: boolean; close: boolean; input?: 'number' | 'text' }

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('viewport', { static: true }) viewport!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chatInput') chatInput?: ElementRef<HTMLInputElement>;

  private renderer?: WorldRenderer;
  private socket?: WebSocket;
  private worldRequest = 0;
  private keyDelay = 0;

  phase: 'login' | 'characters' | 'game' = 'login';
  authMode: 'login' | 'register' = 'login';
  status = 'Conecta con tu servidor local para comenzar.';
  busy = false;
  hasError = false;
  username = '';
  password = '';
  sex: 'M' | 'F' = 'M';
  newName = '';
  characters: Character[] = [];
  selectedCharacter?: Character;
  inventory: Item[] = [];
  messages: Message[] = [];
  chatText = '';
  dialog?: Dialog;
  dialogInput = '';
  showInventory = false;
  showHelp = false;
  mapName = '';
  coords = { x: 0, y: 0 };
  target?: GameEntity;
  loadingMap = false;
  connected = false;

  constructor(private readonly zone: NgZone, private readonly changes: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    try { this.renderer = this.zone.runOutsideAngular(() => new WorldRenderer(this.viewport.nativeElement)); }
    catch (error) { this.status = this.errorText(error); }
  }

  ngOnDestroy(): void {
    this.worldRequest++;
    this.socket?.close();
    this.renderer?.destroy();
  }

  submitAuth(): void {
    if (this.busy || !this.username.trim() || !this.password) return;
    this.busy = true;
    this.hasError = false;
    this.status = 'Estableciendo conexión…';
    const auth = { type: 'login', username: this.username.trim(), password: this.password,
      register: this.authMode === 'register', sex: this.sex };
    // A failed login leaves the old protocol session alive; each attempt needs a new bridge session.
    this.socket?.close();
    const url = new URL('/game', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      const socket = new WebSocket(url.href);
      this.socket = socket;
      socket.addEventListener('open', () => {
        if (this.socket !== socket) return;
        this.connected = true;
        this.status = 'Verificando cuenta…';
        socket.send(JSON.stringify(auth));
        this.password = '';
        this.changes.markForCheck();
      }, { once: true });
      socket.addEventListener('message', event => {
        if (this.socket !== socket) return;
        this.receive(event.data);
        // Angular 22 uses zoneless/OnPush defaults. Native WebSocket callbacks
        // must notify Angular when they change fields used by the template.
        this.changes.markForCheck();
      });
      socket.addEventListener('error', () => {
        if (this.socket !== socket) return;
        this.busy = false;
        this.hasError = true;
        this.status = 'No se pudo conectar al servidor de juego.';
        this.changes.markForCheck();
      });
      socket.addEventListener('close', () => {
        if (this.socket !== socket) return;
        this.connected = false;
        this.busy = false;
        this.loadingMap = false;
        this.phase = 'login';
        if (!this.hasError) this.status = 'Se perdió la conexión. Comprueba que el servidor siga activo.';
        this.hasError = true;
        this.changes.markForCheck();
      });
    } catch (error) {
      this.busy = false;
      this.hasError = true;
      this.status = this.errorText(error);
    }
  }

  private receive(data: unknown): void {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(String(data)) as Record<string, unknown>;
      if (!event || typeof event !== 'object') return;
    } catch { return; }
    switch (event['type']) {
      case 'status':
        if (typeof event['message'] === 'string') this.status = event['message'];
        if (event['phase'] === 'characters') { this.phase = 'characters'; this.busy = false; }
        if (event['phase'] === 'disconnected') { this.phase = 'login'; this.busy = false; this.socket?.close(); }
        break;
      case 'characters':
        this.characters = Array.isArray(event['characters']) ? event['characters'] as Character[] : [];
        this.phase = 'characters'; this.busy = false;
        this.hasError = false;
        this.status = 'Elige un personaje para entrar a The Mana World.';
        break;
      case 'world':
        void this.enterWorld(event);
        break;
      case 'position':
        this.coords = { x: Number(event['x']), y: Number(event['y']) };
        this.renderer?.setPosition(this.coords.x, this.coords.y);
        break;
      case 'entity':
        this.renderer?.setEntity(event as unknown as Pick<GameEntity, 'id'> & Partial<GameEntity>);
        this.target = this.renderer?.target;
        break;
      case 'remove':
        this.renderer?.removeEntity(Number(event['id']));
        this.target = this.renderer?.target;
        break;
      case 'chat':
        this.log(String(event['from'] || 'Jugador'), String(event['text'] ?? ''), 'player');
        break;
      case 'dialog': {
        const id = Number(event['id']);
        if (event['closed']) {
          if (this.dialog?.id === id) this.dialog = undefined;
        } else if (event['clear']) {
          if (this.dialog?.id === id) this.dialog.text = '';
        } else if (event['close'] && this.dialog?.id !== id) {
          // A close request without a visible page still needs its ACK.
          this.send({ type: 'closeNpc', id });
        } else {
          const previous = this.dialog?.id === id ? this.dialog.text : '';
          const line = typeof event['text'] === 'string' ? event['text'] : undefined;
          this.dialog = { id, text: line === undefined ? previous : previous ? `${previous}\n${line}` : line,
            choices: Array.isArray(event['choices']) ? event['choices'].map(String) : [],
            next: Boolean(event['next']),
            close: Boolean(event['close']),
            input: event['input'] === 'number' || event['input'] === 'text' ? event['input'] : undefined };
          if (event['input']) this.dialogInput = '';
        }
        break;
      }
      case 'inventory':
        this.inventory = Array.isArray(event['items']) ? event['items'] as Item[] : [];
        break;
      case 'hit':
        if (Number(event['source']) === this.renderer?.target?.id || Number(event['source']) === this.selectedCharacter?.id) {
          this.log('Combate', `Daño: ${Number(event['damage'])}.`, 'system');
        }
        break;
      case 'error':
        this.busy = false;
        this.hasError = true;
        this.status = String(event['message'] ?? 'El servidor informó un error.');
        this.log('Sistema', this.status, 'error');
        break;
    }
  }

  private async enterWorld(event: Record<string, unknown>): Promise<void> {
    if (!this.renderer) return;
    const sequence = ++this.worldRequest;
    this.phase = 'game';
    this.busy = false;
    this.loadingMap = true;
    this.mapName = String(event['map'] ?? '');
    this.coords = { x: Number(event['x']), y: Number(event['y']) };
    this.dialog = undefined;
    this.target = undefined;
    this.status = `Cargando ${this.mapName}…`;
    try {
      const label = await this.renderer.enter(this.mapName, this.coords.x, this.coords.y,
        Number(event['id']), String(event['name'] ?? this.selectedCharacter?.name ?? ''),
        Number(event['mask'] ?? 1));
      if (sequence !== this.worldRequest) return;
      this.mapName = label;
      this.loadingMap = false;
      this.status = `Estás en ${label}.`;
      this.log('Sistema', `Entraste en ${label}. Usa WASD, las flechas o haz clic para caminar.`, 'system');
      this.send({ type: 'loaded' });
      this.viewport.nativeElement.focus();
    } catch (error) {
      if (sequence !== this.worldRequest) return;
      this.loadingMap = false;
      this.status = this.errorText(error);
      this.log('Recursos', this.status, 'error');
    } finally {
      if (sequence === this.worldRequest) this.changes.markForCheck();
    }
  }

  choose(character: Character): void {
    this.selectedCharacter = character;
    this.busy = true;
    this.status = `Entrando como ${character.name}…`;
    this.send({ type: 'choose', slot: character.slot });
  }

  create(slot: number): void {
    const name = this.newName.trim();
    if (!name || !this.connected || this.busy) return;
    this.busy = true;
    this.status = 'Creando personaje…';
    this.send({ type: 'create', slot, name });
    this.newName = '';
  }

  get freeSlot(): number | null {
    for (let slot = 0; slot < 9; slot++) if (!this.characters.some(character => character.slot === slot)) return slot;
    return null;
  }

  onCanvasPointerDown(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0 || this.phase !== 'game' || this.dialog || !this.renderer?.isReady || this.loadingMap) return;
    event.preventDefault();
    const hit = this.renderer.hit(event.clientX, event.clientY);
    this.target = this.renderer.target;
    if (hit.entity) {
      if (hit.entity.kind === 'npc') this.talk(hit.entity.id);
      else if (hit.entity.kind === 'monster') this.attack(hit.entity.id);
      else if (hit.entity.kind === 'item') this.send({ type: 'pickup', id: hit.entity.id });
    } else if (hit.tile) {
      this.send({ type: 'walk', ...hit.tile });
      this.status = `Destino: ${hit.tile.x}, ${hit.tile.y}.`;
    } else if (hit.blocked) {
      this.status = 'Esa casilla no es transitable.';
    }
    this.viewport.nativeElement.focus({ preventScroll: true });
  }

  @HostListener('window:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (this.phase !== 'game' || this.loadingMap) return;
    const element = event.target as HTMLElement | null;
    if (element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || this.dialog) {
      if (event.key === 'Escape') { this.chatInput?.nativeElement.blur(); this.closeDialog(); }
      return;
    }
    if (event.key === 'Enter') { event.preventDefault(); this.chatInput?.nativeElement.focus(); return; }
    if (event.key.toLowerCase() === 'i') { this.showInventory = !this.showInventory; return; }
    if (event.key === 'Escape') { this.showInventory = false; this.showHelp = false; return; }
    if (event.code === 'Space' && this.target?.kind === 'monster') {
      event.preventDefault(); this.attack(this.target.id); return;
    }
    const key = event.key.toLowerCase();
    const vector: Record<string, [number, number]> = {
      arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
      arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0]
    };
    const delta = vector[key];
    if (!delta) return;
    event.preventDefault();
    if (performance.now() - this.keyDelay < 135) return;
    this.keyDelay = performance.now();
    const tile = this.renderer?.moveDirection(...delta);
    if (tile) {
      this.send({ type: 'walk', ...tile });
      this.status = `Destino: ${tile.x}, ${tile.y}.`;
    } else this.status = 'Esa casilla no es transitable. Prueba otra dirección.';
  }

  sendChat(): void {
    const text = this.chatText.trim();
    if (text) this.send({ type: 'say', text });
    this.chatText = '';
    this.viewport.nativeElement.focus();
  }

  talk(id: number): void { this.send({ type: 'talk', id }); }
  attack(id: number): void { this.renderer?.attack(); this.send({ type: 'attack', id }); }
  stopAttack(): void { this.send({ type: 'stopAttack' }); this.renderer?.select(null); this.target = undefined; }
  nextDialog(): void {
    if (!this.dialog?.next) return;
    this.send({ type: 'next', id: this.dialog.id });
    this.waitForDialog();
  }
  chooseDialog(index: number): void {
    if (!this.dialog?.choices[index]?.trim()) return;
    this.send({ type: 'choice', id: this.dialog.id, index: index + 1 });
    this.waitForDialog();
  }
  private waitForDialog(): void {
    if (this.dialog) this.dialog = { id: this.dialog.id, text: '', choices: [], next: false, close: false };
  }
  submitDialogInput(): void {
    if (!this.dialog?.input || !this.dialogInput.trim()) return;
    const value = this.dialog.input === 'number' ? Number(this.dialogInput) : this.dialogInput.trim();
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    this.send({ type: 'npcInput', id: this.dialog.id, value });
    this.dialogInput = '';
    this.waitForDialog();
  }
  closeDialog(): void {
    if (!this.dialog || !this.dialog.close && !this.dialog.choices.length) return;
    this.send({ type: 'closeNpc', id: this.dialog.id });
    this.dialog = undefined;
    this.viewport.nativeElement.focus({ preventScroll: true });
  }
  useItem(item: Item): void { this.send({ type: 'use', slot: item.slot }); }
  toggleEquip(item: Item): void { this.send({ type: item.equipped ? 'unequip' : 'equip', slot: item.slot }); }

  private send(payload: object): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.status = 'No hay conexión con el servidor.';
      return;
    }
    this.socket.send(JSON.stringify(payload));
  }

  private log(from: string, text: string, type: Message['type']): void {
    this.messages.push({ from, text, type });
    if (this.messages.length > 100) this.messages.shift();
  }

  private errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
}
