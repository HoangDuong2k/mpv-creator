/**
 * Kiểm tra AI căn lời chạy thật trên bản build: tải mô hình Nhanh (lần đầu), nạp ONNX Runtime trong tiến trình
 * riêng, nghe một đoạn nhạc. CI chạy trên bản đóng gói của từng loại máy — Mac chip Intel không có ONNX Runtime
 * bản native nên phải chạy bằng bản WebAssembly dự phòng; các máy khác phải nạp được bản native.
 * Chạy: npm run build && npm run ai-smoke   (bản đóng gói: PVM_E2E_EXE=... npm run ai-smoke)
 * Mô hình tải về test-output/ai-smoke/userdata/audio-cache/models (CI lưu lại thư mục này giữa các lần chạy).
 */
import { existsSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { _electron as electron } from 'playwright-core'
import { makeTestAudio } from './make-test-audio'

const ROOT = resolve(__dirname, '..')
const OUT = join(ROOT, 'test-output', 'ai-smoke')
const AUDIO = join(ROOT, 'test-output', 'audio')

async function main(): Promise<void> {
  if (!existsSync(join(AUDIO, '01-nang-am-xa-dan.mp3'))) makeTestAudio(AUDIO, 40)
  const userData = join(OUT, 'userdata')
  // Giữ mô hình đã tải, bỏ kết quả nghe lần trước để lần này nghe thật
  rmSync(join(userData, 'audio-cache', 'lyrics-asr'), { recursive: true, force: true })
  const exe = process.env.PVM_E2E_EXE
  const app = await electron.launch({
    executablePath: exe ?? (require('electron') as unknown as string),
    args: [...(exe ? [] : [ROOT]), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, PVM_USER_DATA: userData } as Record<string, string>
  })
  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    const t0 = Date.now()
    const res = (await page.evaluate(
      (path) =>
        (window as unknown as { api: { aiTranscribe(p: string, m: string, l: string): Promise<unknown> } }).api
          .aiTranscribe(path, 'fast', 'en')
          .catch((e: Error) => ({ error: e.message })),
      join(AUDIO, '01-nang-am-xa-dan.mp3')
    )) as { words?: unknown[]; backend?: string; error?: string }
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    if (res.error) throw new Error(`AI căn lời lỗi: ${res.error}`)
    if (!Array.isArray(res.words)) throw new Error(`Kết quả lạ: ${JSON.stringify(res).slice(0, 300)}`)
    const expected = process.platform === 'darwin' && process.arch === 'x64' ? 'wasm' : 'native'
    console.log(`AI căn lời chạy được: ${secs} giây, ONNX Runtime bản ${res.backend}, ${res.words.length} từ nghe được (nhạc thử không có lời)`)
    if (res.backend !== expected) throw new Error(`Phải chạy bằng ONNX Runtime bản ${expected} trên máy này, nhưng đã chạy bản ${res.backend}`)
    const models = (await page.evaluate(() => (window as unknown as { api: { aiModels(): Promise<Array<{ key: string; ready: boolean }>> } }).api.aiModels())) ?? []
    if (!models.find((m) => m.key === 'fast')?.ready) throw new Error('Chạy xong nhưng mô hình Nhanh chưa được đánh dấu là đã tải')
    console.log('✓ mô hình Nhanh đã tải và dùng được')
  } finally {
    await app.close().catch(() => app.process().kill())
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
)
