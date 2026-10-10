import { useCallback, useEffect, useRef } from "react";
import {
  Keyboard,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

// Room left between the field and the top of the keyboard.
const GAP = 24;

// Keeps the field being typed in above the keyboard. The app draws edge to
// edge on Android, so the window no longer shrinks for the keyboard: the
// screen's KeyboardAvoidingView pads (behavior "padding" on both platforms)
// and this scrolls the focused field into the space that's left. Spread
// `scrollProps` on the form's ScrollView.
export function useKeyboardReveal() {
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);

  const reveal = useCallback(() => {
    // Give the KeyboardAvoidingView a moment to apply its padding first.
    setTimeout(() => {
      const top = keyboardTop.current;
      const input = TextInput.State.currentlyFocusedInput();
      if (top == null || !input || !scrollRef.current) return;
      input.measureInWindow((_x, y, _width, height) => {
        const hidden = y + height + GAP - top;
        if (hidden > 0) scrollRef.current?.scrollTo({ y: scrollY.current + hidden, animated: true });
      });
    }, 120);
  }, []);

  useEffect(() => {
    // Moving from one field to the next doesn't reopen the keyboard, so
    // while it's up, watch which field has focus.
    let lastFocused: unknown = null;
    let watch: ReturnType<typeof setInterval> | undefined;
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      lastFocused = TextInput.State.currentlyFocusedInput();
      reveal();
      clearInterval(watch);
      watch = setInterval(() => {
        const focused = TextInput.State.currentlyFocusedInput();
        if (focused && focused !== lastFocused) {
          lastFocused = focused;
          reveal();
        }
      }, 250);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTop.current = null;
      clearInterval(watch);
    });
    return () => {
      show.remove();
      hide.remove();
      clearInterval(watch);
    };
  }, [reveal]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  }, []);

  return { scrollProps: { ref: scrollRef, onScroll, scrollEventThrottle: 16 } };
}
