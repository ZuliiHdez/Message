import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from 'src/app/services/supabase.service';
import { LanguageService } from 'src/app/services/language.service';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.page.html',
  styleUrls: ['./reset-password.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ResetPasswordPage implements OnInit {

  password = '';
  confirmPassword = '';
  showPassword = false;
  showConfirmPassword = false;
  loading = false;
  passwordChanged = false;
  errors: any = {};

  constructor(
    private router: Router,
    private supabase: SupabaseService,
    public lang: LanguageService
  ) {}

  ngOnInit() {
    this.supabase.getClient().auth.onAuthStateChange((event: any) => {
      if (event === 'PASSWORD_RECOVERY') {
        console.log('Sesión de recuperación activa');
      }
    });
  }

  get strengthClass(): string {
    const p = this.password;
    if (p.length < 6) return 'weak';
    const hasUpper = /[A-Z]/.test(p);
    const hasNumber = /[0-9]/.test(p);
    const hasSpecial = /[^A-Za-z0-9]/.test(p);
    const score = [hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
    if (score >= 2 && p.length >= 8) return 'strong';
    return 'medium';
  }

  get strengthLabel(): string {
    const map: any = {
      weak:   this.lang.t('auth_strength_weak'),
      medium: this.lang.t('auth_strength_medium'),
      strong: this.lang.t('auth_strength_strong'),
    };
    return map[this.strengthClass];
  }

  get strengthWidth(): string {
    const map: any = { weak: '33%', medium: '66%', strong: '100%' };
    return map[this.strengthClass];
  }

  validate(): boolean {
    this.errors = {};

    if (!this.password)
      this.errors.password = this.lang.t('auth_err_password_enter');
    else if (this.password.length < 6)
      this.errors.password = this.lang.t('auth_err_password_min');

    if (!this.confirmPassword)
      this.errors.confirmPassword = this.lang.t('auth_err_confirm_required');
    else if (this.password !== this.confirmPassword)
      this.errors.confirmPassword = this.lang.t('auth_err_passwords_mismatch');

    return Object.keys(this.errors).length === 0;
  }

  async resetPassword() {
    if (!this.validate()) return;
    this.loading = true;

    const { error } = await this.supabase.getClient().auth.updateUser({
      password: this.password
    });

    this.loading = false;

    if (error) {
      this.errors.password = this.lang.t('auth_err_link_expired');
      console.error('Error reset:', error.message);
      return;
    }

    this.passwordChanged = true;
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}