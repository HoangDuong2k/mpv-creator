/**
 * Chụp ảnh app cho trang landing (site/src/assets/shots/*.png): toàn cửa sổ cho phần đầu trang, và từng vùng
 * (timeline, thư viện hiệu ứng, bảng thuộc tính, mẫu phong cách, hộp Xuất video, hộp Timestamp) cho phần tính năng;
 * và ảnh chia sẻ 1200×630 (site/src/assets/og-vi.png, og-en.png).
 * Ảnh chụp ở độ nét gấp đôi (khung 1440×880); Astro nén sang WebP / AVIF khi build trang.
 * Chạy sau khi đổi giao diện: npm run build && npm run site:shots   (Linux không có màn hình: xvfb-run -a …)
 * Đổi mẫu / thời điểm chụp: SHOT_TEMPLATE=lofi SHOT_AT=30 npm run site:shots
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { _electron as electron, type CDPSession, type Locator } from 'playwright-core'
import { makeTestAudio } from './make-test-audio'

const ROOT = resolve(__dirname, '..')
const SITE_ASSETS = join(ROOT, 'site', 'src', 'assets')
const OUT = join(SITE_ASSETS, 'shots')
const WORK = join(ROOT, 'test-output', 'site-shots')
const AUDIO = join(ROOT, 'test-output', 'audio')
/** Mẫu phong cách áp cho ảnh (id trong src/shared/templates.ts) */
const TEMPLATE = process.env.SHOT_TEMPLATE ?? 'edm'
/** Thời điểm dừng để chụp (giây): giữa bài 3, đoạn bass mạnh */
const AT = Number(process.env.SHOT_AT ?? 98)
const VIEW = { width: 1440, height: 880 }

interface Probe {
  __pvm: {
    player: { seek(t: number): void; pause(): void; playing: boolean }
    store: {
      getState(): { setTime(t: number): void; setPlaying(on: boolean): void; selectLayer(id: string | null): void; project: { layers: Array<{ id: string; type: string }> } }
    }
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

/** Ảnh chia sẻ (Facebook, Zalo…) 1200×630: logo, tiêu đề, ảnh app vừa chụp; cùng font và màu với app */
function ogHtml(lang: 'vi' | 'en'): string {
  const font = pathToFileURL(join(ROOT, 'src', 'renderer', 'src', 'assets', 'fonts', 'HankenGrotesk-Variable.ttf')).href
  const shotUrl = pathToFileURL(join(OUT, 'app.png')).href
  const title = lang === 'vi' ? 'Biến playlist nhạc thành <span class="hl">video YouTube</span>' : 'Turn a music playlist into a <span class="hl">YouTube video</span>'
  const sub = lang === 'vi' ? 'Miễn phí cho Windows · macOS · Linux' : 'Free for Windows · macOS · Linux'
  const grad = 'linear-gradient(135deg, #c3a5ff 0%, #8f8bff 48%, #62d0ff 100%)'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Hanken'; src: url('${font}'); font-weight: 100 900; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body { position: relative; background: #100f16; color: #eeecf4; font-family: 'Hanken', sans-serif; -webkit-font-smoothing: antialiased; }
.grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(244,240,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(244,240,255,.06) 1px, transparent 1px); background-size: 48px 48px; -webkit-mask-image: radial-gradient(ellipse 70% 80% at 25% 40%, #000 20%, transparent 75%); }
.glow { position: absolute; border-radius: 50%; filter: blur(60px); }
.g1 { left: -140px; top: -120px; width: 720px; height: 520px; background: rgba(169,139,255,.30); }
.g2 { right: -160px; bottom: -200px; width: 760px; height: 520px; background: rgba(98,208,255,.16); }
.copy { position: absolute; left: 72px; top: 84px; width: 560px; }
.brand { display: flex; align-items: center; gap: 14px; font-size: 26px; font-weight: 600; letter-spacing: -0.01em; }
.mark { width: 46px; height: 46px; border-radius: 11px; background: ${grad}; display: grid; place-items: center; box-shadow: 0 0 40px -8px #a98bff; }
h1 { margin: 44px 0 26px; font-size: 62px; line-height: 1.03; font-weight: 650; letter-spacing: -0.025em; }
.hl { background: ${grad}; -webkit-background-clip: text; color: transparent; }
p { margin: 0; font-size: 25px; color: #bbb7c9; }
.shot { position: absolute; left: 660px; top: 112px; width: 780px; border-radius: 14px; overflow: hidden; border: 1px solid #36323f; box-shadow: 0 30px 90px rgba(0,0,0,.65), 0 0 90px -24px rgba(169,139,255,.55); }
.shot img { display: block; width: 100%; }
</style></head><body>
<div class="grid"></div><div class="glow g1"></div><div class="glow g2"></div>
<div class="copy">
  <div class="brand"><span class="mark"><svg width="26" height="26" viewBox="0 0 256 256" fill="#150a30"><path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V110.25l112-28v51.83A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216ZM88,93.75V62.25l112-28v31.5ZM180,184a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z"/></svg></span>Playlist Video Maker</div>
  <h1>${title}</h1>
  <p>${sub}</p>
</div>
<div class="shot"><img src="${shotUrl}"></div>
</body></html>`
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
      // Ảnh chụp ở trạng thái dừng (nút Phát, không phải Tạm dừng)
      if (player.playing) player.pause()
      store.getState().setPlaying(false)
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

    // Ảnh chia sẻ: dựng trang HTML trong cửa sổ ẩn của Electron rồi chụp
    for (const lang of ['vi', 'en'] as const) {
      const file = join(WORK, `og-${lang}.html`)
      writeFileSync(file, ogHtml(lang))
      const png = await app.evaluate(async ({ BrowserWindow }, htmlFile) => {
        const win = new BrowserWindow({ width: 1200, height: 630, useContentSize: true, show: false, webPreferences: { offscreen: true } })
        await win.loadFile(htmlFile)
        await new Promise((r) => setTimeout(r, 800))
        const img = await win.webContents.capturePage()
        win.destroy()
        return img.resize({ width: 1200, height: 630 }).toPNG().toString('base64')
      }, file)
      writeFileSync(join(SITE_ASSETS, `og-${lang}.png`), Buffer.from(png, 'base64'))
      console.log(`  og-${lang}.png`)
    }
  } finally {
    app.process().kill('SIGKILL')
  }
  process.exit(0)
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
