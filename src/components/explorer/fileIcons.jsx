// ─────────────────────────────────────────────────────────────
//  Antigravity / Material Icon Theme — SVG File Icons
//  Pixel-perfect VS Code Material Icon Theme replicas
// ─────────────────────────────────────────────────────────────
import React from "react";

// ── Shared SVG wrapper ──
const S = ({ children, size = 16, vb = "0 0 24 24" }) => (
  <svg width={size} height={size} viewBox={vb} fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, display: "block" }}>
    {children}
  </svg>
);

// ════════════════════════════════════════════════════════════
//  SVG ICON COMPONENTS (Antigravity / Material Icon Theme)
// ════════════════════════════════════════════════════════════

// ── Folders ──
export const FolderIcon = ({ open, color = "#90a4ae" }) => (
  <S>
    {open ? (
      <>
        <path d="M2 6C2 4.9 2.9 4 4 4h5l2 2h9c1.1 0 2 .9 2 2v1H2V6z" fill={color} opacity="0.9" />
        <path d="M2 9h20v9c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V9z" fill={color} opacity="0.65" />
      </>
    ) : (
      <path d="M4 4h5l2 2h9c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill={color} opacity="0.85" />
    )}
  </S>
);

// ── Special Folder colors (Antigravity style) ──
const FOLDER_COLORS = {
  src:          "#42a5f5",
  components:   "#42a5f5",
  component:    "#42a5f5",
  pages:        "#42a5f5",
  lib:          "#ab47bc",
  utils:        "#ab47bc",
  hooks:        "#ab47bc",
  helpers:      "#ab47bc",
  public:       "#66bb6a",
  assets:       "#66bb6a",
  images:       "#66bb6a",
  static:       "#66bb6a",
  styles:       "#ec407a",
  css:          "#ec407a",
  config:       "#ffa726",
  node_modules: "#7cb342",
  dist:         "#78909c",
  build:        "#78909c",
  test:         "#ef5350",
  tests:        "#ef5350",
  __tests__:    "#ef5350",
  spec:         "#ef5350",
  api:          "#26c6da",
  services:     "#26c6da",
  context:      "#ff7043",
  store:        "#ff7043",
  redux:        "#764abc",
  routes:       "#26a69a",
  middleware:    "#78909c",
  models:       "#ffa726",
  types:        "#3178c6",
  interfaces:   "#3178c6",
  docs:         "#42a5f5",
  scripts:      "#8bc34a",
  icons:        "#66bb6a",
  explorer:     "#42a5f5",
};

// ── JavaScript ──
const JsIcon = () => (
  <S>
    <rect x="2" y="2" width="20" height="20" rx="2" fill="#f5de19" />
    <text x="12.5" y="17.5" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="11" fill="#1a1a1a">JS</text>
  </S>
);

// ── JSX / React ──
const ReactIcon = () => (
  <S>
    <circle cx="12" cy="12" r="2.5" fill="#61dafb" />
    <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#61dafb" strokeWidth="1.2" fill="none" />
    <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#61dafb" strokeWidth="1.2" fill="none" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#61dafb" strokeWidth="1.2" fill="none" transform="rotate(120 12 12)" />
  </S>
);

// ── TypeScript ──
const TsIcon = () => (
  <S>
    <rect x="2" y="2" width="20" height="20" rx="2" fill="#3178c6" />
    <text x="12.5" y="17.5" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="11" fill="#ffffff">TS</text>
  </S>
);

// ── TSX ──
const TsxIcon = () => (
  <S>
    <circle cx="12" cy="12" r="2" fill="#3178c6" />
    <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#3178c6" strokeWidth="1.2" fill="none" />
    <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#3178c6" strokeWidth="1.2" fill="none" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#3178c6" strokeWidth="1.2" fill="none" transform="rotate(120 12 12)" />
  </S>
);

// ── HTML ──
const HtmlIcon = () => (
  <S>
    <path d="M3.5 2L5.2 20.4 12 22.5l6.8-2.1L20.5 2H3.5z" fill="#e44d26" />
    <path d="M12 4v16.5l5.3-1.6L18.6 4H12z" fill="#f16529" />
    <path d="M8 8h8l-.3 3H9.3L9.5 13h5.8l-.5 5-2.8.8-2.8-.8-.2-2h-2l.3 4 4.7 1.3 4.7-1.3.7-8H8.5L8 8z" fill="#fff" />
  </S>
);

