import { Fragment } from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';

import { fonts } from '@/theme/tokens';

/** Renders **bold** segments in a message body. Other characters show as written. */
export function RichText({
  text,
  style,
  numberOfLines,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) => {
        const bold = part.startsWith('**') && part.endsWith('**') && part.length > 4;
        return bold ? (
          <Fragment key={i}>
            <Text style={{ fontFamily: fonts.bold }}>{part.slice(2, -2)}</Text>
          </Fragment>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        );
      })}
    </Text>
  );
}
