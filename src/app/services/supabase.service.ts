import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;
  private supabaseAdmin: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabaseURL,
      environment.supabaseKey,
      { auth: { persistSession: true, detectSessionInUrl: false } }
    );

    this.supabaseAdmin = createClient(
      environment.supabaseURL,
      environment.supabaseServiceKey
    );
  }

async register(email: string, password: string, metadata: { username: string, full_name: string }) {
  return await this.supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: metadata.username,
        full_name: metadata.full_name,
      }
    }
  });
}

  async login(email: string, password: string) {
    return await this.supabase.auth.signInWithPassword({ email, password });
  }

  async logout() {
    return await this.supabase.auth.signOut();
  }

  async getSession() {
    return await this.supabase.auth.getSession();
  }

  getClient()      { return this.supabase; }
  getAdminClient() { return this.supabaseAdmin; }
}
