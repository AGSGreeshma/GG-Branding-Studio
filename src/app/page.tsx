import { StageSelector } from "@/components/stage-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import { HOW_IT_WORKS } from "@/lib/stages";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip">
      {/* Soft vermilion glow behind the hero. Decorative only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[56rem] max-w-[160vw] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl dark:bg-brand/15"
      />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-lg bg-primary font-display text-lg text-primary-foreground"
          >
            GG
          </span>
          <span className="text-sm font-medium tracking-tight">Branding Studio</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-8">
        <section aria-labelledby="hero-title" className="pt-10 pb-14 sm:pt-20 sm:pb-20">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden />
            GG Branding Studio
          </p>
          <h1
            id="hero-title"
            className="max-w-4xl font-display text-[2.9rem] leading-[1.02] tracking-tight text-balance sm:text-7xl lg:text-8xl"
          >
            Build a brand that can <em className="text-brand">think.</em>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground text-pretty sm:text-lg">
            Start wherever you are. Tell us what you have. We&apos;ll figure out what your brand
            needs next.
          </p>
        </section>

        <section aria-labelledby="stage-title" className="pb-16 sm:pb-24">
          <div className="mb-6 flex flex-col gap-1 sm:mb-8">
            <h2 id="stage-title" className="font-display text-3xl tracking-tight sm:text-4xl">
              Where are you with your brand?
            </h2>
            <p className="text-sm text-muted-foreground">
              Your answer is a starting point, not a fixed path. The AI plans the workflow from here.
            </p>
          </div>
          <StageSelector />
        </section>

        <section aria-labelledby="how-title" className="border-t border-border py-12 sm:py-16">
          <h2
            id="how-title"
            className="mb-6 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase"
          >
            How it works
          </h2>
          <ol className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step} className="flex items-baseline gap-3">
                <span className="font-display text-2xl text-brand tabular-nums" aria-hidden>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm leading-snug">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="relative mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-muted-foreground sm:px-8">
        AI recommends. You decide.
      </footer>
    </div>
  );
}
