import type { EncoderId, ExportSettings } from '../../shared/types'
import { runFfmpeg } from '../ffmpeg'
import { trKey } from '../../shared/i18n'

export interface EncoderInfo {
  id: EncoderId
  label: string
  hardware: boolean
}

export const ENCODERS: EncoderInfo[] = [
  { id: 'libx264', label: trKey('CPU – x264 (luôn dùng được, chất lượng tốt)'), hardware: false },
  { id: 'h264_nvenc', label: trKey('NVIDIA NVENC (card rời NVIDIA)'), hardware: true },
  { id: 'h264_qsv', label: 'Intel Quick Sync', hardware: true },
  { id: 'h264_amf', label: trKey('AMD AMF (card AMD, Windows)'), hardware: true },
  { id: 'h264_vaapi', label: 'VAAPI (Linux, Intel/AMD)', hardware: true }
]

const VAAPI_DEVICE = '/dev/dri/renderD128'

// Chuyển RGBA → YUV theo chuẩn BT.709 (chuẩn màu của video HD trên YouTube)
const TO_YUV709 = 'scale=out_color_matrix=bt709:out_range=tv'
const COLOR_TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']

export interface EncoderArgs {
  /** Tham số đặt trước "-i" (thiết bị phần cứng) */
  pre: string[]
  /** Tham số mã hoá sau "-i" */
  post: string[]
}

export function encoderArgs(id: EncoderId, quality: ExportSettings['quality'], fps: number): EncoderArgs {
  const q = { fast: 0, balanced: 1, high: 2 }[quality]
  const gop = ['-g', String(Math.round(fps * 2))]
  switch (id) {
    case 'h264_nvenc':
      return {
        pre: [],
        post: ['-vf', `${TO_YUV709},format=yuv420p`, '-c:v', 'h264_nvenc', '-preset', ['p2', 'p4', 'p6'][q], '-rc', 'vbr', '-cq', ['24', '21', '19'][q], '-b:v', '0', ...gop, ...COLOR_TAGS]
      }
    case 'h264_qsv':
      return {
        pre: [],
        post: ['-vf', `${TO_YUV709},format=nv12`, '-c:v', 'h264_qsv', '-preset', ['veryfast', 'medium', 'slow'][q], '-global_quality', ['26', '23', '20'][q], ...gop, ...COLOR_TAGS]
      }
    case 'h264_amf':
      return {
        pre: [],
        post: [
          '-vf', `${TO_YUV709},format=nv12`,
          '-c:v', 'h264_amf', '-quality', ['speed', 'balanced', 'quality'][q],
          '-rc', 'cqp', '-qp_i', ['24', '21', '19'][q], '-qp_p', ['26', '23', '21'][q],
          ...gop, ...COLOR_TAGS
        ]
      }
    case 'h264_vaapi':
      return {
        pre: ['-vaapi_device', VAAPI_DEVICE],
        post: ['-vf', `${TO_YUV709},format=nv12,hwupload`, '-c:v', 'h264_vaapi', '-qp', ['25', '22', '19'][q], ...gop, ...COLOR_TAGS]
      }
    default:
      return {
        pre: [],
        post: [
          '-vf', `${TO_YUV709},format=yuv420p`,
          '-c:v', 'libx264', '-preset', ['superfast', 'veryfast', 'medium'][q], '-crf', ['21', '19', '17'][q],
          '-profile:v', 'high', ...gop, ...COLOR_TAGS
        ]
      }
  }
}

let detected: Promise<EncoderId[]> | null = null

/** Thử mã hoá vài frame với từng bộ mã hoá để biết máy này dùng được bộ nào. */
export function detectEncoders(): Promise<EncoderId[]> {
  if (!detected) {
    detected = (async () => {
      const ok: EncoderId[] = []
      for (const enc of ENCODERS) {
        if (enc.id === 'h264_vaapi' && process.platform !== 'linux') continue
        if (enc.id === 'h264_amf' && process.platform !== 'win32') continue
        const { pre, post } = encoderArgs(enc.id, 'fast', 30)
        const args = ['-v', 'error', ...pre, '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=30:d=0.3,format=rgba', ...post, '-f', 'null', '-']
        try {
          const run = runFfmpeg(args)
          const timer = setTimeout(() => run.kill(), 15000)
          await run.done.finally(() => clearTimeout(timer))
          ok.push(enc.id)
        } catch {
          // bộ mã hoá không dùng được trên máy này
        }
      }
      return ok
    })()
  }
  return detected
}
