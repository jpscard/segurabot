import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirebaseAnalyticsRepository } from './FirebaseAnalyticsRepository';
import { getDocs, addDoc } from 'firebase/firestore';

vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn().mockReturnValue({ id: 'collection-analytics' }),
    addDoc: vi.fn(),
    getDocs: vi.fn()
  };
});

vi.mock('./firebase', () => {
  return {
    db: {},
    auth: { currentUser: { uid: 'user123' } }
  };
});

describe('FirebaseAnalyticsRepository', () => {
  let repository: FirebaseAnalyticsRepository;

  beforeEach(() => {
    repository = new FirebaseAnalyticsRepository();
    vi.clearAllMocks();
  });

  it('track should call addDoc with correct data', async () => {
    const mockEvent = {
      eventType: 'page_view' as const,
      sessionId: 'sess-123',
      userId: 'user123'
    };

    await repository.track(mockEvent);

    expect(addDoc).toHaveBeenCalled();
    const calledData = vi.mocked(addDoc).mock.calls[0][1] as any;
    expect(calledData.eventType).toBe('page_view');
    expect(calledData.sessionId).toBe('sess-123');
    expect(calledData.userId).toBe('user123');
    expect(calledData.timestamp).toBeDefined();
  });

  it('getSummary should fetch all events and compute stats correctly', async () => {
    // We will simulate 4 sessions:
    // Session A: page_view only (Bounce)
    // Session B: page_view, chat_click, message_send (Engagement, Message)
    // Session C: page_view, chat_click, conversion (Engagement, Conversion)
    // Session D: page_view only (Bounce)
    
    const mockDocs = [
      // Session A
      { id: '1', data: () => ({ eventType: 'page_view', sessionId: 'sess-A', timestamp: '2026-05-25T10:00:00.000Z' }) },
      
      // Session B
      { id: '2', data: () => ({ eventType: 'page_view', sessionId: 'sess-B', timestamp: '2026-05-25T10:01:00.000Z' }) },
      { id: '3', data: () => ({ eventType: 'chat_click', sessionId: 'sess-B', timestamp: '2026-05-25T10:02:00.000Z' }) },
      { id: '4', data: () => ({ eventType: 'message_send', sessionId: 'sess-B', timestamp: '2026-05-25T10:03:00.000Z' }) },
      
      // Session C
      { id: '5', data: () => ({ eventType: 'page_view', sessionId: 'sess-C', timestamp: '2026-05-25T10:04:00.000Z' }) },
      { id: '6', data: () => ({ eventType: 'chat_click', sessionId: 'sess-C', timestamp: '2026-05-25T10:05:00.000Z' }) },
      { id: '7', data: () => ({ eventType: 'conversion', sessionId: 'sess-C', timestamp: '2026-05-25T10:06:00.000Z' }) },
      
      // Session D
      { id: '8', data: () => ({ eventType: 'page_view', sessionId: 'sess-D', timestamp: '2026-05-25T10:07:00.000Z' }) }
    ];

    vi.mocked(getDocs).mockResolvedValue({
      forEach: (callback: any) => mockDocs.forEach(callback)
    } as any);

    const summary = await repository.getSummary();

    expect(getDocs).toHaveBeenCalled();
    // Unique Visitors: A, B, C, D = 4
    expect(summary.totalVisitors).toBe(4);
    
    // Chat clicks: B, C = 2
    expect(summary.chatClicks).toBe(2);
    
    // Message sends: B = 1
    expect(summary.messageSends).toBe(1);
    
    // Conversions: C = 1
    expect(summary.conversions).toBe(1);
    
    // Bounces: A, D = 2 (out of 4 total sessions = 50%)
    expect(summary.bounceRate).toBe(50);
    
    // Sorted events by timestamp descending (newest first):
    // newest is event 8 (Session D page_view 10:07)
    expect(summary.eventsList[0].id).toBe('8');
    // oldest is event 1 (Session A page_view 10:00)
    expect(summary.eventsList[summary.eventsList.length - 1].id).toBe('1');
  });
});
