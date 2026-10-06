/**
 * transformers.js luôn import sharp (xử lý ảnh) dù AI căn lời chỉ dùng âm thanh. Thay bằng bản rỗng khi build để
 * không phải đóng gói sharp và thư viện ảnh libvips (~18 MB mỗi hệ điều hành).
 */
export default function sharp(): never {
  throw new Error('sharp không có trong bản build này')
}
