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
  
  // Substitua pelos números reais da Havoc
  private botNumber = '5571981214680'; // Número da IA (Autoatendimento)
  private humanNumber = '5571993863039'; // Número da Loja (Humanos)

  getBotLink(): string {
    const text = 'Olá! Gostaria fazer um pedido.';
    return `https://wa.me/${this.botNumber}?text=${encodeURIComponent(text)}`;
  }

  getHumanLink(): string {
    const text = 'Olá! Preciso falar com um atendente humano da loja, por favor.';
    return `https://wa.me/${this.humanNumber}?text=${encodeURIComponent(text)}`;
  }
}