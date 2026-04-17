import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';


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
    apellido: '',
    fechaNacimiento: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  };

  errors: any = {};
  showPassword = false;
  showConfirmPassword = false;
  loading = false;

  constructor(private router: Router, private supabase: SupabaseService) {}

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  clearError(field: string) {
    this.errors[field] = null;
  }

  validate(): boolean {
    this.errors = {};

    if (!this.form.nombre.trim())
      this.errors.nombre = 'El nombre es obligatorio';

    if (!this.form.apellido.trim())
      this.errors.apellido = 'El apellido es obligatorio';

    if (!this.form.fechaNacimiento)
      this.errors.fechaNacimiento = 'La fecha de nacimiento es obligatoria';

    if (!this.form.username.trim())
      this.errors.username = 'El nombre de usuario es obligatorio';
    else if (this.form.username.length < 3)
      this.errors.username = 'Mínimo 3 caracteres';

    if (!this.form.email.trim())
      this.errors.email = 'El email es obligatorio';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email))
      this.errors.email = 'Email no válido';

    if (!this.form.password)
      this.errors.password = 'La contraseña es obligatoria';
    else if (this.form.password.length < 6)
      this.errors.password = 'Mínimo 6 caracteres';

    if (!this.form.confirmPassword)
      this.errors.confirmPassword = 'Confirma tu contraseña';
    else if (this.form.password !== this.form.confirmPassword)
      this.errors.confirmPassword = 'Las contraseñas no coinciden';

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
      full_name: `${this.form.nombre} ${this.form.apellido}`
    }
  );

  if (error) {
    if (error.message.includes('already registered')) {
      this.errors.email = 'Este email ya está registrado';
    } else {
      this.errors.email = error.message;
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
