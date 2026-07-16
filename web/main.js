import {
    Baseline,
    BookMarked,
    BookOpen,
    Bookmark,
    BookmarkCheck,
    CaseSensitive,
    ChevronLeft,
    ChevronRight,
    Copy,
    CopyCheck,
    CopyPlus,
    Contrast,
    Download,
    ExternalLink,
    FileText,
    FolderOpen,
    Grid2X2,
    Highlighter,
    Info,
    Keyboard,
    Languages,
    List,
    ListTree,
    Maximize2,
    MoreHorizontal,
    Moon,
    PanelLeftClose,
    PanelLeftOpen,
    Plus,
    Printer,
    Redo2,
    RefreshCw,
    RotateCcw,
    RotateCw,
    Search,
    Settings2,
    Sun,
    TextSelect,
    Trash2,
    Undo2,
    Upload,
    Volume2,
    WholeWord,
    X,
    ZoomIn,
    ZoomOut,
    createIcons,
} from 'lucide'
import {
    LibraryStore,
    cloneMetadata,
    getBookIdentity,
    normalizeIdentifier,
} from './library.js'

const $ = selector => document.querySelector(selector)
const $$ = selector => Array.from(document.querySelectorAll(selector))
const supportedExtensions = ['epub', 'mobi', 'azw', 'azw3', 'fb2', 'fbz', 'zip', 'cbz', 'pdf']
const mimeTypes = {
    epub: 'application/epub+zip',
    mobi: 'application/x-mobipocket-ebook',
    azw: 'application/x-mobipocket-ebook',
    azw3: 'application/vnd.amazon.mobi8-ebook',
    fb2: 'application/x-fictionbook+xml',
    fbz: 'application/x-zip-compressed-fb2',
    zip: 'application/zip',
    cbz: 'application/vnd.comicbook+zip',
    pdf: 'application/pdf',
}
const invoke = globalThis.__TAURI__?.core?.invoke
const percentFormat = new Intl.NumberFormat('zh-CN', {
    style: 'percent',
    maximumFractionDigits: 0,
})
const listFormat = new Intl.ListFormat('zh-CN', {
    style: 'short',
    type: 'conjunction',
})
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
})
const bookThemes = {
    default: {
        light: { fg: '#000000', bg: '#ffffff', link: '#0066cc' },
        dark: { fg: '#e0e0e0', bg: '#222222', link: '#77bbee' },
    },
    gray: {
        light: { fg: '#222222', bg: '#e0e0e0', link: '#4488cc' },
        dark: { fg: '#c6c6c6', bg: '#444444', link: '#88ccee' },
    },
    sepia: {
        light: { fg: '#5b4636', bg: '#f1e8d0', link: '#008b8b' },
        dark: { fg: '#ffd595', bg: '#342e25', link: '#48d1cc' },
    },
    grass: {
        light: { fg: '#232c16', bg: '#d7dbbd', link: '#177b4d' },
        dark: { fg: '#d8deba', bg: '#333627', link: '#a6d608' },
    },
    cherry: {
        light: { fg: '#4e1609', bg: '#f0d1d5', link: '#de3838' },
        dark: { fg: '#e5c4c8', bg: '#462f32', link: '#ff646e' },
    },
    sky: {
        light: { fg: '#262d48', bg: '#cedef5', link: '#2d53e5' },
        dark: { fg: '#babee1', bg: '#282e47', link: '#ff646e' },
    },
    solarized: {
        light: { fg: '#586e75', bg: '#fdf6e3', link: '#268bd2' },
        dark: { fg: '#93a1a1', bg: '#002b36', link: '#268bd2' },
    },
    gruvbox: {
        light: { fg: '#3c3836', bg: '#fbf1c7', link: '#076678' },
        dark: { fg: '#ebdbb2', bg: '#282828', link: '#83a598' },
    },
    nord: {
        light: { fg: '#2e3440', bg: '#eceff4', link: '#5e81ac' },
        dark: { fg: '#d8dee9', bg: '#2e3440', link: '#88c0d0' },
    },
}
const icons = {
    Baseline,
    BookMarked,
    BookOpen,
    Bookmark,
    BookmarkCheck,
    CaseSensitive,
    ChevronLeft,
    ChevronRight,
    Copy,
    CopyCheck,
    CopyPlus,
    Contrast,
    Download,
    ExternalLink,
    FileText,
    FolderOpen,
    Grid2X2,
    Highlighter,
    Info,
    Keyboard,
    Languages,
    List,
    ListTree,
    Maximize2,
    MoreHorizontal,
    Moon,
    PanelLeftClose,
    PanelLeftOpen,
    Plus,
    Printer,
    Redo2,
    RefreshCw,
    RotateCcw,
    RotateCw,
    Search,
    Settings2,
    Sun,
    TextSelect,
    Trash2,
    Undo2,
    Upload,
    Volume2,
    WholeWord,
    X,
    ZoomIn,
    ZoomOut,
}

createIcons({ icons })

const foliateViewModule = '/foliate-js/view.js'
const foliateTreeModule = '/foliate-js/ui/tree.js'
const foliateOverlayerModule = '/foliate-js/overlayer.js'
const foliateFootnotesModule = '/foliate-js/footnotes.js'
let readerEnginePromise
const loadReaderEngine = () => readerEnginePromise ??= Promise.all([
    import(/* @vite-ignore */ foliateViewModule),
    import(/* @vite-ignore */ foliateTreeModule),
    import(/* @vite-ignore */ foliateOverlayerModule),
    import(/* @vite-ignore */ foliateFootnotesModule),
]).then(([, tree, overlayer, footnotes]) => ({
    createTOCView: tree.createTOCView,
    Overlayer: overlayer.Overlayer,
    FootnoteHandler: footnotes.FootnoteHandler,
}))

const formatLanguageMap = value => {
    if (!value) return ''
    if (typeof value === 'string') return value
    return value['zh-CN'] ?? value.zh ?? value.en ?? Object.values(value)[0] ?? ''
}

const formatContributor = contributor => {
    const formatOne = value => typeof value === 'string'
        ? value
        : formatLanguageMap(value?.name ?? value)
    return Array.isArray(contributor)
        ? listFormat.format(contributor.map(formatOne).filter(Boolean))
        : formatOne(contributor)
}

const getExtension = name => name.split('.').pop()?.toLowerCase()
const storedNumber = (key, fallback) => {
    const stored = localStorage.getItem(key)
    if (stored == null) return fallback
    const value = Number(stored)
    return Number.isFinite(value) ? value : fallback
}
const storedBoolean = (key, fallback) => {
    const value = localStorage.getItem(key)
    return value == null ? fallback : value === 'true'
}
const selectionTools = [
    'copy', 'copy-citation', 'copy-cfi', 'find', 'speak',
    'highlight', 'dictionary', 'wikipedia', 'translate', 'print',
]
let selectionToolbarEnabled = storedBoolean('selection-toolbar-enabled', true)
const selectionToolEnabled = Object.fromEntries(selectionTools.map(action => [
    action,
    storedBoolean(`selection-tool-${action}`, true),
]))
const formatDuration = seconds => {
    if (!Number.isFinite(seconds) || seconds < 0) return '—'
    const minutes = Math.max(1, Math.round(seconds / 60))
    if (minutes < 60) return `${minutes} 分钟`
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}
const flattenNavigation = (items, depth = 0) => (items ?? []).flatMap(item => [
    { ...item, depth },
    ...flattenNavigation(item.subitems, depth + 1),
])

const toArrayBuffer = value => {
    if (value instanceof ArrayBuffer) return value
    if (ArrayBuffer.isView(value))
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
    return Uint8Array.from(value).buffer
}

class NativeBookSlice {
    constructor(path, start, end, type = '') {
        this.path = path
        this.start = start
        this.end = end
        this.size = end - start
        this.type = type
    }

    async arrayBuffer() {
        return toArrayBuffer(await invoke('read_book_range', {
            path: this.path,
            begin: this.start,
            end: this.end,
        }))
    }

    async text() {
        return new TextDecoder().decode(await this.arrayBuffer())
    }
}

class NativeBookFile extends NativeBookSlice {
    constructor(path, size, lastModified = 0) {
        const name = path.split(/[\\/]/).pop() || 'book'
        const extension = getExtension(name)
        super(path, 0, size, mimeTypes[extension] || 'application/octet-stream')
        this.name = name
        this.lastModified = lastModified
        this.sourcePath = path
    }

    slice(start = 0, end = this.size, type = '') {
        const normalize = value => value < 0
            ? Math.max(this.size + value, 0)
            : Math.min(value, this.size)
        const begin = normalize(Number(start) || 0)
        const finish = Math.max(begin, normalize(end == null ? this.size : Number(end)))
        return new NativeBookSlice(this.path, begin, finish, type)
    }
}

const nativeBookFromInfo = info =>
    new NativeBookFile(info.path, Number(info.size), Number(info.lastModified) || 0)

const readerCSS = settings => {
    const theme = currentTheme()
    const palette = bookThemes[settings.bookTheme] ?? bookThemes.default
    const inverted = theme === 'dark' && settings.invertDark
    const colors = inverted ? palette.light
        : theme === 'dark' ? palette.dark : palette.light
    const defaultFamily = settings.defaultFont === 'sans-serif'
        ? settings.sansFont
        : settings.serifFont
    return `
    @namespace epub "http://www.idpf.org/2007/ops";
    :root {
        color-scheme: ${theme};
        --foliate-serif: ${JSON.stringify(settings.serifFont)}, serif;
        --foliate-sans-serif: ${JSON.stringify(settings.sansFont)}, sans-serif;
        --foliate-monospace: ${JSON.stringify(settings.monospaceFont)}, monospace;
    }
    html {
        color: ${colors.fg};
        background: ${colors.bg};
        font-family: ${JSON.stringify(defaultFamily)}, ${settings.defaultFont};
        font-size: ${settings.fontSize}px;
        line-height: ${settings.lineHeight};
        hanging-punctuation: allow-end last;
        orphans: 2;
        widows: 2;
    }
    body {
        background: transparent;
    }
    a:any-link {
        color: ${colors.link};
        text-underline-offset: .1em;
    }
    p, li, blockquote, dd {
        font-size: max(1em, ${settings.minimumFontSize}px);
        line-height: ${settings.lineHeight};
        text-align: ${settings.justify ? 'justify' : 'start'};
        hyphens: ${settings.hyphenate ? 'auto' : 'none'};
    }
    h1, h2, h3, h4, h5, h6, hgroup, th {
        text-wrap: balance;
    }
    :is(code, kbd, samp, pre) {
        font-family: var(--foliate-monospace);
    }
    pre {
        white-space: pre-wrap !important;
        tab-size: 2;
    }
    aside[epub|type~="footnote"],
    aside[epub|type~="endnote"] {
        display: none;
    }
    img, svg {
        background: transparent;
    }
    ${settings.overrideFont ? `
    body, body * {
        font-family: ${JSON.stringify(defaultFamily)}, ${settings.defaultFont} !important;
    }
    :is(code, kbd, samp, pre), :is(code, kbd, samp, pre) * {
        font-family: var(--foliate-monospace) !important;
    }` : ''}
    ${settings.flow === 'scrolled' ? 'body { padding-inline: 4%; }' : ''}
`
}

const getSelectionRange = selection => {
    if (!selection?.rangeCount) return null
    const range = selection.getRangeAt(0)
    return range.collapsed ? null : range
}

const getLang = node => {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
    if (!element) return ''
    return element.lang
        || element.getAttributeNS?.('http://www.w3.org/XML/1998/namespace', 'lang')
        || getLang(element.parentElement)
}

const getPopoverPosition = range => {
    const rects = Array.from(range.getClientRects())
    const rect = rects.at(-1) ?? range.getBoundingClientRect()
    const frame = range.startContainer.ownerDocument.defaultView?.frameElement
    const frameRect = frame?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth, height: innerHeight }
    const scaleX = frame?.offsetWidth ? frameRect.width / frame.offsetWidth : 1
    const scaleY = frame?.offsetHeight ? frameRect.height / frame.offsetHeight : 1
    return {
        x: Math.max(90, Math.min(innerWidth - 90,
            frameRect.left + (rect.left + rect.right) / 2 * scaleX)),
        y: Math.max(74, Math.min(innerHeight - 120,
            frameRect.top + rect.top * scaleY)),
    }
}

const safeParse = (value, fallback) => {
    try {
        return JSON.parse(value) ?? fallback
    } catch {
        return fallback
    }
}

const library = new LibraryStore()

class Reader {
    view = null
    coverURL = null
    tocView = null
    flow = localStorage.getItem('reader-flow') || 'paginated'
    bookTheme = localStorage.getItem('reader-book-theme') || 'default'
    fontSize = storedNumber('reader-font-size', 16)
    minimumFontSize = storedNumber('reader-minimum-font-size', 0)
    defaultFont = localStorage.getItem('reader-default-font') || 'serif'
    overrideFont = storedBoolean('reader-override-font', false)
    serifFont = localStorage.getItem('reader-serif-font') || 'Georgia'
    sansFont = localStorage.getItem('reader-sans-font') || 'Segoe UI'
    monospaceFont = localStorage.getItem('reader-monospace-font') || 'Consolas'
    lineHeight = storedNumber('reader-line-height', 1.6)
    justify = storedBoolean('reader-justify', true)
    hyphenate = storedBoolean('reader-hyphenate', true)
    pageMargin = storedNumber('reader-page-margin', 42)
    pageWidth = storedNumber('reader-page-width', 720)
    pageHeight = storedNumber('reader-page-height', 1200)
    maxColumns = storedNumber('reader-max-columns', 2)
    reduceAnimation = storedBoolean('reader-reduce-animation', false)
    invertDark = storedBoolean('reader-invert-dark', false)
    autohideCursor = storedBoolean('reader-autohide-cursor', false)
    pdfZoom = localStorage.getItem('pdf-zoom') || 'fit-page'
    pdfWheel = storedBoolean('pdf-wheel', true)
    pdfInvertDark = storedBoolean('pdf-invert-dark', false)
    positionKey = null
    dataKey = null
    annotations = []
    bookmarks = []
    currentLocation = null
    currentFile = null
    bookId = null
    libraryRecord = null
    metadata = {}
    engine = null
    footnoteHandler = null
    footnoteHref = null
    searchIterator = null
    searchToken = 0
    searchResults = []
    searchIndex = -1
    progressSaveTimer = null

