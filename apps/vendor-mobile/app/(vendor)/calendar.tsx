// Calendar tab — placeholder. Web has a full month grid; mobile will
// show an upcoming-bookings list (more useful on a 5" screen than a
// 7-col grid). Wire the data once the calendar feature ships.

import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CalendarScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="border-b border-border px-4 py-3">
        <Text className="text-xl font-semibold text-foreground">Calendar</Text>
        <Text className="text-xs text-muted-foreground">Upcoming bookings</Text>
      </View>
      <ScrollView contentContainerClassName="px-4 pt-12 pb-32 items-center">
        <Text className="text-sm text-muted-foreground">
          Booking calendar arrives with the next release.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