// ── CSS ──
const CssIcon = () => (
  <S>
    <path d="M3.5 2L5.2 20.4 12 22.5l6.8-2.1L20.5 2H3.5z" fill="#1572b6" />
    <path d="M12 4v16.5l5.3-1.6L18.6 4H12z" fill="#33a9dc" />
    <text x="12" y="15" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="7" fill="#fff">{"{}"}</text>
  </S>
);

// ── SCSS / Sass ──
const SassIcon = () => (
  <S>
    <circle cx="12" cy="12" r="10" fill="#cd6799" />
    <text x="12" y="16" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold" fontSize="9" fill="#fff">S</text>
  </S>
);

// ── JSON ──
const JsonIcon = () => (
  <S>
    <text x="12" y="17" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="14" fill="#f5de19">{"{}"}</text>
  </S>
);

// ── Python ──
const PythonIcon = () => (
  <S>
    <path d="M11.9 2C7 2 7.3 4.2 7.3 4.2l.01 2.3H12v.7H5.1S2 6.6 2 11.8s2.7 5 2.7 5h1.6v-2.4s-.1-2.7 2.7-2.7h4.6s2.6 0 2.6-2.5V4.9S16.7 2 11.9 2zm-2.6 1.7a.87.87 0 110 1.74.87.87 0 010-1.74z" fill="#3776ab" />
    <path d="M12.1 22c4.9 0 4.6-2.2 4.6-2.2l-.01-2.3H12v-.7h6.9s3.1.4 3.1-4.8-2.7-5-2.7-5h-1.6v2.4s.1 2.7-2.7 2.7H10.4s-2.6 0-2.6 2.5v4.3s-.4 3.1 4.3 3.1zm2.6-1.7a.87.87 0 110-1.74.87.87 0 010 1.74z" fill="#ffd43b" />
  </S>
);

// ── Java ──
const JavaIcon = () => (
  <S>
    <path d="M8.5 18.5s-1 .6.7.8c2.1.2 3.1.2 5.4-.2 0 0 .6.4 1.4.7-5.1 2.2-11.6-.1-7.5-1.3zM7.8 15.9s-1.1.8.6.9c2.2.2 4 .2 7-.3 0 0 .4.4 1 .6-6.2 1.8-13.1.1-8.6-1.2z" fill="#e76f00" />
    <path d="M13.4 10.9c1.2 1.4-.3 2.6-.3 2.6s3.1-1.6 1.7-3.6c-1.3-1.9-2.4-2.9 3.2-6.1 0 0-8.7 2.2-4.6 7.1z" fill="#e76f00" />
    <path d="M18.7 20.2s.7.6-.8 1.1c-2.9.9-11.9 1.2-14.4 0-.9-.4.8-1 1.3-1.1.6-.1.9-.1.9-.1-1-.7-6.8 1.4-2.9 2 10.5 1.6 19.1-.7 15.9-1.9z" fill="#5382a1" />
  </S>
);

