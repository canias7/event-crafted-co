// Logo "auto-fit on white" — the app-side counterpart to web's
// logo handling. After the vendor picks an image we DON'T force an OS
// square crop (which chops wide logos); instead we fit the WHOLE logo
// onto a white 512×512 square and let them confirm. No manual pan/zoom
// — just a clean centered logo with white padding.
//
// Why view-shot: the padding around a contained logo has to render on
// a real background. expo-image-manipulator can crop/resize but can't
// pad outside the image's pixels, so we capture the composed view
// (image on white, resizeMode "contain") WYSIWYG to a 512×512 JPEG.
// The circular guide is drawn OVER the captured layer (pointerEvents
// none) so it never lands in the saved file — it just previews how the
// logo reads as a round avatar.

import { useRef, useState } from "react";
import { Dimensions, Image, Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

const OUTPUT = 512; // final JPEG dimension
const INK = "#14161a";
const INK_DIM = "#5e636e";

export function LogoCropperModal({
  uri,
  onCancel,
  onApply,
}: {
  uri: string;
  onCancel: () => void;
  onApply: (croppedUri: string) => void;
}) {
  // Square preview, clamped so it never overflows a narrow phone.
  const viewport = Math.min(300, Math.max(220, Dimensions.get("window").width - 64));
  const radius = viewport / 2 - 8;

  const shotRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (busy) return;
    setBusy(true);
    try {
      const out = await captureRef(shotRef, {
        width: OUTPUT,
        height: OUTPUT,
        format: "jpg",
        quality: 0.92,
        result: "tmpfile",
      });
      onApply(out);
    } catch {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.55)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 420,
          backgroundColor: "#fff",
          borderRadius: 24,
          padding: 22,
        }}
      >
        <Text
          style={{ fontSize: 22, fontWeight: "700", color: INK, fontStyle: "italic" }}
        >
          Your logo
        </Text>
        <Text style={{ marginTop: 4, marginBottom: 18, fontSize: 13, color: INK_DIM }}>
          We fit your whole logo on a clean background — nothing gets cropped.
        </Text>

        {/* Viewport wrapper: captured layer (white + contained logo)
            below, circular preview guide on top (not captured). */}
        <View style={{ width: viewport, height: viewport, alignSelf: "center" }}>
          <View
            ref={shotRef}
            collapsable={false}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: viewport,
              height: viewport,
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: "#fff",
            }}
          >
            <Image
              source={{ uri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          </View>
          <Svg
            width={viewport}
            height={viewport}
            style={{ position: "absolute", top: 0, left: 0 }}
            pointerEvents="none"
          >
            <Circle
              cx={viewport / 2}
              cy={viewport / 2}
              r={radius}
              fill="none"
              stroke="rgba(0,0,0,0.18)"
              strokeWidth={1.5}
            />
          </Svg>
        </View>

        <View
          style={{
            marginTop: 22,
            flexDirection: "row",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <Pressable
            onPress={onCancel}
            disabled={busy}
            style={{
              paddingHorizontal: 20,
              height: 46,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(10,10,10,0.15)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: INK, fontWeight: "600" }}>Choose different</Text>
          </Pressable>
          <Pressable
            onPress={apply}
            disabled={busy}
            style={{
              paddingHorizontal: 24,
              height: 46,
              borderRadius: 999,
              backgroundColor: INK,
              alignItems: "center",
              justifyContent: "center",
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>
              {busy ? "Saving…" : "Use logo"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
