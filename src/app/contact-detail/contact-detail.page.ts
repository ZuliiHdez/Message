import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { LanguageService } from '../services/language.service';

@Component({
  selector: 'app-contact-detail',
  templateUrl: './contact-detail.page.html',
  styleUrls: ['./contact-detail.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class ContactDetailPage implements OnInit {

  contact = {
    id: '',
    name: '',
    bio: '',
    status: 'offline' as 'online' | 'away' | 'busy' | 'offline',
    color: '#4a9fd4',
    photo: '',
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    public lang: LanguageService,
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(p => {
      this.contact.id     = p['id']     || '';
      this.contact.name   = p['name']   || '';
      this.contact.bio    = p['bio']    || '';
      this.contact.status = p['status'] || 'offline';
      this.contact.color  = p['color']  || '#4a9fd4';
      this.contact.photo  = p['photo']  || '';
    });
  }

  getStatusLabel(s: string): string {
    const map: Record<string, string> = {
      online:  this.lang.t('status_online'),
      away:    this.lang.t('status_away'),
      busy:    this.lang.t('status_busy'),
      offline: this.lang.t('status_offline'),
    };
    return map[s] || this.lang.t('status_offline');
  }

  goBack() {
    this.location.back();
  }

  openChat() {
    this.router.navigate(['/chat'], {
      queryParams: {
        id:     this.contact.id,
        name:   this.contact.name,
        bio:    this.contact.bio,
        color:  this.contact.color,
        photo:  this.contact.photo,
        status: this.contact.status,
      },
    });
  }
}