// ── Markdown ──
const MarkdownIcon = () => (
  <S>
    <rect x="2" y="4" width="20" height="16" rx="2" stroke="#519aba" strokeWidth="1.5" fill="none" />
    <path d="M5.5 15.5v-7l3 3.5 3-3.5v7" stroke="#519aba" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16.5 12.5l2.5 3m0 0l-2.5-3m2.5 3v-7" stroke="#519aba" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);

// ── SVG File ──
const SvgIcon = () => (
  <S>
    <path d="M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" fill="none" stroke="#ffb13b" strokeWidth="1.3" />
    <path d="M7 14l3-5 3 4 2-2 3 5H6z" fill="#ffb13b" opacity="0.8" />
    <circle cx="8.5" cy="8.5" r="1.5" fill="#ffb13b" />
  </S>
);

// ── Git / .gitignore ──
const GitIcon = () => (
  <S>
    <path d="M21.6 11.3L12.7 2.4a1.4 1.4 0 00-1.9 0L8.9 4.3l2.4 2.4a1.6 1.6 0 012 2l2.3 2.3a1.6 1.6 0 011.7.4 1.6 1.6 0 01-2.3 2.3 1.6 1.6 0 01-.4-1.8l-2.1-2.1v5.6a1.6 1.6 0 01.4.3 1.6 1.6 0 01-2.3 2.3 1.6 1.6 0 012.3-2.3c.1.1.2.2.3.4V9.4a1.6 1.6 0 01-.9-2.1L10 5l-7.5 7.5a1.4 1.4 0 000 1.9l8.9 8.9a1.4 1.4 0 001.9 0l8.3-8.3a1.4 1.4 0 000-1.7z" fill="#e64a19" />
  </S>
);

// ── ESLint ──
const EslintIcon = () => (
  <S>
    <path d="M8 2.8l-6 10.4L8 23.6h8l6-10.4L16 2.8H8z" fill="none" stroke="#4b32c3" strokeWidth="1.5" />
    <path d="M10 8.8l-3 5.2 3 5.2h4l3-5.2-3-5.2h-4z" fill="#4b32c3" opacity="0.3" />
    <circle cx="12" cy="14" r="2" fill="#4b32c3" />
  </S>
);

// ── Vite ──
const ViteIcon = () => (
  <S>
    <path d="M21.5 3L12 22 2.5 3h7.2l2.3 10L14.3 3h7.2z" fill="url(#viteGrad1)" />
    <defs>
      <linearGradient id="viteGrad1" x1="2.5" y1="3" x2="21.5" y2="3" gradientUnits="userSpaceOnUse">
        <stop stopColor="#41d1ff" />
        <stop offset="1" stopColor="#bd34fe" />
      </linearGradient>
    </defs>
  </S>
);

// ── NPM / package.json ──
const NpmIcon = () => (
  <S>
    <rect x="2" y="5" width="20" height="14" rx="1" fill="#cb3837" />
    <path d="M5 8v8h4v-6h2.5v6H14V8H5z" fill="#fff" />
  </S>
);

// ── Tailwind ──
const TailwindIcon = () => (
  <S>
    <path d="M12 6c-2.7 0-4.3 1.3-5 4 1-1.3 2.2-1.8 3.5-1.5.7.2 1.2.7 1.8 1.3C13.3 10.8 14.4 12 17 12c2.7 0 4.3-1.3 5-4-1 1.3-2.2 1.8-3.5 1.5-.7-.2-1.2-.7-1.8-1.3C15.7 7.2 14.6 6 12 6zM7 12c-2.7 0-4.3 1.3-5 4 1-1.3 2.2-1.8 3.5-1.5.7.2 1.2.7 1.8 1.3C8.3 16.8 9.4 18 12 18c2.7 0 4.3-1.3 5-4-1 1.3-2.2 1.8-3.5 1.5-.7-.2-1.2-.7-1.8-1.3C10.7 13.2 9.6 12 7 12z" fill="#06b6d4" />
  </S>
);

// ── PostCSS ──
const PostcssIcon = () => (
  <S>
    <circle cx="12" cy="12" r="9" fill="none" stroke="#dd3735" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="3.5" fill="#dd3735" />
  </S>
);

// ── Docker ──
const DockerIcon = () => (
  <S>
    <path d="M13.5 3.5h2v2h-2zM10.5 3.5h2v2h-2zM7.5 3.5h2v2h-2zM13.5 6.5h2v2h-2zM10.5 6.5h2v2h-2zM7.5 6.5h2v2h-2zM4.5 6.5h2v2h-2zM10.5 .5h2v2h-2z" fill="#2496ed" />
    <path d="M22.5 9.5c-.7-.5-2.3-.7-3.5-.4-.2-1.3-1-2.4-2-3.2l-.7-.4-.4.7c-.5.8-.8 2-.7 2.9.1.6.3 1.3.7 1.8-.6.3-1.3.5-2 .6H.5c-.3 1.5-.3 3 .2 4.5.6 1.7 1.7 3 3.3 3.8 1.8.9 4.7 1.1 7.5.1 2.2-.8 4-2.1 5.5-4.2 1.3 0 4-.1 5.4-2.7l.4-.7c-1-.5-2.2-.7-3.3-.6z" fill="#2496ed" />
  </S>
);

// ── Shell ──
const ShellIcon = () => (
  <S>
    <rect x="2" y="3" width="20" height="18" rx="2" fill="#2d2d2d" />
    <path d="M6 9l3 3-3 3" stroke="#4ec9b0" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="15" x2="17" y2="15" stroke="#4ec9b0" strokeWidth="1.5" strokeLinecap="round" />
  </S>
);

// ── Image file ──
const ImageIcon = () => (
  <S>
    <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="#a074c4" strokeWidth="1.3" />
    <circle cx="8.5" cy="8.5" r="2" fill="#a074c4" />
    <path d="M3 16l4.5-5 3 3 2.5-3L21 17v2c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-3z" fill="#a074c4" opacity="0.6" />
  </S>
);

// ── Config / Gear ──
const ConfigIcon = ({ color = "#a8b9cc" }) => (
  <S>
    <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" fill={color} />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" fill="none" stroke={color} strokeWidth="1.2" />
  </S>
);

// ── Key / .env ──
const EnvIcon = () => (
  <S>
    <path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78zM15 5l4 4m-3-6l6 6" stroke="#ecd53f" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);

// ── Lock file ──
const LockIcon = () => (
  <S>
    <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="#a8b9cc" strokeWidth="1.3" />
    <path d="M8 11V7a4 4 0 118 0v4" fill="none" stroke="#a8b9cc" strokeWidth="1.3" />
    <circle cx="12" cy="16" r="1.5" fill="#a8b9cc" />
  </S>
);

// ── Database / SQL ──
const DatabaseIcon = () => (
  <S>
    <ellipse cx="12" cy="6" rx="8" ry="3" fill="none" stroke="#e38c00" strokeWidth="1.3" />
    <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" fill="none" stroke="#e38c00" strokeWidth="1.3" />
    <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" fill="none" stroke="#e38c00" strokeWidth="1.3" />
  </S>
);

// ── Text / Generic file ──
const TextIcon = ({ color = "#a8b9cc" }) => (
  <S>
    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" fill="none" stroke={color} strokeWidth="1.3" />
    <path d="M14 2v6h6" fill="none" stroke={color} strokeWidth="1.3" />
    <line x1="8" y1="13" x2="16" y2="13" stroke={color} strokeWidth="1" opacity="0.5" />
    <line x1="8" y1="16" x2="14" y2="16" stroke={color} strokeWidth="1" opacity="0.5" />
  </S>
);

// ── YAML ──
const YamlIcon = () => (
  <S>
    <text x="12" y="16" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="8" fill="#cb171e">YML</text>
  </S>
);

// ── XML ──
const XmlIcon = () => (
  <S>
    <text x="12" y="16" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="7" fill="#e44d26">{"</>"}</text>
  </S>
);

// ── Rust ──
const RustIcon = () => (
  <S>
    <circle cx="12" cy="12" r="9" fill="none" stroke="#dea584" strokeWidth="1.5" />
    <text x="12" y="16" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="9" fill="#dea584">R</text>
  </S>
);

// ── Go ──
const GoIcon = () => (
  <S>
    <text x="12" y="17" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold" fontSize="12" fill="#00add8">Go</text>
  </S>
);

// ── Ruby ──
const RubyIcon = () => (
  <S>
    <path d="M5 18L2 12l3-6h6l3 6-3 6H5z" fill="#cc342d" opacity="0.8" />
    <path d="M13 18l-3-6 3-6h6l3 6-3 6h-6z" fill="#cc342d" opacity="0.5" />
  </S>
);

// ── PHP ──
const PhpIcon = () => (
  <S>
    <ellipse cx="12" cy="12" rx="10" ry="7" fill="none" stroke="#4f5b93" strokeWidth="1.5" />
    <text x="12" y="15" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold" fontSize="7" fill="#4f5b93">PHP</text>
  </S>
);

// ── C / C++ ──
const CIcon = ({ label = "C", color = "#555555" }) => (
  <S>
    <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="1.5" />
    <text x="12" y="16.5" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="11" fill={color}>{label}</text>
  </S>
);

// ── C# ──
const CSharpIcon = () => (
  <S>
    <circle cx="12" cy="12" r="9" fill="none" stroke="#68217a" strokeWidth="1.5" />
    <text x="12" y="16" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="9" fill="#68217a">C#</text>
  </S>
);

// ── Swift ──
const SwiftIcon = () => (
  <S>
    <rect x="2" y="2" width="20" height="20" rx="5" fill="#fa7343" />
    <path d="M17 5.5c-.4 4.7-5.8 9.2-10 11.5 2.3.7 5.2.5 8.3-1.7 1.2 1.6.8 3.2.8 3.2s3.5-3 3.5-7.5c0-2.5-1-4.5-2.6-5.5z" fill="#fff" />
  </S>
);

// ── Kotlin ──
const KotlinIcon = () => (
  <S>
    <path d="M3 21V3h18L12 12l9 9H3z" fill="url(#ktGrad1)" />
    <defs>
      <linearGradient id="ktGrad1" x1="3" y1="3" x2="21" y2="21">
        <stop stopColor="#7f52ff" />
        <stop offset="0.5" stopColor="#c711e1" />
        <stop offset="1" stopColor="#e44857" />
      </linearGradient>
    </defs>
  </S>
);

// ── Archive / Zip ──
const ZipIcon = () => (
  <S>
    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" fill="none" stroke="#e6a817" strokeWidth="1.3" />
    <path d="M14 2v6h6" fill="none" stroke="#e6a817" strokeWidth="1.3" />
    <rect x="9" y="12" width="2" height="2" fill="#e6a817" />
    <rect x="11" y="14" width="2" height="2" fill="#e6a817" />
    <rect x="9" y="16" width="2" height="2" fill="#e6a817" />
  </S>
);

// ── PDF ──
const PdfIcon = () => (
  <S>
    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" fill="#ec1c24" opacity="0.15" stroke="#ec1c24" strokeWidth="1.2" />
    <path d="M14 2v6h6" fill="none" stroke="#ec1c24" strokeWidth="1.2" />
    <text x="12" y="17" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold" fontSize="6" fill="#ec1c24">PDF</text>
  </S>
);

// ── Audio ──
const AudioIcon = () => (
  <S>
    <path d="M9 18V5l12-2v13" fill="none" stroke="#e91e63" strokeWidth="1.3" />
    <circle cx="6" cy="18" r="3" fill="none" stroke="#e91e63" strokeWidth="1.3" />
    <circle cx="18" cy="16" r="3" fill="none" stroke="#e91e63" strokeWidth="1.3" />
  </S>
);

// ── Video ──
const VideoIcon = () => (
  <S>
    <rect x="2" y="4" width="15" height="16" rx="2" fill="none" stroke="#fd6f71" strokeWidth="1.3" />
    <path d="M17 9l5-3v12l-5-3V9z" fill="#fd6f71" opacity="0.6" stroke="#fd6f71" strokeWidth="1.3" />
  </S>
);

// ── Notebook / Jupyter ──
const NotebookIcon = () => (
  <S>
    <rect x="4" y="2" width="16" height="20" rx="2" fill="none" stroke="#f37626" strokeWidth="1.3" />
    <line x1="8" y1="6" x2="16" y2="6" stroke="#f37626" strokeWidth="1" />
    <line x1="8" y1="10" x2="16" y2="10" stroke="#f37626" strokeWidth="1" />
    <line x1="8" y1="14" x2="13" y2="14" stroke="#f37626" strokeWidth="1" />
    <circle cx="16" cy="18" r="2" fill="#f37626" />
  </S>
);

// ── Webpack ──
const WebpackIcon = () => (
  <S>
    <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="none" stroke="#8dd6f9" strokeWidth="1.3" />
    <path d="M12 7l5 3v5l-5 3-5-3v-5l5-3z" fill="#8dd6f9" opacity="0.3" stroke="#8dd6f9" strokeWidth="0.8" />
  </S>
);

// ── Prettier ──
const PrettierIcon = () => (
  <S>
    <rect x="3" y="5" width="4" height="3" rx="1" fill="#56b3b4" />
    <rect x="9" y="5" width="6" height="3" rx="1" fill="#ea5e5e" />
    <rect x="3" y="10" width="8" height="3" rx="1" fill="#bf85bf" />
    <rect x="13" y="10" width="5" height="3" rx="1" fill="#56b3b4" />
    <rect x="3" y="15" width="5" height="3" rx="1" fill="#ea5e5e" />
    <rect x="10" y="15" width="8" height="3" rx="1" fill="#bf85bf" />
  </S>
);

// ── License ──
const LicenseIcon = () => (
  <S>
    <circle cx="12" cy="10" r="6" fill="none" stroke="#d4af37" strokeWidth="1.5" />
    <path d="M12 16v5M9 19h6" stroke="#d4af37" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 8.5l1.5 1.5 3-3" stroke="#d4af37" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);

// ── Default File ──
const DefaultFileIcon = () => (
  <S>
    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" fill="none" stroke="#a8b9cc" strokeWidth="1.3" />
    <path d="M14 2v6h6" fill="none" stroke="#a8b9cc" strokeWidth="1.3" />
  </S>
);

// ── Binary / Executable ──
const BinaryIcon = () => (
  <S>
    <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="#78909c" strokeWidth="1.3" />
    <text x="12" y="14" textAnchor="middle" fontFamily="monospace" fontSize="6" fill="#78909c">010</text>
    <text x="12" y="19" textAnchor="middle" fontFamily="monospace" fontSize="6" fill="#78909c">110</text>
  </S>
);

// ── TOML ──
const TomlIcon = () => (
  <S>
    <text x="12" y="10" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="5.5" fill="#9c4221">TOML</text>
    <line x1="5" y1="13" x2="19" y2="13" stroke="#9c4221" strokeWidth="0.8" />
    <line x1="5" y1="16" x2="16" y2="16" stroke="#9c4221" strokeWidth="0.8" opacity="0.6" />
    <line x1="5" y1="19" x2="13" y2="19" stroke="#9c4221" strokeWidth="0.8" opacity="0.4" />
  </S>
);

// ── Yarn ──
const YarnIcon = () => (
  <S>
    <circle cx="12" cy="12" r="10" fill="#2c8ebb" />
    <path d="M14.5 7c-.8-.3-1.8.1-2.2 1-.3.6-.2 1.2.2 1.8l-1.5 1.2c-.7-.4-1.5-.5-2.2-.2-.9.3-1.5 1.2-1.3 2.1.1.4.3.7.6 1l-1.1 2c-.5.1-.9.5-1 1 0 .7.5 1.3 1.2 1.3.5 0 1-.3 1.2-.8l2-.4c.4.3.8.4 1.3.4 1.1 0 2-.7 2.2-1.8l1.6-.2c.3.5.8.8 1.4.8.9 0 1.6-.7 1.6-1.6 0-.6-.3-1.1-.8-1.4V11c.4-.4.6-.9.5-1.5-.2-.9-1-1.6-2-1.5z" fill="#fff" />
  </S>
);

// ── CSV / Table ──
const CsvIcon = () => (
  <S>
    <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="#107c41" strokeWidth="1.3" />
    <line x1="3" y1="9" x2="21" y2="9" stroke="#107c41" strokeWidth="1" />
    <line x1="3" y1="15" x2="21" y2="15" stroke="#107c41" strokeWidth="1" />
    <line x1="9" y1="3" x2="9" y2="21" stroke="#107c41" strokeWidth="1" />
    <line x1="15" y1="3" x2="15" y2="21" stroke="#107c41" strokeWidth="1" />
  </S>
);

// ── Word / Doc ──
const WordIcon = () => (
  <S>
    <rect x="3" y="2" width="18" height="20" rx="2" fill="#185abd" opacity="0.15" />
    <rect x="3" y="2" width="18" height="20" rx="2" fill="none" stroke="#185abd" strokeWidth="1.2" />
    <text x="12" y="16" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold" fontSize="8" fill="#185abd">W</text>
  </S>
);

// ── Excel ──
const ExcelIcon = () => (
  <S>
    <rect x="3" y="2" width="18" height="20" rx="2" fill="#107c41" opacity="0.15" />
    <rect x="3" y="2" width="18" height="20" rx="2" fill="none" stroke="#107c41" strokeWidth="1.2" />
    <text x="12" y="16" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold" fontSize="8" fill="#107c41">X</text>
  </S>
);

// ── PowerPoint ──
const PptIcon = () => (
  <S>
    <rect x="3" y="2" width="18" height="20" rx="2" fill="#c43e1c" opacity="0.15" />
    <rect x="3" y="2" width="18" height="20" rx="2" fill="none" stroke="#c43e1c" strokeWidth="1.2" />
    <text x="12" y="16" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold" fontSize="8" fill="#c43e1c">P</text>
  </S>
);


// ════════════════════════════════════════════════════════════
//  MAPPING: Extension → Icon Component
// ════════════════════════════════════════════════════════════

const EXT_ICON_MAP = {
  js:     JsIcon,
  mjs:    JsIcon,
  cjs:    JsIcon,
  jsx:    ReactIcon,
  ts:     TsIcon,
  tsx:    TsxIcon,
  html:   HtmlIcon,
  htm:    HtmlIcon,
  css:    CssIcon,
  scss:   SassIcon,
  sass:   SassIcon,
  less:   SassIcon,
  svg:    SvgIcon,
  py:     PythonIcon,
  pyw:    PythonIcon,
  pyi:    PythonIcon,
  ipynb:  NotebookIcon,
  java:   JavaIcon,
  jar:    JavaIcon,
  kt:     KotlinIcon,
  scala:  () => <CIcon label="Sc" color="#dc322f" />,
  c:      () => <CIcon label="C" color="#555555" />,
  cpp:    () => <CIcon label="++" color="#f34b7d" />,
  cc:     () => <CIcon label="++" color="#f34b7d" />,
  h:      () => <CIcon label="H" color="#a8b9cc" />,
  hpp:    () => <CIcon label="H" color="#f34b7d" />,
  cs:     CSharpIcon,
  rs:     RustIcon,
  go:     GoIcon,
  rb:     RubyIcon,
  php:    PhpIcon,
  swift:  SwiftIcon,
  sh:     ShellIcon,
  bash:   ShellIcon,
  zsh:    ShellIcon,
  fish:   ShellIcon,
  bat:    ShellIcon,
  ps1:    ShellIcon,
  json:   JsonIcon,
  yaml:   YamlIcon,
  yml:    YamlIcon,
  xml:    XmlIcon,
  toml:   TomlIcon,
  ini:    () => <ConfigIcon color="#a8b9cc" />,
  env:    EnvIcon,
  cfg:    () => <ConfigIcon color="#a8b9cc" />,
  conf:   () => <ConfigIcon color="#a8b9cc" />,
  md:     MarkdownIcon,
  mdx:    MarkdownIcon,
  txt:    () => <TextIcon color="#a8b9cc" />,
  rst:    () => <TextIcon color="#a8b9cc" />,
  pdf:    PdfIcon,
  doc:    WordIcon,
  docx:   WordIcon,
  xls:    ExcelIcon,
  xlsx:   ExcelIcon,
  csv:    CsvIcon,
  ppt:    PptIcon,
  pptx:   PptIcon,
  png:    ImageIcon,
  jpg:    ImageIcon,
  jpeg:   ImageIcon,
  gif:    ImageIcon,
  webp:   ImageIcon,
  bmp:    ImageIcon,
  ico:    ImageIcon,
  mp3:    AudioIcon,
  wav:    AudioIcon,
  mp4:    VideoIcon,
  avi:    VideoIcon,
  mov:    VideoIcon,
  mkv:    VideoIcon,
  zip:    ZipIcon,
  tar:    ZipIcon,
  gz:     ZipIcon,
  rar:    ZipIcon,
  "7z":   ZipIcon,
  sql:    DatabaseIcon,
  db:     DatabaseIcon,
  sqlite: DatabaseIcon,
  dockerfile: DockerIcon,
  lock:   LockIcon,
  gitignore: GitIcon,
  exe:    BinaryIcon,
  dll:    BinaryIcon,
  so:     BinaryIcon,
  wasm:   BinaryIcon,
  pyc:    PythonIcon,
  class:  JavaIcon,
};

// Full filename → Icon
const NAME_ICON_MAP = {
  "dockerfile":            DockerIcon,
  "docker-compose.yml":    DockerIcon,
  "docker-compose.yaml":   DockerIcon,
  ".dockerignore":         DockerIcon,
  ".gitignore":            GitIcon,
  ".gitmodules":           GitIcon,
  ".gitattributes":        GitIcon,
  ".env":                  EnvIcon,
  ".env.local":            EnvIcon,
  ".env.production":       EnvIcon,
  ".env.development":      EnvIcon,
  "package.json":          NpmIcon,
  "package-lock.json":     NpmIcon,
  "yarn.lock":             YarnIcon,
  "readme.md":             MarkdownIcon,
  "license":               LicenseIcon,
  "license.md":            LicenseIcon,
  "license.txt":           LicenseIcon,
  "makefile":              () => <ConfigIcon color="#e8e8e8" />,
  "cmakelists.txt":        () => <ConfigIcon color="#064f8c" />,
  "requirements.txt":      PythonIcon,
  "setup.py":              PythonIcon,
  "tsconfig.json":         TsIcon,
  "jsconfig.json":         JsIcon,
  "vite.config.js":        ViteIcon,
  "vite.config.ts":        ViteIcon,
  "webpack.config.js":     WebpackIcon,
  "webpack.config.ts":     WebpackIcon,
  ".eslintrc.js":          EslintIcon,
  ".eslintrc.json":        EslintIcon,
  ".eslintrc.yml":         EslintIcon,
  "eslint.config.js":      EslintIcon,
  "eslint.config.mjs":     EslintIcon,
  ".prettierrc":           PrettierIcon,
  ".prettierrc.js":        PrettierIcon,
  ".prettierrc.json":      PrettierIcon,
  "prettier.config.js":    PrettierIcon,
  "tailwind.config.js":    TailwindIcon,
  "tailwind.config.ts":    TailwindIcon,
  "postcss.config.js":     PostcssIcon,
  "postcss.config.cjs":    PostcssIcon,
  ".babelrc":              () => <ConfigIcon color="#f5da55" />,
  "babel.config.js":       () => <ConfigIcon color="#f5da55" />,
};

// ════════════════════════════════════════════════════════════
//  PUBLIC API
// ════════════════════════════════════════════════════════════

/**
 * Get the React SVG icon element for a given filename.
 */
export function getFileIcon(name = "") {
  if (!name) return <DefaultFileIcon />;

  const lower = name.toLowerCase();

  // 1) Full name match (highest priority)
  if (NAME_ICON_MAP[lower]) {
    const Icon = NAME_ICON_MAP[lower];
    return <Icon />;
  }

  // 2) Extension match
  const ext = lower.split(".").pop();
  if (ext && EXT_ICON_MAP[ext]) {
    const Icon = EXT_ICON_MAP[ext];
    return <Icon />;
  }

  return <DefaultFileIcon />;
}

/**
 * Get folder icon element. Uses special colors for known folder names.
 */
export function getFolderIcon(name = "", isOpen = false) {
  const lower = (name || "").toLowerCase();
  const color = FOLDER_COLORS[lower] || "#90a4ae";
  return <FolderIcon open={isOpen} color={color} />;
}

/**
 * Get project icon
 */
export function getProjectIcon() {
  return (
    <S>
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="none" stroke="#6366f1" strokeWidth="1.5" />
      <path d="M12 22V12" stroke="#6366f1" strokeWidth="1.2" />
      <path d="M21 7l-9 5-9-5" stroke="#6366f1" strokeWidth="1.2" />
    </S>
  );
}

/**
 * Language detection for Monaco editor
 */
export function getLanguageFromExt(name = "") {
  const ext = name.split(".").pop().toLowerCase();
  const langMap = {
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    ts: "typescript", tsx: "typescript",
    py: "python", pyw: "python", pyi: "python",
    html: "html", htm: "html",
    css: "css", scss: "scss", sass: "scss", less: "less",
    json: "json",
    md: "markdown", mdx: "markdown",
    xml: "xml", svg: "xml",
    yaml: "yaml", yml: "yaml",
    sql: "sql",
    sh: "shell", bash: "shell", zsh: "shell",
    bat: "bat", ps1: "powershell",
    java: "java",
    c: "c", h: "c",
    cpp: "cpp", cc: "cpp", hpp: "cpp",
    cs: "csharp",
    rs: "rust",
    go: "go",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    r: "r",
    lua: "lua",
    perl: "perl",
    toml: "toml",
    ini: "ini",
    dockerfile: "dockerfile",
    txt: "plaintext",
    env: "plaintext",
    cfg: "plaintext",
    conf: "plaintext",
    lock: "json",
    gitignore: "plaintext",
  };

  const lower = (name || "").toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";

  return langMap[ext] || "plaintext";
}
