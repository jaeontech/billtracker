// Rasterize public/icon.svg into the PNG sizes the manifest + iOS need.
// Run with: node scripts/gen-icons.mjs
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url))
const out = new URL('../public/', import.meta.url)
const sizes = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]
for (const [name, size] of sizes) {
  await sharp(svg).resize(size, size).png().toFile(new URL(name, out).pathname)
  console.log('wrote', name, `${size}x${size}`)
}