    async open(file, storageIdentity = null, libraryRecord = null) {
        await this.close()
        this.engine = await loadReaderEngine()
        this.currentFile = file
        this.libraryRecord = libraryRecord
        const legacyIdentity = storageIdentity
            ? `path:${storageIdentity}`
            : `file:${file.name}:${file.size}:${file.lastModified}`

        this.view = document.createElement('foliate-view')
        $('#reader-surface').replaceChildren(this.view)
        this.setupFootnotes()
        this.setupEvents()

        await this.view.open(file)
        this.applyLayout()
        this.applyTheme()
        const inspected = await this.updateMetadata(file)
        const identity = libraryRecord
            ? {
                id: libraryRecord.id,
                identifier: libraryRecord.identifier,
                fingerprint: libraryRecord.fingerprint,
            }
            : await getBookIdentity(file, inspected.metadata)
        this.bookId = identity.id
        this.positionKey = `position:${identity.id}`
        this.dataKey = `reader-data:${identity.id}`

        const legacyPositionKey = `position:${legacyIdentity}`
        const legacyDataKey = `reader-data:${legacyIdentity}`
        const legacyPosition = localStorage.getItem(legacyPositionKey)
        const legacyData = safeParse(localStorage.getItem(legacyDataKey), {})
        const stored = libraryRecord ?? safeParse(localStorage.getItem(this.dataKey), legacyData)
        this.annotations = Array.isArray(stored.annotations) ? stored.annotations : []
        this.bookmarks = Array.isArray(stored.bookmarks) ? stored.bookmarks : []
        if (!libraryRecord && legacyDataKey !== this.dataKey && localStorage.getItem(legacyDataKey)) {
            localStorage.setItem(this.dataKey, JSON.stringify(legacyData))
            localStorage.removeItem(legacyDataKey)
        }
        this.setupNavigation()

        const savedPosition = libraryRecord?.position
            ?? localStorage.getItem(this.positionKey)
            ?? legacyPosition
        if (!libraryRecord && legacyPosition && legacyPositionKey !== this.positionKey) {
            localStorage.setItem(this.positionKey, legacyPosition)
            localStorage.removeItem(legacyPositionKey)
        }
        await this.view.init({
            lastLocation: savedPosition || null,
            showTextStart: !savedPosition,
        })
        this.renderAnnotations()
        this.renderBookmarks()
        if (libraryRecord) {
            await library.patch(this.bookId, {
                lastOpened: new Date().toISOString(),
                metadata: cloneMetadata(inspected.metadata),
                title: inspected.title,
                author: inspected.author,
                description: inspected.description,
                identifier: identity.identifier,
                fingerprint: identity.fingerprint,
            })
        }
    }

    setupEvents() {
        this.view.addEventListener('relocate', event => this.onRelocate(event.detail))
        this.view.addEventListener('load', event => this.onDocumentLoad(event.detail))
        this.view.addEventListener('create-overlay', event => {
            const { index } = event.detail
            setTimeout(() => this.restoreAnnotationsForIndex(index), 0)
        })
        this.view.addEventListener('draw-annotation', event => {
            const { draw, annotation, doc, range } = event.detail
            const { color } = annotation
            if (['underline', 'squiggly', 'strikethrough'].includes(color)) {
                const node = range.startContainer
                const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
                const writingMode = doc.defaultView.getComputedStyle(element).writingMode
                draw(this.engine.Overlayer[color], { writingMode })
            } else {
                draw(this.engine.Overlayer.highlight, { color })
            }
        })
        this.view.addEventListener('show-annotation', event => {
            const annotation = this.annotations.find(item => item.value === event.detail.value)
            if (annotation)
                showAnnotationPopover(annotation, getPopoverPosition(event.detail.range))
        })
        this.view.addEventListener('external-link', event => {
            event.preventDefault()
            openExternal(event.detail.href)
        })
        this.view.addEventListener('link', event => {
            this.footnoteHandler.handle(this.view.book, event)?.catch(error => {
                console.warn(error)
                this.view.goTo(event.detail.href)
            })
        })
        this.view.history.addEventListener('index-change', event => {
            $('#history-back').disabled = !event.target.canGoBack
            $('#history-forward').disabled = !event.target.canGoForward
        })
    }

    setupFootnotes() {
        this.footnoteHandler = new this.engine.FootnoteHandler()
        this.footnoteHandler.addEventListener('before-render', event => {
            const footnoteView = event.detail.view
            footnoteView.addEventListener('link', linkEvent => {
                linkEvent.preventDefault()
                this.view.goTo(linkEvent.detail.href)
                $('#footnote-dialog').close()
            })
            footnoteView.addEventListener('external-link', linkEvent => {
                linkEvent.preventDefault()
                openExternal(linkEvent.detail.href)
            })
            $('#footnote-content').replaceChildren(footnoteView)
            const renderer = footnoteView.renderer
            renderer.setAttribute('flow', 'scrolled')
            renderer.setAttribute('margin', '18px')
            renderer.setAttribute('gap', '5%')
            renderer.setStyles?.(readerCSS({ ...this, flow: 'scrolled' }))
        })
        this.footnoteHandler.addEventListener('render', event => {
            const { href, hidden, type } = event.detail
            const labels = {
                footnote: ['脚注', '转到脚注'],
                endnote: ['尾注', '转到尾注'],
                note: ['注释', '转到注释'],
                definition: ['释义', '转到释义'],
                biblioentry: ['参考文献', '转到参考文献'],
            }
            const [title, action] = labels[type] ?? labels.footnote
            this.footnoteHref = href
            $('#footnote-title').textContent = title
            $('#footnote-go').textContent = action
            $('#footnote-go').hidden = Boolean(hidden)
            $('#footnote-dialog').showModal()
        })
    }

    onDocumentLoad({ doc, index }) {
        doc.addEventListener('keydown', keyboardNavigation)
        doc.addEventListener('wheel', readerWheelNavigation, { passive: false })
        doc.addEventListener('dblclick', event => {
            const image = event.target.closest?.('img, svg')
            if (image) openImageViewer(image).catch(error => {
                console.error(error)
                showToast('无法打开这张插图')
            })
        })
        doc.addEventListener('pointerup', () => {
            if (!selectionToolbarEnabled) return
            const selection = doc.getSelection()
            const range = getSelectionRange(selection)
            if (!range) return
            doc.addEventListener('click', event => event.stopPropagation(), {
                capture: true,
                once: true,
            })
            showSelectionPopover({
                doc,
                index,
                range: range.cloneRange(),
                text: selection.toString(),
                lang: getLang(range.commonAncestorContainer),
                position: getPopoverPosition(range),
            })
        })
    }

    async close() {
        hidePopovers()
        clearTimeout(this.progressSaveTimer)
        if (this.bookId && this.libraryRecord && this.currentLocation?.cfi) {
            await library.patch(this.bookId, {
                position: this.currentLocation.cfi,
                progress: this.currentLocation.fraction ?? 0,
                annotations: this.annotations,
                bookmarks: this.bookmarks,
            }).catch(console.error)
        }
        await this.cancelSearch()
        if (!this.view) return
        this.view.close()
        await this.view.book?.destroy?.()
        this.view.remove()
        this.view = null
        this.positionKey = null
        this.dataKey = null
        this.tocView = null
        this.currentLocation = null
        this.currentFile = null
        this.bookId = null
        this.libraryRecord = null
        this.metadata = {}
        this.annotations = []
        this.bookmarks = []
        this.searchResults = []
        this.searchIndex = -1
        $('#toc').replaceChildren()
        $('#annotations-list').replaceChildren()
        $('#bookmarks-list').replaceChildren()
        if (this.coverURL) URL.revokeObjectURL(this.coverURL)
        this.coverURL = null
    }

    async updateMetadata(file) {
        const { book } = this.view
        const metadata = book.metadata ?? {}
        this.metadata = cloneMetadata(metadata)
        const title = formatLanguageMap(metadata.title) || file.name.replace(/\.[^.]+$/, '')
        const author = formatContributor(metadata.author)
        document.title = `${title} - Foliate`
        $('#book-title').textContent = title
        $('#book-author').textContent = author
        $('#book-author').hidden = !author

        const isPDF = getExtension(file.name) === 'pdf'
        const cover = isPDF ? null : await Promise.resolve(book.getCover?.()).catch(() => null)
        if (cover) {
            this.coverURL = URL.createObjectURL(cover)
            $('#book-cover').src = this.coverURL
            $('#book-cover').alt = `${title} 封面`
            $('#book-cover').hidden = false
        } else {
            $('#book-cover').hidden = true
        }

        if (book.toc?.length) {
            this.tocView = this.engine.createTOCView(book.toc, href => {
                this.view.goTo(href)
                if (matchMedia('(max-width: 860px)').matches) closeSidebar()
            })
            $('#toc').replaceChildren(this.tocView.element)
        } else {
            const empty = document.createElement('div')
            empty.className = 'panel-empty'
            empty.textContent = '无目录'
            $('#toc').replaceChildren(empty)
        }
        renderBookInfo(metadata, file)
        return {
            metadata,
            title,
            author,
            description: stripHTML(formatLanguageMap(metadata.description)
                || String(metadata.description ?? '')),
            cover,
        }
    }

    setupNavigation() {
        const marks = this.view.getSectionFractions?.() ?? []
        $('#section-marks').replaceChildren(...marks.slice(1, -1).map(value => {
            const option = document.createElement('option')
            option.value = value
            return option
        }))

        const pageItems = flattenNavigation(this.view.book.pageList)
        const pageSelect = $('#page-list-select')
        pageSelect.replaceChildren(...pageItems.map(item => {
            const option = document.createElement('option')
            option.value = item.href
            option.dataset.id = String(item.id ?? '')
            option.textContent = `${'\u00a0\u00a0'.repeat(item.depth)}${item.label || '未命名页'}`
            return option
        }))
        $('#page-location-row').hidden = pageItems.length === 0

        const landmarks = flattenNavigation(this.view.book.landmarks)
        const landmarkSelect = $('#landmarks-select')
        const placeholder = document.createElement('option')
        placeholder.value = ''
        placeholder.textContent = '选择位置…'
        landmarkSelect.replaceChildren(placeholder, ...landmarks.map(item => {
            const option = document.createElement('option')
            option.value = item.href
            option.textContent = `${'\u00a0\u00a0'.repeat(item.depth)}${item.label || item.type || '未命名位置'}`
            return option
        }))
        $('#landmarks-row').hidden = landmarks.length === 0
        $('#cfi-location-row').hidden = this.view.isFixedLayout
    }

    onRelocate(detail) {
        const fraction = Number.isFinite(detail.fraction) ? detail.fraction : 0
        $('#progress').value = fraction
        $('#progress-label').textContent = percentFormat.format(fraction)
        if (detail.tocItem?.href) this.tocView?.setCurrentHref(detail.tocItem.href)
        this.currentLocation = detail
        if (this.positionKey && typeof detail.cfi === 'string') {
            if (!this.libraryRecord) localStorage.setItem(this.positionKey, detail.cfi)
            clearTimeout(this.progressSaveTimer)
            this.progressSaveTimer = setTimeout(() => {
                if (this.bookId && this.libraryRecord) library.patch(this.bookId, {
                    position: detail.cfi,
                    progress: fraction,
                    lastOpened: new Date().toISOString(),
                }).catch(console.error)
            }, 2000)
        }
        this.updateBookmarkButton()
        this.updateLocation(detail)
    }

    applyLayout() {
        const renderer = this.view?.renderer
        if (!renderer) return
        this.view.toggleAttribute('autohide-cursor', this.autohideCursor)
        renderer.toggleAttribute('animated', !this.reduceAnimation)
        if (this.view.isFixedLayout) {
            renderer.setAttribute('zoom',
                getExtension(this.currentFile?.name ?? '') === 'pdf'
                    ? this.pdfZoom
                    : 'fit-page')
            return
        }
        renderer.setAttribute('flow', this.flow)
        renderer.setAttribute('margin', `${this.pageMargin}px`)
        renderer.setAttribute('gap', '5%')
        renderer.setAttribute('max-inline-size', `${this.pageWidth}px`)
        renderer.setAttribute('max-block-size', `${this.pageHeight}px`)
        renderer.setAttribute('max-column-count', String(this.maxColumns))
        renderer.setStyles?.(readerCSS(this))
    }

    applyTheme() {
        const palette = bookThemes[this.bookTheme] ?? bookThemes.default
        const colors = currentTheme() === 'dark' ? palette.dark : palette.light
        document.documentElement.style.setProperty('--reader-bg', colors.bg)
        const invert = getExtension(this.currentFile?.name ?? '') === 'pdf'
            ? this.pdfInvertDark
            : this.invertDark
        this.view?.toggleAttribute('invert', currentTheme() === 'dark' && invert)
        if (!this.view?.renderer || this.view.isFixedLayout) return
        this.view.renderer.setStyles?.(readerCSS(this))
    }

