/// <reference types="vite/client" />

import type { BridgeApi, OverlayBridgeApi } from '../electron/preload';

declare global {
  interface Window {
    api: BridgeApi;
    overlayApi: OverlayBridgeApi;
  }
}

export {};
