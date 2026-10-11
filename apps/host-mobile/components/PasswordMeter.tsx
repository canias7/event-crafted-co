import { Text, View } from "react-native";
import { passwordChecks, passwordProblem } from "@/lib/password";

// Strength bar under the sign-up password field: one segment per rule
// (8+ characters, upper- and lowercase, a number, a symbol), champagne when
// met. The line under it names what's still missing. A breach-list check
// runs on the server when the user continues, so the "ready" line says so.
const GOLD = "#c9a86a";
const SURFACE = "#ece7db";
const INK = "#14161a";
const BRONZE = "#8a6f3e";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";

export function PasswordMeter({ password }: { password: string }) {
  if (password.length === 0) return null;
  const checks = passwordChecks(password);
  const met = checks.filter(Boolean).length;
  const problem = passwordProblem(password);
  return (
    <View style={{ marginTop: 10 }}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`Password strength: ${met} of 4 rules met`}
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
          Strong password. We'll also check it hasn't leaked.
        </Text>
      )}
    </View>
  );
}
