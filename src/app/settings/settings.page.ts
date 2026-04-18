import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { LanguageService, Lang } from '../services/language.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class SettingsPage implements OnInit {

  currentUser = { name: 'Usuario', username: '', photoUrl: '' };

  soundEnabled     = true;
  vibrationEnabled = false;
  showLangDropdown = false;

  readonly languages: { value: Lang; code: string; label: string }[] = [
    { value: 'en', code: 'us', label: 'English' },
    { value: 'es', code: 'es', label: 'Español' },
    { value: 'fr', code: 'fr', label: 'Français' },
    { value: 'de', code: 'de', label: 'Deutsch' },
  ];

  constructor(private router: Router, public lang: LanguageService) {}

  get selectedLanguage(): Lang { return this.lang.lang; }

  get currentLangOption() {
    return this.languages.find(l => l.value === this.lang.lang) ?? this.languages[0];
  }

  flagClass(code: string) { return `fi fi-${code}`; }

  toggleLangDropdown() { this.showLangDropdown = !this.showLangDropdown; }

  selectLanguage(lang: Lang) {
    this.lang.setLanguage(lang);
    this.showLangDropdown = false;
  }

  ngOnInit() {
    const stored = localStorage.getItem('lastUser');
    if (stored) {
      const user = JSON.parse(stored);
      this.currentUser.name     = user.name     || 'Usuario';
      this.currentUser.photoUrl = user.photoUrl || '';
      this.currentUser.username = user.username || '';
    }
  }

  onLanguageChange(lang: Lang) {
    this.lang.setLanguage(lang);
  }

  goBack()      { this.router.navigate(['/home']); }
  goToProfile() { this.router.navigate(['/edit-profile']); }
}
