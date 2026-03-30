import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import './ChatInput.css'

/* ── File config ── */
const MAX_FILE_SIZE = 50 * 1024 * 1024
const MAX_FILES = 10

/* ── Helpers ── */
function getFileCategory(file) {
  const { type, name } = file
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type === 'application/pdf' || type.includes('document') || type.includes('sheet') ||
      type.includes('presentation') || type.startsWith('text/')) return 'document'
  if (type.includes('zip') || type.includes('rar') || type.includes('tar') ||
      type.includes('gzip') || type.includes('7z')) return 'archive'
  const imageExts = ['png','jpg','jpeg','gif','webp','svg','bmp','ico','tiff']
  const videoExts = ['mp4','webm','ogg','mov','avi','mkv','flv','wmv','m4v']
  const audioExts = ['mp3','wav','ogg','aac','flac','wma','m4a','opus']
  const docExts   = ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','md',
                     'json','xml','html','css','js','ts','py','java','c','cpp','rs',
                     'go','rb','php','sh','yml','yaml','toml','ini','cfg','log','sql',
                     'jsx','tsx','vue','svelte','dart','kt','swift','r','lua','zig']
  const archExts  = ['zip','rar','tar','gz','7z','bz2','xz','tgz']
  if (imageExts.includes(ext)) return 'image'
  if (videoExts.includes(ext)) return 'video'
  if (audioExts.includes(ext)) return 'audio'
  if (docExts.includes(ext))   return 'document'
  if (archExts.includes(ext))  return 'archive'
  return 'file'
}

function getCategoryColor(cat) {
  const c = { image:'#226DB4', video:'#E42527', audio:'#0A9949', document:'#5a9fd4', archive:'#F9B21C', file:'#94a3b8' }
  return c[cat] || '#94a3b8'
}

