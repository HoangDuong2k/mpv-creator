import type { EncoderId, ExportSettings } from '../../shared/types'
import { runFfmpeg } from '../ffmpeg'
import { trKey } from '../../shared/i18n'

export interface EncoderInfo {
  id: EncoderId
  label: string
  hardware: boolean
  /** Chỉ có trên các hệ điều hành này (không ghi: mọi hệ điều hành) */
  platforms?: NodeJS.Platform[]
}

const ALL_ENCODERS: EncoderInfo[] = [
  { id: 'libx264', label: trKey('CPU (x264), luôn dùng được, chất lượng tốt'), hardware: false },
  { id: 'h264_videotoolbox', label: trKey('Apple VideoToolbox (chip đồ hoạ của Mac)'), hardware: true, platforms: ['darwin'] },
  { id: 'h264_nvenc', label: trKey('NVIDIA NVENC (card rời NVIDIA)'), hardware: true, platforms: ['win32', 'linux'] },
  { id: 'h264_qsv', label: 'Intel Quick Sync', hardware: true, platforms: ['win32', 'linux'] },
  { id: 'h264_amf', label: trKey('AMD AMF (card AMD, Windows)'), hardware: true, platforms: ['win32'] },
  { id: 'h264_vaapi', label: 'VAAPI (Linux, Intel/AMD)', hardware: true, platforms: ['linux'] }
]

/** Các bộ mã hoá có thể có trên hệ điều hành này (Mac không có NVENC, AMF…) */
export function encodersFor(platform: NodeJS.Platform): EncoderInfo[] {
  return ALL_ENCODERS.filter((e) => !e.platforms || e.platforms.includes(platform))
}

export const ENCODERS: EncoderInfo[] = encodersFor(process.platform)

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

/**
 * Tham số FFmpeg của bộ mã hoá. `pixels`: số điểm ảnh mỗi khung hình (rộng × cao), để tính bitrate cho bộ mã hoá
 * không có chế độ chất lượng cố định trên mọi máy (VideoToolbox trên Mac Intel).
 */
export function encoderArgs(id: EncoderId, quality: ExportSettings['quality'], fps: number, pixels = 1920 * 1080): EncoderArgs {
  const q = { fast: 0, balanced: 1, high: 2 }[quality]
  const gop = ['-g', String(Math.round(fps * 2))]
  switch (id) {
    case 'h264_videotoolbox': {
      // Bitrate theo khung hình: 1080p30 khoảng 8 / 12 / 17 Mbps (YouTube khuyên 8–12 Mbps cho 1080p30)
      const bps = Math.round(Math.min(90e6, pixels * fps * [0.13, 0.19, 0.27][q]))
      return {
        pre: [],
        post: ['-vf', `${TO_YUV709},format=nv12`, '-c:v', 'h264_videotoolbox', '-b:v', String(bps), '-profile:v', 'high', ...gop, ...COLOR_TAGS]
      }
    }
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
        const { pre, post } = encoderArgs(enc.id, 'fast', 30, 320 * 240)
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
