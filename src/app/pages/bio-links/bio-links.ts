import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-bio-links',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './bio-links.html',
  styleUrls: ['./bio-links.scss']
})
export class BioLinksComponent {
  private readonly storeNumber = '5571993863039';

  getHumanLink(): string {
    const text = 'Olá! Preciso falar com um atendente humano da loja, por favor.';
    return `https://wa.me/${this.storeNumber}?text=${encodeURIComponent(text)}`;
  }
}
