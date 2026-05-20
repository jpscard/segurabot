export async function speakWithPuter(text: string): Promise<boolean> {
  try {
    const puter = (window as any).puter;
    if (!puter) {
      console.warn('Puter.js não foi carregado.');
      return false;
    }

    console.log('Tentando usar Puter TTS para:', text);
    
    // Tenta usar a voz neural "Camila" que é excelente em português
    const audio = await puter.ai.txt2speech(text, {
      voice: "Camila",
      language: "pt-BR",
      engine: "neural"
    });
    
    if (audio) {
      audio.play();
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Erro na API do Puter:', error);
    return false;
  }
}
