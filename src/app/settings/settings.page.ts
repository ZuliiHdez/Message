import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { LanguageService, Lang } from '../services/language.service';
import { BuzzService } from '../services/buzz.service';

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
  buzzEnabled      = true;

  readonly languages: { value: Lang; code: string; label: string }[] = [
    { value: 'en', code: 'us', label: 'English' },
    { value: 'es', code: 'es', label: 'Español' },
    { value: 'fr', code: 'fr', label: 'Français' },
    { value: 'de', code: 'de', label: 'Deutsch' },
  ];

  constructor(
    private router: Router,
    public lang: LanguageService,
    public buzzService: BuzzService
  ) {}

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
    this.buzzEnabled = this.buzzService.isEnabled();
  }

  onBuzzToggle(val: boolean) {
    this.buzzService.setEnabled(val);
  }

  onCustomBuzzSelected(event: any) {
    const file: File | undefined = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.buzzService.setCustomSound(e.target.result as string, file.name);
    };
    reader.readAsDataURL(file);
  }

  resetBuzzSound() {
    this.buzzService.setCustomSound(null);
  }

  onLanguageChange(lang: Lang) {
    this.lang.setLanguage(lang);
  }

  goBack()      { this.router.navigate(['/home']); }
  goToProfile() { this.router.navigate(['/edit-profile']); }
}
