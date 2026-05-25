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

  // 一致後ロック
  if (foundLocked) {
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
        item.name,
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
      bestScore < 0.45
    ) {

      result.innerHTML =
        '<p>該当なし</p>'

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

  } catch (err) {

    console.error(err)

    loading.classList.add(
      'hidden'
    )

    result.innerHTML =
      '<p>検索エラー</p>'
  }
}

// OpenCV template matching
async function templateMatch(
  sourceCanvas,
  templateCanvas
) {

  return new Promise(resolve => {

    const src =
      cv.imread(sourceCanvas)

    const templ =
      cv.imread(templateCanvas)

    // templateが大きいとエラー
    const resultCols =
      src.cols -
      templ.cols +
      1

    const resultRows =
      src.rows -
      templ.rows +
      1

    if (
      resultCols <= 0 ||
      resultRows <= 0
    ) {

      src.delete()
      templ.delete()

      resolve(0)

      return
    }

    const result =
      new cv.Mat()

    result.create(
      resultRows,
      resultCols,
      cv.CV_32FC1
    )

    // マッチング
    cv.matchTemplate(
      src,
      templ,
      result,
      cv.TM_CCOEFF_NORMED
    )

    const mm =
      cv.minMaxLoc(
        result
      )

    const score =
      mm.maxVal

    src.delete()
    templ.delete()
    result.delete()

    resolve(score)
  })
}