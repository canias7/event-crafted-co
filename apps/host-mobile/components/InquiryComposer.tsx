// Inquiry composer — modal opened from the vendor detail screen's
// Inquire button. Inserts a row into public.inquiries with the
// signed-in user as host_id. Mirrors the web InquiryFormModal
// fields: event_type, event_date, guest_count, location, budget
// range, special_requests message.

import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

type EventType = "wedding" | "birthday" | "holiday_dinner" | "other";

const EVENT_TYPES: { key: EventType; label: string }[] = [
  { key: "wedding", label: "Wedding" },
  { key: "birthday", label: "Birthday" },
  { key: "holiday_dinner", label: "Holiday dinner" },
  { key: "other", label: "Other" },
];

export function InquiryComposer({
  visible,
  vendorId,
  vendorName,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  vendorId: string | null;
  vendorName: string | null;
  onClose: () => void;
  onSubmitted?: (inquiryId: string) => void;
}) {
  const { user } = useAuth();
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [location, setLocation] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setEventType("wedding");
    setEventDate("");
    setGuestCount("");
    setLocation("");
    setBudgetMin("");
    setBudgetMax("");
    setMessage("");
  }

  async function submit() {
    if (!user?.id || !vendorId) {
      Alert.alert("Sign in first", "You need to be logged in to send an inquiry.");
      return;
    }
    if (!message.trim()) {
      Alert.alert("Message is required");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        host_id: user.id,
        vendor_id: vendorId,
        event_type: eventType,
        event_date: eventDate.trim() || null,
        guest_count: guestCount.trim() ? Number.parseInt(guestCount, 10) : null,
        location: location.trim() || null,
        budget_min_cents: budgetMin.trim()
          ? Math.round(Number.parseFloat(budgetMin) * 100)
          : null,
        budget_max_cents: budgetMax.trim()
          ? Math.round(Number.parseFloat(budgetMax) * 100)
          : null,
        special_requests: message.trim(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("inquiries")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      reset();
      onClose();
      onSubmitted?.((data as { id: string }).id);
      Alert.alert("Sent", `${vendorName ?? "The vendor"} will get back to you soon.`);
    } catch (err) {
      Alert.alert(
        "Couldn't send inquiry",
        (err as { message?: string })?.message ?? "Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = message.trim().length > 0 && !submitting;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={22} color="#14161a" />
            </Pressable>
            <Text style={{ fontFamily: SERIF_BOLD }} className="text-base text-foreground">
              Inquire
            </Text>
            <Pressable onPress={submit} hitSlop={8} disabled={!canSubmit}>
              <Text
                className="text-sm"
                style={{ fontFamily: SERIF_BOLD, color: canSubmit ? "#14161a" : "#a89b8a" }}
              >
                {submitting ? "Sending…" : "Send"}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-5 py-5 gap-5 pb-16"
          >
            {vendorName ? (
              <View>
                <Text style={{ fontFamily: SERIF }} className="text-xs uppercase tracking-wide text-muted-foreground">
                  To
                </Text>
                <Text style={{ fontFamily: SERIF_BOLD }} className="mt-1 text-base text-foreground">
                  {vendorName}
                </Text>
              </View>
            ) : null}

            <View>
              <Text style={{ fontFamily: SERIF_BOLD }} className="text-sm text-foreground mb-2">
                Event type
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {EVENT_TYPES.map((t) => {
                  const active = eventType === t.key;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => setEventType(t.key)}
                      className={`rounded-full px-4 py-2 active:opacity-70 ${
 active
                          ? "bg-foreground"
                          : "border border-border bg-background"
                      }`}
                    >
                      <Text style={{ fontFamily: SERIF_BOLD }}
                        className={`text-sm ${
                          active ? "text-background" : "text-foreground"
                        }`}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Field
              label="Event date"
              placeholder="YYYY-MM-DD"
              value={eventDate}
              onChangeText={setEventDate}
              autoCapitalize="none"
            />
            <Field
              label="Guest count"
              placeholder="e.g. 80"
              value={guestCount}
              onChangeText={(v) => setGuestCount(v.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
            />
            <Field
              label="Location"
              placeholder="City, State"
              value={location}
              onChangeText={setLocation}
            />
            <View className="flex-row gap-3">
              <View style={{ flex: 1 }}>
                <Field
                  label="Budget min ($)"
                  placeholder="0"
                  value={budgetMin}
                  onChangeText={setBudgetMin}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Budget max ($)"
                  placeholder="0"
                  value={budgetMax}
                  onChangeText={setBudgetMax}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View>
              <Text style={{ fontFamily: SERIF_BOLD }} className="text-sm text-foreground mb-2">
                Message
              </Text>
              <TextInput style={{ fontFamily: SERIF }}
                value={message}
                onChangeText={setMessage}
                placeholder="Tell the vendor about your event…"
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                className="min-h-[140px] rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "number-pad" | "decimal-pad" | "email-address";
  autoCapitalize?: "none" | "sentences";
}) {
  return (
    <View>
      <Text style={{ fontFamily: SERIF_BOLD }} className="text-sm text-foreground mb-2">{label}</Text>
      <TextInput style={{ fontFamily: SERIF }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        className="rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground"
      />
    </View>
  );
}
