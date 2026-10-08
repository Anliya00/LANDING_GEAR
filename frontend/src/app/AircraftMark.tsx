export function AircraftMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 121 206"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g transform="translate(-15.125 0) scale(1.4 1)"></g>
      {/* =====================================================
          AIRCRAFT OUTER BODY
          ===================================================== */}

      {/* Nose + left fuselage */}
      <path
        d="
          M60.5 3
          C57.8 9 55.8 15 55.2 23
          L53.8 48
          C53.4 55 51.5 61 49.5 67
          L36 79
          L15 96
          L14 112
          L52 108
          L52 144
          L27 169
          L27 183
          L51 174
          L55 193
          L60.5 203
        "
      />

      {/* Right side — exact mirror */}
      <path
        d="
          M60.5 3
          C63.2 9 65.2 15 65.8 23
          L67.2 48
          C67.6 55 69.5 61 71.5 67
          L85 79
          L106 96
          L107 112
          L69 108
          L69 144
          L94 169
          L94 183
          L70 174
          L66 193
          L60.5 203
        "
      />

      {/* =====================================================
          MAIN FUSELAGE
          ===================================================== */}

      <path
        d="
          M60.5 3
          C57.8 11 56.5 20 56.5 30
          L56.5 69
          L56.5 143
          L55.5 173
          L60.5 203
          L65.5 173
          L64.5 143
          L64.5 69
          L64.5 30
          C64.5 20 63.2 11 60.5 3
        "
      />

      {/* =====================================================
          COCKPIT / CANOPY
          ===================================================== */}

      {/* Outer canopy */}
      <path
        d="
          M60.5 13
          C56.9 19 55.6 27 55.9 35
          C56.1 42 58 47 60.5 51
          C63 47 64.9 42 65.1 35
          C65.4 27 64.1 19 60.5 13
        "
        strokeWidth="0.85"
      />

      {/* Canopy inner outline */}
      <path
        d="
          M60.5 18
          C58.1 22 57.4 27 57.5 33
          C57.6 39 58.8 43 60.5 46
          C62.2 43 63.4 39 63.5 33
          C63.6 27 62.9 22 60.5 18
        "
        strokeWidth="0.7"
      />

      {/* Canopy center */}
      <path
        d="M60.5 19 L60.5 48"
        strokeWidth="0.55"
      />

      {/* Canopy separation */}
      <path
        d="M57.3 32 C59 30.5 62 30.5 63.7 32"
        strokeWidth="0.6"
      />

      {/* =====================================================
          FUSELAGE INTERNAL LINES
          ===================================================== */}

      <path
        d="
          M55.2 53
          C57 57 58.5 60 60.5 63
          C62.5 60 64 57 65.8 53
        "
        strokeWidth="0.65"
      />

      {/* Long central body lines */}
      <path
        d="M55.5 64 L55.5 143"
        strokeWidth="0.65"
      />

      <path
        d="M65.5 64 L65.5 143"
        strokeWidth="0.65"
      />

      {/* Central lower line */}
      <path
        d="M60.5 64 L60.5 202"
        strokeWidth="0.55"
      />

      {/* =====================================================
          MAIN WINGS
          ===================================================== */}

      {/* Left leading edge */}
      <path
        d="
          M52 64
          L35 79
          L15 96
        "
        strokeWidth="0.9"
      />

      {/* Right leading edge */}
      <path
        d="
          M69 64
          L86 79
          L106 96
        "
        strokeWidth="0.9"
      />

      {/* Left wing trailing edge */}
      <path
        d="
          M15 96
          L14 112
          L52 108
        "
        strokeWidth="0.9"
      />

      {/* Right wing trailing edge */}
      <path
        d="
          M106 96
          L107 112
          L69 108
        "
        strokeWidth="0.9"
      />

      {/* Wing root lines */}
      <path
        d="M52 68 L52 108"
        strokeWidth="0.7"
      />

      <path
        d="M69 68 L69 108"
        strokeWidth="0.7"
      />

      {/* =====================================================
          MAIN WING PANELS / CONTROL SURFACES
          ===================================================== */}

      {/* Left */}
      <path
        d="M36 79 L36 108"
        strokeWidth="0.65"
      />

      <path
        d="M30 85 L30 110"
        strokeWidth="0.65"
      />

      <path
        d="M20 94 L20 111"
        strokeWidth="0.6"
      />

      <path
        d="M15 105 L52 105"
        strokeWidth="0.65"
      />

      {/* Right */}
      <path
        d="M85 79 L85 108"
        strokeWidth="0.65"
      />

      <path
        d="M91 85 L91 110"
        strokeWidth="0.65"
      />

      <path
        d="M101 94 L101 111"
        strokeWidth="0.6"
      />

      <path
        d="M106 105 L69 105"
        strokeWidth="0.65"
      />

      {/* =====================================================
          WING ROOT / SMALL VERTICAL DETAILS
          ===================================================== */}

      <path
        d="M42 76 L42 108"
        strokeWidth="0.55"
      />

      <path
        d="M79 76 L79 108"
        strokeWidth="0.55"
      />

      {/* Small vertical structures above wing */}
      <path
        d="
          M39 77
          L39 72
          C39 70 40 69 41 69
          C42 69 43 70 43 72
          L43 76
        "
        strokeWidth="0.7"
      />

      <path
        d="
          M78 76
          L78 72
          C78 70 79 69 80 69
          C81 69 82 70 82 72
          L82 77
        "
        strokeWidth="0.7"
      />

      {/* =====================================================
          SMALL WING DETAILS
          ===================================================== */}

      <path
        d="M18 99 L25 99"
        strokeWidth="0.55"
      />

      <path
        d="M103 99 L96 99"
        strokeWidth="0.55"
      />

      <path
        d="M21 108 L21 102"
        strokeWidth="0.55"
      />

      <path
        d="M100 108 L100 102"
        strokeWidth="0.55"
      />

      {/* =====================================================
          REAR FINS / TAIL PLANES
          ===================================================== */}

      {/* Left tail plane */}
      <path
        d="
          M52 143
          L43 153
          L27 169
          L27 183
          L51 174
        "
        strokeWidth="0.9"
      />

      {/* Right tail plane */}
      <path
        d="
          M69 143
          L78 153
          L94 169
          L94 183
          L70 174
        "
        strokeWidth="0.9"
      />

      {/* Tail panel lines */}
      <path
        d="M30 169 L51 166"
        strokeWidth="0.65"
      />

      <path
        d="M91 169 L70 166"
        strokeWidth="0.65"
      />

      <path
        d="M28 178 L51 171"
        strokeWidth="0.65"
      />

      <path
        d="M93 178 L70 171"
        strokeWidth="0.65"
      />

      {/* =====================================================
          REAR ENGINE / NACELLES
          ===================================================== */}

      {/* Left nacelle */}
      <path
        d="
          M52 126
          C48 136 45 149 45 163
          L45 179
          C45 185 48 190 51 191
          L55 174
          L55 143
        "
        strokeWidth="0.8"
      />

      {/* Right nacelle */}
      <path
        d="
          M69 126
          C73 136 76 149 76 163
          L76 179
          C76 185 73 190 70 191
          L66 174
          L66 143
        "
        strokeWidth="0.8"
      />

      {/* Nacelle inner lines */}
      <path
        d="M49 145 L49 177"
        strokeWidth="0.55"
      />

      <path
        d="M72 145 L72 177"
        strokeWidth="0.55"
      />

      {/* =====================================================
          REAR FUSELAGE / EXHAUST
          ===================================================== */}

      <path
        d="
          M55.5 143
          C56 154 56.5 164 57.5 174
          L60.5 203
        "
        strokeWidth="0.75"
      />

      <path
        d="
          M65.5 143
          C65 154 64.5 164 63.5 174
          L60.5 203
        "
        strokeWidth="0.75"
      />

      {/* Exhaust/nozzle details */}
      <path
        d="M57.5 174 C58 179 59 183 60.5 187"
        strokeWidth="0.6"
      />

      <path
        d="M63.5 174 C63 179 62 183 60.5 187"
        strokeWidth="0.6"
      />

      {/* Bottom centre */}
      <path
        d="M60.5 187 L60.5 202"
        strokeWidth="0.55"
      />
    </svg>
  );
}