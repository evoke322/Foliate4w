const pdfjsPath = path => new URL(`vendor/pdfjs/${path}`, import.meta.url).toString()

import './vendor/pdfjs/pdf.mjs'
const pdfjsLib = globalThis.pdfjsLib
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsPath('pdf.worker.mjs')

const fetchText = async url => await (await fetch(url)).text()

// https://raw.githubusercontent.com/mozilla/pdf.js/refs/tags/v5.5.207/web/text_layer_builder.css
const textLayerBuilderCSS = await fetchText(pdfjsPath('text_layer_builder.css'))

// https://raw.githubusercontent.com/mozilla/pdf.js/refs/tags/v5.5.207/web/annotation_layer_builder.css
const annotationLayerBuilderCSS = await fetchText(pdfjsPath('annotation_layer_builder.css'))

const render = async (page, doc, zoom) => {
    const renderToken = (doc.__foliatePDFRenderToken ?? 0) + 1
    doc.__foliatePDFRenderToken = renderToken
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
    const outputScale = Math.max(1, globalThis.devicePixelRatio || 1)
    const viewport = page.getViewport({ scale })
    doc.documentElement.style.setProperty('--scale-factor', scale)

    // the canvas must be in the `PDFDocument`'s `ownerDocument`
    // (`globalThis.document` by default); that's where the fonts are loaded
    const renderCanvas = document.createElement('canvas')
    renderCanvas.height = Math.ceil(viewport.height * outputScale)
    renderCanvas.width = Math.ceil(viewport.width * outputScale)
    const canvasContext = renderCanvas.getContext('2d', { alpha: false })
    doc.__foliatePDFRenderTask?.cancel?.()
    const renderTask = page.render({
        canvas: renderCanvas,
        canvasContext,
        viewport,
        transform: outputScale === 1
            ? null
            : [outputScale, 0, 0, outputScale, 0, 0],
        background: '#ffffff',
    })
    doc.__foliatePDFRenderTask = renderTask
    try {
        await renderTask.promise
    } catch (error) {
        if (doc.__foliatePDFRenderToken !== renderToken
        || error?.name === 'RenderingCancelledException') return
        throw error
    }
    if (doc.__foliatePDFRenderTask === renderTask)
        doc.__foliatePDFRenderTask = null
    if (doc.__foliatePDFRenderToken !== renderToken) return

    // WebView2 can lose the backing bitmap when a GPU-backed canvas is adopted
    // into another document. Read the completed bitmap back into a Blob and
    // display it in the fixed-layout page document instead.
    const bitmap = await new Promise((resolve, reject) => renderCanvas.toBlob(blob =>
        blob ? resolve(blob) : reject(new Error('PDF Canvas 无法生成页面图像')),
    'image/png'))
    if (doc.__foliatePDFRenderToken !== renderToken) return
    const bitmapURL = URL.createObjectURL(bitmap)
    const image = doc.createElement('img')
    image.alt = ''
    const imageReady = new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', () =>
            reject(new Error('PDF 页面图像无法载入')), { once: true })
    })
    image.src = bitmapURL
    image.style.width = `${viewport.width}px`
    image.style.height = `${viewport.height}px`
    const previousBitmapURL = doc.__foliatePDFBitmapURL
    doc.__foliatePDFBitmapURL = bitmapURL
    const bitmapContainer = doc.querySelector('#canvas')
    bitmapContainer.className = ''
    bitmapContainer.replaceChildren(image)
    if (previousBitmapURL) URL.revokeObjectURL(previousBitmapURL)
    try {
        await imageReady
    } catch (error) {
        if (doc.__foliatePDFRenderToken === renderToken) throw error
        return
    } finally {
        URL.revokeObjectURL(bitmapURL)
        if (doc.__foliatePDFBitmapURL === bitmapURL)
            doc.__foliatePDFBitmapURL = null
    }
    if (doc.__foliatePDFRenderToken !== renderToken) return

    try {
        const textContentSource = await page.streamTextContent()
        if (doc.__foliatePDFRenderToken !== renderToken) return
        const container = doc.querySelector('.textLayer')
        doc.__foliatePDFTextLayer?.cancel?.()
        container.replaceChildren()
        const textLayer = new pdfjsLib.TextLayer({
            textContentSource,
            container, viewport,
        })
        doc.__foliatePDFTextLayer = textLayer
        await textLayer.render()
        if (doc.__foliatePDFTextLayer === textLayer)
            doc.__foliatePDFTextLayer = null
        if (doc.__foliatePDFRenderToken !== renderToken) return

        // hide "offscreen" canvases appended to document when rendering text layer
        // https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/pdf_viewer.css#L51-L58
        for (const canvas of document.querySelectorAll('.hiddenCanvasElement'))
            Object.assign(canvas.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                width: '0',
                height: '0',
                display: 'none',
            })

        // fix text selection
        // https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/text_layer_builder.js#L105-L107
        const endOfContent = doc.createElement('div')
        endOfContent.className = 'endOfContent'
        container.append(endOfContent)
        // TODO: this only works in Firefox; see https://github.com/mozilla/pdf.js/pull/17923
        container.onpointerdown = () => container.classList.add('selecting')
        container.onpointerup = () => container.classList.remove('selecting')
    } catch (error) {
        if (error?.name !== 'RenderingCancelledException')
            console.warn('PDF text layer render failed', error)
    }

    try {
        const annotations = await page.getAnnotations()
        if (doc.__foliatePDFRenderToken !== renderToken) return
        const div = doc.querySelector('.annotationLayer')
        div.replaceChildren()
        const linkService = {
            goToDestination: () => {},
            getDestinationHash: dest => JSON.stringify(dest),
            addLinkAttributes: (link, url) => link.href = url,
        }
        await new pdfjsLib.AnnotationLayer({ page, viewport, div, linkService })
            .render({ annotations })
    } catch (error) {
        console.warn('PDF annotation layer render failed', error)
    }
}

