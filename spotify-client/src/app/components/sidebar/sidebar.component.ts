import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApiService, Playlist } from '../../services/api.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  constructor(
    public authService: AuthService,
    public apiService: ApiService,
    private router: Router
  ) {}

  createPlaylist(): void {
    if (!this.authService.token()) {
      this.router.navigate(['/auth']);
      return;
    }

    const playlistName = prompt('Enter playlist name:');
    if (playlistName && playlistName.trim()) {
      this.apiService.createPlaylist(playlistName).subscribe();
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
