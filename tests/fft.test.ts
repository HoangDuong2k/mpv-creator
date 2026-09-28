import { describe, expect, it } from 'vitest'
import { FFT } from '../src/main/audio/fft'

describe('FFT', () => {
  it('sin tại bin k cho đỉnh đúng bin, biên độ N/2', () => {
    const n = 1024
    const k = 37
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * k * i) / n)
    new FFT(n).transform(re, im)
    const mag = (b: number): number => Math.hypot(re[b], im[b])
    expect(mag(k)).toBeCloseTo(n / 2, 6)
    expect(mag(k + 3)).toBeLessThan(1e-6)
  })

  it('từ chối kích thước không phải luỹ thừa 2', () => {
    expect(() => new FFT(1000)).toThrow()
  })
})
