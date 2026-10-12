/**
 * Sidebar aircraft mark, traced from the login-page artwork.
 *
 * The drawing is symmetric about the centreline (x = 313.5), so the left half
 * is written once and mirrored for the right. The engine bulge and panel line
 * beside the fuselage differ left to right in the artwork, so those are kept
 * per side.
 *
 * The viewBox is cropped to the aircraft (aspect 0.554, matching the artwork).
 * Strokes use `currentColor`; the colour comes from the CSS `color` of the
 * container (`.sidebar-art` sets it from `--art-stroke`). The export name and
 * props are unchanged, so Sidebar.tsx needs no edit.
 */
export function AircraftMark({ className }: { className?: string }) {
  const half = (
    <>
      <path d="M313.5 45 L309 51 L292 106 L291 122 L283 151 L287 164 L288 196" strokeWidth="6.4" />
      <path d="M292 122 Q303 119 313.5 119" strokeWidth="5" opacity="0.9" />
      <path d="M289 164 L306 143 L313.5 140" strokeWidth="5.4" opacity="0.95" />
      <path d="M288 196 L313.5 195" strokeWidth="5" opacity="0.9" />
      <path d="M288 206 L300 213 L313.5 207" strokeWidth="5" opacity="0.9" />
      <path d="M279 219 L287 206" strokeWidth="5" opacity="0.9" />
      <path d="M279 219 L267 227 L259 247 L248 330 V371 L245 508 L243 567 L242 616 L237 684 V727" strokeWidth="6.4" />
      <path d="M279 219 L282 224 V289 L294 403 L305 440" strokeWidth="5" opacity="0.85" />
      <path d="M247 331 L238 333 L193 372 L184 374" strokeWidth="6.4" />
      <path d="M171 384 L169 358 Q172 352 176 353 Q182 356 183 373 L180 382 Z" strokeWidth="5" opacity="0.9" />
      <path d="M171 384 L166 398 L153 402 L144 414 L133 419 L53 488 L50 496" strokeWidth="6.4" />
      <path d="M144 415 L149 429 L161 425 L172 414" strokeWidth="4.6" opacity="0.8" />
      <path d="M167 399 L172 414" strokeWidth="4.6" opacity="0.8" />
      <path d="M247 372 L229 378 L182 411 L172 414" strokeWidth="5" opacity="0.85" />
      <path d="M63 496 L134 443 L144 441 V550" strokeWidth="5" opacity="0.85" />
      <path d="M50 496 L33 516 L31 591 L38 598 L144 600" strokeWidth="6.4" />
      <path d="M32 570 L98 566 L146 567 L166 567 L242 566" strokeWidth="5" opacity="0.9" />
      <path d="M147 568 L145 599" strokeWidth="4.6" opacity="0.85" />
      <path d="M164 568 L163 598 L160 604" strokeWidth="4.6" opacity="0.85" />
      <path d="M146 600 L159 605 L165 614 L237 617" strokeWidth="6.4" />
      <path d="M182 528 L187 522 V515 L183 510 L177 509 L171 515 V524 L181 528" strokeWidth="4" opacity="0.8" />
      <path d="M182 529 V543" strokeWidth="4" opacity="0.8" />
      <path d="M166 540 L165 566" strokeWidth="4" opacity="0.7" />
      <path d="M144 551 L135 552 L129 557" strokeWidth="4" opacity="0.7" />
      <path d="M313.5 727 L258 725 L249 731 L245 743" strokeWidth="5.5" opacity="0.95" />
      <path d="M245 743 L232 750 L182 820 L180 832 L147 868 L104 925 L102 942 L105 960" strokeWidth="6.4" />
      <path d="M250 750 V769 L235 773 L192 827 L181 832" strokeWidth="4.6" opacity="0.8" />
      <path d="M250 769 L254 792 L256 889" strokeWidth="4" opacity="0.55" />
      <path d="M106 960 L119 957 L188 922 L249 897" strokeWidth="5" opacity="0.9" />
      <path d="M105 961 L104 975 L113 978 L250 938" strokeWidth="6.4" />
      <path d="M250 897 V937" strokeWidth="4.6" opacity="0.85" />
      <path d="M313.5 743 L304 751 L303 773 L298 790 L292 863 L293 900 L290 905 V956 L294 994 L293 1012 L299 1056 L305 1073 L313.5 1077" strokeWidth="6.4" />
      <path d="M290 905 L285 902 L268 904 L268 936 L272 950 L278 957 L273 974 L269 978 L263 977 L257 967 L255 945 L251 938" strokeWidth="4.6" opacity="0.8" />
      <path d="M257 890 L265 896 L268 904" strokeWidth="4" opacity="0.7" />
      <path d="M294 995 H313.5" strokeWidth="4.6" opacity="0.85" />
    </>
  );

  return (
    <svg
      className={className}
      viewBox="22 36 583 1054"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* left half */}
      <g>{half}</g>
      {/* right half, mirrored about x = 313.5 */}
      <g transform="translate(627 0) scale(-1 1)">{half}</g>

      {/* centre spine */}
      <path d="M313.5 477 V726" strokeWidth="4" opacity="0.55" />

      {/* left-only: faint panel line beside the fuselage */}
      <path d="M246 509 L261 509 L265 517 L264 708" strokeWidth="4" opacity="0.5" />

      {/* right-only: engine bulge and panel line */}
      <path d="M376 575 L370 582 L367 673 L373 681 L379 676 L383 619 L384 581 L378 575" strokeWidth="4.2" opacity="0.8" />
      <path d="M395 620 V729" strokeWidth="4.6" opacity="0.7" />
    </svg>
  );
}
