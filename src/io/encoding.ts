export interface Decoded {
  text: string;
  encoding: string;
}

export function decodeBuffer(buf: ArrayBuffer, forceEncoding?: string): Decoded {
  const bytes = new Uint8Array(buf);
  if (forceEncoding) {
    return { text: new TextDecoder(forceEncoding).decode(bytes), encoding: forceEncoding.toUpperCase() };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "UTF-8 (BOM)" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "UTF-16LE" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "UTF-8" };
  } catch {
    // not valid UTF-8, fall through to Big5 (most common legacy CJK encoding)
  }
  try {
    return { text: new TextDecoder("big5").decode(bytes), encoding: "Big5" };
  } catch {
    return { text: new TextDecoder("utf-8").decode(bytes), encoding: "UTF-8 (fallback)" };
  }
}
