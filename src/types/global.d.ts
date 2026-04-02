import type { ProcessToolApi } from '../../shared/process';

declare global {
  interface Window {
    processQuery: ProcessToolApi;
  }
}

export {};

