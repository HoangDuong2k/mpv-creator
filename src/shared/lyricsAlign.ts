/**
 * AI căn lời: khớp lời bài hát người dùng dán vào với các từ Whisper nghe được (kèm thời điểm từng từ), ra mốc thời
 * gian từng dòng, từng từ và độ tin cậy từng dòng. Không phụ thuộc thư viện nào, chạy được ở main lẫn renderer.
 *
 * Các bước:
 *  1. chuẩn hoá chữ (bỏ dấu, đ → d, chữ thường, bỏ dấu câu)
 *  2. quy hoạch động khớp toàn cục (từ trong lời × từ nghe được), so giống gần đúng (Levenshtein trên chữ không dấu;
 *     tiếng Việt so thêm "khoá đọc gần giống"), khớp 1:1 / khớp yếu / thiếu từ / thừa từ (đầu, cuối miễn phí),
 *     gộp 2:1 và 1:2 ("heartbeat" ↔ "heart beat")
 *  3. dọn mốc: bỏ cụm mốc lệch xa trong cùng một dòng, khớp yếu không có khớp chắc bên cạnh, từ ngắn ở mép dòng
 *     không khớp thời gian với phần còn lại của dòng
 *  4. nội suy các từ không có mốc giữa hai mốc kề bên (theo dòng); dòng không khớp được từ nào thì dựa vào các từ
 *     nghe được chưa dùng tới để đoán
 *  5. độ tin cậy từng dòng
 *
 * Đo trên 4 bài hát tiếng Anh có mốc do người chấm (198 dòng): 76–85% dòng lệch ≤ 0,3 giây tuỳ mô hình; dòng có
 * độ tin cậy ≥ 0,5 thì 89–94% lệch ≤ 0,3 giây.
 */

export interface AsrWord {
  text: string
  start: number
  end: number
}

export type MatchKind = 'match' | 'weak' | 'interpolated'

/** Dòng có độ tin cậy dưới mức này: AI chưa chắc, nên nghe lại (đo trên bài hát thật: trên mức này 89–94% dòng lệch ≤ 0,3 giây) */
export const LOW_CONFIDENCE = 0.5

export interface AlignedWord {
  text: string
  start: number
  end: number
  kind: MatchKind
  /** Độ giống 0..1 với (các) từ nghe được đã khớp (0 nếu nội suy) */
  similarity: number
}

export interface AlignedLine {
  /** Vị trí trong mảng `lines` đưa vào (bỏ qua dòng trống và dòng chú thích kiểu [Chorus]) */
  index: number
  text: string
  start: number
  end: number
  /** 0..1: phần từ khớp chắc, nhân độ giống, giảm nếu từ đầu dòng phải đoán */
  confidence: number
  /** Không từ nào của dòng khớp chắc: thời gian chỉ là ước đoán */
  estimated: boolean
  words: AlignedWord[]
}

export interface AlignOptions {
  /** 'vi' bật khoá đọc gần giống tiếng Việt; mặc định tự nhận theo dấu tiếng Việt trong lời */
  language?: string
  /** Độ giống từ đây trở lên là khớp chắc. Mặc định 0,55 */
  minSimilarity?: number
  /** Điểm cho một từ trong lời không có từ nghe được tương ứng. Mặc định -0,45 */
  lyricGap?: number
  /** Điểm cho một từ nghe được thừa (giữa bài; thừa ở đầu, cuối bài thì không tính). Mặc định -0,35 */
  asrGap?: number
  /** Điểm cho cặp 1:1 dưới ngưỡng (vẫn giữ làm mốc thời gian yếu). Mặc định -0,25 */
  weakScore?: number
  /** Mốc trong một dòng cách nhau quá số giây này thì tách cụm, chỉ giữ cụm mạnh nhất. Mặc định 6 */
  maxIntraLineGap?: number
  /** Số giây mỗi từ khi phải ngoại suy. Mặc định: trung vị độ dài từ đã khớp, trong khoảng 0,2..0,6 */
  wordDuration?: number
  /** Độ dài tối đa một từ (Whisper hay kéo dài từ cuối trước chỗ nghỉ). Mặc định 2,5 */
  maxWordDuration?: number
  /**
   * Trừ đi khỏi mọi mốc: mốc đầu từ của Whisper (DTW trên cross-attention) đến trễ hơn thực tế — đo được trễ
   * 0,12..0,2 giây với giọng đọc tổng hợp và 0,15..0,5 giây với bài hát thật; 0,2 cho sai số trung vị nhỏ nhất (hiện
   * dòng sớm một chút cũng dễ nhìn hơn). 0 = giữ nguyên thời gian nhận dạng. Mặc định 0,2
   */
  leadIn?: number
  /** Lọc câu Whisper "bịa" ra trước khi khớp. Mặc định có */
  filterHallucinations?: boolean
}

