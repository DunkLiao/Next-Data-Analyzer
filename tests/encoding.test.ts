import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeBuffer } from "../src/io/encoding";

afterEach(() => vi.unstubAllGlobals());

describe("decodeBuffer", () => {
  it("decodes UTF-8 and removes its BOM", () => {
    const bytes = new TextEncoder().encode("姓名,值\n測試,42");
    expect(decodeBuffer(bytes.buffer)).toEqual({ text: "姓名,值\n測試,42", encoding: "UTF-8" });
    expect(decodeBuffer(Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes]).buffer)).toEqual({
      text: "姓名,值\n測試,42", encoding: "UTF-8 (BOM)",
    });
  });

  it("falls back to Big5 for invalid UTF-8 and supports forced redecoding", () => {
    const buffer = Uint8Array.from([0xa4, 0xa4, 0xa4, 0xe5]).buffer;
    expect(decodeBuffer(buffer)).toEqual({ text: "中文", encoding: "Big5" });
    expect(decodeBuffer(buffer, "big5")).toEqual({ text: "中文", encoding: "BIG5" });
    expect(decodeBuffer(buffer, "utf-8").text).toContain("\ufffd");
  });

  it("uses replacement UTF-8 when Big5 decoding is unavailable", () => {
    const NativeDecoder = TextDecoder;
    vi.stubGlobal("TextDecoder", class extends NativeDecoder {
      constructor(label?: string, options?: TextDecoderOptions) {
        if (label === "big5") throw new RangeError("unsupported encoding");
        super(label, options);
      }
    });
    expect(decodeBuffer(Uint8Array.from([0xff]).buffer)).toEqual({
      text: "\ufffd", encoding: "UTF-8 (fallback)",
    });
  });

  it("recognizes UTF-16LE BOM and empty input", () => {
    expect(decodeBuffer(Uint8Array.from([0xff, 0xfe, 65, 0]).buffer)).toEqual({ text: "A", encoding: "UTF-16LE" });
    expect(decodeBuffer(new ArrayBuffer(0))).toEqual({ text: "", encoding: "UTF-8" });
  });
});
