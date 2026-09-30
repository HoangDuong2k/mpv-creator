/**
 * Kiểm thử end-to-end: mở app đã build, nhập nhạc, phát, tua, đổi hiệu ứng,
 * undo, lấy timestamp và xuất thử một đoạn video. Chạy: npm run build && npm run e2e
 * Bản đã đóng gói: PVM_E2E_EXE=release/linux-unpacked/playlist-video-maker npm run e2e
 *   (Windows: PVM_E2E_EXE="release/win-unpacked/Playlist Video Maker.exe")
 */
import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { ffmpegPath } from '../src/main/ffmpeg'
import { makeTestAudio } from './make-test-audio'
import { ROW_COLORS } from '../src/renderer/src/timelineModel'

const ROOT = resolve(__dirname, '..')
const OUT = join(ROOT, 'test-output', 'e2e')
const AUDIO = join(ROOT, 'test-output', 'audio')

interface Probe {
  __pvm: {
    player: { playing: boolean; chunksScheduled: number; hasAudio: boolean; time(): number }
    store: {
      getState(): {
        project: {
          tracks: Array<{ title: string; trimStart: number; trimEnd: number }>
          layers: Array<{ id: string; type: string; name: string; row?: string; locked?: boolean; color?: string; timing: { start: number; end: number | null }; props: Record<string, unknown> }>
        }
      }
    }
  }
}

/** Thời lượng file media bằng FFmpeg đóng gói kèm app (không cần ffprobe trong PATH, chạy được trên Windows) */
function mediaDuration(file: string): number {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-i', file], { encoding: 'utf8', windowsHide: true })
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr ?? '')
  return m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : NaN
}

/** Toạ độ phần tử sau khi đã đứng yên (khung chọn trên preview cập nhật chậm một khung hình sau mỗi thao tác) */
async function stableBox(loc: { boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> }): Promise<{ x: number; y: number; width: number; height: number }> {
  let prev = await boxOf(loc)
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 120))
    const cur = await boxOf(loc)
    if (Math.abs(cur.x - prev.x) < 0.5 && Math.abs(cur.y - prev.y) < 0.5 && Math.abs(cur.width - prev.width) < 0.5 && Math.abs(cur.height - prev.height) < 0.5) return cur
    prev = cur
  }
  return prev
}

/** Chờ điều kiện đúng (giao diện React cập nhật sau một nhịp) */
async function until(check: () => Promise<boolean>, timeout = 3000): Promise<boolean> {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return check()
}

/** Toạ độ của phần tử, chờ tới khi nó hiện ra (giao diện có thể đang vẽ lại) */
async function boxOf(loc: { boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> }): Promise<{ x: number; y: number; width: number; height: number }> {
  let b = await loc.boundingBox()
  for (let i = 0; !b && i < 60; i++) {
    await new Promise((r) => setTimeout(r, 50))
    b = await loc.boundingBox()
  }
  if (!b) throw new Error('Không tìm thấy phần tử trên màn hình')
  return b
}

/** Chiều cao thước thời gian của timeline (ghim ở trên, che các hàng cuộn qua) */
const RULER_BAR_H = 26
const passed: string[] = []
const problems: string[] = []
let pageRef: Page | undefined
let failDiag = ''
let appRef: ElectronApplication | undefined

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`KIỂM THỬ THẤT BẠI: ${msg}`)
  passed.push(msg)
  console.log(`  ✓ ${msg}`)
}

/** Trên GitHub Actions: in lỗi thành annotation (xem được công khai, không cần quyền đọc log) */
function annotate(level: 'error' | 'notice', title: string, text: string): void {
  if (!process.env.GITHUB_ACTIONS) return
  const esc = (v: string): string => v.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
  console.log(`::${level} title=${esc(title)}::${esc(text)}`)
}

async function diagnostics(): Promise<string> {
  if (!pageRef) return 'Chưa mở được cửa sổ app'
  try {
    return String(
      await pageRef.evaluate(`(() => {
        const w = window
        const p = w.__pvm && w.__pvm.player
        return JSON.stringify({
          viewport: [innerWidth, innerHeight],
          dpr: devicePixelRatio,
          player: p ? { t: p.time(), playing: p.playing, total: p.total, ...p.debug } : null,
          hint: document.querySelector('.stage-hint') && document.querySelector('.stage-hint').textContent,
          chips: Array.from(document.querySelectorAll('.chip')).map((c) => c.textContent)
        })
      })()`)
    )
  } catch (err) {
    return `Không đọc được trạng thái: ${(err as Error).message}`
  }
}

