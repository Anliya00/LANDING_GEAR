/**
 * Main landing gear leg, drawn as an engineering elevation.
 *
 * This is the subject of the application drawn in the vocabulary its users
 * draw in: single-weight strokes, a measurement grid, retraction arc, and
 * callouts naming the two micro-switches whose transitions every cycle-time
 * parameter in SFTAD is derived from. It is a diagram, not an illustration.
 */
export function GearSchematic({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 520 640"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern id="gridFine" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" stroke="currentColor" strokeWidth="0.5" opacity="0.1" />
        </pattern>
        <pattern id="gridCoarse" width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M100 0H0V100" stroke="currentColor" strokeWidth="0.7" opacity="0.18" />
        </pattern>
      </defs>

      <rect width="520" height="640" fill="url(#gridFine)" />
      <rect width="520" height="640" fill="url(#gridCoarse)" />

      {/* Retraction arc — the path the leg sweeps, dashed as a motion locus */}
      <path
        d="M300 150 A 170 170 0 0 0 150 320"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="5 7"
        opacity="0.4"
      />
      <path
        d="M156 309 L150 320 L162 322"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.5"
      />

      {/* Trunnion / pivot */}
      <circle cx="300" cy="150" r="13" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="300" cy="150" r="3.4" fill="currentColor" opacity="0.75" />
      <path
        d="M272 150h-30M328 150h30M300 122V96"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeDasharray="8 5"
        opacity="0.45"
      />

      {/* Airframe attachment */}
      <path
        d="M196 118h208"
        stroke="currentColor"
        strokeWidth="1.8"
        opacity="0.8"
      />
      <path
        d="M200 118l-12-14M228 118l-12-14M256 118l-12-14M284 118l-12-14M312 118l-12-14M340 118l-12-14M368 118l-12-14M396 118l-12-14"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.45"
      />

      {/* Main fitting — upper cylinder */}
      <path
        d="M284 163h32v126h-32z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M300 163v126" stroke="currentColor" strokeWidth="0.6" opacity="0.3" />

      {/* Oleo sliding tube */}
      <path
        d="M290 289h20v128h-20z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M284 289h32"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.7"
      />

      {/* Torque link, upper and lower */}
      <path
        d="M316 206 L352 262 L316 318"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="352" cy="262" r="5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="316" cy="206" r="3.6" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="316" cy="318" r="3.6" stroke="currentColor" strokeWidth="1.1" />

      {/* Side stay / drag brace, folding */}
      <path
        d="M284 196 L196 268 L212 352"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="196" cy="268" r="5.4" stroke="currentColor" strokeWidth="1.2" />

      {/* Down-lock micro-switch, on the stay */}
      <rect
        x="178"
        y="292"
        width="22"
        height="14"
        stroke="currentColor"
        strokeWidth="1.2"
        rx="1.5"
      />
      <path d="M178 299h-34" stroke="currentColor" strokeWidth="0.9" />
      <circle cx="140" cy="299" r="2.6" fill="currentColor" opacity="0.8" />

      {/* Up-lock micro-switch, near the trunnion */}
      <rect
        x="330"
        y="136"
        width="22"
        height="14"
        stroke="currentColor"
        strokeWidth="1.2"
        rx="1.5"
      />
      <path d="M352 143h34" stroke="currentColor" strokeWidth="0.9" />
      <circle cx="386" cy="143" r="2.6" fill="currentColor" opacity="0.8" />

      {/* Axle and bogie beam */}
      <path d="M248 426h104" stroke="currentColor" strokeWidth="1.8" />
      <path d="M300 417v9" stroke="currentColor" strokeWidth="1.4" />

      {/* Wheels — twin, in elevation */}
      <circle cx="248" cy="480" r="54" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="248" cy="480" r="26" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
      <circle cx="248" cy="480" r="7" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <circle cx="352" cy="480" r="54" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="352" cy="480" r="26" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
      <circle cx="352" cy="480" r="7" stroke="currentColor" strokeWidth="1" opacity="0.5" />

      {/* Ground line with runway hatching */}
      <path d="M72 534h376" stroke="currentColor" strokeWidth="1.6" opacity="0.85" />
      <path
        d="M80 548l12-14M108 548l12-14M136 548l12-14M164 548l12-14M192 548l12-14M220 548l12-14M248 548l12-14M276 548l12-14M304 548l12-14M332 548l12-14M360 548l12-14M388 548l12-14M416 548l12-14"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.35"
      />

      {/* Extended stroke dimension, left */}
      <path d="M104 289v128" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <path
        d="M99 294l5-5 5 5M99 412l5 5 5-5"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.5"
      />
      <path d="M104 289h180M104 417h144" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 5" opacity="0.3" />
    </svg>
  );
}