/* ---- Chuẩn hoá chữ ---- */

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}+/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
}

/** Chữ thường, không dấu, chỉ chữ cái / chữ số */
export function normalizeWord(s: string): string {
  return stripDiacritics(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Chữ thường, giữ dấu (NFC), chỉ chữ cái / chữ số: thưởng thêm khi đúng cả dấu thanh */
function normalizeWithTones(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '')
}

/** Khoá "đọc gần giống" thô cho một âm tiết tiếng Việt không dấu (gộp các nhầm lẫn thường gặp khi nhận dạng / phương ngữ) */
export function viPhoneticKey(s: string): string {
  let k = s
  k = k
    .replace(/^ngh/, 'ng')
    .replace(/^gh/, 'g')
    .replace(/^gi/, 'd')
    .replace(/^[rvz]/, 'd')
    .replace(/^tr/, 'ch')
    .replace(/^s/, 'x')
    .replace(/^ph/, 'f')
    .replace(/^[kq]/, 'c')
  k = k.replace(/(nh|ng)$/, 'n').replace(/(ch|c)$/, 't').replace(/y/g, 'i')
  return k
}

const VI_MARKS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i

/** Ngôn ngữ của lời để báo cho Whisper: 'vi' nếu có dấu tiếng Việt, 'en' nếu chỉ toàn chữ Latin, còn lại để Whisper tự nhận */
export function lyricsLanguage(lines: string[]): 'vi' | 'en' | null {
  const text = lines.join(' ')
  if (VI_MARKS.test(text)) return 'vi'
  const letters = text.match(/\p{L}/gu) ?? []
  if (!letters.length) return null
  const latin = letters.filter((c) => /[a-zA-ZÀ-ɏ]/.test(c)).length
  return latin / letters.length > 0.9 ? 'en' : null
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = new Array<number>(b.length + 1)
  let cur = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]
}

function strSim(a: string, b: string): number {
  if (a === b) return 1
  const m = Math.max(a.length, b.length)
  return m === 0 ? 1 : 1 - levenshtein(a, b) / m
}

interface Tok {
  norm: string
  tones: string
  key: string
}

function makeTok(text: string, vi: boolean): Tok {
  const norm = normalizeWord(text)
  return { norm, tones: normalizeWithTones(text), key: vi ? viPhoneticKey(norm) : norm }
}

function joinTok(a: Tok, b: Tok, vi: boolean): Tok {
  const norm = a.norm + b.norm
  return { norm, tones: a.tones + b.tones, key: vi ? a.key + b.key : norm }
}

/** Độ giống 0..1 của hai từ */
function tokSim(a: Tok, b: Tok, vi: boolean): number {
  if (a.norm === b.norm) return a.tones === b.tones ? 1 : 0.9 // cùng chữ, khác dấu thanh
  let s = strSim(a.norm, b.norm)
  if (vi) s = Math.max(s, 0.9 * strSim(a.key, b.key))
  return s
}

/* ---- Dọn kết quả nhận dạng ---- */

/** Câu Whisper hay "bịa" ra ở đoạn nhạc không lời / im lặng (đã chuẩn hoá, không dấu) */
export const HALLUCINATION_PHRASES = [
  'subscribe',
  'ghien mi go',
  'dang ky kenh',
  'dang ki kenh',
  'thanks for watching',
  'thank you for watching',
  'amara org',
  'subtitles by',
  'la la school',
  'hay like va',
  'cam on cac ban da theo doi'
]

/**
 * Bỏ các từ Whisper bịa ra: (1) dồn cục — từ 3 từ liên tiếp trở lên, mỗi từ bắt đầu chưa tới 60 ms sau từ trước
 * (bộ giải mã lặp vòng, mốc thời gian dồn lại một chỗ); (2) cả câu (các từ cách nhau < 1 giây) có chứa câu bịa quen thuộc.
 */
