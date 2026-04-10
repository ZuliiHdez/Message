// peticiones.page.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { FriendshipService } from '../services/friendship.service';

@Component({
  selector: 'app-peticiones',
  templateUrl: './peticiones.page.html',
  styleUrls: ['./peticiones.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class PeticionesPage implements OnInit {

  requests: any[] = [];
  loading = false;
  processingIds: string[] = [];

  private colors = ['#27ae60','#2980b9','#8e44ad','#e67e22','#c0392b','#16a085','#d35400'];

  constructor(
    private router: Router,
    private friendshipService: FriendshipService
  ) {}

  async ngOnInit() {
    await this.loadRequests();
  }

  async loadRequests() {
    this.loading = true;
    try {
      this.requests = await this.friendshipService.getPendingRequests();
    } catch (e) {
      console.error('Error cargando peticiones:', e);
    } finally {
      this.loading = false;
    }
  }

  async accept(req: any) {
    this.processingIds.push(req.id);
    try {
      await this.friendshipService.acceptRequest(req.id);
      // Quitar de la lista
      this.requests = this.requests.filter(r => r.id !== req.id);
    } catch (e) {
      console.error('Error aceptando petición:', e);
    } finally {
      this.processingIds = this.processingIds.filter(id => id !== req.id);
    }
  }

  async reject(req: any) {
    this.processingIds.push(req.id);
    try {
      await this.friendshipService.rejectRequest(req.id);
      this.requests = this.requests.filter(r => r.id !== req.id);
    } catch (e) {
      console.error('Error rechazando petición:', e);
    } finally {
      this.processingIds = this.processingIds.filter(id => id !== req.id);
    }
  }

  getAvatarColor(userId: string): string {
    const index = userId.charCodeAt(0) % this.colors.length;
    return this.colors[index];
  }

  goBack() {
    this.router.navigate(['/home']);
  }
}
