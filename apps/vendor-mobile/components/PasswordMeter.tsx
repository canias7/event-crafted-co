import { Text, View } from "react-native";
import { passwordChecks, passwordProblem } from "@/lib/password";
import { useT } from "@/lib/i18n";

// Strength bar under the sign-up password field (dark sign-up screens): one segment per rule
// (8+ characters, upper- and lowercase, a number, a symbol), champagne when
// met. The line under it names what's still missing. A breach-list check
// runs on the server when the user continues, so the "ready" line says so.
const GOLD = "#c9a86a";
const SURFACE = "rgba(255,255,255,0.12)";
const INK = "#f4f1ea";
const BRONZE = "#c9a86a";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";

export function PasswordMeter({ password }: { password: string }) {
  const { t } = useT("passwordMeter");
  if (password.length === 0) return null;
  const checks = passwordChecks(password);
  const met = checks.filter(Boolean).length;
  const problem = passwordProblem(password);
  return (
    <View style={{ marginTop: 10 }}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t("strength", { met })}
        style={{ flexDirection: "row", gap: 4 }}
      >
        {checks.map((ok, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 999,
              backgroundColor: i < met ? GOLD : SURFACE,
            }}
          />
        ))}
      </View>
      {problem ? (
        <Text style={{ fontFamily: SERIF, color: BRONZE, fontSize: 13, marginTop: 6 }}>
          {problem}
        </Text>
      ) : (
        <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 13, marginTop: 6 }}>
          {t("strong")}
        </Text>
      )}
    </View>
  );
}
