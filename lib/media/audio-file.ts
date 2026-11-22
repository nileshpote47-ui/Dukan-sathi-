/** True when the bytes look like an MP3 file (ID3 tag or an MPEG audio frame header), checked by content. */
export function isMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true // "ID3"
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0 // frame sync + layer set
}
