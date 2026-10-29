import type { CSSProperties } from 'react';
const paths = {
  history: 'M3 11a9 9 0 1 1 2.6 6.4M3 4v7h7M12 7v5l3 2',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  close: 'm6 6 12 12M6 18 18 6',
  arrow: 'M12 19V5m-6 6 6-6 6 6',
  chat: 'M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z',
  stop: 'M7 7h10v10H7Z',
  skin: 'm8 3-6 4 3 5 2-1v10h10V11l2 1 3-5-6-4a4 4 0 0 1-8 0Z',
  touch: 'M12 20S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 11-9 11Z',
};
export function Icon({ name, style }: { name: keyof typeof paths; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
