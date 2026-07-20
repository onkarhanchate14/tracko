import { registerWebModule, NativeModule } from 'expo';

import { PaymentTransaction, TrackoSmsModuleEvents } from './TrackoSms.types';

class TrackoSmsModule extends NativeModule<TrackoSmsModuleEvents> {
  getPendingTransactions(): PaymentTransaction[] { return []; }
  getOverlaySavedTransactions(): PaymentTransaction[] { return []; }
  consumeLaunchTransaction(): PaymentTransaction | null { return null; }
  markTransactionImported(_id: string): void {}
  openOverlaySettings(): void {}
  getOverlayPermissionStatus(): boolean { return false; }
}

export default registerWebModule(TrackoSmsModule, 'TrackoSmsModule');
