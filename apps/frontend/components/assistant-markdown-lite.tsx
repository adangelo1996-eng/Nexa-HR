"use client";

import type { JSX } from "react";
import type { Route } from "next";
import Link from "next/link";

const MD_LINK = /\[([^\]]+)\]\((\/[^)\s]+)\)/g;

/**
 * Solo link interni `[testo](/percorso)`: niente HTML, niente URL esterni.
 */
export function AssistantMarkdownLite({ text, className }: { text: string; className?: string }): JSX.Element {
  const nodes: JSX.Element[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(MD_LINK.source, "g");
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(
        <span key={`t-${i++}`} className="whitespace-pre-wrap">
          {text.slice(last, m.index)}
        </span>
      );
    }
    const href = m[2] as Route;
    nodes.push(
      <Link key={`l-${i++}`} href={href} className="font-medium text-[var(--prom-gold)] underline underline-offset-2">
        {m[1]}
      </Link>
    );
    last = re.lastIndex;
  }
  if (last < text.length) {
    nodes.push(
      <span key={`t-${i++}`} className="whitespace-pre-wrap">
        {text.slice(last)}
      </span>
    );
  }
  return <div className={className ?? "leading-relaxed"}>{nodes.length ? nodes : <span className="whitespace-pre-wrap">{text}</span>}</div>;
}
