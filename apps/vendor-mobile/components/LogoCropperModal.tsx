// Native logo cropper — the app-side counterpart to web's
// LogoCropperModal. Vendor picks an image; we show it inside a square
// viewport with a circular guide, drag to position + slide to zoom.
// Apply captures the viewport (white background + positioned image) to
// a 512×512 JPEG via react-native-view-shot and hands the file uri back.
//
// Why view-shot instead of a crop: like web, the point is to FIT a
// whole logo — zoom out past "cover" and the padding around it must
// render on a clean background. expo-image-manipulator can crop/resize
// but can't pad outside the image's own pixels, so we capture the
// composed view (image on white) WYSIWYG instead. The circular guide
// is drawn as a sibling OVER the captured layer (pointerEvents none),
// so it never ends up in the saved file.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  PanResponder,
  Pressable,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Defs, Mask, Rect } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

const OUTPUT = 512; // final JPEG dimension
const INK = "#0a0a0a";
const INK_DIM = "#6b7280";

export function LogoCropperModal({
  uri,
  onCancel,
  onApply,
}: {
  uri: string;
  onCancel: () => void;
  onApply: (croppedUri: string) => void;
}) {
  // Square viewport, clamped to the screen so it never overflows.
  const viewport = useMemo(
    () => Math.min(300, Math.max(220, Dimensions.get("window").width - 64)),
    [],
  );
  const radius = viewport / 2 - 8;

  const shotRef = useRef<View>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [bounds, setBounds] = useState({ min: 1, max: 4 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  // Live refs so the PanResponder closures (created once) read current
  // scale/offset/imgSize without being re-created on every change.
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  const sizeRef = useRef(imgSize);
  scaleRef.current = scale;
  offsetRef.current = offset;
  sizeRef.current = imgSize;

  useEffect(() => {
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => {
        if (!alive) return;
        setImgSize({ w, h });
        // cover  → smaller side fills the viewport (old hard minimum).
        // contain → larger side fits; whole image visible.
        const cover = viewport / Math.min(w, h);
        const contain = viewport / Math.max(w, h);
        // Allow shrinking below contain so a wide/tall logo sits inside
        // the circle with margin — the whole point, mirroring web.
        setBounds({ min: contain * 0.55, max: cover * 4 });
        setScale(contain);
        setOffset({ x: 0, y: 0 });
      },
      () => {
        // Couldn't read dimensions — bail back to the picker.
        onCancel();
      },
    );
    return () => {
      alive = false;
    };
  }, [uri, viewport, onCancel]);

  function clamp(x: number, y: number, s: number, size: { w: number; h: number }) {
    const maxX = Math.max(0, (size.w * s - viewport) / 2);
    const maxY = Math.max(0, (size.h * s - viewport) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }

  // Drag-to-pan over the image.
  const panStart = useRef({ x: 0, y: 0 });
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panStart.current = { ...offsetRef.current };
      },
      onPanResponderMove: (_e, g) => {
        const size = sizeRef.current;
        if (!size) return;
        setOffset(
          clamp(
            panStart.current.x + g.dx,
            panStart.current.y + g.dy,
            scaleRef.current,
            size,
          ),
        );
      },
    }),
  ).current;

  async function apply() {
    if (!imgSize || busy) return;
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
      // Surface nothing fancy — just stop the spinner so they can retry.
      setBusy(false);
    }
  }

  const imgStyle = imgSize
    ? {
        position: "absolute" as const,
        width: imgSize.w * scale,
        height: imgSize.h * scale,
        left: viewport / 2 - (imgSize.w * scale) / 2 + offset.x,
        top: viewport / 2 - (imgSize.h * scale) / 2 + offset.y,
      }
    : null;

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
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: INK,
            fontStyle: "italic",
          }}
        >
          Adjust your logo
        </Text>
        <Text style={{ marginTop: 4, marginBottom: 18, fontSize: 13, color: INK_DIM }}>
          Drag to position. Slide to zoom — zoom all the way out to fit your
          whole logo.
        </Text>

        {/* Viewport wrapper: captured layer (white + image) below, the
            circular guide overlay on top (not captured). */}
        <View
          style={{ width: viewport, height: viewport, alignSelf: "center" }}
        >
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
            {...pan.panHandlers}
          >
            {imgStyle ? (
              <Image source={{ uri }} style={imgStyle} resizeMode="stretch" />
            ) : null}
          </View>
          <Svg
            width={viewport}
            height={viewport}
            style={{ position: "absolute", top: 0, left: 0 }}
            pointerEvents="none"
          >
            <Defs>
              <Mask id="logo-hole">
                <Rect width={viewport} height={viewport} fill="white" />
                <Circle cx={viewport / 2} cy={viewport / 2} r={radius} fill="black" />
              </Mask>
            </Defs>
            <Rect
              width={viewport}
              height={viewport}
              fill="rgba(0,0,0,0.45)"
              mask="url(#logo-hole)"
            />
            <Circle
              cx={viewport / 2}
              cy={viewport / 2}
              r={radius}
              fill="none"
              stroke="rgba(0,0,0,0.25)"
              strokeWidth={1.5}
            />
          </Svg>
        </View>

        {/* Zoom slider */}
        <View style={{ marginTop: 20 }}>
          <Text
            style={{
              fontSize: 11,
              letterSpacing: 1.4,
              fontWeight: "600",
              color: INK_DIM,
              marginBottom: 8,
            }}
          >
            ZOOM
          </Text>
          <ZoomSlider
            value={scale}
            min={bounds.min}
            max={bounds.max}
            onChange={(s) => {
              const size = sizeRef.current;
              setScale(s);
              if (size) setOffset((o) => clamp(o.x, o.y, s, size));
            }}
          />
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
            <Text style={{ color: INK, fontWeight: "600" }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={apply}
            disabled={busy || !imgSize}
            style={{
              paddingHorizontal: 24,
              height: 46,
              borderRadius: 999,
              backgroundColor: INK,
              alignItems: "center",
              justifyContent: "center",
              opacity: busy || !imgSize ? 0.5 : 1,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>
              {busy ? "Saving…" : "Apply"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Minimal slider built on PanResponder so we don't pull in a slider
// dependency. Tap or drag anywhere on the track to set the zoom.
function ZoomSlider({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [trackW, setTrackW] = useState(0);
  const trackWRef = useRef(0);
  trackWRef.current = trackW;

  const setFromX = (x: number) => {
    const w = trackWRef.current;
    if (w <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / w));
    onChange(min + ratio * (max - min));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    }),
  ).current;

  const ratio = max > min ? (value - min) / (max - min) : 0;
  const thumbX = Math.max(0, Math.min(1, ratio)) * trackW;

  return (
    <View
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      {...pan.panHandlers}
      style={{ height: 36, justifyContent: "center" }}
    >
      {/* Track */}
      <View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: "rgba(10,10,10,0.12)",
        }}
      />
      {/* Filled portion */}
      <View
        style={{
          position: "absolute",
          left: 0,
          height: 4,
          width: thumbX,
          borderRadius: 2,
          backgroundColor: INK,
        }}
      />
      {/* Thumb */}
      <View
        style={{
          position: "absolute",
          left: thumbX - 11,
          width: 22,
          height: 22,
          borderRadius: 999,
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: "rgba(10,10,10,0.2)",
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        }}
      />
    </View>
  );
}