function getExt(name) {
  const p = name.split('.')
  return p.length > 1 ? p.pop().toUpperCase() : ''
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/* ── SVG Icons (inline) ── */
const I = {
  plus:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>,
  close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>,
  grid:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/></svg>,
  send:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  file:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9l-7-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M13 2v7h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  image: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  video: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="15" height="16" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M17 8l5-3v14l-5-3V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  audio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.8"/><circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.8"/></svg>,
  screen:<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/></svg>,
  clip:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="1.8"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  doc:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  archive:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 8v13H3V8M1 3h22v5H1V3z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  play:  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>,
  mic:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 10v2a7 7 0 01-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  drop:  <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  rmX:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
}

function fileIcon(cat) {
  return { image: I.image, video: I.video, audio: I.audio, document: I.doc, archive: I.archive }[cat] || I.file
}

/* ═════════════════════════════════════════════════════════════ */
export default function ChatInput({ onSend, disabled, isGenerating = false, isLanding = false }) {
  const [value, setValue]             = useState('')
  const [attachments, setAttachments] = useState([])
  const [dragOver, setDragOver]       = useState(false)
  const [fileError, setFileError]     = useState(null)
  const [menuOpen, setMenuOpen]       = useState(false)
  const [isListening, setIsListening] = useState(false)

  const textareaRef     = useRef(null)
  const anyFileRef      = useRef(null)
  const imageRef        = useRef(null)
  const videoRef        = useRef(null)
  
  const menuRef         = useRef(null)
  const plusBtnRef      = useRef(null)
  const recognitionRef  = useRef(null)

  /* Track previous generating state to detect when generation completes */
  const prevGeneratingRef = useRef(isGenerating)

  /* Auto-resize textarea */
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [value])

  /* Auto-focus the textarea when generation completes (isGenerating: true → false) */
  useEffect(() => {
    const wasGenerating = prevGeneratingRef.current
    prevGeneratingRef.current = isGenerating

    // Focus the textarea when streaming just finished (was generating, now done)
    if (wasGenerating && !isGenerating && textareaRef.current) {
      // Small delay to ensure the DOM has updated and textarea is interactive
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          // Add a brief visual pulse so user notices the input is ready
          const box = textareaRef.current.closest('.ci-box')
          if (box) {
            box.classList.add('ci-box--focus-pulse')
            setTimeout(() => box.classList.remove('ci-box--focus-pulse'), 600)
          }
        }
      })
    }
  }, [isGenerating])

  /* Auto-focus on mount when in landing page mode */
  useEffect(() => {
    if (isLanding && textareaRef.current && !disabled) {
      // Slight delay to let the landing animation finish
      const timer = setTimeout(() => {
        textareaRef.current?.focus()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isLanding])

  /* Clear error after 4s */
  useEffect(() => {
    if (fileError) { const t = setTimeout(() => setFileError(null), 4000); return () => clearTimeout(t) }
  }, [fileError])

  /* Cleanup previews */
  useEffect(() => {
    return () => attachments.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview) })
  }, [])

  /* Close menu on outside click */
  useEffect(() => {
    if (!menuOpen) return
    const h = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          plusBtnRef.current && !plusBtnRef.current.contains(e.target))
        setMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  /* ── Speech Recognition Setup ── */
  const SpeechRecognition = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null

  const toggleListening = useCallback(() => {
    if (!SpeechRecognition) {
      setFileError('Speech recognition is not supported in this browser.')
      return
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false   // Only final results — no partial/repeated junk
    recognition.continuous = false       // One utterance per click — clean output
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onresult = (event) => {
      // Collect only final transcripts from this result batch
      let finalText = ''
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript
        }
      }
      const trimmed = finalText.trim()
      if (trimmed) {
        setValue(prev => {
          const base = prev.trimEnd()
          return base ? base + ' ' + trimmed : trimmed
        })
      }
    }

    recognition.onerror = (event) => {
      console.warn('[SpeechRecognition] Error:', event.error)
      if (event.error === 'not-allowed') {
        setFileError('Microphone access denied. Please allow mic permission.')
      } else if (event.error !== 'aborted') {
        setFileError('Speech recognition error: ' + event.error)
      }
      setIsListening(false)
      recognitionRef.current = null
    }

    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
      // Auto-focus textarea after speech ends
      textareaRef.current?.focus()
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [isListening, SpeechRecognition])

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
    }
  }, [])

  /* Position the menu using fixed positioning to escape overflow:hidden parents */
  const [menuPos, setMenuPos] = useState({ bottom: 0, left: 0 })
  useEffect(() => {
    if (menuOpen && plusBtnRef.current) {
      const rect = plusBtnRef.current.getBoundingClientRect()
      setMenuPos({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
      })
    }
  }, [menuOpen])

  /* ── Add files ── */
  const addFiles = useCallback((files) => {
    const ok = []
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) { setFileError('"' + f.name + '" exceeds 50 MB.'); continue }
      ok.push(f)
    }
    if (!ok.length) return
    setAttachments(prev => {
      const rem = MAX_FILES - prev.length
      if (rem <= 0) { setFileError('Max ' + MAX_FILES + ' files.'); return prev }
      if (ok.length > rem) setFileError('Only ' + rem + ' more file(s) allowed.')
      return [...prev, ...ok.slice(0, rem).map(file => {
        const cat = getFileCategory(file)
        return {
          file, name: file.name, size: file.size, type: file.type,
          category: cat, extension: getExt(file.name),
          preview: (cat === 'image' || cat === 'video') ? URL.createObjectURL(file) : null,
        }
      })]
    })
  }, [])

  const removeAtt = useCallback((i) => {
    setAttachments(prev => {
      const u = [...prev]
      if (u[i].preview) URL.revokeObjectURL(u[i].preview)
      u.splice(i, 1)
      return u
    })
  }, [])

  const clearAll = useCallback(() => {
    attachments.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview) })
    setAttachments([])
  }, [attachments])

  /* ── To base64 ── */
  const toBase64 = useCallback(async (list) => {
    return Promise.all(list.map(att => new Promise(res => {
      const r = new FileReader()
      r.onloadend = () => res({
        name: att.name, type: att.type, size: att.size,
        category: att.category, extension: att.extension, data: r.result,
      })
      r.readAsDataURL(att.file)
    })))
  }, [])

  /* ── Submit ── */
  const handleSubmit = async (e) => {
    e?.preventDefault()
    // Stop speech recognition if active before sending
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop()
    }
    const txt = value.trim()
    if ((!txt && !attachments.length) || disabled) return

    if (isGenerating) return
    const files = attachments.length ? await toBase64(attachments) : []
    onSend(txt, files)
    setValue('')
    clearAll()
    setMenuOpen(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  const handleFileSelect = (e) => {
    if (e.target.files?.length) addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  /* ── Drag & Drop ── */
  const onDE = (e) => { e.preventDefault(); setDragOver(true) }
  const onDL = (e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }
  const onDO = (e) => { e.preventDefault() }
  const onDr = (e) => { e.preventDefault(); setDragOver(false); const f = Array.from(e.dataTransfer.files); if (f.length) addFiles(f) }

  /* ── Paste ── */
  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files = []
    for (const it of items) { if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f) } }
    if (files.length) { e.preventDefault(); addFiles(files) }
  }

  /* ── Screenshot ── */
  const doScreenshot = async () => {
    setMenuOpen(false)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const v = document.createElement('video')
      v.srcObject = stream; await v.play()
      const c = document.createElement('canvas')
      c.width = v.videoWidth; c.height = v.videoHeight
      c.getContext('2d').drawImage(v, 0, 0)
      stream.getTracks().forEach(t => t.stop())
      c.toBlob(b => { if (b) addFiles([new File([b], 'screenshot-' + Date.now() + '.png', { type: 'image/png' })]) }, 'image/png')
    } catch { /* cancelled */ }
  }

  /* ── Clipboard read ── */
  const doClipboard = async () => {
    setMenuOpen(false)
    try {
      const items = await navigator.clipboard.read()
      const files = []
      for (const item of items) {
        for (const type of item.types) {
          if (type !== 'text/plain' && type !== 'text/html') {
            try {
              const blob = await item.getType(type)
              const ext = type.split('/')[1]?.split(';')[0] || 'bin'
              files.push(new File([blob], 'pasted-' + Date.now() + '.' + ext, { type }))
            } catch { /* skip */ }
          }
        }
      }
      if (files.length) addFiles(files)
      else setFileError('No file content in clipboard.')
    } catch { setFileError('Cannot read clipboard. Use Ctrl+V.') }
  }

  const pick = (ref) => { setMenuOpen(false); ref.current?.click() }
  const hasContent = value.trim() || attachments.length > 0
  const canSend = hasContent && !disabled && !isGenerating

  /* ═════ MENU OPTIONS ═════ */
  const menuItems = [
    { icon: I.file,   bg: 'rgba(96,165,250,.12)',  color: '#60a5fa', label: 'Upload file',    hint: 'Documents, code, data, any file', action: () => pick(anyFileRef) },
    { icon: I.image,  bg: 'rgba(34,109,180,.12)', color: '#226DB4', label: 'Upload image',   hint: 'PNG, JPG, GIF, WebP, SVG',        action: () => pick(imageRef) },
    { icon: I.video,  bg: 'rgba(244,114,182,.12)', color: '#f472b6', label: 'Upload video',   hint: 'MP4, WebM, MOV, AVI',             action: () => pick(videoRef) },
    { divider: true },
    { icon: I.screen, bg: 'rgba(251,191,36,.12)',  color: '#fbbf24', label: 'Take a screenshot', hint: 'Capture your screen',           action: doScreenshot },
    { icon: I.clip,   bg: 'rgba(251,191,36,.12)',  color: '#fbbf24', label: 'Paste from clipboard', hint: 'Or press Ctrl+V',            action: doClipboard },
  ]

  /* ═════ RENDER ═════ */
  return (
    <div className={'ci-wrapper' + (dragOver ? ' ci-dragover' : '') + (isLanding ? ' ci-wrapper--landing' : '')} onDragEnter={onDE} onDragLeave={onDL} onDragOver={onDO} onDrop={onDr}>

      {/* Drag overlay */}
      {dragOver && (
        <div className="ci-drag-overlay">
          <div className="ci-drag-content">
            {I.drop}
            <span>Drop files here</span>
            <span className="ci-drag-hint">Images, videos, audio, documents & more</span>
          </div>
        </div>
      )}

      <div className="ci-container">
        {/* Error toast */}
        {fileError && (
          <div className="ci-error">
            <span>⚠️ {fileError}</span>
            <button onClick={() => setFileError(null)} className="ci-error-x">×</button>
          </div>
        )}

        {/* ══════ THE BOX ══════ */}
        <div className="ci-box">

          {/* Attachment strip */}
          {attachments.length > 0 && (
            <div className="ci-attachments">
              {attachments.map((att, i) => (
                <div key={i} className="ci-att-card">
                  <div className="ci-att-thumb">
                    {att.category === 'image' && att.preview ? (
                      <img src={att.preview} alt={att.name} />
                    ) : att.category === 'video' && att.preview ? (
                      <div className="ci-att-vid">
                        <video src={att.preview} muted preload="metadata" />
                        <div className="ci-att-play">{I.play}</div>
                      </div>
                    ) : (
                      <div className="ci-att-icon" style={{ color: getCategoryColor(att.category) }}>
                        {fileIcon(att.category)}
                      </div>
                    )}
                  </div>
                  <div className="ci-att-info">
                    <span className="ci-att-name" title={att.name}>{att.name}</span>
                    <div className="ci-att-meta">
                      {att.extension && (
                        <span className="ci-att-ext" style={{ background: getCategoryColor(att.category) + '22', color: getCategoryColor(att.category) }}>
                          {att.extension}
                        </span>
                      )}
                      <span className="ci-att-size">{fmtSize(att.size)}</span>
                    </div>
                  </div>
                  <button className="ci-att-rm" onClick={() => removeAtt(i)} title="Remove">{I.rmX}</button>
                </div>
              ))}
              {attachments.length > 1 && (
                <button className="ci-att-clear" onClick={clearAll}>Clear all</button>
              )}
            </div>
          )}

          {/* ── Input Row ── */}
          <form className="ci-row" onSubmit={handleSubmit}>

            {/* Left side: + button and grid button */}
            <div className="ci-left">
              <button
                ref={plusBtnRef}
                type="button"
                className={'ci-icon-btn' + (menuOpen ? ' ci-icon-btn--active' : '')}
                onClick={() => setMenuOpen(p => !p)}
                disabled={disabled}
                title={menuOpen ? 'Close' : 'Attach files'}
              >
                {menuOpen ? I.close : I.plus}
              </button>

            {/* Mic button for speech-to-text */}
              <button
                type="button"
                className={'ci-icon-btn ci-mic-btn' + (isListening ? ' ci-mic-btn--active' : '')}
                onClick={toggleListening}
                disabled={disabled}
                title={isListening ? 'Stop listening' : 'Voice input'}
              >
                {I.mic}
                {isListening && <span className="ci-mic-pulse" />}
              </button>
            </div>

            {/* Center: Textarea */}
            <textarea
              ref={textareaRef}
              className={'ci-textarea' + (isGenerating ? ' ci-textarea--generating' : '')}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={isGenerating ? 'Generating response...' : isLanding ? 'Ask me anything…' : 'Message Zenith...'}
              disabled={disabled}
              rows={1}
            />

            {/* Right: send button */}
            <div className="ci-right">
              {isGenerating && <span className="ci-dot-pulse" />}
              {attachments.length > 0 && <span className="ci-badge">{attachments.length}</span>}
              <button
                type="submit"
                className={
                  'ci-send'
                  + (canSend ? ' ci-send--active' : '')
                  + (isGenerating ? ' ci-send--generating' : '')
                }
                disabled={!canSend}
                title={isGenerating ? 'Generating response…' : 'Send (Enter)'}
              >
                {isGenerating ? (
                  <span className="ci-spinner" />
                ) : (
                  I.send
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Hidden file inputs */}
        <input ref={anyFileRef} type="file" multiple onChange={handleFileSelect} hidden />
        <input ref={imageRef}   type="file" accept="image/*" multiple onChange={handleFileSelect} hidden />
        <input ref={videoRef}   type="file" accept="video/*" multiple onChange={handleFileSelect} hidden />
        
      </div>

      {/* Popup Menu — rendered as a portal to escape overflow:hidden parents */}
      {menuOpen && createPortal(
        <div
          className="ci-menu"
          ref={menuRef}
          style={{ bottom: menuPos.bottom + 'px', left: menuPos.left + 'px' }}
        >
          {menuItems.map((item, idx) =>
            item.divider ? (
              <div key={idx} className="ci-menu-divider" />
            ) : (
              <button key={idx} type="button" className="ci-menu-item" onClick={item.action}>
                <div className="ci-menu-icon" style={{ background: item.bg, color: item.color }}>{item.icon}</div>
                <div className="ci-menu-text">
                  <span className="ci-menu-label">{item.label}</span>
                  <span className="ci-menu-hint">{item.hint}</span>
                </div>
              </button>
            )
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
