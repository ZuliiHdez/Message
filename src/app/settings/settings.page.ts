import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class SettingsPage implements OnInit {

  currentUser = { name: 'Usuario', username: '', photoUrl: '' };

  soundEnabled    = true;
  vibrationEnabled = false;
  selectedLanguage = 'en';

  constructor(private router: Router) {}

  ngOnInit() {
    const stored = localStorage.getItem('lastUser');
    if (stored) {
      const user = JSON.parse(stored);
      this.currentUser.name     = user.name     || 'Usuario';
      this.currentUser.photoUrl = user.photoUrl || '';
      this.currentUser.username = user.username || '';
    }
  }

  goBack() { this.router.navigate(['/home']); }
  goToProfile() { this.router.navigate(['/edit-profile']); }
}
