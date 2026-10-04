import type { ReactNode } from "react";

/** Small festive illustrations on a 48×48 grid, shared by hideouts, the advent calendar and the logo. */
const Svg = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <svg aria-hidden viewBox='0 0 48 48' className={className}>
    {children}
  </svg>
);

type ArtProps = { className?: string };

const ICING = "#fff4e2";
const GOLD = "hsl(42 90% 58%)";
const CRANBERRY = "hsl(352 62% 44%)";
const PINE = "hsl(148 38% 30%)";

const Gingerbread = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path
      d='M24 4a7 7 0 0 1 4.6 12.3H36a4 4 0 0 1 0 8h-6v4.2l5.8 8.6a4 4 0 0 1-6.6 4.5L24 34l-5.2 7.6a4 4 0 0 1-6.6-4.5l5.8-8.6v-4.2h-6a4 4 0 0 1 0-8h7.4A7 7 0 0 1 24 4Z'
      fill='hsl(27 60% 44%)'
    />
    <path
      d='M9.5 20.3q1.2-1.6 2.4 0t2.4 0M33.7 20.3q1.2-1.6 2.4 0t2.4 0M13.6 38.6q1.3-1.6 2.6 0M31.8 38.6q1.3-1.6 2.6 0'
      stroke={ICING}
      strokeWidth='1.3'
      fill='none'
      strokeLinecap='round'
    />
    <circle cx='21.6' cy='10' r='1.1' fill='#2b1608' />
    <circle cx='26.4' cy='10' r='1.1' fill='#2b1608' />
    <path
      d='M21.2 13.2q2.8 2 5.6 0'
      stroke={ICING}
      strokeWidth='1.2'
      fill='none'
      strokeLinecap='round'
    />
    <circle cx='24' cy='21' r='1.6' fill={CRANBERRY} />
    <circle cx='24' cy='26.2' r='1.6' fill={PINE} />
  </Svg>
);

const CandyCane = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path
      d='M29 43V15a6.5 6.5 0 0 0-13 0'
      stroke='#fffaf3'
      strokeWidth='6'
      fill='none'
      strokeLinecap='round'
    />
    <path
      d='M29 43V15a6.5 6.5 0 0 0-13 0'
      stroke={CRANBERRY}
      strokeWidth='6'
      fill='none'
      strokeDasharray='3 3.4'
    />
    <path d='M27 40l-3-2' stroke={PINE} strokeWidth='2' strokeLinecap='round' />
  </Svg>
);

const Star = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path
      d='M24 4l5.6 12.2 13.2 1.4-9.9 8.9 2.8 13.1L24 32.9l-11.7 6.7 2.8-13.1-9.9-8.9 13.2-1.4Z'
      fill={GOLD}
      stroke='hsl(38 90% 70%)'
      strokeWidth='1.5'
      strokeLinejoin='round'
    />
  </Svg>
);

const Bauble = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d='M24 3v6' stroke={GOLD} strokeWidth='1.4' />
    <rect x='20' y='8' width='8' height='5' rx='1' fill={GOLD} />
    <circle cx='24' cy='28' r='15' fill={CRANBERRY} />
    <path
      d='M9.5 27l4 3 4-3 4 3 4-3 4 3 4-3 4 3 3-2.4'
      stroke={GOLD}
      strokeWidth='1.6'
      fill='none'
    />
    <ellipse cx='18' cy='21' rx='3' ry='5' fill='white' opacity='0.3' />
  </Svg>
);

const Bell = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path
      d='M24 8c7 0 11 5.5 11 13v8l4 6H9l4-6v-8c0-7.5 4-13 11-13Z'
      fill={GOLD}
    />
    <circle cx='24' cy='38' r='3.2' fill='hsl(38 80% 40%)' />
    <path
      d='M24 9c-4-4-9-5-10-2s5 3 10 2c5 1 11 1 10-2s-6-2-10 2Z'
      fill={CRANBERRY}
    />
    <ellipse cx='19' cy='19' rx='2' ry='5' fill='white' opacity='0.35' />
  </Svg>
);

