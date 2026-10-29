/** Returns the duration of a PCM WAV track when its container exposes byte timing. */
export function waveDuration(bytes: Buffer): number | undefined {
  if (
    bytes.length < 12 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WAVE'
  )
    return;
  let rate = 0,
    size = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', offset, offset + 4),
      length = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + length > bytes.length) return;
    if (name === 'fmt ' && length >= 16) rate = bytes.readUInt32LE(offset + 16);
    if (name === 'data') size += length;
    offset += 8 + length + (length % 2);
  }
  return rate && size ? (size / rate) * 1000 : undefined;
}
