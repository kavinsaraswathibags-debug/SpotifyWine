import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap, catchError, throwError } from 'rxjs';

export interface User {
  id: string;
  username: string;
  email?: string;
  isAdmin?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private tokenKey = 'jwt_token';
  
  // Angular Signals for reactive state
  token = signal<string | null>(localStorage.getItem(this.tokenKey));
  currentUser = signal<User | null>(null);
  isDatabaseFallback = signal<boolean>(false);
  isAdmin = computed(() => this.currentUser()?.isAdmin === true);
  isLoggedIn = computed(() => this.token() !== null && this.currentUser() !== null);

  constructor(private http: HttpClient) {
    if (this.token()) {
      this.fetchProfile().subscribe({
        error: () => this.logout()
      });
    }
  }

  getAuthHeaders(): HttpHeaders {
    const t = this.token();
    return new HttpHeaders({
      'Authorization': t ? `Bearer ${t}` : ''
    });
  }

  fetchProfile(): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.get<{ user: User; isDatabaseFallback: boolean }>('/api/auth/me', { headers }).pipe(
      tap(res => {
        this.currentUser.set(res.user);
        this.isDatabaseFallback.set(res.isDatabaseFallback);
      }),
      catchError(err => {
        this.logout();
        return throwError(() => err);
      })
    );
  }

  login(username: string, password: string): Observable<any> {
    return this.http.post<{ token: string; user: User }>('/api/auth/login', { username, password }).pipe(
      tap(res => {
        localStorage.setItem(this.tokenKey, res.token);
        this.token.set(res.token);
        this.currentUser.set(res.user);
        this.fetchProfile().subscribe();
      })
    );
  }

  register(username: string, password: string, email: string): Observable<any> {
    return this.http.post<{ token: string; user: User }>('/api/auth/register', { username, password, email }).pipe(
      tap(res => {
        localStorage.setItem(this.tokenKey, res.token);
        this.token.set(res.token);
        this.currentUser.set(res.user);
        this.fetchProfile().subscribe();
      })
    );
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post('/api/auth/forgot-password', { email });
  }

  resetPassword(token: string, newPassword: string): Observable<any> {
    return this.http.post('/api/auth/reset-password', { token, newPassword });
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    this.token.set(null);
    this.currentUser.set(null);
    this.isDatabaseFallback.set(false);
  }
}
