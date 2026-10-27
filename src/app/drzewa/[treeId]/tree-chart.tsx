"use client";

import "family-chart/styles/family-chart.css";
import { createChart, type Chart } from "family-chart";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ChartDatum } from "@/lib/genealogy/chart";

/** Tekst do wstawienia w HTML karty – bez tego imię „<script>” wykonałoby kod. */
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type CardDatum = { data: { id: string; data: ChartDatum["data"]; main?: boolean } };

function proposalWord(n: number) {
  if (n === 1) return "propozycja";
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && !(t >= 12 && t <= 14) ? "propozycje" : "propozycji";
}

function cardHtml(d: CardDatum) {
  const { name, lifespan, gender, pending } = d.data.data;
  const sexClass = gender === "M" ? "kz-card-m" : gender === "F" ? "kz-card-f" : "kz-card-u";
  return `<div class="kz-card ${sexClass}${d.data.main ? " kz-card-main" : ""}">
    <div class="kz-card-name">${escapeHtml(name)}</div>
    <div class="kz-card-years">${escapeHtml(lifespan || "\u00a0")}</div>
    ${pending ? `<div class="kz-card-badge" title="Nowe propozycje w Odkryciach">● ${pending} ${proposalWord(pending)}</div>` : ""}
  </div>`;
}

export function TreeChart({ treeId, data, mainId }: { treeId: string; data: ChartDatum[]; mainId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(mainId);
  const selected = data.find((d) => d.id === selectedId) ?? data[0];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";
    // family-chart oczekuje płci „M”/„F”; nieznaną obsługuje jako kartę neutralną.
    const chart = createChart(el, structuredClone(data) as never)
      .setTransitionTime(600)
      .setCardXSpacing(230)
      .setCardYSpacing(130)
      .setSingleParentEmptyCard(false)
      .setShowSiblingsOfMain(true);
    const card = chart.setCardHtml();
    card
      .setCardDim({ w: 200, h: 64 })
      .setCardInnerHtmlCreator((d) => cardHtml(d as unknown as CardDatum))
      .setOnCardClick((_e: MouseEvent, d: CardDatum) => {
        const id = d.data.id;
        if (chartRef.current?.getMainDatum().id === id) {
          router.push(`/drzewa/${treeId}/osoby/${id}`);
          return;
        }
        setSelectedId(id);
        chart.updateMainId(id);
        chart.updateTree({});
      });
    chart.updateMainId(mainId);
    chart.updateTree({ initial: true });
    chartRef.current = chart;
    return () => {
      chartRef.current = null;
      el.innerHTML = "";
    };
  }, [data, mainId, router, treeId]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Kliknij osobę, aby ustawić ją w środku. Kliknij ponownie, aby otworzyć jej kartę. Przybliżaj kółkiem myszy lub dwoma palcami.
        </p>
        {selected && (
          <Link href={`/drzewa/${treeId}/osoby/${selected.id}`} className="btn-secondary">
            Karta: {selected.data.name}
          </Link>
        )}
      </div>
      <div
        ref={containerRef}
        className="f3 kz-chart h-[65vh] min-h-[420px] w-full overflow-hidden rounded-lg border border-line bg-paper-sunken"
        role="img"
        aria-label="Wykres drzewa rodzinnego. Te same osoby znajdziesz w zakładce Osoby."
      />
    </div>
  );
}
