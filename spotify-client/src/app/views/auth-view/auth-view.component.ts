import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-auth-view',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './auth-view.component.html',
  styleUrls: ['./auth-view.component.css']
})
export class AuthViewComponent implements OnInit, OnDestroy {
  private routeSub!: Subscription;

  activeTab = signal<'login' | 'register'>('login');
  forgotPasswordMode = signal<boolean>(false);
  resetPasswordMode = signal<boolean>(false);
  resetToken = signal<string>('');

  username = '';
  password = '';
  email = '';
  newPassword = '';

  errorMsg = signal<string>('');
  successMsg = signal<string>('');
  debugResetLink = signal<string>('');

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      const token = params['resetToken'] || '';
      if (token) {
        this.resetToken.set(token);
        this.resetPasswordMode.set(true);
        this.forgotPasswordMode.set(false);
      } else {
        this.resetPasswordMode.set(false);
        this.resetToken.set('');
      }
    });
  }

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
  }

  switchTab(tab: 'login' | 'register'): void {
    this.activeTab.set(tab);
    this.forgotPasswordMode.set(false);
    this.errorMsg.set('');
    this.successMsg.set('');
    this.username = '';
    this.password = '';
    this.email = '';
  }

  toggleForgotPassword(mode: boolean): void {
    this.forgotPasswordMode.set(mode);
    this.errorMsg.set('');
    this.successMsg.set('');
    this.email = '';
  }

  onSubmit(): void {
    this.errorMsg.set('');
    this.successMsg.set('');

    const u = this.username.trim();
    const p = this.password.trim();
    const e = this.email.trim();

    if (this.resetPasswordMode()) {
      const np = this.newPassword.trim();
      if (!np || np.length < 6) {
        this.errorMsg.set('Password must be at least 6 characters long');
        return;
      }

      this.authService.resetPassword(this.resetToken(), np).subscribe({
        next: (res: any) => {
          alert('Password successfully reset! You can now log in.');
          this.router.navigate(['/auth']);
        },
        error: (err) => {
          this.errorMsg.set(err.error?.error || 'Password reset failed. Token may be invalid or expired.');
        }
      });
      return;
    }

    if (this.forgotPasswordMode()) {
      if (!e) {
        this.errorMsg.set('Email address is required');
        return;
      }

      this.authService.forgotPassword(e).subscribe({
        next: (res: any) => {
          this.successMsg.set('Password reset email sent (Simulation). Link printed to backend console.');
          if (res.debugLink) {
            this.debugResetLink.set(res.debugLink);
          }
        },
        error: (err) => {
          this.errorMsg.set(err.error?.error || 'No user found with that email.');
        }
      });
      return;
    }

    if (this.activeTab() === 'login') {
      if (!u || !p) {
        this.errorMsg.set('Username and password are required');
        return;
      }

      this.authService.login(u, p).subscribe({
        next: () => {
          this.router.navigate(['/']);
        },
        error: (err) => {
          this.errorMsg.set(err.error?.error || 'Login failed. Please verify credentials.');
        }
      });
    } else {
      if (!u || !p || !e) {
        this.errorMsg.set('Username, password, and email are required');
        return;
      }
      if (p.length < 6) {
        this.errorMsg.set('Password must be at least 6 characters long');
        return;
      }

      this.authService.register(u, p, e).subscribe({
        next: () => {
          this.router.navigate(['/']);
        },
        error: (err) => {
          this.errorMsg.set(err.error?.error || 'Registration failed. Username or email may be taken.');
        }
      });
    }
  }
}
