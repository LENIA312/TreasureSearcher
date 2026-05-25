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

// 一致後ロック
let foundLocked = false

// 検索中ロック
let isSearching = false

// OpenCV読み込み待機
async function waitForOpenCV() {
  return new Promise(resolve => {

    const check = () => {
      if (
        window.cv &&
        cv.imread
      ) {
        resolve()
      } else {
        setTimeout(check, 100)
      }
    }

    check()
  })
}

// 初期化
async function init() {
  await waitForOpenCV()

  const res =
    await fetch('./data/items.json')

  items = await res.json()

  // 両方表示
  mobileArea.classList.remove(
    'hidden'
  )

  pcArea.classList.remove(
    'hidden'
  )
}

init()

// カメラ開始
document
  .getElementById('camera-btn')
  ?.addEventListener(
    'click',
    startCamera
  )

// 撮影
document
  .getElementById('capture-btn')
  ?.addEventListener(
    'click',
    capturePhoto
  )

// アップロード
document
  .getElementById('upload')
  ?.addEventListener(
    'change',
    async e => {

      const file =
        e.target.files[0]

      if (file) {
        search(file)
      }
    }
  )

// Ctrl+V
window.addEventListener(
  'paste',
  async e => {

    const clipboardItems =
      e.clipboardData.items

    for (const item of clipboardItems) {

      if (
        item.type.startsWith(
          'image'
        )
      ) {

        const file =
          item.getAsFile()

        if (file) {
          search(file)
        }
      }
    }
  }
)

// カメラ起動
async function startCamera() {
  try {

    // ロック解除
    foundLocked = false

    // 検索ロック解除
    isSearching = false

    const guide =
      document.getElementById(
        'camera-guide'
      )

    if (guide) {
      guide.classList.remove(
        'hidden'
      )
    }

    result.innerHTML = ''

    stream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode:
            'environment'
        }
      })

    video.srcObject = stream

    captureBtn.classList.remove(
      'hidden'
    )

  } catch (err) {

    console.error(err)

    alert(
      'カメラ起動に失敗しました'
    )
  }
}

// 撮影
async function capturePhoto() {

  // 一致後 or 検索中ロック
  if (
    foundLocked ||
    isSearching
  ) {
    return
  }

  const guide =
    document.getElementById(
      'camera-guide'
    )

  const videoRect =
    video.getBoundingClientRect()

  const guideRect =
    guide.getBoundingClientRect()

  // video実サイズ比率
  const scaleX =
    video.videoWidth /
    videoRect.width

  const scaleY =
    video.videoHeight /
    videoRect.height

  // guide位置
  const sx =
    (
      guideRect.left -
      videoRect.left
    ) * scaleX

  const sy =
    (
      guideRect.top -
      videoRect.top
    ) * scaleY

  const sw =
    guideRect.width *
    scaleX

  const sh =
    guideRect.height *
    scaleY

  // crop
  const canvas =
    document.createElement(
      'canvas'
    )

  canvas.width = 333
  canvas.height = 282

  const ctx =
    canvas.getContext('2d')

  ctx.drawImage(
    video,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    333,
    282
  )

  canvas.toBlob(blob => {
    if (blob) {
      search(blob)
    }
  })
}

// 検索
async function search(blob) {

  // 多重実行防止
  if (isSearching) {
    return
  }

  isSearching = true

  loading.classList.remove(
    'hidden'
  )

  result.innerHTML =
    '<p>検索中...</p>'

  try {

    const queryBitmap =
      await createImageBitmap(
        blob
      )

    const queryCanvas =
      document.createElement(
        'canvas'
      )

    queryCanvas.width =
      queryBitmap.width

    queryCanvas.height =
      queryBitmap.height

    const qctx =
      queryCanvas.getContext(
        '2d'
      )

    qctx.drawImage(
      queryBitmap,
      0,
      0
    )

    let bestItem = null
    let bestScore = 0

    // 全件比較
    for (const item of items) {

      const img =
        new Image()

      img.src = item.image

      await img.decode()

      const templateCanvas =
        document.createElement(
          'canvas'
        )

      templateCanvas.width =
        img.width

      templateCanvas.height =
        img.height

      const tctx =
        templateCanvas.getContext(
          '2d'
        )

      tctx.drawImage(
        img,
        0,
        0
      )

      const score =
        await templateMatch(
          queryCanvas,
          templateCanvas
        )

      console.log(
        item.position,
        score
      )

      if (
        score > bestScore
      ) {
        bestScore = score
        bestItem = item
      }
    }

    loading.classList.add(
      'hidden'
    )

    console.log(
      'BEST SCORE',
      bestScore
    )

    // 閾値
    if (
      bestScore < 0.75
    ) {

      result.innerHTML =
        '<p>該当なし</p>'

      isSearching = false

      return
    }

    // 一致後ロック
    foundLocked = true

    result.innerHTML = `
      <img
        src="${bestItem.mapImage}"
        class="result-image"
      >

      <h2>
        ${bestItem.position}
      </h2>

      <p>
        ${bestItem.description}
      </p>

      <small>
        ${bestItem.detail}
      </small>

      <p>
        一致率:
        ${(bestScore * 100)
          .toFixed(1)}%
      </p>
    `

    // スクロール
    result.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })

    // ガイド消す
    const guide =
      document.getElementById(
        'camera-guide'
      )

    if (guide) {
      guide.classList.add(
        'hidden'
      )
    }

    isSearching = false

  } catch (err) {

    console.error(err)

    loading.classList.add(
      'hidden'
    )

    result.innerHTML =
      '<p>検索エラー</p>'

    isSearching = false
  }
}

// OpenCV template matching
async function templateMatch(
  sourceCanvas,
  templateCanvas
) {

  return new Promise(resolve => {

    // source
    let src =
      cv.imread(sourceCanvas)

    // template
    let templ =
      cv.imread(templateCanvas)

    // サイズ統一
    const targetWidth = 333
    const targetHeight = 282

    const srcResized =
      new cv.Mat()

    const templResized =
      new cv.Mat()

    cv.resize(
      src,
      srcResized,
      new cv.Size(
        targetWidth,
        targetHeight
      )
    )

    cv.resize(
      templ,
      templResized,
      new cv.Size(
        targetWidth,
        targetHeight
      )
    )

    // grayscale
    cv.cvtColor(
      srcResized,
      srcResized,
      cv.COLOR_RGBA2GRAY
    )

    cv.cvtColor(
      templResized,
      templResized,
      cv.COLOR_RGBA2GRAY
    )

    // edge化
    cv.Canny(
      srcResized,
      srcResized,
      50,
      150
    )

    cv.Canny(
      templResized,
      templResized,
      50,
      150
    )

    const result =
      new cv.Mat()

    cv.matchTemplate(
      srcResized,
      templResized,
      result,
      cv.TM_CCOEFF_NORMED
    )

    const mm =
      cv.minMaxLoc(result)

    const score =
      mm.maxVal

    // cleanup
    src.delete()
    templ.delete()

    srcResized.delete()
    templResized.delete()

    result.delete()

    resolve(score)
  })
}