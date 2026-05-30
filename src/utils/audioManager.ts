let activeAudio: HTMLAudioElement | any | null = null;

export const audioManager = {
  // Define o áudio atualmente em reprodução, pausando qualquer anterior
  setActiveAudio(audio: any) {
    this.stopActiveAudio();
    activeAudio = audio;
  },

  // Pausa qualquer áudio registrado e cancela a síntese nativa
  stopActiveAudio() {
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      } catch (err) {
        console.error("Erro ao pausar o áudio ativo:", err);
      }
      activeAudio = null;
    }
    
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        console.error("Erro ao cancelar síntese de voz:", err);
      }
    }
  }
};
