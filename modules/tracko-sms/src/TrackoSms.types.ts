import type { StyleProp, ViewStyle } from 'react-native';

export type OnLoadEventPayload = {
  url: string;
};

export type TrackoSmsModuleEvents = {
  onPaymentReceived: (params: PaymentTransaction) => void;
};

export type PaymentTransaction = {
  id: string;
  merchant: string;
  amount: number;
  category: string;
  bank: string | null;
  occurredAt: string;
  status: string;
};

export type SmsDebugInfo = {
  receivedAt: string;
  sender: string | null;
  body: string;
  status: string;
  parsed: boolean;
  merchant: string | null;
  amount: number | null;
  category: string | null;
};

export type TrackingDiagnostics = {
  nativeModuleReady: boolean;
  overlayPermissionGranted: boolean;
  pendingCount: number;
  lastSms: SmsDebugInfo | null;
};

export type TrackoSmsViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};
