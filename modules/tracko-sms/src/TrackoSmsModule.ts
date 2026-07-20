import { NativeModule, requireNativeModule } from 'expo';

import { PaymentTransaction, SmsDebugInfo, TrackoSmsModuleEvents, TrackingDiagnostics } from './TrackoSms.types';

declare class TrackoSmsModule extends NativeModule<TrackoSmsModuleEvents> {
  getPendingTransactions(): PaymentTransaction[];
  getOverlaySavedTransactions(): PaymentTransaction[];
  consumeLaunchTransaction(): PaymentTransaction | null;
  getLastSmsDebug(): SmsDebugInfo | null;
  getTrackingDiagnostics(): TrackingDiagnostics;
  markTransactionImported(id: string): void;
  openOverlaySettings(): void;
  getOverlayPermissionStatus(): boolean;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<TrackoSmsModule>('TrackoSms');