const Cookie = ({ className }: ArtProps) => (
  <Svg className={className}>
    <circle cx='24' cy='24' r='17' fill='hsl(33 62% 58%)' />
    <circle
      cx='24'
      cy='24'
      r='17'
      fill='none'
      stroke='hsl(28 55% 45%)'
      strokeWidth='2'
    />
    {[
      [17, 17],
      [29, 15],
      [31, 27],
      [20, 30],
      [25, 22],
      [14, 25],
    ].map(([cx, cy]) => (
      <ellipse
        key={`${cx}-${cy}`}
        cx={cx}
        cy={cy}
        rx='2'
        ry='1.6'
        fill='#3b2010'
      />
    ))}
  </Svg>
);

const Cocoa = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path
      d='M17 12q-2 3 0 6M24 10q-2 3 0 6M31 12q-2 3 0 6'
      stroke='white'
      strokeWidth='1.6'
      fill='none'
      opacity='0.6'
      strokeLinecap='round'
    />
    <path
      d='M34 25h3a5 5 0 0 1 0 10h-3'
      stroke={CRANBERRY}
      strokeWidth='3'
      fill='none'
    />
    <path d='M11 21h24v15a6 6 0 0 1-6 6H17a6 6 0 0 1-6-6Z' fill={CRANBERRY} />
    <ellipse cx='23' cy='21' rx='12' ry='2.6' fill='hsl(22 50% 28%)' />
    <rect x='16' y='18' width='4' height='4' rx='1' fill='#fffaf3' />
    <rect x='24' y='17.5' width='4' height='4' rx='1' fill='#fffaf3' />
    <path
      d='M14 29h18'
      stroke='white'
      strokeWidth='1.4'
      opacity='0.5'
      strokeDasharray='2 2'
    />
  </Svg>
);

const Snowman = ({ className }: ArtProps) => (
  <Svg className={className}>
    <circle cx='24' cy='35' r='11' fill='#f4f8ff' />
    <circle cx='24' cy='18' r='8' fill='#ffffff' />
    <path d='M16 9h16v3H16z' fill='#1d1b22' />
    <path d='M18.5 2.5h11v8h-11z' fill='#1d1b22' />
    <path d='M18.5 7.5h11v2h-11z' fill={CRANBERRY} />
    <circle cx='21' cy='17' r='1.1' fill='#1d1b22' />
    <circle cx='27' cy='17' r='1.1' fill='#1d1b22' />
    <path d='M24 19l7 1.5-7 1Z' fill='hsl(25 95% 55%)' />
    <path d='M15 24q9 4 18 0v3q-9 4-18 0Z' fill={CRANBERRY} />
    <path d='M28 26l3 7h-3l-1.5-6Z' fill={CRANBERRY} />
    <circle cx='24' cy='32' r='1.1' fill='#1d1b22' />
    <circle cx='24' cy='37' r='1.1' fill='#1d1b22' />
  </Svg>
);

const Present = ({ className }: ArtProps) => (
  <Svg className={className}>
    <rect x='8' y='18' width='32' height='24' rx='2' fill={CRANBERRY} />
    <rect x='6' y='14' width='36' height='7' rx='1.5' fill='hsl(352 55% 38%)' />
    <rect x='21.5' y='14' width='5' height='28' fill={GOLD} />
    <path
      d='M24 14c-3-6-11-7-11-3s7 3 11 3c4 0 11 1 11-3s-8-3-11 3Z'
      fill='none'
      stroke={GOLD}
      strokeWidth='2.4'
    />
  </Svg>
);

const Mitten = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path
      d='M16 34V16a8 8 0 0 1 16 0v4l3-2a3 3 0 0 1 3.5 4.8L32 29v5Z'
      fill={CRANBERRY}
    />
    <rect x='14' y='33' width='20' height='8' rx='2' fill='#fffaf3' />
    <path
      d='M19 22l2 2 2-2 2 2 2-2'
      stroke='#fffaf3'
      strokeWidth='1.3'
      fill='none'
    />
  </Svg>
);