const renderPage = async (page, getImageBlob) => {
    const viewport = page.getViewport({ scale: 1 })
    if (getImageBlob) {
        const canvas = document.createElement('canvas')
        canvas.height = viewport.height
        canvas.width = viewport.width
        const canvasContext = canvas.getContext('2d')
        await page.render({ canvasContext, viewport }).promise
        return new Promise(resolve => canvas.toBlob(resolve))
    }
    const src = URL.createObjectURL(new Blob([`
        <!DOCTYPE html>
        <html lang="en">
        <meta charset="utf-8">
        <meta name="viewport" content="width=${viewport.width}, height=${viewport.height}">
        <style>
        html, body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: #fff;
        }
        #canvas, .textLayer, .annotationLayer {
            position: absolute;
            inset: 0;
        }
        #canvas { z-index: 0; }
        #canvas canvas, #canvas img { display: block; }
        #canvas.render-error {
            box-sizing: border-box;
            display: grid;
            place-items: center;
            padding: 2rem;
            color: #a51d2d;
            font: 14px/1.5 system-ui, sans-serif;
            text-align: center;
        }
        .textLayer { z-index: 2; }
        .annotationLayer { z-index: 3; }
        /*
        https://github.com/mozilla/pdf.js/commit/bd05b255fabfc313b194bfe9a17ccded4d90fb5a
        */
        :root {
          --user-unit: 1;
          --total-scale-factor: calc(var(--scale-factor) * var(--user-unit));
          --scale-round-x: 1px;
          --scale-round-y: 1px;
        }
        ${textLayerBuilderCSS}
        ${annotationLayerBuilderCSS}
        </style>
        <div id="canvas"></div>
        <div class="textLayer"></div>
        <div class="annotationLayer"></div>
    `], { type: 'text/html' }))
    const onZoom = ({ doc, scale }) => render(page, doc, scale).catch(error => {
        console.error('PDF page render failed', error)
        const container = doc.querySelector('#canvas')
        container.className = 'render-error'
        container.textContent = `PDF 页面渲染失败：${error?.message || String(error)}`
    })
    return { src, onZoom }
}

const makeTOCItem = item => ({
    label: item.title,
    href: JSON.stringify(item.dest),
    subitems: item.items.length ? item.items.map(makeTOCItem) : null,
})

export const makePDF = async file => {
    const transport = new pdfjsLib.PDFDataRangeTransport(file.size, [])
    transport.requestDataRange = (begin, end) => {
        file.slice(begin, end).arrayBuffer().then(chunk => {
            transport.onDataRange(begin, chunk)
        })
    }
    const pdf = await pdfjsLib.getDocument({
        range: transport,
        cMapUrl: pdfjsPath('cmaps/'),
        iccUrl: pdfjsPath('iccs/'),
        standardFontDataUrl: pdfjsPath('standard_fonts/'),
        wasmUrl: pdfjsPath('wasm/'),
        isEvalSupported: false,
    }).promise

    const book = { rendition: { layout: 'pre-paginated' } }

    const { metadata, info } = await pdf.getMetadata() ?? {}
    // TODO: for better results, parse `metadata.getRaw()`
    book.metadata = {
        title: metadata?.get('dc:title') ?? info?.Title,
        author: metadata?.get('dc:creator') ?? info?.Author,
        contributor: metadata?.get('dc:contributor'),
        description: metadata?.get('dc:description') ?? info?.Subject,
        language: metadata?.get('dc:language'),
        publisher: metadata?.get('dc:publisher'),
        subject: metadata?.get('dc:subject'),
        identifier: metadata?.get('dc:identifier'),
        source: metadata?.get('dc:source'),
        rights: metadata?.get('dc:rights'),
    }

    const outline = await pdf.getOutline()
    book.toc = outline?.map(makeTOCItem)

    const cache = new Map()
    book.sections = Array.from({ length: pdf.numPages }).map((_, i) => ({
        id: i,
        load: async () => {
            const cached = cache.get(i)
            if (cached) return cached
            const url = await renderPage(await pdf.getPage(i + 1))
            cache.set(i, url)
            return url
        },
        size: 1000,
    }))
    book.isExternal = uri => /^\w+:/i.test(uri)
    book.resolveHref = async href => {
        const parsed = JSON.parse(href)
        const dest = typeof parsed === 'string'
            ? await pdf.getDestination(parsed) : parsed
        const index = await pdf.getPageIndex(dest[0])
        return { index }
    }
    book.splitTOCHref = async href => {
        const parsed = JSON.parse(href)
        const dest = typeof parsed === 'string'
            ? await pdf.getDestination(parsed) : parsed
        const index = await pdf.getPageIndex(dest[0])
        return [index, null]
    }
    book.getTOCFragment = doc => doc.documentElement
    book.getCover = async () => renderPage(await pdf.getPage(1), true)
    book.destroy = () => pdf.destroy()
    return book
}
