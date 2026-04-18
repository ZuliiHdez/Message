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
      this.errors.nombre = 'Name is required';

    if (!this.form.fechaNacimiento)
      this.errors.fechaNacimiento = 'Date of birth is required';

    if (!this.form.username.trim())
      this.errors.username = 'Username is required';
    else if (this.form.username.length < 3)
      this.errors.username = 'Minimum 3 characters';

    if (!this.form.email.trim())
      this.errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email))
      this.errors.email = 'Invalid email';

    if (!this.form.password)
      this.errors.password = 'Password is required';
    else if (this.form.password.length < 6)
      this.errors.password = 'Minimum 6 characters';

    if (!this.form.confirmPassword)
      this.errors.confirmPassword = 'Confirm your password';
    else if (this.form.password !== this.form.confirmPassword)
      this.errors.confirmPassword = 'Passwords do not match';

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
      this.errors.email = 'This email is already registered';
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