    setPreference(property, value, storageKey, layout = false) {
        this[property] = value
        localStorage.setItem(storageKey, String(value))
        if (layout) this.applyLayout()
        else this.applyTheme()
    }

    updateLocation(detail = this.currentLocation) {
        if (!detail) return
        $('#time-section').textContent = formatDuration(detail.time?.section)
        $('#time-book').textContent = formatDuration(detail.time?.total)
        $('#location-input').value = Number.isFinite(detail.location?.current)
            ? detail.location.current + 1
            : ''
        $('#location-total').textContent = `/ ${detail.location?.total ?? '—'}`
        $('#section-input').value = Number.isFinite(detail.section?.current)
            ? detail.section.current + 1
            : ''
        $('#section-total').textContent = `/ ${detail.section?.total ?? '—'}`
        $('#cfi-input').value = detail.cfi ?? ''
        if (detail.pageItem?.id != null) {
            const option = $$('#page-list-select option')
                .find(item => item.dataset.id === String(detail.pageItem.id))
            if (option) $('#page-list-select').value = option.value
        }
    }

    goToLocation() {
        const total = this.currentLocation?.location?.total
        const location = Number($('#location-input').value)
        if (!Number.isFinite(total) || !Number.isFinite(location)) return
        this.view.goToFraction(Math.max(0, Math.min(1, location / total)))
    }

    goToSection() {
        const section = Number($('#section-input').value) - 1
        if (Number.isInteger(section)) this.view.goTo(section)
    }

    goSection(position) {
        const sections = this.view?.book?.sections ?? []
        const current = this.currentLocation?.section?.current ?? 0
        const linear = index => sections[index]?.linear !== 'no'
        let target
        if (position === 'first') target = sections.findIndex((_, index) => linear(index))
        else if (position === 'last') target = sections.findLastIndex((_, index) => linear(index))
        else {
            const direction = position === 'previous' ? -1 : 1
            for (let index = current + direction; index >= 0 && index < sections.length; index += direction)
                if (linear(index)) {
                    target = index
                    break
                }
        }
        if (Number.isInteger(target) && target >= 0) this.view.goTo(target)
    }

    async cancelSearch() {
        this.searchToken++
        try {
            await this.searchIterator?.return?.()
        } catch (error) {
            console.warn(error)
        }
        this.searchIterator = null
        this.view?.clearSearch?.()
        this.view?.deselect?.()
    }

    async search(query) {
        await this.cancelSearch()
        this.searchResults = []
        this.searchIndex = -1
        $('#search-results').replaceChildren()
        $('#search-previous').disabled = true
        $('#search-next').disabled = true
        query = query.trim()
        if (!query || !this.view) {
            $('#search-status').textContent = '输入关键词开始搜索'
            return
        }

        const token = ++this.searchToken
        const progress = document.createElement('progress')
        progress.max = 1
        progress.value = 0
        $('#search-status').replaceChildren('正在搜索…', progress)
        const options = {
            query,
            matchCase: $('#search-match-case').checked,
            matchDiacritics: $('#search-diacritics').checked,
            matchWholeWords: $('#search-whole-words').checked,
        }
        if ($('#search-scope').value === 'section'
        && Number.isInteger(this.currentLocation?.section?.current))
            options.index = this.currentLocation.section.current

        try {
            const iterator = this.view.search(options)
            this.searchIterator = iterator
            for await (const result of iterator) {
                if (token !== this.searchToken) return
                if (result === 'done') break
                if (Number.isFinite(result.progress)) {
                    progress.value = result.progress
                    continue
                }
                const startIndex = this.searchResults.length
                if (result.subitems) {
                    for (const item of result.subitems)
                        this.searchResults.push({ ...item, label: result.label })
                } else if (result.cfi) {
                    this.searchResults.push({
                        ...result,
                        label: this.currentLocation?.tocItem?.label ?? '',
                    })
                }
                this.appendSearchResults(startIndex)
            }
            if (token !== this.searchToken) return
            this.searchIterator = null
            $('#search-status').textContent = this.searchResults.length
                ? `找到 ${this.searchResults.length} 个结果`
                : '没有找到结果'
            const hasResults = this.searchResults.length > 0
            $('#search-previous').disabled = !hasResults
            $('#search-next').disabled = !hasResults
        } catch (error) {
            if (token !== this.searchToken) return
            console.error(error)
            $('#search-status').textContent = '搜索失败'
        }
    }

    appendSearchResults(startIndex) {
        let previousLabel = this.searchResults[startIndex - 1]?.label
        const children = []
        for (let index = startIndex; index < this.searchResults.length; index++) {
            const result = this.searchResults[index]
            if (result.label && result.label !== previousLabel) {
                const heading = document.createElement('div')
                heading.className = 'search-result-heading'
                heading.textContent = result.label
                children.push(heading)
                previousLabel = result.label
            }
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'search-result-item'
            button.dataset.index = String(index)
            const { pre = '', match = '', post = '' } = result.excerpt ?? {}
            button.append(document.createTextNode(pre))
            const mark = document.createElement('mark')
            mark.textContent = match
            button.append(mark, document.createTextNode(post))
            button.addEventListener('click', () => this.activateSearchResult(index))
            children.push(button)
        }
        $('#search-results').append(...children)
    }

    activateSearchResult(index, navigate = true) {
        if (!this.searchResults.length) return
        this.searchIndex = (index + this.searchResults.length) % this.searchResults.length
        for (const button of $$('.search-result-item'))
            button.classList.toggle('selected', Number(button.dataset.index) === this.searchIndex)
        const button = $(`.search-result-item[data-index="${this.searchIndex}"]`)
        button?.scrollIntoView({ block: 'nearest' })
        if (navigate) this.view.select(this.searchResults[this.searchIndex].cfi)
    }

    cycleSearch(direction) {
        this.activateSearchResult(this.searchIndex + direction)
    }

    saveData() {
        if (!this.dataKey) return
        const data = {
            annotations: this.annotations,
            bookmarks: this.bookmarks,
        }
        if (this.bookId && this.libraryRecord)
            library.patch(this.bookId, data).catch(console.error)
        else localStorage.setItem(this.dataKey, JSON.stringify(data))
    }

    async addAnnotation(selection, color = '#f6d32d') {
        if (this.view.isFixedLayout) {
            showToast('固定版式和 PDF 暂不支持高亮批注')
            return null
        }
        const value = this.view.getCFI(selection.index, selection.range)
        const existing = this.annotations.find(item => item.value === value)
        if (existing) return existing
        const annotation = {
            value,
            index: selection.index,
            text: selection.range.toString(),
            note: '',
            color,
            created: new Date().toISOString(),
            modified: '',
            label: this.currentLocation?.tocItem?.label ?? '',
        }
        const progress = await this.view.addAnnotation(annotation)
        Object.assign(annotation, progress)
        this.annotations.push(annotation)
        this.saveData()
        this.renderAnnotations()
        return annotation
    }

    async updateAnnotation(annotation, { color, note }) {
        annotation.color = color
        annotation.note = note
        annotation.modified = new Date().toISOString()
        await this.view.addAnnotation(annotation)
        this.saveData()
        this.renderAnnotations()
    }

    async deleteAnnotation(annotation) {
        await this.view.deleteAnnotation(annotation)
        this.annotations = this.annotations.filter(item => item.value !== annotation.value)
        this.saveData()
        this.renderAnnotations()
        return annotation
    }

    async restoreAnnotation(annotation) {
        if (this.annotations.some(item => item.value === annotation.value)) return
        this.annotations.push(annotation)
        await this.view.addAnnotation(annotation)
        this.saveData()
        this.renderAnnotations()
    }

    restoreAnnotationsForIndex(index) {
        for (const annotation of this.annotations.filter(item => item.index === index))
            this.view.addAnnotation(annotation).catch(console.error)
    }

    renderAnnotations() {
        const query = $('#annotation-filter').value.trim().toLocaleLowerCase()
        const annotations = this.annotations.filter(annotation => !query || [
            annotation.text,
            annotation.note,
            annotation.label,
        ].some(value => value?.toLocaleLowerCase().includes(query)))
        $('#annotations-empty').hidden = this.annotations.length > 0
        const list = $('#annotations-list')
        const children = []
        let currentLabel
        for (const annotation of annotations) {
            const groupLabel = annotation.label || '未命名章节'
            if (groupLabel !== currentLabel) {
                const heading = document.createElement('h3')
                heading.className = 'annotation-group-heading'
                heading.textContent = groupLabel
                children.push(heading)
                currentLabel = groupLabel
            }
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'annotation-item'
            button.style.setProperty('--annotation-color',
                ['underline', 'squiggly', 'strikethrough'].includes(annotation.color)
                    ? 'var(--accent)'
                    : annotation.color)
            const text = document.createElement('strong')
            text.textContent = annotation.text.trim().replace(/\s+/g, ' ')
            const detail = document.createElement('span')
            detail.textContent = [
                annotation.label,
                annotation.note,
                dateFormat.format(new Date(annotation.modified || annotation.created)),
            ].filter(Boolean).join(' · ')
            button.append(text, detail)
            button.addEventListener('click', async () => {
                await this.view.showAnnotation(annotation)
                if (matchMedia('(max-width: 860px)').matches) closeSidebar()
            })
            children.push(button)
        }
        list.replaceChildren(...children)
    }

    toggleBookmark() {
        const { cfi, tocItem, fraction } = this.currentLocation ?? {}
        if (typeof cfi !== 'string') return
        const existing = this.bookmarks.find(item => item.value === cfi)
        if (existing) {
            this.bookmarks = this.bookmarks.filter(item => item !== existing)
        } else {
            this.bookmarks.push({
                value: cfi,
                label: tocItem?.label || $('#book-title').textContent,
                fraction: Number.isFinite(fraction) ? fraction : 0,
                created: new Date().toISOString(),
            })
        }
        this.saveData()
        this.renderBookmarks()
        this.updateBookmarkButton()
        return existing ?? null
    }

    restoreBookmark(bookmark) {
        if (this.bookmarks.some(item => item.value === bookmark.value)) return
        this.bookmarks.push(bookmark)
        this.saveData()
        this.renderBookmarks()
        this.updateBookmarkButton()
    }

    updateBookmarkButton() {
        const cfi = this.currentLocation?.cfi
        const active = typeof cfi === 'string'
            && this.bookmarks.some(item => item.value === cfi)
        const button = $('#bookmark-button')
        button.replaceChildren()
        const icon = document.createElement('i')
        icon.dataset.lucide = active ? 'bookmark-check' : 'bookmark'
        button.append(icon)
        button.title = active ? '删除书签' : '添加书签'
        button.setAttribute('aria-label', button.title)
        createIcons({ icons, root: button })
    }

    renderBookmarks() {
        const query = $('#bookmark-filter').value.trim().toLocaleLowerCase()
        const bookmarks = this.bookmarks.filter(bookmark => !query
            || bookmark.label?.toLocaleLowerCase().includes(query))
        $('#bookmarks-empty').hidden = this.bookmarks.length > 0
        const list = $('#bookmarks-list')
        list.replaceChildren(...bookmarks.map(bookmark => {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'bookmark-item'
            const label = document.createElement('strong')
            label.textContent = bookmark.label
            const detail = document.createElement('span')
            detail.textContent = `${percentFormat.format(bookmark.fraction)} · ${
                dateFormat.format(new Date(bookmark.created))}`
            button.append(label, detail)
            button.addEventListener('click', () => {
                this.view.goTo(bookmark.value)
                if (matchMedia('(max-width: 860px)').matches) closeSidebar()
            })
            return button
        }))
    }

    async syncLibraryData(record) {
        if (!record || record.id !== this.bookId || !this.view) return
        const nextAnnotations = Array.isArray(record.annotations) ? record.annotations : []
        const nextBookmarks = Array.isArray(record.bookmarks) ? record.bookmarks : []
        if (JSON.stringify(nextAnnotations) !== JSON.stringify(this.annotations)) {
            for (const annotation of this.annotations)
                await this.view.deleteAnnotation(annotation).catch(console.warn)
            this.annotations = nextAnnotations
            for (const annotation of this.annotations)
                await this.view.addAnnotation(annotation).catch(console.warn)
            this.renderAnnotations()
        }
        if (JSON.stringify(nextBookmarks) !== JSON.stringify(this.bookmarks)) {
            this.bookmarks = nextBookmarks
            this.renderBookmarks()
            this.updateBookmarkButton()
        }
    }
}

const reader = new Reader()
let toastTimer
let loadingTimer
let searchTimer
let lastOpenRequest = null
let libraryRecords = []
let libraryCoverURLs = []
let libraryListView = localStorage.getItem('library-view') === 'list'
let selectionContext = null
let currentAnnotation = null
let currentAnnotationColor = '#f6d32d'
let currentSidebarPanel = 'toc'
let panelBeforeSearch = 'toc'
let undoAction = null
let runtimeInfo = null
let imageState = null
let currentLookupTool = null
let currentLookupContext = null

const showToast = (message, actionLabel = '', action = null) => {
    const toast = $('#toast')
    $('#toast-message').textContent = message
    const button = $('#toast-action')
    button.textContent = actionLabel
    button.hidden = !actionLabel
    undoAction = action
    toast.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
        toast.hidden = true
        undoAction = null
    }, action ? 6000 : 3500)
}

const fileFromRecord = record => record.sourcePath
    ? new NativeBookFile(record.sourcePath, record.size, record.lastModified)
    : record.blob instanceof Blob
        ? new File([record.blob], record.name, {
            type: record.type || record.blob.type || 'application/octet-stream',
            lastModified: record.lastModified || 0,
        })
        : null

