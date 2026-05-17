import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {

  private _isDark = false;

  get isDark(): boolean { return this._isDark; }

  constructor() {
    const saved = localStorage.getItem('theme');
    if (saved) {
      this._isDark = saved === 'dark';
    } else {
      this._isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    this.apply();
  }

  toggle() {
    this._isDark = !this._isDark;
    localStorage.setItem('theme', this._isDark ? 'dark' : 'light');
    this.apply();
  }

  private apply() {
    const html = document.documentElement;
    if (this._isDark) {
      html.classList.add('dark');
      html.classList.remove('light');
    } else {
      html.classList.add('light');
      html.classList.remove('dark');
    }
  }
}
