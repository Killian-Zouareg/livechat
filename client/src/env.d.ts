/// <reference types="vite/client" />

import type { BridgeApi, OverlayBridgeApi } from '../electron/preload';

declare global {
  const __APP_VERSION__: string;
  interface Window {
    api: BridgeApi;
    overlayApi: OverlayBridgeApi;
  }
}

export {};