const inspectBook = async file => {
    await loadReaderEngine()
    const view = document.createElement('foliate-view')
    view.hidden = true
    document.body.append(view)
    try {
        await view.open(file)
        const metadata = view.book.metadata ?? {}
        const title = formatLanguageMap(metadata.title)
            || file.name.replace(/\.[^.]+$/, '')
        const author = formatContributor(metadata.author)
        const description = stripHTML(formatLanguageMap(metadata.description)
            || String(metadata.description ?? ''))
        const cover = getExtension(file.name) === 'pdf'
            ? null
            : await Promise.resolve(view.book.getCover?.()).catch(() => null)
        return { metadata, title, author, description, cover }
    } finally {
        view.close?.()
        await view.book?.destroy?.()
        view.remove()
    }
}

const importBooks = async files => {
    const books = Array.from(files ?? []).filter(file =>
        supportedExtensions.includes(getExtension(file.name)))
    if (!books.length) return
    if (invoke && books.some(file => !file.sourcePath)) {
        showToast('安装版无法从网页拖放取得文件路径，请使用“导入图书”按钮')
        return
    }
    $('#loading').hidden = false
    const status = $('#loading span:last-child')
    try {
        let imported = 0
        for (const [index, file] of books.entries()) {
            status.textContent = `正在导入 ${index + 1}/${books.length}：${file.name}`
            try {
                await library.import(file, inspectBook)
                imported++
            } catch (error) {
                console.error(error)
                showToast(`无法导入 ${file.name}`)
            }
        }
        await renderLibrary()
        if (imported) showToast(`已导入 ${imported} 本图书`)
    } finally {
        status.textContent = '正在打开…'
        $('#loading').hidden = true
        $('#import-input').value = ''
    }
}

const clearLibraryCoverURLs = () => {
    for (const url of libraryCoverURLs) URL.revokeObjectURL(url)
    libraryCoverURLs = []
}

const bookMatches = (record, query) => {
    if (!query) return true
    const haystack = [
        record.title,
        record.author,
        record.description,
        record.name,
    ].filter(Boolean).join('\n').toLocaleLowerCase()
    return haystack.includes(query.toLocaleLowerCase())
}

const openLibraryRecord = record => {
    const file = fileFromRecord(record)
    if (!file) {
        showToast('该书库条目没有可用文件路径，请重新导入原始文件')
        return
    }
    return openFile(file, record.id, record)
}

const openRecordExternally = async record => {
    if (invoke && record.sourcePath) {
        await invoke('open_book_path', { path: record.sourcePath })
        return
    }
    if (!record.blob) {
        throw new Error('原始图书文件路径不可用，请重新导入图书')
    }
    if (!invoke) {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(record.blob)
        link.download = record.name
        link.click()
        setTimeout(() => URL.revokeObjectURL(link.href), 1000)
        showToast('浏览器版本已将图书导出，请使用其他程序打开')
        return
    }
    throw new Error('旧版书库副本不能直接外部打开，请重新导入原始文件')
}

const removeLibraryRecord = async record => {
    if (!confirm(`从书库中删除《${record.title}》？`)) return
    const clearData = confirm('是否同时删除阅读进度、批注和书签？\n选择“取消”将保留阅读数据。')
    if (!clearData) {
        localStorage.setItem(`reader-data:${record.id}`, JSON.stringify({
            annotations: record.annotations ?? [],
            bookmarks: record.bookmarks ?? [],
        }))
        if (record.position) localStorage.setItem(`position:${record.id}`, record.position)
    } else {
        localStorage.removeItem(`reader-data:${record.id}`)
        localStorage.removeItem(`position:${record.id}`)
    }
    await library.remove(record.id)
    await renderLibrary()
    showToast('已从书库删除')
}

const cleanupRetainedReadingData = async () => {
    const ids = new Set((await library.list()).map(record => record.id))
    const keys = []
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)
        const match = /^(?:reader-data|position):(.+)$/.exec(key)
        if (match && !ids.has(match[1])) keys.push(key)
    }
    if (!keys.length) {
        $('#cleanup-status').textContent = '没有已移除图书留下的阅读数据。'
        return
    }
    if (!confirm(`确定清理 ${keys.length} 项已移除图书的阅读进度、批注和书签吗？`))
        return
    for (const key of keys) localStorage.removeItem(key)
    $('#cleanup-status').textContent = `已清理 ${keys.length} 项残留阅读数据。`
}

const cleanupTemporaryFiles = async () => {
    if (!invoke) {
        $('#cleanup-status').textContent = '浏览器预览模式没有应用临时目录。'
        return
    }
    try {
        const result = await invoke('clean_temporary_files')
        const size = result.bytes < 1024 * 1024
            ? `${Math.round(result.bytes / 1024)} KB`
            : `${(result.bytes / 1024 / 1024).toFixed(1)} MB`
        $('#cleanup-status').textContent =
            `已清理 ${result.files} 个临时文件，共 ${size}。`
    } catch (error) {
        $('#cleanup-status').textContent =
            `无法清理临时文件：${error?.message || String(error)}`
    }
}

const showLibraryBookInfo = record => {
    renderBookInfo(record.metadata ?? {}, {
        name: record.name,
        size: record.size,
        lastModified: record.lastModified,
    })
    $('#book-info-dialog').showModal()
}

const createBookCard = record => {
    const article = document.createElement('article')
    article.className = 'book-card'
    article.dataset.id = record.id
    const coverShell = document.createElement('div')
    coverShell.className = 'book-card-cover-shell'
    const cover = document.createElement('button')
    cover.type = 'button'
    cover.className = 'book-card-cover'
    cover.title = `打开《${record.title}》`
    if (record.cover) {
        const image = document.createElement('img')
        const url = URL.createObjectURL(record.cover)
        libraryCoverURLs.push(url)
        image.src = url
        image.alt = `${record.title} 封面`
        cover.append(image)
    } else {
        const placeholder = document.createElement('span')
        placeholder.className = 'book-card-placeholder'
        placeholder.textContent = record.title
        cover.append(placeholder)
    }
    const progress = document.createElement('span')
    progress.className = 'book-card-progress'
    const progressValue = document.createElement('span')
    progressValue.style.width = `${Math.max(0, Math.min(1, record.progress || 0)) * 100}%`
    progress.append(progressValue)
    cover.append(progress)
    cover.addEventListener('click', () => openLibraryRecord(record))
    coverShell.append(cover)

    const text = document.createElement('div')
    text.className = 'book-card-text'
    const title = document.createElement('strong')
    title.textContent = record.title
    title.title = record.title
    const author = document.createElement('span')
    author.textContent = record.author || record.name
    text.append(title, author)

    const actions = document.createElement('div')
    actions.className = 'book-card-actions'
    for (const [label, iconName, handler] of [
        ['信息', 'info', () => showLibraryBookInfo(record)],
        ['新窗口', 'copy-plus', () => invoke
            ? invoke('new_window', { bookId: record.id }).catch(error =>
                showToast(error?.message || String(error)))
            : globalThis.open(`?book=${encodeURIComponent(record.id)}`, '_blank', 'noopener')],
        ['外部打开', 'external-link', () => openRecordExternally(record).catch(error =>
            showToast(error?.message || String(error)))],
        ['删除', 'trash-2', () => removeLibraryRecord(record)],
    ]) {
        const button = document.createElement('button')
        button.type = 'button'
        button.title = label
        button.setAttribute('aria-label', label)
        const icon = document.createElement('i')
        icon.dataset.lucide = iconName
        button.append(icon)
        button.addEventListener('click', handler)
        actions.append(button)
    }
    const menuButton = document.createElement('button')
    menuButton.type = 'button'
    menuButton.className = 'book-card-menu-button'
    menuButton.title = '更多操作'
    menuButton.setAttribute('aria-label', '更多操作')
    menuButton.setAttribute('aria-expanded', 'false')
    const menuIcon = document.createElement('i')
    menuIcon.dataset.lucide = 'more-horizontal'
    menuButton.append(menuIcon)
    menuButton.addEventListener('click', event => {
        event.stopPropagation()
        for (const shell of $$('.book-card-cover-shell.menu-open'))
            if (shell !== coverShell) {
                shell.classList.remove('menu-open')
                shell.querySelector('.book-card-menu-button')
                    ?.setAttribute('aria-expanded', 'false')
            }
        const open = coverShell.classList.toggle('menu-open')
        menuButton.setAttribute('aria-expanded', String(open))
    })
    actions.addEventListener('click', () => {
        coverShell.classList.remove('menu-open')
        menuButton.setAttribute('aria-expanded', 'false')
    })
    coverShell.append(menuButton, actions)
    article.append(coverShell, text)
    createIcons({ icons, root: coverShell })
    return article
}

const renderLibrary = async (reload = true) => {
    clearLibraryCoverURLs()
    if (reload || !libraryRecords.length) libraryRecords = await library.list()
    const query = $('#library-search-input').value.trim()
    const visible = libraryRecords.filter(record => bookMatches(record, query))
    const grid = $('#library-grid')
    grid.classList.toggle('list-view', libraryListView)
    grid.replaceChildren(...visible.map(createBookCard))
    $('#empty-library').hidden = libraryRecords.length > 0
    $('#library-content').hidden = libraryRecords.length === 0
    $('#library-no-results').hidden = visible.length > 0 || !query
    const button = $('#library-view-button')
    button.replaceChildren()
    const icon = document.createElement('i')
    icon.dataset.lucide = libraryListView ? 'grid-2-x-2' : 'list'
    button.append(icon)
    button.title = libraryListView ? '切换网格视图' : '切换列表视图'
    originalAttributes?.delete?.(button)
    createIcons({ icons, root: button })
    applyLanguage()
}

const themePreference = () => localStorage.getItem('theme') || 'system'
const systemTheme = () => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
const currentTheme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'

const setTheme = preference => {
    const theme = preference === 'system' ? systemTheme() : preference
    localStorage.setItem('theme', preference)
    document.documentElement.dataset.theme = theme
    $('#theme-select').value = preference
    const button = $('#theme-button')
    button.replaceChildren()
    const icon = document.createElement('i')
    icon.dataset.lucide = theme === 'dark' ? 'sun' : 'moon'
    button.append(icon)
    button.title = theme === 'dark' ? '切换浅色模式' : '切换深色模式'
    button.setAttribute('aria-label', button.title)
    originalAttributes?.delete?.(button)
    createIcons({ icons, root: button })
    reader.applyTheme()
    applyLanguage()
}

const openSidebar = () => {
    $('#reader-view').classList.remove('sidebar-collapsed')
    $('#sidebar-open').hidden = true
    if (matchMedia('(max-width: 860px)').matches)
        $('#reader-dimmer').hidden = false
}

const closeSidebar = () => {
    $('#reader-view').classList.add('sidebar-collapsed')
    $('#sidebar-open').hidden = false
    $('#reader-dimmer').hidden = true
}

const setSidebarPanel = name => {
    currentSidebarPanel = name
    for (const panel of ['search', 'toc', 'annotations', 'bookmarks'])
        $(`#${panel}-panel`).hidden = panel !== name
    for (const button of $$('.sidebar-tab'))
        button.classList.toggle('selected', button.dataset.panel === name)
}

const chooseFile = async () => {
    if (!invoke) {
        $('#file-input').click()
        return
    }
    try {
        const [info] = await invoke('choose_books', { multiple: false })
        if (info) await openFile(nativeBookFromInfo(info), info.path.toLowerCase())
    } catch (error) {
        showToast(error?.message || String(error))
    }
}
const chooseImport = async () => {
    if (!invoke) {
        $('#import-input').click()
        return
    }
    try {
        const infos = await invoke('choose_books', { multiple: true })
        await importBooks(infos.map(nativeBookFromInfo))
    } catch (error) {
        showToast(error?.message || String(error))
    }
}

const showOpenError = (title, message, error) => {
    $('#error-title').textContent = title
    $('#error-message').textContent = message
    $('#error-details').textContent = error?.stack || error?.message || String(error ?? '')
    $('#error-retry').hidden = !lastOpenRequest
    if (!$('#error-dialog').open) $('#error-dialog').showModal()
}

const openFile = async (file, storageIdentity = null, libraryRecord = null) => {
    if (!file) return
    lastOpenRequest = { file, storageIdentity, libraryRecord }
    const extension = getExtension(file.name)
    if (!supportedExtensions.includes(extension)) {
        showOpenError('不支持的格式',
            `Foliate 无法打开 “${file.name}”。`, new Error(`不支持扩展名 .${extension || ''}`))
        return
    }
    clearTimeout(loadingTimer)
    loadingTimer = setTimeout(() => { $('#loading').hidden = false }, 700)
    try {
        await reader.open(file, storageIdentity, libraryRecord)
        $('#library-view').hidden = true
        $('#reader-view').hidden = false
        if (matchMedia('(max-width: 860px)').matches) closeSidebar()
        else openSidebar()
    } catch (error) {
        console.error(error)
        showOpenError('无法打开图书',
            `无法解析或显示 “${file.name}”。`, error)
        if (!reader.view?.book) await reader.close()
    } finally {
        clearTimeout(loadingTimer)
        $('#loading').hidden = true
        $('#file-input').value = ''
    }
}