const Stocking = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path
      d='M17 12h15v17l5 4a5.5 5.5 0 0 1-6.5 8.8L18 33a6 6 0 0 1-1-1.6Z'
      fill={CRANBERRY}
    />
    <rect x='15' y='6' width='19' height='8' rx='2' fill='#fffaf3' />
    <path d='M30 34l5 3' stroke={GOLD} strokeWidth='2' strokeLinecap='round' />
  </Svg>
);

const Candle = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d='M24 5q4 5 0 10q-4-5 0-10Z' fill='hsl(36 100% 60%)' />
    <path d='M24 8.5q2 3 0 5q-2-2 0-5Z' fill='hsl(52 100% 85%)' />
    <rect x='19' y='16' width='10' height='22' rx='1.5' fill='#fbf1df' />
    <path d='M12 40q6-6 12-1 6-5 12 1Z' fill={PINE} />
    <circle cx='22' cy='39' r='2' fill={CRANBERRY} />
    <circle cx='26' cy='39.5' r='2' fill={CRANBERRY} />
  </Svg>
);

const Spider = ({ className }: ArtProps) => (
  <Svg className={className}>
    <g
      stroke='hsl(270 25% 30%)'
      strokeWidth='1.8'
      fill='none'
      strokeLinecap='round'>
      <path d='M20 22l-8-5-4 4M20 25l-10-1-3 5M20 28l-8 4-2 6M21 30l-5 7' />
      <path d='M28 22l8-5 4 4M28 25l10-1 3 5M28 28l8 4 2 6M27 30l5 7' />
    </g>
    <ellipse
      cx='24'
      cy='27'
      rx='6'
      ry='7'
      fill='#1a1024'
      stroke='hsl(270 35% 45%)'
      strokeWidth='0.8'
    />
    <circle
      cx='24'
      cy='19'
      r='4.2'
      fill='#1a1024'
      stroke='hsl(270 35% 45%)'
      strokeWidth='0.8'
    />
    <circle cx='22.4' cy='19' r='1' fill='hsl(0 90% 60%)' />
    <circle cx='25.6' cy='19' r='1' fill='hsl(0 90% 60%)' />
  </Svg>
);

const Ghost = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path
      d='M10 42V22a14 14 0 0 1 28 0v20l-4.7-3.5L28.7 42 24 38.5 19.3 42l-4.6-3.5Z'
      fill='#f5f1ff'
      opacity='0.94'
    />
    <ellipse cx='19' cy='22' rx='2.4' ry='3.4' fill='#1d1328' />
    <ellipse cx='29' cy='22' rx='2.4' ry='3.4' fill='#1d1328' />
    <ellipse cx='24' cy='30' rx='2.4' ry='3' fill='#1d1328' />
  </Svg>
);

const Cauldron = ({ className }: ArtProps) => (
  <Svg className={className}>
    <circle cx='18' cy='9' r='2.4' fill='hsl(95 80% 60%)' opacity='0.8' />
    <circle cx='27' cy='5' r='1.6' fill='hsl(95 80% 60%)' opacity='0.6' />
    <path d='M8 19q16 6 32 0q-6-6-16-6t-16 6Z' fill='hsl(95 80% 52%)' />
    <path d='M7 19h34l-2 3a16 15 0 1 1-30 0Z' fill='#17121c' />
    <ellipse
      cx='24'
      cy='19'
      rx='17'
      ry='3'
      fill='none'
      stroke='#2a2233'
      strokeWidth='2'
    />
    <path
      d='M14 42l-2 4M34 42l2 4'
      stroke='#17121c'
      strokeWidth='3'
      strokeLinecap='round'
    />
  </Svg>
);

const BlackCat = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path
      d='M14 46c0-9 2-15 5-19-3-2-4-6-3-11l-1-8 5 4h8l5-4-1 8c1 5 0 9-3 11 3 4 5 10 5 19Z'
      fill='#160f1c'
      stroke='hsl(270 30% 42%)'
      strokeWidth='0.8'
    />
    <path
      d='M34 44q8-2 7-12'
      stroke='#120d16'
      strokeWidth='3'
      fill='none'
      strokeLinecap='round'
    />
    <ellipse cx='20.5' cy='17' rx='1.6' ry='2.2' fill='hsl(55 100% 60%)' />
    <ellipse cx='27.5' cy='17' rx='1.6' ry='2.2' fill='hsl(55 100% 60%)' />
    <path d='M23 21h2l-1 1Z' fill='hsl(340 70% 70%)' />
  </Svg>
);

