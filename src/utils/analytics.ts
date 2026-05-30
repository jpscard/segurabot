import { FirebaseAnalyticsRepository } from '../infrastructure/FirebaseAnalyticsRepository';
import { auth } from '../infrastructure/firebase';

// Helper to generate a simple unique ID
function generateUUID(): string {
  return 'sess-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
}

// Get or create unique session ID for current browser tab session
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server-session';
  
  let sessionId = sessionStorage.getItem('segurabot_session_id');
  if (!sessionId) {
    sessionId = generateUUID();
    sessionStorage.setItem('segurabot_session_id', sessionId);
  }
  return sessionId;
}

const analyticsRepo = new FirebaseAnalyticsRepository();

export async function trackAnalyticsEvent(eventType: 'page_view' | 'chat_click' | 'message_send' | 'conversion') {
  try {
    const sessionId = getSessionId();
    const userId = auth.currentUser?.uid || null;
    
    await analyticsRepo.track({
      eventType,
      sessionId,
      userId
    });
  } catch (error) {
    console.warn('Analytics tracking error (passive failure):', error);
  }
}
