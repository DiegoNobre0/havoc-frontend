import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  // 👉 Caminho para o seu arquivo na pasta assets
  private notificationSound = new Audio('/sounds/notification.mp3');

 playNovaMensagem() {
    // Tente sem a barra inicial se com a barra deu 404
    const audio = new Audio('sounds/notification.mp3'); 
    audio.volume = 0.5;
    
    audio.play()
      .then(() => console.log('🔊 Som tocado com sucesso!'))
      .catch(err => console.error('🔇 Erro ao tocar som:', err));
  }
}