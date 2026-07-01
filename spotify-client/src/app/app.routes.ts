import { Routes } from '@angular/router';
import { HomeViewComponent } from './views/home-view/home-view.component';
import { SearchViewComponent } from './views/search-view/search-view.component';
import { LikedViewComponent } from './views/liked-view/liked-view.component';
import { PlaylistDetailViewComponent } from './views/playlist-detail-view/playlist-detail-view.component';
import { AuthViewComponent } from './views/auth-view/auth-view.component';
import { AdminViewComponent } from './views/admin-view/admin-view.component';

export const routes: Routes = [
  { path: '', component: HomeViewComponent },
  { path: 'search', component: SearchViewComponent },
  { path: 'liked', component: LikedViewComponent },
  { path: 'playlist/:id', component: PlaylistDetailViewComponent },
  { path: 'auth', component: AuthViewComponent },
  { path: 'admin', component: AdminViewComponent },
  { path: '**', redirectTo: '' }
];