const Tombstone = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d='M12 44V18a12 12 0 0 1 24 0v26Z' fill='hsl(260 8% 46%)' />
    <path
      d='M12 44V18a12 12 0 0 1 12-12'
      stroke='hsl(260 8% 60%)'
      strokeWidth='1.4'
      fill='none'
    />
    <text
      x='24'
      y='26'
      textAnchor='middle'
      fontSize='8'
      fontWeight='700'
      fill='hsl(260 10% 24%)'>
      RIP
    </text>
    <path
      d='M6 46q4-5 6-1 3-5 6 0 3-5 6 0 3-5 6 0 3-5 6 0 2-4 6 1Z'
      fill='hsl(110 35% 22%)'
    />
  </Svg>
);

const Clock = ({ className }: ArtProps) => (
  <Svg className={className}>
    <circle
      cx='24'
      cy='26'
      r='17'
      fill='#fbf3e0'
      stroke={GOLD}
      strokeWidth='3'
    />
    {Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return (
        <circle
          key={i}
          cx={24 + Math.sin(a) * 13}
          cy={26 - Math.cos(a) * 13}
          r={i % 3 === 0 ? 1.3 : 0.7}
          fill='#2a2440'
        />
      );
    })}
    <path
      d='M24 26V15M24 26l-2.5-9'
      stroke='#2a2440'
      strokeWidth='1.8'
      strokeLinecap='round'
    />
    <circle cx='24' cy='26' r='1.6' fill={GOLD} />
  </Svg>
);

const Champagne = ({ className }: ArtProps) => (
  <Svg className={className}>
    <g transform='rotate(-14 16 30)'>
      <path
        d='M11 8h10l-1 13a4 4 0 0 1-8 0Z'
        fill='hsl(45 90% 70%)'
        opacity='0.9'
      />
      <path
        d='M16 25v13M11 39h10'
        stroke='#e9e4f5'
        strokeWidth='1.6'
        strokeLinecap='round'
      />
    </g>
    <g transform='rotate(14 32 30)'>
      <path
        d='M27 8h10l-1 13a4 4 0 0 1-8 0Z'
        fill='hsl(45 90% 70%)'
        opacity='0.9'
      />
      <path
        d='M32 25v13M27 39h10'
        stroke='#e9e4f5'
        strokeWidth='1.6'
        strokeLinecap='round'
      />
    </g>
    <circle cx='24' cy='5' r='1.3' fill='white' />
    <circle cx='20' cy='2.5' r='0.9' fill='white' />
    <circle cx='28' cy='3' r='0.9' fill='white' />
  </Svg>
);

const Popper = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d='M8 42l8-22 10 10Z' fill={GOLD} />
    <path d='M12 31l4 4M14 25l7 7' stroke='hsl(320 70% 60%)' strokeWidth='2' />
    {(
      [
        [28, 14, "hsl(320 80% 66%)"],
        [34, 20, "hsl(190 85% 62%)"],
        [24, 8, "hsl(45 95% 65%)"],
        [38, 11, "hsl(280 70% 70%)"],
        [31, 27, "hsl(45 95% 65%)"],
        [40, 22, "hsl(320 80% 66%)"],
      ] as const
    ).map(([x, y, fill], i) => (
      <rect
        key={`${x}-${y}`}
        x={x}
        y={y}
        width='3'
        height='1.6'
        fill={fill}
        transform={`rotate(${i * 37} ${x} ${y})`}
      />
    ))}
  </Svg>
);

const Balloon = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d='M30 33q-2 6 1 15' stroke='#d8d0ea' strokeWidth='1' fill='none' />
    <path d='M19 30q2 8-2 18' stroke='#d8d0ea' strokeWidth='1' fill='none' />
    <ellipse cx='30' cy='19' rx='9' ry='11' fill='hsl(320 70% 60%)' />
    <ellipse cx='18' cy='18' rx='10' ry='12' fill={GOLD} />
    <ellipse cx='14.5' cy='13' rx='2.2' ry='4' fill='white' opacity='0.4' />
  </Svg>
);

