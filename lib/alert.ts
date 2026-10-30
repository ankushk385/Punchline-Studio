import { Alert as NativeAlert, Platform } from 'react-native';

type AlertButton = {
  text?: string;
  onPress?: (value?: string) => void;
  style?: 'default' | 'cancel' | 'destructive';
};

function format(title?: string, message?: string) {
  if (title && message) return `${title}\n\n${message}`;
  return title || message || '';
}

function webAlert(title?: string, message?: string, buttons?: AlertButton[], options?: { cancelable?: boolean; onDismiss?: () => void }) {
  const text = format(title, message);
  if (typeof window === 'undefined') return;

  if (!buttons || buttons.length === 0) {
    window.alert(text);
    return;
  }

  if (buttons.length === 1) {
    window.alert(text);
    buttons[0]?.onPress?.();
    return;
  }

  if (buttons.length === 2) {
    const cancel = buttons.find(button => button.style === 'cancel');
    const confirm = buttons.find(button => button !== cancel) ?? buttons[0];
    if (window.confirm(text)) confirm?.onPress?.();
    else cancel?.onPress?.();
    return;
  }

  const choices = buttons.map((button, index) => `${index + 1}. ${button.text ?? 'Option'}`).join('\n');
  const answer = window.prompt(`${text}\n\n${choices}\n\nType a number:`, '1');
  if (answer === null) {
    options?.onDismiss?.();
    buttons.find(button => button.style === 'cancel')?.onPress?.();
    return;
  }
  const index = Number(answer) - 1;
  if (Number.isInteger(index) && buttons[index]) buttons[index].onPress?.();
  else options?.onDismiss?.();
}

// react-native-web ships a no-op Alert. On web this adapter renders the dialog
// with window.alert/confirm/prompt so buttons and messages still work.
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: { cancelable?: boolean; onDismiss?: () => void }) {
    if (Platform.OS === 'web') {
      webAlert(title, message, buttons, options);
      return;
    }
    NativeAlert.alert(title, message, buttons, options);
  },
};
