import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Dimensions,
  Keyboard,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  View,
} from 'react-native';

interface KeyboardScrollContextType {
  scrollRef: React.RefObject<ScrollView | null>;
  registerScrollView: (ref: React.RefObject<ScrollView | null>) => void;
  scrollToView: (view: View | null, extraMargin?: number) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  keyboardHeight: number;
  isKeyboardVisible: boolean;
  dismissKeyboard: () => void;
}

const KeyboardScrollContext = createContext<KeyboardScrollContextType>({
  scrollRef: { current: null },
  registerScrollView: () => {},
  scrollToView: () => {},
  onScroll: () => {},
  keyboardHeight: 0,
  isKeyboardVisible: false,
  dismissKeyboard: () => Keyboard.dismiss(),
});

/**
 * Access keyboard-aware scrolling functions.
 * When called inside any Screen or AuthShell, allows any input to scroll itself above the keyboard on focus.
 */
export function useKeyboardScroll() {
  return useContext(KeyboardScrollContext);
}

export function KeyboardScrollProvider({ children }: { children: ReactNode }) {
  const localScrollRef = useRef<ScrollView | null>(null);
  const registeredScrollRef = useRef<ScrollView | null>(null);
  const currentScrollY = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const keyboardHeightRef = useRef(0);
  const activeViewRef = useRef<View | null>(null);

  const registerScrollView = useCallback((ref: React.RefObject<ScrollView | null>) => {
    registeredScrollRef.current = ref.current;
  }, []);

  const getScrollRef = useCallback(() => {
    return registeredScrollRef.current || localScrollRef.current;
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    currentScrollY.current = event.nativeEvent.contentOffset.y;
  }, []);

  const performScroll = useCallback((view: View | null, extraMargin = 45) => {
    const scroll = getScrollRef();
    if (!view || !scroll) return;

    view.measureInWindow((_x, y, _width, height) => {
      if (y === undefined || height === undefined) return;

      const windowHeight = Dimensions.get('window').height;
      const kh = keyboardHeightRef.current > 0 ? keyboardHeightRef.current : (Platform.OS === 'ios' ? 336 : 280);
      const keyboardTop = windowHeight - kh;
      const fieldBottom = y + height;

      // If the field bottom is near or behind the keyboard, scroll down to bring it above
      if (fieldBottom > keyboardTop - extraMargin) {
        const diff = fieldBottom - (keyboardTop - extraMargin);
        const targetY = Math.max(0, currentScrollY.current + diff);
        scroll.scrollTo({ y: targetY, animated: true });
      } else if (y < 70) {
        // If field was scrolled past the top header, pull it back into view
        const diff = 70 - y;
        const targetY = Math.max(0, currentScrollY.current - diff);
        scroll.scrollTo({ y: targetY, animated: true });
      }
    });
  }, [getScrollRef]);

  const scrollToView = useCallback((view: View | null, extraMargin = 45) => {
    if (!view) return;
    activeViewRef.current = view;

    // Small delay to let keyboard slide begin, then measure and scroll
    setTimeout(() => {
      performScroll(view, extraMargin);
    }, Platform.OS === 'ios' ? 70 : 120);
  }, [performScroll]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      const h = e.endCoordinates.height;
      keyboardHeightRef.current = h;
      setKeyboardHeight(h);
      setIsKeyboardVisible(true);

      // Re-verify alignment with confirmed keyboard height
      if (activeViewRef.current) {
        setTimeout(() => {
          performScroll(activeViewRef.current, 45);
        }, 50);
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
      activeViewRef.current = null;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [performScroll]);

  const value: KeyboardScrollContextType = {
    scrollRef: localScrollRef,
    registerScrollView,
    scrollToView,
    onScroll,
    keyboardHeight,
    isKeyboardVisible,
    dismissKeyboard: () => Keyboard.dismiss(),
  };

  return <KeyboardScrollContext.Provider value={value}>{children}</KeyboardScrollContext.Provider>;
}
