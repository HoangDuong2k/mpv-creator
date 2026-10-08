/**
 * Sóng hạt sau phần chữ đầu trang (island): ParticleWave của momi-ui, cong như nụ cười ôm khối chữ (`.hero-copy`,
 * khối Astro dựng sẵn nên lấy qua DOM): đáy ngay dưới khối chữ, hai đầu vươn lên ngang tiêu đề. Màu theo dải màu nhấn
 * của trang (xanh → tím). Tự dừng khi cuộn đi, bỏ quầng sáng trên máy chậm, đứng yên khi "giảm chuyển động".
 */
import { useRef, type ReactNode } from 'react'
import { ParticleWave } from 'momi-ui'

export function HeroParticleWave(): ReactNode {
  const anchor = useRef<HTMLElement | null>(null)
  // Khung phủ cả bề ngang màn hình, từ trên tiêu đề tới dưới khối chữ: sóng không phải vẽ cả phần đầu trang cao
  // (ảnh chụp app, danh sách chương, dải sóng bên dưới)
  return (
    <div
      ref={(el) => {
        anchor.current = el?.closest<HTMLElement>('.hero-copy') ?? null
      }}
      className="pointer-events-none absolute -top-40 -bottom-56 left-1/2 isolate -z-10 w-screen -translate-x-1/2"
      aria-hidden
    >
      <ParticleWave anchor={anchor} colors={['#62d0ff', '#b48cff']} />
    </div>
  )
}
