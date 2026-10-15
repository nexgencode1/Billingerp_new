import { create } from "zustand";
import type { TourLanguage, TourStep } from "@/constants/tour-steps";

const SEEN_KEY = "billing_erp_tour_seen";
const LANGUAGE_KEY = "billing_erp_tour_language";

function readLanguage(): TourLanguage {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

interface TourState {
  menuOpen: boolean;
  active: boolean;
  language: TourLanguage;
  tourId: string | null;
  steps: TourStep[];
  stepIndex: number;
  /** Opens the tour picker (Help button / first visit). */
  start: () => void;
  setLanguage: (language: TourLanguage) => void;
  /** Starts a specific tour with steps already filtered for the user's role. */
  launch: (tourId: string, steps: TourStep[]) => void;
  next: () => void;
  prev: () => void;
  end: () => void;
}

export const useTourStore = create<TourState>((set, get) => ({
  menuOpen: false,
  active: false,
  language: "en",
  tourId: null,
  steps: [],
  stepIndex: 0,
  start: () => set({ menuOpen: true, active: false, stepIndex: 0, language: readLanguage() }),
  setLanguage: (language) => {
    set({ language });
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // non-critical
    }
  },
  launch: (tourId, steps) => set({ menuOpen: false, active: steps.length > 0, tourId, steps, stepIndex: 0 }),
  next: () => {
    const { stepIndex, steps } = get();
    if (stepIndex >= steps.length - 1) {
      get().end();
      return;
    }
    set({ stepIndex: stepIndex + 1 });
  },
  prev: () => set((s) => ({ stepIndex: Math.max(0, s.stepIndex - 1) })),
  end: () => {
    set({ active: false, menuOpen: false, stepIndex: 0, steps: [], tourId: null });
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // localStorage unavailable (private mode, etc.) — non-critical, just skip persisting.
    }
  },
}));

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}