export function filterHallucinations<T extends AsrWord>(words: T[]): T[] {
  const w = [...words].sort((a, b) => a.start - b.start)
  const drop = new Uint8Array(w.length)
  for (let i = 0; i < w.length; ) {
    let j = i
    while (j + 1 < w.length && w[j + 1].start - w[j].start < 0.06) j++
    if (j - i + 1 >= 3) for (let k = i; k <= j; k++) drop[k] = 1
    i = j + 1
  }
  const norm = w.map((x) => normalizeWord(x.text))
  for (let i = 0; i < w.length; ) {
    let j = i
    while (j + 1 < w.length && w[j + 1].start - w[j].end < 1.0) j++
    const utt = ' ' + norm.slice(i, j + 1).join(' ') + ' '
    if (HALLUCINATION_PHRASES.some((p) => utt.includes(' ' + p + ' '))) for (let k = i; k <= j; k++) drop[k] = 1
    i = j + 1
  }
  return w.filter((_, i) => !drop[i])
}

/* ---- Căn lời ---- */

/** Dòng chú thích không hát: [Chorus], (Verse 2), Điệp khúc:, ĐK: … */
export const isAnnotationLine = (l: string): boolean =>
  /^\s*[[(].*[\])]\s*:?\s*$/.test(l) || /^\s*(chorus|verse|bridge|intro|outro|điệp khúc|đk|pre-chorus)\b.*:\s*$/i.test(l)

