import { registerWebModule, NativeModule } from 'expo';

import { PaymentTransaction, SmsDebugInfo, TrackoSmsModuleEvents, TrackingDiagnostics } from './TrackoSms.types';

class TrackoSmsModule extends NativeModule<TrackoSmsModuleEvents> {
  getPendingTransactions(): PaymentTransaction[] { return []; }
  getOverlaySavedTransactions(): PaymentTransaction[] { return []; }
  consumeLaunchTransaction(): PaymentTransaction | null { return null; }
  getLastSmsDebug(): SmsDebugInfo | null { return null; }
  getTrackingDiagnostics(): TrackingDiagnostics {
    return {
      nativeModuleReady: false,
      overlayPermissionGranted: false,
      pendingCount: 0,
      lastSms: null,
    };
  }
  markTransactionImported(_id: string): void {}
  openOverlaySettings(): void {}
  getOverlayPermissionStatus(): boolean { return false; }
}

export default registerWebModule(TrackoSmsModule, 'TrackoSmsModule');
