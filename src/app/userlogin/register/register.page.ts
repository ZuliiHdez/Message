import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { LanguageService } from '../../services/language.service';


@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class RegisterComponent {

  form = {
    nombre: '',
    fechaNacimiento: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  };

  errors: any = {};
  showPassword        = false;
  showConfirmPassword = false;
  loading             = false;
  passwordTouched     = false;

  constructor(private router: Router, private supabase: SupabaseService, public lang: LanguageService) {}

  get pwdRules() {
    const p = this.form.password;
    return {
      length:  p.length >= 8,
      upper:   /[A-Z]/.test(p),
      lower:   /[a-z]/.test(p),
      number:  /[0-9]/.test(p),
      special: /[^A-Za-z0-9]/.test(p),
    };
  }

  get pwdValid() {
    const r = this.pwdRules;
    return r.length && r.upper && r.lower && r.number && r.special;
  }

  clearError(field: string) {
    this.errors[field] = null;
  }

  onPasswordChange() {
    this.passwordTouched = true;
    this.clearError('password');
  }

  validate(): boolean {
    this.errors = {};

    if (!this.form.nombre.trim())
      this.errors.nombre = this.lang.t('auth_err_name_required');

    if (!this.form.fechaNacimiento)
      this.errors.fechaNacimiento = this.lang.t('auth_err_dob_required');

    if (!this.form.username.trim())
      this.errors.username = this.lang.t('auth_err_username_required');
    else if (this.form.username.length < 3)
      this.errors.username = this.lang.t('auth_err_username_min');

    if (!this.form.email.trim())
      this.errors.email = this.lang.t('auth_err_email_required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email))
      this.errors.email = this.lang.t('auth_err_email_invalid');

    if (!this.form.password)
      this.errors.password = this.lang.t('auth_err_password_required');
    else if (!this.pwdValid)
      this.errors.password = this.lang.t('auth_err_password_weak');

    if (!this.form.confirmPassword)
      this.errors.confirmPassword = this.lang.t('auth_err_confirm_required');
    else if (this.form.password !== this.form.confirmPassword)
      this.errors.confirmPassword = this.lang.t('auth_err_passwords_mismatch');

    return Object.keys(this.errors).length === 0;
  }

async register() {
  if (!this.validate()) return;
  this.loading = true;

  const { data, error } = await this.supabase.register(
    this.form.email,
    this.form.password,
    {
      username: this.form.username,
      full_name: this.form.nombre.trim()
    }
  );

  if (error) {
    if (error.message.includes('already registered')) {
      this.errors.email = this.lang.t('auth_err_email_taken');
    } else {
      this.errors.email = this.lang.t('auth_err_generic');
    }
    this.loading = false;
    return;
  }

  this.loading = false;
  this.router.navigate(['/login']);
}
  goToLogin() {
    this.router.navigate(['/login']);
  }
}
