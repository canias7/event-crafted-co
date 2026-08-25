// Logo "auto-fit on white" confirmation — the app-side counterpart to
// web's logo handling. After the vendor picks an image we DON'T force
// an OS square crop (which chops wide logos); we preview the WHOLE
// logo on a clean background and let them confirm.
//
// This used to compose the padded square client-side with
// react-native-view-shot's captureRef — which fails on the current
// new-architecture binary (verified: every "Use logo" tap died at
// capture; zero uploads reached storage). The composition step is gone
// entirely: confirming hands the ORIGINAL image back to the caller,
// which downscales it with expo-image-manipulator (proven on this
// binary — listing photos use it) and uploads it as-is. The clean
// background is the renderer's job now: every logo surface draws
// white behind the image with resizeMode "contain", which is exactly
// what this preview shows.

import { Dimensions, Image, Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

const INK = "#14161a";
const INK_DIM = "#5e636e";

export function LogoCropperModal({
  uri,
  onCancel,
  onApply,
}: {
  uri: string;
  onCancel: () => void;
  onApply: () => void;
}) {
  // Square preview, clamped so it never overflows a narrow phone.
  const viewport = Math.min(300, Math.max(220, Dimensions.get("window").width - 64));
  const radius = viewport / 2 - 8;

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
          style={{ fontFamily: "LibreBaskerville-Italic", fontSize: 22, color: INK}}
        >
          Your logo
        </Text>
        <Text style={{ fontFamily: "LibreBaskerville", marginTop: 4, marginBottom: 18, fontSize: 13, color: INK_DIM }}>
          We fit your whole logo on a clean background — nothing gets cropped.
        </Text>

        {/* Preview: whole logo contained on white, with a circular guide
            showing how it reads as a round avatar. */}
        <View style={{ width: viewport, height: viewport, alignSelf: "center" }}>
          <View
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
            <Text style={{ fontFamily: "LibreBaskerville-Bold", color: INK}}>Choose different</Text>
          </Pressable>
          <Pressable
            onPress={onApply}
            style={{
              paddingHorizontal: 24,
              height: 46,
              borderRadius: 999,
              backgroundColor: INK,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: "LibreBaskerville-Bold", color: "#fff"}}>Use logo</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
