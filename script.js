const isMobile =
  /Android|iPhone|iPad|iPod/i.test(
    navigator.userAgent
  )

const mobileArea =
  document.getElementById('mobile-area')

const pcArea =
  document.getElementById('pc-area')

const loading =
  document.getElementById('loading')

const result =
  document.getElementById('result')

const video =
  document.getElementById('video')

const captureBtn =
  document.getElementById('capture-btn')

let stream = null
let items = []

async function init() {
  const res =
    await fetch('./data/items.json')

  items = await res.json()

  if (isMobile) {
    mobileArea.classList.remove('hidden')
  } else {
    pcArea.classList.remove('hidden')
  }
}

init()

// スマホ カメラ開始
document
  .getElementById('camera-btn')
  ?.addEventListener('click', startCamera)

// スマホ 撮影
document
  .getElementById('capture-btn')
  ?.addEventListener('click', capturePhoto)

// PC スクリーンキャプチャ
document
  .getElementById('screen-btn')
  ?.addEventListener('click', captureScreen)

// 画像アップロード
document
  .getElementById('upload')
  ?.addEventListener('change', async e => {
    const file = e.target.files[0]

    if (file) {
      search(file)
    }
  })

// クリップボード貼り付け
window.addEventListener('paste', async e => {
  const items = e.clipboardData.items

  for (const item of items) {
    if (item.type.startsWith('image')) {
      const file = item.getAsFile()

      if (file) {
        search(file)
      }
    }
  }
})

// スマホ カメラ起動
async function startCamera() {
  stream =
    await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment'
      }
    })

  video.srcObject = stream

  captureBtn.classList.remove('hidden')
}

// スマホ 撮影
async function capturePhoto() {
  const canvas =
    document.createElement('canvas')

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d')

  ctx.drawImage(video, 0, 0)

  canvas.toBlob(blob => {
    search(blob)
  })
}

// PC 範囲選択キャプチャ
async function captureScreen() {
  const displayStream =
    await navigator.mediaDevices.getDisplayMedia({
      video: true
    })

  const tempVideo =
    document.createElement('video')

  tempVideo.srcObject = displayStream

  await tempVideo.play()

  // 元スクリーン保存
  const sourceCanvas =
    document.createElement('canvas')

  sourceCanvas.width =
    tempVideo.videoWidth

  sourceCanvas.height =
    tempVideo.videoHeight

  const sourceCtx =
    sourceCanvas.getContext('2d')

  sourceCtx.drawImage(
    tempVideo,
    0,
    0
  )

  // overlay
  const overlay =
    document.createElement('div')

  overlay.style.position = 'fixed'
  overlay.style.left = '0'
  overlay.style.top = '0'
  overlay.style.width = '100vw'
  overlay.style.height = '100vh'
  overlay.style.zIndex = '999999'
  overlay.style.cursor = 'crosshair'
  overlay.style.background =
    'rgba(0,0,0,0.3)'

  document.body.appendChild(overlay)

  // 選択枠
  const box =
    document.createElement('div')

  box.style.position = 'absolute'
  box.style.border =
    '2px solid white'

  overlay.appendChild(box)

  let startX = 0
  let startY = 0
  let selecting = false

  overlay.addEventListener('mousedown', e => {
    selecting = true

    startX = e.clientX
    startY = e.clientY

    box.style.left = startX + 'px'
    box.style.top = startY + 'px'
    box.style.width = '0px'
    box.style.height = '0px'
  })

  overlay.addEventListener('mousemove', e => {
    if (!selecting) return

    const currentX = e.clientX
    const currentY = e.clientY

    const x =
      Math.min(startX, currentX)

    const y =
      Math.min(startY, currentY)

    const w =
      Math.abs(currentX - startX)

    const h =
      Math.abs(currentY - startY)

    box.style.left = x + 'px'
    box.style.top = y + 'px'
    box.style.width = w + 'px'
    box.style.height = h + 'px'
  })

  overlay.addEventListener('mouseup', e => {
    if (!selecting) return

    selecting = false

    const endX = e.clientX
    const endY = e.clientY

    const x =
      Math.min(startX, endX)

    const y =
      Math.min(startY, endY)

    const w =
      Math.abs(endX - startX)

    const h =
      Math.abs(endY - startY)

    overlay.remove()

    // 切り抜き
    const cropCanvas =
      document.createElement('canvas')

    cropCanvas.width = w
    cropCanvas.height = h

    const cropCtx =
      cropCanvas.getContext('2d')

    const scaleX =
      sourceCanvas.width /
      window.innerWidth

    const scaleY =
      sourceCanvas.height /
      window.innerHeight

    cropCtx.drawImage(
      sourceCanvas,
      x * scaleX,
      y * scaleY,
      w * scaleX,
      h * scaleY,
      0,
      0,
      w,
      h
    )

    cropCanvas.toBlob(blob => {
      if (blob) {
        search(blob)
      }
    })

    // stream停止
    displayStream
      .getTracks()
      .forEach(track => track.stop())
  })
}

// 検索処理
async function search(blob) {
  loading.classList.remove('hidden')

  const queryHash =
    await createHash(blob)

  let bestItem = null
  let bestScore = Infinity

  for (const item of items) {
    const res =
      await fetch(item.image)

    const itemBlob =
      await res.blob()

    const itemHash =
      await createHash(itemBlob)

    const score =
      hammingDistance(
        queryHash,
        itemHash
      )

    if (score < bestScore) {
      bestScore = score
      bestItem = item
    }
  }

  loading.classList.add('hidden')

  if (bestScore > 20) {
    result.innerHTML =
      '<p>該当なし</p>'

    return
  }

  result.innerHTML = `
    <img
      src="${bestItem.image}"
      class="result-image"
    >

    <h2>${bestItem.name}</h2>

    <p>${bestItem.description}</p>

    <small>${bestItem.detail}</small>
  `
}

// average hash
async function createHash(blob) {
  const bitmap =
    await createImageBitmap(blob)

  const canvas =
    document.createElement('canvas')

  canvas.width = 32
  canvas.height = 32

  const ctx = canvas.getContext('2d')

  ctx.drawImage(
    bitmap,
    0,
    0,
    32,
    32
  )

  const imageData =
    ctx.getImageData(
      0,
      0,
      32,
      32
    )

  const pixels =
    imageData.data

  const gray = []

  for (
    let i = 0;
    i < pixels.length;
    i += 4
  ) {
    gray.push(
      (
        pixels[i] +
        pixels[i + 1] +
        pixels[i + 2]
      ) / 3
    )
  }

  const avg =
    gray.reduce(
      (a, b) => a + b,
      0
    ) / gray.length

  return gray
    .map(v =>
      v >= avg ? '1' : '0'
    )
    .join('')
}

// ハミング距離
function hammingDistance(a, b) {
  let distance = 0

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      distance++
    }
  }

  return distance
}