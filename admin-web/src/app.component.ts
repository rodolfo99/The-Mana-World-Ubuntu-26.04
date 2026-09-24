import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Action = 'list' | 'listgm' | 'getcount' | 'id' | 'info' | 'gm' | 'block' | 'unblock' | 'kami';
type SensitiveAction = 'add' | 'passwd' | 'del';
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
  newAccount = '';
  newSex: 'M' | 'F' | 'N' = 'N';
  newEmail = '';
  newPassword = '';
  newPasswordRepeat = '';
  passwordAccount = '';
  replacementPassword = '';
  replacementPasswordRepeat = '';
  deleteAccount = '';
  confirmDeleteAccount = '';

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

  createAccount(): void {
    if (this.busy()) return;
    const account = this.newAccount.trim();
    const email = this.newEmail.trim();
    if (!this.validAccount(account, 4)) {
      this.invalidSensitive('El nombre nuevo debe tener entre 4 y 23 letras ASCII, números, _, . o -.');
      return;
    }
    const host = email.split('@')[1];
    if (!/^[\x21-\x7e]{3,39}$/.test(email) ||
        !/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+$/.test(email) ||
        !host || host.startsWith('.') || email.endsWith('.') || email.includes('..')) {
      this.invalidSensitive('Introduce un correo ASCII válido de entre 3 y 39 caracteres.');
      return;
    }
    if (!this.validPassword(this.newPassword) || this.newPassword !== this.newPasswordRepeat) {
      this.invalidSensitive('La contraseña debe tener entre 4 y 23 caracteres ASCII sin espacios ni comillas; ambas entradas deben coincidir.');
      return;
    }
    const password = this.newPassword;
    this.sendSensitive('add', { account, sex: this.newSex, email, password }, 'Cuenta creada.');
  }

  changePassword(): void {
    if (this.busy()) return;
    const account = this.passwordAccount.trim();
    if (!this.validAccount(account, 1)) {
      this.invalidSensitive('Introduce un nombre de cuenta válido (1–23 caracteres ASCII).');
      return;
    }
    if (!this.validPassword(this.replacementPassword) ||
        this.replacementPassword !== this.replacementPasswordRepeat) {
      this.invalidSensitive('La contraseña debe tener entre 4 y 23 caracteres ASCII sin espacios ni comillas; ambas entradas deben coincidir.');
      return;
    }
    if (!window.confirm(`¿Cambiar la contraseña de «${account}»?`)) {
      this.clearPasswords();
      return;
    }
    const password = this.replacementPassword;
    this.sendSensitive('passwd', { account, password }, 'Contraseña cambiada.');
  }

  deleteSelectedAccount(): void {
    if (this.busy()) return;
    const account = this.deleteAccount.trim();
    if (!this.validAccount(account, 1)) {
      this.invalidSensitive('Introduce un nombre de cuenta válido (1–23 caracteres ASCII).');
      return;
    }
    if (this.confirmDeleteAccount !== account) {
      this.invalidSensitive('Escribe de nuevo exactamente el nombre de cuenta que quieres borrar.');
      return;
    }
    if (!window.confirm(`¿Borrar de forma permanente la cuenta «${account}»? Esta acción no se puede deshacer.`)) {
      this.confirmDeleteAccount = '';
      return;
    }
    this.sendSensitive('del', { account, confirmAccount: this.confirmDeleteAccount }, 'Cuenta borrada.');
  }

  private validAccount(account: string, min: number): boolean {
    return account.length >= min && /^[a-zA-Z0-9_.-]{1,23}$/.test(account);
  }

  private validPassword(password: string): boolean {
    // TMWA separa sus órdenes por espacios: las comillas tampoco son válidas aquí.
    return /^[\x21\x23-\x26\x28-\x7e]{4,23}$/.test(password);
  }

  private invalidSensitive(message: string): void {
    this.error.set(message);
    this.clearPasswords();
  }

  private clearPasswords(): void {
    this.newPassword = '';
    this.newPasswordRepeat = '';
    this.replacementPassword = '';
    this.replacementPasswordRepeat = '';
  }

  private sendSensitive(action: SensitiveAction, payload: object, successMessage: string): void {
    this.busy.set(true);
    this.error.set('');
    this.lastAction.set(action === 'add' ? 'Crear cuenta' : action === 'passwd' ? 'Cambiar contraseña' : 'Borrar cuenta');
    this.http.post<Result>('/api/command', { action, ...payload }).subscribe({
      next: () => {
        this.clearPasswords();
        this.confirmDeleteAccount = '';
        this.busy.set(false);
        // El programa de administración puede incluir claves en su salida.
        this.result.set(successMessage);
        this.refresh();
      },
      error: () => {
        this.clearPasswords();
        this.confirmDeleteAccount = '';
        this.busy.set(false);
        // No mostramos la respuesta del servidor: podría incluir contraseñas.
        this.result.set('La operación no se completó.');
        this.error.set('No se completó la operación. Comprueba el estado del servidor y los datos e inténtalo de nuevo.');
      }
    });
  }
}
