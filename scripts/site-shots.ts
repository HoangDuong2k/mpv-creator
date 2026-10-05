/**
 * Chụp ảnh app cho trang landing (site/src/assets/shots/*.png): toàn cửa sổ cho phần đầu trang, và từng vùng
 * (timeline, thư viện hiệu ứng, bảng thuộc tính, hộp Xuất video, hộp Timestamp) cho phần tính năng.
 * Ảnh chụp ở độ nét gấp đôi (khung 1440×880); Astro nén sang WebP / AVIF khi build trang.
 * Chạy sau khi đổi giao diện: npm run build && npm run site:shots   (Linux không có màn hình: xvfb-run -a …)
 * Đổi mẫu / thời điểm chụp: SHOT_TEMPLATE=lofi SHOT_AT=30 npm run site:shots
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { _electron as electron, type CDPSession, type Locator } from 'playwright-core'
import { makeTestAudio } from './make-test-audio'

const ROOT = resolve(__dirname, '..')
const OUT = join(ROOT, 'site', 'src', 'assets', 'shots')
const WORK = join(ROOT, 'test-output', 'site-shots')
const AUDIO = join(ROOT, 'test-output', 'audio')
/** Mẫu phong cách áp cho ảnh (id trong src/shared/templates.ts) */
const TEMPLATE = process.env.SHOT_TEMPLATE ?? 'edm'
/** Thời điểm dừng để chụp (giây): giữa bài 3, đoạn bass mạnh */
const AT = Number(process.env.SHOT_AT ?? 98)
const VIEW = { width: 1440, height: 880 }

interface Probe {
  __pvm: {
    player: { seek(t: number): void }
    store: { getState(): { setTime(t: number): void; selectLayer(id: string | null): void; project: { layers: Array<{ id: string; type: string }> } } }
  }
}

/** Chụp cả khung trang hoặc một vùng, ở đúng độ nét của trang (Playwright chụp qua Electron chỉ được 1×) */
async function shot(cdp: CDPSession, target: Locator | null, name: string): Promise<void> {
  const box = target ? await target.boundingBox() : { x: 0, y: 0, width: VIEW.width, height: VIEW.height }
  if (!box) throw new Error(`Không thấy vùng cần chụp: ${name}`)
  const { data } = (await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } })) as { data: string }
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'))
  console.log(`  ${name}.png`)
}

async function main(): Promise<void> {
  if (!existsSync(join(AUDIO, '03-bass-cuc-manh.mp3'))) makeTestAudio(AUDIO, 40)
  rmSync(WORK, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const files = ['01-nang-am-xa-dan.mp3', '02-dem-lofi.mp3', '03-bass-cuc-manh.mp3'].map((f) => join(AUDIO, f))
  const app = await electron.launch({
    executablePath: require('electron') as unknown as string,
    args: [ROOT, ...(process.platform === 'linux' ? ['--no-sandbox'] : []), ...files],
    env: { ...process.env, PVM_USER_DATA: join(WORK, 'userdata') } as Record<string, string>
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.track', { timeout: 30000 })
    await page.locator('.chip.ok').waitFor({ timeout: 90000 })
    // Khung trang 1440×880, độ nét gấp đôi, không phụ thuộc màn hình của máy chụp
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setDeviceMetricsOverride', { ...VIEW, deviceScaleFactor: 2, mobile: false })
    await page.waitForTimeout(500)
    console.log('Cỡ cửa sổ:', await page.evaluate(() => `${innerWidth}×${innerHeight} @${devicePixelRatio}x`))

    // Áp mẫu phong cách (giữ nhạc)
    await page.getByRole('button', { name: 'Mẫu phong cách' }).click()
    await page.locator(`.tpl-card[data-template="${TEMPLATE}"] .tpl-pick`).click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)

    // Dừng ở đoạn bass mạnh, chọn lớp cột sóng (bảng thuộc tính có nội dung)
    await page.evaluate((t) => {
      const { player, store } = (window as unknown as Probe).__pvm
      player.seek(t)
      store.getState().setTime(t)
      // Chọn lớp thanh tiến trình: khung chọn nhỏ, không che cột sóng; bảng thuộc tính có nội dung
      const progress = store.getState().project.layers.find((l) => l.type === 'progress')
      store.getState().selectLayer(progress?.id ?? null)
    }, AT)
    await page.mouse.move(0, 0)
    // Chờ thông báo "Đã áp phong cách…" tắt hẳn
    await page.waitForFunction(() => document.querySelectorAll('[data-slot="toast"]').length === 0, undefined, { timeout: 15000 })
    await page.waitForTimeout(800)
    console.log('Ảnh chụp cho trang landing:')
    await shot(cdp, null, 'app')
    await shot(cdp, page.locator('.timeline'), 'timeline')
    await shot(cdp, page.locator('.inspector-wrap'), 'inspector')

    await page.locator('.lib-tab[data-tab="effects"]').click()
    await page.waitForTimeout(1500)
    await shot(cdp, page.locator('.panel.left'), 'library')

    await page.getByRole('button', { name: 'Mẫu phong cách' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.tpl-card img[src^="data:image/jpeg"]').length >= 7, undefined, { timeout: 20000 })
    await page.waitForTimeout(400)
    await shot(cdp, page.locator('.tpl-builtin .tpl-grid'), 'styles')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)

    await page.locator('.lib-tab[data-tab="music"]').click()
    await page.getByRole('button', { name: /Timestamp YouTube/ }).click()
    await page.waitForTimeout(500)
    await shot(cdp, page.locator('[role="dialog"]'), 'chapters')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)

    await page.locator('[data-action="export"]').click()
    await page.waitForTimeout(500)
    await shot(cdp, page.locator('[role="dialog"]'), 'export')
    await page.keyboard.press('Escape')
  } finally {
    app.process().kill('SIGKILL')
  }
  process.exit(0)
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
