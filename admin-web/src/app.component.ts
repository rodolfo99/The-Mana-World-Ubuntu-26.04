import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Action = 'list' | 'listgm' | 'getcount' | 'id' | 'info' | 'gm' | 'block' | 'unblock' | 'kami';
interface Status { ready: boolean; login: boolean; installed: boolean; configured: boolean }
interface Result { output: string }

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly http = inject(HttpClient);
  readonly status = signal<Status | null>(null);
  readonly busy = signal(false);
  readonly result = signal('Selecciona una acción para consultar el servidor.');
  readonly error = signal('');
  readonly lastAction = signal('Consola');

  account = '';
  accountId: number | null = null;
  level: number | null = null;
  startId: number | null = 2000000;
  endId: number | null = 2000100;
  message = '';

  constructor() { this.refresh(); }

  refresh(): void {
    this.http.get<Status>('/api/status').subscribe({
      next: status => this.status.set(status),
      error: () => { this.status.set(null); this.error.set('No se pudo consultar el servicio local.'); }
    });
  }

  run(action: Action): void {
    if (this.busy()) return;
    const name = this.account.trim();
    const titles: Record<Action, string> = {
      list: 'Listado de cuentas', listgm: 'Cuentas GM', getcount: 'Jugadores conectados',
      id: 'Buscar cuenta', info: 'Datos de cuenta', gm: 'Nivel GM',
      block: 'Bloquear cuenta', unblock: 'Desbloquear cuenta', kami: 'Aviso global'
    };
    if (['gm', 'block', 'unblock', 'kami'].includes(action)) {
      const detail = action === 'kami' ? this.message.trim() : name;
      if (!window.confirm(`¿Ejecutar «${titles[action]}» para ${detail}?`)) return;
    }
    this.busy.set(true);
    this.error.set('');
    this.lastAction.set(titles[action]);
    const payload = { action, account: name, accountId: this.accountId,
      level: this.level, startId: this.startId, endId: this.endId, message: this.message.trim() };
    this.http.post<Result>('/api/command', payload).subscribe({
      next: response => { this.result.set(response.output); this.busy.set(false); this.refresh(); },
      error: (response: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(typeof response.error?.error === 'string'
          ? response.error.error : 'No se pudo ejecutar la acción. Comprueba que el servidor está encendido.');
      }
    });
  }
}
