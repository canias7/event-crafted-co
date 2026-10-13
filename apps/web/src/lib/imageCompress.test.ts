import { describe, expect, it } from "vitest";
import { stripJpegMetadataBytes } from "./imageCompress";

// A minimal JPEG-shaped byte stream: SOI, APP0 (JFIF), APP1 (EXIF with
// "GPS" in it), APP13 (IPTC), DQT, SOS + scan data, EOI.
function seg(marker: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...payload];
}
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

const app0 = seg(0xe0, ascii("JFIF\0"));
const app1 = seg(0xe1, ascii("Exif\0\0GPSLatitude 51.5"));
const app13 = seg(0xed, ascii("Photoshop 3.0\0"));
const dqt = seg(0xdb, [0, 1, 2, 3]);
const scan = [...seg(0xda, [1, 2, 3]), 0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9];

describe("stripJpegMetadataBytes", () => {
  it("drops APP1 and APP13 and keeps everything else byte for byte", () => {
    const input = new Uint8Array([0xff, 0xd8, ...app0, ...app1, ...app13, ...dqt, ...scan]);
    const out = stripJpegMetadataBytes(input);
    expect(out).not.toBeNull();
    expect(Array.from(out!)).toEqual([0xff, 0xd8, ...app0, ...dqt, ...scan]);
    expect(new TextDecoder().decode(out!)).not.toContain("GPS");
  });

  it("is a no-op on a JPEG without metadata", () => {
    const input = new Uint8Array([0xff, 0xd8, ...app0, ...dqt, ...scan]);
    expect(Array.from(stripJpegMetadataBytes(input)!)).toEqual(Array.from(input));
  });

  it("rejects bytes that aren't a JPEG", () => {
    expect(stripJpegMetadataBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });

  it("rejects a truncated segment", () => {
    expect(stripJpegMetadataBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x40, 1, 2]))).toBeNull();
  });
});
