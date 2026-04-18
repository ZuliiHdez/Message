import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from 'src/app/services/supabase.service';
import { LanguageService } from 'src/app/services/language.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ForgotPasswordPage {

  email = '';
  errorMsg = '';
  loading = false;
  emailSent = false;

  constructor(
    private router: Router,
    private supabase: SupabaseService,
    public lang: LanguageService
  ) {}

  async sendResetEmail() {
    this.errorMsg = '';

    if (!this.email.trim()) {
      this.errorMsg = this.lang.t('auth_err_email_enter');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
      this.errorMsg = this.lang.t('auth_err_email_invalid');
      return;
    }

    this.loading = true;

    const { error } = await this.supabase.getClient().auth.resetPasswordForEmail(
      this.email,
      {

        redirectTo: 'http://localhost:8100/reset-password'
      }
    );

    this.loading = false;

    if (error) {
      this.errorMsg = this.lang.t('auth_err_generic');
      console.error('Error reset password:', error.message);
      return;
    }

    this.emailSent = true;
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}