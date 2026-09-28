/**
 * Tạo vài "bài hát" tổng hợp (kick/snare/hi-hat/bass/hợp âm, tag tiếng Việt, ảnh bìa) để thử app
 * khi chưa có nhạc thật. Chạy được trên Windows / macOS / Linux, dùng FFmpeg đóng gói kèm app.
 *
 *   npm run test-audio                      → test-output/audio, mỗi bài 40 giây
 *   npm run test-audio -- <thư mục> <giây>
 */
import { execFileSync } from 'child_process'
import { mkdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { ffmpegPath } from '../src/main/ffmpeg'

interface Song {
  file: string
  bpm: number
  root: number
  title: string
  artist: string
  hue: string
}

export const TEST_SONGS: Song[] = [
  { file: '01-nang-am-xa-dan.mp3', bpm: 120, root: 220, title: 'Nắng Ấm Xa Dần', artist: 'Ca Sĩ Thử Nghiệm', hue: 'ff8a3d' },
  { file: '02-dem-lofi.mp3', bpm: 88, root: 196, title: 'Đêm Lofi Chill', artist: 'Lofi Việt', hue: '5b6cff' },
  { file: '03-bass-cuc-manh.mp3', bpm: 128, root: 174.6, title: 'Bass Cực Mạnh (EDM)', artist: 'DJ Demo', hue: 'ff3cac' }
]

function ffmpeg(args: string[]): void {
  execFileSync(ffmpegPath(), ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true })
}

/** Biểu thức aevalsrc của một bài (cùng công thức với bản bash trước đây) */
function songExpr(bpm: number, root: number): string {
  const beat = (60 / bpm).toFixed(6)
  const kick = `sin(2*PI*(45+110*exp(-mod(t,${beat})*28))*mod(t,${beat}))*exp(-mod(t,${beat})*7)*0.9`
  const snare = `(random(0)*2-1)*exp(-mod(t+${beat},2*${beat})*22)*0.35`
  const hat = `(random(1)*2-1)*exp(-mod(t+${beat}/2,${beat})*70)*0.12`
  const chord = `floor(mod(t/(4*${beat}),4))`
  const f0 = `${root}*pow(2,(if(eq(${chord},1),5,if(eq(${chord},2),7,if(eq(${chord},3),-3,0))))/12)`
  const bass = `0.28*sin(2*PI*(${f0}/2)*t)*(0.6+0.4*exp(-mod(t,${beat}/2)*6))`
  const pad = `0.07*(sin(2*PI*${f0}*2*t)+sin(2*PI*${f0}*2*1.26*t)+sin(2*PI*${f0}*2*1.5*t))*(0.8+0.2*sin(2*PI*0.25*t))`
  const lead = `0.08*sin(2*PI*${f0}*4*pow(2,floor(mod(t*2/${beat},8))/12*2)*t)*exp(-mod(t,${beat}/2)*5)*gte(t,8)`
  return `${kick}+${snare}+${hat}+${bass}+${pad}+${lead}|${kick}+${snare}+${hat}*0.8+${bass}+${pad}*1.1+${lead}`
}

export function makeTestAudio(outDir: string, seconds = 40): string[] {
  mkdirSync(outDir, { recursive: true })
  const files: string[] = []
  for (const s of TEST_SONGS) {
    const cover = join(outDir, `.cover-${s.hue}.jpg`)
    const out = join(outDir, s.file)
    ffmpeg(['-f', 'lavfi', '-i', `gradients=s=500x500:c0=0x${s.hue}:c1=0x101030:x0=0:y0=0:x1=500:y1=500:d=1`, '-frames:v', '1', '-update', '1', cover])
    ffmpeg([
      '-f', 'lavfi', '-i', `aevalsrc='${songExpr(s.bpm, s.root)}':s=44100:d=${seconds}`,
      '-i', cover, '-map', '0:a', '-map', '1:v',
      '-af', `afade=t=in:d=1,afade=t=out:st=${seconds - 2}:d=2,volume=0.8`,
      '-c:a', 'libmp3lame', '-b:a', '192k', '-c:v', 'copy', '-disposition:v', 'attached_pic', '-id3v2_version', '3',
      '-metadata', `title=${s.title}`, '-metadata', `artist=${s.artist}`, '-metadata', 'album=Playlist thử nghiệm',
      out
    ])
    rmSync(cover, { force: true })
    files.push(out)
  }
  return files
}

if (require.main === module) {
  const [dir = 'test-output/audio', secs = '40'] = process.argv.slice(2)
  const out = resolve(dir)
  console.log(`Tạo nhạc thử trong ${out}:`)
  for (const f of makeTestAudio(out, Number(secs))) console.log(`  ${f}`)
}
