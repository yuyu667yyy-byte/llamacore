/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

/// <reference types="vite/client" />
/// <reference types="electron" />

// Extend JSX to support <webview> tag in Electron
declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string
        partition?: string
        preload?: string
        allowpopups?: boolean | string
        nodeintegration?: boolean | string
        onLoad?: React.EventHandler<React.SyntheticEvent<HTMLElement>>
        style?: React.CSSProperties
        className?: string
      },
      HTMLElement
    >
  }
}