const Sparkler = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path
      d='M30 18L10 44'
      stroke='#8e8aa0'
      strokeWidth='2'
      strokeLinecap='round'
    />
    <g stroke='hsl(45 100% 70%)' strokeWidth='1.4' strokeLinecap='round'>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return (
          <path
            key={i}
            d={`M${32 + Math.cos(a) * 3} ${15 + Math.sin(a) * 3}L${32 + Math.cos(a) * (8 + (i % 2) * 4)} ${15 + Math.sin(a) * (8 + (i % 2) * 4)}`}
          />
        );
      })}
    </g>
    <circle cx='32' cy='15' r='2.4' fill='white' />
  </Svg>
);

const Firecrackers = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d='M24 0v46' stroke={GOLD} strokeWidth='1.2' />
    {[8, 20, 32].map((y, i) => (
      <g key={y} transform={`rotate(${i % 2 ? 18 : -18} 24 ${y + 5})`}>
        <rect
          x='18'
          y={y}
          width='12'
          height='10'
          rx='2'
          fill='hsl(356 85% 48%)'
        />
        <rect x='18' y={y} width='12' height='2' fill={GOLD} />
        <rect x='18' y={y + 8} width='12' height='2' fill={GOLD} />
      </g>
    ))}
    <path d='M21 44l3 4 3-4' stroke={GOLD} strokeWidth='1.6' fill='none' />
  </Svg>
);

const Koi = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d='M8 24q10-12 24-4l8-6-2 10 2 10-8-6q-14 8-24-4Z' fill='#fffaf3' />
    <path
      d='M14 18q6-3 10 0-2 6-10 6Zm10 7q6 0 8-3-1 7-8 6Z'
      fill='hsl(20 95% 55%)'
    />
    <circle cx='12' cy='22.5' r='1.2' fill='#1d1b22' />
    <path d='M22 30l3 5 2-5' fill='hsl(20 95% 55%)' />
  </Svg>
);

const LuckyCat = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d='M12 46V26a12 12 0 0 1 24 0v20Z' fill='#fffaf3' />
    <path d='M13 20l1-9 6 5M35 20l-1-9-6 5' fill='#fffaf3' />
    <path d='M15 13l1 4 3-1M33 13l-1 4-3-1' fill='hsl(350 70% 75%)' />
    <path
      d='M34 32V16a3.5 3.5 0 0 1 7 0v8a5 5 0 0 1-7 8Z'
      fill='#fffaf3'
      stroke='#e7ddcf'
    />
    <path
      d='M19 22q2-2 4 0M25 22q2-2 4 0'
      stroke='#1d1b22'
      strokeWidth='1.3'
      fill='none'
    />
    <path
      d='M14 30q10 4 20 0'
      stroke='hsl(356 85% 50%)'
      strokeWidth='3'
      fill='none'
    />
    <circle cx='24' cy='33.5' r='2.6' fill={GOLD} />
    <ellipse cx='24' cy='42' rx='6' ry='4' fill={GOLD} />
  </Svg>
);

const Mandarins = ({ className }: ArtProps) => (
  <Svg className={className}>
    <circle cx='17' cy='30' r='11' fill='hsl(30 95% 55%)' />
    <circle cx='32' cy='32' r='10' fill='hsl(28 95% 52%)' />
    <path d='M17 19q4-6 10-4-4 6-10 4Z' fill='hsl(140 45% 38%)' />
    <path d='M32 22q-3-5-8-4 3 5 8 4Z' fill='hsl(140 45% 32%)' />
    <ellipse cx='13' cy='26' rx='2.4' ry='3.4' fill='white' opacity='0.25' />
  </Svg>
);

