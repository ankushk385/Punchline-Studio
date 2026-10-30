import React, { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { KeyboardToolbar } from 'react-native-keyboard-controller';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAppTheme } from '@/theme/ThemeProvider';

type KeyboardAwareBottomSheetProps = {
  children: ReactNode;
  onClose: () => void;
  accessibilityLabel?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  sheetStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A native modal bottom sheet that stays above the tab bar and Android keyboard.
 * Long forms scroll their focused input into view instead of hiding it.
 */
export function KeyboardAwareBottomSheet({
  children,
  onClose,
  accessibilityLabel = 'Close dialog',
  contentContainerStyle,
  sheetStyle,
  testID,
}: KeyboardAwareBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      hardwareAccelerated
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          testID={testID ? `${testID}-backdrop` : undefined}
        />
        <KeyboardAvoidingView
          pointerEvents="box-none"
          style={styles.keyboardAvoider}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Animated.View
            entering={FadeInDown.duration(250)}
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: colors.border },
              { paddingBottom: Math.max(insets.bottom, 20) },
              sheetStyle,
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <KeyboardAwareScrollViewCompat
              style={styles.scroll}
              contentContainerStyle={[styles.content, contentContainerStyle]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </KeyboardAwareScrollViewCompat>
          </Animated.View>
        </KeyboardAvoidingView>
        {Platform.OS !== 'web' && <KeyboardToolbar doneText="Done" />}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  keyboardAvoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '94%',
    minHeight: 120,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  scroll: {
    flexShrink: 1,
  },
  content: {
    paddingBottom: 4,
  },
});
