import { NativeModule, requireNativeModule } from "expo";

import {
    OverlayConfig,
    PaymentTransaction,
    SmsDebugInfo,
    TrackingDiagnostics,
    TrackoSmsModuleEvents,
} from "./TrackoSms.types";

declare class TrackoSmsModule extends NativeModule<TrackoSmsModuleEvents> {
  getPendingTransactions(): PaymentTransaction[];
  getOverlaySavedTransactions(): PaymentTransaction[];
  consumeLaunchTransaction(): PaymentTransaction | null;
  getLastSmsDebug(): SmsDebugInfo | null;
  getTrackingDiagnostics(): TrackingDiagnostics;
  markTransactionImported(id: string): void;
  setOverlayConfig(config: OverlayConfig): void;
  openOverlaySettings(): void;
  getOverlayPermissionStatus(): boolean;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<TrackoSmsModule>("TrackoSms");