const Ingot = ({ className }: ArtProps) => (
  <Svg className={className}>
    <ellipse cx='24' cy='22' rx='9' ry='6' fill='hsl(45 100% 66%)' />
    <path d='M4 22q6 0 9 4h22q3-4 9-4-2 14-20 14T4 22Z' fill={GOLD} />
    <path d='M13 26h22' stroke='hsl(38 85% 45%)' strokeWidth='1.4' />
    <ellipse cx='20' cy='20' rx='2.4' ry='1.6' fill='white' opacity='0.5' />
  </Svg>
);

const Envelope = ({ className }: ArtProps) => (
  <Svg className={className}>
    <rect x='10' y='4' width='28' height='40' rx='3' fill='hsl(356 85% 46%)' />
    <path
      d='M10 14q14 9 28 0'
      fill='none'
      stroke='hsl(352 70% 32%)'
      strokeWidth='1.4'
    />
    <circle cx='24' cy='27' r='8' fill={GOLD} />
    <text
      x='24'
      y='31'
      textAnchor='middle'
      fontSize='11'
      fontWeight='700'
      fill='hsl(356 80% 36%)'>
      福
    </text>
  </Svg>
);

const Bunny = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d='M16 22C13 12 13 3 17 2s5 10 4 20Z' fill='#f6f1ee' />
    <path d='M32 22c3-10 3-19-1-20s-5 10-4 20Z' fill='#f6f1ee' />
    <path
      d='M17 19c-1.5-7-1-13 .8-13.5s2 7 1.8 13.5Z'
      fill='hsl(340 70% 82%)'
    />
    <path
      d='M31 19c1.5-7 1-13-.8-13.5s-2 7-1.8 13.5Z'
      fill='hsl(340 70% 82%)'
    />
    <ellipse cx='24' cy='34' rx='13' ry='14' fill='#f6f1ee' />
    <circle cx='19.5' cy='31' r='1.6' fill='#2a2238' />
    <circle cx='28.5' cy='31' r='1.6' fill='#2a2238' />
    <path d='M22.5 35h3l-1.5 1.6Z' fill='hsl(340 70% 70%)' />
    <circle cx='16' cy='36' r='2.2' fill='hsl(340 80% 85%)' opacity='0.7' />
    <circle cx='32' cy='36' r='2.2' fill='hsl(340 80% 85%)' opacity='0.7' />
  </Svg>
);

const Chick = ({ className }: ArtProps) => (
  <Svg className={className}>
    <circle cx='24' cy='24' r='13' fill='hsl(50 100% 66%)' />
    <path d='M15 26q-5 1-4 6 4 0 6-3Z' fill='hsl(46 100% 58%)' />
    <path
      d='M10 32l5 3 4-3 4 3 4-3 4 3 4-3 5 3v8a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6Z'
      fill='#fbf6ec'
    />
    <circle cx='20' cy='21' r='1.4' fill='#2a2238' />
    <circle cx='28' cy='21' r='1.4' fill='#2a2238' />
    <path d='M22 25h4l-2 3Z' fill='hsl(25 95% 58%)' />
    <path
      d='M23 11q1-4 3-2-1 1-1 3'
      stroke='hsl(46 100% 58%)'
      strokeWidth='1.6'
      fill='none'
    />
  </Svg>
);

const Carrot = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path
      d='M22 14q-6-8-2-12 3 5 4 12M26 14q2-9 8-10-1 7-6 11'
      fill='hsl(130 45% 45%)'
    />
    <path d='M18 14h12l-5 32h-2Z' fill='hsl(25 95% 56%)' />
    <path
      d='M20 20h4M21 27h4M22 34h3'
      stroke='hsl(20 80% 42%)'
      strokeWidth='1.2'
      strokeLinecap='round'
    />
  </Svg>
);

const Tulip = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d='M24 24v22' stroke='hsl(130 40% 40%)' strokeWidth='2.4' />
    <path d='M24 40q-10-2-12-12 9 2 12 10Z' fill='hsl(130 40% 42%)' />
    <path d='M24 36q9-2 11-11-8 2-11 9Z' fill='hsl(130 40% 46%)' />
    <path
      d='M14 8l5 5 5-8 5 8 5-5v10a10 10 0 0 1-20 0Z'
      fill='hsl(340 75% 72%)'
    />
    <path d='M24 5l5 8v12a10 10 0 0 1-5 2Z' fill='hsl(340 70% 64%)' />
  </Svg>
);

