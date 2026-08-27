import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';

type AuthMode = 'login' | 'register';

/** Pantalla pública de login/registro. Alterna entre los dos modos sin cambiar de ruta. */
@Component({
  selector: 'app-login-page',
  imports: [FormsModule, TranslatePipe],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  protected readonly mode = signal<AuthMode>('login');
  protected readonly submitting = signal(false);

  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');

  protected toggleMode(): void {
    this.mode.update((current) => (current === 'login' ? 'register' : 'login'));
  }

  protected submit(): void {
    if (this.submitting()) return;
    this.submitting.set(true);

    if (this.mode() === 'login') {
      this.authService.login({ email: this.email(), password: this.password() }).subscribe({
        next: () => this.router.navigateByUrl('/'),
        error: () => {
          this.submitting.set(false);
          this.toastService.error('auth.errors.loginFailed');
        },
      });
      return;
    }

    this.authService.register({ name: this.name(), email: this.email(), password: this.password() }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toastService.success('auth.registerSuccess');
        this.mode.set('login');
        this.password.set('');
      },
      error: () => {
        this.submitting.set(false);
        this.toastService.error('auth.errors.registerFailed');
      },
    });
  }
}
