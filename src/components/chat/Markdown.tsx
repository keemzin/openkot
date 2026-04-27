import React from 'react';
import { marked } from 'marked';
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-diff';

export function Markdown({ text }: { text: string }) {
  const html = React.useMemo(() => {
    try { return marked.parse(text) as string; } catch { return text; }
  }, [text]);

  const containerRef = React.useRef<HTMLDivElement>(null);

  // Add copy buttons to code blocks and apply Prism syntax highlighting
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const codeBlocks = container.querySelectorAll('pre > code');
    
    codeBlocks.forEach((codeEl) => {
      const preEl = codeEl.parentElement;
      if (!preEl || preEl.classList.contains('md-code-wrapped')) return; // Already processed

      const codeText = codeEl.textContent || '';
      
      // Get language from class (e.g., "language-typescript")
      const langMatch = codeEl.className.match(/language-(\w+)/);
      const language = langMatch ? langMatch[1] : 'text';

      // Apply Prism syntax highlighting
      const prismLang = language === 'text' ? 'plain' : language;
      const grammar = Prism.languages[prismLang];
      if (grammar) {
        const highlighted = Prism.highlight(codeText, grammar, prismLang);
        codeEl.innerHTML = highlighted;
        codeEl.classList.add('prism-code');
      }

      // Mark as processed
      preEl.classList.add('md-code-wrapped');

      // Create wrapper for pre element
      const wrapper = document.createElement('div');
      wrapper.className = 'md-code-block-wrapper';
      wrapper.style.cssText = 'position: relative; margin: 16px 0; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-2); background: var(--bg-3);';
      
      // Create header with language and copy button
      const header = document.createElement('div');
      header.className = 'md-code-header';
      header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid var(--border-2); background: var(--bg-2);';
      
      const langLabel = document.createElement('span');
      langLabel.textContent = language;
      langLabel.style.cssText = 'font-family: var(--font-mono, monospace); font-size: 11px; color: var(--text-4); text-transform: lowercase;';
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'md-copy-btn';
      copyBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      `;
      copyBtn.style.cssText = 'display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: transparent; border: 1px solid transparent; border-radius: 4px; color: var(--text-4); cursor: pointer; font-size: 11px; transition: all 0.15s;';
      copyBtn.title = 'Copy code';
      
      copyBtn.addEventListener('mouseenter', () => {
        copyBtn.style.background = 'var(--bg-4)';
        copyBtn.style.borderColor = 'var(--border)';
        copyBtn.style.color = 'var(--text-2)';
      });
      
      copyBtn.addEventListener('mouseleave', () => {
        copyBtn.style.background = 'transparent';
        copyBtn.style.borderColor = 'transparent';
        copyBtn.style.color = 'var(--text-4)';
      });
      
      copyBtn.addEventListener('click', async () => {
        try {
          // Try modern clipboard API first
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(codeText);
          } else {
            // Fallback for mobile/older browsers
            const textArea = document.createElement('textarea');
            textArea.value = codeText;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
              document.execCommand('copy');
            } finally {
              document.body.removeChild(textArea);
            }
          }
          
          copyBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          `;
          copyBtn.style.color = 'var(--green)';
          copyBtn.style.borderColor = 'var(--green)';
          
          setTimeout(() => {
            copyBtn.innerHTML = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            `;
            copyBtn.style.color = 'var(--text-4)';
            copyBtn.style.borderColor = 'transparent';
          }, 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
          // Show error feedback
          copyBtn.style.color = 'var(--red)';
          setTimeout(() => {
            copyBtn.style.color = 'var(--text-4)';
          }, 2000);
        }
      });
      
      header.appendChild(langLabel);
      header.appendChild(copyBtn);
      
      // Insert wrapper before pre element
      const parent = preEl.parentNode;
      if (parent) {
        parent.insertBefore(wrapper, preEl);
        // Move pre into wrapper (this preserves the element and its content)
        wrapper.appendChild(header);
        wrapper.appendChild(preEl);
      }
      
      // Style the pre element to fit in wrapper
      preEl.style.margin = '0';
      preEl.style.padding = '12px';
      preEl.style.background = 'var(--bg-3)';
      preEl.style.overflow = 'auto';
      preEl.style.border = 'none';
      preEl.style.borderRadius = '0';
    });
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="md"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}