export function alignLyrics(lyrics: string[], asrWordsIn: AsrWord[], opts: AlignOptions = {}): AlignedLine[] {
  const vi = opts.language === 'vi' || (opts.language === undefined || opts.language === 'auto' ? VI_MARKS.test(lyrics.join(' ')) : false)
  const minSim = opts.minSimilarity ?? 0.55
  const GAP_L = opts.lyricGap ?? -0.45
  const GAP_A = opts.asrGap ?? -0.35
  const WEAK = opts.weakScore ?? -0.25
  const MERGE_PENALTY = 0.1
  const mergeMinSim = Math.max(minSim, 0.8) // chỉ gộp khi tách / ghép gần như y hệt: "heartbeat" ↔ "heart beat"
  const maxIntraLineGap = opts.maxIntraLineGap ?? 6
  const maxWordDur = opts.maxWordDuration ?? 2.5
  const leadIn = opts.leadIn ?? 0.2

  // ---- Từ trong lời
  interface LTok extends Tok {
    text: string
    line: number
  }
  const lines: { index: number; text: string; tokStart: number; tokEnd: number }[] = []
  const L: LTok[] = []
  lyrics.forEach((text, index) => {
    if (!text.trim() || isAnnotationLine(text)) return
    const tokStart = L.length
    for (const w of text.trim().split(/\s+/)) {
      const t = makeTok(w, vi)
      if (t.norm) L.push({ ...t, text: w, line: lines.length })
    }
    if (L.length > tokStart) lines.push({ index, text: text.trim(), tokStart, tokEnd: L.length })
  })
  if (!L.length) return []

  // ---- Từ nghe được (sắp theo thời gian, bỏ từ rỗng)
  const asrWords = (opts.filterHallucinations === false ? asrWordsIn : filterHallucinations(asrWordsIn))
    .filter((w) => Number.isFinite(w.start) && normalizeWord(w.text))
    .map((w) => ({ ...w, end: Number.isFinite(w.end) && w.end > w.start ? w.end : w.start + 0.3 }))
    .sort((a, b) => a.start - b.start)
  const A: Tok[] = asrWords.map((w) => makeTok(w.text, vi))
  const n = L.length
  const m = A.length

  // ---- Quy hoạch động (tìm điểm cao nhất). Hướng đi ngược: 1 = chéo, 2 = thiếu từ, 3 = thừa từ, 4 = 2 từ lời : 1, 5 = 1 : 2
  const W = m + 1
  const D = new Float64Array((n + 1) * W).fill(-Infinity)
  const B = new Uint8Array((n + 1) * W)
  const S = new Float32Array((n + 1) * W) // độ giống của cặp tạo ra ô
  D[0] = 0
  const pairScore = (s: number): number => (s >= minSim ? s : WEAK)
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (i === 0 && j === 0) continue
      let best = -Infinity
      let bk = 0
      let bs = 0
      if (i > 0 && j > 0) {
        const s = tokSim(L[i - 1], A[j - 1], vi)
        const v = D[(i - 1) * W + j - 1] + pairScore(s)
        if (v > best) {
          best = v
          bk = 1
          bs = s
        }
      }
      if (i > 0) {
        const v = D[(i - 1) * W + j] + GAP_L
        if (v > best) {
          best = v
          bk = 2
          bs = 0
        }
      }
      if (j > 0) {
        const v = D[i * W + j - 1] + (i === 0 || i === n ? 0 : GAP_A)
        if (v > best) {
          best = v
          bk = 3
          bs = 0
        }
      }
      if (i > 1 && j > 0 && L[i - 2].line === L[i - 1].line) {
        const s = tokSim(joinTok(L[i - 2], L[i - 1], vi), A[j - 1], vi)
        if (s >= mergeMinSim) {
          const v = D[(i - 2) * W + j - 1] + 2 * s - MERGE_PENALTY
          if (v > best) {
            best = v
            bk = 4
            bs = s
          }
        }
      }
      if (i > 0 && j > 1) {
        const s = tokSim(L[i - 1], joinTok(A[j - 2], A[j - 1], vi), vi)
        if (s >= mergeMinSim) {
          const v = D[(i - 1) * W + j - 2] + s - MERGE_PENALTY
          if (v > best) {
            best = v
            bk = 5
            bs = s
          }
        }
      }
      D[i * W + j] = best
      B[i * W + j] = bk
      S[i * W + j] = bs
    }
  }

  // ---- Đi ngược → mốc cho từng từ trong lời
  interface Anchor {
    kind: 'match' | 'weak'
    sim: number
    asr: number[]
    start: number
    end: number
  }
  const anchor: (Anchor | null)[] = new Array<Anchor | null>(n).fill(null)
  const asrUsed = new Uint8Array(m)
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    const bk = B[i * W + j]
    const s = S[i * W + j]
    if (bk === 1) {
      const w = asrWords[j - 1]
      anchor[i - 1] = { kind: s >= minSim ? 'match' : 'weak', sim: s, asr: [j - 1], start: w.start, end: w.end }
      asrUsed[j - 1] = 1
      i--
      j--
    } else if (bk === 2) i--
    else if (bk === 3) j--
    else if (bk === 4) {
      const w = asrWords[j - 1]
      const a = L[i - 2].norm.length
      const b = L[i - 1].norm.length
      const split = w.start + ((Math.min(w.end, w.start + maxWordDur) - w.start) * a) / (a + b)
      anchor[i - 2] = { kind: 'match', sim: s, asr: [j - 1], start: w.start, end: split }
      anchor[i - 1] = { kind: 'match', sim: s, asr: [j - 1], start: split, end: w.end }
      asrUsed[j - 1] = 1
      i -= 2
      j--
    } else if (bk === 5) {
      anchor[i - 1] = { kind: 'match', sim: s, asr: [j - 2, j - 1], start: asrWords[j - 2].start, end: asrWords[j - 1].end }
      asrUsed[j - 2] = asrUsed[j - 1] = 1
      i--
      j -= 2
    } else break // không xảy ra
  }

  // ---- Dọn mốc
  const dropAnchor = (k: number): void => {
    for (const x of anchor[k]!.asr) asrUsed[x] = 0
    anchor[k] = null
  }
  for (const ln of lines) {
    // (a) khớp yếu cần một khớp chắc trong phạm vi 2 từ cùng dòng
    for (let k = ln.tokStart; k < ln.tokEnd; k++) {
      const a = anchor[k]
      if (!a || a.kind !== 'weak') continue
      let ok = false
      for (let d = -2; d <= 2 && !ok; d++) {
        const q = k + d
        if (d !== 0 && q >= ln.tokStart && q < ln.tokEnd && anchor[q]?.kind === 'match') ok = true
      }
      if (!ok) dropAnchor(k)
    }
    // (b) tách mốc của dòng thành các cụm theo thời gian, giữ cụm mạnh nhất
    const clusters: number[][] = []
    let lastEnd = -Infinity
    for (let k = ln.tokStart; k < ln.tokEnd; k++) {
      const a = anchor[k]
      if (!a) continue
      if (!clusters.length || a.start - lastEnd > maxIntraLineGap) clusters.push([])
      clusters[clusters.length - 1].push(k)
      lastEnd = Math.min(a.end, a.start + maxWordDur)
    }
    if (clusters.length > 1) {
      const weight = (c: number[]): number => c.reduce((s, k) => s + (anchor[k]!.kind === 'match' ? anchor[k]!.sim : 0.1), 0)
      const keep = clusters.reduce((b, c) => (weight(c) > weight(b) ? c : b))
      for (const c of clusters) if (c !== keep) for (const k of c) dropAnchor(k)
    }
    // (c) mốc ở mép dòng mà là khớp yếu hoặc từ ngắn (≤ 3 chữ cái: "i", "the", "em") phải khớp thời gian với mốc
    //     kế bên trong dòng; không thì nhiều khả năng mượn nhầm từ chỗ khác
    for (const dir of [1, -1]) {
      for (;;) {
        const ks: number[] = []
        for (let k = dir > 0 ? ln.tokStart : ln.tokEnd - 1; k >= ln.tokStart && k < ln.tokEnd; k += dir) if (anchor[k]) ks.push(k)
        if (ks.length < 2) break
        const [e, inner] = ks
        const a = anchor[e]!
        const b = anchor[inner]!
        if (a.kind === 'match' && L[e].norm.length > 3) break
        const gap = dir > 0 ? b.start - Math.min(a.end, a.start + maxWordDur) : a.start - Math.min(b.end, b.start + maxWordDur)
        if (gap > 1.5 + 0.6 * (Math.abs(inner - e) - 1)) dropAnchor(e)
        else break
      }
    }
  }

  // ---- Độ dài một từ
  const durs = anchor
    .filter((a): a is Anchor => !!a && a.kind === 'match')
    .map((a) => Math.min(a.end, a.start + maxWordDur) - a.start)
    .sort((a, b) => a - b)
  const wordDur = opts.wordDuration ?? Math.min(0.6, Math.max(0.2, durs.length ? durs[durs.length >> 1] : 0.35))

  // ---- Thời gian cho mọi từ trong lời (từ đã có mốc thì giữ nguyên)
  const st = new Float64Array(n)
  const en = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    const a = anchor[k]
    if (a) {
      st[k] = a.start
      en[k] = Math.min(a.end, a.start + maxWordDur)
    }
  }
  const charW = (k: number): number => Math.max(1, L[k].norm.length)
  // rải các từ [p..q] đều từ t0 tới t1, theo số chữ cái
  const spread = (p: number, q: number, t0: number, t1: number): void => {
    let tot = 0
    for (let k = p; k <= q; k++) tot += charW(k)
    let acc = 0
    const span = Math.max(0, t1 - t0)
    for (let k = p; k <= q; k++) {
      st[k] = t0 + (span * acc) / tot
      acc += charW(k)
      en[k] = t0 + (span * acc) / tot
    }
  }
  // các từ [p..q] với nhịp wordDur, kết thúc ở t1 (dồn lại nếu phải bắt đầu trước tMin)
  const before = (p: number, q: number, t1: number, tMin: number): void => {
    const need = (q - p + 1) * wordDur
    if (t1 - need >= tMin) spread(p, q, t1 - need, t1)
    else spread(p, q, Math.min(tMin, t1), t1)
  }
  // các từ [p..q] với nhịp wordDur, bắt đầu ở t0 (dồn lại nếu phải kết thúc sau tMax)
  const after = (p: number, q: number, t0: number, tMax: number): void => {
    const need = (q - p + 1) * wordDur
    if (t0 + need <= tMax) spread(p, q, t0, t0 + need)
    else spread(p, q, t0, Math.max(t0, tMax))
  }
  // từ nghe được chưa dùng tới trong [t0, t1): dấu hiệu có hát, dùng cho các dòng không khớp được gì
  const freeAsrIn = (t0: number, t1: number): AsrWord[] => asrWords.filter((w, x) => !asrUsed[x] && w.start >= t0 && w.start < t1)

  let k = 0
  while (k < n) {
    if (anchor[k]) {
      k++
      continue
    }
    let q = k
    while (q + 1 < n && !anchor[q + 1]) q++
    const prev = k - 1 >= 0 ? k - 1 : -1
    const next = q + 1 < n ? q + 1 : -1
    const Te = prev >= 0 ? en[prev] : NaN
    const Ts = next >= 0 ? st[next] : NaN
    if (prev >= 0 && next >= 0 && L[prev].line === L[next].line) {
      spread(k, q, Te, Ts) // lỗ hổng trong một dòng
      k = q + 1
      continue
    }
    // đầu = phần còn lại của dòng có mốc trước; đuôi = phần đầu của dòng có mốc sau; giữa = các dòng trọn vẹn ở giữa
    let headEnd = k - 1
    if (prev >= 0) while (headEnd + 1 <= q && L[headEnd + 1].line === L[prev].line) headEnd++
    let tailStart = q + 1
    if (next >= 0) while (tailStart - 1 >= k && L[tailStart - 1].line === L[next].line) tailStart--
    if (headEnd >= k) after(k, headEnd, Te, next >= 0 ? Ts : Infinity)
    const midLo = headEnd >= k ? en[headEnd] : prev >= 0 ? Te : 0
    if (tailStart <= q) before(tailStart, q, Ts, midLo)
    const midHi = tailStart <= q ? st[tailStart] : next >= 0 ? Ts : Infinity
    const mp = headEnd + 1
    const mq = tailStart - 1
    if (mp <= mq) {
      const cnt = mq - mp + 1
      const reach = cnt * wordDur * 2 + 2 // tìm dấu hiệu hát cách phía đã biết bao xa (đoạn mở đầu / kết bài)
      const wLo = prev < 0 && Number.isFinite(midHi) ? Math.max(midLo, midHi - reach) : midLo
      const wHi = Number.isFinite(midHi) ? midHi : midLo + reach
      const hint = freeAsrIn(wLo, wHi)
      const lineIds = [...new Set(L.slice(mp, mq + 1).map((t) => t.line))]
      const range = (li: number): [number, number] => [Math.max(mp, lines[li].tokStart), Math.min(mq, lines[li].tokEnd - 1)]
      let lineStarts: number[]
      if (hint.length) {
        // mỗi dòng bắt đầu ở từ nghe được (chưa dùng) có vị trí tương ứng
        lineStarts = lineIds.map((li) => hint[Math.min(hint.length - 1, Math.floor(((range(li)[0] - mp) * hint.length) / cnt))].start)
      } else if (prev < 0 && Number.isFinite(midHi)) {
        lineStarts = [] // mở đầu không có dấu hiệu: hát ngay trước dòng có mốc đầu tiên
        before(mp, mq, midHi, 0)
      } else if (!Number.isFinite(midHi)) {
        lineStarts = [] // kết bài không có dấu hiệu
        after(mp, mq, midLo, Infinity)
      } else {
        const slot = (midHi - midLo) / lineIds.length // không nghe được gì: chia đều các dòng vào khoảng trống
        lineStarts = lineIds.map((_, r) => midLo + r * slot)
      }
      lineIds.forEach((li, r) => {
        if (!lineStarts.length) return
        const [a, b] = range(li)
        const t0 = Math.max(lineStarts[r], r > 0 ? en[range(lineIds[r - 1])[1]] : midLo)
        const lim = r + 1 < lineIds.length ? Math.max(t0, lineStarts[r + 1]) : midHi
        after(a, b, Math.min(t0, Number.isFinite(midHi) ? midHi : t0), lim)
      })
    }
    k = q + 1
  }
  // an toàn: từ nội suy phải nằm đúng thứ tự giữa các mốc (bản thân các mốc đã đúng thứ tự nhờ quy hoạch động)
  for (let t = 1; t < n; t++) if (!anchor[t] && st[t] < st[t - 1]) st[t] = st[t - 1]
  for (let t = n - 2; t >= 0; t--) if (!anchor[t] && st[t] > st[t + 1]) st[t] = st[t + 1]
  for (let t = 0; t < n; t++) {
    if (st[t] < 0) st[t] = 0
    if (!anchor[t] && t + 1 < n && en[t] > st[t + 1]) en[t] = Math.max(st[t], st[t + 1])
    if (en[t] < st[t]) en[t] = st[t]
  }

  // ---- Ghép dòng + độ tin cậy
  const round = (v: number): number => Math.round(Math.max(0, v - leadIn) * 1000) / 1000
  return lines.map((ln) => {
    const words: AlignedWord[] = []
    let score = 0
    let firstStrong = -1
    for (let t = ln.tokStart; t < ln.tokEnd; t++) {
      const a = anchor[t]
      const kind: MatchKind = a ? a.kind : 'interpolated'
      if (kind === 'match') {
        score += a!.sim
        if (firstStrong < 0) firstStrong = t - ln.tokStart
      } else if (kind === 'weak') score += 0.25
      words.push({ text: L[t].text, start: round(st[t]), end: round(en[t]), kind, similarity: a ? Math.round(a.sim * 1000) / 1000 : 0 })
    }
    const cnt = ln.tokEnd - ln.tokStart
    const startPenalty = firstStrong < 0 ? 0 : Math.pow(0.85, firstStrong)
    const confidence = Math.round(Math.max(0, Math.min(1, (score / cnt) * (0.5 + 0.5 * startPenalty))) * 100) / 100
    return {
      index: ln.index,
      text: ln.text,
      start: words[0].start,
      end: words[words.length - 1].end,
      confidence: firstStrong < 0 ? Math.min(confidence, 0.2) : confidence,
      estimated: firstStrong < 0,
      words
    }
  })
}
