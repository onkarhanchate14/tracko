import * as React from 'react';

import { TrackoSmsViewProps } from './TrackoSms.types';

export default function TrackoSmsView(props: TrackoSmsViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
