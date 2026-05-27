import { AnalyticsEvent, AnalyticsSummary } from './index';

export interface IAnalyticsRepository {
  track(event: Omit<AnalyticsEvent, 'id' | 'timestamp'>): Promise<void>;
  getSummary(): Promise<AnalyticsSummary>;
}
