/**
 * Âm thanh cho nhận dạng giọng hát (AI căn lời): giải mã cả file nhạc gốc (chưa cắt đầu, vì mốc lời tính theo file
 * gốc) thành mono 16 kHz Float32, đúng định dạng Whisper cần. Không lọc dải tần: thử lọc bớt dải trầm / dải rất cao
 * trên 4 bài hát thật không chính xác hơn (149 so với 150 trên 198 dòng), chỉ làm từng bài lên xuống thất thường.
 */
import { runFfmpeg } from '../ffmpeg'

export const SPEECH_RATE = 16000

export async function decodeForSpeech(path: string): Promise<Float32Array> {
  const run = runFfmpeg(['-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', String(SPEECH_RATE), '-f', 'f32le', 'pipe:1'])
  const chunks: Buffer[] = []
  run.proc.stdout?.on('data', (c: Buffer) => chunks.push(c))
  await run.done
  const buf = Buffer.concat(chunks)
  // Chép sang bộ nhớ riêng, căn 4 byte (Buffer có thể nằm lệch trong vùng nhớ chung)
  const out = new Float32Array(Math.floor(buf.byteLength / 4))
  new Uint8Array(out.buffer).set(buf.subarray(0, out.length * 4))
  return out
}
