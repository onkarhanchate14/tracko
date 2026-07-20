import { requireNativeView } from 'expo';
import * as React from 'react';

import { TrackoSmsViewProps } from './TrackoSms.types';

const NativeView: React.ComponentType<TrackoSmsViewProps> =
  requireNativeView('TrackoSms');

export default function TrackoSmsView(props: TrackoSmsViewProps) {
  return <NativeView {...props} />;
}
