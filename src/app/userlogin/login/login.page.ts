import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from 'src/app/services/supabase.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class LoginComponent {
  email        = '';
  password     = '';
  showPassword = false;
  rememberMe   = false;
  loading      = false;
  errorMsg     = '';

  constructor(private router: Router, private supabase: SupabaseService) {}

  async login() {
    if (!this.email || !this.password) {
      this.errorMsg = 'Please fill in all fields';
      return;
    }

    this.loading  = true;
    this.errorMsg = '';

    const { data, error } = await this.supabase.login(this.email, this.password);

    if (error) {
      if (error.message.includes('Email not confirmed')) {
        this.errorMsg = 'Please confirm your email before signing in';
      } else if (error.message.includes('Invalid login')) {
        this.errorMsg = 'Invalid email or password';
      } else {
        this.errorMsg = error.message;
      }
      this.loading = false;
      return;
    }

    const { data: profile } = await this.supabase.getClient()
      .from('profiles')
      .select('full_name, status, avatar_url')
      .eq('id', data.user?.id)
      .maybeSingle();

    localStorage.setItem('lastUser', JSON.stringify({
      name:     profile?.full_name || data.user?.email,
      email:    data.user?.email,
      photoUrl: profile?.avatar_url || '',
      status:   profile?.status || 'Hey, I\'m using Orion'
    }));

    this.loading = false;
    this.router.navigate(['/home']);
  }

  goToForgot() {
    this.router.navigate(['/forgot-password']);
  }

  goToRegister() {
    this.router.navigate(['/register']);
  }
}
