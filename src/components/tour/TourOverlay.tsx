"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Compass, X } from "lucide-react";
import { useTourStore } from "@/lib/tour-store";
import { FULL_TOUR, MODULE_TOUR_LIST, buildTour, suggestedTourFor } from "@/constants/tours";
import { usePermissionMap } from "@/lib/permissions-context";
import { Button } from "@/components/common/Button";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;

function TourMenu() {
  const { language, setLanguage, launch, end } = useTourStore();
  const permissions = usePermissionMap();
  const pathname = usePathname();
  const can = (module: string) => Boolean(permissions[module]?.includes("VIEW"));

  const suggested = suggestedTourFor(pathname);
  const tours = [FULL_TOUR, ...MODULE_TOUR_LIST]
    .map((t) => ({ ...t, steps: buildTour(t.id, language, can) }))
    .filter((t) => t.steps.length > 0)
    .sort((a, b) => (a.id === suggested ? -1 : b.id === suggested ? 1 : 0));

  return (
    <div className="fixed inset-0 z-[200]">
      <div className="fixed inset-0 bg-black/60" onClick={end} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-menu-title"
        className="fixed left-1/2 top-1/2 flex max-h-[85vh] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-4">
          <div>
            <h3 id="tour-menu-title" className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Compass className="h-4 w-4 text-blue-600" />
              {language === "hi" ? "गाइडेड टूर चुनें" : "Take a guided tour"}
            </h3>
            <p className="text-xs text-slate-500">
              {language === "hi" ? "हर टूर आपको सही पेज पर ले जाकर समझाएगा।" : "Each tour walks you through the real screens."}
            </p>
          </div>
          <button onClick={end} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-3" role="radiogroup" aria-label="Language">
          {(["en", "hi"] as const).map((l) => (
            <button
              key={l}
              role="radio"
              aria-checked={language === l}
              onClick={() => setLanguage(l)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${language === l ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {l === "en" ? "English" : "हिंदी"}
            </button>
          ))}
        </div>

        <ul className="flex flex-col gap-1.5 overflow-y-auto p-4">
          {tours.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => launch(t.id, t.steps)}
                className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition hover:border-blue-400 hover:bg-blue-50 ${
                  t.id === suggested ? "border-blue-300 bg-blue-50/60" : "border-slate-200"
                }`}
              >
                <span>
                  <span className="block text-sm font-semibold text-slate-800">
                    {t.title[language]}
                    {t.id === suggested && (
                      <span className="ml-2 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {language === "hi" ? "इस पेज के लिए" : "This page"}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-slate-500">{t.description[language]}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {t.steps.length} {language === "hi" ? "स्टेप" : "steps"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function TourOverlay() {
  const { menuOpen, active, steps, stepIndex, next, prev, end } = useTourStore();
  const [rect, setRect] = useState<Rect | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const step = steps[stepIndex];

  // Navigate to whatever page this step needs, whenever the step (or arrival) changes.
  useEffect(() => {
    if (!active || !step?.page) return;
    if (step.page !== pathname) {
      router.push(step.page);
    }
  }, [active, step, pathname, router]);

  // Measure (and keep re-measuring) the target element — it may not exist yet
  // right after a page navigation, so retry briefly instead of giving up at once.
  useEffect(() => {
    if (!active || !step?.target) {
      setRect(null);
      return;
    }

    let cancelled = false;
    let attempts = 0;

    function tryMeasure() {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${step!.target}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else if (attempts < 30) {
        attempts++;
        setTimeout(tryMeasure, 100);
      } else {
        setRect(null);
      }
    }

    tryMeasure();
    const settleTimeout = setTimeout(tryMeasure, 500); // re-measure after smooth-scroll settles

    function onWindowChange() {
      tryMeasure();
    }
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);

    return () => {
      cancelled = true;
      clearTimeout(settleTimeout);
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
    };
  }, [active, step, stepIndex, pathname]);

  if (menuOpen) return <TourMenu />;
  if (!active || !step) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  let tooltipStyle: React.CSSProperties = {
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  };

  if (rect) {
    const placement = step.placement ?? "bottom";
    if (placement === "bottom") {
      tooltipStyle = { top: rect.top + rect.height + 16, left: Math.min(Math.max(rect.left, 16), vw - 336) };
    } else if (placement === "top") {
      tooltipStyle = { top: Math.max(rect.top - 16, 16), left: Math.min(Math.max(rect.left, 16), vw - 336), transform: "translateY(-100%)" };
    } else if (placement === "right") {
      tooltipStyle = { top: Math.min(Math.max(rect.top, 16), vh - 220), left: rect.left + rect.width + 16 };
    } else {
      tooltipStyle = { top: Math.min(Math.max(rect.top, 16), vh - 220), left: Math.max(rect.left - 336 - 16, 16) };
    }
  }

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[200]">
      {rect ? (
        <>
          <div
            className="fixed bg-black/60 transition-all duration-200"
            style={{ top: 0, left: 0, width: "100%", height: Math.max(0, rect.top - PADDING) }}
          />
          <div
            className="fixed bg-black/60 transition-all duration-200"
            style={{
              top: rect.top + rect.height + PADDING,
              left: 0,
              width: "100%",
              height: Math.max(0, vh - (rect.top + rect.height + PADDING)),
            }}
          />
          <div
            className="fixed bg-black/60 transition-all duration-200"
            style={{ top: rect.top - PADDING, left: 0, width: Math.max(0, rect.left - PADDING), height: rect.height + PADDING * 2 }}
          />
          <div
            className="fixed bg-black/60 transition-all duration-200"
            style={{
              top: rect.top - PADDING,
              left: rect.left + rect.width + PADDING,
              width: Math.max(0, vw - (rect.left + rect.width + PADDING)),
              height: rect.height + PADDING * 2,
            }}
          />
          <div
            className="pointer-events-none fixed rounded-md ring-2 ring-blue-500 transition-all duration-200"
            style={{ top: rect.top - PADDING, left: rect.left - PADDING, width: rect.width + PADDING * 2, height: rect.height + PADDING * 2 }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/60" />
      )}

      <div className="fixed w-80 rounded-lg bg-white p-4 shadow-xl" style={tooltipStyle}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">{step.title}</h3>
          <button onClick={end} className="text-slate-400 hover:text-slate-600" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-slate-600">{step.description}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {stepIndex + 1} / {steps.length}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={end}>
              End Tour
            </Button>
            <Button variant="outline" size="sm" onClick={prev} disabled={isFirst}>
              Back
            </Button>
            <Button size="sm" onClick={next}>
              {isLast ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
