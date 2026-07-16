import {
    BookOpen,
    ChevronLeft,
    ChevronRight,
    Columns2,
    FolderOpen,
    Moon,
    PanelLeft,
    Rows3,
    Sun,
    X,
    createIcons,
} from 'lucide'

const foliateViewModule = '/foliate-js/view.js'
const foliateTreeModule = '/foliate-js/ui/tree.js'
await import(/* @vite-ignore */ foliateViewModule)
const { createTOCView } = await import(/* @vite-ignore */ foliateTreeModule)

const $ = selector => document.querySelector(selector)
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

const icons = {
    BookOpen,
    ChevronLeft,
    ChevronRight,
    Columns2,
    FolderOpen,
    Moon,
    PanelLeft,
    Rows3,
    Sun,
    X,
}

createIcons({ icons })

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

const readerCSS = ({ theme, flow }) => `
    :root {
        color-scheme: ${theme};
    }
    html {
        color: ${theme === 'dark' ? '#e9eeee' : '#242929'};
        background: ${theme === 'dark' ? '#202425' : '#ffffff'};
    }
    body {
        font-family: "Segoe UI", system-ui, sans-serif;
    }
    p, li, blockquote, dd {
        line-height: 1.65;
        text-align: justify;
        hyphens: auto;
    }
    pre {
        white-space: pre-wrap !important;
    }
    aside[epub|type~="footnote"],
    aside[epub|type~="endnote"] {
        display: none;
    }
    ${flow === 'scrolled' ? 'body { padding-inline: 4%; }' : ''}
`

class Reader {
    view = null
    coverURL = null
    tocView = null
    flow = 'paginated'
    fileKey = null

    async open(file, storageIdentity = null) {
        await this.close()
        this.fileKey = storageIdentity
            ? `position:path:${storageIdentity}`
            : `position:file:${file.name}:${file.size}:${file.lastModified}`
        this.view = document.createElement('foliate-view')
        this.view.setAttribute('animated', '')
        $('#reader-surface').replaceChildren(this.view)

        this.view.addEventListener('relocate', event => this.onRelocate(event.detail))
        this.view.addEventListener('load', event => {
            event.detail.doc.addEventListener('keydown', keyboardNavigation)
        })
        this.view.addEventListener('external-link', event => {
            event.preventDefault()
            showToast('外部链接将在后续版本中支持')
        })

        await this.view.open(file)
        this.applyLayout()
        this.applyTheme()
        await this.updateMetadata(file)

        const savedPosition = localStorage.getItem(this.fileKey)
        await this.view.init({
            lastLocation: savedPosition || null,
            showTextStart: !savedPosition,
        })
    }

    async close() {
        if (!this.view) return
        this.view.close()
        await this.view.book?.destroy?.()
        this.view.remove()
        this.view = null
        this.fileKey = null
        this.tocView = null
        $('#toc').replaceChildren()
        if (this.coverURL) URL.revokeObjectURL(this.coverURL)
        this.coverURL = null
    }

    async updateMetadata(file) {
        const { book } = this.view
        const title = formatLanguageMap(book.metadata?.title) || file.name.replace(/\.[^.]+$/, '')
        const author = formatContributor(book.metadata?.author)
        document.title = `${title} - Foliate`
        $('#book-title').textContent = title
        $('#toolbar-title').textContent = title
        $('#book-author').textContent = author
        $('#book-author').hidden = !author

        const cover = await Promise.resolve(book.getCover?.()).catch(() => null)
        if (cover) {
            this.coverURL = URL.createObjectURL(cover)
            $('#book-cover').src = this.coverURL
            $('#book-cover').alt = `${title} 封面`
            $('#book-cover').hidden = false
        } else {
            $('#book-cover').hidden = true
        }

        if (book.toc?.length) {
            this.tocView = createTOCView(book.toc, href => {
                this.view.goTo(href)
                closeSidebar()
            })
            $('#toc').replaceChildren(this.tocView.element)
        } else {
            const empty = document.createElement('span')
            empty.className = 'toc-empty'
            empty.textContent = '无目录'
            $('#toc').replaceChildren(empty)
        }
    }

    onRelocate(detail) {
        const fraction = Number.isFinite(detail.fraction) ? detail.fraction : 0
        $('#progress').value = fraction
        $('#progress-label').textContent = percentFormat.format(fraction)
        if (detail.tocItem?.href) this.tocView?.setCurrentHref(detail.tocItem.href)
        if (this.fileKey && typeof detail.cfi === 'string')
            localStorage.setItem(this.fileKey, detail.cfi)
    }

