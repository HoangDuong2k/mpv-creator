/**
 * Kiểm thử end-to-end: mở app đã build, nhập nhạc, phát, tua, đổi hiệu ứng,
 * undo, lấy timestamp và xuất thử một đoạn video. Chạy: npm run build && npm run e2e
 * Bản đã đóng gói: PVM_E2E_EXE=release/linux-unpacked/playlist-video-maker npm run e2e
 *   (Windows: PVM_E2E_EXE="release/win-unpacked/Playlist Video Maker.exe")
 */
import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { ffmpegPath } from '../src/main/ffmpeg'
import { makeTestAudio } from './make-test-audio'

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
          layers: Array<{ type: string; name: string; timing: { start: number; end: number | null }; props: Record<string, unknown> }>
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
    await page.getByText('Âm thanh sẵn sàng').waitFor({ timeout: 60000 })
    assert(true, 'phân tích + ghép âm thanh xong')
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
    await until(async () => Number(await num('Vị trí ngang').inputValue()) > x0 + 0.02)
    const x1 = Number(await num('Vị trí ngang').inputValue())
    assert(x1 > x0 + 0.02, `kéo cột sóng sang phải: x ${x0} → ${x1}`)
    // Kéo gần giữa khung → bắt dính đúng 0.5
    r = (await stableBox(selBox))
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
    await page.mouse.down()
    await page.mouse.move(r.x + r.width / 2 - 60 + 3, r.y + r.height / 2, { steps: 8 })
    await page.mouse.up()
    assert(await until(async () => Number(await num('Vị trí ngang').inputValue()) === 0.5), 'bắt dính vào giữa khung hình')
    // Kéo ô vuông cạnh phải để rộng ra
    const handle = page.locator('.handle[data-handle="e"]')
    const hb = (await stableBox(handle))
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + hb.width / 2 + 50, hb.y + hb.height / 2, { steps: 8 })
    await page.mouse.up()
    await until(async () => Number(await num('Chiều rộng').inputValue()) > w0 + 0.03)
    const w1 = Number(await num('Chiều rộng').inputValue())
    assert(w1 > w0 + 0.03, `kéo ô vuông đổi chiều rộng: ${w0} → ${w1}`)
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
    await page.getByText('Âm thanh sẵn sàng').waitFor({ timeout: 60000 })
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
