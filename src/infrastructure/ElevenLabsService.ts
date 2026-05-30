import { audioManager } from '../utils/audioManager';

export async function speakWithElevenLabs(text: string, customApiKey?: string, customVoiceId?: string): Promise<boolean> {
  // Em um ambiente real, essa chave NÃO deve ficar no front-end.
  // Ela deve ser acessada via um endpoint de backend para segurança.
  const apiKey = customApiKey || import.meta.env.VITE_ELEVENLABS_API_KEY;
  
  // ID da voz (Padrão: Rachel, uma voz feminina boa para assistentes)
  // Você pode trocar por qualquer ID de voz do ElevenLabs
  const voiceId = customVoiceId || import.meta.env.VITE_ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; 

  if (!apiKey) {
    console.warn('ElevenLabs API Key não configurada. Usando fallback nativo.');
    return false;
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2', // Suporta português
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      console.error('Erro na API do ElevenLabs:', await response.text());
      return false;
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audioManager.setActiveAudio(audio);
    
    return new Promise((resolve) => {
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
      audio.play().catch((err) => {
        console.error('Erro ao reproduzir áudio do ElevenLabs:', err);
        resolve(false);
      });
    });
  } catch (error) {
    console.error('Erro na integração com ElevenLabs:', error);
    return false;
  }
}
