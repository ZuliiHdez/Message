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
  email: string = '';
  password: string = '';
  showPassword: boolean = false;

  constructor(private router: Router, private supabase: SupabaseService) {}

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

async login() {
  if (!this.email || !this.password) return;

  const { data, error } = await this.supabase.login(this.email, this.password);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

const userId = data.user?.id;

const { data: profile, error: profileError } = await this.supabase.getClient()
  .from('profiles')
  .select('full_name, status, avatar_url')
  .eq('id', userId)
  .maybeSingle(); 

console.log('Profile:', profile);
console.log('Profile error:', profileError);

  localStorage.setItem('lastUser', JSON.stringify({
    name: profile?.full_name || data.user?.email,
    email: data.user?.email,
    photoUrl: profile?.avatar_url || '',
    status: profile?.status || 'Hey, estoy usando Orion'
  }));

  this.router.navigate(['/home']);
}


  goToRegister() {
    this.router.navigate(['/register']);
    }

    goToForgotPassword() {
  this.router.navigate(['/forgot-password']);
}
}