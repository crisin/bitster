import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

function isNative(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

export const haptics = {
  tap() {
    if (isNative()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  success() {
    if (isNative()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  error() {
    if (isNative()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
  medium() {
    if (isNative()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
};
