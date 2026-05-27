import { collection, addDoc, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { AnalyticsEvent, AnalyticsSummary } from '../domain';
import { IAnalyticsRepository } from '../domain/IAnalyticsRepository';

export class FirebaseAnalyticsRepository implements IAnalyticsRepository {
  async track(event: Omit<AnalyticsEvent, 'id' | 'timestamp'>): Promise<void> {
    try {
      const analyticsRef = collection(db, 'analytics');
      await addDoc(analyticsRef, {
        ...event,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error tracking analytics event:', error);
    }
  }

  async getSummary(): Promise<AnalyticsSummary> {
    try {
      const analyticsRef = collection(db, 'analytics');
      const snapshot = await getDocs(analyticsRef);

      const events: AnalyticsEvent[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        events.push({
          id: doc.id,
          eventType: data.eventType,
          sessionId: data.sessionId,
          userId: data.userId,
          timestamp: data.timestamp || new Date().toISOString()
        });
      });

      // Sort events by timestamp descending in-memory to avoid index requirement
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Track unique sessions per event type
      const uniqueSessions = new Set<string>();
      const chatClickSessions = new Set<string>();
      const messageSendSessions = new Set<string>();
      const conversionSessions = new Set<string>();

      // Group event types by sessionId
      const sessionEvents = new Map<string, string[]>();

      events.forEach(e => {
        uniqueSessions.add(e.sessionId);
        if (e.eventType === 'chat_click') chatClickSessions.add(e.sessionId);
        if (e.eventType === 'message_send') messageSendSessions.add(e.sessionId);
        if (e.eventType === 'conversion') conversionSessions.add(e.sessionId);

        if (!sessionEvents.has(e.sessionId)) {
          sessionEvents.set(e.sessionId, []);
        }
        sessionEvents.get(e.sessionId)!.push(e.eventType);
      });

      // Calculate Bounce Rate:
      // Bounce = Sessions that only contain 'page_view' (no chat_click, message_send, or conversion)
      let bounceCount = 0;
      sessionEvents.forEach((types) => {
        const hasInteractions = types.some(t => t === 'chat_click' || t === 'message_send' || t === 'conversion');
        if (!hasInteractions) {
          bounceCount++;
        }
      });

      const totalVisitors = uniqueSessions.size;
      const bounceRate = totalVisitors > 0 ? Math.round((bounceCount / totalVisitors) * 100) : 0;

      return {
        totalVisitors,
        chatClicks: chatClickSessions.size,
        messageSends: messageSendSessions.size,
        conversions: conversionSessions.size,
        bounceRate,
        eventsList: events // Return all events for client-side filtering
      };
    } catch (error) {
      console.error('Error fetching analytics summary:', error);
      return {
        totalVisitors: 0,
        chatClicks: 0,
        messageSends: 0,
        conversions: 0,
        bounceRate: 0,
        eventsList: []
      };
    }
  }
}
