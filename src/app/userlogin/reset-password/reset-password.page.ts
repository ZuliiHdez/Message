import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from 'src/app/services/supabase.service';

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
    private supabase: SupabaseService
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
    const map: any = { weak: 'Débil', medium: 'Media', strong: 'Fuerte' };
    return map[this.strengthClass];
  }

  get strengthWidth(): string {
    const map: any = { weak: '33%', medium: '66%', strong: '100%' };
    return map[this.strengthClass];
  }

  validate(): boolean {
    this.errors = {};

    if (!this.password)
      this.errors.password = 'Introduce una contraseña';
    else if (this.password.length < 6)
      this.errors.password = 'Mínimo 6 caracteres';

    if (!this.confirmPassword)
      this.errors.confirmPassword = 'Confirma tu contraseña';
    else if (this.password !== this.confirmPassword)
      this.errors.confirmPassword = 'Las contraseñas no coinciden';

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
      this.errors.password = 'Error al actualizar la contraseña. El enlace puede haber expirado.';
      console.error('Error reset:', error.message);
      return;
    }

    this.passwordChanged = true;
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}