const keyboardNavigation = event => {
    const modifier = event.ctrlKey || event.metaKey
    const key = event.key.toLocaleLowerCase()
    if (event.key === 'Escape') {
        const dialog = Array.from($$('dialog[open]')).at(-1)
        if (dialog) {
            event.preventDefault()
            if (dialog === $('#image-viewer-dialog')) closeImageViewer()
            else dialog.close()
            return
        }
    }
    if (modifier && key === 'o') {
        event.preventDefault()
        if (event.shiftKey) chooseImport()
        else chooseFile()
        return
    }
    if (event.key === 'F11') {
        event.preventDefault()
        toggleFullscreen()
        return
    }
    if (modifier && (event.key === '?' || event.key === '/')) {
        event.preventDefault()
        showShortcuts()
        return
    }
    if (!reader.view) return
    if (event.key === 'F5' || modifier && key === 'r') {
        event.preventDefault()
        reloadCurrentBook()
        return
    }
    if (modifier && key === 'p') {
        event.preventDefault()
        printBook()
        return
    }
    if (modifier && event.shiftKey && key === 'n') {
        event.preventDefault()
        openCurrentInNewWindow()
        return
    }
    if (modifier && key === 'f') {
        event.preventDefault()
        openBookSearch()
        return
    }
    if (modifier && key === 'g') {
        event.preventDefault()
        reader.cycleSearch(event.shiftKey ? -1 : 1)
        return
    }
    if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        reader.view.history.back()
        return
    }
    if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault()
        reader.view.history.forward()
        return
    }
    if (modifier || event.altKey
    || event.target.closest?.('input, textarea, select, button, [contenteditable="true"]'))
        return
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        reader.view.goLeft()
    } else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        reader.view.goRight()
    } else if (event.key === 'Escape') {
        hidePopovers()
        closeSidebar()
    }
}

let wheelAccumulator = 0
let wheelLockedUntil = 0
let wheelResetTimer
const readerWheelNavigation = event => {
    if (!reader.view || event.ctrlKey || event.metaKey) return
    const isPDF = getExtension(reader.currentFile?.name ?? '') === 'pdf'
    if (!reader.view.isFixedLayout && reader.flow === 'scrolled') return
    if (isPDF && !reader.pdfWheel) return
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX
    if (!Number.isFinite(delta) || Math.abs(delta) < 1) return
    event.preventDefault()
    const now = performance.now()
    if (now < wheelLockedUntil) return
    wheelAccumulator += delta
    clearTimeout(wheelResetTimer)
    wheelResetTimer = setTimeout(() => { wheelAccumulator = 0 }, 180)
    if (Math.abs(wheelAccumulator) < 32) return
    const direction = Math.sign(wheelAccumulator)
    wheelAccumulator = 0
    wheelLockedUntil = now + 280
    if (direction > 0) reader.view.goRight()
    else reader.view.goLeft()
}

const hidePopovers = () => {
    $('#selection-popover').hidden = true
    $('#annotation-popover').hidden = true
    selectionContext = null
}

const placePopover = (popover, { x, y }) => {
    popover.style.left = `${x}px`
    popover.style.top = `${y}px`
}

const showSelectionPopover = context => {
    if (!selectionToolbarEnabled) return
    selectionContext = context
    const popover = $('#selection-popover')
    for (const button of popover.querySelectorAll('[data-selection-action]')) {
        const action = button.dataset.selectionAction
        button.hidden = !selectionToolEnabled[action]
            || reader.view.isFixedLayout && ['highlight', 'copy-cfi'].includes(action)
    }
    if (!popover.querySelector('[data-selection-action]:not([hidden])')) {
        selectionContext = null
        return
    }
    placePopover(popover, context.position)
    popover.hidden = false
    $('#annotation-popover').hidden = true
}

const showAnnotationPopover = (annotation, position) => {
    currentAnnotation = annotation
    currentAnnotationColor = annotation.color
    $('#annotation-note').value = annotation.note || ''
    if (annotation.color?.startsWith('#'))
        $('#annotation-custom-color').value = annotation.color
    for (const button of $$('#annotation-popover [data-color]'))
        button.classList.toggle('selected', button.dataset.color === annotation.color)
    const popover = $('#annotation-popover')
    placePopover(popover, position)
    popover.hidden = false
    $('#selection-popover').hidden = true
}

const copyText = async text => {
    try {
        await navigator.clipboard.writeText(text)
    } catch {
        const input = document.createElement('textarea')
        input.value = text
        document.body.append(input)
        input.select()
        document.execCommand('copy')
        input.remove()
    }
    showToast('已复制')
}

const normalizeLanguage = lang => {
    try {
        return new Intl.Locale(lang || navigator.language).language
    } catch {
        return 'en'
    }
}

const stripHTML = html => new DOMParser()
    .parseFromString(html, 'text/html').body.textContent.trim()
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
})[character])

