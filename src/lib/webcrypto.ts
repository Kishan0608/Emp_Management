import * as ExpoCrypto from 'expo-crypto';
import { Platform } from 'react-native';

/**
 * React Native has no WebCrypto, TextEncoder or btoa on every runtime. Supabase's PKCE sign-in
 * needs all three, and without them it silently falls back to an unhashed code challenge.
 * These are backed by expo-crypto (native SHA-256 and cryptographically secure random bytes).
 * Browsers provide all of them already and window.crypto is read-only there, so this is native only.
 */
const scope = globalThis as unknown as {
  crypto?: Crypto;
  TextEncoder?: typeof TextEncoder;
  btoa?: (input: string) => string;
};

const isNative = Platform.OS !== 'web';

if (isNative && typeof scope.crypto?.subtle === 'undefined') {
  scope.crypto = {
    getRandomValues: ExpoCrypto.getRandomValues,
    subtle: {
      digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
        const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
        if (name !== 'SHA-256') throw new Error(`Unsupported digest algorithm: ${name}`);
        return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
      },
    },
  } as unknown as Crypto;
}

if (isNative && typeof scope.TextEncoder === 'undefined') {
  class Utf8Encoder {
    encode(input = ''): Uint8Array {
      const binary = unescape(encodeURIComponent(input));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
  }
  scope.TextEncoder = Utf8Encoder as unknown as typeof TextEncoder;
}

if (isNative && typeof scope.btoa === 'undefined') {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  scope.btoa = (binary: string) => {
    let out = '';
    for (let i = 0; i < binary.length; i += 3) {
      const hasB = i + 1 < binary.length;
      const hasC = i + 2 < binary.length;
      const n =
        (binary.charCodeAt(i) << 16) | ((hasB ? binary.charCodeAt(i + 1) : 0) << 8) | (hasC ? binary.charCodeAt(i + 2) : 0);
      out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63];
      out += hasB ? alphabet[(n >> 6) & 63] : '=';
      out += hasC ? alphabet[n & 63] : '=';
    }
    return out;
  };
}