    applyLayout() {
        if (!this.view?.renderer) return
        this.view.renderer.setAttribute('flow', this.flow)
        this.view.renderer.setAttribute('margin', '52px')
        this.view.renderer.setAttribute('gap', '6%')
        this.view.renderer.setAttribute('max-inline-size', '720px')
        this.view.renderer.setAttribute('max-column-count', '2')
        this.view.renderer.setStyles?.(readerCSS({ theme: currentTheme(), flow: this.flow }))
    }

    applyTheme() {
        this.view?.renderer?.setStyles?.(readerCSS({ theme: currentTheme(), flow: this.flow }))
    }

    setFlow(flow) {
        this.flow = flow
        $('#paginated-button').classList.toggle('selected', flow === 'paginated')
        $('#scrolled-button').classList.toggle('selected', flow === 'scrolled')
        this.applyLayout()
    }
}

const reader = new Reader()
let toastTimer

const showToast = message => {
    const toast = $('#toast')
    toast.textContent = message
    toast.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.hidden = true }, 3500)
}

const currentTheme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'

const setTheme = theme => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
    const button = $('#theme-button')
    button.replaceChildren()
    const icon = document.createElement('i')
    icon.dataset.lucide = theme === 'dark' ? 'sun' : 'moon'
    button.append(icon)
    button.title = theme === 'dark' ? '切换浅色模式' : '切换深色模式'
    button.setAttribute('aria-label', button.title)
    createIcons({ icons, root: button })
    reader.applyTheme()
}

const openSidebar = () => {
    $('#sidebar').classList.add('open')
    $('#sidebar').setAttribute('aria-hidden', 'false')
    $('#reader-dimmer').hidden = false
}

const closeSidebar = () => {
    $('#sidebar').classList.remove('open')
    $('#sidebar').setAttribute('aria-hidden', 'true')
    $('#reader-dimmer').hidden = true
}

const chooseFile = () => $('#file-input').click()

const openFile = async (file, storageIdentity = null) => {
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!supportedExtensions.includes(extension)) {
        showToast('不支持这种文件格式')
        return
    }
    $('#loading').hidden = false
    try {
        await reader.open(file, storageIdentity)
        $('#empty-view').hidden = true
        $('#reader-view').hidden = false
    } catch (error) {
        console.error(error)
        showToast(error?.message || '无法打开这本书')
        if (!reader.view?.book) await reader.close()
    } finally {
        $('#loading').hidden = true
        $('#file-input').value = ''
    }
}

const keyboardNavigation = event => {
    if (!reader.view || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        reader.view.goLeft()
    } else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        reader.view.goRight()
    } else if (event.key === 'Escape') {
        closeSidebar()
    }
}

const initialTheme = localStorage.getItem('theme')
    ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
setTheme(initialTheme)

$('#theme-button').addEventListener('click', () =>
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark'))
$('#open-button').addEventListener('click', chooseFile)
$('#empty-open-button').addEventListener('click', chooseFile)
$('#file-input').addEventListener('change', event => openFile(event.target.files[0]))
$('#sidebar-button').addEventListener('click', openSidebar)
$('#sidebar-close').addEventListener('click', closeSidebar)
$('#reader-dimmer').addEventListener('click', closeSidebar)
$('#previous-button').addEventListener('click', () => reader.view?.goLeft())
$('#next-button').addEventListener('click', () => reader.view?.goRight())
$('#paginated-button').addEventListener('click', () => reader.setFlow('paginated'))
$('#scrolled-button').addEventListener('click', () => reader.setFlow('scrolled'))
$('#progress').addEventListener('input', event => reader.view?.goToFraction(Number(event.target.value)))
document.addEventListener('keydown', keyboardNavigation)

document.addEventListener('dragover', event => event.preventDefault())
document.addEventListener('drop', event => {
    event.preventDefault()
    openFile(Array.from(event.dataTransfer.files).find(file => file.size > 0))
})

const openNativePath = async path => {
    if (!invoke || !path) return
    const name = path.split(/[\\/]/).pop() || 'book'
    const extension = name.split('.').pop()?.toLowerCase()
    const response = await invoke('read_startup_book')
    const bytes = response instanceof ArrayBuffer
        ? response
        : response instanceof Uint8Array
            ? response
            : new Uint8Array(response)
    const file = new File([bytes], name, {
        type: mimeTypes[extension] || 'application/octet-stream',
        lastModified: 0,
    })
    await openFile(file, path.toLowerCase())
}

const initializeDesktop = async () => {
    if (!invoke) return
    try {
        const runtime = await invoke('runtime_info')
        document.documentElement.dataset.edition = runtime.portable ? 'portable' : 'installed'
        if (runtime.portable) {
            document.title = 'Foliate Portable'
            $('.brand span').textContent = 'Foliate Portable'
        }
        if (runtime.startupBook) await openNativePath(runtime.startupBook)
    } catch (error) {
        console.error(error)
        showToast(error?.message || String(error) || '桌面外壳初始化失败')
    }
}

await initializeDesktop()