const EggOrnament = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d='M24 2v8' stroke='hsl(155 45% 60%)' strokeWidth='1.2' />
    <path
      d='M21 10q3-4 6 0'
      stroke='hsl(155 45% 60%)'
      strokeWidth='1.6'
      fill='none'
    />
    <path
      d='M24 10c7 0 12 12 12 20 0 9-5 15-12 15s-12-6-12-15c0-8 5-20 12-20Z'
      fill='hsl(268 75% 80%)'
    />
    <path
      d='M12.5 26h23M12.2 32h23.6'
      stroke='hsl(48 95% 74%)'
      strokeWidth='3'
    />
    <path
      d='M13 38.5q11 4 22 0'
      stroke='hsl(155 55% 70%)'
      strokeWidth='2'
      fill='none'
    />
    <ellipse cx='19' cy='19' rx='2' ry='4' fill='white' opacity='0.35' />
  </Svg>
);

export const ART = {
  gingerbread: Gingerbread,
  candyCane: CandyCane,
  star: Star,
  bauble: Bauble,
  bell: Bell,
  cookie: Cookie,
  cocoa: Cocoa,
  snowman: Snowman,
  present: Present,
  mitten: Mitten,
  stocking: Stocking,
  candle: Candle,
  spider: Spider,
  ghost: Ghost,
  cauldron: Cauldron,
  blackCat: BlackCat,
  tombstone: Tombstone,
  clock: Clock,
  champagne: Champagne,
  popper: Popper,
  balloon: Balloon,
  sparkler: Sparkler,
  firecrackers: Firecrackers,
  koi: Koi,
  luckyCat: LuckyCat,
  mandarins: Mandarins,
  ingot: Ingot,
  envelope: Envelope,
  bunny: Bunny,
  chick: Chick,
  carrot: Carrot,
  tulip: Tulip,
  eggOrnament: EggOrnament,
};

export type ArtId = keyof typeof ART;

/** Hats and ears that sit on the app logo while a seasonal theme is active. */
export const SantaHat = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path
      d='M8 34C12 16 22 6 34 8c6 1 8 8 6 14l-6-6c-6 2-10 10-12 18Z'
      fill={CRANBERRY}
    />
    <rect
      x='4'
      y='32'
      width='26'
      height='8'
      rx='4'
      fill='#fffaf3'
      transform='rotate(-8 17 36)'
    />
    <circle cx='40' cy='24' r='5' fill='#fffaf3' />
  </Svg>
);

export const WitchHat = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path
      d='M14 36L28 4l2 10 8 2-6 4 4 16Z'
      fill='#1b1222'
      stroke='hsl(270 30% 45%)'
      strokeWidth='0.8'
    />
    <ellipse
      cx='25'
      cy='37'
      rx='20'
      ry='5'
      fill='#1b1222'
      stroke='hsl(270 30% 45%)'
      strokeWidth='0.8'
    />
    <path d='M16 32q10 3 18 0v3q-9 3-18 0Z' fill='hsl(27 100% 55%)' />
  </Svg>
);

export const PartyHat = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d='M12 42L26 6l14 36Z' fill={GOLD} />
    <path
      d='M16 32l20 0M20 22l12 0'
      stroke='hsl(320 70% 60%)'
      strokeWidth='3'
    />
    <circle cx='26' cy='6' r='4' fill='hsl(190 85% 62%)' />
  </Svg>
);

export const BunnyEars = ({ className }: ArtProps) => (
  <Svg className={className}>
    <path d='M14 44C9 30 9 6 15 5s8 24 6 39Z' fill='#f6f1ee' />
    <path d='M34 44c5-14 5-38-1-39s-8 24-6 39Z' fill='#f6f1ee' />
    <path d='M15 38c-2-11-2-27 .5-28s3 17 2.5 28Z' fill='hsl(340 70% 82%)' />
    <path d='M33 38c2-11 2-27-.5-28s-3 17-2.5 28Z' fill='hsl(340 70% 82%)' />
  </Svg>
);