async function main(): Promise<void> {
  // Chống treo (vd. app hiện hộp thoại chờ người bấm): quá 10 phút thì báo lỗi, đóng app và thoát
  setTimeout(() => {
    const msg = `Kiểm thử bị treo quá 10 phút. Đã qua ${passed.length} bước, bước cuối: ${passed[passed.length - 1] ?? '(chưa có)'}`
    console.error(msg)
    annotate('error', `E2E ${process.platform} bị treo`, msg)
    appRef?.process().kill()
    process.exit(1)
  }, 10 * 60_000).unref()
  if (!existsSync(join(AUDIO, '03-bass-cuc-manh.mp3'))) makeTestAudio(AUDIO, 40)
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const files = ['01-nang-am-xa-dan.mp3', '02-dem-lofi.mp3', '03-bass-cuc-manh.mp3'].map((f) => join(AUDIO, f))
  // PVM_E2E_EXE=đường dẫn app đã đóng gói → kiểm thử bản build thật (asar, ffmpeg đi kèm, font trong resources)
  const exe = process.env.PVM_E2E_EXE
  const app = (appRef = await electron.launch({
    executablePath: exe ?? (require('electron') as unknown as string),
    args: [...(exe ? [] : [ROOT]), ...(process.platform === 'linux' ? ['--no-sandbox'] : []), ...files],
    env: { ...process.env, PVM_USER_DATA: join(OUT, 'userdata') } as Record<string, string>
  }))
  app.process().stderr?.on('data', (d: Buffer) => {
    for (const line of d.toString().split(/\r?\n/)) if (/error|lỗi|exception/i.test(line) && !/dbus|gpu|Gtk|viz|ozone|libva/i.test(line)) problems.push(`[main] ${line.slice(0, 300)}`)
  })
  try {
    const page = (pageRef = await app.firstWindow())
    // PVM_E2E_WINDOW=1008x729: giả lập màn hình nhỏ (vd. máy ảo Windows 1024×768 của GitHub)
    const win = /^(\d+)x(\d+)$/.exec(process.env.PVM_E2E_WINDOW ?? '')
    if (win) {
      await app.evaluate(
        ({ BrowserWindow }, [w, h]) => {
          const bw = BrowserWindow.getAllWindows()[0]
          bw.setMinimumSize(640, 480)
          bw.setContentSize(w, h)
        },
        [Number(win[1]), Number(win[2])]
      )
      await page.waitForTimeout(300)
    }
    page.on('pageerror', (e) => {
      problems.push(`[renderer] ${e.message}`)
      console.error('  [renderer lỗi]', e.message)
    })
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') problems.push(`[console.${m.type()}] ${m.text().slice(0, 300)}`)
    })
    await page.waitForSelector('.track', { timeout: 20000 })
    assert((await page.locator('.track').count()) === 3, 'nhập 3 bài từ dòng lệnh')
    await page.locator('.chip.ok').waitFor({ timeout: 60000 })
    assert(true, 'phân tích + ghép âm thanh xong')
    // Windows không phân biệt hoa/thường: thư mục tên "cache" sẽ trùng bộ nhớ đệm HTTP "Cache" của Chromium
    assert(
      existsSync(join(OUT, 'userdata', 'audio-cache', 'pcm')) && !existsSync(join(OUT, 'userdata', 'Cache', 'pcm')),
      'cache âm thanh nằm riêng, không lẫn vào bộ nhớ đệm "Cache" của Chromium'
    )
    assert((await page.locator('.track-title').first().textContent()) === 'Nắng Ấm Xa Dần', 'đọc tag tiếng Việt')
    await page.screenshot({ path: join(OUT, '1-loaded.png') })

    // Phát 1.5 giây
    await page.locator('.play-btn').click()
    const playing = await until(async () => !((await page.locator('.time').textContent()) ?? '0:00').startsWith('0:00 '), 6000)
    await page.locator('.play-btn').click()
    const t1 = await page.locator('.time').textContent()
    assert(playing, `thời gian chạy khi phát (${t1})`)

    const audio = await page.evaluate(() => {
      const p = (window as unknown as Probe).__pvm.player
      return { hasAudio: p.hasAudio, chunks: p.chunksScheduled }
    })
    assert(audio.hasAudio && audio.chunks >= 2, `preview phát tiếng theo từng đoạn (đã phát ${audio.chunks} đoạn)`)

    // Tua sang bài 2 bằng phím
    await page.locator('.stage').hover()
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(300)
    const now = await page.locator('.now-playing').textContent()
    assert(now?.includes('Đêm Lofi Chill'), `tua tới bài 2 (${now})`)
    const seeked = await page.evaluate(() => (window as unknown as Probe).__pvm.player.time())
    assert(seeked > 38 && seeked < 45, `tua tới ${seeked.toFixed(2)}s`)

    // ---- Chỉnh trực tiếp trên preview ----
    const num = (label: string) => page.locator('label.field', { hasText: label }).locator('input.num').first()
    const selBox = page.locator('.sel-box')
    await selBox.waitFor()
    assert((await page.locator('.layer.selected').textContent())?.includes('Cột sóng nhạc'), 'mặc định chọn sẵn lớp cột sóng, có khung chọn trên preview')
    const x0 = Number(await num('Vị trí ngang').inputValue())
    const w0 = Number(await num('Chiều rộng').inputValue())
    let r = (await stableBox(selBox))
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
    await page.mouse.down()
    await page.mouse.move(r.x + r.width / 2 + 60, r.y + r.height / 2 - 40, { steps: 8 })
    await page.mouse.up()
    await until(async () => Number(await num('Vị trí ngang').inputValue()) > x0 + 2)
    const x1 = Number(await num('Vị trí ngang').inputValue())
    assert(x1 > x0 + 2, `kéo cột sóng sang phải: x ${x0}% → ${x1}%`)
    // Kéo gần giữa khung → bắt dính đúng 0.5
    r = (await stableBox(selBox))
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
    await page.mouse.down()
    await page.mouse.move(r.x + r.width / 2 - 60 + 3, r.y + r.height / 2, { steps: 8 })
    await page.mouse.up()
    assert(await until(async () => Number(await num('Vị trí ngang').inputValue()) === 50), 'bắt dính vào giữa khung hình (50%)')
    // Kéo ô vuông cạnh phải để rộng ra
    const handle = page.locator('.handle[data-handle="e"]')
    const hb = (await stableBox(handle))
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + hb.width / 2 + 50, hb.y + hb.height / 2, { steps: 8 })
    await page.mouse.up()
    await until(async () => Number(await num('Chiều rộng').inputValue()) > w0 + 3)
    const w1 = Number(await num('Chiều rộng').inputValue())
    assert(w1 > w0 + 3, `kéo ô vuông đổi chiều rộng: ${w0}% → ${w1}%`)
    await page.screenshot({ path: join(OUT, '2a-drag.png') })
    // Mỗi lần kéo là một bước hoàn tác
    await page.locator('.panel.right .panel-head h3').click()
    for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z')
    const undoOk = await until(async () => Number(await num('Vị trí ngang').inputValue()) === x0 && Number(await num('Chiều rộng').inputValue()) === w0)
    assert(undoOk, 'Ctrl+Z ×3 trả về vị trí và kích thước ban đầu')

    // Nhấp vào tên bài trên preview để chọn lớp chữ
    const stage = (await boxOf(page.locator('.stage-inner')))
    await page.mouse.click(stage.x + stage.width * 0.5, stage.y + stage.height * 0.16)
    assert(await until(async () => !!(await page.locator('.layer.selected').textContent())?.includes('Tên bài hát')), 'nhấp lên preview chọn đúng lớp chữ')
    const size0 = Number(await num('Cỡ chữ').inputValue())
    const corner = (await stableBox(page.locator('.handle[data-handle="se"]')))
    await page.mouse.move(corner.x + 5, corner.y + 5)
    await page.mouse.down()
    await page.mouse.move(corner.x + 45, corner.y + 25, { steps: 6 })
    await page.mouse.up()
    assert(await until(async () => Number(await num('Cỡ chữ').inputValue()) > size0), 'kéo góc phóng to chữ')

    // Nút Đăng ký: chọn trong danh sách → luôn hiện để canh → kéo tự do
    await page.locator('.layer', { hasText: 'Đăng ký / Like' }).click()
    await selBox.waitFor()
    r = (await stableBox(selBox))
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
    await page.mouse.down()
    await page.mouse.move(r.x + r.width / 2 - 200, r.y + r.height / 2 - 150, { steps: 8 })
    await page.mouse.up()
    const anchorSelect = page.locator('label.field', { hasText: 'Vị trí' }).locator('select').first()
    assert(await until(async () => (await anchorSelect.inputValue()) === 'free'), 'kéo nút Đăng ký → chuyển sang vị trí tự do')
    await page.locator('label.field', { hasText: 'Màu nút Đăng ký' }).locator('input[type="text"]').fill('#1e88e5')
    await page.locator('label.field', { hasText: 'Màu nút Đăng ký' }).locator('input[type="text"]').press('Enter')
    await page.waitForTimeout(200)
    await page.screenshot({ path: join(OUT, '2b-cta-free.png') })

    // ---- Timeline ----
    const state = () => page.evaluate(() => (window as unknown as Probe).__pvm.store.getState().project)
    const titles = async (): Promise<string[]> => (await state()).tracks.map((t) => t.title)
    const audioClips = page.locator('.tl-clip.t-audio')
    assert((await audioClips.count()) === 3, 'timeline có 3 clip nhạc')
    const dragBy = async (target: { x: number; y: number; width: number; height: number }, dx: number, dy = 0, at: 'center' | 'left' | 'right' = 'center'): Promise<void> => {
      const x = at === 'left' ? target.x + 3 : at === 'right' ? target.x + target.width - 3 : target.x + target.width / 2
      const y = target.y + target.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + dx, y + dy, { steps: 10 })
      await page.mouse.up()
    }
    // Kéo bài 3 lên đầu
    const c3 = (await boxOf(audioClips.nth(2)))
    const c1 = (await boxOf(audioClips.nth(0)))
    await dragBy(c3, c1.x + 10 - (c3.x + c3.width / 2))
    assert(await until(async () => (await titles())[0] === 'Bass Cực Mạnh (EDM)'), `kéo clip nhạc đổi thứ tự: ${(await titles()).join(' | ')}`)
    // Có tiếng ngay với thứ tự mới (không phải chờ ghép lại)
    const before = await page.evaluate(() => (window as unknown as Probe).__pvm.player.chunksScheduled)
    await page.keyboard.press('Home')
    await page.locator('.play-btn').click()
    await page.waitForTimeout(700)
    await page.locator('.play-btn').click()
    const after = await page.evaluate(() => (window as unknown as Probe).__pvm.player.chunksScheduled)
    assert(after > before, `phát tiếng ngay sau khi đổi thứ tự (${after - before} đoạn mới)`)
    await page.screenshot({ path: join(OUT, '4-timeline-reorder.png') })
    await page.locator('.timeline').focus()
    await page.keyboard.press('Control+z')
    assert(await until(async () => (await titles())[0] === 'Nắng Ấm Xa Dần'), 'Ctrl+Z trả lại thứ tự bài')

    // Cắt cuối bài 1 bằng cách kéo mép phải
    const edge = (await boxOf(audioClips.nth(0).locator('.tl-edge.r')))
    await dragBy(edge, -60)
    const trimmed = (await state()).tracks[0].trimEnd
    assert(trimmed > 1, `kéo mép phải clip để cắt cuối bài: cắt ${trimmed.toFixed(2)}s`)
    await page.keyboard.press('Control+z')
    assert(await until(async () => (await state()).tracks[0].trimEnd === 0), 'Ctrl+Z bỏ cắt bài')

    // Thanh cột sóng: kéo mép trái để bắt đầu muộn hơn
    // Chọn lớp trong danh sách → timeline tự cuộn tới hàng của nó
    await page.locator('.layer', { hasText: 'Cột sóng nhạc' }).click()
    const vizBar = page.locator('.tl-clip.t-visualizer')
    await page.waitForTimeout(150)
    const vb = (await boxOf(vizBar))
    await dragBy(vb, 250, 0, 'left')
    const vizStart = (await state()).layers.find((l) => l.type === 'visualizer')!.timing.start
    assert(vizStart > 5, `kéo mép trái thanh cột sóng: bắt đầu từ ${vizStart}s`)
    await page.keyboard.press('Home')
    assert(await until(async () => (await page.locator('.stage-hint').textContent())?.includes('chỉ hiện từ') ?? false), 'ở giây 0 cột sóng ẩn, preview báo khoảng thời gian hiện')
    assert((await page.locator('.sel-box').count()) === 0, 'không có khung chọn khi lớp đang ẩn')
    await page.screenshot({ path: join(OUT, '5-timeline-range.png') })
    await page.locator('.timeline').focus()
    await page.keyboard.press('Control+z')
    assert(await until(async () => (await state()).layers.find((l) => l.type === 'visualizer')!.timing.start === 0), 'Ctrl+Z trả lại thanh cột sóng')

    // Kéo THÂN thanh flicker đang chạy suốt video → bắt đầu muộn hơn, vẫn kéo dài đến hết video
    await page.locator('.layer', { hasText: 'Flicker' }).click()
    await page.waitForTimeout(150)
    const fb = await boxOf(page.locator('.tl-clip.t-flicker'))
    await dragBy({ ...fb, x: fb.x + fb.width / 2 - 20, width: 40 }, 150)
    const flick = (await state()).layers.find((l) => l.type === 'flicker')!.timing
    assert(flick.start > 5 && flick.end === null, `kéo thân thanh flicker: bắt đầu từ ${flick.start}s, vẫn đến hết video`)
    await page.locator('.timeline').focus()
    await page.keyboard.press('Control+z')
    assert(await until(async () => (await state()).layers.find((l) => l.type === 'flicker')!.timing.start === 0), 'Ctrl+Z trả lại thanh flicker')

    // Tách thanh flicker tại đầu phát (Ctrl+B) → hai đoạn nằm chung một hàng
    const flickers = async (): Promise<Array<{ id: string; row?: string; locked?: boolean; color?: string; timing: { start: number; end: number | null } }>> =>
      (await state()).layers.filter((l) => l.type === 'flicker')
    const flickRow = page.locator('.tl-row', { has: page.locator('.tl-clip.t-flicker') })
    const rulerBox = await boxOf(page.locator('.tl-ruler'))
    const seekAt = async (frac: number): Promise<void> => {
      const full = await boxOf(page.locator('.tl-clip.t-audio').last())
      const first = await boxOf(page.locator('.tl-clip.t-audio').first())
      await page.mouse.click(first.x + (full.x + full.width - first.x) * frac, rulerBox.y + rulerBox.height / 2)
    }
    await seekAt(0.4)
    await page.keyboard.press('Control+b')
    assert(await until(async () => (await flickers()).length === 2), 'Ctrl+B tách thanh flicker tại đầu phát')
    const [fA, fB] = await flickers()
    assert(
      !!fA.row && fA.row === fB.row && fA.timing.end !== null && Math.abs(fA.timing.end - fB.timing.start) < 0.02 && fB.timing.end === null && (await flickRow.count()) === 1 && (await flickRow.locator('.tl-clip').count()) === 2,
      `hai đoạn nằm chung một hàng (${fA.timing.start}–${fA.timing.end}s, ${fB.timing.start}s–hết video)`
    )
    // Ctrl + nhấp chọn thêm đoạn trước → kéo một thanh dời cả nhóm
    const flickBoxes = async (): Promise<Array<{ x: number; y: number; width: number; height: number }>> =>
      [await boxOf(flickRow.locator('.tl-clip').nth(0)), await boxOf(flickRow.locator('.tl-clip').nth(1))].sort((a, b) => a.x - b.x)
    const selectedIds = async (): Promise<string[]> => (await page.evaluate('window.__pvm.store.getState().selectedLayerIds')) as string[]
    let [leftBox] = await flickBoxes()
    await page.keyboard.down('Control')
    await page.mouse.click(leftBox.x + leftBox.width / 2, leftBox.y + leftBox.height / 2)
    await page.keyboard.up('Control')
    assert(await until(async () => (await selectedIds()).length === 2), 'Ctrl + nhấp chọn thêm đoạn thứ hai')
    const starts0 = (await flickers()).map((l) => l.timing.start)
    ;[leftBox] = await flickBoxes()
    await dragBy({ ...leftBox, x: leftBox.x + leftBox.width / 2 - 20, width: 40 }, 80)
    const starts1 = (await flickers()).map((l) => l.timing.start)
    const dA = starts1[0] - starts0[0]
    assert(dA > 1 && Math.abs(dA - (starts1[1] - starts0[1])) < 0.02, `kéo một thanh dời cả nhóm (+${dA.toFixed(2)}s mỗi đoạn)`)
    await page.keyboard.press('Control+z')
    assert(await until(async () => (await flickers())[0].timing.start === starts0[0]), 'Ctrl+Z trả lại cả nhóm')
    // Chép cả nhóm, dán ở đầu video
    await page.keyboard.press('Control+c')
    await seekAt(0.05)
    await page.keyboard.press('Control+v')
    assert(await until(async () => (await flickers()).length === 4), 'Ctrl+C / Ctrl+V chép và dán cả nhóm tại đầu phát')
    await page.keyboard.press('Control+z')
    assert(await until(async () => (await flickers()).length === 2), 'Ctrl+Z bỏ lần dán')
    // Khoá hàng flicker: không kéo, không xoá được
    await flickRow.locator('.tl-head').getByRole('button', { name: /^Khoá lớp/ }).click()
    assert(await until(async () => (await flickers()).every((l) => l.locked)), 'khoá hàng flicker')
    const lockedStarts = (await flickers()).map((l) => l.timing.start)
    ;[leftBox] = await flickBoxes()
    await dragBy({ ...leftBox, x: leftBox.x + leftBox.width / 2 - 20, width: 40 }, 80)
    await page.keyboard.press('Delete')
    await page.waitForTimeout(200)
    const fl = await flickers()
    assert(fl.length === 2 && fl.every((l, i) => l.timing.start === lockedStarts[i]), 'lớp đang khoá không kéo, không xoá được')
    await flickRow.locator('.tl-head').getByRole('button', { name: /^Đang khoá/ }).click()
    assert(await until(async () => (await flickers()).every((l) => !l.locked)), 'mở khoá hàng flicker')
    // Đổi màu hàng
    await flickRow.locator('.tl-dot').click()
    await page.locator('.tl-palette .swatch').nth(1).click()
    assert(await until(async () => (await flickers()).every((l) => l.color === ROW_COLORS[1])), 'đổi màu hàng flicker')
    await page.screenshot({ path: join(OUT, '5b-timeline-split.png') })
    // Preview nhẹ cho máy yếu
    const canvasW = (): Promise<number> => page.locator('.stage-canvas').evaluate((c) => (c as HTMLCanvasElement).width)
    const pickQuality = async (q: string): Promise<void> => {
      await page.locator('.preview-menu-btn').click()
      await page.locator(`.preview-menu button[data-q="${q}"]`).click()
    }
    await pickQuality('low')
    assert(await until(async () => (await canvasW()) === 480), 'preview nhẹ (¼): canvas 480px')
    await pickQuality('high')
    assert(await until(async () => (await canvasW()) === 1920), 'preview nét trở lại 1920px')

    // ---------- Bố cục cho màn hình laptop ----------
    const stageW = async (): Promise<number> => (await boxOf(page.locator('.stage-inner'))).width
    const w0Stage = await stageW()
    await page.locator('.panel-head h3').first().click() // bỏ focus khỏi ô nhập
    await page.keyboard.press('f')
    assert(
      // Ẩn hai cột bên và thu gọn timeline: preview to ra dù bị giới hạn bởi chiều ngang hay chiều cao
      await until(async () => (await page.locator('.panel-rail').count()) === 2 && (await stageW()) > w0Stage * 1.1),
      `phím F: tập trung preview (${Math.round(w0Stage)} → ${Math.round(await stageW())}px)`
    )
    await page.keyboard.press('f')
    assert(await until(async () => (await page.locator('.panel-rail').count()) === 0), 'phím F lần nữa: hiện lại hai cột')
    // Thu gọn cột trái bằng nút, mở lại bằng dải dọc
    await page.locator('.panel.left .collapse-btn').click()
    assert(await until(async () => (await page.locator('.panel-rail.left').count()) === 1), 'thu gọn cột playlist')
    await page.locator('.panel-rail.left').click()
    assert(await until(async () => (await page.locator('.panel.left').count()) === 1), 'mở lại cột playlist')
    // Kéo mép cột phải để đổi độ rộng
    const rightW0 = (await boxOf(page.locator('.panel.right'))).width
    const rz = await boxOf(page.locator('.col-resize.right'))
    await page.mouse.move(rz.x + rz.width / 2, rz.y + 120)
    await page.mouse.down()
    await page.mouse.move(rz.x + rz.width / 2 - 70, rz.y + 120, { steps: 6 })
    await page.mouse.up()
    const rightW1 = (await boxOf(page.locator('.panel.right'))).width
    // Cửa sổ hẹp: cột không rộng hết mức kéo vì preview luôn giữ tối thiểu 380px
    assert(rightW1 > rightW0 + 20, `kéo mép cột lớp hiệu ứng: ${Math.round(rightW0)} → ${Math.round(rightW1)}px`)
    // Nhóm thuộc tính đóng / mở; số hiện theo %
    await page.locator('.layer', { hasText: 'Cột sóng nhạc' }).click()
    const colorTitle = page.locator('button.section-title', { hasText: /Màu sắc/ })
    await colorTitle.click()
    assert(await until(async () => (await page.locator('label.field', { hasText: 'Màu chính' }).count()) === 0), 'đóng nhóm "Màu sắc" trong bảng thuộc tính')
    await colorTitle.click()
    assert(await until(async () => (await page.locator('label.field', { hasText: 'Màu chính' }).count()) === 1), 'mở lại nhóm "Màu sắc"')
    const opacityRow = page.locator('label.field', { hasText: 'Độ trong suốt' }).first()
    assert((await opacityRow.locator('.range-unit').textContent()) === '%' && Number(await opacityRow.locator('input.num').inputValue()) > 1, 'thông số tỉ lệ hiện theo %')
    // Bảng phím tắt
    await page.locator('.panel-head h3').first().click()
    await page.keyboard.press('?')
    assert(await until(async () => (await page.locator('.modal .shortcuts').count()) === 1), 'phím ? mở bảng phím tắt')
    await page.screenshot({ path: join(OUT, '9-shortcuts.png') })
    await page.keyboard.press('Escape')
    assert(await until(async () => (await page.locator('.modal').count()) === 0), 'Esc đóng bảng phím tắt')

    // ---------- Kéo thả, chọn hàng loạt như CapCut ----------
    const trackIds = async (): Promise<string[]> => (await page.evaluate('window.__pvm.store.getState().project.tracks.map((t) => t.id)')) as string[]
    const selTracks = async (): Promise<string[]> => (await page.evaluate('window.__pvm.store.getState().selectedTrackIds')) as string[]
    // Kéo file qua timeline: vạch vị trí thả + chữ báo trước kết quả
    const dragTip = (await page.evaluate(`(() => {
      const lane = document.querySelector('.tl-row.audio .tl-lane')
      const r = lane.getBoundingClientRect()
      const dt = new DataTransfer()
      dt.items.add(new File(['x'], 'nen.png', { type: 'image/png' }))
      lane.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width * 0.3, clientY: r.top + 10 }))
      return new Promise((ok) => setTimeout(() => {
        const tip = document.querySelector('.tl-tip')?.textContent ?? ''
        const line = !!document.querySelector('.tl-dropline')
        lane.dispatchEvent(new DragEvent('dragleave', { bubbles: true, dataTransfer: dt }))
        ok(line ? tip : '')
      }, 150))
    })()`)) as string
    assert(dragTip.includes('Thêm 1 nền'), `kéo ảnh qua timeline: hiện vạch vị trí thả ("${dragTip}")`)
    // Thả 2 ảnh vào giữa video → 2 lớp nền mới chung một hàng, mỗi ảnh một bài, preview hiện đúng ảnh
    const imgA = join(OUT, 'nen-1.png')
    const imgB = join(OUT, 'nen-2.png')
    for (const [f, c] of [[imgA, '0x2255ee'], [imgB, '0xee5522']] as const)
      spawnSync(ffmpegPath(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${c}:s=320x180`, '-frames:v', '1', f], { windowsHide: true })
    const bgBefore = (await state()).layers.filter((l) => l.type === 'background').length
    await page.evaluate(`window.__pvm.dropFiles(${JSON.stringify([imgB, imgA])}, 40, null)`)
    const dropped = async (): Promise<Array<{ id: string; row?: string; timing: { start: number; end: number | null }; props: Record<string, unknown> }>> =>
      (await state()).layers.filter((l) => l.type === 'background').slice(bgBefore)
    assert(await until(async () => (await dropped()).length === 2), 'thả 2 ảnh vào timeline: thêm 2 lớp nền')
    const [d1, d2] = await dropped()
    assert(
      d1.props.src === imgA && d2.props.src === imgB && !!d1.row && d1.row === d2.row && d1.timing.start === 40 && d2.timing.start > 40 && (await page.locator('.tl-clip.t-background').count()) === 3,
      `ảnh xếp theo tên, chung một hàng, ảnh đầu từ điểm thả (${d1.timing.start}s → ${d2.timing.start}s)`
    )
    assert(
      await until(async () => (await page.locator('.tl-clip.t-background.has-thumb .tl-thumbs').evaluateAll((els) => els.filter((e) => (e as HTMLElement).style.backgroundImage.includes('pvm://')).length)) >= 2),
      'thanh nền ảnh hiện ảnh thu nhỏ'
    )
    await page.evaluate('window.__pvm.player.seek(45); window.__pvm.store.getState().setTime(45)')
    const bluish = async (): Promise<boolean> =>
      (await page.evaluate(`(() => {
        const c = document.querySelector('.stage-canvas')
        const d = c.getContext('2d').getImageData(Math.round(c.width * 0.25), Math.round(c.height * 0.42), 1, 1).data
        return d[2] > d[0] + 30
      })()`)) as boolean
    assert(await until(bluish, 4000), 'preview hiện ảnh vừa thả tại đúng thời điểm')
    await page.locator('.timeline').focus()
    await page.keyboard.press('Control+z')
    assert(await until(async () => (await dropped()).length === 0), 'Ctrl+Z bỏ các nền vừa thả')
    // Video nền: thanh hiện dải khung hình trích bằng FFmpeg
    const vid = join(OUT, 'nen.mp4')
    spawnSync(ffmpegPath(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x180:rate=10', '-pix_fmt', 'yuv420p', vid], { windowsHide: true })
    await page.evaluate(`window.__pvm.dropFiles(${JSON.stringify([vid])}, 40, null)`)
    assert(
      await until(
        async () => (await page.locator('.tl-clip.t-background .tl-thumbs').evaluateAll((els) => els.filter((e) => /\.jpg/.test((e as HTMLElement).style.backgroundImage)).length)) === 1,
        15000
      ),
      'thanh nền video hiện dải khung hình'
    )
    await page.locator('.timeline').focus()
    await page.keyboard.press('Control+z')
    assert(await until(async () => (await dropped()).length === 0), 'Ctrl+Z bỏ video nền vừa thả')
    // Thả 1 bài nhạc vào đầu timeline → chèn vào vị trí 1
    const ids0 = await trackIds()
    await page.evaluate(`window.__pvm.dropFiles(${JSON.stringify([files[2]])}, 1, null)`)
    assert(await until(async () => (await trackIds()).length === 4 && !ids0.includes((await trackIds())[0])), 'thả nhạc vào đầu timeline: chèn vào vị trí 1')
    await page.keyboard.press('Control+z')
    assert(await until(async () => (await trackIds()).join() === ids0.join()), 'Ctrl+Z bỏ bài vừa chèn')
    // Ctrl + nhấp chọn 2 clip nhạc, kéo cả nhóm lên đầu
    await page.keyboard.down('Control')
    for (const i of [1, 2]) {
      const b = await boxOf(audioClips.nth(i))
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    }
    await page.keyboard.up('Control')
    assert(await until(async () => (await selTracks()).length === 2), 'Ctrl + nhấp chọn 2 clip nhạc')
    const first = await boxOf(audioClips.nth(0))
    await dragBy(await boxOf(audioClips.nth(2)), first.x + 5 - ((await boxOf(audioClips.nth(2))).x + (await boxOf(audioClips.nth(2))).width / 2))
    assert(await until(async () => (await trackIds()).join() === [ids0[1], ids0[2], ids0[0]].join()), 'kéo cả nhóm 2 bài lên đầu, giữ thứ tự giữa chúng')
    await page.locator('.timeline').focus()
    await page.keyboard.press('Control+z')
    assert(await until(async () => (await trackIds()).join() === ids0.join()), 'Ctrl+Z trả lại thứ tự')
    // Chép 1 clip nhạc, dán ở đầu video (lặp bài)
    const b0 = await boxOf(audioClips.nth(0))
    await page.mouse.click(b0.x + b0.width / 2, b0.y + b0.height / 2)
    await page.keyboard.press('Control+c')
    await seekAt(0.02)
    await page.keyboard.press('Control+v')
    assert(await until(async () => (await trackIds()).length === 4), 'Ctrl+C / Ctrl+V chép và dán clip nhạc')
    assert(
      await until(async () => (await page.evaluate('window.__pvm.store.getState().project.tracks.every((t) => t.analysisKey)')) as boolean),
      'bài dán ra dùng ngay dữ liệu âm thanh sẵn có'
    )
    await page.locator('.timeline').focus()
    await page.keyboard.press('Control+z')
    assert(await until(async () => (await trackIds()).length === 3), 'Ctrl+Z bỏ bài vừa dán')
    // Kéo khung trên vùng trống (sau cuối video) để khoanh nhiều thanh + clip nhạc
    // Đo khi bố cục đã đứng yên: sau Ctrl+Z video ngắn lại, timeline tự chỉnh mức zoom "vừa khung" ở khung hình kế tiếp
    const lastClip = await stableBox(audioClips.nth(2))
    const endX = lastClip.x + lastClip.width
    const audioRowBox = await boxOf(page.locator('.tl-row.audio'))
    // Bắt đầu ở giữa dải các hàng lớp đang nhìn thấy (giữa thước thời gian ghim ở trên và hàng nhạc ghim ở dưới)
    const rulerBottom = (await boxOf(page.locator('.tl-ruler'))).y + RULER_BAR_H
    const firstRow = { y: rulerBottom, height: Math.max(2, audioRowBox.y - rulerBottom) }
    const mx = endX + 15
    const my = firstRow.y + firstRow.height / 2
    const under = (await page.evaluate(`(() => { const el = document.elementFromPoint(${mx}, ${my}); const h = el && el.closest('[data-hit]'); return (el ? el.className : 'null') + ' / ' + (h ? h.dataset.hit : '-') })()`)) as string
    await page.mouse.move(mx, my)
    await page.mouse.down()
    await page.mouse.move(endX - 40, audioRowBox.y + audioRowBox.height / 2, { steps: 8 })
    const marqueeBox = (await page.locator('.tl-marquee').count()) ? await page.locator('.tl-marquee').boundingBox() : null
    await page.screenshot({ path: join(OUT, '5c-marquee.png') })
    await page.mouse.up()
    const selL = (await page.evaluate('window.__pvm.store.getState().selectedLayerIds.length')) as number
    assert(
      !!marqueeBox && selL >= 2 && (await selTracks()).length >= 1,
      `kéo khung chọn ${selL} thanh và ${(await selTracks()).length} clip nhạc (điểm bắt đầu ${Math.round(mx)},${Math.round(my)} trên "${under}", khung ${JSON.stringify(marqueeBox)}, dải hàng ${JSON.stringify(firstRow)}, hàng nhạc ${JSON.stringify(audioRowBox)}, cuối video x=${endX})`
    )
    await page.locator('.timeline').focus()
    await page.keyboard.press('Escape')
    assert(await until(async () => ((await page.evaluate('window.__pvm.store.getState().selectedLayerIds.length')) as number) + (await selTracks()).length === 1), 'Esc bỏ chọn nhóm')

    // ---------- Menu chuột phải ----------
    const ctxItem = (label: RegExp) => page.locator('.ctx-menu .ctx-item', { has: page.locator('.ctx-label', { hasText: label }) })
    const vizLocked = async (): Promise<boolean> => !!(await state()).layers.find((l) => l.type === 'visualizer')!.locked
    await page.locator('.tl-clip.t-visualizer').click({ button: 'right' })
    await page.locator('.ctx-menu').waitFor()
    await page.screenshot({ path: join(OUT, '5d-context-menu.png') })
    await ctxItem(/^Khoá$/).click()
    assert(await until(vizLocked), 'chuột phải thanh cột sóng → Khoá')
    await page.locator('.tl-clip.t-visualizer').click({ button: 'right' })
    await ctxItem(/^Mở khoá$/).click()
    assert(await until(async () => !(await vizLocked())), 'chuột phải → Mở khoá')
    const ids1 = await trackIds()
    await audioClips.nth(1).click({ button: 'right' })
    await ctxItem(/^Nhân bản bài$/).click()
    assert(await until(async () => (await trackIds()).length === 4 && (await trackIds())[1] === ids1[1] && !ids1.includes((await trackIds())[2])), 'chuột phải clip nhạc → Nhân bản bài (bản sao ngay sau bài gốc)')
    await page.locator('.timeline').focus()
    await page.keyboard.press('Control+z')
    assert(await until(async () => (await trackIds()).length === 3), 'Ctrl+Z bỏ bài nhân bản')
    const endBox = await stableBox(audioClips.nth(2))
    const band = (await boxOf(page.locator('.tl-ruler'))).y + RULER_BAR_H
    await page.mouse.click(endBox.x + endBox.width + 15, band + (audioRowBox.y - band) / 2, { button: 'right' })
    await ctxItem(/^Chọn tất cả$/).click()
    const allCount = ((await state()).layers.filter((l) => l.type !== 'cta').length + (await state()).tracks.length) as number
    assert(
      await until(async () => ((await page.evaluate('window.__pvm.store.getState().selectedLayerIds.length + window.__pvm.store.getState().selectedTrackIds.length')) as number) === allCount),
      `chuột phải vùng trống → Chọn tất cả (${allCount} mục)`
    )
    await page.keyboard.press('Escape')

    // ---------- Xem toàn màn hình, vùng an toàn YouTube ----------
    const stageW0 = (await boxOf(page.locator('.stage-inner'))).width
    await page.locator('.transport').getByRole('button', { name: /Xem toàn màn hình/ }).click()
    assert(
      await until(async () => (await page.locator('.preview.maximized').count()) === 1 && (await boxOf(page.locator('.stage-inner'))).width > stageW0 * 1.2),
      `xem preview toàn màn hình (${Math.round(stageW0)} → ${Math.round((await boxOf(page.locator('.stage-inner'))).width)}px)`
    )
    await page.keyboard.press('Escape')
    assert(await until(async () => (await page.locator('.preview.maximized').count()) === 0, 5000), 'Esc thoát toàn màn hình')
    await page.locator('.preview-menu-btn').click()
    await page.locator('.preview-menu button[data-safe]').click()
    assert(await until(async () => (await page.locator('.safe-zone').count()) === 2), 'bật vùng an toàn YouTube: 2 vùng (tiêu đề, thanh điều khiển)')
    await page.keyboard.press('Escape')
    await page.screenshot({ path: join(OUT, '9b-safe-area.png') })
    await page.locator('.preview-menu-btn').click()
    await page.locator('.preview-menu button[data-safe]').click()
    assert(await until(async () => (await page.locator('.safe-zone').count()) === 0), 'tắt vùng an toàn')
    await page.locator('.panel-head h3').first().click() // đóng menu

    // Nút Đăng ký: kéo lần hiện tự động → thành mốc tự chỉnh
    await page.locator('.layer', { hasText: 'Đăng ký / Like' }).click()
    await page.waitForTimeout(150)
    const ctaClips = page.locator('.tl-clip.t-cta')
    const n0 = await ctaClips.count()
    const cb = (await boxOf(ctaClips.first()))
    await dragBy(cb, 120)
    const cta = (await state()).layers.find((l) => l.type === 'cta')!.props
    assert(cta.schedule === 'times' && String(cta.times).length > 0, `kéo lần hiện nút Đăng ký → mốc ${cta.times}`)
    // Nhấp đúp vào chỗ trống trong hàng để thêm lần hiện, Delete để xoá
    const lane = (await boxOf(page.locator('.tl-row', { has: page.locator('.tl-clip.t-cta') }).locator('.tl-lane')))
    await page.mouse.dblclick(lane.x + lane.width * 0.7, lane.y + lane.height / 2)
    assert(await until(async () => (await ctaClips.count()) === n0 + 1), 'nhấp đúp hàng Đăng ký thêm một lần hiện')
    await page.keyboard.press('Delete')
    assert(await until(async () => (await ctaClips.count()) === n0), 'Delete xoá lần hiện đang chọn')

    // Zoom
    const clipW0 = (await boxOf(audioClips.nth(0))).width
    await page.getByRole('button', { name: 'Phóng to' }).click()
    await page.getByRole('button', { name: 'Phóng to' }).click()
    assert(await until(async () => (await boxOf(audioClips.nth(0))).width > clipW0 * 1.8), 'nút phóng to timeline')
    await page.getByRole('button', { name: 'Vừa khung' }).click()
    assert(
      await until(async () => (await page.locator('.tl-scroll').evaluate((el) => el.scrollLeft)) === 0 && (await boxOf(audioClips.nth(0))).width < clipW0 * 1.2),
      '"Vừa khung" hiện lại toàn bộ video từ 0:00'
    )
    await page.screenshot({ path: join(OUT, '6-timeline.png') })

    // Đổi kiểu cột sóng sang vòng tròn
    await page.locator('.layer', { hasText: 'Cột sóng nhạc' }).click()
    await page.waitForTimeout(100)
    const styleSelect = page.locator('.inspector select').first()
    await styleSelect.selectOption('circle')
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(OUT, '2-circle.png') })
    assert((await styleSelect.inputValue()) === 'circle', 'đổi visualizer sang vòng tròn')

    // Undo
    await page.locator('.panel.right .panel-head h3').click() // bỏ focus khỏi ô chọn
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    assert(await until(async () => (await page.locator('.inspector select').first().inputValue()) === 'bars'), 'Ctrl+Z hoàn tác')

    // Timestamp
    await page.getByRole('button', { name: /Timestamp YouTube/ }).click()
    const chapters = await page.locator('textarea.chapters').inputValue()
    console.log(chapters.split('\n').map((l) => `      ${l}`).join('\n'))
    assert(chapters.startsWith('0:00 Nắng Ấm Xa Dần - Ca Sĩ Thử Nghiệm'), 'timestamp bắt đầu 0:00')
    assert(chapters.split('\n').length === 3, 'có 3 dòng timestamp')
    await page.keyboard.press('Escape')

    // Bộ lọc màu: thêm lớp, lưới ảnh mẫu, chọn "Đen trắng" cho cả khung hình → preview mất màu
    await page.getByRole('button', { name: 'Thêm lớp' }).click()
    await page.getByRole('button', { name: 'Bộ lọc màu' }).click()
    assert(await until(async () => (await page.locator('.filter-thumb img').count()) >= 13, 10000), 'thêm lớp bộ lọc màu, hiện lưới 13 ảnh mẫu')
    const layerOrder = async (): Promise<string> => (await state()).layers.map((l) => l.type).join('>')
    assert((await layerOrder()).startsWith('background>filter'), 'bộ lọc mới nằm ngay trên lớp nền (chỉ lọc ảnh nền)')
    await page.locator('.filter-thumb', { hasText: 'Đen trắng' }).click()
    await page.getByRole('button', { name: 'Lọc cả khung hình' }).click()
    assert(await until(async () => (await layerOrder()).endsWith('>filter')), 'nút "Lọc cả khung hình" đưa bộ lọc lên trên cùng')
    const colorfulness = (): Promise<number> =>
      page.evaluate(`(() => {
        const c = document.querySelector('.stage-canvas')
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let worst = 0
        for (let i = 0; i < d.length; i += 4 * 97) worst = Math.max(worst, Math.abs(d[i] - d[i + 1]), Math.abs(d[i + 1] - d[i + 2]))
        return worst
      })()`) as Promise<number>
    assert(await until(async () => (await colorfulness()) <= 3), `preview đen trắng (lệch màu tối đa ${await colorfulness()})`)
    await page.screenshot({ path: join(OUT, '7-filter.png') })

    // Bộ nhớ đệm: xem dung lượng, xoá → các bài tự phân tích lại
    await page.getByRole('button', { name: 'Cài đặt project' }).click()
    const cacheInfo = page.locator('.cache-info b')
    assert(await until(async () => /MB|GB/.test((await cacheInfo.textContent()) ?? '')), `Cài đặt hiện dung lượng bộ nhớ đệm (${await cacheInfo.textContent()})`)
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'Xoá bộ nhớ đệm' }).click()
    assert(await until(async () => /KB/.test((await cacheInfo.textContent()) ?? ''), 10000), 'xoá bộ nhớ đệm')
    await page.keyboard.press('Escape')
    await page.locator('.chip.ok').waitFor({ timeout: 60000 })
    assert(true, 'các bài được phân tích lại, âm thanh sẵn sàng trở lại')

    // Xuất thử 15 giây (giả lập hộp thoại chọn nơi lưu)
    const outFile = join(OUT, 'e2e-export.mp4')
    await app.evaluate(({ dialog }, out) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: out })) as typeof dialog.showSaveDialog
    }, outFile)
    await page.getByRole('button', { name: 'Xuất video', exact: true }).click()
    await page.getByRole('button', { name: /Xuất thử 15 giây/ }).click()
    await page.locator('.success-box, .error-box').first().waitFor({ timeout: 180000 })
    const err = await page.locator('.error-box').count()
    if (err) console.error(await page.locator('.error-box').textContent())
    assert(err === 0, 'xuất thử không lỗi')
    await page.screenshot({ path: join(OUT, '3-exported.png') })
    const testFile = outFile.replace(/\.mp4$/, ' (xem thử).mp4')
    assert(existsSync(testFile), 'có file video xuất thử')
    const dur = mediaDuration(testFile)
    // Bộ lọc đen trắng phủ cả khung hình → video xuất ra cũng mất màu (đúng như preview)
    const px = spawnSync(ffmpegPath(), ['-v', 'error', '-ss', '5', '-i', testFile, '-frames:v', '1', '-vf', 'scale=64:36', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true })
    let worstPx = 0
    for (let i = 0; i + 2 < px.stdout.length; i += 3) worstPx = Math.max(worstPx, Math.abs(px.stdout[i] - px.stdout[i + 1]), Math.abs(px.stdout[i + 1] - px.stdout[i + 2]))
    assert(px.stdout.length === 64 * 36 * 3 && worstPx <= 12, `video xuất ra cũng đen trắng (lệch màu tối đa ${worstPx})`)
    assert(Math.abs(dur - 15) < 0.2, `thời lượng video ~15s (${dur})`)
    // Lặp playlist thủ công: thêm lại bài đã phân tích → bản mới dùng ngay dữ liệu trong cache
    await page.evaluate(`window.api.importMedia([${JSON.stringify(files[0])}]).then((t) => window.__pvm.store.getState().addTracks(t))`)
    const allAnalyzed = (): Promise<boolean> =>
      page.evaluate('window.__pvm.store.getState().project.tracks.length === 4 && window.__pvm.store.getState().project.tracks.every((t) => t.analysisKey)') as Promise<boolean>
    assert(await until(allAnalyzed, 8000), 'thêm lại một bài (lặp playlist): bản mới có ngay dữ liệu âm thanh')
    assert(await until(async () => ((await page.locator('.status-chips').textContent()) ?? '').includes('Âm thanh sẵn sàng')), 'vẫn báo âm thanh sẵn sàng')
    await page.evaluate('window.__pvm.store.getState().undo()')
    assert(await until(async () => (await state()).tracks.length === 3), 'Ctrl+Z bỏ bài vừa thêm')

    // Giao diện tiếng Anh: bấm EN → chữ đổi ngay (kể cả tên lớp mặc định); bấm VI → trở lại
    await page.keyboard.press('Escape') // đóng hộp thoại xuất video
    const exportBtn = page.locator('.topbar .btn.primary')
    await page.locator('.lang-switch button', { hasText: 'EN' }).click()
    assert(await until(async () => (await exportBtn.textContent())?.includes('Export video') ?? false), 'bấm EN: giao diện chuyển sang tiếng Anh')
    assert(
      (await page.locator('.layer', { hasText: 'Visualizer' }).count()) > 0 && ((await page.locator('.tl-hint').textContent()) ?? '').includes('shortcuts'),
      'tên lớp và gợi ý trên timeline cũng bằng tiếng Anh'
    )
    await page.screenshot({ path: join(OUT, '8-english.png') })
    await page.locator('.lang-switch button', { hasText: 'VI' }).click()
    assert(await until(async () => (await exportBtn.textContent())?.includes('Xuất video') ?? false), 'bấm VI: trở lại tiếng Việt')

    // Thư viện (cột trái): hiệu ứng, bộ lọc, chữ mẫu, ảnh/video — bấm để thêm, kéo vào timeline để đặt đúng chỗ
    type L = { id: string; type: string; name: string; timing: { start: number; end: number | null }; props: Record<string, unknown> }
    const layersNow = async (): Promise<L[]> => (await state()).layers as L[]
    const undo = async (): Promise<void> => {
      await page.evaluate('window.__pvm.store.getState().undo()')
    }
    // Cả video vừa khung timeline: các thanh đều nằm trong vùng nhìn thấy (không bị cột tên hàng che)
    await page.getByRole('button', { name: 'Vừa khung' }).click()
    await page.locator('.lib-tab[data-tab="effects"]').click()
    assert(
      await until(async () => (await page.locator('.lib-card img[src^="data:image/jpeg"]').count()) >= 20, 15000),
      `thẻ Hiệu ứng: ảnh xem trước vẽ bằng engine (${await page.locator('.lib-card img[src^="data:image/jpeg"]').count()} mẫu)`
    )
    // Ảnh xem trước có nội dung (không phải ô trống một màu)
    const thumbSpread = (await page.evaluate(`(() => new Promise((ok) => {
      const img = document.querySelector('.lib-card[data-item="viz-rainbow"] img')
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0)
      const d = g.getImageData(0, 0, c.width, c.height).data
      let lo = 255, hi = 0
      for (let i = 0; i < d.length; i += 4 * 13) { lo = Math.min(lo, d[i + 1]); hi = Math.max(hi, d[i + 1]) }
      ok(hi - lo)
    }))()`)) as number
    assert(thumbSpread > 60, `ảnh xem trước "Cột cầu vồng" có hình (độ tương phản ${thumbSpread})`)
    const nLayers = (await layersNow()).length
    await page.locator('.lib-card[data-item="pt-snow"]').click()
    assert(
      await until(async () => {
        const top = (await layersNow()).at(-1)!
        return top.type === 'particles' && top.props.style === 'snow' && top.timing.start === 0 && top.timing.end === null
      }),
      'bấm "Tuyết rơi": thêm lớp hạt tuyết cho cả video'
    )
    await undo()
    assert(await until(async () => (await layersNow()).length === nLayers), 'Ctrl+Z bỏ lớp vừa thêm')
    // Đồng hồ đếm giờ: thêm mẫu Pomodoro từ thư viện, đổi kiểu trong bảng thuộc tính
    await page.locator('.lib-card[data-item="tm-pomodoro"]').click()
    const topLayer = async (): Promise<L> => (await layersNow()).at(-1)!
    assert(
      await until(async () => {
        const l = await topLayer()
        return l.type === 'timer' && l.props.mode === 'countdown' && l.props.style === 'ring' && l.props.label === 'Tập trung'
      }),
      'bấm "Pomodoro 25 phút": thêm đồng hồ đếm ngược dạng vòng'
    )
    assert(await until(async () => (await page.locator('.sel-box').count()) === 1), 'đồng hồ có khung chọn trên preview (kéo, đổi cỡ được)')
    const timerStyle = page.locator('label.field').filter({ has: page.locator('.field-label', { hasText: /^Kiểu$/ }) }).locator('select')
    await timerStyle.selectOption('digital')
    assert(await until(async () => (await topLayer()).props.style === 'digital'), 'đổi kiểu đồng hồ sang đèn LED')
    await undo()
    await undo()
    assert(await until(async () => (await layersNow()).length === nLayers), 'Ctrl+Z bỏ đồng hồ vừa thêm')
    // Kéo chữ mẫu vào giữa bài thứ hai → hiện từ chỗ thả đến hết bài đó
    await page.locator('.lib-tab[data-tab="text"]').click()
    const neon = page.locator('.lib-card[data-item="txt-neon"]')
    await neon.waitFor()
    // Thả vào giữa clip nhạc thứ hai (cả thanh đang nằm trong vùng nhìn thấy)
    await stableBox(audioClips.nth(1))
    await neon.dragTo(audioClips.nth(1))
    assert(
      await until(async () => (await layersNow()).length === nLayers + 1),
      'kéo "Chữ neon" từ thư viện thả vào timeline: thêm lớp chữ'
    )
    const neonLayer = (await layersNow()).at(-1)!
    const t2 = (await state()).tracks
    assert(
      neonLayer.type === 'text' && neonLayer.props.font === 'Bungee' && neonLayer.timing.start > 30 && neonLayer.timing.end !== null && neonLayer.timing.end > neonLayer.timing.start && neonLayer.timing.end < 3 * 40 && t2.length === 3,
      `chữ hiện từ chỗ thả đến hết bài thứ hai (${neonLayer.timing.start}s → ${neonLayer.timing.end}s)`
    )
    await undo()
    // Bộ lọc: thả "Ấm áp" lên hàng của lớp bộ lọc đang có → đổi mẫu của lớp đó
    await page.locator('.lib-tab[data-tab="filters"]').click()
    const filterLayer = (await layersNow()).find((l) => l.type === 'filter')!
    const filterBar = page.locator(`.tl-clip[data-hit="layer"][data-id="${filterLayer.id}"]`)
    await filterBar.scrollIntoViewIfNeeded()
    await stableBox(filterBar)
    await page.locator('.lib-card[data-item="warm"]').dragTo(filterBar)
    assert(
      await until(async () => (await layersNow()).find((l) => l.id === filterLayer.id)?.props.preset === 'warm' && (await layersNow()).length === nLayers),
      'thả bộ lọc "Ấm áp" lên hàng bộ lọc có sẵn: đổi mẫu, không thêm lớp'
    )
    await undo()
    assert(await until(async () => (await layersNow()).find((l) => l.id === filterLayer.id)?.props.preset === 'bw'), 'Ctrl+Z trả lại bộ lọc đen trắng')
    // Ảnh / video: nhập vào thư viện, kéo vào timeline → nền mới từ chỗ thả
    await page.evaluate(`window.__pvm.store.getState().addLibraryMedia(${JSON.stringify([imgA])})`)
    await page.locator('.lib-tab[data-tab="media"]').click()
    const media = page.locator('.lib-card.media')
    assert(await until(async () => (await media.count()) === 1 && ((await media.locator('img').getAttribute('src')) ?? '').startsWith('pvm://')), 'thẻ Ảnh/video: ảnh vừa nhập có ảnh thu nhỏ')
    const bgN = (await layersNow()).filter((l) => l.type === 'background').length
    await stableBox(audioClips.nth(0))
    await media.dragTo(audioClips.nth(0))
    assert(
      await until(async () => {
        const bgs = (await layersNow()).filter((l) => l.type === 'background')
        return bgs.length === bgN + 1 && bgs.some((l) => l.props.src === imgA && l.timing.start > 0)
      }),
      'kéo ảnh từ thư viện vào timeline: thêm nền từ chỗ thả'
    )
    await undo()
    await undo()
    assert(await until(async () => (await layersNow()).filter((l) => l.type === 'background').length === bgN), 'Ctrl+Z bỏ nền vừa thêm')
    await page.locator('.lib-tab[data-tab="music"]').click()
    await page.screenshot({ path: join(OUT, '9-library.png') })

    // Mẫu phong cách: áp EDM cho project (giữ nhạc) → Ctrl+Z; lưu phong cách thành mẫu riêng rồi xoá
    const layersBefore = (await layersNow()).map((l) => l.id).join()
    await page.getByRole('button', { name: 'Mẫu phong cách' }).click()
    assert(await until(async () => (await page.locator('.tpl-card img[src^="data:image/jpeg"]').count()) >= 7, 15000), 'hộp Mẫu phong cách: 7 mẫu có ảnh xem trước')
    await page.screenshot({ path: join(OUT, '10-styles.png') })
    await page.locator('.tpl-card[data-template="edm"] .tpl-pick').click()
    assert(
      await until(async () => (await layersNow()).some((l) => l.type === 'visualizer' && l.props.style === 'mirror') && (await state()).tracks.length === 3),
      'áp mẫu EDM: đổi cột sóng, giữ nguyên 3 bài nhạc'
    )
    await undo()
    assert(await until(async () => (await layersNow()).map((l) => l.id).join() === layersBefore), 'Ctrl+Z trả lại phong cách cũ')
    // Tạo mẫu từ video đang làm: chỉ giữ lớp dùng suốt video (các đoạn flicker đã tách bị bỏ)
    await page.getByRole('button', { name: 'Mẫu phong cách' }).click()
    await page.getByRole('button', { name: 'Tạo mẫu từ video này' }).click()
    const saveForm = page.locator('.tpl-save-form')
    await saveForm.waitFor()
    const keptText = (await saveForm.locator('.tpl-layers:not(.skipped)').textContent()) ?? ''
    const skippedText = (await saveForm.locator('.tpl-layers.skipped').textContent()) ?? ''
    assert(
      keptText.includes('Cột sóng nhạc') && keptText.includes('Bộ lọc màu') && skippedText.includes('Flicker') && !keptText.includes('Flicker'),
      'tạo mẫu: giữ lớp dùng suốt video, bỏ các đoạn flicker đã tách'
    )
    await saveForm.locator('input').fill('Mẫu e2e')
    await saveForm.getByRole('button', { name: 'Lưu mẫu' }).click()
    const customCards = page.locator('.tpl-custom .tpl-card')
    assert(await until(async () => (await customCards.count()) === 1 && ((await customCards.textContent()) ?? '').includes('Mẫu e2e'), 5000), 'lưu mẫu, mẫu hiện trong "Mẫu của bạn"')
    const tplDir = join(OUT, 'userdata', 'templates')
    const tplFiles = existsSync(tplDir) ? readdirSync(tplDir).filter((f) => f.endsWith('.json')) : []
    const saved = tplFiles.length === 1 ? (JSON.parse(readFileSync(join(tplDir, tplFiles[0]), 'utf8')) as { layers: L[]; settings?: { width: number; fps: number } }) : null
    assert(
      !!saved && saved.layers.every((l) => l.timing.end === null && l.type !== 'flicker') && saved.settings?.width === 1920 && saved.settings.fps === 30,
      `mẫu lưu thành file: ${saved?.layers.length} lớp đều hiện suốt video, kèm khung hình 1920×1080 30 fps`
    )
    await page.keyboard.press('Escape')

    // Video mới từ mẫu vừa tạo: chọn nền mới, thêm nhạc (giả lập hộp thoại chọn file)
    await app.evaluate(
      ({ dialog }, [img, song]) => {
        dialog.showOpenDialog = (async (_win: unknown, opts: { filters?: Array<{ extensions: string[] }> }) => ({
          canceled: false,
          filePaths: opts?.filters?.some((f) => f.extensions.includes('mp3')) ? [song] : [img]
        })) as unknown as typeof dialog.showOpenDialog
      },
      [imgA, files[1]]
    )
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'Project mới' }).click()
    await page.locator('.tpl-custom .tpl-card .tpl-pick').first().click()
    await page.locator('.start-steps').waitFor()
    assert(
      await until(async () => (await state()).tracks.length === 0 && (await layersNow()).some((l) => l.type === 'filter' && l.props.preset === 'bw') && !(await layersNow()).some((l) => l.type === 'flicker')),
      'Project mới từ mẫu: có đủ phong cách của video cũ, chưa có nhạc'
    )
    await page.getByRole('button', { name: 'Chọn ảnh / video…' }).click()
    assert(
      await until(async () => (await layersNow()).filter((l) => l.type === 'background').some((l) => l.props.src === imgA && l.props.mode === 'image')),
      'bước tiếp theo: đổi ảnh nền cho video mới'
    )
    await page.getByRole('button', { name: 'Thêm nhạc…' }).click()
    assert(await until(async () => (await state()).tracks.length === 1, 10000), 'bước tiếp theo: thêm nhạc cho video mới')
    await page.screenshot({ path: join(OUT, '11-new-from-template.png') })
    await page.getByRole('button', { name: 'Xong' }).click()
    assert(await until(async () => (await page.locator('.start-steps').count()) === 0), 'bấm Xong: vào làm video mới')

    // Xoá mẫu riêng (bấm hai lần để xác nhận)
    await page.getByRole('button', { name: 'Mẫu phong cách' }).click()
    await customCards.hover()
    await customCards.locator('.tpl-delete').click()
    await customCards.locator('.tpl-delete').click()
    assert(await until(async () => (await customCards.count()) === 0 && readdirSync(tplDir).length === 0), 'xoá mẫu riêng (bấm hai lần để xác nhận)')
    await page.keyboard.press('Escape')

    // Lỡ thả một đường link vào cửa sổ: không chỗ nào nhận nên bị chặn, app không chuyển trang
    const dropBlocked = await page.evaluate(`(() => {
      const dt = new DataTransfer()
      dt.setData('text/uri-list', 'https://example.com/')
      const target = document.querySelector('.stage-canvas')
      const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })
      const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
      target.dispatchEvent(over)
      target.dispatchEvent(drop)
      return over.defaultPrevented && drop.defaultPrevented
    })()`)
    assert(dropBlocked === true, 'thả đường link vào cửa sổ không làm app chuyển trang')
    // Lớp chặn thứ hai ở tiến trình chính: có gì cố chuyển trang cũng bị giữ lại.
    // (Bỏ đánh dấu "chưa lưu" trước, nếu không hộp thoại "Project chưa lưu" sẽ hiện ra chờ bấm.)
    await page.evaluate('window.__pvm.store.setState({ dirty: false })')
    const appUrl = page.url()
    await page.evaluate("location.href = 'https://example.com/'")
    await new Promise((r) => setTimeout(r, 1000))
    assert(page.url() === appUrl && (await page.locator('section.timeline').count()) === 1, 'không bị chuyển sang trang web lạ')
    console.log('\nTẤT CẢ KIỂM THỬ ĐỀU QUA')
    // Lỗi / cảnh báo không làm bước nào thất bại vẫn cần thấy (vd. lỗi chỉ xảy ra trên một hệ điều hành)
    if (problems.length) console.log(`\nLỗi / cảnh báo ghi nhận trong lúc chạy (${problems.length}):\n${problems.map((p) => `  ${p}`).join('\n')}`)
    annotate('notice', `E2E ${process.platform}: qua ${passed.length} bước`, `${await diagnostics()}\n${passed.join('\n')}`)
  } catch (err) {
    // Thu thập chẩn đoán khi app còn mở
    failDiag = await diagnostics()
    await pageRef?.screenshot({ path: join(OUT, 'fail.png') }).catch(() => undefined)
    throw err
  } finally {
    await app.evaluate(({ app: a }) => a.exit(0)).catch(() => undefined)
  }
}

main().catch(async (err) => {
  console.error(err)
  const diag = failDiag || (await diagnostics())
  annotate(
    'error',
    `E2E ${process.platform} thất bại`,
    [
      String((err as Error)?.message ?? err).slice(0, 1500),
      '',
      `Đã qua ${passed.length} bước, bước cuối: ${passed[passed.length - 1] ?? '(chưa có)'}`,
      `Chẩn đoán: ${diag}`,
      '',
      'Lỗi / cảnh báo từ app:',
      ...problems.slice(-12)
    ].join('\n')
  )
  await appRef?.evaluate(({ app: a }) => a.exit(1)).catch(() => undefined)
  process.exit(1)
})