const lookupSelection = async (tool, context) => {
    const dialog = $('#lookup-dialog')
    const content = $('#lookup-content')
    const source = $('#lookup-source')
    const word = context.text.trim()
    const lang = normalizeLanguage(context.lang)
    const titles = {
        dictionary: '词典',
        wikipedia: 'Wikipedia',
        translate: '翻译',
    }
    currentLookupTool = tool
    currentLookupContext = context
    $('#lookup-title').textContent = titles[tool]
    $('#lookup-search-input').value = word
    content.textContent = '正在查询…'
    source.replaceChildren()
    $('#translation-language-row').hidden = tool !== 'translate'
    if (!dialog.open) dialog.showModal()

    try {
        if (!navigator.onLine) throw new Error('当前处于离线状态，无法使用在线查询')
        if (tool === 'dictionary') {
            const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${
                encodeURIComponent(word)}`
            const response = await fetch(url)
            if (!response.ok) throw new Error('没有找到释义')
            const json = await response.json()
            const groups = json[lang] ?? json.en ?? Object.values(json)[0]
            if (!groups?.length) throw new Error('没有找到释义')
            content.replaceChildren()
            for (const group of groups) {
                const heading = document.createElement('h3')
                heading.textContent = group.partOfSpeech || group.language || '释义'
                const list = document.createElement('ol')
                for (const definition of group.definitions ?? []) {
                    const item = document.createElement('li')
                    const text = document.createElement('p')
                    text.textContent = stripHTML(definition.definition || '')
                    item.append(text)
                    for (const example of definition.examples ?? []) {
                        const quote = document.createElement('blockquote')
                        quote.textContent = stripHTML(example)
                        item.append(quote)
                    }
                    list.append(item)
                }
                content.append(heading, list)
            }
            const link = document.createElement('button')
            link.className = 'lookup-source-link'
            link.textContent = 'Wiktionary · CC BY-SA'
            link.addEventListener('click', () =>
                openExternal(`https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`))
            source.append(link)
        } else if (tool === 'wikipedia') {
            const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${
                encodeURIComponent(word)}`
            const response = await fetch(url)
            if (!response.ok) throw new Error('没有找到条目')
            const json = await response.json()
            content.replaceChildren()
            const title = document.createElement('h3')
            title.textContent = json.titles?.display || word
            const description = document.createElement('strong')
            description.textContent = json.description || ''
            const extract = document.createElement('p')
            extract.textContent = json.extract || '没有可显示的摘要'
            if (json.thumbnail?.source) {
                const image = document.createElement('img')
                image.className = 'lookup-thumbnail'
                image.src = json.thumbnail.source
                image.alt = ''
                content.append(image)
            }
            content.append(title, description, extract)
            const link = document.createElement('button')
            link.className = 'lookup-source-link'
            link.textContent = 'Wikipedia · CC BY-SA'
            link.addEventListener('click', () =>
                openExternal(json.content_urls?.desktop?.page
                    || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(word)}`))
            source.append(link)
        } else {
            const target = $('#translation-language').value
            const url = 'https://translate.googleapis.com/translate_a/single?client=gtx'
                + `&ie=UTF-8&oe=UTF-8&sl=auto&tl=${encodeURIComponent(target)}`
                + `&dt=t&q=${encodeURIComponent(word)}`
            const response = await fetch(url)
            if (!response.ok) throw new Error('无法获取翻译')
            const json = await response.json()
            content.textContent = json[0].map(item => item[0]).join('')
            source.textContent = 'Google Translate'
        }
    } catch (error) {
        console.error(error)
        content.textContent = error.message || '查询失败，请检查网络连接'
    }
}

const openExternal = async url => {
    if (!url || !/^https?:/i.test(url)) return
    try {
        if (invoke) await invoke('open_external', { url })
        else globalThis.open(url, '_blank', 'noopener')
    } catch (error) {
        console.error(error)
        showToast('无法打开外部链接')
    }
}

const imageBlobFromElement = async element => {
    if (element.localName === 'svg') {
        return new Blob([new XMLSerializer().serializeToString(element)], {
            type: 'image/svg+xml',
        })
    }
    const source = element.currentSrc || element.src
    const response = await fetch(source)
    if (!response.ok) throw new Error('无法读取插图')
    return response.blob()
}

const updateImageTransform = () => {
    if (!imageState) return
    $('#image-viewer-image').style.transform =
        `translate(${imageState.x}px, ${imageState.y}px) `
        + `scale(${imageState.scale}) rotate(${imageState.rotation}deg)`
    $('#image-viewer-image').style.filter = imageState.inverted
        ? 'invert(1) hue-rotate(180deg)'
        : ''
    $('#image-reset').textContent = `${Math.round(imageState.scale * 100)}%`
}

const openImageViewer = async element => {
    const blob = await imageBlobFromElement(element)
    const url = URL.createObjectURL(blob)
    const image = $('#image-viewer-image')
    if (imageState?.url) URL.revokeObjectURL(imageState.url)
    imageState = {
        blob,
        url,
        scale: 1,
        rotation: 0,
        inverted: false,
        x: 0,
        y: 0,
        name: element.getAttribute?.('alt')?.trim() || 'book-image',
    }
    image.src = url
    updateImageTransform()
    if (!$('#image-viewer-dialog').open) $('#image-viewer-dialog').showModal()
}

const closeImageViewer = () => {
    if ($('#image-viewer-dialog').open) $('#image-viewer-dialog').close()
    if (imageState?.url) URL.revokeObjectURL(imageState.url)
    imageState = null
    $('#image-viewer-image').removeAttribute('src')
}

const printHTML = (title, body) => {
    const frame = document.createElement('iframe')
    frame.className = 'print-frame'
    const documentHTML = `<!doctype html><meta charset="utf-8"><title>${escapeHTML(title)}</title>
        <style>body{max-width:48em;margin:auto;padding:2em;font:16px/1.6 serif}
        img,svg{max-width:100%}</style><h1>${escapeHTML(title)}</h1>${body}`
    const url = URL.createObjectURL(new Blob([documentHTML], { type: 'text/html' }))
    frame.src = url
    frame.addEventListener('load', () => {
        frame.contentWindow.focus()
        frame.contentWindow.print()
        setTimeout(() => {
            frame.remove()
            URL.revokeObjectURL(url)
        }, 1000)
    }, { once: true })
    document.body.append(frame)
}

const printBook = async () => {
    if (!reader.view?.book) return
    $('#loading').hidden = false
    const parts = []
    try {
        for (const section of reader.view.book.sections) {
            if (!section.createDocument) continue
            const doc = await section.createDocument()
            for (const node of doc.querySelectorAll('script, iframe, object, embed')) node.remove()
            for (const element of doc.querySelectorAll('*'))
                for (const attribute of Array.from(element.attributes))
                    if (attribute.name.toLowerCase().startsWith('on'))
                        element.removeAttribute(attribute.name)
            parts.push(`<section>${doc.body?.innerHTML ?? ''}</section>`)
        }
        if (parts.length) printHTML($('#book-title').textContent, parts.join('<hr>'))
        else if (invoke) await invoke('print_window')
        else globalThis.print()
    } finally {
        $('#loading').hidden = true
    }
}

const renderBookInfo = (metadata, file) => {
    const fields = [
        ['标题', formatLanguageMap(metadata.title) || file.name],
        ['副标题', formatLanguageMap(metadata.subtitle)],
        ['作者', formatContributor(metadata.author)],
        ['译者', formatContributor(metadata.translator)],
        ['编辑', formatContributor(metadata.editor)],
        ['朗读者', formatContributor(metadata.narrator)],
        ['插画者', formatContributor(metadata.illustrator)],
        ['其他贡献者', formatContributor(metadata.contributor)],
        ['简介', stripHTML(formatLanguageMap(metadata.description) || String(metadata.description ?? ''))],
        ['语言', metadata.language],
        ['出版社', formatLanguageMap(metadata.publisher)],
        ['出版日期', metadata.published],
        ['修改日期', metadata.modified],
        ['主题分类', [].concat(metadata.subject ?? []).map(subject =>
            formatLanguageMap(subject?.name ?? subject)).filter(Boolean).join('、')],
        ['版权', formatLanguageMap(metadata.rights)],
        ['格式', getExtension(file.name)?.toUpperCase()],
        ['文件大小', `${(file.size / 1024 / 1024).toFixed(1)} MB`],
        ['标识符', formatLanguageMap(metadata.identifier)],
    ].filter(([, value]) => value)
    const dl = document.createElement('dl')
    for (const [label, value] of fields) {
        const dt = document.createElement('dt')
        const dd = document.createElement('dd')
        dt.textContent = label
        dd.textContent = String(value)
        dl.append(dt, dd)
    }
    $('#book-info-content').replaceChildren(...dl.childNodes)
}

const downloadBlob = (blob, name) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const annotationExportData = () => ({
    metadata: {
        title: $('#book-title').textContent,
        author: $('#book-author').textContent,
        identifier: normalizeIdentifier(reader.metadata.identifier) || reader.bookId,
    },
    annotations: reader.annotations,
})

const annotationExportContents = format => {
    const data = annotationExportData()
    const title = `《${data.metadata.title}》的批注`
    const total = `${data.annotations.length} 条批注`
    if (format === 'json') return JSON.stringify(data, null, 2)
    if (format === 'html') return `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width"><title>${escapeHTML(title)}</title>
<style>body{max-width:42em;margin:auto;padding:1em;font:16px/1.6 sans-serif}
section{border-top:1px solid #aaa;padding-block:1em}.cfi{opacity:.6;font:small monospace}
blockquote{margin-inline:0;padding-inline-start:1em;border-inline-start:.5em solid}
.underline{text-decoration:underline}.squiggly{text-decoration:underline wavy}
.strikethrough{text-decoration:line-through}.note{white-space:pre-wrap}</style>
<header><h1>${escapeHTML(title)}</h1><p>${total}</p></header>${
    data.annotations.map(({ value, text, color, note, label }) => `<section>
<h2>${escapeHTML(label || '')}</h2><p class="cfi">${escapeHTML(value)}</p>
<blockquote style="border-color:${color?.startsWith('#') ? color : '#888'}">
<span class="${['underline', 'squiggly', 'strikethrough'].includes(color) ? color : ''}">${
    escapeHTML(text)}</span></blockquote>${note ? `<p class="note">${escapeHTML(note)}</p>` : ''}
</section>`).join('')}`
    if (format === 'md') return `# ${title}\n\n${total}${
        data.annotations.map(({ value, text, color, note, label }) => `

## ${label || '未命名章节'}

**${color}** — \`${value}\`

> ${String(text).replace(/[<>&]/g, character => `\\${character}`)}

${note || ''}`).join('')}`
    return `* ${title}\n${total}\n${data.annotations.map(({
        value, text, color, note, label,
    }) => `
** ${label || '未命名章节'}
*${color}* - \`${value}\`

#+begin_quote
${text}
#+end_quote
${note || ''}
`).join('')}`
}

const exportAnnotations = format => {
    if (!reader.annotations.length) {
        showToast('当前图书没有批注')
        return
    }
    const extensions = { json: 'json', html: 'html', md: 'md', org: 'org' }
    const mime = {
        json: 'application/json',
        html: 'text/html',
        md: 'text/markdown',
        org: 'text/plain',
    }
    const safeTitle = $('#book-title').textContent.replace(/[\\/:*?"<>|]/g, '_')
    downloadBlob(new Blob([annotationExportContents(format)], {
        type: `${mime[format]};charset=utf-8`,
    }), `${safeTitle}-annotations.${extensions[format]}`)
}

const importAnnotations = async file => {
    const data = JSON.parse(await file.text())
    if (!Array.isArray(data.annotations) || !data.annotations.length)
        throw new Error('导入文件中没有批注')
    const importedIdentifier = normalizeIdentifier(data.metadata?.identifier)
    const currentIdentifier = normalizeIdentifier(reader.metadata.identifier) || reader.bookId
    if (importedIdentifier && importedIdentifier !== currentIdentifier
    && !confirm('导入文件的图书标识符与当前图书不一致。仍要导入吗？')) return
    let added = 0
    for (const annotation of data.annotations) {
        if (!annotation?.value
        || reader.annotations.some(item => item.value === annotation.value)) continue
        reader.annotations.push(annotation)
        await reader.view.addAnnotation(annotation).catch(console.warn)
        added++
    }
    reader.saveData()
    reader.renderAnnotations()
    showToast(`已导入 ${added} 条批注`)
}

const openBookSearch = () => {
    if (currentSidebarPanel !== 'search') panelBeforeSearch = currentSidebarPanel
    $('#book-search').hidden = false
    setSidebarPanel('search')
    openSidebar()
    $('#book-search-input').focus()
}

const closeBookSearch = async () => {
    clearTimeout(searchTimer)
    $('#book-search-input').value = ''
    $('#book-search').hidden = true
    await reader.cancelSearch()
    reader.searchResults = []
    reader.searchIndex = -1
    $('#search-results').replaceChildren()
    $('#search-status').textContent = '输入关键词开始搜索'
    $('#search-previous').disabled = true
    $('#search-next').disabled = true
    setSidebarPanel(panelBeforeSearch === 'search' ? 'toc' : panelBeforeSearch)
}

const scheduleSearch = () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => reader.search($('#book-search-input').value), 300)
}

const setRangeControl = (id, outputId, value, suffix = '') => {
    $(id).value = value
    $(outputId).value = `${value}${suffix}`
}

const syncPreferenceControls = () => {
    $('#language-select').value = localStorage.getItem('language') || 'zh-CN'
    $('#book-theme-select').value = reader.bookTheme
    setRangeControl('#font-size-input', '#font-size-output', reader.fontSize, ' px')
    setRangeControl('#minimum-font-size-input', '#minimum-font-size-output',
        reader.minimumFontSize, ' px')
    $('#default-font-select').value = reader.defaultFont
    $('#override-font-input').checked = reader.overrideFont
    $('#serif-font-input').value = reader.serifFont
    $('#sans-font-input').value = reader.sansFont
    $('#monospace-font-input').value = reader.monospaceFont
    $('#flow-select').value = reader.flow
    setRangeControl('#line-height-input', '#line-height-output', reader.lineHeight)
    $('#justify-input').checked = reader.justify
    $('#hyphenate-input').checked = reader.hyphenate
    setRangeControl('#page-margin-input', '#page-margin-output', reader.pageMargin, ' px')
    setRangeControl('#page-width-input', '#page-width-output', reader.pageWidth, ' px')
    setRangeControl('#page-height-input', '#page-height-output', reader.pageHeight, ' px')
    setRangeControl('#max-columns-input', '#max-columns-output', reader.maxColumns)
    $('#reduce-animation-input').checked = reader.reduceAnimation
    $('#invert-dark-input').checked = reader.invertDark
    $('#autohide-cursor-input').checked = reader.autohideCursor
    $('#pdf-zoom-select').value = reader.pdfZoom
    $('#pdf-wheel-input').checked = reader.pdfWheel
    $('#pdf-invert-dark-input').checked = reader.pdfInvertDark
    $('#selection-toolbar-input').checked = selectionToolbarEnabled
    for (const input of $$('[data-selection-tool]'))
        input.checked = selectionToolEnabled[input.dataset.selectionTool]
}

let systemFontsPromise
const loadSystemFonts = () => systemFontsPromise ??= (async () => {
    const status = $('#font-list-status')
    status.textContent = '正在读取 Windows 字体列表…'
    try {
        const fallback = [
            'Arial', 'Calibri', 'Cambria', 'Consolas', 'Georgia',
            'Microsoft YaHei UI', 'Segoe UI', 'SimSun', 'Times New Roman',
        ]
        const fonts = invoke ? await invoke('list_system_fonts') : fallback
        const unique = Array.from(new Set(fonts.filter(Boolean)))
        const fragment = document.createDocumentFragment()
        for (const family of unique) {
            const option = document.createElement('option')
            option.value = family
            fragment.append(option)
        }
        $('#system-fonts').replaceChildren(fragment)
        status.textContent = `已读取 ${unique.length} 个字体系列；输入名称可快速筛选。`
    } catch (error) {
        console.warn(error)
        status.textContent = '无法读取系统字体列表，仍可手动输入字体名称。'
    }
})()

const selectPreferencesTab = tab => {
    for (const button of $$('[data-preferences-tab]'))
        button.classList.toggle('selected', button.dataset.preferencesTab === tab)
    for (const panel of $$('[data-preferences-panel]'))
        panel.hidden = panel.dataset.preferencesPanel !== tab
}

const openPreferences = tab => {
    syncPreferenceControls()
    selectPreferencesTab(tab ?? (
        reader.view
            ? getExtension(reader.currentFile?.name ?? '') === 'pdf' ? 'pdf' : 'reading'
            : 'interface'
    ))
    $('#preferences-dialog').showModal()
    loadSystemFonts()
}

const englishText = {
    '书库': 'Library',
    '导入图书': 'Import Books',
    '打开电子书': 'Open Book',
    '搜索书库…': 'Search library…',
    '切换浅色模式': 'Switch to Light Mode',
    '切换深色模式': 'Switch to Dark Mode',
    '切换网格视图': 'Switch to Grid View',
    '切换列表视图': 'Switch to List View',
    '没有匹配的图书': 'No matching books',
    '目录': 'Contents',
    '批注': 'Annotations',
    '书签': 'Bookmarks',
    '上一页': 'Previous Page',
    '下一页': 'Next Page',
    '返回': 'Back',
    '前进': 'Forward',
    '添加书签': 'Add Bookmark',
    '隐藏侧栏': 'Hide Sidebar',
    '显示侧栏': 'Show Sidebar',
    '在书中搜索': 'Search in Book',
    '关闭搜索': 'Close Search',
    '上一个结果': 'Previous Result',
    '下一个结果': 'Next Result',
    '图书导航': 'Book Navigation',
    '图书目录': 'Table of Contents',
    '侧栏内容': 'Sidebar Content',
    '在书中查找…': 'Find in book…',
    '搜索批注…': 'Search annotations…',
    '搜索书签…': 'Search bookmarks…',
    '搜索词条…': 'Search entry…',
    '整本书': 'Whole book',
    '当前章节': 'Current section',
    '完整单词': 'Whole words',
    '区分大小写': 'Match case',
    '区分音调符号': 'Match diacritics',
    '输入关键词开始搜索': 'Type to search',
    '复制': 'Copy',
    '引用': 'Citation',
    '书内查找': 'Find',
    '朗读': 'Speak',
    '高亮': 'Highlight',
    '词典': 'Dictionary',
    '翻译': 'Translate',
    '打印': 'Print',
    '添加笔记…': 'Add a note…',
    '批注样式': 'Annotation Style',
    '下划线': 'Underline',
    '波浪线': 'Squiggly',
    '删除线': 'Strikethrough',
    '自定义颜色': 'Custom Color',
    '删除': 'Delete',
    '完成': 'Done',
    '关闭': 'Close',
    '取消': 'Cancel',
    '更多操作': 'More Actions',
    '设置': 'Settings',
    '界面设置': 'Interface',
    '电子书阅读': 'E-book Reading',
    'PDF 阅读': 'PDF Reading',
    '划词工具': 'Selection Tools',
    '脚注': 'Footnote',
    '转到脚注': 'Go to Footnote',
    '查询': 'Lookup',
    '界面外观': 'Interface Appearance',
    '界面语言': 'Interface Language',
    '存储清理': 'Storage Cleanup',
    '清理已移除图书的阅读数据': 'Clear Retained Reading Data',
    '清理临时文件': 'Clear Temporary Files',
    '清理操作不会删除仍在书库中的阅读进度、批注或书签，也不会删除原始图书文件。':
        'Cleanup does not delete data for books still in the library or original book files.',
    '跟随系统': 'Follow System',
    '浅色': 'Light',
    '深色': 'Dark',
    '字体': 'Font',
    '阅读主题': 'Reading Theme',
    '默认字号': 'Default Font Size',
    '最小字号': 'Minimum Font Size',
    '默认字体': 'Default Font',
    '衬线体': 'Serif',
    '无衬线体': 'Sans-serif',
    '覆盖出版商字体': 'Override Publisher Font',
    '衬线字体': 'Serif Font',
    '无衬线字体': 'Sans-serif Font',
    '等宽字体': 'Monospace Font',
    '布局': 'Layout',
    '分页': 'Paginated',
    '滚动': 'Scrolled',
    '行距': 'Line Height',
    '两端对齐': 'Justify',
    '自动断词': 'Hyphenation',
    '页边距': 'Page Margin',
    '最大行宽': 'Maximum Inline Size',
    '最大页面高度': 'Maximum Block Size',
    '最大列数': 'Maximum Columns',
    '行为': 'Behavior',
    '减少翻页动画': 'Reduce Animation',
    '暗色模式反色': 'Invert in Dark Mode',
    '阅读时自动隐藏光标': 'Autohide Cursor',
    '页面缩放': 'Page Zoom',
    '适合页面': 'Fit Page',
    '适合宽度': 'Fit Width',
    '鼠标滚轮翻页': 'Turn Pages with Mouse Wheel',
    '显示划词工具条': 'Show Selection Toolbar',
    '工具': 'Tools',
    '当前位置': 'Current Location',
    '本章节剩余': 'Section Remaining',
    '全书剩余': 'Book Remaining',
    '出版物页码': 'Publication Page',
    '位置': 'Location',
    '章节': 'Section',
    '转到': 'Go',
    '粘贴': 'Paste',
    '跳转到': 'Jump to',
    '第一章': 'First',
    '上一章': 'Previous',
    '下一章': 'Next',
    '最后一章': 'Last',
    '图书信息': 'Book Information',
    '阅读器菜单': 'Reader Menu',
    '重新加载': 'Reload',
    '在新窗口打开': 'Open in New Window',
    '全屏': 'Fullscreen',
    '打印整本书': 'Print Book',
    '导入批注': 'Import Annotations',
    '导出批注': 'Export Annotations',
    '键盘快捷键': 'Keyboard Shortcuts',
    '关于': 'About',
    '格式': 'Format',
    '导出': 'Export',
    '错误详情': 'Error Details',
    '重试': 'Retry',
    '关于 Foliate for Windows': 'About Foliate for Windows',
    '许可证与依赖': 'Licenses and Dependencies',
    '调试信息': 'Debug Information',
    '信息': 'Info',
    '新窗口': 'New Window',
    '外部打开': 'Open Externally',
    '翻译为': 'Translate to',
    '正在打开…': 'Opening…',
    '选择正文后即可添加批注。': 'Select text in the book to add an annotation.',
    '使用底部的书签按钮保存当前位置。': 'Use the bookmark button below to save this location.',
    '竖排、从右向左阅读和固定版式会遵循图书自身的排版信息。':
        'Vertical writing, right-to-left reading, and fixed layout follow the publication.',
}
const originalText = new WeakMap()
const originalAttributes = new WeakMap()

const applyLanguage = (language = localStorage.getItem('language') || 'zh-CN') => {
    document.documentElement.lang = language
    $('#language-select').value = language
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue
        if (!originalText.has(node)) originalText.set(node, node.textContent)
        const source = originalText.get(node)
        const trimmed = source.trim()
        if (language === 'en' && englishText[trimmed]) {
            const leading = source.match(/^\s*/)[0]
            const trailing = source.match(/\s*$/)[0]
            node.textContent = `${leading}${englishText[trimmed]}${trailing}`
        } else if (language !== 'en') node.textContent = source
    }
    for (const element of $$('[placeholder], [title], [aria-label]')) {
        if (!originalAttributes.has(element)) {
            originalAttributes.set(element, Object.fromEntries(
                ['placeholder', 'title', 'aria-label']
                    .filter(name => element.hasAttribute(name))
                    .map(name => [name, element.getAttribute(name)])))
        }
        for (const [name, source] of Object.entries(originalAttributes.get(element))) {
            element.setAttribute(name,
                language === 'en' && englishText[source] ? englishText[source] : source)
        }
    }
}

const showLibrary = async () => {
    $('#library-view').hidden = false
    $('#reader-view').hidden = true
    document.title = 'Foliate'
    await renderLibrary()
    applyLanguage()
}

const shortcutRows = [
    ['Ctrl+O', '打开图书'],
    ['Ctrl+Shift+O', '导入图书'],
    ['Ctrl+F', '书内搜索'],
    ['Ctrl+G / Ctrl+Shift+G', '下一个/上一个搜索结果'],
    ['← / → / Page Up / Page Down', '翻页'],
    ['Alt+← / Alt+→', '阅读历史后退/前进'],
    ['F5 / Ctrl+R', '重新加载当前图书'],
    ['F11', '切换全屏'],
    ['Ctrl+P', '打印整本书'],
    ['Ctrl+Shift+N', '在新窗口打开'],
    ['Ctrl+?', '显示快捷键'],
    ['Esc', '关闭弹窗或侧栏'],
]

const showShortcuts = () => {
    const dl = document.createElement('dl')
    for (const [keys, description] of shortcutRows) {
        const dt = document.createElement('dt')
        const dd = document.createElement('dd')
        dt.textContent = keys
        dd.textContent = description
        dl.append(dt, dd)
    }
    $('#shortcuts-content').replaceChildren(dl)
    $('#shortcuts-dialog').showModal()
}

const showAbout = () => {
    $('#about-version').textContent = runtimeInfo?.version ?? '0.1.2'
    $('#debug-info').textContent = [
        `Version: ${runtimeInfo?.version ?? '0.1.2'}`,
        `Edition: ${runtimeInfo?.portable ? 'Portable' : invoke ? 'Installed' : 'Browser'}`,
        `Platform: ${navigator.platform}`,
        `User agent: ${navigator.userAgent}`,
        `Language: ${navigator.language}`,
        `Online: ${navigator.onLine}`,
        `Data directory: ${runtimeInfo?.dataDir ?? 'WebView profile / browser storage'}`,
        `Current book ID: ${reader.bookId ?? 'None'}`,
    ].join('\n')
    $('#about-dialog').showModal()
}

const reloadCurrentBook = async () => {
    if (!lastOpenRequest) return
    const { file, storageIdentity, libraryRecord } = lastOpenRequest
    const current = libraryRecord ? await library.get(libraryRecord.id) : null
    await openFile(current ? fileFromRecord(current) : file,
        storageIdentity, current ?? libraryRecord)
}

const toggleFullscreen = async () => {
    if (invoke) {
        const fullscreen = await invoke('toggle_fullscreen')
        $('#fullscreen-button').classList.toggle('selected', fullscreen)
    } else if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
    } else {
        await document.exitFullscreen()
    }
}

const openCurrentInNewWindow = async () => {
    let bookId = reader.libraryRecord ? reader.bookId : null
    if (!bookId && reader.currentFile && reader.view?.book) {
        if (invoke && !reader.currentFile.sourcePath)
            throw new Error('当前图书没有可保存的 Windows 文件路径，请使用“打开电子书”按钮重新打开')
        const record = await library.import(reader.currentFile, async () => ({
            metadata: reader.metadata,
            title: $('#book-title').textContent,
            author: $('#book-author').textContent,
            description: stripHTML(formatLanguageMap(reader.metadata.description)
                || String(reader.metadata.description ?? '')),
            cover: await Promise.resolve(reader.view.book.getCover?.()).catch(() => null),
        }))
        await library.patch(record.id, {
            position: reader.currentLocation?.cfi ?? null,
            progress: reader.currentLocation?.fraction ?? 0,
            annotations: reader.annotations,
            bookmarks: reader.bookmarks,
        })
        bookId = record.id
        reader.libraryRecord = record
        lastOpenRequest = {
            file: fileFromRecord(record),
            storageIdentity: record.id,
            libraryRecord: record,
        }
    }
    if (invoke) await invoke('new_window', { bookId })
    else globalThis.open(bookId ? `?book=${encodeURIComponent(bookId)}` : location.href,
        '_blank', 'noopener')
}

const openCurrentInNewWindowSafely = async () => {
    try {
        await openCurrentInNewWindow()
    } catch (error) {
        console.error(error)
        showToast(error?.message || String(error) || '无法创建新窗口')
    }
}

let windowStateTimer
const saveWindowState = () => {
    if (!invoke) return
    clearTimeout(windowStateTimer)
    windowStateTimer = setTimeout(async () => {
        try {
            localStorage.setItem('window-state',
                JSON.stringify(await invoke('get_window_state')))
        } catch (error) {
            console.warn(error)
        }
    }, 300)
}

const restoreWindowState = async () => {
    if (!invoke) return
    const state = safeParse(localStorage.getItem('window-state'), null)
    if (!state) return
    await invoke('restore_window_state', {
        width: state.width,
        height: state.height,
        maximized: Boolean(state.maximized),
        fullscreen: Boolean(state.fullscreen),
    })
}

$('#theme-button').addEventListener('click', () =>
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark'))
$('#library-preferences-button').addEventListener('click', () =>
    openPreferences('interface'))
$('#open-button').addEventListener('click', chooseFile)
$('#import-button').addEventListener('click', chooseImport)
$('#empty-import-button').addEventListener('click', chooseImport)
$('#library-search-input').addEventListener('input', () => renderLibrary(false))
$('#library-view-button').addEventListener('click', () => {
    libraryListView = !libraryListView
    localStorage.setItem('library-view', libraryListView ? 'list' : 'grid')
    renderLibrary(false)
})
$('#library-button').addEventListener('click', showLibrary)
$('#file-input').addEventListener('change', event => openFile(event.target.files[0]))
$('#import-input').addEventListener('change', event => importBooks(event.target.files))
$('#about-button').addEventListener('click', showAbout)
$('#sidebar-close').addEventListener('click', closeSidebar)
$('#sidebar-open').addEventListener('click', openSidebar)
$('#reader-dimmer').addEventListener('click', closeSidebar)
$('#previous-button').addEventListener('click', () => reader.view?.goLeft())
$('#next-button').addEventListener('click', () => reader.view?.goRight())
$('#bookmark-button').addEventListener('click', () => {
    const removed = reader.toggleBookmark()
    if (removed) showToast('书签已删除', '撤销', () => reader.restoreBookmark(removed))
})
$('#history-back').addEventListener('click', () => reader.view?.history.back())
$('#history-forward').addEventListener('click', () => reader.view?.history.forward())
$('#progress').addEventListener('input', event =>
    reader.view?.goToFraction(Number(event.target.value)))
$('#progress-label').addEventListener('click', () =>
    $('#location-dialog').showModal())
$('#preferences-button').addEventListener('click', () => openPreferences())
$('#book-info-button').addEventListener('click', () =>
    $('#book-info-dialog').showModal())
$('#reader-menu-button').addEventListener('click', () =>
    $('#reader-menu-dialog').showModal())
$('#reload-book').addEventListener('click', () => {
    $('#reader-menu-dialog').close()
    reloadCurrentBook()
})
$('#new-window-book').addEventListener('click', () => {
    $('#reader-menu-dialog').close()
    openCurrentInNewWindowSafely()
})
$('#fullscreen-button').addEventListener('click', () => {
    $('#reader-menu-dialog').close()
    toggleFullscreen()
})
$('#print-book').addEventListener('click', () => {
    $('#reader-menu-dialog').close()
    printBook()
})
$('#shortcuts-button').addEventListener('click', () => {
    $('#reader-menu-dialog').close()
    showShortcuts()
})
$('#reader-about-button').addEventListener('click', () => {
    $('#reader-menu-dialog').close()
    showAbout()
})
$('#import-annotations').addEventListener('click', () => {
    $('#reader-menu-dialog').close()
    $('#annotation-import-input').click()
})
$('#export-annotations').addEventListener('click', () => {
    $('#reader-menu-dialog').close()
    $('#annotation-export-dialog').showModal()
})
$('#annotation-export-confirm').addEventListener('click', () => {
    exportAnnotations($('#annotation-export-format').value)
    $('#annotation-export-dialog').close()
})
$('#annotation-import-input').addEventListener('change', async event => {
    try {
        if (event.target.files[0]) await importAnnotations(event.target.files[0])
    } catch (error) {
        showOpenError('无法导入批注', '批注文件无效或无法读取。', error)
    } finally {
        event.target.value = ''
    }
})
$('#error-retry').addEventListener('click', () => {
    $('#error-dialog').close()
    if (lastOpenRequest) openFile(
        lastOpenRequest.file,
        lastOpenRequest.storageIdentity,
        lastOpenRequest.libraryRecord)
})

for (const button of $$('.sidebar-tab'))
    button.addEventListener('click', async () => {
        if (currentSidebarPanel === 'search') await closeBookSearch()
        setSidebarPanel(button.dataset.panel)
    })

$('#search-button').addEventListener('click', openBookSearch)
$('#search-close').addEventListener('click', closeBookSearch)
$('#book-search-input').addEventListener('input', scheduleSearch)
$('#book-search-input').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault()
        clearTimeout(searchTimer)
        reader.search(event.target.value)
    }
})
for (const control of [
    $('#search-scope'),
    $('#search-whole-words'),
    $('#search-match-case'),
    $('#search-diacritics'),
]) control.addEventListener('change', scheduleSearch)
$('#search-previous').addEventListener('click', () => reader.cycleSearch(-1))
$('#search-next').addEventListener('click', () => reader.cycleSearch(1))
$('#annotation-filter').addEventListener('input', () => reader.renderAnnotations())
$('#bookmark-filter').addEventListener('input', () => reader.renderBookmarks())

for (const button of $$('#selection-popover [data-selection-action]'))
    button.addEventListener('click', async () => {
        const context = selectionContext
        if (!context) return
        const action = button.dataset.selectionAction
        $('#selection-popover').hidden = true
        if (action === 'copy') {
            await copyText(context.text)
        } else if (action === 'copy-citation') {
            const title = $('#book-title').textContent
            const author = $('#book-author').textContent
            const page = reader.currentLocation?.pageItem?.label
                || (Number.isFinite(reader.currentLocation?.location?.current)
                    ? reader.currentLocation.location.current + 1
                    : null)
            await copyText(`“${context.text.trim()}” — ${[
                title,
                author,
                page ? `第 ${page} 页/位置` : '',
            ].filter(Boolean).join('，')}`)
        } else if (action === 'copy-cfi') {
            try {
                const cfi = reader.view.getCFI(context.index, context.range)
                if (!cfi) throw new Error('无法生成位置标识')
                await copyText(cfi)
            } catch (error) {
                console.warn(error)
                showToast('当前位置无法生成 EPUB 位置标识')
            }
        } else if (action === 'find') {
            openBookSearch()
            $('#book-search-input').value = context.text.trim()
            reader.search(context.text)
        } else if (action === 'speak') {
            speechSynthesis.cancel()
            const range = context.doc.createRange()
            range.setStart(context.range.startContainer, context.range.startOffset)
            range.setEndAfter(context.doc.body.lastChild ?? context.doc.body)
            const utterance = new SpeechSynthesisUtterance(range.toString())
            utterance.lang = context.lang || navigator.language
            speechSynthesis.speak(utterance)
        } else if (action === 'print') {
            printHTML($('#book-title').textContent,
                `<blockquote>${escapeHTML(context.text).replaceAll('\n', '<br>')}</blockquote>`)
        } else if (action === 'highlight') {
            const annotation = await reader.addAnnotation(context)
            if (annotation) showAnnotationPopover(annotation, context.position)
        } else {
            await lookupSelection(action, context)
        }
    })

for (const button of $$('#annotation-popover [data-color]'))
    button.addEventListener('click', () => {
        currentAnnotationColor = button.dataset.color
        for (const item of $$('#annotation-popover [data-color]'))
            item.classList.toggle('selected', item === button)
    })
$('#annotation-custom-color').addEventListener('input', event => {
    currentAnnotationColor = event.target.value
    for (const item of $$('#annotation-popover [data-color]'))
        item.classList.remove('selected')
})

$('#annotation-save').addEventListener('click', async () => {
    if (!currentAnnotation) return
    await reader.updateAnnotation(currentAnnotation, {
        color: currentAnnotationColor,
        note: $('#annotation-note').value.trim(),
    })
    $('#annotation-popover').hidden = true
})
$('#annotation-delete').addEventListener('click', async () => {
    if (!currentAnnotation) return
    const deleted = await reader.deleteAnnotation(currentAnnotation)
    currentAnnotation = null
    $('#annotation-popover').hidden = true
    showToast('批注已删除', '撤销', () => reader.restoreAnnotation(deleted))
})

$('#footnote-go').addEventListener('click', () => {
    if (reader.footnoteHref) reader.view.goTo(reader.footnoteHref)
    $('#footnote-dialog').close()
})
$('#footnote-dialog').addEventListener('close', () => {
    const footnoteView = $('#footnote-content').querySelector('foliate-view')
    footnoteView?.close()
    footnoteView?.remove()
    reader.footnoteHref = null
})

for (const button of $$('[data-dialog-close]'))
    button.addEventListener('click', () => button.closest('dialog').close())

for (const button of $$('[data-preferences-tab]'))
    button.addEventListener('click', () =>
        selectPreferencesTab(button.dataset.preferencesTab))

$('#theme-select').addEventListener('change', event => setTheme(event.target.value))
$('#language-select').addEventListener('change', event => {
    localStorage.setItem('language', event.target.value)
    applyLanguage(event.target.value)
})
$('#cleanup-retained-data').addEventListener('click', cleanupRetainedReadingData)
$('#cleanup-temporary-files').addEventListener('click', cleanupTemporaryFiles)
$('#book-theme-select').addEventListener('change', event =>
    reader.setPreference('bookTheme', event.target.value, 'reader-book-theme'))
const bindRangePreference = (input, output, property, storageKey, suffix = '', layout = false) =>
    $(input).addEventListener('input', event => {
        const value = Number(event.target.value)
        $(output).value = `${value}${suffix}`
        reader.setPreference(property, value, storageKey, layout)
    })
bindRangePreference('#font-size-input', '#font-size-output',
    'fontSize', 'reader-font-size', ' px')
bindRangePreference('#minimum-font-size-input', '#minimum-font-size-output',
    'minimumFontSize', 'reader-minimum-font-size', ' px')
bindRangePreference('#line-height-input', '#line-height-output',
    'lineHeight', 'reader-line-height')
bindRangePreference('#page-margin-input', '#page-margin-output',
    'pageMargin', 'reader-page-margin', ' px', true)
bindRangePreference('#page-width-input', '#page-width-output',
    'pageWidth', 'reader-page-width', ' px', true)
bindRangePreference('#page-height-input', '#page-height-output',
    'pageHeight', 'reader-page-height', ' px', true)
bindRangePreference('#max-columns-input', '#max-columns-output',
    'maxColumns', 'reader-max-columns', '', true)
$('#flow-select').addEventListener('change', event =>
    reader.setPreference('flow', event.target.value, 'reader-flow', true))
$('#default-font-select').addEventListener('change', event =>
    reader.setPreference('defaultFont', event.target.value, 'reader-default-font'))
$('#override-font-input').addEventListener('change', event =>
    reader.setPreference('overrideFont', event.target.checked, 'reader-override-font'))
$('#justify-input').addEventListener('change', event =>
    reader.setPreference('justify', event.target.checked, 'reader-justify'))
$('#hyphenate-input').addEventListener('change', event =>
    reader.setPreference('hyphenate', event.target.checked, 'reader-hyphenate'))
$('#reduce-animation-input').addEventListener('change', event =>
    reader.setPreference('reduceAnimation', event.target.checked,
        'reader-reduce-animation', true))
$('#invert-dark-input').addEventListener('change', event =>
    reader.setPreference('invertDark', event.target.checked, 'reader-invert-dark'))
$('#autohide-cursor-input').addEventListener('change', event =>
    reader.setPreference('autohideCursor', event.target.checked,
        'reader-autohide-cursor', true))
$('#pdf-zoom-select').addEventListener('change', event =>
    reader.setPreference('pdfZoom', event.target.value, 'pdf-zoom', true))
$('#pdf-wheel-input').addEventListener('change', event => {
    reader.pdfWheel = event.target.checked
    localStorage.setItem('pdf-wheel', String(reader.pdfWheel))
})
$('#pdf-invert-dark-input').addEventListener('change', event =>
    reader.setPreference('pdfInvertDark', event.target.checked,
        'pdf-invert-dark'))
$('#selection-toolbar-input').addEventListener('change', event => {
    selectionToolbarEnabled = event.target.checked
    localStorage.setItem('selection-toolbar-enabled', String(selectionToolbarEnabled))
    if (!selectionToolbarEnabled) hidePopovers()
})
for (const input of $$('[data-selection-tool]'))
    input.addEventListener('change', event => {
        const action = event.target.dataset.selectionTool
        selectionToolEnabled[action] = event.target.checked
        localStorage.setItem(`selection-tool-${action}`, String(event.target.checked))
    })
for (const [id, property, key] of [
    ['#serif-font-input', 'serifFont', 'reader-serif-font'],
    ['#sans-font-input', 'sansFont', 'reader-sans-font'],
    ['#monospace-font-input', 'monospaceFont', 'reader-monospace-font'],
]) $(id).addEventListener('change', event => {
    const value = event.target.value.trim()
    if (!value) {
        event.target.value = reader[property]
        return
    }
    if (!reader.overrideFont) {
        reader.overrideFont = true
        localStorage.setItem('reader-override-font', 'true')
        $('#override-font-input').checked = true
    }
    reader.setPreference(property, value, key)
})

$('#translation-language').value = localStorage.getItem('translation-language') || 'zh-CN'
$('#translation-language').addEventListener('change', event => {
    localStorage.setItem('translation-language', event.target.value)
    if (currentLookupTool === 'translate' && currentLookupContext)
        lookupSelection('translate', currentLookupContext)
})
$('#lookup-search-form').addEventListener('submit', event => {
    event.preventDefault()
    const text = $('#lookup-search-input').value.trim()
    if (!text || !currentLookupTool) return
    lookupSelection(currentLookupTool, {
        ...(currentLookupContext ?? {}),
        text,
        lang: currentLookupContext?.lang || navigator.language,
    })
})

$('#location-go').addEventListener('click', () => reader.goToLocation())
$('#section-go').addEventListener('click', () => reader.goToSection())
$('#location-input').addEventListener('keydown', event => {
    if (event.key === 'Enter') reader.goToLocation()
})
$('#section-input').addEventListener('keydown', event => {
    if (event.key === 'Enter') reader.goToSection()
})
$('#cfi-copy').addEventListener('click', () => copyText($('#cfi-input').value))
$('#cfi-paste').addEventListener('click', async () => {
    try {
        const value = (await navigator.clipboard.readText()).trim()
        if (!value) return
        $('#cfi-input').value = value
        reader.view?.goTo(value)
    } catch (error) {
        console.warn(error)
        showToast('无法读取剪贴板')
    }
})
$('#cfi-go').addEventListener('click', () => reader.view?.goTo($('#cfi-input').value.trim()))
$('#cfi-input').addEventListener('keydown', event => {
    if (event.key === 'Enter') reader.view?.goTo(event.target.value.trim())
})
$('#page-list-select').addEventListener('change', event =>
    event.target.value && reader.view?.goTo(event.target.value))
$('#landmarks-select').addEventListener('change', event => {
    if (event.target.value) reader.view?.goTo(event.target.value)
    event.target.value = ''
})
$('#first-section').addEventListener('click', () => reader.goSection('first'))
$('#previous-section').addEventListener('click', () => reader.goSection('previous'))
$('#next-section').addEventListener('click', () => reader.goSection('next'))
$('#last-section').addEventListener('click', () => reader.goSection('last'))

$('#toast-action').addEventListener('click', async () => {
    const action = undoAction
    undoAction = null
    $('#toast').hidden = true
    await action?.()
})

$('#image-close').addEventListener('click', closeImageViewer)
$('#image-zoom-in').addEventListener('click', () => {
    if (!imageState) return
    imageState.scale = Math.min(8, imageState.scale * 1.2)
    updateImageTransform()
})
$('#image-zoom-out').addEventListener('click', () => {
    if (!imageState) return
    imageState.scale = Math.max(.1, imageState.scale / 1.2)
    updateImageTransform()
})
$('#image-reset').addEventListener('click', () => {
    if (!imageState) return
    Object.assign(imageState, { scale: 1, rotation: 0, x: 0, y: 0, inverted: false })
    updateImageTransform()
})
$('#image-rotate-left').addEventListener('click', () => {
    if (!imageState) return
    imageState.rotation -= 90
    updateImageTransform()
})
$('#image-rotate-right').addEventListener('click', () => {
    if (!imageState) return
    imageState.rotation += 90
    updateImageTransform()
})
$('#image-invert').addEventListener('click', () => {
    if (!imageState) return
    imageState.inverted = !imageState.inverted
    updateImageTransform()
})
$('#image-copy').addEventListener('click', async () => {
    if (!imageState) return
    try {
        await navigator.clipboard.write([
            new ClipboardItem({ [imageState.blob.type]: imageState.blob }),
        ])
        showToast('插图已复制')
    } catch (error) {
        console.warn(error)
        showToast('当前系统不支持复制这张插图')
    }
})
$('#image-save').addEventListener('click', () => {
    if (!imageState) return
    const extension = imageState.blob.type.split('/')[1]?.replace('svg+xml', 'svg') || 'png'
    downloadBlob(imageState.blob, `${imageState.name}.${extension}`)
})
let imageDrag
$('#image-viewer-stage').addEventListener('pointerdown', event => {
    if (!imageState) return
    imageDrag = { x: event.clientX, y: event.clientY, startX: imageState.x, startY: imageState.y }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.classList.add('dragging')
})
$('#image-viewer-stage').addEventListener('pointermove', event => {
    if (!imageDrag || !imageState) return
    imageState.x = imageDrag.startX + event.clientX - imageDrag.x
    imageState.y = imageDrag.startY + event.clientY - imageDrag.y
    updateImageTransform()
})
$('#image-viewer-stage').addEventListener('pointerup', event => {
    imageDrag = null
    event.currentTarget.classList.remove('dragging')
})
$('#image-viewer-stage').addEventListener('wheel', event => {
    if (!imageState) return
    event.preventDefault()
    imageState.scale = Math.max(.1, Math.min(8,
        imageState.scale * (event.deltaY > 0 ? .9 : 1.1)))
    updateImageTransform()
}, { passive: false })

document.addEventListener('keydown', keyboardNavigation)
$('#reader-surface').addEventListener('wheel', readerWheelNavigation, { passive: false })
document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.book-card-cover-shell'))
        for (const shell of $$('.book-card-cover-shell.menu-open')) {
            shell.classList.remove('menu-open')
            shell.querySelector('.book-card-menu-button')
                ?.setAttribute('aria-expanded', 'false')
        }
    if (!event.target.closest('.popover')) hidePopovers()
})
document.addEventListener('pointerup', event => {
    if (!reader.view) return
    if (event.button === 3) reader.view.history.back()
    else if (event.button === 4) reader.view.history.forward()
})
document.addEventListener('dragover', event => event.preventDefault())
document.addEventListener('drop', event => {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files).filter(file => file.size > 0)
    if (files.length > 1 || !$('#library-view').hidden) {
        if (invoke) showToast('安装版请使用“导入图书”按钮，以保存原始文件路径')
        else importBooks(files)
    }
    else openFile(files[0])
})
window.addEventListener('resize', saveWindowState)
window.addEventListener('beforeunload', saveWindowState)

library.addEventListener('change', async event => {
    if (!$('#library-view').hidden) await renderLibrary()
    if (event.detail?.type === 'put' && event.detail.id === reader.bookId)
        reader.syncLibraryData(await library.get(event.detail.id)).catch(console.error)
    else if (event.detail?.type === 'remove' && event.detail.id === reader.bookId) {
        reader.libraryRecord = null
        showToast('当前图书已在另一个窗口中从书库删除')
    }
})

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themePreference() === 'system') setTheme('system')
})

const initializeDesktop = async () => {
    try {
        await library.open()
        await renderLibrary()
        applyLanguage(localStorage.getItem('language') || 'zh-CN')
        const requestedBook = globalThis.__FOLIATE_STARTUP_BOOK__
            || new URLSearchParams(location.search).get('book')
        if (invoke) {
            runtimeInfo = await invoke('runtime_info')
            document.documentElement.dataset.edition =
                runtimeInfo.portable ? 'portable' : 'installed'
            await restoreWindowState()
        }
        if (runtimeInfo?.portable) {
            document.title = 'Foliate Portable'
            $('.brand span').textContent = 'Foliate Portable'
        }
        if (requestedBook) {
            const record = await library.get(requestedBook)
            if (record) await openLibraryRecord(record)
            else showOpenError('图书不存在', '书库中找不到请求的图书。',
                new Error(`Missing library record: ${requestedBook}`))
        } else if (runtimeInfo?.startupError) {
            showOpenError('无法打开启动文件', runtimeInfo.startupError,
                new Error(runtimeInfo.startupError))
        } else if (runtimeInfo?.startupBook
        && Number.isFinite(runtimeInfo.startupBookSize)) {
            const file = new NativeBookFile(
                runtimeInfo.startupBook,
                runtimeInfo.startupBookSize,
                0)
            await openFile(file, runtimeInfo.startupBook.toLowerCase())
        }
    } catch (error) {
        console.error(error)
        showToast(error?.message || String(error) || '桌面外壳初始化失败')
    }
}

setTheme(themePreference())
await initializeDesktop()
