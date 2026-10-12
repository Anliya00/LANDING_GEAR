/**
 * Sidebar aircraft mark: a top-down fighter blueprint drawn as inline SVG.
 *
 * Strokes use `currentColor`, so the colour comes from the CSS `color` of the
 * container (`.sidebar-art` sets it from `--art-stroke`) and follows the theme.
 * The export name and props are unchanged, so Sidebar.tsx needs no edit.
 */
export function AircraftMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 420"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      fill="none"
    >
      <g
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      >
        {/* Faint engineering centreline */}
        <path d="M120 12 V408" strokeDasharray="4 6" opacity=".42" />

        {/* Horizontal stabilisers / tailplane */}
        <path d="M105 292 L65 321 L75 343 L112 329" />
        <path d="M135 292 L175 321 L165 343 L128 329" />
        <path d="M65 321 L46 334 L52 351 L75 343" opacity=".75" />
        <path d="M175 321 L194 334 L188 351 L165 343" opacity=".75" />

        {/* Main swept wings */}
        <path d="M105 148 L29 226 L18 287 L49 300 L102 258" />
        <path d="M135 148 L211 226 L222 287 L191 300 L138 258" />
        <path d="M29 226 L9 245 L18 287" opacity=".75" />
        <path d="M211 226 L231 245 L222 287" opacity=".75" />
        <path d="M49 300 L84 283 L105 258" />
        <path d="M191 300 L156 283 L135 258" />

        {/* Wing panel lines */}
        <path d="M82 174 L55 231 L49 276" opacity=".72" />
        <path d="M158 174 L185 231 L191 276" opacity=".72" />
        <path d="M63 224 L94 205" opacity=".72" />
        <path d="M177 224 L146 205" opacity=".72" />
        <path d="M42 260 L72 266" opacity=".65" />
        <path d="M198 260 L168 266" opacity=".65" />

        {/* Canards */}
        <path d="M101 91 L71 111 L82 128 L105 117" />
        <path d="M139 91 L169 111 L158 128 L135 117" />
        <path d="M71 111 L64 122 L82 128" opacity=".72" />
        <path d="M169 111 L176 122 L158 128" opacity=".72" />

        {/* Main fuselage silhouette */}
        <path
          d="M120 17
            C114 25 111 39 109 55
            L103 83
            L98 116
            L101 145
            L94 179
            L91 218
            L96 258
            L103 293
            L108 327
            L112 365
            L116 394
            Q120 405 124 394
            L128 365
            L132 327
            L137 293
            L144 258
            L149 218
            L146 179
            L139 145
            L142 116
            L137 83
            L131 55
            C129 39 126 25 120 17 Z"
        />

        {/* Nose and cockpit */}
        <path d="M120 17 L116 37 L120 49 L124 37 Z" />
        <path d="M111 54 Q120 43 129 54 L132 77 Q120 89 108 77 Z" />
        <path d="M114 57 Q120 52 126 57 L128 74 Q120 81 112 74 Z" opacity=".78" />
        <path d="M108 84 Q120 93 132 84" opacity=".8" />

        {/* Fuselage access / structural panel lines */}
        <path d="M105 121 Q120 130 135 121" opacity=".8" />
        <path d="M103 145 Q120 155 137 145" opacity=".8" />
        <path d="M100 180 Q120 190 140 180" opacity=".8" />
        <path d="M99 218 Q120 226 141 218" opacity=".8" />
        <path d="M103 258 Q120 266 137 258" opacity=".8" />
        <path d="M108 295 Q120 301 132 295" opacity=".8" />
        <path d="M112 330 Q120 334 128 330" opacity=".8" />

        {/* Engine housings */}
        <path d="M101 161 Q88 170 89 194 L94 231 Q99 239 104 229 L108 190 Q108 172 101 161 Z" />
        <path d="M139 161 Q152 170 151 194 L146 231 Q141 239 136 229 L132 190 Q132 172 139 161 Z" />
        <path d="M97 178 L100 222" opacity=".75" />
        <path d="M143 178 L140 222" opacity=".75" />

        {/* Intake and engine detail */}
        <path d="M105 166 L113 178 L110 205 L103 216" opacity=".8" />
        <path d="M135 166 L127 178 L130 205 L137 216" opacity=".8" />
        <ellipse cx="101" cy="244" rx="5" ry="10" />
        <ellipse cx="139" cy="244" rx="5" ry="10" />
        <path d="M97 244 H105 M135 244 H143" opacity=".75" />

        {/* Landing gear outlines */}
        <path d="M112 273 L105 286 L108 302 L115 306 L118 291" />
        <path d="M128 273 L135 286 L132 302 L125 306 L122 291" />
        <path d="M108 302 L103 311 L108 317 L115 311" />
        <path d="M132 302 L137 311 L132 317 L125 311" />
        <rect x="113" y="286" width="5" height="17" rx="2" />
        <rect x="122" y="286" width="5" height="17" rx="2" />

        {/* Main landing gear bays */}
        <path d="M88 270 L82 283 L87 294 L96 289" />
        <path d="M152 270 L158 283 L153 294 L144 289" />
        <path d="M86 282 L93 286 M154 282 L147 286" opacity=".75" />

        {/* Tail / exhaust region */}
        <path d="M108 351 L113 370 L120 379 L127 370 L132 351" />
        <path d="M113 370 L120 366 L127 370" opacity=".75" />
        <path d="M115 383 L120 397 L125 383" />
        <path d="M117 401 L120 406 L123 401" opacity=".75" />

        {/* Small wingtip details */}
        <path d="M25 244 L38 249 M215 244 L202 249" opacity=".75" />
        <path d="M31 278 L45 283 M209 278 L195 283" opacity=".75" />

        {/* Technical callout marks, kept subtle */}
        <path d="M28 205 H48 L58 195" strokeDasharray="2 3" opacity=".55" />
        <path d="M192 205 H212 L222 195" strokeDasharray="2 3" opacity=".55" />
        <circle cx="58" cy="195" r="2" opacity=".7" />
        <circle cx="222" cy="195" r="2" opacity=".7" />
      </g>
    </svg>
  );
}
