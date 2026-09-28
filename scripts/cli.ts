/**
 * Công cụ dòng lệnh chạy engine không cần giao diện (kiểm thử, render hàng loạt).
 *
 *   npm run cli -- demo  --audio a.mp3 b.mp3 --out out.mp4 [--duration 20] [--start 0]
 *   npm run cli -- render --project p.pvm.json --out out.mp4 [--start s --duration d]
 *   npm run cli -- frame  --project p.pvm.json --time 12.5 --out frame.png
 *   (mọi lệnh đều nhận --audio a.mp3 ... thay cho --project để dùng project mặc định)
 *   npm run cli -- chapters --project p.pvm.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { createCanvas } from '@napi-rs/canvas'
import { AudioSampler, Renderer, TrackFeatures } from '../src/engine'
import { createDefaultProject, normalizeProject } from '../src/shared/defaults'
import { buildChapters } from '../src/shared/time'
import { buildTimeline } from '../src/shared/timeline'
import type { Project } from '../src/shared/types'
import { exportVideo } from '../src/main/export/exporter'
import { NodeAssets, registerFonts } from '../src/main/export/nodeAssets'
import { readTrackInfo } from '../src/main/media'
import { defaultCacheDir } from '../src/main/paths'
import { Workspace } from '../src/main/workspace'

const ROOT = resolve(__dirname, '..')
const FONTS = join(ROOT, 'resources', 'fonts')

function args(): { cmd: string; opts: Record<string, string[]> } {
  const [cmd = 'help', ...rest] = process.argv.slice(2)
  const opts: Record<string, string[]> = {}
  let key = ''
  for (const a of rest) {
    if (a.startsWith('--')) {
      key = a.slice(2)
      opts[key] = opts[key] ?? []
    } else if (key) opts[key].push(a)
  }
  return { cmd, opts }
}

async function prepareProject(project: Project, ws: Workspace): Promise<Project> {
  for (const t of project.tracks) {
    const t0 = Date.now()
    const r = await ws.ensureAnalysis(t)
    t.analysisKey = r.analysisKey
    t.duration = r.duration
    console.log(`  ✓ phân tích "${t.title}" (${r.duration.toFixed(2)}s) trong ${Date.now() - t0}ms`)
  }
  return project
}

async function loadProject(file: string): Promise<Project> {
  return normalizeProject(JSON.parse(readFileSync(file, 'utf8')) as Project)
}

async function main(): Promise<void> {
  const { cmd, opts } = args()
  const ws = new Workspace(opts.cache?.[0] ?? defaultCacheDir())
  let project: Project

  if (cmd === 'demo' || cmd === 'render' || cmd === 'frame' || cmd === 'chapters') {
    if (opts.audio?.length) {
      project = createDefaultProject()
      project.name = 'Demo'
      for (const p of opts.audio ?? []) project.tracks.push(await readTrackInfo(resolve(p), ws.coverDir))
    } else project = await loadProject(opts.project?.[0] ?? '')
    if (project.tracks.length === 0) throw new Error('Chưa có bài hát (--audio ...)')
    await prepareProject(project, ws)
    const saveTo = opts['save-project']?.[0]
    if (saveTo) {
      mkdirSync(dirname(resolve(saveTo)), { recursive: true })
      writeFileSync(resolve(saveTo), JSON.stringify(project, null, 2))
    }
    const tl = buildTimeline(project.tracks, project.settings)

    if (cmd === 'chapters') {
      console.log(buildChapters(tl))
      return
    }

    if (cmd === 'frame') {
      registerFonts(FONTS)
      const features = new Map<string, TrackFeatures>()
      for (const t of project.tracks) features.set(t.analysisKey!, TrackFeatures.parse(new Uint8Array(readFileSync(ws.featuresPath(t.analysisKey!)))))
      const { width: W, height: H } = project.settings
      const times = (opts.time ?? ['5']).map(Number)
      const assets = new NodeAssets()
      await assets.preload(project, 0)
      const renderer = new Renderer(assets)
      const canvas = createCanvas(W, H)
      const audio = new AudioSampler(tl, (k) => features.get(k))
      for (const [i, t] of times.entries()) {
        renderer.render({ ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, project, timeline: tl, audio, t })
        const out = (opts.out?.[0] ?? 'frame.png').replace(/(\.png)?$/, times.length > 1 ? `-${i}.png` : '.png')
        mkdirSync(dirname(resolve(out)), { recursive: true })
        writeFileSync(out, canvas.toBuffer('image/png'))
        console.log(`  ✓ frame t=${t}s → ${out}`)
      }
      assets.close()
      if (renderer.errors.size) console.warn('Lỗi layer:', [...renderer.errors.values()])
      return
    }

    const out = resolve(opts.out?.[0] ?? 'out.mp4')
    project.export.outputPath = out
    if (opts.encoder?.[0]) project.export.encoder = opts.encoder[0] as Project['export']['encoder']
    if (opts.quality?.[0]) project.export.quality = opts.quality[0] as Project['export']['quality']
    const range = opts.duration?.[0] ? { start: Number(opts.start?.[0] ?? 0), duration: Number(opts.duration[0]) } : undefined
    let lastLine = ''
    const result = await exportVideo({
      project,
      workspace: ws,
      settings: project.export,
      fontsDir: FONTS,
      workerPath: join(ROOT, 'scripts', 'worker-dev.cjs'),
      workers: opts.workers?.[0] ? Number(opts.workers[0]) : undefined,
      range,
      onProgress: (p) => {
        const resumed = p.resumedFrames > 0 ? ` (tiếp tục, đã có ${p.resumedFrames} frame)` : ''
        const line = `  [${p.stage}] ${(p.progress * 100).toFixed(0)}% ${p.framesDone}/${p.framesTotal} frame, đoạn ${p.chunksDone}/${p.chunksTotal}, ${p.fps.toFixed(0)} fps, còn ~${p.eta.toFixed(0)}s${resumed}`
        if (line !== lastLine) {
          lastLine = line
          process.stdout.write(`\r${line}      `)
        }
      }
    })
    console.log(`\n  ✓ Xuất xong ${result.outputPath} (${result.duration.toFixed(1)}s video) trong ${result.seconds.toFixed(1)}s — nhanh ${(result.duration / result.seconds).toFixed(2)}× thời gian thực`)
    if (result.resumedFrames > 0) console.log(`  ↻ Dùng lại ${result.resumedFrames}/${result.totalFrames} frame từ lần xuất dở trước`)
    if (result.warnings.length) console.warn('  Cảnh báo:', result.warnings)
    return
  }

  console.log(readFileSync(__filename, 'utf8').split('*/')[0])
}

main().catch((err) => {
  console.error('\nLỗi:', err instanceof Error ? err.message : err)
  process.exit(1)
})
