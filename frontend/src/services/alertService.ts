// @ts-nocheck
import type { Alert } from '../types';

// Mocked alert service. Swap fetch calls to real API when ready.
export const alertService = {
  list(): Alert[] {
    // In-memory mock: real impl will be `return apiFetch('/api/alerts')`
    return [];
  },
  async acknowledge(_id: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 250));
  },
  async resolve(_id: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 250));
  },
};
