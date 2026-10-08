/**
 * Đốm sáng lơ lửng sau phần đầu trang (island): Fireflies của momi-ui, hai màu theo dải màu nhấn, tò mò bay lại khi
 * con trỏ tới gần, mờ dần về phía dưới (lớp .hero-fireflies). Bọc trong island riêng thay vì dùng thẳng trong Astro:
 * island trỏ thẳng vào gói momi-ui thì cả thư viện thành một điểm vào, không lược được phần không dùng (~450 KB).
 */
import type { ReactNode } from 'react'
import { Fireflies } from 'momi-ui'

export function HeroFireflies(): ReactNode {
  return <Fireflies colors={['#62d0ff', '#b48cff']} className="hero-fireflies h-[620px] sm:h-[760px]" />
}
