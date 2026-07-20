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

export type TrackoSmsViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};
